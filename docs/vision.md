# Flow Driving: vision, pillars and milestones

The backlog itself is [BACKLOG.md](../BACKLOG.md); this page holds the rules it is scored by.

## Vision

**An authentic Dutch driving simulator where the game is being part of traffic.**

## Design pillars

The pillars decide arguments. When two good ideas conflict, the pillar order says which one wins.

1. **Authentic.** Dutch rules, roads, signs and driver habits. When in doubt, do what really happens
   on the A12 at 17:30, not what is convenient or "gamey".
2. **Readable traffic.** You can see situations build up and predict how they will play out.
   Drivers show what they intend through their position, speed and signals, just as good real
   drivers do. Authentic chaos that you cannot read loses to this pillar.
3. **Calm.** Nothing rewards speed, reflexes or risk. Pressure comes from the flow, never from
   a timer or a score.

Visual quality (car models, lighting) is a *quality bar*, not a pillar. It matters, but it never
justifies a feature on its own.

## How to score

| Field | Scale |
|---|---|
| **Value** | 1–5. How much it strengthens a pillar or the core "drive in traffic" loop. |
| **Effort** | S (an evening), M (a weekend), L (a week or more), XL (must be split first). |
| **Risk** | Low / Med / High. How unsure we are that it can be done well, or that it will be fun. |
| **Priority** | **P0** next up · **P1** this milestone · **P2** later · **P3** someday |

Do high-value, low-effort items first. Test high-risk items with a cheap *spike* (a throwaway
prototype) before committing to them.

## Milestones

- **M1: Readable flow.** Remove the annoyances. Make the AI's intent readable, so that situations
  like the elephant race with a speeder behind play out believably and repeatably. Drivers get archetypes you can recognise
  at a glance. *Done when a 20-minute drive produces at least one "that's exactly it"
  moment without any cars that feel wrong.*
- **M2: The road breathes.** Traffic enters and leaves the motorway through on-ramps and exits.
  Bottlenecks create jams that form and clear again, matrix signs react, and it rains.
- **M3: Going somewhere.** You drive a real route from A to B: take the exit, cross a
  klaverblad (cloverleaf) junction, follow navigation and continue on an 80 km/h N-road.
- **Horizon: Town.** Urban and suburban driving: cyclists, right-turn checks, right of way.
  This is a separate game-sized scope and is parked until M3 has been delivered.

## Done before the backlog

- MVP: 3-lane motorway with IDM + MOBIL traffic, Dutch keep-right rule, trucks, cruise control,
  mirrors, day/dusk/night.
