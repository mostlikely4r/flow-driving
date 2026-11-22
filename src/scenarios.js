// Scenario harness: repeatable traffic situations for tuning the AI.
//
// In game:   http://localhost:5173/?scenario=elephant   (Backspace restarts)
// Headless:  npm run scenario elephant                   (prints a timeline)
//
// Positions are relative to you: ds metres ahead (+) or behind (-).
// Lanes are numbered from the right: 0 is the rightmost lane.
// `kmh` is the starting speed, `want` the driver's desired speed (default = kmh).
// `persona` makes the car an archetype from archetypes.js (look + driving,
// always true to type here); without `want` it keeps the archetype's speed.
// `params` overrides driver parameters from traffic.js makeVehicle(), e.g.
// T (headway s), p (politeness), bias (keep-right urge), tSignal, coop, strict.
import { KMH, mulberry32 } from './util.js';
import { laneLat } from './layout.js';
import { VARIANTS } from './variants.js';
import { ARCHETYPES } from './archetypes.js';
import { defaultVariant, personaSeed, sampleSpec } from './personaSpec.js';

export const SCENARIOS = {
  elephant: {
    title: 'Overtaking a truck with a speeder behind',
    about:
      'Two lanes. The car ahead of you closes in on a truck just as a fast car comes up in the left lane. ' +
      'Does the car ahead pull out in front of the speeder or wait? Does the speeder see it coming?',
    lanes: 2,
    timeOfDay: 'day',
    seed: 11,
    player: { lane: 0, kmh: 97, want: 100 },
    vehicles: [
      { tag: 'truck', type: 'truck', variant: 'truck', lane: 0, ds: 170, kmh: 82 },
      { tag: 'ahead', type: 'car', variant: 'hatch', lane: 0, ds: 45, kmh: 97, want: 103, params: { p: 0, tSafe: 0.35, bSafe: 3.2 } },
      { tag: 'speeder', type: 'car', variant: 'sedan', lane: 1, ds: -170, kmh: 132, want: 138 },
    ],
  },

  'truck-race': {
    title: 'Elephant race on two lanes',
    about:
      'One truck overtakes another with a 2 km/h difference. You are in the left lane behind them, with ' +
      'a few cars queued behind you. How long does it take, and do the cars behind behave?',
    lanes: 2,
    timeOfDay: 'day',
    seed: 12,
    player: { lane: 1, kmh: 100, want: 105 },
    vehicles: [
      { tag: 'slow truck', type: 'truck', variant: 'truck', lane: 0, ds: 160, kmh: 82, want: 82 },
      { tag: 'fast truck', type: 'truck', variant: 'truck', lane: 0, ds: 115, kmh: 84, want: 85, params: { eager: 2 } },
      { tag: 'behind 1', type: 'car', variant: 'estate', lane: 1, ds: -60, kmh: 104, want: 110 },
      { tag: 'behind 2', type: 'car', variant: 'suv', lane: 1, ds: -140, kmh: 108, want: 118 },
    ],
  },

  archetypes: {
    title: 'Read the mirror',
    about:
      'Three lanes. A pensioner potters along ahead of you, a leasebak closes in from behind in the ' +
      'middle lane, and a patser is somewhere behind it. Can you tell who is who from the mirror alone?',
    lanes: 3,
    timeOfDay: 'day',
    seed: 14,
    player: { lane: 0, kmh: 100, want: 103 },
    vehicles: [
      { tag: 'pensioner', type: 'car', variant: 'hatch', persona: 'pensioner', lane: 0, ds: 140, kmh: 90 },
      { tag: 'leasebak', type: 'car', variant: 'estate', persona: 'leasebak', lane: 1, ds: -150, kmh: 125 },
      { tag: 'patser', type: 'car', variant: 'hatch', persona: 'patser', lane: 1, ds: -240, kmh: 130, want: 140 },
      { tag: 'family', type: 'car', variant: 'suv', persona: 'family', lane: 1, ds: 110, kmh: 104 },
      { tag: 'truck', type: 'truck', variant: 'truck', lane: 0, ds: 520, kmh: 83 },
    ],
  },

  cast: {
    title: 'The whole cast',
    about:
      'Three lanes. Every archetype in one stretch: an EV camping in the middle lane, a white van ' +
      'pushing up behind it, a family car, a pensioner, a grijze sok behind a truck, and a leasebak ' +
      'and patser coming up fast. Watch the mirror and the lights.',
    lanes: 3,
    timeOfDay: 'day',
    seed: 16,
    player: { lane: 0, kmh: 98, want: 102 },
    vehicles: [
      { tag: 'truck', type: 'truck', variant: 'truck', lane: 0, ds: 260, kmh: 84 },
      { tag: 'sok', type: 'car', variant: 'sedan', persona: 'sok', lane: 0, ds: 228, kmh: 84 },
      { tag: 'ev', type: 'car', variant: 'sedan', persona: 'ev', lane: 1, ds: 80, kmh: 100, params: { hogger: true, bias: -0.03, p: 0.03 } },
      { tag: 'van', type: 'van', variant: 'van', persona: 'whitevan', lane: 1, ds: -60, kmh: 112 },
      { tag: 'family', type: 'car', variant: 'suv', persona: 'family', lane: 0, ds: 60, kmh: 100 },
      { tag: 'pensioner', type: 'car', variant: 'hatch', persona: 'pensioner', lane: 0, ds: 140, kmh: 90 },
      { tag: 'leasebak', type: 'car', variant: 'estate', persona: 'leasebak', lane: 2, ds: -220, kmh: 128 },
      { tag: 'patser', type: 'car', variant: 'hatch', persona: 'patser', lane: 1, ds: -330, kmh: 132, want: 140 },
    ],
  },

  sok: {
    title: 'Grijze sok',
    about:
      'Three lanes. A grijze sok comes past you in the middle lane looking for a truck to tuck in behind; ' +
      'another one already sits behind the truck ahead. An ordinary driver at the same speed follows. ' +
      'Who overtakes the truck, and who settles in behind it?',
    lanes: 3,
    timeOfDay: 'day',
    seed: 15,
    player: { lane: 0, kmh: 86, want: 88 },
    vehicles: [
      { tag: 'truck', type: 'truck', variant: 'truck', lane: 0, ds: 150, kmh: 84 },
      { tag: 'sok', type: 'car', variant: 'sedan', persona: 'sok', lane: 0, ds: 113, kmh: 84 },
      { tag: 'seeker', type: 'car', variant: 'hatch', persona: 'sok', lane: 1, ds: 25, kmh: 94 },
      { tag: 'truck2', type: 'truck', variant: 'truck', lane: 0, ds: 600, kmh: 82 },
      { tag: 'normal', type: 'car', variant: 'estate', persona: null, lane: 1, ds: -90, kmh: 94, want: 96 },
    ],
  },

  wave: {
    title: 'A shockwave',
    about:
      'Two busy lanes at 90. Half a kilometre ahead a driver brakes hard to 20 km/h for a moment, then ' +
      'drives on. Watch the lane map (U, twice for the time-space diagram): each driver brakes a little ' +
      'later and harder than the one ahead, and the wave travels back toward you.',
    lanes: 2,
    timeOfDay: 'day',
    seed: 21,
    density: 22,
    player: { lane: 0, kmh: 90, want: 100 },
    vehicles: (() => {
      // two dense lanes, ~1.3 s apart, a truck now and then
      const r = mulberry32(77);
      const out = [];
      for (const lane of [0, 1]) {
        for (let ds = -420, i = 0; ds < 1100; i++) {
          const truck = lane === 0 && r() < 0.15;
          const gap = 34 + r() * 16 + (truck ? 14 : 0);
          ds += gap;
          if (lane === 0 && Math.abs(ds) < 20) continue; // room for you
          const kmh = lane === 0 ? 88 : 96;
          const spec = truck
            ? { type: 'truck', variant: 'truck', lane, ds, kmh: 84 }
            : { type: 'car', variant: ['hatch', 'sedan', 'estate', 'suv'][(r() * 4) | 0], lane, ds, kmh, want: kmh + 6 + r() * 8 };
          out.push({ tag: '', ...spec });
        }
      }
      // the trigger: a car well ahead in your lane
      const t = out.filter((s) => s.lane === 0 && s.type === 'car' && s.ds > 480)[0];
      t.tag = 'braker';
      t.params = { brakeEvent: { at: 6, kmh: 20, decel: 5.5, hold: 2 }, cooldown: 1e9 };
      return out;
    })(),
  },

  closure: {
    title: 'Red cross',
    about:
      'Three busy lanes, and the right lane is closed 1.4 km ahead. Watch the matrix signs: an arrow, ' +
      'then red crosses with 70 over the open lanes. Most drivers move over between the arrow and the ' +
      'cross, a few ride on and zip in at the end. A queue builds, and the signs behind it start ' +
      'flashing 50 and 70. Lane map: U.',
    lanes: 3,
    timeOfDay: 'day',
    seed: 23,
    density: 10,
    closures: [{ lane: 0, ds: 1400, len: 900 }],
    player: { lane: 1, kmh: 100, want: 104 },
    vehicles: (() => {
      const r = mulberry32(91);
      const out = [];
      for (const lane of [0, 1, 2]) {
        for (let ds = -700; ds < 1250; ) {
          const truck = lane === 0 && r() < 0.2;
          ds += 60 + r() * 60 + (truck ? 20 : 0);
          if (lane === 1 && Math.abs(ds) < 30) continue; // room for you
          const kmh = [92, 100, 108][lane];
          out.push(truck
            ? { tag: '', type: 'truck', variant: 'truck', lane, ds, kmh: 84 }
            : { tag: '', type: 'car', variant: ['hatch', 'sedan', 'estate', 'suv'][(r() * 4) | 0], lane, ds, kmh, want: kmh + 4 + r() * 8 });
        }
      }
      return out;
    })(),
  },

  onramp: {
    title: 'Merging from the on-ramp',
    about:
      'Three lanes. About 600 m ahead cars appear on the hard shoulder with their left indicator on, ' +
      'speed up and slot into the right lane. Some lane-0 drivers ease off or move left to let them in. ' +
      'Watch the lane map (U): the strip is a short band right of lane 0.',
    lanes: 3,
    timeOfDay: 'day',
    seed: 24,
    density: 10,
    ramps: [{ ds: 600 }],
    player: { lane: 1, kmh: 100, want: 104 },
    vehicles: (() => {
      const r = mulberry32(93);
      const out = [];
      for (const lane of [0, 1, 2]) {
        for (let ds = -700; ds < 1250; ) {
          const truck = lane === 0 && r() < 0.2;
          ds += 60 + r() * 60 + (truck ? 20 : 0);
          if (lane === 1 && Math.abs(ds) < 30) continue; // room for you
          const kmh = [92, 100, 108][lane];
          out.push(truck
            ? { tag: '', type: 'truck', variant: 'truck', lane, ds, kmh: 84 }
            : { tag: '', type: 'car', variant: ['hatch', 'sedan', 'estate', 'suv'][(r() * 4) | 0], lane, ds, kmh, want: kmh + 4 + r() * 8 });
        }
      }
      return out;
    })(),
  },

  'onramp-busy': {
    title: 'Busy on-ramp',
    about:
      'Three lanes, twice the traffic and twice the ramp flow. Some cars run to the end of the strip and ' +
      'zip in there; the lane you are watching the ramp from gets busier too. Lane map: U.',
    lanes: 3,
    timeOfDay: 'day',
    seed: 25,
    density: 16,
    ramps: [{ ds: 600, perMin: 12 }],
    player: { lane: 1, kmh: 100, want: 104 },
    vehicles: (() => {
      const r = mulberry32(94);
      const out = [];
      for (const lane of [0, 1, 2]) {
        for (let ds = -700; ds < 1250; ) {
          const truck = lane === 0 && r() < 0.2;
          ds += 40 + r() * 45 + (truck ? 20 : 0);
          if (lane === 1 && Math.abs(ds) < 30) continue; // room for you
          const kmh = [88, 96, 104][lane];
          out.push(truck
            ? { tag: '', type: 'truck', variant: 'truck', lane, ds, kmh: 84 }
            : { tag: '', type: 'car', variant: ['hatch', 'sedan', 'estate', 'suv'][(r() * 4) | 0], lane, ds, kmh, want: kmh + 4 + r() * 8 });
        }
      }
      return out;
    })(),
  },

  slot: {
    title: 'Lining up for the slot',
    about:
      'The car ahead wants to move right, but a car is right behind it in the middle lane. ' +
      'Watch it line up first, then signal and go.',
    lanes: 3,
    timeOfDay: 'day',
    seed: 31,
    player: { lane: 2, kmh: 105, want: 105 },
    vehicles: [
      // Wants the middle lane (a keep-right wish, nothing to gain), but the car
      // behind it there is half a second away: too tight. It should pull ahead
      // first (lineUpKmh) and only then indicate.
      { tag: 'slotter', type: 'car', variant: 'estate', lane: 2, ds: 40, kmh: 100, want: 100, params: { bias: 0.6, p: 0.1, tSafe: 0.7, bSafe: 2.5, tSignal: 2.5, tPrep: 0.4, decT: 0.2, cooldown: 0.3, coop: 0 } },
      { tag: 'blocker', type: 'car', variant: 'hatch', lane: 1, ds: 22, kmh: 100, want: 100, params: { coop: 0, cooldown: 1e9, antic: 0 } },
      // Something far ahead in the right lane, so the scene reads as a motorway.
      { tag: 'truck', type: 'truck', variant: 'truck', lane: 0, ds: 900, kmh: 83 },
    ],
  },

  hogger: {
    title: 'Middle-lane hogger',
    about:
      'Three lanes. A middle-lane hogger at 95 km/h sits ahead of you with the right lane empty. ' +
      'Try flashing your lights (F) and watch the dev overlay.',
    lanes: 3,
    timeOfDay: 'day',
    seed: 13,
    player: { lane: 1, kmh: 100, want: 105 },
    vehicles: [
      { tag: 'hogger', type: 'car', variant: 'estate', lane: 1, ds: 70, kmh: 95, params: { hogger: true, bias: -0.03 } },
      { tag: 'left lane', type: 'car', variant: 'sedan', lane: 2, ds: -120, kmh: 118, want: 120 },
      { tag: 'truck', type: 'truck', variant: 'truck', lane: 0, ds: 400, kmh: 83 },
    ],
  },
};

// ============================================================================
// F-35 slice 3: behaviour demos.
//
// A demo is a scenario like any other: seeded, forced loyalty, no player car,
// registered under `demo:<persona>` and `demo:<persona>:<trait>`. The rig steps
// it with a real Traffic instance, so the captions can be detected from the
// vehicles instead of being written as a script. `tools/personas.js` runs the
// same scenarios headless and checks the same captions and expectations.
//
// The star's only staging override is a short lane-change cooldown (0.2 s),
// so a demo starts moving on its mirror-check delay rather than on a random
// 2-4 s timer. Everything a caption claims is the code's own decision.
export const DEMO_LIMIT = 100; // demos are staged at the day limit, whatever time it is
const STAR_DS = 80; // in front of the free-play player, so ?scenario=demo:x watches from behind
const STAR_PARAMS = { cooldown: 0.2, decT: 0.1 };

const mid = (r) => (r ? (r.min + r.max) / 2 : 0);
const one = (x, d = 1) => Number(x).toFixed(d);
const sgn = (x, d = 1) => {
  const s = one(x, d);
  return Number(s) >= 0 ? `+${s}` : `−${one(Math.abs(x), d)}`;
};
const secsOf = (gap, veh) => (veh && veh.v > 0.5 ? gap / veh.v : 0);
const meta = (variant) => VARIANTS[variant] || VARIANTS.estate;

/** Centre-to-centre offset for a bumper gap ahead of the star. */
function ahead(gap, len, starLen) {
  return (len + starLen) / 2 + gap;
}
/** Centre-to-centre offset for a bumper gap behind the star. */
function behind(gap, len, starLen) {
  return -((len + starLen) / 2 + gap);
}

function starSpec(c, lane, kmh, params = {}) {
  const m = meta(c.variant);
  return {
    tag: 'star',
    type: m.type,
    variant: c.variant,
    persona: c.key,
    lane,
    ds: STAR_DS,
    kmh,
    params: { ...STAR_PARAMS, ...params },
  };
}

function ordinary(_c, tag, variant, lane, dz, kmh, params = {}, want = kmh) {
  const m = meta(variant);
  return { tag, type: m.type, variant, lane, ds: STAR_DS + dz, kmh, want, params: { cooldown: 1e9, ...params } };
}

/** The demo's own default driver: an estate at a constant speed. */
function neutral(c, tag, lane, dz, kmh, params = {}) {
  return ordinary(c, tag, 'estate', lane, dz, kmh, params);
}

/** Holds the gap the star's own T (or Tdraft) calls for at `kmh`. */
function headwayGap(spec, kmh, draft = false) {
  const t = draft && spec.Tdraft ? mid(spec.Tdraft) : mid(spec.T);
  return t * (kmh / 3.6) + 16; // the IDM standstill gap plus free-flow room, so it does not brake at t=0
}

// --------------------------------------------------------------------------
// The traits. Each builder returns the actors, the detected captions and one
// concrete expectation the headless run checks. Captions may come in groups:
// where a demo has two possible outcomes, at least one of the group must fire.
const DEMO_DEFS = {
  // Wants: the road scrolls at the persona's real desired speed.
  pace: {
    title: 'Wanted speed',
    about: (c) => `${c.spec.name} settles at the speed its own drive() asks for, not at the limit.`,
    lanes: 1,
    seconds: 12,
    applies: () => true,
    build(c) {
      const vehicles = [starSpec(c, 0, c.starStart)];
      const settle = (ctx) => Math.abs(ctx.star.v - ctx.star.v0base) < 1.4;
      const captions = [
        {
          when: (ctx) => ctx.t > 1.2 && settle(ctx),
          text: (ctx) =>
            `holding ${Math.round(ctx.star.v * 3.6)} km/h; it wants ${sgn(ctx.star.v0base / KMH - ctx.limit, 0)} over the ${ctx.limit} limit`,
          hold: 4,
        },
        {
          when: (ctx) => ctx.t > 7 && Math.abs(ctx.star.v - ctx.star.v0base) < 3,
          text: (ctx) => `wants ${Math.round(ctx.star.v0base * 3.6)} km/h and is holding it`,
          hold: 3,
        },
      ];
      return {
        vehicles,
        captions,
        expect: {
          label: 'settles within 3 km/h of its wanted speed',
          test: (ctx) => Math.abs(ctx.star.v - ctx.star.v0base) < 3 * KMH,
        },
      };
    },
  },

  // Reacts / Brakes: a lead car brakes and you watch the delay, not a claim.
  react: {
    title: 'Reaction time',
    about: (c) => `The estate ahead brakes at 3.6 s. ${c.spec.name}'s own reaction delay decides when it answers.`,
    lanes: 1,
    seconds: 15,
    applies: () => true,
    build(c) {
      const g = headwayGap(c.spec, c.vWant);
      const lead = neutral(c, 'lead', 0, ahead(g, 4.8, c.starLen), c.vWant, {
        brakeEvent: { at: 3.6, kmh: Math.max(35, c.vWant - 45), decel: 5.2, hold: 3.2 },
      });
      const vehicles = [starSpec(c, 0, c.starStart), lead];
      const captions = [
        {
          when: (ctx) => ctx.t > 3.5 && ctx.rec('lead').firstBrakeT != null,
          text: () => 'the car ahead brakes',
          hold: 1.8,
        },
        {
          when: (ctx) => ctx.rec('star').firstBrakeT != null && ctx.rec('lead').firstBrakeT != null,
          text: (ctx) =>
            `${ctx.spec.name} reacts ${one(ctx.rec('star').firstBrakeT - ctx.rec('lead').firstBrakeT, 2)} s later (reaction time ${one(ctx.star.react, 2)} s)`,
          hold: 4,
        },
        {
          when: (ctx) => ctx.t > 7,
          text: (ctx) => `its closest gap was ${one(ctx.rec('star').minGapT, 2)} s`,
          hold: 3,
        },
      ];
      return {
        vehicles,
        settleLead: 'lead',
        captions,
        expect: {
          label: 'brakes, and within its reaction time + 1 s',
          test: (ctx) => {
            const s = ctx.rec('star');
            const l = ctx.rec('lead');
            if (s.firstBrakeT == null || l.firstBrakeT == null) return false;
            const d = s.firstBrakeT - l.firstBrakeT;
            return d >= 0 && d <= ctx.star.react + 1.6 && s.minGapT > 0.6;
          },
        },
      };
    },
  },

  // Signals / Mirror check / Lane change takes / Accelerates: a real overtake.
  signal: {
    title: 'The overtake',
    about: (c) =>
      `A slow estate blocks the right lane. ${c.spec.name} must want the left lane, look in the mirror, indicate, ` +
      'move and pass; whether it comes back depends on the hogger flag. The captions time each stage against its own numbers.',
    lanes: 2,
    seconds: 30,
    applies: () => true,
    build(c) {
      const slowKmh = Math.max(45, c.vWant - 35);
      const slow = neutral(c, 'slow', 0, ahead(55, 4.8, c.starLen), slowKmh, {}, slowKmh);
      const vehicles = [starSpec(c, 0, c.starStart), slow];
      const captions = [
        {
          when: (ctx) => ctx.rec('star').firstIntentT != null,
          text: () => 'sees the slow car and wants the left lane',
          hold: 2.2,
        },
        {
          when: (ctx) => ctx.rec('star').firstIndicatorT != null && ctx.rec('star').firstIntentT != null,
          text: (ctx) =>
            `indicates left ${one(ctx.rec('star').firstIndicatorT - ctx.rec('star').firstIntentT, 1)} s after wanting it (mirror check ${one(ctx.star.tPrep, 2)} s)`,
          hold: 2.8,
        },
        {
          when: (ctx) => ctx.rec('star').firstMoveT != null && ctx.rec('star').firstIndicatorT != null,
          text: (ctx) =>
            `moves ${one(ctx.rec('star').firstMoveT - ctx.rec('star').firstIndicatorT, 1)} s after indicating (tSignal ${one(ctx.star.tSignal, 2)} s)`,
          hold: 2.8,
        },
        {
          when: (ctx) => ctx.rec('star').firstMoveEndT != null && ctx.rec('star').firstMoveEndT > (ctx.rec('star').firstMoveT ?? 99),
          text: (ctx) =>
            `the lane change itself takes ${one(ctx.rec('star').firstMoveEndT - ctx.rec('star').firstMoveT, 1)} s (lcDur ${one(ctx.star.lcDur, 1)} s)`,
          hold: 2.6,
        },
        {
          when: (ctx) => ctx.actor('slow') && ctx.star.u > ctx.actor('slow').u + 6,
          text: (ctx) => {
            // The sheet's "Accelerates" is the persona multiplier; the traffic
            // also gives every car a random ±15% spread, so show the sampled
            // persona factor (inside the range) rather than this car's draw.
            const a = ctx.spec.spec && ctx.spec.spec.a;
            const f = a ? (a.min + a.max) / 2 : 1;
            return f === 1 ? 'passes it' : `passes it with acceleration ×${one(f, 2)}`;
          },
          hold: 2.4,
        },
        {
          when: (ctx) => ctx.rec('star').moveCount >= 2 && ctx.rec('star').movedRight,
          text: () => 'returns right once clear',
          hold: 2.6,
          optional: true,
        },
      ];
      return {
        vehicles,
        captions,
        expect: {
          label: 'mirror-checks, indicates for its tSignal, moves left and back',
          test: (ctx) => {
            const s = ctx.rec('star');
            if (s.firstIntentT == null || s.firstIndicatorT == null || s.firstMoveT == null) return false;
            if (s.firstIndicatorT - s.firstIntentT < Math.max(0, ctx.star.tPrep - 0.3)) return false;
            if (s.firstMoveT - s.firstIndicatorT < Math.max(0, ctx.star.tSignal - 0.3)) return false;
            const back = ctx.star.hogger ? true : s.movedRight; // a hogger has no reason to return
            return s.movedLeft && back && s.minGapT > 0.5;
          },
        },
      };
    },
  },

  // Gives way: does it pull out in front of the faster car behind, or wait?
  yield: {
    title: 'Giving way',
    about: (c) =>
      `${c.spec.name} comes up behind a slow car with a faster car closing in the left lane. ` +
      'The gap check is the hard limit; politeness only nudges whether it wants to go inside it.',
    lanes: 2,
    seconds: 18,
    applies: (s) => s.p != null,
    build(c) {
      const slow = neutral(c, 'slow', 0, ahead(50, 4.8, c.starLen), Math.max(45, c.vWant - 25), {}, Math.max(45, c.vWant - 25));
      const fast = ordinary(c, 'fast', 'sedan', 1, behind(62, 4.75, c.starLen), Math.min(150, c.vWant + 15), {}, Math.min(155, c.vWant + 18));
      const vehicles = [starSpec(c, 0, c.starStart), slow, fast];
      const captions = [
        {
          when: (ctx) => ctx.rec('star').firstIntentT != null,
          text: () => 'wants the left lane for the slow car',
          hold: 2.0,
        },
        {
          when: (ctx) => {
            const s = ctx.rec('star');
            const pass = ctx.rec('fast').passedStarT;
            return s.firstMoveT != null && (pass == null || s.firstMoveT < pass);
          },
          text: (ctx) =>
            `pulls out in front of it: politeness ${one(ctx.star.p, 2)} and a ${one(ctx.star.tSafe, 2)} s gap check let it`,
          hold: 4,
          group: 'outcome',
        },
        {
          when: (ctx) => {
            const s = ctx.rec('star');
            const pass = ctx.rec('fast').passedStarT;
            if (s.firstIntentT == null || pass == null) return false;
            return s.firstMoveT == null || s.firstMoveT > pass;
          },
          text: (ctx) =>
            `waits for it: politeness ${one(ctx.star.p, 2)}, but the ${one(ctx.star.tSafe, 2)} s gap check is the hard limit`,
          hold: 4,
          group: 'outcome',
        },
        {
          when: (ctx) => ctx.t > 7,
          text: (ctx) => {
            const a = ctx.rec('fast').minAcc;
            return a < -0.35
              ? `the faster car behind has to lift (${one(-a, 1)} m/s²)`
              : 'the faster car behind is not held up';
          },
          hold: 3,
        },
      ];
      return {
        vehicles,
        captions,
        expect: {
          label: 'yields, or takes the gap only with a low tSafe; nobody emergency-stops',
          test: (ctx) => {
            const s = ctx.rec('star');
            const moved = s.firstMoveT != null;
            const pass = ctx.rec('fast').passedStarT;
            // "Yielded" means it let the faster car past before moving out.
            // Most drivers do; a low tSafe can still take the gap, as long as
            // the car behind is not forced into an emergency stop.
            const yielded = !moved || (pass != null && s.firstMoveT > pass);
            const fastAcc = ctx.rec('fast').minAcc;
            if (!yielded) return ctx.star.tSafe < 0.75 && fastAcc > -6;
            return fastAcc > -6;
          },
        },
      };
    },
  },

  // Accepts a gap: the gap behind in the target lane is the whole question.
  safe: {
    title: 'Accepts a gap',
    about: (c) =>
      `${c.spec.name} would gain a little by moving right, but only if the car behind in that lane ` +
      'leaves the gap its tSafe asks for.',
    lanes: 2,
    seconds: 16,
    applies: (s) => s.tSafe != null,
    build(c) {
      const gapSec = 1.0;
      const gapM = gapSec * (c.starStart / 3.6);
      const leftLead = neutral(c, 'left lead', 1, ahead(78, 4.8, c.starLen), Math.max(50, c.vWant - 20), {}, Math.max(50, c.vWant - 20));
      const rightLead = neutral(c, 'right lead', 0, ahead(105, 4.8, c.starLen), c.vWant, {}, c.vWant);
      // A close follower at the star's starting speed: its own short T keeps its
      // IDM out of the decision, so tSafe is the only number that matters.
      const follower = neutral(c, 'follower', 0, behind(gapM, 4.8, c.starLen), c.starStart, { T: 0.55, bSafe: 4 }, c.starStart);
      const vehicles = [starSpec(c, 1, c.starStart), leftLead, rightLead, follower];
      const captions = [
        {
          when: (ctx) => ctx.rec('star').firstIntentT != null,
          text: () => 'wants the right lane for a little more speed',
          hold: 2.0,
        },
        {
          when: (ctx) => ctx.rec('star').firstMoveT != null,
          text: (ctx) =>
            `takes it: tSafe ${one(ctx.star.tSafe, 2)} s and the gap is ${one(gapSec, 2)} s`,
          hold: 4,
          group: 'outcome',
        },
        {
          when: (ctx) => ctx.t > 8 && ctx.rec('star').firstMoveT == null,
          text: (ctx) =>
            `won't take it: tSafe ${one(ctx.star.tSafe, 2)} s wants more than the ${one(gapSec, 2)} s on offer`,
          hold: 4,
          group: 'outcome',
        },
      ];
      return {
        vehicles,
        captions,
        expect: {
          label: 'the move matches its tSafe against the staged gap (with a small dead band)',
          test: (ctx) => {
            const moved = ctx.rec('star').firstMoveT != null;
            const ts = ctx.star.tSafe;
            if (Math.abs(ts - gapSec) < 0.06) return true; // too close to call
            return moved === ts < gapSec;
          },
        },
      };
    },
  },

  // Keep-right urge / hogger: an empty right lane is the whole test.
  keepright: {
    title: 'Keep-right urge',
    about: (c) =>
      `${c.spec.name} sits in the middle lane with an empty right lane. Its keep-right urge ` +
      'and the hogger flag decide whether it ever moves over.',
    lanes: 3,
    seconds: 13,
    applies: (s) => s.bias != null,
    build(c) {
      const vehicles = [starSpec(c, 1, c.starStart)];
      const captions = [
        {
          when: (ctx) => ctx.rec('star').firstMoveT != null && ctx.rec('star').movedRight,
          text: (ctx) =>
            `moves right after ${one(ctx.rec('star').firstMoveT, 1)} s (keep-right urge ${one(ctx.star.bias, 2)})`,
          hold: 4,
          group: 'outcome',
        },
        {
          when: (ctx) => ctx.t > 8 && ctx.rec('star').firstMoveT == null,
          text: (ctx) =>
            `stays in the middle (urge ${one(ctx.star.bias, 2)}${ctx.star.hogger ? ', hogger' : ''}); an empty lane is not a reason`,
          hold: 4,
          group: 'outcome',
        },
      ];
      return {
        vehicles,
        captions,
        expect: {
          label: 'moves right exactly when its keep-right urge clears the threshold',
          test: (ctx) => {
            const moved = ctx.rec('star').movedRight;
            const bias = ctx.star.bias;
            if (Math.abs(bias - 0.12) < 0.025) return true; // dead band at the threshold
            return moved === bias > 0.12;
          },
        },
      };
    },
  },

  // Presses while waiting: a blocked overtake still closes the gap.
  press: {
    title: 'Pressing while it waits',
    about: (_c) =>
      'A slow car blocks the right lane and another car blocks the left. It wants past, ' +
      'cannot go, and its press knob decides how close it gets while it waits.',
    lanes: 2,
    seconds: 13,
    applies: (s) => s.press && s.press.max > 0.05,
    build(c) {
      const slow = neutral(c, 'slow', 0, ahead(58, 4.8, c.starLen), Math.max(45, c.vWant - 30), {}, Math.max(45, c.vWant - 30));
      const blocker = neutral(c, 'blocker', 1, ahead(13, 4.8, c.starLen), c.vWant, {}, c.vWant);
      const vehicles = [starSpec(c, 0, c.starStart), slow, blocker];
      const captions = [
        {
          when: (ctx) => ctx.rec('star').firstIntentT != null,
          text: () => 'wants the left lane, but the car there is in the way',
          hold: 2.4,
        },
        {
          when: (ctx) => ctx.rec('star').minT < (ctx.star.Tbase ?? ctx.star.T) - 0.06,
          text: (ctx) =>
            `closes up while it waits: ${one(ctx.star.Tbase, 2)} → ${one(ctx.rec('star').minT, 2)} s (press ${one(ctx.star.press, 2)})`,
          hold: 4,
          group: 'outcome',
        },
        {
          when: (ctx) => ctx.t > 8 && ctx.rec('star').minT >= (ctx.star.Tbase ?? ctx.star.T) - 0.06,
          text: (ctx) => `barely presses (${one(ctx.star.press, 2)}): the gap hardly changes`,
          hold: 4,
          group: 'outcome',
        },
      ];
      return {
        vehicles,
        captions,
        expect: {
          label: 'the headway drop matches its press knob',
          test: (ctx) => {
            const base = ctx.star.Tbase ?? ctx.star.T;
            const drop = base - ctx.rec('star').minT;
            const want = 0.4 * base * ctx.star.press;
            return drop >= want - 0.08;
          },
        },
      };
    },
  },

  // Reads ahead: lift off for a car that signals into your lane, early.
  antic: {
    title: 'Reading ahead',
    about: (c) =>
      'A car ahead in the right lane comes up behind a much slower one and signals left into your lane. ' +
      `${c.spec.name}'s anticipation decides how early it lifts off.`,
    lanes: 3,
    seconds: 15,
    applies: (s) => s.antic != null,
    build(c) {
      const slow = ordinary(c, 'slow', 'hatch', 0, ahead(120, 4.1, c.starLen), Math.max(35, c.vWant - 55), { cooldown: 1e9 }, Math.max(35, c.vWant - 55));
      const merger = ordinary(c, 'merger', 'estate', 0, ahead(65, 4.8, c.starLen), Math.max(45, c.vWant - 40), {
        cooldown: 0.1,
        decT: 0.1,
        tPrep: 0.2,
        tSignal: 0.7,
        tSafe: 0.35,
        p: 0,
        bias: 0,
        antic: 0.3,
        thr: 0.05,
        strict: false,
      }, Math.max(45, c.vWant - 40));
      const vehicles = [starSpec(c, 1, c.starStart), slow, merger];
      const captions = [
        {
          when: (ctx) => ctx.actor('merger') && ctx.actor('merger').indicator !== 0,
          text: () => 'the car ahead signals left into your lane',
          hold: 1.8,
        },
        {
          when: (ctx) => ctx.rec('star').anticOnT != null && ctx.rec('merger').firstIndicatorT != null,
          text: (ctx) => {
            const lead = Math.max(0, ctx.rec('merger').firstIndicatorT - ctx.rec('star').anticOnT);
            return lead > 0.1
              ? `already lifting ${one(lead, 1)} s before the signal is out (reads ahead ${one(ctx.star.antic, 2)})`
              : `lifts as the signal comes on (reads ahead ${one(ctx.star.antic, 2)})`;
          },
          hold: 4,
          group: 'outcome',
        },
        {
          when: (ctx) => ctx.t > 9 && ctx.rec('star').anticOnT == null,
          text: (ctx) => `drives on: reads ahead only ${one(ctx.star.antic, 2)}`,
          hold: 4,
          group: 'outcome',
        },
      ];
      return {
        vehicles,
        captions,
        expect: {
          label: 'lifts for the signal exactly when its anticipation reaches it (with a dead band)',
          test: (ctx) => {
            const seen = ctx.rec('star').anticOnT != null;
            const an = ctx.star.antic;
            // The merger is 65 m ahead; the reach is 30 + v*5*an, so ~0.3 is
            // where a driver starts to see it before the signal.
            if (Math.abs(an - 0.3) < 0.08) return true; // dead band around the reach threshold
            return seen === an > 0.3;
          },
        },
      };
    },
  },

  // Behind a truck: the grijze sok's slipstream gap.
  draft: {
    title: 'Behind a truck',
    about: (c) =>
      `A truck runs at 80. ${c.spec.name} closes to its normal headway first, then its Tdraft ` +
      'takes over: the only place that gap exists.',
    lanes: 2,
    seconds: 23,
    applies: (s) => !!s.Tdraft,
    build(c) {
      const truckGap = 60;
      const truck = {
        tag: 'truck',
        type: 'truck',
        variant: 'truck',
        lane: 0,
        ds: STAR_DS + ahead(truckGap, 16.8, c.starLen),
        kmh: 78,
        want: 78,
        params: { cooldown: 1e9 },
      };
      const vehicles = [starSpec(c, 0, c.starStart), truck];
      const captions = [
        {
          when: (ctx) => ctx.rec('star').draftingT != null,
          text: (ctx) =>
            `is drafting at ${one(secsOf(ctx.leader('star').gap, ctx.star), 2)} s (normal T ${one(ctx.star.Tbase ?? ctx.star.T, 2)} s)`,
          hold: 4,
        },
        {
          when: (ctx) => Math.abs(ctx.star.T - (ctx.star.Tdraft ?? ctx.star.T)) < 0.1,
          text: (ctx) => `settles at Tdraft ${one(ctx.star.Tdraft, 2)} s, a slipstream gap`,
          hold: 4,
        },
      ];
      return {
        vehicles,
        captions,
        expect: {
          label: 'drafts behind the truck and settles at Tdraft',
          test: (ctx) => ctx.rec('star').draftingT != null && Math.abs(ctx.star.T - ctx.star.Tdraft) < 0.12,
        },
      };
    },
  },
};

/** The car each demo is about, so the rig can keep it in frame. */
const DEMO_FOCUS = {
  react: 'lead',
  signal: 'slow',
  yield: 'fast',
  safe: 'follower',
  press: 'slow',
  antic: 'merger',
  draft: 'truck',
};

/** Order in which a persona's first available demo is picked. */
const DEMO_PRIORITY = ['draft', 'signal', 'keepright', 'yield', 'pace'];

export const DEMO_TRAITS = Object.keys(DEMO_DEFS);

export function demoKey(persona, trait) {
  return trait ? `demo:${persona}:${trait}` : `demo:${persona}`;
}

function hashTrait(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Build one demo at a given limit. The screen and the headless tool both use
 *  this, so a demo cannot be one thing on the rig and another in the test. */
export function buildDemo(persona, trait, limit = DEMO_LIMIT) {
  const spec = sampleSpec(persona);
  const def = DEMO_DEFS[trait];
  if (!spec || !def || !def.applies(spec)) return null;
  const variant = defaultVariant(persona);
  if (!variant) return null;
  const vWant = Math.round(limit + mid(spec.offset));
  const c = {
    key: persona,
    trait,
    spec,
    limit,
    vWant,
    // Start below even the lowest wanted speed the persona can draw, so the
    // star accelerates into its own v0 instead of braking down to it on frame one.
    starStart: Math.max(35, limit + spec.offset.min - 6),
    variant,
    starLen: meta(variant).len,
  };
  const built = def.build(c);
  const starDs = STAR_DS;
  return {
    title: `${spec.name}: ${def.title}`,
    about: def.about(c),
    lanes: def.lanes,
    timeOfDay: 'day',
    seed: (personaSeed(persona) ^ hashTrait(trait) ^ (limit * 7919)) >>> 0,
    density: 0,
    // Free play parks you behind the demonstration rather than in it.
    player: { lane: 0, kmh: limit, want: limit },
    vehicles: built.vehicles,
    demo: {
      star: 'star',
      persona,
      name: spec.name,
      spec,
      trait,
      lanes: def.lanes,
      seconds: def.seconds,
      starDs,
      focus: DEMO_FOCUS[trait] || null,
      settleLead: built.settleLead || null,
      captions: built.captions,
      expect: built.expect,
    },
  };
}

/** Which traits a persona has a demo for, in the sheet's order. */
export function demoTraits(persona) {
  return DEMO_TRAITS.filter((t) => !!buildDemo(persona, t));
}

export function hasDemo(persona, trait) {
  return !!buildDemo(persona, trait);
}

/** The `demo:<persona>` alias: the persona's most characteristic staged demo. */
export function baseDemoTrait(persona) {
  const have = new Set(demoTraits(persona));
  for (const t of DEMO_PRIORITY) if (have.has(t)) return t;
  return null;
}

// Register every demo as a scenario, so `?scenario=demo:sok` and the headless
// tools can run it with the same applyScenario() as every other situation.
for (const persona of Object.keys(ARCHETYPES)) {
  for (const trait of demoTraits(persona)) {
    const sc = buildDemo(persona, trait);
    if (sc) SCENARIOS[demoKey(persona, trait)] = sc;
  }
  const base = baseDemoTrait(persona);
  if (base) SCENARIOS[demoKey(persona)] = SCENARIOS[demoKey(persona, base)];
}


export function applyScenario(traffic, sc, sPlayer, { includeYou = false } = {}) {
  for (const v of traffic.vehicles) traffic.onRemove(v);
  traffic.vehicles.length = 0;
  traffic.density = sc.density ?? 0;
  traffic.rng = mulberry32(sc.seed ?? 1); // same drivers every run
  traffic.time = 0;
  traffic.closures.length = 0;
  for (const c of sc.closures || []) traffic.addClosure(c.lane, sPlayer + c.ds, sPlayer + c.ds + c.len);
  traffic.ramps.length = 0;
  for (const r of sc.ramps || []) traffic.addRamp(sPlayer + r.ds, r.perMin != null ? { perMin: r.perMin } : {});
  const specs = [...sc.vehicles];
  if (includeYou) specs.push({ tag: 'you', type: 'car', variant: 'estate', lane: sc.player.lane, ds: 0, kmh: sc.player.kmh, want: sc.player.want });
  const placed = [];
  for (const spec of specs) {
    const veh = traffic.makeVehicle(spec.type, spec.variant, spec.persona ?? null, true);
    veh.tag = spec.tag;
    veh.lane = veh.targetLane = spec.lane;
    veh.u = traffic.dir * (sPlayer + spec.ds);
    veh.v = spec.kmh * KMH;
    veh.latLocal = laneLat(spec.lane, traffic.N);
    const want = spec.want ?? (spec.persona ? null : spec.kmh);
    if (want != null) {
      if (veh.type === 'car' || veh.type === 'van') veh.limitOffset = want - traffic.limitKmh;
      else veh.ownMax = want;
    }
    traffic.applyLimit(veh);
    veh.v0 = veh.v0base;
    Object.assign(veh, spec.params || {});
    traffic.vehicles.push(veh);
    traffic.onAdd(veh);
    placed.push(veh);
  }
  traffic.buildLanes(null);
  return placed;
}
