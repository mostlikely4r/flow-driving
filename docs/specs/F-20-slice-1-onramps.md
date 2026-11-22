# F-20 slice 1: on-ramp spike, sim only (spec)

Status: ready to build · Written 2026-11-22 · BACKLOG item **F-20** (M2: The road breathes) ·
Baseline commit `2b7ff26`

## Why

M2 is "traffic enters and leaves the motorway". F-22 lists on-ramps as its last open piece. F-20
is rated value 5, effort L, risk **High**. Building the whole thing at once is too big a bet, so
this slice is a cheap **spike**: the merge itself, in the sim, measured headless, before any ramp
geometry is drawn.

**Where the premises come from**
- *Measured* (F-22 status in `BACKLOG.md`, `node tools/closure.js`): today's merge code costs far
  more throughput than real merges. A 3→2 lane closure passes ~30 veh/min against ~50 on a plain
  2-lane road; real merges cost 10–30%. Causes found then: stragglers zip in from standstill,
  trucks pull away at 0.45 m/s², gaps when a queue moves off. An on-ramp built on the same code
  may cause jams too easily. The spike measures this.
- *From the code* (`2b7ff26`): lane closures (F-23) already do "a lane ends, merge out of it":
  each driver picks a point to leave, patsers ride to the end and zip in, and when cornered they
  make a short, decisive move (`evaluate` `zip`, `laneLogic` `cornered`, `closureSig`). The
  acceleration strip reuses this. `laneAt()` in `src/layout.js` already calls lateral positions
  right of lane 0 "-1 = hard shoulder", and `laneLat(-1)` lands one lane width right of lane 0,
  on the hard shoulder, where a Dutch acceleration strip actually runs.
- *Dutch rules and habits* (Claude's knowledge, not measured here): merging from a ramp is
  **invoegen**. The merging driver gives way to traffic on the motorway (RVV 1990 art. 18), and
  indicates left while on the strip. Lane-0 drivers often move left or ease off as a courtesy,
  not a duty. This is **not** zippering (ritsen), which is for a lane that ends in slow traffic.
  In a jam it does become zippering at the end of the strip. A well-known habit: some drivers
  merge early and too slowly instead of using the strip to get up to speed.
- *Guesses* (the spike checks them): strip length, ramp flow, speed entering the strip, and how
  close to lane-0 speed each persona wants to be before merging. All are `CONFIG` keys.

**The picture (reading `src/traffic.js` at `2b7ff26`)**
1. Lanes are `0..N-1`, 0 = rightmost. `buildLanes` fills `this.lanes[i]`, and many places index
   `this.lanes[veh.lane]` / `this.lanes[t]` directly (`evaluate`, `projectedSafe`, `lineUpFor`,
   `laneLogic`, `computeAcc`, `insertAt`).
2. A closure is `{lane, s0, s1, sX, obs}`: `obs` is a stopped obstacle pushed into its lane list,
   so IDM brakes for it. `closedAhead(lane, s)` gives metres to its start, `crossAhead` metres to
   the red cross at the gantry. `msi.js`, `closureView.js`, `lanemap.js`, `perception.js` and
   `player.js` all read `traffic.closures`.
3. `maintain` keeps a **count** of cars ahead of and behind the player topped up. Cars added by a
   ramp count toward that total, so the edges spawn fewer cars. Overall density stays the same;
   the ramp only changes where cars enter. Fine for a spike.
4. `effLane` in `src/moments.js` clamps to `0..N-1`, so a car on the strip would read as lane 0
   to the moment detectors.
5. The player's `lanesOcc` (`src/player.js`, `lanesOccupied` in `layout.js`) covers only lanes
   `0..N-1`. A player on the hard shoulder is in no lane list.

## Goal and non-goals

**Goal** (*decided*: the user said "spec it" to the slice plan below). A sim-only on-ramp: an
acceleration strip where cars appear, speed up, indicate, find a gap in lane 0 and merge, or slow
to a stop at the end if none comes. It is shown in a scenario and measured by a headless tool, so
we learn whether merges are believable and what they cost the flow, before building geometry.

**Slices** (*proposed by Claude, agreed by the user*):
1. **This spec:** the spike (sim, scenario, tool).
2. Visible ramp: road from the side, gore area (verdrijvingsvlak), block markings, break in the
   hard shoulder and guardrail, laid out so F-21 exits reuse it.
3. Making room and jams: lane-0 drivers yield, zippering at the end in dense traffic, ramp flow
   that changes over the day, link to the matrix-sign queue warning, moment detectors.

**Non-goals for this slice**
- No ramp road, gore, markings or scenery. Cars appear on the hard shoulder at the start of the
  strip (accepted for a spike).
- No ramps in free play: only `?scenario=onramp` and the tool. Free play, `simtest`, `playtest`
  and `bottest` see no change.
- No new making-room rule for lane-0 drivers. Existing behaviour (cooperative followers reacting to
  a signaller, F-38 lining up) is allowed to happen and is **measured**, not added.
- No change to the bot driver or the player car's controls.
- No change to `CONFIG.moments` thresholds.

## Files

| File | Change |
|---|---|
| `src/traffic.js` | Ramps, the strip lane (−1), spawning on it, its end obstacle, the merge decision |
| `src/config.js` | New keys (below), each with a one-line comment |
| `src/archetypes.js` | One trait per persona: `mergeKmh` (step 2) |
| `src/scenarios.js` | Scenario `onramp`, with a `ramps` field read where `closures` is read |
| `src/lanemap.js` | Draw the strip and its cars |
| `src/overlay.js` | Dev overlay line for a car on the strip |
| `src/player.js` | Player on the hard shoulder collides with strip cars |
| `src/moments.js` | `effLane` keeps −1; detectors skip strip cars until they merge |
| `tools/onramp.js` | **New.** Headless on-ramp measurement |
| `package.json` | Script `"onramp": "node tools/onramp.js"` |
| `README.md`, `BACKLOG.md` | Step 3 |

`src/traffic.js` stays free of rendering code (engine-migration rule).

## New CONFIG keys (values are guesses the spike checks)

| Key | Value | Meaning |
|---|---|---|
| `rampStripM` | 350 | Length of the acceleration strip, from where cars appear to its end |
| `rampPerMin` | 6 | Mean cars per minute entering from a ramp (Poisson). ~360/h, an ordinary daytime on-ramp |
| `rampEntryKmh` | 80 | Mean speed entering the strip for cars (sd 6); trucks 60 (sd 5) |
| `mergeKmhDefault` | 12 | Merge once within this many km/h of the lane-0 traffic at your position, if the gap is safe. Persona trait `mergeKmh` overrides it (step 2) |
| `mergeLastM` | 120 | In the last this-many metres of the strip, any safe gap will do, at any speed difference |

## Rules

**The ramp object.** `traffic.ramps = []`, each `{ s0, s1, obs, spawnT }`: `s0` is where cars
appear, `s1 = s0 + rampStripM` the end of the strip. `obs` is a stopped obstacle like a closure's
(`isObstacle`, `type: 'obstacle'`, lane −1, length 20 m starting at `s1`, `v: 0`), so IDM makes a
car with no gap slow down and stop at the end. `addRamp(s0)` / `removeRamp(r)` mirror
`addClosure` / `removeClosure`. Ramps are **not** in `traffic.closures`: no red cross, no matrix
sign, no arrow-board truck, nothing in `msi.js` or `closureView.js`.

**Lane −1, the strip.**
- Add `laneList(i)`: returns `this.strip` for −1, otherwise `this.lanes[i]`. Every lookup a strip
  car or a lane-0 car can reach with lane −1 goes through it (the places in picture item 1). Lane
  lists for `0..N-1` stay exactly as they are.
- `buildLanes` puts vehicles with `lane === -1` in `this.strip`, also cars moving from −1 to 0
  (in both lists while they move, as for any move), plus each ramp's `obs` and the player proxy
  when the player is on the hard shoulder inside a ramp's span (lateral position past
  `outerEdgeLine()`, `s0 − 20 ≤ s ≤ s1 + 20`).
- A strip car only ever considers lane 0. **No car ever moves into lane −1**: the move-right
  candidate for a lane-0 car stays out of range, as now. Check this in `laneLogic` / `evaluate`
  candidate selection.
- `insertAt` works for lane −1 through `laneList` (it already skips `pickLane` when a lane is
  given; keep `maxLaneFor` from moving it to lane 0).
- Rendering needs nothing new: `latLocal = laneLat(-1, N)` puts the car on the hard shoulder, and
  the existing lateral move takes it to lane 0.

**Spawning.** Each ramp has its own Poisson timer at `rampPerMin`, using the traffic `rng` (seed +
time must reproduce). When it fires, insert at `s0` in lane −1 with `randomTypeVariant()` and a
persona as normal spawns get one, at `rampEntryKmh` (truck value for trucks). If the insert fails
(strip car too close ahead), try again 1 s later; don't queue. Ramps exist only where the sim runs
(`ahead`/`behind` range); a ramp behind the range stops spawning.

**The merge decision** (in `evaluate` / `laneLogic` for a car with `lane === -1`, target 0):
- It **wants** lane 0 always: a fixed urge like the closure term, never `wants: false`.
- It **indicates left from the moment it appears**, and keeps the signal on until it merges. This
  is the F-38 exception for closures: set `closureSig` so the signal may wait, with no withdraw
  and re-signal loop. (Authentic: in NL you indicate on the strip.)
- It **merges** when the gap is safe (`gapSafe`, the normal test) **and** either
  - its speed is within `mergeKmh` (persona, else `mergeKmhDefault`) of the lane-0 car it would
    follow (or of its own `v0` if lane 0 is empty ahead within 150 m), or
  - it is in the last `mergeLastM` metres of the strip.
- Near the end it behaves like a car at a closure's end: the existing `zip` acceptance (tighter
  gap, the follower brakes moderately) and the short decisive move apply when `closedAhead(-1, s)`
  is under the zip distance. Extend `closedAhead` to count a ramp's `s1` for lane −1; leave
  `crossAhead` alone.
- While waiting it may line up (F-38 `lineUpFor`: lift to drop behind a car alongside, or speed up
  to get ahead of it), keeping its signal on.
- With no gap it slows for `obs` and stops at the end of the strip, then zips in from standstill
  like a closure straggler. Rare at normal density; the tool counts it.

**Lane-0 traffic** gets no new rule. Whatever existing cooperative behaviour does with a car
signalling into lane 0 from the strip is what the tool reports.

**Moments and journal.** The journal records lane −1 as it is. `effLane` returns −1 for a car
with `lane === -1` (and the existing clamp otherwise). Detectors skip a car while its `effLane`
is −1, so a strip car is never "alongside in your lane"; its move into lane 0 is a normal lane
change (it signalled, so not `unannounced`; close in front of you may well be a `cut-off`, which
is real).

**Player.** `player.js` collision (~line 308 onward, the `lanesOcc` loop, and the closures block
~line 324) also checks strip cars and ramp `obs` when the player is on the hard shoulder in a
ramp's span. The player can't use the ramp; this only stops the player driving through cars.

## Steps

### 1. The strip, the scenario and the tool (smallest version to try)

- Everything in **Rules** above, with `mergeKmhDefault` for every driver (no persona trait yet).
- **Scenario `onramp`** in `src/scenarios.js`: 3 lanes, day, a fixed seed, density 10, player in
  lane 1 at 100 km/h, a ramp with `s0` 600 m ahead (`ramps: [{ ds: 600 }]`, read next to
  `closures` around line 890, cleared the same way). Lane-0 traffic like `closure` uses, so
  mergers meet real gaps. `about` text: what to watch (cars appear on the hard shoulder 600 m
  ahead, indicate, speed up and slot into lane 0; lane-0 drivers may ease off or move left; lane
  map U). Also a variant `onramp-busy`: density 16, `rampPerMin` 12 for the scenario only, so the
  end-of-strip and zip path shows.
- **Lane map** (`src/lanemap.js`): the strip as a narrow lane band right of lane 0 from `s0` to
  `s1`, hatched end like a closure; strip cars drawn like other cars.
- **Dev overlay** (`src/overlay.js`): a strip car shows `merging · 140 m left · −18 km/h` (metres
  to `s1`, speed difference to the lane-0 car it would follow).
- **`tools/onramp.js`** (pattern: `tools/closure.js`). Args
  `lanes=3 density=12 perMin=6 minutes=10 seed=7`; `CFG_*` env overrides like `closure.js`. One
  ramp at s = 700. Reports:
  - merges: count; position along the strip in m from `s0`, p10/p50/p90; speed at the merge and
    the difference to lane-0 traffic there, p10/p50/p90; front and back gaps accepted, in s;
  - by persona (archetype name, or type for trucks/vans): merges, median position, median speed
    difference;
  - stops at the end: count, longest wait;
  - effect on lane 0: braking of the new follower in the 5 s after each merge (min acc; how many
    under −2 and under −4 m/s²); lane-0 cars that moved to lane 1 within 300 m before `s1` while
    a strip car signalled; lane-0 mean speed 200 m before `s1` vs. 1 km upstream;
  - throughput past `s1 + 200` per minute, all lanes;
  - collisions (any gap < −0.2 m in any lane list, strip included) and emergency stops (acc < −6),
    listed like `closure.js` does.
- Run and paste into **Results** at the end of this file: `npm run onramp` for density 8, 12, 16
  on 2 and 3 lanes, seeds 7 and 8 (12 runs, `minutes=10`). Record how long they took.
- Quick check: `npm run build`, `npm run simtest` (must match `2b7ff26` exactly: no ramps in it),
  `npm run moments`, `npm run scenario onramp` and `npm run scenario onramp-busy`.
- Commit: "On-ramps slice 1 P1: acceleration strip, scenario and tool (F-20)".

**Stop here for the user to try.** A few minutes in `?scenario=onramp`, as below. Per AGENTS.md
this is a look, not a gate: if the user isn't around, carry on with step 2 and note it.

### 2. Merge styles per persona

- Add `mergeKmh` to each persona in `src/archetypes.js` (*proposal*, guesses):

  | Persona | `mergeKmh` | Reads as |
  |---|---|---|
  | Pensioner | 28 | merges early and slow |
  | Grijze sok | 22 | merges early, a bit slow |
  | Family | 16 | |
  | Leasebak | 8 | uses the strip, merges at speed |
  | Patser | 5 | uses the strip, merges at speed, takes tight gaps at the end |
  | EV smoothie | 10 | |
  | White van | 12 | |
  | (trucks, no persona) | 15 | |

- If personas carry a "tells" list for the persona viewer (`npm run personas` checks every tell),
  add no new tell in this slice; just make sure `personas` still passes.
- Re-run the 12 `onramp` runs. The per-persona table must show pensioners and grijze sokken
  merging earlier in the strip and slower than leasebaks and patsers.
- Full check (AGENTS.md): `npm run build`, `simtest`, `personas`, `moments`, `bottest`.
- Commit: "On-ramps slice 1 P2: merge style per persona (F-20)".

### 3. README and BACKLOG

- README: the `onramp` scenarios and `npm run onramp`, in the scenario and tools lists.
- BACKLOG F-20 status: what slice 1 built and its key numbers (merge position and speed difference
  p50, follower braking under −2, stops at the end, throughput, collisions), and that slices 2–3
  are next. Keep the link to this spec.
- Commit: "On-ramps slice 1 P3: README and BACKLOG (F-20)".

## How we'll know

**Checks**
- 0 collisions in all 12 `onramp` runs and both scenarios.
- 0 emergency stops (< −6 m/s²) in the density 8 and 12 runs. At 16, list any; they are a
  finding, not a failure.
- No car ever in lane −1 outside a ramp's span; no car ever moves *into* lane −1 (the tool
  asserts both).
- `simtest` identical to `2b7ff26` (no ramp in free play); `moments`, `personas`, `bottest` pass.

**What the spike should tell us** (*targets are proposals*; missing them is a result to discuss,
not a reason to tune until green)
- At density ≤ 12: most merges happen before the last `mergeLastM`; stops at the end are rare
  (target: under 1 in 20 merges).
- Ordinary drivers merge within ~15 km/h of lane 0 (median).
- New-follower braking below −2 m/s² in under 10% of merges.
- Throughput: does a ramp at 6/min drag lane-0 speed down near `s1`, and by how much at 12 and 16?
  This is the High-risk number from F-22 and decides how slice 3 approaches jams.

**Try it:** `npm run dev`, open `?scenario=onramp`. Stay in lane 1 at 100. About 600 m ahead,
cars appear on the hard shoulder with their left indicator on, speed up and slot into lane 0;
some lane-0 drivers ease off or move left. Press U for the lane map: the strip shows as a short
band right of lane 0. Then `?scenario=onramp-busy`: some cars run to the end of the strip and
zip in. Press O (dev overlay) and look at a strip car's `merging · … m left` line.

## Not doing

- Calling the ramp merge "zippering" or giving mergers priority. Mergers give way; zippering only
  happens at the end of the strip when traffic is dense.
- Making the strip a `closure`. It would bring red crosses, matrix signs and the arrow-board truck
  with it.
- Shifting all lane indices so the strip becomes lane 0. It touches every lane user in the game
  for no gain.

## Needs first

- F-23 closures, F-38 signal commitment (`closureSig`, `lineUpFor`, `gapSafe`, `projectedSafe`),
  F-22 reaction delay: all present at `2b7ff26` (checked in `src/traffic.js`).
- `tools/closure.js`, `src/lanemap.js`, `src/overlay.js`, `npm run scenario`: present.
- Persona definitions in `src/archetypes.js`: present.

## Not in this build

- Slice 2: the visible ramp (road from the side, gore area, block markings, hard shoulder and
  guardrail breaks), shared layout with F-21 exits; then ramps in free play every ~3–5 km.
- Slice 3: lane-0 drivers making room on purpose, zippering at the strip end in jams, ramp flow by
  time of day, matrix-sign queue warning near ramps, moment detectors ("merged in front of you",
  "you made room").
- F-21 exits, which also balance the cars ramps add.
- Merge throughput fixes from F-22 (straggler zip from standstill, truck pull-away), unless the
  spike shows they dominate; then they become their own item.

## Results

(Step 1 and 2 runs go here.)
