// Look-dev: parks one car of each archetype next to you, day and night, and
// saves chase-view screenshots. Usage: node tools/lineup.js [outdir]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'shots/lineup';
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4799', '--strictPort']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  for (const tod of ['day', 'night']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.evaluateOnNewDocument((tod) => localStorage.setItem('snelweg.settings.v1', JSON.stringify({ timeOfDay: tod, trafficDensity: 1, oncomingDensity: 0, lanes: 3 })), tod);
    await page.goto('http://localhost:4799/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
    await page.mouse.click(640, 360);
    await sleep(1500);
    // layout: [ds, laneOffset, variant, persona]
    const place = (layout) => page.evaluate((layout) => {
      const g = window.__game, p = g.player, tr = g.traffic, v = p.v;
      for (const veh of [...tr.vehicles]) if (veh.lineup) veh.u = tr.dir * (p.s + 1400); // park old ones far ahead
      return layout.map(([ds, dl, variant, persona]) => {
        const veh = tr.insertAt(p.s - 900, p.lane + dl, 'car', variant, { v, persona });
        if (!veh) return 'fail';
        veh.lineup = true;
        veh.u = tr.dir * (p.s + ds);
        veh.v = v;
        veh.cooldown = 1e9;
        veh.limitOffset = v * 3.6 - tr.limitKmh;
        tr.applyLimit(veh);
        veh.v0 = veh.v0base;
        for (const l of tr.lanes) l.sort((a, b) => a.u - b.u);
        return `${persona || variant}@${veh.lane}`;
      });
    }, layout);
    const view = async (n) => { for (let i = 0; i < n; i++) await page.keyboard.press('KeyV'); };
    // sides: chase view, one car each side, and two more a bit ahead
    console.log(tod, await place([[3, 1, 'hatch', 'patser'], [3, -1, 'estate', 'leasebak'], [14, 1, 'hatch', 'pensioner'], [14, -1, 'suv', null]]));
    await view(2); // cockpit -> bonnet -> chase
    await sleep(600);
    await page.screenshot({ path: `${out}/${tod}-sides.png` });
    // fronts: bonnet view looking back (hold B)
    console.log(tod, await place([[-11, 1, 'hatch', 'patser'], [-11, -1, 'estate', 'leasebak'], [-24, 1, 'hatch', 'pensioner'], [-24, -1, 'suv', null]]));
    await view(2); // chase -> cockpit -> bonnet
    await page.keyboard.down('KeyB');
    await sleep(900);
    await page.screenshot({ path: `${out}/${tod}-fronts.png` });
    await page.keyboard.up('KeyB');
    await view(2); // bonnet -> chase -> cockpit
    await sleep(300);
    await page.screenshot({ path: `${out}/${tod}-mirror.png` });
    console.log(errors.join('\n') || 'no errors');
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
