// Places vehicle models from the traffic simulation into the world and feeds
// their lamps into the glow / beam systems.
import { createVehicleVisual, applyLook } from './vehicles.js';
import { lookFor } from './archetypes.js';
import { mulberry32, clamp, slipAngle } from './util.js';
import { CONFIG } from './config.js';
import { rampProfile } from './junctions.js';

const COL = {
  head: [1, 0.93, 0.82],
  tail: [1, 0.05, 0.015],
  ind: [1, 0.42, 0.02],
};
// Headlight colour per light signature (see archetypes.js).
const HEAD = {
  std: COL.head,
  modern: [0.88, 0.94, 1],
  bar: [0.86, 0.93, 1],
  angel: [0.78, 0.86, 1],
  round: [1, 0.78, 0.45],
  ev: [0.86, 0.93, 1],
};
// signatures with a running-light strip or ring, shown by day instead of the lamp
const DRL_SIGS = new Set(['bar', 'angel', 'ev']);
const DRL = [0.9, 0.95, 1];

export class TrafficView {
  constructor(scene, road, glow, beams) {
    this.scene = scene;
    this.road = road;
    this.glow = glow;
    this.beams = beams;
    this.pool = new Map();
    this.rng = mulberry32(1234);
  }

  static poolKey(variant, look) {
    return look ? `${variant}:${look.low ? 'low' : ''}:${look.lights}` : variant;
  }

  add(veh, lookOverride = null) {
    const look = lookOverride ?? lookFor(veh);
    const key = TrafficView.poolKey(veh.variant, look);
    const list = this.pool.get(key);
    const vis = list && list.length ? list.pop() : createVehicleVisual(veh.variant, this.rng, { low: look?.low, lights: look?.lights });
    applyLook(vis, look);
    vis.axleInit = false;
    vis.root.visible = true;
    veh.vis = vis;
    this.scene.add(vis.root);
  }

  remove(veh) {
    const vis = veh.vis;
    if (!vis) return;
    this.scene.remove(vis.root);
    const key = TrafficView.poolKey(veh.variant, vis.look);
    if (!this.pool.has(key)) this.pool.set(key, []);
    this.pool.get(key).push(vis);
    veh.vis = null;
  }

  /**
   * Position a visual. Shared by AI and player.
   * (x,z,yaw) is the centre of the front body.
   */
  static pose(vis, x, z, yaw, pitch, roll = 0, y = 0) {
    vis.front.position.set(x, y, z);
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
  static glowPart(glow, part, emitters, cam, st, scaleAll = 1, yOff = 0) {
    const yaw = part.rotation.y;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const px = part.position.x, pz = part.position.z;
    for (const e of emitters) {
      let r, g, b, size, inten, wide;
      switch (e.kind) {
        case 'head':
          if (!st.head) continue;
          // cars with running-light strips or rings show those by day, not the lamp
          if (!st.night && DRL_SIGS.has(st.lights)) continue;
          [r, g, b] = HEAD[st.lights] || COL.head;
          size = st.night ? 1.05 : 0.32;
          inten = st.night ? (st.lights === 'round' ? 3.0 : 3.8) : st.lights === 'round' ? 0.6 : 0.9;
          wide = 0.0;
          break;
        case 'drl':
          if (!DRL_SIGS.has(st.lights)) continue;
          [r, g, b] = DRL;
          size = st.night ? 0.42 : 0.3;
          inten = st.night ? 1.3 : 1.25;
          wide = 0.15;
          break;
        case 'tail':
          if (!st.night && !st.brake) continue;
          [r, g, b] = COL.tail;
          // Tail lights glow less than headlights: present, never a red haze.
          size = st.brake ? (st.night ? 0.6 : 0.5) : 0.4;
          inten = (st.night ? 0.5 : 0) + (st.brake ? (st.night ? 1.5 : 2.4) : 0);
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
      const ex = e.pos.x, ey = e.pos.y + yOff, ez = e.pos.z;
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
      let glare = 1;
      if (e.kind === 'head') {
        f = Math.pow(f, 2.2);
        if (!st.high) {
          // Dipped beam: the cut-off sits just below the horizon, so a viewer
          // more than a few degrees above the lamp (close by, or in a mirror)
          // sees the lamp itself rather than the beam. Far away you're in it.
          const elev = Math.atan2(cam.y - ey, tl) * (180 / Math.PI);
          const t = clamp((elev - 0.5) / 3.0, 0, 1);
          glare = 1 - 0.82 * t * t * (3 - 2 * t);
          // Asymmetric cut-off (right-hand traffic): the beam is kept low on
          // the driver's left, where oncoming traffic is. Local +x is left.
          const left = tx * c - tz * s;
          const u = clamp((left - 0.07) / 0.15, 0, 1);
          glare *= 1 - 0.65 * u;
        }
        glare *= CONFIG.headlightGlare;
      }
      if (f <= 0.01) continue;
      const k = inten * f * glare * scaleAll;
      glow.add(wx, ey, wz, r * k, g * k, b * k, size * e.size * (0.6 + 0.4 * f) * (0.55 + 0.45 * Math.min(1, glare)));
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
        // On a ramp road (F-20) the car follows the road up to the crossing road:
        // lateral offset and height come from the path, not from the lane.
        const ramp = veh.lane === -1 ? veh.ramp : null;
        const onRamp = ramp && fc < ramp.s0;
        let latW, y = 0, latRate = veh.latRate;
        if (onRamp) {
          const a = rampProfile(ramp.sTop, ramp.s0, fc);
          const dd = (rampProfile(ramp.sTop, ramp.s0, fc + 2).lat - rampProfile(ramp.sTop, ramp.s0, fc - 2).lat) / 4;
          latW = dir * a.lat;
          y = a.y;
          latRate = dd * Math.max(veh.v, 2);
        } else {
          latW = dir * veh.latLocal;
        }
        const p = road.sample(fc);
        const x = p.x + p.nx * latW;
        const z = p.z + p.nz * latW;
        const yaw = p.h + (dir < 0 ? Math.PI : 0) - slipAngle(latRate, veh.v);
        const pitch = clamp(-veh.acc * 0.0045, -0.012, 0.02);
        TrafficView.pose(vis, x, z, yaw, pitch, 0, y);

        // lamps
        const phase = (time + (veh.id % 7) * 0.09) % 0.72;
        const blinkOn = phase < 0.38;
        const indL = veh.indicator === -1 && blinkOn;
        const indR = veh.indicator === 1 && blinkOn;
        const m = vis.mats;
        // At night the lamp meshes glow only softly: the round glow sprites carry
        // the flare, so bloom doesn't turn every box-shaped lamp into a rectangle.
        m.head.emissiveIntensity = night ? 1.3 : 0.8;
        m.tail.emissiveIntensity = (night ? 0.5 : 0) + (veh.brake ? (night ? 1.5 : 4) : 0);
        m.indL.emissiveIntensity = indL ? 6 : 0;
        m.indR.emissiveIntensity = indR ? 6 : 0;
        m.marker.emissiveIntensity = night ? 2.5 : 0;
        const lights = vis.look ? vis.look.lights : 'std';
        m.drl.emissiveIntensity = DRL_SIGS.has(lights) ? (night ? 2.2 : 5) : 0;

        const dist = Math.abs(ds);
        if (dist < 1500) {
          const st = { night, brake: veh.brake, indL, indR, head: true, lights };
          TrafficView.glowPart(this.glow, vis.front, vis.emFront, cam, st, 1, y);
          if (vis.trailer) TrafficView.glowPart(this.glow, vis.trailer, vis.emTrailer, cam, st, 1, y);
        }
        if (night && dist < 700) {
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          const half = veh.frontLen / 2;
          const big = veh.type === 'truck';
          beams.add(x + fx * half, z + fz * half, fx, fz, 0.3, big ? 32 : 26, 2.2, big ? 9 : 8, 0.035, big ? 0.2 : 0.16);
        }
      }
    }
  }
}
