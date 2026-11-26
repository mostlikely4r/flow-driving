// Frame-time profile (F-54): where does the frame go? Loads the built game in
// headless Edge with vsync off, drives on cruise in the cockpit view and times
// the traffic sim and every renderer.render (with gl.finish, so GPU time lands
// on the pass that caused it) per setting. Draw calls per frame are the number
// to watch: in 2026-11 each vehicle cost ~13 of them.
// Usage: npm run build && npm run perf [-- <label filter>]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { browserPath } from './lib/browser.js';
const repo = process.cwd();

const CASES = [
  ['base d10 cockpit', {}],
  ['dense d25 cockpit', { trafficDensity: 25, oncomingDensity: 20 }],
  ['dense promised', { trafficDensity: 25, oncomingDensity: 20, world: 'promised' }],
  ['dense no shadows', { trafficDensity: 25, oncomingDensity: 20, shadows: false }],
  ['dense no bloom', { trafficDensity: 25, oncomingDensity: 20, bloom: false }],
  ['dense mirrorRes .5', { trafficDensity: 25, oncomingDensity: 20, mirrorRes: 0.5 }],
  ['dense px 1.0', { trafficDensity: 25, oncomingDensity: 20, pixelRatio: 1.0 }],
  ['empty d2', { trafficDensity: 2, oncomingDensity: 2 }],
];
const only = process.argv[2];

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4797', '--strictPort'], { cwd: repo });
await new Promise((r) => setTimeout(r, 2500));
const browser = await puppeteer.launch({
  executablePath: browserPath(),
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1600,900', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  defaultViewport: { width: 1600, height: 900 },
});

for (const [label, cfg] of CASES) {
  if (only && !label.includes(only)) continue;
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((cfg) => {
    localStorage.setItem('snelweg.settings.v1', JSON.stringify({ timeOfDay: 'day', ...cfg }));
  }, cfg);
  await page.goto('http://localhost:4797/', { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 2000));
  await page.mouse.click(800, 450);
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.press('KeyC');
  await new Promise((r) => setTimeout(r, 6000)); // let streaming and traffic settle
  const res = await page.evaluate(async () => {
    const g = window.__game;
    const R = g.renderer;
    const gl = R.getContext();
    const acc = { sim: 0, render: 0, renderN: 0 };
    const wrap = (obj, name, key) => {
      const f = obj[name].bind(obj);
      obj[name] = (...a) => {
        const t = performance.now();
        const out = f(...a);
        if (key === 'render') { gl.finish(); acc.renderN++; acc.calls = (acc.calls||0) + R.info.render.calls; acc.tris = (acc.tris||0) + R.info.render.triangles; }
        acc[key] += performance.now() - t;
        return out;
      };
      return () => { obj[name] = f; };
    };
    const un = [wrap(g.traffic, 'step', 'sim'), wrap(g.oncoming, 'step', 'sim'), wrap(R, 'render', 'render')];
    const frames = [];
    let calls = 0, tris = 0, n = 0;
    await new Promise((done) => {
      let last = performance.now();
      const t0 = last;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        calls += R.info.render.calls; tris += R.info.render.triangles; n++;
        if (now - t0 < 5000) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
    un.forEach((f) => f());
    frames.sort((a, b) => a - b);
    const F = frames.length;
    return {
      fps: +(F / 5).toFixed(1),
      p50: +frames[F >> 1].toFixed(1),
      p95: +frames[Math.floor(F * 0.95)].toFixed(1),
      simMs: +(acc.sim / F).toFixed(2),
      renderMs: +(acc.render / F).toFixed(2),
      rendersPerFrame: +(acc.renderN / F).toFixed(1),
      lastCalls: R.info.render.calls,
      lastTris: R.info.render.triangles,
      veh: g.traffic.vehicles.length + g.oncoming.vehicles.length,
      callsPerFrame: Math.round(acc.calls / F), trisPerFrame: Math.round(acc.tris / F), meshPerVeh: (() => { let m = 0, k = 0; for (const tr of [g.traffic, g.oncoming]) for (const v of tr.vehicles) if (v.vis) { k++; v.vis.root.traverse((o) => { if (o.isMesh && o.visible) m++; }); } return +(m / k).toFixed(1); })(),
      scene: (() => { let m = 0; g.scene.traverse((o) => { if (o.isMesh || o.isPoints) m++; }); return m; })(),
    };
  });
  console.log(label.padEnd(22), JSON.stringify(res));
  await page.close();
}
await browser.close();
server.kill();
process.exit(0);
