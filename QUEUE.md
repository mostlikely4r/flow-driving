# Queue

<!-- vibeview queue v1. Order = the order tasks go to agents; top is next. Format: see vibeview/FORMAT.md -->

## Q-11 · Toekomstflitsen slice 1: toggle, spine and palette · build
- state: in progress
- backlog: F-48
- plan: docs/specs/F-48-toekomstflitsen.md
- added: 2026-11-25

Slice 1 only (section 7): F9 live toggle with the flits, the median spine with decks over the left
lane and cabin platoons, the brochure palette. Sim output must match `main` exactly; stop for the
user to drive under the deck. Slices 2 to 4 still wait for M2/M3.

Built 2026-11-25, waiting for the drive: the toggle, the spine and the palette are in, the checks
(sim output identical) and the review are done. Left `in progress` until you have driven under the
deck: does it feel like a place, or a tunnel?

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

## Q-12 · Toekomstflitsen cross-section: the 2 m guideway · spec
- state: queued
- backlog: F-48
- plan: docs/specs/F-48-toekomstflitsen.md
- added: 2026-11-25

Picked up later, with Opus. The drawings' real cross-section: the 4.20 m is the junction
clearance we already have (our on/off ramps), the deck sits 2 m above the road and the pods ride
under it — and the pods are ordinary cars with an electric rail down the lane centre, not bespoke
cabins. So no stopping at junctions, no 7.8 m deck and no edge-track cabins. Open questions and the
interim build are listed at the end of slice 1 in the plan. Nothing is built for this yet.

## Done

## Q-10 · Toekomstflitsen: the promised now · spec
- state: done
- backlog: F-48
- plan: docs/specs/F-48-toekomstflitsen.md
- done: 2026-11-25
- added: 2026-11-24

Done: the spec from 2026-11-24 stands; decided to build slice 1 early as a cheap test of the
covered left lane, the rest after M3. Queued as Q-11.

## Q-3 · Drive a junction and bring a journal · test
- state: done
- backlog: F-20
- done: 2026-11-25
- added: 2026-11-23

Free play with `rampsFreePlay` on, F8 at merges that look right or wrong. The journal starts a new
session; it guides, it doesn't gate. Done: driven 2026-11-25, "not much to add — it just looks fine";
no marks, so no journal rows to read. Nothing queued from it.

## Q-9 · Exits slice 1: cars move right early and leave · build
- state: done
- backlog: F-21
- plan: docs/specs/F-21-exits.md
- done: 2026-11-24
- added: 2026-11-24

Step 1 is the smallest version to drive (`?scenario=exit`); step 2 adds `npm run exits` /
`exitsuite` with a no-exit control per run. On-ramp matrix must stay exact. Done: cars leave at
12% (lorries 8%), work right from 700–1800 m out by `mergeEarly`, indicate at the bakens, cross at
motorway speed, brake on the exit lane and wait at the give-way at the top; a car in the wrong lane
misses rather than dives. The exit wish had to become a wish of its own (not a MOBIL bribe) and its
indicator must not be withdrawn — that pair took missed exits from 17% to 2.2%. `npm run exits` /
`exitsuite` (16 runs + control, 266 s): all twelve section 3 lines pass, 0 collisions, 0 emergency
stops. The on-ramp matrix is identical line for line to `b62eefe` (the saved baseline is stale from
slice 4 P1).

## Q-4 · Exits: cars move right early and leave · spec
- state: done
- plan: docs/specs/F-21-exits.md
- done: 2026-11-24
- backlog: F-21
- added: 2026-11-23

Reuse slice 2's exit lane, gore and signs, which are already rendered. AI only; the player taking
an exit is F-31. Done: plan `docs/specs/F-21-exits.md` (planner's proposals; nothing was talked through).

## Q-8 · On-ramps slice 4: the run-out and merging like a Dutchman · build
- state: done
- backlog: F-20
- plan: docs/specs/F-20-slice-4-runout.md
- done: 2026-11-24
- added: 2026-11-24

A merger with no gap rolls on along the hard shoulder (150 m run-out) instead of standing at the
strip end, takes a ~2-car-length gap and lets the follower brake; the invisible wall that trapped
your car goes. Matrix widened to 4 seeds first. Done: `npm run onrampsuite` is 24 runs (~4 min) with
stops split by place, run-out merges and braking under −4, against a fresh baseline (the old one was
stale, from slice 3 P1). 24 runs: stops per merge median 0.00 at density 8 (0.24) and 0.00 at 12
(1.98); hard-end stops 7 in 757; 0.4% of merges braked the new follower under −4; 0 collisions, 5
emergency stops against 6; lane 0 near the ramp 80 km/h at 8 and 72 at 12 (67 and 45). Both slice-3
targets met; density 16 is still a jam (F-22).

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
