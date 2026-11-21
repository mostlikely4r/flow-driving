// Night look-dev: an empty, unlit road lit only by your own lamps (dipped,
// high beam, chase), then normal traffic. Usage: node tools/nightroad.js <dir>
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { browserPath } from './lib/browser.js';
const out = process.argv[2] || "shots/nightroad";
import("node:fs").then((fs) => fs.mkdirSync(out, { recursive: true }));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4799', '--strictPort']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: 'new', args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
try {
  // 1) empty unlit road, own lights only
  let page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.setItem('snelweg.settings.v1', JSON.stringify({ timeOfDay: 'night', trafficDensity: 0, oncomingDensity: 0 })));
  await page.goto('http://localhost:4799/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  await page.mouse.click(640, 360);
  await sleep(2000);
  console.log(await page.evaluate(() => window.__game.scenery.litAt(window.__game.player.s)));
  await page.screenshot({ path: `${out}/empty-cockpit-dipped.png` });
  await page.keyboard.press('KeyG');
  await sleep(500);
  await page.screenshot({ path: `${out}/empty-cockpit-high.png` });
  await page.keyboard.press('KeyG');
  await page.keyboard.press('KeyV'); await page.keyboard.press('KeyV');
  await sleep(600);
  await page.screenshot({ path: `${out}/empty-chase-dipped.png` });
  await page.close();
  // 2) normal traffic, chase
  page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.setItem('snelweg.settings.v1', JSON.stringify({ timeOfDay: 'night' })));
  await page.goto('http://localhost:4799/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  await page.mouse.click(640, 360);
  await sleep(6000);
  await page.screenshot({ path: `${out}/traffic-cockpit.png` });
  await page.keyboard.press('KeyV'); await page.keyboard.press('KeyV');
  await sleep(600);
  await page.screenshot({ path: `${out}/traffic-chase.png` });
} finally { await browser.close(); server.kill(); }
