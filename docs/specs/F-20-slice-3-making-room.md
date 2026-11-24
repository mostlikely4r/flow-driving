# F-20 slice 3: gap acceptance and making room (spec)

Status: ready to build. Written 2026-11-24. BACKLOG item **F-20** (On-ramps, AI only); QUEUE build
entry Q-2. Follows [F-20-slice-2-visible-onramps.md](F-20-slice-2-visible-onramps.md). The
measurements, code paths and traps this plan rests on are in
[F-20-slice-3-inputs.md](F-20-slice-3-inputs.md) (gathered 2026-11-23 at `b2a6987`); read its
"one approach already rejected" section before touching the cooperation code.

*Decided* marks the user's own calls. *Proposal* marks the planner's; the builder may change a
proposal's numbers if a measurement says so, and notes why in the BACKLOG line.

## 1. Why

Cars on the acceleration strip stall: they stop at the end of the strip waiting for a gap. Slice 2
measured a median of 0.56 stops per merge (the inputs file re-measured 0.39 at density ≤ 12 on 8
runs) against a target of 1 in 10. That reads as a queue at every junction, which is neither
Authentic nor Calm. Where this comes from (all **measurements**, `tools/onramp.js`, road 400,
6/min, 10 min):

- A wider last-gap window barely helps (`mergeLastM` 300: median 0.31).
- A wider speed band helps as much (`mergeKmhDefault` 25: median 0.30): the **speed-match gate in
  `mergeReady`, not the gap, is what holds mergers back.**
- A 700 m strip gives 0 stops in 8 runs, but real *invoegstroken* are about 200–400 m and slice 2
  renders 350 m. *Decided:* **the strip stays at about 350 m**; geometry is not the fix.
- Lane 0 has no rule for a merger alongside or just behind; the existing cooperation only looks
  ahead, and is shut off for the strip (the slice-1 deadlock).

## 2. The picture

A car comes down the ramp road, indicates, and runs along the strip. If it is close to lane-0 speed
it merges into a gap as today. If it is not, it no longer just drives on to the end of the strip
and stops there: over the second half of the strip it accepts a wider speed difference, and a
car that is too fast for lane 0 lifts off toward lane-0 speed while it waits. Meanwhile a
cooperative driver in lane 0 who has the merger alongside or just behind does what Dutch drivers
do: moves over to lane 1 if that lane has room, and otherwise lifts off a little, briefly, so the
merger fits in front. Uncooperative drivers (Leasebak, most Patsers) do neither. At low and
medium density the strip should almost never end in a stop; at jam density it still may, and that
belongs to F-22.

## 3. Goal and non-goals

**Done when** (*decided* targets, measured by the 12-run matrix in step 1):
- median stops per merge **≤ 0.1 over the density-8 runs** (4 runs);
- stops per merge at **density 12 lower than the step-1 baseline**, run for run on at least 3 of 4,
  and in total;
- **0 collisions** over all 12 runs, emergency stops no more than the baseline's 2;
- lane-0 speed near the ramp (the tool's "lane 0 near" column) **not lower** than the baseline at
  density 8 and 12 (the slice-1 deadlock showed up exactly there);
- the courtesy reading (step 1) shows lane-0 cars making room and mergers using that room.

Density 16, and 3 lanes at density 12, are jams: they are reported, not targeted (*decided*: F-22's
job).

**Non-goals** (*decided*):
- No change to `rampStripM` (stays 350), `rampRoadM` (stays 400) or the rendered junction.
- No ramp flow that varies over the day, no matrix-sign queue warning.
- No exits (F-21, Q-4), no player taking a ramp (F-31).
- No re-enabling of the existing cooperation/anticipation loops for lane −1 (see "Not doing").

## 4. Baseline (do not revert or redesign)

- Slice 2 is built and committed: `addRamp` (`src/traffic.js:185`) with `roadM`, `stripLogic`
  (`:1031`), `mergeReady` (`:1071`), `spawnFromRamp` (`:1248`), junctions and `rampsFreePlay`.
- `evaluate` (`:693`) forces strip cars toward lane 0 with `closure = 3` (`:752`) and treats the
  strip end as a zipper closure.
- Cooperation in `computeAcc` (`:515–532`): a `veh.coop` driver lifts off, capped at −1.6 m/s², for a
  signaller 1–55 m **ahead** in the next lane. The guards `if (ln < 0 || ln >= this.N) continue;`
  at `:519` and `:576` keep the strip out of cooperation and anticipation. **Leave both guards.**
- MOBIL in `evaluate`: a move left needs `selfish > veh.thr * 0.5` unless `closure > 0` (`:783`);
  the `behind` term (`:771–777`) is the pattern for a reason-to-move bias.
- Personas (`src/archetypes.js`): `coop` 1 for Pensioner, Grijze sok, Family; 0 for Leasebak; 60%
  White van, 20–30% Patser. `mergeKmh` from 5 (Leasebak) to 28 (Pensioner).
- The onramp runs are deterministic: the same command gives the same numbers.

## 5. Steps

Each step ends with the 12-run matrix and its own commit ("On-ramps slice 3 P<n>: ... (F-20)").

### Step 1: make the tool tell the truth, then re-baseline (*decided*)

`tools/onramp.js`, plus a small runner.

1. **Throughput line.** `THROUGH_S = s1 + 200` lies outside the sim (it spans 1500 m ahead of s 0),
   so any strip over ~600 m reads 0. Raise `ahead` so the line is always inside
   (`ahead: Math.max(1500, s1 + 400)`), or measure throughput at a fixed point past `s1` that is
   always in range; either way, print a warning if `THROUGH_S` is beyond the span.
2. **Ramp flow.** `CFG_rampPerMin` is ignored because the tool passes `perMin` to `addRamp`. Pass
   `perMin` only when it was given on the command line; otherwise let `CONFIG.rampPerMin` decide.
   Keep argv working as before.
3. **Courtesy reading** (replaces `movedLeft` as the measure; keep `movedLeft` printed, labelled
   "all 0→1 moves near the strip end"). Per strip car that is signalling past `s0`, record which
   lane-0 car is the "room maker" candidate: the lane-0 car alongside or within 30 m behind it.
   Count:
   - `madeRoom`: that car moved 0→1, or lifted off (acceleration below its free-road IDM by more
     than 0.3 m/s²) while the merger was alongside or ahead of it;
   - `usedRoom`: the merger merged within 8 s after that, **in front of** that car (or into the
     space it left);
   - print both, and `usedRoom / madeRoom`. After step 3 the tool reads the explicit `veh.roomFor`
     flag (step 3) instead of inferring it; until then the inference is the baseline.
4. **Gate reading.** For every second a strip car is past `s0` and `mergeReady` returns false,
   count whether the merger is faster or slower than the speed it compares against. Print the two
   totals. (*Proposal*: `mergeReady` uses `Math.abs`, so a merger coming off the ramp road at
   60–86 km/h refuses a lane 0 doing 40 just as it refuses one doing 120; this reading shows which
   side binds before step 2 decides how to relax it.)
5. **Matrix runner** (*proposal*): `tools/onrampsuite.js`, `npm run onrampsuite`. Runs the 12
   combinations of the inputs-file baseline (2 and 3 lanes × density 8, 12, 16 × seed 7, 8; 6/min,
   10 min, road 400) in-process or as child processes, prints the baseline table (one row per run
   plus a total) with the new columns, and the "done when" lines from section 3 as pass/fail
   against a saved baseline file `tools/onramp-baseline.json` that `--save` writes. About 2.5 min;
   run it in the background with output to a log.

Check: with `--save` on the unchanged sim, every column the inputs file reports must match its
baseline table number for number (stops, merges, positions, speeds). Only throughput may differ,
and only for strips over 600 m. If anything else moves, the tool change touched the sim; fix that
first.

*Built 2026-11-24.* The throughput fix took the second branch: `ahead: Math.max(1500, s1 + 400)`
changes the whole run (2L D8 S7 went from 50 merges and 12 stops to 51 and 22), because where cars
ahead are spawned moves with the span, so the check above can never pass with it. The tool counts at
`s1 + 200` while that line is inside the span and at the last line inside it otherwise, and prints a
warning when the strip end lies outside. `--save` reproduced the inputs table number for number
(452 merges, 1438 stops, 3.18 per merge, 407 moved left, 2 emergency stops, throughput 34–70 veh/min);
the inference courtesy reading over the 12 runs is 6741 made room and 411 used, the gate reading is in
every run's output, and the matrix takes 117 s.

### Step 2: relax the speed-match gate late on the strip (*decided*; shape is a *proposal*)

`src/traffic.js` (`mergeReady`, `stripLogic`, the strip car's acceleration), `src/config.js`.

- Over the first half of the strip the gate is as today: within `mergeKmh` of the genuine leader's
  speed (or `v0`).
- From the middle of the strip (`dEnd < stripM / 2`) to `mergeLastM` before the end, the allowed
  difference widens linearly from `mergeKmh` to `mergeKmh + mergeRelaxKmh` (*proposal*
  `mergeRelaxKmh` 20, new CONFIG key). Inside `mergeLastM` it accepts any speed, as today.
- **A merger faster than lane 0** (the step-1 gate reading decides how much this matters): from
  `s0` on, if the genuine lane-0 leader within 150 m is slower than the merger by more than its band,
  the merger lifts off toward that speed (IDM toward a virtual leader at lane-0 speed, capped at
  −1.5 m/s², no hard braking) instead of running on at ramp speed. That keeps it alongside a gap
  rather than overtaking lane 0 on the strip, which is not allowed in the Netherlands anyway.
- Nothing else in the merge test changes: `evaluate(...).safe`, the `idm(veh, nl) >= -2.2` leader
  check and the slow-joiner follower test stay. The relaxed gate only lets a car *try* a gap
  sooner; the safety tests still decide.
- Per persona the order stays: a Pensioner (`mergeKmh` 28) still accepts more than a Leasebak (5).

Check: the matrix. Expect stops per merge to fall at density 8 and 12 (the `mergeKmhDefault` 25
probe gave a 0.30 median and 219 stops against 716); the follower-braking column must not get
worse by more than a few percent of merges below −2 m/s². `npm run personas` unchanged outside the
strip.

### Step 3: lane 0 makes room, on purpose (*decided*: who and the order; numbers are *proposals*)

`src/traffic.js` (`computeAcc`, `evaluate`), `src/config.js`, possibly `src/archetypes.js` only if
a persona needs a value it does not have.

**Who is a committing merger.** A strip car (lane −1) that is signalling, past `s0`, and either
passes the step-2 gate or is within `mergeLastM` of the end. Not a car on the ramp road, not one
in the first metres after the gore that is still far below lane-0 speed and outside the relaxed
gate.

**Who makes room.** A lane-0 car with `veh.coop`, not the player, for which a committing merger is
**alongside or just behind**: the merger's front between 25 m behind this car's rear and this car's
front (*proposal*: `roomBehindM` 25). One merger per car at a time; store it as
`veh.roomFor = merger.id` with a start time. A merger ahead of the car is already handled by the
normal IDM once it merges, and that window (in front, 1–55 m) is exactly what deadlocked in slice
1, so it is **not** added.

**What it does, in this order:**
1. **Move left** if lane 1 exists and `evaluate(veh, 1).safe`. In `evaluate`, add a `room` term to
   `inc` for `t = veh.lane + 1` while `veh.roomFor` is set (*proposal* `CONFIG.makeRoom` 0.6, the
   same order as `closure`), and let it pass the "nobody moves left just to be nice" rule the way
   `closure > 0` does. Trucks never move left for this (they lift off only).
2. **Otherwise lift off**: in `computeAcc`, after the existing cooperation block, cap acceleration
   at `CONFIG.makeRoomLift` (*proposal* −0.8 m/s², above the brake-light threshold so it reads as
   easing off, like `lineUpLift`) until the merger's rear is ahead of this car's front plus the
   merger's safe zipper gap, or the merger has merged.
3. **Limits** (the slice-1 lesson): at most `makeRoomS` (*proposal* 6 s) per merger; never below
   the merger's own speed minus 10 km/h; never while this car's own follower is closer than
   `0.6 × its desired headway` (no cascade); `roomFor` clears when the merger merges, stops
   signalling, is passed, or the time runs out, and the same car does not make room for the same
   merger twice.

**Readable.** A car that lifts off for a merger is a moment players should see: the
`let-in` / `moved-over` detectors in `src/moments.js` read the player's journal only and stay
untouched in this slice; the tool's courtesy reading is the measure.

Check: the matrix against the step-2 numbers and the baseline. The "done when" lines in section 3
must pass. In particular watch "lane 0 near": if it drops, the rule is too broad (narrow the window
or the lift before anything else). `npm run personas` and `npm run simtest` unchanged.

### Step 4: close the item

- Full check (see "How we'll know"); note how long each took the first time in this file, so the
  list can be trimmed.
- `BACKLOG.md` F-20: one paragraph in the usual style, what was built and the matrix numbers
  against the baseline; status stays `building` (exits and jams are later slices).
- `README.md`: the `onrampsuite` command and the new columns in the on-ramp section.
- Commit.

## 6. How we'll know

- **Matrix** (step 1 runner): pass/fail lines for every "done when" item, 12 runs, ~2.5 min, in the
  background with output to a log. Run after every step.
- **Quick check** per step: `npm run build` and the matrix.
- **Full check** at the end: `npm run build`, `npm run simtest`, `npm run personas`,
  `npm run moments`, `npm run bottest`, and `node ~/Desktop/vibeview/scripts/sync-prompts.ts --check`.
- **Try it:** `npm run dev`, open `?scenario=onramp` and watch the strip at junction 0 for two
  minutes: merging cars should slot in during the second half of the strip rather than stop at its
  end, and now and then a lane-0 car beside a merger should move over to the left lane or visibly ease
  off (no brake lights) to let it in. `?scenario=onramp-busy` may still queue; that is F-22.

The Readable claim (that a lane-0 car making room reads as courtesy, not as hesitation) is a
**guess**, not a measurement. Per `AGENTS.md`, a drive guides and does not gate: the headless
numbers close this slice, and a journal from Q-3 starts a new session.

## 7. Not doing

- **A longer strip** (`rampStripM` 700). It reaches 0 stops but no Dutch merge lane is that long,
  and slice 2 renders 350 m.
- **Removing the guards at `:519` / `:576`** to let the existing cooperation see the strip. Slice 1
  measured a lane-0 deadlock (23 standing cars, 2 collisions in 12 runs).
- **Tuning `rampRoadM` or `mergeLastM`** alone; both were measured and neither fixes it.
- **Using `movedLeft` as a courtesy count**; it counts ordinary overtakes.

## Needs first

- Slice 2 built and committed (it is: `addRamp` with `roadM`, `stripLogic`, junctions,
  `rampsFreePlay`, `?scenario=onramp`).
- `tools/onramp.js` and `npm run onramp` (exist). The baseline table in the inputs file (exists) is
  what step 1 must reproduce.

## Not in this build

- Jams at density 16 and 3 lanes at 12: F-22.
- Ramp flow over the day, matrix-sign queue warning: later F-20 slice.
- Teaching `let-in` / `moved-over` to read AI-to-AI merges (a Proefrit item if wanted).
- Exits: F-21 (Q-4).
- Per-persona tuning of `coop` or `mergeKmh` beyond what the targets need.
