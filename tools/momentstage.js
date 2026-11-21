// Proefrit (F-37): the real-sim stage test for the moment detectors.
//
// `tools/momenttest.js` checks a rule against a hand-built journal. This checks
// that the *real sim* feeds the rule the right input: each fixture stages a
// situation, drives it through Road -> Player -> Traffic.step -> Journal ->
// detectMoments, and then asks the detectors what they saw. The detectors read
// only what the journal recorded (brake light, indicator, lane, lateral
// offset), so a fixture passing here means the situation reaches the driver's
// seat, not just the code.
//
// The harness never writes journal rows and never sets veh.indicator,
// veh.brake or veh.lane. It shapes behaviour only through scenario `params`, a
// vehicle's existing `brakeEvent`, and Traffic.beginSignal() -- the same state
// change laneLogic makes -- so holding, moving and cancelling stay real.
//
// Usage:
//   npm run moments:stage                       all fixtures, normal order
//   npm run moments:stage -- only=ES trace      one fixture, journal trace
//   npm run moments:stage -- order=reverse      the same run, reverse order
//   npm run moments:stage -- dump=playtests/stage   write each journal
//
// Exit codes: 0 passed · 1 a FIXTURE or DETECTOR failure · 2 harness error.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { Road } from '../src/road.js';
import { Player } from '../src/player.js';
import { Traffic } from '../src/traffic.js';
import { Journal } from '../src/journal.js';
import { applyScenario } from '../src/scenarios.js';
import { detectMoments, effLane } from '../src/moments.js';
import { checkCase, fmtMoments, report } from './lib/momentcheck.js';

const IDLE = { steer: 0, throttle: 0, brake: 0, analog: false };
const DT = 1 / 32; // exact in binary: a journal sample lands exactly every 16 frames
const LIMIT = 100;
const SNAPSHOT = structuredClone(DEFAULTS);

/** Something is wrong with the harness itself, not with a fixture (exit 2). */
class HarnessError extends Error {}

// ------------------------------------------------------------------- args
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)];
  }),
);
const TRACE = !!args.trace;
const DUMP = typeof args.dump === 'string' ? args.dump : null;

// ------------------------------------------------------------------ config
/** Put CONFIG back exactly as shipped, and drop keys a fixture may have added. */
function restoreDefaults() {
  for (const k of Object.keys(CONFIG)) if (!(k in SNAPSHOT)) delete CONFIG[k];
  for (const [k, v] of Object.entries(SNAPSHOT)) CONFIG[k] = structuredClone(v);
}

/** The check the spec asks for before every fixture: nothing can have leaked. */
function assertConfigIsDefaults(where) {
  const a = JSON.stringify(CONFIG);
  const b = JSON.stringify(DEFAULTS);
  if (a !== b) {
    const keys = [...new Set([...Object.keys(CONFIG), ...Object.keys(DEFAULTS)])].filter(
      (k) => JSON.stringify(CONFIG[k]) !== JSON.stringify(DEFAULTS[k]),
    );
    throw new HarnessError(`CONFIG is not DEFAULTS ${where}: ${keys.join(', ')} differ`);
  }
}

// -------------------------------------------------------------- the harness
/**
 * Drive one fixture through the real sim and return what the detectors saw.
 * Everything is built fresh; `applyScenario` reseeds the traffic generator, so
 * the run depends only on the fixture.
 */
function runFixture(fx) {
  restoreDefaults();
  assertConfigIsDefaults(`before ${fx.id}`);
  Object.assign(CONFIG, { lanes: 3, timeOfDay: 'day', adaptiveCruise: false });

  const road = new Road(DEFAULTS.seed);
  const player = new Player(road);
  player.placeInLane(fx.player.lane, fx.player.kmh);
  const traffic = new Traffic({ dir: 1, density: 0, ahead: 1500, behind: 900, seed: fx.seed, limitKmh: LIMIT });
  player.update(0.001, IDLE, { vehicles: [], lanes: [] });
  const actors = applyScenario(traffic, fx.scenario, player.s);
  player.update(0.001, IDLE, traffic);

  const journal = new Journal().start({
    kind: 'bot',
    driver: 'stage',
    seed: fx.seed,
    scenario: fx.id,
    player,
    recordFps: false, // the bot cannot feel a stutter
    commit: null,
  });

  const frames = Math.round(fx.sec / DT);
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < 4; k++) player.update(DT / 4, IDLE, traffic); // same order as main.js
    traffic.step(DT, player.s, player.proxy);
    if (fx.script) fx.script(traffic.time, actors, traffic);
    journal.tick(DT, player, traffic, LIMIT);
    journal.playerEvents(player.events);
    player.events.length = 0;
  }
  const j = journal.finish({ reason: 'stage' });

  // No threshold may have drifted: the detectors read the journal's own copy.
  if (JSON.stringify(j.header.moments) !== JSON.stringify(DEFAULTS.moments)) {
    throw new HarnessError(`${fx.id}: header.moments does not match DEFAULTS.moments`);
  }

  const tags = new Map(actors.map((v) => [v.id, v.tag]));
  const tagOf = (id) => tags.get(id) ?? `#${id}`;
  return { fx, j, actors, moments: detectMoments(j), tagOf };
}

// -------------------------------------------------------------- journal views
/** Per-sample rows of one vehicle: [{ i, t, dl, lane, off, kmh, ind, brake }]. */
function rowsOf(j, id) {
  const out = [];
  for (let i = 0; i < j.veh.length; i++) {
    const row = (j.veh[i] || []).find((r) => r[0] === id);
    if (row) {
      out.push({ i, t: j.t[i], dl: row[1], lane: row[5], off: row[2], kmh: row[3], ind: row[4] || 0, brake: row[6] === 1 });
    }
  }
  return out;
}

/** The lane the body is actually in, read the way the detectors read it. */
const effOf = (j, row) => effLane(row, (j.header && j.header.laneWidth) || CONFIG.laneWidth, (j.header && j.header.lanes) || CONFIG.lanes);

/** Every row of the journal, with its vehicle tag, for cross-car checks. */
function allRows(j, tagOf) {
  const out = [];
  for (let i = 0; i < j.veh.length; i++) {
    for (const r of j.veh[i] || []) out.push({ i, t: j.t[i], tag: tagOf(r[0]), dl: r[1], lane: r[5], off: r[2], kmh: r[3], ind: r[4] || 0, brake: r[6] === 1 });
  }
  return out;
}

const byTag = (actors, tag) => actors.find((v) => v.tag === tag);

/** The longest unbroken run of one indicator value: first and last sample of it. */
function indicatorRun(j, id, dir) {
  const on = rowsOf(j, id).filter((r) => r.ind === dir);
  if (!on.length) return { first: null, last: null, continuous: false };
  let best = 1;
  let run = 1;
  let at = 0;
  for (let i = 1; i < on.length; i++) {
    run = on[i].i === on[i - 1].i + 1 ? run + 1 : 1;
    if (run > best) {
      best = run;
      at = i;
    }
  }
  return { first: on[0].t, last: on[at].t, continuous: best === on.length };
}

const intersectionOf = (j, a, b, from, to) => {
  const ra = rowsOf(j, a).filter((r) => r.t >= from && r.t <= to);
  const rb = new Map(rowsOf(j, b).filter((r) => r.t >= from && r.t <= to).map((r) => [r.i, r]));
  return ra.filter((r) => rb.has(r.i)).map((r) => ({ a: r, b: rb.get(r.i) }));
};

/** Bumper-to-bumper gap, using the body lengths in the journal's meta table. */
const bumperGap = (j, dlAhead, idAhead, idBehind) =>
  dlAhead - ((j.meta[idAhead] && j.meta[idAhead].len) || 4.5) / 2 - ((j.meta[idBehind] && j.meta[idBehind].len) || 4.5) / 2;

// ------------------------------------------------------------------ fixtures
const STILL = { jitterW: 0, jitterPh: 0, wanderA: 0 }; // no speed or lateral wobble
const car = (tag, o) => {
  const { params, ...rest } = o;
  return { tag, type: 'car', variant: 'sedan', persona: null, ...rest, params: { ...STILL, ...(params || {}) } };
};

const FIXTURES = [
  {
    id: 'PB',
    title: 'phantom brake',
    seed: 101,
    sec: 12,
    player: { lane: 1, kmh: 100 },
    scenario: {
      seed: 101,
      vehicles: [
        // A 1.2 m/s² tap: the light comes on (a < -0.85), the speed drop is only
        // ~1.2 m/s² per sample, so only the brake-light column can catch it.
        car('tapper', { lane: 1, ds: 50, kmh: 100, want: 100, params: { brakeEvent: { at: 4, kmh: 92, decel: 1.2, hold: 1 }, cooldown: 1e9 } }),
      ],
    },
    preconditions: ({ j, actors, tagOf }) => {
      const cfg = CONFIG.moments;
      const tap = byTag(actors, 'tapper');
      const rows = rowsOf(j, tap.id);
      const lit = rows.filter((r) => r.t >= 4 && r.t <= 6 && r.brake);
      let consecutive = 0;
      for (let i = 1; i < lit.length; i++) if (lit[i].i === lit[i - 1].i + 1) consecutive = Math.max(consecutive, 2);
      if (lit.length) consecutive = Math.max(consecutive, 1);
      let maxDecel = 0;
      for (let i = 1; i < rows.length; i++) {
        const dt = rows[i].t - rows[i - 1].t;
        if (dt > 0) maxDecel = Math.max(maxDecel, (rows[i - 1].kmh - rows[i].kmh) / 3.6 / dt);
      }
      const others = allRows(j, tagOf).filter((r) => r.tag !== 'tapper' && r.dl > 0);
      const inFront = lit.some((r) => others.some((o) => o.i === r.i && o.dl - r.dl < cfg.phantomLook));
      return [
        {
          ok: consecutive >= 2,
          msg: `tapper's brake light was on for ${lit.length} samples between 4 and 6 s (${lit.map((r) => r.t.toFixed(1)).join(', ') || 'never'}), needing 2 in a row`,
        },
        {
          ok: maxDecel < cfg.phantomBrake,
          msg: `tapper's largest per-sample deceleration was ${maxDecel.toFixed(2)} m/s², which must stay under phantomBrake ${cfg.phantomBrake} so only the brake light can catch it`,
        },
        { ok: !inFront, msg: `nothing was within phantomLook ${cfg.phantomLook} m ahead of tapper while it braked (else the brake had a visible reason)` },
      ];
    },
    expect: [
      {
        kind: 'phantom-brake',
        tag: 'tapper',
        count: 1,
        sev: [2, 2],
        t: [4.0, 5.0],
        text: 'tapped the brakes',
        miss: "tapper's brake light was on with nothing within 40 m ahead, but no phantom-brake fired",
      },
    ],
    forbid: [
      { kind: 'near-miss' },
      { kind: 'cut-off' },
      { kind: 'unannounced' },
      { kind: 'pop-in' },
    ],
    // The control: with the brake-light column switched off the same journal must
    // stay quiet, proving the trigger was the light and not the speed drop.
    control: (j, _moments, tagOf) =>
      checkCase(
        detectMoments({ ...j, header: { ...j.header, hasBrake: false } }),
        {
          forbid: [{ kind: 'phantom-brake', tag: 'tapper', why: 'with hasBrake=false it still fired, so the speed drop, not the brake column, triggered it' }],
        },
        { tagOf },
      ),
  },

  {
    id: 'PB-neg',
    title: 'brake with a visible reason',
    seed: 102,
    sec: 14,
    player: { lane: 1, kmh: 100 },
    scenario: {
      seed: 102,
      vehicles: [
        car('lead', { lane: 1, ds: 85, kmh: 100, want: 100, params: { brakeEvent: { at: 4, kmh: 85, decel: 2.5, hold: 2 }, cooldown: 1e9 } }),
        // It reacts through normal IDM and reactLate: nothing here tells it to brake.
        car('follower', { lane: 1, ds: 50, kmh: 100, want: 100, params: { cooldown: 1e9 } }),
      ],
    },
    preconditions: ({ j, actors }) => {
      const cfg = CONFIG.moments;
      const lead = byTag(actors, 'lead');
      const fol = byTag(actors, 'follower');
      const pairs = intersectionOf(j, fol.id, lead.id, 4, 9);
      const lit = pairs.filter((p) => p.a.brake);
      const explained = lit.every((p) => {
        const g = bumperGap(j, p.b.dl - p.a.dl, lead.id, fol.id); // dl is from you, the gap is between the two
        return p.a.lane === p.b.lane && g > 0 && g < cfg.phantomLook;
      });
      const gaps = lit.map((p) => bumperGap(j, p.b.dl - p.a.dl, lead.id, fol.id));
      const span = gaps.length ? `${Math.min(...gaps).toFixed(1)}–${Math.max(...gaps).toFixed(1)} m` : '–';
      return [
        { ok: lit.length >= 1, msg: `follower lit its brakes on ${lit.length} sample(s) between 4 and 9 s (needs one, or the negative tests nothing)` },
        { ok: explained, msg: `lead was ${span} ahead of follower in the same lane at every braking sample (needs under phantomLook ${cfg.phantomLook} m)` },
      ];
    },
    expect: [],
    forbid: [
      {
        kind: 'phantom-brake',
        tag: 'follower',
        why: (m) => `phantom-brake fired for follower at ${m.t.toFixed(1)} s although another car was ahead of it and braking`,
      },
    ],
  },

  {
    id: 'ES',
    title: 'empty signal, held and then withdrawn',
    seed: 201,
    sec: 16,
    player: { lane: 0, kmh: 80 },
    scenario: {
      seed: 201,
      vehicles: [
        // Fit: L sits at +75, not +60. At +60 the 30 m bumper gap is the IDM's
        // balance point at 80 km/h, so S sagged to 71 km/h behind it and B (still
        // doing 80) drew alongside at 5 s, which collapsed S's margin and ended
        // the signal after 5 s. At +75 S holds ~80 and the hold lasts as intended.
        car('L', { lane: 1, ds: 75, kmh: 80, want: 80, params: { cooldown: 1e9 } }),
        // S wants past L. B is right behind the space S wants, without
        // anticipation or cooperation, so the move never becomes safe.
        // tSignal 6, not 2: since F-38 a real driver withdraws a signal that
        // leads nowhere after tSignal + signalHoldS (3 s), so a held-then-
        // withdrawn signal has to ask for a longer wait to exist at all. With 6
        // the real cancel fires at 9 s and the detector sees a 9 s hold.
        car('S', { lane: 1, ds: 25, kmh: 80, want: 100, params: { p: 0, tSignal: 6, tSafe: 0.8, coop: 0, cooldown: 1e9 } }),
        car('B', { lane: 2, ds: 16, kmh: 80, want: 80, params: { cooldown: 1e9, coop: 0, antic: 0 } }),
      ],
    },
    script: (t, actors, traffic) => {
      if (t >= 1 && !actors.__signalled) {
        actors.__signalled = true;
        traffic.beginSignal(byTag(actors, 'S'), 2);
      }
    },
    preconditions: ({ j, actors }) => {
      const s = byTag(actors, 'S');
      const sig = indicatorRun(j, s.id, -1);
      const rows = rowsOf(j, s.id);
      const effs = rows.map((r) => effOf(j, r));
      const moved = new Set(rows.map((r) => r.lane)).size > 1;
      let lastOn = null;
      for (const r of rows) if (r.ind === -1) lastOn = r;
      const off = lastOn ? rows.find((r) => r.i > lastOn.i) : null;
      return [
        {
          ok: sig.first != null && sig.first >= 1.0 && sig.first <= 1.6 && sig.continuous && sig.last - sig.first >= 8,
          msg: `S's left indicator ran continuously for ${sig.first == null ? 'no time at all' : `${(sig.last - sig.first).toFixed(1)} s, ${sig.first.toFixed(1)}–${sig.last.toFixed(1)} s`} (needs 8 s from the 1.0/1.5 s sample)`,
        },
        { ok: effs.every((e) => e === 1), msg: `S's effLane was ${[...new Set(effs)].join(',')} while signalling (needs 1 throughout)` },
        {
          ok: !moved && !!off && lastOn.t <= 12.5 && off.ind === 0,
          msg: `S withdrew the signal at ${off ? off.t.toFixed(1) : 'never'} s in lane ${[...new Set(rows.map((r) => r.lane))].join(',')} (needs indicator 0 by 12.5 s and no move)`,
        },
      ];
    },
    expect: [
      {
        kind: 'empty-signal',
        tag: 'S',
        count: 1,
        sev: [2, 2],
        t: [9.0, 10.0],
        text: 'has indicated left',
        miss: 'S indicated left without moving, and the real cancel withdrew it',
      },
    ],
    forbid: [
      { kind: 'unannounced' },
      { kind: 'cut-off' },
    ],
  },

  {
    id: 'PL',
    title: 'pointless lane change',
    seed: 301,
    sec: 14,
    player: { lane: 0, kmh: 100 },
    scenario: {
      seed: 301,
      // Lanes 1 and 2 are empty ahead: nothing to overtake.
      vehicles: [car('P', { lane: 1, ds: 60, kmh: 100, want: 100, params: { bias: 0, p: 0, tSignal: 2.5, lcDur: 4, cooldown: 1e9 } })],
    },
    script: (t, actors, traffic) => {
      if (t >= 2 && !actors.__signalled) {
        actors.__signalled = true;
        traffic.beginSignal(byTag(actors, 'P'), 2);
      }
    },
    preconditions: ({ j, actors, tagOf }) => {
      const p = byTag(actors, 'P');
      const rows = rowsOf(j, p.id);
      const effs = rows.map((r) => effOf(j, r));
      const changes = [];
      for (let i = 1; i < effs.length; i++) if (effs[i] !== effs[i - 1]) changes.push({ i, from: effs[i - 1], to: effs[i], t: rows[i].t, dl: rows[i].dl });
      const ok = changes.length === 1 && changes[0].from === 1 && changes[0].to === 2;
      const c = changes[0];
      const aheadOk = !!c && c.dl >= 5 && c.dl <= 120;
      const blocked = c ? allRows(j, tagOf).some((r) => r.i === rows[c.i].i && r.tag !== 'P' && effOf(j, r) === 1 && r.dl > rows[c.i].dl && r.dl - rows[c.i].dl <= 120) : true;
      return [
        { ok, msg: `P's effLane changed ${changes.map((x) => `${x.from}->${x.to} at ${x.t.toFixed(1)} s`).join(', ') || 'never'} (needs exactly one 1->2)` },
        { ok: aheadOk, msg: c ? `P was ${c.dl} m ahead of you when it moved (needs 5–120 m)` : 'P never moved, so there is no distance to check' },
        { ok: !blocked, msg: `lane 1 ahead of P was ${blocked ? 'not empty' : 'empty'} within 120 m when it moved` },
      ];
    },
    expect: [
      {
        kind: 'pointless-lane',
        tag: 'P',
        count: 1,
        sev: [2, 2],
        t: [5.5, 8.0],
        text: 'nothing ahead',
        miss: 'P moved 1->2 with nothing in lane 1 ahead of it, but no pointless-lane fired',
      },
    ],
    forbid: [{ kind: 'unannounced', tag: 'P' }],
  },

  {
    id: 'PL-neg',
    title: 'a justified overtake',
    seed: 302,
    sec: 20,
    player: { lane: 0, kmh: 85 },
    scenario: {
      seed: 302,
      vehicles: [
        car('L', { lane: 1, ds: 100, kmh: 80, want: 80, params: { cooldown: 1e9 } }),
        // No script: O decides to overtake through its own MOBIL logic.
        // Fit: bias 0. Without it the keep-right urge makes the empty right lane
        // the better move (same gain, lower threshold), so O signals right instead
        // of overtaking, which is a different situation than this fixture tests.
        car('O', { lane: 1, ds: 40, kmh: 100, want: 100, params: { bias: 0, tSignal: 2.5, cooldown: 0.5, decT: 0, tPrep: 0.5, antic: 0.8, lcDur: 4 } }),
      ],
    },
    preconditions: ({ j, actors }) => {
      const o = byTag(actors, 'O');
      const l = byTag(actors, 'L');
      const rows = rowsOf(j, o.id);
      const effs = rows.map((r) => effOf(j, r));
      let move = null;
      for (let i = 1; i < effs.length; i++) if (effs[i] !== effs[i - 1]) move = { i, from: effs[i - 1], to: effs[i], t: rows[i].t, dl: rows[i].dl };
      if (!move || move.from !== 1 || move.to !== 2 || move.t < 2 || move.t > 15) {
        return [{ ok: false, msg: 'overtaker never left lane 1; the negative would pass without testing anything' }];
      }
      const at = rows[move.i];
      const lead = rowsOf(j, l.id).find((r) => r.i === at.i);
      const g = lead ? bumperGap(j, lead.dl - at.dl, l.id, o.id) : null;
      return [
        {
          ok: !!lead && lead.dl > at.dl && lead.dl - at.dl <= 120 && lead.kmh <= at.kmh + 0.5,
          msg: lead
            ? `O moved 1->2 at ${move.t.toFixed(1)} s with L ${Math.round(lead.dl - at.dl)} m ahead in lane 1 at ${lead.kmh} km/h (O ${at.kmh} km/h, ${g == null ? '–' : g.toFixed(1)} m bumper to bumper)`
            : 'L was not in the journal when O moved',
        },
      ];
    },
    expect: [],
    forbid: [
      {
        kind: 'pointless-lane',
        why: (m) => `pointless-lane fired for ${m.vehicles.length ? 'a car' : 'someone'} at ${m.t.toFixed(1)} s although the overtake had a slower leader ahead`,
      },
      { kind: 'unannounced', tag: 'O' },
    ],
  },

  // ---------------------------------------------------------------- probes
  // Report-only: they print what the detectors said and never fail the run.
  {
    id: 'probe-closure',
    title: 'closure obstacles never reach the journal (report only)',
    seed: 401,
    sec: 20,
    probe: true,
    // The player holds 60 so C is still ahead of it when it merges out of the
    // closing lane; at 100 the player overtakes the slowing car first and the
    // left move happens behind it, where pointless-lane cannot apply.
    player: { lane: 1, kmh: 60 },
    scenario: {
      seed: 401,
      closures: [{ lane: 0, ds: 400, len: 600 }],
      // No cooldown override: C must be free to merge out of the closing lane,
      // which is the situation the probe is about.
      vehicles: [car('C', { lane: 0, ds: 60, kmh: 100, want: 100 })],
    },
    probeLines: ({ actors, moments }) => {
      const c = byTag(actors, 'C');
      const mine = moments.filter((m) => m.vehicles.includes(c.id));
      const kinds = ['pointless-lane', 'phantom-brake'];
      const said = kinds.map((k) => `${k} ${mine.some((m) => m.kind === k) ? 'fired' : 'quiet'}`);
      return [
        `C drove at a lane closure that only exists as an obstacle in the lane lists, so the journal never shows what it braked for`,
        `${said.join(', ')} for C (${mine.length} moment(s): ${mine.map((m) => `${m.t.toFixed(1)} s ${m.kind}`).join(', ') || 'none'})`,
      ];
    },
  },
  {
    id: 'probe-far',
    title: 'a slow leader outside the hard-coded 120 m window (report only)',
    seed: 402,
    sec: 20,
    probe: true,
    player: { lane: 0, kmh: 85 },
    scenario: {
      seed: 402,
      vehicles: [
        car('L', { lane: 1, ds: 170, kmh: 70, want: 70, params: { cooldown: 1e9 } }),
        car('O', { lane: 1, ds: 40, kmh: 100, want: 100, params: { tSignal: 2.5, cooldown: 0.5, decT: 0, tPrep: 0.5, antic: 0.8, lcDur: 4 } }),
      ],
    },
    probeLines: ({ j, actors, moments }) => {
      const o = byTag(actors, 'O');
      const rows = rowsOf(j, o.id);
      const effs = rows.map((r) => effOf(j, r));
      let move = null;
      for (let i = 1; i < effs.length; i++) if (effs[i] !== effs[i - 1]) move = { i, t: rows[i].t, from: effs[i - 1], to: effs[i] };
      const fired = moments.find((m) => m.kind === 'pointless-lane' && m.vehicles.includes(o.id));
      const lead = byTag(actors, 'L');
      const lrow = move ? rowsOf(j, lead.id).find((r) => r.i === rows[move.i].i) : null;
      return [
        move ? `O moved ${move.from}->${move.to} at ${move.t.toFixed(1)} s with a ${lead ? lrow && lrow.kmh : '–'} km/h car ${move && lrow ? Math.round(lrow.dl - rows[move.i].dl) : '–'} m ahead in lane 1` : 'O never moved',
        `pointless-lane ${fired ? `fired at ${fired.t.toFixed(1)} s ("${fired.text}")` : 'did not fire'} for O`,
      ];
    },
  },
];

// ------------------------------------------------------------- determinism
/**
 * Everything a second run must reproduce: every column, the meta table and the
 * moments, with ids mapped to fixture tags (NEXT_ID keeps counting across
 * fixtures) and only the two wall-clock stamps left out.
 */
function runKey({ j, moments, tagOf }) {
  const columns = ['t', 's', 'lane', 'lat', 'v', 'a', 'thr', 'brk', 'steer', 'ind', 'ccSet', 'ccOn', 'limit'].map((k) => j[k]);
  const header = { ...j.header, startedAt: null };
  const end = { ...j.end, endedAt: null };
  return JSON.stringify({
    columns,
    veh: j.veh.map((rows) => rows.map((r) => [tagOf(r[0]), ...r.slice(1)])),
    meta: Object.keys(j.meta)
      .map((id) => [tagOf(Number(id)), j.meta[id]])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    events: j.events,
    header,
    end,
    moments: moments.map((m) => ({ ...m, vehicles: (m.vehicles || []).map(tagOf) })),
  });
}

// ------------------------------------------------------------------ health
function healthLines({ j }) {
  const problems = [];
  const crashes = (j.events || []).filter((e) => e.type === 'crash' || e.type === 'scrape');
  if (crashes.length) problems.push(`${crashes.length} crash/scrape event(s): ${crashes.map((e) => `${e.type} at ${e.t.toFixed(1)} s`).join(', ')}`);
  const cols = ['t', 's', 'lane', 'lat', 'v', 'a', 'thr', 'brk', 'steer', 'ind', 'ccSet', 'ccOn', 'limit'];
  const nan = cols.filter((k) => j[k].some((x) => !Number.isFinite(x)));
  const vehNan = j.veh.some((rows) => rows.some((r) => r.slice(1).some((x) => !Number.isFinite(x))));
  if (nan.length || vehNan) problems.push(`NaN in ${[...nan, ...(vehNan ? ['veh'] : [])].join(', ')}`);
  const lanes = new Set(j.lane);
  if (lanes.size > 1) problems.push(`the player changed lane (${[...lanes].join(' -> ')})`);
  return problems.map((p) => ({ ok: false, msg: p }));
}

// ------------------------------------------------------------------- trace
function traceLines({ j, tagOf }, ids, around = null) {
  const t0 = around != null ? around - 3 : -Infinity;
  const t1 = around != null ? around + 3 : Infinity;
  const out = [];
  for (const id of ids) {
    const rows = rowsOf(j, id).filter((r) => r.t >= t0 && r.t <= t1);
    if (!rows.length) continue;
    out.push(`trace ${tagOf(id)} (journal rows${around != null ? ', ±3 s' : ''}):  t   lane  off    kmh ind brake  dl`);
    for (const r of rows) {
      out.push(
        `${' '.repeat(tagOf(id).length + 26)}${r.t.toFixed(1).padStart(5)} ${String(r.lane).padStart(5)} ${String(r.off).padStart(6)} ${String(r.kmh).padStart(5)} ${String(r.ind).padStart(4)} ${String(r.brake ? 1 : 0).padStart(5)} ${String(r.dl).padStart(5)}`,
      );
    }
  }
  return out;
}

// --------------------------------------------------------------------- run
/** Math.random is a harness error for the whole run: every reseed must be real. */
function installRandomTripwire() {
  Math.random = () => {
    throw new HarnessError('Math.random was called: the stage test must be reproducible');
  };
}

function main() {
  installRandomTripwire();
  if (DUMP) mkdirSync(DUMP, { recursive: true });

  let chosen = FIXTURES;
  if (args.only) {
    chosen = FIXTURES.filter((f) => f.id.toLowerCase() === String(args.only).toLowerCase());
    if (!chosen.length) {
      console.error(`No fixture "${args.only}". Available: ${FIXTURES.map((f) => f.id).join(', ')}`);
      return 2;
    }
  }
  if (args.order === 'reverse') chosen = chosen.slice().reverse();

  const started = performance.now();
  const results = [];
  for (const fx of chosen) {
    const t0 = performance.now();
    const first = runFixture(fx);
    const second = runFixture(fx); // twice per fixture: same run, same numbers
    const seconds = (performance.now() - t0) / 1000;

    const ctx = { j: first.j, actors: first.actors, tagOf: first.tagOf, moments: first.moments };
    const pre = fx.preconditions ? fx.preconditions(ctx) : [];
    if (TRACE) for (const p of pre) console.log(`      ${p.ok ? 'ok  ' : 'FAIL'} fixture precondition: ${p.msg}`);
    const spec = {
      id: fx.id,
      expect: fx.expect || [],
      forbid: fx.forbid || [],
      preconditions: [...pre, ...healthLines(first)],
    };
    const checked = checkCase(first.moments, spec, { tagOf: first.tagOf });
    const lines = [...checked.lines];

    if (fx.control) {
      const control = fx.control(first.j, first.moments, first.tagOf);
      if (!control.ok) lines.push(...control.lines);
    }

    if (runKey(first) !== runKey(second)) {
      lines.push('HARNESS: running the same fixture twice gave different journals; the sim is not deterministic here');
    }

    const ok = (checked.ok && !lines.length) || false;
    const harness = lines.some((l) => l.startsWith('HARNESS'));
    // A rule that fired wrongly is the detector's fault; a broken fixture or a
    // sim that cannot repeat itself is not.
    const kind = ok ? 'ok' : checked.kind === 'FIXTURE' || harness ? 'FIXTURE' : 'DETECTOR';
    if (DUMP) writeFileSync(join(DUMP, `${fx.id}.json`), JSON.stringify(first.j));
    if (fx.probe) {
      results.push({ id: fx.id, title: fx.title, kind: 'info', lines: fx.probeLines({ ...ctx, moments: first.moments }) });
      continue;
    }

    if (!ok && TRACE) {
      // Anchor the trace: the moment that did fire, else the middle of the window
      // the case expected. A rule that stayed quiet has no time of its own.
      let anchor = Number((lines[0] || '').match(/at ([\d.]+) s/) || [])[1];
      if (!Number.isFinite(anchor)) {
        const win = (fx.expect || []).find((e) => e.t);
        anchor = win ? (win.t[0] + win.t[1]) / 2 : NaN;
      }
      lines.push(...traceLines(first, first.actors.map((a) => a.id), Number.isFinite(anchor) ? anchor : null));
    }
    if (!ok) {
      lines.push(`all moments: ${fmtMoments(first.moments, first.tagOf).join(' | ') || '–'}`);
      lines.push(
        `rerun: npm run moments:stage only=${fx.id}${TRACE ? '' : ' trace'}   (seed ${fx.seed} · dt 1/32 · ${fx.sec} s)`,
      );
    }
    results.push({ id: fx.id, title: fx.title, ok, kind, lines, seconds });
  }

  const code = report(results);
  const gating = results.filter((r) => r.kind !== 'info');
  const passed = gating.filter((r) => r.ok).length;
  const total = (performance.now() - started) / 1000;
  console.log(
    `\n${passed}/${gating.length} staged fixture(s) passed, ${results.length - gating.length} probe(s) reported · ${total.toFixed(2)} s`,
  );
  return code;
}

let code;
try {
  code = main();
} catch (e) {
  console.error(`HARNESS ERROR: ${e && e.message ? e.message : e}`);
  if (!(e instanceof HarnessError) && e && e.stack) console.error(e.stack);
  code = 2;
}
process.exit(code);
