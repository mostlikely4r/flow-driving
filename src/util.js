export const KMH = 1 / 3.6;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of an integer (and optional salt) to [0,1). */
export function hash01(n, salt = 0) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x27d4eb2d, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smooth01(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}
/** Smooth lateral lane-change profile (cosine), derivative available. */
export function lcProfile(t) {
  t = clamp(t, 0, 1);
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}
export function lcProfileDeriv(t) {
  if (t <= 0 || t >= 1) return 0;
  return 0.5 * Math.PI * Math.sin(Math.PI * t);
}

export function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pickWeighted(rng, list) {
  // list: [[value, weight], ...]
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rng() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r <= 0) return v;
  }
  return list[list.length - 1][0];
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Exponential approach factor for frame-rate independent smoothing. */
export const approach = (rate, dt) => 1 - Math.exp(-rate * dt);
