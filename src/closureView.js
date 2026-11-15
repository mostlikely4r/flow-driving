// What a lane closure looks like on the road: a yellow arrow-board truck
// (pijlwagen) at its start, a taper of cones leading up to it, and cones along
// the lane line for the rest of the closed stretch.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { laneLat } from './layout.js';

function arrowBoardTexture(dir) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#101010';
  g.fillRect(0, 0, 128, 96);
  // amber lamps forming an arrow (dir: -1 points left on the board, +1 right)
  g.fillStyle = '#ffb020';
  const dot = (x, y) => {
    g.beginPath();
    g.arc(64 + dir * x, y, 5, 0, Math.PI * 2);
    g.fill();
  };
  for (let x = -40; x <= 28; x += 14) dot(x, 48);
  for (const k of [1, 2]) {
    dot(42 - k * 13, 48 - k * 13);
    dot(42 - k * 13, 48 + k * 13);
  }
  dot(42, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d01818';
  for (let k = -64; k < 128; k += 20) {
    g.beginPath();
    g.moveTo(k, 64);
    g.lineTo(k + 10, 64);
    g.lineTo(k + 74, 0);
    g.lineTo(k + 64, 0);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ClosureView {
  constructor(scene, road) {
    this.scene = scene;
    this.road = road;
    this.items = new Map(); // closure -> { group, lamps: [Vector3], boardMat }
    this.matBody = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 });
    this.matDark = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 });
    this.matCone = new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.7, emissive: 0x551500, emissiveIntensity: 0.25 });
    this.matChev = new THREE.MeshStandardMaterial({ map: chevronTexture(), roughness: 0.6 });
    this.coneGeo = new THREE.ConeGeometry(0.19, 0.72, 10);
    this.coneGeo.translate(0, 0.36, 0);
    this.tex = { '-1': arrowBoardTexture(-1), 1: arrowBoardTexture(1) };
  }

  /** Keep the scene in step with traffic.closures. */
  sync(closures) {
    for (const [c, it] of this.items) {
      if (!closures.includes(c)) {
        this.scene.remove(it.group);
        it.cones.dispose();
        it.boardMat.dispose();
        this.items.delete(c);
      }
    }
    for (const c of closures) if (!this.items.has(c) && c.lane < CONFIG.lanes) this.build(c);
  }

  build(c) {
    const N = CONFIG.lanes;
    const W = CONFIG.laneWidth;
    const group = new THREE.Group();
    const latC = laneLat(c.lane);
    // which side traffic moves to (matches the arrow on the gantry): right if possible
    const toRight = c.lane > 0;
    const open = toRight ? c.lane - 1 : Math.min(N - 1, c.lane + 1);
    const latLine = (latC + laneLat(open)) / 2; // lane line on the open side
    const latFar = latC - (latLine - latC); // the other edge of the closed lane
    const place = (obj, s, lat, y = 0) => {
      const p = this.road.sample(s);
      obj.position.set(p.x + p.nx * lat, y, p.z + p.nz * lat);
      obj.rotation.y = p.h;
      return p;
    };
    // --- truck: its back is at s0
    const truck = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 6.2), this.matBody);
    body.position.set(0, 1.75, 3.1);
    const under = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 6.4), this.matDark);
    under.position.set(0, 0.45, 3.2);
    const chev = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.3), this.matChev);
    chev.position.set(0, 1.75, -0.01);
    chev.rotation.y = Math.PI;
    // arrow board on a mast above the back, facing the traffic behind
    const boardMat = new THREE.MeshStandardMaterial({ map: this.tex[1], emissive: 0xffffff, emissiveMap: this.tex[1], emissiveIntensity: 1.6, roughness: 0.6 });
    // facing backward the board is mirrored for the viewer: "right" for traffic is -x here
    boardMat.map = boardMat.emissiveMap = this.tex[toRight ? 1 : -1];
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.7), boardMat);
    board.position.set(0, 3.9, 0.3);
    board.rotation.y = Math.PI;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.15), this.matDark);
    back.position.set(0, 3.9, 0.4);
    truck.add(body, under, chev, board, back);
    for (const m of [body, under]) m.castShadow = true;
    place(truck, c.s0, latC);
    group.add(truck);
    // --- cones: a taper over the last 90 m before the truck, then along the line
    const pts = [];
    for (let k = 0; k <= 9; k++) pts.push([c.s0 - 90 + k * 10, latFar + (latLine - latFar) * (k / 9)]);
    for (let s = c.s0 + 12; s < c.s1; s += 14) pts.push([s, latLine]);
    const cones = new THREE.InstancedMesh(this.coneGeo, this.matCone, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([s, lat], i) => {
      const p = this.road.sample(s);
      m4.makeTranslation(p.x + p.nx * lat, 0, p.z + p.nz * lat);
      cones.setMatrixAt(i, m4);
    });
    cones.frustumCulled = false;
    group.add(cones);
    // amber beacons (for the glow system): two on the cab roof, a few on the board
    const lamps = [];
    const p0 = this.road.sample(c.s0);
    const at = (dx, y, dz) => new THREE.Vector3(p0.x + p0.nx * (latC + dx) + p0.tx * dz, y, p0.z + p0.nz * (latC + dx) + p0.tz * dz);
    lamps.push(at(-0.9, 4.85, 0.2), at(0.9, 4.85, 0.2), at(0, 3.9, -0.1));
    this.scene.add(group);
    this.items.set(c, { group, cones, boardMat, lamps });
  }

  /** Flashing: the board and its beacons blink. */
  update(time, glow, night) {
    const on = time % 0.9 < 0.5;
    for (const it of this.items.values()) {
      it.boardMat.emissiveIntensity = on ? (night ? 1.3 : 2.2) : 0.15;
      if (!on) continue;
      const k = night ? 1.6 : 1.1;
      for (const l of it.lamps) glow.add(l.x, l.y, l.z, 1 * k, 0.62 * k, 0.1 * k, 1.0);
    }
  }
}
