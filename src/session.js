// Proefrit (F-37) slice 2: the render-free part of a drive.
//
// `main.js` and the headless runner drive exactly the same sim through this
// module: the same traffic setup, the same substeps, the same key mapping, the
// same closure rolls. Nothing here imports Three.js or touches the DOM, so a
// bot run in Node tests the game the browser runs.
//
// A `Sim` is the small bundle of state a drive needs:
//   { road, player, traffic, msi, rng, time, closureDist, lastGantry, journal,
//     notices, scenario }
import { CONFIG, speedLimitKmh } from './config.js';
import { pedalStep } from './input.js';
import { Road } from './road.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { MSI, gantryIndexAt } from './msi.js';
import { Journal } from './journal.js';
import { SCENARIOS, applyScenario } from './scenarios.js';
import { junctionsNear, junctionHasEstate } from './junctions.js';

const IDLE = { steer: 0, throttle: 0, brake: 0, analog: false };

/** Wrap already-built sim objects. Used by main.js, which owns the scene. */
export function bindSim({ road, player, traffic, msi = null, rng = Math.random, journal = null, scenario = null }) {
  return {
    road,
    player,
    traffic,
    msi,
    rng,
    time: 0, // driving time (s)
    closureDist: 0, // metres since the last random-closure roll
    lastGantry: null,
    journal: journal || new Journal(),
    notices: [], // sim-level things the renderer/HUD may want to show
    scenario: scenario || null,
    ramps: new Map(), // junction block -> the ramp the sim has for it (F-20)
    exits: new Map(), // junction block -> the exit the sim has for it (F-21)
  };
}

/**
 * Build a complete headless sim.
 * The order is main.js's: Road → Player → Traffic → MSI → an idle player step
 * → fill traffic → apply the time of day (so night density applies to what is
 * filled). Same order means the same world for the same seed.
 */
export function createSim({ seed, timeOfDay, scenario = null, rng = Math.random }) {
  const sc = typeof scenario === 'string' ? SCENARIOS[scenario] || null : scenario;
  if (sc && sc.lanes) CONFIG.lanes = sc.lanes;
  if (timeOfDay) CONFIG.timeOfDay = timeOfDay;

  const road = new Road(seed);
  const player = new Player(road);
  const traffic = new Traffic({
    dir: 1,
    density: CONFIG.trafficDensity,
    ahead: CONFIG.rangeAhead,
    behind: CONFIG.rangeBehind,
    seed: seed + 1,
    limitKmh: speedLimitKmh(),
  });
  const msi = (traffic.msi = new MSI(traffic));
  player.update(0.001, IDLE, { vehicles: [], lanes: [] });
  if (sc) {
    if (sc.player.s != null) player.s = sc.player.s; // a junction scenario starts at its own place
    player.placeInLane(sc.player.lane, sc.player.kmh ?? 100);
    applyScenario(traffic, sc, player.s);
    player.update(0.001, IDLE, traffic);
  } else {
    traffic.initialFill(player.s, player.proxy);
  }
  const sim = bindSim({ road, player, traffic, msi, rng, scenario: sc ? sc : null });
  applyTimeSim(sim, timeOfDay || CONFIG.timeOfDay);
  return sim;
}

/** Time-of-day state that lives in the sim (no rendering). */
export function applyTimeSim(sim, tod) {
  const night = tod === 'night';
  const t = sim.traffic;
  t.night = night;
  t.densityScale = night ? CONFIG.nightTraffic : tod === 'dusk' ? 0.8 : 1;
  t.setLimit(tod === 'day' ? CONFIG.speedLimitDay : CONFIG.speedLimitNight);
  sim.player.lightsOn = tod !== 'day';
}

/** The limit that applies to you right now: matrix sign over your lane, or the normal one. */
export function playerLimit(sim) {
  const p = sim.player;
  const lim = sim.msi ? sim.msi.limitAt(p.s, p.lane) : null;
  return lim != null ? Math.min(lim, speedLimitKmh()) : speedLimitKmh();
}

/** One frame of physics: player ≤ 1/120, traffic ≤ 1/30, then signs, closures, journal. */
export function stepSim(sim, dt, ctl) {
  const p = sim.player;
  const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / sub;
  for (let i = 0; i < sub; i++) p.update(h, ctl, sim.traffic);
  const tsub = Math.max(1, Math.ceil(dt / (1 / 30)));
  for (let i = 0; i < tsub; i++) sim.traffic.step(dt / tsub, p.s, p.proxy);
  if (sim.msi) sim.msi.update(dt, p.s);
  updateClosures(sim, dt);
  updateJunctionRamps(sim);
  updateJunctionExits(sim);
  sim.journal.tick(dt, p, sim.traffic, playerLimit(sim));
  sim.time += dt;
}

/**
 * Random closures in free play, taken down once well behind you, and the red
 * cross you drove under. Uses sim.rng, never Math.random: `seed + t` has to
 * reproduce.
 */
export function updateClosures(sim, dt) {
  const { player, traffic } = sim;
  if (!sim.scenario && CONFIG.lanes >= 2) {
    sim.closureDist += player.v * dt;
    if (sim.closureDist > 1000) {
      sim.closureDist -= 1000;
      const busy = traffic.closures.some((c) => c.s1 > player.s - 500);
      if (!busy && sim.rng() < CONFIG.closuresPer10km / 10) {
        const lane = sim.rng() < 0.55 ? 0 : Math.floor(sim.rng() * CONFIG.lanes);
        const s0 = player.s + CONFIG.rangeAhead + 1200 + sim.rng() * 600;
        traffic.addClosure(lane, s0, s0 + 500 + sim.rng() * 1100);
      }
    }
  }
  for (const c of [...traffic.closures]) if (c.s1 < player.s - CONFIG.rangeBehind - 400) traffic.removeClosure(c);
  // driving under a red cross
  const gi = gantryIndexAt(player.s);
  if (sim.lastGantry != null && gi === sim.lastGantry + 1) {
    const f = sim.msi ? sim.msi.face(gi, player.lane) : null;
    if (f && f.face === 'x') {
      sim.journal.event('red-cross', { lane: player.lane });
      sim.notices.push({ type: 'red-cross', lane: player.lane });
    }
  }
  sim.lastGantry = gi;
}

/**
 * On-ramps in free play (F-20). One ramp per junction, kept while it is in the
 * simulated range and removed once well behind, the way closures are. Ramps are
 * tracked by junction block, so a ramp is never added twice. `sim.ramps` holds
 * the ones the sim has; `traffic.ramps` is what the sim and the scenery read.
 */
export function updateJunctionRamps(sim) {
  const { player, traffic } = sim;
  if (sim.scenario || !CONFIG.rampsFreePlay) return;
  const sMin = player.s - CONFIG.rangeBehind;
  const sMax = player.s + CONFIG.rangeAhead + 500;
  for (const j of junctionsNear(sMin, sMax)) {
    if (j.rampTop < sMin || j.rampTop > sMax) continue;
    if (sim.ramps.has(j.b)) continue;
    const perMin = CONFIG.rampPerMin * (traffic.densityScale ?? 1);
    const truckShare = junctionHasEstate(j) ? 0.3 : null; // lorries from the estate beside it (F-40)
    sim.ramps.set(j.b, traffic.addRamp(j.rampTop, { perMin, truckShare }));
  }
  for (const [b, r] of sim.ramps) {
    if (r.sEnd >= player.s - CONFIG.rangeBehind - 200) continue;
    traffic.removeRamp(r);
    sim.ramps.delete(b);
  }
}

/**
 * Exits in free play (F-21), beside the on-ramps: one per junction, kept from
 * far enough back that its roll window is inside the simulated range (so nobody
 * appears already past the chance to leave) until the give-way at the top is
 * well behind you. Tracked by junction block, so an exit is never added twice.
 */
export function updateJunctionExits(sim) {
  const { player, traffic } = sim;
  if (sim.scenario || !CONFIG.exitsFreePlay) return;
  const sMin = player.s - CONFIG.rangeBehind;
  const sMax = player.s + CONFIG.rangeAhead + 500;
  for (const j of junctionsNear(sMin, sMax)) {
    if (j.sTop < sMin - 200) continue; // the exit is behind you
    if (j.exitStart - 2500 > sMax) continue; // its roll window is not in range yet
    if (sim.exits.has(j.b)) continue;
    const truckShare = junctionHasEstate(j) ? 0.3 : CONFIG.exitTruckShare;
    sim.exits.set(j.b, traffic.addExit(j, { share: CONFIG.exitShare, truckShare }));
  }
  for (const [b, x] of sim.exits) {
    if (x.sTop >= player.s - CONFIG.rangeBehind - 200) continue;
    traffic.removeExit(x);
    sim.exits.delete(b);
  }
}

/**
 * Drive with the bot, frame by frame, exactly as a browser frame does it: the
 * bot decides from the last percept, its presses go through the keyboard
 * mapping, the pedals ramp, then the sim steps. The headless runner and the
 * browser replay both call this, so a frame shot later is the same drive.
 *
 * `onStep(sim, dt, t)` is for the runner's diagnostics (min gap, min TTC); the
 * bot itself never sees anything but the percept. `laneMap` is filled the same
 * way the frame loop fills it, so the time-space diagram has history.
 */
export function advanceDrive(sim, { bot, perception, until, dt = 1 / 60, perceptEvery = 0.1, onStep = null, laneMap = null }) {
  let t = 0;
  const pedal = { thr: 0, brk: 0, thrHeld: 0, brkHeld: 0 };
  let percept = perception.update(0, sim.player, sim.traffic, sim.msi, playerLimit(sim));
  let perceptT = 0;
  while (t < until - 1e-9) {
    const out = bot.update(dt, percept);
    for (const p of out.presses) applyDrivePress(sim, p);
    const ctl = pedalStep(pedal, out.keys, dt);
    stepSim(sim, dt, ctl);
    holdFlash(sim, out.keys.flash);
    drainEvents(sim);
    perceptT -= dt;
    if (perceptT <= 0) {
      percept = perception.update(t, sim.player, sim.traffic, sim.msi, playerLimit(sim));
      perceptT = perceptEvery;
    }
    if (onStep) onStep(sim, dt, t);
    if (laneMap) laneMap.update(dt, sim.traffic, sim.player, sim.traffic.limitKmh, false);
    t += dt;
  }
  return { t, percept };
}

/** A key press, exactly as handlePresses maps it. Returns false for other keys. */
export function applyDrivePress(sim, { code, shift }) {
  const p = sim.player;
  const big = shift ? CONFIG.ccStepBig : CONFIG.ccStepSmall;
  switch (code) {
    case 'KeyC':
      p.toggleCruise();
      return true;
    case 'KeyR':
      p.resumeCruise();
      return true;
    case 'Equal':
    case 'NumpadAdd':
    case 'BracketRight':
      p.adjustCruise(big);
      return true;
    case 'PageUp':
      p.adjustCruise(CONFIG.ccStepBig);
      return true;
    case 'Minus':
    case 'NumpadSubtract':
    case 'BracketLeft':
      p.adjustCruise(-big);
      return true;
    case 'PageDown':
      p.adjustCruise(-CONFIG.ccStepBig);
      return true;
    case 'KeyQ':
      p.indicator(-1);
      return true;
    case 'KeyE':
      p.indicator(1);
      return true;
  }
  return false;
}

/** Hold F: one flash per 0.6 s. The car ahead feels pressure, as for a human. */
export function holdFlash(sim, held) {
  const p = sim.player;
  if (p.flashT <= 0 && held) {
    p.flashT = 0.6;
    sim.journal.event('flash', {});
    const who = sim.traffic.flashFrom(p.proxy);
    if (who) who.pressureT = Math.max(who.pressureT, 6);
  }
}

/**
 * Take this frame's player events into the journal and return them, so the
 * browser can still beep, toast and count collisions.
 */
export function drainEvents(sim) {
  const events = sim.player.events.slice();
  sim.journal.playerEvents(events);
  sim.player.events.length = 0;
  return events;
}
