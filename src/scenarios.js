// Scenario harness: repeatable traffic situations for tuning the AI.
//
// In game:   http://localhost:5173/?scenario=elephant   (Backspace restarts)
// Headless:  npm run scenario elephant                   (prints a timeline)
//
// Positions are relative to you: ds metres ahead (+) or behind (-).
// Lanes are numbered from the right: 0 is the rightmost lane.
// `kmh` is the starting speed, `want` the driver's desired speed (default = kmh).
// `params` overrides driver parameters from traffic.js makeVehicle(), e.g.
// T (headway s), p (politeness), bias (keep-right urge), tSignal, coop, strict.
import { KMH, mulberry32 } from './util.js';
import { laneLat } from './layout.js';

export const SCENARIOS = {
  elephant: {
    title: 'Overtaking a truck with a speeder behind',
    about:
      'Two lanes. The car ahead of you closes in on a truck just as a fast car comes up in the left lane. ' +
      'Does the car ahead pull out in front of the speeder or wait? Does the speeder see it coming?',
    lanes: 2,
    timeOfDay: 'day',
    seed: 11,
    player: { lane: 0, kmh: 97, want: 100 },
    vehicles: [
      { tag: 'truck', type: 'truck', variant: 'truck', lane: 0, ds: 170, kmh: 82 },
      { tag: 'ahead', type: 'car', variant: 'hatch', lane: 0, ds: 45, kmh: 97, want: 103, params: { p: 0, tSafe: 0.35, bSafe: 3.2 } },
      { tag: 'speeder', type: 'car', variant: 'sedan', lane: 1, ds: -170, kmh: 132, want: 138 },
    ],
  },

  'truck-race': {
    title: 'Elephant race on two lanes',
    about:
      'One truck overtakes another with a 2 km/h difference. You are in the left lane behind them, with ' +
      'a few cars queued behind you. How long does it take, and do the cars behind behave?',
    lanes: 2,
    timeOfDay: 'day',
    seed: 12,
    player: { lane: 1, kmh: 100, want: 105 },
    vehicles: [
      { tag: 'slow truck', type: 'truck', variant: 'truck', lane: 0, ds: 160, kmh: 82, want: 82 },
      { tag: 'fast truck', type: 'truck', variant: 'truck', lane: 0, ds: 115, kmh: 84, want: 85, params: { eager: 2 } },
      { tag: 'behind 1', type: 'car', variant: 'estate', lane: 1, ds: -60, kmh: 104, want: 110 },
      { tag: 'behind 2', type: 'car', variant: 'suv', lane: 1, ds: -140, kmh: 108, want: 118 },
    ],
  },

  hogger: {
    title: 'Middle-lane hogger',
    about:
      'Three lanes. A middle-lane hogger at 95 km/h sits ahead of you with the right lane empty. ' +
      'Try flashing your lights (F) and watch the dev overlay.',
    lanes: 3,
    timeOfDay: 'day',
    seed: 13,
    player: { lane: 1, kmh: 100, want: 105 },
    vehicles: [
      { tag: 'hogger', type: 'car', variant: 'estate', lane: 1, ds: 70, kmh: 95, params: { hogger: true, bias: -0.03 } },
      { tag: 'left lane', type: 'car', variant: 'sedan', lane: 2, ds: -120, kmh: 118, want: 120 },
      { tag: 'truck', type: 'truck', variant: 'truck', lane: 0, ds: 400, kmh: 83 },
    ],
  },
};

/** Clear the carriageway and place the scenario's vehicles around sPlayer. */
export function applyScenario(traffic, sc, sPlayer, { includeYou = false } = {}) {
  for (const v of traffic.vehicles) traffic.onRemove(v);
  traffic.vehicles.length = 0;
  traffic.density = sc.density ?? 0;
  traffic.rng = mulberry32(sc.seed ?? 1); // same drivers every run
  traffic.time = 0;
  const specs = [...sc.vehicles];
  if (includeYou) specs.push({ tag: 'you', type: 'car', variant: 'estate', lane: sc.player.lane, ds: 0, kmh: sc.player.kmh, want: sc.player.want });
  const placed = [];
  for (const spec of specs) {
    const veh = traffic.makeVehicle(spec.type, spec.variant);
    veh.tag = spec.tag;
    veh.lane = veh.targetLane = spec.lane;
    veh.u = traffic.dir * (sPlayer + spec.ds);
    veh.v = spec.kmh * KMH;
    veh.latLocal = laneLat(spec.lane);
    const want = spec.want ?? spec.kmh;
    if (veh.type === 'car' || veh.type === 'van') veh.limitOffset = want - traffic.limitKmh;
    else veh.ownMax = want;
    traffic.applyLimit(veh);
    veh.v0 = veh.v0base;
    Object.assign(veh, spec.params || {});
    traffic.vehicles.push(veh);
    traffic.onAdd(veh);
    placed.push(veh);
  }
  traffic.buildLanes(null);
  return placed;
}
