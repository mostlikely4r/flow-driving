// Procedurally drawn canvas textures: asphalt (ZOAB), grass, polder fields,
// Dutch signs (speed limit, hectometre posts, matrix signs, ANWB guide signs).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mulberry32 } from './util.js';
import { innerEdge, pavementEdge } from './layout.js';

let maxAniso = 8;
export function setMaxAnisotropy(a) {
  maxAniso = a;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (aniso) t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

/** Asphalt across the full width of both carriageways; u spans [-edge, edge], v repeats every 16 m. */
export function asphaltTexture() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  const rng = mulberry32(11);
  const edge = pavementEdge();
  const latToX = (lat) => ((lat + edge) / (2 * edge)) * W;
  // base
  g.fillStyle = '#3a3b3d';
  g.fillRect(0, 0, W, H);
  // per-pixel ZOAB grain
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = rng();
    let v = 52 + (n - 0.5) * 34;
    if (n > 0.985) v += 40; // light stones
    if (n < 0.02) v -= 25; // pores
    d[i] = v;
    d[i + 1] = v + 1;
    d[i + 2] = v + 3;
  }
  g.putImageData(img, 0, 0);
  // hard shoulders and inner shoulder slightly different tone
  const ie = innerEdge();
  const oe = ie + CONFIG.lanes * CONFIG.laneWidth;
  g.globalAlpha = 0.12;
  g.fillStyle = '#8a8a86';
  for (const sgn of [-1, 1]) {
    const a = latToX(sgn * oe), b = latToX(sgn * edge);
    g.fillRect(Math.min(a, b), 0, Math.abs(b - a), H);
    const c1 = latToX(sgn * 0), c2 = latToX(sgn * ie);
    g.fillRect(Math.min(c1, c2), 0, Math.abs(c2 - c1), H);
  }
  // wheel tracks (darker, polished) in each lane, both carriageways
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < CONFIG.lanes; i++) {
      const centre = ie + CONFIG.laneWidth * (i + 0.5);
      for (const off of [-0.85, 0.85]) {
        const x = latToX(sgn * (centre + off));
        const grd = g.createLinearGradient(x - 22, 0, x + 22, 0);
        grd.addColorStop(0, 'rgba(10,10,12,0)');
        grd.addColorStop(0.5, 'rgba(10,10,12,0.35)');
        grd.addColorStop(1, 'rgba(10,10,12,0)');
        g.globalAlpha = 0.55;
        g.fillStyle = grd;
        g.fillRect(x - 22, 0, 44, H);
      }
    }
  }
  // a few repair seams / patches
  g.globalAlpha = 0.18;
  for (let k = 0; k < 5; k++) {
    g.fillStyle = rng() < 0.5 ? '#202022' : '#55555a';
    const x = rng() * W, y = rng() * H;
    g.fillRect(x, y, 20 + rng() * 120, 3 + rng() * 40);
  }
  g.globalAlpha = 1;
  const t = tex(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

export function grassTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rng = mulberry32(5);
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = rng();
    d[i] = 70 + n * 30;
    d[i + 1] = 105 + n * 45;
    d[i + 2] = 45 + n * 20;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 400; k++) {
    g.fillStyle = `rgba(${40 + rng() * 60},${80 + rng() * 60},${30 + rng() * 20},0.35)`;
    g.fillRect(rng() * S, rng() * S, 2 + rng() * 6, 1 + rng() * 3);
  }
  return tex(c);
}

/** Polder: rectangular plots separated by ditches. Covers 400 m x 400 m. */
export function fieldsTexture() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const rng = mulberry32(77);
  const crops = ['#5f8a3a', '#6a9440', '#7c9d45', '#557f34', '#8aa04d', '#9a8a55', '#6e5c3f', '#4f7a33', '#a3a85a', '#5a8a3e'];
  // long narrow Dutch strip parcels
  let x = 0;
  while (x < S) {
    const w = 40 + rng() * 110;
    let y = 0;
    while (y < S) {
      const h = 150 + rng() * 500;
      g.fillStyle = crops[Math.floor(rng() * crops.length)];
      g.fillRect(x, y, w, h);
      // crop rows
      g.globalAlpha = 0.12;
      g.fillStyle = '#1a2a10';
      for (let r = x + 2; r < x + w; r += 4) g.fillRect(r, y, 1, h);
      g.globalAlpha = 1;
      // ditch across
      g.fillStyle = '#3b4a46';
      g.fillRect(x, y + h - 2, w, 2);
      y += h;
    }
    g.fillStyle = '#3d4f4a';
    g.fillRect(x + w - 3, 0, 3, S); // ditch along
    x += w;
  }
  // noise
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 18;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

export function concreteTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rng = mulberry32(3);
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 165 + (rng() - 0.5) * 30;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v - 4;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.25;
  g.fillStyle = '#6d6a64';
  for (let y = 0; y < S; y += 64) g.fillRect(0, y, S, 2);
  return tex(c);
}

export function noiseWallTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#6f7a6c';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = '#5c665a';
    g.fillRect(x, 0, 3, 256);
    g.fillStyle = '#86917f';
    g.fillRect(x + 3, 0, 2, 256);
  }
  g.fillStyle = '#4b544a';
  g.fillRect(0, 0, 256, 18);
  g.fillRect(0, 238, 256, 18);
  return tex(c);
}

/** Radial glow (light pools, generic) */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false, srgb: false });
}

/** Headlight beam footprint on the road: u across, v along (0 near car, 1 far). */
export function beamTexture() {
  const W = 128, H = 256;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1); // 0 near ... 1 far
    const along = Math.pow(Math.sin(Math.min(1, v * 1.25) * Math.PI * 0.5), 0.7) * Math.pow(1 - v, 1.3);
    const halfW = 0.25 + 0.75 * v;
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1)) * 2 - 1;
      const across = Math.max(0, 1 - Math.pow(Math.abs(u) / halfW, 2));
      const val = along * across * 255 * 1.6;
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.min(255, val);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: false, srgb: false });
}

// ---------------- signs ----------------
const signCache = new Map();
function cached(key, fn) {
  if (!signCache.has(key)) signCache.set(key, fn());
  return signCache.get(key);
}

/** Round Dutch speed-limit sign (RVV A1) with optional time sub-plate text. */
export function speedSignTexture(limit, sub) {
  return cached(`speed${limit}|${sub}`, () => {
    const [c, g] = canvas(256, 384);
    g.clearRect(0, 0, 256, 384);
    // round sign
    g.fillStyle = '#d61f26';
    g.beginPath();
    g.arc(128, 128, 124, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(128, 128, 94, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 104px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(limit), 128, 134);
    if (sub) {
      g.fillStyle = '#ffffff';
      g.fillRect(28, 276, 200, 96);
      g.strokeStyle = '#111';
      g.lineWidth = 6;
      g.strokeRect(31, 279, 194, 90);
      g.fillStyle = '#111';
      g.font = 'bold 56px Arial, sans-serif';
      g.fillText(sub, 128, 326);
    }
    const t = tex(c, { repeat: false });
    return t;
  });
}

/** Green hectometre board, e.g. "47,3" */
export function hectoTexture(text, letter = '') {
  const [c, g] = canvas(128, 192);
  g.fillStyle = '#0f6b45';
  g.fillRect(0, 0, 128, 192);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 116, 180);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const [km, hm] = text.split(',');
  g.font = 'bold 64px Arial, sans-serif';
  g.fillText(km, 64, 64);
  g.font = 'bold 56px Arial, sans-serif';
  g.fillText(',' + hm, 60, 128);
  if (letter) {
    g.font = 'bold 28px Arial';
    g.fillText(letter, 104, 168);
  }
  return tex(c, { repeat: false, aniso: false });
}

/**
 * Lane signal (matrix) sign. content: '' (dark), number (red ring = mandatory),
 * 'x' (red cross: lane closed), 'arrowL' / 'arrowR' (move over), 'end'.
 * flash: the amber lights in the corners (queue ahead), lit in this frame.
 */
export function matrixTexture(content, flash = false) {
  return cached(`matrix|${content}|${flash ? 1 : 0}`, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#0b0c0d';
    g.fillRect(0, 0, 128, 128);
    // dot grid (unlit LEDs)
    g.fillStyle = '#1b1d1f';
    for (let y = 6; y < 128; y += 6) for (let x = 6; x < 128; x += 6) g.fillRect(x, y, 2, 2);
    // corner flashers
    for (const [x, y] of [[11, 11], [117, 11], [11, 117], [117, 117]]) {
      g.fillStyle = flash ? '#ffb020' : '#2a2216';
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (typeof content === 'number') {
      g.strokeStyle = '#ff2a1a';
      g.beginPath();
      g.arc(64, 64, 46, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = 'bold 46px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(content), 64, 67);
    } else if (content === 'x') {
      g.strokeStyle = '#ff2a1a';
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(30, 30);
      g.lineTo(98, 98);
      g.moveTo(98, 30);
      g.lineTo(30, 98);
      g.stroke();
    } else if (content === 'arrowL' || content === 'arrowR') {
      // diagonal arrow pointing down toward the lane to move into
      const sx = content === 'arrowL' ? -1 : 1;
      g.save();
      g.translate(64, 64);
      g.scale(sx, 1);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(-26, -26);
      g.lineTo(24, 24);
      g.moveTo(24, -6);
      g.lineTo(24, 24);
      g.lineTo(-6, 24);
      g.stroke();
      g.restore();
    } else if (content === 'end') {
      g.save();
      g.beginPath();
      g.arc(64, 64, 44, 0, Math.PI * 2);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 5;
      g.stroke();
      g.clip();
      g.lineWidth = 5;
      g.strokeStyle = '#c8cdd2';
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(20 + k * 14, 108);
        g.lineTo(108 + k * 14, 20);
        g.stroke();
      }
      g.restore();
    }
    return tex(c, { repeat: false, aniso: false });
  });
}

/** Blue ANWB guide sign with destinations and a red route shield. */
export function anwbTexture(lines, route, widthM, heightM) {
  return cached(`anwb|${lines.join('|')}|${route}|${widthM}`, () => {
    const pxPerM = 64;
    const W = Math.round(widthM * pxPerM), H = Math.round(heightM * pxPerM);
    const [c, g] = canvas(W, H);
    g.fillStyle = '#0a3d8f';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.strokeRect(8, 8, W - 16, H - 16);
    // route shield
    g.fillStyle = '#d61f26';
    const sw = 120, sh = 64;
    g.fillRect(30, 30, sw, sh);
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.strokeRect(30, 30, sw, sh);
    g.fillStyle = '#fff';
    g.font = 'bold 48px Arial';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(route, 30 + sw / 2, 30 + sh / 2 + 2);
    g.textAlign = 'left';
    g.font = 'bold 58px Arial';
    lines.forEach((ln, i) => g.fillText(ln, 180, 62 + i * 70));
    // down arrows for each lane
    const lanes = CONFIG.lanes;
    for (let i = 0; i < lanes; i++) {
      const x = W * ((i + 0.5) / lanes);
      g.beginPath();
      g.moveTo(x - 20, H - 52);
      g.lineTo(x + 20, H - 52);
      g.lineTo(x, H - 22);
      g.closePath();
      g.fill();
      g.fillRect(x - 5, H - 76, 10, 26);
    }
    return tex(c, { repeat: false });
  });
}

export function plateTexture() {
  return cached('plate', () => {
    const [c, g] = canvas(128, 32);
    g.fillStyle = '#f2c200';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#1b3d9c';
    g.fillRect(0, 0, 14, 32);
    g.fillStyle = '#111';
    g.font = 'bold 22px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('XX-123-X', 70, 17);
    return tex(c, { repeat: false, aniso: false });
  });
}
