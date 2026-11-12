// Night glare check: places cars close behind (mirror), alongside and oncoming,
// then screenshots cockpit and chase views. Usage: node tools/glare.js <outdir>
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const out = process.argv[2] || 'shots';
const server = spawn('npx', ['vite', 'preview', '--port', '4799', '--strictPort'], { shell: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(() => { localStorage.setItem('snelweg.settings.v1', JSON.stringify({ timeOfDay: 'night', trafficDensity: 2, oncomingDensity: 0 })); });
await page.goto('http://localhost:4799/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2000));
await page.mouse.click(640, 360);
await new Promise((r) => setTimeout(r, 1500));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const place = () => page.evaluate(() => {
  const g = window.__game, p = g.player, v = p.v;
  // insert far away, then move into position (insertAt refuses tight gaps)
  const put = (tr, ds, lane, variant, speed) => {
    const veh = tr.insertAt(tr.dir < 0 ? -(p.s + 900) : p.s - 900, lane, 'car', variant, { v: speed });
    if (!veh) return false;
    veh.u = tr.dir * (p.s + ds);
    veh.v = speed;
    for (const l of tr.lanes) l.sort((a, b) => a.u - b.u);
    return true;
  };
  return [
    put(g.traffic, -9, p.lane, 'suv', v),
    put(g.traffic, -22, p.lane + 1, 'sedan', v),
    put(g.oncoming, 18, g.oncoming.N - 1, 'hatch', 28),
    put(g.oncoming, 40, g.oncoming.N - 2, 'estate', 28),
  ];
});
console.log('placed', await place());
await wait(400);
await page.screenshot({ path: `${out}/cockpit.png` });
await page.keyboard.press('KeyV'); await page.keyboard.press('KeyV');
await wait(400);
await page.screenshot({ path: `${out}/chase.png` });
await page.keyboard.press('KeyL');
await wait(400);
await page.screenshot({ path: `${out}/chase-lightsoff.png` });
console.log(errors.slice(0, 10).join('\n') || 'no console errors');
await browser.close();
server.kill();
process.exit(0);
