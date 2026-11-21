// Proefrit (F-37) slice 2: headless tests for perception (and, from P2, the bot).
//
// Usage: npm run bottest
//
// These test the contract, not the tuning: what a driver can see, what the bot
// may read, and that no cue used by the bot comes from hidden sim state.
import { readFileSync } from 'node:fs';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { KMH } from '../src/util.js';
import { laneLat } from '../src/layout.js';
import { Perception, observe, ALLOWED } from '../src/perception.js';
import { createSim, stepSim, playerLimit, applyDrivePress } from '../src/session.js';
import { pedalStep } from '../src/input.js';
import { BotDriver } from '../src/botDriver.js';

let failed = 0;
let passed = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`ok    ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));

// ---------------------------------------------------------------- fake world
function playerAt({ s = 1000, lane = 0, lat = null, kmh = 100, ind = 0 } = {}) {
  const v = kmh * KMH;
  return {
    s,
    lat: lat ?? laneLat(lane),
    lane,
    lanesOcc: [lane],
    len: 4.8,
    width: 1.84,
    vAlong: v,
    v,
    acc: 0,
    ind,
    steerVis: 0,
    headingErr: 0,
    cc: { on: false, set: 100, has: false },
  };
}
function vehAt(id, { lane = 0, dl = 50, kmh = 25 / KMH, type = 'car', variant = 'sedan', len = 4.5, width = 1.8, lat = null, ind = 0, brake = false, playerS = 1000 } = {}) {
  return {
    id,
    type,
    variant,
    len,
    width,
    u: playerS + dl,
    latLocal: lat ?? laneLat(lane),
    v: kmh * KMH,
    indicator: ind,
    brake,
  };
}
const fakeMsi = { face: () => null };
const fakeTraffic = (vehicles, closures = []) => ({ vehicles, closures });

// ---------------------------------------------------------------- 1. geometry
{
  const p = playerAt({ kmh: 100 });
  const v = 25; // m/s
  const vehicles = [
    vehAt(1, { dl: 50, kmh: v / KMH }), // same lane ahead
    vehAt(2, { dl: -30, kmh: 30 / KMH }), // same lane behind
    vehAt(3, { lane: 2, dl: 100 }), // two lanes away, out of the 80 m cone
    vehAt(4, { lane: 2, dl: 70 }), // ...and inside it
    vehAt(5, { lane: 1, dl: -200 }), // mirror range is 120 m
    vehAt(6, { lane: 1, dl: -100 }),
    vehAt(7, { lat: (laneLat(0) + laneLat(1)) / 2, dl: 40 }), // straddling
    vehAt(8, { dl: 60, kmh: 35 / KMH }), // faster: no TTC
  ];
  const perc = new Perception().update(10, p, fakeTraffic(vehicles), fakeMsi, 100);
  const by = (id) => perc.cars.find((c) => c.id === id);

  const a = by(1);
  ok('geometry: lead car visible', !!a);
  ok('geometry: bumper gap', near(a.gap, 50 - (4.5 + 4.8) / 2), `gap ${fmt(a.gap)}`);
  ok('geometry: time gap', near(a.tgap, a.gap / (100 * KMH)), `tgap ${fmt(a.tgap)}`);
  ok('geometry: relative speed in km/h', near(a.relKmh, -10, 0.05), `relKmh ${fmt(a.relKmh)}`);
  ok('geometry: ttc', near(a.ttc, a.gap / (100 * KMH - v)), `ttc ${fmt(a.ttc)}`);

  const b = by(2);
  ok('geometry: car behind', !!b && b.side === 'behind');
  ok('geometry: behind gap', near(b.gap, 30 - (4.5 + 4.8) / 2), `gap ${fmt(b.gap)}`);
  ok('geometry: behind ttc', near(b.ttc, b.gap / (30 - 100 * KMH)), `ttc ${fmt(b.ttc)}`);
  ok('geometry: behind time gap uses its speed', near(b.tgap, b.gap / 30), `tgap ${fmt(b.tgap)}`);

  ok('range: two lanes away is invisible past 80 m', !by(3));
  ok('range: two lanes away visible inside 80 m', !!by(4) && by(4).lane === 2);
  ok('range: mirror 120 m behind', !by(5));
  ok('range: visible 100 m behind', !!by(6));
  ok('geometry: ttc is Infinity when not closing', by(8).ttc === Infinity);

  const st = by(7);
  ok('geometry: a straddling car occupies both lanes', st && st.lanesOcc.includes(0) && st.lanesOcc.includes(1), st ? JSON.stringify(st.lanesOcc) : 'missing');
  ok('geometry: lane of a straddling car is its body lane', st && st.lane === 0, st ? String(st.lane) : 'missing');

  const plain = new Perception().update(10, p, fakeTraffic([vehicles[0], vehicles[1]]), fakeMsi, 100);
  ok('lanes: own lane ahead/behind', plain.lanes[0].ahead.id === 1 && plain.lanes[0].behind.id === 2);
  ok('lanes: freeAheadM is the gap', near(plain.lanes[0].freeAheadM, a.gap), fmt(plain.lanes[0].freeAheadM));
  ok('lanes: a straddling car counts in both lanes', perc.lanes[0].ahead.id === 7 && perc.lanes[1].ahead.id === 7);
  ok('lanes: adjacent lane visible 250 m ahead', perc.lanes[1].visibleAheadM === CONFIG.perception.aheadM);
  ok('lanes: two-away lane only sees 80 m', perc.lanes[2].visibleAheadM === CONFIG.perception.farM);
  ok('lanes: two-away ahead is the 70 m car', perc.lanes[2].ahead.id === 4);

  // A car two lanes away exactly at the far edge is visible; 1 m further is not.
  const edge = new Perception().update(0, p, fakeTraffic([vehAt(9, { lane: 2, dl: 80 })]), fakeMsi, 100);
  ok('range: 80 m two away is visible (inclusive)', !!edge.cars.find((c) => c.id === 9));
  const past = new Perception().update(0, p, fakeTraffic([vehAt(10, { lane: 2, dl: 81 })]), fakeMsi, 100);
  ok('range: 81 m two away is not', !past.cars.find((c) => c.id === 10));
}

// ---------------------------------------------------------------- 2. poison
{
  const sim = createSim({ seed: 7, timeOfDay: 'day' });
  const perc = new Perception();
  const poison = (veh) =>
    new Proxy(veh, {
      get(t, k) {
        if (typeof k === 'symbol' || k === 'then' || k === 'toJSON' || k === 'inspect') return t[k];
        if (!ALLOWED.includes(k)) throw new Error(`perception read a forbidden field: ${String(k)}`);
        return t[k];
      },
    });
  let threw = null;
  const dt = 1 / 60;
  let t = 0;
  let percept = null;
  const bot = new BotDriver('forens', { seed: 7 });
  const pedal = { thr: 0, brk: 0, thrHeld: 0, brkHeld: 0 };
  try {
    while (t < 60) {
      if (percept) {
        const out = bot.update(dt, percept);
        for (const pr of out.presses) applyDrivePress(sim, pr);
        const ctl = pedalStep(pedal, out.keys, dt);
        stepSim(sim, dt, ctl);
      } else {
        stepSim(sim, dt, { steer: 0, throttle: 0.2, brake: 0, analog: false });
      }
      t += dt;
      if (Math.abs(t % 0.1) < dt / 2) {
        const traffic = { vehicles: sim.traffic.vehicles.map(poison), closures: sim.traffic.closures };
        percept = perc.update(t, sim.player, traffic, sim.msi, playerLimit(sim));
      }
    }
  } catch (e) {
    threw = e;
  }
  ok('poison: 60 s of perception + bot over a throwing proxy', !threw, threw ? threw.message : '');
}

// ---------------------------------------------------------------- 3. imports
const BANNED = ['three', 'node:', 'fs', 'window', 'document', 'navigator', 'performance', 'Date'];
function checkModule(file, allowedImports, { banned = BANNED } = {}) {
  const src = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const badImport = specs.filter((s) => !allowedImports.includes(s));
  ok(`imports: ${file} only imports the render-free core`, badImport.length === 0, badImport.join(', '));
  const badToken = banned.filter((b) => new RegExp(`\\b${b.replace(':', '\\:')}`).test(src));
  ok(`imports: ${file} touches no DOM or wall clock`, badToken.length === 0, badToken.join(', '));
}
checkModule('perception.js', ['./config.js', './util.js', './layout.js', './msi.js']);
checkModule('botDriver.js', ['./config.js', './util.js', './layout.js', './msi.js', './perception.js']);

// ---------------------------------------------------------------- 4. drift cue
{
  // A lane change is telegraphed by lateral drift before the body changes lane.
  let found = null;
  const scenarios = ['elephant', 'cast', 'closure'];
  for (const name of scenarios) {
    const sim = createSim({ seed: 30, timeOfDay: 'day', scenario: name });
    const perc = new Perception();
    const prior = new Map(); // id -> last few non-zero drift values
    const lastOcc = new Map(); // id -> lanesOcc signature
    let t = 0;
    while (t < 180 && !found) {
      sim.journal.active || sim.journal // the journal is off here
      stepSim(sim, 1 / 60, { steer: 0, throttle: 0, brake: 0, analog: false });
      t += 1 / 60;
      if (Math.abs(t % 0.1) > 1 / 120) continue;
      const p = perc.update(t, sim.player, sim.traffic, sim.msi, playerLimit(sim));
      for (const c of p.cars) {
        const sig = c.lanesOcc.join(',');
        const prev = lastOcc.get(c.id);
        if (prev != null && prev !== sig && prior.get(c.id)) found = { scenario: name, t, id: c.id, prev, sig };
        lastOcc.set(c.id, sig);
        if (c.drift !== 0) prior.set(c.id, { t, drift: c.drift, off: c.off });
        else prior.delete(c.id);
      }
    }
    if (found) break;
  }
  ok('drift: a lane change shows drift before lanesOcc changes', !!found, found ? `scenario ${found.scenario} t=${found.t.toFixed(1)} id ${found.id} ${found.prev}→${found.sig}` : 'no telegraphed lane change seen');
}

console.log(failed ? `\n${failed} case(s) failed, ${passed} passed` : `\nall ${passed} bot/perception cases passed`);
// ---------------------------------------------------------------- 5. bot on synthetic percepts
/** A Seen as perception.js would hand it over (P2 fields; the rest filled for realism). */
function seenAhead({ id = 1, dl = 100, kmh = 90, lane = 0, len = 4.5, brake = false, ind = 0, seenAge = 10, drift = 0, pKmh = 100 } = {}) {
  const pv = pKmh * KMH;
  const v = kmh * KMH;
  const gap = dl - (len + 4.8) / 2;
  return {
    id, type: 'car', variant: 'sedan', len, width: 1.8, side: 'ahead', dl, gap,
    tgap: gap / pv, relKmh: (v - pv) / KMH, closing: pv - v,
    ttc: pv - v > 0.1 ? gap / (pv - v) : Infinity,
    lane, lanesOcc: [lane], off: 0, latRate: 0, drift, kmh, ind, indAge: 10, brake, brakeAge: 10, seenAge,
  };
}

/** Build a Percept, filling the lane views a real Perception would produce. */
function perceptAt({ t = 0, lane = 0, lat = null, kmh = 100, cc = { on: true, set: 104, has: true }, cars = [], obstacles = [], signs = null, limitKmh = 100 } = {}) {
  const v = kmh * KMH;
  const self = { s: 1000, lane, lanesOcc: [lane], lat: lat ?? laneLat(lane), off: 0, kmh, v, acc: 0, ind: 0, steer: 0, headingErr: 0, cc: { ...cc }, limitKmh, lanes: CONFIG.lanes };
  const lanes = Array.from({ length: CONFIG.lanes }, (_, i) => {
    const inLane = cars.filter((c) => c.lanesOcc.includes(i));
    const ahead = inLane.filter((c) => c.dl >= 0).sort((a, b) => a.dl - b.dl)[0] || null;
    const behind = inLane.filter((c) => c.dl < 0).sort((a, b) => b.dl - a.dl)[0] || null;
    const adj = Math.abs(i - lane) <= 1;
    const visibleAheadM = adj ? CONFIG.perception.aheadM : CONFIG.perception.farM;
    const visibleBehindM = adj ? CONFIG.perception.behindM : CONFIG.perception.farM;
    return { ahead, behind, freeAheadM: ahead ? ahead.gap : visibleAheadM, freeBehindM: behind ? behind.gap : visibleBehindM, visibleAheadM, visibleBehindM };
  });
  return { t, self, cars, lanes, obstacles, signs: signs || { limitKmh, nextGantryM: Infinity, cur: null, next: null } };
}

/** Run a bot against a percept function; mirror the press effects into the local cc. */
function driveBot(bot, seconds, perceptFn, { dt = 1 / 60, kmh = 100 } = {}) {
  const cc = { on: true, set: 104, has: true };
  const seen = { brake: false, throttle: false, flash: false, flashAt: null, set: null, states: new Set(), presses: [] };
  let p = perceptFn(0, cc, kmh);
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    const out = bot.update(dt, p);
    seen.brake = seen.brake || out.keys.brake;
    seen.throttle = seen.throttle || out.keys.throttle;
    seen.states.add(bot.state);
    if (out.keys.flash && !seen.flash) {
      seen.flash = true;
      seen.flashAt = i * dt;
    }
    for (const pr of out.presses) {
      seen.presses.push(pr.code);
      if (pr.code === 'KeyC') {
        if (cc.on) cc.on = false;
        else {
          cc.set = Math.round(p.self.kmh);
          cc.on = true;
          cc.has = true;
        }
      } else if (pr.code === 'KeyR') {
        if (cc.has) cc.on = true;
      } else if (pr.code === 'Equal') {
        if (!cc.on) {
          cc.on = true;
          if (cc.has) cc.set = Math.round(p.self.kmh);
        }
        cc.set += pr.shift ? 5 : 1;
      } else if (pr.code === 'Minus') {
        if (!cc.on) {
          cc.on = true;
          if (cc.has) cc.set = Math.round(p.self.kmh);
        }
        cc.set -= pr.shift ? 5 : 1;
      }
    }
    // any brake pedal switches cruise off, as in Player.update
    if (out.keys.brake) cc.on = false;
    // a simple stand-in for the car's response, so the bot sees its own braking
    kmh = Math.max(0, kmh + (out.keys.throttle ? 1.2 : out.keys.brake ? -3.5 : -0.05) * dt);
    p = perceptFn((i + 1) * dt, cc, kmh);
    seen.set = cc.set;
  }
  return seen;
}

{
  // Following a slower leader: the bot slows down (or signals to pass) and never
  // holds W and S at the same time.
  const bot = new BotDriver('forens', { seed: 1 });
  const lead = seenAhead({ dl: 80, kmh: 80 });
  const seen = driveBot(bot, 20, (t, cc, kmh) => perceptAt({ t, kmh, cars: [lead], cc }));
  ok('bot: reacts to a slower leader', seen.brake || seen.presses.includes('KeyQ'), JSON.stringify(seen.states));
  ok('bot: FOLLOW is reported', seen.states.has('FOLLOW'), [...seen.states].join(','));
  ok('bot: never holds W and S together', !(seen.throttle && seen.brake));
}

{
  // A car only a little slower: click the set speed down toward it, cruise on.
  const bot = new BotDriver('forens', { seed: 5 });
  const lead = seenAhead({ dl: 160, kmh: 100 });
  const seen = driveBot(bot, 6, (t, cc, kmh) => perceptAt({ t, kmh, cars: [lead], cc }));
  ok('bot: set speed comes down toward a slightly slower leader', seen.set != null && seen.set <= 100, String(seen.set));
}

{
  // A cut-in: a car appears close and slower. EMERGENCY must fire after ~0.15 s.
  const bot = new BotDriver('forens', { seed: 2 });
  const cut = seenAhead({ dl: 12, kmh: 92, seenAge: 0.2 });
  const seen = driveBot(bot, 6, (t, cc, kmh) => perceptAt({ t, kmh, cars: t < 3 ? [] : [cut], cc }));
  ok('bot: a cut-in triggers EMERGENCY', seen.states.has('EMERGENCY'), [...seen.states].join(','));
  ok('bot: a cut-in is braked, not accelerated', seen.brake);
}

{
  // Flash: 20 s behind a left-lane dawdler, right lane free → hold F at 20 s.
  const bot = new BotDriver('forens', { seed: 3, overrides: { overtakeKmh: 999, keepRight: false, homeLane: 1 } });
  const dawdler = seenAhead({ id: 7, dl: 60, kmh: 94, lane: 1 });
  const seen = driveBot(bot, 23, (t, cc, kmh) => perceptAt({ t, lane: 1, kmh, cars: [dawdler], cc }));
  ok('bot: flashes after 20 s behind a left-lane dawdler', seen.flash && Math.abs(seen.flashAt - 20) <= 0.5, `flash at ${seen.flashAt}`);
}

{
  // Red cross over our lane: get out, even without a generous gap.
  const bot = new BotDriver('forens', { seed: 4 });
  const p = perceptAt({ t: 0, lane: 0, obstacles: [{ lane: 0, dAhead: 200, len: 900 }], signs: { limitKmh: 70, nextGantryM: 250, cur: ['x', '', ''], next: null } });
  let left = false;
  const cc = { on: true, set: 104, has: true };
  for (let i = 0; i < 60 * 4; i++) {
    const out = bot.update(1 / 60, p);
    for (const pr of out.presses) {
      if (pr.code === 'KeyR') cc.on = true;
      if (pr.code === 'KeyC') cc.on = !cc.on;
    }
    if (bot.laneTarget === 1 || bot.state === 'PREP' || bot.state === 'MOVE') left = true;
  }
  ok('bot: leaves a red-crossed lane', left, `${bot.state} target ${bot.laneTarget}`);
}

{
  // Gap rejection: a fast car right behind in the target lane, so no pull-out.
  const bot = new BotDriver('forens', { seed: 6 });
  const own = seenAhead({ id: 8, dl: 110, kmh: 82 });
  const lag = seenAhead({ id: 9, dl: -6, kmh: 108, lane: 1 });
  lag.gap = 2;
  lag.ttc = 0.4;
  const seen = driveBot(bot, 5, (t, cc, kmh) => perceptAt({ t, lane: 0, kmh, cars: [own, lag], cc }));
  ok('bot: rejects a gap with a car closing in the target lane', !seen.presses.includes('KeyQ'), seen.presses.join(','));
}

{
  // ABORT: the lag car closes halfway through the move.
  const bot = new BotDriver('forens', { seed: 8 });
  const own = seenAhead({ id: 11, dl: 90, kmh: 88 });
  const cc = { on: true, set: 104, has: true };
  let lat = laneLat(0);
  let lane = 0;
  let kmh = 100;
  let aborted = false;
  for (let i = 0; i < 60 * 12; i++) {
    const t = i / 60;
    const inMove = bot.state === 'MOVE';
    const mid = (laneLat(0) + laneLat(1)) / 2;
    const cars = [own];
    if (inMove && lat < mid) {
      const lag = seenAhead({ id: 12, dl: -2, kmh: 112, lane: 1 });
      lag.gap = 1;
      lag.ttc = 0.3;
      cars.push(lag);
    }
    const p = perceptAt({ t, lane, lat, kmh, cars, cc });
    const out = bot.update(1 / 60, p);
    for (const pr of out.presses) {
      if (pr.code === 'KeyC') cc.on = !cc.on;
      else if (pr.code === 'KeyR') cc.on = true;
      else if (pr.code === 'Equal') cc.set += pr.shift ? 5 : 1;
      else if (pr.code === 'Minus') cc.set -= pr.shift ? 5 : 1;
    }
    if (out.keys.brake) cc.on = false;
    if (bot.state === 'MOVE') {
      lat += Math.sign(laneLat(1) - lat) * 1.4 * (1 / 60);
      if ((lat > mid && lane === 0) || (lat < mid && lane === 1)) lane = 1 - lane;
    }
    if (bot.state === 'ABORT') aborted = true;
  }
  ok('bot: aborts a lane change when the gap closes', aborted, `state ${bot.state}`);
}

{
  // Determinism: two fresh processes, one minute each, same hash.
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const runner = fileURLToPath(new URL('./playtest.js', import.meta.url));
  const run = (tag) => {
    const dir = join('playtests', 'bot', `bottest-${tag}`);
    const args = [runner, '--child', JSON.stringify({ seed: 1, driver: 'forens', minutes: 1, tod: 'day', dt: 1 / 60, cfg: {}, overrides: {}, dir, until: null, scenario: null })];
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('CHECKS '));
    if (!line) throw new Error(`child failed: ${r.stderr}`);
    return JSON.parse(line.slice(7)).hash;
  };
  let a = null, b = null, err = null;
  try {
    a = run('a');
    b = run('b');
  } catch (e) {
    err = e;
  }
  ok('determinism: a 60 s bot run twice hashes the same', !err && a === b, err ? err.message : `${a} vs ${b}`);
}

process.exit(failed ? 1 : 0);
