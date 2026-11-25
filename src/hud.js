// DOM overlay: speedometer, cruise control, limit sign, indicators, toasts,
// stats panel, help and settings.
import { CONFIG, saveSetting, resetSettings, DEFAULTS } from './config.js';
import { KMH } from './util.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.speed = $('spd');
    this.cc = $('cc');
    this.ccVal = $('ccval');
    this.ccLabel = $('cclabel');
    this.limit = $('limitnum');
    this.indL = $('indl');
    this.indR = $('indr');
    this.gap = $('gap');
    this.gear = $('gear');
    this.toasts = $('toasts');
    this.statsEl = $('stats');
    this.helpEl = $('help');
    this.menuEl = $('menu');
    this.viewEl = $('viewname');
    this.clockEl = $('clock');
    this.fpsEl = $('fps');
    this.lastToast = new Map();
    this.fpsAcc = 0;
    this.fpsN = 0;
  }

  toast(text, kind = 'info', ms = 2600) {
    const now = performance.now();
    if (this.lastToast.has(text) && now - this.lastToast.get(text) < 2500) return;
    this.lastToast.set(text, now);
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  update(dt, player, limitKmh, blinkOn, extra) {
    this.speed.textContent = Math.max(0, Math.round(player.speedKmh));
    const cc = player.cc;
    const acc = CONFIG.adaptiveCruise;
    this.ccLabel.textContent = acc ? 'ACC' : 'CC';
    if (cc.on) {
      this.cc.className = 'cc on';
      this.ccVal.textContent = cc.set;
    } else if (cc.has) {
      this.cc.className = 'cc standby';
      this.ccVal.textContent = cc.set;
    } else {
      this.cc.className = 'cc off';
      this.ccVal.textContent = '--';
    }
    this.limit.textContent = limitKmh;
    const l = player.ind === -1 && blinkOn;
    const r = player.ind === 1 && blinkOn;
    this.indL.classList.toggle('on', l);
    this.indR.classList.toggle('on', r);
    if (player.leader && player.vAlong > 10 * KMH && player.leaderGap < 250) {
      const tg = player.leaderGap / player.vAlong;
      this.gap.textContent = `${tg.toFixed(1)} s`;
      this.gap.className = tg < 1 ? 'gap bad' : tg < 1.8 ? 'gap meh' : 'gap ok';
    } else {
      this.gap.textContent = '—';
      this.gap.className = 'gap';
    }
    this.gear.textContent = `D${player.gear}`;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fpsEl.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${extra.vehicles} vehicles`;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }

  setView(name) {
    this.viewEl.textContent = name;
  }

  /** Which world the menu's World row shows as chosen (F-48). */
  setWorld(w) {
    for (const b of this.menuEl.querySelectorAll('[data-world]')) b.classList.toggle('on', b.dataset.world === w);
  }

  toggle(el, force) {
    const show = force ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
    return show;
  }

  showStats(stats) {
    if (this.statsEl.classList.contains('hidden')) return;
    const rows = stats.rows();
    this.statsEl.innerHTML = '<h3>Trip</h3>' + rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  }

  buildMenu(onChange) {
    const defs = [
      ['timeOfDay', 'Time of day', 'select', [['day', 'Day (limit 100)'], ['dusk', 'Dusk (limit 130)'], ['night', 'Night (limit 130)']]],
      ['world', 'World', 'world'],
      ['lanes', 'Lanes per direction *', 'select', [[2, '2'], [3, '3'], [4, '4'], [5, '5']]],
      ['trafficDensity', 'Traffic (vehicles / km / lane)', 'range', [2, 30, 1]],
      ['oncomingDensity', 'Oncoming traffic', 'range', [0, 25, 1]],
      ['truckOvertakeEagerness', 'Truck overtaking (elephant races)', 'range', [0, 2.5, 0.1]],
      ['politeness', 'AI politeness', 'range', [0, 2, 0.1]],
      ['anticipation', 'AI anticipation', 'range', [0, 1.5, 0.1]],
      ['closuresPer10km', 'Lane closures (per 10 km)', 'range', [0, 4, 0.1]],
      ['reactionTime', 'Driver reaction time (× normal; higher = waves grow)', 'range', [0, 1.4, 0.1]],
      ['middleLaneHoggers', 'Middle-lane hoggers', 'range', [0, 0.4, 0.01]],
      ['speeders', 'Speeders', 'range', [0, 0.4, 0.01]],
      ['speedSpreadKmh', 'Speed spread (km/h)', 'range', [0, 12, 0.5]],
      ['steeringAssist', 'Steering assist', 'select', [[0, 'Off'], [1, 'Follows curves'], [2, 'Curves + straighten']]],
      ['keyboardSteerRate', 'Keyboard steer speed', 'range', [0.5, 4, 0.1]],
      ['keyboardLatAccel', 'Keyboard steer strength', 'range', [1, 8, 0.1]],
      ['adaptiveCruise', 'Adaptive cruise (ACC)', 'check'],
      ['accTimeGap', 'ACC time gap (s)', 'range', [1, 3, 0.1]],
      ['fov', 'Field of view', 'range', [45, 90, 1]],
      ['volume', 'Volume', 'range', [0, 1, 0.05]],
      ['radioVolume', 'Radio volume (Y = tune)', 'range', [0, 1, 0.05]],
      ['radioUrl', 'Radio stream URL', 'text', 'https://…'],      ['radioFolder', 'My music', 'folder', 'Choose music folder…'],
      ['shadows', 'Shadows *', 'check'],
      ['bloom', 'Bloom', 'check'],
      ['headlightGlare', 'Headlight glare', 'range', [0, 2, 0.1]],
      ['mirrorRes', 'Mirror resolution *', 'range', [0.5, 2, 0.25]],
      ['pixelRatio', 'Render scale *', 'range', [0.5, 2, 0.25]],
    ];
    const box = $('menuitems');
    box.innerHTML = '';
    for (const [key, label, type, opt] of defs) {
      const row = document.createElement('label');
      row.className = 'mrow';
      const span = document.createElement('span');
      span.textContent = label;
      row.appendChild(span);
      let input;
      if (type === 'select') {
        input = document.createElement('select');
        for (const [v, t] of opt) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = t;
          if (String(CONFIG[key]) === String(v)) o.selected = true;
          input.appendChild(o);
        }
        input.onchange = () => {
          const v = typeof DEFAULTS[key] === 'number' ? Number(input.value) : input.value;
          saveSetting(key, v);
          onChange(key, v);
        };
      } else if (type === 'range') {
        input = document.createElement('input');
        input.type = 'range';
        [input.min, input.max, input.step] = opt;
        input.value = CONFIG[key];
        const val = document.createElement('em');
        val.textContent = CONFIG[key];
        input.oninput = () => {
          const v = Number(input.value);
          val.textContent = v;
          saveSetting(key, v);
          onChange(key, v);
        };
        row.appendChild(input);
        row.appendChild(val);
        box.appendChild(row);
        continue;
      } else if (type === 'text') {
        // a bare URL: saved on change (blur or Enter), trimmed
        input = document.createElement('input');
        input.type = 'url';
        input.placeholder = opt || '';
        input.value = CONFIG[key] ?? '';
        input.onchange = () => {
          const v = input.value.trim();
          input.value = v;
          saveSetting(key, v);
          onChange(key, v);
        };
      } else if (type === 'folder') {
        // a folder of your own music; files stay on your computer
        const pick = document.createElement('input');
        pick.type = 'file';
        pick.multiple = true;
        pick.webkitdirectory = true;
        pick.style.display = 'none';
        pick.onchange = () => pick.files.length && onChange(key, pick.files);
        input = document.createElement('button');
        input.type = 'button';
        input.textContent = opt;
        input.onclick = (e) => {
          e.preventDefault();
          pick.click();
        };
        row.appendChild(pick);
      } else if (type === 'world') {
        // F-48: the same road now or as 1990 promised it, in the calm-buttons style
        input = document.createElement('div');
        input.className = 'calmbtns worldbtns';
        for (const [v, t] of [['now', 'Now'], ['promised', 'Promised']]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = t;
          b.dataset.world = v;
          b.classList.toggle('on', CONFIG.world === v);
          b.onclick = (e) => {
            e.preventDefault();
            onChange(key, v);
          };
          input.appendChild(b);
        }
      } else if (type === 'check') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!CONFIG[key];
        input.onchange = () => {
          saveSetting(key, input.checked);
          onChange(key, input.checked);
        };
      }
      row.appendChild(input);
      box.appendChild(row);
    }
    $('btnrestart').onclick = () => location.reload();
    $('btnreset').onclick = () => {
      resetSettings();
      location.reload();
    };
  }
}
