# F-37 slice 3: frames, reproduction, occlusion, `dwars` (spec)

Status: built (2026-11-25). Part of "Proefrit: the playtest loop (F-37)" in `docs/F-37-proefrit.md`;
read that document first. This covers slice 3 only (queue entry Q-5).

## 1. Goal and non-goals

**Goal.** A bot report becomes something you can *look at*: the three worst and the three best
moments of a run come with two frames each (a bonnet view and the lane map) and a one-line command
that reproduces the moment. Two things the slice-2 bot could not do yet: a truck blocks the view
(occlusion, so "unreadable from the seat" is honest) and there is a deliberately awkward driver
(`dwars`) to see whether the AI's defences hold.

**Done when** each worst moment in a report comes with two frames and a one-line command that
reproduces it.

**Non-goals.**
- Slice 4: `tools/compare.js`, the `jij` profile, threshold tuning. Nothing here tunes a detector.
- No change to `CONFIG.moments`, `src/moments.js`, the journal format or the detector cases.
- No frames for human drives: they have no seed to reproduce.
- No video. `tools/clip.js` already does video for scenarios; this slice shoots stills.
- `dwars` is not calibrated against a human journal; it is the "bad player" probe.

## 2. Baseline (do not revert or redesign)

Slice 2 is committed (`6c93ea1` and earlier): `src/session.js`, `src/perception.js`,
`src/botDriver.js` (`forens`, `slak`), `tools/playtest.js` (`runSeed`, one child per seed,
`journalHash`, `verdict`, `report.md`), `tools/bottest.js`.

Facts this slice relies on:
- `runSeed()` in `tools/playtest.js` is the only place a bot drives: percept every 0.1 s,
  `bot.update(dt)` → `applyDrivePress` → `pedalStep` → `stepSim` → `holdFlash` → `drainEvents`,
  `dt = 1/60`. That loop is what has to be identical in the browser.
- `createSim({ seed, rng })` builds `Road(seed)`, `Player(road)`, `Traffic(seed + 1)`; the runner
  passes `mulberry32(seed + 3)` for the closure rolls. The browser's `main.js` built the same
  objects from `CONFIG.seed` and `Math.random`, which is why a browser frame could not reproduce
  a bot moment before.
- `buildReport(drives)` in `tools/report.js` is shared with human journals; it is exported and
  called by the runner.
- `main.js` renders the lane map every frame (`laneMap.update`), and `paused` freezes the sim but
  keeps the camera and the world views updating — so a paused frame is a valid still.
- `?scenario=` and `?dev` are dev-only (`src/dev.js`); a built `dist/` still turns them on with
  `?dev`. `tools/clip.js` and `tools/shot.js` drive `vite preview` on port 4799.

## 3. Findings in the code that drive the design

1. **Nothing in the browser can reproduce a bot drive.** The journal has 2 Hz rows of the nearest
   20 vehicles, which is not enough to rebuild the world, so the frames must come from a real
   re-simulation, not from the journal. That means `main.js` needs a replay mode that builds the
   sim from a seed and drives it with the bot before the first frame.
2. **Two copies of the drive loop would drift.** Slice 2's finding was exactly this ("copying them
   into the runner would test a different game"). So the loop moves to `session.js` and both the
   runner and the replay call it.
3. **`end.contacts` is always 0.** `runSeed` counts `sim.player.events` *after* `drainEvents` has
   emptied it every step, so the field only ever counted a crash on the last step. Count the
   journal's `crash` events instead. It matters here because the replay hash includes `end`.
4. **A replay has to prove it is the same drive.** The journal header carries the commit, node
   version and wall-clock stamps, which differ in the browser, so the full `journalHash` cannot
   match. A body-only hash (columns, meta, events, end) can, and does.
5. **`laneMap` rows accumulate at 0.5 s per sample and only while not paused.** A tight replay
   loop never fills them, so the replay steps `laneMap.update` too; otherwise the time-space
   diagram in the lane-map frame is empty.
6. **Occlusion barely touches lane-choice safety.** A car in the neighbouring lane is ~3.5 m off
   the sight line, so a truck in *your* lane does not hide it; what a truck hides is the queue in
   its own lane, where it is already the leader. The effect is on `uncertain`/`freshIn` and on
   following, not on diving into a hidden car. Verified with a bottest case, and `forens` is
   re-measured, not assumed.

## 4. Files

| File | Status | Purpose |
|---|---|---|
| `src/perception.js` | change | 2D line-of-sight occlusion by tall vehicles |
| `src/config.js` | change | `perception.occludeTypes`, `perception.eyeM` |
| `src/session.js` | change | `advanceDrive(sim, …)`: the one bot loop, shared |
| `src/journal.js` | change | `journalHash(j, { bodyOnly })` |
| `src/botDriver.js` | change | The `dwars` profile and its twice-a-minute twitch |
| `src/main.js` | change | `?dev&replay=…` mode: seed, bot, advance, freeze; `__game.setView`, `__game.laneMap` |
| `tools/playtest.js` | change | Use `advanceDrive`; `frames` (3 worst + 3 best) and `until=… frames`; fix `end.contacts`; a `repro` command per moment |
| `tools/report.js` | change | A frames block under the timeline: moment, repro line, two images |
| `tools/frame.js` | new | Headless stills: load the replay, shoot bonnet + lane map, verify the hash |
| `tools/bottest.js` | change | Occlusion, `dwars`, the shared loop, the body-only hash |

## 5. Design

### 5.1 Occlusion (`src/perception.js`)

```js
// config.js
perception: { …, occludeTypes: ['truck', 'van', 'caravan'], eyeM: 1.2 },

/** Is `target` hidden behind a tall vehicle between us and it? 2D, straightened road. */
function occludedBy(target, seen, eyeS, playerLat) → boolean
```

For each vehicle that passes the range test, the sight line runs from the eye `(eyeS, playerLat)`
to the target's near face `(u ∓, latLocal)`. Any vehicle already observed whose `type` is in
`occludeTypes`, whose `|u|` sits between the eye and the target, and whose `(u, lat)` rectangle
the line crosses hides it. The vehicle is then dropped from `cars` (it is not a cue), with its
history and cue memory kept for 3 s by the existing `prune`, so a car that comes out from behind a
truck is not "fresh" and the bot will not change lane onto it.

An occluder never hides itself, and a car inside 30 m is never hidden (you can see past a truck
that close through the windows; the sim has no lane-change drama worth modelling there).

### 5.2 `dwars` (`src/botDriver.js`)

| Param | Value | Why |
|---|---|---|
| `setOverKmh` | +8 | a hurrier |
| `homeLane` / `keepRight` | 1 / false | sits in the middle, as the awkward driver does |
| `signalS` | 0.8 | short signals: the visible indicator is under a second |
| `acceptLeadS`, `acceptLagS` | 0.6, 0.8 | late, tight merges |
| `overtakeKmh` | 4 | pulls out for almost anything |
| `react` | 0.2 | reacts almost at once |
| `twitchS` | 25 | mean seconds between pointless brake taps (0 = never) |

The twitch: when nothing is within 90 m ahead, `rng()` schedules a 0.6 s brake tap every
`twitchS` ± 50%. That is the "sometimes brakes for nothing" that the AI has to survive, and it
shows up as `forced-brake` in the report without a `phantom-brake` for the AI's own cars.

`verdict()` gets a `dwars` branch: `NaN`, `no red cross` and `no unsignalled change` are gated;
contacts and scrapes are printed, not gated — a collision here is a finding for the report, not a
regression of the gate.

### 5.3 One drive loop (`src/session.js`)

```js
export function advanceDrive(sim, {
  bot, perception, seconds, dt = 1 / 60, perceptEvery = 0.1, onStep = null, laneMap = null,
}) → { t, percept }
```

It is the slice-2 loop, verbatim: `bot.update` → presses → `pedalStep` → `stepSim` → `holdFlash`
→ `drainEvents`, a fresh percept every `perceptEvery` seconds, `onStep(sim, dt, t)` for the
runner's min-gap diagnostics, and `laneMap.update(…, false)` when a lane map is passed (the
browser replay fills its time-space rows this way).

`tools/playtest.js` `runSeed()` calls it with `until` as `seconds` and `onStep` for min gap / min
TTC. `main.js` calls it from the replay branch.

### 5.4 Replay mode (`src/main.js`)

`?dev&replay=1&seed=3&until=412&driver=forens&tod=day[&scenario=closure][&cfg=<json>]`

- Parsed next to `?scenario=`, before `new Road(CONFIG.seed)`: sets `CONFIG.seed`, `CONFIG.timeOfDay`
  and the `cfg` overrides (the journal's config diff), so the road, traffic, scenery and limits
  are the run's.
- After the scene is built and before the first frame: hide the start screen, `started = true`,
  `paused = true` (frozen still), hide the pause menu, start a bot journal with the runner's
  header fields, `advanceDrive(...)` to `until`, `scenery.update(player.s, 999)`, then
  `journal.finish()` and expose `window.__game.replay = { t, s, kmh, hash, bodyHash, journal }`
  (a getter, because the module finishes before the replay does).
- `__game.setView(name)` and `__game.laneMap` join the debug handle, so the frame tool can switch
  to the bonnet and turn the lane map on without key handling while frozen.

### 5.5 `tools/frame.js`

```js
export async function shootMoment({ browser, port, outDir, name, shot }) → { bonnet, map, replay, errors }
export async function shootAll({ shots, outDir, port, onLog }) → [{ …, sameWorld }]
```

One page load per moment: `goto` the replay URL, wait for `__game.replay`, `setView('bonnet')`,
screenshot, then `laneMap.setMode(2)` + `span`, wait a few frames, screenshot. It spawns
`vite preview` once and closes it at the end, like `clip.js`/`shot.js`. The expected body hash
comes from a fresh headless run stopped at the same moment (`bodyHashUntil()` in the runner), not
from `run.json`, whose hash is of the whole drive; a mismatch is printed and written into the
report, never hidden.

### 5.6 Runner and report

- `frames` (with a full run): pick the 3 worst (not good) and the 3 best moments, in turn from each
  drive of the run so they are not all from its first minute (see section 8), shoot two frames
  each, and pass them to `buildReport(drives, { frames })`.
- `frames` with `until=`: one moment, one drive — the one-line reproduction
  `npm run playtest -- driver=dwars seed=3 until=412 frames`.
- Every frame line carries the same command with `frames` dropped (`… until=412`), so a number in
  a report can be re-derived without a browser.
- `report.md` section 4 gets a "Frames: the three worst and three best" block after the timeline:
  the moment line from the timeline, the repro command, and `![](frames/…)` for the bonnet and the
  lane-map frame.

## 6. Phases

1. **P1 Occlusion** — `perception.js`, `config.js`, bottest cases. *Built.*
2. **P2 `dwars`** — `botDriver.js`, the twitch, the `verdict` branch, a bottest case. *Built.*
3. **P3 One loop** — `advanceDrive` in `session.js`, the runner uses it, `journalHash` moves to
   `journal.js` with `bodyOnly`, `end.contacts` fixed. *Built.*
4. **P4 Replay** — `main.js` replay mode and the debug handle. *Built.*
5. **P5 Frames** — `tools/frame.js`, hash check. *Built.*
6. **P6 Runner + report** — `frames`, the pick, the repro line, the report block. *Built.*
7. **P7 Docs and checks** — README, the master plan's slice 3, BACKLOG, the full check. *Built.*

## 7. Checks

- Quick: `npm run build` (3 s), `npm run bottest` (10 s), plus `npm run moments` for the detectors
  (2 s).
- Full: `build` 3 s, `simtest` 6 s, `personas` 5 s, `moments` 2 s, `bottest` 10 s, `worldtest` 2 s.
- Background (logs in `playtests/logs/`):
  - `npm run playtest -- driver=forens min=20 seeds=3 frames` — 28 s of driving per seed, 38 s for
    the six stills; 0 contacts, 0 scrapes, 0 NaN, min gap 2.4–11.7 m, 10–13 overtakes, right-lane
    share 28–46%, cruise 65–70%. Fails the slice-2 gate on the two items that gate already could
    not hold on day traffic (cc share and right share) plus the signal-window tail, all recorded
    under slice 2; not a regression.
  - Against `6c93ea1` (a worktree): seeds 2 and 3 are the same drive to the metre; seed 1 is a
    different drive (min gap 22.8 → 11.7 m, right share 55% → 46%, ccSet 104 → 99) because a car
    that used to be in view is now behind a truck. That is the point of occlusion, but it means the
    per-seed numbers of slice 2 are not comparable from here on.
  - `npm run playtest -- driver=dwars min=10 seeds=2 frames` (36 s for four stills): both drives pass
    (verdict `yes`), 0 contacts, 0 scrapes, 0 NaN, min gap 16.4 / 23.7 m, 6 and 9 overtakes, middle
    lane 70% of the time, 0 AI emergency stops and 0 cars off the road. What it produced is the point
    of the probe: `forced-brake` 11.5 per 10 min (the pointless taps), `phantom-brake` 10.0, calm
    share 0.30 against 0.33 for `forens` — the awkward driver costs calm, and the AI neither
    collided nor panicked.
  - Noted while reading those reports (slice 4, not this build): `phantom-brake` fires 13 per 10 min
    in the `forens` runs too and 0 of 3 drives pass the M1 check on it, with `pop-in` 2–6 per drive
    behind it. That is a detector/calibration question — the frames are what lets someone look at
    what it thinks it saw.

## 8. What changed from the plan

- The frames block went under section 4 of `report.md` instead of a new numbered section, so the
  fixed order (1–6) that two reports are compared by stays put.
- The pick is three worst and three best *per run*, taken in turn from each drive of the run (the
  worst of drive 1, then of drive 2, ...). Plain severity-then-earliest filled all six slots from
  the first minute of a 20-minute run.
- `laneMap` has to be fed during the replay (finding 5), which the plan did not foresee.
- Two more replay-hash traps turned up: the browser starts from your saved settings (it must reset
  to `DEFAULTS` and put `CONFIG.seed` back, or the journal's config diff differs), and the oncoming
  carriageway's `initialFill` spends ids from the one global counter before our own traffic respawns
  (it is filled after the replay instead). Without both, the body hash differs by a handful of ids.
- `frame.js` also got a small CLI and an npm script (`npm run frame -- seed=3 until=412`) for one
  moment without a run; and the runner accepts `cfg=<json>` next to `cfg.<key>=<value>`, so a
  config with a nested key (`moments`) can be written as one argument in a repro line.
- `end.contacts` was 0 in every bot journal (see finding 3) — fixed here, so a bot journal's `end`
  now matches its `crash` events.

## 9. Try it

`npm run build`, then
`npm run playtest -- driver=dwars min=10 seeds=2 frames` and open the `report.md` it prints the path
of: section 4 ends with the six moments, each with the command that reproduces it and the two stills
next to it. For one moment only: `npm run playtest -- driver=forens seed=1 until=33.3 frames`.

## 10. Not in this build

- No video clip per moment. `tools/clip.js` still records scenarios; a bot-moment clip would be the
  same replay plus a screencast, and nobody has asked for it yet.
- Frames for a human drive: there is no seed to reproduce it from, so `report.js` shows the block
  only when the runner passed frames in.
- The occlusion rule is geometric only: a truck blocks the sight line, nothing else does (no
  spraying, no night, no curvature, no looking through the windscreen of the car ahead). Whether a
  hidden car should also stop the bot from *changing lane* is left to the `freshIn` rule (a car that
  comes out from behind a truck counts as just seen, and the bot waits 0.5 s).
- `dwars` is not calibrated and its verdict is deliberately not a gate; tuning it against your
  journals belongs to slice 4, with the rest of the calibration.
