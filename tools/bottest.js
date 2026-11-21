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
import { createSim, stepSim, playerLimit } from '../src/session.js';

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
  const ctl = { steer: 0, throttle: 0.2, brake: 0, analog: false };
  try {
    while (t < 60) {
      stepSim(sim, dt, ctl);
      t += dt;
      if (Math.abs(t % 0.1) < dt / 2) {
        const traffic = { vehicles: sim.traffic.vehicles.map(poison), closures: sim.traffic.closures };
        perc.update(t, sim.player, traffic, sim.msi, playerLimit(sim));
      }
    }
  } catch (e) {
    threw = e;
  }
  ok('poison: 60 s of perception over a throwing proxy', !threw, threw ? threw.message : '');
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
process.exit(failed ? 1 : 0);
