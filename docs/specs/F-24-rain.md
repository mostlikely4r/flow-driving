# F-24 Rain, slice 1: wet driving and spray (spec)

Date: 2026-11-26. Backlog item F-24 (Rain, M2). Status: ready to build.

## 1. Why

Rain is the biggest open M2 item ("the road breathes ... and it rains", `docs/vision.md`). The
point of this slice is rain as a **traffic** change: drivers leave more room, drive a little
slower and brake more gently, not all of them equally, and nobody sits blind in the spray behind
a lorry. The looks (sky, spray, wipers) carry it; road reflections wait for slice 2.

Pillars: *Authentic* (wet driving is how the A12 looks in November), *Readable* (spray you can see
explains why a car hangs back or pulls out), *Calm* (rain adds no timer or penalty, only flow).

## 2. The picture

You switch rain on in the menu. The sky goes grey and the view shorter, the wipers sweep. The
traffic around you spreads out: most cars drop back to longer gaps and a few km/h lower, a
pensioner or family car a lot, a patser hardly at all, and some ordinary drivers not at all.
Behind every lorry hangs a cloud of spray. A car that finds itself in it stays there a second or
two, then either drops back until it can see past or pulls out and overtakes. It never follows
in the spray. When you drive into it yourself, your view is genuinely gone, so you back off for
the same reason they do; nothing in the game forces you.

The matrix signs don't know it is raining: they react to the slower traffic, as they already do.

## 3. Premises and where they come from

- **Toggle, not a weather timeline.** *Decided* (user).
- **Matrix signs stay traffic-driven**, no weather logic in `msi.js`. *Decided* (user).
- **Spray blocks the AI's view, and a blinded driver backs off within ~1–2 s.** *Decided* (user,
  from their own driving: "no one drives with blocked view for any time").
- **Spray is drawn densely enough to block your view too, only through the camera** (no sim
  effect on the player car, no forced behaviour). *Decided* (user).
- **Wipers and a wet sky as mood; reflections are slice 2.** *Decided* (user / queue note).
- **Wet AI values** (longer headway, a few km/h slower, softer braking, spread by persona, some
  not adapting): the direction is *decided*; every number in section 5 is *my proposal*, taken from
  general driving research, not measured here. Rain is known to cost a road roughly 10–15% of its
  capacity; that range is the target the checks hold the numbers to, and it is a guess for this
  model until the checks run.
- **Spray distances** (spray reaches ~50 m behind a lorry above ~50 km/h; a driver sees past at
  ~75 m): *my proposal*, a guess.

## 4. Baseline (do not revert or redesign)

- `src/traffic.js`: IDM/ACC car following in `idm()`; per-driver `T`, `a`, `b`, `v0` set in
  `makeVehicle()` from `TYPE_PARAMS` and then the persona (`applyPersona()` in
  `src/archetypes.js`). The headway a driver actually follows eases toward a target `tT` each step
  (`veh.T += (tT - veh.T) * min(1, dt*0.4)`), with `veh.Tbase` as the resting value and
  `veh.Tdraft` for slipstreaming grijze sokken behind trucks. `applyLimit()` sets `v0base` from the
  limit; `setLimit()` reapplies it to every vehicle.
- `src/session.js`: `applyTimeSim()` is where sim state that comes from the world settings
  (night, density, limit) is put on the traffic; `createSim()` calls it. `src/main.js`
  `applyTime()` is its browser twin (environment, scenery, oncoming). Rain follows the same split.
- `src/hud.js` `buildMenu` holds the settings rows (`timeOfDay` etc.); `main.js` handles changes.
- `src/environment.js` `setMode()`: sky colours, fog near/far, exposure, bloom per time of day.
- `src/perception.js` (F-37 slice 3): trucks, vans and caravans occlude cars in the bot's percept.
- `tools/closure.js`: a fixed lane closure; prints collisions, emergency stops and the cars
  that get through (`through`).

**Hard rule: with rain off, the sim must be identical to `main`.** No new `rng()` draws in
`makeVehicle()` or anywhere on the dry path; the wet values per driver are derived from the
already drawn `veh.seed` (a separate small hash/rng), so the same seed gives the same world dry,
and the same world plus rain wet. Check with the full check outputs against `main` (section 7).

## 5. What to build

### Step 1. The toggle and the wet sim

1. `src/config.js`: `rain: false` (saved like other settings), and a `wet` block. All values are
   *proposals*:
   ```
   wet: {
     adaptShare: 0.85,     // share of ordinary drivers who adapt at all; the rest drive as in the dry
     Tmul: 0.35,           // full adaptation: time headway × (1 + Tmul)
     underKmh: 8,          // full adaptation: wanted speed this much lower
     bMul: 0.85,           // full adaptation: comfortable braking × this (brakes earlier, softer)
     aMul: 0.9,            // full adaptation: pulls away a little more gently
     truckTmul: 0.15,      // lorries keep speed (limiter) but leave a bit more room
     sprayM: 50,           // spray reaches this far behind a lorry...
     sprayMinKmh: 50,      // ...when it drives faster than this
     sprayClearM: 75,      // a blinded driver drops back to this gap, where it sees past
     sprayGraceS: [1, 2],  // how long a driver tolerates the spray before acting, per driver
   }
   ```
2. **Per-driver adaptation `veh.wetK` in 0..1**, from a small rng seeded with `veh.seed` (never
   `this.rng`). Base: uniform 0.5–1; `1 - adaptShare` of ordinary cars get 0. By persona
   (`drives`, the driving archetype, not the look): pensioner, family, sok, ev 0.8–1;
   leasebak 0.2–0.5; whitevan 0.2–0.6; patser 0–0.2. Trucks and caravans use `truckTmul` only.
   Put the persona ranges next to each archetype in `archetypes.js` (a `wetK: [lo, hi]` field),
   so the cast viewer (F-35) can show them later.
3. **Applying it.** `Traffic.setWet(on)` stores `this.wet`, and for every vehicle (and every new
   one in `makeVehicle()` after the persona): keep the dry values once (`veh.dry = {Tbase, a, b}`)
   and set `Tbase = dry.Tbase × (1 + Tmul × wetK)` (lorries: `× (1 + truckTmul)`),
   `a = dry.a × lerp(1, aMul, wetK)`, `b = dry.b × lerp(1, bMul, wetK)`; off restores the dry values.
   `applyLimit()` subtracts `underKmh × wetK` from cars' and vans' `v0base` when wet (not from
   lorries). `veh.T` already eases toward `Tbase`, so switching mid-drive spreads the traffic out
   over some seconds instead of snapping. Matrix-sign limits (`msiOver`) apply on top, unchanged.
4. **Spray.** In the step where `tT` is computed, when `this.wet`: if the same-lane leader is a
   `truck` above `sprayMinKmh` and the gap is under `sprayM`, the driver is *in the spray*:
   `veh.sprayT += dt`, else it resets to 0. Once `sprayT` passes the driver's grace (from
   `sprayGraceS`, derived from `veh.seed`):
   - `tT = max(tT, (sprayClearM - s0) / max(v, 5))`: the headway target becomes the gap where it
     sees past, so it drops back by the usual easing, never by braking hard (keep the normal IDM
     limits; no new hard brake).
   - Slipstreaming is off (`drafting` false): a grijze sok does not tuck in behind a lorry in the rain.
   - Overtaking gets a nudge: in the lane-change incentive, a car blinded behind a lorry counts
     the lane to the left as worth `+0.2` extra (*proposal*), so a car that wanted to pass anyway
     does it now, and one that didn't drops back. The no-undertaking and keep-right rules are
     unchanged.
   - Pressing (closing up on a slow car before pulling out, `press`) is capped to the spray edge:
     while waiting to pull out a driver sits at `sprayM`, not inside it.
   - The player car is not a lorry and makes no spray. Vans and caravans make none (*proposal*:
     only lorries in this slice).
5. **Where the toggle reaches the sim:** `applyTimeSim()` gets a sibling `applyWeatherSim(sim,
   rain)` that calls `traffic.setWet(rain)`; `createSim()` takes `rain` (default `CONFIG.rain`) and
   calls it after `applyTimeSim()`. The oncoming carriageway in `main.js` gets `setWet` too, so its
   traffic looks the same.
6. **Menu and URL:** a checkbox row "Rain" under Time of day in `hud.js`, handled in `main.js`
   (`applyWeather(v)`: sim plus view, step 2). Dev URL `?rain=1` (like `?scenario=`), not saved. The
   playtest runner and the replay URL take `rain=1` too, and the journal header records `rain`, so
   a wet drive is reproduced wet.

### Step 2. The view: wet sky, spray, wipers

1. `environment.js`: a wet variant of each time of day: greyer sky, lower sun/no stars, fog
   pulled in (proposal: `fogFar` × 0.45, `fogNear` × 0.5), exposure a touch down. `setMode(mode,
   world, rain)`; no new state outside the environment.
2. **Spray** (new `src/spray.js`, rendering only): behind each lorry within ~300 m of the camera
   above `sprayMinKmh`, a column of soft, camera-facing translucent sprites from the rear wheels
   back to `sprayM`, thickest just behind the lorry and fading out, density rising with speed. It
   must be dense enough that from your seat at 20–30 m behind a lorry you cannot see the cars
   ahead of it, and see past it again at ~75 m. Batched like `GlowSystem` in `fx.js` (one draw
   call); visible in the mirrors because it is ordinary scene geometry. At night it lights up in
   your headlights and the lorry's tail lights (additive tint from the glow colours, keep it cheap).
   No sim code reads it.
3. **Wipers** in the cockpit (`main.js` cockpit group, layer `LAYER_COCKPIT`): two blades
   sweeping at a steady interval (proposal: one sweep per ~1.2 s), only in the interior view.
   Optional, if cheap: a faint drop texture on the windscreen that the blades clear. No sound
   required (audio is a later slice).
4. Road surface: a darker, slightly glossier asphalt when wet (a material tweak only); real
   reflections of lights are slice 2.

### Step 3. The bot sees the spray too (*proposal*)

The bot drives the player car from what a driver can see (`perception.js`). In rain, a lorry's
spray hides everything ahead of it from a percept closer than `sprayM` (same line-of-sight rule as
occlusion, the lorry's rear plus `sprayM` as the blocker). `forens` (and the other bot profiles
except `dwars`) back off to `sprayClearM` or overtake, like the AI. `dwars` may sit in it: that is
what the awkward-player probe is for. This keeps wet `playtest` runs honest.

### Step 4. The rain check: `tools/rain.js` (`npm run rain`)

Same seeds, dry against wet, printed side by side:
- **Plain road** (the `simtest` setup, 3 lanes, densities 8 and 12, 6 min): mean speed per lane,
  median time gap per lane, hard brakes (< −4 m/s²), overlaps.
- **Closure** (the `closure.js` setup, 3→2 lanes, density 14, 10 min): cars through, collisions,
  emergency stops.
- **Spray:** share of car-seconds spent in spray, and the longest single stretch any car spent
  in spray, wet only.
- Exits non-zero when a line in section 6 fails.

## 6. How we'll know

Checks (all headless):
- **Dry is unchanged:** `npm run simtest`, `npm run personas`, `node tools/closure.js` and
  `npm run bottest` print the same numbers with `rain` off as on `main` before this change.
- **Wet works** (`npm run rain`):
  - 0 collisions and 0 overlaps, plain road and closure.
  - Emergency stops in the closure no more than in the dry.
  - Closure throughput wet 85–90% of dry (the 10–15% capacity drop). A drop under 5% means drivers
    barely adapt; over 20% means the closure jam (already harsher than reality, F-22) got worse
    than real rain makes it. Either fails and the `wet` numbers get tuned, not the closure.
  - Plain road: median time gap up 15–35% for cars; mean car speed down 3–8 km/h in lanes 1–2.
  - Spray: no car in spray longer than its grace + 3 s, apart from a car that is itself boxed in
    (report those separately, with ids, instead of failing on them).
  - Personas: a wet `npm run personas` run shows pensioner/family gaps grow most and patser gaps
    least (print the per-persona median time gap dry/wet).
- `npm run build`, `npm run moments`, `npm run worldtest` pass.

**Try it:** `npm run dev`, open the menu, tick **Rain**, and drive behind a lorry in the right lane
at 80: within 30 m the spray takes your view of everything in front of it; drop back to ~75 m and
the cars ahead appear again. Watch the cars around you in the mirror: most hang further back than
in the dry, one or two don't. Flip Rain off and on a few times: the traffic spreads out and
closes up over several seconds, not in a jump. (Dev: `?rain=1&scenario=elephant` puts you behind
lorries straight away.)

## 7. Not doing

- No weather logic in the matrix signs (*decided*): they react to traffic speed only.
- No "bij nat wegdek" limit signs in this slice (*decided*): those are for sharper bends, which
  the road doesn't have yet. Noted on F-24 for later (curves, M3).
- No forced behaviour for the player in spray: no speed cap, no penalty, no HUD warning.
- No weather that changes on its own.

## Needs first

Nothing unbuilt. Checked present on 2026-11-26: `idm()`, `Tbase`/`Tdraft` easing and
`applyLimit()`/`setLimit()` in `src/traffic.js`; `applyPersona()` in `src/archetypes.js`;
`applyTimeSim()`/`createSim()` in `src/session.js`; `buildMenu` in `src/hud.js`; `setMode()` in
`src/environment.js`; occlusion in `src/perception.js`; `GlowSystem` in `src/fx.js`; the cockpit
group in `src/main.js`; `tools/closure.js`, `tools/simtest.js`. Q-11 (F-48 slice 1) also touches
`main.js` and `environment.js`; rebase onto it if it lands first, nothing depends on it.

## Not in this build

- Slice 2: wet-road reflections of lights, rain sound, puddles/aquaplaning (probably never).
- Spray from vans and caravans; spray thrown sideways onto the next lane when you pass a lorry
  (only the view behind it is modelled).
- "Bij nat wegdek" signs, once there are bends (F-30/M3).
- Showing `wetK` per persona in the cast viewer (F-35).
- Driver rules (F-53) will restate the spray rule in general form; this slice doesn't wait for it.
