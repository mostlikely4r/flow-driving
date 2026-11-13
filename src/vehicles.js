// Procedural vehicle models. Geometry is built once per variant and merged
// per material slot; every vehicle instance gets its own light materials so
// brake lights / indicators / headlights can be driven individually.
// Model space: +Z forward, +Y up, +X = LEFT side of the vehicle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VARIANTS } from './variants.js';
import { pickWeighted } from './util.js';

// ---------------- geometry helpers ----------------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

class Parts {
  constructor() {
    this.slots = {};
  }
  add(slot, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.applyMatrix4(_m);
    (this.slots[slot] ||= []).push(g);
    return this;
  }
  box(slot, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(slot, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }
  /** thin slab spanning between (z1,y1) and (z2,y2) in the YZ plane, width along X */
  slab(slot, w, z1, y1, z2, y2, t = 0.03, x = 0, outward = 0) {
    const dz = z2 - z1, dy = y2 - y1;
    const len = Math.hypot(dz, dy);
    // outward normal in (z,y): (dy, -dz)/len  -> points forward/up for a windshield going up-back
    const nz = dy / len, ny = -dz / len;
    const cz = (z1 + z2) / 2 + nz * outward;
    const cy = (y1 + y2) / 2 + ny * outward;
    const ang = Math.atan2(-dy, dz);
    return this.add(slot, new THREE.BoxGeometry(w, t, len), x, cy, cz, ang, 0, 0);
  }
  wheel(x, y, z, r, w, rimF = 0.62) {
    const tyre = new THREE.CylinderGeometry(r, r, w, 18);
    this.add('trim', tyre, x, y, z, 0, 0, Math.PI / 2);
    const rim = new THREE.CylinderGeometry(r * rimF, r * rimF, w + 0.012, 14);
    this.add('chrome', rim, x, y, z, 0, 0, Math.PI / 2);
    return this;
  }
  extrudeSide(slot, pts, width, bevel = 0.04) {
    const shape = new THREE.Shape(pts.map(([zz, yy]) => new THREE.Vector2(zz, yy)));
    const bt = Math.min(bevel, width * 0.2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.01, width - 2 * bt),
      bevelEnabled: bevel > 0,
      bevelThickness: bt,
      bevelSize: bevel * 0.8,
      bevelSegments: 2,
      curveSegments: 4,
    });
    geo.translate(0, 0, -(width - 2 * bt) / 2);
    // shape x -> model z (forward), shape z -> model -x
    geo.rotateY(-Math.PI / 2);
    return this.add(slot, geo);
  }
  build() {
    const out = {};
    for (const [k, list] of Object.entries(this.slots)) {
      out[k] = mergeGeometries(list, false);
      out[k].computeBoundingSphere();
      for (const g of list) g.dispose();
    }
    return out;
  }
}

// ---------------- car-like bodies ----------------
const CAR_SPECS = {
  hatch: { L: 4.1, W: 1.78, H: 1.47, belt: 0.95, clr: 0.17, hood: 0.95, ws: 0.82, deck: 0.22, rw: 0.38, noseH: 0.74, tailH: 1.0, wr: 0.31 },
  sedan: { L: 4.75, W: 1.83, H: 1.45, belt: 0.93, clr: 0.16, hood: 1.2, ws: 0.88, deck: 0.95, rw: 0.62, noseH: 0.72, tailH: 0.98, wr: 0.32 },
  estate: { L: 4.8, W: 1.84, H: 1.5, belt: 0.95, clr: 0.16, hood: 1.12, ws: 0.86, deck: 0.12, rw: 0.22, noseH: 0.74, tailH: 1.02, wr: 0.32 },
  suv: { L: 4.65, W: 1.9, H: 1.7, belt: 1.1, clr: 0.22, hood: 1.05, ws: 0.72, deck: 0.18, rw: 0.28, noseH: 0.95, tailH: 1.16, wr: 0.36 },
};

function emitter(kind, x, y, z, dz, size = 1) {
  return { kind, pos: new THREE.Vector3(x, y, z), dir: new THREE.Vector3(0, 0, dz), size };
}

/** Bottom edge of a side profile with wheel arches cut out, rear to front. */
function archedSill(z0, z1, y, wheels, wr, ra) {
  const pts = [[z0, y]];
  for (const wz of wheels) {
    pts.push([wz - ra, y]);
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i / 8) * Math.PI;
      pts.push([wz + ra * Math.cos(a), wr + ra * Math.sin(a)]);
    }
    pts.push([wz + ra, y]);
  }
  pts.push([z1, y]);
  return pts;
}

/** Dark wheel well behind the arch so you can't see through the car. */
function wheelWell(P, W, y, wz, wr, ra) {
  const top = wr + ra;
  P.box('trim', W - 0.5, top - y, ra * 2 - 0.04, 0, (top + y) / 2, wz);
}

// Round lens facing along z.
function disc(P, slot, rad, x, y, z, depth = 0.05) {
  return P.add(slot, new THREE.CylinderGeometry(rad, rad, depth, 16), x, y, z, Math.PI / 2, 0, 0);
}

/**
 * Head and tail lamps. Signatures:
 *   std    rectangular lamps (older / ordinary car)
 *   modern slimmer lamps, cool white, split tail glow
 *   bar    slim LED headlamps with a running-light strip, full-width rear light bar (leasebak)
 *   angel  small round projectors with ring running lights, smoked tails (patser)
 *   round  big round warm lamps, pairs of small round tails (pensioner)
 *   eco    small twin projectors, L-shaped tails (grijze sok)
 *   tall   squarer lamps, tall vertical tails up the rear pillars (family)
 *   ev     one thin light line across the nose and one across the tail (EV smoothie)
 */
function carLamps(P, em, W, f, r, hy, ty, sig) {
  for (const sx of [1, -1]) {
    const hx = sx * (W / 2 - 0.23), tx = sx * (W / 2 - 0.2);
    // ---- front
    if (sig === 'round') {
      disc(P, 'head', 0.085, hx, hy + 0.01, f + 0.02);
      em.push(emitter('head', hx, hy + 0.01, f + 0.08, 1, 1.15));
    } else if (sig === 'angel') {
      disc(P, 'head', 0.055, hx, hy, f + 0.02);
      em.push(emitter('head', hx, hy, f + 0.08, 1, 0.85));
      P.add('drl', new THREE.TorusGeometry(0.085, 0.013, 6, 20), hx, hy, f + 0.035);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        em.push(emitter('drl', hx + Math.cos(a) * 0.085, hy + Math.sin(a) * 0.085, f + 0.08, 1, 0.32));
      }
    } else if (sig === 'bar') {
      P.box('head', 0.34, 0.06, 0.06, hx, hy - 0.01, f + 0.02);
      em.push(emitter('head', hx, hy - 0.01, f + 0.08, 1, 0.9));
      P.box('drl', 0.36, 0.022, 0.05, hx - sx * 0.01, hy + 0.045, f + 0.015);
      for (const k of [-1.5, -0.5, 0.5, 1.5]) em.push(emitter('drl', hx - sx * 0.01 + k * 0.085, hy + 0.045, f + 0.07, 1, 0.42));
    } else if (sig === 'tall') {
      P.box('head', 0.32, 0.13, 0.06, hx, hy, f + 0.02);
      em.push(emitter('head', hx, hy, f + 0.08, 1));
    } else if (sig === 'ev') {
      // small projectors under the light line (the line itself is added below)
      P.box('head', 0.14, 0.05, 0.06, hx, hy - 0.07, f + 0.02);
      em.push(emitter('head', hx, hy - 0.07, f + 0.08, 1, 0.8));
    } else if (sig === 'eco') {
      for (const k of [-1, 1]) {
        P.box('head', 0.1, 0.07, 0.06, hx + k * 0.08, hy, f + 0.02);
        em.push(emitter('head', hx + k * 0.08, hy, f + 0.08, 1, 0.7));
      }
    } else if (sig === 'modern') {
      P.box('head', 0.38, 0.075, 0.06, hx, hy, f + 0.02);
      em.push(emitter('head', hx, hy, f + 0.08, 1));
    } else {
      P.box('head', 0.36, 0.1, 0.06, hx, hy, f + 0.02);
      em.push(emitter('head', hx, hy, f + 0.08, 1));
    }
    // ---- rear
    if (sig === 'round') {
      for (const k of [-1, 1]) {
        disc(P, 'tail', 0.055, tx + k * 0.08, ty, r - 0.03);
        em.push(emitter('tail', tx + k * 0.08, ty, r - 0.08, -1, 0.6));
      }
    } else if (sig === 'bar') {
      P.box('tail', 0.3, 0.07, 0.06, tx, ty + 0.02, r - 0.03);
      em.push(emitter('tail', tx, ty + 0.02, r - 0.08, -1, 0.8));
    } else if (sig === 'tall') {
      // tall upright strips at the corners, up toward the roof
      P.box('tail', 0.09, 0.5, 0.06, tx + sx * 0.1, ty + 0.14, r - 0.03);
      for (const k of [-0.06, 0.12, 0.3]) em.push(emitter('tail', tx + sx * 0.1, ty + k, r - 0.08, -1, 0.5));
    } else if (sig === 'ev') {
      // only the full-width line (below)
    } else if (sig === 'eco') {
      // an L: a vertical strip at the outer edge, a short arm running inward
      const ox = tx + sx * 0.12;
      P.box('tail', 0.045, 0.22, 0.06, ox, ty - 0.03, r - 0.03);
      P.box('tail', 0.24, 0.045, 0.06, ox - sx * 0.12, ty - 0.12, r - 0.03);
      for (const k of [0.06, -0.03, -0.12]) em.push(emitter('tail', ox, ty + k, r - 0.08, -1, 0.42));
      for (const k of [0.09, 0.18]) em.push(emitter('tail', ox - sx * k, ty - 0.12, r - 0.08, -1, 0.42));
    } else if (sig === 'modern') {
      P.box('tail', 0.4, 0.08, 0.06, tx, ty + 0.02, r - 0.03);
      em.push(emitter('tail', tx - sx * 0.08, ty + 0.02, r - 0.08, -1, 0.75));
      em.push(emitter('tail', tx + sx * 0.1, ty + 0.02, r - 0.08, -1, 0.75));
    } else {
      P.box('tail', 0.38, 0.13, 0.06, tx, ty, r - 0.03);
      em.push(emitter('tail', tx, ty, r - 0.08, -1));
    }
  }
  if (sig === 'ev') {
    // one thin line across the front and one across the back
    const half = W / 2 - 0.12;
    P.box('drl', half * 2, 0.025, 0.05, 0, hy + 0.03, f + 0.015);
    P.box('tail', half * 2, 0.04, 0.05, 0, ty + 0.02, r - 0.025);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = -half + ((i + 0.5) / n) * half * 2;
      em.push(emitter('drl', x, hy + 0.03, f + 0.07, 1, 0.36));
      em.push(emitter('tail', x, ty + 0.02, r - 0.07, -1, 0.42));
    }
  }
  if (sig === 'bar') {
    // full-width light bar between the tail lamps
    const half = W / 2 - 0.36;
    P.box('tail', half * 2, 0.03, 0.05, 0, ty + 0.035, r - 0.025);
    const n = 6;
    for (let i = 0; i < n; i++) em.push(emitter('tail', -half + ((i + 0.5) / n) * half * 2, ty + 0.035, r - 0.07, -1, 0.42));
  }
}

function buildCarBody(P, sp, em, extraRear = 0, sig = 'std') {
  const { L, W, H, belt, clr, hood, ws, deck, rw, noseH, tailH, wr } = sp;
  const f = L / 2, r = -L / 2;
  const wz1 = f - 0.82, wz2 = r + 0.78;
  const ra = wr + (sp.archGap ?? 0.07);
  P.extrudeSide('paint', [
    ...archedSill(r + 0.12, f - 0.25, clr, [wz2, wz1], wr, ra),
    [f, clr + 0.24],
    [f, noseH - 0.07],
    [f - 0.14, noseH],
    [f - hood, belt],
    [r + deck, belt],
    [r + 0.03, tailH],
    [r, clr + 0.24],
  ], W, 0.05);
  // greenhouse (glass)
  const ax = f - hood, bx = f - hood - ws, cx = r + deck + rw, dx = r + deck;
  P.extrudeSide('glass', [
    [ax + 0.02, belt - 0.03],
    [bx, H - 0.03],
    [cx, H - 0.03],
    [dx - 0.02, belt - 0.03],
  ], W - 0.2, 0.03);
  // roof
  P.extrudeSide('paint', [
    [bx + 0.06, H - 0.07],
    [cx - 0.05, H - 0.07],
    [cx - 0.02, H + 0.01],
    [bx + 0.02, H + 0.01],
  ], W - 0.16, 0.03);
  // pillars
  for (const sx of [1, -1]) {
    const px = sx * (W / 2 - 0.1);
    P.slab('paint', 0.08, ax, belt, bx, H, 0.07, px, 0.0); // A
    P.slab('paint', 0.1, dx, belt, cx, H, 0.07, px, 0.0); // C / D
    const mid = (bx + cx) / 2 + 0.1;
    P.box('paint', 0.05, H - belt, 0.12, sx * (W / 2 - 0.08), (H + belt) / 2, mid); // B
    // side mirrors
    P.box('paint', 0.2, 0.11, 0.12, sx * (W / 2 + 0.07), belt + 0.06, ax - 0.12);
    P.box('glass', 0.15, 0.08, 0.01, sx * (W / 2 + 0.08), belt + 0.06, ax - 0.185);
  }
  // wheels
  for (const sx of [1, -1]) {
    P.wheel(sx * (W / 2 - 0.12), wr, wz1, wr, 0.22, sp.rimF);
    P.wheel(sx * (W / 2 - 0.12), wr, wz2, wr, 0.22, sp.rimF);
  }
  wheelWell(P, W, clr, wz1, wr, ra);
  wheelWell(P, W, clr, wz2, wr, ra);
  // bumpers, grille
  P.box('trim', W - 0.1, 0.13, 0.08, 0, clr + 0.12, r - 0.03);
  P.box('trim', W - 0.1, 0.13, 0.08, 0, clr + 0.12, f + 0.02);
  P.box('trim', W * 0.48, 0.14, 0.04, 0, noseH - 0.27, f + 0.04);
  // plates (Dutch yellow)
  P.box('plate', 0.52, 0.115, 0.02, 0, clr + 0.33, r - 0.06);
  P.box('plate', 0.52, 0.115, 0.02, 0, clr + 0.27, f + 0.07);
  // lights: the shape depends on the light signature (see archetypes.js)
  carLamps(P, em, W, f, r, noseH - 0.1, tailH - 0.13, sig);
  for (const sx of [1, -1]) {
    const tx = sx * (W / 2 - 0.2), ty = tailH - 0.13;
    const hy = noseH - 0.1;
    const ind = sx > 0 ? 'indL' : 'indR';
    P.box(ind, 0.07, 0.08, 0.07, sx * (W / 2 - 0.03), hy, f - 0.02);
    em.push(emitter(ind, sx * (W / 2 - 0.03), hy, f + 0.03, 1, 0.8));
    P.box(ind, 0.12, 0.06, 0.05, tx, ty - 0.1, r - 0.03);
    em.push(emitter(ind, tx, ty - 0.1, r - 0.08, -1, 0.8));
    // side repeater
    P.box(ind, 0.02, 0.03, 0.08, sx * (W / 2 + 0.03), clr + 0.62, f - 1.05);
  }
  if (extraRear) P.box('trim', 0.08, 0.08, extraRear, 0, clr + 0.25, r - extraRear / 2); // tow bar
}

function buildVan(P, em, rack = false) {
  const L = 5.9, W = 2.0, H = 2.5, clr = 0.2;
  const f = L / 2, r = -L / 2;
  const ra = 0.41;
  P.extrudeSide('paint', [
    ...archedSill(r + 0.08, f - 0.25, clr, [r + 1.15, f - 0.85], 0.34, ra),
    [f, clr + 0.3],
    [f, 0.98],
    [f - 0.55, 1.2],
    [f - 1.3, 2.38],
    [f - 1.55, H],
    [r + 0.03, H],
    [r, H - 0.05],
    [r, clr + 0.15],
  ], W, 0.05);
  P.slab('glass', W - 0.22, f - 0.58, 1.24, f - 1.28, 2.32, 0.03, 0, 0.055);
  for (const sx of [1, -1]) {
    P.box('glass', 0.02, 0.62, 0.95, sx * (W / 2 + 0.003), 1.72, f - 1.55);
    P.box('paint', 0.2, 0.22, 0.12, sx * (W / 2 + 0.08), 1.45, f - 1.0);
    P.box('glass', 0.14, 0.18, 0.01, sx * (W / 2 + 0.09), 1.45, f - 1.065);
    P.wheel(sx * (W / 2 - 0.15), 0.34, f - 0.85, 0.34, 0.24);
    P.wheel(sx * (W / 2 - 0.15), 0.34, r + 1.15, 0.34, 0.24);
  }
  wheelWell(P, W, clr, f - 0.85, 0.34, ra);
  wheelWell(P, W, clr, r + 1.15, 0.34, ra);
  if (rack) {
    // Bestelbus tells, readable from behind: a roof rack with a ladder that
    // sticks out past the back, and a company stripe along the sides and doors.
    const rl = L - 1.7, rz = r + rl / 2 + 0.1;
    for (const sx of [1, -1]) {
      P.box('trim', 0.06, 0.06, rl, sx * (W / 2 - 0.1), H + 0.2, rz);
      for (let i = 0; i < 4; i++) P.box('trim', 0.05, 0.2, 0.05, sx * (W / 2 - 0.1), H + 0.1, r + 0.2 + i * ((rl - 0.3) / 3));
    }
    for (let i = 0; i < 4; i++) P.box('trim', W - 0.2, 0.05, 0.06, 0, H + 0.22, r + 0.2 + i * ((rl - 0.3) / 3));
    const ll = L - 1.6, lz = r - 0.3 + ll / 2;
    for (const lx of [0.42, 0.02]) P.box('chrome', 0.05, 0.05, ll, lx, H + 0.29, lz);
    for (let i = 0; i < 10; i++) P.box('chrome', 0.4, 0.03, 0.035, 0.22, H + 0.29, r - 0.2 + i * ((ll - 0.3) / 9));
    for (const sx of [1, -1]) P.box('paint2', 0.02, 0.26, L - 2.0, sx * (W / 2 + 0.004), 1.25, r + (L - 2.0) / 2 + 0.1);
    P.box('paint2', W - 0.1, 0.22, 0.02, 0, 1.47, r - 0.035);
  }
  P.box('glass', W * 0.36, 0.45, 0.02, W * 0.21, 1.85, r - 0.03);
  P.box('glass', W * 0.36, 0.45, 0.02, -W * 0.21, 1.85, r - 0.03);
  P.box('trim', 0.02, H - 0.4, 0.03, 0, 1.4, r - 0.04);
  P.box('trim', W - 0.05, 0.16, 0.1, 0, clr + 0.15, r - 0.03);
  P.box('trim', W - 0.05, 0.2, 0.1, 0, clr + 0.18, f + 0.02);
  P.box('trim', W * 0.55, 0.22, 0.04, 0, 0.75, f + 0.03);
  P.box('plate', 0.52, 0.115, 0.02, 0, clr + 0.38, r - 0.08);
  P.box('plate', 0.52, 0.115, 0.02, 0, clr + 0.3, f + 0.08);
  for (const sx of [1, -1]) {
    const tx = sx * (W / 2 - 0.08);
    P.box('tail', 0.12, 0.42, 0.06, tx, 1.05, r - 0.03);
    em.push(emitter('tail', tx, 1.15, r - 0.08, -1));
    const ind = sx > 0 ? 'indL' : 'indR';
    P.box(ind, 0.12, 0.1, 0.06, tx, 0.78, r - 0.03);
    em.push(emitter(ind, tx, 0.78, r - 0.08, -1, 0.8));
    const hx = sx * (W / 2 - 0.25);
    P.box('head', 0.38, 0.13, 0.06, hx, 0.9, f + 0.01);
    em.push(emitter('head', hx, 0.9, f + 0.07, 1));
    P.box(ind, 0.07, 0.1, 0.06, sx * (W / 2 - 0.04), 0.9, f - 0.01);
    em.push(emitter(ind, sx * (W / 2 - 0.04), 0.9, f + 0.04, 1, 0.8));
  }
}

/** Truck cab with front at z = fz. */
function buildCab(P, em, fz, W = 2.48) {
  const b = fz - 2.3;
  P.extrudeSide('paint', [
    [b, 1.05],
    [fz - 0.05, 1.05],
    [fz, 2.3],
    [fz - 0.12, 3.6],
    [fz - 0.45, 3.85],
    [b, 3.85],
  ], W, 0.06);
  P.slab('glass', W - 0.3, fz - 0.005, 2.42, fz - 0.105, 3.45, 0.03, 0, 0.05);
  P.box('paint', W - 0.15, 0.7, 1.5, 0, 4.18, b + 0.85); // roof deflector
  P.box('trim', W - 0.1, 0.12, 0.35, 0, 3.75, fz - 0.15); // sun visor
  for (const sx of [1, -1]) {
    P.box('glass', 0.02, 0.75, 0.95, sx * (W / 2 + 0.005), 2.95, fz - 0.75);
    P.box('trim', 0.06, 0.55, 0.06, sx * (W / 2 + 0.18), 2.75, fz - 0.35); // mirror arms
    P.box('trim', 0.12, 0.45, 0.2, sx * (W / 2 + 0.22), 2.6, fz - 0.4);
    P.box('trim', 0.4, 0.4, 0.8, sx * (W / 2 - 0.1), 1.25, fz - 0.6); // step/fender
  }
  P.box('trim', W, 0.45, 0.25, 0, 0.82, fz - 0.05); // bumper
  P.box('trim', 1.5, 0.95, 0.04, 0, 1.85, fz + 0.02); // grille
  P.box('plate', 0.52, 0.115, 0.02, 0, 0.75, fz + 0.09);
  for (const sx of [1, -1]) {
    const hx = sx * (W / 2 - 0.35);
    P.box('head', 0.42, 0.17, 0.06, hx, 1.0, fz + 0.06);
    em.push(emitter('head', hx, 1.0, fz + 0.12, 1, 1.1));
    const ind = sx > 0 ? 'indL' : 'indR';
    P.box(ind, 0.14, 0.14, 0.06, sx * (W / 2 - 0.08), 1.0, fz + 0.05);
    em.push(emitter(ind, sx * (W / 2 - 0.08), 1.0, fz + 0.1, 1, 0.9));
    P.box('marker', 0.08, 0.06, 0.06, sx * (W / 2 - 0.25), 3.9, fz - 0.3); // top clearance lights
  }
}

function buildTractor(P, em) {
  const fz = 3.05;
  buildCab(P, em, fz);
  P.box('trim', 1.0, 0.35, 5.6, 0, 0.85, 0.0); // chassis
  P.box('trim', 0.9, 0.12, 1.2, 0, 1.15, -1.4); // fifth wheel
  for (const sx of [1, -1]) {
    P.add('chrome', new THREE.CylinderGeometry(0.3, 0.3, 1.1, 12), sx * 0.95, 0.85, 0.3, Math.PI / 2, 0, 0); // tanks
    P.wheel(sx * 1.02, 0.52, 2.15, 0.52, 0.32);
    P.wheel(sx * 0.98, 0.52, -1.45, 0.52, 0.5);
    P.box('trim', 0.55, 0.08, 1.3, sx * 0.98, 1.1, -1.45); // mudguard
  }
}

function buildTrailer(P, em, kind) {
  // origin at king pin; body from z=+1.2 to z=-12.4
  const W = 2.55, y0 = 1.25, H = 2.75;
  const zc = 1.2 - 6.8;
  P.box('paint2', W, H, 13.6, 0, y0 + H / 2, zc);
  if (kind === 'curtain') {
    for (let z = 0.6; z > -12.2; z -= 1.15) {
      P.box('trim', W + 0.02, 0.05, 0.05, 0, y0 + 0.08, z);
      P.box('strap', W + 0.012, H - 0.15, 0.05, 0, y0 + H / 2, z);
    }
  } else if (kind === 'reefer') {
    P.box('trim', 1.9, 1.4, 0.45, 0, y0 + H - 0.9, 1.2 + 0.22);
  }
  P.box('trim', 2.3, 0.3, 13.3, 0, y0 - 0.15, zc); // underframe
  for (const sx of [1, -1]) {
    P.box('trim', 0.05, 0.28, 5.8, sx * 1.2, 0.85, -3.6); // side guard
    for (const z of [-8.45, -9.8, -11.15]) {
      P.wheel(sx * 1.03, 0.48, z, 0.48, 0.46);
    }
    P.box('trim', 0.5, 0.06, 4.2, sx * 1.03, 1.02, -9.8);
    // side marker lights
    for (let z = 0.2; z > -12.2; z -= 2.3) {
      P.box('marker', 0.03, 0.06, 0.1, sx * (W / 2 + 0.02), 1.05, z);
      em.push({ kind: 'marker', pos: new THREE.Vector3(sx * (W / 2 + 0.05), 1.05, z), dir: new THREE.Vector3(sx, 0, 0), size: 0.6 });
    }
  }
  const rz = -12.4;
  P.box('trim', 0.04, H - 0.1, 0.03, 0, y0 + H / 2, rz - 0.02); // door seam
  P.box('trim', 2.4, 0.16, 0.12, 0, 0.58, rz + 0.05); // underrun bar
  P.box('plate', 0.52, 0.115, 0.02, 0, 0.82, rz - 0.04);
  P.box('reflect', W - 0.05, 0.05, 0.02, 0, y0 + 0.05, rz - 0.03);
  P.box('reflect', 0.05, H - 0.1, 0.02, W / 2 - 0.03, y0 + H / 2, rz - 0.03);
  P.box('reflect', 0.05, H - 0.1, 0.02, -W / 2 + 0.03, y0 + H / 2, rz - 0.03);
  for (const sx of [1, -1]) {
    const tx = sx * 0.95;
    P.box('tail', 0.32, 0.14, 0.06, tx, 0.82, rz - 0.03);
    em.push(emitter('tail', tx, 0.82, rz - 0.08, -1, 1.1));
    const ind = sx > 0 ? 'indL' : 'indR';
    P.box(ind, 0.14, 0.14, 0.06, sx * 1.18, 0.82, rz - 0.03);
    em.push(emitter(ind, sx * 1.18, 0.82, rz - 0.08, -1, 1.0));
    P.box('marker', 0.08, 0.06, 0.04, sx * 1.15, y0 + H - 0.05, rz - 0.03);
  }
}

function buildRigid(P, em) {
  const L = 10.2, fz = L / 2, rz = -L / 2;
  buildCab(P, em, fz, 2.45);
  const W = 2.5, y0 = 1.15, H = 2.75;
  const bf = fz - 2.45;
  P.box('paint2', W, H, bf - rz - 0.1, 0, y0 + H / 2, (bf + rz) / 2 - 0.05);
  P.box('trim', 1.0, 0.35, L - 1.0, 0, 0.85, 0);
  for (const sx of [1, -1]) {
    P.wheel(sx * 1.0, 0.5, fz - 1.0, 0.5, 0.32);
    P.wheel(sx * 0.98, 0.5, rz + 2.6, 0.5, 0.5);
    P.box('trim', 0.05, 0.28, 3.5, sx * 1.2, 0.85, 0.2);
    for (let z = bf - 0.3; z > rz + 0.3; z -= 2.2) {
      P.box('marker', 0.03, 0.06, 0.1, sx * (W / 2 + 0.02), 1.0, z);
      em.push({ kind: 'marker', pos: new THREE.Vector3(sx * (W / 2 + 0.05), 1.0, z), dir: new THREE.Vector3(sx, 0, 0), size: 0.6 });
    }
  }
  P.box('trim', 2.3, 0.16, 0.12, 0, 0.58, rz + 0.08);
  P.box('plate', 0.52, 0.115, 0.02, 0, 0.82, rz - 0.02);
  P.box('reflect', W - 0.05, 0.05, 0.02, 0, y0 + 0.05, rz - 0.01);
  for (const sx of [1, -1]) {
    const tx = sx * 0.95;
    P.box('tail', 0.32, 0.14, 0.06, tx, 0.82, rz);
    em.push(emitter('tail', tx, 0.82, rz - 0.06, -1, 1.1));
    const ind = sx > 0 ? 'indL' : 'indR';
    P.box(ind, 0.14, 0.14, 0.06, sx * 1.15, 0.82, rz);
    em.push(emitter(ind, sx * 1.15, 0.82, rz - 0.06, -1, 1.0));
  }
}

function buildCaravan(P, em) {
  // origin at hitch; drawbar forward to 0, body from -1.3 to -7.3
  const W = 2.25;
  P.box('trim', 0.12, 0.1, 1.4, 0, 0.45, -0.7);
  P.extrudeSide('paint2', [
    [-1.3, 0.42],
    [-7.3, 0.42],
    [-7.35, 2.5],
    [-1.75, 2.58],
    [-1.3, 2.05],
    [-1.22, 0.9],
  ], W, 0.06);
  P.box('stripe', W + 0.01, 0.12, 5.9, 0, 1.25, -4.3);
  for (const sx of [1, -1]) {
    P.box('glass', 0.02, 0.5, 1.2, sx * (W / 2 + 0.005), 1.75, -2.8);
    P.box('glass', 0.02, 0.5, 0.9, sx * (W / 2 + 0.005), 1.75, -5.8);
    P.wheel(sx * (W / 2 - 0.12), 0.33, -4.3, 0.33, 0.2);
  }
  P.slab('glass', 1.5, -1.24, 1.45, -1.55, 2.2, 0.03, 0, 0.06);
  P.box('glass', 1.2, 0.55, 0.02, 0, 1.8, -7.36);
  P.box('plate', 0.52, 0.115, 0.02, 0, 0.62, -7.38);
  for (const sx of [1, -1]) {
    const tx = sx * 0.92;
    P.box('tail', 0.26, 0.14, 0.05, tx, 0.62, -7.35);
    em.push(emitter('tail', tx, 0.62, -7.4, -1));
    const ind = sx > 0 ? 'indL' : 'indR';
    P.box(ind, 0.1, 0.12, 0.05, sx * 1.04, 0.62, -7.35);
    em.push(emitter(ind, sx * 1.04, 0.62, -7.4, -1, 0.8));
  }
}

// ---------------- variant assembly ----------------
const variantCache = new Map();

/** Lowered look: body sits closer to bigger wheels with dark rims. */
function lowered(sp) {
  const d = 0.05;
  return { ...sp, clr: sp.clr - d, H: sp.H - d, belt: sp.belt - d, noseH: sp.noseH - d, tailH: sp.tailH - d, wr: sp.wr + 0.015, archGap: 0.035, rimF: 0.76 };
}

function buildVariant(variant, low = false, sig = 'std') {
  const meta = VARIANTS[variant];
  const out = { variant, meta, front: null, trailer: null, emFront: [], emTrailer: [], hitchZ: 0, axleDist: 0, trailerKind: null };
  if (CAR_SPECS[variant]) {
    const P = new Parts();
    buildCarBody(P, low ? lowered(CAR_SPECS[variant]) : CAR_SPECS[variant], out.emFront, 0, sig);
    out.front = P.build();
  } else if (variant === 'van') {
    const P = new Parts();
    buildVan(P, out.emFront, sig === 'rack');
    out.front = P.build();
  } else if (variant === 'truck') {
    const P = new Parts();
    buildTractor(P, out.emFront);
    out.front = P.build();
    out.trailers = {};
    out.emTrailers = {};
    for (const kind of ['box', 'curtain', 'reefer']) {
      const T = new Parts();
      const em = [];
      buildTrailer(T, em, kind);
      out.trailers[kind] = T.build();
      out.emTrailers[kind] = em;
    }
    out.hitchZ = -1.4;
    out.axleDist = 9.8;
  } else if (variant === 'rigid') {
    const P = new Parts();
    buildRigid(P, out.emFront);
    out.front = P.build();
  } else if (variant === 'caravan') {
    const P = new Parts();
    const sp = { ...CAR_SPECS.estate, L: 4.7 };
    buildCarBody(P, sp, out.emFront, 0.5);
    out.front = P.build();
    const T = new Parts();
    out.trailers = { caravan: null };
    out.emTrailers = { caravan: [] };
    buildCaravan(T, out.emTrailers.caravan);
    out.trailers.caravan = T.build();
    out.hitchZ = -4.7 / 2 - 0.75;
    out.axleDist = 4.3;
  }
  return out;
}

export function getVariantGeo(variant, low = false, sig = 'std') {
  if (!CAR_SPECS[variant]) {
    low = false;
    if (!(variant === 'van' && sig === 'rack')) sig = 'std';
  }
  const key = `${variant}:${low ? 'low' : ''}:${sig}`;
  if (!variantCache.has(key)) variantCache.set(key, buildVariant(variant, low, sig));
  return variantCache.get(key);
}

// ---------------- materials ----------------
export const SHARED = {};
let envIntensity = 1;
export function initVehicleMaterials() {
  SHARED.glass = new THREE.MeshStandardMaterial({ color: 0x0e1418, metalness: 0.1, roughness: 0.06, envMapIntensity: 1.4 });
  SHARED.glassTint = new THREE.MeshStandardMaterial({ color: 0x010102, metalness: 0.5, roughness: 0.03, envMapIntensity: 1.8 });
  SHARED.trim = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.75, metalness: 0.0 });
  SHARED.chrome = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.3, metalness: 1.0 });
  SHARED.plate = new THREE.MeshStandardMaterial({ color: 0xf0bd00, roughness: 0.45, emissive: 0xf0bd00, emissiveIntensity: 0 });
  SHARED.reflect = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.4, emissive: 0xffd080, emissiveIntensity: 0 });
  SHARED.strap = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.8 });
  SHARED.stripe = new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.6 });
}

const paintCache = new Map();
export function paintMaterial(hex, flat = false) {
  const key = hex + (flat ? 'f' : '');
  if (!paintCache.has(key)) {
    const m = flat
      ? new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.05 })
      : new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.38, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.28 });
    paintCache.set(key, m);
  }
  return paintCache.get(key);
}

export function setVehicleNight(night) {
  SHARED.plate.emissiveIntensity = night ? 0.06 : 0;
  SHARED.reflect.emissiveIntensity = night ? 0.25 : 0;
}

const CAR_COLORS = [
  [0x8d9296, 16], // silver
  [0x5b5f63, 13], // grey
  [0x1a1b1d, 17], // black
  [0xe9eaea, 18], // white
  [0x1d2b4d, 9], // dark blue
  [0x2e5aa8, 5], // blue
  [0x8e1c1c, 6], // red
  [0x274030, 2], // dark green
  [0x7a6a55, 3], // beige/brown
  [0xb84f1a, 1.5], // orange
  [0x3f6f7a, 2], // petrol
  [0xc9b98f, 1.5], // champagne
];
const TRUCK_CAB = [[0xf2f2f2, 30], [0xa51c1c, 10], [0x1f3d7a, 10], [0x1a1a1a, 8], [0x8a9096, 8], [0x2f6b3a, 3], [0xe0a020, 3]];
const TRAILER = [[0xeeeeee, 35], [0x9aa0a6, 12], [0x1f4f9a, 8], [0x8f1f1f, 6], [0x2f6b3a, 5], [0xe8b020, 4], [0x333538, 6], [0xd06a1a, 3]];
const CARAVAN = [[0xf2efe6, 6], [0xe8e4d8, 3], [0xdcd8cc, 2]];

// ---------------- instance ----------------
function lightMat(color, emissive) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0, roughness: 0.3 });
}

/**
 * Build a vehicle visual. Returns an object with root group and parts.
 */
export function createVehicleVisual(variant, rng, opts = {}) {
  const G = getVariantGeo(variant, !!opts.low, opts.lights || 'std');
  const root = new THREE.Group();
  const mats = {
    head: lightMat(0xdfe6ea, 0xfff4e0),
    tail: lightMat(0x5a0606, 0xff1a0a),
    indL: lightMat(0x6b3e00, 0xff8a10),
    indR: lightMat(0x6b3e00, 0xff8a10),
    marker: lightMat(0x6b3e00, 0xff8a10),
    drl: lightMat(0xc8ced2, 0xeaf2ff),
  };
  const bodyColor = opts.color ?? pickWeighted(rng, variant === 'truck' || variant === 'rigid' ? TRUCK_CAB : CAR_COLORS);
  // commercial vehicles get plain paint: a big glossy flat back mirrors your headlights straight back
  const flatPaint = variant === 'truck' || variant === 'rigid' || variant === 'van';
  const paint = paintMaterial(bodyColor, flatPaint);
  let paint2 = paint;
  let trailerKind = null;
  if (variant === 'truck') {
    trailerKind = pickWeighted(rng, [['box', 4], ['curtain', 4], ['reefer', 2]]);
    paint2 = paintMaterial(pickWeighted(rng, TRAILER), true);
  } else if (variant === 'rigid') {
    paint2 = paintMaterial(pickWeighted(rng, TRAILER), true);
  } else if (variant === 'van') {
    // company stripe (only on the white-van geometry)
    paint2 = paintMaterial(pickWeighted(rng, [[0x1f5fbf, 3], [0xe0661a, 2], [0x2f8a3c, 2], [0xb3202a, 2], [0x1a1b1d, 1]]), true);
  } else if (variant === 'caravan') {
    trailerKind = 'caravan';
    paint2 = paintMaterial(pickWeighted(rng, CARAVAN), true);
  }
  const matFor = (slot) => {
    switch (slot) {
      case 'paint': return paint;
      case 'paint2': return paint2;
      case 'head': case 'tail': case 'indL': case 'indR': case 'marker': case 'drl': return mats[slot];
      default: return SHARED[slot] || SHARED.trim;
    }
  };
  const bySlot = {};
  const makePart = (slots) => {
    const g = new THREE.Group();
    for (const [slot, geo] of Object.entries(slots)) {
      const mesh = new THREE.Mesh(geo, matFor(slot));
      (bySlot[slot] ||= []).push(mesh);
      mesh.castShadow = slot === 'paint' || slot === 'paint2' || slot === 'trim';
      mesh.receiveShadow = slot === 'paint' || slot === 'paint2';
      g.add(mesh);
    }
    g.rotation.order = 'YXZ';
    root.add(g);
    return g;
  };
  const front = makePart(G.front);
  let trailer = null;
  let emTrailer = [];
  if (trailerKind) {
    trailer = makePart(G.trailers[trailerKind]);
    emTrailer = G.emTrailers[trailerKind];
  }
  return {
    variant,
    root,
    front,
    trailer,
    mats,
    emFront: G.emFront,
    emTrailer,
    hitchZ: G.hitchZ,
    axleDist: G.axleDist,
    meta: G.meta,
    axle: new THREE.Vector3(),
    axleInit: false,
    blink: 0,
    bySlot,
    look: null,
  };
}

const HEAD_EMISSIVE = { std: 0xfff4e0, modern: 0xf2f7ff, bar: 0xf2f7ff, angel: 0xe0eaff, round: 0xffd894, eco: 0xf4f6ff, tall: 0xfff4e0, ev: 0xf0f6ff };

/** Repaint a (possibly pooled) car visual for a look from archetypes.js. */
export function applyLook(vis, look) {
  vis.look = look;
  if (!look) return;
  const paint = paintMaterial(look.color, vis.variant === 'van');
  for (const m of vis.bySlot.paint || []) m.material = paint;
  const glass = look.tint ? SHARED.glassTint : SHARED.glass;
  for (const m of vis.bySlot.glass || []) m.material = glass;
  vis.mats.head.emissive.setHex(HEAD_EMISSIVE[look.lights] ?? HEAD_EMISSIVE.std);
  // smoked tail lenses on the patser
  vis.mats.tail.color.setHex(look.lights === 'angel' ? 0x1a0204 : 0x5a0606);
}

export function setLayerRecursive(obj, layer) {
  obj.traverse((o) => o.layers.set(layer));
}
