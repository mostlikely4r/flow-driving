# Snelweg

A Dutch motorway driving game about *being part of traffic*, not racing through it.

## Run

Double-click `start.bat`, or:

```
npm install
npm run dev        # opens http://localhost:5173
```

## What's simulated

- **Traffic AI** (`src/traffic.js`): IDM car-following + MOBIL lane changes with Dutch rules:
  keep right, no overtaking on the right above ~55 km/h (some drivers break it when frustrated),
  trucks limited to the two right lanes at ~84 km/h with slow "elephant races", middle-lane hoggers,
  speeders, slow drivers. Drivers signal, wait for a gap, and cooperative drivers ease off to let
  a signalling car in, including **you** when you indicate. Flash your lights (F) at a left-lane
  dawdler and they'll move over sooner.
- **Your car** (`src/player.js`): power/drag physics, auto gearbox, cruise control in 1 km/h steps,
  optional ACC, curve-following steering assist for keyboard play.
- **Road** (`src/road.js`, `src/scenery.js`): endless procedural A-road with gentle clothoid curves,
  3 lanes plus a hard shoulder, concrete median barrier, guardrails, ditches, polder fields,
  hectometre posts, matrix-sign gantries, blue guide signs, 100 (6-19 h) / 130 (19-6 h) signs,
  viaducts, noise walls, lit stretches, farms, poplars and wind turbines.
- Day (limit 100), dusk and night (limit 130). Live interior and side mirrors.

## Tuning

Most behaviour is in the in-game menu (Esc). Everything else is in `src/config.js`.
Useful knobs in `src/traffic.js` → `makeVehicle()`:

| What | Where |
|---|---|
| How eager cars are to keep right | `veh.bias` |
| How willing they are to let others in | `veh.p` (politeness), `veh.coop` |
| Following distance | `veh.T` (time headway, s) |
| Lane-change duration / signalling time | `veh.lcDur`, `veh.tSignal` |
| Accepted gap when changing lanes | `veh.tSafe`, `veh.tSafePlayer` |

**Persona viewer** (`C` from the pause menu, or "Meet the cast" on the title card): a turntable rig on a
bare lane against black — only the road and the cars, the world is put away while it is open. `L` swaps
lamp signatures, `V` the camera, `G` the headway gap.
Every line on the spec sheet is clickable: the rig grows to the lanes a behaviour needs and plays a
seeded demo staged from `scenarios.js` (`demo:<persona>:<trait>`), with captions detected from the star
car's live state. `Space` pauses, `1`/`2` are 0.5×/0.25× slow motion, `3` normal, `R` restarts, and the
sheet's *Back to the turntable* button (or `Esc`) leaves a demo or the gap view.
`?scenario=demo:sok:draft` runs one as an ordinary free scenario.
`npm run personas` runs all of them headless and fails if a tell never fires, a demo collides or an
expectation does not hold (`node tools/personas.js --verbose` prints the captions).

`npm run simtest` runs the traffic model headless and prints lane usage, speeds and collisions
(options: `density=20 lanes=4 player=120 plane=2 limit=130 min=6`).
`node tools/shot.js <dir> [day|dusk|night]` takes screenshots in headless Edge (run `npm run build` first).
**Scenarios** (`src/scenarios.js`): repeatable situations for tuning the AI. Open
`http://localhost:5173/?scenario=elephant` (Backspace restarts, O cycles to the dev overlay), or run
`npm run scenario elephant` for a headless timeline of who signals, merges and brakes
(`you=ai` lets an AI drive your car; run without a name to list scenarios).

`npm run abtest -- anticipation=0 anticipation=1` compares traffic settings over many seeds
(hard braking, emergency stops, truck overtakes, lane changes, speed).

**Proefrit** (F-37, `src/journal.js`, `src/moments.js`): every drive is recorded to one JSON
journal. `F8` drops a mark while you drive; the pause menu (Esc) takes a one-line note per mark and
an *End drive…* button asks three optional questions, then POSTs the journal to the Vite dev server
(`playtests/human/<date>-<time>.json` — commit these; they are design history and the calibration
set). `npm run report -- playtests/human/2026-01-31-17-42-09.json` turns a journal into `report.md`:
rates per 10 minutes for each moment kind, the M1 check, a from-the-seat timeline, your marks and
their nearby detectors, and a health block. `src/moments.js` judges only what a driver in the car
can see; thresholds live in `CONFIG.moments`. `npm run moments` runs the detector smoke test.
**Playtest bot** (`src/perception.js`, `src/botDriver.js`, `tools/playtest.js`): a deterministic
driver that has nothing but the keyboard. It sees only what a driver in the car can see (a
whitelist of cues, no intent or hidden sim state), and its output is held keys plus key presses, so
it goes through the same pedal ramp, cruise-control clicks and indicators as you.
`npm run playtest -- driver=forens min=20 seeds=5 tod=day` runs one child process per seed (traffic
ids are a module global) and writes `playtests/bot/<run>/` with a journal per seed, a bot trace
(`seed-N.trace.json`), `run.json` (arguments, commit, timings, checks, pass/fail) and `report.md`
from the same `buildReport()` a human drive uses. Options: `driver=slak` (the slowcoach),
`scenario=closure`, `seed=N`, `until=T` (one seed; prints the player state, the nearest car per
lane from the percept, the bot state and the last trace lines, no report), `jobs=N`, `dt=1/60`,
`cfg.<key>=<value>` and `<profile>.<param>=<value>`. `npm run bottest` runs the headless tests:
perception geometry and range cut-offs, a throwing proxy over every vehicle, the import/DOM
whitelist, the drift cue, synthetic following/cut-in/indicator cases, and determinism.

`node tools/glare.js <dir>` sets up a night scene with cars close behind and oncoming, for checking headlight glare.
`node tools/speeds.js [dayDensity] [nightDensity]` reports wanted vs driven speeds per archetype and lane.

`node tools/lineup.js <dir>` parks one car of each archetype next to you (sides, fronts, mirror; day and night) for look-dev.
`node tools/clip.js <scenario> [seconds] [chase|bonnet|cockpit] [off|ar-rel|ar-abs|dev] [out.mp4]` records a video of a scenario (needs ffmpeg).
`node tools/nightroad.js <dir>` shows an empty unlit road lit only by your own lamps, then traffic.
`node tools/night.js <dir>` shoots the night mood on an unlit stretch and inside a sodium-lit one
(uses the `window.__game.teleport(s)` debug hook).

**Matrix signs and lane closures** (`src/msi.js`, `src/closureView.js`): gantries every 500 m show a queue warning (flashing 50 / 70) behind slow traffic by themselves, and arrow / red cross / 70 around a lane closure. Closures appear at random in free play (`closuresPer10km`), or try `?scenario=closure`. `node tools/closure.js [lanes] [density] [closedLane] [minutes]` checks safety and throughput headless.

**Lane map** (`src/lanemap.js`, U): overhead view of your carriageway, cars coloured by speed; press U again for a time-space diagram of your lane (waves show as bands creeping down). `,` `.` zoom. `?scenario=wave` provokes one; `node tools/wave.js` measures how it grows or damps.

**Radio** (`src/radio.js`, Y): your own music folder (menu, Esc) or live NPO stations. Streams use a plain `<audio>` element on purpose: routing cross-origin streams through Web Audio plays silence.

**Driver archetypes** (`src/archetypes.js`): a persona sets both a car's look (paint, stance, tint,
light signature) and, about 70% of the time, its driving style. Leasebak, Patser, Pensioner,
Grijze sok (slipstreams trucks, `?scenario=sok`), Family, White van and EV smoothie; `?scenario=cast` shows them all; `archetypes` in config.js scales how common they are. Try `?scenario=archetypes`.
