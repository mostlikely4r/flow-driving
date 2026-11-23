# F-37 slice 2: bot driver and runner (spec)

Status: ready to build. Part of "Proefrit: the playtest loop (F-37)" in `docs/F-37-proefrit.md`; read that
section first. This document only covers slice 2.

## 1. Goal and non-goals

**Goal.** A deterministic bot drives the real `Player` with keyboard-equivalent inputs, from a
view limited to what a driver in the car can see. The run is recorded by the existing `Journal`
and turned into `report.md` by the existing `buildReport()`.

**Done when** `forens` drives 20 minutes on 5 seeds with 0 player contacts, overtakes, merges
and returns right, uses cruise control only through C / R / ±1 / ±5, and `report.md` renders.
Section 8 makes each of these measurable.

**Non-goals.**
- Slice 3: frames and clips, occlusion, the `dwars` profile.
- Slice 4: `tools/compare.js`, the `jij` profile, threshold tuning.
- No change to `CONFIG.moments`, the detectors in `src/moments.js`, or the layout of
  `tools/report.js`.
- No oncoming traffic, rendering, audio, scenery or fps in bot runs.
- `base=` report diff: stretch only. Nothing may depend on it.

## 2. Baseline (do not revert or redesign)

F-37 slice 1 is in the working tree, uncommitted: `src/journal.js`, `src/moments.js`, F8 marks,
the end-of-drive debrief, `POST /__journal` (`vite.config.js`), `tools/report.js` (exports
`buildReport(drives)` with `drives = [{ j, file }]`), `tools/momenttest.js`, the calibration that
added `CONFIG.moments.signalPatienceS` / `pointlessM`, and the brake-light column in journal
vehicle rows.

The only real human drive, `playtests/human/2026-11-20-21-57-40.json` (14.8 min, 20 marks), is
the calibration authority. Facts from it this spec relies on:
- Cruise on 88% of the time; 47 `cc` events, **0** ± clicks: you re-engage with C at the current
  speed. Set speed mostly 106–108.
- Signal to lane-change start: median about 1.4 s over 25 changes; 6 lane changes without
  indicator.
- Header says `timeOfDay: night`, `limitKmh: 130`, but the `limit` column is 100 in 1733 of 1736
  samples (see 10.3).

## 3. Findings in the code that drive the design

1. `Player` throttles crash and scrape events with `performance.now()` (`player.js` barrier and
   `collide()`): one event per 900 ms of **wall** time. A headless run is about 50× real time,
   so most contacts would vanish. It must use sim time.
2. Flash is not a `Player` method; it lives in the `main.js` frame loop. So do the closure rolls
   (`Math.random`), the red-cross check, and the key-to-method mapping in `handlePresses`. Copying
   them into the runner would test a different game, so they move into one shared render-free
   module.
3. Keyboard pedals are progressive (`Input.controls`): a brake tap starts at 0.12 (about
   1.1 m/s²) and gains about 0.45/s held; any brake > 0.04 switches cruise off. The bot goes
   through the same ramp.
4. `traffic.js` keeps vehicle ids in a module global (`NEXT_ID`). Several seeds in one process
   would get different ids, so each seed runs in its own child process.
5. `makeTraffic()` fills traffic before `applyTime()` sets `night` and `densityScale`. The
   headless setup must keep that order to match the browser for the same seed.

## 4. Files

| File | Status | Purpose |
|---|---|---|
| `src/session.js` | new | Render-free sim setup and step, shared by `main.js` and the runner |
| `src/perception.js` | new | The driver's-seat view: whitelisted cues only |
| `src/botDriver.js` | new | Profiles and state machine; outputs held keys and key presses |
| `tools/playtest.js` | new | CLI runner: one child process per seed, then the report |
| `tools/bottest.js` | new | Headless tests for perception and the bot |
| `src/player.js` | change | Sim clock instead of `performance.now()`; `lastHit = -Infinity` |
| `src/input.js` | change | Export a pure `pedalStep()`; `Input.controls()` uses it |
| `src/main.js` | change | Sim part of the frame, presses, flash and closures go through `session.js` |
| `src/journal.js` | change | Extra header fields (`bot`, `runner`, `commitDirty`, `node`); `end.contacts` |
| `src/config.js` | change | Add `CONFIG.perception` |
| `package.json` | change | Scripts `playtest` and `bottest` |
| `README.md`, `BACKLOG.md` | change | Short usage section; "Built:" note under slice 2 |

`session.js`, `perception.js` and `botDriver.js` import no Three.js and never touch the DOM,
`window`, `navigator`, `performance` or `Date`. `botDriver.js` does not import `traffic.js`.

## 5. Design

### 5.1 `src/session.js`

```js
export function createSim({ seed, timeOfDay, scenario = null, rng = Math.random }) → Sim
// Sim = { road, player, traffic, msi, rng, time, closureDist, lastGantry, journal }
// Same order as main.js: Road(seed) → Player(road) → Traffic(dir 1, seed+1, CONFIG ranges)
// → traffic.msi = new MSI(traffic) → player.update(0.001, idle, empty)
// → scenario ? placeInLane + applyScenario + player.update(0.001, idle, traffic)
//            : traffic.initialFill(player.s, player.proxy)
// → applyTimeSim(sim, timeOfDay)

export function applyTimeSim(sim, tod)        // night flag, densityScale, setLimit, lightsOn
export function stepSim(sim, dt, ctl)         // player substeps (≤ 1/120), traffic substeps (≤ 1/30),
                                              // msi.update, updateClosures, journal.tick(playerLimit)
export function updateClosures(sim, dt)       // the random roll, using sim.rng; removal; red-cross event
export function applyDrivePress(sim, { code, shift }) → boolean
      // KeyC, KeyR, Equal/NumpadAdd/BracketRight, Minus/NumpadSubtract/BracketLeft, PageUp/PageDown,
      // KeyQ, KeyE: exactly the mapping in handlePresses (shift = ccStepBig)
export function holdFlash(sim, held)          // flashT gate 0.6 s, journal 'flash' event,
                                              // traffic.flashFrom(proxy), pressureT ≥ 6
export function playerLimit(sim) → kmh        // min(msi.limitAt(s, lane), speedLimitKmh())
export function drainEvents(sim) → events[]   // journal.playerEvents, return a copy, clear player.events
```

`main.js` keeps: oncoming traffic (stepped next to `stepSim` with the same substep count; it has
no effect on your carriageway), stats, horn, audio, HUD, view-only keys, and handling of the
drained events (beeps, toasts, `stats.collisions`). The order of work inside a browser frame
stays as it is today: presses, player, traffic, stats, msi, closures, journal tick, horn, flash,
events.

### 5.2 `src/perception.js`

```js
// config.js
perception: { aheadM: 250, behindM: 120, farM: 80, histS: 1.5, driftEps: 0.12 },

export const ALLOWED = ['id', 'type', 'variant', 'len', 'width', 'u', 'latLocal', 'v', 'indicator', 'brake'];
export function observe(veh) → Obs     // the only code that reads a Traffic vehicle; copies ALLOWED

export class Perception {
  constructor({ lanes = CONFIG.lanes } = {})
  update(t, player, traffic, msi, limitKmh) → Percept
  reset()
}
```

**Data shape**

```
Percept = {
  t,
  self: { s, lane, lanesOcc, lat, off, kmh, v, acc, ind, steer, headingErr,
          cc: { on, set, has }, limitKmh, lanes },
  cars: Seen[],                        // sorted by |dl|
  lanes: LaneView[N],                  // { ahead, behind: Seen|null, freeAheadM, freeBehindM,
                                       //   visibleAheadM, visibleBehindM }
  obstacles: [{ lane, dAhead, len }],  // closure arrow trucks, visible range only
  signs: { limitKmh, nextGantryM, cur: face[] | null, next: face[] | null },
}

Seen = { id, type, variant, len, width, side: 'ahead' | 'behind',
         dl, gap, tgap, relKmh, closing, ttc,
         lane, lanesOcc, off, latRate, drift /* -1|0|1 */,
         kmh, ind, indAge, brake, brakeAge, seenAge }
```

The player's own state is fair game: the speedometer, the cruise display, the indicator and
where the car sits in its lane are all visible from the seat.

**Computation** (direction +1, so `u = s`; speeds in m/s unless the name says km/h; `KMH` is
m/s per km/h, so m/s = kmh × KMH):
- `dl = veh.u − player.s`.
- `gap`: ahead `dl − (veh.len + player.len) / 2`; behind `−dl − (veh.len + player.len) / 2`.
- `relKmh = (veh.v − player.vAlong) / KMH`.
- `closing`: ahead `player.vAlong − veh.v`; behind `veh.v − player.vAlong`.
- `ttc = gap / closing` if `closing > 0.1`, otherwise `Infinity`.
- `tgap`: ahead `gap / max(player.vAlong, 1)`; behind `gap / max(veh.v, 1)`.
- `lanesOcc = lanesOccupied(latLocal, width / 2, 0.3)` and `lane = laneAt(latLocal)`, from body
  position. Never `veh.lane`: during a move it is still the origin lane, and its flip leaks
  hidden state.
- `off = latLocal − laneLat(lane)`.
- `latRate`: least-squares slope of a per-id history of `latLocal` over the last `histS`.
- `drift = sign(off)` if `|off| > driftEps` and `latRate` is zero or has the same sign; else 0.
- `indAge`, `brakeAge`, `seenAge`: time since perception first saw that state (per-id memory).
- Other cars' acceleration is never read; estimate it from `kmh` history plus the brake light if
  needed.

**Visibility.** Visible if any lane in `lanesOcc` is within one lane of any of the player's
`lanesOcc` and `−behindM ≤ dl ≤ aheadM`; otherwise only if `|dl| ≤ farM`. Closures show as an
obstacle (`kmh 0`, `brake true`, `type 'obstacle'`) when `s0 − player.s ≤ aheadM` and the lane is
own or adjacent. MSI faces: the current gantry and the next one once it is within 250 m. No
occlusion in this slice.

**What the bot cannot know:** `intent`, `state`, `targetLane`, `signalLane`, `p`,
`tSafe`/`tSafePlayer`, `coop`, the persona or archetype key, `v0`/`v0base`, `T`, `react`,
`hogger`, `pressureT`, `cooldown`, `passing`, the internal `drift` field, the true `acc`, cars
outside the ranges above, closure extents beyond view, gantries beyond the next one, oncoming
traffic.

### 5.3 `src/botDriver.js`

```js
export const PROFILES = {
  forens: { setOverKmh: 4, keepRight: true, homeLane: 0, signalS: 3.0, overtakeKmh: 8,
            flashAfterS: 20, headwayS: 1.4, acceptLeadS: 1.0, acceptLagS: 1.2, minLagTtc: 5,
            react: 0.5, giveUpS: 15, backoffS: 10 },
  slak:   { setOverKmh: -10, keepRight: false, homeLane: 1, signalS: 2.0, overtakeKmh: 15,
            flashAfterS: Infinity, headwayS: 1.8, acceptLeadS: 1.2, acceptLagS: 1.5, minLagTtc: 6,
            react: 0.7, giveUpS: 15, backoffS: 10 },
};
// slak's homeLane is clamped to the lane count (lane 0 on a 2-lane road).

export class BotDriver {
  constructor(profileName, { seed, overrides = {} })
  update(dt, percept) → { keys: { throttle, brake, left, right, flash }, presses: [{ code, shift }] }
  get state()
  trace            // [{ t, from, to, why }]
}
```

**Output contract.** The bot only produces held keys and key presses. The runner converts them
exactly like the keyboard path: `pedalStep(state, keys, dt)` gives
`ctl = { steer: -1|0|1, throttle, brake, analog: false }`; each press goes through
`applyDrivePress()`, so the only methods reached are `toggleCruise`, `resumeCruise`,
`adjustCruise(±1 / ±5)` and `indicator(±1)`; the flash key goes through `holdFlash()`. The bot
never receives `player`, `traffic` or `msi`, never writes `v`, `lat`, `lane` or `cc.set`, and
never teleports. Presses are edge events (the keyboard has no auto-repeat for them); at most 4
presses per second. Digital steering only; no analog pad.

**State machine**

```
CRUISE ─ leader limits speed ─▶ FOLLOW ─ overtake allowed ─▶ PREP(dir)
PREP ─ gap accepted and signal on ≥ signalS ─▶ MOVE(dir)
PREP ─ no gap for giveUpS ─▶ cancel indicator, backoffS, back to CRUISE/FOLLOW
MOVE ─ target gap turns unsafe: progress < 50 % → ABORT (steer back) ; else finish and brake
MOVE ─ centred ─▶ SETTLE ─ indicator cleared ─▶ CRUISE or PASSING
PASSING (left of the overtaken car) ─ clear by max(15 m, 1.0 s·v) ─▶ PREP(right)
any ─ hazard ─▶ EMERGENCY ─ hazard gone ─▶ FOLLOW
```

**Longitudinal control and cruise control**
- Target speed = `percept.signs.limitKmh + setOverKmh`, so a lower MSI limit applies as soon as
  the sign is readable.
- Engage: hold W until speed ≥ target − 1, press C (sets the rounded current speed), then press
  ±1 (Shift for ±5 when 5 or more away) until `cc.set === target`. Same clicks when the target
  changes.
- Leader 0–6 km/h slower and no overtake possible: −1 clicks toward the leader's speed, cruise
  stays on.
- Larger closing: desired acceleration from an IDM rule on the perceived gap (T = `headwayS`,
  s0 = 5 m), realised by holding W or S frame by frame through `pedalStep`. Holding S switches
  cruise off, as for a human. Throttle never goes below 0.35 while W is held; accept that.
- Recover: nothing limiting and speed ≥ 30 km/h → R if `cc.set` still equals the target, else C
  and clicks.

**Lateral control**
- Lane change: hold A or D until the predicted settle position reaches the target lane centre.
  Prediction: `lat + v·sin(headingErr) / 1.5` (steering assist 2 straightens the heading at about
  1.5/s once input stops). Release; tap the other way if it will overshoot.
- Lane keeping: dead band ±0.25 m, taps.
- After centring (|off| < 0.4, |headingErr| < 0.03), wait 1 s for the game's own indicator
  cancel, then press Q or E to switch it off if it is still on. `indicator(dir)` toggles, so
  always read `self.ind` before pressing.

**Lane rules (`forens`)**
- Overtake when the same-lane leader is within 150 m and at least `overtakeKmh` slower than the
  target, and the left lane passes gap acceptance: lead gap ≥ max(15 m, `acceptLeadS`·v), lag
  gap ≥ max(10 m, `acceptLagS`·v_lag), lag ttc ≥ `minLagTtc`, and no car in the target lane with
  `seenAge < 0.5`, or drifting or signalling into that same lane.
- No undertaking: a slower car ahead in the lane to the left caps the bot's speed above 55 km/h.
- Return right when the right lane's lag gap ≥ max(15 m, 1.0 s·v) and there is no car in that
  lane at least 8 km/h slower within 8 s ahead; otherwise stay left.
- Flash: blocked in a left lane by a car at least `CONFIG.moments.dawdlerKmh` slower for
  `flashAfterS`, gap < 100 m, the lane to its right free → hold F for 0.3 s. At most one flash
  per 15 s, two per car.
- Closures: an obstacle, red cross or diagonal arrow ahead in your lane → PREP away. Without a
  gap, slow to the neighbouring lane's speed and merge late. The arrow truck is a stopped leader.
  A `red-cross` event in a bot journal is a bot failure.

**Collision avoidance**, in layers: gap acceptance; following; EMERGENCY (hold S when
`ttc < 3.0 s` or `tgap < 0.5 s`; the threshold is set by the brake ramp, which needs about 1 s to
reach 5 m/s²); MOVE abort; yield (an adjacent car within 40 m drifting or signalling toward the
bot's lane → release throttle, widen headway).

**When uncertain** (a car seen for < 0.5 s, a car straddling lanes, drift without a signal):
start no manoeuvre, hold the lane, keep cruise unless a hazard rule fires. Decisions take effect
after their condition has held for `react` s; EMERGENCY after 0.15 s.

**`slak`:** cruise at limit −10 in the home lane; overtakes only cars at least 15 km/h slower,
then returns to the home lane; never flashes.

**Determinism.** Any bot randomness comes from `mulberry32(seed + 4)`. No `Math.random` and no
wall clock anywhere in the sim path. Fixed `dt`.

### 5.4 Small changes elsewhere

- `player.js`: `this.clock = 0` advanced by `dt` in `update()`; replace the three
  `performance.now()` uses with it; `this.lastHit = -Infinity`. While unpaused, sim time tracks
  wall time, so the browser does not change.
- `input.js`: `export function pedalStep(st, { throttle, brake, left, right }, dt)` holding the
  body of today's keyboard branch, with `st = { thr, brk, thrHeld, brkHeld }`. `Input.controls()`
  calls it. Behaviour identical.
- `journal.js`: `start()` accepts `bot`, `runner`, `commitDirty` and `node` and copies them into
  the header; `finish()` accepts `contacts` into `end`. The human path passes none of these.
- `package.json`: `"playtest": "node tools/playtest.js"`, `"bottest": "node tools/bottest.js"`.

## 6. Data flow (one headless frame, dt = 1/60)

```
percept (previous frame) ─▶ bot.update ─▶ { keys, presses }
presses ─▶ applyDrivePress(sim)               before physics, like handlePresses
keys ─▶ pedalStep ─▶ ctl
stepSim(sim, dt, ctl): 2 × player.update(1/120) · 1 × traffic.step(1/60)
                       msi.update · updateClosures · journal.tick (samples at 2 Hz)
holdFlash(sim, keys.flash)                    after the tick, like main.js
drainEvents(sim)
every 0.1 s: perception.update(...) ─▶ percept
```

## 7. Runner: `tools/playtest.js`

```
npm run playtest -- driver=forens min=20 seeds=5 tod=day [scenario=closure] [seed=N] [until=T]
                    [dt=1/60] [jobs=N] [out=<dir>] [cfg.<key>=<value>] [<profile>.<param>=<value>]
```

- Seeds: `seeds=5` means seeds 1–5; `seed=N` runs one. Road uses `N`, traffic `N+1`, closures
  `mulberry32(N+3)`, bot `N+4`. `seed=20261112` drives the road and initial traffic of your
  calibration drive.
- The parent spawns one child per seed (`--child`), at most `jobs` at once (default: CPU count
  − 1). Each child: apply `cfg.*` to `CONFIG`, `createSim`, run the loop, write `seed-N.json`
  (journal) and `seed-N.trace.json` (bot transitions, min gap, min ttc), print one JSON line of
  checks.
- `until=T` (single seed): stop at T and print player state, nearest cars per lane from the
  percept, bot state and the last 20 trace lines. No report.
- The parent collects journals and writes `report.md` through `buildReport()`, unchanged,
  `run.json` (arguments, commit, timings, per-seed checks, pass or fail), and prints a check
  table. Exit code 1 if any check fails.

Run directory (already gitignored):

```
playtests/bot/<YYYY-MM-DD-HH-MM-SS>-<profile>-<tod>[-<scenario>]/
  run.json  report.md  seed-1.json  seed-1.trace.json  ...
```

Journal header for bot runs: `kind: 'bot'`, `driver: 'bot'`, `profile`, `bot: { params }`,
`seed`, `scenario`, `timeOfDay`, `limitKmh: playerLimit(sim)` at start, `config` (existing
diff, which now picks up `perception` and `cfg.*`), `recordFps: false`, `commit`
(`git rev-parse --short HEAD`), `commitDirty`, `node: process.version`,
`runner: { dt, playerSub, trafficSub, minutes, until }`. `end.contacts` = crash events. The
determinism hash covers every column and event, excluding `startedAt` and `endedAt`.

Runtime budget: 72,000 frames per seed; target ≤ 60 s per 20-minute seed, so 5 seeds take
≤ 2 min in parallel. Measure in P0; if over budget, `dt=1/30` is allowed and recorded.

## 8. Phases

Commit after each phase passes. If an acceptance test fails and the fix is not obvious, stop
and report rather than loosening the test.

| # | Work | Acceptance |
|---|---|---|
| P0 | `session.js`, `pedalStep`, Player sim clock, `main.js` on the helpers, runner skeleton with a null bot (press C at 100 km/h, hold the lane) | `npm run moments` passes; `npm run build` works; `node tools/shot.js` shows no console errors; null bot runs 20 min on seed 1 with 0 NaN; two runs hash the same; runtime recorded |
| P1 | `perception.js`, perception part of `bottest` | geometry, poison, import and drift tests pass (section 9) |
| P2 | Bot longitudinal control and cruise only | 5 seeds × 20 min: 0 contacts; modal `ccSet` = limit + 4; ≥ 1 R after braking; cruise share ≥ 0.6 |
| P3 | Lane changes: overtake, return, abort, yield, flash, closures | done criteria below; `scenario=closure` passes the closure with 0 contacts and no `red-cross` |
| P4 | Parallel runner, `run.json`, `report.md`, `until=` | `report.md` has all sections; `until=412` matches the full run's prefix |
| P5 | `slak`, README section, BACKLOG "Built:" note | `slak` 5 seeds: 0 contacts, ≥ 70% of time in the home lane, p50 speed = limit − 10 ± 2 |

**Done criteria for `forens`**, per seed (day, 20 min):
- `end.contacts = 0`, 0 scrapes, `health.nan = 0`, min bumper gap > 0.5 m.
- ≥ 1 completed overtake per 10 min (signal left, change left, later change right).
- Every `lane-change-start` comes 2.5–4 s after a `signal-start`; 0 unsignalled `lane-change`.
- Right-lane share ≥ 0.5; leftmost-lane share ≤ 0.3.
- Cruise share ≥ 0.7; modal `ccSet` = limit + 4; `cc` events only toggle / resume / adjust.
- p50 speed within limit + 4 ± 2.
- `report.md` exists with every section; the same seed run twice hashes the same.

## 9. Tests

`tools/bottest.js` (`npm run bottest`), all headless:
1. **Geometry:** hand-built fake traffic → expected `gap`, `tgap`, `ttc`, `lane`, `lanesOcc`,
   range cut-offs (including 80 m for lanes two away), a car straddling a line.
2. **Poison:** wrap every vehicle in a `Proxy` that throws on any field outside `ALLOWED`; a
   60 s live run of Perception + BotDriver must not throw.
3. **Imports:** regex over `perception.js` and `botDriver.js`; allowed: `./config.js`,
   `./util.js`, `./layout.js`, `./msi.js` (gantry helpers), `./perception.js`.
4. **Drift cue:** in a scripted lane change from `scenarios.js`, `drift ≠ 0` before `lanesOcc`
   changes.
5. **Bot on synthetic percepts:** following a slower leader, a cut-in triggers EMERGENCY, gap
   rejection, flash at 20 ± 0.5 s behind a left-lane dawdler, leaving a red-crossed lane, ABORT
   when the lag car closes.
6. **Determinism:** a 60 s run twice gives the same hash.

Commands:

```
npm run moments
npm run bottest
npm run playtest -- driver=forens min=20 seeds=5 tod=day
npm run playtest -- driver=forens min=5 seed=1 scenario=closure
npm run playtest -- driver=slak min=20 seeds=5 tod=day
npm run playtest -- driver=forens seed=3 until=412
```

## 10. Decisions taken (formerly open questions)

1. `forens` signals 3 s, as in the backlog. Your 1.4 s belongs to `jij` in slice 4.
2. `forens` uses ±1 clicks to reach limit + 4 exactly; the report shows click counts, so the
   difference from your C-only habit stays visible.
3. Limit: the bot obeys `playerLimit()`, the same source as the journal's `limit` column. The
   calibration journal's header (night/130) disagrees with its column (100). In P0, find out why
   and report it. Fix it only if it is a clear bug in how the header is filled, and do not touch
   the human journal file.
4. The done criterion runs at `tod=day` (limit 100); night is an extra run.
5. Digital steering only.
6. Perception values are exact in this slice (no noise).
7. `main.js` calls `stepSim` for the whole sim part of the frame.
8. Free-play closures stay random; merging is proven by the `scenario=closure` run.
9. Seeds are numbered 1–5.

## 11. Risks and gotchas

- Crash counting depends on the sim clock; contacts within 0.9 s count as one episode. The
  trace's min gap catches near-touches.
- Pedal ramp: EMERGENCY must start early (see 5.3). Manual following is coarse because of the
  0.35 minimum throttle; that shows in `thr` and `a` and is expected.
- Cruise: C uses the current rounded speed; any brake > 0.04 switches it off; C and R refuse below
  30 km/h; `adjustCruise` with cruise off but `has` set switches it on at the current speed.
- Steering assist 2 is assumed. Bot runs use defaults and the header records it.
- The indicator only auto-cancels at |lat − laneLat| < 0.55 and |headingErr| < 0.03. AI drivers
  read `proxy.signalLane`; the 3 s signal is what lets cooperative drivers make room.
- Keep the `makeTraffic` / `applyTime` order (section 3.5).
- The arrow truck at a closure is solid (`collide`, from `c.s0` to `s0 + 6.5`).
- Journal samples are 2 Hz. Judge flash, brake taps and signal timing from events, which carry
  exact `t`.
- Floating-point results may change between V8 versions: reproductions hold for the same commit
  and Node major version, both recorded in the header.
- `CONFIG` loading in Node: the `localStorage` read is already wrapped in `typeof` plus try/catch.
  Keep it that way.
- `sendJournal` is browser-only; the runner writes files directly.
- Bot reports never mention fps or stutter (`recordFps: false`); that belongs to human journals.

## 12. Effort

P0 0.5 d · P1 0.5 d · P2 0.5–1 d · P3 1–1.5 d · P4 0.5 d · P5 0.25 d. About 3.5–4.5 days.
P3 is the risky part: steering lane changes with taps, aborting, merging at closures.
