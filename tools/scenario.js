// Runs a scenario from src/scenarios.js headless and prints a timeline of what
// each driver does. By default "you" holds your lane and follows (like a
// player watching); you=ai lets an ordinary AI driver play you.
// Usage: npm run scenario <name> [sec=60] [limit=100] [you=lane|ai] [tag.param=value ...]
import { Traffic, gapBetween, leaderIn } from '../src/traffic.js';
import { CONFIG } from '../src/config.js';
import { KMH } from '../src/util.js';
import { SCENARIOS, applyScenario } from '../src/scenarios.js';

const [name, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a) => a.split('=')));
const sc = SCENARIOS[name];
if (!sc) {
  console.log(`Unknown scenario "${name ?? ''}". Available:`);
  for (const [k, v] of Object.entries(SCENARIOS)) console.log(`  ${k.padEnd(12)} ${v.title}`);
  process.exit(1);
}
CONFIG.lanes = sc.lanes;
const limit = +(args.limit || (sc.timeOfDay === 'day' ? CONFIG.speedLimitDay : CONFIG.speedLimitNight));
const seconds = +(args.sec || 60);
const tr = new Traffic({ dir: 1, density: 0, ahead: 2000, behind: 1000, seed: 1, limitKmh: limit });
const vehicles = applyScenario(tr, sc, 0, { includeYou: true });
const you = vehicles.find((v) => v.tag === 'you');
// per-driver overrides from the command line: speeder.antic=0 ahead.p=0.3
for (const [k, val] of Object.entries(args)) {
  const dot = k.indexOf('.');
  if (dot < 0) continue;
  const veh = vehicles.find((v) => v.tag === k.slice(0, dot));
  if (!veh) { console.log(`no driver tagged "${k.slice(0, dot)}"`); process.exit(1); }
  veh[k.slice(dot + 1)] = +val;
}
if (args.you !== 'ai') you.cooldown = Infinity; // never changes lanes

console.log(`${name}: ${sc.title}`);
console.log(`${sc.lanes} lanes, limit ${limit}, ${seconds} s simulated\n`);

const fmt = (t) => t.toFixed(1).padStart(5) + 's';
const kmh = (v) => Math.round(v / KMH);
const side = (veh) => (veh.targetLane > veh.lane ? 'left' : 'right');
const st = new Map(vehicles.map((v) => [v, { state: v.state, lane: v.lane, intent: -1, firstSign: null, tells: [], braking: false, minAcc: 0, brakeStart: 0, minGapT: Infinity, maxDecel: 0 }]));
const dt = 1 / 60;
let t = 0;
const log = (veh, msg) => console.log(`${fmt(t)}  ${veh.tag.padEnd(11)} ${msg}`);
for (let i = 0; i < seconds / dt; i++) {
  tr.step(dt, you.u, null);
  t += dt;
  for (const veh of vehicles) {
    if (!tr.vehicles.includes(veh)) continue;
    const s = st.get(veh);
    // first visible sign: wanting a lane (drift, closing up), before any signal
    if (veh.intent >= 0 && s.intent !== veh.intent && veh.state === 'none') {
      log(veh, `wants ${veh.intent > veh.lane ? 'left' : 'right'} (edging over, closing up)`);
      s.firstSign = t;
    }
    if (veh.intent < 0 && veh.state === 'none' && s.intent >= 0 && s.state === 'none') log(veh, 'drops the idea');
    s.intent = veh.intent;
    if (veh.state !== s.state) {
      if (veh.state === 'signal') {
        log(veh, `signals ${side(veh)} (lane ${veh.lane} -> ${veh.targetLane}) at ${kmh(veh.v)} km/h`);
        if (s.firstSign == null) s.firstSign = t;
      } else if (veh.state === 'move') {
        const tell = s.firstSign != null ? t - s.firstSign : 0;
        s.tells.push(tell);
        log(veh, `starts moving ${side(veh)}  (telegraphed ${tell.toFixed(1)} s)`);
        s.firstSign = null;
      }
      else if (s.state === 'signal') log(veh, `gives up, stays in lane ${veh.lane}`);
      else if (s.state === 'move') log(veh, `now in lane ${veh.lane}`);
      s.state = veh.state;
    }
    // braking episodes (harder than easing off the throttle)
    if (!s.braking && veh.acc < -1.2) {
      s.braking = true;
      s.minAcc = veh.acc;
      s.brakeStart = t;
    } else if (s.braking) {
      s.minAcc = Math.min(s.minAcc, veh.acc);
      if (veh.acc > -0.5) {
        s.braking = false;
        if (t - s.brakeStart > 0.25 || s.minAcc < -2.5) log(veh, `braked ${(t - s.brakeStart).toFixed(1)} s, peak ${(-s.minAcc).toFixed(1)} m/s² -> ${kmh(veh.v)} km/h`);
      }
    }
    s.maxDecel = Math.max(s.maxDecel, -veh.acc);
    const ld = leaderIn(tr.lanes[veh.lane], veh);
    if (ld && veh.v > 1) s.minGapT = Math.min(s.minGapT, gapBetween(ld, veh) / veh.v);
  }
}
console.log('\nsummary            lane  km/h  max decel  min time gap  telegraphed');
for (const veh of vehicles) {
  const s = st.get(veh);
  const gone = !tr.vehicles.includes(veh);
  console.log(
    `  ${veh.tag.padEnd(16)} ${String(veh.lane).padStart(4)}  ${String(kmh(veh.v)).padStart(4)}  ${s.maxDecel.toFixed(1).padStart(6)} m/s²  ${s.minGapT === Infinity ? '     –  ' : s.minGapT.toFixed(2).padStart(6) + ' s'}  ${s.tells.length ? s.tells.map((x) => x.toFixed(1) + 's').join(', ') : '–'}${gone ? '  (left range)' : ''}`,
  );
}
