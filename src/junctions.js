// Junctions (F-20 slice 2): where a motorway junction is, the s-marks of its
// exit and on-ramp, and how the ramp and exit roads run up to the crossing road.
//
// No rendering, no Three.js: the sim (`traffic.js`, `session.js`) and the
// scenery both ask these functions, so a ramp in the sim is always where the
// road draws it. Placement is seedless, like the per-km scenery: it follows
// from s alone.
//
// A Dutch aansluiting, in your direction of travel: exit signs 1200 and 600 m
// ahead, countdown markers (afritbakens) at 300 / 200 / 100 m, the exit lane
// opening, the exit road climbing to the crossing road, the bridge over the
// motorway, and then the on-ramp road coming down from the crossing road onto
// the acceleration strip.
import { CONFIG } from './config.js';
import { hash01, clamp, smooth01 } from './util.js';
import { guardrailLat, laneLat } from './layout.js';

// One junction per block. A block is the mean of `junctionEveryKm`, and the
// bridge sits in the middle third of it, so consecutive junctions end up
// `junctionEveryKm` apart (3–6 km for [3, 6]).
const blockM = () => (((CONFIG.junctionEveryKm[0] + CONFIG.junctionEveryKm[1]) / 2) * 1000);
export const BRIDGE_PLATEAU_M = 63; // flat embankment top beside the deck (the ramp starts on it)
export const DECK_Y = 6.9; // height of the crossing road over the motorway
export const RAMP_TOP_LAT = () => guardrailLat() + 45; // where cars join the ramp road, on the embankment

// Exit sides: a made-up route number, and the places you would be heading for.
// (Kept here, not in scenery.js, so the sim side can read them without Three.)
export const DUTCH_PLACES = [
  ['Utrecht', 'Amersfoort'], ['Amsterdam', 'Schiphol'], ['Rotterdam', 'Gouda'], ['Den Haag', 'Leiden'], ['Arnhem', 'Ede'],
  ['Zwolle', 'Deventer'], ['Eindhoven', 'Den Bosch'], ['Breda', 'Tilburg'], ['Nijmegen', 'Tiel'], ['Apeldoorn', 'Hoevelaken'],
  ['Groningen', 'Assen'], ['Almere', 'Lelystad'], ['Hilversum', 'Bussum'], ['Gorinchem', 'Dordrecht'], ['Venlo', 'Roermond'],
];
export const ROUTES = ['A1', 'A2', 'A12', 'A27', 'A28', 'A15', 'A4', 'A50', 'A16', 'A58'];

/** Distance from s to the nearest matrix or ANWB gantry (m). */
function nearestGantry(s) {
  const K = Math.floor(s / 1000);
  let best = Infinity;
  for (let k = K - 1; k <= K + 1; k++) {
    for (const off of [160, 660]) best = Math.min(best, Math.abs(s - (k * 1000 + off)));
    if (hash01(k, 3) < 0.3) best = Math.min(best, Math.abs(s - (k * 1000 + 860)));
  }
  return best;
}

/** The bridge of block b, nudged out of the way of the gantries (never dropped). */
function bridgeS(b) {
  // Block 0 is fixed: free play meets its first junction within about a minute.
  if (b === 0) return 2500;
  const B = blockM();
  const base = b * B + B / 3 + hash01(b, 91) * (B / 3);
  for (let d = 0; d <= 400; d += 20) {
    const cand = d === 0 ? [base] : [base + d, base - d];
    for (const s of cand) if (nearestGantry(s) > 60) return s;
  }
  return base;
}

const cache = new Map();

/**
 * The random viaduct in km block K: its s, or null if that block has none. A
 * junction brings its own bridge, so no viaduct is put on top of one. The
 * scenery draws these, and F-48's guideway spine stops for them.
 */
export function overpassS(K) {
  if (!(hash01(K, 1) < 0.24)) return null;
  const s = K * 1000 + 520;
  for (const j of junctionsNear(s - 1000, s + 1000)) if (Math.abs(j.sBridge - s) < 1000) return null;
  return s;
}

/**
 * One junction, from its block number. All marks are in your direction of
 * travel (s increasing) and derived from the bridge.
 */
export function junction(b) {
  if (cache.has(b)) return cache.get(b);
  const sBridge = bridgeS(b);
  const roadM = CONFIG.rampRoadM;
  const stripM = CONFIG.rampStripM;
  const exitStart = sBridge - 520;
  const exitGore = sBridge - 320;
  const rampTop = sBridge + 15;
  const s0 = rampTop + roadM;
  const s1 = s0 + stripM;
  const j = {
    b,
    sBridge,
    exitStart,
    exitGore,
    exitTop: sBridge - 15,
    rampTop,
    s0,
    s1,
    signA: exitStart - 1200,
    signB: exitStart - 600,
    bakens: [exitStart - 300, exitStart - 200, exitStart - 100],
    number: 10 + (((b % 80) + 80) % 80), // no real numbering
    route: ROUTES[Math.floor(hash01(b, 93) * ROUTES.length)],
    place: DUTCH_PLACES[Math.floor(hash01(b, 92) * DUTCH_PLACES.length)],
  };
  // (a getter: the lane count can change after this object is cached, e.g. the persona rig)
  Object.defineProperty(j, 'stripOuter', { get: () => laneLat(-1) + CONFIG.laneWidth / 2 + 0.5, enumerable: true });
  j.spanA = j.signA - 100;
  j.spanB = s1 + 250;
  cache.set(b, j);
  if (cache.size > 128) cache.delete(cache.keys().next().value);
  return j;
}

/** Junctions whose drawn pieces reach into [sa, sb]. */
export function junctionsNear(sa, sb) {
  const out = [];
  const B = blockM();
  const b0 = Math.floor((sa - 4000) / B);
  const b1 = Math.floor((sb + 400) / B);
  for (let b = b0; b <= b1; b++) {
    const j = junction(b);
    if (j.spanB > sa && j.spanA < sb) out.push(j);
  }
  return out;
}

// Distribution centres (F-40) sit in 5 km blocks; a junction inside such a
// block gets the estate on its on-ramp side, so the lorries you see coming down
// the ramp are the ones from the estate. Both the scenery and the sim ask this.
export const ESTATE_BLOCK = 5000;
export const ESTATE_SHARE = 0.8;

/** The junction that holds the estate of 5 km block b, if block b has one. */
export function junctionAtEstateBlock(b) {
  for (const j of junctionsNear(b * ESTATE_BLOCK, b * ESTATE_BLOCK + ESTATE_BLOCK - 1)) {
    if (j.sBridge >= b * ESTATE_BLOCK && j.sBridge < (b + 1) * ESTATE_BLOCK) return j;
  }
  return null;
}

/** Does junction j have a distribution centre beside its on-ramp? */
export function junctionHasEstate(j) {
  const b = Math.floor(j.sBridge / ESTATE_BLOCK);
  if (!(hash01(b, 41) < ESTATE_SHARE)) return false;
  const at = junctionAtEstateBlock(b);
  return !!at && at.b === j.b;
}

/** Is the motorway lit at s because a junction is there? */
export function junctionLitAt(s) {
  for (const j of junctionsNear(s, s)) if (s > j.exitStart - 200 && s < j.s1 + 200) return true;
  return false;
}

/**
 * The ramp road: where a car coming down from the crossing road is, at s.
 * lat eases from the embankment top beside the crossing road to lane -1;
 * y eases from the deck height to 0, finishing 60 m before s0 so the last
 * part runs flat beside the gore.
 */
export function rampProfile(sTop, s0, s) {
  const lat0 = RAMP_TOP_LAT();
  const lat1 = laneLat(-1);
  const len = Math.max(1, s0 - sTop);
  const p = clamp((s - sTop) / len, 0, 1);
  const yEnd = Math.max(sTop + 1, s0 - 60);
  const q = clamp((s - sTop) / (yEnd - sTop), 0, 1);
  return { lat: lat0 + (lat1 - lat0) * smooth01(p), y: DECK_Y * (1 - smooth01(q)) };
}

/** The ramp road of junction j at s (rampTop .. s0). */
export function rampPath(j, s) {
  return rampProfile(j.rampTop, j.s0, s);
}

/** The exit road at s (exitGore .. exitTop): the mirror of the ramp road. */
export function exitPath(j, s) {
  const lat0 = laneLat(-1);
  const lat1 = RAMP_TOP_LAT();
  const len = Math.max(1, j.exitTop - j.exitGore);
  const p = clamp((s - j.exitGore) / len, 0, 1);
  const q = clamp((s - j.exitGore - 60) / Math.max(1, len - 60), 0, 1);
  return { lat: lat0 + (lat1 - lat0) * smooth01(p), y: DECK_Y * smooth01(q) };
}

/** s mirrored around the bridge: the same place in the other carriageway's frame. */
export const mirrorS = (j, s) => 2 * j.sBridge - s;

/**
 * The ramp and exit roads of one carriageway as segments in our s, so the
 * scenery can draw either side and `inJunction` can test either.
 * lat is signed (positive = your side of the road).
 */
export function roadSegments(j, sg = 1) {
  const mir = (s) => mirrorS(j, s);
  const seg = (sA, sB, at) => ({ sA, sB, at });
  if (sg > 0) {
    return [
      seg(j.rampTop, j.s0, (s) => rampPath(j, s)),
      seg(j.exitGore, j.exitTop, (s) => exitPath(j, s)),
    ];
  }
  return [
    seg(mir(j.s0), mir(j.rampTop), (s) => {
      const p = rampPath(j, mir(s));
      return { lat: -p.lat, y: p.y };
    }),
    seg(mir(j.exitTop), mir(j.exitGore), (s) => {
      const p = exitPath(j, mir(s));
      return { lat: -p.lat, y: p.y };
    }),
  ];
}

/**
 * Does (s, lat) lie on a junction's works: the ramp or exit road with its
 * embankment, the crossing road, the paved strip and the signs? Used to keep
 * trees, farms and estates off them.
 */
export function inJunction(s, lat, margin = 0) {
  const l = Math.abs(lat);
  const sg = lat >= 0 ? 1 : -1;
  for (const j of junctionsNear(s, s)) {
    // the crossing road over the motorway, out into the fields
    if (Math.abs(s - j.sBridge) < 26 + margin && l < 320 + margin) return true;
    // the widened pavement of the exit lane and the strip
    if (sg > 0 && s > j.exitStart - margin && s < j.s1 + 90 + margin && l < j.stripOuter + 4 + margin) return true;
    for (const seg of roadSegments(j, sg)) {
      if (s < seg.sA - margin || s > seg.sB + margin) continue;
      const p = seg.at(clamp(s, seg.sA, seg.sB));
      // the ribbon plus its shoulders plus the embankment under it (1:2 out from the edge)
      if (Math.abs(l - Math.abs(p.lat)) < 8 + 2 * Math.max(0, p.y) + margin) return true;
    }
  }
  return false;
}
