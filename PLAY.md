# Play

<!-- vibeview play v1. Things to try when you next play or use the project: one item per build
that wants a human look. Format: see vibeview/FORMAT.md -->

## P-1 · Proefrit frames: the six moments with their stills
- from: Q-5
- plan: docs/specs/F-37-slice-3.md
- added: 2026-11-26

`npm run build`, then `npm run playtest -- driver=dwars min=10 seeds=2 frames` and open the
`report.md` it prints the path of: section 4 ends with the six moments, each with the command that
reproduces it and the two stills next to it. For one moment only:
`npm run playtest -- driver=forens seed=1 until=33.3 frames`.

## P-2 · Busy traffic at 60 fps, cars still look the same
- from: Q-15
- plan: docs/specs/F-54-draw-calls.md
- added: 2026-11-26

`npm run dev`, menu → Traffic 25, drive a minute in the cockpit view with the fps counter on: it
should hold 60, and nothing about the cars (colours, lights, indicators, the patser's smoked tail
lamps, trailers swinging) looks different. Then at night.

## Passed
