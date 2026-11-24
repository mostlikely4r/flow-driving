# F-20 slice 4: the run-out and merging like a Dutchman (spec)

Status: ready to build. Written 2026-11-24. BACKLOG item **F-20** (On-ramps, AI only). Follows
[F-20-slice-3-making-room.md](F-20-slice-3-making-room.md); read its step 3 ("measured and
dropped") before touching anything that makes lane 0 give way.

*Decided* marks the user's own calls. *Proposal* marks the planner's; the builder may change a
proposal's numbers if a measurement says so, and notes why in this file and the BACKLOG line.

## 1. Why

From the user's own drives on 2026-11-24 (`playtests/human/2026-11-24-16-33-24.json` and
`-16-34-23.json`, `?scenario=onramp`, 38 s and 58 s, no F8 marks):

- **A truck, a car and a van stood still at the end of the strip**, waiting for a gap. The user
  parked behind them. *Decided:* at that point they should keep driving over the hard shoulder
  (vluchtstrook), not stand still.
- **An invisible block on the hard shoulder after the strip** stopped the user's car dead, and since
  the player cannot reverse, the user was stuck. (Code: `src/player.js` around line 343 makes the
  20 m past `r.s1` solid for the player; the AI's stop marker `r.obs` at `s1 + 10` is never drawn.)
  That is a bug: no invisible walls.
- *Decided:* **"1, 2 car lengths is plenty to just merge and let the guy that drives after you hit
  the brakes."** That is how Dutch drivers merge; the AI asks for far more.
- The ~45° angle of stopped mergers crossing is a separate visual fix (C, not in this plan).

Measurements behind it (three `npm run onramp` runs at slice-3 HEAD `9c14249`, 2026-11-24):

- The follower gap a merger demands is **median 27–34 m, p90 40–60 m** (6–8 car lengths). It comes
  from `followerSafe` (`src/traffic.js`, around line 681): `2 + nf.v × tSafe + 2.2 × closing`, with
  `tSafe` 0.45–1.05 s per driver, used for a slow joiner in `stripLogic` and for every non-zipper
  move in `evaluate`.
- But the follower test was the **only** blocker in just 50–227 of 4000–6000 strip car-seconds per
  run; the car-ahead test and the speed gate block far more often. So a smaller gap alone will not
  clear the queue: the strip end has to stop being a place where cars stand.
- Slice 3's best rule still leaves density 8 at a median 0.22 stops per merge over 8 seeds, density
  12 at 1.45 (target 0.1), with a 350 m strip.

## 2. The picture

A car comes down the ramp and runs along the strip as today. If it finds no gap by the end of the
strip, it does not stop there: it rolls on along the hard shoulder, indicator on, a little slower
than lane 0 so gaps slide past it, and takes the first gap that is about two car lengths long and
leaves the lane-0 driver behind a firm but ordinary brake. The car behind does brake, and that is
fine: that is invoegen in the Netherlands. Only if lane 0 is a solid jam for the whole run-out does
the merger stop, at the end of it; at low and medium density that should almost never happen.

The player drives on the hard shoulder as anywhere else: past the strip it is just the vluchtstrook,
with no wall.

## 3. Goal and non-goals

**Done when** (*proposal* targets; the user asked for the behaviour, not the numbers), measured by the
24-run matrix from step 1 against the baseline that step saves:

- **Stops per merge** (a car on lane −1 past `s0` below 1 m/s for over 1 s, anywhere on strip or
  run-out): median at density 8 **≤ 0.1**; median at density 12 **at most half** the baseline's.
- **The queue does not just move 150 m:** stops at the hard end (within 30 m of `sEnd`) at density 8
  and 12 together **≤ 1 per 20 merges**.
- **Follower braking, the price of B:** the share of merges whose new follower brakes below −4 m/s²
  **≤ 3%** at density 8 and 12; below −2 is reported, and is expected to rise.
- **0 collisions** over all 24 runs; emergency stops (acc < −6) **no more** than the baseline.
- **Lane 0 near the ramp** (the tool's "lane 0 near") no more than 3 km/h below the baseline at
  density 8 and 12.
- `npm run simtest`, `personas`, `moments` and `bottest` unchanged: everything here is gated on
  lane −1 and on the player's strip-end wall.

Density 16 is a jam (F-22): reported, not targeted.

**Non-goals** (*decided* in earlier slices and still standing):
- `rampStripM` stays 350, `rampRoadM` 400; the rendered junction does not change.
- No lane-0 car makes room on purpose (slice 3 step 3, measured and dropped).
- No change to the existing cooperation and anticipation loops; the guards
  `if (ln < 0 || ln >= this.N) continue;` in `computeAcc` stay.
- No exits (F-21), no player taking a ramp (F-31), no change to the yaw of a crossing car (C).

## 4. Baseline (do not revert or redesign)

Slice 3 is built and committed (`9c14249`). In `src/traffic.js`:

- `addRamp` (around line 185) builds `r = { sTop, s0, s1, roadM, obs, ... }`; `r.obs` is a stopped
  20 m obstacle on lane −1 whose nose sits at `s1`, pushed into `this.strip` by `buildLanes`.
- `closedAhead(-1, s)` returns the metres to `r.s1` (Infinity past it). `evaluate` uses it for the
  zipper test (`zip` when `< 40 + v × 2`); `stripLogic` uses it as `dEnd`; `mergeBand` widens the
  speed band from the middle of the strip to `mergeLastM` (120) before `s1`; `mergeReady` lets any
  speed through inside `mergeLastM`.
- `stripLogic` merges when `mergeReady`, `evaluate(veh, 0).safe`, the leader check
  `idm(veh, nl) >= -2.2`, and the slow-joiner follower test (`veh.v < nf.v - 3` then `followerSafe`)
  all pass. `veh.zipping` (short 2.2 s move) is set when `dEnd < 40 + v × 2`.
- The lift-off toward lane-0 speed for a too-fast merger is in `computeAcc` (around line 522),
  only above `mergeLiftMinKmh` 50.
- `buildLanes` puts the player in the strip list only within `s0 − 20 .. s1 + 20`.
- Other users of `r.s1`: `src/session.js` (around line 159, removes passed ramps),
  `spawnFromRamp` range (around line 1270), `src/overlay.js` `mergeText` (around line 189),
  `src/lanemap.js` (around line 215), `tools/onramp.js` (`s1`, the `outsideSpan` check).
- `src/scenery.js` cuts the right edge line over `[s0 − 60, s1 + 80]`; past that the hard shoulder
  has its solid edge line again. That stays: a run-out car crosses it, as a real one would.
- `tools/onrampsuite.js` runs 12 runs (2/3 lanes × density 8/12/16 × seeds 7, 8), ~117 s, against
  `tools/onramp-baseline.json`. The baseline has `brakingUnder2` but no under −4 count.

## 5. Steps

Each step ends with the matrix and its own commit ("On-ramps slice 4 P<n>: ... (F-20)").

### Step 1: a matrix that can judge a rule, then re-baseline (*proposal*)

`tools/onrampsuite.js`, `tools/onramp.js`.

Slice 3 found the 2-seed matrix too noisy (2L D12 S7 swings 0.73 ↔ 11.85 stops per merge on a 6 s
change) and asked for 4 seeds first.

1. Seeds 7, 8, 9, 10: 24 runs, about 4 minutes. Keep `--runs=N` working.
2. New columns in `onramp.js --json` and the suite table:
   - stops split by **place**: on the strip (`s ≤ s1`), in the run-out, at the hard end (within 30 m
     of the end of lane −1). Until step 2 the last two are 0; the total stays the old "stops";
   - **merges in the run-out** (merge position past `s1`) and their share;
   - **`brakingUnder4`** next to `brakingUnder2` (the tool already computes `under4`).
3. The suite prints the section 3 "done when" lines as pass/fail against the saved baseline.
4. `--save` on the unchanged sim. Check: the seed 7 and 8 rows reproduce today's
   `tools/onramp-baseline.json` number for number (merges, stops, positions, speeds, braking).
   If not, the tool change touched the sim; fix that first.

*Built 2026-11-24.* The tool prints stops split by place, merges in the run-out with their share,
and `brakingUnder4`; the suite runs 4 seeds (24 runs), prints the section 3 lines as pass/fail, and
compares against the baseline only on the runs both have (seeds 9 and 10 have no baseline row when
the saved baseline is a 2-seed one).

The check above could not pass as written, and the reason is in the tree, not the tool: the saved
`tools/onramp-baseline.json` was written in slice 3 **P1** (`5b2a4db`), before P2's relax gate
(`ebc9e21`) changed the merge behaviour. Today's 2L D8 S7 reads 14 stops and gate readings 39 s /
191 s against the file's 12 and 68 s / 165 s. The tool change itself touched nothing: the original
tool on today's sim gives the same position, speed and lane-0 speed as the new one, run for run
(2L D8 S7 pos 200.26 m, 61.37 km/h, lane-0 near 56.52 km/h; 3L D8 S8 173.48, 69.71, 66.40), and
the stop totals are unchanged at 14 and 9.

The new 24-run baseline (235 s): density 8 median **0.24** stops per merge, density 12 median
**1.98**, 0 collisions, 6 emergency stops, every stop on the strip (the run-out does not exist yet)
and all but 162 of 2168 of them at what will become the hard end.

### Step 2: the run-out, and no invisible wall (*decided*: keep rolling, no trap; shape is a *proposal*)

`src/traffic.js`, `src/config.js`, `src/player.js`, `src/session.js`, `src/overlay.js`,
`src/lanemap.js`, `tools/onramp.js`.

- **New CONFIG key `rampRunoutM`** (*proposal* 150; the user's report was answered with "~100–150 m").
  `addRamp` sets `r.sEnd = s1 + runoutM`. `r.s1` keeps meaning "the painted end of the strip".
- **The AI's hard end moves to `sEnd`:** `r.obs` nose at `sEnd`. `closedAhead(-1, s)` counts to
  `sEnd`, so the zipper test, `veh.zipping` and braking for the end all happen at the end of the
  run-out.
- **The speed gate still reads the strip:** `mergeBand` and `mergeReady` keep measuring to `s1`
  (pass them the distance to `s1`, clamped at 0). Past `s1` any speed difference is accepted, as
  inside `mergeLastM` today.
- **How a run-out car drives** (*proposal*): past `s1` its desired speed is capped at
  `max(15 km/h, vLane0 − runoutUnderKmh)`, where `vLane0` is the speed of the nearest lane-0 car
  alongside or within 30 m (else `v0`) and `runoutUnderKmh` is 5 (new CONFIG key). Slightly slower
  than lane 0 lets gaps slide past it; the 15 km/h floor keeps it rolling beside a crawling queue
  rather than standing; it never undertakes lane 0 on the shoulder. Apply the cap as an IDM virtual
  leader like the existing lift-off, not as a hard set of `v`. It keeps indicating left
  (`closureSig`).
- **The player:** remove the strip-end wall in `src/player.js` (the loop over `traffic.ramps`
  around line 343). Past the strip the hard shoulder is just the hard shoulder, as everywhere else;
  `r.obs` is AI-only and the player never collides with it. `buildLanes` puts the player in the
  strip list within `s0 − 20 .. sEnd + 20`, so run-out cars see and follow a player on the shoulder.
- **Everything that ends a ramp at `s1` moves to `sEnd`:** session ramp removal, `spawnFromRamp`'s
  range, the tool's `outsideSpan` check. `mergeText` says "run-out · 60 m left" past `s1`;
  `lanemap.js` draws the run-out in a lighter tone than the strip.
- **Edge cases:** a run-out car that reaches `sEnd` stops there and keeps signalling (that is the
  jam case, counted as a hard-end stop). A player standing on the shoulder in the run-out is a
  leader like any car: the run-out car stops behind it, and the tool must not count that as a
  collision risk. A run-out car is still a strip car for every slice-3 rule (lift-off, gate).

Check: the matrix. Stops should move from "on the strip" to nothing, not to "hard end"; merges in
the run-out should be most of what used to be stops. Then **Try it** (section 6) once, by eye.

### Step 3: merge like a Dutchman (*decided*: ~2 car lengths and let the follower brake; numbers are *proposals*)

`src/traffic.js` (`stripLogic`, a new `mergeFollowerOk`), `src/config.js`.

- **Where:** a lane −1 → 0 merge from the middle of the strip on (the same point the speed band
  starts to widen) and on the run-out. The first half of the strip keeps today's tests, so a
  merger with the whole strip ahead does not cut in where it could wait. Normal lane changes
  between lanes 0..N−1 do not change at all.
- **The follower test there:** replaces the slow-joiner `followerSafe` test in `stripLogic` and the
  follower half of `evaluate(veh, 0)` (zipper and non-zipper) for these merges. The gap to the new
  follower must be at least `mergeFollowM` (*proposal* 9 m, two car lengths), and that follower's
  IDM response to the merger, `idm(nf, veh, 1, gap)`, at least −`mergeFollowB` (*proposal*
  3.0 m/s²: a firm brake, below the −4 the tool counts as hard). With the player as the follower
  the limit is the zipper's −1.8 m/s². The IDM term carries the closing speed, so a slow or
  stopped merger still needs a long gap in front of a fast car: B makes merging at speed easy, not
  pulling out from a standstill.
- **The leader side is unchanged:** `idm(veh, nl) >= -2.2` and the leader half of `evaluate`.
- **Measure what we buy:** `brakingUnder2` and `brakingUnder4` per run against step 1's baseline.
  If under −4 exceeds 3% of merges, raise `mergeFollowM` or lower `mergeFollowB` before anything
  else, and write the values used here.

Check: the matrix; the section 3 lines must pass. `npm run simtest` and `personas` unchanged.

### Step 4: close the slice

- Full check (section 6); note how long each took, and the 24-run matrix's time, in this file.
- `BACKLOG.md` F-20: one paragraph in the usual style, what was built and the matrix numbers
  against the baseline; status stays `building` (exits and jams are later slices).
- `README.md` "On-ramps and junctions": the run-out, `rampRunoutM`, `runoutUnderKmh`,
  `mergeFollowM`, `mergeFollowB`, the 4-seed matrix and its new columns.
- Commit.

## 6. How we'll know

- **Matrix** after every step: `npm run onrampsuite`, 24 runs, ~4 min, in the background with
  output to a log; pass/fail for each section 3 line.
- **Quick check** per step: `npm run build` and the matrix (`--runs=4` while iterating).
- **Full check** at the end: `npm run build`, `npm run simtest`, `npm run personas`,
  `npm run moments`, `npm run bottest`, and
  `node ~/Desktop/vibeview/scripts/sync-prompts.ts --check`.
- **Try it:** `npm run dev`, open `?scenario=onramp-busy`, and sit in lane 0 near junction 0 for two
  minutes. Mergers that find no gap on the strip roll on along the hard shoulder past where the strip
  paint ends and slot in within about 150 m, taking a gap of a couple of car lengths; the car behind
  them visibly brakes. Then steer onto the hard shoulder past the strip end and keep driving: there
  is no wall. In `?scenario=onramp` a merger should almost never stand still.

That short merges read as normal Dutch invoegen and not as aggression is the user's call from play,
not a measurement; the follower-braking columns are the measure. Per `AGENTS.md` a drive guides and
does not gate: a journal (ideally with F8 marks at merges) starts a new session.

## 7. Not doing

- **An arrow board or cones at the run-out end.** Offered in chat, dropped here (*proposal*): a
  visible wall still traps a player who cannot reverse, and a real vluchtstrook does not end there.
  The AI's end marker stays invisible and the hard-end stop count keeps it rare.
- **Lane 0 making room**, either way round: measured and dropped in slice 3.
- **A longer strip**: no Dutch invoegstrook is 700 m; the run-out is shoulder, not strip.
- **The tight gap on the first half of the strip**, or for ordinary lane changes.

## Needs first

- Slice 3 built and committed: `mergeBand`, `mergeReady`, the lift-off, `tools/onrampsuite.js`,
  `tools/onramp-baseline.json` (all present at `9c14249`).
- `?scenario=onramp` and `onramp-busy` (exist).

## Not in this build

- **C, the crossing angle:** cap the drawn yaw in `src/trafficView.js` (around line 208) and stop a
  near-stopped car sliding sideways. A quick change in its own thread.
- Jams at density 16 and 3 lanes at 12: F-22.
- Exits: F-21 (Q-4). Ramp flow over the day, matrix-sign queue warning: a later F-20 slice.
- Teaching the moment detectors about AI-to-AI merges and run-out merges.
