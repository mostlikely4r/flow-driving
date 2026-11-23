# F-20 slice 3: inputs for the spec

**This is not a plan.** It holds the measurements, the code paths and the traps gathered on
2026-11-23 at commit `b2a6987`, so the slice-3 spec (QUEUE `Q-1`, build in `Q-2`) can start from
numbers instead of re-deriving them. Nothing here is decided; the decisions are at the end and
they are the user's.

BACKLOG item **F-20** (status `building`), follows
[F-20-slice-2-visible-onramps.md](F-20-slice-2-visible-onramps.md). Slice 1 already rejected one
approach — read **The one approach already rejected** before proposing anything.

## How to reproduce

```
node tools/onramp.js <lanes> <density> <perMin> <minutes> <seed> <road>
node tools/onramp.js 3 12 6 10 7 400     # one run, 12 s wall clock
CFG_mergeLastM=300 node tools/onramp.js 3 12 6 10 7 400    # CFG_<key>=<value> overrides CONFIG
```

`road=0` is slice 1 (cars appear at the start of the strip), `road=400` is slice 2 (they come down
the ramp road). The ramp top sits at s 700, the run is 10 simulated minutes, `dt` 1/30. Twelve runs
took about 2.5 min. In the browser: `?scenario=onramp`, `?scenario=onramp-busy`, or free play with
`rampsFreePlay` (one ramp per junction, every 3–6 km).

**The runs are deterministic.** The 12-run baseline below reproduces slice 2's table exactly, number
for number, so any difference a later change makes is the change.

## Baseline (current HEAD, road 400, 6/min, 10 min)

| lanes | density | seed | merges | stops | stops/merge | pos p50 | km/h p50 | lane 0 near / 1 km up | moved left | veh/min |
|---|---|---|---|---|---|---|---|---|---|---|
| 2L | 8 | 7 | 50 | 12 | 0.24 | 212 m | 64 | 63 / 87 | 32 | 34 |
| 2L | 8 | 8 | 49 | 19 | 0.39 | 267 m | 48 | 57 / 88 | 24 | 35 |
| 2L | 12 | 7 | 39 | 28 | 0.72 | 249 m | 27 | 40 / 83 | 34 | 44 |
| 2L | 12 | 8 | 46 | 66 | 1.43 | 214 m | 15 | 42 / 84 | 52 | 43 |
| 2L | 16 | 7 | 41 | 203 | 4.95 | 228 m | 13 | 40 / 33 | 45 | 46 |
| 2L | 16 | 8 | 30 | 63 | 2.10 | 254 m | 9 | 41 / 56 | 49 | 46 |
| 3L | 8 | 7 | 42 | 7 | 0.17 | 184 m | 67 | 65 / 86 | 26 | 49 |
| 3L | 8 | 8 | 39 | 8 | 0.21 | 250 m | 65 | 69 / 84 | 25 | 50 |
| 3L | 12 | 7 | 38 | 103 | 2.71 | 272 m | 45 | 41 / 82 | 28 | 68 |
| 3L | 12 | 8 | 25 | 473 | 18.92 | 262 m | 13 | 37 / 81 | 31 | 67 |
| 3L | 16 | 7 | 24 | 286 | 11.92 | 235 m | 20 | 42 / 75 | 28 | 70 |
| 3L | 16 | 8 | 29 | 170 | 5.86 | 255 m | 8 | 40 / 56 | 33 | 70 |
| **total** | | | **452** | **1438** | **3.18** | | | | **407** | |

Median stops per merge at density ≤ 12 is **0.39**; the target is **1 in 10** (0.1). 0 collisions,
2 emergency stops, both at density 16.

## One number slice 2 never reported

`movedLeft` — lane-0 cars that moved from 0 to 1 in the last 300 m before the strip end while a
merger was signalling: **24–52 per run, 407 over 12 runs, with no courtesy rule in the code at
all.** So "lane 0 makes no room" is too strong as a premise. Something moves, and the merge still
stalls, which means **a courtesy count is not the metric** — see the third trap.

## Probes on current HEAD (8 runs each: 2/3 lanes × D8/D12 × seeds 7/8, road 400)

| probe | stops/merge median | total stops | what it says |
|---|---|---|---|
| baseline | 0.39 | 716 | |
| `CFG_mergeLastM=300` | 0.31 | 147 | a wider last-gap window barely helps, as slice 1 found |
| `CFG_mergeKmhDefault=25` | 0.30 | 219 | the **speed-match gate**, not the gap, is binding: mergers refuse to join at a speed mismatch |
| `CFG_rampStripM=700` | **0.00** | **0** | zero stops in all 8 runs; merge p50 69–77 km/h, lane 0 72–86 against 80–91 upstream, 0 collisions |

`rampStripM` 700 details, since it is the awkward one: 313 merges against 359 at the baseline over
the same 8 runs, merge position p50 148–309 m, `movedLeft` 13–29.

**Read this as the central question for the spec, not as a knob.** Geometry alone reaches the
metric. Real Dutch *invoegstroken* are roughly 200–400 m, so 700 m is a realism cost (pillar 1) and
would change slice 2's rendered junction. If a longer strip gets 0 stops, "making room" cannot be
justified by the stop count and has to be justified by the Readable pillar (a merger that visibly
gives way, a lane 0 that visibly eases) — or the target has to be restated.

## Three traps in `tools/onramp.js` (read before quoting any of its numbers)

1. **Throughput reads 0 for every `rampStripM` ≥ ~600 run.** `THROUGH_S` is `s1 + 200`, and the sim
   only spans 1500 m ahead of s 0. At strip 700 that line sits at 1600 m, so nothing ever crosses
   it. A spec that compares long strips on throughput would read a false collapse. Fix the span or
   the line before trusting that column.
2. **`CFG_rampPerMin` does nothing.** The tool passes `perMin` as an argument to `addRamp`, and the
   argument wins over the CONFIG default. My "quiet ramp" probe returned byte-identical numbers.
   Ramp flow has to go through argv (3rd argument), or the tool needs fixing.
3. **`movedLeft` counts routine lane changes.** It fires for any 0→1 move in the last 300 m while
   any strip car signals, so it includes ordinary overtakes. Slice 3 needs a courtesy-specific
   reading: did the easing car lift off or move over *because* of the merger, and did the merger
   then merge in that gap?

## What the code does today

- `stripLogic` (`src/traffic.js:1031`) is the whole merge decision for a car in lane −1:
  signals left from 100 m before the strip (`RAMP_SIGNAL_M`, line 31), then needs `mergeReady`,
  `evaluate(...).safe`, `idm(veh, lane-0 leader) >= -2.2`, and — when joining well below the speed
  of the car behind — the normal follower test. Sets `veh.zipping` inside the last
  `40 + 2v` metres. A car only enters `this.lanes[0]` at the moment it starts moving, so **lane 0
  cannot see a merger before that**.
- `mergeReady` (`src/traffic.js:1071`): speed match against the genuine leader, unless inside
  `mergeLastM` (120 m) of the end.
- `evaluate` (`src/traffic.js:~700`): the zipper path treats the end of the strip as a closing
  lane. Strip cars are forced toward lane 0 by `if (veh.lane === -1) closure = 3;` (line 751).
- Cooperation already exists for ordinary lane changes: `computeAcc` (line 515–532) makes a
  `veh.coop` driver lift off, capped at −1.6 m/s², for a signaller **ahead** 1–55 m in the next
  lane. Nothing for a car behind, alongside, or two lanes away.
- **The guards that keep the strip out of it:** `if (ln < 0 || ln >= this.N) continue;` at
  `src/traffic.js:519` (cooperation) and `:576` (anticipation), both commented "the strip is not a
  lane to ease into". They are there because of the deadlock below.
- `addRamp` (`src/traffic.js:185`): `s0 = sTop + roadM`, `s1 = s0 + stripM`, an obstacle 10 m past
  `s1`. `spawnFromRamp` (line 1248) inserts at the top at `rampTopKmh` 50 (trucks 35); a spawn hold
  (`rampSpawnHoldM` 120) keeps cars from popping in next to the player.
- Relevant CONFIG (`src/config.js`): `rampRoadM` 400 (:52), `rampStripM` 350 (:56), `rampPerMin` 6
  (:57), `mergeKmhDefault` 12 (:59), `mergeLastM` 120 (:60), plus `anticipation` (:39),
  `politeness` (:43), `lineUpS`/`lineUpLift` and `coop` per archetype.

## The one approach already rejected

Slice 1 tried including lane −1 in the cooperative/anticipation loops. Measured result: **lane 0
deadlock** — 23 standing cars at the ramp, lane 0 at 7–13 km/h, 2 collisions in 12 runs, merge
speed p50 10 km/h. The cause: a blanket −1.6 m/s² lift for *any* signaller within 55 m, for the
whole 350 m of strip, so lane 0 brakes for cars that are not actually merging.

That is why the guards at :519 and :576 exist. Slice 3 has to be a **targeted** rule (who, how far
back, how much, how long), not "let the existing cooperation see the strip". The slice-1 finding
words it as: making room "on purpose, not the blanket cooperation above".

## What is already wired that slice 3 can build on

- **Per-persona character**: `coop` is 1 for Pensioner, Grijze sok and Family, 0 for Leasebak,
  60% for White van, 20–30% for Patser (`src/archetypes.js`). `mergeKmh` already spans 5 (Leasebak,
  only at speed) to 28 (Pensioner, "invoeghok": merges early and far below the traffic speed).
  Slice 1 measured that persona **gap** parameters, not `mergeKmh`, decide the merge moment.
- **Detectors** (`src/moments.js:14`): `let-in` and `moved-over` are good moments, `not-let-in`,
  `cut-off`, `forced-brake` are bad ones. `let-in` and `moved-over` both read the *player's* column
  journal, so they fire for you, not for AI-to-AI merges — either teach them AI-to-AI or give the
  tool its own reading.
- **The tool's existing columns**: stops/merge, longest stop, merge position and speed, speed
  difference, front and back gap accepted, per-persona rows, new follower's braking, lane-0 speed
  near the ramp against a kilometre upstream, `movedLeft`.

## Open decisions (the user's, not mine)

1. **Metric or pillar?** If a 700 m strip reaches 0 stops, what does slice 3 buy — and is 700 m
   acceptable as a Dutch acceleration strip, given slice 2 already rendered the junction at 350 m?
2. **Who makes room, and how much?** Move left (a MOBIL bias toward the next lane), lift off
   further back for a strip car, or both. Note nothing today handles a merger *alongside* or
   *behind* — the existing rule only looks ahead.
3. **Density ceiling.** 3L D12 S8 at 18.9 stops/merge is a jam, and jams are F-22's job. Is slice 3
   allowed to say "at density ≥ 12 this stays bad"?
4. **Does the ramp flow vary?** Slice 1's slice-3 line mentioned ramp flow that changes over the
   day and the matrix-sign queue warning. Both are bigger than "making room".
5. **Scope of the check.** 12 runs per change at 12 s each is cheap; say so in the plan so the full
   check stays trimmed.

## Warnings for whoever writes the spec without this file

- Do not report throughput for strips over ~600 m from the current tool.
- Do not use `CFG_rampPerMin`; it is ignored.
- Do not treat `movedLeft` as a courtesy measurement.
- Do not fix the stall by re-enabling the existing cooperation for lane −1; that deadlocked lane 0.
- Do not tune `rampRoadM` (slice 2 already measured 300 against 400, and Q-1 excludes it).
