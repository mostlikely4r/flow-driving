# Your drives (Proefrit, F-37)

One JSON file per drive: the journal of a real drive, recorded by the game.

- Drive, then `F8` when something happens. The pause menu (Esc) gives each mark a one-line note.
- *End drive…* in the pause menu asks three optional questions (calm 1–5, a car that felt wrong,
  best moment) and writes the file here. Closing the tab sends it too.
- **These stay on your disk** (git ignores them). They are design history and the calibration
  set: a detector only counts once it fires where you marked a moment. To share a drive, attach
  the JSON to a GitHub issue. A detector that never agrees with you gets cut.

Read one:

```
npm run report -- playtests/human/<file>.json
```

writes `<file>.report.md` next to it: rates per 10 minutes for each moment kind, the M1 check, a
timeline written from the seat, your marks with the detectors that fired within ±5 s, and a health
block. Every mark has a `t` and an `s`, so it can be framed and reproduced.
