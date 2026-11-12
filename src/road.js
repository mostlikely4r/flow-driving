// Infinite procedural motorway centre line (the median), generated from
// curvature segments: long straights, clothoid transitions and gentle arcs,
// like a Dutch A-road. Heading convention: forward = (sin h, cos h) in (x, z);
// increasing heading turns LEFT. Right normal = (-cos h, sin h).
import { mulberry32 } from './util.js';

export const ROAD_STEP = 2;

export class Road {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.sStart = -5000;
    this.px = [0];
    this.pz = [0];
    this.ph = [0];
    this.pk = [0];
    this.cx = 0;
    this.cz = 0;
    this.heading = 0;
    this.queue = [{ len: 7000, k0: 0, k1: 0 }]; // start with a long straight around s=0
    this.seg = null;
    this.segPos = 0;
    this._tmp = {};
  }

  get sEnd() {
    return this.sStart + (this.px.length - 1) * ROAD_STEP;
  }

  planMore() {
    const r = this.rng;
    const step2 = (x) => Math.max(ROAD_STEP, Math.round(x / ROAD_STEP) * ROAD_STEP);
    const R = 1700 + r() * 4200;
    const k = (r() < 0.5 ? -1 : 1) / R;
    const trans = step2(160 + r() * 200);
    const arc = step2(250 + r() * 1300);
    this.queue.push({ len: trans, k0: 0, k1: k });
    this.queue.push({ len: arc, k0: k, k1: k });
    if (r() < 0.3) {
      // S-bend: reverse into opposite curve
      const R2 = 1900 + r() * 3500;
      const k2 = -Math.sign(k) / R2;
      this.queue.push({ len: step2(trans * 1.6), k0: k, k1: k2 });
      this.queue.push({ len: step2(250 + r() * 900), k0: k2, k1: k2 });
      this.queue.push({ len: trans, k0: k2, k1: 0 });
    } else {
      this.queue.push({ len: trans, k0: k, k1: 0 });
    }
    this.queue.push({ len: step2(700 + r() * 2600), k0: 0, k1: 0 });
  }

  extend() {
    if (!this.seg || this.segPos >= this.seg.len - 1e-6) {
      if (this.queue.length === 0) this.planMore();
      this.seg = this.queue.shift();
      this.segPos = 0;
    }
    const seg = this.seg;
    const t = (this.segPos + ROAD_STEP * 0.5) / seg.len;
    const k = seg.k0 + (seg.k1 - seg.k0) * t;
    const hm = this.heading + k * ROAD_STEP * 0.5;
    this.cx += Math.sin(hm) * ROAD_STEP;
    this.cz += Math.cos(hm) * ROAD_STEP;
    this.heading += k * ROAD_STEP;
    this.segPos += ROAD_STEP;
    this.px.push(this.cx);
    this.pz.push(this.cz);
    this.ph.push(this.heading);
    this.pk.push(k);
  }

  ensure(s) {
    while (this.sEnd < s + ROAD_STEP * 2) this.extend();
  }

  /** Sample the centre line at s. Returns a reused object unless out given. */
  sample(s, out = this._tmp) {
    this.ensure(s);
    let f = (s - this.sStart) / ROAD_STEP;
    if (f < 0) f = 0;
    const i = Math.floor(f);
    const t = f - i;
    const j = i + 1;
    const x = this.px[i] + (this.px[j] - this.px[i]) * t;
    const z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    const h = this.ph[i] + (this.ph[j] - this.ph[i]) * t;
    const tx = Math.sin(h);
    const tz = Math.cos(h);
    out.x = x;
    out.z = z;
    out.h = h;
    out.k = this.pk[j];
    out.tx = tx;
    out.tz = tz;
    out.nx = -tz; // right normal
    out.nz = tx;
    return out;
  }

  /** World position for (s, lat). */
  toWorld(s, lat, out = {}) {
    const p = this.sample(s);
    out.x = p.x + p.nx * lat;
    out.z = p.z + p.nz * lat;
    out.h = p.h;
    out.k = p.k;
    return out;
  }

  /** Project a world point onto the road, starting from a guess. */
  project(x, z, sGuess, out = {}) {
    let s = sGuess;
    let p;
    for (let it = 0; it < 4; it++) {
      p = this.sample(s);
      const dx = x - p.x;
      const dz = z - p.z;
      const along = dx * p.tx + dz * p.tz;
      s += along;
      if (Math.abs(along) < 1e-4) break;
    }
    p = this.sample(s);
    out.s = s;
    out.lat = (x - p.x) * p.nx + (z - p.z) * p.nz;
    out.h = p.h;
    out.k = p.k;
    return out;
  }
}
