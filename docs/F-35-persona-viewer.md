# Persona viewer (F-35)

A pause-menu screen (`C`, or "Meet the cast" on the title card) that is a **rig**, not a page: a
turntable with a strip of motorway under the car. Everything the viewer needs later — a lead car,
a second lane, a staged demo — is added to that same rig. The list, the numbers and the captions
all come out of `ARCHETYPES` and `SCENARIOS`, so a new persona shows up without touching the viewer.

Why a rig and not a showroom render: the whole point of F-14 is that you read a driver from the
mirror. A beauty shot can't show a 0.6 s gap, so the road stays under the car and it scrolls at the
speed that persona actually drives.

## The rig

- A one-lane road strip on its own: asphalt + worn lane edges from `textures.js`, scrolling at
  the persona's wanted speed. No platform, no verge, no kerb, no polder — while the viewer is open
  the world is put away and the background is black, so the lane and the cars are all there is
  (a studio, not a diorama).
- **It is a treadmill**: the car holds position on the strip and the road moves under it, so speed
  reads from the surface, not from a number. No second physics loop.
- **The wheels do not spin, and must not be promised.** `wheel()` bakes the tyre and rim into the
  shared `trim`/`chrome` slots, so there is no per-wheel mesh to rotate anywhere in the renderer
  (the `axle` on a visual is only the trailer's pivot). On a turntable that may start to read as
  odd; if it does, the fix is separate wheel groups in `vehicles.js`, not a viewer hack — that is
  **F-36**. Until then the scrolling surface and the lane dashes carry the speed.
- The stage borrows `TrafficView`'s visual pool rather than building cars itself: `view.add()` /
  `view.remove()` on a fake vehicle gives the right geometry for `variant:low:lights`, pooled and
  repainted by `applyLook()`. Flipping body styles costs nothing and leaks nothing.
- The lamps are emissive materials driven by hand (`m.tail`, `m.indL`, `m.indR`, `m.drl`), so the
  stage can blink an indicator or light the brake lamps on cue without stepping any traffic. That
  is how the tells glow before slice 3.
- **Where it lives**: a `CastStage` group in the main scene, parked ~45 m off the carriageway edge
  at a fixed offset from the player and moved with them while open, `visible = false` otherwise.
  `CastStage.hideWorld()` puts every other renderable in the scene away (sky, ground, scenery
  chunks, traffic, glow, beams) and nulls the fog, then `showWorld()` puts back exactly what it
  hid, so nothing else has to know the viewer exists. It keeps the scene's sun/hemi, so the car
  still looks in-engine rather than in a product page. Nothing to add to the render loop but a
  camera and a texture offset.
- **Sides**: the rig's lane runs along +z like the game's road, so its +x is the LEFT of travel
  (the game's `lat` is positive to the right, i.e. −x). Lane offsets and every camera yaw in
  `castStage.js` are written in that rig frame, mirrored from `lat`: traffic reads as driving to
  the right and an overtake happens on the car's left, the way it does in play. Do not flip one
  without the other — that is exactly the "scenarios are mirrored" bug.
- The car is a real `createVehicleVisual` instance wearing `lookFor()`, so it is the in-game car,
  not a copy that drifts.
- Camera: a slow orbit, plus three fixed framings — **mirror** (what you'd see approaching it),
  **side-tracking pass-by**, **rear-quarter**. `L` flips day/night so the lamp signature shows.
  In slice 1 the mirror framing is a camera angle (eye height, low, close), not a real mirror pass;
  a true mirror render costs a second pass and teaches nothing extra.
- Left rail: the personas in `ARCHETYPES` order, each with its one-liner. `↑` `↓` or scroll.
- Right: the spec sheet. `Enter` on a line that has more to show → the rig grows (slice 2, 3).

## Spec sheet: derived, not written

Sample `drive()` 400 times on a dummy vehicle with `force` and a seeded RNG, then aggregate each
field into a range. That is the only honest way to describe a persona: it reports what the code
does, and it moves when the code moves. Values shown for the seven personas today:

| Persona | wants | follows (T) | gives way (p) | reacts | signals | the extra tell |
|---|---|---|---|---|---|---|
| Leasebak | +18…+32 | 0.8–1.1 s | 0–12% | 0.45–0.7 s | 0.8–1.4 s | reads far ahead (lifts, rarely brakes) |
| Patser | +12…+36 | 0.55–0.85 s | 0% | 0.35–0.6 s | 0.15–0.5 s | a ×1.35, ignores signs (+12…+25 over) |
| Pensioner | −13…−5 | 1.6–2.2 s | 60–90% | 0.9–1.4 s | 2.6–3.8 s | a ×0.8, merges 0.8–1.0 early |
| Grijze sok | −10…−4 | 1.5–1.9 s *and 0.95–1.25 behind a truck* | 40–70% | 0.6–0.9 s | 1.8–2.6 s | a ×0.7, never presses |
| Family | −1…+4 | 1.4–1.8 s | 40–60% | 0.7–1.1 s | 1.6–2.4 s | cooperative, strict, no hogging |
| White van | +6…+18 | 0.8–1.1 s | 0–15% | 0.6–1.0 s | 0.6–1.2 s | presses 0.7–1.0 while waiting, merges late |
| EV smoothie | −0.5…+0.5 | 1.3–1.7 s | 20–40% | 0.3–0.5 s | 2.0–3.0 s | a/b ×0.85, hogger 35% of the time |

Plus the authored layer, 2–3 short lines per persona ("what to look for"), and one honesty line
that is not optional: *looks the part, drives like it ~70% of the time* (`loyalty`).

## Slice 1 — turntable, road speed, car selection

- Default car: weighted pick over `a.variants` (leasebak 50/50 estate/sedan, family mostly SUV,
  white van van, sok sedan, ev sedan, patser/pensioner hatch).
- Below the rig: one chip per variant the persona inhabits, with its weight. Clicking rebuilds the
  visual as that variant. Paint is keyed to `(persona, variant)` so flipping body style does not
  change the colour of the car.
- The km/h readout is the persona's real wanted speed (limit + offset), not decoration.
- The rig steps no traffic and touches no game state: slices 1–2 are pure visuals, so opening the
  viewer while paused or inside a scenario cannot disturb anything.
- Done when: every key in `ARCHETYPES` is listed without editing the viewer; flipping variants
  keeps paint; `L` visibly swaps LED bar ↔ warm halogens ↔ angel rings and the stage is genuinely
  lit by the scene's sun/hemi (not a flat ambient); the speed reads inside the sampled range; the
  stage is invisible in normal play and leaves no visual or memory behind after closing.

## Slice 2 — the headway line, and the lead car

- The `follows 0.8–1.1 s` line is clickable. Click → the road lengthens (~3× zoom out), a plain
  neutral car appears ahead, the star closes to its headway, and a bracket shows the gap in both
  seconds and metres. Click again → back to the plain turntable.
- The lead car is deliberately ordinary (family estate at a constant speed) so the gap is the only
  variable on screen.
- Grijze sok gets two chips: *normal 1.5–1.9 s* and *behind a truck 0.95–1.25 s* (`Tdraft`). That
  second headway is invisible in every other view and it is the entire persona.
- Done when: the bracket agrees with the sampled T to within 0.05 s for all seven; the lead car is
  reachable for a persona without `Tdraft` too.

## Slice 3 — the behaviour demos

- **Every line on the sheet is clickable.** The rig grows to the lanes that behaviour needs — one
  by default, two for an overtake, three for undertaking or middle-lane camping — and plays a
  staged loop.
- Demos live in `scenarios.js` as `demo:<persona>` (or `demo:<persona>:<trait>`, several per
  persona), reusing `applyScenario`: seeded, `force`d loyalty, no player car, `?scenario=demo:sok`
  for free.
- **A demo may show the typical outcome, not the extreme.** `p` 0–12% means the person is usually
  ignored: stage a car wanting in and let the star not yield, with the caption naming the odds.
  Same for `react` 0.3–0.5 s — a lead car brakes and you watch the *delay*, not a claim about it.
  A rarer outcome can be a second demo on the same line (`demo:patser:yield` vs `:not-yield`),
  labelled with its likelihood.
- Demo actors, all existing machinery: a lead car that brakes (`brakeEvent`, as in `wave`), a car
  signalling to merge in (politeness), a truck to tuck behind (sok), a slow car in the left lane
  (leasebak), a queue with a gap (family). No new behaviour code, only staging.
- A trait that truly cannot be staged (it needs a world the rig doesn't have) stays text and says
  so on the line: "not shown". That is the exception, not the default.
- **Captions are detected, not timestamped.** Each demo declares conditions on the star vehicle
  (`v.intent >= 0`, indicator on, `leader.type === 'truck'`, gap crossing a threshold) and they
  fire once, with a hold time. If the AI changes, the captions change with it.
- Loop with a short freeze and fade. `Space` pause, `1`/`2` slow-mo (0.5×, 0.25×) — telegraphing
  is invisible at 1× — `R` restart, `Esc` back to the sheet. The sheet's own **Back to the
  turntable** button does the same, because a key nobody knows about is not a way out.
- A live strip shows the star's numbers (`+21 km/h · 1.0 s · p 0.05`), so the text and the motion
  are obviously the same thing.
- Done when: `node tools/personas.js` runs every demo headless, asserts an `expect` per demo plus
  zero collisions, and fails if any declared tell never fires. Non-zero exit means the viewer would
  be lying.
- **Built (slice 3).** `npm run personas`: 55 demos across the seven personas, 0 collisions, every
  declared tell fires (alternative outcomes are one group, one of which must fire), every expectation
  holds. Demos are staged at the 100 km/h day limit even at night, because the persona's behaviour
  changes with the limit (a sok at 130 overtakes the truck it would draft behind at 100). The rig
  grows to one, two or three lanes from the demo's own `lanes`, and the camera keeps the star and the
  car the demo is about in frame.

## Truth rules

1. List, cars, numbers and captions are all derived. Adding a persona = a `drive()`, a `variants`
   entry, and 2–3 lines of prose.
2. A demo shows the *likely* case and says how likely it is; it never claims "always". A persona
   with no demo yet shows "demo pending" rather than an invented one.
3. A number may only be shown if it is inside the sampled range; a behaviour may only be claimed if
   the headless run checks it.
4. Never "always": loyalty is on screen.

## Trucks and other body types (added later, no viewer change)

The viewer iterates `ARCHETYPES` and never hardcodes the seven names, so a truck persona appears
as soon as one exists. It will exist eventually — trucks have behaviour too (slow, keeps right,
starts elephant races) — but three small things gate it today, worth knowing now:

- `makeVehicle()` only rolls a persona for `car` and `van`. A truck persona needs that line opened
  up (and `applyScenario` to pass the key, which it already can).
- `lookFor()` returns `null` for anything but car/van, so a truck's visual tells (company livery,
  a battered old rigid vs a new tractor, trailer type) would need that path extended.
- Truck speed comes from `ownMax`, not `limitOffset` (`applyLimit`), so a truck `drive()` must set
  `ownMax`/`thr`/`eager`/`bias` instead of the car fields — otherwise its wanted speed silently
  does nothing. Worth a comment in `archetypes.js` when the first one lands.

## One module behind both the screen and the test

`src/personaSpec.js` holds the two functions everything reads from: `variantsOf(persona)` (the
weighted body list) and `sampleSpec(key, n = 400)` (ranges for every field the sheet shows, from
`drive()` on a dummy with `force`). The viewer renders from it and `tools/personas.js` asserts
from it, so the number on screen and the number in the test cannot drift apart. Any new persona
needs no change here — that is the whole point.

## Gotchas

- `mode` in `main.js` already means time of day. Name the new screen state `ui`.
- `C` is free (input.js maps W/A/S/D, arrows, Z/X, B, F, Space, O, U, Y, H, Backspace). ↑/↓ are
  also drive keys, which is fine only because the viewer pauses the sim; `Tab` / `Shift+Tab` is the
  safe alternative if that ever changes.
- Free-play random closures use `Math.random` — gate them off while the rig is open.
- `traffic.step()` needs an `s` for spawning: park and hide the player car rather than removing it.
- The rig must not depend on `player.s` advancing, or the turntable will drift away from the scenery.
- Anything the spec says the renderer does, check in `vehicles.js` first. Wheel rotation was the
  one assumption here that turned out false.
- The demo stage's `Traffic` carries its own `lanes`; do not set `CONFIG.lanes` for it or the world
  road is rebuilt around the rig.
- Keep the demo camera on the road side of the lane. A wider side-on framing puts the camera out
  past the ~45 m the stage sits off the pavement; wide framings use a rear view instead of a longer
  side-on one. (The world is hidden now, so it can no longer fill the background, but the lane is
  still only as long as the rig built it.)
- Demos are staged at the 100 km/h day limit whatever the game's time of day. The persona look still
  changes with the scene's night lighting, but the behaviour does not: a sok at 130 overtakes the
  truck it drafts behind at 100, so a night demo would describe a different driver.
