// Proefrit (F-37): turn drive journals into the same report.md for a human or a
// bot drive, in a fixed order so two reports can be compared line by line.
//
// Usage:
//   npm run report -- playtests/human/2026-01-31-17-42-09.json
//   npm run report -- playtests/human                (every .json in the folder)
//   node tools/report.js <path...> out=<file.md>
//
// The report states observations, never verdicts about fun (truth rule 1).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULTS } from '../src/config.js';
import { detectMoments, summarise, MOMENT_KINDS } from '../src/moments.js';

const clock = (t) => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const km = (s) => (s / 1000).toFixed(1);
const pct = (x) => `${Math.round(x * 100)}%`;
const fixed1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');

function fmtConfigDiff(diff) {
  if (!diff || !Object.keys(diff).length) return 'none';
  return Object.entries(diff)
    .map(([k, v]) => {
      if (k === 'moments') {
        const changed = Object.entries(v)
          .filter(([mk, mv]) => DEFAULTS.moments[mk] !== mv)
          .map(([mk, mv]) => `${mk} ${DEFAULTS.moments[mk]}→${mv}`);
        return changed.length ? `moments: ${changed.join(', ')}` : 'moments: defaults';
      }
      const d = DEFAULTS[k];
      return `${k} ${typeof d === 'object' ? JSON.stringify(d) : d}→${typeof v === 'object' ? JSON.stringify(v) : v}`;
    })
    .join(', ');
}

/** Build the report markdown for one or more drives. */
export function buildReport(drives) {
  const rows = drives.map(({ j, file }) => {
    const moments = detectMoments(j);
    return { j, file, moments, sum: summarise(j, moments) };
  });
  const totalMinutes = rows.reduce((a, r) => a + r.sum.minutes, 0);
  const out = [];

  out.push('# Proefrit report');
  out.push('');
  out.push(`Generated ${new Date().toISOString()} from ${rows.length} drive(s), ${fixed1(totalMinutes)} min of driving.`);
  out.push('');

  // 1. Header -------------------------------------------------------------
  out.push('## 1. Header');
  out.push('');
  out.push('| Drive | Journal | Who | Commit | Seed | Scenario | Time of day | Minutes | Samples | Config diff |');
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  rows.forEach(({ j, file }, i) => {
    const h = j.header || {};
    out.push(
      `| ${i + 1} | ${file ? file.replace(/\\/g, '/') : '–'} | ${h.kind === 'bot' ? `bot: ${h.profile || h.driver || '?'}` : 'human'} | ${h.commit || 'unknown'} | ${h.seed ?? '–'} | ${h.scenario || 'free'} | ${h.timeOfDay || '–'} | ${fixed1(j.header && j.header.duration ? j.header.duration / 60 : (j.t[j.t.length - 1] || 0) / 60)} | ${j.t.length} | ${fmtConfigDiff(h.config)} |`,
    );
  });
  out.push('');

  // 2. M1 check -----------------------------------------------------------
  const pass = rows.filter((r) => r.sum.m1).length;
  out.push('## 2. M1 check');
  out.push('');
  out.push(
    `${pass} of ${rows.length} drive(s) had at least one good moment (severity ≥ 2) and zero \`unannounced\` / \`pop-in\` / \`phantom-brake\` moments.`,
  );
  out.push('');
  rows.forEach(({ moments }, i) => {
    const bad = moments.filter((m) => ['unannounced', 'pop-in', 'phantom-brake'].includes(m.kind));
    const good = moments.filter((m) => m.good && m.severity >= 2);
    const counts = {};
    for (const m of bad) counts[m.kind] = (counts[m.kind] || 0) + 1;
    const badText = Object.entries(counts).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(', ') || 'none';
    out.push(`- **Drive ${i + 1}**: ${good.length} good (severity ≥ 2), ${bad.length} unreadable (${badText}).`);
  });
  out.push('');

  // 3. Rates --------------------------------------------------------------
  out.push('## 3. Rates');
  out.push('');
  out.push('| Moment | Pillar | Count | per 10 min |');
  out.push('|---|---|---|---|');
  const totals = {};
  for (const k of Object.keys(MOMENT_KINDS)) totals[k] = rows.reduce((a, r) => a + (r.sum.counts[k] || 0), 0);
  const order = Object.keys(MOMENT_KINDS).sort((a, b) => {
    const ga = MOMENT_KINDS[a].good ? 1 : 0;
    const gb = MOMENT_KINDS[b].good ? 1 : 0;
    if (ga !== gb) return ga - gb;
    return a.localeCompare(b);
  });
  for (const k of order) {
    const meta = MOMENT_KINDS[k];
    const per10 = totalMinutes > 0 ? (totals[k] / totalMinutes) * 10 : 0;
    out.push(`| ${meta.good ? `${k} (good)` : k} | ${meta.pillar} | ${totals[k]} | ${per10.toFixed(1)} |`);
  }
  out.push('');
  const calm = rows.reduce((a, r) => a + r.sum.calm * r.sum.minutes, 0) / Math.max(totalMinutes, 1e-9);
  out.push(`**Calm share**: ${calm.toFixed(2)} (fraction of driving time with no friction moment in the last ${DEFAULTS.moments.calmWindowS} s).`);
  out.push('');
  out.push('**Driven speeds**');
  out.push('');
  out.push('| Drive | Average | p10 | p90 | above limit + 10 | under limit | On cruise | Lane share (0 = rightmost) |');
  out.push('|---|---|---|---|---|---|---|---|');
  rows.forEach(({ j, sum }, i) => {
    const limit = (j.header && j.header.limitKmh) || DEFAULTS.speedLimitDay;
    out.push(
      `| ${i + 1} | ${fixed1(sum.speeds.avg)} km/h | ${fixed1(sum.speeds.p10)} | ${fixed1(sum.speeds.p90)} | ${pct(sum.speeds.aboveLimit10)} | ${pct(sum.speeds.underLimit)} (limit ${limit}) | ${pct(sum.cruiseShare)} | ${sum.laneShare.map(pct).join(' / ')} |`,
    );
  });
  out.push('');

  // 4. Timeline -----------------------------------------------------------
  out.push('## 4. Timeline');
  out.push('');
  out.push('Every moment is reproducible from the drive\'s seed plus `t`; `s` is your road position in metres.');
  out.push('');
  for (const [i, { j, moments, file }] of rows.entries()) {
    out.push(`### Drive ${i + 1}${file ? ` — ${file}` : ''} (seed ${j.header && j.header.seed})`);
    out.push('');
    if (!moments.length) {
      out.push('No moment detectors fired.');
      out.push('');
      continue;
    }
    out.push('| t | s | km | Kind | Sev | From the seat |');
    out.push('|---|---|---|---|---|---|');
    for (const m of moments) {
      out.push(`| ${clock(m.t)} | ${Math.round(m.s)} | ${km(m.s)} | ${m.kind}${m.good ? ' (good)' : ''} | ${m.severity} | ${m.text} |`);
    }
    out.push('');
  }

  // 5. Your marks ---------------------------------------------------------
  const withMarks = rows.filter((r) => (r.j.marks || []).length);
  out.push('## 5. Marks');
  out.push('');
  if (!withMarks.length) {
    out.push('No marks in these drives.');
    out.push('');
  } else {
    out.push('Detectors that fired within ±5 s of each mark. A mark with nothing near it is a **missing detector**; a detector firing often with no mark near it is noise. Your marks are the authority.');
    out.push('');
    let marksTotal = 0;
    let marksMatched = 0;
    for (const { j, moments } of rows) {
      for (const mark of j.marks || []) {
        marksTotal++;
        if (moments.some((m) => Math.abs(m.t - mark.t) <= 5 || (m.cueT != null && Math.abs(m.cueT - mark.t) <= 5))) marksMatched++;
      }
    }
    out.push(`${marksMatched} of ${marksTotal} marks have a detector within ±5 s (using the moment's cue time where it has one).`);
    out.push('');
    out.push('| Drive | t | s | km | Note | Detectors within ±5 s |');
    out.push('|---|---|---|---|---|---|');
    for (const [i, { j, moments }] of rows.entries()) {
      for (const mark of j.marks || []) {
        const near = moments.filter((m) => Math.abs(m.t - mark.t) <= 5 || (m.cueT != null && Math.abs(m.cueT - mark.t) <= 5));
        const at = (m) => (Math.abs(m.t - mark.t) <= 5 ? m.t : (m.cueT ?? m.t));
        const list = near.length ? near.map((m) => `${m.kind} @${clock(at(m))}`).join(', ') : '**none**';
        out.push(`| ${i + 1} | ${clock(mark.t)} | ${Math.round(mark.s)} | ${km(mark.s)} | ${mark.note || '–'} | ${list} |`);
      }
    }
    out.push('');
    const answers = rows.flatMap((r, i) => (r.j.answers ? [{ i, a: r.j.answers }] : []));
    if (answers.length) {
      out.push('End-of-drive answers:');
      out.push('');
      for (const { i, a } of answers) {
        const parts = [];
        if (a.calm) parts.push(`calm ${a.calm}/5`);
        if (a.wrong) parts.push(`felt wrong: “${a.wrong}”`);
        if (a.best) parts.push(`best moment: “${a.best}”`);
        out.push(`- **Drive ${i + 1}**: ${parts.length ? parts.join(' · ') : 'skipped'}`);
      }
      out.push('');
    }
  }

  // 6. Health -------------------------------------------------------------
  out.push('## 6. Health');
  out.push('');
  out.push('Observations, not feelings: a bug report.');
  out.push('');
  out.push('| Drive | Collisions | Scrapes | NaN | Cars off the road | AI emergency stops near you | fps min | Samples under 30 fps |');
  out.push('|---|---|---|---|---|---|---|---|');
  rows.forEach(({ sum }, i) => {
    const h = sum.health;
    out.push(
      `| ${i + 1} | ${h.collisions}${h.crashPeak ? ` (peak ${fixed1(h.crashPeak)})` : ''} | ${h.scrapes} | ${h.nan} | ${h.offRoad} | ${h.emergencyStops} (${h.emergencyVehicles} car(s)) | ${h.fpsMin == null ? '–' : h.fpsMin} | ${h.fpsMin == null ? '–' : h.fpsUnder30} |`,
    );
  });
  out.push('');
  const anyFps = rows.some((r) => r.sum.health.fpsMin != null);
  if (anyFps) {
    rows.forEach(({ j, sum }, i) => {
      const h = sum.health;
      if (h.fpsMin == null) return;
      out.push(`- **Drive ${i + 1}**: ${(h.fpsUnder30 / (j.hz || 2)).toFixed(0)} s under 30 fps (min ${h.fpsMin} fps).`);
    });
    out.push('');
    out.push('fps is only recorded in a human drive; a bot cannot feel a stutter.');
  } else {
    out.push('No fps column: this is a bot or headless drive, so the report cannot speak about stutter.');
  }
  out.push('');
  return out.join('\n');
}

// ------------------------------------------------------------------ CLI
function expand(paths) {
  const files = [];
  for (const p of paths) {
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      for (const f of readdirSync(p).sort()) if (f.endsWith('.json')) files.push(join(p, f));
    } else if (p.endsWith('.json')) files.push(p);
  }
  return files;
}

const isMain = process.argv[1] && (process.argv[1].endsWith('report.js') || process.argv[1].endsWith('report'));
if (isMain) {
  const args = process.argv.slice(2);
  const outArg = args.find((a) => a.startsWith('out='));
  const inputs = args.filter((a) => !a.includes('='));
  const files = expand(inputs);
  if (!files.length) {
    console.log('Usage: npm run report -- <journal.json | folder> [...] [out=report.md]');
    process.exit(1);
  }
  const drives = [];
  for (const file of files) {
    try {
      drives.push({ file, j: JSON.parse(readFileSync(file, 'utf8')) });
    } catch (e) {
      console.error(`Skipping ${file}: ${e && e.message ? e.message : e}`);
    }
  }
  if (!drives.length) {
    console.error('No readable journals.');
    process.exit(1);
  }
  const md = buildReport(drives);
  const target = outArg
    ? outArg.slice(4)
    : files.length === 1
      ? files[0].replace(/\.json$/, '.report.md')
      : join(dirname(files[0]), 'report.md');
  writeFileSync(target, md);
  console.log(`Wrote ${target} (${drives.length} drive(s))`);
}
