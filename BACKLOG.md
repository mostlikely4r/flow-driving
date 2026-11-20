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
| F-09 | Overtake follow-through: cars return right promptly after passing, and drivers queued behind react to it | Authentic | 4 | S | Low | P1 | done: remembers who it overtakes, heads back right once clear. F-35 found and fixed a bug that wiped that memory on the first step of the move |
| F-10 | Car models spike: compare improved procedural cars with imported CC0 glTF models on one test car | Quality | 3 | M | Med | P3 | deferred: generic but convincing is fine |
| F-11 | Car models rollout: about 8 distinct vehicles, each with its own light layout (based on the F-10 outcome) | Quality | 3 | L | Med | P3 | deferred |
| F-36 | **Wheels that turn**: a car build variant with real wheel groups so tyres and rims rotate with speed. Today `wheel()` merges the tyre into `trim` and the rim into `chrome`, so nothing on any car can spin | Quality | 3 | M | Med | P3 | open. Cost is draw calls: 4 wheels × 2 materials per car roughly doubles the ~8 slots a car has now. Plan: opt-in `wheels: true` build used by the F-35 stage and the player's own car first, measure with the fps counter, and only then consider close traffic. Found while speccing F-35 (a turntable is where a motionless wheel actually shows) |
| F-14 | **Driver archetypes**: a persona decides both the look and the behaviour (speed, headway, politeness, lane habits). Tendencies, not guarantees, roughly 70/30 | Readable | 5 | M | Med | P1 | done: Leasebak, Patser, Pensioner, Grijze sok, Family, White van, EV smoothie. Vans can be archetypes too. `?scenario=cast` shows them all |
| F-15 | Archetype visual tells within the box style: colour palette, stance, tinted windows, wheels, light signature (LED strip or yellow halogen), readable in the mirror and at night | Readable | 4 | M | Med | P1 | slice 1 done: palette, lowered + big rims, tint, and a lamp shape per archetype: leasebak LED strip + full-width rear bar, patser angel-eye rings + smoked tails, pensioner round warm lamps, grijze sok twin projectors + L-shaped tails, family tall upright tails, EV one thin light line front and back, white van roof rack + ladder + company stripe |
| F-16 | Fix the side stripes that read as glitching wheels | Quality | 2 | S | Low | P1 | done: real wheel arches cut into the body |
| F-28 | **Night mood**: dark sky, cars read as their lights, unlit motorway with occasional sodium-lit stretches whose light sweeps over the car lamp by lamp, white lines that light up in your own beam (retroreflective) | Authentic | 4 | S | Low | P1 | done, needs playtest |
| F-19 | **Dev overlay v2**: everything the expanded overlay shows now, plus predicted paths, target gaps and lane-change intent drawn in the world | Readable | 3 | M | Low | P2 | later; separate from the AR overlay |
| F-12 | Radio: a play-your-own-music folder, plus optional live Dutch radio streams | Authentic | 3 | S | Low | P1 | done: Y tunes off / my music / NPO Radio 1, 2, 3FM, Klassiek, 5. Folder picked in the menu each session (files stay local); streams can be turned off in the menu. Later: remember the folder, car-speaker EQ |
| F-13 | Shoulder check / look-around: hold a key to glance over the shoulder at the blind spot | Authentic | 3 | S | Low | P1 | done: Z / X tap = quick glance (~135° / 125°, head moves toward the window), hold = keep looking |
| F-35 | **Persona viewer (the cast)**: a turntable rig with a road under the car — pick a persona, flip through the cars it inhabits, click the headway line to see the gap, click a behaviour line to watch it play on the rig | Readable | 4 | M | Low | P1 | done, 3 slices; see **Persona viewer (F-35)** at the end. Everything derived from `ARCHETYPES`, so a new persona appears by itself. Slice 3: 55 seeded demos, `npm run personas` checks every tell and expectation headless. Studio pass: world hidden, black background, road + cars only, rig sides mirrored to the game's `lat`, and a Back button on the sheet |

### M2: The road breathes

| ID | Feature | Pillar | Value | Effort | Risk | Priority | Status |
|---|---|---|---|---|---|---|---|
| F-20 | On-ramps (AI only): merge lane, acceleration strip, AI zipper-merge and making room | Readable | 5 | L | High | P1 | |
| F-21 | Exits (AI only): cars move right early and leave the motorway | Authentic | 4 | M | Med | P1 | |
| F-22 | Bottlenecks and jams: density waves and lane drops that create a jam which forms and dissolves | Readable | 5 | M | Med | P1 | groundwork: `?scenario=wave` + `node tools/wave.js`. Finding: a hard brake does travel back as a wave, but it DAMPS (4.5 m/s² right behind, <1 m/s² 600 m back) because drivers react instantly and smoothly. Step 1 done: per-driver reaction delay (0.3-1.4 s by archetype, `reactionTime` knob + menu) with a crash reflex, and brake-light reading two cars ahead as the stabiliser. A mild brake (to 65) now grows further back (cars 400 m+ drop to ~48); at reactionTime 1.4 it becomes stop-and-go (braking ~4 m/s², max 5), 0 collisions. 1.6 is unsafe (emergency stops). Step 2 done via F-23: a lane closure is a bottleneck and a jam now forms by itself behind it (3->2 lanes at 9/km/lane: ~30 veh/min get through against ~50 on a plain 2-lane road, so it is harsher than reality, where a merge costs 10-30%). 0 collisions over 8 closure setups. Causes of the low throughput: stragglers zip in from standstill, trucks pull away at 0.45 m/s², queue discharge gaps. Still open: on-ramps |
| F-32 | **Overhead lane map + time-space diagram** (U, `, .` zoom 120-2000 m): the road straightened, cars coloured by speed, brake/indicator marks, archetype letters; the diagram shows your lane's trajectories over 80 s so waves are visible | Readable | 4 | S | Low | P1 | done |
| F-23 | Dynamic matrix signs: 70/50 limits ahead of jams, flashing lights, red X lane closures | Authentic | 4 | M | Low | P2 | done (`src/msi.js`): gantries every 500 m; queue warning (traffic past a gantry < 35 km/h -> flashing 50 there and one back, 70 before that, clears after 25 s); lane closures (arrow, red crosses, 70 over open lanes, 90 one gantry earlier, end sign); drivers obey with per-archetype margin; arrow-board truck + cones; HUD limit follows; red cross counted in trip stats; shown on the lane map; random closures in free play (`closuresPer10km`, menu); `?scenario=closure`; `node tools/closure.js` |
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
