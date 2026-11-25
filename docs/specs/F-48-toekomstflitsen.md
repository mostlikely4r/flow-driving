# F-48 Toekomstflitsen: the promised now (spec)

Status: specced. Written 2026-11-24. BACKLOG item **F-48**. *Decided* (2026-11-25): slice 1 is
built early, as a cheap test of the covered left lane (QUEUE Q-11); slices 2 to 4 wait until the
real world (M2, M3) is done. Build it slice by slice, each in its own thread
(`/build docs/specs/F-48-toekomstflitsen.md`, naming the slice).

*Decided* marks the user's own calls. *Proposal* marks the planner's; the builder may change a
proposal's numbers or names if a look or a measurement says so, and notes why in the BACKLOG line.
Where a premise comes from is in brackets: **[user]** the user's own call or reference,
**[code]** read from the code at `137ad71`, **[guess]** the planner's guess.

## 1. Why

Flow Driving is the A12 as it is. The futurist illustrations of the 1990s (Robbert and Rudolf Das:
*Toekomstflitsen*, *Wegen naar de toekomst*) drew the same roads as people then expected "now" to
look. The user photographed spreads from those books as reference **[user]**. A switch between the
now we got and the now we were promised is a gentle joke the game can make because the sim is kept
apart from rendering and the world and cars are procedural **[code]**. The over-optimism is the
charm.

Inside this mode, pillar 1 (Authentic) means *true to that vision*. The traffic stays real Dutch
drivers with the same habits, speeds and rules. Readable traffic and Calm apply unchanged.

**Our own designs in that spirit, never copies of the illustrations.** *Decided* **[user]**. The
book photos are not committed to the repo. Nothing in the game reproduces a drawing, its layout,
its vehicles or its numbering; the descriptions below are enough to build from.

## 2. The picture

You are driving the A12 at 100 km/h in light traffic. You press the toggle; a short white flash
(the *flits*), and the world is the promised one. The same cars sit in the same places, doing the
same things, but they are now 1990 wedges: low, sharp-nosed and glassy, with each driver's tells
still readable. The concrete median barrier now carries a raised spine on Y-shaped pillars. Ochre
and red decks reach out over the left lane on both sides, and on them platoons of small automated
cabins hiss past overhead at a steady pace. Your left lane is half covered: shade, a ceiling, the
opposing carriageway hidden behind pillars. The sky is a cleaner brochure blue and the grass
greener. At the next overpass a round tube portal sits in the embankment; now and then a freight
capsule train slides out of it. The distribution centre ahead is a terraced glass building with
planted roofs. The matrix gantry reads the same 100 as before, in a slimmer, rounder frame. Press
the toggle again: flash, and the grey present is back, with traffic unchanged.

## 3. Governing rule

**Every future piece stands in for a present-day piece.** *Decided* **[user]**. No future-only
objects. The mode is a re-skin of things the present world already builds:

| Present (today's code) | Promised (this plan) |
|---|---|
| Concrete median barrier (`scenery.js` `buildChunk`, "median barrier") | Barrier plus guideway spine, decks and cabins |
| Car, van, truck, rigid and caravan bodies (`vehicles.js` `buildVariant`) | Wedge bodies with the same `VARIANTS` dimensions |
| Overpasses (`scenery.js` `overpass`) and their embankments | Freight tube portals beside the overpass, with a capsule train |
| Distribution-centre boxes (`scenery.js` `distributionCentre`) | Terraced glass buildings |
| Matrix gantries and faces (`matrixGantry`, `textures.js` `matrixTexture`) | Slim 1990 "smart road" frames, same faces |
| Day/dusk lighting (`environment.js` `MODES`) | A brighter brochure palette |
| Synthesized engine and vehicle sound (`audio.js`) | Electric hum and the guideway whoosh |
| The radio (`radio.js`) | A promised-now station |

Planes, ships, ports, airports and trains come to this mode **only after their present-day twins
exist** *Decided* **[user]**: F-49 (rail beside the motorway), F-50 (planes on approach) and F-51
(a harbour stretch with ships). Each is a precondition for a later sky, sea and rail slice of F-48.
None exists today **[code]**.

## 4. Goal and non-goals

**Goal.** A live toggle between `world: 'now'` and `world: 'promised'` that changes only what you
see and hear: the median spine with its automated cabins, wedge bodies for every vehicle, freight
tube portals, glass buildings, future gantries, a palette shift, sounds and a radio station.

**Non-goals.**
- No change to the sim: `traffic.js`, `player.js`, `msi.js`, `session.js`, `perception.js`,
  `botDriver.js`, `junctions.js` logic and `variants.js` dimensions stay untouched. Driver
  behaviour, speeds and limits are the same in both worlds. *Decided* **[user]**.
- The player only watches the guideway in this plan; handing over to it is a later slice (see
  **Not in this build**). *Decided* **[user]**.
- No sky, sea or rail pieces until F-49 to F-51 exist. *Decided* **[user]**.
- No score, reward or unlock attached to the mode (Calm).

## 5. Baseline (do not revert or redesign)

Facts from the code at `137ad71` **[code]**:

- Cross-section (`layout.js`, `config.js`): lateral `lat` from the median centre, positive to your
  side. Barrier half-width `barrierHalf` 0.35, `innerShoulder` 1.0, `laneWidth` 3.5, 3 lanes, lane
  0 is the right lane. So the left lane spans `lat` 1.35 to 4.85.
- The barrier is swept from `barrierProfile` (0.6 m wide at the foot, 0.85 m high) in
  `Scenery.buildChunk`. The player's barrier contact lives in `player.js` and reads only
  `barrierHalf`; nothing in the sim knows about scenery meshes.
- `Scenery` streams 200 m chunks (`CHUNK`) from 600 m behind to 2800 m ahead, building at most
  `budget` (2) chunks per frame, nearest first. `dispose(ch)` frees a chunk. `setNight(mode)`
  shows the pattern for changing materials across chunks.
- `TrafficView.add(veh, look)` takes a visual from a pool keyed by `poolKey(variant, look)` or
  builds one with `createVehicleVisual(variant, rng, { low, lights })`; `applyLook` repaints for an
  archetype. The body colour is picked inside `createVehicleVisual` from `rng` and not stored on
  the vehicle.
- The player's car is `playerVis = createVehicleVisual('estate', …, { color: 0x23344d })` in
  `main.js`. Its headlights and the cockpit interior are children of `playerVis.front`.
- `main.js` `applyTime(m)` calls `env.setMode`, `scenery.setNight`, `setVehicleNight` and the sim's
  `applyTimeSim`. Settings live in `CONFIG`, overridden from localStorage by the menu.
- Keys already used in `main.js` and `input.js`: A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
  (most), F1, F8. F9 is free.
- `audio.js` is fully synthesized; `update(dt, st, listener, near)` already gets nearby vehicles
  with positions and speed for positional rumble.
- `radio.js` plays the user's own music folder or stream through an `<audio>` element; Y cycles
  sources. It deliberately has no built-in stations, because a public game does not link a
  broadcaster's streams.
- Archetype tells (F-15) are carried by `look`: colour, `low` stance, light signature
  (`lights`: std, modern, bar, angel, round, eco, tall, ev) and glass tint.

## 6. Rules that hold in every slice

1. **The sim never knows.** No sim module reads `CONFIG.world` or imports a future module. The
   check in section 8 enforces this.
2. **Same traffic, same places.** A swap never adds, removes or moves a vehicle. A vehicle keeps
   its body colour and archetype look across swaps.
3. **Tells survive.** Every archetype tell readable in `now` is readable in `promised`: the
   lowered patser is still low, light signatures keep their shape class (bar stays a bar, angel
   rings stay rings, round stays round), tinted glass stays tinted. A wedge van still reads as a
   van and a truck as a truck at 200 m.
4. **Collision is unchanged.** Nothing new stands where the player or a vehicle can touch it.
   Everything below 4.6 m above the road stays inside the barrier footprint (`|lat| ≤ 0.3`).
   *Proposal:* 4.6 m is the usual Dutch clearance under motorway structures **[guess]**; the
   reference drawing gives about 4.20 **[user]**. Take whichever leaves a truck visibly clear.
5. **Night, dusk and rain still work.** Every new material gets its night/dusk behaviour in the
   `setNight` pattern: lit deck edges, lamps on the spine, glowing tube portals, lit glass.
6. **Determinism.** Cabins, capsule trains and building choices come from `hash01` /
   `mulberry32` on the chunk index and the seed plus the clock, never `Math.random`, so the same
   seed shows the same promised world.

## 7. Steps

Four slices. Each ends at a commit and a short user try. Slice 1 rests on a guess (that the spine
is the image that carries the mode, and that a covered left lane feels good to drive under), so it
is the smallest version that tests it.

### Slice 1: the toggle, the spine and the palette — *built* (2026-11-25)

*Built* in this tree: `src/futureScenery.js`, the world switch (`src/config.js`, `src/main.js`,
`src/hud.js`, `index.html`), the palette (`src/environment.js`), the spine hook in
`src/scenery.js`, and `tools/worldtest.js`. What changed from the plan is listed after 1.5.

#### What changed from the plan (and why)

1. **The deck hangs at 7.8 m, not 6 m** (top 8.35, spine wall 9.85). A present-day matrix face box
   hangs at 6.1 m and is 1.5 m tall, and the gantry beam sits at 7.2 m — both over the left lane.
   At 6 m the deck would swallow the left lane's sign and slice every gantry. At 7.8 m everything
   present-day passes underneath untouched, so slice 3's gantries and faces keep their meaning.
   The pillars split into their Y at 4.6 m as planned.
2. **The cabins ride the deck's outer edge**, on a track cantilevered just outside the parapet,
   instead of standing on the deck top. A driver is always *under* the deck surface, so nothing
   standing on it is visible from the road: measured, only the outer ~0.3 m of the deck top ever
   shows above the edge. On the edge track the platoons pass where you can see them, just outside
   the pale blue rail, and their shadows sweep the road. `tools/worldtest.js` pins this.
3. **A platoon every 5 to 12 s per side**, not 15 to 40: at the plan's spacing the guideway stood
   empty for most of a minute at a time. As drawn, it is a stream.
4. **The narrow fallback is ±2.5 m**, not ±1.5: a 1.6 m cabin still has to fit on each side of the
   spine wall.
5. **The spine also stops 150 m either side of the random viaducts**, not only at junction
   bridges; they cross at 6.9 m and would be flown through.
6. **End blocks, no down ramp**: the deck runs into a solid block from 4.75 to 8.35 m. The cabins
   disappear into it, which is the read the plan wanted ("as if into a station").
7. **The deck underside is its own paler material** with a faint warm emissive: lit only by the
   dark hemisphere ground colour it read as a black mass at noon.
8. **The clearance overlay box was not built.** `tools/worldtest.js` asserts the clearance numbers
   and walks 20 km of road instead, which also runs on every full check.
9. **Night: the street lamps and their glow turn cool white** in the promised world, alongside the
   guideway lamps (the plan's "night is unchanged except for its lamp colours").
10. `overpassS` moved to `junctions.js` so the scenery and the spine agree on where the viaducts
    are without a second copy of the rule.

Checks: `npm run build`, `simtest`, `personas`, `moments`, `bottest` and the new `worldtest` all
pass; `simtest`, `personas` and `bottest` print byte-identical output to before the change, and
`moments` differs only in the wall-clock durations it prints. The full check takes about 25 s on
this machine, so the list stays as it is. Frame time in headless Edge, same spot in both worlds:
+7%, +15% and +22%, the last near a junction — noisier than the plan's 10% but in the same range;
the scene adds ~45k triangles per ~1.5 km.

#### Open: the real cross-section, **to be specced** (2026-11-25, **[user]**)

The build above is an interim shape, and the user has since read the drawings back and corrected
the numbers. Recorded here so the next spec starts from the drawing and not from this build:

- **The 4.20 m is the junction clearance we already have**, the one our on/off ramps bring.
- **The guideway passes under it**: the deck sits **2 m above the road**, the pods ride on it.
- **The pods are ordinary cars**, not bespoke cabins — only with an electric rail down the middle
  of the lane.

So nothing in the design needs the spine to stop at junctions, and slice 1's 7.8 m deck, its
150 m gaps and its end blocks are all consequences of the interim choice (a 7.8 m deck was the
height that cleared the present-day matrix faces at 6.1 m and gantry beams at 7.2 m; the pods had
to stand on the deck's edge because nothing on a deck top is visible from the road). At 2 m none
of that furniture is in the way — it is all above the pods.

What the spec has to settle, in order:

1. **A 2 m deck and the left lane.** A deck 2 m up cannot cover a lane a truck (≈4.0 m) drives
   in, and rule 4 in this plan (nothing below 4.6 m outside the barrier) forbids it. So either the
   guideway stays **median-only** (our `CONFIG.future.deckReachLanes: 0`, ±2.5 m today) — which
   would remove slice 1's "does the covered left lane feel good" question — or the promised left
   lane is cars-only, or the deck reaches over it and lorries keep right. This one decides the
   whole cross-section.
2. **The pods.** Reuse the wedge bodies (slice 2) as the deck's traffic, with the rail down the
   lane centre; view-only and clock-driven like today's cabins, or sim-driven when the guideway
   hand-over slice arrives. "Small automated cabins" in slice 1's text is superseded by this.
3. **The interim build.** Whether slice 1's 7.8 m spine stays behind `CONFIG.future` until the
   new spec lands, or is pulled straight to the median-only fallback in the meantime.
4. **Junctions.** At 2 m the gaps at bridges and viaducts can go, and the end blocks with them (or
   they become the station stop the drawing shows at a deck's end).

*Right now nothing has changed in the code*: the world switch, the palette, the cabins and
`worldtest` stand as built; only the heights, the gaps, the cabin bodies and the reach would move.

#### The steps as written

**1.1 The setting and the toggle.** *Built.* *Decided:* live swap mid-drive **[user]**.
- `config.js`: `world: 'now'` (`'now' | 'promised'`), stored with the other menu settings.
- Menu: a two-button row "World: Now · Promised" in the same style as `#calmbtns`.
- *Proposal:* **F9** toggles it while driving and shows a toast ("De beloofde wereld" / "De wereld
  zoals hij werd"). Add it to the help sheet.
- `main.js`: an `applyWorld(w)` next to `applyTime`, calling each view module's `setWorld(w)`.
  `applyTime` passes the world on as well, so time and world combine.
- *Proposal:* **the flits.** A 0.35 s white flash overlay (a full-screen div, opacity up and down)
  covers the swap. During the fully white frames, scenery rebuilds the chunks within 600 m of the
  player synchronously; the rest follow at the normal `budget`. If the rebuild still hitches, it
  hides under the flash.

**1.2 The spine.** *Built.* New `src/futureScenery.js`, called from `Scenery.buildChunk` when the world is
`promised`; it adds to the same chunk group and buckets, so disposal needs no change. Built along
the median with the existing `sweep` and `mat` helpers, in both directions of travel at once
(the spine is symmetric about `lat` 0).
- Keep the concrete barrier as it is; the pillars rise out of it.
- **Pillars** every 40 m *Proposal* **[guess]**. Each pillar is a slender column, at most 0.5 m
  wide, inside the barrier. Above 4.6 m it splits into a Y whose arms carry the deck underside.
- **Decks** at about 6 m, one on each side, reaching from the spine to `lat` ±4.85: over the
  inner shoulder and the left lane. The decks are ochre concrete with a red running surface, a
  low parapet with a pale blue rail, and a central spine wall about 1.5 m high between the two
  directions.
  *Decided:* start as drawn, over the inner lane; iterate, no attachment **[user]**. Make the
  reach one number, `CONFIG.future.deckReachLanes` (1 = over the left lane, 0 = median-only spine
  about 3 m wide), plus `CONFIG.future.spineEveryKm` / `spineGapKm` (default: continuous), so the
  fallbacks (a narrow spine, or spine only on stretches) are a setting change and not a rewrite.
- **Junctions.** The spine stops 150 m before a junction's bridge and resumes 150 m after it; at
  the ends the decks ramp down onto a short end block. *Proposal* **[guess]**. Use `inJunction` /
  `junctionsNear` from `junctions.js` (read-only) to find them.
- **Shadows.** Decks cast and receive shadows, so the left lane gets real shade at noon.
- **Night.** A line of small cool-white lamps under each deck edge every 20 m, and amber
  reflectors on the parapet, both in `setNight`.

**1.3 The cabins.** *Built.* In `futureScenery.js`, view only.
- Platoons of 3 to 6 small rounded cabins (about 3.2 × 1.6 × 1.4 m, glass canopy, a pastel
  colour per platoon) run on each deck in that side's direction of travel.
- *Proposal* **[guess]:** a steady 140 km/h, 1.5 m apart inside a platoon, a platoon every 15 to
  40 s per side, from a seeded schedule. A platoon's position is a pure function of the clock and
  its schedule entry, so cabins never collide and need no sim.
- They exist only where the spine exists. At a spine end they run down the end ramp and vanish
  into the end block, as if into a station.
- An `InstancedMesh` per side; positions are updated in `Scenery.animate(dt)`.

**1.4 The palette.** *Built.* `environment.js`: a `PROMISED` tweak table, applied on top of `MODES[mode]`
when the world is `promised`. *Proposal:* for day, lower `turbidity` (7 → 4.5), a bluer
`hemiSky`, a greener `hemiGround`, slightly higher `exposure`, and a lighter, bluer `fog`. Dusk
gets a smaller version of the same change. Night is unchanged except for its lamp colours. Grass
and fields materials in `scenery.js` get a saturation lift (a colour multiply on the material, not
new textures). The change should be noticeable side by side and never cartoonish.

**1.5 Checks for slice 1** (section 8), then commit:
"Toekomstflitsen slice 1: toggle, spine and palette (F-48)". *Done.*

**Stop here for the user to try.** The deck over the left lane and the spine's look decide
whether slices 2 to 4 keep the drawing's cross-section or fall back to a narrower spine.
*Waiting on that drive: everything after slice 1 is still to be built.*

### Slice 2: wedge bodies

**2.1 Bodies.** New `src/futureBodies.js` with `buildFutureVariant(variant, low, sig)`, built with
the same `Parts` helpers and material slots as `vehicles.js` (export what is needed from there;
do not fork the helpers). Same `VARIANTS` length and width, same wheel positions and axle data in
`meta`, same emitter points per lamp kind, so `TrafficView`'s lamp, beam and wheel code works
unchanged. Our own 1990-style shapes:
- **hatch / sedan / estate / suv:** a single wedge from a low sharp nose to a high cut tail, a
  large glass canopy, covered rear wheels on the sedan and estate, a full-width light strip at the
  back. The suv is the same idea, taller and blunter.
- **van:** a smooth one-box shape with a sloping glass front and the company stripe slot kept.
- **truck (tractor) / rigid:** a rounded aerodynamic cab with a wraparound windscreen and side
  skirts. Trailers keep their kinds (box, curtain, reefer) as smooth-skinned boxes with rounded
  front edges.
- **caravan:** a teardrop.
- Light signatures map onto the new fronts and keep their shape class (rule 3).
`getVariantGeo` takes the world as part of its cache key.

**2.2 Live swap of vehicles.** `TrafficView`:
- Remember each vehicle's body colour on the view side (a `Map` from vehicle id to colour) and
  pass it as `opts.color` whenever a visual is rebuilt, so colour survives swaps and pooling.
- Include the world in `poolKey`.
- `setWorld(w)`: for every vehicle that has a visual, `remove` then `add` with its current look
  (both own and oncoming traffic).
- Wheel turning (F-36) and axle state reset as on a normal `add`.

**2.3 The player's car.** The exterior of `playerVis` swaps to the wedge estate in the same
colour; the headlights and the cockpit group are re-parented to the new `front`. *Proposal:* the
cockpit interior itself stays as it is in this plan.

**2.4 Checks**, then commit: "Toekomstflitsen slice 2: wedge bodies (F-48)".

### Slice 3: buildings, freight tubes, gantries

**3.1 Glass terraced buildings.** In `futureScenery.js`, a `promised` path for
`distributionCentre`: the same footprint, car park and access road, but the box becomes 2 to 4
stepped glass terraces with planted roof edges and a pale frame. The logo band stays (with the
same made-up names). At night the glass is lit floor by floor. Farms, trees and turbines stay as
they are (the farmland is part of the promise).

**3.2 Freight tube portals.** At every `overpass` (not junction bridges), on one side of the road,
chosen by seed: a round concrete portal, about 5 m across, set into the embankment just beyond
the guardrail and noise barrier, with the tube running parallel to the road under the verge, out
of sight. *Proposal* **[guess]:** every 2 to 5 minutes of clock time per portal, a capsule train
(4 to 8 rounded freight capsules, about 9 m each) slides out at 80 km/h and dips into the next
portal down the road, or into the ground 300 m on. Like the cabins, it is a clock-driven function,
view only. Portals glow softly at night.

**3.3 Future gantries and matrix signs.**
- `matrixGantry` and `anwbGantry` frames become a slim white tubular arch with rounded corners
  when the world is `promised`.
- `textures.js` `matrixTexture(content, flash, style)`: style `promised` gives a rounded dark
  housing with a pale rim and a slightly bolder LED face. **The content and its meaning are
  identical:** the same numbers, red cross, arrows, flashing amber lamps, at the same size or
  larger. *Decided:* signs are styled, not changed **[user]**. ANWB route signs keep their colours,
  fonts and text; only the frame changes.
- Speed signs beside the road: unchanged.

**3.4 Checks**, then commit: "Toekomstflitsen slice 3: buildings, freight tubes and gantries
(F-48)".

### Slice 4: sound and radio

**4.1 Sounds.** `audio.js`, when the world is `promised` *Decided* **[user]**:
- Nearby cars and vans: the existing rumble is lowered and mixed with a soft electric whine whose
  pitch follows speed. Trucks keep a lowered diesel under the whine. Tyre and wind noise are
  unchanged, so speed is still readable by ear.
- The player's own engine sound gets the same treatment.
- Cabin platoons: a short, soft whoosh, panned, when a platoon passes over within 30 m. Freight
  capsules: a low hum while visible within 100 m.
- Everything stays synthesized, with no audio assets.

**4.2 Radio.** *Decided:* a station in the voice of the promised now **[user]**. `radio.js` gets
one built-in source, "Radio Toekomst", available only in the promised world and placed in the Y
cycle. It is ours, so the no-broadcaster rule is respected:
- *Proposal:* a jingle synthesized in Web Audio (a short bright chime figure), and short news and
  traffic bulletins written by us in the cheerful tone of a 1990 brochure: rekeningrijden, the
  automated lanes, traffic jams as history, and the Betuwe tube. They should be gently ironic and
  never mock real people or companies.
- Spoken with the browser's `speechSynthesis` using a Dutch voice when one exists; otherwise
  shown as a single RDS-style text line in the HUD. Between bulletins, it plays the user's own
  music, if loaded.
- The bulletins live in one data file, `src/futureRadio.js`, about 20 to start.

**4.3 Checks**, then commit: "Toekomstflitsen slice 4: sound and radio (F-48)".

## 8. How we'll know

Every slice:
- `npm run build`.
- **The sim is untouched:** `npm run simtest`, `npm run personas`, `npm run moments` and
  `npm run bottest` give the same results as on `main` before the slice; the output must match,
  not just pass.
- **The sim never knows:** a grep for `world` / `future` in `src/traffic.js`, `src/player.js`,
  `src/msi.js`, `src/session.js`, `src/perception.js`, `src/botDriver.js` and `src/variants.js`
  finds nothing new. *Proposal:* make this a tiny `tools/worldtest.js` (npm script `worldtest`)
  that checks the import graph of the sim modules, and add it to the full check.
- A manual look in `npm run dev` at day, dusk and night in both worlds.
- Frame time: with the promised world near a junction, the frame time stays within about 10% of
  `now` at the same spot, using the existing stats overlay.

Per slice:
- Slice 1: the spine stops before every junction bridge on a 10 km drive; no deck intersects an
  overpass; nothing below 4.6 m outside `|lat| ≤ 0.3`. *Proposal:* a dev overlay toggle draws the
  clearance box. *Built as `tools/worldtest.js` instead* (the overlay is still open, see below).
- Slice 2: in the persona viewer (F-35, `castViewer.js`), every archetype shown in both worlds
  side by side keeps its tell (rule 3). Lamp emitters line up with the new bodies; brake lights,
  indicators and headlights all fire.
- Slice 3: matrix faces in `promised` show the same content as in `now` for a queue warning, a
  closure (red cross, arrow) and end-of-restrictions, using the existing scenarios (`npm run
  scenario <name>` and the dev menu).
- Slice 4: no audio clicks on swap; the radio cycles cleanly and falls back to text with no Dutch
  voice.

**Try it.** `npm run dev`, free play, day, light traffic. Drive for a minute, press **F9**: a
flash, then the spine is overhead with cabins passing, the sky is cleaner, and (from slice 2) the
same cars are wedges. Move to the left lane and drive under the deck for a while: does it feel
like a place you'd drive, or a tunnel? Press F9 again; nothing in the traffic changed. Repeat at
night. That one question, whether the covered left lane feels good, decides slice 1.

## 9. Not doing

- Driving onto the guideway or handing control over in this plan (see **Not in this build**).
- Any change to speeds, limits, driver archetypes or rules in the promised world.
- Copying the books' illustrations, vehicles or numbered cutaways; the cutaway "x-ray" view of
  the drawings is not a game view.
- A watercolour or other stylised render pass. The palette is a gentle shift only.

## Needs first

- Nothing new: every hook this plan names exists at `137ad71` (`Scenery.buildChunk`, `overpass`,
  `distributionCentre`, `matrixGantry`, `matrixTexture`, `TrafficView.add`/`remove`,
  `createVehicleVisual`, `applyLook`, `Environment` `MODES`, `AudioEngine.update`, `Radio`).
  Check that they still exist before building; M2/M3 work may have moved them.
- *Decided:* slice 1 now; slices 2 to 4 only after the real world (M2, M3) is done **[user]**. By then, exits (F-21),
  rain (F-24), roadworks (F-26) and the klaverblad (F-41) may add scenery. Each new present-day
  piece needs a promised counterpart or stays as it is; list them at build time.

## Not in this build

- **The drawing's real cross-section** (deck 2 m up, pods are cars on a centre rail, passing under
  the 4.20 m junctions): **to be specced** — see the note at the end of slice 1. Until that spec
  lands, the 7.8 m deck and the edge-track cabins are the interim shape.
- **Left over from slice 1:** the dev overlay toggle that draws the clearance box (the headless
  `worldtest` asserts the numbers instead); a down ramp at the spine ends (they run into an end
  block); cabins are on the deck's edge track rather than its top, for the reason in slice 1.
- **Handing over to the guideway:** an on-ramp onto the deck where the player lets go and rides
  in a platoon. A later slice with its own spec: it touches player control and is the first part
  of F-48 that would reach the sim.
- **Sky, sea and rail slice:** future aircraft, ships, ports, airports and trains, once F-49 (rail
  beside the motorway), F-50 (planes on approach) and F-51 (harbour stretch with ships) exist.
- A future cockpit and dashboard.
- Promised counterparts for scenery added after this plan (exits, roadworks, klaverblad, N-roads,
  town).
