# Flow Driving backlog

<!-- vibeview backlog v1. Format: see vibeview/FORMAT.md. Vision and pillars: docs/vision.md -->

Every feature by ID. Read [docs/vision.md](docs/vision.md) first: the vision, the three pillars
(Authentic, Readable traffic, Calm), how items are scored and the milestones. Findings from the
headless harnesses are in [docs/harness-findings.md](docs/harness-findings.md).

## F-01 · Headlight toggle works at night
- status: built
- priority: P0
- value: 3
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M1

Lights are currently forced on. Done.

## F-02 · Fix bloom on nearby headlights
- status: built
- priority: P0
- value: 4
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M1

Cap the glow from close cars and use proper dipped-beam aim. Done, needs playtest.

## F-03 · Horn
- status: built
- priority: P1
- value: 2
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M1

Horn (H). AI reacts mildly: a startled tap of the brakes, or abandoning a lane change into you.

Done, on Space (H is help): two-tone horn; a car changing lanes into you abandons it, the car ahead
taps its brakes and (in a left lane) moves over, a car alongside flinches and holds its lane.

## F-04 · Scenario harness
- status: built
- priority: P0
- value: 5
- effort: M
- risk: Low
- pillar: Readable
- milestone: M1

**Scenario harness**: set up a seeded, repeatable situation such as "2 lanes, truck ahead, speeder
behind" from a menu or URL. Done: `?scenario=` + `npm run scenario`.

## F-05 · AI intent debug overlay
- status: built
- priority: P0
- value: 4
- effort: S
- risk: Low
- pillar: Readable
- milestone: M1

Shows each car's desired lane, its target gap and why it won't merge. Done (O key, dev mode).

## F-06 · AI anticipation
- status: built
- priority: P0
- value: 5
- effort: M
- risk: Med
- pillar: Readable
- milestone: M1

Plans an overtake *before* closing in on a slower vehicle, instead of braking first and then
swerving. Done: per-driver `antic` skill (archetypes will set it), menu knob.

## F-07 · AI telegraphing
- status: built
- priority: P1
- value: 5
- effort: M
- risk: Med
- pillar: Readable
- milestone: M1

Drifts toward the lane line, signals for 2–3 s and makes small speed adjustments before changing
lanes. Done: intent phase (drift, closing up, mirror-check delay), gap seeking while signalling;
style per archetype; `telegraph` knob.

## F-08 · Speeders read the road ahead
- status: built
- priority: P1
- value: 4
- effort: M
- risk: Med
- pillar: Readable
- milestone: M1

Speeders lift off early when a car in front signals left, rather than braking late. Mostly covered
by F-06 + F-07: anticipating drivers now also react to a car edging toward their lane. Revisit
after playtest.

## F-09 · Overtake follow-through
- status: built
- priority: P1
- value: 4
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M1

Cars return right promptly after passing, and drivers queued behind react to it. Done: remembers
who it overtakes, heads back right once clear. F-35 found and fixed a bug that wiped that memory on
the first step of the move.

## F-10 · Car models spike
- status: parked
- priority: P3
- value: 3
- effort: M
- risk: Med
- pillar: Quality
- milestone: M1

Compare improved procedural cars with imported CC0 glTF models on one test car. Deferred: generic
but convincing is fine.

## F-11 · Car models rollout
- status: parked
- priority: P3
- value: 3
- effort: L
- risk: Med
- pillar: Quality
- milestone: M1

About 8 distinct vehicles, each with its own light layout (based on the F-10 outcome). Deferred.

## F-12 · Radio
- status: built
- priority: P1
- value: 3
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M1

A play-your-own-music folder, plus optional live Dutch radio streams. Done: Y tunes off / my music /
NPO Radio 1, 2, 3FM, Klassiek, 5. Folder picked in the menu each session (files stay local); streams
can be turned off in the menu. Later: remember the folder, car-speaker EQ.

(F-39 replaced the NPO stations with a stream URL you paste.)

## F-13 · Shoulder check / look-around
- status: built
- priority: P1
- value: 3
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M1

Hold a key to glance over the shoulder at the blind spot. Done: Z / X tap = quick glance (~135° /
125°, head moves toward the window), hold = keep looking.

## F-14 · Driver archetypes
- status: built
- priority: P1
- value: 5
- effort: M
- risk: Med
- pillar: Readable
- milestone: M1

**Driver archetypes**: a persona decides both the look and the behaviour (speed, headway,
politeness, lane habits). Tendencies, not guarantees, roughly 70/30.

Done: Leasebak, Patser, Pensioner, Grijze sok, Family, White van, EV smoothie. Vans can be
archetypes too. `?scenario=cast` shows them all.

### Draft archetypes

| Archetype | Looks like | Drives like |
|---|---|---|
| Leasebak (lease car) | Dark grey or black German-style estate or sedan, LED light strips | 120–135 in the left lane, slightly short headway, flashes you |
| Patser | Cheap black hatch, lowered, tinted windows, big wheels | Erratic: short gaps, late cut-ins, overtakes on the right when frustrated |
| Pensioner | Small silver hatch or a caravan, yellowish halogen lights | Under the limit, stays right, signals early and long, very polite |
| Grijze sok | Grey or silver hatch or sedan, L-shaped tails | Eco driver: 90–96 until it finds a truck, then tucks in behind it (~1.1 s) and stays; gentle, coasts early |
| Family | Mid-blue or red SUV or estate | Steady at the limit, normal gaps, cooperative |
| White van (bestelbus) | White van, roof rack | Faster than you'd expect, pushes in the middle lane |
| EV smoothie | White or blue clean sedan, thin light bar | Exactly at the limit, perfectly smooth, often hogs the middle lane |
| Truck | Truck, rigid truck | Unchanged: 80–85 km/h, elephant races |

## F-15 · Archetype visual tells
- status: built
- priority: P1
- value: 4
- effort: M
- risk: Med
- pillar: Readable
- milestone: M1

Archetype visual tells within the box style: colour palette, stance, tinted windows, wheels, light
signature (LED strip or yellow halogen), readable in the mirror and at night.

Slice 1 done: palette, lowered + big rims, tint, and a lamp shape per archetype: leasebak LED strip
+ full-width rear bar, patser angel-eye rings + smoked tails, pensioner round warm lamps, grijze sok
twin projectors + L-shaped tails, family tall upright tails, EV one thin light line front and back,
white van roof rack + ladder + company stripe.

## F-16 · Fix the side stripes that read as glitching wheels
- status: built
- priority: P1
- value: 2
- effort: S
- risk: Low
- pillar: Quality
- milestone: M1

Done: real wheel arches cut into the body.

## F-17 · AR speed overlay
- status: built
- priority: P0
- value: 5
- effort: S
- risk: Low
- pillar: Readable
- milestone: M1

Speed of other cars (relative or absolute) over the windscreen and in the mirrors, warm colours
when closing in, decluttered. A small quality-of-life option, off by default. Done, playtested;
labels made smaller.

## F-18 · Cut-in overreaction
- status: built
- priority: P0
- value: 5
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M1

IDM brakes up to −9 m/s² when a slightly slower car merges in ~20 m ahead. Real drivers drop back
gently. Fix: blend IDM with Treiber's constant-acceleration heuristic (the ACC model). Done:
`coolness` 0.99 in config.js.

## F-19 · Dev overlay v2
- status: parked
- priority: P2
- value: 3
- effort: M
- risk: Low
- pillar: Readable
- milestone: M1

Everything the expanded overlay shows now, plus predicted paths, target gaps and lane-change intent
drawn in the world. Later; separate from the AR overlay.

## F-20 · On-ramps (AI only)
- status: built
- priority: P1
- value: 5
- effort: L
- risk: High
- pillar: Readable
- milestone: M2
- plan: docs/specs/F-20-slice-4-runout.md

Merge lane, acceleration strip, AI zipper-merge and making room.

Slice 1 done (sim-only spike): [docs/specs/F-20-slice-1-onramps.md](docs/specs/F-20-slice-1-onramps.md).
The acceleration strip is lane −1 on the hard shoulder (`addRamp`/`stripLogic`); cars appear at ~80
km/h, indicate left, merge when the gap is safe and the speed matches, zip in near the end, and stop
at the end if nothing comes free. A merger gives way (invoegen) and lane 0 makes no room yet.
`?scenario=onramp` / `onramp-busy`, `npm run onramp`. 12 runs at 6/min, 10 min: 0 collisions, merge
position p50 142–287 m of 350, merge speed p50 7–70 km/h, follower braking under −2 in 6–31% of
merges, lane 0 200 m before the strip end 17–44 km/h below a kilometre upstream (39–46 against
71–88), throughput 32–63 veh/min. Finding: the inherited merge code stalls 8–85 stop episodes per
run (up to four minutes) because a car needs ~200 m to reach lane-0 speed and a stalled merger needs
a 100–180 m gap; a longer strip or a wider last-gap window fixes most of it (`rampStripM` 700: 1
stop, merge p50 83 km/h). The per-persona `mergeKmh` does not produce the intended order — persona
gap parameters dominate.

Slice 2 (junctions with exit signs, ramp roads, ramps in free play) specced:
[docs/specs/F-20-slice-2-visible-onramps.md](docs/specs/F-20-slice-2-visible-onramps.md); slice 3
(making room, jams) after.

Slice 2 built: junctions ([docs/specs/F-20-slice-2-visible-onramps.md](docs/specs/F-20-slice-2-visible-onramps.md)),
placed seedless every 3-6 km (`junctionEveryKm`, block 0 at 2500) and nudged clear of gantries. Each
has exit signs at 1200/600 m, 3-2-1 afritbakens, an exit lane and gore, a bridge with a crossing
road, and an on-ramp road (400 m) down to the strip; mirrored on the other carriageway, lit, with
the estate of the nearest 5 km block beside it (30% trucks on that ramp). Ramp road and strip are
both lane -1, cars appear at the ramp top at ~50 km/h and may not merge before the strip;
`rampsFreePlay` adds one ramp per junction in free play, a spawn hold keeps cars from popping in
next to you. `?scenario=onramp` / `onramp-busy` now start at junction 0. 12 runs at road 400: 0
collisions, 1 emergency stop, **stops per merge 0.17-18.9 (median 0.56) against slice 1's
0.19-2.36 (median 0.69)** - the target (1 in 10 at density <= 12) is still missed, and the ramp
road makes the stalls worse rather than better: it adds distance *before* the merge point, where a
free car already arrives at lane-0 speed, while the jam at the strip end now queues on the ramp
road too, so more cars stop and fewer merge. Speed at the end of the ramp road p50 60-86 km/h, lane
0 near the ramp still 21-47 km/h below a kilometre upstream. `rampRoadM` 300 gave 3.4 stops per
merge against 3.2 at 400 (both against 0.7 at 0). The merge is a gap-acceptance problem (F-22):
slice 3 starts there.

Slice 3 built: [docs/specs/F-20-slice-3-making-room.md](docs/specs/F-20-slice-3-making-room.md).
The on-ramp tool now tells the truth (throughput line inside the sim for any strip length, ramp flow
through `rampPerMin`, a gate reading and a courtesy reading), and `npm run onrampsuite` runs the
12-run matrix against `tools/onramp-baseline.json` (`--save` writes it); with `--save` on the
unchanged sim it reproduces the slice-2 table number for number. The **speed-match gate widens from
the middle of the strip** to `mergeLastM` (`mergeRelaxKmh` 30) and a merger faster than lane 0 eases
toward its speed with a virtual leader (`mergeLiftMinKmh` 50) instead of overtaking it on the strip.
12 runs: stops per merge at density 8 **median 0.28 against the 0.1 target — not met**, density 12
**0.74 against 4.53** and better on 3 of 4 runs, lane-0 near 66 km/h at 8 (was 65) and 46 at 12 (41),
0 collisions, 3 emergency stops against 2 (both at density 16). Over 8 seeds per density the medians
are 0.22 at 8 and 1.45 at 12 (slice 2: 0.29 and 3.19), so the 0.1 target needs more than a 350 m
strip can give. Lane 0 making room was built both ways round and dropped on the numbers: lane 0
lifting off for a signaller collapses to 7-31 km/h (the slice-1 deadlock class), and the mirror image
(the merger easing back to drop in behind) is a wash at density 8 and worse at 12 (3.40 against 1.45)
because it takes the run-up away from the cars behind on the strip. The 2-seed matrix is too noisy to
judge a rule by (2L D12 S9 is 15 stops per merge in every variant, 2L D12 S7 swings 0.73 to 11.85 on
a 6 s change); widening it to 4 seeds comes first next time. Exits are F-21, jams F-22.

Slice 4 specced: [docs/specs/F-20-slice-4-runout.md](docs/specs/F-20-slice-4-runout.md). From two
drives on 2026-11-24: mergers stood at the strip end and an invisible wall on the hard shoulder
trapped the player. A merger with no gap rolls on along a 150 m run-out on the hard shoulder, takes
a ~2-car-length gap from the middle of the strip on and lets the follower brake; the player's wall
goes; the matrix goes to 4 seeds first.

Slice 4 built: [docs/specs/F-20-slice-4-runout.md](docs/specs/F-20-slice-4-runout.md). The matrix is
24 runs now (4 seeds), with stops split by place (strip, run-out, hard end), merges in the run-out
and follower braking under −4, and it checks the plan's section 3 lines against a fresh baseline
(the one in the tree was stale: saved in slice 3 P1, before P2's relax gate, so 2L D8 S7 read 14
stops against its 12). **The strip now ends in a run-out:** past `s1` a merger with no gap keeps
rolling for `rampRunoutM` 150 m along the vluchtstrook, indicating left, at `runoutUnderKmh` 5 under
the lane-0 car alongside (floored at 15 km/h, a virtual leader), and it never undertakes lane 0
there. From the middle of the strip on it merges like a Dutchman: `mergeFollowM` 9 m (two car
lengths) in front of a follower that need brake no harder than `mergeFollowB` 3 m/s² by IDM; the
first half of the strip and ordinary lane changes are untouched. The AI's stop marker moved out to
`r.sEnd` (invisible, AI only) and **the player's strip-end wall is gone** — past a strip the hard
shoulder is just the hard shoulder, and a run-out car follows you there. 24 runs: **stops per merge
median 0.00 at density 8 (0.24) and 0.00 at 12 (1.98)**; hard-end stops 7 in 757 merges (0.009,
target 1 in 20); merges braking the new follower under −4 m/s² 3 of 749 (0.4%, target 3%), under −2
4.5% (16.4% — it fell rather than rose, because mergers now take gaps at speed instead of stopping
and diving); 0 collisions, 5 emergency stops against 6; lane 0 200 m before the strip end 80 km/h at
density 8 and 72 at 12 (67 and 45). Both slice-3 targets met with room; density 16 is still a jam
(F-22).

Driven 2026-11-25 (Q-3): free play with `rampsFreePlay` on, "not much to add — it just looks fine",
no F8 marks. Nothing queued from it; slice 5 is jams (F-22).

Closed 2026-11-26 (grooming): the on-ramps do what they set out to; the jam at density 16 is F-22's.

## F-21 · Exits (AI only)
- status: built
- priority: P1
- value: 4
- effort: M
- risk: Med
- pillar: Authentic
- milestone: M2
- plan: docs/specs/F-21-exits.md

Cars move right early and leave the motorway.

Slice 1 specced: [docs/specs/F-21-exits.md](docs/specs/F-21-exits.md). About 12% of cars passing a
junction leave there (proposal); they drift right from 700–1800 m out by `mergeEarly`, stop
overtaking, indicate at the bakens, cross onto the exit lane at speed, brake on it, climb the exit
road and wait at the give-way at the top. A car in the wrong lane misses the exit, never dives.
`?scenario=exit` first, then `npm run exitsuite` with a no-exit control.

Slice 1 built: [docs/specs/F-21-exits.md](docs/specs/F-21-exits.md). Cars leave at `exitShare` 12%
(lorries 8%, 30% where the junction has an estate), rolled once 2500–1000 m before the exit lane;
from `exitGoM + exitGoSpreadM × mergeEarly` out (700 m for a patser, 1.8 km for a careful driver)
they work right lane by lane and stop overtaking, and — measured — that has to be a wish of their
own, not a MOBIL bribe: in a fast left lane the margin for moving right is −5 to −10, and a
leaving driver's indicator must not be withdrawn either (that pair of fixes is what took missed
exits from 17% to 2.2%). In lane 0 they indicate at the first baken (`exitSignalM` 300) and cross
40 m into the exit lane at motorway speed; on it they slow to `exitGoreKmh` 70 by the gore and
40 km/h near the top, never harder than −2.5 m/s², then stop at the give-way, wait `exitWaitS` and
are gone. A car still in the wrong lane 30 m before the gore gives up and drives on. Free play adds
one exit per junction; `?scenario=exit`; `npm run exits` / `npm run exitsuite` (16 runs + a control
each, 266 s). Suite: **missed 2.2% at density 8 and 3.8% at 12**, in lane 0 for good median 1180 m
and p10 429 m, shortest indicator 1.0 s, speed across level with lane 0 there, lane 0 through the
exit within 0.4 km/h of the control, follower braking under −4 on 0.0% of exits, 0 collisions, 0
emergency stops, nobody standing on the exit lane. All twelve section 3 lines pass. The on-ramp
matrix is unchanged line for line (it is compared against a clean worktree of `b62eefe`: the saved
baseline is stale, from slice 4 P1).

## F-22 · Bottlenecks and jams
- status: specced
- priority: P1
- value: 5
- effort: M
- risk: Med
- pillar: Readable
- milestone: M2
- plan: docs/specs/F-22-calibration.md

Density waves and lane drops that create a jam which forms and dissolves.

Groundwork: `?scenario=wave` + `node tools/wave.js`. Finding: a hard brake does travel back as a
wave, but it DAMPS (4.5 m/s² right behind, <1 m/s² 600 m back) because drivers react instantly and
smoothly.

Step 1 done: per-driver reaction delay (0.3-1.4 s by archetype, `reactionTime` knob + menu) with a
crash reflex, and brake-light reading two cars ahead as the stabiliser. A mild brake (to 65) now
grows further back (cars 400 m+ drop to ~48); at reactionTime 1.4 it becomes stop-and-go (braking
~4 m/s², max 5), 0 collisions. 1.6 is unsafe (emergency stops).

Step 2 done via F-23: a lane closure is a bottleneck and a jam now forms by itself behind it (3->2
lanes at 9/km/lane: ~30 veh/min get through against ~50 on a plain 2-lane road, so it is harsher
than reality, where a merge costs 10-30%). 0 collisions over 8 closure setups. Causes of the low
throughput: stragglers zip in from standstill, trucks pull away at 0.45 m/s², queue discharge gaps.

Still open (groomed 2026-11-26, on-ramps are built in F-20): a jam at on-ramps from density 16 up
that should form and clear again rather than sit, and the closure jam being harsher than real
(~30 veh/min through against the ~40 a 10-30% merge loss would give). Queued as a spec (Q-17),
narrowed 2026-11-27 to calibrating the near traffic; jams born beyond the window are F-61. Specced 2026-11-27: queues empty at ~60% of the real rate
(lorries at 0.45 m/s², full reaction delay on pulling away, a spawner capped at ~20 veh/km/lane);
the plan brings them to real numbers with a `npm run jams` tool (Q-19).

## F-23 · Dynamic matrix signs
- status: built
- priority: P2
- value: 4
- effort: M
- risk: Low
- pillar: Authentic
- milestone: M2

70/50 limits ahead of jams, flashing lights, red X lane closures.

Done (`src/msi.js`): gantries every 500 m; queue warning (traffic past a gantry < 35 km/h ->
flashing 50 there and one back, 70 before that, clears after 25 s); lane closures (arrow, red
crosses, 70 over open lanes, 90 one gantry earlier, end sign); drivers obey with per-archetype
margin; arrow-board truck + cones; HUD limit follows; red cross counted in trip stats; shown on the
lane map; random closures in free play (`closuresPer10km`, menu); `?scenario=closure`;
`node tools/closure.js`.

## F-24 · Rain
- status: specced
- priority: P2
- value: 4
- effort: L
- risk: Med
- pillar: Authentic
- milestone: M2
- plan: docs/specs/F-24-rain.md

Wet road reflections, spray behind trucks, wipers, and AI that keeps bigger gaps.

Slice 1 specced 2026-11-26 ([docs/specs/F-24-rain.md](docs/specs/F-24-rain.md)): a Rain toggle;
the AI leaves longer gaps, drives a few km/h slower and brakes softer, spread by persona and some
not at all; spray behind lorries blinds the AI (it backs off or overtakes within 1–2 s) and your
view through the camera; wipers and a wet sky. Matrix signs stay traffic-driven. Reflections are
slice 2.

Later: "bij nat wegdek" signs (a 90 with that sub-sign, seen on Dutch roads) belong on sharper
bends, which the road doesn't have yet (curves, M3); some drivers would slow for them, some not.

## F-25 · Spitsstrook (rush-hour lane)
- status: idea
- priority: P2
- value: 3
- effort: M
- risk: Low
- pillar: Authentic
- milestone: M2

A hard shoulder that opens at rush hour under the matrix signs.

## F-26 · Roadworks
- status: idea
- priority: P3
- value: 3
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M2

Yellow lines, narrowed lanes and a 90 km/h limit.

## F-28 · Night mood
- status: built
- priority: P1
- value: 4
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M1

Dark sky, cars read as their lights, unlit motorway with occasional sodium-lit stretches whose light
sweeps over the car lamp by lamp, white lines that light up in your own beam (retroreflective).
Done, needs playtest.

## F-30 · Road network graph
- status: idea
- priority: P2
- value: 5
- effort: XL
- risk: High
- pillar: —
- milestone: M3

Replace the single endless road with connected segments (architecture work). Split needed. Street
lighting then follows the map (junctions, specific sections) instead of random 1.6 km stretches.

## F-31 · Player takes an exit onto an N-road
- status: idea
- priority: P2
- value: 4
- effort: L
- risk: Med
- pillar: Authentic
- milestone: M3

80 km/h, single carriageway, oncoming traffic.

## F-32 · Overhead lane map + time-space diagram
- status: built
- priority: P1
- value: 4
- effort: S
- risk: Low
- pillar: Readable
- milestone: M2

U, `, .` zoom 120-2000 m: the road straightened, cars coloured by speed, brake/indicator marks,
archetype letters; the diagram shows your lane's trajectories over 80 s so waves are visible. Done.

## F-33 · Navigation
- status: idea
- priority: P2
- value: 4
- effort: M
- risk: Low
- pillar: Authentic
- milestone: M3

Voice and HUD arrow, with the blue signs matching the route.

## F-34 · Trip mode
- status: idea
- priority: P3
- value: 3
- effort: S
- risk: Low
- pillar: Calm
- milestone: M3

Choose a destination, drive there, see a summary at the end (no score).

## F-35 · Persona viewer (the cast)
- status: built
- priority: P1
- value: 4
- effort: M
- risk: Low
- pillar: Readable
- milestone: M1
- plan: docs/F-35-persona-viewer.md

A turntable rig with a road under the car — pick a persona, flip through the cars it inhabits,
click the headway line to see the gap, click a behaviour line to watch it play on the rig.

Done, 3 slices; the design is in [docs/F-35-persona-viewer.md](docs/F-35-persona-viewer.md).
Everything derived from `ARCHETYPES`, so a new persona appears by itself. Slice 3: 55 seeded demos,
`npm run personas` checks every tell and expectation headless. Studio pass: world hidden, black
background, road + cars only, rig sides mirrored to the game's `lat`, and a Back button on the
sheet.

## F-36 · Wheels that turn
- status: idea
- priority: P3
- value: 3
- effort: M
- risk: Med
- pillar: Quality
- milestone: M1

A car build variant with real wheel groups so tyres and rims rotate with speed. Today `wheel()`
merges the tyre into `trim` and the rim into `chrome`, so nothing on any car can spin.

Open. Found while speccing F-35 (a turntable is where a motionless wheel actually shows). The
draw-call worry it was parked on is out of date since F-54: traffic is one instanced batch per body
shape, so spinning wheels in traffic are one or two extra batches (tyre, rim) with four instances
per car, not 8 more meshes per car; `npm run perf` keeps the 1,500 budget honest. The player's car
and the cast viewer still use the per-mesh path, so they are the cheap place to start.

## F-37 · Proefrit (playtest loop)
- status: building
- priority: P0
- value: 5
- effort: L
- risk: Med
- pillar: Readable
- milestone: M1
- plan: docs/F-37-proefrit.md

One drive journal that records your drives and a bot's drives the same way, moment detectors that
name what happened from the driver's seat, a bot that drives the real player car with only what a
player can see, and a report Claude can read. Your marks calibrate the bot. The whole design, the
slices and the open probes are in [docs/F-37-proefrit.md](docs/F-37-proefrit.md).

Slice 1 done: journal (`journal.js`, 2 Hz columns), moment detectors from the seat (`moments.js`,
thresholds in `CONFIG.moments`), F8 marks + notes + end-of-drive questions, `POST /__journal` to
`playtests/human/`, `tools/report.js`, detector cases + real-sim stage test (`npm run moments`,
`tools/momentstage.js`). Needs your 20-minute drive to calibrate.

Slice 2 built (bot driver + runner, [docs/F-37-slice-2.md](docs/F-37-slice-2.md)): see "Built" under
slice 2 in the design doc.

Slice 3 built (frames, reproduction, occlusion, `dwars`, [docs/specs/F-37-slice-3.md](docs/specs/F-37-slice-3.md)):
see "Built" under slice 3. A run with `frames` gets two stills (bonnet + lane map) at its three
worst and three best moments, each with a one-line command that reproduces it, and every still is
hash-checked against a fresh headless run of that moment. Trucks now occlude in the percept, and
`driver=dwars` is the bad-player probe. Slice 4 (`compare.js`, `jij`) next: it waits for at least
3 of your journals.

Q-6 (2026-11-25): the stage test's open probes are fixed. A lane closure is a journal row of its own
(type `obstacle`), so a car braking for the cones or leaving the closed lane has a visible reason;
`pointless-lane`'s leader window is `CONFIG.moments.pointlessLookM`; brake lights of nearby cars are
on/off events and the 2 Hz column is latched from them (journal v2). `tools/momentstage.js` keeps
three probes: closure, far leader, short tap. Left open: whether a slow leader 130-200 m ahead
should count as pointless -- your marks decide.

## F-38 · A signal means the car will move
- status: built
- priority: P0
- value: 5
- effort: M
- risk: Med
- pillar: Readable
- milestone: M1
- plan: docs/specs/F-38-signal-commitment.md

AI drivers line up first and signal only into a gap that is there or opening, hold briefly, and
don't re-signal in a loop.

Done, `slot` and normal driving looked right to the user. A driver signals only into a gap that is
safe now or will be within the signal time, lines up first (eases off or speeds up a little, never a
brake light), holds `signalHoldS` instead of a fixed 8 s, and pauses before signalling again.
Signal-and-wait kept only for closures. `npm run signals`, bot day / night per 10 min: withdrawn
after ≥ 6 s 13.3 / 7.9 → 1.3 / 1.6, `empty-signal` 4.7 / 3.4 → 0.1 / 0.4, signal → move p90 5.2 →
4.7 / 5.2 s, 0 `unannounced`. Re-signal loops down to ~20% with random closures off, ~35–50% with
them (the closure path). Step 3 (coop drivers open a bigger gap) skipped: no trigger fired.
`?scenario=slot`.

## F-39 · Public release as Flow Driving
- status: built
- priority: P0
- value: 3
- effort: M
- risk: Low
- pillar: —
- milestone: M1
- plan: docs/specs/F-39-public-release.md

MIT, a dev flag that hides the playtest tools from players, radio from your own stream URL,
journals kept local, a front-door README and CONTRIBUTING, CI checks and a GitHub Pages build.

Done. `src/dev.js` (dev server or `?dev`) gates F8 marks, notes, *End drive…*, the dev overlay and
`?scenario=`; the hosted build is the plain game. Radio plays a stream URL you paste (`radioUrl`, Y;
NPO stations gone, superseding F-12's stations) and refuses `http://` on the https page. Human
journals gitignored and local. README front door with a cockpit shot, CONTRIBUTING. `base: './'`,
`checks` + `pages` workflows; browser tools find Chrome or Edge or take `BROWSER_PATH`.

## F-40 · Verdozing
- status: built
- priority: P2
- value: 3
- effort: M
- risk: Low
- pillar: Authentic
- milestone: M2

Effort was scored S–M. Distribution centres along the motorway. Estates of 1–3 grey or blue boxes every 4–8 km, with dock
doors, trailers waiting, a gatehouse, a car park, young trees along the service road and a logo band
with made-up names; docks, logo and office corner lit at night.

Done: `estate()` / `distributionCentre()` in `scenery.js`. One estate in 80% of 5 km blocks, 65% on
your side of the road; boxes 150–350 m long, 70–140 m deep, 12–15 m high, docks facing the road on a
building line 100–160 m out (clear of overpass embankments, on the fields). Sandwich-panel cladding
(`claddingTexture`), coping band in the company colour, ten invented companies (`logoTexture`), logo
on the long side and the gable you drive towards. Night: white dock lamps and light pools, office
windows partly lit, letters lit. Trees and farms keep off the grounds (`inEstate`). Each box is
built whole by the chunk holding its centre, so it rises out of the haze ~2.8 km ahead. Slice 2 of
F-20 done: when a 5 km block has a junction, the estate sits on the on-ramp side (car park 150-400 m
past the ramp top, building line out beyond the ramp road) with a straight service road from the
crossing road, and that ramp brings 30% trucks.

## F-41 · Klaverblad (cloverleaf) junction
- status: idea
- priority: P3
- value: 4
- effort: XL
- risk: High
- pillar: Authentic
- milestone: M3

A cloverleaf junction between two motorways, including weaving traffic. Split needed.

Was numbered F-32 in the old backlog, which clashed with the lane map; renumbered when the backlog
moved to the vibeview format.

## F-42 · Suburbs and city
- status: parked
- milestone: Horizon

Cyclists, right-turn blind-spot checks, roundabouts, voorrang (priority) rules. This was the
original spark for the game and stays on the horizon. (From the old parking lot.)

## F-43 · Trajectcontrole and fines
- status: parked

Average-speed cameras and fines. Authentic, but they push the focus toward speed. Revisit later.
(From the old parking lot.)

## F-44 · Replay / rewind
- status: parked

Replay / rewind a situation to watch it again from above. (From the old parking lot.)

## F-45 · Archetypes based on nationality
- status: dropped

E.g. foreign trucks. Too close to stereotyping real groups; we stick to cars and driving habits.
(From the old parking lot.)

Reopened narrowly 2026-11-27 (F-53) for one habit only: the middle-lane cruiser has a foreign plate
more often than other cars, because drivers carry their home country's lane habits across the
border. It is never named for a country, not every one is foreign, and character traits stay out.

## F-46 · AI flashes its lights at you
- status: parked

AI flashes its lights at you when you drive at night without lights (follows F-01). The leasebak
flashing you when you block the left lane belongs here too. (From the old parking lot.)

## F-47 · Driving-style feedback through other drivers
- status: parked

Gentle "driving style" feedback through other drivers' reactions, such as being flashed at for
hogging a lane, instead of a score. (From the old parking lot.)

## F-48 · Toekomstflitsen: the promised now
- status: building
- priority: P3
- effort: XL
- plan: docs/specs/F-48-toekomstflitsen.md

A separate mode on the same engine: the same A12 and the same drivers, but the world and car shapes
as people in 1990 imagined "now" would look, in the spirit of Robbert and Rudolf Das
(*Toekomstflitsen*, *Wegen naar de toekomst*): terraced glass buildings instead of grey boxes,
wedge-shaped guesses at today's cars. A switch between the now we got and the now we were promised;
the over-optimism is the charm. Inside this mode pillar 1 means true to that vision, while the
traffic stays real Dutch drivers. Possible because the sim is kept apart from rendering and cars and
scenery are procedural. Our own designs in that spirit, never copies of the books' illustrations.
Large (new car bodies and a scenery set); waits until the real world is done. (From the old parking
lot.)

Specced 2026-11-24 in four slices, still waiting for M2/M3: live toggle (F9) with a median guideway
spine over the left lane and automated cabin platoons, a brochure palette; wedge bodies that keep
every archetype tell; glass terraced buildings, freight-tube portals at overpasses and 1990-style
gantries with unchanged sign content; electric sounds and a "Radio Toekomst". Every future piece
stands in for a present-day one; sky, sea and rail wait for F-49, F-50 and F-51.

Decided 2026-11-25: slice 1 (toggle, spine, palette) is built early as a test of the covered left
lane; slices 2 to 4 still wait for M2/M3.

Built 2026-11-25, slice 1: `F9` (and a World row in the menu) swaps the A12 for the promised one
under a short white flash, without touching the sim. The spine rises out of the median barrier on
Y-pillars every 40 m, with an ochre deck and a red running surface over the left lane on both
sides, a pale blue rail, cool-white lamps under the deck edge and a 1.6 m cabin platoon stream on
a track along the deck's outer edge — on the deck top nothing is visible from the road, so they
ride the edge; the deck hangs at 7.8 m to clear the matrix faces and gantry beams untouched. The
spine stops 150 m either side of every bridge and viaduct with an end block. Palette: brochure
blue, greener grass, cooler street lamps at night. New `npm run worldtest` guards the sim's import
graph and the 4.6 m clearance rule. Waiting for the drive under the deck before slices 2 to 4.

2026-11-25, from the drawings: the cross-section is being re-specced (queued as Q-12, the user
specs it). The 4.20 m is the junction clearance we already have, the deck is 2 m above the road and
the pods are ordinary cars on a centre rail — so the built 7.8 m deck, its junction gaps and its
edge-track cabins are interim until that spec lands.

Driven and re-specced 2026-11-26: slice 1 missed the drawing (deck over the matrix signs, ANWB
boards clipping through it, end blocks at junctions, cabins riding like a train). Slice 1b in the
plan rebuilds it as drawn: bridges at a real 4.8 m in both worlds, a grey concrete track on
Y-pillars over the median and left lanes with red lanes and a charging strip, 2.6 m van clearance
at bridges and above lorry height between them with gentle 5000 m curves, convoys of 1–5 cars at
150 km/h, banked splits over the carriageway at some junctions, portal gantries and no matrix face
over the left lane. No track on 2-lane roads; the sim stays untouched. Builds after F-54.

## F-49 · Rail line beside the motorway
- status: parked
- pillar: Authentic

A double-track railway running beside the motorway on some stretches (like the A12 near Utrecht
and the A2), with an occasional intercity or freight train passing. Present-day first; it is also
the twin that F-48's future rail needs.

Also where rail and motorway cross (added 2026-11-26): a rail bridge over the motorway, or the
motorway over the tracks on one of the junction-style bridges, with a train passing overhead or
under you now and then. A crossing is a cheaper first slice than a stretch alongside: one bridge
and a train on a short straight, no long track beside the road.

## F-50 · Planes on approach
- status: parked
- pillar: Authentic

Aircraft low overhead on a stretch near an airport (like the A4 along Schiphol), on approach or
climbing out, with the sound. Present-day first; it is also the twin that F-48's future aircraft
need.

## F-51 · Harbour stretch with ships
- status: parked
- pillar: Authentic

A stretch along water or a port (like the A15 through the Rotterdam port, or a dyke road with the
IJsselmeer beside it) with ships passing and cranes on the skyline. Present-day first; it is also
the twin that F-48's future ships and ports need.

## F-52 · Lane changes look like a slide
- status: built
- priority: P2
- value: 3
- effort: S
- risk: Low
- pillar: Authentic
- milestone: M2

A car crossing a lane line was drawn with its nose up to ~50° into the new lane: the view turned
it by `atan2(latRate, max(v, 2))`, and the zipper move crosses 3.5 m in 2.2 s while the forward
speed was floored at 2 m/s. So a merger pulling away from a standstill — or any slow lane change —
slid sideways instead of steering. Seen in a drive report on the on-ramp scenario (2026-11-24);
ordinary lane changes sit at 2° median, 6–16° at p99, so the cap only touches the pathological
frames. Done: `slipAngle` in `util.js` caps the drawn slip at 8.6° and both views (`trafficView`,
`castStage`) use it. Render only; the traffic numbers do not move.

## F-53 · Driver rules: what a sane driver does
- status: specced
- priority: P1
- value: 5
- effort: M
- risk: Med
- pillar: Readable
- plan: docs/specs/F-53-driver-rules.md

Write down, in plain language first, the general rules every driver here follows, before any code.
Four sources: how you drive yourself, what you see in traffic, what is known about driving
behaviour, and general human limits (reaction time, what you can see, attention, no driving blind
behind spray for more than a moment). The personas sit on top as deviations from those rules, not
as separate models. Then check the current AI against the rules: what conforms, what needs tuning,
and which rules the headless tools can check. Raised 2026-11-26 while speccing rain.

Specced 2026-11-27 ([docs/specs/F-53-driver-rules.md](docs/specs/F-53-driver-rules.md)): rules
R1–R30 from the Q-13 talk, each with its source, how common it is and a check; free, following and
jam regimes and an attention state; personas as deviations, with two new ones, the Cruiser (your own
style, which `jij` starts from) and the middle-lane cruiser. The audit of the AI against the rules
is Q-20; its slices come back to you to pick.

## F-54 · Draw calls: one mesh per vehicle
- status: built
- priority: P0
- value: 4
- effort: M
- risk: Med
- plan: docs/specs/F-54-draw-calls.md

Busy traffic runs at ~30 fps (your drive, 2026-11-26). Measured with `npm run perf`: the sim
costs 1 ms, shadows, bloom, pixels and the promised world hardly matter; each vehicle is ~10
meshes drawn in the main view and three mirrors, ~13 draw calls each, so 240 vehicles make 3,710
calls and a 25 ms frame. Instance the vehicles (one draw call per variant and material slot),
let mirrors skip far cars, and keep a draw-call budget in `npm run perf`. Comes before the F-48
guideway and helps rain (F-24).

Built 2026-11-26: a vehicle is now a pose plus a slot in two or three `InstancedMesh` batches (one
per body shape and one per lamp signature, since the lamps are the only geometry that differs
between two cars of the same shape), with the paint colour as `instanceColor` and the brake and
indicator lamps as a per-instance `aGlow` attribute. Each batch also has a mirror set that holds
only the cars within 260 m behind, so a mirror no longer draws the whole motorway, and `npm run
perf` now splits main and mirror draw calls and fails at density 25 over 1,500 a frame. The sim
output is untouched (`simtest`, `personas`, `bottest` unchanged). `npm run perf`, headless Edge at
1600×900 in the cockpit view — by 2026-11 the machine gave ±10 fps between runs:

| Setting | before | after |
|---|---|---|
| empty d2 | 128 fps, 1,050 calls | 126 fps, 806 calls |
| base d10 | 62 fps, 2,510 calls | 83–87 fps, 1,027 calls |
| dense d25 | 38–43 fps, 3,710 calls | 88.6 fps, 1,139 calls (main 514, mirrors 625) |
| dense d25 promised | 38 fps | 86 fps, 1,337 calls |
| dense d25 no shadows | 34–36 fps | 99.8 fps |
| dense d25 no bloom / mirrorRes 0.5 / px 1.0 | – / – / 41 fps | 94.2 / 91.8 / 89.8 fps |

The d25 goal (≤1,500 calls, ≥60 fps) is met; the density-10 target of 90 fps is not (83–87), and
the frame is no longer vehicle-draw-call bound, so it was left there. Same look: day stills of the
same replay differ in 0.09–0.11% of pixels (edge noise on moving cars), night in ~2% (a different
trailer kind on one truck, which the view's rng never kept stable between runs). The cast viewer
keeps the old per-mesh path; the player's car is still an ordinary visual.

## F-55 · Electric lane at ground level on 2-lane roads
- status: idea
- priority: P3
- value: 2
- effort: L
- risk: Med
- pillar: Authentic

From the Toekomstflitsen pictures: a ground-level electric lane on the normal road, with a
yellow line between it and the remaining lanes. Where the guideway can't go (2-lane roads), this
could be the promised world's transition. Takes a lane from today's traffic, so it changes the
sim. No reference picture at hand yet (2026-11-26).

## F-56 · Passenger: ride along, and walk around in the back
- status: idea
- priority: P2
- value: 4
- effort: L
- risk: Med
- pillar: Calm

Ride in a car you don't drive: watch the road go by from the passenger seat, or, in a camper or
van, get up and walk around in the back while the motorway passes. From the user's own life: years
as a passenger, and holidays walking around in the back of a pre-camper van (2026-11-26). It is the
calmest way to be part of traffic, and the most honest test of Readable: sitting next to a driver
is where you feel whether they drive like a person.

Slices, cheapest first:
1. **Ride along in your own car (S).** The Proefrit bot (`src/botDriver.js`) already drives the
   player car with only what a player can see. Passenger mode hands the wheel to it (a persona of
   your choice) and moves the camera to the passenger seat of the cockpit that already exists; you
   can look around. No new geometry, and the sim still centres on the player car.
2. **Hop into an AI car (M).** Pick a car in traffic and ride in it. The sim's window
   (`rangeAhead` 1500 / `rangeBehind` 900 m) has to follow the car you're in; AI cars are instanced
   bodies with no interior (F-54), so the car you're in swaps to a per-mesh build with a simple
   interior, like the player's.
3. **Walk in the back of a camper or van (L).** A camper body with a walkable interior (floor,
   bench, side windows, rear window), first-person walking inside the moving car's frame, sway with
   the car's acceleration and lane changes. Needs a camper/van vehicle type in traffic first.

Fits with F-53 (driver rules): riding next to a persona is where its rules show.

## F-57 · Onlooker view: see traffic from outside
- status: idea
- priority: P2
- value: 4
- effort: M
- risk: Low
- pillar: Readable

Leave the car and look at traffic from outside: from a helicopter, from a viaduct, from the verge.
Seeing a situation build from above is the Readable pillar made literal, and a calm way to just
watch the road breathe.

Slices:
1. **Free camera (S).** Detach the camera, fly it with mouse and keys, the game keeps running (the
   player car on cruise control or driven by the bot, as in F-56 slice 1). The sim only runs
   1500 m ahead and 900 m behind the player car, so the camera stays on a leash inside that window,
   or slice 2 moves the window with it.
2. **Structure (M).** Named places the camera can go and move between, instead of only free flight:
   *helicopter* (follows a car or a stretch at 150–300 m, slow orbit), *viaduct* (stand on a junction
   bridge, which exist every 3–6 km, and watch both carriageways pass under you), *verge* (beside
   the road at eye height, traffic passing), *follow* (behind any car you click). A smooth move
   between them, never a cut that makes you lose the picture.
3. **Later:** pairs with the overhead lane map (F-32) and replay (F-44), and with F-56 slice 2
   (from following a car, step into it).

## F-58 · River bridge with boats
- status: idea
- priority: P3
- value: 3
- effort: M
- risk: Low
- pillar: Authentic

A motorway bridge over a wide river or canal, with barges and the odd pleasure boat passing under
it: the long climb onto the bridge, the view opening up left and right, the drop back to polder
level. Like the A12 over the IJssel or the A16 over the Hollands Diep. Smaller than F-51 (a
stretch along a harbour): one crossing, water to the horizon and a few boats on simple paths.
The sim doesn't change, though a bridge is a natural place for wind warnings later. Also a twin
for F-48: what a promised-now river crossing and its ships would look like. Added 2026-11-26.

## F-59 · Buses and exceptional transport
- status: idea
- priority: P2
- value: 4
- effort: M
- risk: Med
- pillar: Authentic

More kinds of vehicle in traffic, from today's set (cars, vans, caravans, rigid trucks and
articulated trucks):

- **Coaches and buses (S–M).** Touring coaches and the odd regional bus, kept to the bus limit,
  mostly in the right lane, with their own long, tall silhouette and a readable "won't overtake
  much" behaviour. A new body variant plus a persona-style speed and lane habit.
- **Exceptional transport (M–L).** A slow, wide or long load (a wind-turbine blade, a prefab
  section, a dredge part) taking more than its own lane, with escort vehicles in front and behind
  carrying the signs, and traffic having to deal with it: slowing, waiting, overtaking with care.
  Changes the sim (a vehicle that blocks part of a second lane), so it is a Readable test too:
  can you see it coming and read what the escort wants? Rare: once in a long drive.

Both are F-48 tie-ins: the promised now had its own buses and its own giant transports. Added
2026-11-26.

## F-60 · Other futures: more worlds behind the F9 switch
- status: parked
- priority: P3
- effort: XL
- risk: High
- pillar: —

Maybe later, a wild direction (2026-11-26). The same A12, the same drivers and the same sim, but more
"futures" to switch to beside F-48's promised now: only what you see from the road changes (the
roadside, buildings, sky, gantries, car shapes, sounds). Each is one theme with an equivalent for
each piece of today's road, the way F-48 maps every future piece to a present-day one.

Directions, all as genres in our own designs (no names, logos, characters, ships or machines from
existing films or series):

- **Machine war:** a grim future where the machines won; ruined overpasses, searchlights, hunter
  craft over the horizon, the traffic carrying on regardless.
- **Eldritch cyber horror:** neon and screens over something vast and wrong; gantries that watch
  you, a sky that doesn't behave, signs that almost read.
- **Space-age frontier:** the optimistic exploration future; clean white arcs, a spaceport on the
  skyline, launches in the distance.
- More: **solarpunk** (green, solar, cycling lanes on the deck), **drowned Netherlands** (the
  dykes raised as high as the road, the sea above the polder beside you), **atomic fifties**
  (chrome, fins, a reactor dome where the power station was), **overgrown** (nature taking the
  road back, the traffic still there).

Built on F-48's toggle: once that has its slices in, a world is a theme set (palette, scenery
pieces, car bodies that keep every archetype tell, sounds) behind the same switch. Pillar 1 doesn't
apply inside these worlds, Readable and Calm still do: the traffic stays real Dutch drivers. Not
before M3 and F-48 are done; pick one to spike first.

## F-61 · Far traffic: jams born kilometres ahead
- status: idea
- priority: P1
- value: 5
- effort: L
- risk: High
- pillar: Readable
- milestone: M2

A jam you drive into was usually started 5–15 minutes earlier, kilometres further on, by something
that has long cleared: the wave travels back at 15–20 km/h and you see nothing at its cause. Our
detailed traffic only exists 1,500 m ahead and 900 m behind you, so that cannot happen yet.

A cheap far layer: traffic as a fluid over 30–100 km per carriageway (cell transmission model,
200–500 m cells holding density and speed), with on-ramps, closures and the capacity drop as causes,
and bottlenecks near capacity giving off wide moving jams. The near window spawns at its edges from
the far layer's cells, so a wave crosses into view and the existing AI carries it to you. No jam
frequency knob: jams come only from density, junctions and closures; being in a jam all the time in
busy traffic is correct. Closures are the cause you sometimes pass; ghost jams from a merge near
capacity are fine too. The far layer is made for networks (merges and diverges are nodes), so it
carries over to F-30.

Slices: (1) corridor model, headless, with a position-over-time plot; (2) coupling at the window
edges; (3) matrix signs (F-23) and the radio driven by it; (4) the jam explainer, a dev view of the
plot with each wave tagged by where and when it started ("on-ramp km 14, 17:32" or "closure km 22").
Runs on the numbers F-22's calibration (Q-17) measures, so the two layers agree and waves don't
stall at the seam. Queued as a spec (Q-18), after Q-17.

## F-62 · Speedometer reads like a real one
- status: idea
- priority: P3
- value: 2
- effort: S
- risk: Low
- pillar: Authentic

Real speedometers read 3–5% high (never under), so drivers set the cruise on what the dial shows:
109 on the dial is ~104 true. Our HUD shows true speed. From the F-53 talk (rule R2), 2026-11-27.
The cruise set speed and the journals would need to agree on which one they record.
