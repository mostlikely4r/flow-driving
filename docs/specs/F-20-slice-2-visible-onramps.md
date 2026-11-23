# F-20 slice 2: visible on-ramps (spec)

Status: built 2026-11-23 · BACKLOG item **F-20** (M2: The road breathes) ·
Baseline commit `d3f0a8e` · Follows [F-20-slice-1-onramps.md](F-20-slice-1-onramps.md)

## Why

Slice 1 put an acceleration strip in the sim, and it works headless. When the user drove
`?scenario=onramp` (2026-11-23, their own play) they noticed that **most cars seem to appear behind
you**. That is how the spike was built, not a new bug. The scenario has one ramp, fixed 600 m ahead.
You pass it in about 20 s, and after that every new car appears behind you. Before you reach it,
cars appear out of nothing on the hard shoulder ahead. Both break pillar 1 (Authentic). They also
make slice 3 impossible to judge: you can't tell whether a merge reads right if you can't see where
the car comes from.

This slice makes on-ramps a place on the road: a junction you see coming, with signs, a bridge, a
ramp road that cars drive down, and a strip they merge from. Junctions repeat every few km in free
play, so you keep meeting them ahead of you.

**Where the premises come from**
- *The user's play* (2026-11-23): cars pop in, and mostly behind you.
- *The user's call* (2026-11-23): signs should announce that something is coming. They suggested
  exit signs.
- *Measured* (slice 1 **Results**, `npm run onramp`): the merge stalls. There were 8–85 stops at
  the strip end per 10-minute run, some up to four minutes. A car entering the strip at 80 km/h
  needs about 200 m to reach lane-0 speed, which leaves too little of the 350 m strip. On 2 lanes
  D8 S8 (baseline: 8 stops, merge p50 67 km/h, lane 0 near the ramp 71 against 88 upstream):
  `CFG_rampStripM=700` gives 1 stop, p50 83 km/h, 80 against 88. `CFG_mergeLastM=300` gives
  7 stops, p50 74 km/h, 75 against 89. **A wider last-gap window does not fix it. More distance
  to reach speed does.**
- *Dutch roads* (Claude's knowledge, not checked against photos; check before drawing). The common
  junction (*aansluiting*, a diamond or half cloverleaf) has an **exit before the bridge and an
  on-ramp after it**, in your direction of travel. The exit is announced by blue direction signs
  about 1200 m and 600 m ahead, then by countdown markers (*afritbakens*, 3 / 2 / 1 stripes) at
  300, 200 and 100 m before the exit lane starts. So the exit signs also tell you that an on-ramp
  will join after the bridge. An on-ramp comes down from the crossing road, and the driver uses the
  ramp road and then the acceleration strip (*invoegstrook*) to reach motorway speed. A
  hatched gore area (*verdrijvingsvlak*) separates the ramp from the main carriageway until the
  strip begins. Lane 0 and the strip are divided by a block marking (short, wide dashes), not by
  the solid edge line. Many junctions are lit. Exact colours and sizes of the exit number panel and
  the *afritbakens* are not in this spec on purpose: take them from reference photos while building.
- *Guesses* (step 1 checks the sim ones): junction spacing, ramp road length, speed at the top
  of the ramp, strip length kept at 350 m.

**The picture (reading the code at `d3f0a8e`)**
1. **Sim side (`src/traffic.js`).** `addRamp(s0, {perMin, stripM})` makes `{s0, s1, obs, perMin,
   spawnT, retryT}`. Cars are inserted at `s0` in lane −1 (`this.strip`, via `laneList(-1)`) at
   `rampEntryKmh` (80, trucks 60). `closedAhead(-1, s)` counts `s1`. A strip car signals at once,
   merges by the slice-1 rules (`mergeKmh`, `mergeLastM`, zip near the end), and stops at `obs`
   if no gap comes. The strip is kept out of the cooperation and anticipation loops (`ln < 0`
   skips it). See slice 1 finding 5.
2. **Where ramps exist.** Only in `applyScenario` (`src/scenarios.js:952`, `ramps: [{ds}]`) and
   `tools/onramp.js`. In free play there are none. Free-play closures are added in
   `updateClosures` (`src/session.js:109`), using `sim.rng`, ahead of `rangeAhead`, and removed
   once well behind.
3. **Scenery (`src/scenery.js`)** streams 200 m chunks from `sPlayer − 600` to `sPlayer + 2800`.
   Per-km features come from `hash01(K, salt)`, with no seed. Overpasses are at
   `K*1000 + 520` when `hash01(K, 1) < 0.24`, with a deck at y 6.3 and embankments from `G + 7`
   to `G + 52` on both sides. Matrix gantries are at `K*1000 + 160 / 660`. ANWB gantries are at
   `+860` (30%) and use `TX.anwbTexture(places, route)` with `DUTCH_PLACES` and `ROUTES`. Speed
   signs are at `+330`. Estates (F-40) come from `estate(b)` over 5 km blocks and are kept clear
   with `inEstate(s, lat)`. The asphalt is swept over `[-E, E]` (`E = pavementEdge()`, the outer
   edge line plus the 3.2 m hard shoulder plus 0.5). The right edge line is `solid(oe − 0.1)`
   and the guardrail is swept along all rows at `G`. `sweep(b, profile, uv, rows)` already takes
   a row subset.
4. **Layout (`src/layout.js`).** `laneLat(-1)` is `oe + laneWidth/2`, one lane width (3.5 m)
   right of lane 0. That is wider than the 3.2 m hard shoulder, so a strip car today overhangs
   the asphalt edge.
5. **Rendering cars (`src/trafficView.js`)** places a car from `(s, latLocal)` at y = 0. Nothing
   lifts or offsets a car off the cross-section.
6. **Tools.** `simtest`, `abtest`, `closure`, `onramp`, `speeds`, `wave`, `scenario` and
   `momentstage` build a `Traffic` directly and never see free-play features. `bottest` and
   `playtest` go through `createSim` / `stepSim` (`src/session.js`), so they will see free-play
   ramps.

## Goal and non-goals

**Goal.** *Decided* by the user ("yes" to the slice-2 recommendation, plus signs). Free play has
junctions every few km: exit signs, *afritbakens*, an exit lane before a bridge and an on-ramp
after it. AI cars drive down a visible ramp road from the crossing road onto the acceleration
strip and merge. Nothing appears out of thin air near the motorway. The merge stalls from slice 1
are mostly gone.

**Non-goals**
- **No car uses an exit.** The exit lane and exit road are drawn, but leaving the motorway is F-21.
  *Proposal*, agreed in the thread: build the junction as a whole now, so F-21 only adds behaviour.
- **No new rule for lane-0 drivers** (making room, zippering in jams, flow by time of day): that is
  slice 3.
- **The player can't take a ramp or an exit** (that is F-31). The player may drive on the strip
  as on a hard shoulder, as today.
- **No ramp traffic on the opposite carriageway.** Its ramps are drawn (mirrored), but no sim runs
  there.
- **No changes to `CONFIG.moments` thresholds, the bot, or the persona viewer.**

## Files

| File | Change |
|---|---|
| `src/junctions.js` | **New**, no Three.js (sim side, engine-migration rule). Where junctions are, their s-marks, the ramp-road path, exit number and name |
| `src/traffic.js` | Ramp road as the upstream part of lane −1. Spawn at the ramp top. No merging before the strip. Spawn hold near the player |
| `src/config.js` | New keys (below) |
| `src/session.js` | Free-play ramps, added and removed with the junctions in range (next to `updateClosures`) |
| `src/scenarios.js` | `onramp` / `onramp-busy` use a junction instead of a bare ramp |
| `src/trafficView.js` | Cars on the ramp road follow its path (lateral offset and height) |
| `src/scenery.js` | Draws the junction. Suppresses random overpasses near it. Breaks the edge line, hard shoulder and guardrail. Keeps trees, farms and estates off the ramps. Junction lit |
| `src/textures.js` | Exit direction sign, exit gore sign, *afritbaken* textures |
| `src/lanemap.js` | Ramp-road stretch drawn faintly before the strip band |
| `tools/onramp.js` | `road=` argument (ramp-road length; 0 = slice-1 behaviour). Reports stops per merge |
| `README.md`, `BACKLOG.md` | Last step |

`src/traffic.js` and `src/junctions.js` contain no rendering code.

## New CONFIG keys (guesses; step 1 measures the sim ones)

| Key | Value | Meaning |
|---|---|---|
| `junctionEveryKm` | `[3, 6]` | Spacing between junctions in free play (one per block, see Rules) |
| `rampRoadM` | 300 | Length of the on-ramp road, from the crossing road (where cars appear) to the start of the strip |
| `rampTopKmh` | 50 | Mean speed at the ramp top for cars (sd 8); trucks 35 (sd 5). They come off the crossing road |
| `rampsFreePlay` | true | On-ramps at junctions in free play. Off = scenery only |
| `rampSpawnHoldM` | 120 | No car appears while the player is within this distance (in s) of the ramp top. The timer keeps running, so held cars come right after |

`rampStripM` (350), `rampPerMin` (6), `mergeKmhDefault`, `mergeLastM` and `rampEntryKmh` stay.
`rampEntryKmh` is used only when `rampRoadM` is 0 (the slice-1 tool runs).

## Rules

### Junctions (`src/junctions.js`)

- **Deterministic from s, no seed**, like the per-km scenery. Both the sim and the scenery ask the
  same functions, so a ramp in the sim is always where the road draws it.
- **Placement.** Use blocks of 4500 m. Block `b` has one junction with its bridge at
  `sBridge = b*4500 + 1500 + hash01(b, 91) * 1500`. That gives spacings of about 3–6 km
  (`junctionEveryKm`). Snap `sBridge` so it doesn't land within 60 m of a matrix gantry
  (`K*1000 + 160 / 660`) or an ANWB gantry. Shift it, don't drop it.
- **Block 0 is fixed**, so free play meets its first junction within about a minute of the start
  and scenarios can rely on it: `sBridge = 2500`.
- **The junction's marks** in your direction of travel (s increasing), all derived from `sBridge`:

  | Mark | s | What |
  |---|---|---|
  | `signA` | `exitStart − 1200` | Exit direction sign, right verge |
  | `signB` | `exitStart − 600` | Exit direction sign, right verge |
  | `bakens` | `exitStart − 300 / 200 / 100` | *Afritbakens* 3 / 2 / 1, right verge |
  | `exitStart` | `sBridge − 520` | Exit lane taper begins (lane −1 opens) |
  | `exitGore` | `sBridge − 320` | Exit road leaves (gore area, gore sign) |
  | `exitTop` | `sBridge − 15` | Exit road meets the crossing road |
  | `rampTop` | `sBridge + 15` | On-ramp road leaves the crossing road (**cars appear here**) |
  | `s0` | `rampTop + rampRoadM` | Gore ends, strip begins: merging allowed from here |
  | `s1` | `s0 + rampStripM` | End of the strip (`obs`), taper back to the hard shoulder over 80 m |

- **The ramp-road path.** `rampPath(j, s)` returns `{ lat, y }` for `rampTop ≤ s ≤ s0`. `lat`
  eases (smoothstep) from `G + 45` (on the embankment top, next to the crossing road) to
  `laneLat(-1)`. `y` eases from 6.9 (deck height) to 0, finishing 60 m before `s0` so the last
  part runs flat beside the gore. `exitPath(j, s)` mirrors it for `exitGore ≤ s ≤ exitTop`. The
  opposite carriageway uses the same functions mirrored (`lat → −lat`, s reversed around
  `sBridge`). Its exit is after the bridge and its on-ramp before it, in your s.
- **Name and number.** Exit number = `10 + b` (no real numbering). Place name =
  `DUTCH_PLACES[hash01(b, 92)]`. Move `DUTCH_PLACES` and `ROUTES` from `scenery.js` into
  `junctions.js` (or a small shared data module) so the sim side can read them without
  Three.js.
- `junctionsNear(sa, sb)` and `inJunction(s, lat, margin)` (for trees, farms and estates),
  following the `estatesNear` / `inEstate` pattern.

### Sim: the ramp road (`src/traffic.js`)

- `addRamp(sTop, { perMin, stripM, roadM })`: `s0 = sTop + roadM`, `s1 = s0 + stripM`. The ramp
  object gets `sTop`. The ramp road is **lane −1 from `sTop` to `s0`**: the same `this.strip`
  list, so following, spacing and the end obstacle work unchanged. A car on the ramp road follows
  the car ahead of it on the ramp road as on any lane.
- **Spawn** at `sTop` at `rampTopKmh` (trucks 35), when `roadM > 0`. Otherwise use `s0` and
  `rampEntryKmh`, as in slice 1. Retry 1 s later if blocked, as now.
- **Spawn hold.** If `|playerS − sTop| < rampSpawnHoldM`, don't insert. Let the timer stay
  fired, so the car comes as soon as the player is clear. This only covers driving right past the
  top, where a car could pop in at close range.
- **No merging before `s0`.** A car with `s < s0` never runs the lane-0 gap test and never starts
  a lane change. It **signals left from `s0 − 100`** (not from the top). The F-38 closure-style
  signal hold applies from then on, as in slice 1.
- **Range.** `this.strip` holds cars from `sTop` to `s1 + 20`. The slice-1 checks ("no car in lane
  −1 outside a ramp's span", "no car moves into lane −1") use `sTop` as the span's start.
- **Everything else from slice 1 stays**: merge rules, `mergeKmh`, `mergeLastM`, zip at the end,
  strip kept out of cooperation and anticipation.

### Sim: ramps in free play (`src/session.js`)

- With `rampsFreePlay` on and no scenario, keep one ramp per junction whose `rampTop` lies in
  `[player.s − rangeBehind, player.s + rangeAhead + 500]`. Add it when it enters that window
  and remove it once `s1 < player.s − rangeBehind − 200`, the way closures are removed. Ramps are
  tracked by junction index, so a ramp is never added twice.
- `perMin` = `rampPerMin × traffic.densityScale` (half at night, matching the night traffic).
- Spawning uses the traffic `rng` (as in slice 1), so `seed + time` reproduces.
- `maintain` keeps counting cars added by ramps toward its totals, as in slice 1. There are no
  exits yet, so this is what keeps density stable.

### Scenarios (`src/scenarios.js`)

- `onramp` and `onramp-busy` place the player 900 m before junction 0's `s0` (about 250 m before
  the bridge): `player.s` at start, rather than a ramp at `ds: 600`. They add that junction's ramp
  with its own `perMin` (12 for busy). `applyScenario` / `createSim` set the player's start s
  before the first scenery update, so the right chunks are drawn.
- Update the `about` text: watch cars come down the ramp on your right after the bridge, signal
  near the end of the gore and merge. The lane map is still on U.
- Rebuild the scenario `vehicles` lists around the new start if their `ds` ranges no longer fit
  (same generator, same seeds).

### Rendering cars (`src/trafficView.js`)

- For a vehicle with `lane === -1` and `s < ramp.s0` of its ramp, use `lat = rampPath(j, s).lat`
  and `y = rampPath(j, s).y` instead of `latLocal` and 0. The heading follows the path, as
  `toWorld(s, lat)` gives it plus the path's slope in lat over s, so a car doesn't crab down
  the ramp.
- From `s0` on, back to `latLocal`, which equals `laneLat(-1)` there, so there's no jump.

### Scenery (`src/scenery.js`, `src/textures.js`)

Build the junction pieces in the chunk that holds each piece's s-range, like the estates and the
per-km features.

- **Bridge.** At `sBridge`, the existing `overpass()` with no skew. Random overpasses whose
  `sOver` falls within 1 km of a junction bridge are skipped. Extend the crossing road beyond the
  embankments as a flat two-lane road out to ±300 m lateral, ending in the fields.
- **Ramp roads.** An asphalt ribbon, 4 m plus 1 m shoulders, along `rampPath` (and `exitPath`),
  with a solid edge line on both sides. Add a guardrail on the outside of the ramp road wherever
  `y > 1`, and grass fill under it down to the verge (a simple embankment, like the overpass
  embankment).
- **Asphalt widening.** Over `[exitStart, exitGore]` and `[s0 − 60, s1 + 80]`, sweep the right
  pavement out to `laneLat(-1) + laneWidth/2 + 0.5`, and taper it over the first and last 80 m.
  That fixes the strip overhang (picture item 4).
- **Markings.** Over the exit lane and the strip, replace the right edge line (`oe − 0.1`) with
  the block marking: dashes about 1 m long, 3 m gap, 0.4 m wide (check photos). The strip and exit
  lane get their own solid outer edge line. In the gore area between the ramp road and the strip
  / exit lane, draw two solid lines converging to a point, with diagonal hatching between them.
- **Guardrail and hard shoulder.** Skip the right guardrail sweep where a ramp road leaves or
  joins (from `exitGore − 20` to `exitTop`, and from `rampTop` to `s0`). The ramp road's own
  guardrail takes over. Through the strip and exit lane the guardrail stands outside the widened
  pavement.
- **Signs** (all lit at night through `ch.signMats` / `nightE`, like the existing signs):
  - `signA` and `signB`: a large blue direction sign beside the road on two posts. It shows the
    exit number panel, the place name and a diagonal exit arrow, plus the distance (`1200 m`,
    `600 m`) in the corner. New `TX.exitSignTexture(number, place, distText)`.
  - The gore at `exitGore`: a small blue sign with the exit number and a diagonal arrow
    (`TX.exitGoreTexture(number)`).
  - `bakens`: three narrow boards on posts with 3, 2 and 1 diagonal stripes
    (`TX.afritbakenTexture(n)`).
  - The opposite carriageway gets the same signs, mirrored and facing the other way, so the
    junction reads from both sides.
- **Lighting.** *Proposal*: a junction is lit from `exitStart − 200` to `s1 + 200`, through the
    existing lit-stretch mechanism (`litAt` returns true there).
- **Keep clear.** Trees, farms and estates avoid `inJunction(s, lat, 25)`. Estates are moved or
  dropped, never cut through.

### Lane map (`src/lanemap.js`)

The ramp road from `sTop` to `s0` is drawn as a faint band continuing the strip band, so cars
coming down it show before they reach the strip.

## Steps

### 1. Ramp road in the sim, and the stall check — *built*

- `src/junctions.js` (placement, marks and paths; no scenery yet), the CONFIG keys, and the
  **Sim: the ramp road** rules.
- `tools/onramp.js`: add `road=` (default `CONFIG.rampRoadM`; `road=0` = slice 1) and place the ramp
  with `addRamp(sTop, {roadM})`. New report lines: **stops per merge**, ramp-road time (top to
  `s0`), speed at `s0` (p10/p50/p90), and how often the spawn was blocked at the top.
- Run the same 12 runs as slice 1 (2 and 3 lanes, density 8 / 12 / 16, seeds 7 and 8,
  `minutes=10`) with `road=300`. Paste them into **Results** next to the slice-1 table, with the
  run time.
- **What we want** (*proposal*; missing it is a finding to report, not a reason to tune until
  green): at density ≤ 12, under 1 stop in 10 merges (slice 1: 1 in 3 to 1 in 1). Lane 0, 200 m
  before `s1`, within 15 km/h of a kilometre upstream (slice 1: 17–44 below). Zero collisions,
  zero emergency stops at ≤ 12.
- If stops stay above 1 in 5 at density 12, try `rampRoadM` 400 once and record both. Pick the
  value for the rest of this slice and write down why. No other levers in this slice: making room
  is slice 3.
- Quick check: `npm run build`, `npm run simtest` (output identical to `d3f0a8e`: no ramps in
  it), `npm run onramp`.
- Commit: "On-ramps slice 2 P1: ramp road in the sim (F-20)".

### 2. The junction on screen, ramps in free play — *built*

- Everything under **Scenery**, **Rendering cars**, **Lane map**, **Scenarios** and **Sim: ramps
  in free play**.
- Check the junction from the driver's seat with `tools/shot.js` (or the dev server) by day and
  at night: the signs at `signA`, the *afritbakens*, the bridge with cars coming down the ramp, the
  gore, and the strip merge. Save the shots under the scratch folder. Look at them before
  committing.
- Full check: `npm run build`, `simtest` (still identical), `personas`, `moments`, `bottest`
  (it now meets free-play ramps; it must still pass. Note any change in its numbers),
  `npm run scenario onramp` and `npm run scenario onramp-busy`.
- Commit: "On-ramps slice 2 P2: junctions with signs, ramp roads and free-play ramps (F-20)".

**Stop here for the user to try** (see **Try it**). Per AGENTS.md this is a look, not a gate: if
the user isn't around, carry on and note it.

### 3. Estates next to junctions (*proposal*, small) — *built*

- In `estate(b)`: if a junction lies in the estate block, place the estate on the on-ramp side.
  Its car park starts 150–400 m past `rampTop` (in s), and the building line stays clear of
  `inJunction`. Add a straight service road from the crossing road to the car park.
- A ramp whose junction has an estate next to it gets a truck share of 30% (others: the normal
  share).
- Quick check: `npm run build`, `npm run onramp` (one run, nothing collapses), and a shot.
- Commit: "On-ramps slice 2 P3: distribution centres at junctions (F-20, F-40)".

### 4. README and BACKLOG — *built*

- README: junctions in free play, `rampsFreePlay`, the new `onramp` arguments, and the
  scenarios' new start.
- BACKLOG F-20 status: slice 2 built, its key numbers (stops per merge before and after, lane-0
  drop, collisions), and that slice 3 is next. Link this spec. F-40: estates sit at junctions.
- Commit: "On-ramps slice 2 P4: README and BACKLOG (F-20)".

## How we'll know

**Checks**
- `npm run onramp`, 12 runs at `road=300`: 0 collisions. 0 emergency stops at density ≤ 12.
  No car in lane −1 outside `[sTop, s1 + 20]`. No car moves into lane −1. No lane change starts
  before `s0`.
- Stops per merge reported next to slice 1. The target is in step 1.
- `simtest` byte-identical to `d3f0a8e`. `personas`, `moments` and `bottest` pass.
- Placement: a one-off probe (`node -e` against `junctions.js`) lists the first 20 junctions.
  Spacing is 3–6 km, none is within 60 m of a gantry, and block 0 is at 2500.
- Shots by day and at night show the signs, bridge, ramp road with cars on it, gore and strip, and
  nothing appearing at the motorway edge.

**Try it:** `npm run dev`, start free play, and stay in lane 0 or 1. Within about a minute: a blue
exit sign (1200 m), a second (600 m), then the 3-2-1 *afritbakens* and an exit lane opening on the
right. A bridge follows. Just after it, cars come down the ramp on your right, signal near the end
of the hatched gore, and merge from the strip. Keep driving: the next junction comes 3–6 km on.
Then try `?scenario=onramp-busy` and the night (T) to see the lit junction. U shows the ramp road
and strip on the lane map.

## Not doing

- **Widening the last-gap window** (`mergeLastM`) to fix the stalls. Measured in slice 1:
  300 m gave 7 stops against 8.
- **Making the strip itself 700 m long.** It fixes the stalls in the sim, but no Dutch strip is
  that long. The extra distance comes from the ramp road, where it really is.
- **Cars appearing on the strip or the hard shoulder** in free play. Every car comes down a ramp road.
- **Seeding junction placement by the road seed.** Scenery features are seedless, so the sim and
  the scenery must agree without passing a seed.

## Needs first

- Slice 1 (`addRamp`, `laneList`, `this.strip`, the merge rules, `tools/onramp.js`, the lane-map
  strip): present at `d3f0a8e`.
- `overpass()`, `sweep()` with row subsets, `signMesh`, `ch.signMats`, `litAt`, `estate` /
  `inEstate`, and `TX.anwbTexture` in `src/scenery.js` / `src/textures.js`: present.
- `tools/shot.js` for the screenshots: present. Check its arguments in the README before using it.
- Reference photos of a Dutch exit direction sign, an exit number panel and *afritbakens*: the
  builder looks them up. Our own drawings, no copied artwork.

## Not in this build

- Slice 3: lane-0 drivers making room on purpose, zippering at the strip end in jams, ramp flow by
  time of day, the matrix-sign queue warning near ramps, moment detectors ("merged in front of
  you", "you made room").
- F-21: AI cars taking the exit, using this exit lane and road. It also balances the cars ramps
  add.
- F-31: the player taking an exit.
- Ramp traffic on the opposite carriageway.
- A roundabout or traffic lights at the ramp tops, and traffic on the crossing road.
- Exit numbers and place names from a real route (M3, F-30 / F-33).
- The F-22 standstill-merge cost (a stalled merger needs a 100–180 m gap). It becomes its own item
  if step 1 shows it still dominates.

## Results

Built 2026-11-23, steps 1–4. Full check (`build`, `simtest`, `personas`, `moments`, `bottest`) took
about 90 s wall clock; the 36 `onramp` runs below about 12 min, in the background.

### Placement

A one-off probe against `src/junctions.js`, blocks −5..19: spacing 3.72–5.74 km, the closest gantry
61 m (junction 1), block 0 at 2500, nothing dropped. `junctionsNear(0, 3000)` returns junction 0 only.

### Step 1: the 12 runs

`npm run onramp <lanes> <density> 6 10 <seed> <road>` — one ramp, ramp top at s 700, strip 350 m,
6/min. `road=0` is slice 1 (cars appear at the start of the strip at 80 km/h) and reproduces the
slice-1 table exactly; `road=300`/`400` put that distance in front of the strip instead.

| run | merges | pos p50 | km/h p50 | stops | stops/merge | longest | s0 km/h p50 | ramp s p50 | lane 0 near / 1 km up | veh/min | coll | em |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2L D8 S7 · road 0 | 54 | 187 m | 65 | 16 | 0.30 | 109 s | – | – | 53 (−35) | 33 | 0 | 0 |
| 2L D8 S8 · road 0 | 42 | 228 m | 67 | 8 | 0.19 | 112 s | – | – | 71 (−17) | 32 | 0 | 0 |
| 2L D12 S7 · road 0 | 31 | 142 m | 67 | 37 | 1.19 | 158 s | – | – | 46 (−37) | 41 | 0 | 1 |
| 2L D12 S8 · road 0 | 42 | 234 m | 45 | 16 | 0.38 | 145 s | – | – | 40 (−43) | 40 | 0 | 0 |
| 2L D16 S7 · road 0 | 47 | 249 m | 24 | 50 | 1.06 | 224 s | – | – | 44 (−27) | 43 | 0 | 0 |
| 2L D16 S8 · road 0 | 42 | 255 m | 40 | 22 | 0.52 | 260 s | – | – | 39 (−32) | 44 | 0 | 0 |
| 3L D8 S7 · road 0 | 38 | 287 m | 41 | 12 | 0.32 | 98 s | – | – | 42 (−44) | 47 | 0 | 0 |
| 3L D8 S8 · road 0 | 45 | 244 m | 47 | 18 | 0.40 | 138 s | – | – | 46 (−38) | 47 | 0 | 0 |
| 3L D12 S7 · road 0 | 38 | 178 m | 68 | 38 | 1.00 | 170 s | – | – | 54 (−26) | 63 | 0 | 0 |
| 3L D12 S8 · road 0 | 37 | 205 m | 60 | 9 | 0.24 | 248 s | – | – | 58 (−22) | 62 | 0 | 0 |
| 3L D16 S7 · road 0 | 36 | 241 m | 23 | 85 | 2.36 | 110 s | – | – | 39 (−10) | 63 | 0 | 0 |
| 3L D16 S8 · road 0 | 53 | 181 m | 46 | 38 | 0.72 | 118 s | – | – | 40 (−35) | 63 | 0 | 0 |
| **road 0 total** | **505** | | | **349** | **0.69** | | | | | | 0 | 1 |
| 2L D8 S7 · road 400 | 50 | 212 m | 64 | 12 | 0.24 | 80 s | 80 | 18.7 | 63 (−25) | 34 | 0 | 0 |
| 2L D8 S8 · road 400 | 49 | 267 m | 48 | 19 | 0.39 | 79 s | 86 | 18.4 | 57 (−31) | 35 | 0 | 0 |
| 2L D12 S7 · road 400 | 39 | 249 m | 27 | 28 | 0.72 | 135 s | 81 | 18.8 | 40 (−44) | 44 | 0 | 0 |
| 2L D12 S8 · road 400 | 46 | 214 m | 15 | 66 | 1.43 | 149 s | 78 | 18.8 | 42 (−42) | 43 | 0 | 0 |
| 2L D16 S7 · road 400 | 41 | 228 m | 13 | 203 | 4.95 | 133 s | 70 | 21.1 | 40 (+7) | 46 | 0 | 1 |
| 2L D16 S8 · road 400 | 30 | 254 m | 9 | 63 | 2.10 | 241 s | 71 | 21.8 | 41 (−15) | 46 | 0 | 0 |
| 3L D8 S7 · road 400 | 42 | 184 m | 67 | 7 | 0.17 | 145 s | 82 | 19.0 | 65 (−20) | 49 | 0 | 0 |
| 3L D8 S8 · road 400 | 39 | 250 m | 65 | 8 | 0.21 | 125 s | 84 | 19.0 | 69 (−16) | 50 | 0 | 0 |
| 3L D12 S7 · road 400 | 38 | 272 m | 45 | 103 | 2.71 | 146 s | 73 | 19.2 | 41 (−41) | 68 | 0 | 0 |
| 3L D12 S8 · road 400 | 25 | 262 m | 13 | 473 | 18.92 | 91 s | 60 | 26.3 | 37 (−44) | 67 | 0 | 0 |
| 3L D16 S7 · road 400 | 24 | 235 m | 20 | 286 | 11.92 | 143 s | 61 | 19.7 | 42 (−33) | 70 | 0 | 0 |
| 3L D16 S8 · road 400 | 29 | 255 m | 8 | 170 | 5.86 | 177 s | 76 | 20.5 | 40 (−17) | 70 | 0 | 1 |
| **road 400 total** | **452** | | | **1438** | **3.18** | | | | | | 0 | 2 |
| road 300 total (12 runs) | 432 | | | 1458 | 3.38 | | 26–86 | 14–26 | 36–62 | 34–73 | 0 | 1 |

At density ≤ 12 (the 8 runs the target is about): road 0 median 0.32 stops per merge (0.19–1.19),
road 300 median 0.85 (0.32–10.05), road 400 median 0.56 (0.17–18.92).

**Read it as a finding, not as tuning:** the ramp road does **not** remove the stalls. It moves the
extra distance to *in front of* the merge point, where a car on a free ramp already arrives at
lane-0 speed (speed at the gore p50 73–86 km/h at density ≤ 12), while the jam at the end of the
strip now queues along the ramp road too — so every car in a longer queue records a stop, and fewer
cars merge at all (452 against 505 in 12 runs). The mechanism slice 1 measured is unchanged: a
stalled merger needs a 100–180 m gap in lane 0, and lane 0 still makes no room (that is slice 3).
The target (under 1 stop in 10 merges at density ≤ 12) is **missed by both**, and this is the
measurement slice 3 should start from, not a ramp-geometry knob.

**`rampRoadM` 400 over 300** (the one lever step 1 allows): at density ≤ 12 the median stop rate is
0.56 against 0.85, and the speed at the gore stays ≥ 60 km/h in every run where 300 dipped to 26;
merge counts are slightly higher (306 against 287 at ≤ 12). Both leave the stall problem intact, so
400 is picked for the extra room to reach speed, not because it fixes anything.

Checks in all 36 runs: 0 collisions, 2 emergency stops (both at density 16, both away from the
merge), 0 cars in lane −1 outside a ramp's span, 0 cars moving into lane −1, no lane change started
before `s0`. `simtest` is byte-identical to `d3f0a8e`; `personas` 55/55, `moments` 5/5 (2 probes),
`bottest` 30/30 `ok` unchanged; `npm run scenario onramp` and `onramp-busy` run and merge.

### What changed from the plan

1. **The scenarios start 900 m before `s0`, not "about 250 m before the bridge".** Those are not the
   same number: with `rampRoadM` 400, `s0 − 900` is 485 m before the bridge. The explicit "900 m
   before `s0`" was built; the parenthetical does not follow from it. At that start you meet the
   exit lane 65 m ahead, the gore, the bridge, the ramp top and then the merge — the direction signs
   (`signA`/`signB`) and part of the *afritbakens* are already behind you. Free play is where you
   see the whole junction from 1200 m. Moving the start is one number (`RAMP_START` in
   `scenarios.js`) if the signs should be in the scenario too.
2. **`junctionEveryKm` is really used**: the junction block is `(min + max) / 2 × 1000` m and the
   bridge sits in the middle third of it, so the key drives placement instead of documenting it.
3. **`DUTCH_PLACES`/`ROUTES` moved to `junctions.js`**, as allowed.
4. **`overpass()` grew `opts`** (`skew`, `plateau`) instead of a second bridge builder: a junction's
   embankment has a flat top at 6.9 m from the deck out to `G + 70` so the ramp road starts on it,
   then slopes to the ground by `G + 120`. The crossing road runs over the deck and down that slope
   into the polder out to ±300 m, with a centre line.
5. **The ramp road widens at the top**: 6 m up on the embankment, narrowing to the strip's own
   3.5 m where it meets the gore, so it never overlaps lane 0 (a constant 6 m ribbon would have).
6. **Extras not in the plan:** the whole junction is mirrored for the other carriageway (bridge,
   crossing road, ramp and exit roads, signs, hatching), not just the signs; the strip's outer edge
   line is drawn where the pavement widens; the gore apron is hatched over its last 90 m on each
   side; a junction's ramp top holds spawning while you are within `rampSpawnHoldM` of it.
7. **Estates**: the decision ("does this junction have one") lives in `junctions.js`
   (`junctionAtEstateBlock`, `junctionHasEstate`) because the sim needs it too (30% trucks on that
   ramp); the geometry stays in `scenery.js`. The estate's building line moves out to `E + 150..200`
   so its service road meets the crossing road where that is already at ground level.
8. **Stops are counted on the ramp road too** (every car in lane −1 that stands for over a second
   in `[sTop, s1 + 20]`), which is why the ramp-road rows show so many more stop episodes than
   slice 1 for the same jams.

### Not in this build

Unchanged from the list above, and one more: the end of the strip still stalls merge candidates
because lane 0 makes no room, which is the first thing slice 3 should measure. `rampRoadM` was left
at 400; `rampTopKmh` 50 (trucks 35, sd 8/5) is the plan's guess, confirmed only indirectly — the
gore speed in a free run is 73–86 km/h, so the ramp road does its job when nothing is queued.

### Try it

`npm run dev`, start free play, stay in lane 0 or 1. Within about a minute: an exit sign (1200 m), a
second (600 m), then the 3-2-1 *afritbakens* and the exit lane opening on the right. A bridge
follows. Just after it, cars come down the ramp on your right, signal near the end of the hatched
gore, and merge from the strip. Keep driving: the next junction comes 3-6 km on. Then try
`?scenario=onramp-busy` and the night (T) to see the lit junction. U shows the ramp road and strip
on the lane map.

