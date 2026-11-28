// Proefrit (F-37) slice 2: headless playtest runner.
//
//   npm run playtest -- driver=forens min=20 seeds=5 tod=day
//                       [scenario=closure] [seed=N] [until=T] [dt=1/60] [rain=1]
//                       [jobs=N] [out=<dir>] [cfg.<key>=<value>]
//                       [<profile>.<param>=<value>]
//
// One child process per seed: traffic ids come from a module global, so several
// seeds in one process would not be the same world. Each child writes
// seed-N.json (the journal) and seed-N.trace.json; the parent collects them and
// renders report.md through the unchanged buildReport().
//
// A note on honesty: the runner is not the bot. It may read the traffic for the
// trace's min gap and the checks (that is a measurement, not a cue); the bot
// only ever sees perception.js.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { CONFIG } from '../src/config.js';
import { mulberry32 } from '../src/util.js';
import { createSim, advanceDrive, playerLimit } from '../src/session.js';
import { journalHash } from '../src/journal.js';
import { Perception } from '../src/perception.js';
import { BotDriver, PROFILES } from '../src/botDriver.js';
import { detectMoments } from '../src/moments.js';
import { buildReport } from './report.js';

const DT_DEFAULT = 1 / 60;

// ---------------------------------------------------------------- args
function parseScalar(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (s.includes('/') && /^-?\d+(\.\d+)?\/\d+(\.\d+)?$/.test(s)) {
    const [a, b] = s.split('/');
    return Number(a) / Number(b);
  }
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
  return s;
}

function parseArgs(argv) {
  const o = { cfg: {}, overrides: {} };
  for (const a of argv) {
    if (a === '--child') {
      o.child = true;
      continue;
    }
    // bare flags: `frames` shoots the stills a report points at (slice 3)
    if (a === 'frames' || a === 'quiet') {
      o[a] = true;
      continue;
    }
    const i = a.indexOf('=');
    if (i < 0) continue;
    const k = a.slice(0, i);
    const v = a.slice(i + 1);
    if (k === 'cfg' && v.startsWith('{')) {
      // a whole config diff in one argument: cfg={"moments":{...}}
      try {
        Object.assign(o.cfg, JSON.parse(v));
      } catch {
        console.error(`ignoring a config that is not JSON: ${v}`);
      }
    } else if (k === 'rain') {
      // F-24: a wet drive; it travels as config, so the journal, the repro line
      // and the replay URL all carry it
      if (parseScalar(v)) o.cfg.rain = true;
    } else if (k.startsWith('cfg.')) {
      o.cfg[k.slice(4)] = parseScalar(v);
    } else if (k.includes('.') && !['dt', 'jobs', 'out'].includes(k)) {
      // <profile>.<param>=<value>
      const [profile, param] = k.split('.');
      (o.overrides[profile] ||= {})[param] = parseScalar(v);
    } else {
      o[k] = parseScalar(v);
    }
  }
  return o;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- determinism hash
// The digest lives in src/journal.js, so the browser replay can report the same
// number for the drive it has just re-simulated.
export { journalHash };

// ---------------------------------------------------------------- analysis
const median = (arr) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const mode = (arr) => {
  const c = new Map();
  for (const x of arr) c.set(x, (c.get(x) || 0) + 1);
  let best = null, n = -1;
  for (const [x, k] of c) {
    if (k > n) {
      best = x;
      n = k;
    }
  }
  return best;
};

function hasNaN(j) {
  for (const col of ['t', 's', 'lat', 'v', 'a', 'thr', 'brk', 'steer', 'ind', 'ccSet', 'ccOn', 'limit']) {
    for (const x of j[col]) if (typeof x === 'number' && Number.isNaN(x)) return true;
  }
  for (const row of j.veh) for (const r of row) for (const x of r) if (typeof x === 'number' && Number.isNaN(x)) return true;
  return false;
}

/** What the journal alone says about a drive. */
export function analyse(j, extra = {}) {
  const ev = j.events || [];
  const count = (t) => ev.filter((e) => e.type === t).length;
  const starts = ev.filter((e) => e.type === 'lane-change-start');
  const sigs = ev.filter((e) => e.type === 'signal-start');
  const n = j.t.length || 1;

  // A completed overtake: a left change, then a right change before another left.
  let overtakes = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i].dir !== -1) continue;
    for (let k = i + 1; k < starts.length; k++) {
      if (starts[k].dir === -1) break;
      if (starts[k].dir === +1) {
        overtakes++;
        break;
      }
    }
  }

  // Signal → lane-change start: the most recent matching signal before it.
  const delays = [];
  for (const s of starts) {
    let best = null;
    for (const g of sigs) {
      if (g.t > s.t) break;
      if (g.dir === s.dir) best = g;
    }
    if (best) delays.push({ t: s.t, dir: s.dir, d: s.t - best.t });
  }

  const lanes = j.header?.lanes ?? CONFIG.lanes;
  const laneShare = Array.from({ length: lanes }, (_, l) => j.lane.filter((x) => x === l).length / n);
  const ccSets = j.ccSet.filter((x) => x > 0);
  const ccEvents = ev.filter((e) => e.type === 'cc');
  const ccBad = ccEvents.filter((e) => !('on' in e) && !('adjust' in e) && !('resume' in e)).length;

  return {
    nan: hasNaN(j),
    limit: j.header?.limitKmh ?? null,
    resume: ccEvents.filter((e) => e.resume).length,
    ccEvents: ccEvents.length,
    minutes: (j.t[j.t.length - 1] || 0) / 60,
    contacts: count('crash'),
    scrapes: count('scrape'),
    redCross: count('red-cross'),
    overtakes,
    laneStarts: starts.length,
    unsignalled: count('lane-change'),
    delays,
    signalBad: delays.filter((d) => d.d < 2.5 || d.d > 4).length,
    laneShare,
    rightShare: laneShare[0] ?? 0,
    leftShare: laneShare[lanes - 1] ?? 0,
    ccShare: j.ccOn.reduce((a, x) => a + x, 0) / n,
    ccSetModal: mode(ccSets),
    ccBad,
    p50: median(j.v),
    ...extra,
  };
}

// ---------------------------------------------------------------- pass/fail
/** The phase's acceptance criteria, from the journal alone. */
export function verdict(driver, c) {
  const bad = [];
  const need = (name, ok) => {
    if (!ok) bad.push(name);
  };
  need('NaN', !c.nan);
  need('contacts 0', c.contacts === 0);
  need('scrapes 0', c.scrapes === 0);
  if (driver === 'slak') {
    const home = c.laneShare[1] ?? 0;
    need('home lane ≥ 70%', home >= 0.7);
    need('p50 = limit − 10 ± 2', c.p50 != null && Math.abs(c.p50 - (c.limit - 10)) <= 2);
  } else if (driver === 'dwars') {
    // Awkward on purpose: the bad driving is the experiment, so contacts and
    // scrapes are printed in the table, not required to be zero. What must hold
    // is that the sim stayed sane and the keyboard stayed a keyboard.
    need('no red cross', c.redCross === 0);
    need('cc events only toggle/resume/adjust', c.ccBad === 0);
  } else {
    need('ccSet = limit + 4', c.ccSetModal === c.limit + 4);
    need('≥ 1 R after braking', c.resume >= 1);
    need('cruise share ≥ 70%', c.ccShare >= 0.7);
    need('cc events only toggle/resume/adjust', c.ccBad === 0);
    need('overtakes ≥ 1 per 10 min', c.overtakes >= Math.floor(c.minutes / 10));
    need('signal 2.5–4 s before every change', c.signalBad === 0);
    need('no unsignalled change', c.unsignalled === 0);
    need('right-lane share ≥ 50%', c.rightShare >= 0.5);
    need('leftmost share ≤ 30%', c.leftShare <= 0.3);
    need('p50 = limit + 4 ± 2', c.p50 != null && Math.abs(c.p50 - (c.limit + 4)) <= 2);
    need('min gap > 0.5 m', !(c.minGap <= 0.5));
    need('no red cross', c.redCross === 0);
  }
  return { ok: bad.length === 0, bad };
}

// ---------------------------------------------------------------- frames (slice 3)
/**
 * The moments a report is worth looking at: the three worst and the three best
 * over the whole run, taken in turn from each drive (the worst of drive 1, then
 * of drive 2, ...), so five seeds do not fill the page with the first minute.
 * Within a drive: severity first, then earliest.
 */
export function pickMoments(drives, { worst = 3, best = 3 } = {}) {
  const bySev = (a, b) => b.m.severity - a.m.severity || a.m.t - b.m.t;
  const byDrive = drives.map(({ j }, i) => {
    const meta = {
      drive: i,
      seed: j.header?.seed,
      profile: j.header?.profile,
      tod: j.header?.timeOfDay || 'day',
      scenario: j.header?.scenario || null,
      cfg: j.header?.config || {},
    };
    const ms = detectMoments(j).map((m) => ({ ...meta, m }));
    return { bad: ms.filter((x) => !x.m.good).sort(bySev), good: ms.filter((x) => x.m.good).sort(bySev) };
  });
  const take = (key, n) => {
    const out = [];
    for (let round = 0; out.length < n; round++) {
      const before = out.length;
      for (const d of byDrive) {
        if (!d[key][round]) continue;
        out.push(d[key][round]);
        if (out.length === n) break;
      }
      if (out.length === before) break; // no drive has a moment this far down
    }
    return out;
  };
  return [...take('bad', worst), ...take('good', best)];
}

/** The one-line command that puts the runner back at this moment (and shoots it). */
export function reproCmd(p, { frames = false } = {}) {
  const parts = ['npm run playtest --', `driver=${p.profile || 'forens'}`, `seed=${p.seed}`];
  if (p.tod && p.tod !== 'day') parts.push(`tod=${p.tod}`);
  if (p.scenario) parts.push(`scenario=${p.scenario}`);
  const scalar = [];
  const nested = {};
  for (const [k, v] of Object.entries(p.cfg || {})) {
    if (v !== null && typeof v === 'object') nested[k] = v;
    else scalar.push(`cfg.${k}=${v}`);
  }
  parts.push(...scalar);
  if (Object.keys(nested).length) parts.push(`cfg='${JSON.stringify(nested)}'`);
  parts.push(`until=${Math.round(p.m.t * 10) / 10}`);
  if (frames) parts.push('frames');
  return parts.join(' ');
}

/**
 * The body hash a moment's replay must reproduce: a fresh headless run stopped
 * at the same moment. If a frame's world does not hash to this, the frame is of
 * a different drive and the report says so.
 */
function bodyHashUntil(job) {
  return new Promise((res) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child', JSON.stringify({ ...job, quiet: true })], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', () => {
      const line = out.split('\n').find((l) => l.startsWith('CHECKS '));
      try {
        res(line ? JSON.parse(line.slice(7)).bodyHash : null);
      } catch {
        res(null);
      }
    });
  });
}

/** Shoot the two frames per moment, and keep what the report needs. */
async function shootPicks(picks, { outDir, base }) {
  const { shootAll } = await import('./frame.js');
  const used = new Set();
  const shots = picks.map((p) => {
    let name = `d${p.drive + 1}-t${Math.round(p.m.t * 10) / 10}-${p.m.kind}`;
    for (let k = 2; used.has(name); k++) name = `d${p.drive + 1}-t${Math.round(p.m.t * 10) / 10}-${p.m.kind}-${k}`;
    used.add(name);
    return {
      name,
      shot: {
        seed: p.seed,
        until: p.m.t,
        driver: p.profile || 'forens',
        tod: p.tod || 'day',
        scenario: p.scenario || null,
        cfg: p.cfg || null,
        expect: p.expect ?? null,
      },
    };
  });
  const out = await shootAll({ shots, outDir, onLog: (l) => console.log(l) });
  return picks.map((p, i) => ({
    ...p,
    name: shots[i].name,
    bonnet: `frames/${shots[i].name}-bonnet.png`,
    map: `frames/${shots[i].name}-map.png`,
    shotOk: out[i].sameWorld,
    bodyHash: out[i].replay.bodyHash,
    expect: shots[i].shot.expect,
    repro: reproCmd(p),
    reproFrames: reproCmd(p, { frames: true }),
    run: base,
  }));
}

// ---------------------------------------------------------------- the null bot (P0 skeleton)
/** Holds the lane and finds cruise control at 100 km/h. No lane changes. */
class NullBot {
  constructor() {
    this.state = 'CRUISE';
    this.trace = [];
    this.waiting = false;
  }
  update(_dt, p) {
    const keys = { throttle: false, brake: false, left: false, right: false, flash: false };
    const presses = [];
    const cc = p.self.cc;
    if (!cc.on) {
      if (p.self.kmh < 100) keys.throttle = true;
      else if (!this.waiting) {
        presses.push({ code: 'KeyC', shift: false });
        this.waiting = true;
      }
    } else {
      this.waiting = false;
    }
    return { keys, presses };
  }
}

function makeBot(driver, seed, overrides) {
  if (!driver || driver === 'null') return new NullBot();
  if (!PROFILES[driver]) throw new Error(`unknown driver "${driver}" (have: ${Object.keys(PROFILES).join(', ')})`);
  return new BotDriver(driver, { seed, overrides });
}

// ---------------------------------------------------------------- one seed
export function runSeed(o) {
  const { seed, driver, minutes, tod, scenario, dt } = o;
  for (const [k, v] of Object.entries(o.cfg || {})) CONFIG[k] = v;
  const sim = createSim({ seed, timeOfDay: tod, scenario: scenario || null, rng: mulberry32(seed + 3) });
  const bot = makeBot(driver, seed, (o.overrides || {})[driver] || {});
  const perception = new Perception();
  const t0 = Date.now();
  sim.journal.start({
    kind: 'bot',
    driver: 'bot',
    profile: driver,
    seed,
    scenario: scenario || null,
    timeOfDay: tod,
    limitKmh: playerLimit(sim),
    playerLen: sim.player.len,
    player: sim.player,
    recordFps: false,
    commit: git('rev-parse --short HEAD'),
    commitDirty: git('status --porcelain') !== '',
    node: process.version,
    bot: bot.profile ? { params: { ...bot.profile } } : null,
    runner: { dt, playerSub: 1 / 120, trafficSub: 1 / 30, minutes, until: o.until ?? null },
  });

  const maxT = o.until != null ? o.until : minutes * 60;
  let minGap = Infinity;
  let minTtc = Infinity;
  // Diagnostics only (the runner may look; the bot may not).
  const onStep = (s) => {
    const p = s.player;
    for (const v of s.traffic.vehicles) {
      if (Math.abs(v.latLocal - p.lat) > (v.width + p.width) / 2) continue; // another lane
      const dl = v.u - p.s;
      const gap = Math.abs(dl) - (v.len + p.len) / 2;
      if (gap < minGap) minGap = gap;
      const close = p.vAlong - v.v;
      if (dl > 0 && close > 0.1) minTtc = Math.min(minTtc, gap / close);
    }
  };
  const frames = Math.round(maxT / dt);
  const driven = advanceDrive(sim, { bot, perception, until: maxT, dt, onStep });
  const secs = (Date.now() - t0) / 1000;
  const data = sim.journal.finish({
    reason: o.until != null ? 'until' : 'end',
    // count it after the fact: drainEvents() empties player.events every step, so
    // reading it at the end only ever found a crash on the last step
    contacts: sim.journal.data.events.filter((e) => e.type === 'crash').length,
  });
  const checks = analyse(data, { seed, minGap, minTtc, frames, secs });
  checks.hash = journalHash(data);
  checks.bodyHash = journalHash(data, { bodyOnly: true });
  return { data, checks, bot, sim, percept: driven.percept };
}

// ---------------------------------------------------------------- child
function childMain(o) {
  const res = runSeed(o);
  const dir = resolve(o.dir);
  mkdirSync(dir, { recursive: true });
  if (o.until == null) {
    writeFileSync(join(dir, `seed-${o.seed}.json`), JSON.stringify(res.data));
    writeFileSync(
      join(dir, `seed-${o.seed}.trace.json`),
      JSON.stringify(
        {
          seed: o.seed,
          driver: o.driver,
          dt: o.dt,
          minutes: o.minutes,
          minGap: res.checks.minGap === Infinity ? null : res.checks.minGap,
          minTtc: res.checks.minTtc === Infinity ? null : res.checks.minTtc,
          trace: res.bot.trace,
        },
        null,
        0,
      ),
    );
  } else if (!o.quiet) {
    const p = res.percept || null;
    const lanes = p
      ? p.lanes.map((lv, i) => ({
          lane: i,
          ahead: lv.ahead ? { id: lv.ahead.id, type: lv.ahead.type, gap: Math.round(lv.ahead.gap), kmh: Math.round(lv.ahead.kmh) } : null,
          behind: lv.behind ? { id: lv.behind.id, type: lv.behind.type, gap: Math.round(lv.behind.gap), kmh: Math.round(lv.behind.kmh) } : null,
        }))
      : null;
    console.log(
      'until state: ' +
        JSON.stringify(
          {
            t: res.data.end.t,
            s: res.sim.player.s,
            kmh: res.sim.player.vAlong / (1 / 3.6),
            lane: res.sim.player.lane,
            state: res.bot.state,
            lanes,
            obstacles: p ? p.obstacles : null,
            signs: p ? { limitKmh: p.signs.limitKmh, cur: p.signs.cur, next: p.signs.next } : null,
            checks: res.checks,
          },
          null,
          1,
        ),
    );
    console.log('trace tail:');
    for (const line of res.bot.trace.slice(-20)) console.log('  ' + JSON.stringify(line));
  }
  console.log('CHECKS ' + JSON.stringify({ ...res.checks, seed: o.seed }));
  return res;
}

// ---------------------------------------------------------------- parent
async function parentMain(o) {
  const driver = o.driver === undefined ? 'forens' : o.driver;
  const minutes = o.min ?? 20;
  const tod = o.tod || 'day';
  const scenario = o.scenario || null;
  const dt = o.dt || DT_DEFAULT;
  const seeds = o.seed != null ? [o.seed] : Array.from({ length: o.seeds ?? 5 }, (_, i) => i + 1);
  if (o.until != null && seeds.length !== 1) {
    console.error('until= needs a single seed (add seed=N)');
    process.exit(1);
  }
  const dir = resolve(o.out || join('playtests', 'bot', `${stamp()}-${driver}-${tod}${o.cfg.rain ? '-rain' : ''}${scenario ? `-${scenario}` : ''}`));
  const base = { driver, minutes, tod, scenario, dt, cfg: o.cfg, overrides: o.overrides, profileParams: o.overrides[driver] || null, dir, until: o.until ?? null };

  // `until=` is a single interactive probe: run it here, no files, no report.
  // With `frames` it also shoots both stills of that one moment, which is the
  // one-line reproduction a report points at.
  if (o.until != null) {
    const res = childMain({ ...base, seed: seeds[0] });
    if (o.frames && res && res.data) {
      const p = {
        drive: 0,
        m: { t: res.data.end.t, kind: 'until', severity: 1, good: false, text: 'the moment you asked for' },
        seed: seeds[0],
        profile: driver,
        tod,
        scenario,
        cfg: res.data.header.config,
        expect: res.checks.bodyHash,
      };
      const frames = await shootPicks([p], { outDir: join(dir, 'frames'), base: { driver, minutes, tod, scenario } });
      for (const f of frames) console.log(`frame: ${join(dir, f.bonnet)} ${f.shotOk ? '(same world)' : '(NOT the same world)'}\n       map: ${join(dir, f.map)}`);
    }
    return;
  }

  mkdirSync(dir, { recursive: true });
  const jobs = Math.max(1, Math.min(o.jobs ?? Math.max(1, os.cpus().length - 1), seeds.length));
  const results = new Array(seeds.length);
  let next = 0;
  const startedAt = Date.now();

  await Promise.all(
    Array.from({ length: jobs }, async () => {
      while (next < seeds.length) {
        const i = next++;
        const seed = seeds[i];
        results[i] = await new Promise((res) => {
          const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child', JSON.stringify({ ...base, seed })], {
            stdio: ['ignore', 'pipe', 'inherit'],
          });
          let out = '';
          child.stdout.on('data', (d) => (out += d));
          child.on('close', (code) => {
            const line = out.split('\n').find((l) => l.startsWith('CHECKS '));
            if (!line) return res({ seed, failed: `child exited ${code}\n${out}` });
            let checks = null;
            try {
              checks = JSON.parse(line.slice(7));
            } catch (e) {
              return res({ seed, failed: `bad checks line: ${e.message}` });
            }
            res({ seed, checks });
          });
        });
      }
    }),
  );

  const totalSecs = (Date.now() - startedAt) / 1000;
  const failed = results.filter((r) => r.failed);
  const checks = results.filter((r) => r.checks).map((r) => r.checks);

  // ---- check table
  const head = ['seed', 'min', 'contacts', 'scrapes', 'nan', 'minGap', 'minTtc', 'overtakes', 'right%', 'left%', 'cruise%', 'ccSet', 'p50', 'secs', 'pass'];
  const rows = checks.map((c) => [
    c.seed,
    c.minutes.toFixed(1),
    c.contacts,
    c.scrapes,
    c.nan ? 'YES' : '0',
    c.minGap === Infinity ? '–' : c.minGap.toFixed(1),
    c.minTtc === Infinity ? '–' : c.minTtc.toFixed(2),
    c.overtakes,
    Math.round(c.rightShare * 100),
    Math.round(c.leftShare * 100),
    Math.round(c.ccShare * 100),
    c.ccSetModal ?? '–',
    c.p50 == null ? '–' : Math.round(c.p50),
    c.secs.toFixed(1),
    (() => {
      const v = verdict(driver, c);
      return v.ok ? 'yes' : `NO (${v.bad.join(', ')})`;
    })(),
  ]);
  const widths = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((x, i) => String(x).padEnd(widths[i])).join('  ');
  console.log(line(head));
  for (const r of rows) console.log(line(r));

  for (const f of failed) console.log(`seed ${f.seed} FAILED: ${f.failed}`);
  const failures = checks.filter((c) => !verdict(driver, c).ok).length + failed.length;

  const drives = results
    .filter((r) => r.checks)
    .map((r) => {
      const file = join(dir, `seed-${r.seed}.json`);
      try {
        return { file, j: JSON.parse(readFileSync(file, 'utf8')) };
      } catch (e) {
        console.error(`seed ${r.seed}: unreadable journal: ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);
  let frames = [];
  if (drives.length) {
    // Slice 3: the three worst and the three best, with frames and a command.
    if (o.frames) {
      const picks = pickMoments(drives);
      if (picks.length) {
        const t0 = Date.now();
        // What the replay must reproduce: a fresh headless run stopped there.
        const hashes = await Promise.all(
          picks.map((p) =>
            bodyHashUntil({
              ...base,
              seed: p.seed,
              driver: p.profile || driver,
              tod: p.tod,
              scenario: p.scenario,
              cfg: p.cfg || {},
              minutes: 0,
              until: p.m.t,
            }),
          ),
        );
        picks.forEach((p, i) => {
          p.expect = hashes[i];
        });
        frames = await shootPicks(picks, { outDir: join(dir, 'frames'), base: { driver, minutes, tod, scenario } });
        console.log(`frames: ${frames.length} moment(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        const off = frames.filter((f) => !f.shotOk).length;
        if (off) console.log(`frames: ${off} of ${frames.length} did not reproduce the run's hash (see the report)`);
      } else {
        console.log('frames: no moment detectors fired, so there is nothing to look at');
      }
    }
    const md = buildReport(drives, { frames });
    writeFileSync(join(dir, 'report.md'), md);
    console.log(`report: ${join(dir, 'report.md')}`);
  }

  const run = {
    startedAt: new Date(startedAt).toISOString(),
    args: { driver, minutes, tod, scenario, dt, seeds, jobs, cfg: o.cfg, overrides: o.overrides },
    commit: git('rev-parse --short HEAD'),
    commitDirty: git('status --porcelain') !== '',
    node: process.version,
    totalSecs,
    failed: failures,
    checks: checks.map((c) => ({ ...c, verdict: verdict(driver, c) })),
    frames: frames.map((f) => ({ name: f.name, drive: f.drive, t: f.m.t, kind: f.m.kind, sameWorld: f.shotOk, bonnet: f.bonnet, map: f.map })),
  };
  writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 2));
  console.log(`run dir: ${dir}`);
  if (failures) process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && process.argv.includes('--child')) {
  const i = process.argv.indexOf('--child');
  let opts;
  try {
    opts = JSON.parse(process.argv[i + 1]);
  } catch (e) {
    console.error(`bad --child payload: ${e.message}`);
    process.exit(1);
  }
  childMain(opts);
} else if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  parentMain(o).catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}

