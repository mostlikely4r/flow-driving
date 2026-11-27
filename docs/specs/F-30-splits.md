# F-30 slice 1: the road splits (wegsplitsing) (spec)

Status: ready to build. Written 2026-11-27. BACKLOG item **F-30** (Road network graph). First slice
of the graph: one kind of node, a motorway that splits into two motorways, on a road that goes on
forever. Talked through with the user on 2026-11-27.

*Decided* marks the user's own calls. *Agreed* marks a proposal of the planner's that the user said
yes to in the talk. *Proposal* marks the planner's own; the builder may change a proposal's numbers
or mechanism if the code or a measurement says so, and notes why in this file and the BACKLOG line.

## 1. Why

What the user said (2026-11-27):

- *Decided:* **Both kinds of destination come eventually:** a junction leading to a country road
  (N-road, F-31: new rules, new visuals) and a junction leading to another motorway.
- *Agreed:* **Another motorway first.** Reason given: F-30 is mostly graph work. A
  motorway-to-motorway link uses only driving we already have (leaving like an exit, F-21;
  merging, F-20; the motorway AI), so whatever breaks is the graph, not a new rule set. The N-road
  needs oncoming traffic in the same carriageway, overtaking across the centre line and priority
  rules: that is half of the Town horizon in `docs/vision.md` and comes later, as a second road
  class on a graph we already trust.
- *Agreed:* **The first shape is a wegsplitsing, not a flyover interchange.** The motorway splits:
  some lanes go one way, the rest the other, with a gore and overhead lane signs. The klaverblad
  (F-41) and flyover connectors come later on the same graph.
- *Agreed:* **Every road (edge) has a road class from the start:** lane count, limit,
  cross-section, which rules apply. Only motorway classes exist in this slice; the N-road is a
  later class, not a rewrite.
- *Decided:* **Eventually there is a map:** cities and places connected by roads. **For now the
  road going on forever is fine.**
- *Decided:* **A loop would also be fine, as long as there is no pocket** that "only fills and
  fills until weak traffic turns into a permanent jam."
- *Agreed:* **The split is 3 lanes that continue and 2 that leave,** from a 5-lane stretch before
  the gore. You can stay on the familiar 3-lane road or bear off onto a new 2-lane one. The 2-lane
  road with a plain 100 km/h limit is what makes it feel like somewhere else.
- *Agreed:* **About one split per 15–25 km of driving,** with the ordinary junctions
  (aansluitingen) in between: met within about ten minutes, rare enough to stay an event.

From the code (read 2026-11-27):

- **One centre line.** `src/road.js` is one infinite procedural centre line (the median),
  generated in 2 m steps from a seeded rng, sampled by a single `s`. Both carriageways hang off it
  (`lat` from the median, positive = your side). Files that sample it directly: `castStage.js`,
  `closureView.js`, `futureScenery.js`, `lanemap.js`, `main.js`, `player.js`, `scenery.js`,
  `trafficView.js`.
- **One lane count.** `CONFIG.lanes` (2..5, menu-settable) is read in 14 files: `botDriver`,
  `closureView`, `journal`, `lanemap`, `layout` (5×), `main`, `moments`, `msi`, `perception`,
  `player`, `scenery` (6×), `session`, `textures`, `traffic`. Lanes are indexed from the right
  (`lane 0` = rightmost); `laneLat(i, n)` gives a lane centre from the median, and the formula
  already works for negative `i` (lane −1 is the hard shoulder and the exit lane today).
- **One limit per carriageway.** `Traffic.limitKmh` / `setLimit()`; the limit comes from
  `speedLimitKmh()` (`CONFIG.speedLimitDay` 100, `CONFIG.speedLimitNight` 130).
- **The world is placed by `s`.** Junctions (`src/junctions.js`) are seedless, one per block of
  `junctionEveryKm` [3, 6]; gantries at every km + 160 / + 660 (and + 860 on some); scenery
  streams in 200 m chunks (`scenery.js`, `CHUNK`) from `sPlayer − 600` to `sPlayer + 2800`, with
  per-km hashes; `inJunction(s, lat)` keeps trees off junction works.
- **Traffic only exists near you.** `Traffic` simulates `rangeAhead` 1,500 m ahead and
  `rangeBehind` 900 m behind (oncoming: 2,100 ahead, 350 behind, no spawning behind, visuals only).
  `maintain()` removes cars 250 m outside the window and spawns at both edges towards a target
  density (`density × N × densityFactor(s)`). Nothing persists outside the window.
- **Exits are the pattern to reuse.** F-21: `updateExits()` rolls a share of the cars passing
  between 2,500 and 1,000 m before an exit; an exiting car gets an exit wish in the lane-change
  decision (`exitUrge`, `exitNoLeft`, `exitGo()` by `mergeEarly`), moves right early, crosses onto
  the exit lane at motorway speed and, if still in the wrong lane at `sGore − 30`, misses rather
  than dives (`exitLogic()`).

From measurement (F-22 calibration, `docs/specs/F-22-calibration.md`, 2026-11-27): a plain lane
carries ~1,550 veh/h/lane at ~20 veh/km/lane today; queue discharge ~1,060 veh/h/lane (Q-19 will
raise both towards real numbers).

Guesses this plan rests on (no drive or measurement behind them yet):

- That the split reads as Dutch and is easy to choose: the lane layout, the signs, the gore, the
  one flyover.
- That the 2-lane road past the split feels like a different road.
- That a tree belt between the branches hides the branch you didn't take, so it can be cut off
  out of sight.
- The numbers marked *proposal* below (where lanes open, the branch share, the curve radii).

So step 1 is the smallest version the user can drive through and choose a branch in, and the AI
choosing branches comes after.

## 2. The picture

Twelve kilometres into a drive, a blue sign beside the road: *Knooppunt Hoornwijk 2 km*. Over the
next kilometre a fourth and then a fifth lane open on the right. Gantries span all five lanes: over
the left three an arrow straight on, *A12 Utrecht*; over the right two an arrow bearing right,
*A27 Breda*. Cars bound for the A27 drift right in ones and twos, the way exiting cars do now. At
the gore the road divides with a crash cushion at the nose. Stay left and you drive on along the
3-lane A12, and a moment later pass under a bridge: the A27's other carriageway, flying over you to
join the far side. Bear right and you're on a 2-lane road curving away, with plain *100* signs, its
own oncoming traffic beside you once that carriageway has come back down from the bridge. Within a
kilometre a belt of trees grows between the two roads and the other one is gone. Fifteen to
twenty-five kilometres later, on whichever road you're on, it happens again.

## 3. Goal and non-goals

**Done when** (step 2 makes these measurable; numbers are *proposals*):

- You can drive into either branch of every split in free play, and the road goes on forever on
  whichever you took.
- The route behind and ahead of you is continuous: no gap, kink or jump in the road, the scenery
  or the traffic at a split or when the world re-bases onto the branch (step 1.6).
- AI cars choose branches: the share taking the branch is within ±5 points of its setting; ≤ 5% of
  cars bound for the branch miss it at density 8, ≤ 15% at density 12.
- Cars bound for the branch are in its lanes early: median ≥ 800 m before the gore.
- Nobody brakes at the gore: median speed of a car passing the gore nose ≥ the lane speed there
  − 10 km/h; no car stands still (v < 1 m/s for > 1 s) before the gore at density ≤ 12.
- **No pocket** (*decided* requirement): in a 60-minute run at density 20 through at least three
  splits, the mean vehicle count in the window per 10-minute bucket stays within 10% of the first
  bucket, and no queue stands at a gore for more than 30 s.
- 0 collisions; emergency stops (acc < −6) no more than the no-split control.
- With splits off, every existing tool reproduces its baseline number for number.

**Non-goals:** see section 7 (Not doing) and the end (Not in this build).

## 4. Baseline (do not revert or redesign)

- Everything in section 1 "from the code". The exits (F-21), on-ramps and run-out (F-20), closures
  and matrix signs (F-23), the F-48 future world behind F9, and the instanced vehicle drawing
  (F-54) stay as they are.
- Tool baselines that must not move with splits off: `tools/onramp-baseline.json` (and whatever
  Q-19 re-saves), `npm run exitsuite`, `simtest`, `personas`, `moments`, `bottest`, `worldtest`.
- Traffic ids are one global counter and the journal records them (`main.js`): a split must not
  spend ids or rng draws when no split is in range, so a run without splits is the run it was.

## 5. The model

### 5.1 The graph, and the route you drive (*proposal*)

- **Edge:** one road. Has an `id`, a `class` (5.2), its own centre line (a `Road` from
  `src/road.js`, seeded from the parent's seed and the node id), and an arc length of its own.
  Edges are generated lazily, as the road's curves are now.
- **Node:** where edges meet. This slice has one type, `split`: one edge in, two out
  (`continue`, the same class as the edge in, and `branch`, the other class). Nodes are placed
  along an edge from its seed, the first 8–12 km from the start of free play, then every
  15–25 km (*agreed* spacing).
- **Open at both ends** (*decided*, from "no pocket"): every edge has its own demand (the target
  density its spawner and later the far layer F-61 fill it to), traffic enters at the upstream end
  and on-ramps and leaves at the downstream end and exits. Nothing is ever a closed loop of
  conserved vehicles. Today's near window already behaves this way (nothing outside it persists);
  this rule is written into the graph so F-61 and a later map keep it.
- **The route frame.** The sim, the scenery and the player keep one coordinate `s`: the distance
  along the route you drive. A new `src/route.js` (no Three.js) maps route `s` to pieces of edges
  and offers the API the eight sampling files use today (`sample`, `toWorld`, `project`, `ensure`,
  `sStart`, `sEnd`), so a route with no split behaves exactly like `Road`. Past a node, both
  branches share route `s` (the distance from the node along each branch's own centre line), and
  the lanes of each branch follow their own centre line (5.3).
- **The later map** (*decided* direction, not built here) uses the same Edge and Node records,
  loaded from data instead of generated.

### 5.2 Road classes (*proposal*, after the *agreed* 3 + 2)

| Class | Lanes | Limit | Signs |
|---|---|---|---|
| `A-wide` | `CONFIG.lanes` (3 by default) | `speedLimitKmh()`: 100 day / 130 night, as now | as now |
| `A-narrow` | 2 | 100 at all hours | plain 100, no time plate |

The branch is always the other class from the road it leaves, so the road alternates. If
`CONFIG.lanes` is 2, the start road is `A-narrow` and its branch is `A-wide` with 3 lanes. A
vehicle's `v0base` comes from the class of the edge it is on (today it comes from `Traffic.limitKmh`).

### 5.3 The split, in your direction (*proposal* numbers; the 3 + 2 shape is *agreed*)

Marks along route `s`, from the gore nose `g`:

- `g − 2000`: blue pre-announcement sign beside the road, *Knooppunt <name> 2 km*.
- `g − 1600`: lane −1 opens on the right (80 m taper, like the F-21 exit lane). The hard shoulder
  moves out with it.
- `g − 1200`: first lane gantry over all lanes: arrows and route shields per lane (*A12 Utrecht*
  over the continuing lanes, *A27 Breda* over the branch lanes).
- `g − 1000`: lane −2 opens (80 m taper). Five lanes from here: 0..2 continue, −1 and −2 are the
  branch.
- `g − 600`: second lane gantry, same faces.
- `g − 300`: the painted gore starts between lane 0 and lane −1 (a solid line: no lane changes
  across it from here).
- `g`: the gore nose with a crash cushion. Past it the branch lanes follow the branch centre line,
  curving right (radius ≥ 750 m at first, then the branch's own generated curves), with its own
  guardrails and hard shoulder.
- `g + 900`: the branches are ≥ 60 m apart; a tree belt (30 m deep) runs between them from here.
- `g + 1500`: **the cut**: the end of the branch you didn't take, for the sim and the scenery
  (5.5).

Rules:

- No aansluiting (junction), matrix gantry, random closure or viaduct within `[g − 4000, g + 2500]`
  on either branch. `junctionsNear()`, the gantry placement, `overpassS()` and the free-play closure
  roll in `session.js` skip that zone.
- The split zone is lit, as real knooppunten usually are (`junctionLitAt` grows a `splitLitAt`).
- The split's names: route numbers from `ROUTES`, places from `DUTCH_PLACES`, the knooppunt name
  from a short list of made-up Dutch names (no real knooppunt names).
- Scenery on the branch you can see but haven't taken uses a different hash salt from the route's
  own, so the same farm is not standing at the same `s` beside both branches.

### 5.4 The one flyover (fact from geometry; which road flies is a *proposal*)

Right-hand traffic and a Y split need exactly one crossing: the branch's oncoming carriageway must
get from the far side of the branch to the oncoming side of the trunk, across the continuing
carriageway. *Proposal:* the branch's oncoming carriageway climbs on its own connector and flies
over the continuing carriageway between `g + 400` and `g + 800`, deck clearance 4.8 m (the bridge
height F-48 settled on), and lands on the median side of the trunk's oncoming carriageway as two
added lanes. In the oncoming direction those two lanes end with a lane drop ~1 km later, one at a
time. So:

- Stay on the continuing road: you pass under the bridge.
- Take the branch: its oncoming carriageway runs apart from you at first (on the connector), and
  comes in beside your median from about `g + 1000`.

### 5.5 Choosing, the cut, and re-basing (*proposal*)

- **You choose by lane.** The group (continue or branch) your car's centre is in at the gore nose
  is your route. Hitting the cushion is a crash like hitting a barrier.
- **Before you choose,** both branches exist ahead of you in full: the sim window and the scenery
  range run along both up to their usual distance.
- **When you choose,** the other branch is cut at `g + 1500`: no more spawning on it, its vehicles
  past the cut are removed (they are behind the tree belt), the rest drive on and are removed when
  they reach the cut or fall out of the window. Its scenery chunks past the cut are disposed and
  rebuilt for your route (they are out of sight).
- **Re-basing, when you took the branch:** until then you drive in the branch lanes (−1, −2) of the
  old road's frame. Once the window behind you is clear of the split (`sPlayer − rangeBehind −
  250 > g + 300`) and no vehicle is left on the cut-off road, the branch becomes the route: lanes
  renumber so the branch lanes are 0..n−1, the branch centre line is the route's, and the edge
  class sets the limit. No position (`s`, world x/z) changes, only lane numbers and which centre
  line is "the route". The journal records it (5.6).
- **Taking the continuing road** needs no re-base: the cut-off branch drops away as above.
- **The rule the AI and the player both need:** "the rightmost lane of my road" and "the lanes I may
  use" become questions about the lane layout at `s` and the vehicle's group, not `lane 0` and
  `CONFIG.lanes`. Before the gore, a car bound for the continuing road treats −1 and −2 as not its
  lanes (it does not keep right into them).

### 5.6 What the rest of the code sees (*proposal*)

- `src/layout.js`: `laneLat`, `laneAt`, `lanesOccupied`, the edge lines and guardrail positions
  take the lane layout at `s` (count, group, which centre line) instead of `CONFIG.lanes`.
- `src/traffic.js`: lane lists per lane index as now; past the gore, lanes of the two groups never
  see each other as leader or follower (they don't today either: lists are per lane). Spawning per
  group by its class and demand. Lane-change candidates limited to the vehicle's group and the
  layout at its `s`. `maxLaneFor`, the keep-right term and the truck lane rules work relative to
  the group's rightmost lane.
- `src/player.js`: projects onto the route and, in the split zone, onto the branch; barriers and
  the hard shoulder per group.
- `src/journal.js`: a `route` event at choosing (node id, which branch) and at re-basing (node id,
  lane shift); journal v3. `src/moments.js`, `src/perception.js`, `src/botDriver.js`,
  `src/lanemap.js`, `src/msi.js`: lane counts from the layout at `s`.
- `src/scenery.js`: the split's road surface, markings, gore, cushion, guardrails, the flyover and
  its connector, the gantries and signs, the tree belt; `inJunction` grows a split test so trees
  stay off all of it.
- `src/futureScenery.js` (F9 world): the guideway spine stops for the whole split zone
  (`[g − 4000, g + 2500]`), as it stops for junction bridges. Whichever of this build and Q-16
  lands second makes the other respect it.
- `CONFIG.splits` (new): `true` in free play in the browser; **off** for every existing tool and
  scenario unless it asks for splits, so their baselines hold.

## 6. Steps

### Step 1: the split you can drive (*proposal* throughout)

1. **Write the lane representation down first.** Before code, the builder reads the lane
   assumptions in the 14 `CONFIG.lanes` files and `traffic.js`, and writes into this plan (a new
   section 9) how lanes are numbered across the split, the cut and the re-base, and how "rightmost
   lane of my group" is asked. 5.5 is the proposal; the builder may choose another representation
   that keeps the rules in 5.5 and says why.
2. **`src/route.js`:** edges, nodes, classes, lazy generation, the route frame with the `Road`-like
   API. With `CONFIG.splits` off it returns exactly what `Road` does (a check in `worldtest`).
3. **Lane layout by `s`:** `layout.js` and the files listed in 5.6 ask the layout at `s` instead of
   `CONFIG.lanes`. With splits off nothing changes.
4. **Scenery:** everything in 5.3 and 5.4 drawn, both branches ahead before you choose, the cut
   after. Draw calls within the `npm run perf` budget at density 25 standing in the split zone.
5. **Player:** drive into either branch; barriers, the cushion, the hard shoulder per group; HUD
   limit from the class of the edge you're on.
6. **Choose, cut, re-base** (5.5) for the player and the traffic window; the journal's `route`
   events.
7. **Traffic, the minimum:** AI cars stay in lanes 0..2 before the gore (−1 and −2 are not theirs
   yet); past the gore the spawner fills each branch by its own class and demand, so the branch
   ahead of you is not empty; after a re-base traffic is the branch's class (limit, lanes).
   Oncoming traffic as today on the trunk; the branch's oncoming carriageway (and the flyover)
   carries no traffic yet.
8. **`?scenario=split`:** day, density 10, start at `g − 3000` in lane 1 at 100 km/h, so you meet
   the split within two minutes.

Checks for step 1: `npm run build`; with splits off, `simtest`, `personas`, `moments`, `bottest`,
`onrampsuite`, `exitsuite` reproduce their baselines; `worldtest` extended (section 8); a headless
probe drives the player proxy through one split in each group (lane 1 → continue, lane −2 →
branch) on 3 seeds: route continuous, re-base happens after a branch choice, lanes and limit are
the branch's after it, no vehicle in a lane that doesn't exist at its `s`, the window's vehicle
count back to its target within 60 s of the cut, 0 collisions.

**Stop here for the user to try.** Does the split read as a Dutch wegsplitsing, is it easy to
choose, does the 2-lane road feel like somewhere else, does the other branch go out of sight
without popping?

### Step 2: AI cars choose a branch, and the measuring tool (*proposal*)

1. **Destination roll:** like `updateExits()`, cars passing between `g − 3500` and `g − 2000` are
   rolled once per node: `CONFIG.splitShare` 0.30 of cars, vans and caravans, 0.25 of lorries, take
   the branch. Rolls happen only when a split is in range (no rng draws otherwise). A scripted car
   and a car already holding an exit are not rolled. Spawned cars past the gore are already on
   their branch; cars spawned behind the gore are rolled as they pass.
   Why 0.30: at density 20 the 3 continuing lanes carry ~4,650 veh/h today, so 30% is ~1,400 veh/h
   on 2 lanes, well under their ~3,100 capacity. The branch can't become the pocket.
2. **Moving over:** a car bound for the branch gets the exit-style wish (`exitUrge`) towards lane −1
   from `exitGo()` before `g − 1000`, plus the existing lane-change rules within the 5 lanes; it
   does not slow down for it (it's a motorway, not an exit road). A car bound for the continuing
   road treats −1/−2 as not its lanes. Past `g − 300` (the solid line) no one crosses between the
   groups; a car still in the wrong group there takes that branch (a miss, readable, never a dive).
3. **The bot:** `botDriver` gets a route choice per node (`route=continue|branch|mix`, seeded for
   `mix`) and holds the matching lanes, so playtests cover both.
4. **`npm run splits` (`tools/splits.js`, `tools/splitsuite.js` as `exitsuite`):** densities 8 and
   12 × 4 seeds × player continues/branch, plus a no-split control per run. Reports: share taken,
   misses, the distance before the gore at which branch-bound cars are in their lanes for good,
   speed at the gore nose against lane speed, standing cars before the gore, braking under −4
   caused by a lane change into −1/−2, collisions, emergency stops, window density against the
   control.
5. **The pocket run:** `npm run splits -- pocket`: density 20, 60 minutes, the player (bot) through
   at least 3 splits with `route=mix`; 10-minute buckets of vehicles in the window, and the
   longest standing queue at any gore.

### Step 3: oncoming traffic on both branches (*proposal*)

1. The oncoming `Traffic` carries the branch's oncoming carriageway too: cars spawned on it ahead of
   you come over the flyover and onto the trunk's oncoming carriageway as two added lanes on its
   median side, which end ~1 km on with one lane drop at a time. The drop is the closure merge
   (`addClosure` in the oncoming `Traffic`, zipping as now), drawn as a lane-end with the arrows,
   not cones.
2. After a re-base onto the branch, oncoming traffic is the branch's, as on any road.
3. Oncoming is visuals only, as today; a collision count on the oncoming side goes into the
   `splits` report anyway.

## 7. Not doing

- The N-road as a destination (F-31). It is a later road class on this graph.
- A fixed map or a loop. The road goes on forever for now (*decided*); the map comes later from the
  same records.
- Joins in your direction (another motorway merging onto yours at a node). Only the oncoming side
  joins in this slice.
- Klaverblad and flyover interchanges (F-41), connectors with their own speed limit.
- Navigation, voice and HUD arrows (F-33), trip mode (F-34).
- Far traffic (F-61). It builds on this graph (5.1, open at both ends), not the other way round.
- Per-edge placement of junctions and scenery. Both stay a function of route `s` as now; after a
  split the world beside the road differs only by the road's own curves. Per-edge placement comes
  with the map.

## 8. How we'll know

- **With splits off:** `simtest`, `personas`, `moments`, `bottest`, `onrampsuite`, `exitsuite`
  reproduce their baselines number for number; `npm run build` passes.
- **`npm run worldtest`, extended:** over 500 km of generated route with splits on, taking each
  branch in turn: route position continuous across every node and re-base (gap < 1 cm, heading
  jump < 0.001 rad, curvature ≤ 1/750 m in the split zone); flyover clearance ≥ 4.8 m over the
  carriageway it crosses; no junction, matrix gantry, viaduct or random closure in
  `[g − 4000, g + 2500]`; branches ≥ 60 m apart at `g + 900` with the tree belt there; node spacing
  15–25 km and both classes appear; the F-48 spine has no span inside a split zone; with splits off
  `route.js` samples identical to `Road`.
- **Step 1 probe** (end of step 1) and **`npm run splits`** with the targets in section 3, against
  its no-split control.
- **The pocket run** (step 2.5): buckets within 10% of the first, no gore queue standing > 30 s.
- **`npm run perf`:** density 25 standing in a split zone stays under the 1,500 draw-call budget.
- **Full check** per `AGENTS.md`; note in this plan how long `splits`, `splitsuite` and the pocket
  run took the first time.

**Try it:** `npm run dev`, open `?scenario=split`. In about a minute and a half a fourth and fifth
lane open on the right under the *Knooppunt* gantries. Stay in lane 1 to drive on along the A12
and under the bridge, or move into the right two lanes and bear off onto the 2-lane road with its
plain 100 signs; the other road disappears behind the trees. Then play free: a split every 15–25 km,
the first within about 7 minutes. After step 2, watch the cars around you sort themselves into the
two lane groups from the first gantry on.

## Needs first

- **Q-19, the jams calibration build** (`docs/specs/F-22-calibration.md`): it rewrites the spawner
  and per-driver setup in `traffic.js` and re-saves the tool baselines. This build changes the same
  spawner (per group) and checks against those baselines, so it goes after. Not built yet
  (queued).
- **Q-14, rain** (`docs/specs/F-24-rain.md`) also changes the traffic step; build after it if it
  is still ahead in the queue, so the two don't fight over `traffic.js`. Not built yet.
- **Q-16, guideway slice 1b** touches `futureScenery.js` and `worldtest`; whichever lands second
  makes the spine stop for split zones (5.6). Not a blocker.
- Exists and is reused (checked 2026-11-27): `Road` (`src/road.js`), `laneLat` with negative lanes
  (`src/layout.js`), the exit wish and miss logic (`exitGo`, `exitLogic`, `updateExits` in
  `src/traffic.js`), `addClosure` and the zip merge, the junction sign builders
  (`junctionSigns` in `src/scenery.js`), the scenario table (`src/scenarios.js`), `tools/exits.js`
  and `tools/exitsuite.js` as the pattern for the new tool.

## Not in this build

- Which knooppunt names to use beyond the made-up list, and whether the HUD shows the road you're
  on (*A27*). Open for the user after the drive.
- Hectometre posts and confirmation signs after the split.
- Joins in your direction, the N-road class, the map, per-edge scenery: section 7.
- How F-61's far layer maps onto edges: its own spec (Q-18), which should start from `src/route.js`.
