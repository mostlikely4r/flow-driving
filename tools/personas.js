// F-35 slice 3 check: every staged behaviour demo is run headless and must
// (a) collide with nothing, (b) fire every declared tell (at least one per
// alternative group), and (c) satisfy its own `expect`. Non-zero exit means the
// rig would be showing something the code does not do.
//
// Usage: node tools/personas.js [limitKmh] [--verbose]
import { ARCHETYPES } from '../src/archetypes.js';
import { baseDemoTrait, buildDemo, DEMO_LIMIT, demoTraits } from '../src/scenarios.js';
import { DemoSession } from '../src/demoSession.js';

// Demos are a fixed stage at the day limit, like the viewer's rig. A different
// limit would change what a persona does (a sok at 130 overtakes a truck), so
// the test must run the same stage the screen runs.
const limit = DEMO_LIMIT;
const verbose = process.argv.includes('--verbose');
if (process.argv[2]?.match(/^\d+$/) && +process.argv[2] !== limit) {
  console.log(`note: demos are staged at ${limit} km/h; ignoring ${process.argv[2]}`);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (x, d = 1) => Number(x).toFixed(d);

const failures = [];
const rows = [];
let demosRun = 0;

for (const persona of Object.keys(ARCHETYPES)) {
  const traits = demoTraits(persona);
  if (!traits.length) {
    failures.push(`${persona}: no demos at all (the sheet would have nothing to show)`);
    continue;
  }
  const base = baseDemoTrait(persona);
  if (!base || !buildDemo(persona, base, limit)) failures.push(`${persona}: no demo:<persona> alias`);
  for (const trait of traits) {
    const sc = buildDemo(persona, trait, limit);
    if (!sc) {
      failures.push(`${persona}:${trait}: builder returned nothing`);
      continue;
    }
    demosRun++;
    let result;
    try {
      const session = new DemoSession(sc, { limitKmh: limit });
      result = session.runHeadless();
    } catch (e) {
      failures.push(`${persona}:${trait}: threw ${e.message}`);
      continue;
    }
    const problems = [];
    const caps = sc.demo.captions || [];
    // A grouped caption is one of several possible outcomes: the group check
    // below requires one of them. An optional caption is a bonus tell.
    const missedRequired = result.missed.filter((i) => !caps[i]?.optional && !caps[i]?.group);
    if (result.collisions.length) problems.push(`collisions: ${result.collisions.join(', ')}`);
    if (missedRequired.length) problems.push(`tell(s) never fired: ${missedRequired.join(', ')}`);
    if (result.missedGroups.length) problems.push(`outcome group(s) never fired: ${result.missedGroups.join(', ')}`);
    if (!result.expect.ok) problems.push(`expect failed: ${result.expect.label}${result.expect.error ? ` (${result.expect.error})` : ''}`);
    if (!result.captions.length) problems.push('no captions at all');
    if (problems.length) failures.push(`${persona}:${trait}: ${problems.join(' · ')}`);
    const groups = new Set(caps.filter((c) => c.group).map((c) => c.group));
    const required = caps.filter((c) => !c.optional && !c.group).length + groups.size;
    rows.push({ persona, trait, result, problems, required, missedRequired: missedRequired.length });
  }
}

console.log(`F-35 behaviour demos at limit ${limit} km/h — ${demosRun} demos, ${Object.keys(ARCHETYPES).length} personas\n`);
console.log(pad('persona', 12) + pad('demo', 10) + pad('captions', 9) + pad('expect', 8) + 'outcome');
for (const { persona, trait, result, problems, required, missedRequired } of rows) {
  const outcome = problems.length ? 'FAIL ' + problems.join(' · ') : 'ok';
  const firedRequired = required - missedRequired - result.missedGroups.length;
  console.log(
    pad(persona, 12) +
      pad(trait, 10) +
      pad(`${firedRequired}/${required}`, 9) +
      pad(result.expect.ok ? 'ok' : 'FAIL', 8) +
      outcome,
  );
  if (verbose) {
    for (const c of result.captions) console.log(`             ${num(c.t)}s  ${c.text}`);
    if (result.collisions.length) console.log(`             collisions: ${result.collisions.join(', ')}`);
  }
}

if (failures.length) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log(`\nok: all ${demosRun} demos run clean, every declared tell fires, every expectation holds`);
