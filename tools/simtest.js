// Headless sanity test of the traffic model: runs a few simulated minutes and
// reports lane usage, speeds, lane changes and any overlaps (collisions).
import { Traffic, gapBetween, leaderIn, idm } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { KMH } from '../src/util.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const minutes = +(args.min || 6);
CONFIG.lanes = +(args.lanes || 3);
const density = +(args.density || 12);
const playerKmh = +(args.player || 100);
const playerLane = +(args.plane ?? 1);

const tr = new Traffic({ dir: 1, density, ahead: 1500, behind: 900, seed: 7, limitKmh: +(args.limit || 100) });
const player = { isPlayer: true, u: 0, len: 4.8, v: playerKmh * KMH, v0: playerKmh * KMH, T: 1.2, s0: 2, a: 1.5, b: 2, lanesOcc: [playerLane], signalLane: -1 };
tr.initialFill(0, player);

const dt = 1 / 60;
let lcLeft = 0, lcRight = 0, overlaps = 0, steps = 0, playerHits = 0;
const laneTime = new Array(CONFIG.lanes).fill(0);
const laneSpeed = new Array(CONFIG.lanes).fill(0);
const truckLane = new Array(CONFIG.lanes).fill(0);
let minAcc = 0, hardBrakes = 0;
const prevLane = new Map();
const total = minutes * 60 / dt;
for (let i = 0; i < total; i++) {
  // player follows traffic with IDM in its own lane (no lane changes)
  if (tr.lanes.length) {
    const ld = leaderIn(tr.lanes[playerLane], player);
    player.v = Math.max(0, player.v + idm(player, ld) * dt);
  }
  player.u += player.v * dt;
  tr.step(dt, player.u, player);
  steps++;
  for (const v of tr.vehicles) {
    const pl = prevLane.get(v.id);
    if (pl != null && pl !== v.lane) (v.lane > pl ? lcLeft++ : lcRight++);
    prevLane.set(v.id, v.lane);
    laneTime[v.lane]++;
    laneSpeed[v.lane] += v.v;
    if (v.type === 'truck') truckLane[v.lane]++;
    if (v.acc < minAcc) minAcc = v.acc;
    if (v.acc < -3) hardBrakes++;
  }
  if (i % 30 === 0) {
    tr.buildLanes(player);
    for (const list of tr.lanes) {
      for (let k = 1; k < list.length; k++) {
        const g = gapBetween(list[k], list[k - 1]);
        if (g < -0.2 && list[k] !== list[k - 1]) {
          if (list[k].isPlayer || list[k - 1].isPlayer) playerHits++;
          else overlaps++;
        }
      }
    }
  }
}
const simMin = minutes;
console.log(`lanes=${CONFIG.lanes} density=${density} player=${playerKmh}km/h lane ${playerLane}, ${simMin} min`);
console.log(`vehicles now: ${tr.vehicles.length}`);
console.log(`lane changes/min: left ${(lcLeft / simMin).toFixed(1)}, right ${(lcRight / simMin).toFixed(1)}`);
const tot = laneTime.reduce((a, b) => a + b, 0);
for (let l = 0; l < CONFIG.lanes; l++) {
  console.log(`lane ${l}: share ${((100 * laneTime[l]) / tot).toFixed(1)}%  avg ${(laneSpeed[l] / Math.max(1, laneTime[l]) / KMH).toFixed(1)} km/h  trucks ${truckLane[l]}`);
}
console.log(`overlap samples (AI-AI): ${overlaps}, involving player: ${playerHits}`);
console.log(`min acc ${minAcc.toFixed(2)}  hard-brake vehicle-steps ${(hardBrakes / steps).toFixed(3)}/step`);
const sig = tr.vehicles.filter((v) => v.state !== 'none').length;
console.log(`currently signalling/moving: ${sig}`);
