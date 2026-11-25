// F-48 Toekomstflitsen, slice 1: the promised world's guideway spine. Pillars
// that rise out of the median barrier, a deck on each side over the inner
// shoulder and the left lane, and platoons of automated cabins running on top.
// View only: nothing here is read by the sim, and every piece stands in for
// something the present world already builds (the barrier, the deck edge).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { hash01 } from './util.js';
import { innerEdge } from './layout.js';
import { junctionsNear, overpassS } from './junctions.js';
/**
 * Heights. The deck hangs higher than the 6 m the spec guessed, because the
 * present-day signs hung over the left lane must pass underneath untouched:
 * a matrix face box sits at 6.1 m (1.5 m tall) and the gantry beam at 7.2 m.
 * 7.8 m clears both, so slice 3's gantries and faces stay exactly as they are.
 */
export const DECK_UNDER = 7.8; // underside of the deck slab
export const DECK_TOP = 8.35; // the red running surface
const PARAPET_TOP = 9.15; // low concrete parapet on the deck edge
const RAIL_TOP = 9.3; // pale blue rail on top of it
const SPINE_WALL_TOP = 9.85; // wall between the two directions
const END_BOTTOM = 4.75; // underside of a spine end block (rule 4: 4.6 m)
const SHELF_UNDER = 8.15; // underside of the pod track cantilevered on the deck edge
const TRACK_W = 1.7; // width of that track
const PILLAR_HALF = 0.25; // column half width, inside the barrier footprint (rule 4)
const PILLAR_SPLIT = 4.6; // where the column splits into its Y
export const REQUIRED_CLEARANCE = 4.6; // m (rule 4)

/** How far the spine stands off a junction bridge or a viaduct, both sides. */
export const JUNCTION_CLEAR = 150;

/** Lateral reach of a deck (m): one number decides the cross-section. */
export function deckOuter() {
  const lanes = CONFIG.future.deckReachLanes;
  // the median-only spine still has to carry a cabin on each side
  return lanes > 0 ? innerEdge() + lanes * CONFIG.laneWidth : 2.5;
}

/**
 * The cabin track hangs off the deck's outer edge, so the platoons pass where a
 * driver below can see them. On top of the deck they would be hidden: a driver
 * is always under the deck surface, so only the outer ~0.3 m of the deck top is
 * ever in view (see tools/worldtest.js). The pods ride a beam just outside the
 * parapet instead, which is also why the parapet is between deck and track.
 */
export const trackOuter = () => deckOuter() + TRACK_W;
export const cabinLat = () => (deckOuter() + trackOuter()) / 2;

/** The gap at the end of each spine stretch, as [from, to] cuts per km. */
function spineGapCuts(a, b, out) {
  const every = CONFIG.future.spineEveryKm * 1000;
  if (!(every > 0)) return;
  const gap = Math.min(CONFIG.future.spineGapKm * 1000, every);
  if (!(gap > 0)) return;
  for (let k = Math.floor(a / every) - 1; k <= Math.floor(b / every) + 1; k++) {
    const x = k * every + every - gap;
    const y = k * every + every;
    if (y > a && x < b) out.push([x, y]);
  }
}

/** Is there a spine at s? (spine gaps, junction bridges and viaducts take it away) */
export function spineAt(s) {
  const gaps = [];
  spineGapCuts(s, s, gaps);
  for (const [x, y] of gaps) if (s >= x && s <= y) return false;
  for (const j of junctionsNear(s, s)) if (Math.abs(s - j.sBridge) < JUNCTION_CLEAR) return false;
  const k0 = Math.floor((s - JUNCTION_CLEAR) / 1000) - 1;
  const k1 = Math.floor((s + JUNCTION_CLEAR) / 1000) + 1;
  for (let K = k0; K <= k1; K++) {
    const so = overpassS(K);
    if (so != null && Math.abs(s - so) < JUNCTION_CLEAR) return false;
  }
  return true;
}

/** The stretches of [s0, s1] that carry a spine. */
export function spineSpans(s0, s1) {
  const cuts = [];
  for (const j of junctionsNear(s0 - JUNCTION_CLEAR, s1 + JUNCTION_CLEAR)) {
    const a = j.sBridge - JUNCTION_CLEAR;
    const b = j.sBridge + JUNCTION_CLEAR;
    if (b > s0 && a < s1) cuts.push([a, b]);
  }
  for (let K = Math.floor((s0 - JUNCTION_CLEAR) / 1000) - 1; K <= Math.floor((s1 + JUNCTION_CLEAR) / 1000) + 1; K++) {
    const so = overpassS(K);
    if (so == null) continue;
    const a = so - JUNCTION_CLEAR;
    const b = so + JUNCTION_CLEAR;
    if (b > s0 && a < s1) cuts.push([a, b]);
  }
  spineGapCuts(s0, s1, cuts);
  cuts.sort((p, q) => p[0] - q[0]);
  let segs = [[s0, s1]];
  for (const [ca, cb] of cuts) {
    const next = [];
    for (const [a, b] of segs) {
      if (cb <= a || ca >= b) {
        next.push([a, b]);
        continue;
      }
      if (ca > a) next.push([a, ca]);
      if (cb < b) next.push([cb, b]);
    }
    segs = next;
  }
  return segs.filter(([a, b]) => b - a > 0.5);
}

// ------------------------------------------------------------------ materials
/**
 * The promised world's own materials, into the scenery's material table so the
 * existing bucket -> mesh assembly picks them up. Their night/dusk behaviour is
 * in futureNight().
 */
export function futureMaterials(M, concreteMap) {
  const out = {};
  out.futDeck = new THREE.MeshStandardMaterial({ map: concreteMap, color: 0xc89f63, roughness: 0.9, side: THREE.DoubleSide });
  // the underside is only lit from below (a dark hemisphere), so it is paler to
  // keep the ceiling readable instead of a black mass at noon
  out.futDeckUnder = new THREE.MeshStandardMaterial({
    map: concreteMap,
    color: 0xfdf4e6,
    roughness: 1,
    side: THREE.DoubleSide,
    emissive: 0xffe2b8, // a fake bounce: a ceiling in sunlight is never black
    emissiveIntensity: 0,
  });
  out.futDeckTop = new THREE.MeshStandardMaterial({ color: 0x9e3b2f, roughness: 0.95, side: THREE.DoubleSide });
  out.futSpine = new THREE.MeshStandardMaterial({ map: concreteMap, color: 0xe7e3d7, roughness: 0.8, side: THREE.DoubleSide });
  out.futEnd = new THREE.MeshStandardMaterial({ map: concreteMap, color: 0xbfb096, roughness: 0.9 });
  out.futRail = new THREE.MeshStandardMaterial({ color: 0x9ccbe8, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide });
  out.futLamp = new THREE.MeshStandardMaterial({ color: 0x2a3038, emissive: 0xcfe4ff, emissiveIntensity: 0, roughness: 0.4 });
  out.futAmber = new THREE.MeshStandardMaterial({ color: 0x4a2a10, emissive: 0xff8a2a, emissiveIntensity: 0, roughness: 0.4 });
  out.futCabin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25, emissive: 0x9fc4ff, emissiveIntensity: 0 });
  for (const [k, v] of Object.entries(out)) M[k] = v;
  return out;
}

/** Night, dusk and rain for the promised pieces (rule 5). */
export function futureNight(M, mode, promised) {
  const night = mode === 'night';
  const dusk = mode === 'dusk';
  if (!promised) {
    M.futLamp.emissiveIntensity = 0;
    M.futAmber.emissiveIntensity = 0;
    M.futCabin.emissiveIntensity = 0;
    M.futDeckUnder.emissiveIntensity = 0;
    return;
  }
  M.futLamp.emissiveIntensity = night ? 4 : dusk ? 1.4 : 0;
  M.futAmber.emissiveIntensity = night ? 1.8 : dusk ? 0.9 : 0.08;
  M.futCabin.emissiveIntensity = night ? 0.9 : dusk ? 0.4 : 0;
  M.futDeckUnder.emissiveIntensity = night ? 0.14 : dusk ? 0.22 : 0.3;
}

// ------------------------------------------------------------------ geometry
const _x = new THREE.Vector3(1, 0, 0);
const _up = new THREE.Vector3(0, 1, 0);
const _qy = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3(1, 1, 1);

/** A matrix for a box that leans out of the vertical by `tilt` about local X. */
function matTilted(x, y, z, yaw, tilt) {
  _qy.setFromAxisAngle(_up, yaw);
  _qx.setFromAxisAngle(_x, tilt);
  _qy.multiply(_qx);
  return new THREE.Matrix4().compose(_pos.set(x, y, z), _qy.clone(), _scl);
}

/** Mirrors a lat/y profile for the other side, keeping the winding sane. */
const flip = (pts, sg) => (sg > 0 ? pts : pts.map(([l, y]) => [-l, y]).reverse());

/**
 * Builds one chunk's spine: decks, parapets, the wall between the directions,
 * the pillars and the end blocks. `ctx` is what Scenery.buildChunk has at hand.
 */
export function buildSpine({ s0, s1, bucket, sweep, mat, rows, local, road, ox, oz }) {
  const outer = deckOuter();
  const track = trackOuter();
  const spans = spineSpans(s0, s1);
  if (!spans.length) return;
  const uv = (R, l) => [l / 2, R.s / 4];

  for (const [a, b] of spans) {
    const rr = rows.filter((r) => r.s >= a - 0.01 && r.s <= b + 0.01);
    if (rr.length > 1) {
      for (const sg of [1, -1]) {
        // the slab: inner face, underside (a ceiling seen from the road), outer face
        sweep(bucket('futDeck'), flip([[0.3, DECK_TOP], [0.3, DECK_UNDER]], sg), uv, rr);
        sweep(bucket('futDeckUnder'), flip([[0.3, DECK_UNDER], [outer, DECK_UNDER]], sg), uv, rr);
        sweep(bucket('futDeck'), flip([[outer, DECK_UNDER], [outer, DECK_TOP]], sg), uv, rr);
        sweep(bucket('futDeckTop'), flip([[0.3, DECK_TOP], [outer - 0.18, DECK_TOP]], sg), uv, rr);
        // a low parapet on the outer edge with the pale blue rail on top
        sweep(
          bucket('futDeck'),
          flip([[outer - 0.18, DECK_TOP], [outer - 0.18, PARAPET_TOP], [outer, PARAPET_TOP], [outer, DECK_TOP]], sg),
          uv,
          rr,
        );
        sweep(
          bucket('futRail'),
          flip([[outer - 0.18, PARAPET_TOP], [outer - 0.18, RAIL_TOP], [outer, RAIL_TOP], [outer, PARAPET_TOP]], sg),
          uv,
          rr,
        );
        // the cabin track cantilevered on the deck's outer edge, with a lip
        sweep(bucket('futDeck'), flip([[outer, SHELF_UNDER], [track, SHELF_UNDER], [track, DECK_TOP], [outer, DECK_TOP]], sg), uv, rr);
        sweep(bucket('futRail'), flip([[track - 0.1, DECK_TOP], [track - 0.1, DECK_TOP + 0.16]], sg), uv, rr);
        // lamps under the deck edge every 20 m, amber reflectors on the parapet
        const lamps = bucket('futLamp');
        const amber = bucket('futAmber');
        for (let s = Math.ceil(Math.max(a, s0) / 20) * 20; s < Math.min(b, s1); s += 20) {
          const yaw = road.sample(s, {}).h;
          lamps.addGeo(new THREE.BoxGeometry(0.28, 0.07, 0.28), mat(...local(s, sg * (outer - 0.4), DECK_UNDER - 0.05), yaw));
          amber.addGeo(new THREE.BoxGeometry(0.09, 0.14, 0.04), mat(...local(s, sg * (outer - 0.09), PARAPET_TOP - 0.3), yaw));
        }
      }
      // the wall between the two directions, once
      sweep(
        bucket('futSpine'),
        [[-0.3, DECK_TOP], [0.3, DECK_TOP], [0.3, SPINE_WALL_TOP], [-0.3, SPINE_WALL_TOP], [-0.3, DECK_TOP]],
        uv,
        rr,
      );
    }

    // pillars every 40 m, rising out of the barrier and splitting into a Y
    const conc = bucket('futDeck');
    const armLen = Math.hypot(outer - 0.1, DECK_UNDER - PILLAR_SPLIT);
    const armTilt = -Math.atan2(DECK_UNDER - PILLAR_SPLIT, outer - 0.1);
    for (let s = Math.ceil(Math.max(a, s0) / 40) * 40; s < Math.min(b, s1); s += 40) {
      const p = road.sample(s, {});
      const x = p.x - ox;
      const z = p.z - oz;
      conc.addGeo(new THREE.BoxGeometry(2 * PILLAR_HALF, PILLAR_SPLIT, 2 * PILLAR_HALF), mat(x, PILLAR_SPLIT / 2, z, p.h));
      for (const sg of [1, -1]) {
        const arm = new THREE.BoxGeometry(0.34, 0.42, armLen).translate(0, 0, armLen / 2);
        conc.addGeo(arm, matTilted(x, PILLAR_SPLIT, z, p.h + (sg > 0 ? 0 : Math.PI), armTilt));
      }
    }

    // the ends: a block the deck runs into, and where a platoon vanishes
    for (const e of [a - 2, b + 2]) {
      if (e < s0 || e > s1) continue;
      const p = road.sample(e, {});
      bucket('futEnd').addGeo(
        new THREE.BoxGeometry(4, DECK_TOP - END_BOTTOM, 2 * track),
        mat(p.x - ox, (DECK_TOP + END_BOTTOM) / 2, p.z - oz, p.h),
      );
    }
  }
}

/**
 * The blocks the spine puts in the air, as [latMin, latMax, yMin, yMax], for
 * the clearance check (rule 4). Built from the same numbers as buildSpine.
 */
export function clearanceBlocks() {
  const outer = deckOuter();
  const track = trackOuter();
  const out = [
    [-PILLAR_HALF, PILLAR_HALF, 0, PILLAR_SPLIT], // the column, inside the barrier
    [0, outer, PILLAR_SPLIT, DECK_UNDER], // a Y arm, out to the deck underside
    [-outer, outer, DECK_UNDER, DECK_TOP], // the two slabs (with the wall between)
    [-outer, outer, DECK_TOP, SPINE_WALL_TOP], // parapets, rails and the spine wall
    [-track, track, SHELF_UNDER, DECK_TOP], // the cabin track on the deck edge
    [-track, track, END_BOTTOM, DECK_TOP], // a spine end block
  ];
  return out;
}

// ------------------------------------------------------------------ cabins
const CABIN_LEN = 3.2; // m
export const CABIN_WIDTH = 1.6;
const CABIN_H = 1.45;
const CABIN_GAP = 1.5; // between cabins inside a platoon
const CABIN_SPEED = 140 / 3.6; // a steady 140 km/h
const GAP_MIN_S = 5; // between platoons, per side ...
const GAP_SPREAD_S = 7; // ... 5 to 12 s: the guideway is a stream, as drawn
const CYCLE_N = 8; // platoons per schedule cycle
const PASTELS = [0xf2d7c4, 0xc7e3d8, 0xd6cee9, 0xc9dcef, 0xf0e6b4, 0xf0c9cf, 0xcfe3c0, 0xe2d6c0];
const SEEN_BEHIND = 400; // m of spine kept running behind you ...
const SEEN_AHEAD = 1800; // ... and ahead (past that they are a pixel)
const CAP = 96; // cabin instances per side

/**
 * A platoon schedule per side: eight platoons whose positions repeat every
 * `cycle` metres, so a platoon's place is a pure function of the clock and its
 * schedule entry. No sim, no collisions, and the same seed gives the same world.
 */
function schedule(side) {
  const salt = side > 0 ? 101 : 102;
  const list = [];
  let c = 0;
  for (let i = 0; i < CYCLE_N; i++) {
    list.push({
      c,
      n: 3 + Math.floor(hash01(i, salt + 3) * 4),
      color: PASTELS[Math.floor(hash01(i, salt + 7) * PASTELS.length)],
    });
    c += (GAP_MIN_S + hash01(i, salt) * GAP_SPREAD_S) * CABIN_SPEED;
  }
  return { list, cycle: c };
}

/** One rounded cabin: a pastel body with a tinted glass canopy band. */
function cabinGeometry() {
  const ring = [
    [0.55, 0.02], [0.95, 0.24], [1, 0.6], [0.72, 0.92], [0, 1],
    [-0.72, 0.92], [-1, 0.6], [-0.95, 0.24], [-0.55, 0.02],
  ];
  const glass = [false, false, true, true, true, true, true, false, false];
  const secs = [
    [-1.6, 0.45], [-1.3, 0.85], [-0.9, 1], [0.9, 1], [1.3, 0.85], [1.6, 0.45],
  ];
  const pt = (sec, p) => {
    const [x, sc] = sec;
    const [z, y] = p;
    return [x, 0.75 + (y - 0.5) * CABIN_H * sc, z * (CABIN_WIDTH / 2) * sc];
  };
  const pos = [];
  const nrm = [];
  const col = [];
  const quad = (A, B, C, D, cA, cB, cC, cD) => {
    // outward = away from the cabin's own centre line
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const my = (A[1] + B[1] + C[1] + D[1]) / 4, mz = (A[2] + B[2] + C[2] + D[2]) / 4;
    const out = [0, my - 0.75, mz];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 && Math.abs(out[1]) + Math.abs(out[2]) > 1e-6) {
      n = [-n[0], -n[1], -n[2]];
      [B, D] = [D, B];
      [cB, cD] = [cD, cB];
    }
    for (const [p, c] of [[A, cA], [B, cB], [C, cC], [A, cA], [C, cC], [D, cD]]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(n[0], n[1], n[2]);
      col.push(c[0], c[1], c[2]);
    }
  };
  const BODY = [0.92, 0.92, 0.92];
  const GLASS = [0.14, 0.19, 0.26];
  for (let i = 0; i < secs.length - 1; i++) {
    for (let j = 0; j < ring.length; j++) {
      const j2 = (j + 1) % ring.length;
      quad(
        pt(secs[i], ring[j]), pt(secs[i + 1], ring[j]), pt(secs[i + 1], ring[j2]), pt(secs[i], ring[j2]),
        BODY, BODY, glass[j2] ? GLASS : BODY, glass[j] ? GLASS : BODY,
      );
    }
  }
  // flat caps at both ends
  for (const [sec, sign] of [[secs[0], -1], [secs[secs.length - 1], 1]]) {
    const centre = pt(sec, [0, 0.5]);
    for (let j = 0; j < ring.length; j++) {
      const j2 = (j + 1) % ring.length;
      const A = pt(sec, ring[j]);
      const C = pt(sec, ring[j2]);
      const B = [centre[0], centre[1], centre[2]];
      const list = sign > 0 ? [A, B, C] : [A, C, B];
      for (const p of list) {
        pos.push(p[0], p[1], p[2]);
        nrm.push(sign, 0, 0);
        col.push(BODY[0], BODY[1], BODY[2]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * The cabin platoons. One InstancedMesh per side, driven by the clock: positions
 * are recomputed from the schedule every frame, and a cabin is only drawn where
 * the spine exists. It runs down the end block and is gone there, as if into a
 * station.
 */
export class Cabins {
  constructor(scene, road, M) {
    this.road = road;
    this.time = 0;
    this.promised = false;
    this.sched = [schedule(1), schedule(-1)];
    this.geo = cabinGeometry();
    this.mesh = [];
    this.group = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const m = new THREE.InstancedMesh(this.geo, M.futCabin, CAP);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
      const colour = new THREE.Color();
      for (let k = 0; k < CAP; k++) m.setColorAt(k, colour.set(0xffffff));
      this.mesh.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
    scene.add(this.group);
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
  }

  setWorld(w) {
    this.promised = w === 'promised';
    this.group.visible = this.promised;
  }

  update(dt, sPlayer) {
    if (!this.promised) return;
    this.time += dt;
    const lat = cabinLat();
    const y = DECK_TOP + 0.05;
    const sMin = sPlayer - SEEN_BEHIND;
    const sMax = sPlayer + SEEN_AHEAD;
    for (let si = 0; si < 2; si++) {
      const side = si === 0 ? 1 : -1;
      const { list, cycle } = this.sched[si];
      const mesh = this.mesh[si];
      const base = side * CABIN_SPEED * this.time;
      let used = 0;
      for (const pl of list) {
        const kLo = Math.floor((sMin - 40 - base - pl.c) / cycle);
        const kHi = Math.ceil((sMax + 40 - base - pl.c) / cycle);
        for (let k = kLo; k <= kHi && used < CAP; k++) {
          const lead = base + pl.c + k * cycle;
          for (let j = 0; j < pl.n && used < CAP; j++) {
            const s = lead - side * j * (CABIN_LEN + CABIN_GAP);
            if (s < sMin || s > sMax || !spineAt(s)) continue;
            const p = this.road.sample(s, {});
            this._v.set(p.x + p.nx * side * lat, y, p.z + p.nz * side * lat);
            this._q.setFromAxisAngle(_up, p.h + (side > 0 ? 0 : Math.PI));
            this._m.compose(this._v, this._q, _scl);
            mesh.setMatrixAt(used, this._m);
            mesh.setColorAt(used, this._c.set(pl.color));
            used++;
          }
        }
      }
      mesh.count = used;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
