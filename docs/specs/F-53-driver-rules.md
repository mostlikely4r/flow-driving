# F-53: driver rules, and the audit of the AI against them (spec)

Status: ready to build (the audit). Written 2026-11-27. BACKLOG item **F-53** (Driver rules: what a
sane driver does); the talk was QUEUE entry Q-13, the audit is the build entry that follows it.

*Decided* marks the user's own calls. *Proposal* marks the planner's. Each rule says where it comes
from: **user** (how the user drives, told in the Q-13 talk), **seen** (what the user sees other
drivers do), **journal** (measured in `playtests/human/`), **law** (Dutch traffic law, RVV 1990),
**research** (car-following and driving-behaviour literature, from the planner's knowledge, not
looked up for this plan) or **guess**.

## 1. Why

Every driver in the game is a set of numbers: a baseline in `src/traffic.js` (`makeVehicle`, around
lines 370–460: speed offset, headway `T`, politeness `p`, keep-right `bias`, `antic`, `tSignal`,
`driftMax`, `wanderA`) that each archetype in `src/archetypes.js` then overwrites almost entirely.
Nothing says what the numbers *should* do, so nothing says whether a leasebak's 0.8 s headway is a
deviation from a norm or just another value, and a new behaviour (rain, jams, merges) gets tuned per
persona without a rule to check it against.

This item writes the rules down in plain language first (*decided*: "write the rules first, then
personas as deviations, then audit the current AI against them; no code in the first pass"). The
rules are in this document (section 3). The **build** of this plan is the audit (section 6): read the
code and run the existing tools against every rule, and write down what conforms, what needs
tuning, what is missing, and what slices follow. No game code changes in this item.

The user's own driving is one of the four sources, not the norm (*decided*: "I might not be a
typical driver… I could be a persona"). Each rule carries a tag for how common it is:

- **everyone**: a base rule; every driver follows it, archetypes only shift its numbers.
- **most**: a base rule that some personas break on purpose.
- **minority / persona**: not a base rule; it belongs to one or more personas (section 5).

## 2. The picture: what "right" looks like

The user's "that's exactly it" moment (*user*): after an overtake you look ahead and see a string of
cars at your speed or faster, all keeping right, with plenty of space and two empty lanes to their
left. Traffic that reads like separate people each holding their own speed, moving left only for a
reason you can see, and back right when the reason is gone.

The things that break it (*seen*, the user's top annoyances): a car that overtakes you and then
slows in front of you; a slower car sitting in the middle or left lane with nothing to overtake; a
car that speeds up while you overtake it. And in the game (*user*, played): a jerky sideways
movement before a car signals, or when you flash it ("never seen that in real life"); and cars that
sit exactly in the middle of their lane, where real cars wander and the distracted ones drift over
the right line.

## 3. Base rules

Each rule: the rule, its source, its tag, the numbers we have, and **Check**: how a headless tool
could tell whether the AI follows it (existing tool where there is one; otherwise the probe it
would need, which the audit names but does not build).

### Speed

**R1. The chosen speed is a ceiling.** A driver picks a speed relative to the posted limit; traffic
only ever lowers it, almost never raises it. *User; everyone.*
Check: `npm run speeds` (wanted vs driven per archetype and lane); driven speed never above wanted
except while passing (R14).

**R2. The chosen speed is what the speedometer shows.** Real speedometers read high (by law never
under, in practice 3–5%), so the user's cruise at 109 indicated is ~104 true. Setting 5–10 over on the
display is common in the Netherlands. *User; most.* Numbers: user 109 indicated on a 100 road,
139 on 130, 129 on 120. Journal (2026-11-20 drive): set speed mostly 106–108 (true). Memory of the
user's earlier call: normals at limit +5 true, speeders 110+ by day, 140+ at night.
Check: `npm run speeds`: ordinary drivers' wanted speed is `normalOffsetKmh` 6 ± 3 (config.js:44)
over the limit, in true km/h. Note: **the HUD shows true speed** (`hud.js:47`, `player.speedKmh`),
not what a real dashboard shows. That is a separate small item (F-62), not this audit.

**R3. The same margin holds at night**, where 130 is allowed. *User; everyone who keeps a margin.*
Check: `npm run speeds` night half.

**R30. At night a real minority stays at 100 where 130 is allowed**, and it is more common than
doing 120 in a 100 by day. *Seen; minority, and a real one.*
Check: `npm run speeds` night: is there a group of cars wanting ~100 under a 130 limit? Today
`slowpokes` (config.js:36) is limit −3..−9, which at 130 is 121–127, not 100. Likely missing.

### Holding speed

**R4. Speed is held in one of three styles.** *Proposal*, from the user's answer:
- **cruise control** (the user): speed steady, changed in steps; slowing is done by releasing the
  cruise and coasting, not braking; cruise off in jams and while accelerating on an on-ramp.
  *User; you plus many.* Journal: cruise on 88% of the 2026-11-20 drive.
- **manual**: speed wanders 3–5 km/h around the wanted speed. *Research/guess; most of the rest.*
- **adaptive cruise (ACC)**: follows at a set time gap, so gap-first by design. *Guess; a growing
  minority*, the natural fit for the EV smoothie.
A coasting car shows no brake lights: the AI's lamps go on below −0.85 m/s² (traffic.js:1722), and
coasting is gentler than that.
Check: per-vehicle speed trace over a free-driving stretch (spread of `v` around `v0` with no leader
within 150 m); the probe would be a small addition to `speeds.js`.

### Gaps: two regimes

**R5. Speed first in light traffic, gap first in busy traffic.** *User; everyone (research: the
free-driving / following split of psychophysical car-following models such as Wiedemann's).*
- **Free driving** (light traffic): the driver holds its speed and the gap is a consequence. It acts
  on the car ahead only when a threshold is crossed: closing fast enough to notice, or close (about
  2 car lengths) at nearly the same speed (±2 km/h), then it settles at ~2 s and matches speed. In
  between, the gap drifts. *User:* "if a car is faster or slower the gap is moot."
- **Following** (busy traffic): the driver follows the car ahead and "zones out", gap-first. *User.*
Today every AI driver is IDM, which is gap-first all the time: it reacts continuously to every half
km/h of difference to the car ahead. That fits the following regime and not the free one, which may
be why traffic can look tied together rather than like separate people.
Check: in light traffic (density ≤ 8), how often a car with a leader 60–150 m ahead at ±3 km/h is
changing speed at all (|a| > 0.1 m/s²). Free-driving drivers should mostly not be. Needs a probe.

**R6. In a jam with no way out, most drivers close the gap so nobody cuts in.** A courteous minority
(the user) leaves room for one car to merge: about a lorry length or 3 cars. *User + seen; base rule
is the small gap, the room is a persona trait.*
Check: standstill and creep gaps in `?scenario=wave` / `closure.js` queues, per archetype.

**R7. The accordion.** When the car ahead pulls away briskly, the driver overshoots while catching up
and the gap shrinks; when it creeps forward, the gap is let grow. *User; everyone.* This is what
makes stop-and-go waves. Q-19 (F-22 calibration) is about to change pull-away anticipation per
persona: the audit records the state after Q-19 if it has been built, and notes it otherwise.
Check: gap over time behind a leader accelerating 0→50 at 1.5 vs 0.5 m/s² (`wave.js` style run).

### Overtaking

**R8. An overtake is planned so the driver never has to slow down.** When it is noticed depends on
the closing speed and how busy the driver is with other traffic. *User; everyone tries, how early
varies* (today's `antic`).
Check: share of overtakes preceded by braking under −0.5 m/s² behind the slower car (detector-style,
from a playtest journal).

**R9. Look behind first; if clear, pull out about 2 car lengths behind** the slower car. *User;
everyone, the distance varies.*
Check: gap to the overtaken car at lane-change start (journal lane-change events).

**R10. With someone coming up behind, judge who is first.** Either let them pass and pull out after,
or move out early, before they arrive, so you are not boxed in and forced to slow; keep re-checking
both speeds. *User; most attentive drivers.* The patser just goes; the pensioner waits.
Check: `boxed-in` detector (moments.js:20) rate, and how often an AI car slows behind a slow car
while a car passes it on the left.

**R23. Don't overtake and then slow in front of the car you passed.** If you are slowing for
something further ahead, overtake that too or don't overtake. *Seen; base rule, breaking it is what
annoys.*
Check: after a car passes and returns in front of another, does it brake within ~10 s with the
passed car closing? Close to the `cut-off` and `pointless-lane` detectors but not the same; the
audit says whether either catches it.

**R24. Don't speed up while someone is overtaking you.** *Seen; base rule.* Doing it is a persona
trait (and usually has to ease off soon for the next car anyway).
Check: a car's wanted or driven speed while a car alongside to its left is passing it. Needs a probe.

**R14. When someone fast closes in while you overtake**, speed up a little, not more if they flash,
and pass with a clear speed difference (no elephant race). *User; most.* Patser and leasebak push
harder, the pensioner does not change. (Lorries' elephant races are a separate, intended thing.)
Check: speed gain during an overtake with a faster car behind vs without; `elephant-race` detector
is lorries only.

### Lane choice

**R11. Keep right is the default.** Stay out of the right lane only for a reason you can see.
*User + law (RVV art. 3); law-abiding majority.* Middle-lane hogging is a deviation (R25, section 5).
Check: `left-dawdler` and `pointless-lane` detectors; share of time per lane in light traffic.

**R12. Look ahead before going back right.** A clearly slower car or lorry in the right lane within
~300 m: stay out and pass it too. Otherwise go back right and move out again when closer. *User;
most, look-ahead distance varies.* Today `pointless-lane` uses 120 m (`CONFIG.moments.pointlessM`,
`pointlessLookM`, config.js:155–156); the rule's distance is ~300 m.
Check: per return-right, the distance to the next slower car in the target lane; the share of
returns with one within 300 m.

**R13. Pressure from behind makes you go right sooner**, as long as the fast car will be past before
you need to move out again. *User; most attentive drivers.*
Check: time from a faster car closing within ~100 m behind to the car moving right, vs without.

**R25. A slow car in the middle or left lane is overtaken normally.** Some drivers (the Cruiser,
section 5) cross two lanes, pass it and cut back in a little closer than they would grant others,
as a hint; the hogger often moves right after that. *User + seen; the hint is a persona trait, the
hogger moving right after it is a base rule.* A readable exchange between two drivers.
Check: hoggers' lane changes to the right within ~20 s after being passed on the left vs at random.

**R26. A slow car in the left lane with two empty lanes beside it**: follow at a distance and don't
flash. *User; the Cruiser.* Others flash (the leasebak; F-46 is parked).

### Lane changes and signalling

**R16. Mirror checks increase with need**: constantly, and more once a slower car within ~300 m may
need passing. *User; everyone.* In the AI this is perception (`antic`, `tPrep`) rather than a mirror.

**R17. Only a car coming up faster blocks a lane change.** A car at your own speed some distance back
does not; a car closing (at any speed) does, out to ~300 m. *User (corrected in the talk); everyone,
the distance varies.*
Check: gap and closing speed of the follower in the target lane at each AI lane change (journal).

**Signalling (base).** Signal ~1–3 s before the move, as F-38 built ("a signal means the car will
move"). *Law + the Readable pillar; most.* The user describes giving one flash as they move and
cancelling right after, and makes up for it by only moving when nobody behind is affected (R17).
That is a persona trait (the Cruiser), not the base. Note: the 2026-11-20 journal measured the
user's signal-to-move median at ~1.4 s over 25 changes, longer than the user's own description; the
audit compares this with the other human journals before the Cruiser's number is set.
Check: `npm run signals` over AI runs and over the human journals.

**R15. A car that pulls in ahead changes nothing** if it is faster (the gap grows, fine); if it is
slower, or brakes, it becomes a new slow leader (R5) and you overtake it when needed. *User;
everyone sane.* F-18 (cut-in overreaction, `coolness` 0.99) is meant to give this.
Check: braking of the car behind when a faster car cuts in 15–30 m ahead.

### Merging, exits and closures

**R18. Merge at speed, as early as the road allows.** On the ramp get up to cruise speed or at least
~95 on a 100 road; the merging car gives way (*law*: RVV art. 54); a fast car behind simply passes
first. Cruise is off while accelerating on the ramp. *User; most.* The pensioner merging slowly at
the start of the strip is the deviation (`mergeKmh` 28, `mergeEarly` 0.8–1).
Check: `npm run onrampsuite`: merge speed difference and position on the strip per archetype.

**R19. A slower merger ahead on the same strip doesn't set your speed**: merge first and pass it; it
merges behind you. *User; most of those who merge at speed.*
Check: two mergers on one strip in `onramp.js`; does the faster one pass?

**R20. Making room is early and free.** A car in the right lane moves left when it sees cars coming
down the ramp, long before they reach the strip, if the next lane has room. Nobody slows down for a
merger; the merger adapts. *User; most.* (The user does it "badly so", often earlier than useful.)
**Already a known gap.** F-20 slice 3 step 3 built "making room" and dropped it
(`docs/specs/F-20-slice-3-making-room.md`, from line 207): it was reactive (move over for a merger
alongside or just behind) and fell back to **lifting off** when the car could not move; lane 1 was
too full, so the lift-off ran ~1.7 of the time and the right lane near the ramp fell to 7–31 km/h.
R20 differs on both counts: early, from seeing the ramp traffic, and never slowing down.
Check: `npm run onrampsuite` courtesy reading (kept in `tools/onramp.js` for this).

**R21. Exit:** within ~1 km of the exit, sitting behind a slow lorry is fine; before that, use
gaps; with no gap by ~500 m, slow, signal and wait: a wall of lorries opens up sooner or later
because its drivers react late. *User; everyone.* F-21 slice 1 already works right from 700–1800 m
by `mergeEarly` and misses rather than dives.
Check: `npm run exitsuite` (already has the numbers).

**R22. Closure:** merge early, at speed, whenever there is a gap, without slowing down to ask; with no
gap, merge at the end. *User; most (the user's sense).* Drivers who drive to the end and zip in
(leasebak, patser `mergeEarly` ~0–0.3) are the deviation. Rijkswaterstaat advises zipping at the end
and the A12 at rush hour shows both; the spread stays.
Check: `node tools/closure.js`, merge position per archetype.

### Lane position

**R27. No car sits exactly in the middle of its lane.** Every car wanders slowly, now and then over a
line; how much varies per driver. Before a lane change a car may lean slowly toward the line, never
jerk. *User + seen; everyone.*
Today: `wanderA` 0.05–0.19 m with `wanderW` 0.08–0.33 rad/s (traffic.js:432–433, applied at :1742),
too small to see. The pre-move lean is F-07's intent drift: `driftMax` 0.15–0.45 m × `telegraph`
(traffic.js:442, :462), moved at up to 0.3 m/s (:1737–1739), and per archetype (the leasebak
0.35–0.55 m, archetypes.js:33). A flash (`flashFrom`, traffic.js:1797) sets `pressureT` 7, `decT`
0.3 and `cooldown` 0.5, so the car decides at once. The user has never seen the jerk in real life
(*user*, played): the audit finds what makes it (the drift's rate, it being withdrawn and re-applied
as the intent toggles, the flash shortcut, or the lane change's start).
Check: lateral position and lateral speed per car over time; histogram of |lat − lane centre| and of
lateral speed outside lane changes. Needs a probe.

### Human limits and attention

**R28. Attention is a state that comes and goes**: tired (the user: often fighting sleep on the same
stretch after lunch at the weekend), zoned out in busy traffic, distracted. While it lasts it raises
reaction time, widens lane wander and lowers speed; a distracted driver is slower and drifts onto the
right edge line. *User + seen + research; everyone, some of the time.* Not a persona: any driver can
be in it for a while. Missing today (`react` is fixed per driver).
Check: none possible today; the slice that adds it brings its own.

**R29. Speed follows the flow more than the weather.** Many keep their speed in rain until others
slow, then slow too. *User; you plus many.* Rain slice 1 (Q-14, `docs/specs/F-24-rain.md`) already
has "some drivers not at all", and following the crowd mostly happens by itself (a driver that does
not slow gets stuck behind those that do). The audit checks it once Q-14 is built.
Check: `npm run rain` (from Q-14) per persona.

**Spray** (from the F-24 talk that raised this item): nobody drives blind behind spray for more than
a moment; they back off or overtake within 1–2 s. *User; everyone.* Q-14 builds it.

## 4. Regimes and states

*Proposal*, summing up R5, R7 and R28. A driver is at any moment in one regime and one state:

| Regime | When | Behaviour |
|---|---|---|
| Free | no leader within its threshold | holds its speed (in its R4 style); the gap is a consequence |
| Following | close behind a leader at similar speed, busy traffic | gap-first (today's IDM) |
| Jam | stop-and-go, no way out | small gaps (R6), accordion (R7) |

| State | Effect while it lasts |
|---|---|
| Attentive | the persona's own numbers |
| Tired / zoned out / distracted | slower reaction, more wander (R27), a little slower, signals late or not at all |

## 5. Personas as deviations

The existing archetypes (`src/archetypes.js`: leasebak, patser, pensioner, sok, family, whitevan, ev,
plus lorries) and the baseline's `hogger` flag (config.js:37 `middleLaneHoggers` 0.07; traffic.js
~465: hoggers only move for a flash). The audit fills in, per persona, which base rules it breaks
and how (the table in section 6 step 4). What each one *should* break, as agreed or proposed:

| Persona | Breaks | Source |
|---|---|---|
| Leasebak | R1 margin (+18–32), short gap, R14 pushes, R22 zips, flashes (R26) | existing |
| Patser | R14, R15 (overreacts), R17, R22, R24, signalling | existing |
| Pensioner | R1 (under the limit), R10 waits, R18 slow early merge | existing |
| Grijze sok | R1 (under), R5 (seeks a lorry to follow) | existing |
| Family | none: the calm baseline | existing |
| White van | R1 margin, R11 (middle lane), short gap | existing |
| EV smoothie | R4 as ACC, R11 (camps in the middle) | existing; ACC is a proposal |
| **Cruiser** (new) | see below | *decided* |
| **Middle-lane cruiser** (new) | see below | *decided* |

**Cruiser** (*decided*: the name and that it is the user's own style). On cruise control, keeps right,
moves late but only when nobody is affected. Its deviations from the base:
- R2: wants limit + ~4 true (+9 indicated), at night too (R3).
- R4: the cruise style, always, changed in steps; coasts rather than brakes.
- R6: leaves room for one car to merge in a jam (a lorry length / 3 cars).
- Signalling: one short flash as it moves (until the journals say otherwise), made safe by R17
  being strict: it does not change lane if any car behind in the target lane is closing within
  ~300 m.
- R20: makes room for ramp traffic early, often earlier than needed.
- R25: the hint pass: crosses two lanes to pass a middle-lane cruiser and cuts back in a little
  closer than it would grant others (*decided*: "would like seeing that").
- R26: follows a left-lane camper at a distance, no flash.
- R28: more often in the tired state on long weekend stretches (*user*).
The Proefrit bot profile `jij` (F-37 slice 4, `src/botDriver.js`, beside `forens`, `slak`, `dwars`)
keeps its name: it is the bot fitted to the user's journals and starts from the Cruiser's numbers
(*decided*: `jij` stays the fitted bot, the traffic persona is the Cruiser).

**Middle-lane cruiser** (*decided*). Drives at or a little under the flow in the middle lane with the
right lane free; doesn't notice cars behind; moves right after being passed closely (R25) or flashed.
Named for the habit, **never for a country**. The user's reasoning (*decided*): drivers carry their
home country's lane habits across the border, as a Dutch driver carries Dutch habits into Germany;
it is a habit with a cause, not a character trait. So:
- its cars carry a **foreign (white) plate** more often than other cars, but not always: some
  middle-lane cruisers have Dutch plates, and most foreign-plated cars belong to the other personas
  (*proposal*: about half its cars foreign, and a few percent of all other cars foreign);
- plates today: every car has a Dutch yellow plate, front and rear, as a `plate` part
  (`src/vehicles.js:275–277`); a foreign plate is a second plate colour, no lettering;
- it can take over the baseline `hogger` flag, or sit beside it: the audit proposes which.
F-45 (archetypes based on nationality, dropped) stays dropped for character traits and gets one line:
reopened narrowly for this one habit, for the reason above.

## 6. The build: the audit

No change to `src/`, `tools/` or `CONFIG` in this item. Throwaway measurement scripts are fine
outside the repo (the scratchpad); a probe that should stay becomes part of a slice.

Read these first: this plan, `docs/vision.md` (pillars), `src/traffic.js` (`makeVehicle`, the lane
change and intent code, the lateral step around :1720–1745, `flashFrom`), `src/archetypes.js`,
`src/config.js`, `src/moments.js` (the detectors), `docs/F-37-proefrit.md` (the `jij` profile),
`docs/specs/F-20-slice-3-making-room.md` (step 3), `docs/specs/F-22-calibration.md` and
`docs/specs/F-24-rain.md` (what Q-19 and Q-14 change).

**Step 1: map each rule to code.** For R1–R30 and the signalling rule: the file:line and knobs that
implement it, or "nothing". One line per rule.

**Step 2: measure.** With the existing tools, one run each where they apply: `npm run speeds`,
`npm run signals` (over an AI playtest run and over every journal in `playtests/human/`, read-only),
`npm run onrampsuite`, `npm run exitsuite`, `node tools/closure.js`, `node tools/wave.js`,
`npm run moments`, and one `npm run playtest -- driver=forens min=10 seeds=3` (in the background,
output to a log) for the detector counts. From the human journals also: cruise share, set speeds,
lane-time share, signal-to-move times; they are the user's calibration set (never edit or delete
them). Where a rule's **Check** needs a probe, write a throwaway one if it takes under an hour;
otherwise name it.

**Step 3: verdict per rule.** A table: rule · verdict (**conforms**, **tune** (exists, wrong numbers),
**missing**, **can't check yet**) · evidence (numbers, file:line) · what a fix would touch. Rules
whose code Q-19 or Q-14 is changing (R6, R7, R29, spray) are judged on the tree as it is and marked
"re-check after Q-19" / "after Q-14" if those are not built yet.

**Step 4: personas.** For every archetype, the hogger flag and the two new personas: which base rules
it breaks in the code today, against section 5. Flag a persona that breaks a rule it shouldn't, or
fails to break one it should.

**Step 5: the jerky drift.** Find what makes the sideways movement the user saw before a car signals
and after a flash (R27): reproduce it in a scenario or probe, name the cause in file:line terms, and
say what the fix would be. This is the one finding the user saw in play, so it gets a direct answer.

**Step 6: candidate slices.** A short list, each with value / effort / risk as in
`docs/vision.md`, the rules it serves, the files it touches, and the check that would close it. At
least these four, ranked by the audit's evidence:
1. **Early making room at on-ramps, without lifting off** (R20): move over when ramp traffic is
   seen and the next lane has room; never slow down for a merger. Say why it would not hit the
   slice-3 deadlock.
2. **Lane wander, attention states and the pre-move drift** (R27, R28, step 5).
3. **Speed-first car-following in light traffic** (R5, R4 styles): the free regime with action
   thresholds on top of IDM. It changes the core step, so every seed moves and Q-19's calibration
   must be re-checked after it.
4. **No speeding up while being overtaken, no pointless overtakes** (R24, R23, with R12's 300 m).
Plus the two new personas (Cruiser, middle-lane cruiser with foreign plates) as one slice, and any
slice the audit's "missing" rows call for.

**Step 7: write it down.** The audit goes into `docs/specs/F-53-audit.md` (steps 1–6). In BACKLOG,
F-53 gets one line on what the audit found and a link to it; the candidate slices are **not** queued:
they come back to the user to pick in a pair session.

## 7. How we'll know

- `docs/specs/F-53-audit.md` exists with a verdict for every rule R1–R30 and the signalling rule, each
  with evidence (a number or a file:line), the persona table, the drift cause, and the ranked slices.
- `git diff` touches no file under `src/`, `tools/`, `playtests/` or `src/config.js`.
- `npm run build` still passes (nothing should have changed it).
- **Try it:** open `docs/specs/F-53-audit.md` and read the verdict table top to bottom (a few
  minutes): every rule you described in the talk should be there, with "conforms" only where you'd
  agree from driving. Then read step 5's answer and, if it names a scenario, run it with `npm run
  dev` and `?scenario=<name>` and watch the car it points at.

## 8. Not doing

- No code, no tuning, no new detector in this item (*decided*: "no code in the first pass").
- No persona named for, or behaviour tied to, a nationality beyond the one middle-lane habit with
  over-represented foreign plates (*decided*; F-45 stands otherwise).
- The user's own driving is not the base rule set (*decided*); where it differs it is the Cruiser.

## Needs first

- Nothing to build. The tools named in step 2 exist (`tools/speeds.js`, `signals.js`, `onramp.js`,
  `onrampsuite.js`, `exitsuite.js`, `closure.js`, `wave.js`, `momenttest.js`, `playtest.js`). The
  human journals are in `playtests/human/` (local, git-ignored).
- Q-19 (jams calibration) and Q-14 (rain) may or may not be built when the audit runs; step 3 says
  how to handle either.

## Not in this build

- Every slice in step 6: picked by the user after the audit, then specced.
- F-62: the HUD speedometer reading high like a real one (R2).
- The `jij` profile itself (F-37 slice 4) and fitting it to the journals.
- Foreign plates as a visual (part of the new-personas slice).
- Anything for rain beyond checking R29 once Q-14 is in.
