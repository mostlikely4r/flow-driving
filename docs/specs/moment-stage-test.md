# Spec: real-sim stage test for the moment detectors (F-37)

Status: ready to build · Written 2026-11-21 · Part of **Proefrit (F-37)**, see `docs/F-37-proefrit.md`

## Why

`tools/momenttest.js` checks the detectors against hand-built journals. That proves a rule is
written correctly, but not that the real sim feeds it the right input. The first calibration
added three things that synthetic rows cannot prove:

- `phantom-brake` now reads the journal's brake-light column, which is filled from `veh.brake`;
- `empty-signal` is new;
- `pointless-lane` is new.

The stage test runs staged situations through the actual path:
`Road` → `Player` → `Traffic.step` → `Journal.tick / sampleAt` → `detectMoments`. The detectors
see only what the journal recorded from `veh.brake`, `veh.indicator`, `veh.lane` and
`veh.latLocal`.

## Goals

- Show that the three detectors fire on real AI behaviour, and stay quiet when the behaviour has
  a visible reason.
- Every failure says whether the *situation* didn't happen (FIXTURE) or the *rule* misjudged it
  (DETECTOR).
- Deterministic, under a second, gated by `npm run moments` together with the synthetic cases.

## Non-goals

- No change to `CONFIG.moments` values. If a fixture only passes after a threshold change,
  stop and report; don't change the threshold.
- No change to how traffic behaves, and no traffic tuning to make a fixture pass.
- No calibration, no bot driver (slice 2), no browser, no rendering.
- Not a replacement for the synthetic cases.

## Problems found while reading (they shape this spec)

1. **The synthetic negative case passes without testing anything.** `momenttest.js` sets
   `reject: ['pointless-lane']`, but its runner only checks `expect`. The shared checker fixes
   this.
2. **A signalling car within 80 m only ever gets the "held" `empty-signal` text.** Once the
   held message fires, `sigFired` blocks the "withdrew it without moving" message. That message
   is only reachable when the car was more than 80 m away at the 8 s mark. Decision: cover the
   withdrew text with a new **synthetic** case. Staging it would need a two-pass placement that
   breaks easily.
3. **Closure obstacles never reach the journal.** `addClosure` puts `c.obs` into the lane lists,
   not into `traffic.vehicles`, and `sampleAt` only reads `traffic.vehicles`. A car leaving a
   closed lane to the left, or braking at the arrow board, is likely to be called pointless or a
   phantom brake. Decision: out of scope to fix. A report-only probe records it (see Probes),
   and a backlog note follows.
4. **The leader window in `pointless-lane` is a hard-coded `120`** (`o.dl - v.dl > 120`), not
   `cfg.pointlessM`. Decision: leave it as it is. Mention it in the backlog note.

## Files

| File | Change |
|---|---|
| `tools/lib/momentcheck.js` | **New.** Shared checker, used by both test scripts |
| `tools/momentstage.js` | **New.** Staged runner and fixtures |
| `tools/momenttest.js` | Use the shared checker (this fixes `reject`). Add one synthetic case for the "withdrew" text |
| `src/traffic.js` | Refactor only: move the signal-start block out of `laneLogic` into `Traffic.beginSignal(veh, target)`, and have `laneLogic` call it |
| `src/moments.js` | Refactor only: export `effLane(row, laneW, nLanes)` and use it inside `detectMoments` |
| `package.json` | Scripts (below) |
| `.gitignore` | `playtests/stage/` (output of `dump=`) |
| `README.md`, `BACKLOG.md` | One line each: what `npm run moments` now covers. Also a backlog note for problems 3 and 4 |

The two refactors must not change behaviour. Check this: `npm run simtest` and
`npm run scenario wave` must print the same numbers before and after.

### Scripts

```json
"moments": "node tools/momenttest.js && node tools/momentstage.js",
"moments:stage": "node tools/momentstage.js"
```

Arguments for `momentstage.js`:
- `only=<id>`
- `trace` (print the journal rows around each failure)
- `order=reverse`
- `dump=<dir>` (write each journal so `npm run report` can read it)

## Shared checker (`tools/lib/momentcheck.js`)

```
checkCase(moments, spec, ctx) -> { ok, kind: 'ok'|'FIXTURE'|'DETECTOR', lines: string[] }
  spec.expect: [{ kind, tag?, count?=1, sev?=[lo,hi], t?=[lo,hi], text? }]
  spec.forbid: [{ kind, tag? }]    // synthetic `reject: [kind]` maps to forbid
fmtMoments(moments, tagOf) -> string[]   // "  9.0s empty-signal sev2 [S] \"…\""
report(results) -> exitCode              // 0 all ok, 1 any failure
```

`ctx.tagOf(id)` turns vehicle ids into fixture tags. Synthetic cases pass the identity.

## Headless loop

```
runFixture(fx) -> { j, moments, tagOf }
  resetConfig(); assertConfigEqualsDefaults()            // harness error (exit 2) if not
  Object.assign(CONFIG, { lanes: 3, timeOfDay: 'day', adaptiveCruise: false })
  road    = new Road(DEFAULTS.seed)
  player  = new Player(road); player.placeInLane(fx.player.lane, fx.player.kmh)
  traffic = new Traffic({ dir: 1, density: 0, ahead: 1500, behind: 900, seed: fx.seed, limitKmh: 100 })
  player.update(0.001, IDLE, { vehicles: [], lanes: [] })
  actors  = applyScenario(traffic, fx.scenario, player.s)   // reseeds traffic.rng from fx.scenario.seed
  player.update(0.001, IDLE, traffic)
  journal = new Journal().start({ kind: 'bot', driver: 'stage', seed: fx.seed,
                                  scenario: fx.id, player, recordFps: false, commit: null })
  DT = 1/32                    // exact in binary: a journal sample lands exactly every 16 frames
  for frame in 0 .. fx.sec / DT:
    for k in 0..3: player.update(DT / 4, IDLE, traffic)    // same order as main.js
    traffic.step(DT, player.s, player.proxy)
    fx.script?.(traffic.time, actors, traffic)             // only beginSignal / nothing
    journal.tick(DT, player, traffic, 100)
    journal.playerEvents(player.events); player.events.length = 0
  j = journal.finish({ reason: 'stage' })
  return { j, moments: detectMoments(j), tagOf }
```

`IDLE = { steer: 0, throttle: 0, brake: 0, analog: false }`. The player drives on classic
cruise control set by `placeInLane`.

The harness never writes journal rows. It never sets `veh.indicator`, `veh.brake` or `veh.lane`
directly. It changes AI behaviour only through these three levers:
- persona fields in a scenario's `params` (the same mechanism `scenarios.js` uses);
- the existing `brakeEvent` path;
- `traffic.beginSignal(veh, target)`. This is the same state change `laneLogic` makes, so
  holding the signal, moving and cancelling all stay real behaviour.

### Isolation and determinism

- **CONFIG.** Snapshot `DEFAULTS` with `structuredClone` at start-up. Before every fixture,
  restore every key from the snapshot and delete any extra keys. Assert that `CONFIG` deep-equals
  `DEFAULTS` before the fixture's own changes. Assert that `j.header.moments` deep-equals
  `DEFAULTS.moments`, which proves no threshold drifted.
- **No `Math.random`.** For the whole run, set `Math.random = () => { throw new Error(…) }`.
  Any call is a harness error (exit 2).
- **Fresh objects per fixture.** `Road`, `Player`, `Traffic` and `Journal` are new each time.
  `applyScenario` reseeds the random generator.
- **Ids.** `NEXT_ID` is a module-level counter and keeps counting across fixtures. Never assert
  on raw ids; map them to tags.
- **Twice per fixture.** Run each fixture twice in the same process. The moments (with ids
  mapped to tags) and every journal column must be identical. Exclude only `header.startedAt`
  and `end.endedAt`.
- **Health.** No `crash` or `scrape` events, no NaN in any column, and the player's lane is
  constant. `Player` uses `performance.now()` only on the crash and scrape paths.

## Fixtures

Common to all fixtures:
- 3 lanes, day, limit 100, `density: 0`.
- Every staged vehicle is a `car` / `sedan` with `persona: null`, and params
  `{ jitterW: 0, jitterPh: 0, wanderA: 0 }` merged in, so its speed and lateral position don't
  wobble.
- `ds` is centre-to-centre in metres, relative to `player.s`. Sedans are about 4.5 m long.
- `want` sets the vehicle's desired speed.

Times below are the sim/journal `t` in seconds.

### PB: phantom brake (gating)

- **Setup.** Seed 101, 12 s.
  - Player: lane 1, 100 km/h.
  - `tapper`: lane 1, ds +50, 100 km/h, `want: 100`.
  - `tapper` params: `brakeEvent: { at: 4, kmh: 92, decel: 1.2, hold: 1 }`, `cooldown: 1e9`.
  - Nothing else.
- **Why it works.** At −1.2 m/s² the brake light comes on (a < −0.85) for about 1.8 s. The speed
  drops about 2 km/h per sample, which is under 2 m/s². So only the brake-light column can catch
  it, and that is what this fixture is for.
- **Preconditions (FIXTURE checks).**
  - `tapper` has brake = 1 on at least 2 consecutive samples between 4 and 6 s.
  - Its largest per-sample deceleration, from the km/h column, is below `cfg.phantomBrake`.
  - No row is within `cfg.phantomLook` ahead of it.
- **Expect.**
  - `phantom-brake` exactly once for `tapper`, severity 2, t 4.0–5.0, text contains
    "tapped the brakes".
- **Control.** Run `detectMoments` on a copy of the journal with `header.hasBrake = false`.
  It must fire **no** `phantom-brake` for `tapper`.
- **Must not fire:** `near-miss`, `cut-off`, `unannounced`, `pop-in`.
- **Failure messages.**
  - `DETECTOR phantom-brake: tapper's brake light was on at <t0>–<t1> s with nothing within 40 m ahead, but no phantom-brake fired (got: …)`
  - `DETECTOR phantom-brake control: with hasBrake=false it still fired, so the speed drop, not the brake column, triggered it`

### PB-neg: brake with a visible reason (gating)

- **Setup.** Seed 102, 14 s.
  - Player: lane 1, 100 km/h.
  - `lead`: lane 1, ds +85, `brakeEvent: { at: 4, kmh: 85, decel: 2.5, hold: 2 }`,
    `cooldown: 1e9`.
  - `follower`: lane 1, ds +50, `cooldown: 1e9`. It reacts through normal IDM and `reactLate`.
- **Preconditions.**
  - `follower` has brake = 1 on at least one sample between 4 and 9 s.
  - At each of those samples, `lead` is in the same lane less than `cfg.phantomLook` ahead of it,
    bumper to bumper.
- **Must not fire:** `phantom-brake` for `follower`. If one fires for `lead`, that's correct and
  is ignored.
- **Failure message.**
  `DETECTOR phantom-brake fired for follower at <t> s although lead was <g> m ahead of it and braking`

### ES: empty signal, held and then withdrawn (gating)

- **Setup.** Seed 201, 16 s.
  - Player: lane 0, 80 km/h.
  - `L`: lane 1, ds +60, 80 km/h, `want: 80`, `cooldown: 1e9`.
  - `S`: lane 1, ds +25 (bumper gap to `L` about 30 m), 80 km/h, `want: 100`.
    Params: `p: 0`, `tSignal: 2`, `tSafe: 0.8`, `coop: 0`, `cooldown: 1e9`.
  - `B`: lane 2, ds +16 (4.5 m behind `S`, bumper to bumper), 80 km/h, `want: 80`.
    Params: `cooldown: 1e9`, `coop: 0`, `antic: 0`.
- **Script.** At t = 1.0, `traffic.beginSignal(S, 2)`.
- **Why the hold is real behaviour.** Every second, `evaluate` finds `B` too close behind in
  lane 2, so the move is unsafe.
  - The margin stays positive, because `S` really does want to pass `L`. So the early cancel
    (margin < −0.15) doesn't happen.
  - The real `cancelChange` runs once `signalT > tSignal + 8`, around t = 12.
  - `B` can't make room: anticipation and cooperation are off, and it has no leader to drop
    behind.
- **Preconditions.**
  - `S` has indicator = −1 continuously for at least 8 s, starting at the 1.0 or 1.5 sample.
  - `S`'s `effLane` is 1 throughout.
  - `S`'s indicator is back to 0 by t ≤ 12.5 with no lane change. This is the "withdraws" half,
    done by the real cancel code.
- **Expect.**
  - `empty-signal` exactly once for `S`, severity 2, t 9.0–10.0, text contains
    "has indicated left".
  - Exactly one also guards against the held and withdrew messages both firing for the same
    signal.
- **Must not fire:** `unannounced`, `cut-off`.
- **Failure message.**
  `DETECTOR empty-signal: S indicated left <t0>–<t1> s at <d> m without moving; expected 1 moment, got <n> (…)`

### PL: pointless lane change (gating)

- **Setup.** Seed 301, 14 s.
  - Player: lane 0, 100 km/h.
  - `P`: lane 1, ds +60, 100 km/h, `want: 100`.
    Params: `bias: 0`, `p: 0`, `tSignal: 2.5`, `lcDur: 4`, `cooldown: 1e9`.
  - Lanes 1 and 2 are empty ahead.
- **Script.** At t = 2.0, `traffic.beginSignal(P, 2)`.
- **What is real.** The real `evaluate` runs when the signal ends. Lane 2 is safe, and the
  margin, about −(thr + 0) = −0.12, is above the −0.3 it needs, so `P` moves. The move, the
  sideways path and the lane-index flip are all real.
- **Preconditions.**
  - `P`'s `effLane` changes from 1 to 2 exactly once.
  - At that sample, `P` is 5–120 m ahead of the player.
  - No row is in lane 1 ahead of `P` within 120 m.
- **Expect.**
  - `pointless-lane` exactly once for `P`, severity 2, t 5.5–8.0, text contains
    "nothing ahead".
- **Must not fire:** `unannounced` for `P`.
- **Failure message.**
  `DETECTOR pointless-lane: P moved 1→2 at <t> s, <d> m ahead, nothing in lane 1 ahead of it; no pointless-lane fired (got: …)`

### PL-neg: a justified overtake (gating)

- **Setup.** Seed 302, 20 s.
  - Player: lane 0, 85 km/h.
  - `L`: lane 1, ds +100, 80 km/h, `want: 80`, `cooldown: 1e9`.
  - `O`: lane 1, ds +40, 100 km/h, `want: 100`.
    Params: `tSignal: 2.5`, `cooldown: 0.5`, `decT: 0`, `tPrep: 0.5`, `antic: 0.8`, `lcDur: 4`.
  - No script. `O` decides to overtake through normal lane-change logic (MOBIL).
- **Preconditions. These stop the case from passing without testing anything.**
  - `O`'s `effLane` changes from 1 to 2 between 2 and 15 s.
  - At that sample, `L` is in lane 1 ahead of `O` within 120 m, at a speed ≤ `O`'s speed + 0.5.
  - If `O` never moves, report:
    `FIXTURE PL-neg: overtaker never left lane 1; the negative would pass without testing anything`
- **Must not fire:** `pointless-lane` (for anyone), `unannounced` for `O`.
- **Failure message.**
  `DETECTOR pointless-lane fired for O at <t> s although L was <g> m ahead in lane 1 at <k> km/h (O <ko>)`

### Probes (report-only: print `info`, never affect the exit code)

- **probe-closure.**
  - Use `fx.scenario.closures = [{ lane: 0, ds: 400, len: 600 }]`.
  - Put a car in lane 0 at ds +60, and the player in lane 1.
  - Print which of `pointless-lane` / `phantom-brake` fired for that car (problem 3).
- **probe-far.**
  - Use the PL-neg setup, with `L` at ds +170 and 70 km/h.
  - Print whether `pointless-lane` fired for `O` (problem 4, and a calibration question).

## Fixture tuning rules (for whoever builds this)

The numbers above come from reading the code, not from runs. If a precondition fails, you
**may** adjust:
- positions, speeds and `want`;
- `brakeEvent` fields and script times;
- persona params passed through `params`;
- duration and time windows. Keep each window tight, at most 1.5 s wide.

You **may not** change:
- `CONFIG.moments`;
- detector logic in `moments.js` (only the `effLane` export);
- traffic behaviour in `traffic.js` (only the `beginSignal` extraction).

Write each adjustment as a short comment on the fixture, explaining why.

If a fixture can't be made to work within these rules, keep it in the suite, marked
`skip: '<reason>'`, and report it.

## Failure output

```
FAIL  DETECTOR  ES  empty signal, held and withdrawn
      expected empty-signal ×1 [S] sev 2..2 t 9.0..10.0 "has indicated left"
      got: (none)
      all moments:  –
      trace S (journal rows, ±3 s):  t   lane  off    km/h ind brake  dl
                                    8.5  1   -0.31   80  -1   0     25
                                    …
      rerun: npm run moments:stage only=ES trace   (seed 201 · dt 1/32 · 16 s)
```

The `trace` lines come from the journal, which is exactly what the detector saw.

## Acceptance

```powershell
npm run moments
```
- All synthetic cases pass, including the new "withdrew" case and the negative, now actually
  checked with `forbid`.
- 5 staged `ok` lines and 2 probe `info` lines. Exit 0.

```powershell
npm run moments:stage -- order=reverse
```
Same result as the normal order.

```powershell
npm run moments:stage -- only=ES trace
```
The same fixture gives the same result when run on its own.

- **Exit codes:**
  - 0: everything passed.
  - 1: a FIXTURE or DETECTOR failure.
  - 2: a harness error (an exception, CONFIG not matching `DEFAULTS`, or the `Math.random`
    tripwire).
- **Runtime:** under 1 s for the staged part, under 3 s for `npm run moments` overall.
- **Refactor check:** `npm run simtest` and `npm run scenario wave` give the same output before
  and after the refactors.
- **Thresholds:** `CONFIG.moments` is unchanged.

## Risks

- **2 Hz sampling.**
  - Signal and brake start times are rounded up to the next sample (up to 0.5 s late), so the
    time windows are 0.5–1 s wide.
  - A brake tap shorter than 0.5 s can fall between samples entirely, in human drives too.
  - `dt = 1/32` gives exact 0.5 s samples. At the browser's 1/60, `lastSampleT = this.t` drifts
    the rate to about 1.97 Hz. That's not changed here.
- **Brake-light hysteresis.**
  - The light comes on below −0.85 and goes off above −0.35. Soft braking in between keeps a
    light on once it's on.
  - PB brakes at −1.2, then holds at about 0.
  - The exact-count check catches a second fire after the detector's 8 s cooldown.
- **Lane-index flip.**
  - `veh.lane` flips at `lcT ≥ 1`, and the offset jumps from ±3.5 to 0. `effLane` switches at
    the halfway point, so it stays consistent.
  - The abort path swaps lanes at `lcT < 0.3`.
  - `wanderA = 0` avoids flicker near ±1.75 m. The "changes exactly once" precondition would
    catch any flicker.
- **Seed and CONFIG leakage.** Covered by reseeding, the CONFIG restore and check, the
  `header.moments` check, the tripwire and the reverse-order run.
- **Fixtures break when traffic is retuned.** That's intended. They fail as FIXTURE failures
  that name the broken precondition, so nobody mistakes them for detector bugs.
- **Player drifting sideways on curves.** With `steeringAssist: 2` it should hold its lane, and
  the health check would catch drift. If it happens, add a small lane-keeping controller on
  `ctl.steer`. Never set `player.lat`.

## Deferred (backlog note, not this change)

- Record closure obstacles as journal rows (problem 3).
- Make the 120 m leader window a CONFIG key, keeping the same value (problem 4).
- Decide whether pulling out for a slow car 130–200 m ahead counts as "pointless" from the seat.
  That's for calibration against your marks.
- Record brake-light on/off events for nearby cars, so taps shorter than 0.5 s aren't invisible.

## Effort

About one day:
- shared checker, the `reject` fix and the "withdrew" case: about 1.5 h;
- harness and the two refactors: about 3 h;
- five fixtures: about 3 h;
- probes, the twice-per-fixture check and the reverse-order run: about 1 h.
