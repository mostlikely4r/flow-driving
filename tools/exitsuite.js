// The 16-run exit matrix (F-21): 2 and 3 lanes × density 8, 12 × seeds 7, 8, 9,
// 10, at a 12% share, 10 minutes — each with a control run of the same road and
// seed where nobody leaves (--share=0, which draws no random numbers at all).
// The control is what "no braking in lane 0" and "density holds" are measured
// against, and what the emergency stops may not exceed.
//
// Each run is the real tool (tools/exits.js --json) in its own process, so
// nothing carries over.
//
// Usage:
//   node tools/exitsuite.js            run the matrix and check section 3 of the plan
//   node tools/exitsuite.js --runs=4   only the first four density-8 runs (a quick check)
//
// About 6 min. Run it in the background with the output to a log.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, 'exits.js');
const argv = process.argv.slice(2);
const only = argv.find((a) => a.startsWith('--runs='));
const MINUTES = 10;
const SHARE = 0.12;
const SEEDS = [7, 8, 9, 10];

let runs = [];
for (const lanes of [2, 3]) {
  for (const density of [8, 12]) {
    for (const seed of SEEDS) runs.push({ lanes, density, seed });
  }
}
if (only) {
  const n = Number(only.slice(7));
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--runs needs a positive whole number, not "${only.slice(7)}"`);
    process.exit(2);
  }
  runs = runs.filter((r) => r.density === 8).slice(0, n);
}

const fmt = (x, d = 0) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const pctS = (x, d = 0) => (x == null || !Number.isFinite(x) ? '–' : `${(100 * x).toFixed(d)}%`);
const med = (a) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.max(0, Math.round((b.length - 1) * 0.5)))];
};
const sum = (rows, k) => rows.reduce((s, r) => s + (Number.isFinite(r[k]) ? r[k] : 0), 0);

const one = (r, share) => {
  const args = [tool, `--lanes=${r.lanes}`, `--density=${r.density}`, `--seed=${r.seed}`, `--min=${MINUTES}`, `--share=${share}`, '--json'];
  const p = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: here });
  if (p.error || p.status !== 0) {
    const why = p.error ? p.error.message : `exit ${p.status}`;
    const tail = (p.stderr || '').replace(/[\r\n]+/g, ' | ').trim().slice(-300);
    console.error(`run (${r.lanes}L ${r.density} S${r.seed} share ${share}) failed (${why}): ${tail}`);
    process.exit(1);
  }
  const line = (p.stdout || '').split('\n').find((l) => l.startsWith('JSON '));
  if (!line) {
    console.error(`run (${r.lanes}L ${r.density} S${r.seed} share ${share}) produced no result: ${(p.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
    process.exit(1);
  }
  try {
    return JSON.parse(line.slice(5));
  } catch {
    console.error(`run (${r.lanes}L ${r.density} S${r.seed} share ${share}) printed a broken JSON line: ${line.slice(0, 120)}`);
    process.exit(1);
  }
};

console.log(`exit matrix · ${runs.length} runs + controls · share ${SHARE} · ${MINUTES} min\n`);
const started = Date.now();
const rows = [];
for (const [i, r] of runs.entries()) {
  const run = one(r, SHARE);
  const ctl = one(r, 0);
  rows.push({ ...run, ctl });
  console.error(`  ${String(i + 1).padStart(2)}/${runs.length}  ${r.lanes}L · D${r.density} · S${r.seed}  ` +
    `${run.taken} taken, ${run.missed} missed · lane 0 ${fmt(run.lane0Near)} (control ${fmt(ctl.lane0Near)})`);
}

const head = ['lanes', 'dens', 'seed', 'rolled', 'taken', 'miss', 'e10', 'e50', 'sig', 'cross', 'l0', 'ctl', 'u−2', 'u−4', 'coll', 'em/em', 'stop', 'queue', 'veh/ctl'];
const widths = [5, 4, 4, 6, 5, 5, 4, 5, 4, 5, 4, 4, 3, 3, 4, 5, 4, 5, 7];
const row = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join(' ');
const missShare = (r) => (r.exited ? r.missed / r.exited : null);
const u4share = (r) => (r.brakeN ? r.brakeUnder4 / r.brakeN : null);
const ctlDelta = (r) => (r.ctl.lane0Near != null && r.lane0Near != null ? r.lane0Near - r.ctl.lane0Near : null);

console.log(row(head));
for (const r of rows) {
  console.log(row([
    r.params.lanes, r.params.density, r.params.seed, r.rolled, r.taken, pctS(missShare(r), 0),
    fmt(r.early10), fmt(r.early50), fmt(r.sigMin, 1), fmt(r.cross50), fmt(r.lane0Near), fmt(ctlDelta(r), 1),
    pctS(r.brakeN ? r.brakeUnder2 / r.brakeN : null, 0), pctS(u4share(r), 0),
    r.collisions, `${r.emergency}/${r.ctl.emergency}`, r.stops, r.queueMax,
    `${fmt(r.meanVehicles, 0)}/${fmt(r.ctl.meanVehicles, 0)}`,
  ]));
}
const totalExited = sum(rows, 'exited');
const totalEmergCtl = rows.reduce((s, r) => s + r.ctl.emergency, 0);
console.log(row(['total', '', '', sum(rows, 'rolled'), sum(rows, 'taken'),
  pctS(totalExited ? sum(rows, 'missed') / totalExited : null, 1), '', '', '', '', '', '',
  pctS(sum(rows, 'brakeN') ? sum(rows, 'brakeUnder2') / sum(rows, 'brakeN') : null, 0),
  pctS(sum(rows, 'brakeN') ? sum(rows, 'brakeUnder4') / sum(rows, 'brakeN') : null, 0),
  sum(rows, 'collisions'), `${sum(rows, 'emergency')}/${totalEmergCtl}`,
  sum(rows, 'stops'), '']));
console.log('\n(e10/e50: metres before the exit lane an exiter was in lane 0 for good · sig: shortest indicator · ');
console.log(' cross: km/h at the move · l0/ctl: lane-0 speed through the exit against the control · em/em: emergency stops, control)');

const d8 = rows.filter((r) => r.params.density === 8);
const d12 = rows.filter((r) => r.params.density === 12);
let failed = 0;
const check = (ok, label, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `   (${detail})` : ''}`);
};
const skip = (when, label) => {
  if (when) console.log(`SKIP  ${label}`);
  return when;
};
const pooled = (rs) => (sum(rs, 'exited') ? sum(rs, 'missed') / sum(rs, 'exited') : null);

console.log('\ntargets are section 3 of docs/specs/F-21-exits.md\n');
check(pooled(d8) != null && pooled(d8) <= 0.05, 'missed exits ≤ 5% of exiters at density 8', pctS(pooled(d8), 1));
if (!skip(!d12.length, 'missed exits at density 12 (no such runs)')) {
  check(pooled(d12) != null && pooled(d12) <= 0.15, 'missed exits ≤ 15% of exiters at density 12', pctS(pooled(d12), 1));
}
check(med(d8.map((r) => r.early50)) != null && med(d8.map((r) => r.early50)) >= 600,
  'in lane 0 for good median ≥ 600 m before the exit at density 8', `now ${fmt(med(d8.map((r) => r.early50)))} m`);
check(med(d8.map((r) => r.early10)) != null && med(d8.map((r) => r.early10)) >= 300,
  'in lane 0 for good at the 10th percentile ≥ 300 m at density 8', `now ${fmt(med(d8.map((r) => r.early10)))} m`);
const sigMin = rows.map((r) => r.sigMin).filter((v) => v != null);
check(sigMin.length > 0 && Math.min(...sigMin) >= 1.0, 'every exiter signals right ≥ 1.0 s before crossing',
  `shortest ${fmt(sigMin.length ? Math.min(...sigMin) : null, 1)} s`);
const diffs = rows.map((r) => r.crossDiff50).filter((v) => v != null);
check(diffs.length > 0 && med(diffs) >= -10, 'speed when crossing ≥ lane-0 speed there − 10 km/h',
  `median ${fmt(med(diffs), 1)} km/h`);
const deltas = d8.map(ctlDelta).filter((v) => v != null);
check(deltas.length > 0 && med(deltas) >= -5, 'lane 0 through the exit within 5 km/h of the control at density 8',
  `median ${fmt(med(deltas), 1)} km/h`);
const u4 = sum(rows, 'brakeUnder4');
const bn = sum(rows, 'brakeN');
check(bn === 0 || u4 / bn <= 0.02, 'the cars behind brake under −4 m/s² in ≤ 2% of exits', `${pctS(bn ? u4 / bn : null, 1)} (${u4} of ${bn})`);
check(sum(rows, 'collisions') === 0, '0 collisions', `now ${sum(rows, 'collisions')}`);
const emergAll = sum(rows, 'emergency');
const emergCtl = rows.reduce((s, r) => s + r.ctl.emergency, 0);
check(emergAll <= emergCtl, `emergency stops no more than the control's ${emergCtl}`, `now ${emergAll}`);
check(sum(rows, 'stops') === 0, 'nobody stands still on the exit lane', `now ${sum(rows, 'stops')}`);
const vehDelta = rows.filter((r) => r.meanVehicles && r.ctl.meanVehicles).map((r) => Math.abs(r.meanVehicles - r.ctl.meanVehicles) / r.ctl.meanVehicles);
check(vehDelta.length > 0 && med(vehDelta) <= 0.05, 'vehicles in range within 5% of the control',
  `median ${pctS(med(vehDelta), 1)}`);

console.log(`\n${failed ? `${failed} check(s) failing` : 'all checks pass'} · ${Math.round((Date.now() - started) / 1000)} s`);
console.log('(a FAIL is an unmet target, not a broken sim; `npm run simtest`, personas, moments and bottest gate the change itself)');
process.exit(failed ? 1 : 0);
