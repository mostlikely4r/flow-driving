// On-ramp check (F-20 slice 1): traffic on an acceleration strip merging into
// lane 0, measured headless. Reports where and how fast cars merge, the gaps
// they accept, what it costs the new follower in lane 0, stops at the end of
// the strip, throughput past the ramp, and any collisions.
// Usage: node tools/onramp.js [lanes=3] [density=12] [perMin=6] [minutes=10] [seed=7]
// CFG_<key>=<value> env overrides, as in tools/closure.js.
import { Traffic, followerIn, gapBetween, leaderIn } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { ARCHETYPES } from '../src/archetypes.js';
import { KMH } from '../src/util.js';

const [lanes = 3, density = 12, perMin = 6, minutes = 10, seed = 7] = process.argv.slice(2).map(Number);
CONFIG.lanes = lanes;
for (const [k, v] of Object.entries(process.env)) if (k.startsWith('CFG_')) CONFIG[k.slice(4)] = +v;

const started = Date.now();
const RAMP_S = 700; // where cars appear, relative to the (fixed) player position
const tr = new Traffic({ dir: 1, density, ahead: 1500, behind: 1500, seed, limitKmh: 100 });
tr.initialFill(0, null);
const ramp = tr.addRamp(RAMP_S, { perMin });
const s1 = ramp.s1;
const THROUGH_S = s1 + 200;

const pct = (a, p) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.max(0, Math.round((b.length - 1) * p)))];
};
const fmt = (x, d = 0) => (x == null ? '–' : x.toFixed(d));

// ---- collected results
const merges = []; // {pos, kmh, dv, frontS, backS, who}
const byWho = new Map(); // label -> {n, pos: [], dv: []}
const stops = { n: 0, longest: 0 };
const braking = []; // min acc of the new follower in the 5 s after a merge
const watches = []; // {veh, until, min}
let movedLeft = 0;
let through = 0;
const crashes = new Set();
const crashLog = [];
const emerg = new Set();
let outsideSpan = 0;
let intoStrip = 0;
const lastLane = new Map();
const lastS = new Map();
const stopT = new Map();

const speedA = { sum: 0, t: 0 }; // lane 0, the 200 m before the strip end
const speedB = { sum: 0, t: 0 }; // lane 0, 1 km upstream

const dt = 1 / 30;
const steps = Math.round((minutes * 60) / dt);
for (let i = 0; i < steps; i++) {
  tr.step(dt, 0, null);

  // ---- collisions, in every lane list and on the strip
  for (const list of [...tr.lanes, tr.strip]) {
    for (let k = 1; k < list.length; k++) {
      if (gapBetween(list[k], list[k - 1]) >= -0.2) continue;
      const key = list[k].id + ':' + list[k - 1].id;
      if (crashes.has(key)) continue;
      crashes.add(key);
      if (crashLog.length < 6) crashLog.push(`t ${tr.time.toFixed(1)} ${list[k].type}#${list[k].id} (lane ${list[k].lane} ${list[k].state}) into ${list[k - 1].type}#${list[k - 1].id} at s ${Math.round(list[k].u)}`);
    }
  }

  const stripSignalling = tr.vehicles.some((v) => v.lane === -1 && v.state !== 'none');

  for (const veh of tr.vehicles) {
    const s = tr.dir * veh.u;
    if (veh.acc < -6 && !emerg.has(veh.id)) {
      emerg.add(veh.id);
      if (emerg.size <= 6) console.log(`  EMERG t ${tr.time.toFixed(1)} ${veh.drives || veh.type}#${veh.id} lane ${veh.lane} ${veh.state}->${veh.targetLane} s ${Math.round(s)} v ${Math.round(veh.v * 3.6)}`);
    }

    const prev = lastLane.get(veh.id);
    const wasS = lastS.get(veh.id);

    // ---- the merge itself: the lane index flips from -1 to 0
    if (prev === -1 && veh.lane === 0) {
      const nl = leaderIn(tr.lanes[0], veh);
      const nf = followerIn(tr.lanes[0], veh);
      const near = tr.vehicles.filter((o) => o !== veh && o.lane === 0 && Math.abs(tr.dir * o.u - s) <= 150);
      const dv = near.length ? (veh.v - near.reduce((x, o) => x + o.v, 0) / near.length) / KMH : 0;
      const frontS = nl ? gapBetween(nl, veh) / Math.max(veh.v, 1) : null;
      const backS = nf ? gapBetween(veh, nf) / Math.max(nf.v, 1) : null;
      const who = veh.drives ? ARCHETYPES[veh.drives].name : veh.type;
      const m = { pos: s - ramp.s0, kmh: veh.v / KMH, dv, frontS, backS, who };
      merges.push(m);
      const w = byWho.get(who) || { n: 0, pos: [], dv: [] };
      w.n++;
      w.pos.push(m.pos);
      w.dv.push(dv);
      byWho.set(who, w);
      if (nf && nf !== veh) watches.push({ veh: nf, until: tr.time + 5, min: 0 });
    }

    // ---- no car may move INTO the strip, and none may be on it outside a span
    if (veh.lane === -1) {
      if (prev != null && prev !== -1) intoStrip++;
      if (!tr.ramps.some((r) => s >= r.s0 - 60 && s <= r.s1 + 60)) outsideSpan++;
    }

    // ---- a car stopped at the end of the strip, waiting for a gap
    if (veh.lane === -1 && veh.v < 1) stopT.set(veh.id, (stopT.get(veh.id) || 0) + dt);
    else if (stopT.has(veh.id)) {
      const d = stopT.get(veh.id);
      stopT.delete(veh.id);
      if (d > 1) {
        stops.n++;
        stops.longest = Math.max(stops.longest, d);
      }
    }

    // ---- lane-0 cars moving left before the strip end while a merger signals
    if (prev === 0 && veh.lane === 1 && s > s1 - 300 && s < s1 && stripSignalling) movedLeft++;

    // ---- throughput past the strip
    if (wasS != null && wasS < THROUGH_S && s >= THROUGH_S) through++;
    lastS.set(veh.id, s);
    lastLane.set(veh.id, veh.lane);
  }

  // ---- the new follower's braking, 5 s after each merge
  for (let k = watches.length - 1; k >= 0; k--) {
    const w = watches[k];
    w.min = Math.min(w.min, w.veh.acc);
    if (tr.time >= w.until || !tr.vehicles.includes(w.veh)) {
      braking.push(w.min);
      watches.splice(k, 1);
    }
  }

  // ---- lane-0 speed near the ramp vs. upstream
  for (const v of tr.vehicles) {
    if (v.lane !== 0) continue;
    const s = tr.dir * v.u;
    if (s > s1 - 200 && s < s1) {
      speedA.sum += v.v * dt;
      speedA.t += dt;
    } else if (s > s1 - 1200 && s < s1 - 1000) {
      speedB.sum += v.v * dt;
      speedB.t += dt;
    }
  }
}
for (const d of stopT.values()) if (d > 1) {
  stops.n++;
  stops.longest = Math.max(stops.longest, d);
}

// ---- report
const pos = merges.map((m) => m.pos);
const kmh = merges.map((m) => m.kmh);
const dvs = merges.map((m) => m.dv);
const front = merges.map((m) => m.frontS).filter((x) => x != null);
const back = merges.map((m) => m.backS).filter((x) => x != null);
const under2 = braking.filter((a) => a < -2).length;
const under4 = braking.filter((a) => a < -4).length;
const med = (a) => pct(a, 0.5);

console.log(`on-ramp check · ${lanes} lanes · density ${density} · ${perMin}/min · seed ${seed} · ${minutes} min\n`);
console.log(`merges ${merges.length} · stops at the end ${stops.n} (longest ${stops.longest.toFixed(0)} s) · collisions ${crashes.size} · emergency stops ${emerg.size}`);
console.log(`position on the strip   p10 ${fmt(pct(pos, 0.1))} m · p50 ${fmt(pct(pos, 0.5))} m · p90 ${fmt(pct(pos, 0.9))} m   (from s0, strip ${CONFIG.rampStripM} m)`);
console.log(`speed at the merge      p10 ${fmt(pct(kmh, 0.1))} · p50 ${fmt(pct(kmh, 0.5))} · p90 ${fmt(pct(kmh, 0.9))} km/h`);
console.log(`speed difference        p10 ${fmt(pct(dvs, 0.1))} · p50 ${fmt(pct(dvs, 0.5))} · p90 ${fmt(pct(dvs, 0.9))} km/h   (to lane 0 there)`);
console.log(`front gap accepted      p10 ${fmt(pct(front, 0.1), 1)} · p50 ${fmt(pct(front, 0.5), 1)} · p90 ${fmt(pct(front, 0.9), 1)} s`);
console.log(`back gap accepted       p10 ${fmt(pct(back, 0.1), 1)} · p50 ${fmt(pct(back, 0.5), 1)} · p90 ${fmt(pct(back, 0.9), 1)} s`);

console.log('\nby persona');
const rows = [...byWho.entries()].sort((a, b) => b[1].n - a[1].n);
for (const [who, w] of rows) {
  console.log(`  ${who.padEnd(14)} ${String(w.n).padStart(3)} merges · pos ${fmt(med(w.pos))} m · dv ${fmt(med(w.dv))} km/h`);
}
if (!rows.length) console.log('  (no merges)');

console.log('\neffect on lane 0');
console.log(`  new follower braking   median ${fmt(med(braking), 1)} m/s² · ${under2} under −2 (${braking.length ? Math.round((100 * under2) / braking.length) : 0}%) · ${under4} under −4`);
console.log(`  lane-0 cars that moved left before the strip end  ${movedLeft}`);
const meanA = speedA.t ? speedA.sum / speedA.t / KMH : null;
const meanB = speedB.t ? speedB.sum / speedB.t / KMH : null;
console.log(`  lane-0 mean speed      200 m before the end ${fmt(meanA)} km/h · 1 km upstream ${fmt(meanB)} km/h${meanA != null && meanB != null ? ` (${fmt(meanA - meanB, 1)})` : ''}`);
console.log(`throughput past s1+200   ${(through / minutes).toFixed(0)} veh/min`);

console.log(`\nchecks: lane −1 outside a ramp span ${outsideSpan} · cars moving into lane −1 ${intoStrip}`);
for (const l of crashLog) console.log('  ' + l);
console.log(`run time ${Math.round((Date.now() - started) / 1000)} s`);
