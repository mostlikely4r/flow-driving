// Matrix signs (MSI, "matrixborden") and what drives them, like the Dutch
// motorway traffic management system:
//
//  * Queue warning (automatische incidentdetectie): when traffic just past a
//    gantry crawls (< ~35 km/h), that gantry and the one before it show a
//    flashing 50, the one before that a flashing 70. Clears by itself.
//  * Lane closures: a red cross over the closed lane from the gantry before
//    the closure until it ends, a diagonal arrow (move over) one gantry
//    earlier, and lower speeds over the open lanes.
//  * End of restrictions: the first gantry after a restricted one.
//
// A number applies from its gantry to the next one; drivers start adapting
// when they can read the next sign (~250 m). Pure logic, no rendering.
import { CONFIG } from './config.js';
import { KMH } from './util.js';

export const GANTRY_EVERY = 500;
export const GANTRY_OFFSET = 160;
export const gantryS = (i) => GANTRY_OFFSET + i * GANTRY_EVERY;
export const gantryIndexAt = (s) => Math.floor((s - GANTRY_OFFSET) / GANTRY_EVERY); // last gantry at or before s

const AID_SLOW = 35 * KMH; // detector threshold
const AID_HOLD = 25; // s the warning stays after traffic recovers
const READ_AHEAD = 250; // m: drivers adapt to the next sign from here

export class MSI {
  constructor(traffic) {
    this.traffic = traffic;
    this.faces = new Map(); // gantry index -> [{face, flash}] per lane (face: '', number, 'x', 'arrowL', 'arrowR', 'end')
    this.aidUntil = new Map(); // gantry index -> time the queue warning holds until
    this.t = 0;
    this.timer = 0;
    this.version = 0; // bumps when faces change (for the renderer)
  }

  /** Face shown over a lane at gantry i. */
  face(i, lane) {
    const f = this.faces.get(i);
    return f ? f[lane] : null;
  }

  /** Speed limit (km/h) a driver in `lane` at road position s obeys, or null. */
  limitAt(s, lane) {
    const i = gantryIndexAt(s);
    let lim = null;
    const cur = this.face(i, lane);
    if (cur && typeof cur.face === 'number') lim = cur.face;
    // the next sign, once you can read it, if it asks for less
    if (gantryS(i + 1) - s < READ_AHEAD) {
      const nx = this.face(i + 1, lane);
      if (nx && typeof nx.face === 'number') lim = lim == null ? nx.face : Math.min(lim, nx.face);
      else if (nx && nx.face === 'end') lim = lim; // keep until you pass it
    }
    return lim;
  }

  update(dt, sCenter) {
    this.t += dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    const tr = this.traffic;
    const N = CONFIG.lanes;
    const iA = gantryIndexAt(sCenter - 1200), iB = gantryIndexAt(sCenter + 2000) + 1;

    // --- queue detection: mean speed on the 500 m after each gantry
    const sum = new Map(), cnt = new Map();
    for (const veh of tr.vehicles) {
      const i = gantryIndexAt(tr.dir * veh.u);
      if (i < iA || i > iB) continue;
      sum.set(i, (sum.get(i) || 0) + veh.v);
      cnt.set(i, (cnt.get(i) || 0) + 1);
    }
    for (let i = iA; i <= iB; i++) {
      const n = cnt.get(i) || 0;
      if (n >= 4 && sum.get(i) / n < AID_SLOW) this.aidUntil.set(i, this.t + AID_HOLD);
    }
    for (const [i, until] of this.aidUntil) if (until < this.t || i < iA - 4) this.aidUntil.delete(i);

    // --- compose faces
    const next = new Map();
    const get = (i) => {
      if (!next.has(i)) next.set(i, Array.from({ length: N }, () => ({ face: '', flash: false })));
      return next.get(i);
    };
    const setNum = (i, lane, n, flash) => {
      const f = get(i)[lane];
      if (f.face === 'x' || f.face === 'arrowL' || f.face === 'arrowR') return;
      if (typeof f.face !== 'number' || n < f.face) f.face = n;
      f.flash = f.flash || flash;
    };
    const limit = tr.limitKmh;
    for (const [i] of this.aidUntil) {
      // the gantry over the slow stretch and the one before: 50; before that: 70
      for (let l = 0; l < N; l++) {
        setNum(i, l, 50, true);
        setNum(i - 1, l, 50, true);
        if (limit > 70) setNum(i - 2, l, 70, true);
      }
    }
    for (const c of tr.closures) {
      if (c.lane >= N) continue;
      const ix = gantryIndexAt(c.s0 - 60); // last gantry at least 60 m before the closure
      const iEnd = gantryIndexAt(c.s1 - 1);
      for (let i = ix; i <= iEnd; i++) get(i)[c.lane] = { face: 'x', flash: false };
      // move over: toward the side with an open lane, preferring right
      const toRight = c.lane > 0 && !tr.closures.some((o) => o !== c && o.lane === c.lane - 1 && o.s0 < c.s1 && o.s1 > c.s0);
      const arrow = toRight ? 'arrowR' : 'arrowL';
      const fa = get(ix - 1)[c.lane];
      if (fa.face !== 'x') get(ix - 1)[c.lane] = { face: arrow, flash: false };
      for (let l = 0; l < N; l++) {
        if (l === c.lane) continue;
        for (let i = ix; i <= iEnd; i++) setNum(i, l, Math.min(70, limit), false);
        if (limit > 90) setNum(ix - 1, l, 90, false);
      }
    }
    // end of restrictions after a restricted gantry
    for (const [i, lanes] of [...next]) {
      if (!lanes.some((f) => f.face !== '')) continue;
      if (next.has(i + 1) && next.get(i + 1).some((f) => f.face !== '')) continue;
      const after = get(i + 1);
      for (const f of after) if (f.face === '') f.face = 'end';
    }
    // changed?
    let changed = next.size !== this.faces.size;
    if (!changed) {
      for (const [i, lanes] of next) {
        const old = this.faces.get(i);
        if (!old || lanes.some((f, l) => f.face !== old[l].face || f.flash !== old[l].flash)) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      this.faces = next;
      this.version++;
    }
  }

  /** Is `lane` closed at road position s (between a closure's start and end)? */
  closedAt(s, lane) {
    return this.traffic.closures.some((c) => c.lane === lane && s >= c.s0 && s <= c.s1);
  }
}
