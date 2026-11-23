# Flow Driving backlog

## Vision

**An authentic Dutch driving simulator where the game is being part of traffic.**

## Design pillars

The pillars decide arguments. When two good ideas conflict, the pillar order says which one wins.

1. **Authentic.** Dutch rules, roads, signs and driver habits. When in doubt, do what really happens
   on the A12 at 17:30, not what is convenient or "gamey".
2. **Readable traffic.** You can see situations build up and predict how they will play out.
   Drivers show what they intend through their position, speed and signals, just as good real
   drivers do. Authentic chaos that you cannot read loses to this pillar.
3. **Calm.** Nothing rewards speed, reflexes or risk. Pressure comes from the flow, never from
   a timer or a score.

Visual quality (car models, lighting) is a *quality bar*, not a pillar. It matters, but it never
justifies a feature on its own.

## How to score

| Field | Scale |
|---|---|
| **Value** | 1–5. How much it strengthens a pillar or the core "drive in traffic" loop. |
| **Effort** | S (an evening), M (a weekend), L (a week or more), XL (must be split first). |
| **Risk** | Low / Med / High. How unsure we are that it can be done well, or that it will be fun. |
| **Priority** | **P0** next up · **P1** this milestone · **P2** later · **P3** someday |

Do high-value, low-effort items first. Test high-risk items with a cheap *spike* (a throwaway
prototype) before committing to them.

## Milestones

- **M1: Readable flow.** Remove the annoyances. Make the AI's intent readable, so that situations
  like the elephant race with a speeder behind play out believably and repeatably. Drivers get archetypes you can recognise
  at a glance. *Done when a 20-minute drive produces at least one "that's exactly it"
  moment without any cars that feel wrong.*
- **M2: The road breathes.** Traffic enters and leaves the motorway through on-ramps and exits.
  Bottlenecks create jams that form and clear again, matrix signs react, and it rains.
- **M3: Going somewhere.** You drive a real route from A to B: take the exit, cross a
  klaverblad (cloverleaf) junction, follow navigation and continue on an 80 km/h N-road.
- **Horizon: Town.** Urban and suburban driving: cyclists, right-turn checks, right of way.
  This is a separate game-sized scope and is parked until M3 has been delivered.

## Backlog

### M1: Readable flow

| ID | Feature | Pillar | Value | Effort | Risk | Priority | Status |
|---|---|---|---|---|---|---|---|
| F-01 | Headlight toggle works at night (lights are currently forced on) | Authentic | 3 | S | Low | P0 | done |
| F-02 | Fix bloom on nearby headlights: cap the glow from close cars and use proper dipped-beam aim | Authentic | 4 | S | Low | P0 | done, needs playtest |
| F-03 | Horn (H). AI reacts mildly: a startled tap of the brakes, or abandoning a lane change into you | Authentic | 2 | S | Low | P1 | done, on Space (H is help): two-tone horn; a car changing lanes into you abandons it, the car ahead taps its brakes and (in a left lane) moves over, a car alongside flinches and holds its lane |
| F-04 | **Scenario harness**: set up a seeded, repeatable situation such as "2 lanes, truck ahead, speeder behind" from a menu or URL | Readable | 5 | M | Low | P0 | done: `?scenario=` + `npm run scenario` |
| F-05 | **AI intent debug overlay**: shows each car's desired lane, its target gap and why it won't merge | Readable | 4 | S | Low | P0 | done (O key, dev mode) |
| F-17 | **AR speed overlay**: speed of other cars (relative or absolute) over the windscreen and in the mirrors, warm colours when closing in, decluttered. A small quality-of-life option, off by default | Readable | 5 | S | Low | P0 | done, playtested; labels made smaller |
| F-06 | AI anticipation: plans an overtake *before* closing in on a slower vehicle, instead of braking first and then swerving | Readable | 5 | M | Med | P0 | done: per-driver `antic` skill (archetypes will set it), menu knob |
| F-18 | **Cut-in overreaction**: IDM brakes up to −9 m/s² when a slightly slower car merges in ~20 m ahead. Real drivers drop back gently. Fix: blend IDM with Treiber's constant-acceleration heuristic (the ACC model) | Authentic | 5 | S | Low | P0 | done: `coolness` 0.99 in config.js |
| F-07 | AI telegraphing: drifts toward the lane line, signals for 2–3 s and makes small speed adjustments before changing lanes | Readable | 5 | M | Med | P1 | done: intent phase (drift, closing up, mirror-check delay), gap seeking while signalling; style per archetype; `telegraph` knob |
| F-08 | Speeders read the road ahead: they lift off early when a car in front signals left, rather than braking late | Readable | 4 | M | Med | P1 | mostly covered by F-06 + F-07: anticipating drivers now also react to a car edging toward their lane. Revisit after playtest |
| F-09 | Overtake follow-through: cars return right promptly after passing, and drivers queued behind react to it | Authentic | 4 | S | Low | P1 | done: remembers who it overtakes, heads back right once clear. F-35 found and fixed a bug that wiped that memory on the first step of the move |
| F-10 | Car models spike: compare improved procedural cars with imported CC0 glTF models on one test car | Quality | 3 | M | Med | P3 | deferred: generic but convincing is fine |
| F-11 | Car models rollout: about 8 distinct vehicles, each with its own light layout (based on the F-10 outcome) | Quality | 3 | L | Med | P3 | deferred |
| F-36 | **Wheels that turn**: a car build variant with real wheel groups so tyres and rims rotate with speed. Today `wheel()` merges the tyre into `trim` and the rim into `chrome`, so nothing on any car can spin | Quality | 3 | M | Med | P3 | open. Cost is draw calls: 4 wheels × 2 materials per car roughly doubles the ~8 slots a car has now. Plan: opt-in `wheels: true` build used by the F-35 stage and the player's own car first, measure with the fps counter, and only then consider close traffic. Found while speccing F-35 (a turntable is where a motionless wheel actually shows) |
| F-14 | **Driver archetypes**: a persona decides both the look and the behaviour (speed, headway, politeness, lane habits). Tendencies, not guarantees, roughly 70/30 | Readable | 5 | M | Med | P1 | done: Leasebak, Patser, Pensioner, Grijze sok, Family, White van, EV smoothie. Vans can be archetypes too. `?scenario=cast` shows them all |
| F-15 | Archetype visual tells within the box style: colour palette, stance, tinted windows, wheels, light signature (LED strip or yellow halogen), readable in the mirror and at night | Readable | 4 | M | Med | P1 | slice 1 done: palette, lowered + big rims, tint, and a lamp shape per archetype: leasebak LED strip + full-width rear bar, patser angel-eye rings + smoked tails, pensioner round warm lamps, grijze sok twin projectors + L-shaped tails, family tall upright tails, EV one thin light line front and back, white van roof rack + ladder + company stripe |
| F-16 | Fix the side stripes that read as glitching wheels | Quality | 2 | S | Low | P1 | done: real wheel arches cut into the body |
| F-28 | **Night mood**: dark sky, cars read as their lights, unlit motorway with occasional sodium-lit stretches whose light sweeps over the car lamp by lamp, white lines that light up in your own beam (retroreflective) | Authentic | 4 | S | Low | P1 | done, needs playtest |
| F-37 | **Proefrit (playtest loop)**: one drive journal that records your drives and a bot's drives the same way, moment detectors that name what happened from the driver's seat, a bot that drives the real player car with only what a player can see, and a report Claude can read. Your marks calibrate the bot | Readable | 5 | L | Med | P0 | slice 1 done: journal (`journal.js`, 2 Hz columns), moment detectors from the seat (`moments.js`, thresholds in `CONFIG.moments`), F8 marks + notes + end-of-drive questions, `POST /__journal` to `playtests/human/`, `tools/report.js`, detector cases + real-sim stage test (`npm run moments`, `tools/momentstage.js`). Needs your 20-minute drive to calibrate. Slices 2–4 (bot, frames, compare/`jij`) next; see **Proefrit (F-37)** at the end |
| F-38 | **A signal means the car will move**: AI drivers line up first and signal only into a gap that is there or opening, hold briefly, and don't re-signal in a loop | Readable | 5 | M | Med | P0 | done, `slot` and normal driving looked right to the user: [docs/specs/F-38-signal-commitment.md](docs/specs/F-38-signal-commitment.md). A driver signals only into a gap that is safe now or will be within the signal time, lines up first (eases off or speeds up a little, never a brake light), holds `signalHoldS` instead of a fixed 8 s, and pauses before signalling again. Signal-and-wait kept only for closures. `npm run signals`, bot day / night per 10 min: withdrawn after ≥ 6 s 13.3 / 7.9 → 1.3 / 1.6, `empty-signal` 4.7 / 3.4 → 0.1 / 0.4, signal → move p90 5.2 → 4.7 / 5.2 s, 0 `unannounced`. Re-signal loops down to ~20% with random closures off, ~35–50% with them (the closure path). Step 3 (coop drivers open a bigger gap) skipped: no trigger fired. `?scenario=slot` |
| F-39 | **Public release as Flow Driving**: MIT, a dev flag that hides the playtest tools from players, radio from your own stream URL, journals kept local, a front-door README and CONTRIBUTING, CI checks and a GitHub Pages build | — | 3 | M | Low | P0 | done: [docs/specs/F-39-public-release.md](docs/specs/F-39-public-release.md). `src/dev.js` (dev server or `?dev`) gates F8 marks, notes, *End drive…*, the dev overlay and `?scenario=`; the hosted build is the plain game. Radio plays a stream URL you paste (`radioUrl`, Y; NPO stations gone, superseding F-12's stations) and refuses `http://` on the https page. Human journals gitignored and local. README front door with a cockpit shot, CONTRIBUTING. `base: './'`, `checks` + `pages` workflows; browser tools find Chrome or Edge or take `BROWSER_PATH` |
| F-19 | **Dev overlay v2**: everything the expanded overlay shows now, plus predicted paths, target gaps and lane-change intent drawn in the world | Readable | 3 | M | Low | P2 | later; separate from the AR overlay |
| F-12 | Radio: a play-your-own-music folder, plus optional live Dutch radio streams | Authentic | 3 | S | Low | P1 | done: Y tunes off / my music / NPO Radio 1, 2, 3FM, Klassiek, 5. Folder picked in the menu each session (files stay local); streams can be turned off in the menu. Later: remember the folder, car-speaker EQ |
| F-13 | Shoulder check / look-around: hold a key to glance over the shoulder at the blind spot | Authentic | 3 | S | Low | P1 | done: Z / X tap = quick glance (~135° / 125°, head moves toward the window), hold = keep looking |
| F-35 | **Persona viewer (the cast)**: a turntable rig with a road under the car — pick a persona, flip through the cars it inhabits, click the headway line to see the gap, click a behaviour line to watch it play on the rig | Readable | 4 | M | Low | P1 | done, 3 slices; see **Persona viewer (F-35)** at the end. Everything derived from `ARCHETYPES`, so a new persona appears by itself. Slice 3: 55 seeded demos, `npm run personas` checks every tell and expectation headless. Studio pass: world hidden, black background, road + cars only, rig sides mirrored to the game's `lat`, and a Back button on the sheet |

### M2: The road breathes

| ID | Feature | Pillar | Value | Effort | Risk | Priority | Status |
|---|---|---|---|---|---|---|---|
| F-20 | On-ramps (AI only): merge lane, acceleration strip, AI zipper-merge and making room | Readable | 5 | L | High | P1 | slice 1 done (sim-only spike): [docs/specs/F-20-slice-1-onramps.md](docs/specs/F-20-slice-1-onramps.md). The acceleration strip is lane −1 on the hard shoulder (`addRamp`/`stripLogic`); cars appear at ~80 km/h, indicate left, merge when the gap is safe and the speed matches, zip in near the end, and stop at the end if nothing comes free. A merger gives way (invoegen) and lane 0 makes no room yet. `?scenario=onramp` / `onramp-busy`, `npm run onramp`. 12 runs at 6/min, 10 min: 0 collisions, merge position p50 142–287 m of 350, merge speed p50 7–70 km/h, follower braking under −2 in 6–31% of merges, lane 0 200 m before the strip end 17–44 km/h below a kilometre upstream (39–46 against 71–88), throughput 32–63 veh/min. Finding: the inherited merge code stalls 8–85 stop episodes per run (up to four minutes) because a car needs ~200 m to reach lane-0 speed and a stalled merger needs a 100–180 m gap; a longer strip or a wider last-gap window fixes most of it (`rampStripM` 700: 1 stop, merge p50 83 km/h). The per-persona `mergeKmh` does not produce the intended order — persona gap parameters dominate. Slice 2 (junctions with exit signs, ramp roads, ramps in free play) specced: [docs/specs/F-20-slice-2-visible-onramps.md](docs/specs/F-20-slice-2-visible-onramps.md); slice 3 (making room, jams) after |
| F-21 | Exits (AI only): cars move right early and leave the motorway | Authentic | 4 | M | Med | P1 | |
| F-22 | Bottlenecks and jams: density waves and lane drops that create a jam which forms and dissolves | Readable | 5 | M | Med | P1 | groundwork: `?scenario=wave` + `node tools/wave.js`. Finding: a hard brake does travel back as a wave, but it DAMPS (4.5 m/s² right behind, <1 m/s² 600 m back) because drivers react instantly and smoothly. Step 1 done: per-driver reaction delay (0.3-1.4 s by archetype, `reactionTime` knob + menu) with a crash reflex, and brake-light reading two cars ahead as the stabiliser. A mild brake (to 65) now grows further back (cars 400 m+ drop to ~48); at reactionTime 1.4 it becomes stop-and-go (braking ~4 m/s², max 5), 0 collisions. 1.6 is unsafe (emergency stops). Step 2 done via F-23: a lane closure is a bottleneck and a jam now forms by itself behind it (3->2 lanes at 9/km/lane: ~30 veh/min get through against ~50 on a plain 2-lane road, so it is harsher than reality, where a merge costs 10-30%). 0 collisions over 8 closure setups. Causes of the low throughput: stragglers zip in from standstill, trucks pull away at 0.45 m/s², queue discharge gaps. Still open: on-ramps |
| F-32 | **Overhead lane map + time-space diagram** (U, `, .` zoom 120-2000 m): the road straightened, cars coloured by speed, brake/indicator marks, archetype letters; the diagram shows your lane's trajectories over 80 s so waves are visible | Readable | 4 | S | Low | P1 | done |
| F-23 | Dynamic matrix signs: 70/50 limits ahead of jams, flashing lights, red X lane closures | Authentic | 4 | M | Low | P2 | done (`src/msi.js`): gantries every 500 m; queue warning (traffic past a gantry < 35 km/h -> flashing 50 there and one back, 70 before that, clears after 25 s); lane closures (arrow, red crosses, 70 over open lanes, 90 one gantry earlier, end sign); drivers obey with per-archetype margin; arrow-board truck + cones; HUD limit follows; red cross counted in trip stats; shown on the lane map; random closures in free play (`closuresPer10km`, menu); `?scenario=closure`; `node tools/closure.js` |
| F-24 | Rain: wet road reflections, spray behind trucks, wipers, and AI that keeps bigger gaps | Authentic | 4 | L | Med | P2 | |
| F-25 | Spitsstrook (rush-hour lane): a hard shoulder that opens at rush hour under the matrix signs | Authentic | 3 | M | Low | P2 | |
| F-26 | Roadworks: yellow lines, narrowed lanes and a 90 km/h limit | Authentic | 3 | M | Low | P3 | |
| F-40 | **Verdozing**: distribution centres along the motorway. Estates of 1–3 grey or blue boxes every 4–8 km, with dock doors, trailers waiting, a gatehouse, a car park, young trees along the service road and a logo band with made-up names; docks, logo and office corner lit at night | Authentic | 3 | S–M | Low | P2 | done: `estate()` / `distributionCentre()` in `scenery.js`. One estate in 80% of 5 km blocks, 65% on your side of the road; boxes 150–350 m long, 70–140 m deep, 12–15 m high, docks facing the road on a building line 100–160 m out (clear of overpass embankments, on the fields). Sandwich-panel cladding (`claddingTexture`), coping band in the company colour, ten invented companies (`logoTexture`), logo on the long side and the gable you drive towards. Night: white dock lamps and light pools, office windows partly lit, letters lit. Trees and farms keep off the grounds (`inEstate`). Each box is built whole by the chunk holding its centre, so it rises out of the haze ~2.8 km ahead. Later: once F-20 places ramps, put the estates next to them so trucks merge in from a box you can see |

### M3: Going somewhere

| ID | Feature | Pillar | Value | Effort | Risk | Priority | Status |
|---|---|---|---|---|---|---|---|
| F-30 | Road network graph: replace the single endless road with connected segments (architecture work) | — | 5 | XL | High | P2 | split needed. Street lighting then follows the map (junctions, specific sections) instead of random 1.6 km stretches |
| F-31 | Player takes an exit onto an N-road (80 km/h, single carriageway, oncoming traffic) | Authentic | 4 | L | Med | P2 | |
| F-32 | Klaverblad (cloverleaf) junction between two motorways, including weaving traffic | Authentic | 4 | XL | High | P3 | split needed |
| F-33 | Navigation: voice and HUD arrow, with the blue signs matching the route | Authentic | 4 | M | Low | P2 | |
| F-34 | Trip mode: choose a destination, drive there, see a summary at the end (no score) | Calm | 3 | S | Low | P3 | |

### Harness findings

- **Fixed:** MOBIL politeness made drivers (mostly trucks) move *left* just to let a faster car
  behind through, and they then got stuck alongside traffic in the right lane. Left moves now need
  the driver's own gain, and drivers signal right and wait so cooperative drivers make room.
  Elephant races now happen at all: trucks used lane 1 0% of the time in `simtest` before the fix.
- ~~In `truck-race`, the overtaking truck waits ~42 s before pulling out.~~ After F-18 it pulls out
  at 2.5 s: it no longer predicts that the car behind would panic-brake.
- F-06 A/B over 12 seeds (`npm run abtest -- anticipation=0 anticipation=1`): ~10% fewer hard
  brakes and more truck overtakes, avg speed −0.4 km/h. About 14 emergency stops (<−6 m/s²) per
  12×6 min in *both* settings. That is F-18.
- F-18 A/B (`coolness=0` vs `0.99`): emergency stops 14 → 0, hard braking 0.19 → 0.00 s/veh-h,
  no collisions, tailgating unchanged, truck overtaking +50%, avg speed −0.6 km/h. Same pattern
  at density 20 and on 2 lanes.
- ~~In `hogger`, the hogger moves right within 5 s because politeness reacts to you behind.~~
  Hoggers now have near-zero politeness: only flashing (F) moves them.
- F-14 A/B (`archetypes=0` vs `1`): no collisions or emergency stops; tight gaps (<0.6 s)
  0.3 → 1.8 s/veh-h (patsers and leasebaks tailgate, as intended), lane changes +14%, avg −0.9 km/h.
- Grijze sok: spends 29% of its time behind a truck or truck convoy, vs 3.5% for other cars.
  In `sok`, it slots in behind the truck + sok convoy at 14 s and stays; the ordinary driver
  overtakes. Found while testing: persona speeds were never applied in random traffic (applyLimit
  ran before the persona). With that fixed, `archetypes=0` vs `1` over 24 seeds: 0 collisions,
  0 emergency stops, lane changes +46%, truck overtaking +49% (slow pensioners and soks in lane 0).
- All seven archetypes, A/B `archetypes=0` vs `1` (24 seeds; density 20 on 2 and 3 lanes): 0 collisions,
  0 emergency stops. In `cast` every gap under 0.6 s is a patser or leasebak cutting in; nobody
  brakes harder than 2 m/s². The scenario summary now says who a short gap was behind, and when.
- Closures found a braking bug: with a STANDING obstacle the constant-acceleration heuristic (F-18)
  degenerated to "no braking needed", so cars braked at -2 until the last moment. Fixed (only
  affects leaders at standstill). Also: a closed lane is now a hard no for lane changes, drivers
  leave between the arrow and the red cross (each at their own point; patsers and leasebaks ride to
  the end and zip in), cornered drivers skip the mirror check and signal briefly, a car cutting in
  right in front gets an immediate reaction instead of a delayed one.
- Playtest 1 feedback (speeds): "everyone under the limit". `tools/speeds.js` showed drivers wanted
  ~102 but drove ~91 by day: nearly everyone sits in a queue behind a slightly slower car, the left
  lane included (it fills with cars at 95-100 that pulled out to pass something slower). Lane-change
  appetite (`speedGain`) changed nothing. Changes: ordinary drivers aim for limit +6 (sd 3), vans
  at the limit, more and faster speeders (night x1.7: left lane p90 ~147 at 130), half the traffic
  at night, a "move over for the faster car behind you" urge, +5 km/h while passing, default
  density 12 -> 10. Result by day: drivers want 101/106/111 (p10/50/90), drive 83/95/105; night
  103/128/137. Day is still ~10 under what drivers want: the queueing model compresses more than
  real Dutch traffic does. Next lever: a deeper look at how left-lane queues dissolve.
- Night (playtest 1): your dipped beams now dim when a car is close ahead (imitates the cut-off),
  softer clearcoat; street lamps fade in/out over 100 m instead of switching; bloom was boxy because
  three's blur truncates its Gaussian at 1 sigma (a box filter): coefficients recomputed, lamp meshes
  glow softer at night so round sprites carry the flare.
- Any van in your lane at night was blown out by your dipped beams: glossy clearcoat on a big flat
  back mirrors the light straight back. Vans now get plain commercial paint, like trucks.
- Fixed a merge race: two cars from either side could start moving into the same middle lane in
  one step without seeing each other (one emergency stop in the A/B). A car now occupies its target
  lane the moment it starts moving, and aborts if a car converging from the other side is too close.
- In `archetypes`, the patser cuts back in front of the leasebak at 0.4 s and later undertakes on
  the right at 141 km/h. That's the character working.
- F-07/F-09 telegraph time (`npm run scenario`, new column): ordinary drivers 2.3–4.0 s from first
  visible sign to moving, patser ~1 s. In `elephant` the speeder now lifts off (peak 1.6 m/s²)
  instead of braking for 5.6 s. A/B (`telegraph=0` vs `1`, 12 seeds): 0 collisions and 0 emergency
  stops with telegraphing, −10% lane changes, truck overtaking +35%, avg +0.4 km/h. Also 0/0 at
  density 20, on 2 lanes and over 24 seeds. (With `telegraph=0` the default run had 2 collisions:
  the instant, unannounced lane changes are the risky ones.)
- Fixed: on the first frame `dt` could be negative, which drove the keyboard pedals to full brake and
  switched cruise control off at the start of a scenario.
- Fixed while building F-35 slice 3: a car forgot who it was overtaking on the first step after it
  pulled out. `pv.lane >= veh.lane` was checked while the lane change was still in progress, so
  `veh.lane` was still the source lane and the F-09 memory was wiped immediately. It now compares
  lanes only once the move completes. The overtake demo's "returns right" tell exposed it.
- F-35 slice 3 harness (`npm run personas`): the `yield` demo shows the hard limit is `tSafe`, not
  `p`. A faster car close behind makes every persona wait, whatever its politeness; only a low-tSafe
  patser takes the gap (the faster car then brakes 3.7 m/s², not an emergency). The p range stays on
  the sheet and in the live strip, but it is not what decides the move.
- F-38 (`npm run signals`): withdrawn signals were nearly all one picture, a same-speed car about
  0.5 s behind in the target lane. A random signal-and-wait choice, an 8 s hold and a re-signal
  1.5–3.5 s later turned it into blink, off, blink.
- By day a sun glint on a car's glass can bloom into what looks like a lamp. Minor, look at it with
  F-10.

## Parking lot

- Suburbs and city: cyclists, right-turn blind-spot checks, roundabouts, voorrang (priority) rules.
  This was the original spark for the game and stays on the horizon.
- Trajectcontrole (average-speed cameras) and fines. Authentic, but they push the focus toward
  speed. Revisit later.
- Replay / rewind a situation to watch it again from above.
- Archetypes based on nationality, e.g. foreign trucks. Too close to stereotyping real groups; we stick to cars and driving habits.
- AI flashes its lights at you when you drive at night without lights (follows F-01). The leasebak
  flashing you when you block the left lane belongs here too.
- Gentle "driving style" feedback through other drivers' reactions, such as being flashed at for
  hogging a lane, instead of a score.
- **Toekomstflitsen: the promised now.** A separate mode on the same engine: the same A12 and the same
  drivers, but the world and car shapes as people in 1990 imagined "now" would look, in the spirit of
  Robbert and Rudolf Das (*Toekomstflitsen*, *Wegen naar de toekomst*): terraced glass buildings
  instead of grey boxes, wedge-shaped guesses at today's cars. A switch between the now we got and
  the now we were promised; the over-optimism is the charm. Inside this mode pillar 1 means true to
  that vision, while the traffic stays real Dutch drivers. Possible because the sim is kept apart from
  rendering and cars and scenery are procedural. Our own designs in that spirit, never copies of the
  books' illustrations. Large (new car bodies and a scenery set); waits until the real world is done.

## Done

- MVP: 3-lane motorway with IDM + MOBIL traffic, Dutch keep-right rule, trucks, cruise control,
  mirrors, day/dusk/night.

## Draft archetypes (F-14)

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

## Persona viewer (F-35)

A pause-menu screen (`C`, or "Meet the cast" on the title card) that is a **rig**, not a page: a
turntable with a strip of motorway under the car. Everything the viewer needs later — a lead car,
a second lane, a staged demo — is added to that same rig. The list, the numbers and the captions
all come out of `ARCHETYPES` and `SCENARIOS`, so a new persona shows up without touching the viewer.

Why a rig and not a showroom render: the whole point of F-14 is that you read a driver from the
mirror. A beauty shot can't show a 0.6 s gap, so the road stays under the car and it scrolls at the
speed that persona actually drives.

### The rig

- A one-lane road strip on its own: asphalt + worn lane edges from `textures.js`, scrolling at
  the persona's wanted speed. No platform, no verge, no kerb, no polder — while the viewer is open
  the world is put away and the background is black, so the lane and the cars are all there is
  (a studio, not a diorama).
- **It is a treadmill**: the car holds position on the strip and the road moves under it, so speed
  reads from the surface, not from a number. No second physics loop.
- **The wheels do not spin, and must not be promised.** `wheel()` bakes the tyre and rim into the
  shared `trim`/`chrome` slots, so there is no per-wheel mesh to rotate anywhere in the renderer
  (the `axle` on a visual is only the trailer's pivot). On a turntable that may start to read as
  odd; if it does, the fix is separate wheel groups in `vehicles.js`, not a viewer hack — that is
  **F-36**. Until then the scrolling surface and the lane dashes carry the speed.
- The stage borrows `TrafficView`'s visual pool rather than building cars itself: `view.add()` /
  `view.remove()` on a fake vehicle gives the right geometry for `variant:low:lights`, pooled and
  repainted by `applyLook()`. Flipping body styles costs nothing and leaks nothing.
- The lamps are emissive materials driven by hand (`m.tail`, `m.indL`, `m.indR`, `m.drl`), so the
  stage can blink an indicator or light the brake lamps on cue without stepping any traffic. That
  is how the tells glow before slice 3.
- **Where it lives**: a `CastStage` group in the main scene, parked ~45 m off the carriageway edge
  at a fixed offset from the player and moved with them while open, `visible = false` otherwise.
  `CastStage.hideWorld()` puts every other renderable in the scene away (sky, ground, scenery
  chunks, traffic, glow, beams) and nulls the fog, then `showWorld()` puts back exactly what it
  hid, so nothing else has to know the viewer exists. It keeps the scene's sun/hemi, so the car
  still looks in-engine rather than in a product page. Nothing to add to the render loop but a
  camera and a texture offset.
- **Sides**: the rig's lane runs along +z like the game's road, so its +x is the LEFT of travel
  (the game's `lat` is positive to the right, i.e. −x). Lane offsets and every camera yaw in
  `castStage.js` are written in that rig frame, mirrored from `lat`: traffic reads as driving to
  the right and an overtake happens on the car's left, the way it does in play. Do not flip one
  without the other — that is exactly the "scenarios are mirrored" bug.
- The car is a real `createVehicleVisual` instance wearing `lookFor()`, so it is the in-game car,
  not a copy that drifts.
- Camera: a slow orbit, plus three fixed framings — **mirror** (what you'd see approaching it),
  **side-tracking pass-by**, **rear-quarter**. `L` flips day/night so the lamp signature shows.
  In slice 1 the mirror framing is a camera angle (eye height, low, close), not a real mirror pass;
  a true mirror render costs a second pass and teaches nothing extra.
- Left rail: the personas in `ARCHETYPES` order, each with its one-liner. `↑` `↓` or scroll.
- Right: the spec sheet. `Enter` on a line that has more to show → the rig grows (slice 2, 3).

### Spec sheet: derived, not written

Sample `drive()` 400 times on a dummy vehicle with `force` and a seeded RNG, then aggregate each
field into a range. That is the only honest way to describe a persona: it reports what the code
does, and it moves when the code moves. Values shown for the seven personas today:

| Persona | wants | follows (T) | gives way (p) | reacts | signals | the extra tell |
|---|---|---|---|---|---|---|
| Leasebak | +18…+32 | 0.8–1.1 s | 0–12% | 0.45–0.7 s | 0.8–1.4 s | reads far ahead (lifts, rarely brakes) |
| Patser | +12…+36 | 0.55–0.85 s | 0% | 0.35–0.6 s | 0.15–0.5 s | a ×1.35, ignores signs (+12…+25 over) |
| Pensioner | −13…−5 | 1.6–2.2 s | 60–90% | 0.9–1.4 s | 2.6–3.8 s | a ×0.8, merges 0.8–1.0 early |
| Grijze sok | −10…−4 | 1.5–1.9 s *and 0.95–1.25 behind a truck* | 40–70% | 0.6–0.9 s | 1.8–2.6 s | a ×0.7, never presses |
| Family | −1…+4 | 1.4–1.8 s | 40–60% | 0.7–1.1 s | 1.6–2.4 s | cooperative, strict, no hogging |
| White van | +6…+18 | 0.8–1.1 s | 0–15% | 0.6–1.0 s | 0.6–1.2 s | presses 0.7–1.0 while waiting, merges late |
| EV smoothie | −0.5…+0.5 | 1.3–1.7 s | 20–40% | 0.3–0.5 s | 2.0–3.0 s | a/b ×0.85, hogger 35% of the time |

Plus the authored layer, 2–3 short lines per persona ("what to look for"), and one honesty line
that is not optional: *looks the part, drives like it ~70% of the time* (`loyalty`).

### Slice 1 — turntable, road speed, car selection

- Default car: weighted pick over `a.variants` (leasebak 50/50 estate/sedan, family mostly SUV,
  white van van, sok sedan, ev sedan, patser/pensioner hatch).
- Below the rig: one chip per variant the persona inhabits, with its weight. Clicking rebuilds the
  visual as that variant. Paint is keyed to `(persona, variant)` so flipping body style does not
  change the colour of the car.
- The km/h readout is the persona's real wanted speed (limit + offset), not decoration.
- The rig steps no traffic and touches no game state: slices 1–2 are pure visuals, so opening the
  viewer while paused or inside a scenario cannot disturb anything.
- Done when: every key in `ARCHETYPES` is listed without editing the viewer; flipping variants
  keeps paint; `L` visibly swaps LED bar ↔ warm halogens ↔ angel rings and the stage is genuinely
  lit by the scene's sun/hemi (not a flat ambient); the speed reads inside the sampled range; the
  stage is invisible in normal play and leaves no visual or memory behind after closing.

### Slice 2 — the headway line, and the lead car

- The `follows 0.8–1.1 s` line is clickable. Click → the road lengthens (~3× zoom out), a plain
  neutral car appears ahead, the star closes to its headway, and a bracket shows the gap in both
  seconds and metres. Click again → back to the plain turntable.
- The lead car is deliberately ordinary (family estate at a constant speed) so the gap is the only
  variable on screen.
- Grijze sok gets two chips: *normal 1.5–1.9 s* and *behind a truck 0.95–1.25 s* (`Tdraft`). That
  second headway is invisible in every other view and it is the entire persona.
- Done when: the bracket agrees with the sampled T to within 0.05 s for all seven; the lead car is
  reachable for a persona without `Tdraft` too.

### Slice 3 — the behaviour demos

- **Every line on the sheet is clickable.** The rig grows to the lanes that behaviour needs — one
  by default, two for an overtake, three for undertaking or middle-lane camping — and plays a
  staged loop.
- Demos live in `scenarios.js` as `demo:<persona>` (or `demo:<persona>:<trait>`, several per
  persona), reusing `applyScenario`: seeded, `force`d loyalty, no player car, `?scenario=demo:sok`
  for free.
- **A demo may show the typical outcome, not the extreme.** `p` 0–12% means the person is usually
  ignored: stage a car wanting in and let the star not yield, with the caption naming the odds.
  Same for `react` 0.3–0.5 s — a lead car brakes and you watch the *delay*, not a claim about it.
  A rarer outcome can be a second demo on the same line (`demo:patser:yield` vs `:not-yield`),
  labelled with its likelihood.
- Demo actors, all existing machinery: a lead car that brakes (`brakeEvent`, as in `wave`), a car
  signalling to merge in (politeness), a truck to tuck behind (sok), a slow car in the left lane
  (leasebak), a queue with a gap (family). No new behaviour code, only staging.
- A trait that truly cannot be staged (it needs a world the rig doesn't have) stays text and says
  so on the line: "not shown". That is the exception, not the default.
- **Captions are detected, not timestamped.** Each demo declares conditions on the star vehicle
  (`v.intent >= 0`, indicator on, `leader.type === 'truck'`, gap crossing a threshold) and they
  fire once, with a hold time. If the AI changes, the captions change with it.
- Loop with a short freeze and fade. `Space` pause, `1`/`2` slow-mo (0.5×, 0.25×) — telegraphing
  is invisible at 1× — `R` restart, `Esc` back to the sheet. The sheet's own **Back to the
  turntable** button does the same, because a key nobody knows about is not a way out.
- A live strip shows the star's numbers (`+21 km/h · 1.0 s · p 0.05`), so the text and the motion
  are obviously the same thing.
- Done when: `node tools/personas.js` runs every demo headless, asserts an `expect` per demo plus
  zero collisions, and fails if any declared tell never fires. Non-zero exit means the viewer would
  be lying.
- **Built (slice 3).** `npm run personas`: 55 demos across the seven personas, 0 collisions, every
  declared tell fires (alternative outcomes are one group, one of which must fire), every expectation
  holds. Demos are staged at the 100 km/h day limit even at night, because the persona's behaviour
  changes with the limit (a sok at 130 overtakes the truck it would draft behind at 100). The rig
  grows to one, two or three lanes from the demo's own `lanes`, and the camera keeps the star and the
  car the demo is about in frame.

### Truth rules

1. List, cars, numbers and captions are all derived. Adding a persona = a `drive()`, a `variants`
   entry, and 2–3 lines of prose.
2. A demo shows the *likely* case and says how likely it is; it never claims "always". A persona
   with no demo yet shows "demo pending" rather than an invented one.
3. A number may only be shown if it is inside the sampled range; a behaviour may only be claimed if
   the headless run checks it.
4. Never "always": loyalty is on screen.

### Trucks and other body types (added later, no viewer change)

The viewer iterates `ARCHETYPES` and never hardcodes the seven names, so a truck persona appears
as soon as one exists. It will exist eventually — trucks have behaviour too (slow, keeps right,
starts elephant races) — but three small things gate it today, worth knowing now:

- `makeVehicle()` only rolls a persona for `car` and `van`. A truck persona needs that line opened
  up (and `applyScenario` to pass the key, which it already can).
- `lookFor()` returns `null` for anything but car/van, so a truck's visual tells (company livery,
  a battered old rigid vs a new tractor, trailer type) would need that path extended.
- Truck speed comes from `ownMax`, not `limitOffset` (`applyLimit`), so a truck `drive()` must set
  `ownMax`/`thr`/`eager`/`bias` instead of the car fields — otherwise its wanted speed silently
  does nothing. Worth a comment in `archetypes.js` when the first one lands.

### One module behind both the screen and the test

`src/personaSpec.js` holds the two functions everything reads from: `variantsOf(persona)` (the
weighted body list) and `sampleSpec(key, n = 400)` (ranges for every field the sheet shows, from
`drive()` on a dummy with `force`). The viewer renders from it and `tools/personas.js` asserts
from it, so the number on screen and the number in the test cannot drift apart. Any new persona
needs no change here — that is the whole point.

### Gotchas

- `mode` in `main.js` already means time of day. Name the new screen state `ui`.
- `C` is free (input.js maps W/A/S/D, arrows, Z/X, B, F, Space, O, U, Y, H, Backspace). ↑/↓ are
  also drive keys, which is fine only because the viewer pauses the sim; `Tab` / `Shift+Tab` is the
  safe alternative if that ever changes.
- Free-play random closures use `Math.random` — gate them off while the rig is open.
- `traffic.step()` needs an `s` for spawning: park and hide the player car rather than removing it.
- The rig must not depend on `player.s` advancing, or the turntable will drift away from the scenery.
- Anything the spec says the renderer does, check in `vehicles.js` first. Wheel rotation was the
  one assumption here that turned out false.
- The demo stage's `Traffic` carries its own `lanes`; do not set `CONFIG.lanes` for it or the world
  road is rebuilt around the rig.
- Keep the demo camera on the road side of the lane. A wider side-on framing puts the camera out
  past the ~45 m the stage sits off the pavement; wide framings use a rear view instead of a longer
  side-on one. (The world is hidden now, so it can no longer fill the background, but the lane is
  still only as long as the rig built it.)
- Demos are staged at the 100 km/h day limit whatever the game's time of day. The persona look still
  changes with the scene's night lighting, but the behaviour does not: a sok at 130 overtakes the
  truck it drafts behind at 100, so a night demo would describe a different driver.

## Proefrit: the playtest loop (F-37)

A test system that sits between Claude driving the game and you driving it. Both kinds of drive go
through the same recorder and the same moment detectors, so a bot report and your playtest read
the same way and can be compared line by line.

### What it can and cannot tell us

The bot cannot tell whether the game is fun, and its report must never say so. It can tell three
things that today only come out of your playtests:

1. **Does the game produce the situations the pillars promise?** For example: elephant races,
   being let in, a wave you ride through. And how often do they happen per 10 minutes of driving?
2. **Is anything unreadable from the driver's seat?** A car that moves without any visible sign,
   brakes for no visible reason, or pops into view. This is the Readable pillar, measured from
   inside the car, not from the sim's god view the way `simtest` measures it.
3. **How does the world react to a *player*?** Every harness so far tests AI against AI. The
   player car has different physics, cruise control in 1 km/h clicks, and no MOBIL. Nobody has
   measured what traffic does around it.

Anything that depends on your feelings goes through **calibration**: a detector only counts once
it fires where you marked a moment. A detector that never agrees with you gets cut. That is why
the human half is slice 1, not an extra.

### The parts

All of them are free of rendering code (see the engine-migration note): `src/journal.js`,
`src/moments.js`, `src/perception.js` and `src/botDriver.js` import no Three.js, so they run in
Node and survive a later move to Godot.

**1. Drive journal (`src/journal.js`).** One recorder for every drive, in the browser or
headless.
- 2 Hz samples: `t, s, lane, lat, v, cc.set, ctl (throttle/brake/steer), indicator`, the gap
  and relative speed to the car ahead and behind in your lane and both neighbouring lanes, the
  speed limit, and fps (browser only; the bot can't feel a stutter, so your journal records it).
- Events: everything `Player.emit` already sends (`cc`, `indicator`, `crash`, `scrape`), plus
  flash, horn, lane-change start and end, red cross passed, and MSI changes. Each event is
  stamped with `t` and `s`.
- Header: who drove (human or bot plus driver profile), git commit, seed, scenario, time of day,
  and the config diff from `DEFAULTS`. A journal without its commit cannot be compared to anything.
- Format: one JSON file, about 300 KB for 20 minutes. Samples are kept as columns, not as one
  object per sample.

**2. Moment detectors (`src/moments.js`).** Rules over the journal stream. Each moment has a
`kind`, a pillar, a severity from 1 to 3, `t`/`s`, the vehicles involved (id + archetype), and a
one-line "from the seat" sentence. Thresholds live in `CONFIG.moments` so they can be calibrated.

| Kind | Fires when | Pillar |
|---|---|---|
| `cut-off` | A car merges into your lane ahead at < 0.8 s, or makes you brake > 2.5 m/s² | Calm |
| `unannounced` | A car within 60 m changes lanes after < 1 s of *visible* signal or drift | Readable |
| `phantom-brake` | A visible car ahead (same or adjacent lane) shows brake lights or brakes > 2 m/s² and nothing visible ahead of it explains it | Readable |
| `empty-signal` | A car within 80 m keeps its indicator on for > 8 s, or withdraws it after > 8 s, without changing lane | Readable |
| `pointless-lane` | A car within 120 m moves left with no car ahead in its old lane, or a faster one: nothing to overtake | Readable |
| `pop-in` | A vehicle appears or vanishes inside 150 m of you (spawn/despawn artefact) | Authentic |
| `not-let-in` | You signal for > 8 s and no gap opens, with a car right there that could have made one | Authentic |
| `boxed-in` | You are > 15 km/h under your set speed for > 60 s with no lane to escape to | Calm |
| `tailgated` | A car behind you at < 0.6 s for > 10 s | Authentic |
| `left-dawdler` | A slower car blocks the left lane ahead of you for > 30 s | Authentic |
| `forced-brake` | You had to brake > 3 m/s², for any reason | Calm |
| `near-miss` | TTC < 1.5 s with any car | Calm |
| `let-in` (good) | You signal, a car behind eases off, and you merge | Readable |
| `moved-over` (good) | The car ahead moves right after you flash or close in | Authentic |
| `clean-overtake` (good) | Signal out, pass, signal back, no braking > 1 m/s² anywhere around you | Calm |
| `elephant-race` (good) | Two trucks side by side ahead of you for > 20 s | Authentic |
| `wave-ridden` (good) | Your speed drops > 30 km/h and recovers without a `forced-brake` | Readable |

Plus a **calm share**: the fraction of driving time with no friction moment in the last 30 s.
Plus a **health** block, which is a bug report and not a feeling: collisions, NaN, cars off the
road, AI emergency stops near you.

**3. Your marks.** While you play, **F8** drops a mark (every letter key is taken). On the pause
menu, a mark can get a one-line note ("that van came out of nowhere"). When you end a drive, the
game asks three questions, all optional, and you can skip them with one key:
*calm 1–5*, *a car that felt wrong?*, *best moment?*. No more questions than that, or you will
stop answering. In dev mode the journal goes to a small Vite dev-server endpoint
(`POST /__journal`), which writes `playtests/human/<date>-<time>.json`. These stay on your disk:
they are your design history and the calibration set, and git ignores them.

**4. Perception (`src/perception.js`).** What a player in the car can know, and nothing more:
- Forward about 250 m, mirrors about 120 m behind. The neighbouring lanes are visible; lanes
  further away only up to 80 m.
- Cues only: indicator, brake lights, lateral drift toward a line, relative speed (the AR
  overlay's number), and vehicle type and look. Never `intent`, `p`, `tSafe` or the archetype key.
- Slice 3: trucks occlude, on a 2D line-of-sight test on the straightened road.
- The bot drives from this view, and `unannounced` / `phantom-brake` are judged from it. That is
  the whole trick: "unreadable" means unreadable *to someone in the car*.

**5. Bot driver (`src/botDriver.js`).** It drives the real `Player` through the same `ctl`
object the keyboard fills (`steer/throttle/brake/analog`), plus key presses for cruise control,
the indicator and flashing. It never gets a shortcut the keyboard doesn't have. Driver profiles:

| Profile | Drives like | Finds out |
|---|---|---|
| `forens` (commuter) | Cruise at limit +4, keeps right, signals 3 s, overtakes when ≥ 8 km/h faster, flashes a left-lane dawdler after 20 s | The baseline experience |
| `jij` (you) | Its parameters fitted from your journals: set speed, overtake threshold, signal time, headway, how often you use cruise control | Slice 4. Whether the bot's day looks like yours |
| `slak` (slowcoach) | 10 under the limit, middle lane | Does the AI react to a bad player believably? |
| `dwars` (awkward) | Short signals, late merges, sometimes brakes for nothing | Do the AI's defences hold, or does it collide or panic? |

**6. Runner (`tools/playtest.js`).**
`npm run playtest -- driver=forens min=20 seeds=5 tod=day [scenario=closure] [frames]`
writes `playtests/bot/<run>/` (gitignored), containing the journals plus `report.md`. With
`frames` (needs `npm run build`), the runner uses the `clip.js`/`shot.js` machinery to shoot a
bonnet-view frame and a lane-map frame at the three worst and the three best moments, so Claude
can *look* at them, not only read numbers. Every moment carries `seed + t`, and because the bot
is deterministic, `node tools/playtest.js seed=3 until=412 clip` reproduces it.

**7. Report (`report.md`).** Fixed order, so two reports can be compared:
1. Header: commit, profile, seeds, minutes, config diff.
2. **M1 check**, the milestone's own done-criterion made literal: across the drives, how many had
   at least one good moment of severity ≥ 2 and zero `unannounced`/`pop-in`/`phantom-brake`.
3. Rates per 10 minutes for each moment kind, calm share, and driven speeds against the
   expectations in the speed-realism note.
4. Timeline of each moment, written from the seat: "12:40, km 21.3: white van in lane 2
   moved in 0.6 s after its indicator came on, 34 m ahead, you braked 2.8."
5. Health.
6. With a baseline (`base=<run>`): a diff of the rates. That is the A/B in experiential terms,
   next to `abtest`'s mechanical one.

**8. Compare (`tools/compare.js`).** Human journals against bot runs:
- For each of your marks: which detectors fired within ±5 s. A mark with nothing firing means a
  **missing detector**. A detector firing often with no mark near it means it is **noise** or the
  threshold is too strict. The output is a per-detector agreement table, and the thresholds move
  to fit it.
- Distribution diff between you and `jij`: time in lane, overtakes per 10 km, signal time, cruise
  control use. Large gaps mean the bot isn't driving like you yet, so its reports don't speak for
  you yet.

### How we use it

- **After every traffic change**, Claude runs `playtest` with `base=` against the previous commit
  and reads the report and frames before telling you it works. This replaces "the numbers in
  simtest look fine" with "from the seat, 2 fewer cut-offs per 10 min, and no new unannounced
  moves".
- **After you play**, you just play; F8 is enough. Claude reads your journal: your marks, notes and
  answers, plus which moments fired. The note "felt wrong somewhere around the closure" becomes
  "11:02, a patser cut in at 0.5 s; here is the frame". That turns vague feedback into a
  reproducible seed + time.
- **Your judgement stays the top authority.** A bot report can say "this got worse" and be
  overruled by one playtest. A playtest can't be overruled by a bot report.

### Slices

- **Slice 1: journal + marks + detectors on your drives (M).** `journal.js`, `moments.js`, F8, the
  end-of-drive questions, the `/__journal` endpoint, and a `tools/report.js` that turns a human
  journal into the same `report.md`. *Done when* a 20-minute drive of yours produces a report in
  which you recognise your own drive, and each of your marks has a timestamp and a frame-able
  `s`.
  **Built:** all of the above, plus `npm run moments`: hand-built journals for one rule at a time
  (`tools/momenttest.js`) and a real-sim stage test (`tools/momentstage.js`) that drives five staged
  situations through `Road` -> `Player` -> `Traffic.step` -> `Journal` -> `detectMoments`, so a
  detector is checked against what the sim actually recorded (`veh.brake`, `veh.indicator`,
  `veh.lane`, `veh.latLocal`) and not only against synthetic rows. Both use one checker
  (`tools/lib/momentcheck.js`), and every failure says whether the *situation* was missing
  (FIXTURE) or the *rule* misjudged it (DETECTOR). `npm run moments:stage -- only=ES trace` prints
  the journal rows the detector saw, `order=reverse` reruns in the other order, `dump=<dir>` writes
  the journals for `npm run report`.
  Watch items from building it: `v` is km/h while `util.js` `KMH` is m/s per km/h, so m/s is
  `kmh * KMH` (a first draft used `/ KMH` and turned 0.4 m/s² into 5.6); the recorder keeps a
  wider window than `popInM` and never lets its nearest-N cap hide a car inside 150 m, or every
  car crossing the window edge reads as a pop-in; `unannounced` counts the small pre-move lean
  (the telegraph), not the crossing itself, or every 3.5 s lane change is "announced".
- **Slice 2: bot driver + runner (M).** `perception.js` without occlusion, `botDriver.js` with
  `forens` and `slak`, `tools/playtest.js`. *Done when* `forens` drives 20 minutes on 5 seeds with
  0 player collisions, overtakes, merges and uses cruise control the way the keyboard does, and
  the report renders.
  **Built:** `src/session.js` (render-free sim setup/step, key mapping, flash, closure rolls),
  `src/perception.js` (whitelisted cues, no occlusion), `src/botDriver.js` (`forens` + `slak`, a
  keyboard-only driver with cruise clicks, overtaking, returns, aborts, closure merges and
  flashing), `tools/playtest.js` (one child per seed, journals, traces, `run.json`, `report.md`,
  `until=`) and `npm run bottest`. `Player`'s crash/scrape throttles now run on sim time, and
  `main.js` drives the same `session.js` as the bot. `driver=forens min=20 seeds=5 tod=day`: 0
  contacts, 0 scrapes, 0 red crosses, min bumper gap > 1 m, every change signalled, 5-18 overtakes
  per 20 min. Watch items from building it: (1) the gate's p50 = limit + 4 ± 2 and right-lane
  share ≥ 50% cannot both hold on default day traffic — the traffic itself runs at about 86/96/103
  km/h in lanes 0/1/2, so a bot that keeps right follows at the right lane's pace (p50 89-98) and
  cruise share lands at 56-86%; it gets right share up to 66% on some seeds. (2) Steering latency
  (the body must move 0.25 m before the journal sees a change) puts a few `lane-change-start`
  events 0.05-0.2 s outside the 2.5-4 s window; closure merges can be longer. (3) A closure is
  detected from the first arrow or red cross (up to 750 m early); with no gap it slows to the
  neighbour lane's pace and merges late. `scenario=closure` is clean; random closures occasionally
  cost one signal-time outlier.
- **Slice 3: frames, reproduction, occlusion, `dwars` (S–M).** *Done when* each worst moment in a
  report comes with two frames and a one-line command that reproduces it.
- **Slice 4: calibration (M).** `compare.js`, the `jij` profile fitted from your journals,
  thresholds tuned. *Done when* at least 3 of your journals exist and ≥ 70% of your "felt wrong"
  marks have a detector firing within 5 s, while each detector fires at most twice per 10 minutes
  without a mark near it.

### Open: what the stage test cannot see yet

Found while building `tools/momentstage.js`. Each one is a probe there rather than a fixed
fixture, so the number stays visible:

- **Closure obstacles never reach the journal.** `addClosure` puts `c.obs` in the lane lists, not in
  `traffic.vehicles`, and `Journal.sampleAt` reads only `traffic.vehicles`. A car leaving a closed
  lane, or braking for the arrow board, is likely to be called pointless or a phantom brake.
  `probe-closure` records it: the car is reported as braking with nothing visible ahead. Fix:
  record closure obstacles as journal rows.
- **`pointless-lane`'s leader window is a hard-coded 120 m** (`o.dl - v.dl > 120`), not
  `cfg.pointlessM`. `probe-far` shows what it means: pulling out for a 70 km/h car 130 m ahead
  counts as pointless. Fix: make it a CONFIG key with the same value, then calibrate.
- **Decide whether pulling out for a slow car 130-200 m ahead counts as pointless from the seat.**
  That is a calibration question, not a code one: your marks decide.
- **Brake-light on/off events for nearby cars.** The journal samples at 2 Hz, so a tap shorter than
  0.5 s can fall between samples and be invisible. Recording the on/off events (like the player's
  own control changes) would make the brake column trustworthy.

### Truth rules

1. The report states observations, never verdicts about fun. "Calm share 0.82" is fine; "it
   feels calm" is not.
2. Detectors judge from `perception.js`, never from AI internals. If the player couldn't have
   seen it, it isn't "unreadable"; it's a sim fact for the health block.
3. Every moment can be reproduced from `seed + t`.
4. A detector that disagrees with your marks gets re-tuned or cut. The bot answers to you.

### Gotchas

- Every letter key is bound (see `main.js` and `input.js`), so the mark goes on F8. Check that the
  browser doesn't eat it first.
- `tools/scenario.js` `you=ai` makes an *AI vehicle* play you. That is the opposite of what we need
  here: the bot must drive `Player`, with its physics and cruise control clicks.
- `Player` takes `road` (render-free, `road.js` imports only `util.js`), so it already runs in
  Node. Keep it that way.
- Free play uses `Math.random` for closures. The runner must seed it, or `seed + t` reproduces
  nothing.
- fps and stutter exist only in your journals. Don't let a bot report pretend to cover them.
