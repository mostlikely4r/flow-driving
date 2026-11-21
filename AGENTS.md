# Snelweg

A Dutch motorway driving game about being part of traffic, not racing through it. JavaScript,
Three.js, Vite. `README.md` explains what is simulated and how to run each tool; `BACKLOG.md`
holds the vision, the pillars (Authentic, Readable traffic, Calm), how items are scored, the
milestones and every feature by ID. Read the pillars before proposing anything.

## Commands

- `npm run dev`: play locally. `npm run build`: production build.
- No unit-test script. The checks are the headless tools in `tools/`, each an npm script:
  `simtest`, `personas`, `scenario <name>`, `moments`, `bottest`, `playtest`, and others listed
  in the README. `playtest` drives minutes of traffic per seed and is a long run.
- Human drive journals in `playtests/human/` are local: they are the user's design history and
  calibration set, git ignores them, never delete or rewrite them.

## Sessions

- Talk and small changes (under about 3 turns to explain, 1–2 files): build in the same thread.
- Longer design debates, or a mind changed mid-chat: `/spec` writes the plan, then `/build`
  it in a fresh thread, so rejected ideas don't leak into the code.
- Both commands are Markdown in `.claude/commands/`; `.pi/settings.json` loads that directory, so
  pi exposes them too. The same two files are used in the user's other projects; what differs per
  project lives in the Workflow section below. Change them in all projects together.

## Workflow

Read by `/spec` and `/build`.

- **Plans:** `docs/specs/<ID>-<name>.md`, with the BACKLOG feature ID when there is one (for
  example `F-37-slice-2`). Style: `docs/F-37-slice-2.md` (goal and non-goals, baseline, then
  numbered steps). The plan names its BACKLOG item, and the item's status links to the plan.
- **Private:** nothing.
- **Quick check:** `npm run build`, plus the one headless tool closest to the change (`simtest`
  for the traffic model, `personas` for archetypes, `moments` for detectors, `bottest` for the
  bot).
- **Full check:** `npm run build`, `npm run simtest`, `npm run personas`, `npm run moments` and
  `npm run bottest`. Note in the plan how long they took the first time, so this list can be
  trimmed.
- **Background only:** `npm run playtest` runs and other multi-minute drives, with output to a log.
- **Review:** from the repo root, against the uncommitted tree:

      codex exec review -m gpt-6-luna --uncommitted "This change builds <plan path>.
      Judge it against that plan, AGENTS.md and the pillars in BACKLOG.md: report bugs, missed
      plan requirements and checks missing; skip style nits. Touched: <files>. Checks: <run>."

- **Done also means:** the BACKLOG item's status says what was built, in its usual style.
- **Commits:** the agent commits. Once a change is finished and the full check passes, commit it
  without asking, one commit per plan step or change, message as in the history
  ("Proefrit slice 2 P3: ... (F-37)"). Don't commit when checks fail, work is half done, or a
  decision from the user is pending. Never push without asking.
