// Streams the motorway world in 200 m chunks around the player.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { hash01, mulberry32, clamp } from './util.js';
import { innerEdge, outerEdgeLine, pavementEdge, guardrailLat, laneLat } from './layout.js';
import * as TX from './textures.js';
import { futureMaterials, futureNight, buildSpine, Cabins } from './futureScenery.js';
import {
  junctionsNear,
  junctionAtEstateBlock,
  junctionLitAt,
  roadSegments,
  inJunction,
  mirrorS,
  overpassS,
  BRIDGE_PLATEAU_M,
  DECK_Y,
  DUTCH_PLACES as DUTCH_PLACES_J,
  ROUTES as ROUTES_J,
} from './junctions.js';

export const CHUNK = 200;
// Most Dutch motorways are unlit nowadays; lighting stays near junctions.
export const LIT_SHARE = 0.3;
export const LAMP_EVERY = 50;
const ROW = 5;

// ---------- geometry accumulation ----------
class GeoBuilder {
  constructor(colors = false) {
    this.p = [];
    this.n = [];
    this.u = [];
    this.c = colors ? [] : null;
  }
  tri(a, b, c, ua, ub, uc, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this.p.push(...a, ...b, ...c);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.u.push(...ua, ...ub, ...uc);
    if (this.c) {
      const cc = col || [1, 1, 1];
      this.c.push(...cc, ...cc, ...cc);
    }
  }
  quad(a, b, c, d, ua, ub, uc, ud, col) {
    this.tri(a, b, c, ua, ub, uc, col);
    this.tri(a, c, d, ua, uc, ud, col);
  }
  addGeo(geo, matrix, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(matrix);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    const U = g.attributes.uv ? g.attributes.uv.array : null;
    for (let i = 0; i < P.length / 3; i++) {
      this.p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      this.n.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      this.u.push(U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0);
      if (this.c) this.c.push(...(color || [1, 1, 1]));
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  get empty() {
    return this.p.length === 0;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
function mat(x, y, z, yaw, sx = 1, sy = 1, sz = 1) {
  _q.setFromAxisAngle(_up, yaw);
  return _m4.compose(_v.set(x, y, z), _q, _sc.set(sx, sy, sz)).clone();
}

/** A quad that always faces up, whichever way the caller happened to wind it. */
function groundQuad(b, A, B, C, D, uv = [[0, 0], [0, 0], [0, 0], [0, 0]]) {
  const ux = B[0] - A[0], uz = B[2] - A[2];
  const vx = C[0] - A[0], vz = C[2] - A[2];
  if (uz * vx - ux * vz >= 0) b.quad(A, B, C, D, uv[0], uv[1], uv[2], uv[3]);
  else b.quad(A, D, C, B, uv[0], uv[3], uv[2], uv[1]);
}

const DUTCH_PLACES = DUTCH_PLACES_J;
const ROUTES = ROUTES_J;

// Distribution centres (F-40): made-up companies, and the usual sandwich-panel colours.
const ESTATE_BLOCK = 5000;
const ESTATE_SHARE = 0.8;
const BRANDS = [
  { name: 'POLDERHUB', color: '#1f4e9c', mark: 2 },
  { name: 'Kruidhof Logistiek', color: '#0f7a4a', mark: 0 },
  { name: 'LINDEWAARD', color: '#c8102e', mark: 1 },
  { name: 'Veenlog', color: '#f39200', mark: 2 },
  { name: 'Brinkveld Distributie', color: '#2a2a2a', mark: 1 },
  { name: 'NOORDWAARTS', color: '#00838f', mark: 0 },
  { name: 'Eemvaart Fulfilment', color: '#6a2c91', mark: 2 },
  { name: 'Hollandse Kade', color: '#1f4e9c', mark: 1 },
  { name: 'TULPA', color: '#d4145a', mark: 0 },
  { name: 'De Wetering DC', color: '#0f7a4a', mark: 2 },
];
const CLADDING = [
  [0.8, 0.81, 0.81], [0.8, 0.81, 0.81], [0.72, 0.74, 0.76], [0.86, 0.87, 0.86],
  [0.45, 0.52, 0.6], [0.55, 0.6, 0.64], [0.3, 0.31, 0.33],
];
const hexRGB = (h) => [1, 3, 5].map((i) => {
  const c = parseInt(h.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; // sRGB -> linear, like vertex colours expect
});

export class Scenery {
  constructor(scene, road, envMapGetter) {
    this.scene = scene;
    this.msiSigns = new Map(); // gantry index -> { ch, mats: [per lane] } (faces set by main from msi.js)
    this.road = road;
    this.chunks = new Map();
    this.stale = new Set(); // chunk indices the world switch still has to rebuild
    this.rotors = [];
    this.night = false;
    this.mode = null;
    this.world = CONFIG.world;
    this.sPlayer = 0;
    this.time = 0;
    this.makeMaterials();
    this.cabins = new Cabins(scene, road, this.M);
    this.cabins.setWorld(this.world);
  }

  makeMaterials() {
    const M = {};
    const asphalt = TX.asphaltTexture();
    M.asphalt = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.93, metalness: 0 });
    M.marking = new THREE.MeshStandardMaterial({
      color: 0xf2f2ec,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      emissive: 0xffffff,
      emissiveIntensity: 0,
    });
    // Retroreflective paint: lines light up inside your own headlight beam and
    // fade beyond it, so at night you follow the lines your lamps pick out.
    const beamU = {
      uBeamPos: { value: new THREE.Vector3() },
      uBeamDir: { value: new THREE.Vector2(0, 1) },
      uBeam: { value: 0 },
      uHigh: { value: 0 },
    };
    M.marking.userData.beam = beamU;
    M.marking.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, beamU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vWPos;\nuniform vec3 uBeamPos;\nuniform vec2 uBeamDir;\nuniform float uBeam;\nuniform float uHigh;',
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec2 d = vWPos.xz - uBeamPos.xz;
            float along = dot(d, uBeamDir);
            float side = abs(d.x * uBeamDir.y - d.y * uBeamDir.x);
            float reach = mix(105.0, 210.0, uHigh);
            float a = smoothstep(3.0, 9.0, along) * (1.0 - smoothstep(reach * 0.45, reach, along));
            float w = 3.5 + along * mix(0.17, 0.13, uHigh);
            float b = a * (1.0 - smoothstep(w * 0.6, w, side));
            totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * uBeam * b * 0.9;
          }`,
        );
    };
    const conc = TX.concreteTexture();
    M.concrete = new THREE.MeshStandardMaterial({ map: conc, roughness: 0.9, side: THREE.DoubleSide });
    const grass = TX.grassTexture();
    M.grass = new THREE.MeshStandardMaterial({ map: grass, roughness: 1, color: 0xd8e8c8, side: THREE.DoubleSide });
    this.fieldsTex = TX.fieldsTexture();
    M.fields = new THREE.MeshStandardMaterial({ map: this.fieldsTex, roughness: 1 });
    M.water = new THREE.MeshStandardMaterial({ color: 0x2a3434, roughness: 0.04, metalness: 0.6, envMapIntensity: 0.7 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0xb4b9be, roughness: 0.38, metalness: 0.8, side: THREE.DoubleSide });
    M.post = new THREE.MeshStandardMaterial({ color: 0x7a7f84, roughness: 0.6, metalness: 0.5 });
    M.gantry = new THREE.MeshStandardMaterial({ color: 0x9aa1a7, roughness: 0.5, metalness: 0.6 });
    M.dark = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.7 });
    M.reflector = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 });
    M.tree = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    M.building = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    M.windowLit = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc070, emissiveIntensity: 0 });
    M.lampHead = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff9a3c, emissiveIntensity: 0, roughness: 0.4 }); // sodium
    M.pool = new THREE.MeshBasicMaterial({
      map: TX.radialTexture(),
      color: 0xffa04a,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -6,
    });
    M.pool.visible = false;
    M.wall = new THREE.MeshStandardMaterial({ map: TX.noiseWallTexture(), roughness: 0.85, side: THREE.DoubleSide });
    M.turbine = new THREE.MeshStandardMaterial({ color: 0xe9ecee, roughness: 0.6 });
    M.aviation = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1000, emissiveIntensity: 0 });
    M.signBack = new THREE.MeshStandardMaterial({ color: 0x8b9095, roughness: 0.6, metalness: 0.4 });
    // distribution centres (F-40)
    M.cladding = new THREE.MeshStandardMaterial({ map: TX.claddingTexture(), vertexColors: true, roughness: 0.7, metalness: 0.15 });
    const paved = { roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
    M.yard = new THREE.MeshStandardMaterial({ color: 0x77797a, ...paved });
    M.lane = new THREE.MeshStandardMaterial({ color: 0x404345, ...paved });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.12, metalness: 0.6 });
    M.dockLamp = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xeef4ff, emissiveIntensity: 0 });
    M.poolWhite = M.pool.clone();
    M.poolWhite.color.set(0xcfe0ff);
    this.M = M;
    // the promised world's pieces (F-48), so a bucket name is also a material
    futureMaterials(M, conc);
    // colours the world switch tints (the tint is a multiply on the material)
    this.baseTint = { grass: M.grass.color.getHex(), fields: M.fields.color.getHex(), lamp: M.lampHead.emissive.getHex() };
  }

  /** Is the motorway lit at s? Lit stretches are 1.6 km long, lamps every 50 m. */
  litAt(s) {
    return hash01(Math.floor(s / 1600), 4) < LIT_SHARE || junctionLitAt(s);
  }

  /**
   * F-24: a wet road: darker, slightly glossier asphalt and markings. A material
   * tweak only; real reflections of lights are slice 2.
   */
  setWet(on) {
    const M = this.M;
    M.asphalt.color.set(on ? 0x8a8c90 : 0xffffff);
    M.asphalt.roughness = on ? 0.6 : 0.93;
    M.asphalt.envMapIntensity = on ? 1.6 : 1;
    M.marking.roughness = on ? 0.4 : 0.6;
  }

  setNight(mode) {
    const night = mode === 'night';
    const dusk = mode === 'dusk';
    this.night = night;
    this.mode = mode;
    const M = this.M;
    M.marking.emissiveIntensity = night ? 0.015 : 0;
    M.reflector.emissiveIntensity = night ? 0.5 : dusk ? 0.1 : 0;
    M.windowLit.emissiveIntensity = night ? 2.2 : dusk ? 1.2 : 0;
    M.lampHead.emissiveIntensity = night ? 9 : dusk ? 4 : 0;
    M.pool.visible = night || dusk;
    M.pool.opacity = night ? 0.17 : 0.07;
    M.dockLamp.emissiveIntensity = night ? 4 : dusk ? 2 : 0;
    M.poolWhite.visible = night || dusk;
    M.poolWhite.opacity = night ? 0.18 : 0.06;
    // the promised world lights with cool white instead of sodium
    this.applyWorldTint();
    futureNight(M, mode, this.world === 'promised');
    for (const ch of this.chunks.values()) for (const m of ch.signMats) m.emissiveIntensity = night ? m.userData.nightE : 0;
    this.signNightFactor = night;
  }

  /**
   * F-48: switch between the A12 as it is and the promised one. The chunks
   * within 900 m of the player are rebuilt here, on the white frame of the
   * flits; the rest are marked stale and stream over at the usual budget, each
   * one replaced only once its new version exists, so no stretch of road goes
   * bare behind the flash.
   */
  setWorld(w, sPlayer = null) {
    if (w === this.world) return;
    this.world = w;
    this.cabins.setWorld(w);
    if (this.mode) this.setNight(this.mode);
    if (sPlayer != null) this.rebuild(sPlayer);
  }

  rebuild(sPlayer) {
    const i0 = Math.floor((sPlayer - 600) / CHUNK);
    const i1 = Math.floor((sPlayer + 2800) / CHUNK);
    const near = [];
    for (let i = i0; i <= i1; i++) if (Math.abs(i * CHUNK - sPlayer) < 900) near.push(i);
    near.sort((a, b) => Math.abs(a * CHUNK - sPlayer) - Math.abs(b * CHUNK - sPlayer));
    for (const i of near) this.replaceChunk(i);
    for (const i of this.chunks.keys()) if (!near.includes(i)) this.stale.add(i);
  }

  /** Builds a chunk in the current world, replacing the one that is there. */
  replaceChunk(i) {
    const old = this.chunks.get(i);
    this.chunks.delete(i);
    if (old) this.dispose(old);
    this.stale.delete(i);
    this.chunks.set(i, this.buildChunk(i));
  }

  /** Grass and fields take the promised world's colour; lamps turn cool white. */
  applyWorldTint() {
    const promised = this.world === 'promised';
    const M = this.M;
    M.grass.color.set(promised ? 0xd6f4bc : this.baseTint.grass);
    M.fields.color.set(promised ? 0xd8f0c0 : this.baseTint.fields);
    M.lampHead.emissive.set(promised ? 0xcfe2ff : this.baseTint.lamp);
    M.pool.color.set(promised ? 0xa8c8ff : 0xffa04a);
  }

  dispose(ch) {
    this.scene.remove(ch.group);
    ch.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of ch.ownMats) {
      if (m.map && m.userData.ownTex) m.map.dispose();
      m.dispose();
    }
    this.rotors = this.rotors.filter((r) => r.chunk !== ch.idx);
    for (const [i, e] of this.msiSigns) if (e.ch === ch) this.msiSigns.delete(i);
  }

  update(sPlayer, budget = 2) {
    this.sPlayer = sPlayer;
    const i0 = Math.floor((sPlayer - 600) / CHUNK);
    const i1 = Math.floor((sPlayer + 2800) / CHUNK);
    for (const [idx, ch] of this.chunks) {
      if (idx < i0 - 1 || idx > i1 + 1) {
        this.dispose(ch);
        this.chunks.delete(idx);
        this.stale.delete(idx);
      }
    }
    // build nearest first (the two keep-buffers included, so a chunk that the
    // world switch left stale is replaced wherever it sits)
    let built = 0;
    const order = [];
    for (let i = i0 - 1; i <= i1 + 1; i++) if (!this.chunks.has(i) || this.stale.has(i)) order.push(i);
    order.sort((a, b) => Math.abs(a * CHUNK - sPlayer) - Math.abs(b * CHUNK - sPlayer));
    for (const i of order) {
      if (built >= budget) break;
      this.replaceChunk(i);
      built++;
    }
  }

  animate(dt) {
    this.time += dt;
    this.cabins.update(dt, this.sPlayer);
    for (const r of this.rotors) r.mesh.rotation.z += r.speed * dt;
    const blink = Math.floor(this.time / 1.0) % 2 === 0;
    this.M.aviation.emissiveIntensity = this.night ? (blink ? 6 : 0.3) : 0;
  }

  // ------------------------------------------------------------------
  buildChunk(idx) {
    const road = this.road;
    const s0 = idx * CHUNK;
    const s1 = s0 + CHUNK;
    const o = road.sample(s0, {});
    const ox = o.x, oz = o.z;
    const rows = [];
    for (let s = s0; s <= s1 + 1e-6; s += ROW) {
      const p = road.sample(s, {});
      rows.push({ s, x: p.x - ox, z: p.z - oz, nx: p.nx, nz: p.nz, tx: p.tx, tz: p.tz, h: p.h });
    }
    const local = (s, lat, y = 0) => {
      const p = road.sample(s);
      return [p.x - ox + p.nx * lat, y, p.z - oz + p.nz * lat];
    };
    const B = {};
    const bucket = (name, colors = false) => (B[name] ||= new GeoBuilder(colors));
    const group = new THREE.Group();
    group.position.set(ox, 0, oz);
    const ch = { idx, group, ownMats: [], signMats: [] };
    const rng = mulberry32(idx * 7919 + 13);

    const E = pavementEdge();
    const G = guardrailLat();
    const ie = innerEdge();
    const oe = outerEdgeLine();

    // ---- sweep a profile [[lat,y],...] along rows (profile left->right for outward normals)
    const sweep = (b, profile, uvFn, rr = rows) => {
      for (let r = 0; r < rr.length - 1; r++) {
        const A = rr[r], Bn = rr[r + 1];
        for (let j = 0; j < profile.length - 1; j++) {
          const [l0, y0] = profile[j], [l1, y1] = profile[j + 1];
          const a = [A.x + A.nx * l0, y0, A.z + A.nz * l0];
          const b2 = [A.x + A.nx * l1, y1, A.z + A.nz * l1];
          const c = [Bn.x + Bn.nx * l1, y1, Bn.z + Bn.nz * l1];
          const d = [Bn.x + Bn.nx * l0, y0, Bn.z + Bn.nz * l0];
          b.quad(a, b2, c, d, uvFn(A, l0, y0, a), uvFn(A, l1, y1, b2), uvFn(Bn, l1, y1, c), uvFn(Bn, l0, y0, d));
        }
      }
    };
    const worldUV = (scale) => (R, l, y, p) => [(p[0] + ox) / scale, -(p[2] + oz) / scale];

    // ---- road surface
    sweep(bucket('asphalt'), [[-E, 0], [E, 0]], (R, l) => [(l + E) / (2 * E), R.s / 16]);

    // ---- markings (both carriageways)
    const mk = bucket('marking');
    const Y = 0.0;
    const solid = (c, w) => sweep(mk, [[c - w / 2, Y], [c + w / 2, Y]], () => [0, 0]);
    const dashed = (c, w, dash, period, phase = 0) => {
      let d = Math.ceil((s0 - phase) / period) * period + phase;
      for (; d < s1; d += period) {
        const a = local(d, c - w / 2, Y), b2 = local(d, c + w / 2, Y);
        const cc = local(d + dash, c + w / 2, Y), dd = local(d + dash, c - w / 2, Y);
        mk.quad(a, b2, cc, dd, [0, 0], [0, 0], [0, 0], [0, 0]);
      }
    };
    // a solid line over part of the chunk only (junction markings cut the edge line)
    const lineAt = (c, w, sa, sb, y = Y) => {
      const a0 = Math.max(sa, s0), b0 = Math.min(sb, s1);
      for (let s = a0; s < b0; s += 10) {
        const e = Math.min(s + 10, b0);
        const a = local(s, c - w / 2, y), b2 = local(s, c + w / 2, y);
        const cc = local(e, c + w / 2, y), dd = local(e, c - w / 2, y);
        mk.quad(a, b2, cc, dd, [0, 0], [0, 0], [0, 0], [0, 0]);
      }
    };
    // block marking (short wide dashes) between lane 0 and the exit lane / strip
    const blockAt = (c, w, sa, sb, y = Y) => {
      const a0 = Math.max(sa, s0), b0 = Math.min(sb, s1);
      for (let s = Math.ceil(a0 / 4) * 4; s < b0; s += 4) {
        const e = Math.min(s + 1, b0);
        const a = local(s, c - w / 2, y), b2 = local(s, c + w / 2, y);
        const cc = local(e, c + w / 2, y), dd = local(e, c - w / 2, y);
        mk.quad(a, b2, cc, dd, [0, 0], [0, 0], [0, 0], [0, 0]);
      }
    };
    // the junctions whose pieces reach into this chunk
    const junc = junctionsNear(s0, s1);
    // where the right edge line gives way: the exit lane and the strip
    const edgeCuts = (sg) => {
      const out = [];
      for (const j of junc) {
        const m = (s) => (sg > 0 ? s : mirrorS(j, s));
        for (const [a, b] of [[j.exitStart, j.exitGore], [j.s0 - 60, j.s1 + 80]]) {
          const x = m(a), y2 = m(b);
          out.push([Math.min(x, y2), Math.max(x, y2)]);
        }
      }
      return out.sort((p, q) => p[0] - q[0]);
    };
    const withoutCuts = (a, b, cuts) => {
      let segs = [[a, b]];
      for (const [ca, cb] of cuts) {
        const next = [];
        for (const [x, y2] of segs) {
          if (cb <= x || ca >= y2) {
            next.push([x, y2]);
            continue;
          }
          if (ca > x) next.push([x, ca]);
          if (cb < y2) next.push([cb, y2]);
        }
        segs = next;
      }
      return segs;
    };
    for (const sg of [1, -1]) {
      solid(sg * (ie + 0.08), 0.15);
      // the right edge line, except where a junction puts the block marking there
      const cuts = edgeCuts(sg);
      for (const [a, b] of withoutCuts(s0, s1, cuts)) if (b - a > 0.5) lineAt(sg * (oe - 0.1), 0.2, a, b);
      for (let k = 1; k < CONFIG.lanes; k++) dashed(sg * (ie + k * CONFIG.laneWidth), 0.15, 3, 12);
      for (const [a, b] of cuts) blockAt(sg * (oe - 0.1), 0.4, a, b);
    }

    // ---- median barrier (concrete step barrier)
    const barrierProfile = [[-0.3, 0], [-0.24, 0.08], [-0.1, 0.3], [-0.085, 0.85], [0.085, 0.85], [0.1, 0.3], [0.24, 0.08], [0.3, 0]];
    sweep(bucket('concrete'), barrierProfile, (R, l, y) => [R.s / 4, y * 1.5]);

    // ---- the promised world (F-48): the guideway spine over the median, with
    // its decks and the cabins that run on them. Same chunk group, same buckets.
    if (this.world === 'promised') buildSpine({ s0, s1, bucket, sweep, mat, rows, local, road, ox, oz });

    // ---- verges, ditches, fields, guardrails on both sides
    const vergeR = [[E, 0], [E + 1.5, -0.08], [E + 5, -0.35], [E + 8.5, -1.2], [E + 11, -1.25], [E + 14.5, -0.35], [E + 16, -0.3]];
    const vergeL = vergeR.map(([l, y]) => [-l, y]).reverse();
    sweep(bucket('grass'), vergeR, worldUV(7));
    sweep(bucket('grass'), vergeL, worldUV(7));
    sweep(bucket('fields'), [[E + 16, -0.3], [E + 280, -0.3]], worldUV(400));
    sweep(bucket('fields'), [[-E - 280, -0.3], [-E - 16, -0.3]], worldUV(400));
    sweep(bucket('water'), [[E + 7.6, -0.98], [E + 12, -0.98]], () => [0, 0]);
    sweep(bucket('water'), [[-E - 12, -0.98], [-E - 7.6, -0.98]], () => [0, 0]);

    const railR = [[0, 0.45], [-0.08, 0.51], [-0.03, 0.6], [-0.08, 0.69], [0, 0.76]].map(([l, y]) => [G + l, y]);
    const railL = railR.map(([l, y]) => [-l, y]).reverse();
    // the right-hand guardrail stops where a ramp road leaves or joins the
    // motorway: the junction road's own rail takes over there
    const railGap = (sg) => {
      const out = [];
      for (const j of junc) {
        const m = (s) => (sg > 0 ? s : mirrorS(j, s));
        for (const [a, b] of [[j.exitGore - 20, j.exitTop], [j.rampTop, j.s0]]) {
          const x = m(a), y2 = m(b);
          out.push([Math.min(x, y2), Math.max(x, y2)]);
        }
      }
      return out;
    };
    const inGap = (s, gaps) => gaps.some(([a, b]) => s >= a && s <= b);
    const railGapsR = railGap(1), railGapsL = railGap(-1);
    // both right-hand rails (yours at +G, the other carriageway's at -G) stop where
    // their own ramp or exit road leaves the motorway
    for (const [a, b] of withoutCuts(s0, s1, railGapsR)) {
      const rr = rows.filter((r) => r.s >= a && r.s <= b);
      if (rr.length > 1) sweep(bucket('steel'), railR, (R, l, y) => [R.s / 4, y], rr);
    }
    for (const [a, b] of withoutCuts(s0, s1, railGapsL)) {
      const rr = rows.filter((r) => r.s >= a && r.s <= b);
      if (rr.length > 1) sweep(bucket('steel'), railL, (R, l, y) => [R.s / 4, y], rr);
    }
    const posts = bucket('post');
    const refl = bucket('reflector');
    for (let s = Math.ceil(s0 / 4) * 4; s < s1; s += 4) {
      const p = road.sample(s);
      for (const sg of [1, -1]) {
        if (sg > 0 && inGap(s, railGapsR)) continue;
        if (sg < 0 && inGap(s, railGapsL)) continue;
        const lat = sg * (G + 0.08);
        posts.addGeo(new THREE.BoxGeometry(0.1, 0.8, 0.12), mat(p.x - ox + p.nx * lat, 0.38, p.z - oz + p.nz * lat, p.h));
      }
      if (Math.round(s) % 48 === 0) {
        for (const sg of [1, -1]) {
          const lat = sg * (G - 0.09);
          refl.addGeo(new THREE.BoxGeometry(0.06, 0.08, 0.02), mat(p.x - ox + p.nx * lat, 0.64, p.z - oz + p.nz * lat, p.h));
        }
        refl.addGeo(new THREE.BoxGeometry(0.07, 0.07, 0.02), mat(p.x - ox, 0.75, p.z - oz, p.h)); // barrier reflector
      }
    }

    // ---- hectometre boards
    for (let s = Math.ceil(s0 / 100) * 100; s < s1; s += 100) {
      const p = road.sample(s, {});
      const hm = Math.round(s / 100) + 600;
      const text = `${Math.floor(hm / 10)},${hm % 10}`;
      const lat = G + 1.1;
      const px = p.x - ox + p.nx * lat, pz = p.z - oz + p.nz * lat;
      posts.addGeo(new THREE.BoxGeometry(0.08, 1.0, 0.08), mat(px, 0.25, pz, p.h));
      const t = TX.hectoTexture(text, 'Re');
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: this.night ? 0.12 : 0 });
      m.userData.ownTex = true;
      m.userData.nightE = 0.12;
      ch.ownMats.push(m);
      ch.signMats.push(m);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), m);
      board.position.set(px, 0.95, pz);
      board.rotation.y = p.h + Math.PI - 0.25;
      group.add(board);
    }

    // ---- features scheduled per km
    const kmA = Math.floor(s0 / 1000), kmB = Math.floor((s1 - 1) / 1000);
    for (let K = kmA; K <= kmB; K++) {
      const inChunk = (s) => s >= s0 && s < s1;
      const sOver = overpassS(K);
      // a junction brings its own bridge; no random viaduct on top of it
      if (sOver != null && inChunk(sOver)) this.overpass(sOver, local, bucket, ox, oz, K);
      // matrix signs every 500 m (see msi.js for what they show)
      for (const sMatrix of [K * 1000 + 160, K * 1000 + 660]) if (inChunk(sMatrix)) this.matrixGantry(sMatrix, group, ch, ox, oz, bucket, K);
      const sAnwb = K * 1000 + 860;
      if (hash01(K, 3) < 0.3 && inChunk(sAnwb)) this.anwbGantry(sAnwb, group, ch, ox, oz, bucket, K);
      const sSpeed = K * 1000 + 330;
      if (K % 3 === 0 && inChunk(sSpeed)) this.speedSigns(sSpeed, group, ch, ox, oz, bucket);
    }

    // ---- junctions (F-20 slice 2): bridge, crossing road, ramp and exit roads,
    // markings and signs. Each piece is built in the chunk that holds its s.
    for (const j of junc) this.junctionPieces(j, s0, s1, { local, bucket, group, ch, ox, oz, road, rows, sweep });

    // ---- lighting (lit stretches)
    if (this.litAt(s0)) {
      const pool = bucket('pool');
      const lamps = bucket('lampHead');
      for (let s = Math.ceil(s0 / LAMP_EVERY) * LAMP_EVERY; s < s1; s += LAMP_EVERY) {
        const p = road.sample(s, {});
        const x = p.x - ox, z = p.z - oz;
        posts.addGeo(new THREE.CylinderGeometry(0.1, 0.14, 12, 8), mat(x, 6, z, p.h));
        for (const sg of [1, -1]) {
          const al = sg * 1.4;
          posts.addGeo(new THREE.BoxGeometry(2.8, 0.1, 0.1), mat(x + p.nx * al, 12, z + p.nz * al, p.h + Math.PI / 2));
          const ll = sg * 2.9;
          lamps.addGeo(new THREE.BoxGeometry(0.35, 0.12, 0.7), mat(x + p.nx * ll, 11.92, z + p.nz * ll, p.h));
          // light pool on the carriageway
          const c = sg * (ie + CONFIG.lanes * CONFIG.laneWidth * 0.42);
          const hw = (CONFIG.lanes * CONFIG.laneWidth) / 2 + 2.5;
          const a = local(s - 22, c - hw, 0.02), b2 = local(s - 22, c + hw, 0.02);
          const cc = local(s + 22, c + hw, 0.02), dd = local(s + 22, c - hw, 0.02);
          pool.quad(a, b2, cc, dd, [0, 0], [1, 0], [1, 1], [0, 1]);
        }
      }
    }

    // ---- noise barriers
    for (const sg of [1, -1]) {
      if (hash01(Math.floor(s0 / 1200), sg > 0 ? 5 : 6) < 0.16) {
        const wl = G + 2.6;
        const prof = sg > 0 ? [[wl, -0.3], [wl, 4.2]] : [[-wl, 4.2], [-wl, -0.3]];
        sweep(bucket('wall'), prof, (R, l, y) => [R.s / 8, (y + 0.3) / 4.5]);
      }
    }

    // ---- trees, farms, turbines
    const trees = [];
    const addTree = (s, lat, kind, scale) => {
      if (this.inEstate(s, lat) || inJunction(s, lat, 25)) return;
      const p = road.sample(s);
      trees.push({ x: p.x - ox + p.nx * lat, z: p.z - oz + p.nz * lat, kind, scale, rot: rng() * 6.28 });
    };
    for (const sg of [1, -1]) {
      const block = Math.floor(s0 / 600);
      const rowFlag = hash01(block, sg > 0 ? 21 : 22);
      if (rowFlag < 0.35) {
        const lat = sg * (E + 20 + hash01(block, 23) * 25);
        const kind = rowFlag < 0.2 ? 'poplar' : 'oak';
        const sp = kind === 'poplar' ? 8 : 11;
        for (let s = Math.ceil(s0 / sp) * sp; s < s1; s += sp) addTree(s, lat + (rng() - 0.5), kind, 0.85 + rng() * 0.3);
      }
      // scattered clumps
      const nClumps = Math.floor(rng() * 3);
      for (let k = 0; k < nClumps; k++) {
        const cs = s0 + rng() * CHUNK, cl = sg * (E + 35 + rng() * 220);
        const n = 3 + Math.floor(rng() * 8);
        for (let t = 0; t < n; t++) addTree(cs + (rng() - 0.5) * 30, cl + (rng() - 0.5) * 30, rng() < 0.3 ? 'poplar' : 'oak', 0.7 + rng() * 0.6);
      }
      if (rng() < 0.22) {
        const fs = s0 + rng() * CHUNK, fl = sg * (E + 70 + rng() * 160);
        if (!this.inEstate(fs, fl, 40) && !inJunction(fs, fl, 40)) this.farm(fs, fl, rng, local, bucket, addTree, road, ox, oz);
      }
    }
    // distribution centres (F-40): each box is built whole by the chunk holding its centre;
    // the young trees along the service road stream with the chunks
    for (const est of this.estatesNear(s0, s1)) {
      for (const box of est.boxes) if (box.sC >= s0 && box.sC < s1) this.distributionCentre(est, box, group, ch, bucket, ox, oz);
      // a junction estate gets a straight service road from the crossing road to its car park
      if (est.j) {
        const lat = est.sg * (est.d0 - 40);
        const a = Math.max(s0, est.j.sBridge + 10), b = Math.min(s1, est.sA);
        if (b - a > 1) {
          const P = (p, l, y) => [p.x - ox + p.nx * l, y, p.z - oz + p.nz * l];
          const p1 = road.sample(a, {}), p2 = road.sample(b, {});
          const z0 = [[0, 0], [0, 0], [0, 0], [0, 0]];
          groundQuad(bucket('lane'), P(p1, lat - 3, -0.24), P(p1, lat + 3, -0.24), P(p2, lat + 3, -0.24), P(p2, lat - 3, -0.24), z0);
        }
      }
      const lat = est.sg * (est.d0 - 51);
      for (let s = Math.ceil(Math.max(s0, est.sA) / 9) * 9; s < Math.min(s1, est.sB); s += 9) {
        const p = road.sample(s);
        trees.push({ x: p.x - ox + p.nx * lat, z: p.z - oz + p.nz * lat, kind: 'oak', scale: 0.4 + rng() * 0.15, rot: rng() * 6.28 });
      }
    }
    this.buildTrees(trees, group);

    // wind turbines: lines of 3-6 turbines in some 3 km blocks
    const tb = Math.floor(s0 / 3000);
    if (hash01(tb, 31) < 0.4) {
      const sg = hash01(tb, 32) < 0.5 ? 1 : -1;
      const latBase = sg * (380 + hash01(tb, 33) * 450);
      for (let s = Math.ceil(s0 / 420) * 420; s < s1; s += 420) {
        const local3 = local(s, latBase + (hash01(Math.round(s), 34) - 0.5) * 60, -1.7);
        this.turbine(local3, bucket, group, idx);
      }
    }

    // ---- assemble meshes
    for (const [name, b] of Object.entries(B)) {
      if (b.empty) continue;
      const mesh = new THREE.Mesh(b.build(), this.M[name]);
      mesh.receiveShadow = ['asphalt', 'grass', 'concrete', 'fields', 'marking', 'wall', 'building', 'cladding', 'yard', 'lane', 'futDeck', 'futDeckUnder', 'futDeckTop', 'futSpine', 'futRail', 'futEnd'].includes(name);
      mesh.castShadow = ['concrete', 'steel', 'post', 'building', 'gantry', 'wall', 'turbine', 'cladding', 'futDeck', 'futDeckUnder', 'futDeckTop', 'futSpine', 'futEnd'].includes(name);
      if (name === 'pool' || name === 'poolWhite') mesh.renderOrder = 4;
      group.add(mesh);
    }
    for (const m of ch.signMats) m.emissiveIntensity = this.night ? m.userData.nightE : 0;
    this.scene.add(group);
    return ch;
  }

  // ------------------------------------------------------------------
  // Junctions (F-20 slice 2). A junction is a place on the road: exit signs,
  // countdown markers (afritbakens), an exit lane before the bridge and an
  // on-ramp road after it, coming down from the crossing road. Every mark comes
  // from junctions.js, so the road and the sim agree without passing a seed.
  junctionPieces(j, c0, c1, ctx) {
    const { bucket, group, ch, ox, oz, road, local } = ctx;
    const inChunk = (s) => s >= c0 && s < c1;
    if (inChunk(j.sBridge)) this.junctionBridge(j, { bucket, ox, oz, road });
    for (const sg of [1, -1]) this.junctionRoad(j, sg, c0, c1, { bucket, ox, oz, road });
    this.junctionPavement(j, c0, c1, { bucket, ox, oz, road, local });
    this.junctionSigns(j, c0, c1, { group, ch, bucket, ox, oz, road });
  }

  /** The bridge over the motorway and the crossing road on top of it. */
  junctionBridge(j, { bucket, ox, oz, road }) {
    this.overpass(j.sBridge, null, bucket, ox, oz, j.b, { skew: 0, plateau: BRIDGE_PLATEAU_M });
    const p = road.sample(j.sBridge, {});
    const x = p.x - ox, z = p.z - oz;
    const G = guardrailLat();
    // the crossing road runs along the deck's long axis, its width along the motorway
    const rx = -Math.cos(p.h), rz = Math.sin(p.h);
    const wx = p.tx, wz = p.tz;
    const top = DECK_Y + 0.1;
    const flatEnd = G + 7 + BRIDGE_PLATEAU_M;
    const yAt = (t) => {
      if (t <= G + 7) return top;
      if (t <= flatEnd) return DECK_Y + 0.06;
      if (t <= flatEnd + 50) return DECK_Y + 0.06 + (-0.24 - DECK_Y) * ((t - flatEnd) / 50);
      return -0.24;
    };
    const halfW = 3.5;
    const asph = bucket('asphalt');
    const mk = bucket('marking');
    const P = (t, off, y) => [x + rx * t + wx * off, y, z + rz * t + wz * off];
    let prev = null;
    for (let t = -300; t <= 300 + 1e-6; t += 10) {
      const y = yAt(Math.abs(t));
      const row = { t, a: P(t, -halfW, y), b: P(t, halfW, y) };
      if (prev) {
        groundQuad(asph, prev.a, prev.b, row.b, row.a, [[0, prev.t / 16], [1, prev.t / 16], [1, row.t / 16], [0, row.t / 16]]);
        // centre line down the crossing road
        if (Math.abs(t) > G + 7) {
          const y0 = yAt(Math.abs(t) - 10) + 0.02, y1 = y + 0.02;
          groundQuad(mk, P(prev.t, -0.09, y0), P(prev.t, 0.09, y0), P(row.t, 0.09, y1), P(row.t, -0.09, y1), [[0, 0], [0, 0], [0, 0], [0, 0]]);
        }
      }
      prev = row;
    }
  }

  /** The ramp road (or the exit road, mirrored) of one carriageway. */
  junctionRoad(j, sg, c0, c1, { bucket, ox, oz, road }) {
    const asph = bucket('asphalt');
    const mk = bucket('marking');
    const grass = bucket('grass');
    const steel = bucket('steel');
    const posts = bucket('post');
    for (const seg of roadSegments(j, sg)) {
      // reach across to the crossing road at the top end
      let sA = seg.sA, sB = seg.sB;
      if (seg.at(sA).y > 5) sA -= 15;
      if (seg.at(sB).y > 5) sB += 15;
      const a0 = Math.max(sA, c0), b0 = Math.min(sB, c1);
      if (b0 - a0 < 1) continue;
      // the road widens to about 6 m up on the embankment, as the strip's own width at the gore
      const halfAt = (q) => CONFIG.laneWidth / 2 + 1.25 * clamp(q.y / DECK_Y, 0, 1);
      const rowsN = [];
      for (let s = a0; s <= b0 + 1e-6; s += 5) {
        const ss = Math.min(s, b0);
        const p = road.sample(ss, {});
        const q = seg.at(ss);
        const hw = halfAt(q);
        const y = q.y + 0.01;
        const toe = 2 * Math.max(0, q.y + 0.3);
        const P = (lat, yy) => [p.x - ox + p.nx * lat, yy, p.z - oz + p.nz * lat];
        rowsN.push({
          s: ss,
          y: q.y,
          lat: q.lat,
          hw,
          il: P(q.lat - hw, y),
          ir: P(q.lat + hw, y),
          ol: P(q.lat - hw - toe, -0.3),
          or: P(q.lat + hw + toe, -0.3),
          el0: P(q.lat - hw + 0.18, y + 0.02),
          el1: P(q.lat - hw + 0.33, y + 0.02),
          er0: P(q.lat + hw - 0.33, y + 0.02),
          er1: P(q.lat + hw - 0.18, y + 0.02),
          // guardrail on the far side, where the road is up in the air
          rail: P(q.lat + Math.sign(sg) * (hw + 0.7), q.y),
        });
      }
      const z0 = [[0, 0], [0, 0], [0, 0], [0, 0]];
      const E = pavementEdge();
      const auv = (lat, ss) => [(lat + E) / (2 * E), ss / 16];
      for (let i = 1; i < rowsN.length; i++) {
        const A = rowsN[i - 1], B = rowsN[i];
        groundQuad(asph, A.il, A.ir, B.ir, B.il, [auv(A.lat - A.hw, A.s), auv(A.lat + A.hw, A.s), auv(B.lat + B.hw, B.s), auv(B.lat - B.hw, B.s)]);
        if (A.y > 0.05 || B.y > 0.05) {
          groundQuad(grass, A.ol, A.il, B.il, B.ol);
          groundQuad(grass, A.ir, A.or, B.or, B.ir);
        }
        groundQuad(mk, A.el0, A.el1, B.el1, B.el0, z0);
        groundQuad(mk, A.er0, A.er1, B.er1, B.er0, z0);
        if (A.y > 1 && B.y > 1) {
          // a rail band: two horizontals and a face, enough at this distance
          steel.quad([A.rail[0], A.rail[1] + 0.45, A.rail[2]], [B.rail[0], B.rail[1] + 0.45, B.rail[2]],
            [B.rail[0], B.rail[1] + 0.8, B.rail[2]], [A.rail[0], A.rail[1] + 0.8, A.rail[2]], [0, 0], [1, 0], [1, 1], [0, 1]);
        }
      }
      // guardrail posts along the elevated part
      for (const r of rowsN) {
        if (r.y <= 1 || r.s % 16 > 5) continue;
        posts.addGeo(new THREE.BoxGeometry(0.1, 0.8, 0.12), mat(r.rail[0], r.rail[1] + 0.38, r.rail[2], road.sample(r.s).h));
      }
    }
  }

  /** Widened pavement, the strip's outer edge line and the hatched gore areas. */
  junctionPavement(j, c0, c1, { bucket, ox, oz, road }) {
    const E = pavementEdge();
    const asph = bucket('asphalt');
    const mk = bucket('marking');
    const W = j.stripOuter;
    const z0 = [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (const sg of [1, -1]) {
      const mir = (s) => (sg > 0 ? s : mirrorS(j, s));
      const span = (a, b) => [Math.min(mir(a), mir(b)), Math.max(mir(a), mir(b))];
      const P = (p, lat, y) => [p.x - ox + p.nx * lat * sg, y, p.z - oz + p.nz * lat * sg];
      // widened pavement over the exit lane and the strip, tapering at both ends
      for (const [a, b] of [span(j.exitStart, j.exitGore), span(j.s0 - 60, j.s1 + 80)]) {
        const a0 = Math.max(a, c0), b0 = Math.min(b, c1);
        if (b0 - a0 < 1) continue;
        const wid = (s) => E + (W - E) * clamp(Math.min((s - a) / 80, (b - s) / 80), 0, 1);
        for (let s = a0; s < b0; s += 10) {
          const e = Math.min(s + 10, b0);
          const p1 = road.sample(s, {}), p2 = road.sample(e, {});
          const w1 = wid(s), w2 = wid(e);
          const auv = (lat, ss) => [(lat + E) / (2 * E), ss / 16];
          groundQuad(asph, P(p1, E - 0.6, 0.005), P(p1, w1, 0.005), P(p2, w2, 0.005), P(p2, E - 0.6, 0.005),
            [auv(E - 0.6, s), auv(w1, s), auv(w2, e), auv(E - 0.6, e)]);
          groundQuad(mk, P(p1, w1 - 0.35, 0.02), P(p1, w1 - 0.2, 0.02), P(p2, w2 - 0.2, 0.02), P(p2, w2 - 0.35, 0.02), z0);
        }
      }
      // the gore: paved apron between the motorway and the diverging road,
      // hatching converging to a point where the two roads meet
      for (const seg of roadSegments(j, sg)) {
        const lowIsA = seg.at(seg.sA).y <= seg.at(seg.sB).y;
        const start = lowIsA ? seg.sA : seg.sB - 90;
        const band = [start, start + 90];
        const a0 = Math.max(Math.min(...band), c0), b0 = Math.min(Math.max(...band), c1);
        if (b0 - a0 < 1) continue;
        const high = (s) => Math.abs(seg.at(s).lat) - (CONFIG.laneWidth / 2 + 1.25 * clamp(seg.at(s).y / DECK_Y, 0, 1));
        for (let s = a0; s < b0; s += 10) {
          const e = Math.min(s + 10, b0);
          const lo1 = E - 0.6, lo2 = E - 0.6;
          const hi1 = high(s), hi2 = high(e);
          if (hi1 < lo1 + 0.3 && hi2 < lo2 + 0.3) continue;
          const p1 = road.sample(s, {}), p2 = road.sample(e, {});
          const auv = (lat, ss) => [(lat + E) / (2 * E), ss / 16];
          groundQuad(asph, P(p1, lo1, 0.004), P(p1, Math.max(lo1, hi1), 0.004), P(p2, Math.max(lo2, hi2), 0.004), P(p2, lo2, 0.004),
            [auv(lo1, s), auv(Math.max(lo1, hi1), s), auv(Math.max(lo2, hi2), e), auv(lo2, e)]);
          // diagonal hatching: one stripe every 8 m, 5 m long, 0.4 m wide
          for (let sa = s + 1; sa + 5.4 < e; sa += 8) {
            const sc = sa + 5;
            const q1 = road.sample(sa, {}), q1b = road.sample(sa + 0.4, {});
            const q2 = road.sample(sc, {}), q2b = road.sample(sc + 0.4, {});
            groundQuad(mk, P(q1, lo1 + 0.15, 0.02), P(q1b, lo1 + 0.15, 0.02),
              P(q2, Math.max(lo2 + 0.5, high(sc)), 0.02), P(q2b, Math.max(lo2 + 0.5, high(sc + 0.4)), 0.02), z0);
          }
        }
      }
    }
  }

  /** Exit signs, countdown markers and the gore sign, on both carriageways. */
  junctionSigns(j, c0, c1, { group, ch, bucket, ox, oz, road }) {
    const G = guardrailLat();
    const posts = bucket('post');
    const place = j.place;
    const put = (sSign, sg, lat, tex, w, h, yMid, nPost = 2) => {
      if (!(sSign >= c0 && sSign < c1)) return;
      const p = road.sample(sSign, {});
      const l = lat * sg;
      const x = p.x - ox + p.nx * l, z = p.z - oz + p.nz * l;
      const yaw = p.h + (sg > 0 ? Math.PI : 0);
      const postH = yMid + h / 2;
      for (let k = 0; k < nPost; k++) {
        const off = nPost === 1 ? 0 : (k === 0 ? -1 : 1) * (w / 2 - 0.35);
        posts.addGeo(new THREE.CylinderGeometry(0.06, 0.06, postH, 6), mat(x + p.tx * off, postH / 2, z + p.tz * off, 0));
      }
      // a hair in front of the posts, so the board is not fought over
      const d = sg > 0 ? -0.06 : 0.06;
      this.signMesh(group, ch, tex, w, h, x + p.tx * d, yMid, z + p.tz * d, yaw, 0.35);
    };
    for (const sg of [1, -1]) {
      const at = (s) => (sg > 0 ? s : mirrorS(j, s));
      put(at(j.signA), sg, G + 2.6, TX.exitSignTexture(j.number, place, '1200 m'), 3.6, 1.8, 3.1);
      put(at(j.signB), sg, G + 2.6, TX.exitSignTexture(j.number, place, '600 m'), 3.6, 1.8, 3.1);
      j.bakens.forEach((s, i) => put(at(s), sg, G + 1.5, TX.afritbakenTexture(3 - i), 0.55, 0.75, 1.25, 1));
      put(at(j.exitGore), sg, j.stripOuter + 1.3, TX.exitGoreTexture(j.number), 0.95, 0.95, 1.75, 1);
    }
  }

  // ------------------------------------------------------------------
  // Distribution centres (F-40, "verdozing"). Every 5 km block may hold one estate of
  // 1-3 boxes on one side of the road, all on one building line. Everything follows
  // from the block number, so any chunk can ask where the estates are.
  estate(b) {
    this.estates ||= new Map();
    if (this.estates.has(b)) return this.estates.get(b);
    let est = null;
    if (hash01(b, 41) < ESTATE_SHARE) {
      const E = pavementEdge();
      // an estate at a junction sits on the on-ramp side, behind the ramp road,
      // and gets a service road back to the crossing road (F-20 slice 2, F-40)
      const j = junctionAtEstateBlock(b);
      const sg = j ? 1 : hash01(b, 42) < 0.65 ? 1 : -1; // mostly on your own side of the road
      const d0 = j ? E + 150 + hash01(b, 43) * 50 : E + 100 + hash01(b, 43) * 60; // near (dock) face
      const dRoom = Math.min(140, E + 275 - d0); // keep the box on the fields
      const n = 1 + Math.floor(hash01(b, 44) * 3);
      const boxes = [];
      let s = j ? j.rampTop + 150 + hash01(b, 45) * 250 : b * ESTATE_BLOCK + 600 + hash01(b, 45) * 2600;
      const sA = s - 55; // car park before the first box
      for (let i = 0; i < n; i++) {
        const L = 150 + hash01(b, 50 + i) * 200;
        const D = Math.min(L, 70 + hash01(b, 60 + i) * (dRoom - 70));
        const H = 12 + hash01(b, 70 + i) * 3;
        const look = Math.floor(hash01(b, 80 + i) * 1e6);
        boxes.push({ i, sC: s + L / 2, L, D, H, look });
        s += L + 45;
      }
      est = { b, sg, d0, sA, sB: s - 45 + 15, dMax: d0 + Math.max(...boxes.map((x) => x.D)), boxes, j };
    }
    this.estates.set(b, est);
    if (this.estates.size > 64) this.estates.delete(this.estates.keys().next().value);
    return est;
  }

  estatesNear(sa, sb) {
    const out = [];
    for (let b = Math.floor(sa / ESTATE_BLOCK); b <= Math.floor(sb / ESTATE_BLOCK); b++) {
      const e = this.estate(b);
      if (e && e.sB > sa && e.sA < sb) out.push(e);
    }
    return out;
  }

  /** Is (s, lat) on an estate's grounds (yard, service road, boxes), widened by margin? */
  inEstate(s, lat, margin = 0) {
    for (const e of this.estatesNear(s - margin, s + margin)) {
      if (Math.sign(lat) !== e.sg) continue;
      const d = Math.abs(lat);
      if (s > e.sA - margin && s < e.sB + margin && d > e.d0 - 47 - margin && d < e.dMax + 12 + margin) return true;
    }
    return false;
  }

  distributionCentre(est, box, group, ch, bucket, ox, oz) {
    const rng = mulberry32(box.look);
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const p = this.road.sample(box.sC, {});
    const cx = p.x - ox, cz = p.z - oz;
    const { sg, d0 } = est;
    const { L, D, H } = box;
    // estate frame: a along the road, d away from it (positive = further out)
    const P = (a, d, y) => [cx + p.tx * a + p.nx * sg * d, y, cz + p.tz * a + p.nz * sg * d];
    const out = [p.nx * sg, 0, p.nz * sg]; // away from the road
    const toRoad = [-out[0], 0, -out[2]];
    const fwd = [p.tx, 0, p.tz];
    const back = [-p.tx, 0, -p.tz];
    const yawFacing = (v) => Math.atan2(v[0], v[2]);
    const boxAt = (b, w, h, len, a, d, y, col, yaw = p.h) => {
      const [x, , z] = P(a, d, 0);
      // BoxGeometry x = across the road frame, z = along it
      b.addGeo(new THREE.BoxGeometry(w, h, len), mat(x, y, z, yaw), col);
    };
    // a quad with the winding chosen so its normal points along `want`
    const face = (b, A, B2, C, D2, uv, want, col) => {
      const ux = B2[0] - A[0], uy = B2[1] - A[1], uz = B2[2] - A[2];
      const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) b.quad(A, B2, C, D2, uv[0], uv[1], uv[2], uv[3], col);
      else b.quad(A, D2, C, B2, uv[0], uv[3], uv[2], uv[1], col);
    };
    const T = 8; // cladding tile, metres
    const wallA = (b, a0, a1, d, y0, y1, want, col) =>
      face(b, P(a0, d, y0), P(a1, d, y0), P(a1, d, y1), P(a0, d, y1), [[a0 / T, y0 / T], [a1 / T, y0 / T], [a1 / T, y1 / T], [a0 / T, y1 / T]], want, col);
    const wallD = (b, a, d0_, d1, y0, y1, want, col) =>
      face(b, P(a, d0_, y0), P(a, d1, y0), P(a, d1, y1), P(a, d0_, y1), [[d0_ / T, y0 / T], [d1 / T, y0 / T], [d1 / T, y1 / T], [d0_ / T, y1 / T]], want, col);
    const shell = (b, a0, a1, dn, df, y0, y1, col, roofCol) => {
      wallA(b, a0, a1, dn, y0, y1, toRoad, col);
      wallA(b, a0, a1, df, y0, y1, out, col);
      wallD(b, a0, dn, df, y0, y1, back, col);
      wallD(b, a1, dn, df, y0, y1, fwd, col);
      const u = [0.5, 0.04]; // one plain texel: the roof has no panel lines
      if (roofCol) face(b, P(a0, dn, y1), P(a1, dn, y1), P(a1, df, y1), P(a0, df, y1), [u, u, u, u], [0, 1, 0], roofCol);
    };
    const flat = (b, a0, a1, dn, df, y) => face(b, P(a0, dn, y), P(a1, dn, y), P(a1, df, y), P(a0, df, y), [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);

    const cl = bucket('cladding', true);
    const bld = bucket('building', true);
    const dark = bucket('dark');
    const brand = pick(BRANDS);
    const brandRGB = hexRGB(brand.color);
    const wallCol = pick(CLADDING);
    const a0 = -L / 2, a1 = L / 2;
    const y0 = -0.3;

    // ---- the box: plinth, cladding, coping band in the company colour
    shell(cl, a0, a1, d0, d0 + D, y0, H, wallCol, [0.32, 0.33, 0.34]);
    shell(cl, a0 - 0.08, a1 + 0.08, d0 - 0.08, d0 + D + 0.08, y0, 1.0, [0.6, 0.6, 0.58]);
    shell(cl, a0 - 0.1, a1 + 0.1, d0 - 0.1, d0 + D + 0.1, H - 0.7, H + 0.15, wallCol[0] < 0.4 ? [0.75, 0.76, 0.77] : brandRGB);

    // ---- grounds: yard in front of the docks, service road, gatehouse
    const office = box.i === 0;
    const aDock0 = office ? a0 + 31 : a0 + 6;
    const yard = bucket('yard');
    flat(yard, a0 - (office ? 6 : 22), a1 + 22, d0 - 36, d0, -0.24);
    flat(bucket('lane'), a0 - (office ? 55 : 23), a1 + 23, d0 - 44, d0 - 37, -0.24);
    if (box.i === est.boxes.length - 1) {
      const ga = a1 + 12;
      boxAt(bld, 3.2, 2.9, 4.2, ga, d0 - 33, y0 + 1.45, [0.86, 0.86, 0.84]);
      boxAt(bucket('glass'), 3.3, 1.0, 4.3, ga, d0 - 33, y0 + 1.9, undefined);
      boxAt(bld, 0.12, 0.12, 6, ga - 5, d0 - 38, 0.8, [0.8, 0.12, 0.1]); // barrier arm
    }

    // ---- dock doors with shelters, lamps and the trailers waiting at them
    const lamps = bucket('dockLamp');
    const pools = bucket('poolWhite');
    const doorCol = pick([[0.55, 0.57, 0.6], [0.7, 0.71, 0.72], brandRGB]);
    let k = 0;
    for (let a = aDock0 + 2.1; a < a1 - 4; a += 4.2, k++) {
      boxAt(dark, 0.45, 3.9, 3.6, a, d0 - 0.2, 0.75 + 1.95, undefined); // shelter
      boxAt(cl, 0.1, 3.0, 2.9, a, d0 - 0.45, 1.1 + 1.5, doorCol); // sectional door
      boxAt(dark, 1.2, 0.3, 2.6, a, d0 - 0.6, 0.95, undefined); // leveller
      boxAt(lamps, 0.6, 0.12, 0.3, a, d0 - 0.4, 4.95, undefined);
      if (k % 3 === 1) {
        const q = 9;
        face(pools, P(a - q, d0 - 0.5 - 2 * q, -0.2), P(a + q, d0 - 0.5 - 2 * q, -0.2), P(a + q, d0 - 0.5, -0.2), P(a - q, d0 - 0.5, -0.2), [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);
      }
      if (rng() < 0.45) this.trailer(bld, dark, boxAt, a, d0 - 0.7, rng, brandRGB);
    }
    // a few trailers parked across the far end of the yard
    for (let a = a1 + 4, n = Math.floor(rng() * 6); n > 0; a += 3.6, n--) this.trailer(bld, dark, boxAt, a, d0 - 2, rng, brandRGB);

    // ---- logo band facing the road, and a smaller one on the gable end you approach
    const logo = (tx, w, a, d, y, want) => {
      const m = new THREE.MeshStandardMaterial({ map: tx, alphaTest: 0.5, roughness: 0.6, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0 });
      m.userData.nightE = 1.6; // lit letters
      ch.ownMats.push(m);
      ch.signMats.push(m);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / tx.userData.aspect), m);
      mesh.position.set(...P(a, d, y));
      mesh.rotation.y = yawFacing(want);
      group.add(mesh);
    };
    const onDark = wallCol[0] < 0.4;
    const lt = TX.logoTexture(brand.name, onDark ? '#f2f2f2' : brand.color, brand.mark);
    lt.tex.userData.aspect = lt.aspect;
    lt.tex.userData.ownTex = true;
    const lw = Math.min(L * 0.55, 6.5 * lt.aspect);
    logo(lt.tex, lw, office ? a0 + 31 + lw / 2 + 8 : 0, d0 - 0.13, H - 1.1 - lw / lt.aspect / 2, toRoad);
    const gw = Math.min(D * 0.75, 5 * lt.aspect);
    const gt = lt.tex.clone();
    gt.userData = { aspect: lt.aspect, ownTex: true };
    gt.needsUpdate = true;
    logo(gt, gw, a0 - 0.13, d0 + D / 2, H - 1.1 - gw / lt.aspect / 2, back); // the end you drive towards

    // ---- office corner, car park
    if (office) {
      const oc = pick([[0.88, 0.88, 0.87], [0.26, 0.27, 0.29]]);
      const oa0 = a0, oa1 = a0 + 26, on = d0 - 13;
      shell(cl, oa0, oa1, on, d0 + 6, y0, 10.5, oc, [0.3, 0.3, 0.31]);
      const glass = bucket('glass'), lit = bucket('windowLit');
      for (let f = 0; f < 3; f++) {
        const wy0 = 1.0 + f * 3.4, wy1 = wy0 + 1.8;
        for (let a = oa0 + 1; a < oa1 - 1; a += 3) wallA(rng() < 0.45 ? lit : glass, a, a + 2.9, on - 0.15, wy0, wy1, toRoad);
        for (let d = on + 1; d < d0 + 5; d += 3) wallD(rng() < 0.45 ? lit : glass, oa0 - 0.15, d, d + 2.9, wy0, wy1, back);
      }
      // car park before the office
      flat(yard, a0 - 50, a0 - 6, d0 - 36, d0 + 22, -0.24);
      const carCols = [[0.12, 0.12, 0.13], [0.55, 0.57, 0.6], [0.85, 0.85, 0.84], [0.2, 0.28, 0.45], [0.5, 0.1, 0.08], [0.32, 0.33, 0.35]];
      for (const d of [d0 - 30, d0 - 17, d0 - 10, d0 + 3, d0 + 10]) {
        for (let a = a0 - 47; a < a0 - 8; a += 2.7) {
          if (rng() > 0.6) continue;
          boxAt(bld, 4.4, 0.85, 1.8, a, d, y0 + 0.75, pick(carCols));
          boxAt(bld, 2.4, 0.55, 1.6, a, d + 0.2, y0 + 1.45, [0.1, 0.11, 0.12]);
        }
      }
    }
  }

  /** A semi-trailer backed up with its rear at `dRear`, pointing at the road; sometimes with its tractor. */
  trailer(bld, dark, boxAt, a, dRear, rng, brandRGB) {
    const r = rng();
    const col = r < 0.55 ? [0.9, 0.9, 0.88] : r < 0.75 ? [0.7, 0.72, 0.73] : r < 0.9 ? brandRGB : [[0.2, 0.3, 0.55], [0.6, 0.12, 0.1], [0.15, 0.35, 0.2]][Math.floor(rng() * 3)];
    boxAt(bld, 13.6, 2.75, 2.55, a, dRear - 6.8, 0.85 + 1.375, col);
    boxAt(dark, 4.0, 1.0, 2.4, a, dRear - 3.0, 0.2, undefined); // axles
    boxAt(dark, 0.3, 1.2, 2.2, a, dRear - 11.8, 0.3, undefined); // landing legs
    if (rng() < 0.25) {
      const cab = [[0.9, 0.9, 0.9], [0.15, 0.25, 0.5], [0.6, 0.1, 0.08], [0.85, 0.6, 0.1], [0.2, 0.2, 0.22]][Math.floor(rng() * 5)];
      boxAt(dark, 5.5, 0.9, 2.3, a, dRear - 13.6, 0.4, undefined);
      boxAt(bld, 2.3, 2.9, 2.5, a, dRear - 15.6, 0.6 + 1.45, cab);
      boxAt(dark, 0.06, 1.1, 2.2, a, dRear - 16.78, 2.6, undefined); // windscreen
    }
  }

  overpass(s, local, bucket, ox, oz, K, opts = {}) {
    const p = this.road.sample(s, {});
    const x = p.x - ox, z = p.z - oz;
    const G = guardrailLat();
    const conc = bucket('concrete');
    const span = 2 * (G + 7);
    const skew = opts.skew != null ? opts.skew : (hash01(K, 9) - 0.5) * 0.5;
    // junctions get a flat embankment top for the ramp road to start on
    const plateau = opts.plateau || 0;
    const yaw = p.h + skew;
    // deck
    conc.addGeo(new THREE.BoxGeometry(span, 1.3, 12), mat(x, 6.3, z, yaw));
    conc.addGeo(new THREE.BoxGeometry(span, 0.9, 0.35), mat(x + Math.sin(yaw) * 5.8, 7.4, z + Math.cos(yaw) * 5.8, yaw));
    conc.addGeo(new THREE.BoxGeometry(span, 0.9, 0.35), mat(x - Math.sin(yaw) * 5.8, 7.4, z - Math.cos(yaw) * 5.8, yaw));
    // pillars (median and outside guardrails)
    const rx = -Math.cos(yaw), rz = Math.sin(yaw); // right vector of skewed deck
    for (const lat of [0, G + 1.6, -(G + 1.6)]) {
      for (const off of [-3.5, 3.5]) {
        conc.addGeo(
          new THREE.BoxGeometry(0.9, 5.7, 0.9),
          mat(x + rx * lat + Math.sin(yaw) * off, 2.85, z + rz * lat + Math.cos(yaw) * off, yaw),
        );
      }
    }
    // embankments with abutment walls (flat on top where `plateau` asks for it)
    const grass = bucket('grass');
    for (const sg of [1, -1]) {
      const L1 = sg * (G + 7);
      const Lp = sg * (G + 7 + plateau);
      const L2 = sg * (G + 7 + plateau + (plateau > 0 ? 50 : 45));
      const pt = (lat, along, y) => [x + rx * lat + Math.sin(yaw) * along, y, z + rz * lat + Math.cos(yaw) * along];
      const tops = plateau > 0 ? [[L1, 6.9], [Lp, 6.9], [L2, -0.3]] : [[L1, 6.9], [L2, -0.3]];
      for (let i = 1; i < tops.length; i++) {
        const [la, ya] = tops[i - 1], [lb, yb] = tops[i];
        const a = pt(la, -7, ya), b = pt(lb, -7, yb), c = pt(lb, 7, yb), d = pt(la, 7, ya);
        if (sg > 0) grass.quad(a, d, c, b, [0, 0], [0, 1], [1, 1], [1, 0]);
        else grass.quad(a, b, c, d, [0, 0], [1, 0], [1, 1], [0, 1]);
        // the vertical side faces of this part of the embankment
        const a0 = pt(la, -7, -0.3), d0 = pt(la, 7, -0.3);
        const b0 = pt(lb, -7, -0.3), c0p = pt(lb, 7, -0.3);
        grass.quad(a, a0, b0, b, [0, 0], [0, 1], [1, 1], [1, 0]);
        grass.quad(d, c, c0p, d0, [0, 0], [0, 1], [1, 1], [1, 0]);
      }
      const a = pt(L1, -7, 6.9), b = pt(L1, 7, 6.9);
      const a0 = pt(L1, -7, -0.3), d0 = pt(L1, 7, -0.3);
      conc.quad(a0, d0, b, a, [0, 0], [1, 0], [1, 1], [0, 1]);
      conc.quad(a0, a, b, d0, [0, 0], [0, 1], [1, 1], [1, 0]);
    }
  }

  gantryFrame(s, ox, oz, bucket, height = 7.2) {
    const p = this.road.sample(s, {});
    const x = p.x - ox, z = p.z - oz;
    const G = guardrailLat();
    const g = bucket('gantry');
    for (const lat of [0, G + 0.6]) {
      g.addGeo(new THREE.BoxGeometry(0.4, height + 0.6, 0.4), mat(x + p.nx * lat, (height + 0.6) / 2, z + p.nz * lat, p.h));
    }
    const c = (G + 0.6) / 2;
    g.addGeo(new THREE.BoxGeometry(G + 1.2, 0.8, 0.8), mat(x + p.nx * c, height, z + p.nz * c, p.h));
    return p;
  }

  signMesh(group, ch, tex, w, h, x, y, z, yaw, nightE = 0.35, emissiveColor = 0xffffff) {
    // The face hangs a few centimetres in front of its board or posts. Far away
    // the depth buffer can't tell them apart and the board flickers through the
    // blue (inbox I-1), so bias the face forward in depth-buffer units.
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      emissive: emissiveColor,
      emissiveMap: tex,
      emissiveIntensity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    m.userData.nightE = nightE;
    ch.ownMats.push(m);
    ch.signMats.push(m);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    group.add(mesh);
    return mesh;
  }

  matrixGantry(s, group, ch, ox, oz, bucket, K) {
    const p = this.gantryFrame(s, ox, oz, bucket);
    const dark = bucket('dark');
    const mats = [];
    this.msiSigns.set(Math.round((s - 160) / 500), { ch, mats, s });
    for (let i = 0; i < CONFIG.lanes; i++) {
      const lat = laneLat(i);
      const x = p.x - ox + p.nx * lat, z = p.z - oz + p.nz * lat;
      dark.addGeo(new THREE.BoxGeometry(1.5, 1.5, 0.3), mat(x, 6.1, z, p.h));
      const t = TX.matrixTexture('');
      const fx = -p.tx * 0.16, fz = -p.tz * 0.16;
      const m = this.signMesh(group, ch, t, 1.36, 1.36, x + fx, 6.1, z + fz, p.h + Math.PI, 0, 0xffffff);
      m.material.userData.nightE = 1.4;
      m.material.userData.dayE = 1.4;
      m.material.emissiveIntensity = 1.4;
      ch.signMats.splice(ch.signMats.indexOf(m.material), 1); // always lit (LED)
      m.material.userData.face = '';
      mats[i] = m.material;
    }
  }

  anwbGantry(s, group, ch, ox, oz, bucket, K) {
    const p = this.gantryFrame(s, ox, oz, bucket, 8.6);
    const places = DUTCH_PLACES[Math.floor(hash01(K, 13) * DUTCH_PLACES.length)];
    const route = ROUTES[Math.floor(hash01(K, 14) * ROUTES.length)];
    const w = CONFIG.lanes * CONFIG.laneWidth + 0.6;
    const h = 3.3;
    const lat = innerEdge() + (CONFIG.lanes * CONFIG.laneWidth) / 2;
    const x = p.x - ox + p.nx * lat, z = p.z - oz + p.nz * lat;
    const t = TX.anwbTexture(places, route, w, h);
    bucket('signBack').addGeo(new THREE.BoxGeometry(w, h, 0.15), mat(x, 7.0, z, p.h));
    this.signMesh(group, ch, t, w, h, x - p.tx * 0.12, 7.0, z - p.tz * 0.12, p.h + Math.PI, 0.3);
  }

  speedSigns(s, group, ch, ox, oz, bucket) {
    const p = this.road.sample(s, {});
    const G = guardrailLat();
    const posts = bucket('post');
    const signs = [
      [CONFIG.speedLimitDay, '6-19 h', 0],
      [CONFIG.speedLimitNight, '19-6 h', 1.1],
    ];
    for (const [lim, sub, off] of signs) {
      const lat = G + 1.4 + off;
      const x = p.x - ox + p.nx * lat, z = p.z - oz + p.nz * lat;
      posts.addGeo(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), mat(x, 1.5, z, 0));
      const t = TX.speedSignTexture(lim, sub);
      this.signMesh(group, ch, t, 0.9, 1.35, x - p.tx * 0.05, 2.75, z - p.tz * 0.05, p.h + Math.PI, 0.3);
    }
  }

  farm(s, lat, rng, local, bucket, addTree, road, ox, oz) {
    const b = bucket('building', true);
    const p = road.sample(s, {});
    const x = p.x - ox + p.nx * lat, z = p.z - oz + p.nz * lat;
    const yaw = p.h + (rng() < 0.5 ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.3;
    const brick = [[0.45, 0.2, 0.13], [0.5, 0.26, 0.17], [0.38, 0.2, 0.15]][Math.floor(rng() * 3)];
    const roofCol = rng() < 0.5 ? [0.12, 0.12, 0.13] : [0.42, 0.16, 0.08];
    const house = (cx, cz, w, d, wallH, roofH, col, rcol) => {
      b.addGeo(new THREE.BoxGeometry(w, wallH, d), mat(cx, -0.3 + wallH / 2, cz, yaw), col);
      // gable roof as a stretched triangular prism (cylinder with 3 segments)
      const roof = new THREE.CylinderGeometry(1, 1, d * 1.04, 3, 1);
      roof.rotateX(Math.PI / 2);
      roof.rotateZ(Math.PI / 2 * 0);
      const m = mat(cx, -0.3 + wallH + roofH * 0.5 - 0.02, cz, yaw);
      m.multiply(new THREE.Matrix4().makeScale((w / 2) * 1.2, roofH, 1));
      m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI));
      b.addGeo(roof, m, rcol);
    };
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    house(x, z, 8, 11, 3.2, 3.6, brick, roofCol);
    house(x + rx * 16 + fx * 6, z + rz * 16 + fz * 6, 14, 28, 5, 4.5, [0.28, 0.3, 0.28], [0.18, 0.19, 0.2]);
    // lit windows
    const wl = bucket('windowLit');
    for (let k = 0; k < 3; k++) {
      if (rng() < 0.35) continue;
      const along = -3.5 + k * 3.5;
      const wx = x + fx * along - rx * 4.02, wz = z + fz * along - rz * 4.02;
      wl.addGeo(new THREE.PlaneGeometry(1.0, 1.1), mat(wx, 1.4, wz, yaw - Math.PI / 2));
      const wx2 = x + fx * along + rx * 4.02, wz2 = z + fz * along + rz * 4.02;
      wl.addGeo(new THREE.PlaneGeometry(1.0, 1.1), mat(wx2, 1.4, wz2, yaw + Math.PI / 2));
    }
    // yard trees
    for (let k = 0; k < 7; k++) {
      addTree(s + (rng() - 0.5) * 50, lat + (rng() - 0.5) * 45 + Math.sign(lat) * 12, rng() < 0.4 ? 'poplar' : 'oak', 0.8 + rng() * 0.5);
    }
  }

  turbine(pos, bucket, group, idx) {
    const [x, y, z] = pos;
    const t = bucket('turbine');
    t.addGeo(new THREE.CylinderGeometry(1.4, 2.4, 88, 12), mat(x, y + 44, z, 0));
    const windYaw = 0.7;
    t.addGeo(new THREE.BoxGeometry(2.8, 3, 9), mat(x, y + 89, z, windYaw));
    const av = bucket('aviation');
    av.addGeo(new THREE.SphereGeometry(0.4, 6, 4), mat(x, y + 90.8, z, 0));
    const rotorGeo = new GeoBuilder();
    rotorGeo.addGeo(new THREE.SphereGeometry(1.4, 10, 8), new THREE.Matrix4());
    for (let k = 0; k < 3; k++) {
      const blade = new THREE.BoxGeometry(1.8, 44, 0.35);
      blade.translate(0, 23, 0);
      const m = new THREE.Matrix4().makeRotationZ((k * Math.PI * 2) / 3);
      m.multiply(new THREE.Matrix4().makeScale(1, 1, 1));
      rotorGeo.addGeo(blade, m);
    }
    const rotor = new THREE.Mesh(rotorGeo.build(), this.M.turbine);
    const holder = new THREE.Group();
    holder.position.set(x + Math.sin(windYaw) * 5, y + 89, z + Math.cos(windYaw) * 5);
    holder.rotation.y = windYaw;
    holder.add(rotor);
    rotor.rotation.z = hash01(Math.round(x), 3) * 6;
    rotor.castShadow = false;
    group.add(holder);
    this.rotors.push({ mesh: rotor, speed: 1.2 + hash01(Math.round(z), 4) * 0.5, chunk: idx });
  }

  buildTrees(trees, group) {
    if (!trees.length) return;
    if (!this.treeGeos) this.treeGeos = makeTreeGeos();
    for (const kind of ['oak', 'poplar']) {
      const list = trees.filter((t) => t.kind === kind);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(this.treeGeos[kind], this.M.tree, list.length);
      const col = new THREE.Color();
      list.forEach((t, i) => {
        im.setMatrixAt(i, mat(t.x, -0.3, t.z, t.rot, t.scale, t.scale * (0.9 + (t.rot % 0.3)), t.scale));
        const g = 0.8 + (t.rot % 1) * 0.35;
        im.setColorAt(i, col.setRGB(g, g * (0.95 + (t.rot % 0.1)), g * 0.9));
      });
      im.castShadow = true;
      im.receiveShadow = false;
      im.computeBoundingSphere();
      group.add(im);
    }
  }
}

function makeTreeGeos() {
  const rng = mulberry32(99);
  const out = {};
  // oak / generic deciduous: trunk + lumpy crown
  {
    const b = new GeoBuilder(true);
    b.addGeo(new THREE.CylinderGeometry(0.22, 0.35, 4.2, 6), mat(0, 2.1, 0, 0), [0.28, 0.21, 0.15]);
    for (let k = 0; k < 5; k++) {
      const crown = new THREE.IcosahedronGeometry(2.2 + rng() * 0.9, 1);
      const pa = crown.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const f = 0.85 + rng() * 0.3;
        pa.setXYZ(i, pa.getX(i) * f, pa.getY(i) * f, pa.getZ(i) * f);
      }
      crown.computeVertexNormals();
      const a = (k / 5) * 6.28;
      const r = k === 0 ? 0 : 1.6;
      const c = 0.75 + rng() * 0.25;
      b.addGeo(crown, mat(Math.cos(a) * r, 5.8 + rng() * 1.6, Math.sin(a) * r, 0), [0.2 * c, 0.33 * c, 0.12 * c]);
    }
    out.oak = b.build();
  }
  // poplar: tall narrow
  {
    const b = new GeoBuilder(true);
    b.addGeo(new THREE.CylinderGeometry(0.18, 0.28, 5, 6), mat(0, 2.5, 0, 0), [0.3, 0.26, 0.2]);
    const crown = new THREE.IcosahedronGeometry(1.0, 2);
    crown.scale(1.7, 7, 1.7);
    const pa = crown.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const f = 0.88 + rng() * 0.22;
      pa.setXYZ(i, pa.getX(i) * f, pa.getY(i), pa.getZ(i) * f);
    }
    crown.computeVertexNormals();
    b.addGeo(crown, mat(0, 11, 0, 0), [0.22, 0.34, 0.14]);
    out.poplar = b.build();
  }
  return out;
}
