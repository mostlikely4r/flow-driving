// Headless smoke test: loads the built game in Edge, starts driving, reports
// console errors and saves screenshots. Usage: node tools/shot.js [outdir] [actions]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const out = process.argv[2] || 'shots';
const mode = process.argv[3] || 'day';
const server = spawn('npx', ['vite', 'preview', '--port', '4799', '--strictPort'], { shell: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.evaluateOnNewDocument((mode) => { localStorage.setItem('snelweg.settings.v1', JSON.stringify({ timeOfDay: mode })); }, mode);
await page.goto('http://localhost:4799/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${out}/0-start.png` });
await page.mouse.click(640, 360);
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${out}/1-cockpit.png` });
await page.keyboard.press('KeyC');
await page.keyboard.press('KeyV');
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${out}/2-bonnet.png` });
await page.keyboard.press('KeyV');
await page.keyboard.down('KeyA'); await new Promise((r) => setTimeout(r, 400)); await page.keyboard.up('KeyA');
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${out}/3-chase.png` });
const info = await page.evaluate(() => { const g = window.__game; return { s: g.player.s, v: g.player.v * 3.6, lat: g.player.lat, n: g.traffic.vehicles.length, on: g.oncoming.vehicles.length, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; });
console.log(JSON.stringify(info));
const fps = await page.$eval('#fps', (e) => e.textContent);
console.log('fps:', fps);
console.log(errors.slice(0, 20).join('\n') || 'no console errors');
await browser.close();
server.kill();
process.exit(0);
