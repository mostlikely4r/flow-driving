// The 12-run on-ramp matrix (F-20 slice 3): 2 and 3 lanes × density 8, 12, 16
// × seeds 7, 8, at 6/min, 10 minutes, road 400 — the baseline of
// docs/specs/F-20-slice-3-inputs.md. Each run is the real tool
// (tools/onramp.js --json) in its own process, so nothing carries over.
//
// Usage:
//   node tools/onrampsuite.js           run the matrix and check it against the saved baseline
//   node tools/onrampsuite.js --save    run the matrix and write tools/onramp-baseline.json
//   node tools/onrampsuite.js --runs=4  quick check on the density-8 runs only
//
// About 1.5 min. Run it in the background with the output to a log.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, 'onramp.js');
const baselinePath = join(here, 'onramp-baseline.json');
const argv = process.argv.slice(2);
const save = argv.includes('--save');
const only = argv.find((a) => a.startsWith('--runs='));
const onlyN = only ? Number(only.slice(7)) : null;

const PER_MIN = 6;
const MINUTES = 10;
const ROAD = 400;

let runs = [];
for (const lanes of [2, 3]) {
  for (const density of [8, 12, 16]) {
    for (const seed of [7, 8]) runs.push({ lanes, density, seed });
  }
}
if (onlyN) runs = runs.filter((r) => r.density === 8).slice(0, onlyN);

const fmt = (x, d = 0) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const med = (a) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.max(0, Math.round((b.length - 1) * 0.5)))];
};
const sum = (rows, k) => rows.reduce((s, r) => s + (Number.isFinite(r[k]) ? r[k] : 0), 0);

console.log(`on-ramp matrix · ${runs.length} runs · ${PER_MIN}/min · ${MINUTES} min · ramp road ${ROAD} m\n`);
const started = Date.now();
const rows = [];
for (const [i, r] of runs.entries()) {
  const args = [tool, String(r.lanes), String(r.density), String(PER_MIN), String(MINUTES), String(r.seed), String(ROAD), '--json'];
  const p = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: here });
  const line = (p.stdout || '').split('\n').find((l) => l.startsWith('JSON '));
  if (!line) {
    console.error(`run ${i + 1}/${runs.length} (${r.lanes}L ${r.density} ${r.seed}) produced no result: ${(p.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
    process.exit(1);
  }
  let done;
  try {
    done = JSON.parse(line.slice(5));
  } catch {
    console.error(`run ${i + 1}/${runs.length} (${r.lanes}L ${r.density} ${r.seed}) printed a broken JSON line: ${line.slice(0, 120)}`);
    process.exit(1);
  }
  rows.push(done);
  console.error(`  ${String(i + 1).padStart(2)}/${runs.length}  ${r.lanes}L · D${r.density} · S${r.seed}  ${done.merges} merges · ${done.stops} stops · ${done.collisions} collisions`);
}

const head = ['lanes', 'dens', 'seed', 'merges', 'stops', 'st/mer', 'near', 'up', 'movedL', 'madeRoom', 'usedRoom', 'coll', 'emerg', 'veh/min'];
const widths = [5, 4, 4, 6, 5, 6, 5, 4, 6, 8, 8, 4, 5, 7];
const row = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join(' ');
console.log(row(head));
for (const r of rows) {
  console.log(row([
    r.params.lanes, r.params.density, r.params.seed, r.merges, r.stops, fmt(r.stopsPerMerge, 2),
    fmt(r.lane0Near), fmt(r.lane0Up), r.movedLeft, r.madeRoom, r.usedRoom, r.collisions, r.emergency, fmt(r.throughput, 0),
  ]));
}
console.log(row(['total', '', '', sum(rows, 'merges'), sum(rows, 'stops'), fmt(sum(rows, 'stops') / Math.max(1, sum(rows, 'merges')), 2), '', '', sum(rows, 'movedLeft'), sum(rows, 'madeRoom'), sum(rows, 'usedRoom'), sum(rows, 'collisions'), sum(rows, 'emergency'), '']));
const d8 = rows.filter((r) => r.params.density === 8);
console.log(`\ndensity 8: median stops per merge ${fmt(med(d8.map((r) => r.stopsPerMerge)), 2)} · lane-0 near ${fmt(med(d8.map((r) => r.lane0Near)))} km/h`);
const d12 = rows.filter((r) => r.params.density === 12);
console.log(`density 12: median stops per merge ${fmt(med(d12.map((r) => r.stopsPerMerge)), 2)} · lane-0 near ${fmt(med(d12.map((r) => r.lane0Near)))} km/h`);

if (save) {
  writeFileSync(baselinePath, `${JSON.stringify({ saved: new Date().toISOString(), runs: rows }, null, 2)}\n`);
  console.log(`\nbaseline written to tools/onramp-baseline.json (${rows.length} runs, ${Math.round((Date.now() - started) / 1000)} s)`);
  process.exit(0);
}

let base;
try {
  base = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  console.log('\nno tools/onramp-baseline.json yet — run this once with --save to write it');
  process.exit(0);
}
const key = (r) => `${r.params.lanes}:${r.params.density}:${r.params.seed}`;
const baseBy = new Map(base.runs.map((r) => [key(r), r]));
const baseRows = base.runs.filter((r) => rows.some((x) => key(x) === key(r)));
const baseD8 = baseRows.filter((r) => r.params.density === 8);
const baseD12 = baseRows.filter((r) => r.params.density === 12);
const baseSum = (rowsIn, k) => rowsIn.reduce((s, r) => s + (r[k] || 0), 0);
let failed = 0;
const check = (ok, label, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `   (${detail})` : ''}`);
};

console.log(`\nagainst tools/onramp-baseline.json (saved ${base.saved.slice(0, 10)})\n`);
// 1. density 8: median stops per merge at or under 1 in 10
const med8 = med(d8.map((r) => r.stopsPerMerge));
check(med8 != null && med8 <= 0.1, 'median stops per merge at density 8 ≤ 0.1', `now ${fmt(med8, 2)}, was ${fmt(med(baseD8.map((r) => r.stopsPerMerge)), 2)}`);
// 2. density 12: lower run for run on at least 3 of 4, and in total
const d12pairs = d12.map((r) => [r, baseBy.get(key(r))]).filter(([, b]) => b);
const better = d12pairs.filter(([r, b]) => r.stopsPerMerge < b.stopsPerMerge).length;
const now12 = sum(d12, 'stops') / Math.max(1, sum(d12, 'merges'));
const was12 = baseSum(d12pairs.map(([, b]) => b), 'stops') / Math.max(1, baseSum(d12pairs.map(([, b]) => b), 'merges'));
check(better >= 3 && sum(d12, 'stops') < sum(d12pairs.map(([, b]) => b), 'stops'), 'stops per merge at density 12 lower than baseline', `better on ${better}/${d12pairs.length} runs · ${fmt(now12, 2)} against ${fmt(was12, 2)}`);
// 3. no collisions, and no more emergency stops than the baseline
const coll = sum(rows, 'collisions');
const emerg = sum(rows, 'emergency');
const baseEmerg = sum(baseRows, 'emergency');
check(coll === 0, '0 collisions over the 12 runs', `now ${coll}, baseline ${sum(baseRows, 'collisions')}`);
check(emerg <= baseEmerg, `emergency stops no more than the baseline's ${baseEmerg}`, `now ${emerg}`);
// 4. lane 0 near the ramp is not slower than the baseline at density 8 and 12
const near8 = med(d8.map((r) => r.lane0Near));
const near12 = med(d12.map((r) => r.lane0Near));
const baseNear8 = med(baseD8.map((r) => r.lane0Near));
const baseNear12 = med(baseD12.map((r) => r.lane0Near));
check(near8 != null && baseNear8 != null && near8 >= baseNear8 - 0.05, 'lane-0 speed near the ramp not lower at density 8', `now ${fmt(near8)} km/h, was ${fmt(baseNear8)}`);
check(near12 != null && baseNear12 != null && near12 >= baseNear12 - 0.05, 'lane-0 speed near the ramp not lower at density 12', `now ${fmt(near12)} km/h, was ${fmt(baseNear12)}`);
// 5. courtesy: lane 0 makes room, and mergers use it
const made = sum(rows, 'madeRoom');
const used = sum(rows, 'usedRoom');
const baseMade = sum(baseRows, 'madeRoom');
const baseUsed = sum(baseRows, 'usedRoom');
check(made > 0 && used > 0, 'courtesy reading: lane 0 makes room and mergers use it', `made room ${made} (was ${baseMade}) · used it ${used} (${made ? Math.round((100 * used) / made) : 0}%, was ${baseMade ? Math.round((100 * baseUsed) / baseMade) : 0}%)`);

console.log(`\n${failed ? `${failed} check(s) failing` : 'all checks pass'} · ${Math.round((Date.now() - started) / 1000)} s`);
console.log('(density 16 and 3 lanes at 12 are jams: reported, not targeted — F-22)');
process.exit(failed ? 1 : 0);
