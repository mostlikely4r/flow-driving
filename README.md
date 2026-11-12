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

`npm run simtest` runs the traffic model headless and prints lane usage, speeds and collisions
(options: `density=20 lanes=4 player=120 plane=2 limit=130 min=6`).
`node tools/shot.js <dir> [day|dusk|night]` takes screenshots in headless Edge (run `npm run build` first).
`node tools/glare.js <dir>` sets up a night scene with cars close behind and oncoming, for checking headlight glare.
