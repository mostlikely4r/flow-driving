// Traffic simulation for one carriageway.
//
// Longitudinal: Intelligent Driver Model (IDM) with per-driver desired speed,
// time headway, acceleration and comfortable braking.
// Lateral: MOBIL lane-change model, asymmetric for Dutch rules:
//   * keep right (bias towards the right lane, except middle-lane hoggers)
//   * no overtaking on the right above ~55 km/h (you hang back behind a
//     slower car in the lane to your left)
//   * trucks stay in the two rightmost lanes; slow 'elephant races' happen
// Drivers signal before changing lanes, wait for a gap, and nearby
// cooperative drivers ease off to let a signalling car in.
//
// Positions: each vehicle has u = dir * s (so u always increases in its
// direction of travel), and lat measured outward from the median.
import { CONFIG } from './config.js';
import { KMH, mulberry32, gauss, clamp, pickWeighted, lcProfile, lcProfileDeriv } from './util.js';
import { laneLat } from './layout.js';
import { gantryIndexAt, gantryS } from './msi.js';
import { VARIANTS, TYPE_VARIANTS } from './variants.js';
import { pickPersona, applyPersona } from './archetypes.js';

const TYPE_PARAMS = {
  car: { a: 1.5, b: 2.1, s0: 2.0, Tmean: 1.25, Tsd: 0.3 },
  van: { a: 1.15, b: 2.0, s0: 2.2, Tmean: 1.35, Tsd: 0.3 },
  truck: { a: 0.45, b: 1.6, s0: 3.5, Tmean: 1.6, Tsd: 0.25 },
  caravan: { a: 0.7, b: 1.8, s0: 3.0, Tmean: 1.6, Tsd: 0.3 },
};

const EURO_RULE_MIN_SPEED = 55 * KMH;

// ---------- neighbour search in a lane list sorted by u ----------
function firstAbove(list, u) {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (list[m].u <= u) lo = m + 1;
    else hi = m;
  }
  return lo;
}
export function leaderIn(list, me) {
  for (let i = firstAbove(list, me.u); i < list.length; i++) if (list[i] !== me) return list[i];
  return null;
}
export function followerIn(list, me) {
  for (let i = firstAbove(list, me.u) - 1; i >= 0; i--) if (list[i] !== me) return list[i];
  return null;
}
/** bumper-to-bumper gap between a vehicle ahead and one behind */
export function gapBetween(ahead, behind) {
  return ahead.u - ahead.len * 0.5 - (behind.u + behind.len * 0.5);
}

/**
 * Car-following acceleration of `me` behind `lead` (lead may be null).
 * Tmul scales the time headway.
 *
 * This is Treiber & Kesting's ACC model: the IDM blended with the "constant
 * acceleration heuristic" (CAH). Plain IDM treats a car cutting in 20 m ahead
 * at nearly the same speed as an emergency and brakes up to -9 m/s². The CAH
 * asks "would I hit it if it keeps doing what it's doing?" and, if not, lets
 * the driver drop back gently. Real emergencies (a much slower car) still get
 * full braking. CONFIG.coolness = 0 gives plain IDM.
 */
export function idm(me, lead, Tmul = 1, gapOverride = null) {
  const v = me.v;
  const v0 = Math.max(me.v0, 1);
  const r = v / v0;
  let free;
  if (r <= 1) free = me.a * (1 - r * r * r * r);
  else free = -Math.min(1.6, me.b * (r - 1) * 5); // above desired speed: ease off, no slamming
  if (!lead) return free;
  // gapOverride lets a caller ask the same question about a projected gap
  // (F-38: "would this move be safe in two seconds at these speeds?")
  const g = gapOverride != null ? gapOverride : gapBetween(lead, me);
  if (g > 500) return free;
  const dv = v - lead.v;
  const sStar = me.s0 + Math.max(0, v * me.T * Tmul + (v * dv) / (2 * Math.sqrt(me.a * me.b)));
  const gg = Math.max(g, 0.3);
  const aIdm = free - me.a * (sStar / gg) * (sStar / gg);
  const c = CONFIG.coolness;
  if (!(c > 0) || aIdm >= 0) return Math.max(aIdm, -9);
  // constant-acceleration heuristic
  const vl = lead.v;
  const al = Math.min(lead.acc || 0, me.a);
  let aCah;
  // (the first case only applies to a leader that is braking; for a standing
  // obstacle it degenerates to 0 and the car would barely brake)
  if (al < -0.01 && vl * dv <= -2 * gg * al) aCah = (v * v * al) / Math.max(vl * vl - 2 * gg * al, 0.01);
  else aCah = al - (dv > 0 ? (dv * dv) / (2 * (vl < 1 ? Math.max(0.3, gg - me.s0 * 0.5) : gg)) : 0); // standing obstacle: stop short of it
  if (aIdm >= aCah) return Math.max(aIdm, -9);
  const b = me.b;
  const acc = (1 - c) * aIdm + c * (aCah + b * Math.tanh((aIdm - aCah) / b));
  return Math.max(acc, -9);
}

let NEXT_ID = 1;

export class Traffic {
  /**
   * @param {object} o
   * @param {number} o.dir +1 your direction, -1 oncoming
   * @param {number} o.density vehicles per km per lane
   * @param {number} o.ahead metres simulated ahead of the player (in s)
   * @param {number} o.behind metres simulated behind the player (in s)
   * @param {number} [o.lanes] lanes for this traffic (default CONFIG.lanes); the persona rig is smaller than the world
   */
  constructor({ dir, density, ahead, behind, seed, limitKmh, onAdd, onRemove, spawnBehind = true, lanes }) {
    this.dir = dir;
    this.spawnBehind = spawnBehind;
    this.laneCount = Math.max(1, (lanes ?? CONFIG.lanes) | 0);
    this.density = density;
    this.ahead = ahead;
    this.behind = behind;
    this.rng = mulberry32(seed);
    this.limitKmh = limitKmh;
    this.vehicles = [];
    this.lanes = [];
    this.time = 0;
    this.spawnTimer = 0;
    this.onAdd = onAdd || (() => {});
    this.onRemove = onRemove || (() => {});
    this.events = []; // lane change events etc. (for debugging/stats)
    this.closures = []; // lane closures: {lane, s0, s1, obs}
    this.ramps = []; // on-ramps (F-20): {s0, s1, obs, perMin, spawnT, retryT}
    this.strip = []; // the acceleration strip, lane -1 (F-20), rebuilt like `lanes`
    this.msi = null; // matrix signs (msi.js), if any
  }

  /**
   * Close a lane from s0 to s1 (road positions). Physically it's a block in
   * the lane (an arrow-board truck and cones at s0): drivers see it as a
   * stopped vehicle and must merge out before it.
   */
  addClosure(lane, s0, s1) {
    const obs = {
      id: -1000 - this.closures.length,
      isObstacle: true,
      type: 'obstacle',
      lane,
      targetLane: lane,
      state: 'none',
      u: this.dir * (s0 + s1) / 2,
      len: s1 - s0,
      width: 2.6,
      latLocal: laneLat(lane, this.N),
      v: 0, v0: 0, acc: 0, a: 1, b: 2, T: 1, s0: 2,
      brake: true,
      signalLane: -1,
      indicator: 0,
    };
    // the red cross goes up at the last gantry before the closure: you must be
    // out of the lane by then (stragglers zip in at the end)
    const sX = gantryS(gantryIndexAt(s0 - 60));
    const c = { lane, s0, s1, sX, obs };
    this.closures.push(c);
    // nobody can be inside the closed stretch or about to run into it
    // (normally a closure is set up out of sight)
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const s = this.dir * v.u;
      if ((v.lane === lane || v.targetLane === lane) && s > s0 - 250 && s < s1 + 5) {
        this.vehicles.splice(i, 1);
        this.onRemove(v);
      }
    }
    return c;
  }

  removeClosure(c) {
    const i = this.closures.indexOf(c);
    if (i >= 0) this.closures.splice(i, 1);
  }

  /**
   * Add an on-ramp (F-20). It is not a closure: no red cross, no matrix sign,
   * no arrow-board truck. Cars appear at s0 on the hard shoulder (lane -1, the
   * acceleration strip, "invoegstrook") and have to merge into lane 0 before
   * s1. A stopped obstacle just past s1 makes a car with no gap stop there.
   */
  addRamp(s0, { perMin = CONFIG.rampPerMin, stripM = CONFIG.rampStripM } = {}) {
    const s1 = s0 + stripM;
    const obs = {
      id: -2000 - this.ramps.length,
      isObstacle: true,
      type: 'obstacle',
      lane: -1,
      targetLane: -1,
      state: 'none',
      u: this.dir * (s1 + 10), // its nose sits at s1, the end of the strip
      len: 20,
      width: 2.4,
      latLocal: laneLat(-1, this.N),
      v: 0, v0: 0, acc: 0, a: 1, b: 2, T: 1, s0: 2,
      brake: true,
      signalLane: -1,
      indicator: 0,
    };
    const r = { s0, s1, obs, perMin, spawnT: this.rampGap(perMin), retryT: 0 };
    this.ramps.push(r);
    return r;
  }

  removeRamp(r) {
    const i = this.ramps.indexOf(r);
    if (i >= 0) this.ramps.splice(i, 1);
  }

  /** Seconds until the next car on a ramp (Poisson, mean 60 / perMin). */
  rampGap(perMin) {
    return -Math.log(1 - this.rng()) * (60 / Math.max(0.01, perMin));
  }

  /** Metres from s to the red cross over `lane` (0 once past it, inside the closure too), or Infinity. */
  crossAhead(lane, s, within = 1500) {
    let d = Infinity;
    for (const c of this.closures) {
      if (c.lane !== lane || c.s1 < s) continue;
      const x = Math.max(0, c.sX - s);
      if (x < within && x < d) d = x;
    }
    return d;
  }

  /**
   * Metres from s to the start of a closure in `lane` (0 if inside), or Infinity.
   * For lane -1 (F-20) it counts the end of the acceleration strip instead: a
   * car out of strip is in the same hurry as a car at the end of a closed lane.
   */
  closedAhead(lane, s, within = 1500) {
    let d = Infinity;
    if (lane === -1) {
      for (const r of this.ramps) {
        if (r.s1 < s) continue;
        const x = Math.max(0, r.s1 - s);
        if (x < within && x < d) d = x;
      }
      return d;
    }
    for (const c of this.closures) {
      if (c.lane !== lane || c.s1 < s) continue;
      const x = Math.max(0, c.s0 - s);
      if (x < within && x < d) d = x;
    }
    return d;
  }

  get N() {
    return this.laneCount;
  }

  setLimit(kmh) {
    this.limitKmh = kmh;
    for (const v of this.vehicles) this.applyLimit(v);
  }

  applyLimit(veh) {
    if (veh.type === 'car' || veh.type === 'van') veh.v0base = veh.limitFactor * this.limitKmh * KMH + veh.limitOffset * KMH;
    else veh.v0base = Math.min(veh.ownMax, this.limitKmh) * KMH;
  }

  // ---------------- driver generation ----------------
  makeVehicle(type, variant, persona, forcePersona = false) {
    const r = this.rng;
    const tp = TYPE_PARAMS[type];
    const meta = VARIANTS[variant];
    const veh = {
      id: NEXT_ID++,
      type,
      variant,
      len: meta.len,
      width: meta.width,
      frontLen: meta.frontLen,
      u: 0,
      v: 0,
      acc: 0,
      accPure: 0,
      lane: 0,
      targetLane: 0,
      state: 'none', // none | signal | move
      lcT: 0,
      signalT: 0,
      signalLane: -1,
      lineUp: null, // { kind: 'ahead'|'behind', lane, side, t0 }: getting into position before signalling
      noSignalT: { L: 0, R: 0 }, // re-signal pause per side (F-38)
      closureSig: false, // this signal is a lane-closure move, so it may wait longer
      indicator: 0, // -1 left, +1 right
      indOffT: 0,
      cooldown: 2 + r() * 4,
      decT: r() * 1.0,
      brake: false,
      latLocal: 0,
      latRate: 0,
      pressureT: 0,
      hogger: false,
      seed: Math.floor(r() * 1e9),
    };
    // desired speed
    veh.limitFactor = 1;
    veh.limitOffset = 0;
    veh.ownMax = 999;
    if (type === 'car' || type === 'van') {
      const x = r();
      // Most drivers set the cruise a little over the limit; at night more
      // people are in a hurry. Speeders: mostly 10-20 over, a few far more.
      const speeders = CONFIG.speeders * (this.night ? CONFIG.nightSpeeders : 1);
      if (x < speeders) {
        const y = r();
        veh.limitOffset = 10 + y * y * 35;
      } else if (x < speeders + CONFIG.slowpokes) veh.limitOffset = -9 + r() * 6;
      else veh.limitOffset = clamp(CONFIG.normalOffsetKmh + gauss(r) * CONFIG.speedSpreadKmh, -2, 12);
      if (type === 'van') veh.limitOffset = Math.min(veh.limitOffset, 6) - r() * 3;
    } else if (type === 'truck') {
      veh.limitFactor = 0;
      veh.ownMax = clamp(CONFIG.truckSpeedKmh + gauss(r) * 1.6, 79, 90);
    } else if (type === 'caravan') {
      veh.limitFactor = 0;
      veh.ownMax = clamp(90 + gauss(r) * 3.5, 82, 100);
    }
    if (veh.limitFactor === 0) {
      veh.limitFactor = 0;
    }
    if (type === 'car' || type === 'van') veh.limitFactor = 1;
    this.applyLimit(veh);
    veh.v0 = veh.v0base;
    veh.jitterW = 0.02 + r() * 0.05;
    veh.jitterPh = r() * 6.28;

    // IDM params
    veh.a = tp.a * (0.85 + r() * 0.3);
    veh.b = tp.b * (0.85 + r() * 0.3);
    veh.s0 = tp.s0;
    veh.T = Math.max(0.75, tp.Tmean + gauss(r) * tp.Tsd);

    // MOBIL / lane behaviour
    const pol = CONFIG.politeness;
    veh.p = (0.08 + r() * 0.45) * pol;
    veh.thr = 0.12;
    veh.bias = 0.22 + r() * 0.25; // keep right
    if (type === 'truck') {
      veh.thr = 0.06;
      veh.bias = 0.1;
      veh.eager = CONFIG.truckOvertakeEagerness * (0.4 + r() * 1.2);
    } else if (type === 'caravan') {
      veh.bias = 0.3;
    }
    if ((type === 'car' || type === 'van') && r() < CONFIG.middleLaneHoggers) {
      veh.hogger = true;
      veh.bias = -0.05 + r() * 0.07;
    }
    veh.strict = r() < 0.7; // obeys no-undertaking even when frustrated
    // Anticipation 0..1: 0 reacts only when something enters its lane, 1 reads
    // signals and likely pull-outs early and plans its own overtakes sooner.
    veh.antic = clamp((0.15 + r() * 0.75) * CONFIG.anticipation, 0, 1);
    veh.tSignal = r() < 0.1 ? 0.3 + r() * 0.4 : 1.1 + r() * 1.7;
    veh.lcDur = type === 'car' ? 3.2 + r() * 2.3 : type === 'van' ? 3.8 + r() * 2 : 5 + r() * 2.2;
    veh.tSafe = 0.45 + r() * 0.6;
    veh.tSafePlayer = veh.tSafe + 0.35;
    veh.bSafe = 2.0 + r() * 1.5;
    veh.coop = r() < (type === 'truck' ? 0.7 : 0.55) * Math.min(1, pol) ? 1 : 0;
    veh.wanderA = 0.05 + r() * 0.14;
    veh.wanderW = 0.08 + r() * 0.25;
    veh.wanderPh = r() * 6.28;
    // Telegraphing: how a driver shows a lane change before making it.
    //   driftMax: how far it edges toward the lane line (m)
    //   press:    how much it closes up on a slow car while waiting to pull out (0..1)
    //   tPrep:    time between wanting a lane and signalling (mirror check), s
    veh.intent = -1; // lane it wants but hasn't signalled for yet
    veh.intentSince = null;
    veh.drift = 0;
    veh.driftMax = 0.15 + r() * 0.3;
    veh.press = type === 'truck' ? r() * 0.2 : r() * r() * 0.45;
    veh.tPrep = type === 'truck' ? 0.8 + r() * 1.2 : 0.4 + r() * 1.0;
    // reaction time (s): how late this driver acts on what happens ahead
    veh.react = type === 'truck' ? 0.7 + r() * 0.5 : 0.5 + r() * 0.8;
    // matrix signs: km/h over a displayed limit; lane closures: how early you merge out (0 = at the end)
    veh.msiOver = type === 'truck' ? r() * 3 : 1 + r() * 8;
    veh.mergeEarly = type === 'truck' ? 0.6 + r() * 0.4 : r();
    // how far below the lane-0 traffic speed this driver will merge (F-20);
    // an archetype overrides it (archetypes.js)
    veh.mergeKmh = type === 'truck' ? 15 : CONFIG.mergeKmhDefault;
    veh.passing = null; // the vehicle we pulled out to overtake (F-09)
    veh.returnT = 0;
    // Archetype: look and (usually) driving style. See archetypes.js.
    if (persona === undefined) persona = type === 'car' || type === 'van' ? pickPersona(variant, r) : null;
    applyPersona(veh, persona, r, forcePersona);
    // the persona may change the desired speed
    this.applyLimit(veh);
    veh.v0 = veh.v0base;
    const tg = CONFIG.telegraph ?? 1;
    veh.driftMax *= tg;
    veh.press *= tg;
    veh.tPrep *= tg;
    // Hoggers don't notice you behind them: only flashing moves them.
    if (veh.hogger) veh.p = Math.min(veh.p, 0.04);
    return veh;
  }

  randomTypeVariant() {
    const mix = CONFIG.mix;
    const type = pickWeighted(this.rng, [
      ['car', mix.car],
      ['van', mix.van],
      ['truck', mix.truck],
      ['caravan', mix.caravan],
    ]);
    const variant = pickWeighted(this.rng, TYPE_VARIANTS[type]);
    return [type, variant];
  }

  maxLaneFor(veh) {
    if (veh.type === 'truck' || veh.type === 'caravan') return Math.min(1, this.N - 1);
    return this.N - 1;
  }

  /** Choose a plausible lane to place a new vehicle in. */
  pickLane(veh) {
    const N = this.N;
    const r = this.rng;
    if (veh.type === 'truck') return r() < 0.93 || N < 2 ? 0 : 1;
    if (veh.type === 'caravan') return r() < 0.85 || N < 2 ? 0 : 1;
    // cars: faster drivers are further left
    const fast = clamp((veh.v0base / KMH - this.limitKmh + 8) / 30, 0, 1);
    const weights = [];
    for (let i = 0; i < N; i++) {
      const x = i / Math.max(1, N - 1); // 0 right .. 1 left
      weights.push([i, Math.exp(-((x - fast) * (x - fast)) / 0.18) + 0.08]);
    }
    if (veh.hogger && N >= 3) return 1;
    return pickWeighted(r, weights);
  }

  // ---------------- lane lists ----------------
  /** The lane list for index `i`: lane -1 is the acceleration strip (F-20). */
  laneList(i) {
    return i === -1 ? this.strip : this.lanes[i];
  }

  buildLanes(player) {
    const N = this.N;
    if (this.lanes.length !== N) this.lanes = Array.from({ length: N }, () => []);
    for (const l of this.lanes) l.length = 0;
    this.strip.length = 0;
    for (const veh of this.vehicles) {
      this.laneList(veh.lane).push(veh);
      if (veh.state === 'move' && veh.targetLane !== veh.lane) this.laneList(veh.targetLane).push(veh);
    }
    if (player) {
      for (const li of player.lanesOcc) if (li >= 0 && li < N) this.lanes[li].push(player);
      // On the hard shoulder inside a ramp's span: the strip cars must see you.
      if (player.lane === -1) {
        const s = this.dir * player.u;
        if (this.ramps.some((r) => s >= r.s0 - 20 && s <= r.s1 + 20)) this.strip.push(player);
      }
    }
    for (const c of this.closures) if (c.lane < N) this.lanes[c.lane].push(c.obs);
    for (const r of this.ramps) this.strip.push(r.obs);
    for (const l of this.lanes) l.sort((a, b) => a.u - b.u);
    this.strip.sort((a, b) => a.u - b.u);
  }

  /** Expected cruising speed in a lane given its leader (anticipation term). */
  expSpeed(veh, lead) {
    if (!lead) return veh.v0;
    if (lead.v >= veh.v0) return veh.v0;
    const g = gapBetween(lead, veh);
    const closing = Math.max(0.1, veh.v - lead.v);
    // anticipating drivers start wanting to overtake further back
    const an = veh.antic ?? 0.5;
    const near = g < veh.v * (2.2 + 1.6 * an) || (g - veh.v * veh.T) / closing < 4 + 6 * an;
    return near ? Math.min(veh.v0, lead.v) : veh.v0;
  }

  /** IDM plus the Dutch no-undertaking rule, for `veh` placed in lane `lane`. */
  laneAcc(veh, lane) {
    const lead = leaderIn(this.laneList(lane), veh);
    let a = idm(veh, lead);
    // no-undertaking is a rule for driving lanes, not for the acceleration
    // strip: there you speed up to join, you don't hang back beside lane 0
    if (lane >= 0 && veh.v > EURO_RULE_MIN_SPEED && lane + 1 < this.N) {
      const ll = leaderIn(this.laneList(lane + 1), veh);
      if (ll && ll.v < veh.v && ll.v > 40 * KMH && (veh.strict || ll.v > veh.v0 - 9 * KMH)) {
        const g = gapBetween(ll, veh);
        if (g > 0 && g < 150) a = Math.min(a, Math.max(idm(veh, ll, 0.45), -1.8));
      }
    }
    return a;
  }

  computeAcc(veh) {
    // Lining up ahead (F-38): pull a little past the driver's own wanted speed,
    // so the car behind in the target lane falls back and the gap opens.
    let a;
    if (veh.lineUp && veh.lineUp.kind === 'ahead') {
      const v0 = veh.v0;
      veh.v0 = v0 + CONFIG.lineUpKmh * KMH;
      a = this.laneAcc(veh, veh.lane);
      veh.v0 = v0;
    } else {
      a = this.laneAcc(veh, veh.lane);
    }
    if (veh.state === 'move' && veh.targetLane !== veh.lane) {
      const aT = this.laneAcc(veh, veh.targetLane);
      // most of the way out of a closing lane, the block ahead no longer concerns you
      a = veh.zipping && veh.lcT > 0.6 ? aT : Math.min(a, aT);
    }
    veh.accPure = a;
    a = this.anticipate(veh, a);
    // cooperation: ease off to let a signalling vehicle ahead in the next lane merge in front
    if (veh.coop) {
      for (const side of [-1, 1]) {
        const ln = veh.lane + side;
        if (ln < 0 || ln >= this.N) continue; // (the strip is not a lane to ease into)
        const list = this.lanes[ln];
        let i = firstAbove(list, veh.u - veh.len);
        for (let n = 0; n < 4 && i < list.length; n++, i++) {
          const e = list[i];
          // (signalLane -1 means "no signal", so a real one has to be >= 0)
          if (e === veh || e.signalLane < 0 || e.signalLane !== veh.lane) continue;
          const g = gapBetween(e, veh);
          if (g < 1 || g > 55) continue;
          if (e.v < veh.v - 6) continue; // way slower: not a sensible merge
          const ac = idm(veh, e, 0.45);
          a = Math.min(a, Math.max(ac, -1.6));
        }
      }
    }
    // Gap seeking: while signalling, line up with the gap instead of waiting
    // blindly. Drop in behind a car alongside or just ahead in the target lane,
    // and lift a little when a faster car is passing, so it clears sooner.
    // Lining up (F-38) uses the same seeking before the signal is on.
    const seek = veh.state === 'signal' ? veh.targetLane : veh.lineUp ? veh.lineUp.lane : -1;
    if (seek >= 0) {
      const tl = this.laneList(seek);
      const nl = tl ? leaderIn(tl, veh) : null;
      if (nl && !nl.isPlayer && nl.v < veh.v + 2) {
        const g = gapBetween(nl, veh);
        if (g < 25) a = Math.min(a, Math.max(idm(veh, nl, 0.5), -1.2));
      }
      const nf = followerIn(tl, veh);
      if (nf && nf !== veh && nf.v > veh.v + 1) {
        const g = gapBetween(veh, nf);
        if (g < 15) a = Math.min(a, -0.4);
      }
    }
    // Lining up behind the car that blocks the target lane: lift off until it
    // is past (after that the leader branch above keeps the gap). Above the
    // brake-light threshold, so it reads as easing off, not braking.
    if (veh.lineUp && veh.lineUp.kind === 'behind') {
      const nf = followerIn(this.laneList(veh.lineUp.lane), veh);
      if (nf && nf !== veh && nf.u <= veh.u) a = Math.min(a, CONFIG.lineUpLift);
    }
    return a;
  }

  /**
   * Anticipation: ease off for a vehicle in a neighbouring lane that is about
   * to come into ours, either signalling into our lane or (very anticipating
   * drivers) closing in on a slower vehicle with nowhere to go but our lane.
   * This is lifting off the throttle, not braking: the reaction to an actual
   * lane change stays with the IDM once the vehicle is in our lane.
   */
  anticipate(veh, a) {
    const an = veh.antic || 0;
    if (an <= 0.05) return a;
    const reach = 30 + veh.v * 5 * an; // how far ahead this driver reads, m
    veh.anticOn = null;
    for (const side of [-1, 1]) {
      const ln = veh.lane + side;
      if (ln < 0 || ln >= this.N) continue; // (the strip is not a lane to ease into)
      const list = this.lanes[ln];
      let i = firstAbove(list, veh.u);
      for (let n = 0; n < 3 && i < list.length; n++, i++) {
        const e = list[i];
        if (e === veh) continue;
        const g = gapBetween(e, veh);
        if (g > reach) break;
        if (g < 2 || e.v >= veh.v) continue; // alongside, or not slower: no conflict
        let likely = 0;
        // (signalLane -1 means "no signal", so a real one has to be >= 0)
        if (e.signalLane >= 0 && e.signalLane === veh.lane) likely = 1;
        else if (e.intent === veh.lane && an > 0.3) likely = 0.35 * an; // edging toward our lane
        else if (an > 0.5 && ln < veh.lane && !e.isPlayer) {
          // car to our right, stuck behind something slower, and it wants to go faster
          const ld = leaderIn(list, e);
          if (ld && ld.v < e.v0 - 8 * KMH) {
            const gl = gapBetween(ld, e);
            const tReach = (gl - e.v * e.T) / Math.max(0.5, e.v - ld.v);
            if (tReach < 6) likely = 0.6 * (an - 0.5) * 2;
          }
        }
        if (likely <= 0) continue;
        // as if it were already in our lane, with a slightly shorter headway
        const ac = Math.max(idm(veh, e, 0.75), likely >= 1 ? -1.6 : -0.9);
        const target = a + (Math.min(a, ac) - a) * likely * Math.min(1, an * 1.4);
        if (target < a) {
          a = target;
          veh.anticOn = e;
        }
      }
    }
    return a;
  }

  /**
   * Reaction time (F-22): a driver acts on what they decided a moment ago, not
   * now. This is what lets a hard brake grow as it travels back: each driver
   * starts braking later than the one ahead and has to brake harder.
   * Reflex: when a crash is imminent even braking hard, nobody waits.
   */
  reactLate(veh, aNow) {
    const tau = (veh.react ?? 0) * (CONFIG.reactionTime ?? 1);
    if (!(tau > 0.02)) return aNow;
    let h = veh.accHist;
    if (!h) h = veh.accHist = { t: new Float64Array(160), a: new Float32Array(160), i: 0, n: 0 };
    h.t[h.i] = this.time;
    h.a[h.i] = aNow;
    h.i = (h.i + 1) % 160;
    if (h.n < 160) h.n++;
    // the decision from tau seconds ago (oldest available while history fills)
    const want = this.time - tau;
    let aOld = aNow;
    for (let k = 1; k <= h.n; k++) {
      const j = (h.i - k + 320) % 160;
      aOld = h.a[j];
      if (h.t[j] <= want) break;
    }
    const ld = leaderIn(this.laneList(veh.lane), veh);
    if (ld) {
      // reflex: closing so fast that even 6 m/s² wouldn't be enough soon
      const g = gapBetween(ld, veh);
      const dv = veh.v - ld.v;
      if (g < 1.5 || (dv > 0 && g - 1 < (dv * dv) / (2 * 6) + dv * 0.3)) return Math.min(aNow, aOld);
      // a car cutting in right in front of you has your full attention
      if (ld.state === 'move' && g < 3 + veh.v) return Math.min(aNow, aOld);
      // Brake lights further up: seeing the cars ahead of your leader brake,
      // you lift off before your leader even reacts. This is what keeps real
      // queues from collapsing at every touch of the brakes.
      if (!ld.isPlayer && g < veh.v * 2.5) {
        const l2 = leaderIn(this.laneList(veh.lane), ld);
        const seen = (ld.brake ? 1 : 0) + (l2 && !l2.isPlayer && l2.brake && gapBetween(l2, ld) < ld.v * 2.5 ? 1 : 0);
        if (seen && aNow < aOld) {
          const k = (CONFIG.brakeLightRead ?? 0.5) * (0.5 + 0.5 * (veh.antic ?? 0.5)) * (seen === 2 ? 1 : 0.6);
          return aOld + (aNow - aOld) * Math.min(1, k);
        }
      }
    }
    return aOld;
  }

  /** The leader half of the lane-change gap test: is the car ahead in t far enough? */
  leaderSafe(veh, nl, gNl) {
    return gNl >= 2 + veh.v * 0.3 + Math.max(0, veh.v - nl.v) * 1.2;
  }

  /** The follower half: has the car behind in t left the room this driver wants? */
  followerSafe(veh, nf, gNf) {
    const ts = nf.isPlayer ? veh.tSafePlayer : veh.tSafe;
    if (!(gNf >= 2 + nf.v * ts + Math.max(0, nf.v - veh.v) * 2.2)) return false;
    return idm(nf, veh, 1, gNf) >= -(nf.isPlayer ? 1.0 : veh.bSafe);
  }

  /** Both gap tests for a normal (non-zipper) lane change. */
  gapSafe(veh, nl, nf, gNl, gNf) {
    if (nl && !this.leaderSafe(veh, nl, gNl)) return false;
    if (nf && !this.followerSafe(veh, nf, gNf)) return false;
    return true;
  }

  /**
   * Would the move into lane t be safe `h` seconds from now, keeping both gaps
   * as they are at current speeds? A gap that closes to nothing is not safe.
   * (F-38: a driver may signal for a gap that is visibly opening.)
   */
  projectedSafe(veh, t, h) {
    const tgt = this.laneList(t);
    const nl = leaderIn(tgt, veh);
    const nf = followerIn(tgt, veh);
    const gNl = nl ? gapBetween(nl, veh) + (nl.v - veh.v) * h : 0;
    const gNf = nf ? gapBetween(veh, nf) + (veh.v - nf.v) * h : 0;
    if (nl && gNl <= 0) return false;
    if (nf && gNf <= 0) return false;
    return this.gapSafe(veh, nl, nf, gNl, gNf);
  }

  /** MOBIL evaluation of moving veh into lane t. */
  evaluate(veh, t) {
    // never into a lane with a red cross coming up (or a closure in it)
    if (this.closures.length && this.crossAhead(t, this.dir * veh.u, 700) < 700) return { safe: false, inc: -9, wants: false, margin: -9 };
    const cur = this.laneList(veh.lane);
    const tgt = this.laneList(t);
    const nl = leaderIn(tgt, veh);
    const nf = followerIn(tgt, veh);
    let safe = true;
    // Zipper (ritsen): with your lane closing just ahead you take a tight gap,
    // as long as the driver behind only has to brake moderately. For a car on
    // an acceleration strip (F-20) the end of the strip counts as that closure.
    const zip = t !== veh.lane && this.closedAhead(veh.lane, this.dir * veh.u, 200) < 40 + veh.v * 2 && this.closedAhead(t, this.dir * veh.u, 700) >= 700;
    if (zip) {
      // room to finish the move before the block? otherwise slow down first
      if (veh.v > 2 && this.closedAhead(veh.lane, this.dir * veh.u, 200) < 6 + veh.v * 2.4) safe = false;
      if (nl && gapBetween(nl, veh) < 1.5 + veh.v * 0.2 + Math.max(0, veh.v - nl.v) * 0.8) safe = false;
      if (nf) {
        const g = gapBetween(veh, nf);
        // the driver behind needs their reaction time too
        if (g < 2 + nf.v * (0.45 + (nf.react ?? 0.8) * 0.6) || idm(nf, veh) < -(nf.isPlayer ? 1.8 : 2.2)) safe = false;
      }
    } else if (nl) {
      if (!this.leaderSafe(veh, nl, gapBetween(nl, veh))) safe = false;
    }
    if (nf && !zip) {
      if (!this.followerSafe(veh, nf, gapBetween(veh, nf))) safe = false;
    }
    const aOld = veh.accPure;
    const aNew = this.laneAcc(veh, t);
    const ol = leaderIn(cur, veh);
    const of = followerIn(cur, veh);
    let dOf = 0;
    if (of && gapBetween(veh, of) < 200) dOf = idm(of, ol) - idm(of, veh);
    let dNf = 0;
    if (nf && gapBetween(veh, nf) < 200) dNf = idm(nf, veh) - idm(nf, nl);
    const p = veh.p + (veh.pressureT > 0 ? 0.6 : 0);
    const kv = veh.type === 'truck' ? 0.15 * veh.eager : 0.15 * (CONFIG.speedGain ?? 1);
    let kvTerm = kv * (this.expSpeed(veh, nl) - this.expSpeed(veh, ol));
    let accTerm = aNew - aOld;
    // Truck lovers (grijze sok) are happy at truck speed: they stay behind
    // their truck, and slot in behind one in the next lane right.
    // A "truck" here is a truck, or a car already tucked in behind one (a convoy).
    let love = 0;
    if (veh.truckLove) {
      const tk = (l) => l && (l.type === 'truck' || l.drafting) && gapBetween(l, veh) < 300;
      if (tk(ol) && !tk(nl)) {
        kvTerm *= 1 - veh.truckLove; // passing it gains nothing worth the fuel
        love = -0.6 * veh.truckLove;
      } else if (!tk(ol) && tk(nl) && t < veh.lane) {
        kvTerm *= 1 - veh.truckLove; // its speed is fine
        accTerm = Math.max(accTerm, -0.3);
        love = 0.3 * veh.truckLove;
      }
    }
    const selfish = accTerm + kvTerm;
    // Lane closures: get out of a lane that closes ahead (some early, some at
    // the very end, zipper style), and never into one.
    let closure = 0;
    // a car on the acceleration strip always wants lane 0 (F-20)
    if (veh.lane === -1) closure = 3;
    if (this.closures.length) {
      const s = this.dir * veh.u;
      // most leave between the arrow and the red cross; patsers and the like
      // ride on to the end of the lane (past the cross, which is a fine)
      const dCur = this.crossAhead(veh.lane, s);
      if (dCur < Infinity) {
        const m = veh.mergeEarly ?? 0.5;
        const start = m * 550;
        const dEnd = this.closedAhead(veh.lane, s);
        if (dCur < start || dCur === 0) closure += 0.5 + 2.5 * (dCur === 0 ? Math.max(0.4, 1 - dEnd / 600) : 1 - dCur / Math.max(1, start));
      }
    }
    const inc = selfish + p * (dNf + dOf) + love + closure;
    // hoggers like the middle, not the far left
    const baseBias = veh.hogger && veh.lane === this.N - 1 && this.N >= 3 ? 0.2 : veh.bias;
    // after an overtake, going back right is the plan (F-09)
    // Someone faster sitting behind you is a reason to move over (most
    // drivers do, without being flashed). Hoggers don't notice.
    let behind = 0;
    if (t < veh.lane && of && !veh.hogger && veh.type !== 'truck') {
      const want = (of.isPlayer ? of.v : of.v0) - veh.v;
      const g = gapBetween(veh, of);
      if (want > 2 * KMH && g < 15 + of.v * 2.2) behind = (CONFIG.moveOver ?? 0.25) * Math.min(1, want / (8 * KMH));
    }
    const bias = baseBias + behind + (veh.pressureT > 0 ? 0.25 : 0) + (veh.returnT > 0 && t < veh.lane ? 0.2 : 0);
    const left = t > veh.lane;
    const need = left ? veh.thr + bias : veh.thr - bias;
    // Nobody moves LEFT just to be nice to the car behind: politeness may hold
    // back an overtake, but the driver must gain something themselves. (Flashed
    // drivers are the exception: they're pressed to move, handled by bias.)
    const wants = inc > need && (!left || selfish > veh.thr * 0.5 || closure > 0);
    // closure and zip are read by laneLogic (F-38): those moves keep the old
    // signal-and-wait behaviour, the rest may only signal for a gap.
    return { safe, inc, wants, margin: inc - need, closure, zip: !!zip };
  }

  /**
   * Start signalling for lane `target` (the state change `laneLogic` makes
   * when a driver commits to a lane change). Also called by the stage test
   * (`tools/momentstage.js`), so holding, moving and cancelling stay the same
   * code path as a real driver's.
   */
  beginSignal(veh, target, closure = false) {
    const left = target > veh.lane;
    veh.state = 'signal';
    veh.targetLane = target;
    veh.signalLane = target;
    veh.signalT = 0;
    veh.recheckT = 1;
    veh.indicator = left ? -1 : 1;
    veh.indOffT = 0;
    veh.lineUp = null;
    veh.closureSig = !!closure;
  }

  /**
   * Get into position before signalling (F-38). A driver who wants the lane
   * right but has a car alongside or just behind in it first lines up without
   * indicating: pull a little ahead of that car (if there is room ahead), or
   * lift off and drop in behind it. The intent drift keeps the wish visible.
   * Called every decision tick while the gap is not there yet.
   */
  lineUpFor(veh, t) {
    const tl = this.laneList(t);
    const nl = leaderIn(tl, veh);
    const nf = followerIn(tl, veh);
    if (!nf || nf === veh) return;
    const gNf = gapBetween(veh, nf);
    if (this.followerSafe(veh, nf, gNf)) return; // it is not the blocker
    if (nf.v > veh.v + 1) return; // faster: the gap opens by itself, so it may signal
    const gNl = nl ? gapBetween(nl, veh) : 0;
    // Can the leader in the target lane stay far enough ahead for the whole
    // time we might spend lining up?
    let nlOk = true;
    if (nl) {
      const g = gNl + (nl.v - veh.v) * CONFIG.lineUpS;
      nlOk = g > 0 && this.leaderSafe(veh, nl, g);
    }
    let kind = null;
    if (veh.type !== 'truck' && nlOk) {
      // trucks have limiters, so they can never pull ahead of a car
      const ol = leaderIn(this.laneList(veh.lane), veh);
      const room = !ol || gapBetween(ol, veh) > 2 + veh.v * veh.T + 20;
      if (room) kind = 'ahead';
    }
    if (!kind && Math.abs(nf.v - veh.v) <= 3 * KMH) kind = 'behind';
    if (!kind) return;
    if (!veh.lineUp || veh.lineUp.lane !== t) {
      veh.lineUp = { kind, lane: t, side: t > veh.lane ? 'L' : 'R', t0: this.time };
    } else {
      veh.lineUp.kind = kind;
    }
  }

  laneLogic(veh, dt) {
    const N = this.N;
    veh.pressureT = Math.max(0, veh.pressureT - dt);
    // the re-signal pause counts down whatever the driver is doing
    if (veh.noSignalT) {
      if (veh.noSignalT.L > 0) veh.noSignalT.L = Math.max(0, veh.noSignalT.L - dt);
      if (veh.noSignalT.R > 0) veh.noSignalT.R = Math.max(0, veh.noSignalT.R - dt);
    }
    if (veh.indOffT > 0) {
      veh.indOffT -= dt;
      if (veh.indOffT <= 0) veh.indicator = 0;
    }
    veh.returnT = Math.max(0, (veh.returnT || 0) - dt);
    // F-09 follow-through: once clear of the vehicle we overtook, head back right
    if (veh.passing) {
      const pv = veh.passing;
      veh.passingT += dt;
      if (veh.state === 'none' && pv.lane < veh.lane && gapBetween(veh, pv) > 8 + veh.v * 0.6) {
        veh.passing = null;
        veh.cooldown = Math.min(veh.cooldown, 0.3);
        veh.decT = Math.min(veh.decT, 0.3);
        veh.returnT = 8;
      } else if (veh.passingT > 45 || (veh.state === 'none' && pv.lane >= veh.lane)) veh.passing = null;
    }
    // An acceleration strip (F-20) has its own rules: always lane 0, always
    // indicating, merging when it is safe and fast enough.
    if (veh.lane === -1) return this.stripLogic(veh, dt);
    if (veh.state === 'none') {
      veh.cooldown -= dt;
      veh.decT -= dt;
      if (veh.cooldown > 0) {
        veh.intent = -1;
        veh.intentSince = null;
        veh.lineUp = null;
      }
      if (veh.decT > 0 || veh.cooldown > 0) return;
      veh.decT = 0.5 + this.rng() * 0.7;
      let best = null;
      const maxLane = this.maxLaneFor(veh);
      veh.dbgL = veh.dbgR = null; // last evaluations, shown by the dev overlay
      for (const t of [veh.lane + 1, veh.lane - 1]) {
        if (t < 0 || t >= N || t > maxLane) continue;
        if (veh.type === 'truck' && t > veh.lane && veh.eager <= 0.01) continue;
        const ev = this.evaluate(veh, t);
        if (t > veh.lane) veh.dbgL = ev;
        else veh.dbgR = ev;
        if (!ev.wants) continue;
        if (!best || ev.margin > best.ev.margin) best = { t, ev };
      }
      // Intent: wanting a lane shows (drift, pressure) before any signal.
      if (!best) {
        veh.intent = -1;
        veh.intentSince = null;
        veh.lineUp = null;
        return;
      }
      if (veh.intent !== best.t) {
        veh.intent = best.t;
        veh.intentSince = this.time;
        veh.lineUp = null; // the wish changed: start lining up for the new lane
      }
      // Lining up for this lane for too long without a signal: give the wish up
      // for a while rather than edge along in it forever.
      if (veh.lineUp && this.time - veh.lineUp.t0 > CONFIG.lineUpS) {
        veh.lineUp = null;
        veh.intent = -1;
        veh.intentSince = null;
        veh.cooldown = 1.5 + this.rng() * 2;
        return;
      }
      // at the end of a closed lane there's no time for a long look
      const cornered = this.closures.length > 0 && this.closedAhead(veh.lane, this.dir * veh.u, 200) < 200;
      if (!cornered && this.time - veh.intentSince < (veh.tPrep ?? 0)) return; // checking the mirror
      const left = best.t > veh.lane;
      const side = left ? 'L' : 'R';
      // A closure or a zipper merge keeps the old signal-and-wait: there,
      // indicating and waiting really is what Dutch drivers do.
      const forced = cornered || best.ev.closure > 0 || best.ev.zip;
      // Signal if safe, or if the gap is visibly opening within the horizon.
      // Otherwise line up first (right moves only; for the left the intent stays
      // and the next decision looks again).
      let go = best.ev.safe;
      if (!go && forced) {
        go = left ? best.ev.margin > 0.25 && this.rng() < 0.35 : best.ev.margin > 0.1 && this.rng() < 0.5;
      } else if (!go) {
        go = this.projectedSafe(veh, best.t, veh.tSignal + CONFIG.signalHorizonS);
      }
      // no signalling toward a side that just had its signal withdrawn
      if (go && !forced && veh.noSignalT && veh.noSignalT[side] > 0) go = false;
      if (go) {
        this.beginSignal(veh, best.t, forced);
      } else if (!left) {
        this.lineUpFor(veh, best.t);
      } else {
        veh.lineUp = null;
      }
    } else if (veh.state === 'signal') {
      veh.signalT += dt;
      veh.recheckT -= dt;
      const t = veh.targetLane;
      const cornered = this.closures.length > 0 && this.closedAhead(veh.lane, this.dir * veh.u, 200) < 200;
      if (veh.signalT >= (cornered ? Math.min(veh.tSignal, 0.7) : veh.tSignal)) {
        const ev = this.evaluate(veh, t);
        if (ev.safe && ev.margin > -0.3) {
          veh.state = 'move';
          veh.lcT = 0;
          veh.zipping = this.closures.length > 0 && this.closedAhead(veh.lane, this.dir * veh.u, 200) < 200;
          // Occupy the target lane now, so a car merging into it from the
          // other side later in this same step sees us.
          const tl = this.laneList(t);
          if (!tl.includes(veh)) tl.splice(firstAbove(tl, veh.u), 0, veh);
          // remember who we're overtaking, to come back in after passing
          if (t > veh.lane) {
            const ld = leaderIn(this.laneList(veh.lane), veh);
            if (ld && !ld.isPlayer && ld.v < veh.v0 - 3 * KMH && gapBetween(ld, veh) < 80) {
              veh.passing = ld;
              veh.passingT = 0;
            }
          }
          return;
        }
        if (veh.recheckT <= 0) {
          veh.recheckT = 1;
          // A closure signal may keep waiting (merging out of a closed lane is
          // real behaviour); any other signal is withdrawn after a short hold.
          const hold = veh.closureSig ? 8 : CONFIG.signalHoldS;
          if (ev.margin < -0.15 || veh.signalT > veh.tSignal + hold) this.cancelChange(veh);
        }
      }
    } else if (veh.state === 'move') {
      this.advanceMove(veh, dt);
    }
  }

  /** Progress a lane change that is already under way (also used on a ramp). */
  advanceMove(veh, dt) {
    // zipping in at the end of a closed lane: a short, decisive move
    veh.lcT += dt / (veh.zipping ? Math.min(veh.lcDur, 2.2) : veh.lcDur);
    if (veh.lcT < 0.3) {
      // abort if it suddenly became dangerous: someone closing fast behind,
      // or a car merging into the same lane from the other side
      const nf = followerIn(this.laneList(veh.targetLane), veh);
      const nl = leaderIn(this.laneList(veh.targetLane), veh);
      if ((nf && nf !== veh && idm(nf, veh) < -5) || (nl && nl.state === 'move' && idm(veh, nl) < -4)) {
        if (veh.lane === -1) {
          // a merge off the strip that is called off: stay on the strip,
          // signal still on, and try again from there
          veh.state = 'signal';
          veh.lcT = 0;
          veh.targetLane = 0;
          veh.signalLane = 0;
          return;
        }
        const from = veh.lane;
        veh.lane = veh.targetLane;
        veh.targetLane = from;
        veh.lcT = 1 - veh.lcT;
        veh.indicator = -veh.indicator;
        veh.signalLane = -1;
      }
    }
    if (veh.lcT >= 1) {
      veh.lane = veh.targetLane;
      veh.state = 'none';
      veh.lcT = 0;
      veh.drift = 0;
      veh.intent = -1;
      veh.intentSince = null;
      veh.lineUp = null;
      veh.closureSig = false;
      veh.signalLane = -1;
      veh.indOffT = 0.3 + this.rng() * 0.8;
      veh.cooldown = 2.5 + this.rng() * 5;
    }
  }

  /**
   * Invoegen (F-20): merging from an acceleration strip into lane 0. The car
   * indicates left from the moment it appears and keeps the signal on (the
   * F-38 closure-signal exception), merges once the gap is safe and it is
   * within its own speed band of lane 0, and in the last metres takes any safe
   * gap. With no gap it brakes for the end of the strip and stops there.
   */
  stripLogic(veh, dt) {
    if (veh.state === 'move') return this.advanceMove(veh, dt);
    const s = this.dir * veh.u;
    const dEnd = this.closedAhead(-1, s); // metres to the end of the strip
    if (veh.state === 'none') this.beginSignal(veh, 0, true);
    veh.signalT += dt;
    veh.closureSig = true; // a merge signal may wait, never withdrawn
    if (!this.mergeReady(veh, dEnd)) return;
    const ev = this.evaluate(veh, 0);
    if (!ev.safe) return;
    // Invoegen: give way. The gap also has to be one this car can hold behind
    // the car it merges behind (a stop-and-go queue tempts a dive into 4 m).
    const nl = leaderIn(this.lanes[0], veh);
    if (nl && idm(veh, nl) < -2.2) return;
    // A car joining well below the speed of the lane-0 car behind it cannot use
    // the tight zipper gap: from (nearly) a standstill that gap closes too fast
    // for the car behind, and the one behind that.
    const nf = followerIn(this.lanes[0], veh);
    if (nf && veh.v < nf.v - 3 && !this.followerSafe(veh, nf, gapBetween(veh, nf))) return;
    veh.state = 'move';
    veh.lcT = 0;
    // near the end: the short, decisive zipper move, at any speed difference
    veh.zipping = dEnd < 40 + veh.v * 2;
    // Occupy lane 0 now, so a car merging from the other side sees us.
    const tl0 = this.lanes[0];
    if (!tl0.includes(veh)) tl0.splice(firstAbove(tl0, veh.u), 0, veh);
  }

  /** Close enough to lane-0 speed to merge, or out of strip? */
  mergeReady(veh, dEnd) {
    if (dEnd < CONFIG.mergeLastM) return true;
    // the car it would follow is the next one genuinely ahead: a car alongside
    // in lane 0 says nothing about the traffic this driver is joining
    let nl = leaderIn(this.lanes[0], veh);
    while (nl && gapBetween(nl, veh) <= 0) nl = leaderIn(this.lanes[0], nl);
    const vs = nl && gapBetween(nl, veh) < 150 ? nl.v : veh.v0;
    return Math.abs(vs - veh.v) <= (veh.mergeKmh ?? CONFIG.mergeKmhDefault) * KMH;
  }

  cancelChange(veh) {
    // A promise that was not kept: this side is not signalled again for a while
    // (the normal cooldown still applies; lining up toward it is allowed).
    const side = veh.indicator < 0 || (veh.indicator === 0 && veh.targetLane > veh.lane) ? 'L' : 'R';
    if (!veh.closureSig && veh.noSignalT) veh.noSignalT[side] = CONFIG.resignalS;
    veh.state = 'none';
    veh.intent = -1;
    veh.intentSince = null;
    veh.lineUp = null;
    veh.closureSig = false;
    veh.signalLane = -1;
    veh.targetLane = veh.lane;
    veh.indOffT = 0.2;
    veh.cooldown = 1.5 + this.rng() * 2;
  }

  // ---------------- spawning ----------------
  /** Try to insert a vehicle at road position s. Returns vehicle or null. */
  insertAt(s, lane, type, variant, opts = {}) {
    const veh = this.makeVehicle(type, variant, opts.persona, opts.persona != null);
    lane = lane ?? this.pickLane(veh);
    if (lane > this.maxLaneFor(veh)) lane = 0;
    veh.lane = veh.targetLane = lane;
    veh.u = this.dir * s;
    const list = this.laneList(lane);
    const ld = leaderIn(list, veh);
    const fl = followerIn(list, veh);
    let v = veh.v0;
    if (opts.v != null) v = Math.min(v, opts.v);
    if (ld) {
      const g = gapBetween(ld, veh);
      if (g < 6) return null;
      if (ld.v < v) {
        const need = veh.s0 + v * veh.T + ((v - ld.v) * (v - ld.v)) / (2 * veh.b);
        if (g < need) v = ld.v;
      }
      if (g < veh.s0 + v * veh.T * 0.9) return null;
    }
    if (fl) {
      const g = gapBetween(veh, fl);
      if (g < 6) return null;
      const need = (fl.s0 || 2) + fl.v * (fl.T || 1.2) * 0.9 + Math.max(0, fl.v - v) ** 2 / (2 * (fl.b || 2));
      if (g < need) {
        if (opts.strictBehind) return null;
        if (g < 2 + fl.v * 0.6) return null;
      }
    }
    veh.v = v;
    veh.latLocal = laneLat(lane, this.N);
    this.vehicles.push(veh);
    // keep lane list consistent for subsequent inserts this frame
    const idx = firstAbove(list, veh.u);
    list.splice(idx, 0, veh);
    this.onAdd(veh);
    return veh;
  }

  densityFactor(s) {
    return (this.densityScale ?? 1) * clamp(1 + 0.32 * Math.sin(s / 3900 + 1.3) + 0.18 * Math.sin(s / 1370), 0.45, 1.6);
  }

  /** Fill the whole simulated range at start. */
  initialFill(sPlayer, player) {
    this.buildLanes(player);
    const N = this.N;
    const shares = [];
    for (let i = 0; i < N; i++) shares.push(N === 1 ? 1 : 1.25 - (0.6 * i) / (N - 1));
    const tot = shares.reduce((a, b) => a + b, 0);
    for (let lane = 0; lane < N; lane++) {
      const perKm = (this.density * N * shares[lane]) / tot;
      let s = sPlayer + this.ahead;
      const sMin = sPlayer - this.behind;
      while (s > sMin) {
        const mean = 1000 / Math.max(0.5, perKm * this.densityFactor(s));
        s -= 8 + -Math.log(1 - this.rng()) * mean;
        if (s <= sMin) break;
        if (player && player.lanesOcc.includes(lane) && Math.abs(s - player.u) < 45) continue;
        let [type, variant] = this.randomTypeVariant();
        if ((type === 'truck' || type === 'caravan') && lane > Math.min(1, N - 1)) {
          type = 'car';
          variant = 'estate';
        }
        if (type === 'truck' && lane === 1 && this.rng() < 0.85) {
          type = 'car';
          variant = 'hatch';
        }
        this.insertAt(s, lane, type, variant);
      }
    }
  }

  maintain(sPlayer) {
    const sMin = sPlayer - this.behind;
    const sMax = sPlayer + this.ahead;
    // despawn
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const veh = this.vehicles[i];
      const s = this.dir * veh.u;
      if (s < sMin - 250 || s > sMax + 250) {
        this.vehicles.splice(i, 1);
        this.onRemove(veh);
      }
    }
    // count per zone
    let nAhead = 0, nBehind = 0;
    for (const veh of this.vehicles) {
      const s = this.dir * veh.u;
      if (s >= sPlayer) nAhead++;
      else nBehind++;
    }
    const perM = (this.density * this.N) / 1000;
    const tAhead = perM * this.ahead * this.densityFactor(sPlayer + this.ahead * 0.5);
    const tBehind = perM * this.behind * this.densityFactor(sPlayer - this.behind * 0.5);
    if (nAhead < tAhead - 1) {
      const [type, variant] = this.randomTypeVariant();
      const s = sMax - this.rng() * 150;
      this.insertAt(s, null, type, variant);
    }
    if (this.spawnBehind && nBehind < tBehind - 1) {
      const [type, variant] = this.randomTypeVariant();
      const s = sMin + this.rng() * 150;
      this.insertAt(s, null, type, variant, { strictBehind: true });
    }
    // on-ramps add their own cars, so the edges above spawn fewer (F-20)
    this.updateRamps(sMin, sMax);
  }

  /**
   * On-ramp arrivals (F-20): one Poisson timer per ramp, frozen while the ramp
   * is outside the simulated range. A failed insertion (a car too close ahead
   * on the strip) is retried a second later; nothing is queued. Called from
   * maintain(), which runs every 0.2 s.
   */
  updateRamps(sMin, sMax) {
    const dt = 0.2;
    for (const r of this.ramps) {
      if (r.s0 > sMax || r.s1 < sMin - 250) continue;
      if (r.retryT > 0) {
        r.retryT -= dt;
        if (r.retryT > 0) continue;
      } else {
        r.spawnT -= dt;
        if (r.spawnT > 0) continue;
        r.spawnT = this.rampGap(r.perMin);
      }
      if (!this.spawnFromRamp(r)) r.retryT = 1;
    }
  }

  /** One car appears at the start of a ramp's strip, at entry speed. */
  spawnFromRamp(r) {
    const [type, variant] = this.randomTypeVariant();
    const kmh = Math.max(30, (type === 'truck' ? 60 : CONFIG.rampEntryKmh) + gauss(this.rng) * (type === 'truck' ? 5 : 6));
    return this.insertAt(r.s0, -1, type, variant, { v: kmh * KMH });
  }

  // ---------------- main step ----------------
  step(dt, sPlayer, player) {
    this.time += dt;
    this.buildLanes(player);
    for (const veh of this.vehicles) {
      veh.v0 = veh.v0base * (1 + 0.012 * Math.sin(this.time * veh.jitterW + veh.jitterPh));
      // matrix signs: the number over your lane, give or take your habits
      if (this.msi) {
        const lim = this.msi.limitAt(this.dir * veh.u, veh.lane);
        if (lim != null) veh.v0 = Math.min(veh.v0, (lim + (veh.msiOver ?? 4)) * KMH);
      }
      // Passing someone: put your foot down a little to get it done.
      if (veh.lane > 0 && veh.type !== 'truck' && veh.type !== 'caravan') {
        const rl = leaderIn(this.lanes[veh.lane - 1], veh);
        if (rl && !rl.isPlayer && rl.v < veh.v0 && gapBetween(rl, veh) < 60 && gapBetween(rl, veh) > -rl.len - 30) veh.v0 += (CONFIG.passBoostKmh ?? 0) * KMH;
      }
      // Pressure: closing up on a slow car while waiting to pull out left.
      if (veh.Tbase == null) veh.Tbase = veh.T;
      const pushing = veh.intent > veh.lane || (veh.state === 'signal' && veh.targetLane > veh.lane);
      let tT = pushing ? Math.max(0.45, veh.Tbase * (1 - 0.4 * (veh.press || 0))) : veh.Tbase;
      // Slipstreaming: tuck in closer behind a truck (grijze sok)
      veh.drafting = false;
      if (veh.Tdraft && veh.state === 'none') {
        const ld = leaderIn(this.laneList(veh.lane), veh);
        if (ld && ld.type === 'truck' && gapBetween(ld, veh) < 90) {
          tT = Math.min(tT, veh.Tdraft);
          veh.drafting = true;
        }
      }
      veh.T += (tT - veh.T) * Math.min(1, dt * 0.4);
      veh.acc = this.reactLate(veh, this.computeAcc(veh));
      // scripted event (scenarios): brake hard to a speed, hold it, drive on
      const be = veh.brakeEvent;
      if (be && this.time >= be.at && this.time < be.at + (be.hold ?? 3) + 30) {
        const vT = be.kmh * KMH;
        // (state lives on the vehicle: the spec object is shared between restarts)
        if (!veh.beReached && veh.v > vT + 0.3) veh.acc = Math.min(veh.acc, -(be.decel ?? 5));
        else veh.beReached = true;
        if (veh.beReached && this.time < (veh.beHoldUntil ??= this.time + (be.hold ?? 3))) veh.acc = Math.min(veh.acc, (vT - veh.v) * 2);
      }
      // startled by a horn: a short tap of the brakes
      if (veh.startleT > 0) {
        veh.startleT -= dt;
        veh.acc = Math.min(veh.acc, -1.3);
      }
    }
    for (const veh of this.vehicles) this.laneLogic(veh, dt);
    for (const veh of this.vehicles) {
      const a = veh.acc;
      veh.v = Math.max(0, veh.v + a * dt);
      veh.u += veh.v * dt;
      // brake lights with hysteresis
      if (a < -0.85 || veh.v < 0.5) veh.brake = true;
      else if (a > -0.35) veh.brake = false;
      // lateral
      const prev = veh.latLocal;
      let lat;
      if (veh.state === 'move') {
        // the drift built up before the move blends out as the car crosses
        const p = lcProfile(veh.lcT);
        lat = laneLat(veh.lane, this.N) + (laneLat(veh.targetLane, this.N) - laneLat(veh.lane, this.N)) * p + (veh.drift || 0) * (1 - p);
      } else {
        // Drift toward the lane we want: half way while just wanting it, fully
        // while signalling. Often the first thing you notice.
        const want = veh.state === 'signal' ? veh.targetLane : veh.intent;
        let target = 0;
        if (want >= 0 && want !== veh.lane) {
          target = Math.sign(laneLat(want, this.N) - laneLat(veh.lane, this.N)) * (veh.driftMax || 0) * (veh.state === 'signal' ? 1 : 0.5);
        }
        veh.drift = (veh.drift || 0) + clamp(target - (veh.drift || 0), -0.3 * dt, 0.3 * dt);
        lat = laneLat(veh.lane, this.N) + veh.drift;
      }
      lat += veh.wanderA * Math.sin(this.time * veh.wanderW + veh.wanderPh);
      veh.latLocal = lat;
      veh.latRate = (lat - prev) / Math.max(dt, 1e-4);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.2;
      this.buildLanes(player);
      this.maintain(sPlayer);
    }
  }

  /**
   * Player sounded the horn (F-03). Mild, Dutch reactions: a driver changing
   * lanes into you abandons it; the car right ahead gives a startled tap of the
   * brakes (and, in a left lane, takes the hint to move over); a car alongside
   * flinches and won't come over for a bit. Returns who reacted, for the log.
   */
  honkFrom(player) {
    const who = [];
    for (const veh of this.vehicles) {
      const d = veh.u - player.u; // + ahead
      if (d < -20 || d > 70) continue;
      const mine = player.lanesOcc.includes(veh.lane);
      const into = !mine && player.lanesOcc.includes(veh.targetLane) && veh.state !== 'none';
      if (into) {
        if (veh.state === 'signal') this.cancelChange(veh);
        else if (veh.lcT < 0.6) {
          const from = veh.lane;
          veh.lane = veh.targetLane;
          veh.targetLane = from;
          veh.lcT = 1 - veh.lcT;
          veh.indicator = -veh.indicator;
          veh.signalLane = -1;
        }
        veh.cooldown = Math.max(veh.cooldown, 6);
        veh.startleT = 0.4;
        who.push({ veh, how: 'abandons the lane change' });
      } else if (mine && d > 0 && gapBetween(veh, player) < 50) {
        veh.startleT = 0.5;
        if (veh.lane > 0) {
          veh.pressureT = Math.max(veh.pressureT, 5);
          veh.decT = Math.min(veh.decT, 0.4);
        }
        who.push({ veh, how: 'startled tap of the brakes' });
      } else if (!mine && Math.abs(d) < 12 && player.lanesOcc.some((l) => Math.abs(l - veh.lane) === 1)) {
        veh.startleT = 0.3;
        veh.cooldown = Math.max(veh.cooldown, 5);
        who.push({ veh, how: 'flinches' });
      }
    }
    return who;
  }

  /** Player flashed headlights: the vehicle ahead in our lane feels pressure. */
  flashFrom(player) {
    let best = null, bestG = 1e9;
    for (const veh of this.vehicles) {
      if (!player.lanesOcc.includes(veh.lane)) continue;
      const g = gapBetween(veh, player);
      if (g > 0 && g < 110 && g < bestG) {
        best = veh;
        bestG = g;
      }
    }
    if (best) {
      best.pressureT = 7;
      best.decT = Math.min(best.decT, 0.3);
      best.cooldown = Math.min(best.cooldown, 0.5);
    }
    return best;
  }
}

export { lcProfileDeriv };
