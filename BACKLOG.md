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
- status: building
- priority: P1
- value: 5
- effort: L
- risk: High
- pillar: Readable
- milestone: M2
- plan: docs/specs/F-20-slice-3-making-room.md

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

## F-21 · Exits (AI only)
- status: idea
- priority: P1
- value: 4
- effort: M
- risk: Med
- pillar: Authentic
- milestone: M2

Cars move right early and leave the motorway.

## F-22 · Bottlenecks and jams
- status: building
- priority: P1
- value: 5
- effort: M
- risk: Med
- pillar: Readable
- milestone: M2

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

Still open: on-ramps.

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
- status: idea
- priority: P2
- value: 4
- effort: L
- risk: Med
- pillar: Authentic
- milestone: M2

Wet road reflections, spray behind trucks, wipers, and AI that keeps bigger gaps.

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
- effort: M
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

Open. Cost is draw calls: 4 wheels × 2 materials per car roughly doubles the ~8 slots a car has
now. Plan: opt-in `wheels: true` build used by the F-35 stage and the player's own car first,
measure with the fps counter, and only then consider close traffic. Found while speccing F-35 (a
turntable is where a motionless wheel actually shows).

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
slice 2 in the design doc. Slices 3–4 (frames, compare/`jij`) next.

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

## F-46 · AI flashes its lights at you
- status: parked

AI flashes its lights at you when you drive at night without lights (follows F-01). The leasebak
flashing you when you block the left lane belongs here too. (From the old parking lot.)

## F-47 · Driving-style feedback through other drivers
- status: parked

Gentle "driving style" feedback through other drivers' reactions, such as being flashed at for
hogging a lane, instead of a score. (From the old parking lot.)

## F-48 · Toekomstflitsen: the promised now
- status: specced
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

## F-49 · Rail line beside the motorway
- status: parked
- pillar: Authentic

A double-track railway running beside the motorway on some stretches (like the A12 near Utrecht
and the A2), with an occasional intercity or freight train passing. Present-day first; it is also
the twin that F-48's future rail needs.

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
