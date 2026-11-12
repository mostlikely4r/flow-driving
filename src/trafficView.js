// Places vehicle models from the traffic simulation into the world and feeds
// their lamps into the glow / beam systems.
import { createVehicleVisual } from './vehicles.js';
import { mulberry32, clamp } from './util.js';

const COL = {
  head: [1, 0.93, 0.82],
  tail: [1, 0.05, 0.015],
  ind: [1, 0.42, 0.02],
};

export class TrafficView {
  constructor(scene, road, glow, beams) {
    this.scene = scene;
    this.road = road;
    this.glow = glow;
    this.beams = beams;
    this.pool = new Map();
    this.rng = mulberry32(1234);
  }

  add(veh) {
    const list = this.pool.get(veh.variant);
    const vis = list && list.length ? list.pop() : createVehicleVisual(veh.variant, this.rng);
    vis.axleInit = false;
    vis.root.visible = true;
    veh.vis = vis;
    this.scene.add(vis.root);
  }

  remove(veh) {
    const vis = veh.vis;
    if (!vis) return;
    this.scene.remove(vis.root);
    if (!this.pool.has(veh.variant)) this.pool.set(veh.variant, []);
    this.pool.get(veh.variant).push(vis);
    veh.vis = null;
  }

  /**
   * Position a visual. Shared by AI and player.
   * (x,z,yaw) is the centre of the front body.
   */
  static pose(vis, x, z, yaw, pitch, roll = 0) {
    vis.front.position.set(x, 0, z);
    vis.front.rotation.set(pitch, yaw, roll);
    if (vis.trailer) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const hx = x + fx * vis.hitchZ, hz = z + fz * vis.hitchZ;
      const L = vis.axleDist;
      let dx = hx - vis.axle.x, dz = hz - vis.axle.z;
      let d = Math.hypot(dx, dz);
      if (!vis.axleInit || d > L * 1.6 || d < L * 0.4) {
        vis.axle.set(hx - fx * L, 0, hz - fz * L);
        dx = fx * L;
        dz = fz * L;
        d = L;
        vis.axleInit = true;
      }
      vis.axle.x = hx - (dx / d) * L;
      vis.axle.z = hz - (dz / d) * L;
      vis.trailer.position.set(hx, 0, hz);
      vis.trailer.rotation.set(0, Math.atan2(dx, dz), 0);
    }
  }

  /** Emit glows for one part. state: {night, brake, indL, indR, markers} */
  static glowPart(glow, part, emitters, cam, st, scaleAll = 1) {
    const yaw = part.rotation.y;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const px = part.position.x, pz = part.position.z;
    for (const e of emitters) {
      let r, g, b, size, inten, wide;
      switch (e.kind) {
        case 'head':
          if (!st.head) continue;
          [r, g, b] = COL.head;
          size = st.night ? 1.05 : 0.32;
          inten = st.night ? 4.2 : 0.9;
          wide = 0.0;
          break;
        case 'tail':
          if (!st.night && !st.brake) continue;
          [r, g, b] = COL.tail;
          size = st.brake ? (st.night ? 0.85 : 0.55) : 0.55;
          inten = (st.night ? 1.0 : 0) + (st.brake ? 2.6 : 0);
          wide = 0.35;
          break;
        case 'indL':
        case 'indR':
          if (!(e.kind === 'indL' ? st.indL : st.indR)) continue;
          [r, g, b] = COL.ind;
          size = st.night ? 0.7 : 0.5;
          inten = st.night ? 3.6 : 2.8;
          wide = 0.45;
          break;
        case 'marker':
          if (!st.night) continue;
          [r, g, b] = COL.ind;
          size = 0.35;
          inten = 1.4;
          wide = 0.1;
          break;
        default:
          continue;
      }
      const ex = e.pos.x, ey = e.pos.y, ez = e.pos.z;
      const wx = px + ex * c + ez * s;
      const wz = pz - ex * s + ez * c;
      const dxw = e.dir.x * c + e.dir.z * s;
      const dzw = -e.dir.x * s + e.dir.z * c;
      let tx = cam.x - wx, tz = cam.z - wz;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const dot = dxw * tx + dzw * tz;
      let f = clamp((dot + wide) / (1 + wide), 0, 1);
      if (e.kind === 'head') f = Math.pow(f, 2.2);
      if (f <= 0.01) continue;
      const k = inten * f * scaleAll;
      glow.add(wx, ey, wz, r * k, g * k, b * k, size * e.size * (0.6 + 0.4 * f));
    }
  }

  update(traffics, sPlayer, cam, night, time) {
    const road = this.road;
    const beams = this.beams;
    for (const tr of traffics) {
      const dir = tr.dir;
      for (const veh of tr.vehicles) {
        const vis = veh.vis;
        if (!vis) continue;
        const s = dir * veh.u;
        const ds = s - sPlayer;
        if (ds > 1700 || ds < -1100) {
          vis.root.visible = false;
          continue;
        }
        vis.root.visible = true;
        const fc = s + dir * (veh.len / 2 - veh.frontLen / 2);
        const latW = dir * veh.latLocal;
        const p = road.sample(fc);
        const x = p.x + p.nx * latW;
        const z = p.z + p.nz * latW;
        const yaw = p.h + (dir < 0 ? Math.PI : 0) - Math.atan2(veh.latRate, Math.max(veh.v, 2));
        const pitch = clamp(-veh.acc * 0.0045, -0.012, 0.02);
        TrafficView.pose(vis, x, z, yaw, pitch);

        // lamps
        const phase = (time + (veh.id % 7) * 0.09) % 0.72;
        const blinkOn = phase < 0.38;
        const indL = veh.indicator === -1 && blinkOn;
        const indR = veh.indicator === 1 && blinkOn;
        const m = vis.mats;
        m.head.emissiveIntensity = night ? 3 : 0.8;
        m.tail.emissiveIntensity = (night ? 1.3 : 0) + (veh.brake ? 4 : 0);
        m.indL.emissiveIntensity = indL ? 6 : 0;
        m.indR.emissiveIntensity = indR ? 6 : 0;
        m.marker.emissiveIntensity = night ? 2.5 : 0;

        const dist = Math.abs(ds);
        if (dist < 1500) {
          const st = { night, brake: veh.brake, indL, indR, head: true };
          TrafficView.glowPart(this.glow, vis.front, vis.emFront, cam, st);
          if (vis.trailer) TrafficView.glowPart(this.glow, vis.trailer, vis.emTrailer, cam, st);
        }
        if (night && dist < 700) {
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          const half = veh.frontLen / 2;
          const big = veh.type === 'truck';
          beams.add(x + fx * half, z + fz * half, fx, fz, 0.3, big ? 40 : 34, 2.2, big ? 11 : 9.5, 0.035, big ? 0.5 : 0.42);
        }
      }
    }
  }
}
