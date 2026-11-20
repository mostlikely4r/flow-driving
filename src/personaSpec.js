// The numbers behind a persona, sampled from the code that drives it rather
// than written down here. Everything the viewer shows and (later) the headless
// persona test asserts comes from this one module, so screen and test cannot
// drift apart.
//
// `sampleSpec()` runs a persona's drive() 400 times on a bare vehicle with a
// seeded RNG and `force` (loyalty skipped), then reports the range each field
// landed in. Add a persona to ARCHETYPES and it appears here by itself.
//
// headwayGap()/gapSeconds() turn the headway a stage car actually carries into
// the metres the rig draws, so the bracket and the sheet read the same number.
import { ARCHETYPES, applyPersona, lookFor } from './archetypes.js';
import { VARIANTS } from './variants.js';
import { mulberry32 } from './util.js';

// Base vehicle parameters from traffic.js TYPE_PARAMS: a persona's drive()
// scales these (patser a ×1.35, ev a/b ×0.85), so the sample has to start from
// the same values the traffic does.
const BASE = {
  car: { a: 1.5, b: 2.1 },
  van: { a: 1.15, b: 2.0 },
};

function hashKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable seed for a persona. The paint is derived from this alone, so every
 *  body style of a persona is the same colour, and reopening changes nothing. */
export function personaSeed(key) {
  return hashKey(`cast:${key}`);
}

/** The bodies a persona inhabits, heaviest first, with weights as fractions. */
export function variantsOf(key) {
  const a = ARCHETYPES[key];
  if (!a) return [];
  const entries = Object.entries(a.variants || {});
  const total = entries.reduce((n, [, w]) => n + w, 0) || 1;
  return entries
    .map(([variant, weight]) => ({ variant, weight: weight / total }))
    .sort((x, y) => y.weight - x.weight);
}

/** Weighted default body, stable for a persona. */
export function defaultVariant(key) {
  const list = variantsOf(key);
  if (!list.length) return null;
  let x = mulberry32(personaSeed(key) ^ 0x1f35)();
  for (const v of list) {
    x -= v.weight;
    if (x <= 0) return v.variant;
  }
  return list[list.length - 1].variant;
}

function baseFor(variant) {
  const v = VARIANTS[variant] || VARIANTS.hatch;
  return { v, base: BASE[v.type] || BASE.car };
}

function bareVehicle(key, variant) {
  const { v, base } = baseFor(variant);
  const veh = {
    type: v.type,
    variant,
    persona: key,
    seed: personaSeed(key),
    len: v.len,
    width: v.width,
    frontLen: v.frontLen,
    a: base.a,
    b: base.b,
    s0: 2.0,
    T: 1.25,
    // Sentinel for on/off traits: a persona that never writes the field leaves
    // it null, so the spec does not claim a value the traffic RNG would pick.
    hogger: null,
    strict: null,
    coop: null,
  };
  return veh;
}

function range(values) {
  let min = Infinity, max = -Infinity;
  for (const x of values) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return values.length ? { min, max } : null;
}

// Two short lines per persona: the authored layer the numbers can't say.
const NOTES = {
  leasebak: ['Reads far ahead, so it lifts early and rarely brakes.', 'Happy to sit in the left lane at speed.'],
  patser: ['Tailgates, undertakes, and signals barely in time.', 'Sees nothing coming, so it brakes hard.'],
  pensioner: ['Potters under the limit and keeps right.', 'Signals long and early, and leaves a lot of room.'],
  sok: ['Finds a truck, tucks in, and stays there.', 'Never presses; gentle on both pedals.'],
  family: ['Steady at the limit, keeps right, does the boring thing.', 'Cooperative and strict: makes room, never hogs.'],
  whitevan: ['Faster than a van should be, and in the middle lane.', 'Presses while it waits, then merges late.'],
  ev: ['Exactly at the limit, smooth as a lift.', 'Camps in the middle lane more often than it admits.'],
};

const SAMPLE_N = 400;
const cache = new Map();

/**
 * Sample a persona's driving. Returns ranges for every field the sheet shows
 * plus the shares of its on/off traits.
 */
export function sampleSpec(key, n = SAMPLE_N) {
  const hit = cache.get(key);
  if (hit && hit.n >= n) return hit;
  const a = ARCHETYPES[key];
  if (!a) return null;
  const variant = defaultVariant(key) || Object.keys(a.variants || {})[0];
  if (!variant) return null;
  const numeric = {};
  const flags = {};
  const rng = mulberry32(personaSeed(key) ^ 0x4004);
  const add = (name, x) => {
    if (typeof x === 'number' && Number.isFinite(x)) (numeric[name] ||= []).push(x);
  };
  const flag = (name, x) => {
    if (x === null || x === undefined) return;
    const f = flags[name] ||= { on: 0, n: 0 };
    f.n++;
    if (x) f.on++;
  };
  for (let i = 0; i < n; i++) {
    const veh = bareVehicle(key, variant);
    applyPersona(veh, key, rng, true);
    const { base } = baseFor(variant);
    add('offset', veh.limitOffset);
    add('T', veh.T);
    add('Tdraft', veh.Tdraft);
    add('p', veh.p);
    add('react', veh.react);
    add('tSignal', veh.tSignal);
    add('antic', veh.antic);
    add('bias', veh.bias);
    add('press', veh.press);
    add('mergeEarly', veh.mergeEarly);
    add('tSafe', veh.tSafe);
    add('lcDur', veh.lcDur);
    add('tPrep', veh.tPrep);
    add('a', veh.a / base.a);
    add('b', veh.b / base.b);
    add('msiOver', veh.msiOver);
    flag('hogger', veh.hogger);
    flag('strict', veh.strict);
    flag('coop', veh.coop);
  }
  const ranges = {};
  for (const [name, vals] of Object.entries(numeric)) ranges[name] = range(vals);
  const shares = {};
  for (const [name, f] of Object.entries(flags)) shares[name] = f.n ? f.on / f.n : null;
  const spec = {
    key,
    name: a.name,
    n,
    loyalty: a.loyalty,
    lights: a.lights,
    low: !!a.low,
    tint: !!a.tint,
    variants: variantsOf(key),
    notes: NOTES[key] || [],
    offset: ranges.offset,
    T: ranges.T,
    Tdraft: ranges.Tdraft,
    p: ranges.p,
    react: ranges.react,
    tSignal: ranges.tSignal,
    antic: ranges.antic,
    bias: ranges.bias,
    press: ranges.press,
    mergeEarly: ranges.mergeEarly,
    tSafe: ranges.tSafe,
    lcDur: ranges.lcDur,
    tPrep: ranges.tPrep,
    a: ranges.a,
    b: ranges.b,
    msiOver: ranges.msiOver,
    shares,
  };
  cache.set(key, spec);
  return spec;
}

/**
 * The time headway a stage car actually drives at: `Tdraft` when asked for, and
 * only when the persona has one — otherwise the plain `T`.
 */
export function headwaySeconds(veh, draft = false) {
  if (!veh) return null;
  const t = draft && veh.Tdraft != null ? veh.Tdraft : veh.T;
  return Number.isFinite(t) ? t : null;
}

/**
 * The bumper-to-bumper gap, in metres, that a time headway means at `kmh`.
 * traffic.gapBetween() measures the same quantity, so the bracket on the rig and
 * the range in the sheet describe one thing.
 */
export function headwayGap(veh, kmh, draft = false) {
  const t = headwaySeconds(veh, draft);
  if (t == null) return null;
  return t * (Math.max(0, kmh) / 3.6);
}

/** Seconds a gap in metres takes to cover at `kmh` — the bracket's own check. */
export function gapSeconds(gap, kmh) {
  return kmh > 0 ? gap / (kmh / 3.6) : null;
}

/**
 * The lead car on the headway rig: an ordinary estate with no persona and a
 * constant speed, so the gap is the only variable on screen. Its paint comes
 * from lookFor() like any other car's.
 */
export function leadVehicle() {
  const v = VARIANTS.estate;
  return {
    type: v.type,
    variant: 'estate',
    persona: null,
    seed: 0x1eaf,
    len: v.len,
    width: v.width,
    frontLen: v.frontLen,
    v: 0,
    T: 1.4,
    s0: 2,
  };
}

/** Wanted speed range (km/h) for a spec at a given limit. */
export function speedRange(spec, limitKmh) {
  if (!spec || !spec.offset) return null;
  return [limitKmh + spec.offset.min, limitKmh + spec.offset.max];
}

/**
 * A concrete, forced instance of a persona for the stage: its look comes from
 * lookFor() (so it is the in-game car), its wanted speed from its own drive().
 */
export function makePersonaVehicle(key, variant) {
  const veh = bareVehicle(key, variant);
  applyPersona(veh, key, mulberry32(personaSeed(key) ^ 0x51ee), true);
  return veh;
}

/** Paint + lamps for (persona, body). A lamp signature can be forced by the
 *  viewer's L key; the paint never changes with it. */
export function personaLook(key, variant, signature = null) {
  const { v } = baseFor(variant);
  const veh = { type: v.type, variant, persona: key, seed: personaSeed(key) };
  const look = lookFor(veh) || { color: 0x8d9296, lights: 'std', low: false, tint: false };
  return signature ? { ...look, lights: signature } : look;
}
