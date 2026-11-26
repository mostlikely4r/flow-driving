# F-54 Draw calls: one mesh per vehicle (spec)

Date: 2026-11-26. Backlog item F-54. Status: ready to build.

*Decided* marks the user's calls; everything else is *my proposal*, and the builder may change
a proposal if a measurement says so (note why in the BACKLOG line).

## 1. Why

The user drives at about **30 fps on a busy road** (their own play, 2026-11-26). The next big
pieces (rain spray, F-24; the guideway convoys, F-48) all add things to draw, so this comes
first. *Decided:* fix the frame time before the guideway is built; an engine switch is not the
answer to this (below).

## 2. The measurement (2026-11-26, `npm run perf`, headless Edge, 1600×900, cockpit view)

| Setting | fps | frame p50 | traffic sim | render | draw calls / frame | vehicles |
|---|---|---|---|---|---|---|
| density 2 | 128 | 7.6 ms | 0.2 ms | 6.8 ms | 1,050 | 42 |
| density 10 (default) | 62 | 15.9 ms | 0.6 ms | 14.4 ms | 2,510 | 164 |
| density 25 | 38–43 | 23–26 ms | 0.9–1.0 ms | 21–24 ms | 3,710 | 240 |
| density 25, promised world | 38 | 26 ms | 1.0 ms | 24 ms | – | 238 |
| density 25, no shadows / no bloom / mirrorRes 0.5 | 34–36 | ≈ same | | | | |
| density 25, pixelRatio 1.0 | 41 | 24 ms | | | | |

Read: the sim is not the cost; neither are pixels, shadows, bloom or the promised world. The
cost is **draw calls**: every vehicle is ~10 meshes (one per material slot in
`createVehicleVisual()`, `src/vehicles.js`: paint, paint2, glass, trim, wheels, each lamp
material ...), drawn in the main view and in up to three mirrors, so **~13–14 draw calls per
vehicle**. 42→240 vehicles takes draw calls from 1,050 to 3,710 and the frame time ×3.

An engine switch (Godot) would not fix this on its own: ten meshes per car drawn four times is
just as expensive there. The fix is in how vehicles are built.

## 3. Goal and non-goals

**Goal.** Busy traffic (density 25) at **≤ 1,500 draw calls per frame and ≥ 60 fps** in
`npm run perf`, with every vehicle looking and lighting exactly as it does now.

**Non-goals.** No change to the sim (`traffic.js`, `player.js` and the other sim modules stay
byte-identical in output: `simtest`, `personas`, `bottest` unchanged). No new car models, no
LOD art, no change to what any car looks like at any distance in any view. Scenery chunks are
not part of this (they are ~500 calls in all passes together and already batched by bucket).

## 4. Baseline (do not revert or redesign)

- `src/vehicles.js`: `getVariantGeo(variant, low, lights)` builds one geometry per material slot
  per variant (cached); `createVehicleVisual()` makes a `Mesh` per slot, with per-vehicle paint
  (`paintMaterial`) and per-vehicle lamp materials (`mats.head/tail/indL/indR/marker/drl`, whose
  `emissiveIntensity` the view sets every frame). `applyLook()` repaints pooled visuals.
- `src/trafficView.js`: pools visuals by `poolKey(variant, look)`, poses `front` and `trailer`
  separately (`pose()`), and emits lamp glows into the batched `GlowSystem` (`src/fx.js`).
- `src/main.js`: renders the three mirrors (`mirrors[k].cam` into `m.rt`) before the main
  composer pass. The player's own car is a visual from the same code.
- Lamp *glows* (the points) are already one draw call; only the lamp *lenses* are materials.

## 5. What to build

*Built 2026-11-26 (Q-15). What the numbers said where the plan left a choice is under 5b.*

1. **Keep the profiler.** — **built**: `tools/perf.js` / `npm run perf` is the check. It now
   prints draw calls per frame split into the main pass and the mirror passes, and fails the run
   when density 25 goes over the budget.
2. **Instanced vehicles** (*proposal*, the main step): per (geometry key, slot), one
   `InstancedMesh` holding every visible vehicle of that kind, with per-instance colour for
   paint and a per-instance lamp state (head / tail / brake / indicator L / R / marker / DRL
   intensities, packed into an instanced attribute and read in `onBeforeCompile` of the lamp
   material). Fronts and trailers are separate instances, since they pose separately. A
   vehicle's "visual" becomes an instance slot plus its pose; `TrafficView.add/remove/pose`
   keep their signatures, so `main.js`, the cast viewer (`castStage.js`) and the lane map don't
   change beyond the call sites that read `vis.mats`.
   - Shadows: the instanced meshes cast and receive as the slot meshes do now
     (`paint`, `paint2`, `trim` cast).
   - The player's car stays an ordinary visual (it has the cockpit and its own lamp logic).
   - Night beams, `applyLook()` tints (glass tint, angel tail lenses) and the head-lamp colour
     per lights signature become per-instance values, not per-vehicle materials.
   - Capacity grows by doubling; frustum culling is per instanced mesh, so give each one a
     bounding sphere that covers its instances (or set `frustumCulled = false` and rely on the
     instance count — measure which is cheaper).
   — **built** in `src/vehicleInstances.js`, with the drawing in `src/trafficView.js`; the
   materials and the look picking moved into `src/vehicles.js` (`instancedPaint`,
   `instancedLampMaterial`, `pickVehicleLook`).
3. **Mirrors draw less** (*proposal*): a vehicle further than 250 m behind (rear) or 150 m
   (side mirrors) is not drawn in that mirror. With instancing this is a second, smaller
   instance range or a per-pass visibility, whichever is simpler; measure before keeping it.
   — **built and kept**, as a second instance set per batch on its own layer (see 5b).
4. **Draw-call budget in a check.** `tools/worldtest.js` gets no browser, so the budget lives in
   `npm run perf`: it exits non-zero when density 25 exceeds 1,500 draw calls per frame. Add a
   one-line note to the README under the tools. — **built**

### 5b. What the build did where the plan left it open

- **Batches are keyed by geometry, and the body is split from the lamps.** The body slots (paint,
  glass, trim, chrome, plate, paint2 ...) are the same for every lamp signature, so they are one
  batch per body shape (`variant + lowered + rack + glass tint`); only the lamp slots carry the
  signature. Splitting them is what keeps the batch list at ~37 instead of one per archetype.
- **Per-instance lamp state**: only `tail`, `indL` and `indR` differ per car. Those read a
  per-instance `aGlow` attribute in `onBeforeCompile` (the emissive uniform stays 1 and the shader
  multiplies by `vGlow`); head, marker and DRL are one value per batch, so they stay uniforms.
  The paint colour is `instanceColor`. Everything else is the shared material it always was.
- **`frustumCulled = false`** for the instanced meshes: one batch spans kilometres, so its bounding
  sphere is the whole road and culling it per batch decides nothing. The 1700/1100 m range in
  `TrafficView.update` is the cull, exactly as before.
- **Mirrors got their own set, not a distance check per pass** — the measurement made the choice.
  The first version drew every instance in all four passes: 1,661 draw calls at density 25, over
  the budget, and the mirror passes were 1,152 of them. Each batch now has a second set that holds
  only the cars within 260 m behind and 20 m ahead (the rear mirror reaches 250 m, the side mirrors
  150 m), on layer 3, which only the mirror cameras look at. The main set is on layer 4 and the
  shadow camera had to be given layer 4 too, or no car would cast a shadow. That took the mirror
  passes from 1,152 calls to 625 and the whole frame to 1,139.
- **The cast viewer keeps the old per-mesh path.** It poses one car by hand and lights it through
  `vis.mats`, so `TrafficView` takes a `{ solo: true }` option and `main.js` gives `CastStage` its
  own solo view. The player's car is still an ordinary `createVehicleVisual` (it has the cockpit,
  real lights and its own lamp logic).

## 6. How we'll know

- `npm run perf`: density 25 at ≤ 1,500 draw calls per frame and ≥ 60 fps; density 10 ≥ 90 fps.
  Write the before/after table into the BACKLOG line.
- `npm run build`, `simtest`, `personas`, `bottest`, `moments`, `worldtest` pass, and `simtest`,
  `personas` and `bottest` print the same numbers as before.
- Pixel check: `npm run frame` / `tools/shot.js` stills of day and night, cockpit and chase,
  before and after, look the same (lamps, brake lights, indicators, archetype tells, trailers).

Measured 2026-11-26 (`npm run perf`, headless Edge, 1600×900, cockpit view; the machine is shared,
so the fps are ±10 between runs):

| Setting | before: fps / calls | after: fps / calls |
|---|---|---|
| empty d2 | 128 / 1,050 | 126 / 806 |
| base d10 | 62 / 2,510 | 83–87 / 1,027 |
| dense d25 | 38–43 / 3,710 | 88.6 / 1,139 (main 514, mirrors 625) |
| dense d25, promised world | 38 / – | 86 / 1,337 |
| dense d25, no shadows | 34–36 | 99.8 / 1,134 |
| dense d25, no bloom | – | 94.2 / 1,127 |
| dense d25, mirrorRes 0.5 | – | 91.8 / 1,137 |
| dense d25, pixelRatio 1.0 | 41 | 89.8 / 1,134 |

The d25 goal (≤ 1,500 calls, ≥ 60 fps) is met with room. **The density-10 target of 90 fps is not:
83–87.** The cost is no longer the vehicle draw calls — d10 and d25 differ by a few percent — and
d10 and d25 land within noise of each other, so what is left is the main pass and the post chain on
this machine, not something this slice set out to change. Recorded rather than chased.

Pixel check (`tools/frame.js`, the same replay seed and moment before `3d94da1` and after): day
stills differ in 0.02–0.03% of pixels, night in 0.005–0.011% — edge noise on moving cars. Lamps,
brake lights, indicators, smoked patser lenses, reflect strips and marker lights match exactly.
The first version of the build skipped the rng draw for a car whose colour comes from its archetype,
which shifted the trailer kind and colour of every car after it (a ~2% night still difference); the
review caught it, and `pickVehicleLook` now always draws the body colour and lets the look override
it, so the stream per car is what it was.

**Try it:** `npm run dev`, menu → Traffic 25, drive a minute in the cockpit view with the fps
counter on: it should hold 60, and nothing about the cars (colours, lights, indicators, the
patser's smoked tail lamps, trailers swinging) looks different. Then at night.

## Needs first

Nothing unbuilt. Checked 2026-11-26: `createVehicleVisual`, `getVariantGeo`, `applyLook` in
`src/vehicles.js`; `TrafficView` in `src/trafficView.js`; the mirror passes in `src/main.js`;
`tools/perf.js`. Q-11 (F-48 slice 1) touches `main.js` but not the vehicle code.

## Not in this build

- Distance LOD meshes for far vehicles (only if the budget is still missed after step 2). Not
  needed: 1,139 of 1,500 calls.
- The density-10 target of 90 fps (83–87 measured; see section 6).
- A per-mirror range (250 m rear, 150 m sides). All three mirrors share one near set at 260/20 m,
  which is a handful of extra instances and no extra draw call.
- The F-48 convoy cars and rain spray: both must be built instanced from the start (their own
  specs say so), not retrofitted.
