# F-21 slice 1: exits — cars move right early and leave (spec)

Status: ready to build. Written 2026-11-24. BACKLOG item **F-21** (Exits, AI only), queue entry
Q-4. Builds on F-20 slice 2 (junctions, `docs/specs/F-20-slice-2-visible-onramps.md`) and sits
beside the on-ramp work of F-20 slices 3–4 without changing it.

*Decided* marks the user's own calls. *Proposal* marks the planner's; the builder may change a
proposal's numbers if a measurement says so, and notes why in this file and the BACKLOG line.
This plan was not talked through with the user: apart from the three *decided* lines below,
everything in it is a proposal.

## 1. Why

What the user asked for (QUEUE.md Q-4 and BACKLOG F-21, and `docs/vision.md` M2):

- *Decided:* **"Cars move right early and leave the motorway."** (F-21, Q-4)
- *Decided:* **AI only.** The player taking an exit is F-31.
- *Decided:* **Reuse slice 2's exit lane, gore and signs**, which are already rendered: no new
  road geometry.
- M2 in `docs/vision.md`: "Traffic enters and leaves the motorway through on-ramps and exits." Today
  it only enters.

From the code (measured by reading it, 2026-11-24):

- Every junction already draws an exit (`src/junctions.js`): direction signs at `signA` and `signB`
  (1200 and 600 m before `exitStart`), *afritbakens* 3 / 2 / 1 at 300 / 200 / 100 m before it, an
  exit lane on the hard shoulder from `exitStart` (`sBridge − 520`) to the gore at `exitGore`
  (`sBridge − 320`, so the exit lane is 200 m, the first 80 m of it a taper), and an exit road
  `exitPath(j, s)` climbing from `laneLat(-1)` at the gore to the crossing road at `exitTop`
  (`sBridge − 15`, 6.9 m up, 45 m outside the guardrail). No car uses any of it.
- On-ramps add `rampPerMin` 6 cars a minute per junction in free play and nothing leaves;
  `maintain()` spawns fewer at the range edges to keep the count. With exits the road really
  breathes: cars leave at one junction and the edges refill.

Guesses this plan rests on (no drive, journal or measurement behind them yet):

- That ~12% of the cars passing a junction leave there. Rough balance: at density 8 per lane-km and
  ~100 km/h three lanes carry ~40 cars a minute, so 12% is ~5 a minute against the ramp's 6.
- That "early" reads right as: most exiters are in lane 0 by the 600 m sign, nearly all by the
  first *afritbaken*, indicate right at the bakens, cross onto the exit lane in its first half, and
  slow down **on the exit lane, not in lane 0** (what Dutch driving lessons teach for *uitvoegen*).
- That a car waiting at the give-way at the top of the exit road, then disappearing, looks right
  from the motorway.

So step 1 is the smallest version the user can drive through, and the measuring tool comes after.

## 2. The picture

A kilometre and a half before a junction, some of the cars around you have decided to leave there.
You can't see that yet. From around the first blue sign they start drifting right, one lane at a
time, with ordinary lane changes; a driver who is leaving stops overtaking. By the 600 m sign most
of them are in lane 0. At the countdown markers they indicate right, and once the exit lane opens
they move onto it at motorway speed, then slow down along it and up the exit road. At the top they
stop at the crossing road, brake lights on, and are gone a moment later. A car that was stuck in
the wrong lane does not dive across: it misses the exit and drives on.

## 3. Goal and non-goals

**Done when** (*proposal* targets, measured by the matrix of step 2):

- **Exits are taken:** missed exits ≤ 5% of exiters at density 8, ≤ 15% at density 12.
- **Early:** the distance before `exitStart` at which an exiter is in lane 0 for good — median
  ≥ 600 m, 10th percentile ≥ 300 m at density 8.
- **Readable:** every exiter's right indicator is on for ≥ 1.0 s before it starts across onto the
  exit lane.
- **No braking in lane 0:** median speed of an exiter as it starts across ≥ lane-0 speed there
  − 10 km/h; lane 0 between `exitStart − 300` and `exitGore` no more than 5 km/h slower than in the
  control run (same seed, no exits).
- **Follower braking:** under −4 m/s² caused by an exiter (its lane-0 or exit-lane follower) in
  ≤ 2% of exits.
- **Safe:** 0 collisions, emergency stops (acc < −6) no more than the control.
- **The queue stays off the motorway:** no car stands still (v < 1 m/s for > 1 s) on the exit lane
  (`s < exitGore`).
- **Density holds:** mean vehicles in range within 5% of the control.
- `npm run onrampsuite` reproduces `tools/onramp-baseline.json` number for number (it builds its
  own `Traffic` without exits; this proves exits touch no random numbers when absent).
- `npm run simtest`, `personas`, `moments` pass; `npm run bottest` passes (it drives free play,
  so its numbers may move: note the before/after).

**Non-goals**:
- No new geometry: the exit lane stays 200 m with its 80 m taper, the exit road and signs as drawn
  (*decided*).
- No player exits (F-31, *decided*).
- No change to on-ramps, merging, the run-out or `tools/onramp*.js` behaviour (F-20).
- No exits on the oncoming carriageway (it has no ramps either; `main.js` builds it as a plain
  `Traffic`).

## 4. Baseline (do not revert or redesign)

At `b62eefe` (F-20 slice 4 built):

- `src/junctions.js`: `junction(b)` gives `exitStart`, `exitGore`, `exitTop`, `signA`, `signB`,
  `bakens`, `number`; `exitPath(j, s)` the exit road's `{ lat, y }`; `junctionsNear(sa, sb)`;
  `junctionHasEstate(j)` (F-40: 30% trucks on that junction's ramp).
- `src/traffic.js`: lane −1 is one list, `this.strip`, holding every ramp's cars sorted by `u`
  (`laneList(-1)`), plus each ramp's AI-only obstacle `r.obs`, plus the player when on the hard
  shoulder inside a ramp's span (`buildLanes`). `laneLogic` sends every lane −1 car to
  `stripLogic`, which always wants lane 0. `computeAcc` has a lane −1 branch (lift-off, run-out
  speed) that reads `veh.ramp`. `evaluate(veh, t)` adds a `closure` urgency term (closures, and 3
  for any strip car) and returns `{ safe, inc, wants, margin, closure, zip }`; `laneLogic` treats
  `closure > 0` as a forced, signal-and-wait move. `beginSignal(veh, target, closure)`,
  `advanceMove`, `cancelChange` are the lane-change state machine. `maintain()` (every 0.2 s)
  despawns out of range, refills the edges and calls `updateRamps`. Randomness is `this.rng` only.
- Each driver has `mergeEarly` (0–1, from `src/archetypes.js`; `?? 0.5` for ordinary cars): how
  early it leaves a closing lane. Patsers sit near 0, careful drivers near 1.
- `src/session.js` `updateJunctionRamps(sim)`: in free play with `CONFIG.rampsFreePlay`, one ramp per
  junction in range, tracked in `sim.ramps` by junction block, removed once behind.
- `src/scenarios.js` `applyScenario`: `sc.junctions: [{ b, perMin }]` adds that junction's ramp.
- `src/trafficView.js` (around line 191): a lane −1 car with `veh.ramp` and `fc < ramp.s0` is drawn
  on `rampProfile` (lat, height, heading from the slope).
- `src/lanemap.js` (around line 212): draws ramp road, strip, run-out and gore in a band below the
  lanes.
- `tools/onramp.js` builds a `Traffic` directly with a fixed player, `addRamp`, and reports; 
  `tools/onrampsuite.js` runs its matrix against `tools/onramp-baseline.json`.

## 5. Steps

Each step ends with its checks and its own commit ("Exits slice 1 P<n>: ... (F-21)").

*Built 2026-11-24.* Where the code and this plan disagreed, the plan's numbers lost and are noted
under the step; the goal lines of section 3 are what the build was judged on.

### Step 1: cars leave (*proposal* throughout) — **built**

What changed from the plan (all of it measured, single-seed probes and then the 16-run matrix):

- **The exit wish is not a bribe.** Adding `exit = 0.5 + 2.5 × clamp(…)` to `inc` is not enough on
  its own: in a left lane running 10–13 km/h faster than lane 0 the MOBIL margin for the move is
  −5 to −10, so `wants` stayed false and exiters drove straight past their exit (3 lanes, density
  8: 17% missed). `evaluate` also returns `exit`, and inside the go window the move right is wanted
  outright — a leaving driver has to get right, the safety gates decide when. The urge still goes
  into `inc` as written, so margins and the debug overlay read as before.
- **The indicator is not withdrawn.** Even with that, exiters signalled into lane 0, lost the
  signal at the first 1 s recheck (`ev.margin < −0.15`) and spent the last kilometre in 15 s
  signal/no-signal cycles; 3 lanes at density 8 still missed 8–20%. For an `ev.exit` move the signal
  stays up and the move starts when `ev.safe`, not `ev.safe && ev.margin > −0.3` (the negative
  margin *is* the speed it gives up to leave). The last chance before the gore ends it. That one
  change is what took missed exits to 2.2%.
- **The forced fallback may project the gap:** an exiter may put its indicator on for a gap that is
  visibly opening, which F-38 already allows for ordinary moves.
- **Two cars going to the same exit do not call off each other's move** (`advanceMove`'s abort): the
  one ahead is the leader this one follows onto the exit lane, not a conflict.
- `computeAcc`: the lane −1 lift-off and run-out code is now guarded by `veh.ramp` as asked, so an
  exit car never eases off for lane 0 (it has its own curve). *First attempt broke on-ramps here:*
  dropping the `s >= r.s0` part of the guard changed the on-ramp matrix (2L D8 S7: 48 merges
  against 43), which the matrix caught; both guards are back.
- **Two tuning points got names** in `config.js`, with this plan's numbers: `exitGoM: 700` +
  `exitGoSpreadM: 1100 × mergeEarly` and `exitSignalM: 300`. A first guess at 1200/1300 also passed
  every line and read "earlier", but it needed 3 emergency stops at 3 lanes density 8 against 0, so
  the plan's numbers stand.
- `applyScenario` fills the road at the scenario's density when `sc.fill` is set: the `exit`
  scenario has no hand-placed cars, and `applyScenario` otherwise starts from an empty road.

Checks, as run: `npm run build` ✓; `npm run simtest` ✓ (byte-identical to `b62eefe`); the 24-run
on-ramp matrix **identical to `b62eefe` number for number** (compared against a clean worktree of
that commit), after which `tools/onramp-baseline.json` was re-saved from this tree — see the note
under *Not in this build*.

`src/config.js`, `src/traffic.js`, `src/session.js`, `src/scenarios.js`, `src/trafficView.js`,
`src/lanemap.js`, `src/overlay.js`.

**The exit object.** `traffic.addExit(j, { share })` pushes
`x = { b: j.b, sStart: j.exitStart, sGore: j.exitGore, sTop: j.exitTop, share, truckShare, obs, taken: 0, missed: 0 }`
onto a new `this.exits`; `removeExit(x)` takes it off and despawns any vehicle still holding
`veh.exit === x`. `obs` is an AI-only stopped obstacle on lane −1 with its nose at `sTop` (like
`r.obs`): the give-way line at the crossing road. `buildLanes` pushes every exit's `obs` into
`this.strip`, and puts the player there too when on the hard shoulder within
`[sStart − 20, sGore + 20]`. The obstacle also keeps an exit car at the top from ever reading the
next on-ramp's cars (30 m on, across the bridge) as its leader.

**New CONFIG keys:** `exitsFreePlay: true`, `exitShare: 0.12` (cars, vans, caravans),
`exitTruckShare: 0.08` (0.3 at a junction with an estate, matching its ramp's lorries),
`exitGoreKmh: 70`, `exitWaitS: [1, 4]`.

**Who leaves.** In `maintain()`, for each exit, a vehicle whose `s` lies in
`[sStart − 2500, sStart − 1000]` and that has not been rolled for this exit (`veh.exitRolled !== x.b`)
is rolled once: `veh.exitRolled = x.b`, and with probability `share` (trucks `truckShare`)
`veh.exit = x`. Not rolled: strip cars (`veh.ramp` set and still on lane −1), scenario cars with a
`brakeEvent`, cars already holding another exit. A car that first appears closer than
`sStart − 1000` is never an exiter there. The roll uses `this.rng` and **only happens when an exit
with `share > 0` exists**, so a `Traffic` without exits draws exactly the random numbers it does
today.

**Getting to lane 0.** In `evaluate(veh, t)`, for `veh.exit` with `d = x.sStart − s`:

- the urge starts at `dGo = 700 + 1100 × mergeEarly` (patsers from ~700 m, just before the 600 m
  sign; careful drivers from ~1800 m, before the first sign);
- for `t < veh.lane` (moving right) inside `dGo`, add `exit = 0.5 + 2.5 × clamp((dGo − d) / (dGo − 300), 0, 1)`
  to `inc`, the same shape as the closure term;
- for `t > veh.lane` (moving left) inside `dGo`: `wants = false`. A leaving driver stops overtaking
  and sits behind a slow truck if need be;
- report it through `closure` (signal-and-wait, `laneLogic`'s `forced`) only once `d < 300`; before
  that it is an ordinary right move, so lining up (F-38) and the usual signal rules apply.

**Onto the exit lane.** New `exitLogic(veh, dt)`, called from `laneLogic` for a car with
`veh.exit` in lane 0 (before the normal lane logic) and in place of `stripLogic` for a lane −1 car
with `veh.exit`:

- in lane 0, from `d < 300` (the first baken) and `state === 'none'`: `beginSignal(veh, -1, true)`
  — right indicator, never withdrawn;
- move once `s ≥ sStart + 40` (half way along the taper), the signal has been on ≥ `veh.tSignal`
  and ≥ 1 s, and the lane −1 gap is safe: leader `idm(veh, nl) ≥ −2.2`, follower (only ever the
  player or a slower exit car) `followerSafe`. Then `state = 'move'`, `targetLane = -1`, as
  `laneLogic` does, and the car occupies `this.strip` at once;
- an aborted move (`advanceMove`'s abort) goes back to lane 0 and may try again;
- **last chance** `s > sGore − 30` while not yet in lane −1 (in lane 0 or further left): give up —
  `cancelChange`, `veh.exit = null`, `x.missed++`. It drives on as a normal car. No car crosses two
  lanes or the gore;
- in lane −1 it never changes lane again, indicator off after the move (`indOffT` as usual);
  `x.taken++` when the move completes.

**Slowing down where it should.** No extra slowing in lane 0 (the IDM and the bias above only). In
`computeAcc`, the lane −1 branch's lift-off and run-out code runs only for `veh.ramp` (today it
assumes every lane −1 car is a merger). For an exit car on lane −1, a virtual leader (as the
run-out does) at a target speed that falls linearly from the car's speed when it crossed to
`exitGoreKmh` at `sGore`, and from `exitGoreKmh` at `sGore` to 40 km/h at `sTop − 80`, clamped to
−2.5 m/s²; past that the give-way obstacle brings it to a stop by plain IDM.

**Leaving.** A car stopped (v < 0.5) behind the obstacle at `sTop` waits `exitWaitS` (uniform, from
`this.rng`) and is then removed (`onRemove`), unless the player is within `rampSpawnHoldM` (120 m)
of `sTop`: then it waits on. The next car moves up. The usual range despawn still applies.

**Drawing.** `src/trafficView.js`: a lane −1 car with `veh.exit` and `fc > x.sGore` uses
`exitPath(junction(x.b), fc)` for lat, height and heading, the mirror of the ramp-road code.
`src/lanemap.js`: draw the exit lane (`sStart..sGore`) in the strip band, and mark exiters (a small
right tick, or the strip colour) so a car that is going to leave can be read on the map before it
indicates. `src/overlay.js` (dev text): "exit 14 · 820 m" for an exiter.

**Where exits exist.** `src/session.js` `updateJunctionExits(sim)` beside `updateJunctionRamps`,
same pattern (`sim.exits` by block, add while the roll window or the exit is in range, remove once
`sTop` is behind `player.s − rangeBehind − 200`), with `CONFIG.exitsFreePlay`, share
`CONFIG.exitShare` and the estate truck share. `src/scenarios.js`: `sc.junctions` entries also add
that junction's exit (`exit: false` opts out); a new scenario **`exit`**, "Leaving the motorway":
three lanes, day, density 10, `exitShare` 0.25 for that exit so a single pass shows several, the
player in lane 1 at 100 km/h starting 2000 m before junction 0's `exitStart`, with free-flowing
generated traffic (as `onramp` does).

**Edge cases:**
- The player on the hard shoulder or the exit lane is a lane −1 leader or follower like any car:
  an exiter waits for it, keeps signalling, and misses the exit if it never clears.
- The player in lane 0 behind an exiter: the exiter does not brake in lane 0, so neither do you.
- An exiter holding a closure or zipper move: the closure term and the exit term add; the last
  chance rule still holds.
- Consecutive bridges are 3 km apart or more before `bridgeS`'s gantry nudge (up to 400 m each), so
  the next exit's roll window can start before the previous bridge. A car holding an exit is not
  rolled for the next one; a car that missed one may be.
- A run-out or strip car of the previous junction never reaches the next exit's span on lane −1
  (its `sEnd` is ~900 m past its bridge).
- Night: `densityScale` halves traffic; shares stay the same.

Checks: `npm run build`; `npm run onrampsuite` must reproduce the baseline exactly;
`npm run simtest`.

**Stop here for the user to try** (section 6, Try it). Per `AGENTS.md` a drive guides and never
gates: offer it, and carry on with step 2 if the user doesn't drive now; a journal later starts a
new session.

### Step 2: measure it (*proposal*) — **built**

`tools/exits.js`, `tools/exitsuite.js`, `package.json` (`exits`, `exitsuite`).

- `tools/exits.js`, modelled on `tools/onramp.js`: a `Traffic` with a fixed player, ahead 2000,
  behind 1500, one `addExit` for `junction(0)` shifted so `sStart` is 1000 m ahead of the player
  (the roll window lies behind the player, inside the range; `sTop` inside it). `--lanes`,
  `--density`, `--seed`, `--min` (default 10), `--share`, `--json`. It reports every section 3 line:
  exiters rolled, taken, missed; distance before `sStart` at which each exiter was in lane 0 for
  good (p10/p50/p90); indicator-on time before the move (min, p10); speed when crossing against
  the lane-0 speed there; lane-0 speed in `[sStart − 300, sGore]`; follower braking under −2 and
  −4 caused by an exiter; collisions, emergency stops; stops on the exit lane; max queue at the top;
  mean vehicles in range.
- `tools/exitsuite.js`: 2 / 3 lanes × density 8 / 12 × seeds 7, 8, 9, 10 (16 runs), each also run
  with `--share=0` as its control; prints the section 3 lines as pass/fail. Note how long it takes.
- If a line fails, tune in this order and write the values used here: `dGo` (700 + 1100 ×
  `mergeEarly`) for "early", the 300 m signal point and `sStart + 40` for "readable", `exitGoreKmh`
  and the −2.5 clamp for braking. Don't touch the shares to pass a line.

Checks: the suite; `npm run onrampsuite` still exact.

**Built.** `tools/exits.js` and `tools/exitsuite.js` as described, plus `exits` / `exitsuite` in
`package.json`. Differences from the plan: the tool also reports **which lane a missed exiter was
in when it gave up** (lane 0: no gap onto the exit lane; lane 1 or 2: never got right), and
`--share=0` also zeroes the lorry share, so the control really is the same run with nobody leaving
(otherwise 8% of the lorries still did, and the control measured a different road). The suite prints
per-run rows and the section 3 lines as pass/fail against its own control, and takes **4.5 min**
(206-266 s over two runs; 16 runs + 16 controls at 10 minutes each).

The tuning loop above was run in order and the last two knobs were never needed. `dGo` was tried at
1200 + 1300 × `mergeEarly` (everything passed and "early" read better: median 1676 m, p10 913 m
against 1180 / 429) but it cost 3 emergency stops at 3 lanes density 8 against 0 for the control, so
the plan's 700 + 1100 stands. The 300 m signal point was tried at 600 and 900 m: both helped
while the indicator could still be withdrawn (the bug above). With that fixed they are noise —
3 lanes, density 8, seeds 7/9/10: 3/1/2 missed at 600 against 1/0/4 at 300 — and the median
indicator in lane 0 goes from 15 s to 26 s, so it stays at 300. `exitGoreKmh` and the −2.5 clamp
were left alone: no line about braking failed.

Suite, final (2 + 3 lanes × density 8/12 × seeds 7–10, control per run, 674 exits):

- missed **2.2%** of exiters at density 8 (target 5) and **3.8%** at density 12 (15);
- in lane 0 for good: median **1180 m** (600) and 10th percentile **429 m** (300) at density 8;
- shortest right indicator **1.0 s** before starting across (1.0);
- speed across **0.0 km/h** off lane 0 there (≥ −10); lane 0 through the exit **0.4 km/h** under the
  control (≤ 5);
- cars behind braked under −4 in **0.0%** of exits (≤ 2); **0 collisions**, **0** emergency stops
  against the control's 0; **0** stops on the exit lane; vehicles in range within **0.4%** of the
  control (≤ 5).

All twelve lines pass. Per run the worst is 7% missed (3 lanes, density 8, seed 10: four of 54) and
one run at 197 m had the 10th percentile under 300 m; both are inside the median the line measures.

### Step 3: close the slice — **built**

- Full check (section 6), with how long each took the first time.
- `BACKLOG.md` F-21: one paragraph in the usual style, what was built and the suite's numbers;
  `status: built`.
- `README.md` "On-ramps and junctions": exits, the new CONFIG keys, `?scenario=exit`,
  `npm run exits` / `exitsuite`.
- Commit.

Done: the README paragraph (exits, the four new CONFIG keys, `?scenario=exit`, `npm run exits` /
`exitsuite`), the BACKLOG paragraph and `status: built`, queue Q-9 to done. Section 6 lists the times.

## 6. How we'll know

- **Quick check** per step: `npm run build`, `npm run onrampsuite` (exact against the baseline,
  ~4 min, in the background with output to a log), and from step 2 `npm run exitsuite`.
- **Full check** at the end: `npm run build`, `npm run simtest`, `npm run personas`,
  `npm run moments`, `npm run bottest`, and `node ~/Desktop/vibeview/scripts/sync-prompts.ts --check`.

Times the first time: `build` 3 s, `simtest` 4 s, `personas` 40 s, `moments` 2 s, `bottest` 95 s,
`exitsuite` 4.5 min (206-266 s), `onrampsuite` 187 s (all pass), and `node ~/Desktop/vibeview/scripts/sync-prompts.ts
--check` clean (exit 0).
- **Try it:** `npm run dev`, open `?scenario=exit`, stay in lane 1 at about 100 with the lane map on
  (U). Over the next minute, as the blue signs pass, a few cars ahead of you drift right into lane
  0 (marked on the lane map before they indicate); at the 3-2-1 markers they indicate right, slide
  onto the exit lane at speed, brake there and climb the exit road; when you pass under the bridge
  the last one is standing at the top with its brake lights on. Nobody brakes in lane 0 in front of
  you, nobody cuts across from lane 1 at the gore. Then free play (no scenario): the first junction
  comes at about 2 km, and the same happens with fewer cars.

Whether "early" and the exit-lane braking read as Dutch is the user's call from a drive; the suite's
lines are the measure until then.

## 7. Not doing

- **Late dives across lanes or across the gore.** Real (patsers do it), but it is the first thing
  that makes an exit unreadable; a car in the wrong lane misses the exit and drives on.
- **Slowing in lane 0 before the exit.** The exit lane is where you brake.
- **Cars driving on along the crossing road.** They wait at the give-way and are removed; the
  crossing road stays empty.
- **Changing `stripLogic` or any F-20 number** to make room for exits.

## Needs first

All present at `b62eefe` (checked 2026-11-24):

- `src/junctions.js` with `exitStart`, `exitGore`, `exitTop`, `exitPath`, `junctionsNear`,
  `junctionHasEstate` (F-20 slice 2, F-40).
- The rendered exit lane, gore, exit road, signs and *afritbakens* (`src/scenery.js`).
- Lane −1 as `this.strip`, `updateJunctionRamps`, `sc.junctions`, `tools/onramp.js` and
  `tools/onrampsuite.js` with `tools/onramp-baseline.json` (F-20 slices 2–4).
- `mergeEarly` on every archetype (`src/archetypes.js`).

## Not in this build

- **`tools/onramp-baseline.json` was stale and is re-saved here.** It had been written in
  `0f4d5f6` (on-ramps slice 4 P1), before P2's run-out and P3's merging, so it did not reproduce at
  `b62eefe` either (103 of its 120 numbers differ from what that commit produces). Re-saved from
  this tree after checking the 24-run matrix is **identical line for line to a clean worktree of
  `b62eefe`** — which is what "exits touch no random numbers when absent" means. `npm run
  onrampsuite` now reproduces it and passes its targets (187 s).
- Exits at density 16 and the crossing road filling up: a jam, F-22.
- A share of patsers diving late from lane 1 (a later slice, if a drive asks for it).
- Exit share by time of day or by junction (bigger towns, rush hour); real routes and destinations
  (M3, F-30 / F-33).
- Exits and on-ramps on the oncoming carriageway.
- Queues at the top spilling back onto the motorway: a jam, F-22.
- Journal rows and moment detectors for exits (Proefrit, F-37).
- The player taking an exit: F-31.
