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
  trafficDensity: 12, // vehicles per km per lane, your direction
  oncomingDensity: 9, // vehicles per km per lane, other carriageway
  rangeAhead: 1500, // simulated distance ahead of you (m)
  rangeBehind: 900, // simulated distance behind you (m)
  mix: { car: 0.69, van: 0.11, truck: 0.17, caravan: 0.03 },
  speeders: 0.06, // share of ordinary cars (archetypes add their own) that want limit + 12..37
  slowpokes: 0.1, // share of cars that want limit - 4..12
  middleLaneHoggers: 0.07, // share of drivers who ignore keep-right
  speedSpreadKmh: 4, // std-dev of 'normal' drivers around limit + 2
  truckSpeedKmh: 84, // trucks are limited (80 + GPS/tolerance)
  truckOvertakeEagerness: 1.0, // 0 = never overtake, 2 = elephant races galore
  coolness: 0.99, // ACC model: 0 = plain IDM (brakes hard on any close cut-in), ~1 = calm drop-back
  anticipation: 1.0, // scales how early AI reads merges and plans overtakes (0 = purely reactive)
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

  seed: 20261112,
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
