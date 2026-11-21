# F-38: a signal means the car will move (spec)

Status: ready to build · Written 2026-11-21 · BACKLOG item **F-38** (M1: Readable flow) · Baseline
commit `1e93d31`

## Why

When an AI car's indicator comes on, the player should be able to trust that it is about to move.
Today a car often signals, holds the signal for up to ~10 s, withdraws it, and 1.5–3.5 s later
signals again. This is the biggest Readable-pillar problem in the only human drive so far.

**From the user's play** (`playtests/human/2026-11-20-21-57-40.json`, 14.8 min at night, 20 F8
marks; read it with `npm run report -- <file>`):
- 5 of 20 marks are this problem, for example: *"Blinking is 'I am going to move'... not oh no
  someone is coming let me not go."*, *"blink.. blink off.. blink"*, *"Van in front of me had
  blinking lights to go to my lane.. then did.. nothing? Plenty of room."*, *"nothing on his
  right.. move already!"*
- `empty-signal` was the most frequent friction moment in that drive: 9 times, 6.1 per 10 min.
- Its answer to "a car that felt wrong?" was: *"See my moment log. Not 100% sure about behavior in
  general."*

**Measured** (journal analysis done while writing this spec; step 1 turns it into a tool):

| | Human drive (night) | Bot `forens` day, 5×20 min | Bot `forens` night, 5×20 min |
|---|---|---|---|
| `empty-signal` per 10 min (detector, cars within 80 m) | 6.1 | 4.7 | 3.4 |
| Signals withdrawn without moving after ≥ 6 s, per 10 min (all journal cars) | 10.8 | 13.5 | 8.5 |
| Signals started within 20 s of the same car withdrawing one | 43 | 413 | 213 |
| Of the ≥ 6 s withdrawals: blocker is a car *behind* in the target lane | 16 of 16 | 124 of 135 | 72 of 85 |
| … that blocker within ±5 km/h of the signaller | 15 | 96 | 37 |
| … the blocker's gap behind the signaller (bumper, s), p10/p50/p90 | 0.2 / 0.5 / 0.9 | 0.1 / 0.5 / 1.0 | 0.1 / 0.5 / 1.0 |
| … blocker is the player | 4 | 20 | 22 |
| Signal on → lane change, p50 / p90 (s), when the car does move | 3.1 / 5.1 | 3.6 / 5.2 | 4.0 / 5.2 |

Bot runs: `npm run playtest -- driver=forens min=20 seeds=5 tod=day` and `tod=night` at
`1e93d31`, about 35 s each. `playtests/bot/` is gitignored, so step 1 re-runs them.

**The picture (from reading `src/traffic.js` at `1e93d31`):**
1. `laneLogic`, state `none` (~line 727): when the wanted lane is *unsafe*, the driver still signals
   at random (`waitAndSignal`): 35% of decisions for a left move with margin > 0.25, and 50% for
   a right move with margin > 0.1.
2. State `signal` (~line 756): it re-checks every second and cancels when
   `signalT > tSignal + 8`. Then `cancelChange` sets `cooldown` to 1.5–3.5 s, and the next decision
   can signal again. That is the blink, blink off, blink loop.
3. Nothing makes the gap open. The usual blocker sits about 0.5 s behind in the target lane at the
   same speed. Gap seeking while signalling (`computeAcc`, ~line 444) only drops back behind a
   target-lane *leader* within 25 m, and only lifts (−0.4) for a *faster* follower within 15 m. A
   cooperative follower (`coop`, ~line 420) only opens to `0.45 × T` behind the signaller. That is
   less than the signaller's own `tSafe` check (`evaluate`, ~line 584) asks for, so the two can
   stay level indefinitely.
4. The stricter bar when the follower is the player (`tSafePlayer = tSafe + 0.35/0.4`, and
   `idm(player) < −1.0` instead of `−bSafe`, ~lines 584–586) is **not** the main cause. In the
   player-blocked cases above, the gap was under 1 s, or the player was closing at 5+ km/h, in all
   but a few. It stays as it is (see Not doing).

## Goal and non-goals

**Goal** (*decided*, the user's words): a turn signal means the car is going to move. A car signals
when the gap is there or is visibly opening, then moves within a few seconds. It does not
withdraw and re-signal in a loop.

**How it is done** (*proposed by Claude*; the user agreed to the direction: "signal only when a gap
exists or is opening, slow down to drop in behind, wait much longer before signalling again"):
- **Line up first, then signal.** A driver who wants to move right but has a car alongside or just
  behind in the target lane first lines up, without signalling: it pulls a little ahead, or lifts
  off to let that car pass. The existing intent drift toward the line stays visible while it
  does. It signals once the move will be safe within a short horizon.
- This order changes the direction above, which had the car slowing down while already
  signalling. Lining up takes up to ~10 s (dropping 33 m behind a same-speed car at a lift-only
  rate), which would itself be an 8 s held signal. Positioning before the signal is also what Dutch
  drivers do in dense traffic: the indicator is the last thing before the move.
- **No signal into a gap that is not there**, except at a lane closure (ritsen: zipper merging,
  where signalling and waiting is the real behaviour).
- **A short hold, then a long pause.** A signal that does not lead to a move is withdrawn after a
  short hold. That side is then not signalled again for a while.

**Non-goals**
- No change to `CONFIG.moments` (the detectors judge; they are not tuned to pass).
- No change to the closure and zipper paths (`zip`, `cornered`, `closure > 0` in `evaluate`).
- No work on `pointless-lane` or `phantom-brake` (separate items, see Not in this build).
- No change to the bot driver (`src/botDriver.js`) or the player car.

## Files

| File | Change |
|---|---|
| `tools/signals.js` | **New** (step 1). Signal analysis over journals |
| `package.json` | Script `"signals": "node tools/signals.js"` |
| `src/traffic.js` | Steps 2–3: signal rule, line-up, hold and re-signal pause; coop target (step 3) |
| `src/config.js` | New `CONFIG` keys (below), each with a one-line comment |
| `src/overlay.js` | Dev overlay line shows lining up (`wants R · lining up ahead 3.2s`) and the re-signal pause |
| `src/scenarios.js` | New scenario `slot` (step 2) |
| `tools/momentstage.js` | ES fixture: longer `tSignal` so its 8 s hold is still real behaviour (step 2) |
| `README.md`, `BACKLOG.md` | Step 4 |

`src/traffic.js` stays free of rendering code (engine-migration rule). The new logic reads only
vehicle state that `traffic.js` already uses.

## New CONFIG keys (all values are proposals, to be checked against the step 1 numbers)

| Key | Value | Meaning |
|---|---|---|
| `signalHorizonS` | 2 | A driver may signal if the move is safe now, or at `tSignal + signalHorizonS` with the gaps projected at current speeds |
| `signalHoldS` | 3 | Longest wait past `tSignal` before the signal is withdrawn |
| `resignalS` | 12 | After a withdrawal, no new signal toward that side for this long |
| `lineUpS` | 12 | Longest time spent lining up before giving the wish up (normal `cooldown` follows) |
| `lineUpKmh` | 6 | Lining up ahead may go at most this far above the driver's own `v0` |
| `lineUpLift` | −0.7 | Deceleration cap (m/s²) when lining up behind. Above the −0.85 brake-light threshold, so it reads as lifting off and adds no brake lights |

## Steps

### 1. Measure: `tools/signals.js`, and the baseline

- `npm run signals -- <journal.json | run dir> …` reads one or more journals (human or bot; a run
  directory means its `seed-*.json`, never `*.trace.json`) through `readSamples` and `effLane` from
  `src/moments.js`.
- **Signal episode:** a vehicle's indicator goes from 0 to ±1. It ends when:
  - the vehicle's `effLane` changes: **moved**. Its indicator staying on until the move completes is
    the same episode, and a new episode can only start after the indicator has been 0;
  - or the indicator returns to 0 in the same `effLane`: **withdrawn**.
- Print per input group, plus a total:
  - minutes driven, signals, moved, withdrawn;
  - signal-to-move p50 / p90;
  - withdrawn after ≥ 6 s per 10 min;
  - signals started within 20 s of the same car withdrawing one;
  - for the ≥ 6 s withdrawals: the blocker is the nearest car (or the player) in the target lane
    within 60 m behind to 25 m ahead of the signaller, at the middle of the hold. Report whether it
    is behind, its speed difference p10/p50/p90, its bumper gap in s p10/p50/p90, and whether it is
    the player;
  - the `empty-signal` count and rate from `detectMoments`, so one command shows both views.
- Re-run the baseline at the commit before step 2 and save both outputs in the plan's results
  section (append under **Results** at the end of this file):
  - `npm run playtest -- driver=forens min=20 seeds=5 tod=day`, then the same with `tod=night`;
  - `npm run signals -- <both run dirs>` and `npm run signals -- playtests/human/2026-11-20-21-57-40.json`.
  - Also record: `npm run simtest` (lane changes per minute, lane shares, truck lanes, overlaps, min
    acc), and the `report.md` rates for `cut-off`, `near-miss`, `unannounced`, `phantom-brake`.
- The numbers must match the table in **Why** to within rounding. If they don't, the tool's
  episode rule differs from this spec's: fix the tool, not the table.
- Commit: "Signal commitment P1: tools/signals.js and baseline (F-38)".

### 2. The signal rule, lining up, hold and pause (the smallest version to try)

All in `src/traffic.js` unless stated otherwise.

**a. One gap test, used twice.** Factor the non-zip part of `evaluate`'s `safe` block (the `nl`
and `nf` gap and `idm` checks, ~lines 577–587) into `gapSafe(veh, nl, nf, gNl, gNf)`, so
`evaluate` behaves exactly as before. Add `projectedSafe(veh, t, h)`: the same `gapSafe` with
both gaps moved linearly by `h` seconds at current speeds:
- `gNf + (veh.v − nf.v)·h`;
- `gNl + (nl.v − veh.v)·h`.

For the `idm(nf, veh)` check, use the projected gap with current speeds. A projected gap ≤ 0 is
unsafe.

**b. When a driver may signal** (state `none`, replacing the `waitAndSignal` line):
- If `best.ev.safe`, signal (unchanged).
- Else if the lane change is closure-driven (`closure > 0` in `evaluate`; return it in the `ev`
  object), or `zip` / `cornered`, keep today's `waitAndSignal` exactly as it is.
- Else if `projectedSafe(veh, t, veh.tSignal + CONFIG.signalHorizonS)`, signal: the gap is
  opening.
- Else, for a **right** move only, start lining up (c). For a left move, do nothing: the intent
  (drift) stays and the next decision looks again.
- No signal toward a side whose re-signal pause (e) is still running.

**c. Lining up** (right moves only; `veh.lineUp = { kind, side, t0 }`, cleared on signal, on
giving up, or when the intent goes away):
- The blocker is the target-lane follower `nf` that fails `gapSafe`, and is not faster than the
  signaller by more than 1 m/s. A faster `nf` is handled by (b) as a gap that opens on its own.
- **`ahead`**: choose it when the driver is not a truck (trucks have speed limiters), its own lane
  ahead has room (own leader's bumper gap > `2 + v·T + 20` m, or no leader), and the
  target-lane leader `nl`, if any, is far enough ahead that `projectedSafe` can come true.
  `computeAcc` then uses IDM with `v0 + lineUpKmh·KMH`, still bounded by the own leader as
  usual.
- **`behind`**: otherwise, if `nf` is within ±3 km/h. `computeAcc` takes
  `min(a, lineUpLift)` until `nf` is ahead. After that, the existing drop-behind-the-target-lane-
  leader branch takes over.
- Each decision tick (the existing `decT` cadence), re-test (b). Signal as soon as it allows.
- After `lineUpS` without signalling, give up: clear intent and use the normal
  `cooldown = 1.5 + rng·2`.
- The existing intent drift (`computeAcc` / lateral code ~line 973) keeps running while lining
  up, so the wish stays visible without a signal.

**d. Hold and withdraw** (state `signal`):
- Replace `veh.signalT > veh.tSignal + 8` with `veh.signalT > veh.tSignal + CONFIG.signalHoldS`.
  Keep the early cancel on `ev.margin < −0.15`, the horn and "into the player" cancel, and the
  closure paths unchanged. A closure-driven signal keeps the old `+ 8`.
- While signalling, the existing gap seeking stays as it is.

**e. Re-signal pause.** `cancelChange` (except for closure-driven signals) sets
`veh.noSignalT[side] = CONFIG.resignalS`. Count it down in `laneLogic`. While it runs, that side
cannot be signalled. Lining up toward it is allowed, so the driver can still get into position.

**f. Determinism.** `waitAndSignal` consumed `this.rng()`. Outside closures it no longer does, so
every seeded run shifts. Compare distributions, not exact numbers. `npm run scenario wave` and
other seeded outputs will differ; that is expected.

**g. Dev overlay** (`src/overlay.js`):
- On the `wants` line, append `· lining up ahead|behind <t>s`.
- Append `· no signal L|R <t>s` while a re-signal pause runs.

**h. Scenario `slot`** (`src/scenarios.js`): 3 lanes, day, seed fixed.
- Player: lane 2 (left), 105 km/h on cruise.
- `slotter`: lane 2, ds +40, 100 km/h, wants to move right (`bias` high enough that it does).
- `blocker`: lane 1, ds +25, 100 km/h, `want: 100`, `coop: 0`, so it sits about 0.5 s behind the
  slotter in the target lane.
- Lane 0 has a truck far ahead, so the scene reads as real.
- `about`: "The car ahead wants to move right, but a car is right behind it in the middle lane.
  Watch it line up first, then signal and go."
- `npm run scenario slot` must show the slotter line up, signal, and move within
  `lineUpS + tSignal + signalHoldS`, with no signal before it lines up and no withdrawal.

**i. Stage test ES fixture** (`tools/momentstage.js`):
- ES stages an 8 s held signal through `traffic.beginSignal`. Under the new hold (`tSignal + 3`), a
  real driver withdraws before 8 s, so give `S` `tSignal: 6` in its params. Its hold then really
  lasts about 9 s, and the detector is tested on it.
- This is a persona-param change, which that fixture's own tuning rules allow. Comment why on the
  fixture.
- If `cancelChange` now also sets the re-signal pause, ES's "withdrawn" half still holds.

**Checks for step 2** (full check, plus the step 1 commands):
- `npm run build`, `npm run simtest`, `npm run personas`, `npm run moments`, `npm run bottest`.
  Note how long each took the first time, under Results.
- `npm run playtest` day and night as in step 1, then `npm run signals` on both runs.
- If a personas demo breaks because the behaviour changed as intended (for example a
  `demo:*:signal` caption that relied on signal-and-wait), restage the demo, don't bend the
  behaviour. Name it under Results.

Targets against the step 1 baseline (*proposed*; the user's drive overrules them):

| Measure | Day base | Night base | Target |
|---|---|---|---|
| Withdrawn after ≥ 6 s, per 10 min | 13.5 | 8.5 | ≤ 3 |
| Signals within 20 s of a withdrawal (per 100 min) | 413 | 213 | ≤ 25% of base |
| `empty-signal` per 10 min | 4.7 | 3.4 | ≤ 1.0 |
| Signal → move p90 | 5.2 s | 5.2 s | ≤ 5.5 s |
| `unannounced` per 10 min | 0.0 | 0.0 | 0.0 (lining up must not shorten the visible telegraph) |
| `cut-off`, `near-miss` per 10 min | 0.4, 0.5 | 0.0, 0.1 | no more than +0.3 |
| `phantom-brake` per 10 min | 16.0 | 10.6 | not higher (`lineUpLift` stays above the brake-light threshold) |
| simtest lane changes per min, right moves | step 1 value | — | within −15% |
| simtest truck share in lane 1 | step 1 value | — | within −20% (elephant races still happen) |
| Collisions, overlaps, emergency stops | 0 | 0 | 0 |

If a target is missed, report it with the numbers. Don't tune `CONFIG.moments` to reach it.

Commit when the full check passes: "Signal commitment P2: signal only into a gap, line up, short
hold (F-38)".

**Stop here for the user to try.** The Try it below is the test; the bot can't say whether it
reads right. Steps 3 and 4 wait for the user's verdict.

### 3. Cooperative drivers open the gap the signaller needs (only if step 2's numbers ask for it)

Do this step only if step 2 shows one of these against the step 1 values:
- simtest right moves per minute down more than 10%;
- left-lane share up more than 3 points;
- the user's drive after step 2 says cars get stuck left.

Otherwise skip it, and say so under Results.

The proposal: today a `coop` follower opens only to `0.45 × T` behind a signalling car, which is
less than the signaller's `gapSafe` requires. So the two stay level (the picture, point 3).
- Make the coop follower's target the bumper gap `2 + v · CONFIG.letInHeadwayS`, with
  `letInHeadwayS: 1.1` as a new key. That clears the `tSafe` of every persona except the most
  careful pensioners.
- Allow (b) to signal when `nf.coop` and the gap reaches that target within
  `tSignal + signalHorizonS` with the follower easing at ≤ 1.0 m/s². That is the "signal and
  someone lets you in" case.
- The signaller then holds its speed (no lining up), so the two don't both slow ("after you").
- This also changes how much room a coop driver gives *the player* when the player signals. Check
  `let-in (good)` in the bot reports, and the `yield` demos in `npm run personas`.

Same checks and targets as step 2. Commit: "Signal commitment P3: coop drivers open a real gap
(F-38)".

### 4. Docs

- `BACKLOG.md`:
  - set F-38's status to what was built, in the table's usual style, with the before/after
    numbers from `npm run signals`;
  - add one line under **Harness findings**: the measured cause (same-speed blocker 0.5 s behind,
    random signal-and-wait, 8 s hold, 1.5–3.5 s re-signal).
- `README.md`: one line for `npm run signals`, next to the playtest bot paragraph.
- Commit: "Signal commitment P4: README and BACKLOG (F-38)".

## How we'll know

- **Checks:**
  - full check: `npm run build`, `simtest`, `personas`, `moments`, `bottest`, all green;
  - `npm run scenario slot` as described in 2h;
  - `npm run signals` on bot day and night runs, against the targets table;
  - the stage test still catches a real 8 s held signal (ES with `tSignal: 6`).
- **Try it** (about 10 minutes):
  1. Run `npm run dev` and open `http://localhost:5173/?scenario=slot`. The car ahead of you in
     the left lane drifts toward the line and speeds up a little, *then* signals right and moves
     over within about 3 s. It doesn't signal while a car is beside it. Press `O` for the dev
     overlay: it shows `lining up ahead`.
  2. Then do a 10-minute free-play drive at night, as last time: left lane, ~105 on cruise, F8
     whenever a car's signal surprises you. Expected: when a car's indicator comes on, it moves.
     No "blink, off, blink" in front of you, and cars ahead in the left lane get out of your way
     by lining up and then moving.
  3. Afterwards, `npm run report -- playtests/human/<new file>.json` and `npm run signals --` on
     the same file. Compare the `empty-signal` line with the 6.1 per 10 min from 2026-11-20.

## Not doing

- **Loosening the player-as-follower bar** (`tSafePlayer`, the −1.0 m/s² check). Measured: in
  most player-blocked holds the gap was under 1 s, or the player was closing, so waiting was
  right. The fix is not signalling while blocked, not merging in front of the player more
  tightly.
- **Changing `signalPatienceS` (8 s) or any detector threshold** to bring the `empty-signal` count
  down.
- **Slowing down *while* signalling, to drop back a whole car length.** Replaced by lining up
  before signalling (see How it is done). Dropping back at lift-only rates takes about 10 s.

## Needs first

All present at `1e93d31` (checked while writing this spec):
- `readSamples` and `effLane` exported from `src/moments.js`;
- `npm run playtest` with `driver=forens`, `tod=day|night`, `min`, `seeds`, writing
  `playtests/bot/<run>/seed-N.json`;
- `npm run report`;
- `Traffic.beginSignal` (used by the ES fixture);
- the dev overlay `O` in dev mode;
- the human journal `playtests/human/2026-11-20-21-57-40.json`.

## Not in this build

- `pointless-lane` from the same drive (5 times, and the "it went left when I came up behind"
  marks). Part is the detector: it compares against the car's current speed, not its wanted
  speed (at night drivers want 130+). Part is anticipation reach (`expSpeed`, `antic` up to 1)
  starting overtakes 150 m+ early. A separate item.
- `phantom-brake`: the unmarked "braked twice for an empty middle lane" (8:10, 8:21 in the human
  drive), plus the known gaps (closure obstacles are not journal rows, and 2 Hz misses short
  taps). See "Open: what the stage test cannot see yet" in `BACKLOG.md`.
- A van's flickering rear windows (mark at 1:15; probably two surfaces drawn in the same place), and the night fps dips (min 20, 94 s under 30 fps).
- The bot's own gate failing on every seed (`run.json` `failed: 5`: right share and p50 both can't
  hold on default traffic). Known from F-37 slice 2. Don't read it as a result of this change.
- Left moves never line up. If the user's drive shows cars stuck behind slow traffic because the
  left lane never has a gap, that is a follow-up.

## Results

(Filled in by the build: baseline outputs, check timings, step 2 numbers against the targets, the
user's verdict, and whether step 3 ran.)

### P1: `tools/signals.js` and the baseline

Built at `ee0432f` (traffic behaviour unchanged since `1e93d31`). Run dirs:
`playtests/bot/2026-11-21-12-39-46-forens-day/`, `playtests/bot/2026-11-21-12-40-17-forens-night/`.
Each took about 20 s of wall time (5 seeds, 20 min, parallel).

`npm run signals`, baseline (spec table in brackets):

| | day, 100 min | night, 100 min | human, 148 min in brackets |
|---|---|---|---|
| signals / moved / withdrawn | 1968 / 1299 / 614 | 1355 / 1007 / 304 | 300 / 235 / 61 |
| signal → move p50 / p90 | 3.6 / 5.2 s (3.6 / 5.2) | 4.0 / 5.2 s (4.0 / 5.2) | 3.1 / 5.1 s (3.1 / 5.1) |
| withdrawn after ≥ 6 s, per 10 min | 13.3 (13.5) | 7.9 (8.5) | 10.8 (10.8) |
| signals within 20 s of a withdrawal | 412 (413) | 210 (213) | 43 (43) |
| … blocker behind in the target lane | 127 of 131 (124 of 135) | 73 of 76 (72 of 85) | 16 of 16 (16 of 16) |
| … blocker within ±5 km/h | 99 (96) | 38 (37) | 15 (15) |
| … blocker bumper gap p10/p50/p90, s | 0.0 / 0.5 / 0.9 (0.1/0.5/1.0) | -0.1 / 0.5 / 1.0 (0.1/0.5/1.0) | 0.2 / 0.5 / 0.9 (0.2/0.5/0.9) |
| … blocker is the player | 20 (20) | 22 (22) | 1 (4) |
| `empty-signal` per 10 min | 4.7 (4.7) | 3.4 (3.4) | 6.1 (6.1) |

Where this differs from the table in **Why**, and why:
- The ≥ 6 s counts differ by up to 6 in 100 min. The hold is measured between 2 Hz samples and a
  few episodes sit right on 6 s; the one-off analysis that wrote the table evidently rounded those
  the other way. Nothing in the rule differs.
- "blocker is the player" reads 1 rather than 4 in the human drive. This tool counts the player
  only when it is the *nearest* candidate in the target lane at the middle of the hold, which is
  the written rule; in 3 of the 4 cases the player is 12–56 m behind the signaller in the
  signaller's *own* lane, where it does not block the move. The bot numbers match (20 and 22).
- Two conventions the tool had to pick, both matching the table: a car that enters the recording
  already indicating starts an episode (its end is observable), and the quantiles are
  nearest-rank, not interpolated.

`npm run simtest` at baseline: lane changes/min left 41.0, right 42.0; lane shares 35.7 / 32.9 /
31.4 %; trucks in lane 1 37.9 % of truck lane samples; 0 overlaps, 0 player hits, min acc −3.53.

`report.md` rates per 10 min, day / night: `cut-off` 0.4 / 0.0, `near-miss` 0.5 / 0.1,
`unannounced` 0.0 / 0.0, `phantom-brake` 16.0 / 10.6, `let-in (good)` 4.8 / 4.6. All agree with
**Why**.
