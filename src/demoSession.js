// One staged behaviour demo, stepped by the real traffic model. The persona
// rig draws it and tools/personas.js runs it headless; both come through here,
// so the captions the rig shows are the same conditions the test checks.
//
// The screen only adds visuals: this module owns the traffic instance, the
// fixed 1/60 s clock, the detected captions, the live readout and the
// expectation. No scripted timestamps live in a demo.
import { Traffic, leaderIn, gapBetween } from './traffic.js';
import { applyScenario } from './scenarios.js';
import { CONFIG, DEFAULTS } from './config.js';
import { VARIANTS } from './variants.js';
import { laneLat } from './layout.js';
import { KMH, clamp } from './util.js';

export const DEMO_DT = 1 / 60;
const FREEZE = 0.9; // s held at the end of a loop before it starts again
const FADE_OUT = 0.45; // s the freeze fades to black
const FADE_IN = 0.35; // s after the restart before the picture is back
const MAX_FRAME_DT = 0.12;

// Demos describe the persona, not the player's menu. These knobs are the ones
// the traffic model reads while deciding; restoring them afterwards keeps the
// world's settings intact. (The rig is a stage, so it uses the defaults.)
const STANDARD_KEYS = [
  'speeders',
  'nightSpeeders',
  'slowpokes',
  'middleLaneHoggers',
  'normalOffsetKmh',
  'speedSpreadKmh',
  'truckSpeedKmh',
  'truckOvertakeEagerness',
  'politeness',
  'anticipation',
  'telegraph',
  'archetypes',
  'reactionTime',
  'brakeLightRead',
  'passBoostKmh',
  'moveOver',
  'speedGain',
  'coolness',
];

function withStandardConfig(fn) {
  const saved = STANDARD_KEYS.map((k) => [k, CONFIG[k]]);
  for (const k of STANDARD_KEYS) CONFIG[k] = DEFAULTS[k];
  try {
    return fn();
  } finally {
    for (const [k, v] of saved) CONFIG[k] = v;
  }
}

const tagOf = (veh) => (veh ? veh.tag || `#${veh.id}` : null);

export class DemoSession {
  /**
   * @param {object} sc a scenario built by scenarios.buildDemo()
   * @param {object} o
   * @param {string} [o.persona] the star's persona (defaults to the scenario's)
   * @param {string} [o.variant] the selected body style (the viewer's chip)
   * @param {string} [o.signature] the selected lamp signature
   * @param {number} [o.limitKmh]
   * @param {(veh) => void} [o.onAdd] the stage adds a visual
   * @param {(veh) => void} [o.onRemove] the stage takes it back to the pool
   */
  constructor(sc, { persona, variant, signature, limitKmh = 100, onAdd = null, onRemove = null } = {}) {
    this.sc = sc;
    this.persona = persona || sc.demo.persona;
    this.variant = variant && VARIANTS[variant] ? variant : null;
    this.signature = signature || null;
    this.limitKmh = limitKmh;
    this.onAdd = onAdd;
    this.onRemove = onRemove;
    this.speed = 1;
    this.paused = false;
    this.clock = 0;
    this.acc = 0;
    this.phase = 'play';
    this.phaseT = 0;
    this.traffic = null;
    this.collisions = new Set();
    this.reset();
  }

  get starTag() {
    return this.sc.demo.star;
  }

  get lanes() {
    return this.sc.lanes;
  }

  get duration() {
    return this.sc.demo.seconds;
  }

  get title() {
    return this.sc.title;
  }

  get about() {
    return this.sc.about;
  }

  /** Remove every visual the session owns (through the stage's pool). */
  dispose() {
    if (this.traffic) {
      for (const v of [...this.traffic.vehicles]) this.onRemove?.(v);
      this.traffic.vehicles.length = 0;
    }
    this.traffic = null;
    this.star = null;
  }

  // ---------------------------------------------------------------- run
  reset() {
    this.dispose();
    const sc = this.sc;
    // The viewer's body chip wins over the demo's default body. Only the star
    // is repainted; its length change moves the staged gaps by a few cm.
    const vehicles = this.variant
      ? sc.vehicles.map((s) => (s.tag === sc.demo.star ? { ...s, variant: this.variant, type: VARIANTS[this.variant].type } : s))
      : sc.vehicles;
    const run = { ...sc, vehicles };
    withStandardConfig(() => {
      this.traffic = new Traffic({
        dir: 1,
        density: 0,
        ahead: 900,
        behind: 900,
        seed: 1,
        limitKmh: this.limitKmh,
        lanes: sc.lanes,
        spawnBehind: false,
        onAdd: (v) => this.onAdd?.(v),
        onRemove: (v) => this.onRemove?.(v),
      });
      applyScenario(this.traffic, run, 0);
      for (const v of this.traffic.vehicles) v.Tbase = v.T;
    });
    this.star = this.traffic.vehicles.find((v) => v.tag === this.starTag) || null;
    if (!this.star) throw new Error(`demo ${sc.title} has no star vehicle`);
    // A demo can ask for a settled pair: the star at its own wanted speed and
    // the lead car holding the same speed, so the reaction timing is about the
    // reaction and not about the star still accelerating.
    if (sc.demo.settleLead) {
      const lead = this.traffic.vehicles.find((v) => v.tag === sc.demo.settleLead);
      this.star.v = this.star.v0base;
      if (lead) {
        if (lead.type === 'car' || lead.type === 'van') lead.limitOffset = this.star.v0base / KMH - this.limitKmh;
        else lead.ownMax = this.star.v0base / KMH;
        this.traffic.applyLimit(lead);
        lead.v0 = lead.v0base;
        lead.v = this.star.v0base;
      }
    }
    const N = this.traffic.N;
    this.centerLat = (laneLat(0, N) + laneLat(N - 1, N)) / 2;
    this.t = 0;
    this.acc = 0;
    this.phase = 'play';
    this.phaseT = 0;
    this.records = new Map();
    this.fired = new Set();
    this.firedLog = [];
    this.firedGroups = new Map();
    this.queue = [];
    this.caption = null;
    this.captionT = 0;
    this.collisions = new Set();
    for (const v of this.traffic.vehicles) this._record(v, true);
  }

  /** Restart the loop now (R). */
  restart() {
    this.reset();
    this.paused = false;
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  /** 1×, 0.5× or 0.25×; telegraphing is invisible at 1×. */
  setSpeed(x) {
    this.speed = x;
  }

  /**
   * Advance by a real frame. Fixed sim steps make the screen and the headless
   * test agree; the loop freeze and fade run in real time.
   */
  step(dtReal) {
    if (this.paused) return;
    const dt = clamp(dtReal, 0, MAX_FRAME_DT);
    this.clock += dt;
    if (this.phase === 'play') {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= DEMO_DT && n < 24) {
        this._step(DEMO_DT);
        this.acc -= DEMO_DT;
        n++;
        if (this.phase !== 'play') break;
      }
    } else if (this.phase === 'freeze') {
      this.phaseT += dt;
      if (this.phaseT >= FREEZE) {
        this.reset();
        this.phase = 'in';
        this.phaseT = 0;
      }
    } else if (this.phase === 'in') {
      this.phaseT += dt;
      if (this.phaseT >= FADE_IN) {
        this.phase = 'play';
        this.phaseT = 0;
      }
    }
    this._tickCaption(dt);
  }

  /** Headless: one loop at the fixed step, no freeze or fades. */
  runHeadless(maxSeconds = 120) {
    let n = 0;
    while (this.phase === 'play' && n < maxSeconds / DEMO_DT) {
      this._step(DEMO_DT);
      n++;
    }
    return this.check();
  }

  _step(h) {
    withStandardConfig(() => this.traffic.step(h, this.star.u, null));
    this.t += h;
    for (const v of this.traffic.vehicles) this._record(v, false);
    this._collisions();
    this._fireCaptions();
    if (this.t >= this.duration) {
      this.phase = 'freeze';
      this.phaseT = 0;
    }
  }

  // ---------------------------------------------------------------- records
  _record(v, init) {
    const tag = tagOf(v);
    if (!tag) return;
    let r = this.records.get(tag);
    if (!r) {
      r = {
        tag,
        laneStart: v.lane,
        lane: v.lane,
        firstBrakeT: null,
        firstIndicatorT: null,
        firstIntentT: null,
        firstMoveT: null,
        firstMoveEndT: null,
        moveStartT: null,
        moveCount: 0,
        movedLeft: false,
        movedRight: false,
        wasMoving: false,
        minT: v.T,
        minAcc: 0,
        minGapT: Infinity,
        draftingT: null,
        anticOnT: null,
        anticOnTag: null,
        passedStarT: null,
        behindStar: v.u <= this.star.u,
        lastIndicator: v.indicator,
      };
      this.records.set(tag, r);
    }
    r.lane = v.lane;
    if (r.behindStar && v.u > this.star.u) {
      r.passedStarT = this.t;
      r.behindStar = false;
    }
    if (v.acc < -1.0 && r.firstBrakeT == null) r.firstBrakeT = this.t;
    if (v.acc < r.minAcc) r.minAcc = v.acc;
    if (v.T < r.minT) r.minT = v.T;
    if (v.indicator !== 0 && v.indicator !== r.lastIndicator && r.firstIndicatorT == null) r.firstIndicatorT = this.t;
    r.lastIndicator = v.indicator;
    if (v.intent >= 0 && v.intent !== v.lane && r.firstIntentT == null) r.firstIntentT = this.t;
    if (v.state === 'move') {
      if (!r.wasMoving) {
        r.moveCount++;
        if (r.firstMoveT == null) {
          r.firstMoveT = this.t;
          r.moveStartT = this.t;
        }
        if (v.targetLane < v.lane) r.movedRight = true;
        if (v.targetLane > v.lane) r.movedLeft = true;
      }
      r.wasMoving = true;
    } else if (r.wasMoving) {
      r.wasMoving = false;
      if (r.firstMoveEndT == null) r.firstMoveEndT = this.t;
    }
    if (v.drafting && r.draftingT == null) r.draftingT = this.t;
    if (v.anticOn && r.anticOnT == null) {
      r.anticOnT = this.t;
      r.anticOnTag = tagOf(v.anticOn);
    }
    if (!init && v.v > 0.5) {
      const ld = leaderIn(this.traffic.lanes[v.lane], v);
      if (ld) {
        const g = gapBetween(ld, v);
        const t = g / v.v;
        if (t < r.minGapT) r.minGapT = t;
      }
    }
  }

  rec(tag) {
    return this.records.get(tag) || this._blankRecord(tag);
  }

  _blankRecord(tag) {
    return {
      tag,
      firstBrakeT: null,
      firstIndicatorT: null,
      firstIntentT: null,
      firstMoveT: null,
      firstMoveEndT: null,
      moveCount: 0,
      movedLeft: false,
      movedRight: false,
      minT: Infinity,
      minAcc: 0,
      minGapT: Infinity,
      draftingT: null,
      anticOnT: null,
      anticOnTag: null,
      passedStarT: null,
    };
  }

  actor(tag) {
    return this.traffic ? this.traffic.vehicles.find((v) => tagOf(v) === tag) || null : null;
  }

  leader(tag) {
    const v = this.actor(tag);
    if (!v) return null;
    const ld = leaderIn(this.traffic.lanes[v.lane], v);
    if (!ld) return null;
    return { veh: ld, gap: gapBetween(ld, v) };
  }

  // ---------------------------------------------------------------- collisions
  _collisions() {
    for (const list of this.traffic.lanes) {
      for (let i = 1; i < list.length; i++) {
        const behind = list[i - 1];
        const ahead = list[i];
        if (behind === ahead || behind.isObstacle || ahead.isObstacle) continue;
        const half = (behind.width + ahead.width) / 2 - 0.25;
        if (Math.abs(behind.latLocal - ahead.latLocal) > half) continue;
        if (gapBetween(ahead, behind) < -0.15) {
          const key = `${tagOf(behind)}>${tagOf(ahead)}`;
          if (!this.collisions.has(key)) {
            this.collisions.add(key);
            this.collisionLog = (this.collisionLog || []).concat(`${this.t.toFixed(1)}s ${key}`);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- captions
  ctx() {
    return {
      t: this.t,
      star: this.star,
      traffic: this.traffic,
      spec: this.sc && this.sc.demo ? this.sc.demo : null,
      limit: this.limitKmh,
      rec: (tag) => this.rec(tag),
      actor: (tag) => this.actor(tag),
      leader: (tag) => this.leader(tag),
    };
  }

  _fireCaptions() {
    const captions = this.sc.demo.captions || [];
    const ctx = this.ctx();
    for (let i = 0; i < captions.length; i++) {
      if (this.fired.has(i)) continue;
      const c = captions[i];
      let hit = false;
      try {
        hit = !!c.when(ctx);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      this.fired.add(i);
      if (c.group) {
        if (!this.firedGroups.has(c.group)) this.firedGroups.set(c.group, new Set());
        this.firedGroups.get(c.group).add(i);
      }
      const text = typeof c.text === 'function' ? c.text(ctx) : c.text;
      this.queue.push({ text, hold: c.hold ?? 3 });
      this.firedLog.push({ index: i, t: this.t, text });
    }
  }

  _tickCaption(dt) {
    if (this.caption) {
      this.captionT -= dt;
      if (this.captionT > 0) return;
      this.caption = null;
    }
    if (this.queue.length) {
      const c = this.queue.shift();
      this.caption = c.text;
      this.captionT = c.hold;
    }
  }

  get captionText() {
    return this.caption;
  }

  get fade() {
    if (this.phase === 'freeze') return Math.min(1, this.phaseT / FADE_OUT);
    if (this.phase === 'in') return Math.max(0, 1 - (this.phaseT || 0) / FADE_IN);
    return 0;
  }

  // ---------------------------------------------------------------- readout + check
  get readout() {
    const s = this.star;
    if (!s) return null;
    return {
      offset: s.v0base / KMH - this.limitKmh,
      kmh: s.v / KMH,
      T: s.T,
      Tbase: s.Tbase ?? s.T,
      p: s.p,
      tSafe: s.tSafe,
      press: s.press,
      drafting: !!s.drafting,
      trait: this.sc.demo.trait,
    };
  }

  /** What the captions and expectation say about this run (for the test). */
  check() {
    const captions = this.sc.demo.captions || [];
    const missed = [];
    for (let i = 0; i < captions.length; i++) if (!this.fired.has(i)) missed.push(i);
    const groups = new Map();
    for (const c of captions) if (c.group) groups.set(c.group, (groups.get(c.group) || 0) + 1);
    const missedGroups = [...groups.keys()].filter((g) => !this.firedGroups.has(g));
    const exp = this.sc.demo.expect;
    let ok = false;
    let error = null;
    if (exp && typeof exp.test === 'function') {
      try {
        ok = !!exp.test(this.ctx());
      } catch (e) {
        error = e.message;
      }
    }
    return {
      title: this.title,
      trait: this.sc.demo.trait,
      seconds: this.t,
      captions: this.firedLog,
      missed,
      missedGroups,
      collisions: [...this.collisions],
      expect: { label: exp?.label || 'no expectation', ok, error },
    };
  }
}
