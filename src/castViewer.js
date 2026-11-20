// The persona viewer's screen chrome: the rail of archetypes, the derived spec
// sheet, the body chips and the speed readout. The 3D part is CastStage; the
// numbers come from personaSpec.sampleSpec(). Nothing here names a persona.
import { ARCHETYPES } from './archetypes.js';
import { sampleSpec, variantsOf, defaultVariant, speedRange } from './personaSpec.js';
import { buildDemo, DEMO_LIMIT, hasDemo } from './scenarios.js';
import { speedLimitKmh } from './config.js';

const $ = (id) => document.getElementById(id);

const LAMP_NAMES = {
  std: 'Rectangular lamps',
  modern: 'Slim lamps',
  bar: 'LED bar',
  angel: 'Angel rings',
  round: 'Warm halogens',
  eco: 'Eco L-lamps',
  tall: 'Tall lamps',
  ev: 'Full-width light line',
  rack: 'Rack + halogens',
};
const BODY_NAMES = { hatch: 'Hatch', sedan: 'Sedan', estate: 'Estate', suv: 'SUV', van: 'Van', truck: 'Truck', rigid: 'Rigid', caravan: 'Caravan' };

const trim = (x, d = 2) => {
  let s = Number(x).toFixed(d);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
};
const num = (v, d = 0) => {
  const s = trim(v, d);
  if (s === '-0' || s === '−0') return '0';
  return s.replace('-', '−');
};
const signed = (v, d = 0) => {
  const s = num(v, d);
  return s.startsWith('−') || Number(s) <= 0 ? s : `+${s}`;
};
const offsetRange = (r) => {
  const d = Math.abs(r.min - Math.round(r.min)) < 0.1 && Math.abs(r.max - Math.round(r.max)) < 0.1 ? 0 : 1;
  const a = signed(r.min, d);
  const b = signed(r.max, d);
  return a === b ? a : `${a}…${b}`;
};
const secs = (r) => (Math.abs(r.max - r.min) < 5e-3 ? `${trim(r.min)} s` : `${trim(r.min)}–${trim(r.max)} s`);
const pct = (r, d = 0) => (Math.abs(r.max - r.min) < 5e-3 ? `${trim(r.min * 100, d)}%` : `${Math.round(r.min * 100)}–${Math.round(r.max * 100)}%`);
const factor = (r) => (Math.abs(r.max - r.min) < 5e-3 ? `×${trim(r.min)}` : `×${trim(r.min)}–${trim(r.max)}`);
const score = (r) => (Math.abs(r.max - r.min) < 5e-3 ? num(r.min, 2) : `${num(r.min, 2)}–${num(r.max, 2)}`);

/** The live strip: the star's own numbers, not a copy. */
const liveText = (r) => {
  const parts = [`${signed(r.offset, 0)} km/h`, `T ${trim(r.T, 2)} s`, `p ${trim(r.p, 2)}`];
  if (r.trait === 'safe' || r.trait === 'yield') parts.push(`tSafe ${trim(r.tSafe, 2)} s`);
  parts.push(`now ${Math.round(r.kmh)}`);
  return parts.join(' · ');
};

export class CastViewer {
  constructor(stage) {
    this.stage = stage;
    this.keys = Object.keys(ARCHETYPES);
    this.root = $('cast');
    this.bottom = $('castbottom');
    this.listEl = $('castlist');
    this.headEl = $('casthead');
    this.specEl = $('castspec');
    this.notesEl = $('castnotes');
    this.chipsEl = $('castchips');
    this.gapEl = $('castgap');
    this.captionEl = $('castcaption');
    this.liveEl = $('castlive');
    this.fadeEl = $('castfade');
    this.kmhEl = $('castkmh');
    this.limitEl = $('castlimit');
    this.sheetEl = this.root ? this.root.querySelector('.sheet') : null;
    this.isOpen = false;
    this.key = this.keys[0] || null;
    this.variant = null;
    this.signature = null;
    this.lampStates = [];
    this.gap = null; // { draft } while the headway view is open
    this.demo = null; // { trait } while a behaviour demo plays
    this.lastCaption = '';
    this.lastLive = '';
    this.innerW = 0;
    this.onOpen = null;
    this.onClose = null;
    this.buildRail();
  }

  // ---------------------------------------------------------------- rail
  buildRail() {
    this.listEl.innerHTML = '';
    this.items = new Map();
    for (const key of this.keys) {
      const spec = sampleSpec(key);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'castitem';
      btn.dataset.key = key;
      const name = document.createElement('b');
      name.textContent = spec ? spec.name : key;
      const line = document.createElement('span');
      line.textContent = spec && spec.offset && spec.T ? `${offsetRange(spec.offset)} km/h · T ${trim(spec.T.min)}–${trim(spec.T.max)} s` : '';
      btn.append(name, line);
      btn.onclick = () => this.selectPersona(key);
      this.listEl.appendChild(btn);
      this.items.set(key, btn);
    }
  }

  markRail() {
    for (const [key, el] of this.items) el.classList.toggle('on', key === this.key);
  }

  // ---------------------------------------------------------------- show / hide
  show() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.bottom.classList.remove('hidden');
    document.body.classList.add('cast');
    this.stage.open();
    this.selectPersona(this.key || this.keys[0]);
    this.onOpen?.();
  }

  hide() {
    if (!this.isOpen) return;
    if (this.demo) this.closeDemo();
    this.isOpen = false;
    this.gap = null; // the stage closes the gap view with everything else
    document.body.classList.remove('castgap');
    this.stage.close();
    this.root.classList.add('hidden');
    this.bottom.classList.add('hidden');
    document.body.classList.remove('cast');
    this.onClose?.();
  }

  // ---------------------------------------------------------------- selection
  selectPersona(key) {
    const spec = sampleSpec(key);
    if (!spec) return;
    if (this.demo) this.closeDemo(); // a different persona closes the demo
    this.closeGap(); // a different persona closes back to the turntable
    this.key = key;
    this.limit = speedLimitKmh();
    this.variant = defaultVariant(key);
    // The persona's own signature first, then the three families L cycles
    // through, so every car can show the same comparison.
    this.lampStates = [...new Set([spec.lights || 'std', 'bar', 'round', 'angel'])];
    this.signature = spec.lights || 'std';
    this.spec = spec;
    this.markRail();
    this.renderSheet();
    this.renderChips();
    this.setCar();
    this.listEl.querySelector(`[data-key="${key}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  setCar() {
    this.stage.setCar(this.key, this.variant, this.signature, this.limit);
    // a body flip keeps the same headway; only the bumpers move
    if (this.gap) this.stage.openHeadway(this.gap.draft);
    const offset = this.stage.veh ? this.stage.veh.limitOffset : 0;
    const kmh = Math.round(this.limit + offset);
    this.kmhEl.textContent = String(kmh);
    this.limitEl.textContent = `limit ${this.limit} ${signed(offset)} · wanted`;
  }

  selectVariant(variant) {
    if (!variant) return;
    this.variant = variant;
    this.renderChips();
    this.setCar();
  }

  cycleVariant(dir) {
    const list = variantsOf(this.key);
    if (list.length < 2) return;
    const i = Math.max(0, list.findIndex((v) => v.variant === this.variant));
    this.selectVariant(list[(i + dir + list.length) % list.length].variant);
  }

  cyclePersona(dir) {
    const i = Math.max(0, this.keys.indexOf(this.key));
    this.selectPersona(this.keys[(i + dir + this.keys.length) % this.keys.length]);
  }

  cycleLamps() {
    // A signature can only swap visibly while the lamps face you, so the first
    // press takes the turntable to its low front framing (the gap view has its
    // own fixed framing and leaves the turntable's alone).
    if (!this.gap && this.stage.framing === 0) this.stage.framing = 1;
    const i = Math.max(0, this.lampStates.indexOf(this.signature));
    this.signature = this.lampStates[(i + 1) % this.lampStates.length];
    this.renderSheet();
    this.setCar();
  }

  cycleFraming() {
    this.stage.cycleFraming();
    this.renderSheet();
  }

  // ---------------------------------------------------------------- headway (slice 2)
  toggleGap() {
    if (this.gap) this.closeGap();
    else this.openGap();
  }

  openGap() {
    if (!this.spec || !this.spec.T) return;
    if (this.demo) this.closeDemo();
    if (!this.stage.openHeadway(false)) return;
    this.gap = { draft: false };
    // the rail steps aside so the rig gets the window minus the sheet
    document.body.classList.add('castgap');
    this.setFreeWidth();
    this.renderSheet();
  }

  /** Normal T, or the Tdraft it uses behind a truck (Grijze sok only). */
  setGapMode(draft) {
    if (!this.gap || this.gap.draft === draft) return;
    if (!this.stage.openHeadway(draft)) return;
    this.gap.draft = draft;
    this.renderSheet();
  }

  closeGap() {
    if (!this.gap) return;
    this.gap = null;
    document.body.classList.remove('castgap');
    this.stage.closeHeadway();
    this.renderSheet();
  }

  /** Pixels of window the sheet leaves free: the rig frames itself into them. */
  setFreeWidth() {
    const left = this.sheetEl ? this.sheetEl.getBoundingClientRect().left : 0;
    if (left > 0) this.stage.freeWidth = left;
    this.innerW = window.innerWidth;
  }

  renderGap() {
    const el = this.gapEl;
    if (!el) return;
    el.replaceChildren();
    el.classList.toggle('hidden', !this.gap);
    if (!this.gap) return;
    const s = this.spec;
    const chip = (draft, label, range) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (this.gap.draft === draft ? ' on' : '');
      b.textContent = `${label} \u00b7 ${secs(range)}`;
      b.title = draft
        ? 'The gap it keeps behind a truck (Tdraft): the same lead car, only the gap changes'
        : 'The gap it keeps behind a lead car (T), as sampled from its drive()';
      b.onclick = () => this.setGapMode(draft);
      el.appendChild(b);
    };
    if (s.T) chip(false, 'Normal', s.T);
    if (s.Tdraft) chip(true, 'Behind a truck', s.Tdraft);
  }

  // ---------------------------------------------------------------- demos (slice 3)
  /** Play the staged demo behind a sheet line, or close it if it is already playing. */
  openDemo(trait) {
    if (!this.isOpen || !hasDemo(this.key, trait)) return false;
    if (this.demo && this.demo.trait === trait) return true; // already playing (rows share traits)
    this.closeGap();
    const sc = buildDemo(this.key, trait, DEMO_LIMIT);
    if (!sc) return false;
    this.demo = { trait };
    document.body.classList.add('castdemo');
    this.setFreeWidth();
    this.stage.startDemo(sc, { variant: this.variant, signature: this.signature });
    this.lastCaption = '';
    this.lastLive = '';
    this.renderSheet();
    return true;
  }

  closeDemo() {
    if (!this.demo) return;
    this.demo = null;
    this.stage.closeDemo();
    document.body.classList.remove('castdemo');
    if (this.fadeEl) this.fadeEl.style.opacity = '0';
    if (this.captionEl) {
      this.captionEl.textContent = '';
      this.captionEl.classList.add('hidden');
    }
    if (this.liveEl) {
      this.liveEl.textContent = '';
      this.liveEl.classList.add('hidden');
    }
    this.lastCaption = '';
    this.lastLive = '';
    // back to the turntable car, with the body and lamps the sheet was showing
    this.stage.setCar(this.key, this.variant, this.signature, this.limit);
    this.renderSheet();
  }

  // ---------------------------------------------------------------- sheet + chips
  renderSheet() {
    const s = this.spec;
    if (!s) return;
    const range = speedRange(s, this.limit);
    const R = (v, f) => (v ? f(v) : '—');
    const rows = [
      ['Wants', range ? `${offsetRange(s.offset)} km/h` : '—', 'pace'],
      ['Follows', R(s.T, secs), 'gap'],
      ['Gives way', R(s.p, pct), 'yield'],
      ['Reacts', R(s.react, secs), 'react'],
      ['Signals', R(s.tSignal, secs), 'signal'],
      ['Accepts a gap', R(s.tSafe, secs), 'safe'],
    ];
    const tells = [];
    if (s.a && (Math.abs(s.a.min - 1) > 0.02 || Math.abs(s.a.max - 1) > 0.02)) tells.push(['Accelerates', factor(s.a), 'signal']);
    if (s.b && (Math.abs(s.b.min - 1) > 0.02 || Math.abs(s.b.max - 1) > 0.02)) tells.push(['Brakes', factor(s.b), 'react']);
    if (s.Tdraft) tells.push(['Behind a truck', secs(s.Tdraft), 'draft']);
    if (s.press && s.press.max > 0.01) tells.push(['Presses while waiting', score(s.press), 'press']);
    if (s.mergeEarly && s.mergeEarly.max > 0.01) tells.push(['Merges early', score(s.mergeEarly), null]);
    if (s.shares?.hogger > 0.005) tells.push(['Middle-lane hogger', `${Math.round(s.shares.hogger * 100)}% of the time`, 'keepright']);
    if (s.msiOver) tells.push(['Over a sign limit', `${offsetRange(s.msiOver)} km/h`, null]);
    if (s.bias) tells.push(['Keep-right urge', score(s.bias), 'keepright']);
    if (s.antic) tells.push(['Reads ahead', score(s.antic), 'antic']);
    if (s.tPrep) tells.push(['Mirror check', secs(s.tPrep), 'signal']);
    if (s.lcDur) tells.push(['Lane change takes', secs(s.lcDur), 'signal']);

    this.headEl.replaceChildren();
    const title = document.createElement('div');
    title.className = 'casttitle';
    const tname = document.createElement('b');
    tname.textContent = this.demo ? this.stage.demoTitle : s.name;
    const tlamp = document.createElement('span');
    tlamp.textContent = LAMP_NAMES[this.signature] || this.signature;
    title.append(tname, tlamp);
    const sub = document.createElement('div');
    sub.className = 'castsub';
    if (this.demo) {
      const paused = this.stage.demoPaused ? ' · paused' : '';
      const speed = this.stage.demoSpeed !== 1 ? ` · ${this.stage.demoSpeed}×` : '';
      sub.textContent = `Demo${paused}${speed} · Space pause · 1 / 2 slow-mo · 3 normal · R restart · Esc back`;
    } else if (this.gap) {
      sub.textContent = 'Gap open · the bracket is this car\u2019s headway · Esc back';
    } else {
      sub.textContent = `${this.stage.framingName} · L lamps · V camera · G gap · Esc close`;
    }
    this.headEl.append(title, sub);

    // Force the next frame to re-apply the current caption/live strip after a
    // sheet rebuild (Space and speed keys rebuild it).
    if (this.captionEl) {
      this.captionEl.classList.add('hidden');
      this.lastCaption = null;
    }
    if (this.liveEl) {
      this.liveEl.classList.add('hidden');
      this.lastLive = null;
    }

    this.specEl.replaceChildren();
    const sheetRow = ([k, v, trait]) => {
      // `gap` is the one non-demo view; a null trait is honestly "not shown".
      const isGap = trait === 'gap';
      const playable = trait && !isGap && hasDemo(this.key, trait);
      const action = isGap ? () => this.toggleGap() : playable ? () => this.openDemo(trait) : null;
      const row = document.createElement(action ? 'button' : 'div');
      row.className = 'specrow';
      const active = (this.gap && isGap) || (this.demo && this.demo.trait === trait);
      if (active) row.classList.add('on');
      if (action) {
        row.type = 'button';
        row.classList.add('specbtn');
        row.onclick = action;
        row.title = isGap
          ? 'A lead car and a bracket, as long as this car follows'
          : 'Play the staged behaviour demo on the rig';
      }
      const name = document.createElement('span');
      name.textContent = k;
      const val = document.createElement('b');
      val.textContent = v;
      if (action) {
        const hint = document.createElement('span');
        hint.className = 'spechint';
        hint.textContent = isGap ? (this.gap ? 'close' : 'gap') : active ? 'playing' : 'play';
        val.appendChild(hint);
      } else if (trait !== undefined) {
        // A line with a trait but no demo for this persona is text, and says so.
        const hint = document.createElement('span');
        hint.className = 'spechint muted';
        hint.textContent = 'not shown';
        val.appendChild(hint);
      }
      row.append(name, val);
      this.specEl.appendChild(row);
    };
    rows.forEach(sheetRow);
    if (tells.length) {
      const head = document.createElement('div');
      head.className = 'castsub tellhead';
      head.textContent = 'Tells';
      this.specEl.appendChild(head);
      tells.forEach(sheetRow);
    }
    const honesty = document.createElement('div');
    honesty.className = 'honesty';
    honesty.textContent = `Looks the part, drives like it ~${Math.round(s.loyalty * 100)}% of the time.`;
    this.specEl.appendChild(honesty);

    this.notesEl.replaceChildren();
    if (this.demo) {
      const p = document.createElement('p');
      p.className = 'demoabout';
      p.textContent = this.stage.demoAbout;
      this.notesEl.appendChild(p);
      if (this.limit !== DEMO_LIMIT) {
        const n = document.createElement('p');
        n.className = 'note';
        n.textContent = `Demos are staged at the ${DEMO_LIMIT} km/h day limit; the turntable still uses the current limit.`;
        this.notesEl.appendChild(n);
      }
    }
    for (const line of s.notes) {
      const p = document.createElement('p');
      p.textContent = line;
      this.notesEl.appendChild(p);
    }
    this.renderGap();
  }

  renderChips() {
    const list = variantsOf(this.key);
    this.chipsEl.innerHTML = '';
    for (const { variant, weight } of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (variant === this.variant ? ' on' : '');
      b.textContent = `${BODY_NAMES[variant] || variant} · ${Math.round(weight * 100)}%`;
      b.title = `Build the ${variant} ${Math.round(weight * 100)}% of the time`;
      b.onclick = () => this.selectVariant(variant);
      this.chipsEl.appendChild(b);
    }
  }

  update(dt, camera, night) {
    if (!this.isOpen) return;
    if ((this.gap || this.demo) && window.innerWidth !== this.innerW) this.setFreeWidth();
    this.stage.update(dt, camera, night);
    if (!this.demo) return;
    if (this.captionEl) {
      const cap = this.stage.demoCaption || '';
      if (cap !== this.lastCaption) {
        this.captionEl.textContent = cap;
        this.captionEl.classList.toggle('hidden', !cap);
        this.lastCaption = cap;
      }
    }
    if (this.liveEl) {
      const r = this.stage.demoReadout;
      const text = r ? liveText(r) : '';
      if (text !== this.lastLive) {
        this.liveEl.textContent = text;
        this.liveEl.classList.toggle('hidden', !text);
        this.lastLive = text;
      }
    }
    if (this.fadeEl) this.fadeEl.style.opacity = String(this.stage.demoFade);
  }

  handlePresses(presses) {
    for (const p of presses) {
      if (this.demo) {
        switch (p.code) {
          case 'Escape':
            this.closeDemo();
            return;
          case 'Space':
            this.stage.toggleDemoPause();
            this.renderSheet();
            break;
          case 'Digit1':
          case 'Numpad1':
            this.stage.setDemoSpeed(0.5);
            this.renderSheet();
            break;
          case 'Digit2':
          case 'Numpad2':
            this.stage.setDemoSpeed(0.25);
            this.renderSheet();
            break;
          case 'Digit3':
          case 'Numpad3':
            this.stage.setDemoSpeed(1);
            this.renderSheet();
            break;
          case 'KeyR':
            this.stage.restartDemo();
            this.renderSheet();
            break;
        }
        continue;
      }
      switch (p.code) {
        case 'Escape':
          if (this.gap) this.closeGap();
          else this.hide();
          return;
        case 'ArrowUp':
        case 'PageUp':
          this.cyclePersona(-1);
          break;
        case 'Tab':
          this.cyclePersona(p.shift ? -1 : 1);
          break;
        case 'ArrowDown':
        case 'PageDown':
          this.cyclePersona(1);
          break;
        case 'ArrowLeft':
          this.cycleVariant(-1);
          break;
        case 'ArrowRight':
          this.cycleVariant(1);
          break;
        case 'KeyL':
          this.cycleLamps();
          break;
        case 'KeyV':
          this.cycleFraming();
          break;
        case 'KeyG':
          this.toggleGap();
          break;
      }
    }
  }
}
