// Fully synthesized sound (no assets): engine, tyre/road roar, wind,
// positional rumble of nearby vehicles, indicator relay, cruise beeps, crashes.
import { CONFIG } from './config.js';

function noiseBuffer(ctx, seconds, brown = false) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voices = [];
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = CONFIG.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.white = noiseBuffer(ctx, 3);
    this.brown = noiseBuffer(ctx, 4, true);

    // engine: two detuned oscillators through a lowpass
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 2;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'triangle';
    this.osc3 = ctx.createOscillator();
    this.osc3.type = 'sine';
    const g2 = ctx.createGain();
    g2.gain.value = 0.6;
    const g3 = ctx.createGain();
    g3.gain.value = 0.8;
    this.osc1.connect(this.engFilter);
    this.osc2.connect(g2).connect(this.engFilter);
    this.osc3.connect(g3).connect(this.engGain);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();
    this.osc3.start();

    // road / tyre roar
    this.road = this.loop(this.brown, 'lowpass', 520, 0.7);
    this.road2 = this.loop(this.white, 'bandpass', 900, 0.6);
    // wind
    this.wind = this.loop(this.white, 'bandpass', 1500, 0.5);
    // scrape
    this.scrape = this.loop(this.white, 'bandpass', 2600, 3);

    // traffic voices (nearest vehicles)
    for (let i = 0; i < 6; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      src.loop = true;
      src.playbackRate.value = 1;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'inverse';
      pan.refDistance = 6;
      pan.rolloffFactor = 1.4;
      pan.maxDistance = 400;
      src.connect(filt).connect(gain).connect(pan).connect(this.master);
      src.start(0, Math.random() * 3);
      this.voices.push({ src, filt, gain, pan, veh: null });
    }
  }

  loop(buffer, type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start(0, Math.random() * 2);
    return { src, f, g };
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : CONFIG.volume, this.ctx.currentTime, 0.05);
  }

  setVolume(v) {
    if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /**
   * @param {object} st player state {rpm, throttle, speed (m/s), interior (bool), scrape (bool)}
   * @param {Array} near list of {x,y,z, vx,vz, v, type} relative positions (listener space)
   */
  update(dt, st, listener, near) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = st.speed;
    const inside = st.interior;
    // engine
    const fire = (st.rpm / 60) * 2; // 4-cyl firing frequency
    this.osc1.frequency.setTargetAtTime(fire, t, 0.05);
    this.osc2.frequency.setTargetAtTime(fire * 0.5, t, 0.05);
    this.osc3.frequency.setTargetAtTime(fire * 0.25, t, 0.05);
    const load = 0.25 + st.throttle * 0.75;
    this.engFilter.frequency.setTargetAtTime(180 + st.rpm * 0.09 * load + st.throttle * 300, t, 0.08);
    this.engGain.gain.setTargetAtTime((inside ? 0.045 : 0.075) * (0.45 + load * 0.8), t, 0.08);
    // road + wind
    const v = sp / 36; // ~1 at 130 km/h
    this.road.g.gain.setTargetAtTime((inside ? 0.16 : 0.22) * Math.min(1.4, v), t, 0.1);
    this.road.f.frequency.setTargetAtTime(300 + sp * 6, t, 0.1);
    this.road2.g.gain.setTargetAtTime((inside ? 0.012 : 0.03) * Math.min(1.4, v * v), t, 0.1);
    this.wind.g.gain.setTargetAtTime((inside ? 0.025 : 0.06) * Math.min(2, v * v), t, 0.1);
    this.wind.f.frequency.setTargetAtTime(700 + sp * 18, t, 0.2);
    this.scrape.g.gain.setTargetAtTime(st.scrape ? 0.18 : 0, t, 0.03);

    // listener
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.setValueAtTime(0, t);
      L.positionY.setValueAtTime(0, t);
      L.positionZ.setValueAtTime(0, t);
      L.forwardX.setValueAtTime(listener.fx, t);
      L.forwardY.setValueAtTime(0, t);
      L.forwardZ.setValueAtTime(listener.fz, t);
      L.upX.setValueAtTime(0, t);
      L.upY.setValueAtTime(1, t);
      L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(0, 0, 0);
      L.setOrientation(listener.fx, 0, listener.fz, 0, 1, 0);
    }

    // assign voices to nearest vehicles, keeping existing assignments
    const keep = new Set(near.map((n) => n.veh));
    for (const vc of this.voices) if (vc.veh && !keep.has(vc.veh)) vc.veh = null;
    for (const n of near) {
      if (this.voices.some((vc) => vc.veh === n.veh)) continue;
      const free = this.voices.find((vc) => !vc.veh);
      if (free) free.veh = n.veh;
    }
    for (const vc of this.voices) {
      const n = vc.veh ? near.find((q) => q.veh === vc.veh) : null;
      if (!n) {
        vc.gain.gain.setTargetAtTime(0, t, 0.2);
        continue;
      }
      const heavy = n.type === 'truck';
      const level = (heavy ? 0.6 : 0.28) * Math.min(1.3, n.v / 30) * (inside ? 0.6 : 1);
      vc.gain.gain.setTargetAtTime(level, t, 0.15);
      vc.filt.frequency.setTargetAtTime(heavy ? 380 : 650 + n.v * 6, t, 0.15);
      // doppler-ish: radial closing speed
      const d = Math.hypot(n.x, n.z) || 1;
      const closing = -(n.x * n.rvx + n.z * n.rvz) / d;
      vc.src.playbackRate.setTargetAtTime(Math.min(1.25, Math.max(0.8, 343 / (343 - closing))), t, 0.1);
      if (vc.pan.positionX) {
        vc.pan.positionX.setTargetAtTime(n.x, t, 0.03);
        vc.pan.positionY.setTargetAtTime(0, t, 0.03);
        vc.pan.positionZ.setTargetAtTime(n.z, t, 0.03);
      } else vc.pan.setPosition(n.x, 0, n.z);
    }
  }

  tick(on) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = on ? 2400 : 1700;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.05);
  }

  beep(freq = 1250, dur = 0.07, n = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * (dur + 0.05);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  crash(strength = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.4 + strength * 0.3), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.7);
  }
}
