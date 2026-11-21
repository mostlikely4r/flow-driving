# F-39: public release as Flow Driving (spec)

Date: 2026-11-21. Status: ready to build. BACKLOG item F-39.

## 1. Why

The game goes on public GitHub as an open project: anyone may take it, and if someone builds a
better version, all the better (*decided*, the user). Today the repo is a private workbench: the
README is a tuning manual, dev tools (marks, journal, dev overlay, scenarios) sit in the player's
face, live NPO streams are hard-coded, six tools only work with Edge on Windows, and the project
rule says the user's own drive journals get committed.

**Goal.** A stranger lands on the repo, understands the game in ten seconds, plays it in the browser
from a link, and can run it and its checks locally on any OS. The user's own drives stay on their
disk.

**Done when** every step below is built, the full check passes, the production build shows no dev
UI unless `?dev` is in the URL, and the repo holds no human journal.

## 2. The picture

- **Name** (*decided*): the game is **Flow Driving**. "Snelweg" and "Ritsen" were too
  motorway-only for the town horizon; "flow" is the game (being part of traffic) and covers suburbs
  too. The GitHub repo is `flow-driving`. The local folder stays `traffic`.
- **Search** (*my proposal*): GitHub finds repos by name, description and topics, not the in-game
  title. Description: "A calm traffic driving simulator set on Dutch roads: you're part of the flow,
  not racing through it." Topics: `driving-simulator`, `traffic-simulation`, `threejs`,
  `netherlands`, `idm`, `mobil`. The user sets these when creating the repo.
- **License**: MIT, already committed (`LICENSE`, `"license": "MIT"` in `package.json`).
- **Open to contributors** (*decided*). The pillars in `BACKLOG.md` are the bar a pull request is
  judged by.
- **Playable build on GitHub Pages, with a dev flag for local dev stuff** (*decided*). Players
  get the game; dev tools appear in `npm run dev` or with `?dev` in the URL.
- **Radio** (*decided*): no built-in stations. The player can paste a stream URL of their own.
  Premise for dropping NPO: a guess (mine) that hard-linking the broadcaster's streams from a
  public game needs their permission. "My music" (a local folder) stays.
- **AI workflow files stay** (*decided*): `AGENTS.md`, `CLAUDE.md`, `.claude/commands/`, `.pi/`.
  The README says the game is built with AI assistance and points to them.
- **Journals are local only** (*decided*): the user's drives are dev material and do not go in the
  repo. This reverses the rule in `AGENTS.md`. Other people's journals are welcome; they attach
  them to a GitHub issue (*my proposal*).
- **Author email in history**: the user is fine with it being public (*decided*). No history
  rewrite.

## 3. Baseline (do not revert)

- `main` at `72b8d33` ("Add MIT license"), clean tree. No git remote yet.
- `import.meta.env.DEV` already gates journal saving: `src/journal.js:310` (POST, else download)
  and `src/main.js:595` (beacon on tab close). The Vite journal sink (`vite.config.js`) is
  `apply: 'serve'` only.
- `playtests/human/` holds one committed journal, `2026-11-20-21-57-40.json` (670 KB, 20 marks),
  its `.report.md`, and a `README.md`. `docs/F-37-slice-2.md` and
  `docs/specs/F-38-signal-commitment.md` cite that journal by path. It stays on the user's disk, so
  those references keep working locally.
- The browser tools (`tools/shot.js`, `clip.js`, `glare.js`, `lineup.js`, `night.js`,
  `nightroad.js`) launch puppeteer-core with a hard-coded Edge path and load the **built** game
  through `vite preview` on port 4799. `clip.js` opens `?scenario=<name>`.
- Node 24 locally. The headless checks (`simtest`, `personas`, `moments`, `bottest`) don't use a
  browser.

## 4. Steps

One commit per step, message style "Public release P<n>: ... (F-39)".

### P1. Dev flag

New `src/dev.js`:

```js
export const DEV = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');
```

(Guard `location` for headless Node: `typeof location !== 'undefined'`.) In the build, with
`DEV` false, hide:

- **Proefrit**: the `F8` mark key (`main.js` `case 'F8'`), the "This drive" marks block in the
  pause menu (`#marks` and its `h3.sub` in `index.html`), the **End drive…** button (`#btnend`) and
  the debrief panel. Saving on tab close (`main.js:595`) switches from `import.meta.env.DEV` to
  `DEV`. The journal keeps **recording** in every build (no change to the sim path). Only the UI
  and saving are gated. With `?dev` on the Pages build, End drive downloads the JSON (the existing
  fallback in `journal.js`), so outside players can send a drive.
- **Dev overlay**: drop the `dev` mode from the `O` cycle (`OVERLAY_MODES`). If a saved setting
  says `overlay: 'dev'`, fall back to `off`.
- **Scenarios**: ignore `?scenario=` and the Backspace restart. The persona viewer ("Meet the
  cast") is player-facing and stays: its demos are staged from `scenarios.js` internally and do
  not go through the URL.
- **Title-card key list** (`index.html` `.keys`): the lines for `F8`, Backspace and the dev overlay
  only show in dev. Also fix the duplicate `O` line (one says "overlay: off / AR relative / AR
  absolute / dev", one says "speed overlay"): keep one line, with "dev" only in dev mode.

`tools/clip.js` builds its URL as `?scenario=${name}&dev`. Overlay `dev` in `clip.js` keeps working
for the same reason.

### P2. Radio: your own stream URL

- `src/radio.js`: remove `STATIONS`. Sources are `off`, `music` (if a folder is picked) and `url`
  (if `CONFIG.radioUrl` is a non-empty string). `Y` cycles them. Toast on tuning: the URL's host,
  e.g. `📻 icecast.example.nl`. Error: `Radio: no signal` (existing `error` handler).
- `src/config.js`: replace `radioStreams: true` with `radioUrl: ''`. A saved `radioStreams` key in
  localStorage is ignored.
- `src/hud.js` `buildMenu`: replace the `radioStreams` checkbox with
  `['radioUrl', 'Radio stream URL', 'text', 'https://…']`. Add the `text` input type: an
  `<input type="url">` that saves on `change`, trimmed. `main.js:454`: when the URL is cleared while
  tuned to `url`, tune `off`.
- Edge cases: an `http://` URL on the HTTPS Pages site is blocked by the browser as mixed content.
  Toast `Radio: this page needs an https:// stream`. A URL that doesn't parse: toast, don't tune.
- Title-card help: `Y` reads "radio: my music / your stream / off (set them in the menu)".

### P3. Journals stay local

- `.gitignore`: add `playtests/human/*` and `!playtests/human/README.md`.
- `git rm --cached playtests/human/2026-11-20-21-57-40.json
  playtests/human/2026-11-20-21-57-40.report.md`. The files stay on disk. No history rewrite.
- Change the rule everywhere it is written:
  - `AGENTS.md` Commands section: "Human drive journals in `playtests/human/` are local: they are
    the user's design history and calibration set, git ignores them, never delete or rewrite them."
  - `README.md` Proefrit paragraph: drop "commit these".
  - `playtests/human/README.md`: replace the **Commit these** bullet with "These stay on your
    disk (git ignores them). To share a drive, attach the JSON to a GitHub issue."
  - `BACKLOG.md` F-37 section ("Commit these: they are design history and the calibration set"):
    the same change.
  - `vite.config.js` header comment: "so they are committed" becomes "kept locally, ignored by
    git".

### P4. Rename to Flow Driving, small package fixes

- `index.html`: `<title>Flow Driving</title>`. Title card
  `<h1><span>A12</span>Flow Driving <em>100</em></h1>`: keep the A12 shield and the 100 sign as
  the Dutch flavour (*my proposal*).
- `package.json`: `"name": "flow-driving"`. Move `vite` from `dependencies` to `devDependencies`
  (it's a build tool; `three` stays a dependency). Run `npm install` so `package-lock.json`
  follows.
- `README.md`, `AGENTS.md` and `BACKLOG.md` headings say Flow Driving. `AGENTS.md`'s first line
  becomes "A traffic driving game on Dutch roads about being part of traffic, not racing through it."
  Leave historical text (old plans, commit messages, journals) alone.

### P5. Browser tools on any OS

New `tools/lib/browser.js` exporting `browserPath()`: `process.env.BROWSER_PATH` if set, else the
first existing of the Edge path in use today, `C:/Program Files/Google/Chrome/Application/chrome.exe`,
`/usr/bin/google-chrome`, `/usr/bin/chromium`,
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. If none exists, throw
`Set BROWSER_PATH to a Chrome or Edge executable`. The six tools use it instead of the literal path.
The README's tools section mentions `BROWSER_PATH`. Tools that spawn `npx vite preview` with
`shell: true` (`shot.js`, `glare.js`) switch to `process.execPath` +
`node_modules/vite/bin/vite.js` like the others, so they also work on Linux.

### P6. Front door: README and CONTRIBUTING

`README.md`, top to bottom:

1. `# Flow Driving` and the one-line description from section 2.
2. A screenshot from the seat: take one with `node tools/shot.js docs/media dusk` after
   `npm run build`, keep the best cockpit frame as `docs/media/cockpit.png` (only that file is
   committed).
3. **Play in your browser**: `https://mostlikely4r.github.io/flow-driving/`. One line saying it
   runs in desktop Chrome, Edge or Firefox with a keyboard.
4. The vision and the three pillars, quoted short from `BACKLOG.md`, with a link to it.
5. **Run it locally**: `npm install`, `npm run dev` (or `start.bat`), plus "dev mode shows the
   playtest tools; add `?dev` to the hosted URL for the same".
6. **Built with AI**: one short paragraph. Developed with Claude Code and the plan → build →
   review loop in `AGENTS.md` and `.claude/commands/`.
7. **Contributing**: open, link to `CONTRIBUTING.md`. **License**: MIT.
8. Everything the README holds today (simulation, tuning, persona viewer, scenarios, Proefrit,
   playtest bot, tools) moves below under `## For developers`, edited for the changes above.

`CONTRIBUTING.md` (new, short):

- Better versions and forks are welcome. That's why it's MIT.
- A change is judged by the pillars, in order: **Authentic**, **Readable traffic**, **Calm**.
  Visual quality is a bar, not a reason on its own. Read `BACKLOG.md` before proposing a feature.
  New ideas go in an issue first.
- Before a pull request: `npm run build`, `npm run simtest`, `npm run personas`, `npm run moments`,
  `npm run bottest` (CI runs the same).
- Drive journals: play with `?dev` or `npm run dev`, End drive…, and attach the JSON to an issue
  with what felt wrong.

### P7. GitHub Actions: checks and Pages

- `vite.config.js`: `base: './'`, so the build works under `/flow-driving/` and anywhere else.
  Check that no runtime code fetches an absolute path (only `/__journal` does, and that is dev-only).
- `.github/workflows/checks.yml`: on push and pull request, ubuntu-latest, Node 24, `npm ci`, then
  `npm run build`, `simtest`, `personas`, `moments`, `bottest`. No browser tools in CI.
- `.github/workflows/pages.yml`: on push to `main`, `npm ci`, `npm run build`, then
  `actions/upload-pages-artifact` with `dist` and `actions/deploy-pages` (permissions `pages:
  write`, `id-token: write`). The default `actions/checkout` is enough for `git rev-parse
  --short HEAD`, so `__GIT_COMMIT__` is filled in the hosted build.
- The user turns on Pages in the repo settings (Source: GitHub Actions). That is their step,
  listed in Needs first.

### P8. BACKLOG

Add row F-39 under M1 in `BACKLOG.md`: "**Public release** as Flow Driving: MIT, dev flag,
stream-URL radio, local journals, README/CONTRIBUTING, CI and Pages" | — | 3 | M | Low | P0 |
status linking to this plan. When built, the status says what was built, in the table's usual
style.

## 5. How we'll know

- **Full check** after every step: `npm run build`, `npm run simtest`, `npm run personas`,
  `npm run moments`, `npm run bottest`. Timings on 2026-11-21 (Windows, before this work): see
  section 7.
- `node tools/shot.js <dir> night` and `node tools/clip.js elephant 5` still run (P1, P5).
- `git ls-files playtests/human` prints only `playtests/human/README.md`. The journal file is
  still on disk (P3).
- `grep -rn "Snelweg" index.html package.json README.md AGENTS.md` finds nothing. `grep -rn
  "icecast.omroep" src` finds nothing (P2, P4).
- After the first push: the `checks` workflow is green and the Pages URL serves the game.

**Try it** (about 5 minutes): `npm run build`, then `npm run preview` and open the printed URL.
The title card says Flow Driving and lists no F8 or Backspace key. Drive. `F8` does nothing, `O`
cycles off / AR relative / AR absolute without dev, and the pause menu has no End drive… and no
marks. Paste an https radio stream URL into the menu (Esc), press `Y` twice: it plays and the toast
shows the host. Now open the same URL with `?dev` added: F8 marks, End drive… downloads a JSON,
and `O` reaches the dev overlay. `npm run dev` behaves like `?dev`, and End drive… writes to
`playtests/human/`, which `git status` doesn't show.

## 6. Not doing

- No history rewrite (author email or the old journal).
- No built-in radio stations, NPO or otherwise.
- No renaming of the local `traffic` folder.
- The agent does not create the GitHub repo or push. Pushing happens only when the user asks.

## 7. Full-check timings (first run, 2026-11-21)

Measured on the user's Windows machine before any F-39 change, all passing: `npm run build`
about 4 s, `simtest` 8 s, `personas` 1 s, `moments` 1 s, `bottest` 5 s. The whole full check
is under 20 s, so it runs after every step and nothing needs trimming.

## Needs first

- Exists: `LICENSE` and `"license": "MIT"` (commit `72b8d33`); the DEV-gated journal save in
  `src/journal.js` and `src/main.js`; `tools/shot.js` with `vite preview` on port 4799.
- The user, after P7: create the public repo `mostlikely4r/flow-driving` on GitHub with the
  description and topics from section 2, set Pages to "GitHub Actions", and say when to add the
  remote and push. `gh` is not logged in on this machine, so the agent can't do it.

## Not in this build

- A GitHub release, tag or changelog.
- Issue templates beyond `CONTRIBUTING.md`.
- Touch and gamepad controls, and mobile layout for the hosted build.
- Moving to Godot (deferred, see the engine note).
