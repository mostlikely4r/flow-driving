// Proefrit (F-37) slice 2: a driver that only has the keyboard.
//
// The bot never receives `player`, `traffic` or `msi`. Its whole world is the
// Percept from perception.js (previous frame), and its whole output is held
// keys plus key presses. The runner feeds those through pedalStep() and
// applyDrivePress(), exactly like the keyboard, so the only methods it can
// reach are toggleCruise, resumeCruise, adjustCruise and indicator.
//
// Render-free: no Three.js, no DOM, no wall clock. Randomness, if any, comes
// from mulberry32(seed + 4).
import { CONFIG } from './config.js';
import { KMH, clamp, mulberry32 } from './util.js';
import { laneLat } from './layout.js';

export const PROFILES = {
  // The commuter: the baseline experience.
  forens: {
    setOverKmh: 4,
    keepRight: true,
    homeLane: 0,
    signalS: 3.0,
    overtakeKmh: 8,
    flashAfterS: 20,
    headwayS: 1.4,
    acceptLeadS: 1.0,
    acceptLagS: 1.2,
    minLagTtc: 5,
    react: 0.5,
    giveUpS: 15,
    backoffS: 10,
  },
  // The slowcoach: ten under the limit, middle lane, never flashes.
  slak: {
    setOverKmh: -10,
    keepRight: false,
    homeLane: 1,
    signalS: 2.0,
    overtakeKmh: 15,
    flashAfterS: Infinity,
    headwayS: 1.8,
    acceptLeadS: 1.2,
    acceptLagS: 1.5,
    minLagTtc: 6,
    react: 0.7,
    giveUpS: 15,
    backoffS: 10,
  },
};

const LANE_KEEP_M = 0.25; // dead band for holding your lane
const CENTRE_M = 0.4; // "centred" for the indicator cancel
const HEADING_EPS = 0.03;
const STEER_SETTLE_RATE = 1.5; // steering assist 2 straightens at about this rate
const PLAYER_HALF_LEN = 2.4; // own front bumper, for the arrow truck at a closure

/** IDM acceleration for a perceived leader gap. */
function idmAcc(v, v0, lead, prof) {
  const a = 1.2;
  const b = 2.0;
  const s0 = 5;
  const gap = Math.max(0.3, lead.gap);
  const leadV = Math.max(0, lead.kmh * KMH);
  const free = a * (1 - Math.pow(v / Math.max(v0, 1), 4));
  const sStar = s0 + Math.max(0, v * prof.headwayS + (v * (v - leadV)) / (2 * Math.sqrt(a * b)));
  return free - a * (sStar / gap) ** 2;
}

export class BotDriver {
  constructor(profileName = 'forens', { seed = 0, overrides = {} } = {}) {
    const base = PROFILES[profileName] || PROFILES.forens;
    this.name = PROFILES[profileName] ? profileName : 'forens';
    this.profile = { ...base, ...overrides };
    // slak's middle lane on a 2-lane road is the left lane; on 1 lane it is 0.
    this.profile.homeLane = clamp(this.profile.homeLane | 0, 0, Math.max(0, CONFIG.lanes - 1));
    this.rng = mulberry32((seed | 0) + 4);
    this.state = 'CRUISE';
    this.trace = [];
    this.time = 0;
    this.mem = {};
    this.keys = { throttle: false, brake: false, left: false, right: false, flash: false };
    this.presses = [];
    this.pressCd = 0;
    this.laneTarget = null;
    this.idmMode = false;
    this.lc = null; // active lane change { from, dir, started, signalT, why }
    this.lcCd = 0; // back-off after abort or a change
    this.blocked = {}; // per-car blocked timers for the flash
    this.flashCount = new Map();
    this.flashCd = 0;
    this.flashHold = 0;
    this.passingId = null;
    this.settleT = 0;
    this.abortT = 0;
  }

  // ---------------------------------------------------------------- helpers
  hold(name, cond, dt) {
    const v = cond ? (this.mem[name] || 0) + dt : 0;
    this.mem[name] = v;
    return v;
  }

  press(code, shift = false) {
    if (this.pressCd > 0) return;
    this.presses.push({ code, shift });
    this.pressCd = 0.25; // the keyboard has no auto-repeat for these
  }

  setState(to, why) {
    if (to === this.state) return;
    this.trace.push({ t: Math.round(this.time * 10) / 10, from: this.state, to, why });
    this.state = to;
  }

  myLane(p) {
    return clamp(p.self.lane, 0, p.self.lanes - 1);
  }

  /** Nearest car ahead in my body lane, or a closure obstacle, whichever is closer. */
  leader(p) {
    const lane = this.myLane(p);
    const lv = p.lanes[lane];
    let best = lv && lv.ahead ? lv.ahead : null;
    for (const o of p.obstacles) {
      if (o.lane !== lane || o.dAhead < -7) continue;
      // bumper to the arrow-board truck at the closure start
      const g = Math.max(0, o.dAhead - PLAYER_HALF_LEN);
      if (!best || g < best.gap) best = { gap: g, kmh: 0, ttc: g / Math.max(p.self.v, 0.1), tgap: g / Math.max(p.self.v, 1), id: null, obstacle: true, len: 6.5 };
    }
    return best;
  }

  /** No manoeuvre while a cue is younger than 0.5 s or a body straddles lanes. */
  uncertain(p) {
    const lane = this.myLane(p);
    return p.cars.some((c) => c.seenAge < 0.5 && (c.lanesOcc.includes(lane) || Math.abs(c.lane - lane) <= 1) && Math.abs(c.dl) < 120);
  }

  // ---------------------------------------------------------------- update
  update(dt, p) {
    this.time += dt;
    this.pressCd = Math.max(0, this.pressCd - dt);
    this.lcCd = Math.max(0, this.lcCd - dt);
    this.flashCd = Math.max(0, this.flashCd - dt);
    this.flashHold = Math.max(0, this.flashHold - dt);
    this.keys = { throttle: false, brake: false, left: false, right: false, flash: false };
    this.presses = [];
    if (!p || !p.self) return { keys: this.keys, presses: this.presses };

    const s = p.self;
    const prof = this.profile;
    const roadTarget = clamp(Math.round(p.signs.limitKmh + prof.setOverKmh), 30, 200);

    // ---------- longitudinal: what speed do we want, and who is in the way?
    const lead = this.leader(p);
    const emergency = this.hold('emergency', !!lead && lead.gap > 0 && (lead.ttc < 3.0 || lead.tgap < 0.5), dt) >= 0.15;
    const tooClose = !!lead && lead.gap < Math.max(2, s.v * 0.35) && lead.kmh * KMH < s.v;
    // Cruise control does the following: its set speed is clicked down toward
    // the car ahead, which is how the calibration drive actually used it. The
    // IDM rule decides when the pedals have to take over (a real slow-down).
    let want = roadTarget;
    let idm = false;
    if (lead && lead.kmh < roadTarget - 0.5) {
      want = clamp(Math.round(lead.kmh), 30, 200);
      const a = idmAcc(s.v, roadTarget * KMH, lead, prof);
      if (roadTarget - lead.kmh > 6 || lead.gap <= 8) idm = true;
      if (a < -0.3) this.keys.brake = true;
      else if (a > 0.3 && !emergency) this.keys.throttle = true;
    }
    if (emergency || tooClose) {
      this.keys.brake = true;
      idm = true;
    }

    // yield: a car alongside that is drifting or signalling into my lane
    const yielding = p.cars.some((c) => {
      if (Math.abs(c.dl) > 40 || c.lane === s.lane || Math.abs(c.lane - s.lane) !== 1) return false;
      return c.lane < s.lane ? c.ind === -1 || c.drift > 0 : c.ind === 1 || c.drift < 0;
    });
    if (yielding && !this.keys.brake) this.keys.throttle = false;

    if (emergency) this.setState('EMERGENCY', lead ? `ttc ${lead.ttc.toFixed(1)} tgap ${lead.tgap.toFixed(2)}` : 'hazard');
    else if (idm && lead) this.setState('FOLLOW', `leader ${Math.round(lead.kmh)} km/h, gap ${lead.gap.toFixed(0)} m`);
    else this.setState('CRUISE', 'clear');

    // ---------- cruise control (C / R / ±1 / ±5 only)
    // Braking is what switches cruise off, as for a human; as long as the bot
    // is not braking, it keeps the set speed clicking to what traffic allows.
    this.idmMode = idm && !p.self.cc.on;
    if (!this.keys.brake) this.cruise(p, want);

    // ---------- lateral: hold the lane (lane changes arrive in P3)
    const lane = this.myLane(p);
    const targetLat = laneLat(this.laneTarget ?? lane);
    this.steerTo(p, targetLat, LANE_KEEP_M);

    return { keys: this.keys, presses: this.presses };
  }

  /** Bang-bang steering on the predicted settle position. */
  steerTo(p, targetLat, tol) {
    const s = p.self;
    const pred = s.lat - (s.v * Math.sin(s.headingErr)) / STEER_SETTLE_RATE;
    const err = targetLat - pred;
    if (err > tol) this.keys.right = true;
    else if (err < -tol) this.keys.left = true;
  }

  cruise(p, wantKmh) {
    const cc = p.self.cc;
    const tgt = clamp(Math.round(wantKmh), 30, 200);
    const kmh = p.self.kmh;
    if (this.pressCd > 0) return;
    if (cc.on) {
      const d = tgt - cc.set;
      if (d === 0) return;
      if (Math.abs(d) >= CONFIG.ccStepBig) this.press(d > 0 ? 'Equal' : 'Minus', true);
      else this.press(d > 0 ? 'Equal' : 'Minus', false);
    } else {
      if (kmh < 30) {
        this.keys.throttle = true;
        return;
      }
      if (cc.has && cc.set === tgt) this.press('KeyR');
      else if (kmh < tgt - 1) this.keys.throttle = true;
      else this.press('KeyC');
    }
  }
}
