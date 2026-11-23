# Proefrit: the playtest loop (F-37)

A test system that sits between Claude driving the game and you driving it. Both kinds of drive go
through the same recorder and the same moment detectors, so a bot report and your playtest read
the same way and can be compared line by line.

## What it can and cannot tell us

The bot cannot tell whether the game is fun, and its report must never say so. It can tell three
things that today only come out of your playtests:

1. **Does the game produce the situations the pillars promise?** For example: elephant races,
   being let in, a wave you ride through. And how often do they happen per 10 minutes of driving?
2. **Is anything unreadable from the driver's seat?** A car that moves without any visible sign,
   brakes for no visible reason, or pops into view. This is the Readable pillar, measured from
   inside the car, not from the sim's god view the way `simtest` measures it.
3. **How does the world react to a *player*?** Every harness so far tests AI against AI. The
   player car has different physics, cruise control in 1 km/h clicks, and no MOBIL. Nobody has
   measured what traffic does around it.

Anything that depends on your feelings goes through **calibration**: a detector only counts once
it fires where you marked a moment. A detector that never agrees with you gets cut. That is why
the human half is slice 1, not an extra.

## The parts

All of them are free of rendering code (see the engine-migration note): `src/journal.js`,
`src/moments.js`, `src/perception.js` and `src/botDriver.js` import no Three.js, so they run in
Node and survive a later move to Godot.

**1. Drive journal (`src/journal.js`).** One recorder for every drive, in the browser or
headless.
- 2 Hz samples: `t, s, lane, lat, v, cc.set, ctl (throttle/brake/steer), indicator`, the gap
  and relative speed to the car ahead and behind in your lane and both neighbouring lanes, the
  speed limit, and fps (browser only; the bot can't feel a stutter, so your journal records it).
- Events: everything `Player.emit` already sends (`cc`, `indicator`, `crash`, `scrape`), plus
  flash, horn, lane-change start and end, red cross passed, and MSI changes. Each event is
  stamped with `t` and `s`.
- Header: who drove (human or bot plus driver profile), git commit, seed, scenario, time of day,
  and the config diff from `DEFAULTS`. A journal without its commit cannot be compared to anything.
- Format: one JSON file, about 300 KB for 20 minutes. Samples are kept as columns, not as one
  object per sample.

**2. Moment detectors (`src/moments.js`).** Rules over the journal stream. Each moment has a
`kind`, a pillar, a severity from 1 to 3, `t`/`s`, the vehicles involved (id + archetype), and a
one-line "from the seat" sentence. Thresholds live in `CONFIG.moments` so they can be calibrated.

| Kind | Fires when | Pillar |
|---|---|---|
| `cut-off` | A car merges into your lane ahead at < 0.8 s, or makes you brake > 2.5 m/s² | Calm |
| `unannounced` | A car within 60 m changes lanes after < 1 s of *visible* signal or drift | Readable |
| `phantom-brake` | A visible car ahead (same or adjacent lane) shows brake lights or brakes > 2 m/s² and nothing visible ahead of it explains it | Readable |
| `empty-signal` | A car within 80 m keeps its indicator on for > 8 s, or withdraws it after > 8 s, without changing lane | Readable |
| `pointless-lane` | A car within 120 m moves left with no car ahead in its old lane, or a faster one: nothing to overtake | Readable |
| `pop-in` | A vehicle appears or vanishes inside 150 m of you (spawn/despawn artefact) | Authentic |
| `not-let-in` | You signal for > 8 s and no gap opens, with a car right there that could have made one | Authentic |
| `boxed-in` | You are > 15 km/h under your set speed for > 60 s with no lane to escape to | Calm |
| `tailgated` | A car behind you at < 0.6 s for > 10 s | Authentic |
| `left-dawdler` | A slower car blocks the left lane ahead of you for > 30 s | Authentic |
| `forced-brake` | You had to brake > 3 m/s², for any reason | Calm |
| `near-miss` | TTC < 1.5 s with any car | Calm |
| `let-in` (good) | You signal, a car behind eases off, and you merge | Readable |
| `moved-over` (good) | The car ahead moves right after you flash or close in | Authentic |
| `clean-overtake` (good) | Signal out, pass, signal back, no braking > 1 m/s² anywhere around you | Calm |
| `elephant-race` (good) | Two trucks side by side ahead of you for > 20 s | Authentic |
| `wave-ridden` (good) | Your speed drops > 30 km/h and recovers without a `forced-brake` | Readable |

Plus a **calm share**: the fraction of driving time with no friction moment in the last 30 s.
Plus a **health** block, which is a bug report and not a feeling: collisions, NaN, cars off the
road, AI emergency stops near you.

**3. Your marks.** While you play, **F8** drops a mark (every letter key is taken). On the pause
menu, a mark can get a one-line note ("that van came out of nowhere"). When you end a drive, the
game asks three questions, all optional, and you can skip them with one key:
*calm 1–5*, *a car that felt wrong?*, *best moment?*. No more questions than that, or you will
stop answering. In dev mode the journal goes to a small Vite dev-server endpoint
(`POST /__journal`), which writes `playtests/human/<date>-<time>.json`. These stay on your disk:
they are your design history and the calibration set, and git ignores them.

**4. Perception (`src/perception.js`).** What a player in the car can know, and nothing more:
- Forward about 250 m, mirrors about 120 m behind. The neighbouring lanes are visible; lanes
  further away only up to 80 m.
- Cues only: indicator, brake lights, lateral drift toward a line, relative speed (the AR
  overlay's number), and vehicle type and look. Never `intent`, `p`, `tSafe` or the archetype key.
- Slice 3: trucks occlude, on a 2D line-of-sight test on the straightened road.
- The bot drives from this view, and `unannounced` / `phantom-brake` are judged from it. That is
  the whole trick: "unreadable" means unreadable *to someone in the car*.

**5. Bot driver (`src/botDriver.js`).** It drives the real `Player` through the same `ctl`
object the keyboard fills (`steer/throttle/brake/analog`), plus key presses for cruise control,
the indicator and flashing. It never gets a shortcut the keyboard doesn't have. Driver profiles:

| Profile | Drives like | Finds out |
|---|---|---|
| `forens` (commuter) | Cruise at limit +4, keeps right, signals 3 s, overtakes when ≥ 8 km/h faster, flashes a left-lane dawdler after 20 s | The baseline experience |
| `jij` (you) | Its parameters fitted from your journals: set speed, overtake threshold, signal time, headway, how often you use cruise control | Slice 4. Whether the bot's day looks like yours |
| `slak` (slowcoach) | 10 under the limit, middle lane | Does the AI react to a bad player believably? |
| `dwars` (awkward) | Short signals, late merges, sometimes brakes for nothing | Do the AI's defences hold, or does it collide or panic? |

**6. Runner (`tools/playtest.js`).**
`npm run playtest -- driver=forens min=20 seeds=5 tod=day [scenario=closure] [frames]`
writes `playtests/bot/<run>/` (gitignored), containing the journals plus `report.md`. With
`frames` (needs `npm run build`), the runner uses the `clip.js`/`shot.js` machinery to shoot a
bonnet-view frame and a lane-map frame at the three worst and the three best moments, so Claude
can *look* at them, not only read numbers. Every moment carries `seed + t`, and because the bot
is deterministic, `node tools/playtest.js seed=3 until=412 clip` reproduces it.

**7. Report (`report.md`).** Fixed order, so two reports can be compared:
1. Header: commit, profile, seeds, minutes, config diff.
2. **M1 check**, the milestone's own done-criterion made literal: across the drives, how many had
   at least one good moment of severity ≥ 2 and zero `unannounced`/`pop-in`/`phantom-brake`.
3. Rates per 10 minutes for each moment kind, calm share, and driven speeds against the
   expectations in the speed-realism note.
4. Timeline of each moment, written from the seat: "12:40, km 21.3: white van in lane 2
   moved in 0.6 s after its indicator came on, 34 m ahead, you braked 2.8."
5. Health.
6. With a baseline (`base=<run>`): a diff of the rates. That is the A/B in experiential terms,
   next to `abtest`'s mechanical one.

**8. Compare (`tools/compare.js`).** Human journals against bot runs:
- For each of your marks: which detectors fired within ±5 s. A mark with nothing firing means a
  **missing detector**. A detector firing often with no mark near it means it is **noise** or the
  threshold is too strict. The output is a per-detector agreement table, and the thresholds move
  to fit it.
- Distribution diff between you and `jij`: time in lane, overtakes per 10 km, signal time, cruise
  control use. Large gaps mean the bot isn't driving like you yet, so its reports don't speak for
  you yet.

## How we use it

- **After every traffic change**, Claude runs `playtest` with `base=` against the previous commit
  and reads the report and frames before telling you it works. This replaces "the numbers in
  simtest look fine" with "from the seat, 2 fewer cut-offs per 10 min, and no new unannounced
  moves".
- **After you play**, you just play; F8 is enough. Claude reads your journal: your marks, notes and
  answers, plus which moments fired. The note "felt wrong somewhere around the closure" becomes
  "11:02, a patser cut in at 0.5 s; here is the frame". That turns vague feedback into a
  reproducible seed + time.
- **Your judgement stays the top authority.** A bot report can say "this got worse" and be
  overruled by one playtest. A playtest can't be overruled by a bot report.

## Slices

- **Slice 1: journal + marks + detectors on your drives (M).** `journal.js`, `moments.js`, F8, the
  end-of-drive questions, the `/__journal` endpoint, and a `tools/report.js` that turns a human
  journal into the same `report.md`. *Done when* a 20-minute drive of yours produces a report in
  which you recognise your own drive, and each of your marks has a timestamp and a frame-able
  `s`.
  **Built:** all of the above, plus `npm run moments`: hand-built journals for one rule at a time
  (`tools/momenttest.js`) and a real-sim stage test (`tools/momentstage.js`) that drives five staged
  situations through `Road` -> `Player` -> `Traffic.step` -> `Journal` -> `detectMoments`, so a
  detector is checked against what the sim actually recorded (`veh.brake`, `veh.indicator`,
  `veh.lane`, `veh.latLocal`) and not only against synthetic rows. Both use one checker
  (`tools/lib/momentcheck.js`), and every failure says whether the *situation* was missing
  (FIXTURE) or the *rule* misjudged it (DETECTOR). `npm run moments:stage -- only=ES trace` prints
  the journal rows the detector saw, `order=reverse` reruns in the other order, `dump=<dir>` writes
  the journals for `npm run report`.
  Watch items from building it: `v` is km/h while `util.js` `KMH` is m/s per km/h, so m/s is
  `kmh * KMH` (a first draft used `/ KMH` and turned 0.4 m/s² into 5.6); the recorder keeps a
  wider window than `popInM` and never lets its nearest-N cap hide a car inside 150 m, or every
  car crossing the window edge reads as a pop-in; `unannounced` counts the small pre-move lean
  (the telegraph), not the crossing itself, or every 3.5 s lane change is "announced".
- **Slice 2: bot driver + runner (M).** `perception.js` without occlusion, `botDriver.js` with
  `forens` and `slak`, `tools/playtest.js`. *Done when* `forens` drives 20 minutes on 5 seeds with
  0 player collisions, overtakes, merges and uses cruise control the way the keyboard does, and
  the report renders.
  **Built:** `src/session.js` (render-free sim setup/step, key mapping, flash, closure rolls),
  `src/perception.js` (whitelisted cues, no occlusion), `src/botDriver.js` (`forens` + `slak`, a
  keyboard-only driver with cruise clicks, overtaking, returns, aborts, closure merges and
  flashing), `tools/playtest.js` (one child per seed, journals, traces, `run.json`, `report.md`,
  `until=`) and `npm run bottest`. `Player`'s crash/scrape throttles now run on sim time, and
  `main.js` drives the same `session.js` as the bot. `driver=forens min=20 seeds=5 tod=day`: 0
  contacts, 0 scrapes, 0 red crosses, min bumper gap > 1 m, every change signalled, 5-18 overtakes
  per 20 min. Watch items from building it: (1) the gate's p50 = limit + 4 ± 2 and right-lane
  share ≥ 50% cannot both hold on default day traffic — the traffic itself runs at about 86/96/103
  km/h in lanes 0/1/2, so a bot that keeps right follows at the right lane's pace (p50 89-98) and
  cruise share lands at 56-86%; it gets right share up to 66% on some seeds. (2) Steering latency
  (the body must move 0.25 m before the journal sees a change) puts a few `lane-change-start`
  events 0.05-0.2 s outside the 2.5-4 s window; closure merges can be longer. (3) A closure is
  detected from the first arrow or red cross (up to 750 m early); with no gap it slows to the
  neighbour lane's pace and merges late. `scenario=closure` is clean; random closures occasionally
  cost one signal-time outlier.
- **Slice 3: frames, reproduction, occlusion, `dwars` (S–M).** *Done when* each worst moment in a
  report comes with two frames and a one-line command that reproduces it.
- **Slice 4: calibration (M).** `compare.js`, the `jij` profile fitted from your journals,
  thresholds tuned. *Done when* at least 3 of your journals exist and ≥ 70% of your "felt wrong"
  marks have a detector firing within 5 s, while each detector fires at most twice per 10 minutes
  without a mark near it.

## Open: what the stage test cannot see yet

Found while building `tools/momentstage.js`. Each one is a probe there rather than a fixed
fixture, so the number stays visible:

- **Closure obstacles never reach the journal.** `addClosure` puts `c.obs` in the lane lists, not in
  `traffic.vehicles`, and `Journal.sampleAt` reads only `traffic.vehicles`. A car leaving a closed
  lane, or braking for the arrow board, is likely to be called pointless or a phantom brake.
  `probe-closure` records it: the car is reported as braking with nothing visible ahead. Fix:
  record closure obstacles as journal rows.
- **`pointless-lane`'s leader window is a hard-coded 120 m** (`o.dl - v.dl > 120`), not
  `cfg.pointlessM`. `probe-far` shows what it means: pulling out for a 70 km/h car 130 m ahead
  counts as pointless. Fix: make it a CONFIG key with the same value, then calibrate.
- **Decide whether pulling out for a slow car 130-200 m ahead counts as pointless from the seat.**
  That is a calibration question, not a code one: your marks decide.
- **Brake-light on/off events for nearby cars.** The journal samples at 2 Hz, so a tap shorter than
  0.5 s can fall between samples and be invisible. Recording the on/off events (like the player's
  own control changes) would make the brake column trustworthy.

## Truth rules

1. The report states observations, never verdicts about fun. "Calm share 0.82" is fine; "it
   feels calm" is not.
2. Detectors judge from `perception.js`, never from AI internals. If the player couldn't have
   seen it, it isn't "unreadable"; it's a sim fact for the health block.
3. Every moment can be reproduced from `seed + t`.
4. A detector that disagrees with your marks gets re-tuned or cut. The bot answers to you.

## Gotchas

- Every letter key is bound (see `main.js` and `input.js`), so the mark goes on F8. Check that the
  browser doesn't eat it first.
- `tools/scenario.js` `you=ai` makes an *AI vehicle* play you. That is the opposite of what we need
  here: the bot must drive `Player`, with its physics and cruise control clicks.
- `Player` takes `road` (render-free, `road.js` imports only `util.js`), so it already runs in
  Node. Keep it that way.
- Free play uses `Math.random` for closures. The runner must seed it, or `seed + t` reproduces
  nothing.
- fps and stutter exist only in your journals. Don't let a bot report pretend to cover them.
