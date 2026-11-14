# Snelweg backlog

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
| F-09 | Overtake follow-through: cars return right promptly after passing, and drivers queued behind react to it | Authentic | 4 | S | Low | P1 | done: remembers who it overtakes, heads back right once clear |
| F-10 | Car models spike: compare improved procedural cars with imported CC0 glTF models on one test car | Quality | 3 | M | Med | P3 | deferred: generic but convincing is fine |
| F-11 | Car models rollout: about 8 distinct vehicles, each with its own light layout (based on the F-10 outcome) | Quality | 3 | L | Med | P3 | deferred |
| F-14 | **Driver archetypes**: a persona decides both the look and the behaviour (speed, headway, politeness, lane habits). Tendencies, not guarantees, roughly 70/30 | Readable | 5 | M | Med | P1 | done: Leasebak, Patser, Pensioner, Grijze sok, Family, White van, EV smoothie. Vans can be archetypes too. `?scenario=cast` shows them all |
| F-15 | Archetype visual tells within the box style: colour palette, stance, tinted windows, wheels, light signature (LED strip or yellow halogen), readable in the mirror and at night | Readable | 4 | M | Med | P1 | slice 1 done: palette, lowered + big rims, tint, and a lamp shape per archetype: leasebak LED strip + full-width rear bar, patser angel-eye rings + smoked tails, pensioner round warm lamps, grijze sok twin projectors + L-shaped tails, family tall upright tails, EV one thin light line front and back, white van roof rack + ladder + company stripe |
| F-16 | Fix the side stripes that read as glitching wheels | Quality | 2 | S | Low | P1 | done: real wheel arches cut into the body |
| F-28 | **Night mood**: dark sky, cars read as their lights, unlit motorway with occasional sodium-lit stretches whose light sweeps over the car lamp by lamp, white lines that light up in your own beam (retroreflective) | Authentic | 4 | S | Low | P1 | done, needs playtest |
| F-19 | **Dev overlay v2**: everything the expanded overlay shows now, plus predicted paths, target gaps and lane-change intent drawn in the world | Readable | 3 | M | Low | P2 | later; separate from the AR overlay |
| F-12 | Radio: a play-your-own-music folder, plus optional live Dutch radio streams | Authentic | 3 | S | Low | P1 | done: Y tunes off / my music / NPO Radio 1, 2, 3FM, Klassiek, 5. Folder picked in the menu each session (files stay local); streams can be turned off in the menu. Later: remember the folder, car-speaker EQ |
| F-13 | Shoulder check / look-around: hold a key to glance over the shoulder at the blind spot | Authentic | 3 | S | Low | P1 | done: Z / X tap = quick glance (~135° / 125°, head moves toward the window), hold = keep looking |

### M2: The road breathes

| ID | Feature | Pillar | Value | Effort | Risk | Priority | Status |
|---|---|---|---|---|---|---|---|
| F-20 | On-ramps (AI only): merge lane, acceleration strip, AI zipper-merge and making room | Readable | 5 | L | High | P1 | |
| F-21 | Exits (AI only): cars move right early and leave the motorway | Authentic | 4 | M | Med | P1 | |
| F-22 | Bottlenecks and jams: density waves and lane drops that create a jam which forms and dissolves | Readable | 5 | M | Med | P1 | groundwork: `?scenario=wave` + `node tools/wave.js`. Finding: a hard brake does travel back as a wave, but it DAMPS (4.5 m/s² right behind, <1 m/s² 600 m back) because drivers react instantly and smoothly. Step 1 done: per-driver reaction delay (0.3-1.4 s by archetype, `reactionTime` knob + menu) with a crash reflex, and brake-light reading two cars ahead as the stabiliser. A mild brake (to 65) now grows further back (cars 400 m+ drop to ~48); at reactionTime 1.4 it becomes stop-and-go (braking ~4 m/s², max 5), 0 collisions. 1.6 is unsafe (emergency stops). Step 2: bottlenecks (on-ramps, lane drops): homogeneous traffic still doesn't break down by itself even at 30/km/lane |
| F-32 | **Overhead lane map + time-space diagram** (U, `, .` zoom 120-2000 m): the road straightened, cars coloured by speed, brake/indicator marks, archetype letters; the diagram shows your lane's trajectories over 80 s so waves are visible | Readable | 4 | S | Low | P1 | done |
| F-23 | Dynamic matrix signs: 70/50 limits ahead of jams, flashing lights, red X lane closures | Authentic | 4 | M | Low | P2 | |
| F-24 | Rain: wet road reflections, spray behind trucks, wipers, and AI that keeps bigger gaps | Authentic | 4 | L | Med | P2 | |
| F-25 | Spitsstrook (rush-hour lane): a hard shoulder that opens at rush hour under the matrix signs | Authentic | 3 | M | Low | P2 | |
| F-26 | Roadworks: yellow lines, narrowed lanes and a 90 km/h limit | Authentic | 3 | M | Low | P3 | |

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
