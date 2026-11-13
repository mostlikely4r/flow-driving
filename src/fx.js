// Cheap, batched light effects:
//  * GlowSystem: every vehicle lamp glow (head/tail/brake/indicators/markers)
//    drawn as one additive point cloud (one draw call).
//  * BeamSystem: headlight footprints on the road for AI vehicles at night.
import * as THREE from 'three';
import { beamTexture } from './textures.js';

const glowVS = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  uniform float uScale;
  uniform float uFade;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = max(0.2, -mv.z);
    float fade = exp(-d * uFade);
    vColor = color * fade;
    // keep distant lights at least a couple of pixels so they read as points
    gl_PointSize = clamp(size * uScale / d, 1.6, 320.0);
    if (mv.z > 0.0) gl_PointSize = 0.0;
    // small lights far away get dimmer as they shrink below a few pixels
    float px = size * uScale / d;
    vColor *= clamp(px / 2.0, 0.25, 1.0);
    // ...and big ones (very close) don't keep flooding the screen: the eye adapts
    vColor *= min(1.0, pow(48.0 / px, 0.6));
  }
`;
const glowFS = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    // The sprite draws its own round halo and keeps the core's peak modest:
    // very hot pixels make the bloom blur spread in a boxy pattern.
    float halo = exp(-r * r * 4.0) * 0.6 * (1.0 - smoothstep(0.8, 1.0, r));
    float core = exp(-r * r * 30.0) * 1.4;
    gl_FragColor = vec4(vColor * (halo + core), 1.0);
  }
`;

export class GlowSystem {
  constructor(capacity = 6000) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('color', this.aCol);
    g.setAttribute('size', this.aSize);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uFade: { value: 1 / 1800 } },
      vertexShader: glowVS,
      fragmentShader: glowFS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    const size = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, scene, camera) => {
      const rt = renderer.getRenderTarget();
      let h;
      if (rt) h = rt.height;
      else {
        renderer.getDrawingBufferSize(size);
        h = size.y;
      }
      this.mat.uniforms.uScale.value = h * camera.projectionMatrix.elements[5] * 0.5;
      this.mat.uniformsNeedUpdate = true;
    };
    this.count = 0;
    this.origin = new THREE.Vector3();
  }
  begin(origin) {
    this.count = 0;
    this.origin.copy(origin);
    this.points.position.copy(origin);
  }
  add(x, y, z, r, g, b, size) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.pos[i * 3] = x - this.origin.x;
    this.pos[i * 3 + 1] = y - this.origin.y;
    this.pos[i * 3 + 2] = z - this.origin.z;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.size[i] = size;
  }
  end() {
    this.geo.setDrawRange(0, this.count);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aPos.clearUpdateRanges?.();
    this.aPos.addUpdateRange?.(0, this.count * 3);
    this.aCol.clearUpdateRanges?.();
    this.aCol.addUpdateRange?.(0, this.count * 3);
    this.aSize.clearUpdateRanges?.();
    this.aSize.addUpdateRange?.(0, this.count);
  }
}

export class BeamSystem {
  constructor(capacity = 500) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 4 * 3);
    this.uv = new Float32Array(capacity * 4 * 2);
    this.col = new Float32Array(capacity * 4 * 3);
    const idx = new Uint32Array(capacity * 6);
    for (let i = 0; i < capacity; i++) {
      idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('uv', this.aUv);
    g.setAttribute('color', this.aCol);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    this.mat = new THREE.MeshBasicMaterial({
      map: beamTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.count = 0;
    this.origin = new THREE.Vector3();
  }
  begin(origin) {
    this.count = 0;
    this.origin.copy(origin);
    this.mesh.position.copy(origin);
  }
  /** Quad on the ground: from point (x,z) with forward (fx,fz), near/far distance, widths */
  add(x, z, fx, fz, near, far, wNear, wFar, y, intensity, r = 1, g = 0.95, b = 0.85) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    const rx = -fz, rz = fx; // right
    const o = this.origin;
    const P = this.pos, U = this.uv, C = this.col;
    const set = (k, px, pz, u, v) => {
      P[(i * 4 + k) * 3] = px - o.x;
      P[(i * 4 + k) * 3 + 1] = y - o.y;
      P[(i * 4 + k) * 3 + 2] = pz - o.z;
      U[(i * 4 + k) * 2] = u;
      U[(i * 4 + k) * 2 + 1] = v;
      C[(i * 4 + k) * 3] = r * intensity;
      C[(i * 4 + k) * 3 + 1] = g * intensity;
      C[(i * 4 + k) * 3 + 2] = b * intensity;
    };
    const nx = x + fx * near, nz = z + fz * near;
    const fx2 = x + fx * far, fz2 = z + fz * far;
    set(0, nx - rx * wNear * 0.5, nz - rz * wNear * 0.5, 0, 0);
    set(1, nx + rx * wNear * 0.5, nz + rz * wNear * 0.5, 1, 0);
    set(2, fx2 + rx * wFar * 0.5, fz2 + rz * wFar * 0.5, 1, 1);
    set(3, fx2 - rx * wFar * 0.5, fz2 - rz * wFar * 0.5, 0, 1);
  }
  end() {
    this.geo.setDrawRange(0, this.count * 6);
    this.aPos.needsUpdate = true;
    this.aUv.needsUpdate = true;
    this.aCol.needsUpdate = true;
  }
}
