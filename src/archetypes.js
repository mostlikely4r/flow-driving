// Driver archetypes: a persona decides both how a car looks and how it is
// driven, so you can read a driver from the mirror.
//
// Tendency, not a guarantee: a car that LOOKS like an archetype drives like it
// `loyalty` of the time (~70%); otherwise it gets a normal driver. Normal-
// looking cars still include the random speeders, slowpokes and hoggers.
//
// `share` is the chance that a car of a matching body style gets this look.
import { clamp, mulberry32, pickWeighted } from './util.js';
import { CONFIG } from './config.js';

const lerp = (r, a, b) => a + r() * (b - a);

export const ARCHETYPES = {
  leasebak: {
    name: 'Leasebak',
    variants: { estate: 0.3, sedan: 0.3 },
    colors: [[0x1a1b1d, 5], [0x34373b, 6], [0x55595e, 3], [0x1d2b4d, 1.5]],
    lights: 'bar',
    loyalty: 0.7,
    // Experienced and in a hurry: fast, short headway, reads the road well
    // (lifts early instead of braking late), not very polite.
    drive(veh, r) {
      veh.limitOffset = lerp(r, 18, 32);
      veh.T = lerp(r, 0.8, 1.1);
      veh.p = lerp(r, 0, 0.12);
      veh.coop = r() < 0.2 ? 1 : 0;
      veh.bias = lerp(r, 0.08, 0.16); // happy to stay left
      veh.antic = lerp(r, 0.6, 0.9);
      veh.tSignal = lerp(r, 0.8, 1.4);
      veh.lcDur = lerp(r, 2.8, 3.6);
      veh.tSafe = lerp(r, 0.4, 0.6);
      veh.driftMax = lerp(r, 0.35, 0.55); // edges out, visibly impatient
      veh.press = lerp(r, 0.6, 0.9); // sits on the bumper of whatever is slow
      veh.tPrep = lerp(r, 0.3, 0.7);
    },
  },
  patser: {
    name: 'Patser',
    variants: { hatch: 0.16 },
    colors: [[0x0c0c0d, 8], [0x1a1b1d, 3], [0xe9eaea, 1]],
    lights: 'angel',
    low: true,
    tint: true,
    loyalty: 0.7,
    // Erratic: tailgates, cuts in late with barely a signal, undertakes,
    // reads nothing ahead, so it brakes hard.
    drive(veh, r) {
      veh.limitOffset = lerp(r, 12, 36);
      veh.T = lerp(r, 0.55, 0.85);
      veh.a *= 1.35;
      veh.p = 0;
      veh.coop = 0;
      veh.strict = false;
      veh.thr = 0.05;
      veh.bias = lerp(r, 0.1, 0.2);
      veh.antic = lerp(r, 0.03, 0.25);
      veh.tSignal = lerp(r, 0.15, 0.5);
      veh.lcDur = lerp(r, 2.2, 3.0);
      veh.tSafe = lerp(r, 0.25, 0.4);
      veh.bSafe = lerp(r, 3.5, 4.2);
      veh.driftMax = lerp(r, 0.03, 0.1); // no warning
      veh.press = lerp(r, 0.85, 1);
      veh.tPrep = lerp(r, 0, 0.15);
    },
  },
  pensioner: {
    name: 'Pensioner',
    variants: { hatch: 0.28 },
    colors: [[0x9a9fa3, 6], [0xc9b98f, 3], [0x7a6a55, 2], [0x8aa3b5, 2], [0x274030, 1.5], [0x6b2430, 1]],
    lights: 'round',
    loyalty: 0.75,
    // Under the limit, keeps right, signals early and long, leaves big gaps,
    // very polite and sees everything coming.
    drive(veh, r) {
      veh.limitOffset = lerp(r, -13, -5);
      veh.T = lerp(r, 1.6, 2.2);
      veh.a *= 0.8;
      veh.p = lerp(r, 0.6, 0.9);
      veh.coop = 1;
      veh.strict = true;
      veh.hogger = false;
      veh.bias = lerp(r, 0.45, 0.6);
      veh.antic = lerp(r, 0.7, 0.95);
      veh.tSignal = lerp(r, 2.6, 3.8);
      veh.lcDur = lerp(r, 5.0, 6.5);
      veh.tSafe = lerp(r, 1.0, 1.5);
      veh.tSafePlayer = veh.tSafe + 0.4;
      veh.bSafe = lerp(r, 1.2, 1.8);
      veh.driftMax = lerp(r, 0.08, 0.18);
      veh.press = 0;
      veh.tPrep = lerp(r, 1.5, 2.5); // a good long look in the mirror first
    },
  },
};

const NORMAL_COLORS = [
  [0x8d9296, 16], // silver
  [0x5b5f63, 13], // grey
  [0x1a1b1d, 13], // black
  [0xe9eaea, 18], // white
  [0x1d2b4d, 9], // dark blue
  [0x2e5aa8, 5], // blue
  [0x8e1c1c, 6], // red
  [0x274030, 2], // dark green
  [0x7a6a55, 3], // beige/brown
  [0xb84f1a, 1.5], // orange
  [0x3f6f7a, 2], // petrol
  [0xc9b98f, 1.5], // champagne
];

/** Pick a persona (look) for a new car, or null for an ordinary one. */
export function pickPersona(variant, r) {
  const x = r() / Math.max(1e-6, CONFIG.archetypes ?? 1);
  let acc = 0;
  for (const [key, a] of Object.entries(ARCHETYPES)) {
    acc += a.variants[variant] || 0;
    if (x < acc) return key;
  }
  return null;
}

/**
 * Apply a persona's driving to a freshly made vehicle. `force` skips the
 * loyalty roll (scenarios).
 */
export function applyPersona(veh, persona, r, force = false) {
  veh.persona = persona;
  veh.drives = null;
  const a = persona && ARCHETYPES[persona];
  if (!a) return;
  if (!force && r() >= a.loyalty) return; // looks the part, drives like anyone
  veh.drives = persona;
  a.drive(veh, r);
  veh.T = clamp(veh.T, 0.5, 3);
  veh.antic = clamp(veh.antic, 0, 1);
}

/** Visual look for a vehicle: deterministic from its seed. */
export function lookFor(veh) {
  if (veh.type !== 'car') return null;
  const r = mulberry32(veh.seed ^ 0x5eed);
  const a = veh.persona && ARCHETYPES[veh.persona];
  if (!a) return { color: pickWeighted(r, NORMAL_COLORS), lights: r() < 0.4 ? 'modern' : 'std', low: false, tint: false };
  return { color: pickWeighted(r, a.colors), lights: a.lights, low: !!a.low, tint: !!a.tint };
}
