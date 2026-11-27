# F-31 slice 1: off the motorway, round the roundabout, onto the N-road (spec)

Status: ready to build. Written 2026-11-27. BACKLOG item **F-31** (Player takes an exit onto an
N-road). Second slice of the road graph: builds on F-30 slice 1, the wegsplitsing
(`docs/specs/F-30-splits.md`), and uses its graph, road classes, route frame, cut and re-base. Read
that plan's sections 5.1–5.6 first. Talked through with the user on 2026-11-27.

*Decided* marks the user's own calls. *Agreed* marks a proposal of the planner's that the user said
yes to in the talk. *Proposal* marks the planner's own; the builder may change a proposal's numbers
or mechanism if the code or a measurement says so, and notes why in this file and the BACKLOG line.

## 1. Why

What the user said (2026-11-27):

- *Decided:* **Both kinds of destination come eventually:** a junction to another motorway (F-30,
  first) and a junction to a country road (this plan).
- *Decided:* **"The situations will vary later."** This slice is one kind of each thing; traffic
  lights, roads where you may overtake and other variants come later.
- *Decided:* **At the top of the exit ramp: a roundabout.** Traffic lights are the later
  alternative.
- *Decided:* **The N-road is 2x1, 80 km/h, no overtaking**, "with later personas doing it anyway"
  (not in this slice).
- *Decided:* **Cyclists are in.** Read as: a parallel road beside the N-road with cyclists and the
  odd tractor that turn off before the roundabouts, so they never cross your path in this slice
  (*agreed* in the talk; cyclists crossing at roundabouts is a later slice).
- *Decided:* **You only rejoin the motorway in the direction you were going.** Turning around (back
  along the road you came by) comes with the map.
- *Agreed:* **The N-road goes on forever**, like the motorway (F-30's *decided* "for now going on
  forever is fine"), with a roundabout every 2–5 km.
- *Agreed:* **The side arms of those roundabouts are minor roads that drop out of sight**; traffic
  comes out of them and turns into them.
- *Agreed:* **About every third roundabout has an on-ramp back onto a motorway**, so motorway →
  N-road → motorway works, there's no dead end, and every road stays open at both ends (F-30's
  *decided* no-pocket rule).
- *Agreed:* **The look of a standard Dutch 80 km/h road**: green-filled double centre line, dashed
  edge lines, unlit except at the roundabouts; lighter traffic than the motorway.
- *Agreed:* **The exit road ends at the roundabout and carries on.** Today exiting cars wait at
  the give-way at the top and disappear (`updateGiveWay`, `CONFIG.exitWaitS`); they now drive
  round the roundabout and away, visible from the motorway.
- *Agreed:* **The far roundabout's on-ramp is closed** with a red-and-white barrier and an
  *afgesloten* sign, as on-ramps really are for night works, because it leads back the way you
  came. No invisible wall (one was removed in F-20 slice 4 because it trapped the player's car).

From the code (read 2026-11-27):

- Every aansluiting (`src/junctions.js`) already draws the exit road climbing to a crossing road at
  `DECK_Y` 6.9 m, the bridge at `sBridge`, the crossing road running ~320 m out into the fields on
  both sides, and the on-ramp coming down (`rampPath`, `exitPath`, `roadSegments` for both
  carriageways, mirrored around the bridge by `mirrorS`). Junctions sit every 3–6 km
  (`junctionEveryKm`), placed from `s` alone.
- Exiting cars (F-21) stop at the give-way at `exitTop` and are removed after `exitWaitS` [1, 4] s.
  On-ramp cars appear at the ramp top on a timer (`addRamp`, `rampPerMin`, `spawnFromRamp`).
- `Traffic` takes a `lanes` option (default `CONFIG.lanes`); the persona rig already runs it with
  fewer lanes. One-lane traffic is two `Traffic` instances (`dir` +1 and −1), as the motorway's
  carriageways are now; the oncoming one is visuals only.
- Vehicle variants (`src/variants.js`): hatch, sedan, estate, suv, van, truck, rigid, caravan.
  Drawn instanced per body shape (F-54, `src/vehicleInstances.js`) with a draw-call budget in
  `npm run perf` (1,500 a frame at density 25).
- Everything else about the graph is F-30's: edges with a road class, nodes, the route frame
  (`src/route.js`), the lane layout by `s`, choosing by where you are at the node, the cut out of
  sight, and the re-base onto the road you took.

Guesses this plan rests on (no drive or measurement behind them yet):

- That the roundabout drives like a Dutch one: the entry speed, how long the AI waits for a gap,
  how the ring flows.
- That a single 80 km/h lane with no overtaking feels calm behind a lorry or a slow driver, not
  frustrating.
- That the minor arms and the motorway drop out of sight behind tree rows and farmyards without
  popping.
- The numbers marked *proposal* below.

So step 1 is the smallest version the user can drive: off the motorway, round the roundabout,
along the N-road and through the next roundabouts, with AI traffic doing the same.

## 2. The picture

The blue sign says *Hoornwijk N235*. You take the exit as the AI cars do, climb the exit road and,
instead of a give-way line, there's a roundabout: shark's teeth across your lane, a car going round
from your left, its right indicator blinking as it reaches your arm. You roll on behind it and go
round to the third arm, indicating right as you pass the second. Behind you, a red-and-white barrier
closes the on-ramp on the far side of the bridge. The road you leave by is narrow: one lane each
way, a double white line with green between, dashed edge lines, a grass verge and a ditch, white
reflector posts. Oncoming cars pass close at 80. A lorry ahead sets the pace and you stay behind it.
Off to the right, past the ditch, a cyclist on the parallel road and a tractor turning into a farm.
The motorway drops behind a row of poplars. Three kilometres on, a warning triangle with the
roundabout symbol, a blue sign with the places each arm goes to, the next roundabout, lit by its
own masts in the dark polder. Every few roundabouts one arm is signed for a motorway: take it and
you're back on an on-ramp, merging as you know.

## 3. Goal and non-goals

**Done when** (step 2 makes these measurable; numbers are *proposals*):

- You can leave the motorway at any junction, drive round the roundabout and away along the N-road
  in free play, and the N-road goes on forever with a roundabout every 2–5 km.
- At each roundabout you can leave by any open arm, and the road you took goes on forever.
- From about every third roundabout you can get back onto a motorway, and that motorway goes on
  forever.
- The route is continuous at every node and re-base: no gap, kink or jump in road, scenery or
  traffic.
- Roundabout AI: 0 collisions on the ring and at entries; no car on the ring stands still for
  more than 2 s; median wait at the give-way line with no ring traffic in conflict ≤ 0.5 s; every
  car leaving the ring has its right indicator on for ≥ 1.0 s before it leaves.
- **No pocket** (F-30's *decided* rule): a 60-minute run at N-road density through at least 15
  roundabouts keeps the vehicle count in the window per 10-minute bucket within 10% of the first,
  and no entry queue stands for more than 30 s.
- No AI overtakes on the N-road.
- With N-roads off, every existing tool reproduces its baseline number for number.

**Non-goals:** section 7 (Not doing) and the end (Not in this build).

## 4. Baseline (do not revert or redesign)

- F-30 slice 1 as built (Q-21, Q-22): the graph, classes, route frame, lane layout by `s`, cut and
  re-base, and its section 9 (the lane representation the builder wrote down). This plan adds node
  and edge types to that model; it doesn't replace it.
- The exits (F-21), on-ramps and run-out (F-20), the F-48 future world behind F9, instanced vehicle
  drawing (F-54).
- Tool baselines with N-roads off, as F-30 lists them.

## 5. The model

### 5.1 New road classes (*proposal*; 80 / 2x1 / no overtaking is *decided*)

| Class | Lanes | Limit | Overtaking | Look |
|---|---|---|---|---|
| `N-80` | 1 each way, one carriageway | 80 | none (the AI never uses the other lane) | 5.3 |
| `N-minor` (the side arms) | 1 each way | 60 | none | narrower (2 × 2.75 m), dashed centre line, no green |

Lorries keep their own top speed (80 is their N-road limit anyway). Speeders on `N-80` take their
`limitFactor` / `limitOffset` against 80, as on the motorway against 100/130.

### 5.2 New node types (*proposal*)

- **`roundabout`:** 3 or 4 arms, each a two-way edge. Arms meet the ring at roughly right angles.
- **`aansluiting`:** today's junction becomes a node: the motorway, its exit road and on-ramp per
  carriageway, and the crossing road, which is now an `N-80` edge with a roundabout at each end of
  the bridge (a dumbbell, *haltercombinatie*).

Placement along an `N-80` edge, from its seed:

- A roundabout every 2–5 km (*agreed*).
- Every third roundabout on average (one in 2–4) is an aansluiting onto a new motorway (*agreed*):
  the N-road crosses the motorway on a bridge, with a roundabout on each side.
- The other roundabouts have 3 or 4 arms: the N-road continuing, and one or two `N-minor` arms.
  *Proposal:* one in four of those roundabouts is instead a crossing with another `N-80`, so the
  N-road network branches too.

### 5.3 The N-road (*agreed* look; *proposal* numbers)

- Two lanes of 3.10 m. Centre: two solid white lines 0.10 m wide with a green-coloured strip
  between them, 0.8 m in all. Edges: dashed white edge lines. Then a 0.6 m paved verge strip
  (grass blocks), a grass verge and a ditch with water on both sides.
- White reflector posts every 50 m; hectometre posts with the road's yellow N-number plate.
- No guardrail except at bridges and ditches close to the road. No street lights except at
  roundabouts.
- Traffic: `CONFIG.nroadDensity` 5 vehicles per km per lane each way (*proposal*: lighter than the
  motorway's 10); lorries one in six.
- Curves: an N-road bends more than a motorway: radius 400–1,200 m, and the odd 90° bend at a
  field edge, radius ≥ 250 m with an advisory sign at 60. Generated from the edge's seed like
  `Road.planMore`, with its own ranges.

### 5.4 The roundabout (*decided* that it's a roundabout; *proposal* geometry and rules)

Geometry (a Dutch single-lane roundabout outside the built-up area):

- Outer radius 18 m; ring lane 5.5 m wide; centre island with a 2 m overrunnable apron in red
  setts (lorries' trailers ride over it) and a raised grass island, sometimes with an object on it.
- Each arm has a splitter island (*druppel*) between its in and out lanes.
- At each entry: shark's teeth across the lane and the give-way sign with the roundabout plate.
- 150 m before: the warning triangle with the roundabout symbol. 300 m before: a blue direction sign
  with each arm's places and route numbers (yellow N-plates; blue A-shields on an arm to a
  motorway).
- Lit by masts round the ring; the approach is not.

Rules (Dutch practice):

- Traffic on the ring has priority; the ring runs anticlockwise; entering traffic gives way to
  traffic coming from the left.
- Indicate right before leaving, from passing the arm before yours. No indicator when entering.
- Approach speed falls to ~30 km/h at the give-way line; ring speed ~25–30 km/h (lorries ~15–20).

AI (*proposal*):

- **Destination roll** when a car comes within 500 m of a roundabout, once per roundabout: an arm
  other than the one it comes from, weighted by class: the continuing `N-80` 0.6, another `N-80`
  0.4 each, `N-minor` 0.15 each, an on-ramp 0.25 each; normalised over the arms present.
- **Entering:** decelerate to the entry speed; at the give-way line, enter when the next ring car
  coming from the left will reach the entry point more than the car's critical gap later. Critical
  gap 3.0–4.5 s by persona (patsers short, careful drivers long), follow-up 2.0–2.5 s behind a car
  that just entered. A ring car indicating right and already slowing for this arm counts as leaving
  for careful drivers only if it's also within 15 m of its exit.
- **On the ring:** follow by IDM on the ring's arc; never give way to an entering car (this keeps
  the ring flowing: the ring can't gridlock).
- **Leaving:** right indicator from passing the previous arm; leave onto the out lane of the chosen
  arm.
- Ring and arms hand vehicles to each other at the give-way line and at the exit point. Ids and
  personas travel with the vehicle.

The ring is not a closed system: every car on it has an exit chosen before it enters, and no car
stays round for more than one lap (a car that somehow passes its exit takes the next arm).

### 5.5 The aansluiting as a node (*agreed* changes; *proposal* detail)

- The crossing road becomes an `N-80` with a roundabout at the top of each side's ramps, just off
  each end of the bridge. The exit road ends at the near roundabout's give-way line, the on-ramp
  leaves from it.
- The far side's on-ramp leads back the way you came: a red-and-white barrier with an *afgesloten*
  sign across its start, for the player only (AI never chooses it; the oncoming carriageway's own
  ramp traffic is visuals and keeps flowing as today). Ramp roads to a motorway you reached from an
  N-road (5.2) are both open: both directions of that motorway are new to you.
- **Exiting AI** no longer vanishes at the give-way. It enters the roundabout and leaves by an arm,
  then is cut with that arm (5.6).
- **On-ramp AI** comes from the roundabout instead of the ramp-top timer: arm traffic is rolled for
  the on-ramp (5.4), and the spawn rates on the arms are set so the on-ramp still carries about
  `CONFIG.rampPerMin` (*proposal*; the builder checks it in the `nroads` report).
- With `CONFIG.nroads` off, junctions behave exactly as today (give-way, vanish, ramp timer).

### 5.6 Choosing, the cut and re-basing (F-30 5.5, extended)

- **The window** covers every edge within reach: the road you're on to its usual range, and at a
  node ahead each arm up to its cut, until you choose.
- **You choose by where you leave:** the exit lane at the motorway (you're on the exit road), the
  arm you leave the ring by. On the ring itself you may go round as often as you like; the route
  is decided when you cross an arm's exit point.
- **Cuts** (*proposal*): an `N-minor` arm bends behind a farmyard or a tree row within 400 m and is
  cut at 500 m; an `N-80` arm you didn't take, and the motorway you left, are cut once a tree row
  or a noise-barrier belt is between them and you (the N-road leaves the motorway through a row of
  poplars 300–500 m out). Vehicles past a cut are removed; the scenery chunks there are disposed.
- **Minor arms are drivable** (*proposal*, since an arm you can't enter would need a barrier at
  every roundabout): an `N-minor` arm you take goes on as an `N-minor` road for 1–3 km and joins an
  `N-80` at a T-junction where you give way (shark's teeth), turning left or right onto it. Both are
  forward-generated, open edges. A T-junction is a give-way node with no ring: same entry rule as a
  roundabout entry, against traffic from both sides on the road you join.
- **Re-base** onto the road you took once the window is clear of the node, as F-30 5.5.
- **The journal** records `route` events at each choice and re-base, as F-30 5.6.

### 5.7 The parallel road, cyclists and tractors (*decided* cyclists; *agreed* shape)

- Beside most of the `N-80` length (*proposal*: 70%), on one side, behind the ditch: a parallel
  road 3.5 m wide, asphalt, no markings, used by cyclists and tractors. It ends at farm entrances
  and minor side roads 100–300 m before each roundabout, so its users never cross the N-road or a
  ring in this slice.
- **Cyclists:** a new variant `bike` (rider and bicycle, a pedalling animation, front white and
  rear red lamp at night), 15–25 km/h, alone or in twos side by side.
- **Tractors:** a new variant `tractor` (with or without a trailer, an amber beacon), 25–40 km/h.
- Their own small `Traffic` per direction on the parallel road (one lane, IDM, no lane changes),
  spawned from and removed at farm entrances and side roads along it. They never interact with the
  N-road traffic. They draw within the F-54 instanced budget.

### 5.8 What the rest of the code sees (*proposal*)

- `src/route.js` (F-30): node types `roundabout`, `tjunction`, `aansluiting`; edge classes
  `N-80`, `N-minor`, `parallel`; edge generation for N-roads.
- New `src/roundabout.js` (no Three.js): ring geometry, the ring sim, entries and exits, the
  handover to and from arm traffic; also the give-way rule the T-junction uses.
- `src/traffic.js`: one-lane classes (no lane changes, no overtaking), the class limit, destination
  rolls at nodes, the handover at give-way lines.
- `src/junctions.js`: the crossing road and roundabouts as part of the aansluiting; the exit and
  ramp behaviour of 5.5 when `CONFIG.nroads` is on.
- `src/player.js`: driving on a single carriageway without a median barrier (the verge, the ditch:
  leaving the road onto grass slows you, as the hard shoulder does now), and on the ring.
- `src/scenery.js` + a new `src/nroadScenery.js`: the N-road cross-section and furniture, the
  roundabout, signs, the parallel road, tree rows and farmyards at the cuts.
- `src/variants.js`, `src/vehicles.js`, `src/vehicleInstances.js`: `bike`, `tractor`.
- `src/perception.js`, `src/botDriver.js`, `src/moments.js`, `src/lanemap.js`, `src/msi.js`: one-lane
  roads, rings and give-way lines; the lane-change detectors stay quiet where there's one lane.
- `src/futureScenery.js` (F9 world): the guideway spine stays on motorways; on N-roads the future
  world shows the road as it is (*proposal*; a promised N-road is a later F-60 idea).
- `CONFIG.nroads` (new): on in free play in the browser, off for every existing tool and scenario
  unless it asks for N-roads.

## 6. Steps

### Step 1: off the motorway and along the N-road (*proposal* throughout)

1. **Extend F-30's section 9 first.** Before code, the builder writes into this plan (a new
   section 9) how the ring, the arms, the handovers and the T-junction fit F-30's lane and route
   representation. 5.4–5.6 are the proposal; the builder may choose another representation that
   keeps their rules and says why.
2. **Classes and nodes in `route.js`:** `N-80`, `N-minor`, `roundabout`, `tjunction`, `aansluiting`
   with the near and far roundabouts; N-road edge generation (5.3 curves, 5.2 placement).
3. **`src/roundabout.js`:** the ring sim and entries/exits of 5.4, the T-junction give-way.
4. **Traffic:** one-lane classes, limits, destination rolls, handovers; exiting AI goes round and
   away, on-ramp AI comes from the roundabout (5.5).
5. **Player:** off the motorway by the exit road, round any ring, along any arm; the single
   carriageway, verge and ditch; the barrier on the far on-ramp.
6. **Scenery:** the N-road (5.3), the roundabouts and their signs and masts (5.4), the dumbbell's
   roundabouts on today's crossing roads, the barrier, the tree rows and farmyards at the cuts.
   Draw calls within the `npm run perf` budget at the busiest roundabout.
7. **Choose, cut, re-base** (5.6) for every node type, and the journal's `route` events.
8. **`?scenario=nroad`:** day, motorway density 10, start 2,500 m before an exit in lane 0 at
   100 km/h.

Not yet in step 1: the parallel road with cyclists and tractors, the way back onto a motorway
(every third roundabout is an ordinary roundabout for now), the bot on N-roads.

Checks for step 1: `npm run build`; with N-roads off, every tool F-30 lists reproduces its
baseline; `worldtest` extended (section 8); a headless probe drives the player proxy off the
motorway and through 5 roundabouts on 3 seeds, taking a different arm each time (continuing,
another `N-80`, an `N-minor` to its T-junction): the route continuous, a re-base at each, the window
count back to target within 60 s of each cut, 0 collisions, no AI overtaking, no ring car standing
> 2 s.

**Stop here for the user to try.** Does the roundabout drive like a Dutch one, does the AI read
right going round, is a single lane at 80 calm or tiresome, do the arms and the motorway drop out
of sight without popping?

### Step 2: cyclists, the way back, the bot and the measuring tool (*proposal*)

1. **The parallel road** with cyclists and tractors (5.7), `bike` and `tractor` variants, night
   lamps.
2. **Back onto a motorway:** the aansluiting roundabouts on N-roads (5.2), both on-ramps open, the
   new motorway generated both ways from the junction (5.5), the F-20 merge and run-out as today.
3. **The bot:** perception of rings, give-way lines and one-lane roads; it slows for, gives way at
   and indicates out of roundabouts; route choice per node (`route=` as in F-30 step 2.3, plus
   `nroad` to take exits).
4. **`npm run nroads`** (`tools/nroads.js`, `tools/nroadsuite.js` after `exitsuite`): N-road
   densities 3 and 6 × 4 seeds, the bot taking a mix of arms. Reports: collisions, ring standstills,
   wait at the give-way line with and without conflicting ring traffic, entry queue length,
   indicator time before leaving, destination shares against their weights, on-ramp flow against
   `rampPerMin`, overtakes (must be 0), window density against the first bucket.
5. **The pocket run:** `npm run nroads -- pocket`: 60 minutes, the bot through ≥ 15 roundabouts and
   at least one motorway → N-road → motorway round trip.

## 7. Not doing

- Traffic lights at the ramp top (*decided*: the later alternative).
- Overtaking on the N-road, by anyone (*decided*: personas doing it anyway come later).
- Cyclists or tractors crossing the N-road or a roundabout, cyclist priority, cycle crossings.
- Turning around: back onto the motorway the way you came (*decided*: comes with the map).
- Built-up areas, villages, 50 km/h roads (the Town horizon in `docs/vision.md`).
- Navigation and route guidance (F-33); a fixed map (F-30, later).
- Two-lane (turbo) roundabouts, traffic-light junctions, roads with overtaking allowed: later
  variants (*decided* "situations will vary later").

## 8. How we'll know

- **With N-roads off:** `simtest`, `personas`, `moments`, `bottest`, `onrampsuite`, `exitsuite`,
  and F-30's `splits` reproduce their baselines number for number; `npm run build` passes.
- **`npm run worldtest`, extended:** over 300 km of generated N-road taking arms in turn: route
  continuous at every node and re-base (gap < 1 cm, heading jump < 0.001 rad); roundabout spacing
  2–5 km; about one in three is an aansluiting (step 2); every `N-minor` arm meets an `N-80` within
  3 km; every cut has a tree row, farmyard or barrier belt between it and the road taken; no
  parallel-road user path crosses the N-road or a ring; ring geometry as 5.4 (outer radius 18 m,
  lane 5.5 m).
- **Step 1 probe** (end of step 1) and **`npm run nroads`** with the targets in section 3.
- **The pocket run** (step 2.5).
- **`npm run perf`:** the busiest roundabout and a junction dumbbell at motorway density 25 stay
  under the 1,500 draw-call budget.
- **Full check** per `AGENTS.md`; note in this plan how long `nroads`, `nroadsuite` and the pocket
  run took the first time.

**Try it:** `npm run dev`, open `?scenario=nroad`. Follow the AI cars onto the exit and up the exit
road to the roundabout: give way to the car on the ring, go round, indicate right and leave by the
arm opposite. Drive the N-road behind whoever is ahead (no overtaking), and through the next two
or three roundabouts, taking a different arm each time; one side arm leads to a T-junction with
another N-road. Look back on the way out: the far on-ramp is closed with a barrier, and the
motorway drops behind the poplars. After step 2: cyclists and tractors on the parallel road, and a
roundabout signed for a motorway that takes you back up an on-ramp.

## Needs first

- **F-30 slice 1 built** (Q-21 and Q-22, `docs/specs/F-30-splits.md`): the graph, road classes,
  route frame, lane layout by `s`, cut and re-base, and its section 9. Nothing of it is built yet
  (both queued). This plan's step 1.1 builds on that section 9.
- **Q-19 (jams calibration)** goes before Q-21 already; this build checks against the baselines it
  re-saves.
- Exists and is reused (checked 2026-11-27): the aansluiting geometry in `src/junctions.js`
  (`exitPath`, `rampPath`, `roadSegments`, `mirrorS`, `DECK_Y`), `updateGiveWay` and
  `spawnFromRamp` in `src/traffic.js`, the `lanes` option of `Traffic`, the variant table in
  `src/variants.js`, instanced drawing in `src/vehicleInstances.js`, the scenario table in
  `src/scenarios.js`, `tools/exits.js` and `tools/exitsuite.js` as the pattern for the new tool.

## Not in this build

- Which N-numbers and place names to put on signs beyond made-up ones; whether the HUD shows the
  road you're on.
- AI headlight behaviour on unlit N-roads at night (dipping for oncoming traffic): open, for after
  the night drive.
- Cyclist crossings, traffic lights, overtaking personas, turbo roundabouts: section 7.
- The promised N-road in the F9 world (F-60).
