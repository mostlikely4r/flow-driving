// Proefrit (F-37): one drive journal for every drive, in the browser or headless.
//
// The point of this file is that a human drive and a bot drive produce the same
// recording, so `moments.js` and `tools/report.js` can read them the same way and
// two reports can be compared line by line.
//
// Rendering-free on purpose: no Three.js, no DOM. It runs in Node as-is.
//
// Format: one JSON object. Time series are columns (one array per field, so a
// sample is an index into each array), not one object per sample. Vehicles are
// stored per sample as compact rows [id, dl, off, kmh, indicator, lane] plus a
// `meta` table by id; `dl` is the distance ahead of you in metres (negative =
// behind), `off` is the lateral offset from the centre of the vehicle's lane.
import { CONFIG, DEFAULTS } from './config.js';
import { KMH } from './util.js';
import { laneLat } from './layout.js';

export const JOURNAL_VERSION = 1;
export const JOURNAL_HZ = 2; // samples per second of driving time
const BACK_M = 200; // record vehicles this far behind you (wider than pop-in's 150 m)
const AHEAD_M = 320; // ...and this far ahead
const MAX_VEH = 20; // nearest vehicles per sample; everything within 170 m is kept
const NEAR_M = 170; // ...so the pop-in detector never mistakes the cap for a spawn

const COMMIT = typeof __GIT_COMMIT__ === 'string' ? __GIT_COMMIT__ : null;

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/** Difference between the running config and the shipped defaults (header). */
function configDiff() {
  const out = {};
  for (const [k, v] of Object.entries(CONFIG)) {
    const d = DEFAULTS[k];
    if (typeof v === 'object' && v !== null) {
      if (JSON.stringify(v) !== JSON.stringify(d)) out[k] = v;
    } else if (v !== d) out[k] = v;
  }
  return out;
}

export class Journal {
  constructor() {
    this.data = null;
    this.active = false;
    this.done = false;
    this.t = 0;
    this.lastS = 0;
    this.startS = 0;
    this.lastSampleT = 0;
    this.plLane = 0;
    this.plInd = 0;
    this.fpsN = 0;
    this.fpsSum = 0;
  }

  /** Begin a drive. `answer` and the header describe who drove and how. */
  start(opts = {}) {
    const {
      kind = 'human',
      driver = 'human',
      profile = null,
      seed = CONFIG.seed,
      scenario = null,
      timeOfDay = CONFIG.timeOfDay,
      limitKmh = null,
      playerLen = 4.8,
      player,
      notes = null,
      recordFps = true,
      commit = COMMIT,
    } = opts;
    this.data = {
      version: JOURNAL_VERSION,
      header: {
        kind, // 'human' | 'bot'
        driver, // 'human' or a bot profile name
        profile, // bot profile, null for a human
        commit,
        seed,
        scenario,
        timeOfDay,
        lanes: CONFIG.lanes,
        laneWidth: CONFIG.laneWidth,
        playerLen,
        limitKmh: limitKmh ?? (timeOfDay === 'day' ? CONFIG.speedLimitDay : CONFIG.speedLimitNight),
        startedAt: new Date().toISOString(),
        config: configDiff(),
        moments: { ...CONFIG.moments },
        hasBrake: true, // vehicle rows carry the brake-light flag (v>1)
        notes,
        recordFps,
      },
      meta: {}, // id -> {type, variant, len, width}
      hz: JOURNAL_HZ,
      t: [],
      s: [],
      lane: [],
      lat: [],
      v: [], // km/h
      a: [], // m/s²
      thr: [],
      brk: [],
      steer: [],
      ind: [], // -1 left, +1 right, 0 none
      ccSet: [], // km/h, 0 = no set speed
      ccOn: [], // 0/1
      limit: [], // km/h that applied to you
      veh: [], // per sample: [[id, dl, off, kmh, indicator, lane], ...]
      fps: [], // browser only; the bot cannot feel a stutter
      events: [],
      marks: [],
      answers: null,
      end: null,
    };
    this.active = true;
    this.done = false;
    this.t = 0;
    this.startS = player ? player.s : 0;
    this.lastS = this.startS;
    this.lastSampleT = 0;
    this.plLane = player ? player.lane : 0;
    this.plInd = player ? player.ind : 0;
    this.lc = null; // the lane change currently being made, if any
    this.fpsN = 0;
    this.fpsSum = 0;
    return this;
  }

  /** Advance driving time, note control changes and take a sample every 1/hz s. */
  tick(dt, player, traffic, limitKmh = null) {
    if (!this.active) return;
    this.t += dt;
    this.lastS = player.s;
    if (this.data.header.recordFps !== false) {
      this.fpsN++;
      this.fpsSum += 1 / Math.max(dt, 1e-4);
    }

    // Control changes are events, not samples: they deserve the exact moment.
    if (player.ind !== this.plInd) {
      this.event(player.ind === 0 ? 'signal-end' : 'signal-start', { dir: player.ind });
      this.plInd = player.ind;
    }

    // Lane changes: start when the body actually moves toward the indicated
    // side, end when it settles in the new lane. A change without an indicator
    // is recorded once, when the lane index flips.
    if (player.ind !== 0 && (!this.lc || this.lc.dir !== player.ind)) {
      this.lc = { from: player.lane, dir: player.ind, started: false };
    } else if (player.ind === 0 && this.lc && !this.lc.started) {
      this.lc = null; // signal cancelled without moving
    }
    if (this.lc) {
      const d = player.lat - laneLat(this.lc.from);
      if (!this.lc.started && Math.abs(d) > 0.25 && Math.sign(d) === (this.lc.dir > 0 ? 1 : -1)) {
        this.lc.started = true;
        this.event('lane-change-start', { from: this.lc.from, dir: this.lc.dir });
      }
      if (this.lc.started && player.lane !== this.lc.from && Math.abs(player.lat - laneLat(player.lane)) < 0.35) {
        this.event('lane-change-end', { from: this.lc.from, to: player.lane });
        this.lc = null;
      }
    }
    if (player.lane !== this.plLane) {
      if (!this.lc && player.ind === 0) this.event('lane-change', { from: this.plLane, to: player.lane });
      this.plLane = player.lane;
    }

    if (this.t >= this.lastSampleT + 1 / JOURNAL_HZ || this.data.t.length === 0) {
      this.lastSampleT = this.t;
      this.sampleAt(this.t, player, traffic, limitKmh);
    }
  }

  /** Copy this frame's Player.emit events into the journal. */
  playerEvents(events) {
    if (!this.active) return;
    for (const e of events) this.event(e.type, e);
  }

  event(type, data = {}) {
    if (!this.active) return;
    const { type: _t, ...rest } = data;
    this.data.events.push({ t: r2(this.t), s: r1(this.lastS), type, ...rest });
  }

  sampleAt(t, player, traffic, limitKmh = null) {
    const d = this.data;
    const lat = player.lat;
    d.t.push(r2(t));
    d.s.push(r1(player.s));
    d.lane.push(player.lane);
    d.lat.push(r2(lat));
    d.v.push(r1(player.vAlong / KMH));
    d.a.push(r2(player.acc));
    d.thr.push(r2(player.throttle));
    d.brk.push(r2(player.brake));
    d.steer.push(r2(player.steerVis));
    d.ind.push(player.ind);
    d.ccSet.push(player.cc.has ? player.cc.set : 0);
    d.ccOn.push(player.cc.on ? 1 : 0);
    d.limit.push(limitKmh ?? player.limitKmh ?? playerLimitKmh());
    if (d.header.recordFps !== false) d.fps.push(Math.round(this.fpsSum / Math.max(1, this.fpsN)));
    this.fpsN = 0;
    this.fpsSum = 0;

    const rows = [];
    for (const veh of traffic.vehicles || []) {
      const dl = veh.u - player.s;
      if (dl < -BACK_M || dl > AHEAD_M) continue;
      let m = d.meta[veh.id];
      if (!m) {
        m = d.meta[veh.id] = { type: veh.type, variant: veh.variant || veh.type, len: r1(veh.len), width: r1(veh.width) };
      }
      rows.push([veh.id, Math.round(dl), r2(veh.latLocal - laneLat(veh.lane)), Math.round(veh.v / KMH), veh.indicator | 0, veh.lane, veh.brake ? 1 : 0]);
    }
    rows.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
    // Keep every vehicle inside the near field, then the nearest extras. The
    // pop-in detector promises 150 m, so the cap must never hide a car there.
    let keep = 0;
    while (keep < rows.length && Math.abs(rows[keep][1]) <= NEAR_M) keep++;
    keep = Math.max(MAX_VEH, keep);
    if (rows.length > keep) rows.length = keep;
    d.veh.push(rows);
  }

  /** Drop a mark (F8). Returns it so the caller can toast its time. */
  mark(note = '') {
    if (!this.active) return null;
    const m = { t: r2(this.t), s: r1(this.lastS), note };
    this.data.marks.push(m);
    return m;
  }

  setMarkNote(i, note) {
    const m = this.data && this.data.marks[i];
    if (m) m.note = String(note).slice(0, 200);
  }

  get sampleCount() {
    return this.data ? this.data.t.length : 0;
  }

  get marks() {
    return this.data ? this.data.marks : [];
  }

  /**
   * Close the drive and return the JSON object. Safe to call twice: the second
   * call returns null (e.g. beforeunload after you already ended the drive).
   */
  finish({ answers = null, reason = 'end' } = {}) {
    if (!this.active || !this.data) return null;
    this.active = false;
    this.done = true;
    const d = this.data;
    d.answers = answers;
    d.end = {
      t: r2(this.t),
      s: r1(this.lastS),
      reason,
      endedAt: new Date().toISOString(),
    };
    d.header.duration = r2(this.t);
    d.header.distance = r1(this.lastS - this.startS);
    d.header.samples = d.t.length;
    return d;
  }

  toJSON() {
    return this.data;
  }
}

/** Fallback when the caller did not pass a limit; keeps journal.js DOM-free. */
function playerLimitKmh() {
  return CONFIG.timeOfDay === 'day' ? CONFIG.speedLimitDay : CONFIG.speedLimitNight;
}

// ------------------------------------------------------------------ helpers
/** m:ss, for toasts and reports. */
export function clock(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** File-name stamp in local time: 2026-01-31-17-42-09. */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/**
 * Hand a finished journal to the dev server (`POST /__journal`, see
 * vite.config.js) and fall back to a download when there is no endpoint.
 * Returns the written path, or null when the browser downloaded it instead.
 */
export async function sendJournal(data, name = `proefrit-${stamp()}.json`) {
  const body = JSON.stringify(data);
  if (typeof fetch === 'function' && import.meta.env && import.meta.env.DEV) {
    try {
      const res = await fetch('/__journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      const out = await res.json();
      if (out.ok) return out.path;
    } catch {
      /* no dev server endpoint: download below */
    }
  }
  const blob = new Blob([body], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return null;
}
