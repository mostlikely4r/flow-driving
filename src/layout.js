// Cross-section of the motorway. Lateral coordinate "lat" is measured from the
// median centre line, positive to the right (your carriageway). Lanes are
// indexed from the RIGHT: lane 0 is the rightmost (keep-right) lane.
import { CONFIG } from './config.js';
import { clamp } from './util.js';

export const innerEdge = () => CONFIG.barrierHalf + CONFIG.innerShoulder; // left edge line
export const outerEdgeLine = () => innerEdge() + CONFIG.lanes * CONFIG.laneWidth; // right edge line
export const pavementEdge = () => outerEdgeLine() + CONFIG.hardShoulder + 0.5; // end of asphalt
export const guardrailLat = () => pavementEdge() + 0.7;

/** Lateral position (from median, local to the direction of travel) of lane i's centre. */
export function laneLat(i) {
  return innerEdge() + CONFIG.laneWidth * (CONFIG.lanes - 1 - i + 0.5);
}

/** Lane index (0 = rightmost) nearest to a lateral position, -1 = hard shoulder, N = beyond left. */
export function laneAt(lat) {
  const k = Math.floor((lat - innerEdge()) / CONFIG.laneWidth); // from left
  if (k >= CONFIG.lanes) return -1;
  return clamp(CONFIG.lanes - 1 - k, 0, CONFIG.lanes - 1);
}

/** All lane indices that a body of half-width hw at lat overlaps (with margin). */
export function lanesOccupied(lat, hw, margin = 0.25) {
  const out = [];
  for (let i = 0; i < CONFIG.lanes; i++) {
    if (Math.abs(lat - laneLat(i)) < CONFIG.laneWidth / 2 + hw - margin) out.push(i);
  }
  return out;
}
