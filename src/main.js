import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CONFIG, speedLimitKmh, saveSetting } from './config.js';
import { DEV } from './dev.js';
import { clamp, approach, mulberry32 } from './util.js';
import { Road } from './road.js';
import { Traffic } from './traffic.js';
import { Player } from './player.js';
import { Scenery, LAMP_EVERY } from './scenery.js';
import { innerEdge } from './layout.js';
import { Environment } from './environment.js';
import { GlowSystem, BeamSystem } from './fx.js';
import { TrafficView } from './trafficView.js';
import { createVehicleVisual, initVehicleMaterials, setVehicleNight, setLayerRecursive } from './vehicles.js';
import { setMaxAnisotropy, matrixTexture } from './textures.js';
import { MSI, gantryS } from './msi.js';
import { ClosureView } from './closureView.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Radio } from './radio.js';
import { LaneMap } from './lanemap.js';
import { Hud } from './hud.js';
import { Stats } from './stats.js';
import { Overlay, OVERLAY_MODES, OVERLAY_NAMES } from './overlay.js';
import { SCENARIOS, applyScenario } from './scenarios.js';
import { CastStage } from './castStage.js';
import { CastViewer } from './castViewer.js';
import { Journal, clock as clockText, sendJournal } from './journal.js';
import { bindSim, applyTimeSim, stepSim, applyDrivePress, holdFlash, drainEvents, playerLimit } from './session.js';

// ---------------------------------------------------------------- renderer
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = CONFIG.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
container.appendChild(renderer.domElement);
setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const LAYER_WORLD = 0, LAYER_SELF = 1, LAYER_COCKPIT = 2;

const scene = new THREE.Scene();
initVehicleMaterials();

// ?scenario=<name> sets up a repeatable situation (see src/scenarios.js).
// Overrides are not saved to your settings. Dev only: the hosted build is the game.
const SCENARIO_NAME = DEV ? new URLSearchParams(location.search).get('scenario') : null;
const SCENARIO = SCENARIOS[SCENARIO_NAME] || null;
if (SCENARIO) {
  CONFIG.lanes = SCENARIO.lanes;
  if (SCENARIO.timeOfDay) CONFIG.timeOfDay = SCENARIO.timeOfDay;
}

const road = new Road(CONFIG.seed);
const env = new Environment(scene, renderer);
const scenery = new Scenery(scene, road);
const glow = new GlowSystem();
scene.add(glow.points);
const selfGlow = new GlowSystem(64); // the player's own lamps: hidden from the interior mirror
setLayerRecursive(selfGlow.points, LAYER_SELF);
scene.add(selfGlow.points);
const beams = new BeamSystem();
scene.add(beams.mesh);

// far ground plane under everything (fields texture, snapped to texture period)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(9600, 9600),
  new THREE.MeshStandardMaterial({ map: scenery.fieldsTex.clone(), roughness: 1 }),
);
ground.material.map.repeat.set(9600 / 400, 9600 / 400);
ground.material.map.needsUpdate = true;
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.7;
ground.receiveShadow = false;
scene.add(ground);

// ---------------------------------------------------------------- player
const player = new Player(road);
const rngP = mulberry32(99);
const playerVis = createVehicleVisual('estate', rngP, { color: 0x23344d });
setLayerRecursive(playerVis.root, LAYER_SELF);
scene.add(playerVis.root);

// headlights (real lights)
// decay 1 keeps the road near the bumper from blowing out while still reaching ~60 m
const headLows = [];
let headDim = 1; // see the cut-off note in the frame loop
for (const sx of [1, -1]) {
  const l = new THREE.SpotLight(0xfff4e6, 0, 200, 0.5, 0.8, 1.0);
  l.position.set(sx * 0.7, 0.68, 2.3);
  l.target.position.set(sx * 4.5, 0.05, 40);
  playerVis.front.add(l, l.target);
  headLows.push(l);
}
const headHigh = new THREE.SpotLight(0xf6f8ff, 0, 450, 0.3, 0.6, 1.0);
headHigh.position.set(0, 0.75, 2.3);
headHigh.target.position.set(0, 0.8, 100);
playerVis.front.add(headHigh, headHigh.target);

// Street lamps on lit stretches: two real lights that hop from lamp to lamp
// with you, so sodium light sweeps over the car (and the cockpit) one lamp at
// a time. Distant lamps are glow sprites only.
const SODIUM = [1, 0.6, 0.22];
const streetLights = [0, 1, 2].map(() => {
  const l = new THREE.SpotLight(0xff9a3c, 0, 48, 1.1, 0.7, 1.3);
  scene.add(l, l.target);
  return l;
});
function updateStreetLamps(night, dusk) {
  const on = night || dusk;
  const s = player.s;
  const base = Math.floor(s / LAMP_EVERY) * LAMP_EVERY;
  // the three lamps around you, our side of the median. Each fades in as you
  // approach and out behind you, so there's no jump when one becomes "real".
  for (let i = 0; i < 3; i++) {
    const l = streetLights[i];
    const sl = base + i * LAMP_EVERY;
    const d = sl - s; // -50..100
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const w = d >= 0 ? 1 - sm(2 * LAMP_EVERY * 0.4, 2 * LAMP_EVERY, d) : 1 - sm(LAMP_EVERY * 0.2, LAMP_EVERY, -d);
    if (!on || !scenery.litAt(sl)) {
      l.intensity = 0;
      continue;
    }
    const p = road.sample(sl);
    l.position.set(p.x + p.nx * 2.9, 11.8, p.z + p.nz * 2.9);
    const c = innerEdge() + CONFIG.lanes * CONFIG.laneWidth * 0.45;
    l.target.position.set(p.x + p.nx * c, 0, p.z + p.nz * c);
    l.target.updateMatrixWorld();
    l.intensity = (night ? 260 : 100) * w;
  }
  if (!on) return;
  // glowing lamp heads, both carriageways, receding into the distance
  const k = night ? 1 : 0.4;
  for (let sl = base - 4 * LAMP_EVERY; sl < s + 1600; sl += LAMP_EVERY) {
    if (!scenery.litAt(sl)) continue;
    const p = road.sample(sl);
    for (const sg of [1, -1]) {
      glow.add(p.x + p.nx * sg * 2.9, 11.85, p.z + p.nz * sg * 2.9, SODIUM[0] * 2.2 * k, SODIUM[1] * 2.2 * k, SODIUM[2] * 2.2 * k, 0.9);
    }
  }
}

// ---------------------------------------------------------------- cockpit interior
const cockpit = new THREE.Group();
playerVis.front.add(cockpit);
const steeringWheel = new THREE.Group();
let dashCanvas, dashCtx, dashTex;
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.85 });
  const soft = new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.95 });
  const lining = new THREE.MeshStandardMaterial({ color: 0x45464a, roughness: 1 });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.6, 0.6), soft);
  dash.position.set(0, 0.69, 1.08);
  cockpit.add(dash);
  const dashTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.4), dark);
  dashTop.position.set(0, 0.995, 1.15);
  dashTop.rotation.x = 0.12;
  cockpit.add(dashTop);
  const binnacle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.2), dark);
  binnacle.position.set(0.37, 1.04, 0.86);
  cockpit.add(binnacle);
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.2), dark);
  header.position.set(0, 1.405, 0.5);
  // pillars, doors (box between two points)
  const beam = (a, b, w, d, m) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), m);
    mesh.position.copy(A).add(B).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    cockpit.add(mesh);
  };
  for (const sx of [1, -1]) {
    beam([sx * 0.76, 1.0, 1.26], [sx * 0.67, 1.42, 0.42], 0.07, 0.1, dark); // A pillar
    beam([sx * 0.84, 0.95, -0.85], [sx * 0.76, 1.42, -0.8], 0.06, 0.16, soft); // B pillar
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 2.3), soft);
    door.position.set(sx * 0.86, 0.75, 0.1);
    cockpit.add(door);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 2.3), dark);
    sill.position.set(sx * 0.84, 0.97, 0.1);
    cockpit.add(sill);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 2.6), dark);
  floor.position.set(0, 0.32, -0.1);
  cockpit.add(floor);
  cockpit.add(header);
  const liner = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.02, 2.2), lining);
  liner.position.set(0, 1.42, -0.5);
  cockpit.add(liner);
  // instrument panel (canvas)
  dashCanvas = document.createElement('canvas');
  dashCanvas.width = 512;
  dashCanvas.height = 160;
  dashCtx = dashCanvas.getContext('2d');
  dashTex = new THREE.CanvasTexture(dashCanvas);
  dashTex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.13),
    new THREE.MeshStandardMaterial({ map: dashTex, emissive: 0xffffff, emissiveMap: dashTex, emissiveIntensity: 0.9, roughness: 0.4 }),
  );
  panel.position.set(0.37, 0.955, 0.765);
  panel.rotation.set(0.3, Math.PI, 0);
  cockpit.add(panel);
  // steering wheel
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.022, 10, 36), dark);
  steeringWheel.add(rim);
  for (const a of [Math.PI / 2 + 0.05, -Math.PI / 6, Math.PI + Math.PI / 6]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.015), dark);
    spoke.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09 - 0.01, 0);
    spoke.rotation.z = a;
    steeringWheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), dark);
  hub.rotation.x = Math.PI / 2;
  steeringWheel.add(hub);
  const col = new THREE.Group();
  col.position.set(0.37, 0.78, 0.5);
  col.rotation.set(0.45, Math.PI, 0);
  col.add(steeringWheel);
  cockpit.add(col);
}
setLayerRecursive(cockpit, LAYER_COCKPIT);

// ---------------------------------------------------------------- mirrors
const mres = CONFIG.mirrorRes;
function makeMirror(w, h, fov, pos, yaw, pitch, layers) {
  const rt = new THREE.WebGLRenderTarget(Math.round(w * mres), Math.round(h * mres), { type: THREE.HalfFloatType, samples: 2 });
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.3, 650);
  cam.position.copy(pos);
  cam.rotation.set(pitch, yaw, 0, 'YXZ');
  cam.layers.set(LAYER_WORLD);
  for (const l of layers) cam.layers.enable(l);
  playerVis.front.add(cam);
  return { rt, cam };
}
const mirrors = {
  rear: makeMirror(512, 150, 15, new THREE.Vector3(0, 1.36, 0.3), 0, -0.035, []),
  left: makeMirror(256, 176, 21, new THREE.Vector3(1.02, 1.03, 1.12), -0.24, -0.04, [LAYER_SELF]),
  right: makeMirror(256, 176, 27, new THREE.Vector3(-1.02, 1.03, 1.12), 0.29, -0.04, [LAYER_SELF]),
};
const cockpitGlass = {};
function flippedPlane(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  return g;
}
{
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.7 });
  // interior mirror
  const rm = new THREE.Mesh(flippedPlane(0.25, 0.073), new THREE.MeshBasicMaterial({ map: mirrors.rear.rt.texture, fog: false }));
  rm.position.set(0, 1.33, 0.6);
  rm.rotation.set(0.04, Math.PI - 0.2, 0);
  const rmFrame = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.085, 0.03), frameMat);
  rmFrame.position.set(0, 1.33, 0.618);
  rmFrame.rotation.copy(rm.rotation);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.02), frameMat);
  stem.position.set(0, 1.38, 0.63);
  cockpit.add(rm, rmFrame, stem);
  // side mirrors
  const lm = new THREE.Mesh(flippedPlane(0.17, 0.095), new THREE.MeshBasicMaterial({ map: mirrors.left.rt.texture, fog: false }));
  lm.position.set(0.99, 1.01, 1.088);
  lm.rotation.set(0, Math.PI + 0.12, 0);
  const rmm = new THREE.Mesh(flippedPlane(0.17, 0.095), new THREE.MeshBasicMaterial({ map: mirrors.right.rt.texture, fog: false }));
  rmm.position.set(-0.99, 1.01, 1.088);
  rmm.rotation.set(0, Math.PI - 0.12, 0);
  cockpit.add(lm, rmm);
  cockpitGlass.rear = rm;
  cockpitGlass.left = lm;
  cockpitGlass.right = rmm;
  setLayerRecursive(cockpit, LAYER_COCKPIT);
}

// HUD mirrors for bonnet / chase views
const hudScene = new THREE.Scene();
const hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
const hudMirrors = {};
{
  for (const k of ['rear', 'left', 'right']) {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0c0d0e, toneMapped: false }));
    const glass = new THREE.Mesh(flippedPlane(1, 1), new THREE.MeshBasicMaterial({ map: mirrors[k].rt.texture }));
    glass.position.z = 0.1;
    hudScene.add(frame, glass);
    hudMirrors[k] = { frame, glass };
  }
}
function layoutHud(w, h) {
  hudCam.right = w;
  hudCam.top = h;
  hudCam.updateProjectionMatrix();
  const rw = Math.min(560, w * 0.34), rh = rw * (150 / 512);
  const place = (m, cx, cy, ww, hh) => {
    m.glass.position.set(cx, cy, 0.1);
    m.glass.scale.set(ww, hh, 1);
    m.frame.position.set(cx, cy, 0);
    m.frame.scale.set(ww + 8, hh + 8, 1);
  };
  place(hudMirrors.rear, w / 2, h - rh / 2 - 14, rw, rh);
  const sw = Math.min(260, w * 0.16), sh = sw * (176 / 256);
  place(hudMirrors.left, sw / 2 + 18, h * 0.42, sw, sh);
  place(hudMirrors.right, w - sw / 2 - 18, h * 0.42, sw, sh);
}

// ---------------------------------------------------------------- camera & post
const camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, 0.08, 6000);
camera.layers.enable(LAYER_SELF);
camera.layers.enable(LAYER_COCKPIT);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0, 0.88);
// Round bloom: three's blur uses sigma = kernel radius, cut off at one sigma,
// which is nearly a box filter, so a bright lamp blooms into a square.
// Use a proper Gaussian that has faded out by the kernel edge.
for (const m of bloom.separableBlurMaterials) {
  const c = m.uniforms.gaussianCoefficients.value;
  const sigma = c.length / 2.4;
  for (let i = 0; i < c.length; i++) c[i] = Math.exp((-0.5 * i * i) / (sigma * sigma));
}
bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.8, 0.6, 0.4, 0.25];
composer.addPass(bloom);
composer.addPass(new OutputPass());

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  layoutHud(w, h);
}
window.addEventListener('resize', onResize);
onResize();

// ---------------------------------------------------------------- traffic
const view = new TrafficView(scene, road, glow, beams);
let traffic, oncoming;
let msi = null; // matrix signs for our carriageway
let sim = null; // the render-free bundle the browser and a bot run share
const closureView = new ClosureView(scene, road);
function makeTraffic() {
  const lim = speedLimitKmh();
  traffic = new Traffic({
    dir: 1,
    density: CONFIG.trafficDensity,
    ahead: CONFIG.rangeAhead,
    behind: CONFIG.rangeBehind,
    seed: CONFIG.seed + 1,
    limitKmh: lim,
    onAdd: (v) => view.add(v),
    onRemove: (v) => view.remove(v),
  });
  oncoming = new Traffic({
    dir: -1,
    density: CONFIG.oncomingDensity,
    ahead: 2100,
    behind: 350,
    seed: CONFIG.seed + 2,
    limitKmh: lim,
    spawnBehind: false,
    onAdd: (v) => view.add(v),
    onRemove: (v) => view.remove(v),
  });
  msi = traffic.msi = new MSI(traffic);
  player.update(0.001, { steer: 0, throttle: 0, brake: 0, analog: false }, { vehicles: [], lanes: [] });
  if (SCENARIO) startScenario();
  else traffic.initialFill(player.s, player.proxy);
  oncoming.initialFill(player.s, null);
}
function startScenario() {
  player.placeInLane(SCENARIO.player.lane, SCENARIO.player.kmh);
  applyScenario(traffic, SCENARIO, player.s);
  player.update(0.001, { steer: 0, throttle: 0, brake: 0, analog: false }, traffic);
}
makeTraffic();

// ---------------------------------------------------------------- state
const input = new Input(renderer.domElement);
const audio = new AudioEngine();
const radio = new Radio((t, k) => hud.toast(t, k));
const hud = new Hud();
const stats = new Stats();
// Proefrit (F-37): every drive is recorded; F8 drops a mark and the pause menu
// takes the notes. Ending a drive asks three optional questions and POSTs the
// journal to the dev server (playtests/human/).
const journal = new Journal();
// From here on the frame goes through session.js: the same sim the bot drives.
sim = bindSim({ road, player, traffic, msi, rng: Math.random, journal, scenario: SCENARIO });
let debriefOpen = false;
let calmPick = 0;
const overlay = new Overlay(document.getElementById('overlay'));
const laneMap = new LaneMap();
const castStage = new CastStage(scene, road, view, player);
const castViewer = new CastViewer(castStage);
castViewer.onOpen = () => {
  hud.toggle(hud.menuEl, false);
  renderer.shadowMap.needsUpdate = CONFIG.shadows;
};
castViewer.onClose = () => {
  if (!started) document.getElementById('start').classList.remove('hidden');
  else if (paused) hud.toggle(hud.menuEl, true);
};
laneMap.setMode(CONFIG.laneMap);
// The dev overlay is a tuning view: only in dev mode, never on the hosted build.
const overlayModes = DEV ? OVERLAY_MODES : OVERLAY_MODES.filter((m) => m !== 'dev');
overlay.setMode(overlayModes.includes(CONFIG.overlay) ? CONFIG.overlay : 'off');
const VIEWS = ['cockpit', 'bonnet', 'chase'];
const VIEW_NAMES = { cockpit: 'Cockpit', bonnet: 'Bonnet', chase: 'Chase' };
let viewIdx = 0;
let paused = true;
let started = false;
let lookYaw = 0, lookPitch = 0;
let hornOn = false;
// Shoulder check (F-13): tap Z / X for a quick glance over the shoulder at the
// blind spot, hold to keep looking.
const glance = { left: 0, right: 0 };
const SHOULDER_L = 2.35, SHOULDER_R = -2.2; // rad, about 135° / 125°
let chaseYaw = player.yaw;
let time = 0;
let lastBlink = false;
let mode = null;

function applyTime(m) {
  mode = m;
  env.setMode(m);
  scenery.setNight(m);
  setVehicleNight(m === 'night');
  applyTimeSim(sim, m);
  // the other carriageway: visuals only here, it never touches your lane
  oncoming.night = m === 'night';
  oncoming.densityScale = m === 'night' ? CONFIG.nightTraffic : m === 'dusk' ? 0.8 : 1;
  oncoming.setLimit(speedLimitKmh());
  bloom.strength = CONFIG.bloom ? env.bloomStrength : 0;
  bloom.enabled = CONFIG.bloom;
  glow.mat.uniforms.uFade.value = m === 'night' ? 1 / 2600 : 1 / 900;
}
applyTime(CONFIG.timeOfDay);
hud.setView(VIEW_NAMES[VIEWS[viewIdx]]);

// prebuild nearby scenery
scenery.update(player.s, 999);

hud.buildMenu((key, v) => {
  if (key === 'timeOfDay') applyTime(v);
  else if (key === 'trafficDensity') traffic.density = v;
  else if (key === 'oncomingDensity') oncoming.density = v;
  else if (key === 'volume') audio.setVolume(v);
  else if (key === 'radioVolume') radio.setVolume(v);
  else if (key === 'radioFolder') radio.setFiles(v);
  else if (key === 'radioUrl') {
    // Typing a new URL while tuned re-tunes; clearing it turns the radio off.
    if (radio.source === 'url') radio.tune(radio.streamUrl() ? 'url' : 'off');
  }
  else if (key === 'fov') {
    camera.fov = v;
    camera.updateProjectionMatrix();
  } else if (key === 'bloom') applyTime(mode);
  else if (key === 'speeders' || key === 'middleLaneHoggers' || key === 'truckOvertakeEagerness' || key === 'politeness' || key === 'anticipation' || key === 'speedSpreadKmh')
    hud.toast('Applies to newly spawned traffic');
});

// ---------------------------------------------------------------- start / pause
// Dev-only UI ships hidden in index.html: `body.dev` (CSS .devonly) and removing
// the `hidden` class here turn it on. See src/dev.js.
document.body.classList.toggle('dev', DEV);
if (DEV) for (const el of document.querySelectorAll('#menu h3.sub, #marks, #btnend')) el.classList.remove('hidden');
const startEl = document.getElementById('start');
function setPaused(p) {
  paused = p;
  if (p && hornOn) {
    hornOn = false;
    audio.horn(false);
  }
  document.getElementById('menu').classList.toggle('hidden', !p || !started || castViewer.isOpen || debriefOpen);
  if (p) renderMarks();
  if (!p && started && journal.done && !journal.active) startJournal();
}
startEl.addEventListener('click', () => {
  startEl.classList.add('hidden');
  started = true;
  audio.init();
  audio.resume();
  setPaused(false);
  if (SCENARIO) {
    startScenario();
    hud.toast(`Scenario: ${SCENARIO.title} · Backspace restarts`);
  } else if (SCENARIO_NAME) hud.toast(`Unknown scenario "${SCENARIO_NAME}"`, 'bad');
  startJournal();
});
document.getElementById('btnresume').onclick = () => setPaused(false);
document.getElementById('btnend').onclick = () => openDebrief();
document.getElementById('btnsavejournal').onclick = () => saveDrive(false);
document.getElementById('btnskipjournal').onclick = () => saveDrive(true);
for (const b of document.querySelectorAll('#calmbtns button')) {
  b.onclick = () => pickCalm(Number(b.dataset.calm));
}

// ---------------------------------------------------------------- Proefrit (F-37)
function startJournal() {
  if (!started || journal.active) return;
  journal.start({
    kind: 'human',
    driver: 'human',
    profile: null,
    seed: CONFIG.seed,
    scenario: SCENARIO_NAME || null,
    timeOfDay: mode,
    limitKmh: traffic.limitKmh,
    playerLen: player.len,
    player,
  });
  if (DEV) hud.toast('Drive journal recording · F8 marks a moment');
}

/** The pause menu lists your marks so each can get its one-line note. */
function renderMarks() {
  const box = document.getElementById('marks');
  if (!box) return;
  box.innerHTML = '';
  const marks = journal.marks;
  if (!marks.length) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = journal.active
      ? 'No marks yet. F8 during a drive drops one.'
      : 'Not recording a drive right now. F8 during a drive drops a mark.';
    box.appendChild(p);
    return;
  }
  marks.forEach((m, i) => {
    const row = document.createElement('label');
    row.className = 'markrow';
    const at = document.createElement('span');
    at.textContent = `${clockText(m.t)} · ${(m.s / 1000).toFixed(1)} km`;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'what happened?';
    inp.value = m.note || '';
    inp.onchange = () => journal.setMarkNote(i, inp.value);
    row.append(at, inp);
    box.appendChild(row);
  });
}

function pickCalm(n) {
  calmPick = n;
  for (const b of document.querySelectorAll('#calmbtns button')) b.classList.toggle('on', Number(b.dataset.calm) === n);
}

function openDebrief() {
  if (!started || !DEV) return;
  if (!journal.active) {
    hud.toast('No drive to save');
    return;
  }
  debriefOpen = true;
  calmPick = 0;
  document.getElementById('qwrong').value = '';
  document.getElementById('qbest').value = '';
  for (const b of document.querySelectorAll('#calmbtns button')) b.classList.remove('on');
  document.getElementById('debrief').classList.remove('hidden');
  setPaused(true);
}

function closeDebrief() {
  debriefOpen = false;
  document.getElementById('debrief').classList.add('hidden');
}

async function saveDrive(skip) {
  if (!journal.active) {
    closeDebrief();
    setPaused(true);
    return;
  }
  const answers = skip
    ? { skipped: true }
    : {
        skipped: false,
        calm: calmPick || null,
        wrong: document.getElementById('qwrong').value.trim().slice(0, 400) || null,
        best: document.getElementById('qbest').value.trim().slice(0, 400) || null,
      };
  const data = journal.finish({ answers, reason: skip ? 'skipped' : 'debrief' });
  closeDebrief();
  setPaused(true);
  if (!data) return;
  const path = await sendJournal(data);
  hud.toast(path ? `Journal saved: ${path}` : 'Journal downloaded', path ? 'info' : 'warn', 4200);
  if (path) console.log(`[proefrit] wrote ${path}`);
}

// A closed tab should not lose the drive: send it quietly to the dev endpoint.
window.addEventListener('beforeunload', () => {
  if (!journal.active) return;
  const data = journal.finish({ answers: { skipped: true, unload: true }, reason: 'unload' });
  if (!data) return;
  if (DEV && navigator.sendBeacon) {
    navigator.sendBeacon('/__journal', new Blob([JSON.stringify(data)], { type: 'application/json' }));
  }
});
document.getElementById('btncast').addEventListener('click', (e) => {
  e.stopPropagation();
  startEl.classList.add('hidden');
  castViewer.show();
});
document.getElementById('btncastmenu').onclick = () => castViewer.show();
window.addEventListener('blur', () => { if (hornOn) { hornOn = false; audio.horn(false); } });

// ---------------------------------------------------------------- matrix signs and lane closures
/** Put the current faces on the gantries that exist in the scenery. */
function updateMatrixSigns(time) {
  const flashOn = time % 1 < 0.5;
  for (const [i, e] of scenery.msiSigns) {
    for (let l = 0; l < e.mats.length; l++) {
      const m = e.mats[l];
      if (!m) continue;
      const f = msi.face(i, l);
      const key = f ? `${f.face}|${f.flash && flashOn ? 1 : 0}` : '|0';
      if (m.userData.face === key) continue;
      m.userData.face = key;
      const t = matrixTexture(f ? f.face : '', !!(f && f.flash && flashOn));
      m.map = t;
      m.emissiveMap = t;
      if (!paused && journal.active && Math.abs(gantryS(i) - player.s) < 400) {
        journal.event('msi', { gantry: i, lane: l, face: f ? f.face : '' });
      }
    }
  }
}
/** The limit that applies to you right now: session.playerLimit, kept local for HUD use. */

// ---------------------------------------------------------------- input handling
function handlePresses(pad) {
  const presses = input.takePresses();
  if (castViewer.isOpen) {
    castViewer.handlePresses(presses);
    input.takeWheel();
    return;
  }
  if (debriefOpen) {
    for (const p of presses) {
      if (p.code === 'Escape') saveDrive(true);
      else if (p.code === 'Enter' || p.code === 'NumpadEnter') saveDrive(false);
      else if (/^Digit[1-5]$/.test(p.code)) pickCalm(Number(p.code.slice(5)));
    }
    return;
  }
  for (const p of presses) {
    if (!started) continue;
    const c = p.code;
    // C is cruise while driving; from the pause menu it opens the viewer.
    if (c === 'KeyC' && paused) {
      castViewer.show();
      continue;
    }
    if (c === 'Escape' || c === 'KeyP') {
      setPaused(!paused);
      continue;
    }
    if (paused) continue;
    if (applyDrivePress(sim, p)) continue;
    switch (c) {
      case 'F8': {
        if (!DEV) break;
        const m = journal.mark();
        if (m) hud.toast(`Mark ${clockText(m.t)} · add a note from the pause menu`);
        else hud.toast('No journal recording', 'warn');
        break;
      }
      case 'KeyZ':
        glance.left = 0.75;
        break;
      case 'KeyX':
        glance.right = 0.75;
        break;
      case 'KeyV':
        viewIdx = (viewIdx + 1) % VIEWS.length;
        hud.setView(VIEW_NAMES[VIEWS[viewIdx]]);
        break;
      case 'KeyN': {
        const order = ['day', 'dusk', 'night'];
        const next = order[(order.indexOf(mode) + 1) % order.length];
        saveSetting('timeOfDay', next);
        applyTime(next);
        hud.toast(next === 'day' ? 'Day · limit 100' : next === 'dusk' ? 'Dusk · limit 130' : 'Night · limit 130');
        break;
      }
      case 'KeyT': {
        const steps = [4, 8, 12, 18, 25];
        const i = steps.findIndex((s) => s > traffic.density);
        const v = steps[i === -1 ? 0 : i];
        traffic.density = v;
        saveSetting('trafficDensity', v);
        hud.toast(`Traffic: ${v} per km per lane`);
        break;
      }
      case 'KeyG':
        player.highBeam = !player.highBeam;
        hud.toast(player.highBeam ? 'High beam on' : 'High beam off');
        break;
      case 'KeyL':
        player.lightsOn = !player.lightsOn;
        hud.toast(player.lightsOn ? 'Lights on' : 'Lights off');
        break;
      case 'KeyJ':
        saveSetting('adaptiveCruise', !CONFIG.adaptiveCruise);
        hud.toast(CONFIG.adaptiveCruise ? 'Adaptive cruise (ACC) on' : 'Classic cruise control');
        break;
      case 'KeyK':
        saveSetting('steeringAssist', (CONFIG.steeringAssist + 1) % 3);
        hud.toast(['Steering assist off', 'Steering assist: follows curves', 'Steering assist: curves + straighten'][CONFIG.steeringAssist]);
        break;
      case 'KeyH':
      case 'F1':
        hud.toggle(hud.helpEl);
        break;
      case 'Tab':
        hud.toggle(hud.statsEl);
        hud.showStats(stats);
        break;
      case 'KeyY':
        radio.next();
        break;
      case 'KeyU': {
        const m = (laneMap.mode + 1) % 3;
        laneMap.setMode(m);
        saveSetting('laneMap', m);
        hud.toast(['Lane map off', 'Lane map', 'Lane map + time-space diagram'][m]);
        break;
      }
      case 'Comma':
      case 'Period': {
        if (!laneMap.mode) break;
        const span = laneMap.zoom(c === 'Period' ? -1 : 1);
        saveSetting('laneMapSpan', span);
        hud.toast(`Lane map: ${span} m`);
        break;
      }
      case 'KeyM':
        audio.setMuted(!audio.muted);
        radio.setMuted(audio.muted);
        hud.toast(audio.muted ? 'Sound off' : 'Sound on');
        break;
      case 'KeyI':
        player.hazard = !player.hazard;
        break;
      case 'Backspace':
        if (SCENARIO) {
          startScenario();
          hud.toast(`Restarted: ${SCENARIO.title}`);
        }
        break;
      case 'KeyO': {
        const next = overlayModes[(overlayModes.indexOf(overlay.mode) + 1) % overlayModes.length];
        overlay.setMode(next);
        saveSetting('overlay', next);
        hud.toast(OVERLAY_NAMES[next]);
        break;
      }
    }
  }
  const w = input.takeWheel();
  if (w && started && !paused) player.adjustCruise(w);
  if (pad && started && !paused) {
    for (const b of pad.edges) {
      if (b === 4) player.indicator(-1);
      else if (b === 5) player.indicator(1);
      else if (b === 0) player.toggleCruise();
      else if (b === 2) player.resumeCruise();
      else if (b === 12) player.adjustCruise(1);
      else if (b === 13) player.adjustCruise(-1);
      else if (b === 3) {
        viewIdx = (viewIdx + 1) % VIEWS.length;
        hud.setView(VIEW_NAMES[VIEWS[viewIdx]]);
      } else if (b === 9) setPaused(!paused);
    }
  }
}

// ---------------------------------------------------------------- dashboard canvas
let dashT = 0;
function drawDash() {
  const g = dashCtx;
  g.fillStyle = '#050607';
  g.fillRect(0, 0, 512, 160);
  g.textBaseline = 'middle';
  g.fillStyle = '#e8f1ff';
  g.font = 'bold 84px Arial';
  g.textAlign = 'right';
  g.fillText(String(Math.max(0, Math.round(player.speedKmh))), 300, 82);
  g.font = '26px Arial';
  g.fillStyle = '#8aa0b8';
  g.textAlign = 'left';
  g.fillText('km/h', 310, 105);
  g.fillText(`D${player.gear}`, 310, 55);
  const cc = player.cc;
  g.font = 'bold 30px Arial';
  g.fillStyle = cc.on ? '#5bea7a' : cc.has ? '#7f8b96' : '#33393f';
  g.fillText(`${CONFIG.adaptiveCruise ? 'ACC' : 'CC'} ${cc.has ? cc.set : '--'}`, 390, 80);
  // indicators
  const blink = blinkPhase();
  g.fillStyle = player.ind === -1 && blink ? '#3df06a' : '#14301c';
  g.beginPath();
  g.moveTo(20, 80);
  g.lineTo(60, 50);
  g.lineTo(60, 110);
  g.fill();
  g.fillStyle = player.ind === 1 && blink ? '#3df06a' : '#14301c';
  g.beginPath();
  g.moveTo(492, 80);
  g.lineTo(452, 50);
  g.lineTo(452, 110);
  g.fill();
  // rpm bar
  g.fillStyle = '#1b2228';
  g.fillRect(80, 140, 340, 8);
  g.fillStyle = '#4aa3ff';
  g.fillRect(80, 140, (340 * Math.min(1, player.rpm / 6500)), 8);
  if (player.highBeam && player.lightsOn) {
    g.fillStyle = '#3a7bff';
    g.fillText('≡D', 80, 30);
  }
  dashTex.needsUpdate = true;
}

function blinkPhase() {
  return (time % 0.72) < 0.38;
}

// ---------------------------------------------------------------- camera update
const _v3 = new THREE.Vector3();
function updateCamera(dt, pad) {
  const v = VIEWS[viewIdx];
  let target = 0;
  glance.left = Math.max(0, glance.left - dt);
  glance.right = Math.max(0, glance.right - dt);
  let rate = 9;
  if (input.is('lookLeft') || glance.left > 0) {
    target = SHOULDER_L;
    rate = 13; // a quick head turn
  } else if (input.is('lookRight') || glance.right > 0) {
    target = SHOULDER_R;
    rate = 13;
  }
  else if (input.is('lookBack')) target = Math.PI * 0.97;
  else if (input.mouseLook.active) target = input.mouseLook.yaw;
  else if (pad && Math.abs(pad.lookX) > 0.15) target = -pad.lookX * 1.4;
  if (pad && pad.held(1)) target = Math.PI * 0.97;
  lookYaw += (target - lookYaw) * approach(rate, dt);
  const pt = input.mouseLook.active ? input.mouseLook.pitch : 0;
  lookPitch += (pt - lookPitch) * approach(9, dt);
  if (!input.mouseLook.active) input.mouseLook.yaw *= 1 - approach(6, dt);

  const fov = v === 'chase' ? CONFIG.fov - 2 : CONFIG.fov;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  if (v === 'cockpit' || v === 'bonnet') {
    if (camera.parent !== playerVis.front) playerVis.front.add(camera);
    camera.layers.enable(LAYER_SELF);
    if (v === 'cockpit') {
      camera.layers.disable(LAYER_SELF); // the body shell would block the view from inside
      // slight head motion with acceleration
      const lean = clamp(-player.acc * 0.006, -0.03, 0.03);
      // turning the head over the shoulder also moves it: forward and toward
      // the window, so you see past the B-pillar into the blind spot
      const turn = Math.min(1, Math.abs(lookYaw) / 2.3);
      camera.position.set(0.37 + Math.sin(lookYaw) * 0.08 + Math.sign(lookYaw) * 0.07 * turn, 1.22 + 0.02 * turn, -0.17 + lean + 0.1 * turn);
      camera.near = 0.06;
    } else {
      camera.position.set(0, 1.3, 1.0);
      camera.near = 0.3;
    }
    camera.rotation.set(lookPitch - 0.035, Math.PI + lookYaw, 0, 'YXZ');
  } else {
    if (camera.parent !== scene) scene.add(camera);
    camera.layers.enable(LAYER_SELF);
    let dy = player.yaw - chaseYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    chaseYaw += dy * approach(4, dt);
    const yawC = chaseYaw + lookYaw;
    const px = playerVis.front.position.x, pz = playerVis.front.position.z;
    camera.position.set(px - Math.sin(yawC) * 7.6, 2.55, pz - Math.cos(yawC) * 7.6);
    camera.lookAt(_v3.set(px + Math.sin(yawC) * 6, 1.1, pz + Math.cos(yawC) * 6));
    camera.near = 0.3;
  }
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- per-frame
let last = performance.now();
const camWorld = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  // rAF's timestamp can be earlier than the performance.now() taken at start-up:
  // never let dt go negative (it drove the keyboard pedals to full brake).
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  const ctl = input.controls(dt);
  handlePresses(ctl.pad);

  // The viewer freezes the sim and uses the main camera on the stage. Nothing
  // below runs while it is open, so the rig cannot step traffic or touch play.
  if (castViewer.isOpen) {
    castViewer.update(dt, camera, mode !== 'day');
    renderer.shadowMap.needsUpdate = CONFIG.shadows && mode !== 'night';
    composer.render(dt);
    return;
  }

  if (!paused) {
    time += dt;
    // physics, matrix signs, closures and the journal sample: shared with the bot
    stepSim(sim, dt, ctl);
    // the other carriageway, same substep count (it has no effect on your lane)
    const tsub = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < tsub; i++) oncoming.step(dt / tsub, player.s, null);
    stats.update(dt, player, traffic, (t, k) => hud.toast(t, k));
    for (const n of sim.notices.splice(0)) {
      if (n.type === 'red-cross') {
        stats.redCrosses++;
        hud.toast('Red cross: this lane is closed. In real life that is a hefty fine.', 'bad');
      }
    }
    closureView.sync(traffic.closures);
    // horn (F-03): sound while held; drivers react once per press
    {
      const h = input.is('horn');
      if (h !== hornOn) {
        hornOn = h;
        audio.horn(h);
        journal.event('horn', { on: h });
        if (h) traffic.honkFrom(player.proxy);
      }
    }
    holdFlash(sim, input.is('flash'));
    // events from player
    for (const e of drainEvents(sim)) {
      if (e.type === 'cc') {
        if (e.on) audio.beep(e.adjust ? (e.adjust > 0 ? 1400 : 1100) : 1250, 0.06, 1);
        else audio.beep(800, 0.09, 2);
        if (e.on && !e.adjust) hud.toast(`${CONFIG.adaptiveCruise ? 'ACC' : 'Cruise'} ${e.set} km/h${e.resume ? ' (resume)' : ''}`);
        if (!e.on && e.braked) hud.toast('Cruise off (brake)');
      } else if (e.type === 'crash') {
        audio.crash(e.strength);
        stats.collisions++;
        hud.toast('Collision!', 'bad');
      } else if (e.type === 'msg') hud.toast(e.text);
    }
    scenery.animate(dt);
  }

  // ----- visuals
  const night = mode !== 'day';
  const lights = player.lightsOn;
  TrafficView.pose(playerVis, player.x, player.z, player.yaw, clamp(-player.acc * 0.004, -0.012, 0.018), 0);
  steeringWheel.rotation.z = -player.steerVis * 1.6;
  // The real lights stay weak so a white van ahead isn't blown out; the road
  // itself is lit by a ground beam below and the retroreflective lines.
  // A real dipped beam has a sharp cut-off: close behind a car it only lights
  // the bumper. Our cone has none, so dim the real lights when a vehicle is
  // close ahead (or just beside) in the beam, else its back blinds you.
  {
    let near = Infinity;
    for (const veh of traffic.vehicles) {
      const dl = veh.u - player.s - (veh.len + player.len) / 2;
      const dlat = Math.abs(veh.latLocal - player.lat);
      if (dl < -1 || dl > 40 || dlat > 4.5) continue;
      near = Math.min(near, Math.max(0.5, dl) * (dlat > 2 ? 1.8 : 1));
    }
    const f = Math.pow(clamp(near / 32, 0.1, 1), 1.3);
    headDim += (f - headDim) * Math.min(1, dt * 5);
  }
  for (const l of headLows) l.intensity = lights ? 16 * headDim : 0;
  {
    const bu = scenery.M.marking.userData.beam;
    bu.uBeamPos.value.set(player.x, 0, player.z);
    bu.uBeamDir.value.set(Math.sin(player.yaw), Math.cos(player.yaw));
    bu.uBeam.value = lights ? (mode === 'night' ? 1 : mode === 'dusk' ? 0.35 : 0) : 0;
    bu.uHigh.value = player.highBeam || player.flashT > 0 ? 1 : 0;
  }
  headHigh.intensity = lights && (player.highBeam || player.flashT > 0) ? 110 : 0;

  updateCamera(dt, ctl.pad);
  playerVis.root.updateMatrixWorld(true);
  camera.getWorldPosition(camWorld);

  const blink = blinkPhase();
  if (blink !== lastBlink && (player.ind !== 0 || player.hazard)) audio.tick(blink);
  lastBlink = blink;

  glow.begin(camWorld);
  beams.begin(camWorld);
  view.update([traffic, oncoming], player.s, camWorld, night, time);
  updateStreetLamps(mode === 'night', mode === 'dusk');
  updateMatrixSigns(time);
  closureView.update(time, glow, mode === 'night');
  if (lights && night) {
    // your own dipped beam on the road (ground-only, like the AI cars')
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const high = player.highBeam || player.flashT > 0;
    const hx = player.x + fx * 2.4, hz = player.z + fz * 2.4;
    beams.add(hx, hz, fx, fz, 0.3, 38, 2.4, 10.5, 0.035, 0.5);
    if (high) beams.add(hx, hz, fx, fz, 6, 110, 4, 22, 0.036, 0.35, 0.95, 0.97, 1);
  }
  glow.end();
  beams.end();
  // the player's own lamps
  selfGlow.begin(camWorld);
  const pm = playerVis.mats;
  const pBrake = player.brake > 0.05 || (player.acc < -1 && !player.cc.on);
  const indL = (player.ind === -1 || player.hazard) && blink;
  const indR = (player.ind === 1 || player.hazard) && blink;
  pm.head.emissiveIntensity = lights ? (night ? 1.3 : 3) : 0.8;
  pm.tail.emissiveIntensity = (lights ? 0.5 : 0) + (pBrake ? (night ? 1.5 : 4) : 0);
  pm.indL.emissiveIntensity = indL ? 6 : 0;
  pm.indR.emissiveIntensity = indR ? 6 : 0;
  if (VIEWS[viewIdx] === 'chase') {
    TrafficView.glowPart(selfGlow, playerVis.front, playerVis.emFront, camWorld, { night: lights, brake: pBrake, indL, indR, head: true, high: player.highBeam || player.flashT > 0 });
  } else {
    // seen in side mirrors only: tail + indicator glows from mirror position
    TrafficView.glowPart(selfGlow, playerVis.front, playerVis.emFront.filter((e) => e.kind !== 'head'), mirrors.left.cam.getWorldPosition(_v3), { night: lights, brake: pBrake, indL, indR, head: false }, 0.6);
  }
  selfGlow.end();

  env.update(playerVis.front.position);
  ground.position.x = Math.round(player.x / 400) * 400;
  ground.position.z = Math.round(player.z / 400) * 400;
  scenery.update(player.s, 1);

  // audio
  if (audio.ctx) {
    const fwd = camera.getWorldDirection(_v3);
    const near = [];
    for (const tr of [traffic, oncoming]) {
      for (const veh of tr.vehicles) {
        if (!veh.vis || !veh.vis.root.visible) continue;
        const pos = veh.vis.front.position;
        const dx = pos.x - camWorld.x, dz = pos.z - camWorld.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 200 * 200) continue;
        const yaw = veh.vis.front.rotation.y;
        near.push({ veh, x: dx, z: dz, d2, v: veh.v, type: veh.type, rvx: Math.sin(yaw) * veh.v - Math.sin(player.yaw) * player.v, rvz: Math.cos(yaw) * veh.v - Math.cos(player.yaw) * player.v });
      }
    }
    near.sort((a, b) => a.d2 - b.d2);
    near.length = Math.min(near.length, 6);
    audio.update(dt, { rpm: player.rpm, throttle: player.throttle, speed: player.v, interior: VIEWS[viewIdx] === 'cockpit', scrape: player.scrapeT > 0 }, { fx: fwd.x, fz: fwd.z }, paused ? [] : near);
  }

  // HUD
  hud.update(dt, player, playerLimit(sim), blink, { vehicles: traffic.vehicles.length + oncoming.vehicles.length });
  dashT -= dt;
  if (dashT <= 0) {
    dashT = 0.08;
    drawDash();
    hud.showStats(stats);
  }

  laneMap.update(dt, traffic, player, traffic.limitKmh, paused || !started);

  // ----- render
  const v = VIEWS[viewIdx];
  const needSide = v !== 'chase';
  if (overlay.mode !== 'off') {
    const W = window.innerWidth, H = window.innerHeight;
    camera.updateMatrixWorld(true);
    const views = [{ cam: camera, w: W, h: H }];
    if (v === 'cockpit') {
      for (const k of ['rear', 'left', 'right']) views.push({ cam: mirrors[k].cam, glass: cockpitGlass[k], glassCam: camera, w: W, h: H, small: true });
    } else {
      hudScene.updateMatrixWorld(true);
      for (const k of ['rear', 'left', 'right']) {
        if (k !== 'rear' && !needSide) continue;
        views.push({ cam: mirrors[k].cam, glass: hudMirrors[k].glass, glassCam: hudCam, w: W, h: H, small: true });
      }
    }
    overlay.update(traffic, player, views);
  }
  renderer.shadowMap.needsUpdate = false;
  const prevBg = scene.background;
  for (const [k, m] of Object.entries(mirrors)) {
    if (k !== 'rear' && !needSide) continue;
    renderer.setRenderTarget(m.rt);
    renderer.render(scene, m.cam);
  }
  renderer.setRenderTarget(null);
  scene.background = prevBg;
  renderer.shadowMap.needsUpdate = CONFIG.shadows && mode !== 'night';
  composer.render(dt);
  if (v !== 'cockpit') {
    hudMirrors.left.frame.visible = hudMirrors.left.glass.visible = needSide;
    hudMirrors.right.frame.visible = hudMirrors.right.glass.visible = needSide;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(hudScene, hudCam);
    renderer.autoClear = true;
  }
}
requestAnimationFrame(frame);

// debug handle
window.__game = {
  radio,
  player, traffic, oncoming, road, scene, renderer, CONFIG, scenery,
  cast: castViewer, castStage,
  /** Debug / look-dev: jump to distance s along the road with fresh traffic. */
  teleport(s) {
    for (const tr of [traffic, oncoming]) for (const v of tr.vehicles) view.remove(v);
    player.s = s;
    player.placeInLane(player.lane, Math.max(60, player.v * 3.6));
    makeTraffic();
    // the frame's sim points at the new traffic and signs; keep the closure clock
    const prev = sim;
    sim = bindSim({ road, player, traffic, msi, rng: Math.random, journal, scenario: SCENARIO });
    if (prev) {
      sim.time = prev.time;
      sim.closureDist = prev.closureDist;
      sim.lastGantry = prev.lastGantry;
    }
    Object.assign(window.__game, { traffic, oncoming, sim });
    scenery.update(player.s, 999);
  },
};
