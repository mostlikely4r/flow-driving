// Proefrit (F-37) slice 2: a driver that only has the keyboard.
//
// The bot never receives `player`, `traffic` or `msi`. Its whole world is the
// Percept from perception.js (previous frame), and its whole output is held
// keys plus key presses. The runner feeds those through pedalStep() and
// applyDrivePress(), exactly like the keyboard, so the only methods it can
// reach are toggleCruise, resumeCruise, adjustCruise and indicator.
//
// States: CRUISE / FOLLOW / PREP / MOVE / ABORT / SETTLE / PASSING / EMERGENCY.
// Lane changes are steered with taps (digital only); the decision is made from
// the predicted settle position, not from the sim's lane or intent.
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
const CENTRE_M = 0.4; // settled in the new lane
const HEADING_EPS = 0.03;
// Effective heading-decay rate for the settle predictor. Assist 2 only bites
// after 0.15 s and the steering ramps out, so a released car keeps sliding
// further than 1.5/s suggests; 0.8 matches what the car actually does.
const STEER_SETTLE_RATE = 0.55;
const PLAYER_HALF_LEN = 2.4; // own front bumper, for the arrow truck at a closure
// The body has to move 0.25 m before the journal sees a lane change. Steering
// needs about a second for that, so the move begins this much before the full
// signal time has elapsed for the *visible* signal to be signalS long.
const SIGNAL_LEAD_S = 0.9;

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
    this.lc = null; // { from, to, dir, why, signalT, started, startLat, aborted }
    this.lcCd = 0; // seconds before another lane decision
    this.settleT = 0;
    this.blockedId = null;
    this.blockedT = 0;
    this.flashCount = new Map();
    this.flashCd = 0;
    this.flashHold = 0;
    this.passingId = null;
    this.passCandidate = null;
    this.passingT = 0;
    this.closedMem = null; // { lane, untilS }: a lane marked closed ahead
    // Our best knowledge of the indicator. The percept is 0.1 s old, so a
    // press that toggles the indicator must be remembered or we press twice.
    this.ind = 0;
    this.indPressT = -Infinity;
    this.indPending = null; // what the indicator should be, if a press is queued
    this.mergeCap = null; // closure with no gap: match the neighbouring lane instead
  }

  // ---------------------------------------------------------------- helpers
  hold(name, cond, dt) {
    const v = cond ? (this.mem[name] || 0) + dt : 0;
    this.mem[name] = v;
    return v;
  }

  press(code, shift = false) {
    if (this.pressCd > 0) return false;
    this.presses.push({ code, shift });
    this.pressCd = 0.25; // the keyboard has no auto-repeat for these
    return true;
  }

  setState(to, why) {
    if (to === this.state) return;
    this.trace.push({ t: Math.round(this.time * 10) / 10, from: this.state, to, why });
    this.state = to;
  }

  myLane(p) {
    return clamp(p.self.lane, 0, p.self.lanes - 1);
  }

  /** Indicator on in direction dir, without ever toggling the wrong way. */
  signal(dir) {
    if (this.ind === dir && this.indPending == null) return;
    this.indPending = dir;
    this.flushIndicator();
  }

  clearIndicator() {
    this.signal(0);
  }

  /** Apply a queued indicator press as soon as the press limiter allows. */
  flushIndicator() {
    if (this.indPending == null) return;
    if (this.ind === this.indPending) {
      this.indPending = null;
      return;
    }
    const want = this.indPending;
    // turning off uses the key of the indicator that is on, not the one wanted
    const keyDir = want === 0 ? this.ind : want;
    if (!this.press(keyDir < 0 ? 'KeyQ' : 'KeyE')) return;
    this.ind = want;
    this.indPressT = this.time;
    this.indPending = null;
  }

  roadTarget(p) {
    return clamp(Math.round(p.signs.limitKmh + this.profile.setOverKmh), 30, 200);
  }

  /** A car is drifting or signalling into lane `to`. */
  entering(c, to) {
    if (c.lane === to || Math.abs(c.lane - to) !== 1) return false;
    if (c.ind !== 0) return c.ind === (to > c.lane ? -1 : 1);
    if (c.drift !== 0) return c.drift === (to > c.lane ? -1 : 1);
    return false;
  }

  /** Is there a freshly seen car in the target lane (don't move blind)? */
  freshIn(p, lane) {
    return p.cars.some((c) => (c.lanesOcc.includes(lane) || c.lane === lane) && c.seenAge < 0.5);
  }

  /** Gap acceptance for moving into `lane`. */
  gapAccepted(p, lane, { leadS = this.profile.acceptLeadS, lagS = this.profile.acceptLagS, relaxed = false } = {}) {
    const s = p.self;
    const lv = p.lanes[lane];
    if (!lv) return false;
    if (this.freshIn(p, lane)) return false;
    const ahead = lv.ahead;
    const behind = lv.behind;
    const leadGap = ahead ? ahead.gap : Infinity;
    if (relaxed) {
      // merging late at a closure: everyone in the closed lane is looking for
      // the same gap, so other merges into this lane must not block us; only a
      // real distance/time gap does
      if (leadGap < Math.max(8, 0.3 * s.v)) return false;
      if (behind && behind.gap < Math.max(8, 0.3 * Math.max(behind.kmh * KMH, 1))) return false;
      return true;
    }
    if (p.cars.some((c) => Math.abs(c.dl) <= 40 && this.entering(c, lane))) return false;
    if (leadGap < Math.max(15, leadS * s.v)) return false;
    if (behind) {
      const lagV = Math.max(behind.kmh * KMH, 1);
      if (behind.gap < Math.max(10, lagS * lagV)) return false;
      if (behind.ttc < this.profile.minLagTtc) return false;
    }
    return true;
  }

  /** Keep-right / return-right safety, from the spec's two conditions. */
  returnOk(p, lane) {
    const s = p.self;
    const lv = p.lanes[lane];
    if (!lv) return false;
    if (this.freshIn(p, lane)) return false;
    const behind = lv.behind;
    if (behind && (behind.gap < Math.max(15, 1.0 * s.v) || behind.ttc < 3)) return false;
    const ahead = lv.ahead;
    if (ahead) {
      // catch it within 8 s at the closing speed, not 8 s at our own speed:
      // otherwise a truck 200 m up the right lane would keep us out of it all day
      const closing = Math.max(0.5, (s.kmh - ahead.kmh) * KMH);
      const slow = ahead.kmh <= s.kmh - 8 && ahead.gap / closing <= 8;
      if (slow) return false;
    }
    return true;
  }

  /** Keep a closed-lane memory from the first sign until well past the works. */
  noteClosedLane(p, dt) {
    const s = p.self;
    const faces = [p.signs.cur, p.signs.next].filter(Boolean);
    for (let lane = 0; lane < s.lanes; lane++) {
      const marked = faces.some((f) => f[lane] === 'x' || f[lane] === 'arrowL' || f[lane] === 'arrowR');
      if (marked) this.closedMem = { lane, untilS: Math.max(this.closedMem && this.closedMem.lane === lane ? this.closedMem.untilS : 0, s.s + 2500) };
    }
    for (const o of p.obstacles) this.closedMem = { lane: o.lane, untilS: Math.max(this.closedMem && this.closedMem.lane === o.lane ? this.closedMem.untilS : 0, s.s + Math.max(400, (o.len || 500) + 300)) };
    if (this.closedMem && s.s > this.closedMem.untilS) this.closedMem = null;
  }

  laneClosed(lane, sNow) {
    return !!this.closedMem && this.closedMem.lane === lane && sNow < this.closedMem.untilS;
  }

  /** A closure in my lane: obstacle, red cross or a diagonal arrow. */
  closureThreat(p) {
    const lane = this.myLane(p);
    const obs = p.obstacles.find((o) => o.lane === lane && o.dAhead > -5) || null;
    const faces = [p.signs.next, p.signs.cur].filter(Boolean).map((f) => f[lane]);
    const red = faces.some((f) => f === 'x' || f === 'arrowL' || f === 'arrowR');
    if (!obs && !red) return null;
    return { lane, dAhead: obs ? obs.dAhead : null, red };
  }

  /** Nearest car ahead in the lane we are driving in (or into), plus closures. */
  leader(p) {
    const lane = clamp(this.laneTarget ?? this.myLane(p), 0, p.self.lanes - 1);
    const lv = p.lanes[lane];
    let best = lv && lv.ahead ? lv.ahead : null;
    for (const o of p.obstacles) {
      if (o.lane !== lane || o.dAhead < -7) continue;
      const g = Math.max(0, o.dAhead - PLAYER_HALF_LEN);
      if (!best || g < best.gap) {
        best = { gap: g, kmh: 0, ttc: g / Math.max(p.self.v, 0.1), tgap: g / Math.max(p.self.v, 1), id: null, obstacle: true, len: 6.5 };
      }
    }
    return best;
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
    // adopt what the game says the indicator is doing, once our own press has
    // had time to land (a completed move makes the game cancel it for us)
    if (this.time - this.indPressT > 0.3 && p.self.ind !== this.ind) this.ind = p.self.ind;
    this.flushIndicator();

    const s = p.self;
    const prof = this.profile;
    const lane = this.myLane(p);
    if (this.laneTarget == null) this.laneTarget = lane;
    this.laneTarget = clamp(this.laneTarget, 0, s.lanes - 1);

    // ---------- remember a lane a red cross / arrow has marked closed
    this.noteClosedLane(p, dt);

    // ---------- lateral decisions and the lane-change machine
    this.runLaneChange(p, dt);
    this.runPassing(p, dt);
    this.mergeCap = this.closureCap(p);
    this.chooseLane(p, dt);

    // ---------- longitudinal: what speed do we want, and who is in the way?
    const roadTarget = this.roadTarget(p);
    let want = roadTarget;
    if (this.mergeCap != null) want = Math.min(want, this.mergeCap);
    // no undertaking above 55 km/h: a slower car to the left caps our speed
    if (lane < s.lanes - 1 && s.kmh > 55) {
      const left = p.lanes[lane + 1] ? p.lanes[lane + 1].ahead : null;
      if (left && left.dl < 180 && left.kmh < s.kmh - 1) want = Math.min(want, Math.max(55, left.kmh - 1));
    }

    const lead = this.leader(p);
    const emergency = this.hold('emergency', !!lead && lead.gap > 0 && (lead.ttc < 3.0 || lead.tgap < 0.5), dt) >= 0.15;
    const tooClose = !!lead && lead.gap < Math.max(2, s.v * 0.35) && lead.kmh * KMH < s.v;
    // Closing up on the car we are about to pass is not "traffic-limited": if we
    // clicked the set speed down to its speed we would never reach a gap.
    const own = p.lanes[lane] ? p.lanes[lane].ahead : null;
    const overtakeIntent = this.lc
      ? this.lc.why === 'overtake'
      : !!own && lane < s.lanes - 1 && own.kmh <= roadTarget - prof.overtakeKmh;
    let idm = false;
    if (lead && lead.kmh < roadTarget - 0.5) {
      const a = idmAcc(s.v, roadTarget * KMH, lead, prof);
      idm = true;
      if (!overtakeIntent) {
        // Cruise control does the steady following: click its set speed down
        // toward the car ahead (the calibration drive used cruise 88% of the
        // time). The pedals take over when the gap is actually closing.
        want = clamp(Math.round(lead.kmh), 30, 200);
      }
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

    // Lane-change states own the state while a manoeuvre runs (braking still
    // happens through the keys); otherwise report the longitudinal mode.
    if (!['PREP', 'MOVE', 'ABORT', 'SETTLE', 'PASSING'].includes(this.state)) {
      if (emergency) this.setState('EMERGENCY', lead ? `ttc ${lead.ttc.toFixed(1)} tgap ${lead.tgap.toFixed(2)}` : 'hazard');
      else if (idm && lead) this.setState('FOLLOW', `leader ${Math.round(lead.kmh)} km/h, gap ${lead.gap.toFixed(0)} m`);
      else this.setState('CRUISE', 'clear');
    }

    // ---------- cruise control (C / R / ±1 / ±5 only)
    // Braking is what switches cruise off, as for a human; as long as the bot
    // is not braking, it keeps the set speed clicking to what traffic allows.
    this.idmMode = idm && !s.cc.on;
    if (!this.keys.brake) this.cruise(p, want);

    // ---------- lateral: steer for the lane we chose
    const tight = this.state === 'MOVE' || this.state === 'ABORT' || this.state === 'SETTLE';
    this.steerTo(p, laneLat(this.laneTarget), tight ? 0.1 : LANE_KEEP_M);

    // ---------- flash at a left-lane dawdler
    this.runFlash(p, dt);

    return { keys: this.keys, presses: this.presses };
  }

  // ---------------------------------------------------------------- lane changes
  startPrep(p, to, why, passingId = null) {
    const lane = this.myLane(p);
    if (to === lane) return;
    const dir = to > lane ? -1 : 1; // higher lane index is to the LEFT
    this.lc = { from: lane, to, dir, why, signalT: 0, started: false, startLat: p.self.lat, aborted: false };
    this.passCandidate = why === 'overtake' ? passingId : null;
    this.setState('PREP', `${why} ${lane}→${to}`);
    this.signal(dir);
  }

  /** The passed car is clear: hand back to the keep-right rule. */
  runPassing(p, dt) {
    if (this.state !== 'PASSING') return;
    const s = p.self;
    this.passingT += dt;
    let clear = this.passingId == null;
    if (!clear) {
      const car = p.cars.find((c) => c.id === this.passingId);
      clear = !car || (car.dl < 0 && -car.dl >= Math.max(15, 1.0 * s.v));
    }
    // If the lane we pulled into is itself held up, we are not passing anyone:
    // hand back so the keep-right rule can put us behind the car we tried to pass.
    if (!clear) {
      const own = p.lanes[this.myLane(p)] ? p.lanes[this.myLane(p)].ahead : null;
      if (own && own.gap < 150 && own.kmh < s.kmh - 2) clear = true;
      // hanging out on the left forever is worse than returning behind it
      if (this.passingT > 12) clear = true;
    }
    if (clear) this.setState('CRUISE', 'clear of the car we passed');
  }

  /** Without an accepted gap at a closure, slow to the neighbouring lane's pace. */
  closureCap(p) {
    if (this.lc) return null;
    const threat = this.closureThreat(p);
    if (!threat) return null;
    const lane = this.myLane(p);
    const options = [lane + 1, lane - 1].filter((l) => l >= 0 && l < p.self.lanes && !this.closedLane(p, l));
    if (!options.length) return null;
    if (options.some((l) => this.gapAccepted(p, l))) return null;
    const speeds = options.map((l) => (p.lanes[l] && p.lanes[l].ahead ? p.lanes[l].ahead.kmh : null)).filter((x) => x != null);
    return speeds.length ? Math.max(30, Math.min(...speeds) - 2) : 40;
  }

  giveUp(p, why) {
    if (this.lc) this.clearIndicator();
    this.lc = null;
    this.laneTarget = this.myLane(p);
    this.lcCd = this.profile.backoffS;
    this.setState('CRUISE', why);
  }

  runLaneChange(p, dt) {
    const prof = this.profile;
    const s = p.self;
    if (!this.lc) {
      this.mergeCap = null;
      if (this.state === 'SETTLE') {
        // wait one second for the game's own indicator cancel, then switch it off
        this.settleT -= dt;
        if (this.settleT <= 0) {
          this.clearIndicator();
          this.laneTarget = this.myLane(p);
          if (this.passCandidate != null) {
            this.passingId = this.passCandidate;
            this.passCandidate = null;
            this.passingT = 0;
            this.setState('PASSING', `clear of ${this.passingId}`);
          } else {
            this.setState('CRUISE', 'settled');
          }
          this.lcCd = Math.max(this.lcCd, 0.8);
        }
      }
      return;
    }
    const lc = this.lc;

    if (this.state === 'PREP') {
      lc.signalT += dt;
      // keep the indicator alive (the game cancels it once a move completes)
      if (this.ind !== lc.dir) this.signal(lc.dir);
      // A closed lane is a merge, not an overtake: take an ordinary gap early,
      // then a tighter one once the queue is alongside (merge late).
      const relaxed = lc.why === 'closure';
      const accepted = this.gapAccepted(p, lc.to, { relaxed });
      const threat = this.closureThreat(p);
      const obstacleNow = threat && threat.dAhead != null ? threat.dAhead : Infinity;
      if (accepted && lc.signalT >= prof.signalS - SIGNAL_LEAD_S && !(lc.why === 'closure' && obstacleNow < 45)) {
        lc.started = true;
        lc.startLat = s.lat;
        this.laneTarget = lc.to;
        this.setState('MOVE', `${lc.why} ${lc.from}→${lc.to}`);
      } else if (
        lc.why === 'closure'
          ? obstacleNow < 45
          : lc.signalT >= Math.min(prof.giveUpS, prof.signalS + 1.0)
      ) {
        // An indicator on much longer than the signal itself is a promise not
        // kept (and a lane-change-start outside 2.5-4 s): give up and go home.
        // A closed lane has nowhere to go back to, so keep signalling and keep
        // trying until the arrow truck is right there.
        this.giveUp(p, lc.why === 'closure' ? 'closed lane, no gap' : 'no gap');
      }
      return;
    }

    if (this.state === 'MOVE') {
      const targetLat = laneLat(lc.to);
      const fromLat = laneLat(lc.from);
      const span = Math.abs(targetLat - fromLat) || 1;
      const progress = Math.min(1, Math.abs(s.lat - lc.startLat) / span);
      // the gap closing at the last moment: back out if we have not committed
      const lv = p.lanes[lc.to];
      const ahead = lv ? lv.ahead : null;
      const behind = lv ? lv.behind : null;
      const closing = ahead && ahead.kmh < s.kmh - 2 && ahead.gap < Math.max(8, 0.6 * s.v);
      const lagClosing = behind && behind.ttc < 2 && behind.gap < Math.max(8, 0.6 * Math.max(behind.kmh * KMH, 1));
      if ((closing || lagClosing) && progress < 0.5 && !lc.aborted) {
        lc.aborted = true;
        this.laneTarget = lc.from;
        this.setState('ABORT', `${lc.why}: gap closed at ${(progress * 100) | 0}%`);
        return;
      }
      if (Math.abs(s.lat - targetLat) < CENTRE_M && Math.abs(s.headingErr) < HEADING_EPS) {
        this.settleT = 1.0;
        this.setState('SETTLE', `centred in ${lc.to}`);
        this.lc = null;
      }
      return;
    }

    if (this.state === 'ABORT') {
      const fromLat = laneLat(lc.from);
      if (Math.abs(s.lat - fromLat) < CENTRE_M && Math.abs(s.headingErr) < HEADING_EPS) {
        this.settleT = 0.6;
        this.setState('SETTLE', 'back in lane');
        this.lc = null;
        this.lcCd = 1.2;
      }
    }
  }

  chooseLane(p, dt) {
    const s = p.self;
    const prof = this.profile;
    const lane = this.myLane(p);
    if (this.lc || this.lcCd > 0 || this.state === 'SETTLE' || this.state === 'PASSING' || this.state === 'ABORT') return;
    const roadTarget = this.roadTarget(p);

    // 1. a closure in our lane: get out, even if the gap is not generous
    const threat = this.closureThreat(p);
    if (threat) {
      this.hold('threat', true, dt);
      if (this.mem.threat < prof.react) return;
      const options = [lane + 1, lane - 1].filter((l) => l >= 0 && l < s.lanes && !this.closedLane(p, l) && !this.laneClosed(l, s.s));
      const scored = options
        .map((l) => ({ l, ok: this.gapAccepted(p, l), free: p.lanes[l] ? p.lanes[l].freeAheadM : 0 }))
        .sort((a, b) => b.ok - a.ok || b.free - a.free);
      if (scored.length) {
        this.startPrep(p, scored[0].l, 'closure');
        return;
      }
      return;
    }
    this.hold('threat', false, dt);

    const own = p.lanes[lane] ? p.lanes[lane].ahead : null;
    // 2. overtake a car that is clearly slower than our target
    const leftmostExtra = lane + 1 === s.lanes - 1 ? 7 : 0; // don't hog the far left
    if (own && lane < s.lanes - 1 && !this.laneClosed(lane + 1, s.s) && own.dl <= 100 && own.kmh <= roadTarget - prof.overtakeKmh - leftmostExtra) {
      const lv = p.lanes[lane + 1];
      const leadOut = lv ? lv.ahead : null;
      // pulling out behind something even slower gains nothing; only pass when
      // the lane we move into actually lets us go faster for a while
      const gain = !leadOut || leadOut.kmh >= s.kmh + 1 || leadOut.gap > own.dl + Math.max(80, s.v * 5);
      const ok = gain && this.gapAccepted(p, lane + 1);
      if (ok && this.hold('overtake', true, dt) >= prof.react && !this.uncertain(p)) {
        this.startPrep(p, lane + 1, 'overtake', own.id);
        return;
      }
    } else {
      this.hold('overtake', false, dt);
    }

    // 3. keep right / return to the home lane after passing
    if (lane > prof.homeLane) {
      const right = lane - 1;
      const ok = !this.laneClosed(right, s.s) && this.returnOk(p, right);
      if (ok && this.hold('return', true, dt) >= prof.react) {
        this.startPrep(p, right, 'keep-right');
        return;
      }
      if (!ok) this.hold('return', false, dt);
    } else {
      this.hold('return', false, dt);
    }
  }

  closedLane(p, lane) {
    return p.obstacles.some((o) => o.lane === lane && o.dAhead > -5);
  }

  uncertain(p) {
    const lane = this.myLane(p);
    return p.cars.some((c) => c.seenAge < 0.5 && (c.lanesOcc.includes(lane) || Math.abs(c.lane - lane) <= 1) && Math.abs(c.dl) < 120);
  }

  // ---------------------------------------------------------------- flash
  runFlash(p, dt) {
    const prof = this.profile;
    const s = p.self;
    const lane = this.myLane(p);
    if (!Number.isFinite(prof.flashAfterS) || lane === 0) {
      this.blockedId = null;
      this.blockedT = 0;
      return;
    }
    const lead = p.lanes[lane] ? p.lanes[lane].ahead : null;
    // "held up", not "still faster right now": once we have clicked down to its
    // speed we are still stuck behind it
    const blocked = lead && lead.gap < 100 && lead.kmh <= this.roadTarget(p) - CONFIG.moments.dawdlerKmh;
    if (!blocked) {
      this.blockedId = null;
      this.blockedT = 0;
      return;
    }
    if (this.blockedId !== lead.id) {
      this.blockedId = lead.id;
      this.blockedT = 0;
    } else {
      this.blockedT += dt;
    }
    const rightFree = !p.lanes[lane - 1] || !p.lanes[lane - 1].ahead || p.lanes[lane - 1].ahead.gap > 60;
    const used = this.flashCount.get(lead.id) || 0;
    if (!rightFree || this.blockedT < prof.flashAfterS || this.flashCd > 0 || used >= 2) return;
    this.flashCount.set(lead.id, used + 1);
    this.flashCd = 15;
    this.flashHold = 0.3;
  }

  // ---------------------------------------------------------------- control
  /** Bang-bang steering on the predicted settle position. */
  steerTo(p, targetLat, tol) {
    const s = p.self;
    const pred = s.lat - (s.v * Math.sin(s.headingErr)) / STEER_SETTLE_RATE;
    const err = targetLat - pred;
    if (err > tol) this.keys.right = true;
    else if (err < -tol) this.keys.left = true;
    if (this.flashHold > 0) this.keys.flash = true;
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
