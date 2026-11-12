// A/B test of traffic settings over many seeds. Drivers are drawn identically
// in A and B, so differences come from the setting, not luck.
// Usage: npm run abtest -- anticipation=0 anticipation=1 [seeds=12] [min=6] [density=12] [lanes=3]
import { Traffic, gapBetween, leaderIn, idm } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { KMH } from '../src/util.js';

const raw = process.argv.slice(2);
const opts = Object.fromEntries(raw.filter((a) => /^(seeds|min|density|lanes)=/.test(a)).map((a) => a.split('=')));
const variants = raw.filter((a) => !/^(seeds|min|density|lanes)=/.test(a));
if (variants.length < 2) {
  console.log('Give two settings to compare, e.g.: npm run abtest -- anticipation=0 anticipation=1');
  process.exit(1);
}
const seeds = +(opts.seeds || 12), minutes = +(opts.min || 6), density = +(opts.density || 12);
const base = structuredClone(CONFIG);

function run(setting, seed) {
  Object.assign(CONFIG, structuredClone(base), { lanes: +(opts.lanes || 3) });
  for (const kv of setting.split(',')) {
    const [k, v] = kv.split('=');
    CONFIG[k] = isNaN(+v) ? v : +v;
  }
  const tr = new Traffic({ dir: 1, density, ahead: 1500, behind: 900, seed, limitKmh: 100 });
  const player = { isPlayer: true, u: 0, len: 4.8, v: 100 * KMH, v0: 100 * KMH, T: 1.2, s0: 2, a: 1.5, b: 2, lanesOcc: [1], signalLane: -1 };
  tr.initialFill(0, player);
  const dt = 1 / 60;
  const m = { hard: 0, emergency: new Set(), truckL1: 0, speed: 0, n: 0, lc: 0 };
  const prev = new Map();
  for (let i = 0; i < (minutes * 60) / dt; i++) {
    const ld = leaderIn(tr.lanes[1], player);
    player.v = Math.max(0, player.v + idm(player, ld) * dt);
    player.u += player.v * dt;
    tr.step(dt, player.u, player);
    if (i < 120) continue; // skip spawn settling
    for (const v of tr.vehicles) {
      if (v.acc < -3) m.hard++;
      if (v.acc < -6) m.emergency.add(v.id);
      if (v.type === 'truck' && v.lane === 1) m.truckL1++;
      const p = prev.get(v.id);
      if (p != null && p !== v.lane) m.lc++;
      prev.set(v.id, v.lane);
      m.speed += v.v;
      m.n++;
    }
  }
  return m;
}

console.log(`${seeds} seeds x ${minutes} min, density ${density}\n`);
console.log('setting'.padEnd(28) + 'hard-brake s/veh-h  emergency stops  truck overtaking s  lane changes  avg km/h');
for (const setting of variants) {
  const tot = { hard: 0, emergency: 0, truckL1: 0, speed: 0, n: 0, lc: 0 };
  for (let s = 1; s <= seeds; s++) {
    const m = run(setting, s);
    tot.hard += m.hard; tot.emergency += m.emergency.size; tot.truckL1 += m.truckL1;
    tot.speed += m.speed; tot.n += m.n; tot.lc += m.lc;
  }
  const vehHours = (tot.n / 60) / 3600;
  console.log(
    setting.padEnd(28) +
      (tot.hard / 60 / vehHours).toFixed(2).padStart(18) +
      String(tot.emergency).padStart(17) +
      (tot.truckL1 / 60).toFixed(0).padStart(20) +
      String(tot.lc).padStart(14) +
      (tot.speed / tot.n / KMH).toFixed(1).padStart(10),
  );
}
