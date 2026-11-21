// Proefrit (F-37): one checker for the moment detectors.
//
// Both test scripts use it, so a case means the same thing everywhere:
// `tools/momenttest.js` (hand-built journals, one rule at a time) and
// `tools/momentstage.js` (real sim, staged situations). Before this file the
// synthetic runner only looked at `expect`, so its negative case passed without
// testing anything: `reject` was silently ignored.
//
// A result says whether the *situation* was there (FIXTURE) or the *rule*
// misjudged it (DETECTOR). Only the detectors' own expectations are checked
// here; a caller adds its preconditions to `spec.preconditions`.

/**
 * One moment per line, for failure output:
 * `  9.0s empty-signal   sev2 [S] "…has indicated left for 9 s…"`
 * `tagOf` maps vehicle ids to whatever the case calls them (fixture tags).
 */
export function fmtMoments(moments, tagOf = identity) {
  return moments.map((m) => {
    const tags = (m.vehicles || []).map((id) => tagOf(id)).filter((x) => x != null && x !== '');
    return `${m.t.toFixed(1).padStart(5)}s ${String(m.kind).padEnd(14)} sev${m.severity}${tags.length ? ` [${tags.join(',')}]` : ' []'} "${m.text}"`;
  });
}

const identity = (id) => String(id);

/** One expectation in words, for the "expected …" line. */
function describe(e) {
  const bits = [`${e.kind} ×${e.count ?? 1}`];
  if (e.tag != null) bits.push(`[${e.tag}]`);
  if (e.sev) bits.push(`sev ${e.sev[0]}..${e.sev[1]}`);
  if (e.t) bits.push(`t ${e.t[0].toFixed(1)}..${e.t[1].toFixed(1)}`);
  if (e.text) bits.push(`"${e.text}"`);
  return bits.join(' ');
}

const inRange = (x, r) => x >= r[0] && x <= r[1];

/**
 * Check a journal's moments against one case.
 *
 * spec.expect:    [{ kind, tag?, count? = 1, sev? = [lo, hi], t? = [lo, hi], text?, miss? }]
 * spec.forbid:    [{ kind, tag?, why? }]   — the synthetic `reject: [kind]` maps to this
 * spec.preconditions: [{ ok, msg }]        — a false one is a FIXTURE failure
 *
 * `miss` / `why` carry the case's own sentence (the spec gives one per fixture,
 * e.g. "tapper's brake light was on at 4.0–6.0 s with nothing within 40 m
 * ahead"); the generic "expected … got …" is added for you.
 */
export function checkCase(moments, spec, ctx = {}) {
  const tagOf = ctx.tagOf || identity;
  const tagsOf = (m) => (m.vehicles || []).map((id) => tagOf(id));
  const matches = (m, e) =>
    m.kind === e.kind &&
    (e.tag == null || tagsOf(m).includes(e.tag)) &&
    (e.sev == null || inRange(m.severity, e.sev)) &&
    (e.t == null || inRange(m.t, e.t)) &&
    (e.text == null || String(m.text).includes(e.text));

  // The situation first: a broken fixture must never read as a broken rule.
  for (const p of spec.preconditions || []) {
    if (!p.ok) {
      const id = spec.id ? `${spec.id}: ` : '';
      return { ok: false, kind: 'FIXTURE', lines: [`FIXTURE ${id}${p.msg}`] };
    }
  }

  const lines = [];
  for (const e of spec.expect || []) {
    const hits = moments.filter((m) => matches(m, e));
    const want = e.count ?? 1;
    if (hits.length === want) continue;
    const why = e.miss ? `${e.miss}; ` : '';
    const got = hits.length
      ? hits.map((m) => `${m.kind} at ${m.t.toFixed(1)} s [${tagsOf(m).join(',')}]`).join('; ')
      : 'none';
    lines.push(`DETECTOR ${e.kind}: ${why}expected ${describe(e)}, got ${hits.length} (${got})`);
  }
  for (const f of spec.forbid || []) {
    const hits = moments.filter((m) => m.kind === f.kind && (f.tag == null || tagsOf(m).includes(f.tag)));
    for (const m of hits) {
      const who = tagsOf(m).join(',') || 'you';
      const why = f.why || `${f.kind} fired for ${who}`;
      lines.push(`DETECTOR ${f.kind}: ${why} — ${String(m.text)}`);    }
  }
  return { ok: lines.length === 0, kind: lines.length ? 'DETECTOR' : 'ok', lines };
}

/**
 * Print results and return the exit code: 0 when every case passed, 1 when one
 * failed. A result is
 *   { id?, title?, ok?, kind: 'ok'|'FIXTURE'|'DETECTOR'|'info', lines?, note?, seconds? }
 * `info` results are report-only (probes) and never change the exit code.
 */
export function report(results) {
  let failed = 0;
  for (const r of results) {
    const id = r.id ? `${r.id.padEnd(6)} ` : '';
    const secs = r.seconds != null ? `  ${r.seconds.toFixed(2)} s` : '';
    if (r.kind === 'info') {
      console.log(`info  ${id}${r.title || ''}`);
      for (const l of r.lines || []) console.log(`      ${l}`);
      continue;
    }
    if (r.ok) {
      console.log(`ok    ${id}${r.title || ''}${secs}`);
      continue;
    }
    failed++;
    console.log(`FAIL  ${r.kind.padEnd(8)} ${id}${r.title || ''}`);
    for (const l of r.lines || []) console.log(`      ${l}`);
  }
  return failed ? 1 : 0;
}
