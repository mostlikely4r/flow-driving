// F-48 Toekomstflitsen: two things must hold however the promised world grows.
//
//  1. The sim never knows. No sim module may reach a future module through its
//     imports, and none may read CONFIG.world or CONFIG.future.
//  2. The promise stays out of the way. The guideway spine stops for every
//     junction bridge and viaduct, and nothing that stands below 4.6 m goes
//     outside the median barrier's footprint (rule 4 in the spec).
//
// Usage: node tools/worldtest.js
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';
import { innerEdge } from '../src/layout.js';
import { junctionsNear, overpassS } from '../src/junctions.js';
import {
  CABIN_WIDTH,
  JUNCTION_CLEAR,
  REQUIRED_CLEARANCE,
  cabinLat,
  clearanceBlocks,
  deckOuter,
  spineAt,
  spineSpans,
} from '../src/futureScenery.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const failures = [];

// ------------------------------------------------------------------ 1. the sim
// The modules the drivers live in: they see the road and the rules, never a world.
const SIM = ['traffic.js', 'player.js', 'msi.js', 'session.js', 'perception.js', 'botDriver.js', 'variants.js'];
const IMPORTS = /import\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g;

const seen = new Set();
const queue = SIM.map((f) => `src/${f}`);
const reached = [];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  let code;
  try {
    code = readFileSync(resolve(ROOT, file), 'utf8');
  } catch {
    failures.push(`sim import graph: cannot read ${file}`);
    continue;
  }
  if (/CONFIG\.(world|future)\b/.test(code)) failures.push(`${file} reads CONFIG.world / CONFIG.future`);
  for (const m of code.matchAll(IMPORTS)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = rel(resolve(ROOT, dirname(file), spec));
    if (/^src\/future/.test(target)) {
      failures.push(`${file} imports ${target}`);
      continue;
    }
    if (!seen.has(target)) queue.push(target);
  }
  reached.push(file);
}

// ------------------------------------------------------------------ 2. the spine
// A spine that reaches a bridge or a viaduct would grow through it, so walk
// past every one of them on 20 km of road.
const bridges = [];
for (const j of junctionsNear(-1500, 21500)) bridges.push([j.sBridge, 'junction']);
for (let K = Math.floor(-1500 / 1000); K <= Math.floor(21500 / 1000); K++) {
  const so = overpassS(K);
  if (so != null) bridges.push([so, 'viaduct']);
}
let onSpine = 0;
for (const [s, kind] of bridges) {
  // the spine ends exactly at the edge, so walk the open interval
  for (let x = s - JUNCTION_CLEAR + 0.5; x < s + JUNCTION_CLEAR; x += 5) {
    if (spineAt(x)) failures.push(`spine runs through the ${kind} at ${Math.round(s)} m (s=${x})`);
  }
  if (spineAt(s - JUNCTION_CLEAR - 200) && spineAt(s + JUNCTION_CLEAR + 200)) onSpine++;
}
if (!onSpine) failures.push('the spine never exists between the bridges: nothing would be visible');

// A span is the stretch one chunk builds, so it must sit inside the spine.
for (const [a, b] of spineSpans(0, 2000)) {
  for (let s = a + 0.5; s < b; s += 5) if (!spineAt(s)) failures.push(`spine span ${Math.round(a)}..${Math.round(b)} crosses a gap at ${s}`);
}

// ------------------------------------------------------------------ 3. clearance
const check = () => {
  for (const [latMin, latMax, yMin, yMax] of clearanceBlocks()) {
    const wide = Math.max(Math.abs(latMin), Math.abs(latMax));
    if (yMin < REQUIRED_CLEARANCE && wide > 0.3) {
      failures.push(`a piece at ${yMin}..${yMax} m reaches lat ${wide.toFixed(2)}: below ${REQUIRED_CLEARANCE} m must stay within |lat| <= 0.3`);
    }
  }
};
check();
const saved = CONFIG.future.deckReachLanes;
for (const reach of [1, 0]) {
  CONFIG.future.deckReachLanes = reach;
  check();
  if (reach > 0) {
    const need = innerEdge() + reach * CONFIG.laneWidth;
    if (deckOuter() + 1e-6 < need) failures.push(`deckReachLanes ${reach} reaches ${deckOuter().toFixed(2)} m, short of the left lane at ${need.toFixed(2)} m`);
  }
}
CONFIG.future.deckReachLanes = saved;

// The platoons must pass where a driver below can see them: their track hangs
// off the deck edge, because anything standing on the deck top is hidden by the
// deck itself (the driver is always under that surface).
for (const reach of [1, 0]) {
  CONFIG.future.deckReachLanes = reach;
  const inner = cabinLat() - CABIN_WIDTH / 2;
  if (inner < deckOuter() - 1e-9) failures.push(`with deckReachLanes ${reach} the cabins at ${cabinLat().toFixed(2)} m sit over the deck, where nobody below can see them`);
}
CONFIG.future.deckReachLanes = saved;

// ------------------------------------------------------------------ report
console.log(`sim modules walked: ${reached.length} (${reached.filter((f) => f.startsWith('src/')).length} in src/)`);
console.log(`bridges and viaducts checked: ${bridges.length} over 20 km`);
console.log(`clearance: ${clearanceBlocks().length} blocks, ${REQUIRED_CLEARANCE} m, barrier footprint |lat| <= 0.3`);
if (failures.length) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures.slice(0, 20)) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('the sim never knows; the promise stays out of the way');
