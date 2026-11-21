// Vite config for Flow Driving. Besides the normal dev server this adds the Proefrit
// (F-37) journal sink: while playing in dev, ending a drive POSTs one JSON file
// to /__journal, which lands in playtests/human/. Those files are design history
// and the calibration set for the moment detectors: they stay on the player's
// disk, kept locally and ignored by git.
//
// The git commit is baked into the bundle as __GIT_COMMIT__: a journal without
// its commit cannot be compared to anything.
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** POST /__journal -> playtests/human/<date>-<time>.json (dev server only). */
function journalSink() {
  return {
    name: 'proefrit-journal-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__journal', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        let tooBig = false;
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 24e6) {
            tooBig = true;
            req.destroy();
          }
        });
        req.on('end', () => {
          if (tooBig) return;
          try {
            const data = JSON.parse(body);
            if (!data || typeof data !== 'object' || !data.header) throw new Error('not a journal');
            const dir = join(process.cwd(), 'playtests', 'human');
            mkdirSync(dir, { recursive: true });
            const name = `${stamp()}.json`;
            writeFileSync(join(dir, name), JSON.stringify(data));
            const rel = `playtests/human/${name}`;
            console.log(`[proefrit] wrote ${rel} (${data.t.length} samples, ${data.marks.length} marks)`);
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: rel }));
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths: the same dist/ works under /flow-driving/ on GitHub
  // Pages, on any other subpath, and opened from the local preview server.
  base: './',
  plugins: [journalSink()],
  define: {
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
  },
});
