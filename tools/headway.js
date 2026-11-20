// F-35 slice 2 check: the bracket on the headway rig has to agree with the
// sampled T in the spec sheet. For every persona this builds the stage's own
// vehicle, asks personaSpec for the gap it closes to, and converts that gap
// back into seconds — the number the bracket prints. Non-zero exit means the
// viewer would be lying about a headway.
//
// Usage: node tools/headway.js [limitKmh]
import { ARCHETYPES } from '../src/archetypes.js';
import {
  defaultVariant,
  gapSeconds,
  headwayGap,
  leadVehicle,
  makePersonaVehicle,
  sampleSpec,
} from '../src/personaSpec.js';

const limit = +(process.argv[2] || 100);
const TOL = 0.05; // the sheet's ranges are sampled, so allow a rounding's worth

const pad = (s, n) => String(s).padEnd(n);
const num = (x, d = 2) => x.toFixed(d);

/** How far a bracket number sits outside the sampled range, in seconds. */
function deviation(seconds, range) {
  return Math.max(0, range.min - seconds, seconds - range.max);
}

const lead = leadVehicle();
let fail = 0;
console.log(`Gap view at limit ${limit} km/h — lead: ${lead.variant} ${lead.len} m\n`);
console.log(pad('persona', 13) + pad('wants', 8) + pad('T', 9) + pad('gap', 8) + pad('sampled T', 14) + 'deviation');
for (const key of Object.keys(ARCHETYPES)) {
  const spec = sampleSpec(key);
  const variant = defaultVariant(key);
  const veh = makePersonaVehicle(key, variant);
  const kmh = limit + veh.limitOffset;
  const modes = [{ name: 'T', draft: false, range: spec.T }];
  if (spec.Tdraft) modes.push({ name: 'Tdraft', draft: true, range: spec.Tdraft });
  for (const m of modes) {
    const gap = headwayGap(veh, kmh, m.draft);
    if (gap == null || !(gap > 1)) {
      console.log(`${pad(key, 13)}no lead car reachable (${m.name})`);
      fail++;
      continue;
    }
    const seconds = gapSeconds(gap, kmh);
    const dev = deviation(seconds, m.range);
    const label = `${key}${m.draft ? ':' + m.name : ''}`;
    console.log(
      pad(label, 13) +
        pad(`${num(kmh, 0)}`, 8) +
        pad(`${num(seconds)} s`, 9) +
        pad(`${num(gap, 1)} m`, 8) +
        pad(`${num(m.range.min)}–${num(m.range.max)} s`, 14) +
        `${num(dev, 3)} s${dev > TOL ? '  FAIL' : ''}`,
    );
    if (dev > TOL) fail++;
  }
}
console.log(fail ? `\n${fail} headway(s) outside ${TOL} s of the sampled T` : `\nok: every bracket is within ${TOL} s of its sampled T`);
process.exit(fail ? 1 : 0);
