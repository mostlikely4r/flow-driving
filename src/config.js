// All tunables live here. Settings changed in the in-game menu are stored in
// localStorage and override these defaults. Edit freely.

export const DEFAULTS = {
  // --- road layout ---
  lanes: 3, // lanes per direction (2..5)
  laneWidth: 3.5,
  barrierHalf: 0.35, // half width of the concrete median barrier
  innerShoulder: 1.0, // asphalt between barrier and left edge line
  hardShoulder: 3.2, // vluchtstrook

  // --- time of day & limits (Dutch: 100 from 6-19h, 130 at night) ---
  timeOfDay: 'day', // 'day' | 'dusk' | 'night'
  speedLimitDay: 100,
  speedLimitNight: 130,

  // --- traffic ---
  trafficDensity: 10, // vehicles per km per lane, your direction
  oncomingDensity: 9, // vehicles per km per lane, other carriageway
  rangeAhead: 1500, // simulated distance ahead of you (m)
  rangeBehind: 900, // simulated distance behind you (m)
  mix: { car: 0.69, van: 0.11, truck: 0.17, caravan: 0.03 },
  speeders: 0.07, // share of ordinary cars (archetypes add their own) that want limit + 10..45 (mostly 10-20)
  nightSpeeders: 1.7, // more of them at night
  nightTraffic: 0.5, // traffic density at night, relative to the setting (dusk: 0.8)
  slowpokes: 0.06, // share of cars that want limit - 3..9
  middleLaneHoggers: 0.07, // share of drivers who ignore keep-right
  closuresPer10km: 0.5, // random lane closures (red cross) in free play
  reactionTime: 1, // scales every driver's reaction delay (0 = instant; ~1.4 = stop-and-go from a tap of the brakes)
  brakeLightRead: 1, // how much drivers react early to brake lights ahead (stabilises queues)
  passBoostKmh: 5, // a little extra speed while passing someone
  moveOver: 0.25, // urge to keep right when a faster car is close behind you
  speedGain: 1, // how much a few km/h faster is worth to a car driver when choosing a lane
  normalOffsetKmh: 6, // ordinary drivers aim for limit + this...
  speedSpreadKmh: 3, // ...give or take this (std-dev)
  truckSpeedKmh: 84, // trucks are limited (80 + GPS/tolerance)
  truckOvertakeEagerness: 1.0, // 0 = never overtake, 2 = elephant races galore
  coolness: 0.99, // ACC model: 0 = plain IDM (brakes hard on any close cut-in), ~1 = calm drop-back
  anticipation: 1.0, // scales how early AI reads merges and plans overtakes (0 = purely reactive)
  telegraph: 1.0, // scales how much AI shows lane changes in advance (drift, closing up, mirror-check delay); 0 = off
  archetypes: 1.0, // share of cars with a recognisable driver archetype (0 = all ordinary)
  politeness: 1.0, // scales how much AI lets others in / moves right for faster cars

  // --- player car ---
  steeringAssist: 2, // 0: raw, 1: follows road curve, 2: also straightens after release
  keyboardSteerRate: 1.7, // how fast keyboard steering ramps in (1/s)
  keyboardLatAccel: 3.2, // lateral g at full keyboard lock (m/s^2)
  ccStepSmall: 1,
  ccStepBig: 5,
  adaptiveCruise: false, // ACC (keeps distance). Classic CC when false.
  accTimeGap: 1.8,

  // --- rendering ---
  pixelRatio: 1.25, // capped by device pixel ratio
  shadows: true,
  bloom: true,
  overlay: 'off', // off | ar-rel | ar-abs | dev (O key)
  headlightGlare: 1.0, // glare of oncoming / following headlights (0 = none)
  mirrorRes: 1.0, // mirror render target scale
  fov: 62,

  // --- audio ---
  volume: 0.8,
  radioVolume: 0.5,
  laneMap: 0, // overhead lane map: 0 off, 1 map, 2 map + time-space (U)
  laneMapSpan: 500, // metres of road it shows (, . to zoom)
  radioStreams: true, // live Dutch radio over the internet (Y to tune)

  seed: 20261112,

  // --- Proefrit (F-37): what a driver in the car can see ---
  // The bot's view (src/perception.js). Forward well beyond a sane following
  // distance, mirrors closer; lanes two away are only readable near you.
  perception: { aheadM: 250, behindM: 120, farM: 80, histS: 1.5, driftEps: 0.12 },

  // --- Proefrit: moment detector thresholds (F-37) ---
  // A detector only counts once it fires where you dropped a mark (F8), so
  // these move to fit your journals. See src/moments.js and `npm run report`.
  moments: {
    cutOffTGap: 0.8, // a car merging in closer than this (time gap, s)
    cutOffChaseM: 40, // ...while this close when it crosses the line
    unannouncedM: 60, // a lane change this close with little warning
    unannouncedSignal: 1, // s of visible signal that counts as announced
    unannouncedDrift: 0.25, // m of visible drift toward the line that counts
    phantomBrake: 2, // m/s² braking by the car ahead with nothing in front of it
    phantomLook: 40, // m ahead of it that would explain the braking
    popInM: 150, // appears/vanishes inside this distance
    notLetInS: 8, // signalling this long without a gap opening
    boxedInKmh: 15, // under your set speed ...
    boxedInS: 60, // ...for this long, with no lane to escape to
    escapeGapM: 25, // free gap in a neighbouring lane that counts as an escape
    tailgateTGap: 0.6, // car behind closer than this (time gap, s)
    tailgateS: 10, // ...for this long
    dawdlerS: 30, // blocked by a slower car in a left lane this long
    dawdlerKmh: 5, // how much slower it has to be
    forcedBrake: 3, // your own braking, m/s²
    nearMissTTC: 1.5, // time to collision, s
    signalPatienceS: 8, // an indicator on this long without a move is a promise not kept
    pointlessM: 120, // a left lane change this close with nothing slower to overtake
    letInGainM: 8, // a car behind opening this much room counts as letting you in
    movedOverS: 10, // a car ahead moving right within this long after your flash
    movedOverM: 25, // or after you closed to this distance
    cleanOvertakeNoBrake: 1, // no braking harder than this counts as clean, m/s²
    elephantS: 20, // two trucks side by side ahead for this long
    elephantM: 300, // ...within this distance of you
    waveDropKmh: 30, // speed drop that counts as riding a wave
    calmWindowS: 30, // calm share: no friction moment in this window
  },
};

const KEY = 'snelweg.settings.v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const CONFIG = { ...structuredClone(DEFAULTS), ...(typeof localStorage !== 'undefined' ? load() : {}) };

export function saveSetting(key, value) {
  CONFIG[key] = value;
  try {
    const cur = load();
    cur[key] = value;
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {
    /* ignore */
  }
}

export function resetSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function speedLimitKmh() {
  return CONFIG.timeOfDay === 'day' ? CONFIG.speedLimitDay : CONFIG.speedLimitNight;
}
