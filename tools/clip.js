// Records a video clip of a scenario, for judging motion without playing.
// Usage: node tools/clip.js <scenario> [seconds=25] [view=chase|bonnet|cockpit] [overlay=off|ar-rel|ar-abs|dev|map] [out=shots/clip.mp4]
// overlay 'map' shows the lane map with the time-space diagram instead.
// Needs ffmpeg on PATH (puppeteer's screencast uses it).
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const [name = 'elephant', secs = '25', view = 'chase', overlay = 'off', out = `shots/${name}.mp4`] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4799', '--strictPort']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const webm = out.replace(/\.mp4$/, '') + '.webm';
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((overlay) => localStorage.setItem('snelweg.settings.v1', JSON.stringify(overlay === 'map' ? { overlay: 'off', laneMap: 2, laneMapSpan: 1000, adaptiveCruise: true } : { overlay, adaptiveCruise: true })), overlay); // ACC, so your car follows instead of rear-ending
  await page.goto(`http://localhost:4799/?scenario=${name}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  await page.mouse.click(640, 360); // start (restarts the scenario)
  await sleep(300);
  const presses = { cockpit: 0, bonnet: 1, chase: 2 }[view] ?? 2;
  for (let i = 0; i < presses; i++) await page.keyboard.press('KeyV');
  const rec = await page.screencast({ path: webm });
  await sleep(+secs * 1000);
  await rec.stop();
} finally {
  await browser.close();
  server.kill();
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
rmSync(webm);
console.log('saved', out);
