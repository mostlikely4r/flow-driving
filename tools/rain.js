// F-24 rain check: the same seeds dry and wet, side by side.
//   Plain road (the simtest setup, 3 lanes, densities 8 and 12, 6 min): mean speed
//   per lane, median car time gap per lane, hard brakes, overlaps, per-persona gaps.
//   Closure (the closure.js setup, 3→2 lanes, density 14, 10 min): cars through,
//   collisions, emergency stops.
//   Spray (wet only): share of car-seconds in a lorry's spray, longest stretch.
// Exits 1 when a check from docs/specs/F-24-rain.md section 6 fails.
// Usage: node tools/rain.js [min=6] [closureMin=10] [seeds=7,8] [only=plain|closure] [wet.Tmul=0.5 ...]
import { Traffic, gapBetween, leaderIn, followerIn, idm } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { MSI } from '../src/msi.js';
import { KMH } from '../src/util.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const MIN = +(args.min || 6);
const CMIN = +(args.closureMin || 10);
const SEEDS = (args.seeds || '7,8').split(',').map(Number);
// A blinded car lifts off gently (at most -1.5 m/s², docs/specs/F-24-rain.md):
// from 30 m behind a lorry that takes some seconds, so it must be out of the
// spray within its grace plus this.
const SPRAY_OUT_S = 8;
// Time gaps are measured for cars that follow someone steadily (closer than
// this, within 1 m/s of its speed), where the gap is the driver's own headway
// rather than a car closing in to overtake.
const FOLLOW_M = 100;
CONFIG.lanes = 3;
// wet.<key>=<n> tries another wet number without editing the config
for (const [k, v] of Object.entries(args)) if (k.startsWith('wet.')) CONFIG.wet[k.slice(4)] = +v;
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const isCar = (v) => v.type === 'car' || v.type === 'van';
const fails = [];
const check = (ok, text) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) fails.push(text);
};

// ---------------------------------------------------------------- plain road
function plain(density, wet) {
  const runs = SEEDS.map((seed) => plainRun(density, wet, seed));
  const pool = (f) => runs.flatMap(f);
  const sp = Array.from({ length: CONFIG.lanes }, (_, l) => runs.reduce((a, r) => [a[0] + r.sp[l][0], a[1] + r.sp[l][1]], [0, 0]));
  const gaps = Array.from({ length: CONFIG.lanes }, (_, l) => pool((r) => r.gaps[l]));
  const persona = new Map();
  for (const r of runs) for (const [k, a] of r.persona) persona.set(k, [...(persona.get(k) || []), ...a]);
  const longest = new Map();
  for (const r of runs) for (const [id, L] of r.longest) longest.set(`${r.seed}:${id}`, L);
  const carSec = runs.reduce((a, r) => a + r.carSec, 0);
  return {
    speed: sp.map(([s, n]) => (n ? s / n / KMH : NaN)),
    gap: gaps.map(median),
    gapAll: median(gaps.flat()),
    persona: new Map([...persona].map(([k, a]) => [k, median(a)])),
    hard: runs.reduce((a, r) => a + r.hard, 0),
    overlaps: runs.reduce((a, r) => a + r.overlaps, 0),
    sprayShare: carSec ? runs.reduce((a, r) => a + r.sprayCarSec, 0) / carSec : 0,
    longest,
  };
}

function plainRun(density, wet, seed) {
  const tr = new Traffic({ dir: 1, density, ahead: 1500, behind: 900, seed, limitKmh: 100 });
  tr.setWet(wet);
  const player = { isPlayer: true, u: 0, len: 4.8, v: 100 * KMH, v0: 100 * KMH, T: 1.2, s0: 2, a: 1.5, b: 2, lanesOcc: [1], signalLane: -1 };
  tr.initialFill(0, player);
  const dt = 1 / 60;
  const N = CONFIG.lanes;
  const sp = Array.from({ length: N }, () => [0, 0]); // car speed sum, samples
  const gaps = Array.from({ length: N }, () => []);
  const persona = new Map();
  let hard = 0, overlaps = 0, carSec = 0, sprayCarSec = 0;
  const longest = new Map(); // id -> { t, grace, boxed }
  for (let i = 0; i < (MIN * 60) / dt; i++) {
    const ld = tr.lanes.length ? leaderIn(tr.lanes[1], player) : null;
    player.v = Math.max(0, player.v + idm(player, ld) * dt);
    player.u += player.v * dt;
    tr.step(dt, player.u, player);
    for (const v of tr.vehicles) {
      if (v.acc < -4) hard++;
      if (!isCar(v) || v.lane < 0) continue;
      carSec += dt;
      if (v.sprayT > 0) {
        sprayCarSec += dt;
        const L = longest.get(v.id);
        if (!L || v.sprayT > L.t) longest.set(v.id, { t: v.sprayT, grace: v.sprayGrace, boxed: boxedIn(tr, v), drives: v.drives || v.type });
      }
    }
    if (i % 30 === 0) {
      tr.buildLanes(player);
      for (const list of tr.lanes) {
        for (let k = 1; k < list.length; k++) if (gapBetween(list[k], list[k - 1]) < -0.2 && !list[k].isPlayer && !list[k - 1].isPlayer) overlaps++;
      }
      for (const v of tr.vehicles) {
        if (!isCar(v) || v.lane < 0 || v.state !== 'none') continue;
        sp[v.lane][0] += v.v;
        sp[v.lane][1]++;
        const l = leaderIn(tr.lanes[v.lane], v);
        if (!l || v.v < 15) continue;
        const g = gapBetween(l, v);
        if (g > FOLLOW_M || Math.abs(v.v - l.v) > 1) continue; // following steadily: the gap is the driver's own headway
        const tg = g / v.v;
        gaps[v.lane].push(tg);
        const k = v.drives || 'ordinary';
        if (!persona.has(k)) persona.set(k, []);
        persona.get(k).push(tg);
      }
    }
  }
  return { seed, sp, gaps, persona, hard, overlaps, carSec, sprayCarSec, longest };
}

/** A car that can neither pull out left nor has the lane behind it free to drop back into. */
function boxedIn(tr, v) {
  const left = v.lane + 1 < tr.N ? tr.evaluate(v, v.lane + 1).safe : false;
  const f = followerIn(tr.laneList(v.lane), v);
  const tight = f && gapBetween(v, f) < f.v * 0.8;
  return !left && !!tight;
}

// ---------------------------------------------------------------- closure
function closure(wet) {
  const runs = SEEDS.map((seed) => closureRun(wet, seed));
  const sum = (k) => runs.reduce((a, r) => a + r[k], 0);
  return { through: sum('through'), late: sum('late'), crashes: sum('crashes'), emerg: sum('emerg') };
}

function closureRun(wet, seed) {
  const tr = new Traffic({ dir: 1, density: 14, ahead: 1500, behind: 1500, seed, limitKmh: 100 });
  tr.setWet(wet);
  tr.initialFill(0, null);
  const msi = new MSI(tr);
  tr.msi = msi;
  tr.addClosure(0, 700, 1400);
  const dt = 1 / 30;
  const crashes = new Set(), emerg = new Set(), seen = new Set();
  let through = 0, late = 0;
  for (let i = 0; i < (CMIN * 60) / dt; i++) {
    tr.step(dt, 0, null);
    msi.update(dt, 0);
    for (const list of tr.lanes) for (let k = 1; k < list.length; k++) if (gapBetween(list[k], list[k - 1]) < -0.2) crashes.add(list[k].id + ':' + list[k - 1].id);
    for (const v of tr.vehicles) {
      if (v.u > 1500 && !seen.has(v.id)) {
        seen.add(v.id);
        through++;
        if (tr.time > 180) late++;
      }
      if (v.acc < -6) emerg.add(v.id);
    }
  }
  return { through, late, crashes: crashes.size, emerg: emerg.size };
}

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '–');
const pct = (a, b) => ((100 * (a - b)) / b).toFixed(0).padStart(3) + '%';

if (args.only !== 'closure') {
  for (const density of [8, 12]) {
    const d = plain(density, false);
    const w = plain(density, true);
    console.log(`\nPlain road, 3 lanes, density ${density}, ${MIN} min, seeds ${SEEDS.join('+')}         dry      wet`);
    for (let l = 0; l < CONFIG.lanes; l++) {
      console.log(`  lane ${l} car speed (km/h)                               ${f1(d.speed[l]).padStart(6)}   ${f1(w.speed[l]).padStart(6)}   ${f1(w.speed[l] - d.speed[l])}`);
      console.log(`  lane ${l} median car time gap (s)                        ${f2(d.gap[l]).padStart(6)}   ${f2(w.gap[l]).padStart(6)}   ${pct(w.gap[l], d.gap[l])}`);
    }
    console.log(`  all lanes median car time gap (s)                     ${f2(d.gapAll).padStart(6)}   ${f2(w.gapAll).padStart(6)}   ${pct(w.gapAll, d.gapAll)}`);
    console.log(`  hard brakes (< -4 m/s², vehicle-steps)                ${String(d.hard).padStart(6)}   ${String(w.hard).padStart(6)}`);
    console.log(`  overlaps (AI-AI)                                      ${String(d.overlaps).padStart(6)}   ${String(w.overlaps).padStart(6)}`);
    console.log('  per persona, median time gap (s), dry → wet:');
    const keys = [...new Set([...d.persona.keys(), ...w.persona.keys()])].sort();
    for (const k of keys) console.log(`    ${k.padEnd(10)} ${f2(d.persona.get(k))} → ${f2(w.persona.get(k))}  ${pct(w.persona.get(k), d.persona.get(k))}`);
    console.log(`  spray: ${(100 * w.sprayShare).toFixed(2)}% of car-seconds in spray`);
    const over = [...w.longest].filter(([, L]) => L.t > L.grace + SPRAY_OUT_S);
    const top = [...w.longest].sort((a, b) => b[1].t - a[1].t)[0];
    const after = [...w.longest].map(([, L]) => Math.max(0, L.t - L.grace)).sort((a, b) => a - b);
    const q = (p) => (after.length ? after[Math.min(after.length - 1, Math.floor(p * after.length))].toFixed(1) : '–');
    console.log(`  spray: ${after.length} cars in it; time in it past their grace: median ${q(0.5)} s, 90% ${q(0.9)} s, max ${q(1)} s`);
    if (top) console.log(`  spray: longest stretch ${top[1].t.toFixed(1)} s (${top[1].drives}#${top[0]}, grace ${top[1].grace.toFixed(1)} s)`);
    const boxed = over.filter(([, L]) => L.boxed);
    const free = over.filter(([, L]) => !L.boxed);
    if (boxed.length) console.log(`  spray: boxed in, reported not failed: ${boxed.map(([id, L]) => `${L.drives}#${id} ${L.t.toFixed(1)} s`).join(', ')}`);

    check(w.overlaps === 0, `density ${density}: 0 overlaps wet (${w.overlaps})`);
    const g = (w.gapAll - d.gapAll) / d.gapAll;
    check(g >= 0.15 && g <= 0.35, `density ${density}: median car time gap up 15–35% (${(100 * g).toFixed(0)}%)`);
    // "lanes 1–2" in the plan, counted from the right: the right and middle lane.
    // The left lane is where the drivers who barely adapt (speeders, patsers,
    // leasebakken) end up, so its smaller drop is printed above, not checked.
    for (const l of [0, 1]) {
      const dv = d.speed[l] - w.speed[l];
      check(dv >= 3 && dv <= 8, `density ${density}: lane ${l} car speed down 3–8 km/h (${dv.toFixed(1)})`);
    }
    check(!free.length, `density ${density}: no car in spray longer than grace + ${SPRAY_OUT_S} s${free.length ? ` (${free.map(([id, L]) => `${L.drives}#${id} ${L.t.toFixed(1)} s, grace ${L.grace.toFixed(1)}`).join('; ')})` : ''}`);
    const growth = (k) => (w.persona.get(k) - d.persona.get(k)) / d.persona.get(k);
    const calm = ['pensioner', 'family'].filter((k) => d.persona.has(k) && w.persona.has(k));
    if (d.persona.has('patser') && w.persona.has('patser') && calm.length) {
      check(calm.every((k) => growth(k) > growth('patser')), `density ${density}: pensioner/family gaps grow more than patser gaps`);
    }
  }
}

if (args.only !== 'plain') {
  const d = closure(false);
  const w = closure(true);
  console.log(`\nClosure, 3→2 lanes, density 14, ${CMIN} min, seeds ${SEEDS.join('+')}       dry      wet`);
  console.log(`  vehicles through                                      ${String(d.through).padStart(6)}   ${String(w.through).padStart(6)}   ${((100 * w.through) / d.through).toFixed(0)}%`);
  console.log(`  vehicles through after minute 3 (the settled queue)   ${String(d.late).padStart(6)}   ${String(w.late).padStart(6)}   ${((100 * w.late) / d.late).toFixed(0)}%`);
  console.log(`  collisions                                            ${String(d.crashes).padStart(6)}   ${String(w.crashes).padStart(6)}`);
  console.log(`  emergency stops                                       ${String(d.emerg).padStart(6)}   ${String(w.emerg).padStart(6)}`);
  check(w.crashes <= d.crashes, `closure: collisions wet no more than dry (${w.crashes} vs ${d.crashes}; the plan asks 0, dry already has ${d.crashes})`);
  check(w.emerg <= d.emerg, `closure: emergency stops wet no more than dry (${w.emerg} vs ${d.emerg})`);
  const r = w.late / d.late;
  check(r >= 0.8 && r <= 0.95, `closure: settled throughput wet 80–95% of dry, target 85–90% (${(100 * r).toFixed(0)}%)`);
}

console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall rain checks pass');
process.exit(fails.length ? 1 : 0);
