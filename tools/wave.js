// Shockwave check: runs the 'wave' scenario headless and lists, for every car
// behind the braker in its lane, how slow it got and how hard it braked, and
// when. A growing wave = later and harder further back.
// Usage: node tools/wave.js [scenario=wave] [sec=90]
import { Traffic, leaderIn, idm } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { SCENARIOS, applyScenario } from '../src/scenarios.js';
import { KMH } from '../src/util.js';

const name = process.argv[2] || 'wave';
const secs = +(process.argv[3] || 90);
const sc = SCENARIOS[name];
CONFIG.lanes = sc.lanes;
const tr = new Traffic({ dir: 1, density: 0, ahead: 1500, behind: 900, seed: sc.seed, limitKmh: CONFIG.speedLimitDay });
const player = { isPlayer: true, u: 0, len: 4.8, v: sc.player.kmh * KMH, v0: sc.player.want * KMH, T: 1.2, s0: 2, a: 1.5, b: 2, lanesOcc: [sc.player.lane], signalLane: -1, lane: sc.player.lane };
tr.initialFill(0, player);
applyScenario(tr, sc, 0, { includeYou: true });
tr.spawnBehind = false;
const braker = tr.vehicles.find((v) => v.tag === 'braker');
const lane = braker.lane;
const watch = tr.vehicles.filter((v) => v.lane === lane && v.u < braker.u).sort((a, b) => b.u - a.u);
const st = new Map(watch.map((v) => [v, { d0: braker.u - v.u, vMin: Infinity, tMin: 0, aMin: 0, left: false }]));
const dt = 1 / 60;
for (let i = 0; i < secs / dt; i++) {
  tr.step(dt, 0, null);
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
