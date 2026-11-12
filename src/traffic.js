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
import { VARIANTS, TYPE_VARIANTS } from './variants.js';

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
export function idm(me, lead, Tmul = 1) {
  const v = me.v;
  const v0 = Math.max(me.v0, 1);
  const r = v / v0;
  let free;
  if (r <= 1) free = me.a * (1 - r * r * r * r);
  else free = -Math.min(1.6, me.b * (r - 1) * 5); // above desired speed: ease off, no slamming
  if (!lead) return free;
  const g = gapBetween(lead, me);
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
  if (vl * dv <= -2 * gg * al) aCah = (v * v * al) / Math.max(vl * vl - 2 * gg * al, 0.01);
  else aCah = al - (dv > 0 ? (dv * dv) / (2 * gg) : 0);
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
   */
  constructor({ dir, density, ahead, behind, seed, limitKmh, onAdd, onRemove, spawnBehind = true }) {
    this.dir = dir;
    this.spawnBehind = spawnBehind;
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
  }

  get N() {
    return CONFIG.lanes;
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
  makeVehicle(type, variant) {
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
      if (x < CONFIG.speeders) veh.limitOffset = 12 + r() * 25;
      else if (x < CONFIG.speeders + CONFIG.slowpokes) veh.limitOffset = -9 + r() * 6;
      else veh.limitOffset = 2 + gauss(r) * CONFIG.speedSpreadKmh;
      if (type === 'van') veh.limitOffset = Math.min(veh.limitOffset, 4) - 2 - r() * 4;
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
  buildLanes(player) {
    const N = this.N;
    if (this.lanes.length !== N) this.lanes = Array.from({ length: N }, () => []);
    for (const l of this.lanes) l.length = 0;
    for (const veh of this.vehicles) {
      this.lanes[veh.lane].push(veh);
      if (veh.state === 'move' && veh.targetLane !== veh.lane) this.lanes[veh.targetLane].push(veh);
    }
    if (player) for (const li of player.lanesOcc) if (li >= 0 && li < N) this.lanes[li].push(player);
    for (const l of this.lanes) l.sort((a, b) => a.u - b.u);
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
    const L = this.lanes;
    const lead = leaderIn(L[lane], veh);
    let a = idm(veh, lead);
    if (veh.v > EURO_RULE_MIN_SPEED && lane + 1 < this.N) {
      const ll = leaderIn(L[lane + 1], veh);
      if (ll && ll.v < veh.v && ll.v > 40 * KMH && (veh.strict || ll.v > veh.v0 - 9 * KMH)) {
        const g = gapBetween(ll, veh);
        if (g > 0 && g < 150) a = Math.min(a, Math.max(idm(veh, ll, 0.45), -1.8));
      }
    }
    return a;
  }

  computeAcc(veh) {
    let a = this.laneAcc(veh, veh.lane);
    if (veh.state === 'move' && veh.targetLane !== veh.lane) a = Math.min(a, this.laneAcc(veh, veh.targetLane));
    veh.accPure = a;
    a = this.anticipate(veh, a);
    // cooperation: ease off to let a signalling vehicle ahead in the next lane merge in front
    if (veh.coop) {
      const L = this.lanes;
      for (const side of [-1, 1]) {
        const ln = veh.lane + side;
        if (ln < 0 || ln >= this.N) continue;
        const list = L[ln];
        let i = firstAbove(list, veh.u - veh.len);
        for (let n = 0; n < 4 && i < list.length; n++, i++) {
          const e = list[i];
          if (e === veh || e.signalLane !== veh.lane) continue;
          const g = gapBetween(e, veh);
          if (g < 1 || g > 55) continue;
          if (e.v < veh.v - 6) continue; // way slower: not a sensible merge
          const ac = idm(veh, e, 0.45);
          a = Math.min(a, Math.max(ac, -1.6));
        }
      }
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
    const L = this.lanes;
    const reach = 30 + veh.v * 5 * an; // how far ahead this driver reads, m
    veh.anticOn = null;
    for (const side of [-1, 1]) {
      const ln = veh.lane + side;
      if (ln < 0 || ln >= this.N) continue;
      const list = L[ln];
      let i = firstAbove(list, veh.u);
      for (let n = 0; n < 3 && i < list.length; n++, i++) {
        const e = list[i];
        if (e === veh) continue;
        const g = gapBetween(e, veh);
        if (g > reach) break;
        if (g < 2 || e.v >= veh.v) continue; // alongside, or not slower: no conflict
        let likely = 0;
        if (e.signalLane === veh.lane) likely = 1;
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

  /** MOBIL evaluation of moving veh into lane t. */
  evaluate(veh, t) {
    const L = this.lanes;
    const cur = L[veh.lane];
    const tgt = L[t];
    const nl = leaderIn(tgt, veh);
    const nf = followerIn(tgt, veh);
    let safe = true;
    if (nl) {
      const g = gapBetween(nl, veh);
      if (g < 2 + veh.v * 0.3 + Math.max(0, veh.v - nl.v) * 1.2) safe = false;
    }
    if (nf) {
      const g = gapBetween(veh, nf);
      const ts = nf.isPlayer ? veh.tSafePlayer : veh.tSafe;
      if (g < 2 + nf.v * ts + Math.max(0, nf.v - veh.v) * 2.2) safe = false;
      const anf = idm(nf, veh);
      if (anf < -(nf.isPlayer ? 1.0 : veh.bSafe)) safe = false;
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
    const kv = veh.type === 'truck' ? 0.15 * veh.eager : 0.15;
    const selfish = aNew - aOld + kv * (this.expSpeed(veh, nl) - this.expSpeed(veh, ol));
    let inc = selfish + p * (dNf + dOf);
    // hoggers like the middle, not the far left
    const baseBias = veh.hogger && veh.lane === this.N - 1 && this.N >= 3 ? 0.2 : veh.bias;
    const bias = baseBias + (veh.pressureT > 0 ? 0.25 : 0);
    const left = t > veh.lane;
    const need = left ? veh.thr + bias : veh.thr - bias;
    // Nobody moves LEFT just to be nice to the car behind: politeness may hold
    // back an overtake, but the driver must gain something themselves. (Flashed
    // drivers are the exception: they're pressed to move, handled by bias.)
    const wants = inc > need && (!left || selfish > veh.thr * 0.5);
    return { safe, inc, wants, margin: inc - need };
  }

  laneLogic(veh, dt) {
    const N = this.N;
    veh.pressureT = Math.max(0, veh.pressureT - dt);
    if (veh.indOffT > 0) {
      veh.indOffT -= dt;
      if (veh.indOffT <= 0) veh.indicator = 0;
    }
    if (veh.state === 'none') {
      veh.cooldown -= dt;
      veh.decT -= dt;
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
      if (!best) return;
      const left = best.t > veh.lane;
      // Signal if safe, or signal and wait for a gap when we really want it:
      // going left to overtake, or going right (keep-right / back in after an
      // overtake), where signalling lets cooperative drivers make room.
      const waitAndSignal = left ? best.ev.margin > 0.25 && this.rng() < 0.35 : best.ev.margin > 0.1 && this.rng() < 0.5;
      if (best.ev.safe || waitAndSignal) {
        veh.state = 'signal';
        veh.targetLane = best.t;
        veh.signalLane = best.t;
        veh.signalT = 0;
        veh.recheckT = 1;
        veh.indicator = left ? -1 : 1;
        veh.indOffT = 0;
      }
    } else if (veh.state === 'signal') {
      veh.signalT += dt;
      veh.recheckT -= dt;
      const t = veh.targetLane;
      if (veh.signalT >= veh.tSignal) {
        const ev = this.evaluate(veh, t);
        if (ev.safe && ev.margin > -0.3) {
          veh.state = 'move';
          veh.lcT = 0;
          return;
        }
        if (veh.recheckT <= 0) {
          veh.recheckT = 1;
          if (ev.margin < -0.15 || veh.signalT > veh.tSignal + 8) this.cancelChange(veh);
        }
      }
    } else if (veh.state === 'move') {
      veh.lcT += dt / veh.lcDur;
      if (veh.lcT < 0.3) {
        // abort if it suddenly became dangerous
        const nf = followerIn(this.lanes[veh.targetLane], veh);
        if (nf && nf !== veh && idm(nf, veh) < -5) {
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
        veh.signalLane = -1;
        veh.indOffT = 0.3 + this.rng() * 0.8;
        veh.cooldown = 2.5 + this.rng() * 5;
      }
    }
  }

  cancelChange(veh) {
    veh.state = 'none';
    veh.signalLane = -1;
    veh.targetLane = veh.lane;
    veh.indOffT = 0.2;
    veh.cooldown = 1.5 + this.rng() * 2;
  }

  // ---------------- spawning ----------------
  /** Try to insert a vehicle at road position s. Returns vehicle or null. */
  insertAt(s, lane, type, variant, opts = {}) {
    const veh = this.makeVehicle(type, variant);
    lane = lane ?? this.pickLane(veh);
    if (lane > this.maxLaneFor(veh)) lane = 0;
    veh.lane = veh.targetLane = lane;
    veh.u = this.dir * s;
    const list = this.lanes[lane];
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
    veh.latLocal = laneLat(lane);
    this.vehicles.push(veh);
    // keep lane list consistent for subsequent inserts this frame
    const idx = firstAbove(list, veh.u);
    list.splice(idx, 0, veh);
    this.onAdd(veh);
    return veh;
  }

  densityFactor(s) {
    return clamp(1 + 0.32 * Math.sin(s / 3900 + 1.3) + 0.18 * Math.sin(s / 1370), 0.45, 1.6);
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
  }

  // ---------------- main step ----------------
  step(dt, sPlayer, player) {
    this.time += dt;
    this.buildLanes(player);
    for (const veh of this.vehicles) {
      veh.v0 = veh.v0base * (1 + 0.012 * Math.sin(this.time * veh.jitterW + veh.jitterPh));
      veh.acc = this.computeAcc(veh);
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
        const p = lcProfile(veh.lcT);
        lat = laneLat(veh.lane) + (laneLat(veh.targetLane) - laneLat(veh.lane)) * p;
      } else {
        lat = laneLat(veh.lane);
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
