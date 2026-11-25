// Proefrit (F-37) slice 2: the driver's-seat view.
//
// This is the ONLY code that reads a Traffic vehicle. It copies a whitelist of
// fields (ALLOWED) and derives the rest: gaps, time gaps, closing speed, TTC,
// lane occupancy from body position, lateral drift, and how long a cue has been
// visible. No intent, no state, no targetLane, no persona, no `p`, no `v0`:
// what a driver could not see does not exist here.
//
// Render-free on purpose (no Three.js, no DOM, no clock).
import { CONFIG, speedLimitKmh } from './config.js';
import { KMH } from './util.js';
import { laneLat, laneAt, lanesOccupied } from './layout.js';
import { gantryIndexAt, gantryS } from './msi.js';

export const ALLOWED = ['id', 'type', 'variant', 'len', 'width', 'u', 'latLocal', 'v', 'indicator', 'brake'];

const READ_AHEAD = 250; // m: when the next gantry's faces are readable

/** Copy the whitelisted fields of a Traffic vehicle. */
export function observe(veh) {
  const o = {};
  for (let i = 0; i < ALLOWED.length; i++) o[ALLOWED[i]] = veh[ALLOWED[i]];
  return o;
}

export class Perception {
  constructor({ lanes = CONFIG.lanes } = {}) {
    this.lanes = Math.max(1, lanes | 0);
    this.reset();
  }

  reset() {
    this.hist = new Map(); // id -> [{ t, lat }] over the last histS
    this.cue = new Map(); // id -> { first, ind, indSince, brake, brakeSince }
  }

  /**
   * @param {number} t driving time (s)
   * @param {object} player the real Player: its own dashboard is fair game
   * @param {object} traffic the Traffic sim (only vehicles/closures are read)
   * @param {object|null} msi matrix signs
   * @param {number} limitKmh the limit that applies to you right now
   */
  update(t, player, traffic, msi, limitKmh) {
    const cfg = CONFIG.perception;
    const N = this.lanes;
    const pLane = player.lane;
    const pOcc = player.lanesOcc && player.lanesOcc.length ? player.lanesOcc.slice() : [pLane];
    const plen = player.len;
    const pv = player.vAlong;
    const adjacentLane = (lane) => (pOcc.length ? pOcc.some((p) => Math.abs(lane - p) <= 1) : Math.abs(lane - pLane) <= 1);

    // ---- own car (visible from the seat)
    const self = {
      s: player.s,
      lane: pLane,
      lanesOcc: pOcc,
      lat: player.lat,
      off: player.lat - laneLat(pLane),
      kmh: pv / KMH,
      v: pv,
      acc: player.acc,
      ind: player.ind,
      steer: player.steerVis,
      headingErr: player.headingErr,
      cc: { on: player.cc.on, set: player.cc.set, has: player.cc.has },
      limitKmh: limitKmh ?? speedLimitKmh(),
      lanes: N,
    };

    // ---- other cars
    // Two passes: what is in range at all, then which of those a tall vehicle
    // between us and it hides. A hidden car is not a cue, so it is dropped
    // before anything is derived from it (gaps, lane views, drift history).
    const cand = [];
    for (const veh of traffic.vehicles || []) {
      const o = observe(veh);
      const dl = o.u - player.s;
      const vLat = o.latLocal;
      const vOcc = lanesOccupied(vLat, o.width / 2, 0.3);
      const vLane = laneAt(vLat);
      const adjacent = vOcc.length ? vOcc.some((l) => pOcc.some((p) => Math.abs(l - p) <= 1)) : adjacentLane(vLane);
      const inRange = dl >= -cfg.behindM && dl <= cfg.aheadM;
      const visible = (inRange && adjacent) || Math.abs(dl) <= cfg.farM;
      if (!visible) continue;
      cand.push({ o, dl, vLat, vOcc, vLane, adjacent });
    }
    const blockers = cand.filter((c) => cfg.occludeTypes.includes(c.o.type));
    const eyeS = player.s + cfg.eyeM;
    const eyeLat = player.lat;

    const cars = [];
    const alive = new Set();
    for (const { o, dl, vLat, vOcc, vLane } of cand) {
      if (blockers.length && hidden(blockers, { o, dl }, eyeS, eyeLat, cfg)) continue;
      alive.add(o.id);

      // lateral history → slope (never read from the sim)
      let hist = this.hist.get(o.id);
      if (!hist) this.hist.set(o.id, (hist = []));
      if (!hist.length || hist[hist.length - 1].t < t) hist.push({ t, lat: vLat });
      while (hist.length > 2 && t - hist[0].t > cfg.histS) hist.shift();
      const latRate = slope(hist);
      const off = vLat - laneLat(vLane);
      const sign = Math.sign(off);
      const drift = Math.abs(off) > cfg.driftEps && (Math.abs(latRate) < 1e-4 || Math.sign(latRate) === sign) ? sign : 0;

      // cue memory: how long this state has been visible
      let c = this.cue.get(o.id);
      if (!c) {
        c = { first: t, ind: o.indicator | 0, indSince: t, brake: !!o.brake, brakeSince: t };
        this.cue.set(o.id, c);
      } else {
        if ((o.indicator | 0) !== c.ind) {
          c.ind = o.indicator | 0;
          c.indSince = t;
        }
        if (Boolean(o.brake) !== c.brake) {
          c.brake = !!o.brake;
          c.brakeSince = t;
        }
      }

      const ahead = dl >= 0;
      const gap = ahead ? dl - (o.len + plen) / 2 : -dl - (o.len + plen) / 2;
      const relKmh = (o.v - pv) / KMH;
      const closing = ahead ? pv - o.v : o.v - pv;
      const ttc = closing > 0.1 ? gap / closing : Infinity;
      const tgap = ahead ? gap / Math.max(pv, 1) : gap / Math.max(o.v, 1);

      cars.push({
        id: o.id,
        type: o.type,
        variant: o.variant,
        len: o.len,
        width: o.width,
        side: ahead ? 'ahead' : 'behind',
        dl,
        gap,
        tgap,
        relKmh,
        closing,
        ttc,
        lane: vLane,
        lanesOcc: vOcc,
        off,
        latRate,
        drift,
        kmh: o.v / KMH,
        ind: o.indicator | 0,
        indAge: t - c.indSince,
        brake: !!o.brake,
        brakeAge: t - c.brakeSince,
        seenAge: t - c.first,
      });
    }
    cars.sort((a, b) => Math.abs(a.dl) - Math.abs(b.dl));
    this.prune(t, alive);

    // ---- per-lane nearest cars
    const lanes = [];
    for (let i = 0; i < N; i++) {
      const visibleAheadM = adjacentLane(i) ? cfg.aheadM : cfg.farM;
      const visibleBehindM = adjacentLane(i) ? cfg.behindM : cfg.farM;
      let ahead = null, behind = null;
      for (const c of cars) {
        const inLane = c.lanesOcc.length ? c.lanesOcc.includes(i) : c.lane === i;
        if (!inLane) continue;
        if (c.dl >= 0) {
          if (!ahead || c.dl < ahead.dl) ahead = c;
        } else if (!behind || c.dl > behind.dl) behind = c;
      }
      lanes.push({
        ahead,
        behind,
        freeAheadM: ahead ? ahead.gap : visibleAheadM,
        freeBehindM: behind ? behind.gap : visibleBehindM,
        visibleAheadM,
        visibleBehindM,
      });
    }

    // ---- closures that are in view: a stopped obstacle, never a vehicle
    const obstacles = [];
    for (const c of traffic.closures || []) {
      const dAhead = c.s0 - player.s;
      if (dAhead > cfg.aheadM) continue;
      if (c.lane !== pLane && !pOcc.includes(c.lane) && Math.abs(c.lane - pLane) !== 1) continue;
      obstacles.push({ lane: c.lane, dAhead, len: c.s1 - c.s0 });
    }
    obstacles.sort((a, b) => a.dAhead - b.dAhead);

    // ---- matrix signs: the current gantry, and the next once readable
    let cur = null, next = null, nextGantryM = Infinity;
    if (msi) {
      const i = gantryIndexAt(player.s);
      nextGantryM = gantryS(i + 1) - player.s;
      cur = signFaces(msi, i, N);
      if (nextGantryM <= READ_AHEAD) next = signFaces(msi, i + 1, N);
    }

    return {
      t,
      self,
      cars,
      lanes,
      obstacles,
      signs: { limitKmh: self.limitKmh, nextGantryM, cur, next },
    };
  }

  prune(t, alive) {
    // Keep memory for cars that just left the view for a moment, but not forever.
    for (const [id, hist] of this.hist) {
      if (alive.has(id)) continue;
      if (!hist.length || t - hist[hist.length - 1].t > 3) this.hist.delete(id);
    }
    for (const id of this.cue.keys()) {
      const hist = this.hist.get(id);
      if (!alive.has(id) && (!hist || !hist.length || t - hist[hist.length - 1].t > 3)) this.cue.delete(id);
    }
  }
}

/**
 * Is `target` hidden behind one of the tall vehicles in `blockers`?
 *
 * A 2D line-of-sight test on the straightened road: the sight line runs from the
 * driver's eye to the middle of the target's near face (`u`), and a truck or van
 * whose body rectangle that line crosses blocks it. Anything inside
 * `nearUnhiddenM` is close enough to see past, and an occluder must lie between
 * the eye and the target, so a car further away can never hide a closer one.
 */
function hidden(blockers, target, eyeS, eyeLat, cfg) {
  const o = target.o;
  // the face of the target you can see: its nose if it is ahead, its tail if it is behind
  const nearU = target.dl >= 0 ? o.u - o.len / 2 : o.u + o.len / 2;
  if (Math.abs(nearU - eyeS) < cfg.nearUnhiddenM) return false;
  const span = nearU - eyeS;
  const targetLat = o.latLocal;
  const segA = Math.min(eyeS, nearU);
  const segB = Math.max(eyeS, nearU);
  const latAt = (u) => eyeLat + ((targetLat - eyeLat) * (u - eyeS)) / span;
  for (const b of blockers) {
    const bo = b.o;
    if (bo.id === o.id) continue;
    const lo = Math.max(segA, bo.u - bo.len / 2);
    const hi = Math.min(segB, bo.u + bo.len / 2);
    if (hi < lo) continue; // not between us and it
    const lA = bo.latLocal - bo.width / 2;
    const lB = bo.latLocal + bo.width / 2;
    const h1 = latAt(lo);
    const h2 = latAt(hi);
    // lat is monotonic along the segment, so the line crosses the body when its
    // two ends straddle the body's lateral span
    if (Math.max(h1, h2) >= lA && Math.min(h1, h2) <= lB) return true;
  }
  return false;
}

/** Least-squares slope of lat over t. */function slope(hist) {
  const n = hist.length;
  if (n < 2) return 0;
  const t0 = hist[0].t;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const h of hist) {
    const x = h.t - t0;
    sx += x;
    sy += h.lat;
    sxx += x * x;
    sxy += x * h.lat;
  }
  const den = n * sxx - sx * sx;
  return den > 1e-9 ? (n * sxy - sx * sy) / den : 0;
}

/** What a gantry shows over each lane: '' | number | 'x' | 'arrowL' | 'arrowR' | 'end'. */
function signFaces(msi, i, N) {
  const out = [];
  for (let l = 0; l < N; l++) {
    const f = msi.face(i, l);
    out.push(f ? f.face : '');
  }
  return out;
}
