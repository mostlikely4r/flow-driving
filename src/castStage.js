// CastStage (F-35 slices 1–3): the turntable rig the persona viewer stands on,
// the headway view that lengthens it into a following gap, and the behaviour
// demos that grow it to the lanes a staged action needs.
//
// A lone strip of asphalt on black, floating where the viewer finds it, a
// single lane that scrolls under a car that holds position, and a camera that
// can orbit or sit in one of three fixed framings. The car is a real pooled
// TrafficView visual wearing lookFor(), so it is the in-game car and flipping
// body styles costs nothing. The world (polder, motorway, other traffic) is put
// away while the viewer is open, so the rig reads as a studio and not as a
// diorama.
//
// Slice 2 lengthens the same lane threefold and puts a plain lead car on it,
// the star closing to the headway its own T (or Tdraft) says it keeps. A
// bracket between the two bumpers reads the gap in both seconds and metres;
// `personaSpec.headwayGap()` is what places the car, so the bracket cannot
// disagree with the sampled T in the sheet.
//
// The rig steps no traffic and touches no game state. It is only visible while
// the viewer is open; closing it returns visuals to the pool and disposes
// everything the stage itself built.
import * as THREE from 'three';
import { pavementEdge } from './layout.js';
import { rigRoadTexture } from './textures.js';
import { TrafficView } from './trafficView.js';
import { DemoSession } from './demoSession.js';
import { DEMO_LIMIT } from './scenarios.js';
import { clamp, slipAngle } from './util.js';
import {
  gapSeconds,
  headwayGap,
  leadVehicle,
  makePersonaVehicle,
  personaLook,
} from './personaSpec.js';

const ROAD_LEN = 40; // m, the turntable's single lane
const HEADWAY_ROAD_LEN = 200; // the gap view leans far enough forward to never show the lane's end
const HEADWAY_SHIFT = 40; // m of lane behind the star's bumper in the gap view
const DEMO_ROAD_LEN = 560; // m, long enough for the widest staged frame (antic)
const DEMO_SHIFT = 60; // m of road behind the star in a demo
const ROAD_W = 3.5; // one lane
const ROAD_PERIOD = 16; // m of texture per repeat (see rigRoadTexture)
const DRL_SIGS = new Set(['bar', 'angel', 'ev']);
const CLOSE_RATE = 2.6; // 1/s, how quickly the star closes to its headway

// Sides: the rig's lane runs along +z, exactly like the game's road, so +x is
// the LEFT of travel (the game measures `lat` positive to the right, which is
// -x). Every lane offset and every camera yaw below is written in that rig
// frame, mirrored from the world's `lat` axis: a viewer sees the traffic drive
// to the right, and an overtake happens on the car's left, as it does in play.
const FRAMINGS = [
  { name: 'Turntable', yaw: null, dist: 9.4, height: 2.15, fov: 56, look: 0.75 },
  { name: 'Mirror', yaw: -0.1, dist: 7.2, height: 1.2, fov: 40, look: 0.68 }, // low, close, what you'd see approaching
  { name: 'Pass-by', yaw: -(Math.PI / 2 + 0.04), dist: 9.6, height: 1.4, fov: 54, look: 0.7 },
  { name: 'Rear quarter', yaw: -Math.PI * 0.78, dist: 7.6, height: 1.75, fov: 50, look: 0.7 },
];

// The gap view: one fixed framing from the side and above, distance derived
// from the gap so a 0.55 s patser and a 2.2 s pensioner both fit, and panned so
// the pair sits in the strip the panels leave free instead of behind the sheet.
const HEADWAY = {
  yaw: -(Math.PI / 2 + 0.07),
  fov: 50,
  height: 4.2,
  rise: 0.55, // camera climbs with the zoom, so a long gap reads as a plan
  look: 0.5,
  minDist: 12,
  maxDist: 96,
  pad: 24, // px kept clear at the edges of the free strip
};
const BRACKET_Y = 0.5;

export class CastStage {
  constructor(scene, road, view, player) {
    this.scene = scene;
    this.road = road;
    this.view = view;
    this.player = player;
    this.group = new THREE.Group();
    this.group.name = 'CastStage';
    this.group.visible = false;
    scene.add(this.group);
    this.built = false;
    this.roadLen = 0;
    this.rig = []; // rig meshes, so a length change can take them out again
    this.own = []; // geometries / materials / textures the rig owns
    this.veh = null;
    this.key = null;
    this.variant = null;
    this.signature = null;
    this.limit = 100;
    this.orbit = 0;
    this.framing = 0;
    this.freeWidth = 0; // px of window left unobstructed by the viewer's sheet
    // headway view (slice 2)
    this.headway = null; // { draft } while the gap is open
    this.gapNow = 0; // metres bumper to bumper, animated toward the target
    this.leadVeh = null;
    this.bracket = null;
    this.labelText = '';
    // behaviour demo (slice 3)
    this.demo = null;
    this.demoLanes = 1;
    this.pendingDemo = null;
  }

  get visible() {
    return this.group.visible;
  }

  get framingName() {
    if (this.demo) return 'Demo';
    return this.headway ? 'Headway' : FRAMINGS[this.framing].name;
  }

  wantedKmh() {
    return this.veh ? this.limit + this.veh.limitOffset : this.limit;
  }

  // ---------------------------------------------------------------- build
  /** Length, forward offset and lane count of the road the current view needs. */
  rigSpec() {
    if (this.demo) return [DEMO_ROAD_LEN, DEMO_SHIFT, this.demoLanes];
    return this.headway ? [HEADWAY_ROAD_LEN, HEADWAY_SHIFT, 1] : [ROAD_LEN, 0, 1];
  }

  build(len = ROAD_LEN, shift = 0, lanes = 1) {
    if (this.built && this.roadLen === len && this.roadShift === shift && this.roadLanes === lanes) return;
    this.disposeRig();
    this.built = true;
    this.roadLen = len;
    this.roadShift = shift;
    this.roadLanes = lanes;
    const roadW = ROAD_W * lanes;
    // Nothing but the asphalt: the viewer is a black studio, so there is no
    // plinth, verge or kerb to make the lane look like a slice of the polder.
    this.roadTex = rigRoadTexture(lanes);
    this.roadTex.repeat.set(1, len / ROAD_PERIOD);
    const roadMat = new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.96, metalness: 0 });
    const roadGeo = new THREE.PlaneGeometry(roadW, len);
    this.own.push(roadTexDisposable(this.roadTex), roadMat, roadGeo);
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, shift);
    road.receiveShadow = true;
    this.rig = [road];
    this.group.add(...this.rig);
  }

  disposeRig() {
    if (!this.built) return;
    for (const o of this.own) o.dispose?.();
    this.own = [];
    for (const m of this.rig) this.group.remove(m);
    this.rig = [];
    this.roadTex = null;
    this.built = false;
    this.roadLen = 0;
    this.roadShift = 0;
    this.roadLanes = 0;
  }

  // ---------------------------------------------------------------- car
  place() {
    const p = this.road.sample(this.player.s + 16);
    const lat = pavementEdge() + 45;
    this.group.position.set(p.x + p.nx * lat, 0, p.z + p.nz * lat);
    this.group.rotation.y = p.h;
    this.group.updateMatrixWorld(true);
  }

  clearCar() {
    if (!this.veh) return;
    const vis = this.veh.vis;
    if (vis) this.group.remove(vis.root);
    this.view.remove(this.veh); // back to the pool; nothing new is allocated next time
    this.veh = null;
  }

  setCar(key, variant, signature, limitKmh) {
    this.build(...this.rigSpec());
    this.clearCar();
    this.key = key;
    this.variant = variant;
    this.signature = signature;
    this.limit = limitKmh;
    const veh = makePersonaVehicle(key, variant);
    const look = personaLook(key, variant, signature);
    this.view.add(veh, look);
    const vis = veh.vis;
    this.group.add(vis.root);
    vis.root.position.set(0, 0, 0);
    TrafficView.pose(vis, 0, 0, 0, 0, 0);
    this.veh = veh;
    this.look = look;
    // a body flip does not change the headway, only the bumpers it is measured from
    if (this.headway) this.placeLead(this.gapNow);
  }

  // ---------------------------------------------------------------- headway
  /** Open (or restyle) the gap view. The value comes from the car's own T. */
  openHeadway(draft = false) {
    const target = headwayGap(this.veh, this.wantedKmh(), draft);
    if (!(target > 1)) return false; // no wanted speed, no headway to show
    const opening = !this.headway;
    this.headway = { draft: !!draft };
    this.build(...this.rigSpec());
    this.gapNow = opening ? target + 16 : this.gapNow;
    if (!this.leadVeh) {
      const car = leadVehicle();
      this.view.add(car);
      this.group.add(car.vis.root);
      this.leadVeh = car;
    }
    if (!this.bracket) this.buildBracket();
    this.placeLead(this.gapNow);
    return true;
  }

  closeHeadway() {
    if (!this.headway) return;
    this.headway = null;
    this.gapNow = 0;
    this.labelText = '';
    this.clearLead();
    this.disposeBracket();
    if (this.group.visible) this.build(ROAD_LEN, 0, 1);
  }

  headwayTarget() {
    if (!this.headway) return null;
    return headwayGap(this.veh, this.wantedKmh(), this.headway.draft);
  }

  updateHeadway(dt) {
    const target = this.headwayTarget();
    if (target == null) return;
    const k = 1 - Math.exp(-dt * CLOSE_RATE);
    this.gapNow += (target - this.gapNow) * k;
    if (Math.abs(this.gapNow - target) < 0.05) this.gapNow = target;
    this.placeLead(this.gapNow);
  }

  /** Put the lead car at `gap` metres ahead of the star's bumper and draw the bracket. */
  placeLead(gap) {
    const star = this.veh;
    const lead = this.leadVeh;
    if (!star || !lead || !lead.vis) return;
    const zLead = gap + star.len / 2 + lead.len / 2;
    TrafficView.pose(lead.vis, 0, zLead, 0, 0);
    const b = this.bracket;
    if (!b) return;
    const z1 = star.len / 2; // star's front bumper
    const z2 = zLead - lead.len / 2; // lead's rear bumper
    const mid = (z1 + z2) / 2;
    // Keep the bracket about 2 px thick and the ticks about 14 px tall, however
    // far the gap pushes the camera back: at 50 m a 5 cm bar is invisible.
    const usable = Math.max(240, (this.freeWidth || 840) - 2 * HEADWAY.pad);
    const span = gap + star.len + lead.len + 7;
    const pxPerM = usable / Math.max(1, span);
    const thick = Math.max(0.04, 2.2 / pxPerM);
    const tickH = Math.max(0.35, 14 / pxPerM);
    b.bar.scale.set(thick, thick, Math.max(0.01, z2 - z1));
    b.bar.position.set(0, BRACKET_Y, mid);
    b.tickA.scale.set(thick, tickH, thick);
    b.tickB.scale.set(thick, tickH, thick);
    b.tickA.position.set(0, BRACKET_Y, z1);
    b.tickB.position.set(0, BRACKET_Y, z2);
    b.sprite.position.set(0, 2.7, mid);
    this.drawLabel(gapSeconds(gap, this.wantedKmh()) ?? 0, gap);
  }

  clearLead() {
    const lead = this.leadVeh;
    if (!lead) return;
    if (lead.vis) this.group.remove(lead.vis.root);
    this.view.remove(lead);
    this.leadVeh = null;
  }

  /** Thin bar with a tick at each bumper, plus a label that faces the camera. */
  buildBracket() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xdbe6f2, transparent: true, opacity: 0.9 });
    const barGeo = new THREE.BoxGeometry(1, 1, 1);
    const tickGeo = new THREE.BoxGeometry(1, 1, 1);
    const bar = new THREE.Mesh(barGeo, mat);
    const tickA = new THREE.Mesh(tickGeo, mat);
    const tickB = new THREE.Mesh(tickGeo, mat);
    const bracketGroup = new THREE.Group();
    bracketGroup.add(bar, tickA, tickB);
    this.group.add(bracketGroup);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(10, 2.5, 1); // 4:1, the canvas's own ratio
    this.group.add(sprite);

    this.bracket = { group: bracketGroup, bar, tickA, tickB, mat, barGeo, tickGeo, sprite, spriteMat, tex, canvas };
  }

  disposeBracket() {
    const b = this.bracket;
    if (!b) return;
    this.group.remove(b.group, b.sprite);
    b.barGeo.dispose();
    b.tickGeo.dispose();
    b.mat.dispose();
    b.tex.dispose();
    b.spriteMat.dispose();
    this.bracket = null;
  }

  /** The bracket says both numbers, so the seconds can be checked against T. */
  drawLabel(seconds, metres) {
    const b = this.bracket;
    if (!b) return;
    const text = `${seconds.toFixed(2)} s · ${Math.round(metres)} m`;
    if (text === this.labelText) return;
    this.labelText = text;
    const g = b.canvas.getContext('2d');
    g.clearRect(0, 0, b.canvas.width, b.canvas.height);
    g.font = '600 62px "Segoe UI", system-ui, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = Math.min(b.canvas.width - 8, g.measureText(text).width + 60);
    g.fillStyle = 'rgba(8,11,15,0.72)';
    g.beginPath();
    g.roundRect((b.canvas.width - w) / 2, 16, w, 96, 22);
    g.fill();
    g.fillStyle = '#eaf2fb';
    g.fillText(text, b.canvas.width / 2, b.canvas.height / 2 + 2);
    b.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- studio
  /**
   * The rig lives in a black studio: no polder, no motorway, nothing but the
   * lane and the cars on it. Everything the world put in the scene is put away
   * for as long as the viewer is open and comes back exactly as it was.
   */
  hideWorld() {
    if (this.worldHidden) return;
    this.worldHidden = [];
    this.worldBg = this.scene.background;
    this.worldFog = this.scene.fog;
    for (const o of this.scene.children) {
      if (o === this.group || o.isLight || o.isCamera) continue;
      // plain Object3Ds are light targets (and stand-ins); leave them alone
      if (!o.isMesh && !o.isPoints && !o.isSprite && !o.isLine && !o.isGroup) continue;
      if (!o.visible) continue;
      o.visible = false;
      this.worldHidden.push(o);
    }
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = null;
  }

  showWorld() {
    if (!this.worldHidden) return;
    for (const o of this.worldHidden) o.visible = true;
    this.worldHidden = null;
    this.scene.background = this.worldBg;
    this.scene.fog = this.worldFog;
  }

  // ---------------------------------------------------------------- open / close
  open() {
    this.build(...this.rigSpec());
    this.group.visible = true;
    this.hideWorld();
    this.orbit = 0;
    this.framing = 0;
    this.place();
  }

  close() {
    this.group.visible = false; // closeHeadway skips a rig rebuild it would throw away
    if (this.demo) {
      this.demo.dispose();
      this.demo = null;
      this.demoLanes = 1;
    }
    this.closeHeadway();
    this.clearCar();
    this.disposeRig();
    this.group.clear();
    this.showWorld();
  }

  /** Advance the treadmill, drive the lamps, pose the camera. */
  update(dt, camera, night) {
    if (!this.group.visible) return;
    this.place();
    if (this.demo) {
      this.updateDemo(dt, camera, night);
      return;
    }
    if (this.roadTex) {
      this.roadTex.offset.y -= (this.wantedKmh() / 3.6) * dt / ROAD_PERIOD;
      if (this.roadTex.offset.y < -1) this.roadTex.offset.y += 1;
    }
    const vis = this.veh && this.veh.vis;
    if (vis) driveLamps(vis, this.look ? this.look.lights : 'std', night);
    if (this.headway) {
      this.updateHeadway(dt);
      const lead = this.leadVeh && this.leadVeh.vis;
      if (lead) driveLamps(lead, lead.look ? lead.look.lights : 'std', night);
    }
    this.poseCamera(camera, dt);
  }

  poseCamera(camera, dt) {
    if (camera.parent !== this.scene) this.scene.add(camera);
    if (this.headway) {
      this.poseGapCamera(camera);
      return;
    }
    const f = FRAMINGS[this.framing];
    this.orbit += dt * 0.12;
    const yaw = f.yaw == null ? -this.orbit : f.yaw;
    const dir = new THREE.Vector3(Math.sin(yaw) * f.dist, 0, Math.cos(yaw) * f.dist).applyQuaternion(this.group.quaternion);
    const c = new THREE.Vector3(0, f.look, 0).applyMatrix4(this.group.matrixWorld);
    camera.position.set(c.x + dir.x, f.height, c.z + dir.z);
    camera.lookAt(c);
    camera.near = 0.08;
    if (camera.fov !== f.fov) {
      camera.fov = f.fov;
      camera.updateProjectionMatrix();
    }
  }

  /** Side-on, framed to the gap, and panned into the strip the panels leave free. */
  poseGapCamera(camera) {
    const W = window.innerWidth || camera.aspect * 720 || 1280;
    const freeRight = this.freeWidth || W * 0.66; // left edge of the sheet, px
    const left = HEADWAY.pad;
    const right = Math.max(left + 240, freeRight - HEADWAY.pad);
    const centre = (left + right) / 2;
    const usable = right - left;
    const gap = Math.max(1, this.gapNow);
    const starLen = this.veh ? this.veh.len : 4.8;
    const leadLen = this.leadVeh ? this.leadVeh.len : 4.8;
    const span = gap + starLen + leadLen + 7;
    const tan = Math.tan((HEADWAY.fov * Math.PI) / 360);
    const aspect = Math.max(0.6, camera.aspect || 1.6);
    // the world width at distance d is 2·d·tan·aspect across W pixels; frame the
    // span into the usable width instead of the whole window
    const dist = Math.min(HEADWAY.maxDist, Math.max(HEADWAY.minDist, (span * W) / (usable * 2 * tan * aspect)));
    const midZ = starLen / 2 + gap / 2;
    const dir = new THREE.Vector3(Math.sin(HEADWAY.yaw) * dist, 0, Math.cos(HEADWAY.yaw) * dist).applyQuaternion(this.group.quaternion);
    const c = new THREE.Vector3(0, HEADWAY.look, midZ).applyMatrix4(this.group.matrixWorld);
    camera.position.set(c.x + dir.x, HEADWAY.height + span * HEADWAY.rise, c.z + dir.z);
    const aim = c.clone();
    const halfWorld = dist * tan * aspect;
    const panWorld = ((W / 2 - centre) / (W / 2)) * halfWorld;
    const rightAxis = c.clone().sub(camera.position).normalize().cross(camera.up).normalize();
    const shift = rightAxis.multiplyScalar(panWorld);
    camera.position.add(shift);
    aim.add(shift);
    camera.lookAt(aim);
    camera.near = 0.08;
    if (camera.fov !== HEADWAY.fov) {
      camera.fov = HEADWAY.fov;
      camera.updateProjectionMatrix();
    }
  }

  cycleFraming() {
    if (this.headway || this.demo) return this.framingName; // one framing while a view is open
    this.framing = (this.framing + 1) % FRAMINGS.length;
    return this.framingName;
  }

  // ---------------------------------------------------------------- behaviour demos (slice 3)
  /**
   * Put a staged demo on the rig. `sc` is a scenario from scenarios.buildDemo()
   * (already built at DEMO_LIMIT). The stage owns only the visuals; DemoSession
   * owns the traffic, the captions and the loop.
   */
  startDemo(sc, { variant, signature } = {}) {
    if (this.demo) {
      this.demo.dispose();
      this.demo = null;
    }
    this.closeHeadway();
    this.clearCar();
    this.demoLanes = sc.lanes;
    this.pendingDemo = { starTag: sc.demo.star, persona: sc.demo.persona, signature: signature || null };
    this.demo = new DemoSession(sc, {
      limitKmh: DEMO_LIMIT,
      variant,
      signature,
      onAdd: (v) => this.addDemoVisual(v),
      onRemove: (v) => this.removeDemoVisual(v),
    });
    this.pendingDemo = null;
    this.build(...this.rigSpec());
    this.group.visible = true;
    this.place();
    return true;
  }

  addDemoVisual(v) {
    const d = this.demo || this.pendingDemo;
    if (!d) return;
    // The star wears the viewer's current body and lamp signature; actors are
    // ordinary cars with their own deterministic paint.
    const look = v.tag === d.starTag ? personaLook(d.persona, v.variant, d.signature) : null;
    this.view.add(v, look);
    this.group.add(v.vis.root);
  }

  removeDemoVisual(v) {
    if (!v.vis) return;
    this.group.remove(v.vis.root);
    this.view.remove(v);
  }

  closeDemo() {
    if (!this.demo) return;
    this.demo.dispose();
    this.demo = null;
    this.demoLanes = 1;
    this.build(...this.rigSpec()); // back to the turntable's single lane
  }

  get demoOpen() {
    return !!this.demo;
  }

  get demoTitle() {
    return this.demo ? this.demo.title : '';
  }

  get demoAbout() {
    return this.demo ? this.demo.about : '';
  }

  get demoReadout() {
    return this.demo ? this.demo.readout : null;
  }

  get demoCaption() {
    return this.demo ? this.demo.captionText : '';
  }

  get demoFade() {
    return this.demo ? this.demo.fade : 0;
  }

  get demoPaused() {
    return !!this.demo && this.demo.paused;
  }

  get demoSpeed() {
    return this.demo ? this.demo.speed : 1;
  }

  toggleDemoPause() {
    return this.demo ? this.demo.togglePause() : false;
  }

  setDemoSpeed(x) {
    if (this.demo) this.demo.setSpeed(x);
    return this.demoSpeed;
  }

  restartDemo() {
    if (this.demo) this.demo.restart();
  }

  updateDemo(dt, camera, night) {
    const d = this.demo;
    d.step(dt);
    const star = d.star;
    if (!star) return;
    const blink = Math.floor(d.t / 0.4) % 2 === 0;
    for (const v of d.traffic.vehicles) {
      if (!v.vis) continue;
      const z = v.u - star.u;
      // the rig's +x is the left of travel, `lat` grows to the right
      const x = d.centerLat - v.latLocal;
      const yaw = v.v > 2 ? -slipAngle(v.latRate || 0, v.v) : 0;
      TrafficView.pose(v.vis, x, z, yaw, clamp(-v.acc * 0.004, -0.012, 0.018));
      driveDemoLamps(v.vis, v, night, blink);
    }
    if (this.roadTex && !d.paused) {
      // The star holds position while the surface runs at its actual speed.
      this.roadTex.offset.y -= (star.v * dt) / ROAD_PERIOD;
      if (this.roadTex.offset.y < -1) this.roadTex.offset.y += 1;
    }
    this.poseDemoCamera(camera);
  }

  /** Frame the demo's action into the strip the panel leaves free. */
  poseDemoCamera(camera) {
    if (camera.parent !== this.scene) this.scene.add(camera);
    const W = window.innerWidth || camera.aspect * 720 || 1280;
    const freeRight = this.freeWidth || W * 0.66;
    const pad = 26;
    const left = pad;
    const right = Math.max(left + 260, freeRight - pad);
    const centre = (left + right) / 2;
    const usable = right - left;
    const d = this.demo;
    const star = d.star;
    const focusTag = d.sc.demo.focus;
    // Keep the star and the car the demo is about in frame; ignore the rest of
    // the stage beyond 70 m, or a distant slow car would force the camera out
    // into the fields (and behind the scenery).
    const zs = [0];
    for (const v of d.traffic.vehicles) {
      if (v === star) continue;
      const z = v.u - star.u;
      if ((v.tag === focusTag && Math.abs(z) <= 120) || Math.abs(z) <= 70) zs.push(z);
    }
    const zMin = Math.min(...zs) - 8;
    const zMax = Math.max(...zs) + 8;
    const spanZ = zMax - zMin;
    const spanX = this.demoLanes * 3.5 + 4;
    const minSpan = this.demoLanes === 1 ? 26 : 30;
    const span = clamp(Math.max(spanZ, spanX), minSpan, 155);
    const midZ = (zMin + zMax) / 2;
    const fov = this.demoLanes > 1 ? 52 : 50;
    const tan = Math.tan((fov * Math.PI) / 360);
    const aspect = Math.max(0.6, camera.aspect || 1.6);
    const dist = clamp((span * W) / (usable * 2 * tan * aspect), 20, 130);
    // A three-quarter view from the shoulder side when the action is compact, so
    // the lane reads across the frame. A wide action gets a rear view down the
    // rig's own strip, which keeps the camera on it.
    let yaw;
    if (span > 90) yaw = -Math.PI * 0.92;
    else if (this.demoLanes > 1) yaw = -Math.PI * 0.78;
    else yaw = -(Math.PI / 2 - 0.05);
    const dir = new THREE.Vector3(Math.sin(yaw) * dist, 0, Math.cos(yaw) * dist).applyQuaternion(this.group.quaternion);
    const c = new THREE.Vector3(0, 0.72, midZ).applyMatrix4(this.group.matrixWorld);
    camera.position.set(c.x + dir.x, 2.8 + span * 0.05, c.z + dir.z);
    // Pan by aiming, not by moving the camera: a 150 m framing would otherwise
    // carry the camera tens of metres off the rig.
    const halfWorld = dist * tan * aspect;
    const panWorld = ((W / 2 - centre) / (W / 2)) * halfWorld;
    const aim = c.clone();
    const rightAxis = c.clone().sub(camera.position).normalize().cross(camera.up).normalize();
    aim.add(rightAxis.multiplyScalar(panWorld));
    camera.lookAt(aim);
    camera.near = 0.08;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
}

/** A demo vehicle's lamps, lit by hand from the live simulation state. */
function driveDemoLamps(vis, veh, night, blink) {
  const m = vis.mats;
  const sig = vis.look ? vis.look.lights : 'std';
  m.head.emissiveIntensity = night ? 3 : 2.4;
  m.tail.emissiveIntensity = (night ? 0.7 : 0) + (veh.brake ? (night ? 1.5 : 4) : 0);
  m.indL.emissiveIntensity = veh.indicator === -1 && blink ? 6 : 0;
  m.indR.emissiveIntensity = veh.indicator === 1 && blink ? 6 : 0;
  m.drl.emissiveIntensity = DRL_SIGS.has(sig) ? (night ? 3 : 4) : 0;
  m.marker.emissiveIntensity = night ? 2.5 : 0;
}

/** Lit by hand, like TrafficView does: no traffic is stepped here. */
function driveLamps(vis, sig, night) {
  const m = vis.mats;
  m.head.emissiveIntensity = night ? 3 : 2.4;
  m.tail.emissiveIntensity = night ? 0.7 : 0;
  m.indL.emissiveIntensity = 0;
  m.indR.emissiveIntensity = 0;
  m.drl.emissiveIntensity = 0;
  if (DRL_SIGS.has(sig)) m.drl.emissiveIntensity = night ? 3 : 4;
  m.marker.emissiveIntensity = night ? 2.5 : 0;
}

// dispose() is called on the texture object itself; wrap it so the loop above
// stays uniform.
function roadTexDisposable(tex) {
  return { dispose: () => tex.dispose() };
}
