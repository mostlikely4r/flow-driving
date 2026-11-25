# Flow Driving

A traffic driving game on Dutch roads about being part of traffic, not racing through it. JavaScript,
Three.js, Vite. `README.md` explains what is simulated and how to run each tool;
`docs/vision.md` holds the vision, the pillars (Authentic, Readable traffic, Calm), how items are
scored and the milestones; `BACKLOG.md` holds every feature by ID, in the vibeview format
(`~/Desktop/vibeview/FORMAT.md`). Read the pillars before proposing anything.

## Commands

- `npm run dev`: play locally. `npm run build`: production build.
- No unit-test script. The checks are the headless tools in `tools/`, each an npm script:
  `simtest`, `personas`, `scenario <name>`, `moments`, `bottest`, `worldtest`, `playtest`, and
  others listed in the README. `playtest` drives minutes of traffic per seed and is a long run.
- Human drive journals in `playtests/human/` are local: they are the user's design history and
  calibration set, git ignores them, never delete or rewrite them.
<!-- vibeview:commands start -->
- **Project files:** `QUEUE.md` (the order tasks go to agents), `BACKLOG.md` (the pool of ideas
  and features) and `INBOX.md` (quick notes) are plain markdown, edited by hand or from the
  vibeview page. Format and agent rules: `~/Desktop/vibeview/FORMAT.md`; check a file with
  `node ~/Desktop/vibeview/scripts/check.ts <file>`.
<!-- vibeview:commands end -->

## Sessions

- Talk and small changes (under about 3 turns to explain, 1–2 files): build in the same thread.
- Longer design debates, or a mind changed mid-chat: `/spec` writes the plan, then `/build`
  it in a fresh thread, so rejected ideas don't leak into the code.
- `/next` takes the top task from `QUEUE.md` and runs the flow for its stage (spec, build,
  test, other).
- The commands are Markdown in `.claude/commands/`; `.pi/settings.json` loads that directory, so
  pi exposes them too. The same files are used in the user's other projects; what differs per
  project lives in the Workflow section below. Their source is `~/Desktop/vibeview/prompts/`:
  change them there and run `node scripts/sync-prompts.ts` in vibeview; never edit a copy here.

## Workflow

Read by `/spec` and `/build`.

- **Plans:** `docs/specs/<ID>-<name>.md`, with the BACKLOG feature ID when there is one (for
  example `F-37-slice-2`). Style: `docs/F-37-slice-2.md` (goal and non-goals, baseline, then
  numbered steps). The plan names its BACKLOG item, and the item's `plan:` field links to the
  plan.
- **Private:** nothing.
- **Quick check:** `npm run build`, plus the one headless tool closest to the change (`simtest`
  for the traffic model, `personas` for archetypes, `moments` for detectors, `bottest` for the
  bot).
- **Full check:** `npm run build`, `npm run simtest`, `npm run personas`, `npm run moments`,
  `npm run bottest` and `npm run worldtest`. Note in the plan how long they took the first time, so
  this list can be trimmed.
- **Background only:** `npm run playtest` runs and other multi-minute drives, with output to a log.
- **Review:** from the repo root, against the uncommitted tree:

      codex exec review -m gpt-6-luna --uncommitted "This change builds <plan path>.
      Judge it against that plan, AGENTS.md and the pillars in docs/vision.md: report bugs, missed
      plan requirements and checks missing; skip style nits. Touched: <files>. Checks: <run>."

- **Done also means:** the BACKLOG item's `status:` field is updated (`built`, or `building`
  while slices remain) and its text gets a line on what was built, in its usual style.
- **Human drives guide, they don't gate:** a plan may suggest a drive or scenario to try, but
  never waits on one. The headless checks and a quick look at the scenario are enough to close an
  item. When the user drives and brings a journal or report, that starts a new session.
<!-- vibeview:workflow start -->
- **Queue and inbox:** `QUEUE.md` is the order tasks go to agents (top is next); `BACKLOG.md`
  holds the pool of ideas and features; `INBOX.md` holds quick notes the user sent from the
  vibeview page. When the user asks what is open or what's next, read all three, then follow
  `~/Desktop/vibeview/FORMAT.md` for the format and for triaging notes with the user. Triage one
  note at a time, with the user: fix it now, queue it, backlog it or drop it; delete the note in
  the same change, and name the id it became in the commit message (`inbox: I-3 → F-41`) — or in
  the handoff, where the operator owns commits.
- **Shared files:** the commands in `.claude/commands/` and this block come from
  `~/Desktop/vibeview`. The full check must leave
  `node ~/Desktop/vibeview/scripts/sync-prompts.ts --check` clean (exits 1 on a drifted prompt or
  block); fix the drift in vibeview, never in the copy here.
<!-- vibeview:workflow end -->
- **Commits:** the agent commits. Once a change is finished and the full check passes, commit it
  without asking, one commit per plan step or change, message as in the history
  ("Proefrit slice 2 P3: ... (F-37)"). Don't commit when checks fail, work is half done, or a
  decision from the user is pending. Never push without asking.
