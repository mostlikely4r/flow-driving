// Streams the motorway world in 200 m chunks around the player.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { hash01, mulberry32 } from './util.js';
import { innerEdge, outerEdgeLine, pavementEdge, guardrailLat, laneLat } from './layout.js';
import * as TX from './textures.js';

export const CHUNK = 200;
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

const DUTCH_PLACES = [
  ['Utrecht', 'Amersfoort'], ['Amsterdam', 'Schiphol'], ['Rotterdam', 'Gouda'], ['Den Haag', 'Leiden'], ['Arnhem', 'Ede'],
  ['Zwolle', 'Deventer'], ['Eindhoven', 'Den Bosch'], ['Breda', 'Tilburg'], ['Nijmegen', 'Tiel'], ['Apeldoorn', 'Hoevelaken'],
  ['Groningen', 'Assen'], ['Almere', 'Lelystad'], ['Hilversum', 'Bussum'], ['Gorinchem', 'Dordrecht'], ['Venlo', 'Roermond'],
];
const ROUTES = ['A1', 'A2', 'A12', 'A27', 'A28', 'A15', 'A4', 'A50', 'A16', 'A58'];

export class Scenery {
  constructor(scene, road, envMapGetter) {
    this.scene = scene;
    this.road = road;
    this.chunks = new Map();
    this.rotors = [];
    this.night = false;
    this.time = 0;
    this.makeMaterials();
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
    M.lampHead = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff0d8, emissiveIntensity: 0, roughness: 0.4 });
    M.pool = new THREE.MeshBasicMaterial({
      map: TX.radialTexture(),
      color: 0xffe2b0,
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
    this.M = M;
  }

  setNight(mode) {
    const night = mode === 'night';
    const dusk = mode === 'dusk';
    this.night = night;
    const M = this.M;
    M.marking.emissiveIntensity = night ? 0.015 : 0;
    M.reflector.emissiveIntensity = night ? 0.5 : dusk ? 0.1 : 0;
    M.windowLit.emissiveIntensity = night ? 2.2 : dusk ? 1.2 : 0;
    M.lampHead.emissiveIntensity = night ? 9 : dusk ? 4 : 0;
    M.pool.visible = night || dusk;
    M.pool.opacity = night ? 0.24 : 0.08;
    for (const ch of this.chunks.values()) for (const m of ch.signMats) m.emissiveIntensity = night ? m.userData.nightE : 0;
    this.signNightFactor = night;
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
  }

  update(sPlayer, budget = 2) {
    const i0 = Math.floor((sPlayer - 600) / CHUNK);
    const i1 = Math.floor((sPlayer + 2800) / CHUNK);
    for (const [idx, ch] of this.chunks) {
      if (idx < i0 - 1 || idx > i1 + 1) {
        this.dispose(ch);
        this.chunks.delete(idx);
      }
    }
    // build nearest first
    let built = 0;
    const order = [];
    for (let i = i0; i <= i1; i++) if (!this.chunks.has(i)) order.push(i);
    order.sort((a, b) => Math.abs(a * CHUNK - sPlayer) - Math.abs(b * CHUNK - sPlayer));
    for (const i of order) {
      if (built >= budget) break;
      this.chunks.set(i, this.buildChunk(i));
      built++;
    }
  }

  animate(dt) {
    this.time += dt;
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
    for (const sg of [1, -1]) {
      solid(sg * (ie + 0.08), 0.15);
      solid(sg * (oe - 0.1), 0.2);
      for (let k = 1; k < CONFIG.lanes; k++) dashed(sg * (ie + k * CONFIG.laneWidth), 0.15, 3, 12);
    }

    // ---- median barrier (concrete step barrier)
    const barrierProfile = [[-0.3, 0], [-0.24, 0.08], [-0.1, 0.3], [-0.085, 0.85], [0.085, 0.85], [0.1, 0.3], [0.24, 0.08], [0.3, 0]];
    sweep(bucket('concrete'), barrierProfile, (R, l, y) => [R.s / 4, y * 1.5]);

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
    sweep(bucket('steel'), railR, (R, l, y) => [R.s / 4, y]);
    sweep(bucket('steel'), railL, (R, l, y) => [R.s / 4, y]);
    const posts = bucket('post');
    const refl = bucket('reflector');
    for (let s = Math.ceil(s0 / 4) * 4; s < s1; s += 4) {
      const p = road.sample(s);
      for (const sg of [1, -1]) {
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
      const hasOverpass = hash01(K, 1) < 0.24;
      const sOver = K * 1000 + 520;
      if (hasOverpass && inChunk(sOver)) this.overpass(sOver, local, bucket, ox, oz, K);
      const sMatrix = K * 1000 + 160;
      if (hash01(K, 2) < 0.5 && inChunk(sMatrix)) this.matrixGantry(sMatrix, group, ch, ox, oz, bucket, K);
      const sAnwb = K * 1000 + 860;
      if (hash01(K, 3) < 0.3 && inChunk(sAnwb)) this.anwbGantry(sAnwb, group, ch, ox, oz, bucket, K);
      const sSpeed = K * 1000 + 330;
      if (K % 3 === 0 && inChunk(sSpeed)) this.speedSigns(sSpeed, group, ch, ox, oz, bucket);
    }

    // ---- lighting (lit stretches)
    if (hash01(Math.floor(s0 / 1600), 4) < 0.3) {
      const pool = bucket('pool');
      const lamps = bucket('lampHead');
      for (let s = Math.ceil(s0 / 50) * 50; s < s1; s += 50) {
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
      if (rng() < 0.22) this.farm(s0 + rng() * CHUNK, sg * (E + 70 + rng() * 160), rng, local, bucket, addTree, road, ox, oz);
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
      mesh.receiveShadow = ['asphalt', 'grass', 'concrete', 'fields', 'marking', 'wall', 'building'].includes(name);
      mesh.castShadow = ['concrete', 'steel', 'post', 'building', 'gantry', 'wall', 'turbine'].includes(name);
      if (name === 'pool') mesh.renderOrder = 4;
      group.add(mesh);
    }
    for (const m of ch.signMats) m.emissiveIntensity = this.night ? m.userData.nightE : 0;
    this.scene.add(group);
    return ch;
  }

  overpass(s, local, bucket, ox, oz, K) {
    const p = this.road.sample(s, {});
    const x = p.x - ox, z = p.z - oz;
    const G = guardrailLat();
    const conc = bucket('concrete');
    const span = 2 * (G + 7);
    const skew = (hash01(K, 9) - 0.5) * 0.5;
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
    // embankments with abutment walls
    const grass = bucket('grass');
    for (const sg of [1, -1]) {
      const L1 = sg * (G + 7), L2 = sg * (G + 52);
      const pt = (lat, along, y) => [x + rx * lat + Math.sin(yaw) * along, y, z + rz * lat + Math.cos(yaw) * along];
      const a = pt(L1, -7, 6.9), b = pt(L2, -7, -0.3), c = pt(L2, 7, -0.3), d = pt(L1, 7, 6.9);
      if (sg > 0) grass.quad(a, d, c, b, [0, 0], [0, 1], [1, 1], [1, 0]);
      else grass.quad(a, b, c, d, [0, 0], [1, 0], [1, 1], [0, 1]);
      // sides
      const a0 = pt(L1, -7, -0.3), d0 = pt(L1, 7, -0.3);
      grass.tri(a, a0, b, [0, 0], [0, 1], [1, 1]);
      grass.tri(d, c, d0, [0, 0], [1, 1], [0, 1]);
      grass.tri(a, b, a0, [0, 0], [1, 1], [0, 1]);
      grass.tri(d, d0, c, [0, 0], [0, 1], [1, 1]);
      conc.quad(a0, d0, d, a, [0, 0], [1, 0], [1, 1], [0, 1]);
      conc.quad(a0, a, d, d0, [0, 0], [0, 1], [1, 1], [1, 0]);
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
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: emissiveColor, emissiveMap: tex, emissiveIntensity: 0 });
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
    const r = hash01(K, 12);
    for (let i = 0; i < CONFIG.lanes; i++) {
      const lat = laneLat(i);
      const x = p.x - ox + p.nx * lat, z = p.z - oz + p.nz * lat;
      dark.addGeo(new THREE.BoxGeometry(1.5, 1.5, 0.3), mat(x, 6.1, z, p.h));
      let content = '';
      if (r < 0.15) content = 'end';
      const t = TX.matrixTexture(content);
      const fx = -p.tx * 0.16, fz = -p.tz * 0.16;
      const m = this.signMesh(group, ch, t, 1.36, 1.36, x + fx, 6.1, z + fz, p.h + Math.PI, 0, 0xffffff);
      m.material.userData.nightE = 1.4;
      m.material.userData.dayE = 1.4;
      m.material.emissiveIntensity = 1.4;
      ch.signMats.splice(ch.signMats.indexOf(m.material), 1); // always lit (LED)
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
    this.signMesh(group, ch, t, w, h, x - p.tx * 0.09, 7.0, z - p.tz * 0.09, p.h + Math.PI, 0.3);
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
