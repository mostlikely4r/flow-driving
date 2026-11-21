// Proefrit (F-37): a deterministic smoke test for the moment detectors.
//
// Each case builds a tiny synthetic journal by hand, so a detector's rule is
// tested in isolation instead of hoping the traffic sim produces the situation.
// This is not a tune: thresholds are still calibrated against your marks.
//
// Usage: npm run moments
import { detectMoments } from '../src/moments.js';

const HZ = 2;
const LANE_W = 3.5;
const PLEN = 4.8;

/** Build a journal from per-time player and vehicle state. */
function build({ sec, player, vehicles, events = [] }) {
  const j = {
    version: 1,
    header: {
      kind: 'human',
      playerLen: PLEN,
      laneWidth: LANE_W,
      lanes: 3,
      limitKmh: 100,
      hasBrake: true,
      moments: {},
    },
    meta: {},
    hz: HZ,
    t: [],
    s: [],
    lane: [],
    lat: [],
    v: [],
    a: [],
    thr: [],
    brk: [],
    steer: [],
    ind: [],
    ccSet: [],
    ccOn: [],
    limit: [],
    veh: [],
    fps: [],
    events,
    marks: [],
    answers: null,
    end: null,
  };
  const n = Math.round(sec * HZ);
  for (let i = 0; i < n; i++) {
    const t = i / HZ;
    const p = player(t);
    j.t.push(t);
    j.s.push(1000 + (p.v / 3.6) * t);
    j.lane.push(p.lane);
    j.lat.push(0);
    j.v.push(p.v);
    j.a.push(p.a || 0);
    j.thr.push(0);
    j.brk.push(p.a && p.a < -0.5 ? 0.6 : 0);
    j.steer.push(0);
    j.ind.push(p.ind || 0);
    j.ccSet.push(p.ccSet || 0);
    j.ccOn.push(p.ccSet ? 1 : 0);
    j.limit.push(100);
    const rows = [];
    for (const v of vehicles(t)) {
      if (Math.abs(v.dl) > 320) continue;
      if (!j.meta[v.id]) {
        j.meta[v.id] = { type: v.type || 'car', variant: v.variant || 'sedan', len: v.len || 4.5, width: 1.8 };
      }
      rows.push([v.id, v.dl, v.off || 0, v.kmh, v.ind || 0, v.lane, v.brake ? 1 : 0]);
    }
    rows.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
    j.veh.push(rows);
  }
  return j;
}

const cases = [
  {
    name: 'cut-off + unannounced (a car crosses into your lane 25 m ahead)',
    build: () =>
      build({
        sec: 20,
        player: () => ({ lane: 1, v: 100 }),
        vehicles: (t) => [{ id: 1, dl: t < 8 ? 35 : 25, lane: t < 8 ? 2 : 1, kmh: 100 }],
      }),
    expect: ['cut-off', 'unannounced'],
  },
  {
    name: 'phantom-brake (the car ahead brakes, nothing in front of it)',
    build: () =>
      build({
        sec: 20,
        player: () => ({ lane: 1, v: 100 }),
        vehicles: (t) => [{ id: 2, dl: 50, lane: 2, kmh: t < 4 ? 100 : Math.max(50, 100 - 2.5 * 3.6 * (t - 4)), brake: t > 4 }],
      }),
    expect: ['phantom-brake'],
  },
  {
    name: 'empty-signal (a car indicates for 10 s without moving)',
    build: () =>
      build({
        sec: 16,
        player: () => ({ lane: 1, v: 100 }),
        vehicles: (t) => [{ id: 20, dl: 30, lane: 1, kmh: 100, ind: t > 2 ? 1 : 0 }],
      }),
    expect: ['empty-signal'],
  },
  {
    name: 'pointless-lane (a car moves left with nothing to overtake)',
    build: () =>
      build({
        sec: 12,
        player: () => ({ lane: 0, v: 100 }),
        vehicles: (t) => [{ id: 21, dl: 60, lane: t < 5 ? 1 : 2, kmh: 100 }],
      }),
    expect: ['pointless-lane'],
  },
  {
    name: 'a justified overtake is NOT pointless-lane',
    build: () =>
      build({
        sec: 12,
        player: () => ({ lane: 0, v: 100 }),
        vehicles: (t) => [
          { id: 22, dl: 60, lane: t < 5 ? 1 : 2, kmh: 100 },
          { id: 23, dl: 120, lane: 1, kmh: 80 },
        ],
      }),
    expect: [],
    reject: ['pointless-lane'],
  },
  {
    name: 'pop-in (a car appears 100 m ahead)',
    build: () =>
      build({
        sec: 12,
        player: () => ({ lane: 1, v: 100 }),
        vehicles: (t) => (t < 5 ? [] : [{ id: 3, dl: 100, lane: 1, kmh: 100 }]),
      }),
    expect: ['pop-in'],
  },
  {
    name: 'tailgated (a car 10 m behind for 12 s)',
    build: () =>
      build({
        sec: 20,
        player: () => ({ lane: 1, v: 100 }),
        vehicles: (t) => [{ id: 4, dl: t < 12 ? -15 : -60, lane: 1, kmh: 100 }],
      }),
    expect: ['tailgated'],
  },
  {
    name: 'left-dawdler (85 km/h blocking the left lane for 35 s)',
    build: () =>
      build({
        sec: 40,
        player: () => ({ lane: 2, v: 100 }),
        vehicles: () => [{ id: 5, dl: 40, lane: 2, kmh: 85 }],
      }),
    expect: ['left-dawdler'],
  },
  {
    name: 'forced-brake (you brake 4 m/s²)',
    build: () =>
      build({
        sec: 12,
        player: (t) => ({ lane: 1, v: 100 - (t > 4 && t < 5 ? 4 * 3.6 * (t - 4) : t >= 5 ? 14.4 : 0), a: t > 4 && t < 5 ? -4 : 0 }),
        vehicles: () => [],
      }),
    expect: ['forced-brake'],
  },
  {
    name: 'near-miss (10 m gap, closing 30 km/h)',
    build: () =>
      build({
        sec: 8,
        player: () => ({ lane: 1, v: 100 }),
        vehicles: () => [{ id: 6, dl: 15, lane: 1, kmh: 70 }],
      }),
    expect: ['near-miss'],
  },
  {
    name: 'let-in (you signal, the car behind eases off and you merge)',
    build: () =>
      build({
        sec: 20,
        player: (t) => ({ lane: t < 10 ? 1 : 2, v: 100, ind: t >= 4 && t < 12 ? -1 : 0 }),
        vehicles: (t) => [{ id: 7, dl: t < 7 ? -25 : -45, lane: 2, kmh: t < 7 ? 85 : 80 }],
      }),
    expect: ['let-in'],
  },
  {
    name: 'moved-over (you flash, the car ahead moves right)',
    build: () =>
      build({
        sec: 20,
        player: () => ({ lane: 1, v: 110 }),
        vehicles: (t) => [{ id: 8, dl: t < 13 ? 20 : 25, lane: t < 13 ? 1 : 0, kmh: 95 }],
        events: [{ t: 10, s: 1000, type: 'flash' }],
      }),
    expect: ['moved-over'],
  },
  {
    name: 'clean-overtake (out, past, back, no braking)',
    build: () =>
      build({
        sec: 40,
        player: (t) => ({ lane: t < 8 || t >= 28 ? 1 : 2, v: 110, ind: t >= 5 && t < 8 ? -1 : t >= 25 && t < 28 ? 1 : 0 }),
        vehicles: (t) => [{ id: 9, dl: 40 - 8.33 * (t - 5), lane: 1, kmh: 80 }],
      }),
    expect: ['clean-overtake'],
  },
  {
    name: 'elephant-race (two trucks side by side for 25 s)',
    build: () =>
      build({
        sec: 30,
        player: () => ({ lane: 0, v: 95 }),
        vehicles: () => [
          { id: 10, dl: 120, lane: 1, kmh: 85, type: 'truck', variant: 'truck', len: 16.8 },
          { id: 11, dl: 122, lane: 0, kmh: 85, type: 'truck', variant: 'truck', len: 16.8 },
        ],
      }),
    expect: ['elephant-race'],
  },
  {
    name: 'wave-ridden (100 -> 60 -> 95 km/h without a hard brake)',
    build: () =>
      build({
        sec: 40,
        player: (t) => {
          let v = 100;
          if (t > 5 && t <= 13) v = 100 - ((t - 5) / 8) * 40;
          else if (t > 13 && t <= 17) v = 60;
          else if (t > 17) v = Math.min(95, 60 + ((t - 17) / 12) * 40);
          return { lane: 1, v };
        },
        vehicles: () => [],
      }),
    expect: ['wave-ridden'],
  },
  {
    name: 'boxed-in (65 s under set speed, no lane to escape to)',
    build: () =>
      build({
        sec: 70,
        player: () => ({ lane: 1, v: 80, ccSet: 100 }),
        vehicles: () => [
          { id: 12, dl: 10, lane: 0, kmh: 80 },
          { id: 13, dl: -10, lane: 0, kmh: 80 },
          { id: 14, dl: 10, lane: 2, kmh: 80 },
          { id: 15, dl: -10, lane: 2, kmh: 80 },
        ],
      }),
    expect: ['boxed-in'],
  },
];

let failed = 0;
for (const c of cases) {
  let got = [];
  try {
    got = detectMoments(c.build()).map((m) => m.kind);
  } catch (e) {
    console.log(`FAIL  ${c.name}\n      threw: ${e && e.stack ? e.stack.split('\n')[0] : e}`);
    failed++;
    continue;
  }
  const missing = c.expect.filter((k) => !got.includes(k));
  if (missing.length) {
    failed++;
    console.log(`FAIL  ${c.name}\n      expected ${c.expect.join(', ')}; got ${got.join(', ') || 'nothing'}`);
  } else {
    console.log(`ok    ${c.name}`);
  }
}
console.log(failed ? `\n${failed} case(s) failed` : '\nall detector cases fired');
process.exit(failed ? 1 : 0);
