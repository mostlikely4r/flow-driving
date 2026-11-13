// Night mood check: drives into a lit stretch and an unlit one, saving
// cockpit and chase shots. Usage: node tools/night.js [outdir]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'shots/night';
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.evaluateOnNewDocument(() => localStorage.setItem('snelweg.settings.v1', JSON.stringify({ timeOfDay: 'night' })));
  await page.goto('http://localhost:4799/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  await page.mouse.click(640, 360);
  await sleep(2500);
  await page.screenshot({ path: `${out}/1-unlit-or-start.png` });
  // find the next lit stretch and report where we are relative to it
  const info = await page.evaluate(() => {
    const g = window.__game;
    const s = g.player.s;
    let lit = null;
    for (let x = s; x < s + 20000; x += 50) if (g.scenery.litAt(x)) { lit = x; break; }
    return { s, litNow: g.scenery.litAt(s), nextLit: lit };
  });
  console.log(info);
  await page.keyboard.press('KeyV'); await page.keyboard.press('KeyV');
  await sleep(800);
  await page.screenshot({ path: `${out}/2-chase.png` });
  // jump into the middle of the next lit stretch, then into a dark one
  await page.evaluate((s) => window.__game.teleport(s + 600), info.nextLit);
  await sleep(2500);
  await page.screenshot({ path: `${out}/3-lit-chase.png` });
  await page.keyboard.press('KeyV');
  for (let i = 0; i < 4; i++) {
    await sleep(450);
    await page.screenshot({ path: `${out}/4-lit-cockpit-${i}.png` });
  }
  console.log(errors.join('\n') || 'no errors');
} finally {
  await browser.close();
  server.kill();
}
