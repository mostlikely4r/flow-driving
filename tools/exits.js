// Exit check (F-21): cars leaving the motorway, measured headless.
//
// Reports section 3 of docs/specs/F-21-exits.md: how many exiters leave and how
// many miss, how early they are in lane 0 for good, whether their indicator was
// on before they crossed, the speed they cross at against lane 0 there, what it
// costs the cars behind, and whether anything stops on the exit lane.
//
// One junction's exit, placed so its lane starts 1000 m ahead of a fixed player
// and its roll window (2500–1000 m before that) lies inside the 1500 m behind
// you, exactly as in free play. `--share=0` is the control run: the same road
// and the same seed, with nobody leaving.
//
// Usage: node tools/exits.js [--lanes=3] [--density=8] [--seed=7] [--min=10] [--share=0.12] [--json]
// CFG_<key>=<value> env overrides, as in tools/onramp.js.
import { Traffic, followerIn, gapBetween, leaderIn } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { junction } from '../src/junctions.js';
import { KMH } from '../src/util.js';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const asJson = argv.includes('--json');
const lanes = Number(arg('lanes', 3));
const density = Number(arg('density', 8));
const seed = Number(arg('seed', 7));
const minutes = Number(arg('min', 10));
const share = Number(arg('share', CONFIG.exitShare));
CONFIG.lanes = lanes;
for (const [k, v] of Object.entries(process.env)) if (k.startsWith('CFG_')) CONFIG[k.slice(4)] = +v;

const started = Date.now();
const PLAYER_S = 0; // the player does not drive: this measures the traffic around a point
const START_AHEAD = 1000; // the exit lane begins this far ahead of you
const tr = new Traffic({ dir: 1, density, ahead: 2000, behind: 1500, seed, limitKmh: 100 });
tr.initialFill(PLAYER_S, null);
// junction(0) with its exit lane moved to where the measurement wants it: the
// same 200 m lane, 80 m taper and 305 m exit road, no new geometry.
const j0 = junction(0);
const shift = PLAYER_S + START_AHEAD - j0.exitStart;
const j = {
  ...j0,
  exitStart: j0.exitStart + shift,
  exitGore: j0.exitGore + shift,
  exitTop: j0.exitTop + shift,
};
const x = tr.addExit(j, share > 0 ? { share } : { share: 0, truckShare: 0 });

const dt = 1 / 30;
const steps = Math.round((minutes * 60) / dt);
const pct = (a, p) => {
  if (!a.length) return null;
  const b = [...a].sort((u, v) => u - v);
  return b[Math.min(b.length - 1, Math.max(0, Math.round((b.length - 1) * p)))];
};
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d));

const seen = new Set(); // every car that ever held this exit
const rollAt = new Map(); // id -> s where it was rolled (its window entry)
const lastNot0 = new Map(); // id -> the last s at which it was not in lane 0
const crossed = new Set(); // ids that got properly onto the exit lane
const early = []; // m before exitStart at which an exiter was in lane 0 for good
const sigOn = []; // s of indicator before it started across
const crossKmh = [];
const lane0There = [];
const crossDiff = [];
const watches = []; // {veh, until, min, idx}
const braking = []; // per crossing: min acc of the cars behind it
let rollCount = 0;
const stops = { n: 0, longest: 0 };
const missByLane = []; // the lane a missed exiter was in when it gave up
const stopState = new Map();
let queueMax = 0;
let queueSum = 0;
let queueN = 0;
const crashes = new Set();
const crashLog = [];
const emerg = new Set();
const speedNear = { sum: 0, t: 0 };
let vehiclesSum = 0;
let vehiclesN = 0;

const lane0SpeedAt = (s) => {
  let sum = 0;
  let n = 0;
  for (const c of tr.lanes[0]) {
    if (c.isObstacle) continue;
    if (Math.abs(tr.dir * c.u - s) > 60) continue;
    sum += c.v;
    n++;
  }
  return n ? sum / n : null;
};

for (let i = 0; i < steps; i++) {
  tr.step(dt, PLAYER_S, null);
  vehiclesSum += tr.vehicles.length;
  vehiclesN++;

  // nobody may overlap anybody, in any lane or on the strip
  for (const list of [...tr.lanes, tr.strip]) {
    for (let k = 1; k < list.length; k++) {
      if (gapBetween(list[k], list[k - 1]) >= -0.2) continue;
      const key = `${list[k].id}:${list[k - 1].id}`;
      if (crashes.has(key)) continue;
      crashes.add(key);
      if (crashLog.length < 6) {
        crashLog.push(`t ${tr.time.toFixed(1)} ${list[k].type}#${list[k].id} (lane ${list[k].lane} ${list[k].state}) ` +
          `into ${list[k - 1].type}#${list[k - 1].id} at s ${Math.round(tr.dir * list[k].u)}`);
      }
    }
  }

  let queue = 0;
  for (const veh of tr.vehicles) {
    const s = tr.dir * veh.u;
    if (veh.acc < -6 && !emerg.has(veh.id)) emerg.add(veh.id);
    if (veh.exit && !seen.has(veh.id)) {
      seen.add(veh.id);
      rollCount++;
      rollAt.set(veh.id, s);
      if (veh.lane !== 0) lastNot0.set(veh.id, s);
    }
    // a car that held this exit and no longer does, without having crossed
    if (seen.has(veh.id) && !veh.exit && !veh.exitDone && missByLane[veh.id] == null) missByLane[veh.id] = veh.lane;
    if (!veh.exit) continue;
    // where it was last outside lane 0: from there on it was in lane 0 for good
    if (veh.lane !== 0 && !veh.exitDone) lastNot0.set(veh.id, s);
    // properly across (a called-off move reverses, and does not count)
    if (veh.exitDone && !crossed.has(veh.id)) {
      crossed.add(veh.id);
      const c = veh.exitCross || { s, v: veh.v };
      early.push(x.sStart - (lastNot0.get(veh.id) ?? rollAt.get(veh.id) ?? c.s));
      sigOn.push(veh.signalT);
      crossKmh.push(c.v / KMH);
      const l0 = lane0SpeedAt(c.s);
      if (l0 != null) {
        lane0There.push(l0 / KMH);
        crossDiff.push((c.v - l0) / KMH);
      }
      // what it costs the cars behind: the lane-0 follower, and the exit-lane one
      const idx = braking.length;
      braking.push(0);
      let any = false;
      for (const nf of [followerIn(tr.lanes[0], veh), followerIn(tr.strip, veh)]) {
        if (!nf || nf === veh || nf.isObstacle) continue;
        if (gapBetween(veh, nf) > 120) continue;
        watches.push({ veh: nf, until: tr.time + 5, min: 0, idx });
        any = true;
      }
      if (!any) braking[idx] = null;
    }
    // a car standing still on the exit lane (before the gore) is a queue spilling
    // back onto the motorway, not a queue at the give-way
    if (veh.lane === -1 && s < x.sGore && veh.v < 1) {
      const st = stopState.get(veh.id) || { t: 0, s };
      st.t += dt;
      st.s = s;
      stopState.set(veh.id, st);
    } else if (stopState.has(veh.id)) {
      const st = stopState.get(veh.id);
      stopState.delete(veh.id);
      if (st.t > 1) {
        stops.n++;
        stops.longest = Math.max(stops.longest, st.t);
      }
    }
    if (veh.lane === -1 && s > x.sGore) queue++;
  }
  queueMax = Math.max(queueMax, queue);
  queueSum += queue;
  queueN++;

  // what the cars behind an exit are doing, 5 s after it crossed
  for (let k = watches.length - 1; k >= 0; k--) {
    const w = watches[k];
    if (!tr.vehicles.includes(w.veh)) {
      watches.splice(k, 1);
      continue;
    }
    w.min = Math.min(w.min, w.veh.acc);
    if (tr.time >= w.until) {
      if (braking[w.idx] != null) braking[w.idx] = Math.min(braking[w.idx], w.min);
      watches.splice(k, 1);
    }
  }
  // lane 0 through the exit lane: from 300 m before it opens to the gore
  for (const v of tr.lanes[0]) {
    if (v.isObstacle) continue;
    const s = tr.dir * v.u;
    if (s > x.sStart - 300 && s < x.sGore) {
      speedNear.sum += v.v * dt;
      speedNear.t += dt;
    }
  }
}
for (const st of stopState.values()) if (st.t > 1) { stops.n++; stops.longest = Math.max(stops.longest, st.t); }

const exited = x.taken + x.missed;
const missedShare = exited ? x.missed / exited : null;
const brakeMin = braking.filter((b) => b != null);
const under2 = brakeMin.filter((a) => a < -2).length;
const under4 = brakeMin.filter((a) => a < -4).length;
const meanNear = speedNear.t ? speedNear.sum / speedNear.t / KMH : null;
const meanVeh = vehiclesN ? vehiclesSum / vehiclesN : null;

console.log(`exit check · ${lanes} lanes · density ${density} · share ${share} · seed ${seed} · ${minutes} min\n`);
const byLane = [0, 1, 2, 3, 4].slice(0, lanes).map((l) => missByLane.filter((v) => v === l).length);
console.log(`exiters ${rollCount} rolled · ${x.taken} taken · ${x.missed} missed (${fmt(missedShare * 100, 1)}%)` +
  (x.missed ? ` · by lane where it gave up ${byLane.join('/')}` : ''));
console.log(`in lane 0 for good   p10 ${fmt(pct(early, 0.1))} m · p50 ${fmt(pct(early, 0.5))} m · p90 ${fmt(pct(early, 0.9))} m   (before exitStart)`);
console.log(`right indicator      min ${fmt(Math.min(...sigOn), 1)} s · p10 ${fmt(pct(sigOn, 0.1), 1)} s · p50 ${fmt(pct(sigOn, 0.5), 1)} s   (on before it starts across)`);
console.log(`speed across         p10 ${fmt(pct(crossKmh, 0.1))} · p50 ${fmt(pct(crossKmh, 0.5))} km/h`);
console.log(`lane 0 there         p50 ${fmt(pct(lane0There, 0.5))} km/h · difference p50 ${fmt(pct(crossDiff, 0.5), 1)} km/h`);
console.log(`lane 0 through it    ${fmt(meanNear)} km/h mean over sStart − 300 .. sGore`);
console.log(`follower braking     ${brakeMin.length ? `${under2} under −2 (${Math.round((100 * under2) / brakeMin.length)}%) · ${under4} under −4 (${Math.round((100 * under4) / brakeMin.length)}%)` : '– (nobody behind)'}`);
console.log(`collisions ${crashes.size} · emergency stops ${emerg.size} · stops on the exit lane ${stops.n}${stops.n ? ` (longest ${stops.longest.toFixed(1)} s)` : ''}`);
console.log(`queue at the top     max ${queueMax} · mean ${fmt(queueN ? queueSum / queueN : null, 2)}`);
console.log(`vehicles in range    ${fmt(meanVeh, 1)}`);
for (const l of crashLog) console.log('  ' + l);
console.log(`run time ${Math.round((Date.now() - started) / 1000)} s`);

if (asJson) {
  console.log('JSON ' + JSON.stringify({
    params: { lanes, density, seed, minutes, share },
    rolled: rollCount,
    taken: x.taken,
    missed: x.missed,
    exited,
    missedShare,
    early10: pct(early, 0.1),
    early50: pct(early, 0.5),
    early90: pct(early, 0.9),
    sigMin: sigOn.length ? Math.min(...sigOn) : null,
    sig10: pct(sigOn, 0.1),
    cross10: pct(crossKmh, 0.1),
    cross50: pct(crossKmh, 0.5),
    lane0There50: pct(lane0There, 0.5),
    crossDiff50: pct(crossDiff, 0.5),
    lane0Near: meanNear,
    brakeN: brakeMin.length,
    brakeUnder2: under2,
    brakeUnder4: under4,
    collisions: crashes.size,
    emergency: emerg.size,
    stops: stops.n,
    queueMax,
    queueMean: queueN ? queueSum / queueN : null,
    meanVehicles: meanVeh,
  }));
}
