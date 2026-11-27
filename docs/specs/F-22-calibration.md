# F-22: jams calibrated to real numbers (spec)

2026-11-27. Status: ready to build. BACKLOG item F-22 (Bottlenecks and jams); queue Q-17 → build entry.
The far traffic layer (F-61, Q-18) runs on the numbers this build ends with.

## 1. Why

A jam is the most readable thing traffic does: it forms, it crawls back towards you, and it lets go
from the front. The near traffic (the AI in the 1,500 m ahead / 900 m behind window) gets the shape
right but the numbers wrong. Traffic leaves a queue at about 60% of the real rate. So every
bottleneck is too strong: a 3 → 2 closure jams even in light traffic, the on-ramp jam at density 16
sits instead of clearing, and the front of a queue moves back at 10 km/h instead of 15–20. The far
layer (F-61) has to hand waves over to this AI at the window edge, so both layers must agree on
capacity, queue discharge and wave speed. This build makes the near traffic match real Dutch
motorway numbers and gives a tool that measures them.

## 2. The picture

You're in a queue behind a closure. The brake lights ahead go out two or three cars up, and the
car in front of you starts rolling a moment later. An attentive driver goes almost at once; the
patser on the phone lags. A lorry pulls away slowly, but not every lorry is a 40-tonner crawling at
0.45 m/s². The queue empties at about two seconds per car per lane. The point where cars start
moving runs back past you at walking-to-cycling speed (15–20 km/h). In light traffic a closure is a
merge, not a jam; it only jams when the demand is really above what two lanes carry. At an on-ramp
in busy traffic a jam forms, crawls back, and dissolves again.

## 3. Premises and where they come from

Measured 2026-11-27 on `main` at `81a7024`, seed 7, limit 100, `reactionTime` 1 (scratch probes,
described in step 1 so the tool can reproduce them):

| What | Measured | Real (approx.) |
|---|---|---|
| Most a plain lane carries (2 lanes, no closure) | ~1,550 veh/h/lane at ~20 veh/km/lane | ~2,000–2,100 at ~25 veh/km |
| Density setting 26 / 32 / 40, measured over −500…1,000 m | 19.0 / 19.6 / 18.9 veh/km/lane | the setting |
| Plain queue emptying: 2 lanes blocked 150 s, then opened, count at +200 m | 1,060 veh/h/lane, 3.4 s per car | ~1,700–1,800, ~2 s |
| Same, cars only | 1,560 | — |
| Same, `reactionTime` 0 | 1,400 | — |
| Front of the stopped queue moving back (same run) | ~10 km/h (cars only 11, reaction 0 17) | 15–20 km/h |
| Closure 3 → 2 (`tools/closure.js 3 <d> 0 10`), d 9 / 14 / 20 | 29 / ~32 / ~30 veh/min once the jam stands; jams at d 9 | ~55–60 veh/min; no jam at d 9 (demand ~45/min) |
| Closure 3 → 2, d 14, gaps leaving the closure (min 4–10) | median 3.1 s, 40% over 4 s per lane | ~2 s |
| Closure d 14 safety | 1 collision, 3 emergency stops | 0 |
| On-ramp suite (`npm run onrampsuite`), density 16 | stops per merge 0.14–11 by seed, lane 0 near ramp 39–51 km/h | forms and clears |
| Brake tap (`node tools/wave.js`) | fades: 400 m+ back lowest 48 km/h; stop-and-go only at `reactionTime` 1.4 | grows only near capacity |

The "Real" column is from published motorway figures as known to the planner (Dutch capacity
practice and the jam literature: capacity ~2,000–2,100 veh/h/lane, queue discharge 10–20% below
capacity, jam front −15 to −20 km/h, 3 → 2 roadworks ~3,600 veh/h). Not looked up during this spec:
approximate, but well known.

Where the lost flow comes from (measured, the three probes above):
1. Lorries pull away at `TYPE_PARAMS.truck.a` 0.45 × (0.85–1.15) = 0.38–0.52 m/s². Taking them out
   raises queue discharge by 50%.
2. Every driver waits their full reaction delay (`reactLate`, `src/traffic.js`) before pulling
   away, so each car starts ~2.9 s after the one ahead. That's the slow queue front.
3. At the closure, zippers merging from a standstill leave gaps (40% over 4 s).
4. The edge spawner (`maintain` → `insertAt`) inserts at the driver's own `v0` and needs a free-flow
   gap (`s0 + v·T·0.9`), one try per zone per step, so a road never gets denser than ~20 veh/km/lane.

## 4. Decisions

- **Realistic targets, not harsher.** *Decided (user).* No game-tuned extra severity: the closure
  passes ~55 veh/min, the queue empties at ~1,700–1,800 veh/h/lane.
- **Lorry pull-away is a spread, about 0.4–0.9 m/s²** (loaded to empty). *Decided (user).*
- **Anticipation when pulling away, depending on the driver.** A driver in a queue starts on
  seeing the cars further up move off, not only their own leader. How much depends on the
  persona's existing `antic`. *Decided (user)*; the mechanism mirrors the brake-light reading
  already in `reactLate` (*planner's proposal*).
- **The spawner fix is in this build.** *Decided (user).*
- Reaction delays stay as they are: they are what makes waves grow. *Planner's proposal, agreed
  in thread.*
- Order (tool first, then lorries, anticipation, spawner, closure merge last and only if still
  short): *planner's proposal.*

## 5. Baseline (do not revert or redesign)

- Per-driver reaction delay `veh.react` (archetypes 0.3–1.4 s, `src/archetypes.js`; others
  0.5–1.3 s, trucks 0.7–1.2 s, `src/traffic.js` ~line 446) scaled by `CONFIG.reactionTime`, with
  the crash reflex, the cut-in exception and the brake-light reading (`CONFIG.brakeLightRead`,
  scaled by `veh.antic`) in `reactLate`.
- `veh.antic` per persona (`src/archetypes.js`): patser 0.03–0.25, white van 0.4–0.7, family
  0.5–0.75, leasebak 0.6–0.9, pensioner 0.7–0.95, grijze sok 0.8–1, EV smoothie 0.85–1; everyone
  else `(0.15 + r·0.75) × CONFIG.anticipation`.
- Closures (`addClosure`, F-23 matrix signs, red cross at the last gantry, stragglers zip at the
  end), on-ramp run-out and courtesy (F-20 slice 4), exits (F-21). Their suites and their targets
  stay.
- `tools/closure.js`, `tools/wave.js`, `tools/onramp.js`, `tools/onrampsuite.js` keep their output.

This build changes the sim on purpose. Every seed's output changes from step 2 on. The rule
"sim output identical to `main`" in other plans (rain off, Q-14; the guideway, Q-16) is measured
against `main` at the time that plan is built, so whichever lands second compares against a `main`
that already has this.

## 6. What to build

### Step 1. `npm run jams`: the measuring tool (no sim change)

New `tools/jams.js`, script `"jams": "node tools/jams.js"` in `package.json`, listed in the README's
tool list. Headless, each case in its own `Traffic` (no player, `limitKmh` 100, seed 7 unless said),
`dt` 1/30. It prints one line per case with the measured value, the target from section 7 and
PASS / FAIL, and `--json` prints the numbers. Cases:

1. **Plain road, fundamental diagram.** 2 lanes, densities 8, 14, 20, 26, 32, 40, 6 minutes, first
   minute discarded. Per density: measured density over −500…1,000 m (veh/km/lane), mean speed,
   flow per lane counted at s = 200 m. Report the highest flow and the density it came at.
2. **Plain queue release.** 2 lanes, density 20: `addClosure(0, 700, 710)` and
   `addClosure(1, 700, 710)`, at t = 150 s `removeClosure` both. Count vehicles crossing s = 900 m
   from 10 s after the first one to 100 s after → veh/h/lane and mean headway. Every 10 s, the front
   end of the stopped queue (the most downstream vehicle under 10 km/h below s = 720); the slope of
   that front over the first 150 s after opening = start-wave speed (km/h). Also run it with
   `CONFIG.mix` cars only and print both (the cars-only line is information, not a target).
3. **Closure 3 → 2.** As `tools/closure.js` (closure on lane 0 from 700 to 1,400 m, MSI on), at
   densities 9, 14 and 20, 10 minutes. Through-flow at s = 1,500 m per minute, its mean over
   minutes 4–10; headways per open lane at s = 1,450 m (median, share over 4 s); mean speed in
   0…700 m at minutes 5–10; collisions and emergency stops (`acc < −6`).
4. **Brake tap.** Run `tools/wave.js` (scenario `wave`, 90 s) at `reactionTime` 1 and 1.4 and
   report its "400 m+ back" lowest speed and its collisions.
5. **On-ramp, does it clear.** `tools/onramp.js --json` at 2 lanes, density 16, seeds 7–10, 6/min,
   10 minutes, road 400 m, as the suite runs it. Add to `onramp.js`'s JSON a per-30 s series of
   lane-0 speed near the ramp (the band the suite already calls "near"), without changing its
   other output. A run "clears" if, after that speed first falls under 40 km/h, it is back over
   70 km/h for at least one 30 s sample before the end.

Run it on `main` before step 2 and paste the output into section 9 of this plan as the before
column. It should reproduce section 3's numbers within noise; if it doesn't, the tool is wrong, not
the table.

### Step 2. Lorries pull away as a spread

In `makeVehicle` (`src/traffic.js`, the IDM params block, `veh.a = tp.a * (0.85 + r() * 0.3)`):
for `type === 'truck'`, `veh.a = lerp(0.4, 0.9, x)` from **the same `r()` draw** (no extra rng
draw, so every other driver keeps their numbers), skewed towards loaded: `x = u²` where `u` is
that draw, giving a median of ~0.52. Put the range in `TYPE_PARAMS.truck` as `aMin: 0.4,
aMax: 0.9`. Caravans (0.7) and vans keep their rule. Check that a truck's top speed and its
overtaking logic don't read `veh.a` in a way that now changes (search `\.a\b` uses for trucks);
note any in section 9.

### Step 3. Pulling away with anticipation

In `reactLate`, next to the brake-light reading: when the driver wants to accelerate more than
they did τ ago (`aNow > aOld`), the leader is close (`g < veh.v * 2.5 + 10`, so it works from a
standstill) and the leader is pulling away (`ld.acc > 0.2` and not braking), or the leader's leader
is (`l2`, within `ld.v * 2.5 + 10` of the leader, `l2.acc > 0.2`, not the player): blend from
`aOld` towards `aNow` by

    k = CONFIG.startRead × (0.3 + 0.7 × veh.antic) × (both moving ? 1 : 0.6)

with `CONFIG.startRead` new in `src/config.js` (start at 0.6; comment: "how much drivers in a queue
start on seeing the cars ahead move off (F-22)"), and in the HUD menu next to `reactionTime`
(`src/hud.js`), range 0–1, step 0.1. The crash reflex and the cut-in rule keep priority (they
return first). This only shortens the delay for speeding up; braking delays stay. So a patser on
the phone (low `antic`) still lags and the grijze sok goes almost at once.

Tune `startRead` (and, only if needed, the 0.3 floor) on the queue-release case until the start
wave reaches 15–20 km/h. Don't touch `reactionTime`, `veh.react` or `brakeLightRead`.

### Step 4. The spawner fills dense traffic

`maintain` / `insertAt` (`src/traffic.js`): when a zone is short of its target count by more than
one vehicle,
- insert at the local traffic's speed: `v = min(veh.v0, speed of the leader in that lane)` (the
  leader-speed branch exists; make it the rule at the edges, not only when the gap is short), and
  test the gap at that speed, so an insert into 80 km/h traffic needs an 80 km/h gap, not a
  100 km/h one;
- try more than once per step: up to one insert per lane per step, each lane at the largest gap in
  its 150 m edge band (not a random spot), while the zone is still short.

The safety tests in `insertAt` (gap to the leader and the follower, `strictBehind` behind the
player) stay; only the speed they are evaluated at and where it tries change. The on-ramps' and
exits' own spawning is untouched. The `densityFactor` waves along the road stay.

Done when the plain-road case measures each density setting up to 32 within 10% (40 may fall short:
above ~35 veh/km/lane the road is a jam, and a jam's count is set by what gets in). Check
`npm run speeds` at day density 10: the speed each archetype drives must not drop more than 2 km/h
(memory: normals at limit +5, speeders 110+ by day).

### Step 5. Closure merge, only if still short

Rerun `npm run jams`. If the closure at d 14 and 20 passes ≥ 50 veh/min with 0 collisions, skip
this step and say so in section 9. If not: read the headway output. If gaps over 4 s are still
over 15% per lane, the zip at the end is the cause. Then the follower in the open lane next to a
zipper waiting at the closure end (`veh.zipping`) lets one in (the on-ramp courtesy from F-20
slice 4 is the model: ease off to open ~2 car lengths, one zipper per follower), and the zipper
takes a gap of `s0 + v·0.8 s` at queue speed instead of the free-flow gap. Fix the d 14 collision
whatever the outcome: log it with the closure tool's crash log, find the cause, fix it.

### Step 6. Re-save baselines and write down the numbers

- `npm run onrampsuite -- --save` once its checks pass with no new failures except lines that got
  better; note old → new in section 9.
- Fill section 9 with before / after for every `npm run jams` line.
- Write the final numbers into the F-61 entry in `BACKLOG.md` as "near-layer numbers (F-22)": capacity per
  lane and its density, queue discharge, start-wave speed, closure 3 → 2 through-flow. The far
  layer's spec starts from these.
- Update F-22 in `BACKLOG.md`: `status: built`, and a line on what was built in its usual style.

## 7. How we'll know

`npm run jams` targets (all at seed 7, `reactionTime` 1):

| Case | Target |
|---|---|
| Plain road, highest flow | 1,900–2,200 veh/h/lane, at 22–30 veh/km/lane |
| Plain road, density setting vs measured, settings 8–32 | within 10% |
| Queue release, discharge (mixed traffic) | 1,650–1,850 veh/h/lane |
| Queue release, start wave | 15–20 km/h back |
| Closure 3 → 2, d 14 and d 20, through-flow min 4–10 | 50–60 veh/min |
| Closure 3 → 2, d 9 | no standing jam: mean speed 0…700 m ≥ 50 km/h at minutes 5–10 |
| Closure, all three | 0 collisions, emergency stops ≤ 1 per run |
| Brake tap, `reactionTime` 1 | still fades: 400 m+ back lowest ≥ 40 km/h, 0 collisions |
| Brake tap, `reactionTime` 1.4 | still becomes stop-and-go (lowest under 20 km/h), 0 collisions |
| On-ramp d 16, 4 seeds | at least 3 of 4 runs clear (section 6, step 1.5); 0 collisions |

Plus:
- `npm run onrampsuite`: every section 3 target of `docs/specs/F-20-slice-4-runout.md` passes
  (0 collisions, emergency stops ≤ 5, stops per merge at d 8 ≤ 0.1). Lane-0 speeds may differ from
  the old baseline: report them, then re-save (step 6).
- `npm run exits` / `exitsuite`: all section 3 lines of `docs/specs/F-21-exits.md` pass.
- `npm run speeds`: per-archetype driven speed at day density 10 within 2 km/h of before.
- Full check from `AGENTS.md`: `npm run build`, `simtest`, `personas`, `moments`, `bottest`,
  `worldtest`. Changed numbers are expected; failures aren't. Note how long they took in section 9.
- Review with `codex exec review` as in `AGENTS.md`.

**Try it:** `npm run dev`, scenario menu → a closure (or free play at Traffic 14 with a closure
ahead), drive into the queue with the lane map open (U, twice for the time-space diagram). The
queue should let go from the front in a visible band running back towards you, the cars ahead
rolling off a beat after the ones in front of them; once past the closure you're back near 100
within a few hundred metres. Then Traffic 9 with the same closure: a merge where you slow down,
not a standstill.

## 8. Not doing

- Making jams harsher than real for the game (decided: realistic).
- Changing reaction delays, `reactionTime` or `brakeLightRead` to buy flow: they are what makes
  waves grow.
- A jam-frequency knob: jams come from density, junctions and closures only (F-61's rule too).

## Needs first

Nothing unbuilt. It uses `tools/closure.js`, `tools/wave.js`, `tools/onramp.js`,
`tools/onrampsuite.js`, `tools/speeds.js`, `addClosure` / `removeClosure`, `reactLate` and
`veh.antic`; all exist on `main` at `81a7024`. If Rain (Q-14) is built first, its "rain off is
identical to `main`" check is against the `main` it was built on; this build then compares
against that.

## Not in this build

- The far traffic layer and coupling at the window edges: F-61 (Q-18), from step 6's numbers.
- Spawning at the edges as a flow from the far layer instead of a count per zone: F-61 slice 2.
  This build only makes the count reachable.
- Rain's effect on capacity and discharge: F-24 after both land (wet roads carry ~10% less).
- Spitsstrook and roadworks as new bottlenecks (F-25, F-26).
- Night limit 130 calibration: all targets here are at limit 100.

## 9. Results

(Filled in during the build: before / after per `npm run jams` line, onrampsuite and speeds old →
new, how long the full check took, and whether step 5 was needed.)
