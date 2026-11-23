# Harness findings

Findings from the headless harnesses (`simtest`, `abtest`, `scenario`, `personas`, `signals`), moved here from the old `BACKLOG.md`. Items are in [BACKLOG.md](../BACKLOG.md).

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
