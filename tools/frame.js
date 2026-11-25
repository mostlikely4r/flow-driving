// Proefrit (F-37) slice 3: shoot two frames at a moment of a bot drive.
//
// A still has to come from the world the journal describes, so the page replays
// the run itself (`?dev&replay=…`, see plain `main.js`) with the same bot, seed
// and config as the headless runner, and reports the drive's body hash. The
// frame tool compares that with the hash of the run it came from and says so
// when they differ — a frame of a different world is worse than no frame.
//
// One page load per moment, two stills: the bonnet view and the lane map with the
// time-space diagram (which the replay fills while it drives).
//
// Usage: node tools/frame.js seed=3 until=412 [driver=forens] [tod=day]
//                         [scenario=closure] [out=frames] [expect=<bodyHash>]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserPath } from './lib/browser.js';

export const PORT = 4799;
export const SIZE = { width: 1280, height: 720 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The replay URL for one moment: the runner's arguments, in the address. */
export function replayUrl({ seed, until, driver = 'forens', tod = 'day', scenario = null, cfg = null }, port = PORT) {
  const q = new URLSearchParams({ dev: '1', replay: '1', seed: String(seed), until: String(until), driver, tod });
  if (scenario) q.set('scenario', scenario);
  if (cfg && Object.keys(cfg).length) q.set('cfg', JSON.stringify(cfg));
  return `http://localhost:${port}/?${q}`;
}

/** `vite preview` over the built game: the frames need `npm run build` first. */
export function startPreview(port = PORT) {
  if (!existsSync('dist/index.html')) throw new Error('no dist/: run `npm run build` before shooting frames');
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  return server;
}

export async function waitForServer(port = PORT, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/`, { method: 'HEAD' });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  return false;
}

export async function launchBrowser() {
  return puppeteer.launch({
    executablePath: browserPath(),
    headless: 'new',
    args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', `--window-size=${SIZE.width},${SIZE.height}`, '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { ...SIZE },
  });
}

/**
 * Shoot one moment: load the replay, wait for it, then the bonnet view and the
 * lane map. Returns the two paths, what the page said it replayed, and any
 * console errors.
 */
export async function shootMoment({ browser, port = PORT, outDir, name, shot, mapSpan = 1000 }) {
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  try {
    await page.goto(replayUrl(shot, port), { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__game && window.__game.replay, { timeout: 300000, polling: 500 });
    const replay = await page.evaluate(() => {
      const r = window.__game.replay;
      return { done: r.done, error: r.error || null, t: r.t, s: r.s, kmh: r.kmh, vehicles: r.vehicles, hash: r.hash, bodyHash: r.bodyHash, secs: r.secs };
    });
    if (!replay || !replay.done) throw new Error(replay && replay.error ? replay.error : 'the replay did not finish');

    await page.evaluate(() => window.__game.setView('bonnet'));
    await sleep(1200); // let the scene stream in and a few frames settle
    const bonnet = join(outDir, `${name}-bonnet.png`);
    await page.screenshot({ path: bonnet });

    await page.evaluate((span) => {
      const lm = window.__game.laneMap;
      lm.span = span;
      lm.setMode(2);
    }, mapSpan);
    await sleep(700);
    const map = join(outDir, `${name}-map.png`);
    await page.screenshot({ path: map });

    return { bonnet, map, replay, errors };
  } finally {
    await page.close();
  }
}

/** Shoot every moment of a run with one browser and one preview server. */
export async function shootAll({ shots, outDir, port = PORT, onLog = null }) {
  const server = startPreview(port);
  const log = onLog || (() => {});
  let browser = null;
  try {
    if (!(await waitForServer(port))) throw new Error(`vite preview did not come up on ${port}`);
    browser = await launchBrowser();
    const out = [];
    for (const s of shots) {
      log(`frames: ${s.name} (seed ${s.shot.seed}, t ${s.shot.until})`);
      const res = await shootMoment({ browser, port, outDir, name: s.name, shot: s.shot });
      const same = s.shot.expect == null || s.shot.expect === res.replay.bodyHash;
      if (!same) log(`  ! body hash ${res.replay.bodyHash} is not the run's ${s.shot.expect}`);
      for (const e of res.errors.slice(0, 5)) log('  ' + e);
      out.push({ ...res, sameWorld: same, expect: s.shot.expect ?? null, name: s.name });
    }
    return out;
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
}

// ------------------------------------------------------------------ CLI
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const o = {};
  for (const a of process.argv.slice(2)) {
    const i = a.indexOf('=');
    if (i < 0) continue;
    const k = a.slice(0, i);
    const v = a.slice(i + 1);
    if (k === 'cfg') {
      try {
        o.cfg = JSON.parse(v);
      } catch {
        o.cfg = null;
      }
    } else o[k] = v;
  }
  if (!o.seed || !o.until) {
    console.log('Usage: node tools/frame.js seed=3 until=412 [driver=forens] [tod=day] [scenario=closure] [out=frames] [expect=<bodyHash>]');
    process.exit(1);
  }
  const outDir = resolve(o.out || 'frames');
  const shot = { seed: Number(o.seed), until: Number(o.until), driver: o.driver || 'forens', tod: o.tod || 'day', scenario: o.scenario || null, cfg: o.cfg || null };
  const name = o.name || `${shot.driver}-seed${shot.seed}-t${Math.round(shot.until)}`;
  const [res] = await shootAll({ shots: [{ name, shot: { ...shot, expect: o.expect || null } }], outDir, onLog: (l) => console.log(l) });
  console.log(JSON.stringify({ bonnet: res.bonnet, map: res.map, body: res.replay.bodyHash, sameWorld: res.sameWorld, t: res.replay.t, s: Math.round(res.replay.s), secs: res.replay.secs }, null, 2));
  process.exit(res.sameWorld ? 0 : 1);
}
