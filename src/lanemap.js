// Overhead lane map (U): the road straightened out, seen from above, so you can
// read a situation at a glance. Optionally with a time-space diagram below it:
// every vehicle in your lane leaves a speed-coloured trace over the last ~80 s,
// so stop-and-go waves show up as dark streaks travelling back up the road.
//
//   U       off -> map -> map + time-space -> off
//   , / .   zoom out / in (how many metres of road the map shows)
import { CONFIG } from './config.js';
import { KMH } from './util.js';
import { laneLat as laneLatC } from './layout.js';
import { gantryS, gantryIndexAt } from './msi.js';

export const LANEMAP_SPANS = [120, 250, 500, 1000, 2000];
const AHEAD = 0.62; // share of the view in front of you
const SAMPLE_DT = 0.5; // s per row in the time-space diagram
const ROWS = 160; // 80 s of history

/** Speed colour: dark red (stopped) -> red -> amber -> green (at the limit) -> blue (well over). */
export function speedRGB(v, limit) {
  const x = v / Math.max(1, limit);
  const stops = [
    [0.0, [110, 10, 20]],
    [0.3, [230, 40, 30]],
    [0.65, [245, 175, 40]],
    [0.92, [70, 200, 90]],
    [1.12, [60, 170, 255]],
    [1.4, [170, 110, 255]],
  ];
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, c0] = stops[i - 1], [x1, c1] = stops[i];
      const t = (x - x0) / (x1 - x0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t));
    }
  }
  return stops[stops.length - 1][1];
}

export class LaneMap {
  constructor() {
    this.mode = CONFIG.laneMap | 0; // 0 off, 1 map, 2 map + time-space
    this.span = CONFIG.laneMapSpan;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'lanemap';
    this.canvas.style.cssText = 'position:fixed;left:16px;right:16px;bottom:118px;pointer-events:none;z-index:4;border-radius:6px;display:none';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.rows = []; // newest first: {lane, n, s: Float32Array, v, len, brake, isPlayer}
    this.sampleT = 0;
  }

  setMode(m) {
    this.mode = m;
    this.canvas.style.display = m ? 'block' : 'none';
  }

  zoom(dir) {
    const i = LANEMAP_SPANS.indexOf(this.span);
    const j = Math.max(0, Math.min(LANEMAP_SPANS.length - 1, (i < 0 ? 2 : i) + dir));
    this.span = LANEMAP_SPANS[j];
    return this.span;
  }

  /** Record one row of the time-space diagram: everyone's lane, position and speed, by id. */
  sample(traffic, player) {
    const row = new Map();
    for (const veh of traffic.vehicles) {
      // during a lane change, count the car in the lane it's mostly in
      const lane = veh.state === 'move' && veh.lcT > 0.5 ? veh.targetLane : veh.lane;
      row.set(veh.id, { lane, s: traffic.dir * veh.u, v: veh.v });
    }
    row.set(-1, { lane: player.lane, s: player.s, v: player.v });
    this.rows.unshift(row);
    if (this.rows.length > ROWS) this.rows.length = ROWS;
    this.diagDirty = true;
  }

  update(dt, traffic, player, limitKmh, paused) {
    if (!paused) {
      this.sampleT -= dt;
      if (this.sampleT <= 0) {
        this.sampleT += SAMPLE_DT;
        this.sample(traffic, player);
      }
    }
    if (!this.mode) return;
    this.draw(traffic, player, limitKmh * KMH);
  }

  draw(traffic, player, limit) {
    const N = CONFIG.lanes;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(200, window.innerWidth - 32);
    const laneH = 20;
    const top = 18; // ruler / title
    const ramps = traffic.ramps || [];
    const stripH = ramps.length ? 14 : 0; // the acceleration strip, right of lane 0
    const mapH = top + N * laneH + stripH + 6;
    const diagH = this.mode === 2 ? ROWS + 20 : 0;
    const H = mapH + diagH;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      this.canvas.style.height = H + 'px';
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(8, 12, 16, 0.78)';
    c.fillRect(0, 0, W, H);

    const pad = 8;
    const iw = W - 2 * pad;
    const s0 = player.s - this.span * (1 - AHEAD);
    const pxm = iw / this.span;
    const X = (s) => pad + (s - s0) * pxm;

    // ruler + title
    c.font = '600 10px system-ui, sans-serif';
    c.fillStyle = 'rgba(220, 230, 240, 0.75)';
    c.textBaseline = 'middle';
    const step = this.span <= 150 ? 25 : this.span <= 300 ? 50 : this.span <= 600 ? 100 : this.span <= 1200 ? 200 : 500;
    for (let m = Math.ceil((s0 - player.s) / step) * step; m <= this.span * AHEAD; m += step) {
      const x = X(player.s + m);
      c.fillRect(x, top - 5, 1, 4);
      if (m !== 0 && x < W - 190) c.fillText(`${m > 0 ? '+' : ''}${m}`, x + 2, top - 10);
    }
    c.textAlign = 'right';
    c.fillText(`overhead · ${this.span} m · , . zoom · U`, W - pad, top - 10);
    c.textAlign = 'left';

    // lanes: leftmost lane on top, traffic flows left to right
    const laneY = (i) => top + (N - 1 - i) * laneH;
    c.fillStyle = 'rgba(70, 76, 84, 0.9)';
    c.fillRect(pad, top, iw, N * laneH);
    c.fillStyle = 'rgba(235, 240, 245, 0.55)';
    const dash = Math.max(2, 3 * pxm), gap = Math.max(4, 9 * pxm);
    for (let i = 1; i < N; i++) {
      const y = top + i * laneH;
      const off = ((s0 % 12) + 12) % 12;
      for (let x = pad - off * pxm; x < pad + iw; x += dash + gap) c.fillRect(Math.max(pad, x), y - 0.5, dash, 1);
    }
    c.fillRect(pad, top, iw, 1.5);
    c.fillRect(pad, top + N * laneH - 1.5, iw, 1.5);

    // lane closures: hatched block with the arrow-board truck at its start
    for (const cl of traffic.closures || []) {
      if (cl.lane >= N) continue;
      const xa = Math.max(pad, X(cl.s0)), xb = Math.min(pad + iw, X(cl.s1));
      if (xb <= pad || xa >= pad + iw) continue;
      const y = laneY(cl.lane);
      c.fillStyle = 'rgba(255, 120, 20, 0.28)';
      c.fillRect(xa, y + 1, xb - xa, laneH - 2);
      c.strokeStyle = 'rgba(255, 140, 40, 0.8)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = xa; x < xb; x += 8) {
        c.moveTo(x, y + laneH - 1);
        c.lineTo(Math.min(xb, x + 6), y + 1);
      }
      c.stroke();
      c.fillStyle = '#f2c200';
      c.fillRect(X(cl.s0), y + 4, Math.max(3, 6.2 * pxm), laneH - 8);
    }
    // matrix gantries: a line across the road with each lane's face
    const msi = traffic.msi;
    if (msi) {
      const flashOn = performance.now() % 1000 < 500;
      c.textAlign = 'center';
      for (let gi = gantryIndexAt(s0) + 1; gantryS(gi) < s0 + this.span; gi++) {
        const x = X(gantryS(gi));
        c.fillStyle = 'rgba(200, 210, 220, 0.35)';
        c.fillRect(x - 0.5, top, 1, N * laneH);
        for (let l = 0; l < N; l++) {
          const f = msi.face(gi, l);
          if (!f || f.face === '') continue;
          const y = laneY(l) + laneH / 2;
          c.fillStyle = 'rgba(0, 0, 0, 0.85)';
          c.fillRect(x - 8, y - 7, 16, 14);
          if (f.flash && flashOn) {
            c.fillStyle = '#ffb020';
            c.fillRect(x - 8, y - 7, 3, 3);
            c.fillRect(x + 5, y - 7, 3, 3);
          }
          c.font = '700 10px system-ui, sans-serif';
          if (typeof f.face === 'number') {
            c.fillStyle = '#ff6a5a';
            c.fillText(String(f.face), x, y + 1);
          } else if (f.face === 'x') {
            c.strokeStyle = '#ff2a1a';
            c.lineWidth = 2.5;
            c.beginPath();
            c.moveTo(x - 5, y - 5);
            c.lineTo(x + 5, y + 5);
            c.moveTo(x + 5, y - 5);
            c.lineTo(x - 5, y + 5);
            c.stroke();
          } else if (f.face === 'end') {
            c.fillStyle = '#c8cdd2';
            c.fillText('/', x, y + 1);
          } else {
            // move over: on the map, right (lower lane) is down
            c.fillStyle = '#fff';
            c.fillText(f.face === 'arrowR' ? '↘' : '↗', x, y + 1);
          }
        }
      }
      c.textAlign = 'left';
    }

    // on-ramps: the ramp road (faint: the cars are not on the strip yet), the
    // strip beside lane 0 and its run-out, with the hatched gore after it
    for (const r of ramps) {
      const xa = Math.max(pad, X(r.s0)), xb = Math.min(pad + iw, X(r.s1));
      const y = top + N * laneH + 2;
      if (r.sTop != null && r.sTop < r.s0) {
        const xr = Math.max(pad, X(r.sTop));
        if (xa > xr) {
          c.fillStyle = 'rgba(70, 76, 84, 0.55)';
          c.fillRect(xr, y + 3, xa - xr, stripH - 9);
          c.fillStyle = 'rgba(235, 240, 245, 0.25)';
          c.fillRect(xr, y + 2.5, xa - xr, 1);
        }
      }
      if (xb > pad) {
        c.fillStyle = 'rgba(70, 76, 84, 0.9)';
        c.fillRect(xa, y, xb - xa, stripH - 4);
        c.fillStyle = 'rgba(235, 240, 245, 0.45)';
        c.fillRect(xa, y - 0.5, xb - xa, 1);
      }
      // the run-out (F-20 slice 4): past the paint a car with no gap keeps
      // rolling along the hard shoulder, so it reads lighter than the strip
      const xrun = Math.min(pad + iw, X(r.sEnd));
      if (xrun > xb) {
        c.fillStyle = 'rgba(70, 76, 84, 0.5)';
        c.fillRect(xb, y, xrun - xb, stripH - 4);
      }
      // the gore area (verdrijvingsvlak) at the end of the strip
      const xe = Math.min(pad + iw, xb + Math.max(6, 25 * pxm));
      c.strokeStyle = 'rgba(235, 240, 245, 0.5)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = xb; x < xe; x += 6) {
        c.moveTo(x, y + stripH - 5);
        c.lineTo(Math.min(xe, x + 4), y);
      }
      c.stroke();
    }

    // vehicles (lateral position is continuous, so drift and lane changes show)
    const yOfLat = (lat) => {
      const l0 = laneY(N - 1) + laneH / 2; // centre of the leftmost lane
      const i0 = laneLatC(N - 1);
      const y = l0 + ((lat - i0) / CONFIG.laneWidth) * laneH;
      // out on the hard shoulder: draw it in the strip band
      const stripY = top + N * laneH + stripH / 2 + 1;
      return stripH ? Math.min(y, stripY) : y;
    };
    const blink = performance.now() % 720 < 380;
    const drawVeh = (s, lat, len, wid, v, brake, ind, isPlayer, tag) => {
      const x1 = X(s + len / 2), x0 = X(s - len / 2);
      if (x1 < pad || x0 > pad + iw) return;
      const y = yOfLat(lat);
      const h = Math.max(4, (wid / CONFIG.laneWidth) * laneH);
      const w = Math.max(2, x1 - x0);
      const [r, g, b] = speedRGB(v, limit);
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.fillRect(x0, y - h / 2, w, h);
      if (isPlayer) {
        c.strokeStyle = '#fff';
        c.lineWidth = 2;
        c.strokeRect(x0 - 1, y - h / 2 - 1, w + 2, h + 2);
      }
      if (brake) {
        c.fillStyle = '#ff2a1a';
        c.fillRect(x0 - 2, y - h / 2, 2, h);
      }
      if (ind && blink) {
        c.fillStyle = '#ffa020';
        // -1 = left = up on the map
        c.fillRect(x0 + w * 0.6, ind < 0 ? y - h / 2 - 3 : y + h / 2 + 1, Math.max(2, w * 0.4), 2);
      }
      if (tag && w > 14) {
        c.fillStyle = 'rgba(0,0,0,0.75)';
        c.font = '700 9px system-ui, sans-serif';
        c.fillText(tag, x0 + 2, y + 0.5);
      }
    };
    const TAG = { leasebak: 'L', patser: 'P', pensioner: 'O', sok: 'S', family: 'F', whitevan: 'W', ev: 'E' };
    for (const veh of traffic.vehicles) {
      const tag = veh.drives ? TAG[veh.drives] : veh.type === 'truck' ? 'T' : veh.type === 'van' ? 'v' : '';
      drawVeh(traffic.dir * veh.u, veh.latLocal, veh.len, veh.width || 1.8, veh.v, veh.brake, veh.indicator, false, tag);
    }
    const pBrake = player.brake > 0.05 || (player.acc < -1 && !player.cc.on);
    drawVeh(player.s, player.lat, player.len, player.width, player.v, pBrake, player.ind, true, 'YOU');

    if (this.mode === 2) this.drawDiagram(c, W, mapH, X, pad, iw, player, limit, dpr);
  }

  /**
   * Classic time-space diagram for your lane: time across (now on the right),
   * road position up (ahead is up). Each car is a line whose slope is its
   * speed; a stopped car is flat. A stop-and-go wave is a band of flat lines
   * that creeps DOWN the panel (upstream) as time goes on.
   */
  drawDiagram(c, W, y0, X, pad, iw, player, limit, dpr) {
    const lane = player.lane;
    const H = ROWS;
    const spanS = Math.max(600, this.span * 1.5); // metres shown vertically
    const sTop = player.s + spanS * 0.45, sBot = player.s - spanS * 0.55;
    c.fillStyle = 'rgba(220, 230, 240, 0.75)';
    c.font = '600 10px system-ui, sans-serif';
    c.fillText(`time-space · your lane (${lane}) · ${(ROWS * SAMPLE_DT) | 0} s → now · road ${Math.round(spanS)} m (ahead up) · flat line = stopped · waves creep down`, pad, y0 + 8);
    const top = y0 + 16;
    const now = performance.now();
    if (!this.diag) this.diag = document.createElement('canvas');
    const dc = this.diag;
    const w = Math.round(iw * dpr), h = Math.round(H * dpr);
    if (dc.width !== w || dc.height !== h) {
      dc.width = w;
      dc.height = h;
      this.diagAt = 0;
    }
    if (now - (this.diagAt || 0) > 120) {
      this.diagAt = now;
      const g = dc.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = 'rgb(30, 34, 40)';
      g.fillRect(0, 0, iw, H);
      // 10 s gridlines
      g.fillStyle = 'rgba(255,255,255,0.07)';
      const pxs = iw / (ROWS * SAMPLE_DT);
      for (let t = 10; t < ROWS * SAMPLE_DT; t += 10) g.fillRect(iw - t * pxs, 0, 1, H);
      const xOf = (r) => iw - r * SAMPLE_DT * pxs;
      const yOf = (sv) => ((sTop - sv) / spanS) * H;
      const buckets = new Map();
      const add = (key, rgb, x0, y0, x1, y1) => {
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { rgb, pts: [] }));
        b.pts.push(x0, y0, x1, y1);
      };
      for (let r = 0; r + 1 < this.rows.length; r++) {
        const cur = this.rows[r], prev = this.rows[r + 1];
        const xa = xOf(r), xb = xOf(r + 1);
        for (const [id, a] of cur) {
          const b = prev.get(id);
          if (!b || (a.lane !== lane && b.lane !== lane)) continue;
          if ((a.s > sTop && b.s > sTop) || (a.s < sBot && b.s < sBot)) continue;
          if (id === -1) add('you', null, xb, yOf(b.s), xa, yOf(a.s));
          else {
            const q = Math.round((((a.v + b.v) / 2) / limit) * 20);
            add(q, speedRGB((q / 20) * limit, limit), xb, yOf(b.s), xa, yOf(a.s));
          }
        }
      }
      const stroke = (b, style, lw) => {
        g.strokeStyle = style;
        g.lineWidth = lw;
        g.beginPath();
        for (let k = 0; k < b.pts.length; k += 4) {
          g.moveTo(b.pts[k], b.pts[k + 1]);
          g.lineTo(b.pts[k + 2], b.pts[k + 3]);
        }
        g.stroke();
      };
      g.lineCap = 'round';
      for (const [key, b] of buckets) if (key !== 'you') stroke(b, `rgb(${b.rgb[0]},${b.rgb[1]},${b.rgb[2]})`, 1.6);
      if (buckets.has('you')) stroke(buckets.get('you'), '#fff', 2.2);
    }
    c.drawImage(dc, pad, top, iw, H);
    c.fillStyle = 'rgba(220, 230, 240, 0.6)';
    c.textAlign = 'right';
    c.fillText('now', W - pad - 2, top + H - 6);
    c.fillText(`+${Math.round(spanS * 0.45)} m`, W - pad - 30, top + 8);
    c.textAlign = 'left';
  }
}
