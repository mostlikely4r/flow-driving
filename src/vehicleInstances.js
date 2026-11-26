// Instanced traffic (F-54): every vehicle in the world is drawn from a handful of
// InstancedMeshes instead of ten Meshes per car.
//
// A batch is one geometry with one material per slot (paint, glass, trim, head,
// tail ...), keyed by everything that changes the geometry:
//   body     variant + lowered + rack + tinted glass   (no lamp slots)
//   lamps    variant + lowered + lamp signature        (only the lamp slots)
//   trailer  truck or caravan trailer geometry         (the whole trailer)
// Splitting the body from the lamps keeps the body batches down to one per body
// shape, because the lamp geometry is the only thing two cars of the same shape
// and different lights disagree on.
//
// What differs per vehicle stays instance data: the paint colour holds the body
// colour (instanceColor) and the brake and indicator lamps read their emissive
// amount from the aGlow attribute (see vehicles.js). A vehicle's visual is then a
// pose plus a slot in two or three batches, so nothing that reads
// `veh.vis.front.position` (lane map, audio, glow) has to change.
//
// Counts are compacted every frame: TrafficView poses the cars it wants drawn and
// writes them in order, so a car out of range is simply not written.
//
// Every batch has two sets. The main set holds every car in the 1700/1100 m range
// and sits on LAYER_TRAFFIC. The mirror set holds only the cars near enough to
// show up in a mirror, and sits on LAYER_TRAFFIC_MIRROR, which only the mirror
// cameras look at: a batch with no near car costs no draw call at all, and the
// mirror passes stop drawing the whole motorway. (Measured 2026-11: the three
// mirror passes were 793 of 1302 draw calls at density 25.)
import * as THREE from 'three';
import {
  getVariantGeo,
  instancedPaint,
  instancedLampMaterial,
  lampSig,
  pickVehicleLook,
  GLOW_SLOTS,
  LAMP_SLOTS,
  SHARED,
} from './vehicles.js';

// Layers: the main-view instances and the mirror-only ones are on layers of their
// own, and each camera looks at exactly one of them (plus the world on layer 0),
// so neither pass draws the other's cars twice.
export const LAYER_TRAFFIC = 4;
export const LAYER_TRAFFIC_MIRROR = 3;
// How far behind us a mirror can still show a car. The rear mirror reaches
// furthest (250 m); the side mirrors 150 m. One shared set covers the widest, and
// a little ahead, because a car alongside still shows in a side mirror.
const MIRROR_BEHIND = 260;
const MIRROR_AHEAD = 20;
const START_CAPACITY = 64; // doubled on demand; a busy batch at density 25 is ~30

const MAIN = 0, MIRROR = 1;

function materialFor(slot, ctx) {
  switch (slot) {
    case 'paint': return ctx.paint;
    case 'paint2': return ctx.paint2;
    case 'glass': return ctx.tint ? SHARED.glassTint : SHARED.glass;
    case 'head': case 'tail': case 'indL': case 'indR': case 'marker': case 'drl':
      return ctx.lamps[slot];
    default: return SHARED[slot] || SHARED.trim;
  }
}

/**
 * A geometry for one instanced mesh: it shares the cached geometry's vertex data
 * (same attribute objects, so the same GPU buffers) and only adds what is per
 * instance, so the build geometry stays untouched for the player and the cast rig.
 */
function shellFor(geometry, glow, capacity) {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geometry.attributes)) g.setAttribute(name, attr);
  if (geometry.index) g.setIndex(geometry.index);
  if (glow) {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aGlow', attr);
  }
  return g;
}

function makeMesh(shell, material, capacity, slot, layer) {
  const mesh = new THREE.InstancedMesh(shell, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.layers.set(layer);
  // the instances move every frame and cover kilometres: one batch cannot be
  // culled as a whole, and a stale bounding sphere would cull it wrongly
  mesh.frustumCulled = false;
  // the same slots cast and receive shadows as the per-vehicle meshes did
  mesh.castShadow = slot === 'paint' || slot === 'paint2' || slot === 'trim';
  mesh.receiveShadow = slot === 'paint' || slot === 'paint2';
  return mesh;
}

export class VehicleInstances {
  constructor(scene) {
    this.scene = scene;
    this.batches = new Map();
    this.meshes = 0;
  }

  // ---------------------------------------------------------------- vehicle visuals
  /** A pose-only visual for one vehicle, plus its batches. Returns the visual. */
  add(veh, look, rng) {
    const variant = veh.variant;
    const low = !!look?.low;
    const tint = !!look?.tint;
    const sig = lampSig(variant, look?.lights);
    const pick = pickVehicleLook(variant, rng, look ? { color: look.color } : {});
    const G = getVariantGeo(variant, low, sig);
    const front = new THREE.Object3D();
    front.rotation.order = 'YXZ';
    const vis = {
      variant,
      look,
      instanced: true,
      root: new THREE.Object3D(), // only the visible flag: nothing is in the scene graph
      front,
      trailer: null,
      emFront: G.emFront,
      emTrailer: [],
      hitchZ: G.hitchZ,
      axleDist: G.axleDist,
      axle: new THREE.Vector3(),
      axleInit: false,
      colors: {
        paint: new THREE.Color(pick.color),
        paint2: new THREE.Color(pick.paint2 ?? pick.color),
      },
      bodyBatch: null,
      lampBatch: null,
      trailerBatch: null,
    };
    // the body is the same for every lamp signature; the glass tint is not
    vis.bodyBatch = this.batch(
      `b:${variant}:${low ? 'L' : ''}:${sig === 'rack' ? 'R' : ''}:${tint ? 'T' : ''}`,
      G.front, { tint, flatPaint: pick.flatPaint }, 'body',
    );
    vis.lampBatch = this.batch(`l:${variant}:${low ? 'L' : ''}:${sig}`, G.front, { sig }, 'lamps');
    if (pick.trailerKind) {
      const kind = pick.trailerKind;
      vis.trailer = new THREE.Object3D();
      vis.trailer.rotation.order = 'YXZ';
      vis.emTrailer = G.emTrailers[kind] || [];
      vis.trailerBatch = this.batch(`t:${variant}:${kind}`, G.trailers[kind], { sig: 'std' }, 'all');
    }
    veh.vis = vis;
    return vis;
  }

  remove(veh) {
    // nothing to release: a visual is a pose and a batch slot it no longer fills
    veh.vis = null;
  }

  // ---------------------------------------------------------------- batches
  /**
   * One batch per key, created on first use. `slots` is 'body' (everything but the
   * lamps), 'lamps' (only the lamps) or 'all' (a trailer's whole geometry).
   */
  batch(key, geo, opts, slots) {
    const existing = this.batches.get(key);
    if (existing) return existing;
    const ctx = {
      paint: instancedPaint(!!opts.flatPaint),
      paint2: instancedPaint(true),
      tint: !!opts.tint,
      lamps: {},
    };
    if (slots !== 'body') for (const s of LAMP_SLOTS) ctx.lamps[s] = instancedLampMaterial(s, opts.sig);
    const b = {
      key,
      night: null,
      capacity: START_CAPACITY,
      worn: [], // {slot, shell, material, glow} — one entry per material slot
      sets: [
        { meshes: [], count: 0 },
        { meshes: [], count: 0 },
      ],
    };
    for (const [slot, geometry] of Object.entries(geo)) {
      const isLamp = LAMP_SLOTS.has(slot);
      if (slots !== 'all' && isLamp !== (slots === 'lamps')) continue;
      b.worn.push({ slot, geometry, material: materialFor(slot, ctx), glow: GLOW_SLOTS.has(slot) });
    }
    for (let s = MAIN; s <= MIRROR; s++) {
      const set = b.sets[s];
      for (const w of b.worn) {
        // one shell per mesh: aGlow lives on the geometry, and each set writes its own
        const shell = shellFor(w.geometry, w.glow, b.capacity);
        const mesh = makeMesh(shell, w.material, b.capacity, w.slot, s === MAIN ? LAYER_TRAFFIC : LAYER_TRAFFIC_MIRROR);
        set.meshes.push({ mesh, slot: w.slot });
        this.scene.add(mesh);
        this.meshes++;
      }
    }
    this.batches.set(key, b);
    return b;
  }

  /**
   * Double a batch's instance buffers, keeping what this frame wrote. The meshes
   * themselves stay (only their instance attributes grow), so nothing in the
   * renderer has to be rebuilt.
   */
  grow(b) {
    const cap = b.capacity * 2;
    for (const set of b.sets) {
      for (const entry of set.meshes) {
        const mesh = entry.mesh;
        const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
        attr.setUsage(THREE.DynamicDrawUsage);
        attr.array.set(mesh.instanceMatrix.array);
        mesh.instanceMatrix = attr;
        if (mesh.instanceColor) {
          const c = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
          c.setUsage(THREE.DynamicDrawUsage);
          c.array.set(mesh.instanceColor.array);
          mesh.instanceColor = c;
        }
        const glow = mesh.geometry.getAttribute('aGlow');
        if (glow) {
          const g = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
          g.setUsage(THREE.DynamicDrawUsage);
          g.array.set(glow.array);
          mesh.geometry.setAttribute('aGlow', g);
        }
      }
    }
    b.capacity = cap;
  }

  // ---------------------------------------------------------------- per frame
  /** Reset the frame; the one-per-batch lamp states are set when the time changes. */
  begin(night) {
    for (const b of this.batches.values()) {
      b.sets[MAIN].count = 0;
      b.sets[MIRROR].count = 0;
      if (b.night === night) continue;
      b.night = night;
      for (const w of b.worn) {
        const s = w.slot;
        // head, marker and drl are the same for every car in a batch
        if (s === 'head') w.material.emissiveIntensity = night ? 1.3 : 0.8;
        else if (s === 'marker') w.material.emissiveIntensity = night ? 2.5 : 0;
        else if (s === 'drl') w.material.emissiveIntensity = night ? 2.2 : 5;
      }
    }
  }

  /** Write one posed vehicle into its batches. `near`: it is close enough for a mirror. */
  write(vis, night, brake, indL, indR, near) {
    const tail = (night ? 0.5 : 0) + (brake ? (night ? 1.5 : 4) : 0);
    const lamp = { tail, indL: indL ? 6 : 0, indR: indR ? 6 : 0 };
    this.place(vis.bodyBatch, vis.front, vis.colors, null, near);
    this.place(vis.lampBatch, vis.front, vis.colors, lamp, near);
    if (vis.trailerBatch) this.place(vis.trailerBatch, vis.trailer, vis.colors, lamp, near);
  }

  place(b, obj, colors, lamp, near) {
    const sets = near ? 2 : 1;
    if (b.sets[MAIN].count + 1 > b.capacity || (near && b.sets[MIRROR].count + 1 > b.capacity)) this.grow(b);
    obj.updateMatrix();
    const m4 = obj.matrix;
    for (let s = MAIN; s < sets; s++) {
      const set = b.sets[s];
      const i = set.count++;
      for (const { mesh, slot } of set.meshes) {
        mesh.setMatrixAt(i, m4);
        if (slot === 'paint' || slot === 'paint2') {
          if (!mesh.instanceColor) {
            mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(b.capacity * 3).fill(1), 3);
            mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
          }
          const c = colors[slot], a = mesh.instanceColor.array;
          a[i * 3] = c.r;
          a[i * 3 + 1] = c.g;
          a[i * 3 + 2] = c.b;
        } else if (GLOW_SLOTS.has(slot)) {
          mesh.geometry.getAttribute('aGlow').array[i] = lamp[slot];
        }
      }
    }
  }

  /** Upload what this frame wrote and hide the batches nothing used. */
  end() {
    for (const b of this.batches.values()) {
      for (const set of b.sets) {
        const n = set.count;
        for (const { mesh } of set.meshes) {
          mesh.count = n;
          mesh.visible = n > 0;
          if (!n) continue;
          markRange(mesh.instanceMatrix, n);
          if (mesh.instanceColor) markRange(mesh.instanceColor, n);
          const glow = mesh.geometry.getAttribute('aGlow');
          if (glow) markRange(glow, n);
        }
      }
    }
  }

  /** How many instanced meshes (draw calls) the world costs, for a check or a report. */
  stats() {
    let used = 0, instances = 0;
    for (const b of this.batches.values()) {
      for (const set of b.sets) {
        if (!set.count) continue;
        used += set.meshes.length;
        instances += set.count;
      }
    }
    return { batches: this.batches.size, meshes: this.meshes, usedMeshes: used, instances };
  }
}

/** Where the mirror set starts caring about a car: behind up to MIRROR_BEHIND, and a bit ahead. */
export function inMirrorRange(ds) {
  return ds > -MIRROR_BEHIND && ds < MIRROR_AHEAD;
}

/** Upload only the instances this frame wrote, not the whole capacity. */
function markRange(attr, count) {
  const size = attr.itemSize * count;
  if (attr.addUpdateRange) {
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, size);
  }
  attr.needsUpdate = true;
}
