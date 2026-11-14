// Shockwave check: runs the 'wave' scenario headless and lists, for every car
// behind the braker in its lane, how slow it got and how hard it braked, and
// when. A growing wave = later and harder further back.
// Usage: node tools/wave.js [scenario=wave] [sec=90]
// Env: RT=reactionTime scale, BK/BD/BH = trigger brakes to BK km/h at BD m/s², holds BH s
import { Traffic, leaderIn, idm, gapBetween } from '../src/traffic.js';
const crashes = new Set();
import { CONFIG } from '../src/config.js';
import { SCENARIOS, applyScenario } from '../src/scenarios.js';
import { KMH } from '../src/util.js';

const name = process.argv[2] || 'wave';
const secs = +(process.argv[3] || 90);
const sc = SCENARIOS[name];
if (process.env.RT) CONFIG.reactionTime = +process.env.RT;
CONFIG.lanes = sc.lanes;
const tr = new Traffic({ dir: 1, density: 0, ahead: 1500, behind: 900, seed: sc.seed, limitKmh: CONFIG.speedLimitDay });
const player = { isPlayer: true, u: 0, len: 4.8, v: sc.player.kmh * KMH, v0: sc.player.want * KMH, T: 1.2, s0: 2, a: 1.5, b: 2, lanesOcc: [sc.player.lane], signalLane: -1, lane: sc.player.lane };
tr.initialFill(0, player);
applyScenario(tr, sc, 0, { includeYou: true });
tr.spawnBehind = false;
const braker = tr.vehicles.find((v) => v.tag === 'braker');
// env BK / BD / BH: how hard the trigger brakes (km/h to, m/s², hold s)
if (process.env.BK) braker.brakeEvent = { ...braker.brakeEvent, kmh: +process.env.BK, decel: +(process.env.BD || 2.5), hold: +(process.env.BH || 2) };
const lane = braker.lane;
const watch = tr.vehicles.filter((v) => v.lane === lane && v.u < braker.u).sort((a, b) => b.u - a.u);
const st = new Map(watch.map((v) => [v, { d0: braker.u - v.u, vMin: Infinity, tMin: 0, aMin: 0, left: false }]));
const dt = 1 / 60;
for (let i = 0; i < secs / dt; i++) {
  tr.step(dt, 0, null);
  for (const list of tr.lanes) for (let k = 1; k < list.length; k++) if (gapBetween(list[k], list[k - 1]) < -0.2) crashes.add(list[k].id + ':' + list[k - 1].id);
  for (const [v, s] of st) {
    if (v.lane !== lane) s.left = true;
    if (s.left || tr.time < sc.vehicles.find((x) => x.tag === 'braker').params.brakeEvent.at) continue;
    if (v.v < s.vMin) { s.vMin = v.v; s.tMin = tr.time; }
    s.aMin = Math.min(s.aMin, v.acc);
  }
}
console.log(`${name}: car behind the braker   started   lowest speed   when   hardest braking`);
let k = 0;
for (const [v, s] of st) {
  k++;
  if (s.left) { console.log(`  #${String(k).padStart(2)} ${(v.tag || v.drives || v.type).padEnd(10)} ${String(Math.round(s.d0)).padStart(5)} m back   (changed lanes)`); continue; }
  console.log(`  #${String(k).padStart(2)} ${(v.tag || v.drives || v.type).padEnd(10)} ${String(Math.round(s.d0)).padStart(5)} m back   ${String(Math.round(s.vMin / KMH)).padStart(4)} km/h   ${s.tMin.toFixed(1).padStart(5)} s   ${(-s.aMin).toFixed(1)} m/s²`);
}
const done = [...st.values()].filter((s) => !s.left);
const far = done.filter((s) => s.d0 > 400);
console.log(`collisions ${crashes.size} · hardest braking anywhere ${Math.max(...done.map((s) => -s.aMin)).toFixed(1)} m/s² · 400 m+ back: lowest speed avg ${(far.reduce((a, s) => a + s.vMin, 0) / Math.max(1, far.length) / KMH).toFixed(0)} km/h, braking avg ${(far.reduce((a, s) => a - s.aMin, 0) / Math.max(1, far.length)).toFixed(1)} m/s²`);
