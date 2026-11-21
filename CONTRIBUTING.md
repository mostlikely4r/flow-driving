# Contributing to Flow Driving

Better versions and forks are welcome — that is why the game is MIT licensed. Open an issue for a
new idea before you build it, so we can agree it fits the game first.

## What a change is judged by

The pillars in [BACKLOG.md](BACKLOG.md), in this order:

1. **Authentic.** Dutch rules, roads, signs and driver habits.
2. **Readable traffic.** Situations you can see building up and predict.
3. **Calm.** Nothing rewards speed, reflexes or risk.

Visual quality is a quality bar, not a reason on its own. Read the vision and the pillars in
`BACKLOG.md` before proposing a feature; a change that breaks one of them will be asked to change,
however nice it looks.

## Before a pull request

```
npm install
npm run build
npm run simtest
npm run personas
npm run moments
npm run bottest
```

CI runs exactly those on every push and pull request. `npm run playtest` (minutes per seed) is a
long run and is not in CI; use it when you touch the traffic model or the bot.

## Telling us how it drives

Feelings are data here. Play with `?dev` added to the hosted URL, or `npm run dev` locally, then
pause (Esc) and choose **End drive…**. Answer the three optional questions and attach the downloaded
JSON to an issue together with what felt wrong: the place, the situation, and how long it took to
build up. Those drives are the calibration set for the moment detectors.
