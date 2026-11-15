// Lane closure check: traffic flows past a fixed closure for a while.
// Reports collisions, emergency stops, cars stuck in the closed lane, speeds
// before the closure, and what the matrix signs show.
// Usage: node tools/closure.js [lanes=3] [density=14] [closedLane=0] [minutes=10]
import { Traffic, gapBetween } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { MSI, gantryIndexAt, gantryS } from '../src/msi.js';
import { KMH } from '../src/util.js';

const [lanes = 3, density = 14, closedLane = 0, minutes = 10] = process.argv.slice(2).map(Number);
CONFIG.lanes = lanes;
for (const [k, v] of Object.entries(process.env)) if (k.startsWith('CFG_')) CONFIG[k.slice(4)] = +v;
const tr = new Traffic({ dir: 1, density, ahead: 1500, behind: 1500, seed: 7, limitKmh: 100 });
tr.initialFill(0, null);
const msi = new MSI(tr);
if (!process.env.NOMSI) tr.msi = msi;
const c = tr.addClosure(closedLane, 700, 1400);
const dt = 1 / 30;
let crashes = new Set(), emerg = new Set(), maxStuck = 0;
const stuck = new Map();
let passedInside = 0, through = 0;
const seen = new Set();
const crashLog = [];
for (let i = 0; i < (minutes * 60) / dt; i++) {
  tr.step(dt, 0, null);
  msi.update(dt, 0);
  for (const list of tr.lanes) for (let k = 1; k < list.length; k++) if (gapBetween(list[k], list[k - 1]) < -0.2) {
    const key = list[k].id + ':' + list[k - 1].id;
    if (!crashes.has(key)) crashLog.push(`t ${tr.time.toFixed(1)} ${list[k].type}#${list[k].id} (lane ${list[k].lane} ${list[k].state}) into ${list[k - 1].type}#${list[k - 1].id} (lane ${list[k - 1].lane} ${list[k - 1].state}) at s ${Math.round(list[k].u)}`);
    crashes.add(key);
  }
  for (const v of tr.vehicles) {
    if (v.u > 1500 && !seen.has(v.id)) { seen.add(v.id); through++; }
    if (v.acc < -6 && !emerg.has(v.id)) { emerg.add(v.id); if (emerg.size <= 6) console.log(`  EMERG t ${tr.time.toFixed(1)} ${v.drives || v.type}#${v.id} lane ${v.lane} ${v.state}->${v.targetLane} s ${Math.round(v.u)} v ${Math.round(v.v * 3.6)}`); }
    if (v.lane === closedLane && v.v < 1 && v.u < c.s0 && v.u > c.s0 - 300) stuck.set(v.id, (stuck.get(v.id) || 0) + dt);
    else stuck.delete(v.id);
    if (v.lane === closedLane && v.u > c.s0 && v.u < c.s1 && v.state === 'none') passedInside++;
  }
  for (const t of stuck.values()) maxStuck = Math.max(maxStuck, t);
  if (i % (60 / dt) === 0 && i > 0) {
    const band = (a, b) => { const vs = tr.vehicles.filter((v) => v.u > a && v.u < b); return vs.length ? Math.round(vs.reduce((x, v) => x + v.v, 0) / vs.length / KMH) + ` (${vs.length})` : '–'; };
    const faces = [];
    for (let g = gantryIndexAt(-1400); g <= gantryIndexAt(1500); g++) {
      const f = msi.faces.get(g);
      faces.push(`${Math.round(gantryS(g))}:${f ? f.map((x) => (x.face === '' ? '·' : x.face) + (x.flash ? '*' : '')).reverse().join('|') : '·'}`);
    }
    const perLane = [...Array(lanes).keys()].map((l) => { const vs = tr.vehicles.filter((v) => v.lane === l && v.u > 0 && v.u < 700); return vs.length ? Math.round(vs.reduce((x, v) => x + v.v, 0) / vs.length / KMH) : '–'; }).join('/');
    console.log(`        through the closure last minute: ${through} vehicles · 0..700 per lane (right first) ${perLane} km/h`);
    through = 0;
    console.log(`${(tr.time / 60).toFixed(0).padStart(2)} min  speed -1000..-500 ${band(-1000, -500)}  -500..0 ${band(-500, 0)}  0..700 ${band(0, 700)}  past ${band(1400, 1500)}`);
    console.log(`        signs (left lane first): ${faces.join('  ')}`);
  }
}
console.log(`collisions ${crashes.size} · emergency stops ${emerg.size} · longest stop at the closure ${maxStuck.toFixed(0)} s · steps inside the closure ${passedInside}`);
for (const l of crashLog.slice(0, 6)) console.log('  ' + l);
