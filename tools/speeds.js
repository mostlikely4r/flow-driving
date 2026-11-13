// Speed check: what drivers want vs what they actually drive, per archetype
// and per lane, by day (limit 100) and at night (limit 130, half traffic).
// Usage: node tools/speeds.js [dayDensity=10] [nightDensity=10]
// Env knobs for experiments: SG=speedGain MO=moveOver NO=normalOffsetKmh
//   TE=truckOvertakeEagerness PB=passBoostKmh NOTRUCK=1 NOARCH=1
import { Traffic, leaderIn, idm } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { KMH } from '../src/util.js';
for (const [limit, dens] of [[100, +(process.argv[2] || 10)], [130, +(process.argv[3] || 10)]]) {
  const want = {}, drive = {}, lane = [[], [], []];
  for (let seed = 1; seed <= 6; seed++) {
    CONFIG.lanes = 3; if (process.env.SG) CONFIG.speedGain = +process.env.SG; if (process.env.NOTRUCK) CONFIG.mix = { car: 1, van: 0, truck: 0, caravan: 0 }; if (process.env.NOARCH) CONFIG.archetypes = 0; if (process.env.MO) CONFIG.moveOver = +process.env.MO; if (process.env.NO) CONFIG.normalOffsetKmh = +process.env.NO; if (process.env.TE) CONFIG.truckOvertakeEagerness = +process.env.TE; if (process.env.PB) CONFIG.passBoostKmh = +process.env.PB;
    const tr = new Traffic({ dir: 1, density: dens, ahead: 1500, behind: 900, seed, limitKmh: limit }); if (limit > 100) { tr.night = true; tr.densityScale = 0.5; }
    const player = { isPlayer: true, u: 0, len: 4.8, v: limit * KMH, v0: limit * KMH, T: 1.2, s0: 2, a: 1.5, b: 2, lanesOcc: [1], signalLane: -1 };
    tr.initialFill(0, player);
    for (let i = 0; i < 4 * 3600; i++) {
      player.v = Math.max(0, player.v + idm(player, leaderIn(tr.lanes[1], player)) / 60); player.u += player.v / 60;
      tr.step(1 / 60, player.u, player);
      const X = process.argv[4]; if (X) for (const v of tr.vehicles) { if (X === 'nostrict') v.strict = false; if (X === 'nocoop') v.coop = 0; if (X === 'noantic') v.antic = 0; if (X === 'notruck' && v.type === 'truck') v.v0base = v.v0 = 130 / 3.6; }
      if (i % 60) continue;
      for (const v of tr.vehicles) {
        if (v.type !== 'car') continue;
        const k = v.drives || 'normal';
        (want[k] ||= []).push(v.v0base / KMH); (drive[k] ||= []).push(v.v / KMH);
        lane[v.lane].push(v.v / KMH);
      }
    }
  }
  const pct = (a, p) => { a = [...a].sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))].toFixed(0); };
  console.log(`limit ${limit} density ${dens}`);
  for (const k of Object.keys(want)) console.log(`  ${k.padEnd(10)} share ${(100 * want[k].length / Object.values(want).flat().length).toFixed(0).padStart(3)}%  wants p10/50/90 ${pct(want[k], .1)}/${pct(want[k], .5)}/${pct(want[k], .9)}  drives ${pct(drive[k], .1)}/${pct(drive[k], .5)}/${pct(drive[k], .9)}`);
  lane.forEach((l, i) => console.log(`  lane ${i} cars drive p10/50/90 ${pct(l, .1)}/${pct(l, .5)}/${pct(l, .9)}  max ${pct(l, 1)}`));
}
