// Proefrit (F-37) slice 2: headless playtest runner.
//
//   npm run playtest -- driver=forens min=20 seeds=5 tod=day
//                       [scenario=closure] [seed=N] [until=T] [dt=1/60]
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
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { CONFIG } from '../src/config.js';
import { mulberry32 } from '../src/util.js';
import { pedalStep } from '../src/input.js';
import { createSim, stepSim, applyDrivePress, holdFlash, drainEvents, playerLimit } from '../src/session.js';
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
    const i = a.indexOf('=');
    if (i < 0) continue;
    const k = a.slice(0, i);
    const v = a.slice(i + 1);
    if (k.startsWith('cfg.')) {
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
/** FNV-1a, 32-bit; two seeds give a 64-bit hex digest. */
function fnv(str) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a ^= c;
    a = Math.imul(a, 0x01000193);
    b ^= c;
    b = Math.imul(b, 0x85ebca6b);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Every column and event, without the wall-clock stamps. */
export function journalHash(j) {
  const h = { ...j.header };
  delete h.startedAt;
  const end = j.end ? { ...j.end } : null;
  if (end) delete end.endedAt;
  const body = { ...j, header: h, end };
  return fnv(JSON.stringify(body));
}

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
  for (const [x, k] of c) if (k > n) ((best = x), (n = k));
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

function makeBot(driver) {
  if (!driver || driver === 'null') return new NullBot();
  throw new Error(`unknown driver "${driver}"`);
}

// ---------------------------------------------------------------- one seed
function runSeed(o) {
  const { seed, driver, minutes, tod, scenario, dt } = o;
  for (const [k, v] of Object.entries(o.cfg || {})) CONFIG[k] = v;
  const sim = createSim({ seed, timeOfDay: tod, scenario: scenario || null, rng: mulberry32(seed + 3) });
  const bot = makeBot(driver);
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
    bot: { params: o.profileParams || null },
    runner: { dt, playerSub: 1 / 120, trafficSub: 1 / 30, minutes, until: o.until ?? null },
  });

  // perception (P1) is absent for now: a minimal self-only view
  const perceptual = (t) => ({
    t,
    self: {
      s: sim.player.s,
      lane: sim.player.lane,
      lanesOcc: sim.player.lanesOcc.slice(),
      lat: sim.player.lat,
      off: 0,
      kmh: sim.player.vAlong / (1 / 3.6),
      v: sim.player.vAlong,
      acc: sim.player.acc,
      ind: sim.player.ind,
      steer: sim.player.steerVis,
      headingErr: sim.player.headingErr,
      cc: { on: sim.player.cc.on, set: sim.player.cc.set, has: sim.player.cc.has },
      limitKmh: playerLimit(sim),
      lanes: CONFIG.lanes,
    },
    cars: [],
    lanes: [],
    obstacles: [],
    signs: { limitKmh: playerLimit(sim), nextGantryM: Infinity, cur: null, next: null },
  });

  const maxT = (o.until != null ? o.until : minutes * 60);
  const pedal = { thr: 0, brk: 0, thrHeld: 0, brkHeld: 0 };
  let t = 0;
  let percept = perceptual(0);
  let perceptT = 0;
  let frames = 0;
  let minGap = Infinity;
  let minTtc = Infinity;
  while (t < maxT - 1e-9) {
    const out = bot.update(dt, percept);
    for (const p of out.presses) applyDrivePress(sim, p);
    const ctl = pedalStep(pedal, out.keys, dt);
    stepSim(sim, dt, ctl);
    holdFlash(sim, out.keys.flash);
    drainEvents(sim);
    perceptT -= dt;
    if (perceptT <= 0) {
      percept = perceptual(t);
      perceptT = 0.1;
    }
    // Diagnostics only (the runner may look; the bot may not).
    const p = sim.player;
    for (const v of sim.traffic.vehicles) {
      const dl = v.u - p.s;
      const gap = Math.abs(dl) - (v.len + p.len) / 2;
      if (gap < minGap) minGap = gap;
      const close = p.vAlong - v.v;
      if (dl > 0 && close > 0.1) minTtc = Math.min(minTtc, gap / close);
    }
    t += dt;
    frames++;
  }
  const secs = (Date.now() - t0) / 1000;
  const crashes = (sim.player.events || []).filter((e) => e.type === 'crash').length;
  const data = sim.journal.finish({ reason: o.until != null ? 'until' : 'end', contacts: crashes });
  const checks = analyse(data, { seed, minGap, minTtc, frames, secs });
  checks.hash = journalHash(data);
  return { data, checks, bot, sim };
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
  } else {
    console.log('until state: ' + JSON.stringify({ t: res.data.end.t, s: res.sim.player.s, kmh: res.sim.player.vAlong / (1 / 3.6), lane: res.sim.player.lane, state: res.bot.state, checks: res.checks }, null, 1));
    console.log('trace tail:');
    for (const line of res.bot.trace.slice(-20)) console.log('  ' + JSON.stringify(line));
  }
  console.log('CHECKS ' + JSON.stringify({ ...res.checks, seed: o.seed }));
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
  const dir = resolve(o.out || join('playtests', 'bot', `${stamp()}-${driver}-${tod}${scenario ? `-${scenario}` : ''}`));
  const base = { driver, minutes, tod, scenario, dt, cfg: o.cfg, overrides: o.overrides, profileParams: o.overrides[driver] || null, dir, until: o.until ?? null };

  // `until=` is a single interactive probe: run it here, no files, no report.
  if (o.until != null) {
    childMain({ ...base, seed: seeds[0] });
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
  const head = ['seed', 'min', 'contacts', 'scrapes', 'nan', 'minGap', 'minTtc', 'overtakes', 'right%', 'left%', 'cruise%', 'ccSet', 'p50', 'secs'];
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
  ]);
  const widths = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((x, i) => String(x).padEnd(widths[i])).join('  ');
  console.log(line(head));
  for (const r of rows) console.log(line(r));

  for (const f of failed) console.log(`seed ${f.seed} FAILED: ${f.failed}`);

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
  if (drives.length) {
    const md = buildReport(drives);
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
    failed: failed.length,
    checks,
  };
  writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 2));
  console.log(`run dir: ${dir}`);
  if (failed.length) process.exit(1);
}

const isChild = process.argv.includes('--child');
if (isChild) {
  const i = process.argv.indexOf('--child');
  let opts;
  try {
    opts = JSON.parse(process.argv[i + 1]);
  } catch (e) {
    console.error(`bad --child payload: ${e.message}`);
    process.exit(1);
  }
  childMain(opts);
} else {
  const o = parseArgs(process.argv.slice(2));
  parentMain(o).catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}

