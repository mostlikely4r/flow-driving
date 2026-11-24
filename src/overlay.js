// Speed / intent overlay drawn as DOM labels over the 3D view and inside the
// mirrors.
//   ar-rel : AR head-up display, speed relative to you (+ faster, − slower)
//   ar-abs : AR head-up display, absolute speed
//   dev    : AI internals (desired speed, headway, flags, lane-change wishes)
// Colour: warm = the gap to you is closing, cool = it is opening.
import * as THREE from 'three';
import { clamp } from './util.js';
import { gapBetween, leaderIn } from './traffic.js';
import { junction } from './junctions.js';

export const OVERLAY_MODES = ['off', 'ar-rel', 'ar-abs', 'dev'];
export const OVERLAY_NAMES = {
  off: 'Overlay off',
  'ar-rel': 'AR overlay: relative speed',
  'ar-abs': 'AR overlay: absolute speed',
  dev: 'Dev overlay: AI intent',
};

const KMH = 3.6;
const HEIGHT = { car: 1.75, van: 2.6, truck: 4.1, caravan: 2.3 };
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Overlay {
  constructor(root) {
    this.root = root;
    this.pool = [];
    this.used = 0;
    this.mode = 'off';
  }

  setMode(m) {
    this.mode = m;
    this.root.classList.toggle('dev', m === 'dev');
    if (m === 'off') this.hideFrom(0);
  }

  label() {
    let el = this.pool[this.used];
    if (!el) {
      el = document.createElement('div');
      el.className = 'ovl';
      el._txt = '';
      el._cls = '';
      this.root.appendChild(el);
      this.pool.push(el);
    }
    this.used++;
    el.style.display = '';
    return el;
  }

  hideFrom(i) {
    for (; i < this.pool.length; i++) if (this.pool[i].style.display !== 'none') this.pool[i].style.display = 'none';
  }

  /** Pick the vehicles worth labelling: per lane the nearest few ahead and behind. */
  pick(traffic, sPlayer, dev) {
    const out = [];
    const ahead = dev ? 6 : 3, behind = dev ? 4 : 2;
    const rangeA = dev ? 400 : 260, rangeB = dev ? 250 : 160;
    const lists = traffic.strip && traffic.strip.length ? [...traffic.lanes, traffic.strip] : traffic.lanes;
    for (const list of lists) {
      let i = 0;
      while (i < list.length && traffic.dir * list[i].u < sPlayer) i++;
      for (let k = i, n = 0; k < list.length && n < ahead; k++) {
        const veh = list[k];
        if (veh.isPlayer || !veh.vis) continue;
        const ds = traffic.dir * veh.u - sPlayer;
        if (ds > rangeA) break;
        out.push(veh);
        n++;
      }
      for (let k = i - 1, n = 0; k >= 0 && n < behind; k--) {
        const veh = list[k];
        if (veh.isPlayer || !veh.vis) continue;
        const ds = sPlayer - traffic.dir * veh.u;
        if (ds > rangeB) break;
        out.push(veh);
        n++;
      }
    }
    // a vehicle changing lanes sits in two lane lists
    return [...new Set(out)];
  }

  /**
   * views: [{ cam, w, h }] for the main view, plus mirror views
   * { cam, glass, glassCam, w, h, small: true } (glass = flipped plane mesh).
   */
  update(traffic, player, views) {
    this.used = 0;
    if (this.mode === 'off') return;
    const dev = this.mode === 'dev';
    const vehicles = this.pick(traffic, player.s, dev);
    for (const view of views) {
      let P00, P10, P01;
      if (view.glass) {
        // screen-space parallelogram of the mirror glass
        const g = view.glass;
        const pw = g.geometry.parameters.width / 2, ph = g.geometry.parameters.height / 2;
        P00 = this.toScreen(g.localToWorld(_a.set(-pw, -ph, 0)), view.glassCam, view);
        P10 = this.toScreen(g.localToWorld(_b.set(pw, -ph, 0)), view.glassCam, view);
        P01 = this.toScreen(g.localToWorld(_c.set(-pw, ph, 0)), view.glassCam, view);
        if (!P00 || !P10 || !P01) continue;
      }
      const cands = [];
      for (const veh of vehicles) {
        const pos = veh.vis.front.position;
        _p.set(pos.x, HEIGHT[veh.type] ?? 1.8, pos.z).project(view.cam);
        if (_p.z > 1 || _p.z < -1 || Math.abs(_p.x) > 1 || Math.abs(_p.y) > 1) continue;
        let x, y;
        if (view.glass) {
          // the glass shows the mirror texture flipped horizontally
          const u = 1 - (_p.x + 1) / 2, v = (_p.y + 1) / 2;
          x = P00.x + u * (P10.x - P00.x) + v * (P01.x - P00.x);
          y = P00.y + u * (P10.y - P00.y) + v * (P01.y - P00.y);
        } else {
          x = ((_p.x + 1) / 2) * view.w;
          y = ((1 - _p.y) / 2) * view.h;
        }
        cands.push({ veh, x, y, dist: Math.abs(traffic.dir * veh.u - player.s) });
      }
      // Declutter: nearest first; drop a label that would overlap one already placed.
      cands.sort((a, b) => a.dist - b.dist);
      const boxes = [];
      for (const c of cands) {
        const full = dev && !view.small && boxes.length < 5;
        const txt = this.text(c.veh, traffic, player, dev, full);
        const lines = txt.split('\n');
        const cw = view.small ? 5 : dev ? 6.7 : 6.5;
        const w = Math.max(...lines.map((l) => l.length)) * cw + 12;
        const h = lines.length * (view.small ? 10 : dev ? 14.5 : 14) + 3;
        const box = { x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y - h, y1: c.y };
        if (boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
        boxes.push(box);
        this.draw(c.veh, traffic, player, c.x, c.y, view.small, dev, txt);
      }
    }
    this.hideFrom(this.used);
  }

  text(veh, traffic, player, dev, full) {
    if (dev) return this.devText(veh, full, traffic);
    if (this.mode === 'ar-abs') return String(Math.round(veh.v * KMH));
    const r = Math.round((veh.v - player.v) * KMH);
    return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '±0';
  }

  toScreen(world, cam, view) {
    world.project(cam);
    if (world.z > 1 || world.z < -1) return null;
    return { x: ((world.x + 1) / 2) * view.w, y: ((1 - world.y) / 2) * view.h };
  }

  draw(veh, traffic, player, x, y, small, dev, txt) {
    const ds = traffic.dir * veh.u - player.s;
    const rel = (veh.v - player.v) * KMH;
    // closing: a slower car ahead, or a faster car behind
    const closing = ds > 0 ? -rel : rel;
    let cls = 'ovl';
    if (closing > 15) cls += ' c3';
    else if (closing > 6) cls += ' c2';
    else if (closing > 2) cls += ' c1';
    else if (closing < -2) cls += ' open';
    else cls += ' same';
    if (small) cls += ' small';

    const el = this.label();
    if (el._txt !== txt) {
      el.textContent = txt;
      el._txt = txt;
    }
    if (el._cls !== cls) {
      el.className = cls;
      el._cls = cls;
    }
    const dist = Math.abs(ds);
    el.style.opacity = dev ? 1 : clamp(1.15 - dist / 260, 0.35, 1).toFixed(2);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  /** Dev overlay for a merging car: "merging · 140 m left · −18 km/h". */
  mergeText(veh, traffic, full) {
    const s = traffic.dir * veh.u;
    let dStrip = Infinity;
    let dEnd = Infinity;
    for (const r of traffic.ramps || []) {
      if (r.s1 >= s) dStrip = Math.min(dStrip, r.s1 - s);
      if (r.sEnd >= s) dEnd = Math.min(dEnd, r.sEnd - s);
    }
    const nl = leaderIn(traffic.lanes[0], veh);
    const dv = nl && gapBetween(nl, veh) < 150 ? Math.round((veh.v - nl.v) * KMH) : null;
    // past the paint it is the run-out: still merging, now on the vluchtstrook
    const left = dStrip < Infinity
      ? `${Math.round(dStrip)} m left`
      : dEnd < Infinity ? `run-out · ${Math.round(dEnd)} m left` : 'on the strip';
    const diff = dv == null ? 'no car ahead' : `${dv > 0 ? '+' : dv < 0 ? '−' : '±'}${Math.abs(dv)} km/h`;
    if (!full) return `merge ${Math.round(veh.v * KMH)} ${dv == null ? '' : diff}`.trim();
    const st = veh.state === 'move' ? `moving left ${Math.round(veh.lcT * 100)}%` : `signalling left ${veh.signalT.toFixed(1)}s`;
    return `#${veh.id} ${veh.drives || veh.type} merging · ${left} · ${diff}\n${Math.round(veh.v * KMH)}/${Math.round(veh.v0 * KMH)} km/h · T ${veh.T.toFixed(1)}s\n${st} · strip lane`;
  }

  /** Dev overlay for a car leaving at an exit: "exit 14 · 820 m". */
  exitText(veh, traffic, full) {
    const x = veh.exit;
    const s = traffic.dir * veh.u;
    const d = Math.round(x.sStart - s);
    const where = d > 0 ? `${d} m` : s > x.sGore ? 'on the exit road' : 'on the exit lane';
    if (!full) return `exit ${junction(x.b).number} ${where}`;
    const st = veh.state === 'move' ? `moving right ${Math.round(veh.lcT * 100)}%` : veh.state === 'signal' ? `signalling right ${veh.signalT.toFixed(1)}s` : 'in lane';
    return `#${veh.id} ${veh.drives || veh.type} exit ${junction(x.b).number} · ${where}\n${Math.round(veh.v * KMH)}/${Math.round(veh.v0 * KMH)} km/h · T ${veh.T.toFixed(1)}s\n${st} · lane ${veh.lane}`;
  }

  devText(veh, full, traffic) {
    // a car on an acceleration strip (F-20), or one on the exit lane (F-21):
    // what it is doing, and how far it has left
    if (veh.lane === -1) return veh.exit ? this.exitText(veh, traffic, full) : this.mergeText(veh, traffic, full);
    const f = [];
    if (veh.limitOffset > 10) f.push('SPD');
    else if (veh.limitOffset < -3) f.push('SLOW');
    if (veh.hogger) f.push('HOG');
    if (veh.coop) f.push('coop');
    if (!veh.strict) f.push('undertakes');
    if (veh.pressureT > 0) f.push('PRESSED');
    if (veh.drafting) f.push('DRAFT');
    const who = veh.persona ? (veh.drives ? veh.persona : `${veh.persona}-look, drives normal`) : veh.variant;
    const head = `#${veh.id}${veh.tag ? ' "' + veh.tag + '"' : ''} ${who}${f.length ? ' · ' + f.join(' ') : ''}${veh.exit ? ' · exit' : ''}`;
    const stShort = veh.state === 'signal' ? ` sig${veh.targetLane > veh.lane ? 'L' : 'R'}` : veh.state === 'move' ? ` mov${veh.targetLane > veh.lane ? 'L' : 'R'}` : veh.intent >= 0 ? ` want${veh.intent > veh.lane ? 'L' : 'R'}` : '';
    if (!full) return `${veh.tag ? veh.tag : veh.drives || '#' + veh.id} ${Math.round(veh.v * KMH)}/${Math.round(veh.v0 * KMH)}${f.length ? ' ' + f[0] : ''}${stShort}${veh.exit ? ' exit' : ''}`;
    const sp = `${Math.round(veh.v * KMH)}/${Math.round(veh.v0 * KMH)} km/h · T ${veh.T.toFixed(1)}s · p ${veh.p.toFixed(2)} · ant ${(veh.antic ?? 0).toFixed(2)}`;
    let st;
    const dir = (t) => (t > veh.lane ? 'L' : 'R');
    if (veh.state === 'signal') st = `signal ${dir(veh.targetLane)} ${veh.signalT.toFixed(1)}/${veh.tSignal.toFixed(1)}s`;
    else if (veh.state === 'move') st = `moving ${dir(veh.targetLane)} ${Math.round(veh.lcT * 100)}%`;
    else if (veh.intent >= 0 && veh.intentSince != null) st = `wants ${dir(veh.intent)} ${(traffic.time - veh.intentSince).toFixed(1)}s · drift ${Math.abs(veh.drift).toFixed(2)}m`;
    else st = veh.cooldown > 0 ? `cooldown ${veh.cooldown.toFixed(1)}s` : 'cruising';
    if (veh.lineUp) st += ` · lining up ${veh.lineUp.kind} ${(traffic.time - veh.lineUp.t0).toFixed(1)}s`;
    if (veh.noSignalT && (veh.noSignalT.L > 0 || veh.noSignalT.R > 0)) {
      const side = veh.noSignalT.L >= veh.noSignalT.R ? 'L' : 'R';
      st += ` · no signal ${side} ${veh.noSignalT[side].toFixed(1)}s`;
    }
    if (veh.passing) st += ' · passing';
    if (veh.exit && veh.lane >= 0) st += ` · ${this.exitText(veh, traffic, false)}`;
    if (veh.returnT > 0) st += ' · going back right';
    if (veh.anticOn) st += ` · easing for ${veh.anticOn.isPlayer ? 'YOU' : veh.anticOn.tag || '#' + veh.anticOn.id}`;
    const ev = (e, name) => (e ? `${name} ${e.margin >= 0 ? '+' : ''}${e.margin.toFixed(2)}${e.safe ? '' : ' unsafe'}` : `${name} –`);
    const wish = `${ev(veh.dbgL, 'L')} | ${ev(veh.dbgR, 'R')}`;
    return `${head}\n${sp}\n${st}\n${wish}`;
  }
}
