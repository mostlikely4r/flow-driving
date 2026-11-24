# Queue

<!-- vibeview queue v1. Order = the order tasks go to agents; top is next. Format: see vibeview/FORMAT.md -->

## Q-8 · On-ramps slice 4: the run-out and merging like a Dutchman · build
- state: queued
- backlog: F-20
- plan: docs/specs/F-20-slice-4-runout.md
- added: 2026-11-24

A merger with no gap rolls on along the hard shoulder (150 m run-out) instead of standing at the
strip end, takes a ~2-car-length gap and lets the follower brake; the invisible wall that trapped
your car goes. Matrix widened to 4 seeds first.

## Q-3 · Drive a junction and bring a journal · test
- state: queued
- backlog: F-20
- added: 2026-11-23

Free play with `rampsFreePlay` on, F8 at merges that look right or wrong. The journal starts a new
session; it guides, it doesn't gate.

## Q-4 · Exits: cars move right early and leave · spec
- state: queued
- backlog: F-21
- added: 2026-11-23

Reuse slice 2's exit lane, gore and signs, which are already rendered. AI only; the player taking
an exit is F-31.

## Q-6 · Proefrit: fix the stage-test probes · build
- state: queued
- backlog: F-37
- plan: docs/F-37-proefrit.md
- added: 2026-11-23

The "Open: what the stage test cannot see yet" list: closure obstacles as journal rows,
`pointless-lane`'s hard-coded 120 m as `cfg.pointlessM`, brake-light on/off events. Before Q-5 so
frames aren't shot of mislabelled closure moments.

## Q-5 · Proefrit slice 3: frames and clips · spec
- state: queued
- backlog: F-37
- plan: docs/F-37-proefrit.md
- added: 2026-11-23

Two frames plus a one-line reproduce command per worst moment, occlusion, the `dwars` profile.
Slice 4 (`compare.js`, `jij`) waits for at least 3 of your journals.

## Q-7 · Rain · spec
- state: queued
- backlog: F-24
- added: 2026-11-23

Biggest open M2 item. Focus on AI keeping bigger gaps and spray behind trucks; wet-road
reflections can be a second slice.

## Done

## Q-2 · On-ramps slice 3 · build
- state: done
- backlog: F-20
- plan: docs/specs/F-20-slice-3-making-room.md
- done: 2026-11-24
- added: 2026-11-23

Compare 12 `npm run onramp` runs with slice 2's numbers (stops per merge, lane-0 speed loss near
the ramp); 0 collisions. Done: the matrix runs as `npm run onrampsuite` (109 s, baseline saved in
`tools/onramp-baseline.json`). Density 12 stops per merge 0.74 against 4.53, lane-0 near 46 against
41, 0 collisions. The 0.1 target at density 8 is not met (0.28) and lane 0 making room was built
and dropped on the numbers — both recorded in the plan.

## Q-1 · On-ramps slice 3: gap acceptance and making room · spec
- state: done
- plan: docs/specs/F-20-slice-3-making-room.md
- done: 2026-11-24
- backlog: F-20
- added: 2026-11-23

Start from the slice 2 finding: merges stall because the merge is a gap-acceptance problem (F-22),
and lane 0 makes no room yet. Slice 2 ended at a median of 0.56 stops per merge against a target
of 1 in 10 at density <= 12; a longer ramp road made it worse. Leave out `rampRoadM` tuning and exits.
Inputs gathered 2026-11-23 (baseline, probes, tool traps, code paths, the one rejected approach):
`docs/specs/F-20-slice-3-inputs.md`.
