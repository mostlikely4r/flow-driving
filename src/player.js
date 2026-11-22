// The player's car: simple but honest highway physics.
// Longitudinal: power-limited drive, aero drag, rolling resistance, brakes,
// automatic gearbox (for sound). Lateral: kinematic bicycle model with
// speed-sensitive steering and optional curve-following assist.
import { CONFIG } from './config.js';
import { KMH, clamp, wrapAngle } from './util.js';
import { laneLat, laneAt, lanesOccupied, guardrailLat, innerEdge } from './layout.js';
import { leaderIn, gapBetween, idm } from './traffic.js';

const MASS = 1480;
const POWER = 115e3; // W
const FMAX = 6200; // N
const CDA = 0.66;
const CRR = 0.011;
const BRAKE = 9.3; // m/s^2 at full pedal
const WHEELBASE = 2.8;
const GEARS = [3.6, 2.15, 1.45, 1.1, 0.88, 0.72];
const FINAL = 3.4;
const WHEEL_R = 0.32;

export class Player {
  constructor(road) {
    this.road = road;
    this.len = 4.8;
    this.width = 1.84;
    this.s = 0;
    this.lat = laneLat(Math.min(1, CONFIG.lanes - 1));
    const p = road.toWorld(this.s, this.lat);
    this.x = p.x;
    this.z = p.z;
    this.yaw = p.h;
    this.v = 96 * KMH;
    this.vAlong = this.v;
    this.acc = 0;
    this.steerIn = 0; // -1..1 (right +)
    this.steerVis = 0;
    this.throttle = 0;
    this.brake = 0;
    this.cc = { on: false, set: 100, has: false, integ: 0, out: 0, accMode: false };
    this.ind = 0; // -1 left, +1 right
    this.indStartLane = 0;
    this.indT = 0;
    this.hazard = false;
    this.gear = 6;
    this.rpm = 2000;
    this.shiftT = 0;
    this.lane = laneAt(this.lat);
    this.lanesOcc = [this.lane];
    this.events = [];
    this.scrapeT = 0;
    // Sim clock (s), not wall time: a headless run is much faster than real
    // time, so a wall-clock crash gate would swallow most contacts.
    this.clock = 0;
    this.lastHit = -Infinity;
    this.flashT = 0;
    this.highBeam = false;
    this.lightsOn = false;
    this.roadH = this.yaw;
    this.headingErr = 0;
    this.noInputT = 0;
    this.leader = null;
    this.leaderGap = Infinity;
    // proxy seen by the traffic simulation
    this.proxy = { isPlayer: true, u: 0, len: this.len, v: this.v, v0: this.v, T: 1.2, s0: 2, a: 1.5, b: 2.0, lanesOcc: [1], signalLane: -1, lane: 1 };
  }

  emit(type, data) {
    this.events.push({ type, ...data });
  }

  /** Put the car in the centre of a lane at a speed with cruise engaged (scenarios). */
  placeInLane(lane, kmh) {
    this.lat = laneLat(lane);
    const p = this.road.toWorld(this.s, this.lat);
    this.x = p.x;
    this.z = p.z;
    this.yaw = this.roadH = p.h;
    this.headingErr = 0;
    this.v = this.vAlong = kmh * KMH;
    this.acc = 0;
    this.steerIn = this.steerVis = 0;
    this.ind = 0;
    this.lane = lane;
    this.lanesOcc = [lane];
    this.cc.on = this.cc.has = true;
    this.cc.set = Math.round(kmh);
    this.cc.integ = this.cc.out = 0;
  }

  // ---------------- controls ----------------
  toggleCruise() {
    if (this.cc.on) {
      this.cc.on = false;
      this.emit('cc', { on: false });
    } else {
      const kmh = Math.round(this.vAlong / KMH);
      if (kmh < 30) {
        this.emit('msg', { text: 'Cruise control needs at least 30 km/h' });
        return;
      }
      this.cc.set = kmh;
      this.cc.on = true;
      this.cc.has = true;
      this.cc.integ = 0;
      this.emit('cc', { on: true, set: this.cc.set });
    }
  }
  resumeCruise() {
    if (!this.cc.has) return this.toggleCruise();
    if (this.vAlong < 30 * KMH) return;
    this.cc.on = true;
    this.cc.integ = 0;
    this.emit('cc', { on: true, set: this.cc.set, resume: true });
  }
  adjustCruise(delta) {
    if (!this.cc.on) {
      if (!this.cc.has) {
        this.toggleCruise();
        return;
      }
      this.cc.on = true;
      this.cc.set = Math.round(this.vAlong / KMH);
      this.cc.integ = 0;
    }
    this.cc.set = clamp(this.cc.set + delta, 30, 200);
    this.emit('cc', { on: true, set: this.cc.set, adjust: delta });
  }
  indicator(dir) {
    if (this.ind === dir) this.ind = 0;
    else {
      this.ind = dir;
      this.indStartLane = laneAt(this.lat);
      this.indT = 0;
    }
    this.emit('indicator', { dir: this.ind });
  }

  get speedKmh() {
    return this.vAlong / KMH;
  }

  // ---------------- update ----------------
  update(dt, ctl, traffic) {
    this.clock += dt;
    const road = this.road;
    // ---- steering
    let steer;
    if (ctl.analog) {
      const a = ctl.steer;
      steer = Math.sign(a) * Math.pow(Math.abs(a), 1.7);
      this.steerIn = steer;
    } else {
      const target = ctl.steer;
      const rate = CONFIG.keyboardSteerRate;
      if (target !== 0) {
        const r = Math.sign(target) !== Math.sign(this.steerIn) && this.steerIn !== 0 ? rate * 2.5 : rate;
        this.steerIn += clamp(target - this.steerIn, -r * dt, r * dt);
      } else {
        this.steerIn += clamp(-this.steerIn, -4 * dt, 4 * dt);
      }
      steer = this.steerIn * Math.abs(this.steerIn) * 0.6 + this.steerIn * 0.4;
    }
    const v = Math.max(this.v, 0);
    const latMax = ctl.analog ? 6.0 : CONFIG.keyboardLatAccel;
    let kappa = (steer * latMax) / Math.max(v, 8) ** 2; // right-positive curvature
    kappa = clamp(kappa, -0.2, 0.2);

    const rp = road.project(this.x, this.z, this.s);
    this.roadH = rp.h;
    let yawRate = -v * kappa;
    if (CONFIG.steeringAssist >= 1) yawRate += v * rp.k;
    const err = wrapAngle(this.yaw - rp.h);
    this.headingErr = err;
    if (Math.abs(steer) < 0.02) this.noInputT += dt;
    else this.noInputT = 0;
    if (CONFIG.steeringAssist >= 2 && this.noInputT > 0.15 && Math.abs(err) < 0.12 && v > 5) {
      yawRate += -err * 1.5;
    }
    this.yaw += yawRate * dt;
    this.steerVis = steer;

    // ---- longitudinal
    let thr = ctl.throttle;
    let brk = ctl.brake;
    if (brk > 0.04 && this.cc.on) {
      this.cc.on = false;
      this.emit('cc', { on: false, braked: true });
    }
    const vel = Math.max(v, 1);
    const fAvail = Math.min(FMAX, POWER / vel);
    const fRes = 0.5 * 1.2 * CDA * v * v + CRR * MASS * 9.81;
    // leader in our lane (for ACC and stats)
    this.findLeader(traffic);
    if (this.cc.on) {
      const target = this.cc.set * KMH;
      const e = target - v;
      this.cc.integ = clamp(this.cc.integ + e * dt, -6, 6);
      let aDes = clamp(0.55 * e + 0.06 * this.cc.integ, -0.8, 0.9);
      if (CONFIG.adaptiveCruise && this.leader) {
        const me = { u: 0, len: 0, v, v0: target, a: 1.2, b: 2.0, s0: 4, T: CONFIG.accTimeGap };
        const aAcc = idm(me, { u: this.leaderGap + this.leader.len * 0.5, len: this.leader.len, v: this.leader.v, acc: this.leader.acc }, 1);
        if (aAcc < aDes) {
          aDes = Math.max(aAcc, -3.5);
          this.cc.integ = Math.min(this.cc.integ, 0);
        }
      }
      const ccThr = clamp((MASS * aDes + fRes) / fAvail, 0, 1);
      this.cc.out += clamp(ccThr - this.cc.out, -1.2 * dt, 0.6 * dt);
      thr = Math.max(thr, this.cc.out);
      if (CONFIG.adaptiveCruise && aDes < -0.6) brk = Math.max(brk, (-aDes - 0.4) / BRAKE);
    } else {
      this.cc.out = 0;
    }
    this.throttle = thr;
    this.brake = brk;
    const fEngineBrake = thr < 0.02 ? 280 : 0;
    let a = (thr * fAvail - fRes - fEngineBrake) / MASS - brk * BRAKE;
    a = Math.min(a, 4.2);
    this.v = Math.max(0, this.v + a * dt);
    this.acc = a;

    // ---- integrate position
    this.x += Math.sin(this.yaw) * this.v * dt;
    this.z += Math.cos(this.yaw) * this.v * dt;
    const pp = road.project(this.x, this.z, this.s);
    this.s = pp.s;
    this.lat = pp.lat;
    this.vAlong = this.v * Math.cos(wrapAngle(this.yaw - pp.h));

    // ---- barriers
    const hw = this.width / 2;
    const minLat = 0.32 + hw;
    const maxLat = guardrailLat() - 0.12 - hw;
    if (this.lat < minLat || this.lat > maxLat) {
      const target = clamp(this.lat, minLat, maxLat);
      const d = target - this.lat;
      const p = road.sample(this.s);
      this.x += p.nx * d;
      this.z += p.nz * d;
      this.lat = target;
      const e2 = wrapAngle(this.yaw - pp.h);
      this.yaw -= e2 * Math.min(1, 6 * dt);
      this.v *= 1 - 0.9 * dt;
      this.scrapeT = 0.15;
      if (this.clock - this.lastHit > 0.7) {
        this.emit('scrape', {});
        this.lastHit = this.clock;
      }
    }
    this.scrapeT = Math.max(0, this.scrapeT - dt);

    // ---- collisions with traffic in our direction
    this.collide(traffic);

    // ---- lanes
    this.lane = laneAt(this.lat);
    this.lanesOcc = lanesOccupied(this.lat, hw, 0.3);
    if (this.lanesOcc.length === 0 && this.lane >= 0) this.lanesOcc = [this.lane];

    // ---- indicators: auto cancel after completing a lane change
    if (this.ind !== 0) {
      this.indT += dt;
      const cur = laneAt(this.lat);
      if (cur !== this.indStartLane && cur >= 0 && Math.abs(this.lat - laneLat(cur)) < 0.55 && Math.abs(err) < 0.03) {
        this.ind = 0;
        this.emit('indicator', { dir: 0, auto: true });
      }
    }
    this.flashT = Math.max(0, this.flashT - dt);

    // ---- gearbox (for engine sound)
    this.shiftT = Math.max(0, this.shiftT - dt);
    const wheelRpm = (this.v / (2 * Math.PI * WHEEL_R)) * 60;
    const rpmIn = (g) => wheelRpm * GEARS[g - 1] * FINAL;
    const up = 1900 + thr * 3300;
    const down = 1050 + thr * 1700;
    if (this.shiftT <= 0) {
      if (this.gear < 6 && rpmIn(this.gear) > up) {
        this.gear++;
        this.shiftT = 0.6;
      } else if (this.gear > 1 && rpmIn(this.gear) < down) {
        this.gear--;
        this.shiftT = 0.6;
      }
    }
    this.rpm = Math.max(800, rpmIn(this.gear));

    // ---- proxy for the traffic model
    const px = this.proxy;
    px.u = this.s;
    px.v = Math.max(0, this.vAlong);
    px.v0 = Math.max(px.v, this.cc.on ? this.cc.set * KMH : px.v) + 0.5;
    px.lanesOcc = this.lanesOcc;
    px.lane = this.lane;
    px.width = this.width;
    let sig = -1;
    if (this.ind !== 0 && this.lane >= 0) {
      sig = this.lane + (this.ind < 0 ? 1 : -1);
      if (sig < 0 || sig >= CONFIG.lanes) sig = -1;
    }
    px.signalLane = sig;
  }

  findLeader(traffic) {
    this.leader = null;
    this.leaderGap = Infinity;
    if (!traffic.lanes.length) return;
    for (const li of this.lanesOcc) {
      const list = traffic.lanes[li];
      if (!list) continue;
      const ld = leaderIn(list, this.proxy);
      if (ld) {
        const g = gapBetween(ld, this.proxy);
        if (g < this.leaderGap) {
          this.leaderGap = g;
          this.leader = ld;
        }
      }
    }
  }

  collide(traffic) {
    const hw = this.width / 2;
    // lane closures: the arrow-board truck at the start is solid
    for (const c of traffic.closures || []) {
      const dlat = c.obs.latLocal - this.lat;
      if (Math.abs(dlat) > c.obs.width / 2 + hw - 0.05) continue;
      const front = this.s + this.len / 2;
      if (front > c.s0 && this.s - this.len / 2 < c.s0 + 6.5) {
        const p = this.road.sample(this.s);
        const pen = front - c.s0;
        this.x -= p.tx * pen;
        this.z -= p.tz * pen;
        this.s -= pen;
        const hit = this.v;
        this.v = 0;
        if (hit > 1 && this.clock - this.lastHit > 0.9) {
          this.lastHit = this.clock;
          this.emit('crash', { strength: Math.min(3, hit / 5) });
        }
      }
    }
    // the end of an acceleration strip (F-20) is solid on the hard shoulder too
    for (const r of traffic.ramps || []) {
      const dlat = r.obs.latLocal - this.lat;
      if (Math.abs(dlat) > r.obs.width / 2 + hw - 0.05) continue;
      const front = this.s + this.len / 2;
      if (front > r.s1 && this.s - this.len / 2 < r.s1 + 20) {
        const p = this.road.sample(this.s);
        const pen = front - r.s1;
        this.x -= p.tx * pen;
        this.z -= p.tz * pen;
        this.s -= pen;
        const hit = this.v;
        this.v = 0;
        if (hit > 1 && this.clock - this.lastHit > 0.9) {
          this.lastHit = this.clock;
          this.emit('crash', { strength: Math.min(3, hit / 5) });
        }
      }
    }
    for (const veh of traffic.vehicles) {
      const dl = veh.u - this.s;
      if (Math.abs(dl) > 25) continue;
      const penL = (veh.len + this.len) / 2 - Math.abs(dl);
      const dlat = veh.latLocal - this.lat;
      const penW = (veh.width / 2 + hw) - Math.abs(dlat) - 0.05;
      if (penL <= 0 || penW <= 0) continue;
      const p = this.road.sample(this.s);
      if (penW < penL && penW < 1.0) {
        // side swipe: push apart laterally
        const d = -Math.sign(dlat) * penW;
        this.x += p.nx * d;
        this.z += p.nz * d;
        this.lat += d;
        this.yaw -= wrapAngle(this.yaw - p.h) * 0.5;
        this.v *= 0.985;
      } else if (dl > 0) {
        // we ran into the one ahead
        this.x -= p.tx * penL;
        this.z -= p.tz * penL;
        this.s -= penL;
        const vRel = this.v - veh.v;
        this.v = Math.max(0, veh.v - 0.8);
        veh.v += Math.max(0, vRel) * 0.3;
      } else {
        // hit from behind
        veh.u -= penL;
        const vRel = veh.v - this.v;
        veh.v = Math.max(0, this.v - 0.5);
        this.v += Math.max(0, vRel) * 0.3;
      }
      if (this.clock - this.lastHit > 0.9) {
        this.lastHit = this.clock;
        this.emit('crash', { strength: penL });
      }
    }
  }
}
