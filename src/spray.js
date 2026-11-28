// F-24: the spray behind lorries in the rain. Rendering only: no sim code reads
// it (the sim's own spray rule is in traffic.js, `sprayTarget`).
//
// Behind each lorry near the camera above `wet.sprayMinKmh` hangs a column of
// soft, camera-facing sprites from the rear wheels back to `wet.sprayM`,
// thickest just behind the lorry and fading out, denser the faster it goes. One
// instanced draw call, ordinary scene geometry, so the mirrors show it too. At
// night the lorry's tail lights and your own headlights tint it.
//
// The sprites alone can't promise that you see nothing from inside the cloud,
// so `eyeIn()` says how deep your eye is in a lorry's spray (0..1) and main.js
// pulls the fog in for the main view by that much.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { KMH, clamp } from './util.js';

const PER_LORRY = 30;
const RANGE_M = 300; // lorries further than this from the camera make none

const VS = /* glsl */ `
  attribute vec3 iPos;
  attribute vec2 iData; // size (m), alpha
  attribute vec3 iTint;
  varying vec2 vUv;
  varying float vA;
  varying vec3 vTint;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    mvPosition.xy += position.xy * iData.x;
    vUv = position.xy;
    // a sprite right in front of the lens would be one hard-edged blob: fade it
    vA = iData.y * smoothstep(0.6, 4.0, -mvPosition.z);
    vTint = iTint;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FS = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vA;
  varying vec3 vTint;
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv) * 2.0;
    if (r > 1.0) discard;
    float k = 1.0 - r * r;
    gl_FragColor = vec4(uColor + vTint, vA * k * k);
    #include <fog_fragment>
  }
`;

/** A small stable hash of (lorry id, sprite index, channel) in 0..1. */
function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class SprayView {
  constructor(capacity = 1200) {
    this.cap = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    this.pos = new Float32Array(capacity * 3);
    this.data = new Float32Array(capacity * 2);
    this.tint = new Float32Array(capacity * 3);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(this.data, 2).setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.InstancedBufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iData', this.aData);
    g.setAttribute('iTint', this.aTint);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uColor: { value: new THREE.Color(0xb8bec4) } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9; // before the lamp glows
    this.mesh.visible = false;
    this.origin = new THREE.Vector3();
    this.count = 0;
    this.eye = 0; // eased eye-in-spray amount
    this._a = {};
    this._b = {}; // road.sample's own result is shared
  }

  /** Spray colour for the time of day: light grey by day, dim by night. */
  setMode(mode) {
    this.night = mode === 'night';
    this.mat.uniforms.uColor.value.set(mode === 'night' ? 0x16171a : mode === 'dusk' ? 0x6c6e74 : 0xb8bec4);
  }

  /**
   * Fill the sprites for this frame.
   * @param {object[]} traffics the carriageways
   * @param {object} road
   * @param {THREE.Vector3} cam camera world position
   * @param {number} time seconds, for the flow
   * @param {{x:number,z:number,yaw:number,lights:boolean}} you your car, for the headlight tint
   */
  update(traffics, road, cam, time, you) {
    this.count = 0;
    if (!this.mesh.visible) return;
    this.origin.copy(cam);
    this.mesh.position.copy(cam);
    const w = CONFIG.wet;
    const vMin = w.sprayMinKmh * KMH;
    const L = w.sprayM;
    const fx = Math.sin(you.yaw), fz = Math.cos(you.yaw);
    const head = this.night && you.lights;
    for (const tr of traffics) {
      const dir = tr.dir;
      for (const veh of tr.vehicles) {
        if (veh.type !== 'truck' || veh.v <= vMin || !veh.vis || !veh.vis.root.visible) continue;
        const sRear = dir * veh.u - dir * (veh.len / 2);
        const a = road.sample(sRear, this._a);
        const ax = a.x + a.nx * dir * veh.latLocal, az = a.z + a.nz * dir * veh.latLocal;
        if (Math.hypot(ax - cam.x, az - cam.z) > RANGE_M) continue;
        // heading backwards along the road, and the road's normal at the rear
        const b = road.sample(sRear - dir * L, this._b);
        const bx = b.x + b.nx * dir * veh.latLocal, bz = b.z + b.nz * dir * veh.latLocal;
        const nx = a.nx, nz = a.nz;
        // denser the faster: none at the threshold, full by +30 km/h
        const f = clamp((veh.v - vMin) / (30 * KMH), 0, 1);
        // the cloud streams back from the wheels at a fraction of the lorry's speed
        const flow = 6 + veh.v * 0.25;
        const tail = this.night ? (veh.brake ? 1 : 0.35) : 0;
        for (let k = 0; k < PER_LORRY && this.count < this.cap; k++) {
          const ph = hash(veh.id, k, 1);
          const d = (ph * L + time * flow) % L; // metres behind the rear
          const t = d / L;
          const side = (hash(veh.id, k, 2) - 0.5) * 2;
          const half = 1.35 + d * 0.045; // it spreads as it hangs back
          const lat = side * half;
          const x = ax + (bx - ax) * t + nx * lat;
          const z = az + (bz - az) * t + nz * lat;
          const y = 0.5 + hash(veh.id, k, 3) * (1.6 + d * 0.035);
          const size = 2.6 + d * 0.07 + hash(veh.id, k, 4) * 1.4;
          const alpha = f * 0.5 * Math.pow(1 - t, 1.3) * (0.55 + 0.45 * hash(veh.id, k, 5));
          const i = this.count++;
          this.pos[i * 3] = x - cam.x;
          this.pos[i * 3 + 1] = y - cam.y;
          this.pos[i * 3 + 2] = z - cam.z;
          this.data[i * 2] = size;
          this.data[i * 2 + 1] = alpha;
          // tail lights redden the start of the cloud; your beams light what is ahead of you
          let r = 0, g = 0, bl = 0;
          if (tail) {
            const e = tail * Math.exp(-d / 9);
            r += 0.45 * e;
            g += 0.02 * e;
            bl += 0.01 * e;
          }
          if (head) {
            const dx = x - you.x, dz = z - you.z;
            const along = dx * fx + dz * fz;
            const across = Math.abs(dx * fz - dz * fx);
            if (along > 0 && along < 60 && across < 3 + along * 0.08) {
              const e = (1 - along / 60) * 0.32;
              r += e;
              g += e * 0.97;
              bl += e * 0.9;
            }
          }
          this.tint[i * 3] = r;
          this.tint[i * 3 + 1] = g;
          this.tint[i * 3 + 2] = bl;
        }
      }
    }
    this.geo.instanceCount = this.count;
    for (const at of [this.aPos, this.aData, this.aTint]) at.needsUpdate = true;
  }

  /**
   * How deep your eye is in a lorry's spray, 0..1, eased: full from about 30 m
   * behind a fast lorry in your lane, nothing beyond `sprayM`. Only your own
   * carriageway; a lorry beside you doesn't count (its sideways spray is not
   * modelled in this slice).
   */
  eyeIn(traffic, player, dt) {
    let target = 0;
    if (this.mesh.visible) {
      const w = CONFIG.wet;
      const vMin = w.sprayMinKmh * KMH;
      for (const veh of traffic.vehicles) {
        if (veh.type !== 'truck' || veh.v <= vMin) continue;
        const g = veh.u - veh.len / 2 - (player.s + player.len / 2);
        if (g < 0 || g > w.sprayM) continue;
        if (Math.abs(veh.latLocal - player.lat) > 2.2) continue;
        const f = clamp((veh.v - vMin) / (30 * KMH), 0, 1);
        const depth = clamp((w.sprayM - g) / (w.sprayM * 0.4), 0, 1);
        target = Math.max(target, f * depth * depth * (3 - 2 * depth));
      }
    }
    this.eye += (target - this.eye) * Math.min(1, dt * 2.5);
    return this.eye;
  }
}
