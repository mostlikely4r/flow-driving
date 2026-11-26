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

1. **Keep the profiler.** `tools/perf.js` / `npm run perf` (committed with this plan) is the
   check. Add one line to its output: draw calls per frame in the main pass and in the mirror
   passes separately.
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
3. **Mirrors draw less** (*proposal*): a vehicle further than 250 m behind (rear) or 150 m
   (side mirrors) is not drawn in that mirror. With instancing this is a second, smaller
   instance range or a per-pass visibility, whichever is simpler; measure before keeping it.
4. **Draw-call budget in a check.** `tools/worldtest.js` gets no browser, so the budget lives in
   `npm run perf`: it exits non-zero when density 25 exceeds 1,500 draw calls per frame. Add a
   one-line note to the README under the tools.

## 6. How we'll know

- `npm run perf`: density 25 at ≤ 1,500 draw calls per frame and ≥ 60 fps; density 10 ≥ 90 fps.
  Write the before/after table into the BACKLOG line.
- `npm run build`, `simtest`, `personas`, `bottest`, `moments`, `worldtest` pass, and `simtest`,
  `personas` and `bottest` print the same numbers as before.
- Pixel check: `npm run frame` / `tools/shot.js` stills of day and night, cockpit and chase,
  before and after, look the same (lamps, brake lights, indicators, archetype tells, trailers).

**Try it:** `npm run dev`, menu → Traffic 25, drive a minute in the cockpit view with the fps
counter on: it should hold 60, and nothing about the cars (colours, lights, indicators, the
patser's smoked tail lamps, trailers swinging) looks different. Then at night.

## Needs first

Nothing unbuilt. Checked 2026-11-26: `createVehicleVisual`, `getVariantGeo`, `applyLook` in
`src/vehicles.js`; `TrafficView` in `src/trafficView.js`; the mirror passes in `src/main.js`;
`tools/perf.js`. Q-11 (F-48 slice 1) touches `main.js` but not the vehicle code.

## Not in this build

- Distance LOD meshes for far vehicles (only if the budget is still missed after step 2).
- The F-48 convoy cars and rain spray: both must be built instanced from the start (their own
  specs say so), not retrofitted.
