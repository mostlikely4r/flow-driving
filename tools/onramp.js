// On-ramp check (F-20): traffic on an acceleration strip merging into lane 0,
// measured headless. Reports where and how fast cars merge, the gaps they
// accept, what it costs the new follower in lane 0, stops at the end of the
// strip, throughput past the ramp, any collisions, and the slice-3 courtesy
// reading (does lane 0 make room for a committing merger, and does the merger
// use it). With `road` > 0 the cars come down a ramp road first (the junction
// of slice 2); `road=0` is slice 1.
// Usage: node tools/onramp.js [lanes=3] [density=12] [perMin] [minutes=10] [seed=7] [road]
//   perMin only wins over CONFIG.rampPerMin when it is on the command line.
//   `--json` adds one machine-readable line (used by tools/onrampsuite.js).
// CFG_<key>=<value> env overrides, as in tools/closure.js.
import { Traffic, followerIn, gapBetween, idm, leaderIn } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { ARCHETYPES } from '../src/archetypes.js';
import { KMH } from '../src/util.js';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const [lanes = 3, density = 12, perMinArg, minutes = 10, seed = 7, roadArg] = argv.filter((a) => a !== '--json').map(Number);
CONFIG.lanes = lanes;
for (const [k, v] of Object.entries(process.env)) if (k.startsWith('CFG_')) CONFIG[k.slice(4)] = +v;
const roadM = Number.isFinite(roadArg) ? roadArg : CONFIG.rampRoadM;
const perMin = Number.isFinite(perMinArg) ? perMinArg : CONFIG.rampPerMin;

const started = Date.now();
const RAMP_S = 700; // the ramp top (where cars appear), relative to the (fixed) player position
const tr = new Traffic({ dir: 1, density, ahead: 1500, behind: 1500, seed, limitKmh: 100 });
tr.initialFill(0, null);
// A command-line perMin is the only one that wins; otherwise CONFIG decides
// (so CFG_rampPerMin works — before slice 3 it silently did nothing).
const ramp = tr.addRamp(RAMP_S, { ...(Number.isFinite(perMinArg) ? { perMin: perMinArg } : {}), roadM });
const s0 = ramp.s0;
const s1 = ramp.s1;
// The sim spans 1500 m ahead of s 0 and despawns cars 250 m past that, so a
// throughput line at s1+200 reads 0 for a strip over ~600 m. Count at the
// latest line that is inside the span instead and say so, rather than
// reporting a false collapse. (Raising `ahead` to fix it changes the whole
// run: it moves where cars ahead are spawned, so the numbers stop being the
// same experiment.)
const SPAN_END = tr.ahead + 250;
const THROUGH_WANT = s1 + 200;
const THROUGH_S = Math.min(THROUGH_WANT, SPAN_END - 100);
const throughBlind = THROUGH_S < THROUGH_WANT || THROUGH_S < s1;

// how the ramp top behaves: inserted, blocked (no gap), or held (you were close)
const spawns = { ok: 0, blocked: 0, held: 0 };
const spawnOrig = tr.spawnFromRamp.bind(tr);
tr.spawnFromRamp = (r) => {
  const v = spawnOrig(r);
  if (v) spawns.ok++;
  else spawns.blocked++;
  return v;
};
const heldState = new Map(); // ramp -> was it held last tick
const rampRoad = new Map(); // id -> { t, s } when the car appeared at the top
const rampTimes = [];
const s0kmh = [];

const pct = (a, p) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.max(0, Math.round((b.length - 1) * p)))];
};
const fmt = (x, d = 0) => (x == null ? '–' : x.toFixed(d));

// ---- collected results
const merges = []; // {pos, kmh, dv, frontS, backS, who, runout}
const byWho = new Map(); // label -> {n, pos: [], dv: [], kmh: []}
// A stop is a car on lane -1 past s0 under 1 m/s for over a second. Where it
// stood matters (slice 4): on the strip, on the run-out, or right at the hard
// end of lane -1, where a queue that only moved 150 m would show up.
const stops = { n: 0, longest: 0, strip: 0, runout: 0, hardEnd: 0 };
const countStop = (st) => {
  stops.n++;
  stops.longest = Math.max(stops.longest, st.t);
  const r = st.ramp;
  if (!r) return;
  if (st.s <= r.s1) stops.strip++;
  else stops.runout++;
  if (st.s >= (r.sEnd ?? r.s1) - 30) stops.hardEnd++;
};
let mergesRunout = 0;
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
const stopState = new Map(); // id -> { t, s, ramp } while it stands still

// ---- courtesy reading (slice 3 step 1). For a signalling strip car past s0
// the lane-0 car alongside or up to 30 m behind it is the one that can make
// room. madeRoom: that car moved 0→1, or lifted off below its free-road IDM
// while the merger was alongside or ahead of it (after step 3 the explicit
// veh.roomFor is read instead of inferring the lift). usedRoom: the merger
// merged within 8 s of that, in front of where the car was.
let madeRoom = 0;
let usedRoom = 0;
const roomMade = new Map(); // merger id -> { carId, t, s } when room was made
const roomHeld = new Map(); // "merger:car" -> last time this pair made room

// ---- gate reading (slice 3 step 1): seconds a strip car spends past s0 with
// mergeReady false, split by whether it is faster or slower than the speed it
// compares itself with.
const gate = { faster: 0, slower: 0 };

const speedA = { sum: 0, t: 0 }; // lane 0, the 200 m before the strip end
const speedB = { sum: 0, t: 0 }; // lane 0, 1 km upstream

const dt = 1 / 30;
const steps = Math.round((minutes * 60) / dt);
for (let i = 0; i < steps; i++) {
  tr.step(dt, 0, null);
  for (const r of tr.ramps) {
    if (r.held && !heldState.get(r)) spawns.held++;
    heldState.set(r, r.held);
  }

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

  // ---- courtesy: who could make room for a committing merger, and who did
  for (const m of tr.vehicles) {
    if (m.lane !== -1 || m.state === 'none' || m.isPlayer) continue;
    const sm = tr.dir * m.u;
    if (sm < s0) continue;
    let car = null;
    let carS = -Infinity;
    for (const c of tr.lanes[0]) {
      if (c.isPlayer || c.isObstacle) continue;
      const sc = tr.dir * c.u;
      if (sc >= sm - m.len - 30 && sc <= sm + 2 && sc > carS) {
        car = c;
        carS = sc;
      }
    }
    if (!car) continue;
    const moved = lastLane.get(car.id) === 0 && car.lane === 1;
    const lifted = car.acc < idm(car, null) - 0.3 && sm >= carS - car.len;
    const explicit = car.roomFor === m.id;
    if (!moved && !lifted && !explicit) continue;
    const key = m.id + ':' + car.id;
    const last = roomHeld.get(key);
    if (last == null || tr.time - last > 3) madeRoom++;
    roomHeld.set(key, tr.time);
    roomMade.set(m.id, { carId: car.id, t: tr.time, s: carS });
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

    // ---- the merge gate: which side binds, faster or slower than lane 0
    if (veh.lane === -1 && s >= s0 && !tr.mergeReady(veh, tr.closedAhead(-1, s))) {
      if (veh.v > tr.mergeSpeed(veh)) gate.faster += dt;
      else gate.slower += dt;
    }

    // ---- how long the ramp road takes, and the speed at the end of it
    if (veh.lane === -1 && roadM > 0 && !rampRoad.has(veh.id) && s <= ramp.sTop + 5) rampRoad.set(veh.id, { t: tr.time, s });
    const came = rampRoad.get(veh.id);
    if (came && wasS != null && wasS < s0 && s >= s0) {
      rampTimes.push(tr.time - came.t);
      s0kmh.push(veh.v / KMH);
      rampRoad.delete(veh.id);
    }

    // ---- the merge itself: the lane index flips from -1 to 0
    if (prev === -1 && veh.lane === 0) {
      const nl = leaderIn(tr.lanes[0], veh);
      const nf = followerIn(tr.lanes[0], veh);
      const near = tr.vehicles.filter((o) => o !== veh && o.lane === 0 && Math.abs(tr.dir * o.u - s) <= 150);
      const dv = near.length ? (veh.v - near.reduce((x, o) => x + o.v, 0) / near.length) / KMH : 0;
      const frontS = nl ? gapBetween(nl, veh) / Math.max(veh.v, 1) : null;
      const backS = nf ? gapBetween(veh, nf) / Math.max(nf.v, 1) : null;
      const who = veh.drives ? ARCHETYPES[veh.drives].name : veh.type;
      const r = veh.ramp || ramp;
      const runout = s > r.s1;
      if (runout) mergesRunout++;
      const m = { pos: s - r.s0, kmh: veh.v / KMH, dv, frontS, backS, who, runout };
      merges.push(m);
      const w = byWho.get(who) || { n: 0, pos: [], dv: [], kmh: [] };
      w.n++;
      w.pos.push(m.pos);
      w.dv.push(dv);
      w.kmh.push(m.kmh);
      byWho.set(who, w);
      if (nf && nf !== veh) watches.push({ veh: nf, until: tr.time + 5, min: 0 });
      const rm = roomMade.get(veh.id);
      if (rm && tr.time - rm.t <= 8 && s > rm.s) usedRoom++;
    }

    // ---- no car may move INTO the strip, and none may be on it outside a span
    if (veh.lane === -1) {
      if (prev != null && prev !== -1) intoStrip++;
      if (!tr.ramps.some((r) => s >= r.sTop - 60 && s <= (r.sEnd ?? r.s1) + 60)) outsideSpan++;
    }

    // ---- a car stopped on lane -1, waiting for a gap: where, and for how long
    if (veh.lane === -1 && veh.v < 1) {
      const st = stopState.get(veh.id) || { t: 0, s, ramp: veh.ramp };
      st.t += dt;
      st.s = s;
      stopState.set(veh.id, st);
    } else if (stopState.has(veh.id)) {
      const st = stopState.get(veh.id);
      stopState.delete(veh.id);
      if (st.t > 1) countStop(st);
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
for (const st of stopState.values()) if (st.t > 1) countStop(st);

// ---- report
const pos = merges.map((m) => m.pos);
const kmh = merges.map((m) => m.kmh);
const dvs = merges.map((m) => m.dv);
const front = merges.map((m) => m.frontS).filter((x) => x != null);
const back = merges.map((m) => m.backS).filter((x) => x != null);
const under2 = braking.filter((a) => a < -2).length;
const under4 = braking.filter((a) => a < -4).length;
const med = (a) => pct(a, 0.5);
const stopsPerMerge = merges.length ? stops.n / merges.length : null;
const meanA = speedA.t ? speedA.sum / speedA.t / KMH : null;
const meanB = speedB.t ? speedB.sum / speedB.t / KMH : null;
const throughPerMin = through / minutes;

console.log(`on-ramp check · ${lanes} lanes · density ${density} · ${perMin}/min · seed ${seed} · ${minutes} min · ramp road ${roadM} m\n`);
console.log(`merges ${merges.length} (${mergesRunout} on the run-out) · stops ${stops.n} (longest ${stops.longest.toFixed(0)} s) · collisions ${crashes.size} · emergency stops ${emerg.size}`);
console.log(`stops by place        strip ${stops.strip} · run-out ${stops.runout} · hard end ${stops.hardEnd}`);
console.log(`stops per merge         ${stopsPerMerge == null ? '–' : stopsPerMerge.toFixed(2)} (1 in ${stops.n ? (merges.length / stops.n).toFixed(1) : '–'})`);
console.log(`ramp road               time top → s0 p10 ${fmt(pct(rampTimes, 0.1), 1)} · p50 ${fmt(pct(rampTimes, 0.5), 1)} · p90 ${fmt(pct(rampTimes, 0.9), 1)} s`);
console.log(`speed at s0             p10 ${fmt(pct(s0kmh, 0.1))} · p50 ${fmt(pct(s0kmh, 0.5))} · p90 ${fmt(pct(s0kmh, 0.9))} km/h`);
console.log(`spawns at the top       ${spawns.ok} in · ${spawns.blocked} blocked · ${spawns.held} held for you`);
console.log(`position on the strip   p10 ${fmt(pct(pos, 0.1))} m · p50 ${fmt(pct(pos, 0.5))} m · p90 ${fmt(pct(pos, 0.9))} m   (from s0, strip ${CONFIG.rampStripM} m)`);
console.log(`speed at the merge      p10 ${fmt(pct(kmh, 0.1))} · p50 ${fmt(pct(kmh, 0.5))} · p90 ${fmt(pct(kmh, 0.9))} km/h`);
console.log(`speed difference        p10 ${fmt(pct(dvs, 0.1))} · p50 ${fmt(pct(dvs, 0.5))} · p90 ${fmt(pct(dvs, 0.9))} km/h   (to lane 0 there)`);
console.log(`front gap accepted      p10 ${fmt(pct(front, 0.1), 1)} · p50 ${fmt(pct(front, 0.5), 1)} · p90 ${fmt(pct(front, 0.9), 1)} s`);
console.log(`back gap accepted       p10 ${fmt(pct(back, 0.1), 1)} · p50 ${fmt(pct(back, 0.5), 1)} · p90 ${fmt(pct(back, 0.9), 1)} s`);
console.log(`gate (s not ready)      ${fmt(gate.faster, 0)} s faster than lane 0 · ${fmt(gate.slower, 0)} s slower`);

console.log('\nby persona');
const rows = [...byWho.entries()].sort((a, b) => b[1].n - a[1].n);
for (const [who, w] of rows) {
  console.log(`  ${who.padEnd(14)} ${String(w.n).padStart(3)} merges · pos ${fmt(med(w.pos))} m · ${fmt(med(w.kmh))} km/h · dv ${fmt(med(w.dv))} km/h`);
}
if (!rows.length) console.log('  (no merges)');

console.log('\neffect on lane 0');
console.log(`  new follower braking   median ${fmt(med(braking), 1)} m/s² · ${under2} under −2 (${braking.length ? Math.round((100 * under2) / braking.length) : 0}%) · ${under4} under −4 (${braking.length ? Math.round((100 * under4) / braking.length) : 0}%)`);
console.log(`  courtesy               made room ${madeRoom} · merger used it ${usedRoom}${madeRoom ? ` (${Math.round((100 * usedRoom) / madeRoom)}%)` : ''}`);
console.log(`  all 0→1 moves near the strip end  ${movedLeft}`);
console.log(`  lane-0 mean speed      200 m before the end ${fmt(meanA)} km/h · 1 km upstream ${fmt(meanB)} km/h${meanA != null && meanB != null ? ` (${fmt(meanA - meanB, 1)})` : ''}`);
console.log(`throughput past s ${THROUGH_S}   ${throughPerMin.toFixed(0)} veh/min${throughBlind ? `   (warning: the strip ends at s ${s1}, outside the ${SPAN_END} m span — a floor, not the real flow)` : ''}`);

console.log(`\nchecks: lane −1 outside a ramp span ${outsideSpan} · cars moving into lane −1 ${intoStrip}`);
for (const l of crashLog) console.log('  ' + l);
console.log(`run time ${Math.round((Date.now() - started) / 1000)} s`);

if (asJson) {
  console.log('JSON ' + JSON.stringify({
    params: { lanes, density, perMin, minutes, seed, roadM },
    merges: merges.length,
    mergesRunout,
    mergesRunoutShare: merges.length ? mergesRunout / merges.length : 0,
    stops: stops.n,
    stopsStrip: stops.strip,
    stopsRunout: stops.runout,
    stopsHardEnd: stops.hardEnd,
    stopsPerMerge,
    collisions: crashes.size,
    emergency: emerg.size,
    positionP50: med(pos),
    speedP50: med(kmh),
    lane0Near: meanA,
    lane0Up: meanB,
    movedLeft,
    madeRoom,
    usedRoom,
    brakingUnder2: under2,
    brakingUnder4: under4,
    brakingN: braking.length,
    throughput: throughPerMin,
    throughputS: THROUGH_S,
    gateFaster: gate.faster,
    gateSlower: gate.slower,
    outsideSpan,
    intoStrip,
  }));
}
