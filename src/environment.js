// Sky, sun/moon, fog, ambient light and reflections for day / dusk / night.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CONFIG } from './config.js';
import { mulberry32 } from './util.js';

const MODES = {
  day: {
    elevation: 36, azimuth: 205, turbidity: 7, rayleigh: 1.4, mie: 0.006, mieG: 0.8,
    sun: 0xfff1dc, sunI: 3.0, hemiSky: 0xbcd3f0, hemiGround: 0x56603e, hemiI: 1.05,
    fog: 0xc3cfd9, fogNear: 250, fogFar: 3600, exposure: 0.62, bloom: 0.12, envI: 0.9,
  },
  dusk: {
    elevation: 2.5, azimuth: 290, turbidity: 9, rayleigh: 2.8, mie: 0.01, mieG: 0.85,
    sun: 0xffa060, sunI: 1.5, hemiSky: 0x5c6a8f, hemiGround: 0x2c2a22, hemiI: 0.45,
    fog: 0x8a7e86, fogNear: 200, fogFar: 3000, exposure: 0.75, bloom: 0.35, envI: 0.6,
  },
  night: {
    sun: 0x8ea6e0, sunI: 0.035, hemiSky: 0x1d2742, hemiGround: 0x070806, hemiI: 0.035,
    fog: 0x030408, fogNear: 60, fogFar: 2600, exposure: 1.0, bloom: 0.75, envI: 0.12,
  },
};

/**
 * F-48: the promised world's palette, laid over MODES[mode] when the world is
 * 'promised'. A cleaner brochure blue, greener grass and a lighter, bluer haze:
 * noticeable side by side, never cartoonish. Night is unchanged except for its
 * lamp colours, which live with the scenery that owns those lamps.
 */
const PROMISED = {
  day: {
    turbidity: 4.5, rayleigh: 1.15, mie: 0.005, sun: 0xfff7e6, sunI: 3.1,
    hemiSky: 0xaad2f6, hemiGround: 0x6d8346, hemiI: 1.18,
    fog: 0xd2e6f2, fogNear: 330, fogFar: 4200, exposure: 0.66, bloom: 0.1, envI: 1.0,
  },
  dusk: {
    turbidity: 7.5, hemiSky: 0x6d80aa, hemiGround: 0x34392a, hemiI: 0.5,
    fog: 0x9aa4ae, fogNear: 240, fogFar: 3400, exposure: 0.78,
  },
  night: {},
};

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = CONFIG.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 10;
    sc.far = 700;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sunDir = new THREE.Vector3(0.3, 0.8, 0.4).normalize();

    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.nightSky = this.makeNightSky();
    scene.add(this.nightSky);

    scene.fog = new THREE.Fog(0xffffff, 200, 3000);
    this.mode = null;
    this.world = CONFIG.world;
    this.envCache = {};
  }

  makeNightSky() {
    const g = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {},
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying vec3 vDir; void main(){
          float h = vDir.y;
          vec3 zen = vec3(0.002,0.003,0.009);
          vec3 hor = vec3(0.012,0.011,0.013);  // a faint town glow on the horizon
          vec3 c = mix(hor, zen, smoothstep(-0.02, 0.3, h));
          c += vec3(0.012,0.008,0.004) * exp(-max(h,0.0)*22.0);
          if (h < 0.0) c = vec3(0.004,0.004,0.005);
          gl_FragColor = vec4(c,1.0);
        }`,
      }),
    );
    sphere.renderOrder = -10;
    g.add(sphere);
    // stars
    const rng = mulberry32(42);
    const n = 1800;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng(), v = rng();
      const th = 2 * Math.PI * u, y = 0.08 + v * 0.92;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 3800, y * 3800, Math.sin(th) * r * 3800], i * 3);
      const b = Math.pow(rng(), 3) * 0.7 + 0.04;
      col.set([b, b, b * 1.1], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    stars.renderOrder = -9;
    g.add(stars);
    // moon
    const moon = new THREE.Mesh(new THREE.CircleGeometry(38, 24), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
    moon.position.set(-1600, 1500, -2600);
    moon.lookAt(0, 0, 0);
    g.add(moon);
    return g;
  }

  /** The mode's numbers for a world (F-48 lays PROMISED over MODES). */
  modeTable(mode, world) {
    return world === 'promised' ? { ...MODES[mode], ...PROMISED[mode] } : MODES[mode];
  }

  envFor(mode, world = this.world) {
    const key = `${mode}:${world}`;
    if (this.envCache[key]) return this.envCache[key];
    const m = this.modeTable(mode, world);
    const sc = new THREE.Scene();
    if (mode === 'night') {
      const ns = this.makeNightSky();
      ns.scale.setScalar(0.02);
      sc.add(ns);
    } else {
      const sky = new Sky();
      sky.scale.setScalar(100);
      this.applySkyUniforms(sky, m);
      sc.add(sky);
      // a darkish ground plane so reflections have a horizon
      const green = world === 'promised';
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshBasicMaterial({ color: mode === 'day' ? (green ? 0x5f8046 : 0x4b5a3a) : 0x1c1c18 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1;
      sc.add(ground);
    }
    const rt = this.pmrem.fromScene(sc, 0.02);
    this.envCache[key] = rt.texture;
    return rt.texture;
  }

  applySkyUniforms(sky, m) {
    const u = sky.material.uniforms;
    u.turbidity.value = m.turbidity;
    u.rayleigh.value = m.rayleigh;
    u.mieCoefficient.value = m.mie;
    u.mieDirectionalG.value = m.mieG;
    const phi = THREE.MathUtils.degToRad(90 - m.elevation);
    const theta = THREE.MathUtils.degToRad(m.azimuth);
    const v = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(v);
    return v;
  }

  setMode(mode, world = this.world) {
    this.mode = mode;
    this.world = world;
    const m = this.modeTable(mode, world);
    const night = mode === 'night';
    this.sky.visible = !night;
    this.nightSky.visible = night;
    if (!night) {
      this.sunDir.copy(this.applySkyUniforms(this.sky, m));
      if (mode === 'dusk') this.sunDir.y = Math.max(this.sunDir.y, 0.12);
    } else {
      this.sunDir.set(-0.45, 0.6, -0.65).normalize(); // moon light
    }
    this.sun.color.set(m.sun);
    this.sun.intensity = m.sunI;
    this.sun.castShadow = CONFIG.shadows && !night;
    this.hemi.color.set(m.hemiSky);
    this.hemi.groundColor.set(m.hemiGround);
    this.hemi.intensity = m.hemiI;
    this.scene.fog.color.set(m.fog);
    this.scene.fog.near = m.fogNear;
    this.scene.fog.far = m.fogFar;
    this.scene.background = night ? new THREE.Color(0x010204) : null;
    this.scene.environment = this.envFor(mode, world);
    this.scene.environmentIntensity = m.envI;
    this.renderer.toneMappingExposure = m.exposure;
    this.bloomStrength = m.bloom;
    this.exposure = m.exposure;
  }

  /** Switching the world re-applies the current time of day in it (F-48). */
  setWorld(world) {
    this.world = world;
    if (this.mode) this.setMode(this.mode, world);
  }

  update(focus) {
    // shadow camera follows the player, snapped to texel grid to avoid shimmer
    const texel = 140 / 2048;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 300, this.sunDir.y * 300, fz + this.sunDir.z * 300);
    this.sky.position.set(focus.x, 0, focus.z);
    this.nightSky.position.set(focus.x, 0, focus.z);
  }
}
