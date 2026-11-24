// The 24-run on-ramp matrix (F-20 slice 4): 2 and 3 lanes × density 8, 12, 16
// × seeds 7, 8, 9, 10, at 6/min, 10 minutes, road 400 — the baseline of
// docs/specs/F-20-slice-4-runout.md. Each run is the real tool
// (tools/onramp.js --json) in its own process, so nothing carries over.
//
// Slice 3's 2-seed matrix was too noisy to judge a rule on (2L D12 S7 swung
// 0.73 ↔ 11.85 stops per merge on a 6 s change), so there are 4 seeds now.
//
// Usage:
//   node tools/onrampsuite.js           run the matrix and check it against the saved baseline
//   node tools/onrampsuite.js --save    run the matrix and write tools/onramp-baseline.json
//   node tools/onrampsuite.js --runs=4  only the first four density-8 runs (a quick check)
//
// About 4 min. Run it in the background with the output to a log.
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
let onlyN = null;
if (only) {
  onlyN = Number(only.slice(7));
  if (!Number.isInteger(onlyN) || onlyN < 1) {
    console.error(`--runs needs a positive whole number, not "${only.slice(7)}"`);
    process.exit(2);
  }
}

const PER_MIN = 6;
const MINUTES = 10;
const ROAD = 400;
const SEEDS = [7, 8, 9, 10];

let runs = [];
for (const lanes of [2, 3]) {
  for (const density of [8, 12, 16]) {
    for (const seed of SEEDS) runs.push({ lanes, density, seed });
  }
}
if (onlyN) runs = runs.filter((r) => r.density === 8).slice(0, onlyN);

const fmt = (x, d = 0) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? '–' : `${(100 * x).toFixed(d)}%`);
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
  if (p.error || p.status !== 0) {
    const why = p.error ? p.error.message : `exit ${p.status}`;
    const tail = (p.stderr || '').replace(/[\r\n]+/g, ' | ').trim().slice(-300);
    console.error(`run ${i + 1}/${runs.length} (${r.lanes}L ${r.density} ${r.seed}) failed (${why}): ${tail}`);
    process.exit(1);
  }
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
  console.error(`  ${String(i + 1).padStart(2)}/${runs.length}  ${r.lanes}L · D${r.density} · S${r.seed}  ${done.merges} merges (${done.mergesRunout} run-out) · ${done.stops} stops · ${done.collisions} collisions`);
}

// stops by place, merges in the run-out, and the follower braking the merge
// costs (under −2 and under −4 m/s²)
const head = ['lanes', 'dens', 'seed', 'merges', 'st/mer', 'strip', 'run', 'end', 'mRun', 'share', 'u−4', 'near', 'coll', 'emerg', 'veh/min'];
const widths = [5, 4, 4, 6, 6, 5, 3, 3, 5, 5, 4, 5, 4, 5, 7];
const row = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join(' ');
const u4share = (r) => (r.brakingN ? (r.brakingUnder4 || 0) / r.brakingN : null);
console.log(row(head));
for (const r of rows) {
  console.log(row([
    r.params.lanes, r.params.density, r.params.seed, r.merges, fmt(r.stopsPerMerge, 2),
    r.stopsStrip ?? 0, r.stopsRunout ?? 0, r.stopsHardEnd ?? 0,
    r.mergesRunout ?? 0, pct(r.mergesRunoutShare, 0), pct(u4share(r), 0),
    fmt(r.lane0Near), r.collisions, r.emergency, fmt(r.throughput, 0),
  ]));
}
const totalMerges = sum(rows, 'merges');
console.log(row(['total', '', '', totalMerges, fmt(sum(rows, 'stops') / Math.max(1, totalMerges), 2),
  sum(rows, 'stopsStrip'), sum(rows, 'stopsRunout'), sum(rows, 'stopsHardEnd'),
  sum(rows, 'mergesRunout'), pct(totalMerges ? sum(rows, 'mergesRunout') / totalMerges : null, 0),
  pct(sum(rows, 'brakingN') ? sum(rows, 'brakingUnder4') / sum(rows, 'brakingN') : null, 0),
  '', sum(rows, 'collisions'), sum(rows, 'emergency'), '']));

// density 8 and 12 are the ones the targets are about (16 is a jam: F-22)
const targeted = rows.filter((r) => r.params.density !== 16);
const d8 = rows.filter((r) => r.params.density === 8);
const d12 = rows.filter((r) => r.params.density === 12);
console.log(`\ndensity 8: median stops per merge ${fmt(med(d8.map((r) => r.stopsPerMerge)), 2)} · lane-0 near ${fmt(med(d8.map((r) => r.lane0Near)))} km/h`);
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
// Seeds 9 and 10 have no baseline row when the saved baseline is a 2-seed one:
// anything compared against the baseline is compared on the runs both have.
const matched = rows.filter((r) => baseBy.has(key(r)));
const baseOf = (rowsIn) => rowsIn.map((r) => baseBy.get(key(r))).filter(Boolean);
const baseMatched = baseOf(rows);
const baseD8 = matched.filter((r) => r.params.density === 8).map((r) => baseBy.get(key(r)));
const baseD12 = matched.filter((r) => r.params.density === 12).map((r) => baseBy.get(key(r)));
let failed = 0;
const check = (ok, label, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `   (${detail})` : ''}`);
};
// a part of the matrix that was not run (--runs trims it) is not a failure
const skip = (when, label) => {
  if (when) console.log(`SKIP  ${label}`);
  return when;
};

console.log(`\nagainst tools/onramp-baseline.json (saved ${base.saved.slice(0, 10)}, ${base.runs.length} runs)`);
console.log('targets are section 3 of docs/specs/F-20-slice-4-runout.md\n');

// 1. density 8: median stops per merge at or under 1 in 10
const med8 = med(d8.map((r) => r.stopsPerMerge));
const med8was = med(baseD8.map((r) => r.stopsPerMerge));
check(med8 != null && med8 <= 0.1, 'median stops per merge at density 8 ≤ 0.1', `now ${fmt(med8, 2)}, was ${fmt(med8was, 2)}`);
// 2. density 12: median at most half of the baseline's
const d12m = matched.filter((r) => r.params.density === 12);
const med12 = d12m.length ? med(d12m.map((r) => r.stopsPerMerge)) : null;
const med12was = med(baseD12.map((r) => r.stopsPerMerge));
if (!skip(d12m.length === 0, 'median stops per merge at density 12 at most half the baseline (no density-12 runs with a baseline)')) {
  check(med12 != null && med12was != null && med12 <= med12was / 2, 'median stops per merge at density 12 at most half the baseline', `now ${fmt(med12, 2)}, was ${fmt(med12was, 2)}`);
}

// 3. the queue must not just move 150 m down the road: stops right at the hard
// end of lane −1, at 1 in 20 merges or fewer
const hardMerges = Math.max(1, sum(targeted, 'merges'));
const hardRate = sum(targeted, 'stopsHardEnd') / hardMerges;
check(hardRate <= 1 / 20, 'stops at the hard end ≤ 1 per 20 merges at density 8 and 12', `now ${fmt(hardRate, 3)} (${sum(targeted, 'stopsHardEnd')} in ${sum(targeted, 'merges')})`);

// 4. what B costs the new follower: under −4 m/s² on 3% of merges or fewer
const matchedTargeted = matched.filter((r) => r.params.density !== 16);
const baseTargeted = baseOf(matchedTargeted);
const u4 = sum(targeted, 'brakingUnder4');
const bn = sum(targeted, 'brakingN');
const u4rate = bn ? u4 / bn : 0;
check(bn === 0 || u4rate <= 0.03, 'merges whose new follower brakes under −4 m/s² ≤ 3% at density 8 and 12', `now ${pct(u4rate, 1)} (${u4} of ${bn})`);
console.log(`INFO  under −2 m/s²: ${pct(sum(matchedTargeted, 'brakingN') ? sum(matchedTargeted, 'brakingUnder2') / sum(matchedTargeted, 'brakingN') : null, 1)} now (${sum(matchedTargeted, 'brakingUnder2')} of ${sum(matchedTargeted, 'brakingN')} compared), ${pct(sum(baseTargeted, 'brakingN') ? sum(baseTargeted, 'brakingUnder2') / sum(baseTargeted, 'brakingN') : null, 1)} before`);

// 5. no collisions, and no more emergency stops than the baseline
const coll = sum(rows, 'collisions');
const emerg = sum(rows, 'emergency');
const baseEmerg = sum(baseMatched, 'emergency');
check(coll === 0, `0 collisions over the ${rows.length} runs`, `now ${coll}, baseline ${sum(baseMatched, 'collisions')}`);
check(emerg <= baseEmerg, `emergency stops no more than the baseline's ${baseEmerg}`, `now ${emerg}`);

// 6. lane 0 near the ramp is no more than 3 km/h slower than the baseline
const near8 = med(matched.filter((r) => r.params.density === 8).map((r) => r.lane0Near));
const baseNear8 = med(baseD8.map((r) => r.lane0Near));
check(near8 != null && baseNear8 != null && near8 >= baseNear8 - 3, 'lane-0 speed near the ramp within 3 km/h of the baseline at density 8', `now ${fmt(near8)} km/h, was ${fmt(baseNear8)} km/h`);
if (!skip(!baseD12.length, 'lane-0 speed near the ramp at density 12 (no density-12 runs with a baseline)')) {
  const near12 = med(d12m.map((r) => r.lane0Near));
  const baseNear12 = med(baseD12.map((r) => r.lane0Near));
  check(near12 != null && baseNear12 != null && near12 >= baseNear12 - 3, 'lane-0 speed near the ramp within 3 km/h of the baseline at density 12', `now ${fmt(near12)} km/h, was ${fmt(baseNear12)} km/h`);
}

// courtesy reading (slice 3 step 3 dropped the rule; this is a reading, not a target)
const made = sum(matched, 'madeRoom');
const used = sum(matched, 'usedRoom');
const baseMade = sum(baseMatched, 'madeRoom');
const baseUsed = sum(baseMatched, 'usedRoom');
console.log(`INFO  courtesy (lane 0 easing, inferred, no rule)   made room ${made} (was ${baseMade}) · merger used it ${used} (${made ? Math.round((100 * used) / made) : 0}%, was ${baseMade ? Math.round((100 * baseUsed) / baseMade) : 0}%) · 0→1 moves near the strip end ${sum(matched, 'movedLeft')} (was ${sum(baseMatched, 'movedLeft')})`);

console.log(`\n${failed ? `${failed} check(s) failing` : 'all checks pass'} · ${Math.round((Date.now() - started) / 1000)} s`);
console.log('(density 16 and 3 lanes at 12 are jams: reported, not targeted — F-22)');
console.log('(a FAIL is an unmet target, not a broken sim; `npm run simtest`, personas, moments and bottest gate the change itself)');
process.exit(failed ? 1 : 0);
