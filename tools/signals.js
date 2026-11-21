// Proefrit (F-38): what a signal promises, over drive journals.
//
//   npm run signals -- <journal.json | run dir> …      (a run dir means its
//                      seed-*.json; `seed-*.trace.json` is never read)
//
// A signal episode starts when a vehicle's indicator goes from 0 to ±1 in the
// journal, and ends when
//   * the lane the body is in changes:  moved (the indicator staying on until
//     the move completes is the same episode), or
//   * the indicator returns to 0 in that same lane:  withdrawn, or
//   * the car leaves the recorded range before either:  lost (not counted).
// For the withdrawals held 6 s or longer it looks for the blocker in the target
// lane, half way through the hold. Prints per input group and a total, plus the
// `empty-signal` rate from the same journals, so one command shows both views.
//
// Rendering-free: readSamples and effLane are the detector's own readers, so
// this sees exactly what `detectMoments` sees.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readSamples, effLane, detectMoments } from '../src/moments.js';
import { innerEdge } from '../src/layout.js';

const MIN_HOLD = 6; // a withdrawal this long is the promise-not-kept case
const RESIGNAL_S = 20; // a new signal this soon after a withdrawal is the loop

// ------------------------------------------------------------------ helpers
const num = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));

/** Nearest-rank quantile (the value at or below that share); null for none. */
function quant(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor((s.length - 1) * p)];
}
const per = (n, minutes, base = 10) => (minutes > 0 ? (n / minutes) * base : 0);

function expand(paths) {
  const groups = [];
  for (const p of paths) {
    let st;
    try {
      st = statSync(p);
    } catch {
      console.error(`Skipping ${p}: no such file or folder`);
      continue;
    }
    if (st.isDirectory()) {
      const files = readdirSync(p)
        .sort()
        .filter((f) => /^seed-.*\.json$/.test(f) && !f.endsWith('.trace.json'))
        .map((f) => join(p, f));
      groups.push({ name: p.replace(/\\/g, '/'), files });
    } else if (p.endsWith('.json') && !p.endsWith('.trace.json')) {
      groups.push({ name: p.replace(/\\/g, '/'), files: [p] });
    }
  }
  return groups;
}

// ------------------------------------------------------------------ episodes
/**
 * Every indicator episode in one journal, with the blocker at the middle of a
 * long hold. Reads only journal state: indicator, lane, lateral offset, speed.
 */
export function signalEpisodes(j) {
  const S = readSamples(j);
  const h = j.header || {};
  const laneW = h.laneWidth ?? 3.5;
  const nLanes = h.lanes ?? 3;
  const playerLen = h.playerLen ?? 4.8;
  const meta = j.meta || {};
  const lenOf = (id) => (meta[id] && meta[id].len) || 4.5;
  const effOf = (v) => effLane(v, laneW, nLanes);
  const centre = (lane) => innerEdge() + laneW * (nLanes - 1 - lane + 0.5);

  const eps = [];
  const open = new Map(); // id -> episode
  const prevInd = new Map(); // id -> indicator at its previous sample

  for (let i = 0; i < S.length; i++) {
    const P = S[i];
    const seen = new Set();
    for (const v of P.veh.values()) {
      seen.add(v.id);
      const eff = effOf(v);
      const before = prevInd.has(v.id) ? prevInd.get(v.id) : null;
      const ep = open.get(v.id) || null;
      let closed = false;
      if (ep) {
        if (v.ind === 0 || v.ind !== ep.ind) {
          // 0 after the hold, or a flip without a stop: the promise ends here
          ep.i1 = i;
          ep.end = P.t;
          open.delete(v.id);
          closed = true;
        } else if (ep.movedAt == null && eff !== ep.eff0) {
          ep.movedAt = P.t;
          ep.iMove = i;
        }
      }
      // A car that enters the recording already indicating starts an episode
      // too: its start is not observable, but its end is, and the baseline
      // numbers count it (that is a signal in front of you either way).
      if (!ep && !closed && v.ind !== 0 && (before === 0 || before === null)) {
        const e = { id: v.id, ind: v.ind, start: P.t, i0: i, lane0: v.lane, eff0: eff, movedAt: null };
        open.set(v.id, e);
        eps.push(e);
      }
      prevInd.set(v.id, v.ind);
    }
    // a car that drops out of the recording ends its episode as "lost"
    for (const [id, ep] of open) {
      if (!seen.has(id)) {
        ep.i1 = i;
        ep.end = P.t;
        ep.lost = true;
        open.delete(id);
      }
    }
  }
  // anything still open at the end of the drive is also lost
  for (const ep of open.values()) {
    ep.i1 = S.length - 1;
    ep.end = S[S.length - 1] ? S[S.length - 1].t : ep.start;
    ep.lost = true;
  }

  // ---- the blocker for a long withdrawal, at the middle of the hold
  for (const ep of eps) {
    ep.outcome = ep.movedAt != null ? 'moved' : ep.lost ? 'lost' : 'withdrawn';
    ep.hold = ep.outcome === 'withdrawn' ? ep.end - ep.start : null;
    ep.moveT = ep.movedAt != null ? ep.movedAt - ep.start : null;
    if (ep.outcome !== 'withdrawn' || ep.hold < MIN_HOLD) continue;
    const mid = Math.round((ep.i0 + ep.i1) / 2);
    const P = S[mid] || S[ep.i0];
    if (!P) continue;
    const me = P.veh.get(ep.id);
    if (!me) continue;
    const side = ep.ind < 0 ? 1 : -1; // left = a higher lane index (0 = rightmost)
    const target = me.lane + side;
    if (target < 0 || target >= nLanes) continue;
    let best = null;
    for (const v of P.veh.values()) {
      if (v.id === ep.id) continue;
      if (effOf(v) !== target) continue;
      const d = v.dl - me.dl; // + = ahead of the signaller
      if (d < -60 || d > 25) continue;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, kmh: v.kmh, len: lenOf(v.id), player: false };
    }
    // the player is a candidate too: it is in the journal's own columns
    if (P.lane != null) {
      const off = P.lat - centre(P.lane);
      const pe = effLane({ lane: P.lane, off }, laneW, nLanes);
      if (pe === target) {
        const d = 0 - me.dl;
        if (d >= -60 && d <= 25 && (!best || Math.abs(d) < Math.abs(best.d))) {
          best = { d, kmh: P.kmh, len: playerLen, player: true };
        }
      }
    }
    if (!best) {
      ep.blocker = null;
      continue;
    }
    const gapM = -best.d - (lenOf(ep.id) + best.len) / 2; // + = a gap between us
    ep.blocker = {
      behind: best.d < 0,
      dvKmh: best.kmh - me.kmh, // blocker relative to the signaller
      gapS: best.kmh > 3 ? gapM / (best.kmh / 3.6) : null,
      player: best.player,
    };
  }
  return { eps, minutes: (S.length ? S[S.length - 1].t : 0) / 60 };
}

/** Aggregate one journal (or set of journals): the numbers the spec asks for. */
export function summarizeSignals(list) {
  const eps = [];
  let minutes = 0;
  let emptySignal = 0;
  for (let k = 0; k < list.length; k++) {
    const { j } = list[k];
    const r = signalEpisodes(j);
    // Vehicle ids restart with every drive (each bot seed is its own process),
    // so an episode is keyed by drive as well as by id.
    for (const e of r.eps) e.drive = k;
    eps.push(...r.eps);
    minutes += r.minutes;
    for (const m of detectMoments(j)) if (m.kind === 'empty-signal') emptySignal++;
  }
  const moved = eps.filter((e) => e.outcome === 'moved');
  const withdrawn = eps.filter((e) => e.outcome === 'withdrawn');
  const long = withdrawn.filter((e) => e.hold >= MIN_HOLD);
  const blocked = long.filter((e) => e.blocker);
  const blockers = blocked.map((e) => e.blocker);

  // a new signal on the same car soon after it withdrew one
  const byId = new Map();
  for (const e of eps) {
    const key = `${e.drive}:${e.id}`;
    if (!byId.has(key)) byId.set(key, { withdrawn: [], started: [] });
    const r = byId.get(key);
    if (e.outcome === 'withdrawn') r.withdrawn.push(e.end);
    r.started.push(e.start);
  }
  let resignals = 0;
  for (const r of byId.values()) {
    for (const s of r.started) {
      if (r.withdrawn.some((w) => s > w && s - w <= RESIGNAL_S)) resignals++;
    }
  }

  return {
    minutes,
    signals: eps.length,
    moved: moved.length,
    withdrawn: withdrawn.length,
    lost: eps.filter((e) => e.outcome === 'lost').length,
    moveP50: quant(moved.map((e) => e.moveT), 0.5),
    moveP90: quant(moved.map((e) => e.moveT), 0.9),
    long: long.length,
    longPer10: per(long.length, minutes),
    resignal: resignals,
    resignalPer100: per(resignals, minutes, 100),
    blocked: blocked.length,
    behind: blockers.filter((b) => b.behind).length,
    nearSameSpeed: blockers.filter((b) => Math.abs(b.dvKmh) <= 5).length,
    dv: { p10: quant(blockers.map((b) => b.dvKmh), 0.1), p50: quant(blockers.map((b) => b.dvKmh), 0.5), p90: quant(blockers.map((b) => b.dvKmh), 0.9) },
    gap: {
      p10: quant(blockers.filter((b) => b.gapS != null).map((b) => b.gapS), 0.1),
      p50: quant(blockers.filter((b) => b.gapS != null).map((b) => b.gapS), 0.5),
      p90: quant(blockers.filter((b) => b.gapS != null).map((b) => b.gapS), 0.9),
    },
    player: blockers.filter((b) => b.player).length,
    emptySignal,
    emptyPer10: per(emptySignal, minutes),
  };
}

// ------------------------------------------------------------------ printing
function printBlock(title, s) {
  console.log(title);
  console.log(`  ${s.minutes.toFixed(1)} min · signals ${s.signals} · moved ${s.moved} · withdrawn ${s.withdrawn}${s.lost ? ` · lost ${s.lost}` : ''}`);
  console.log(`  signal → move: p50 ${num(s.moveP50)} s · p90 ${num(s.moveP90)} s`);
  console.log(`  withdrawn after ≥ ${MIN_HOLD} s: ${s.long} (${num(s.longPer10)} per 10 min)`);
  console.log(`  signals within ${RESIGNAL_S} s of the same car withdrawing one: ${s.resignal} (${num(s.resignalPer100)} per 100 min)`);
  const pctBehind = s.blocked ? Math.round((100 * s.behind) / s.blocked) : 0;
  console.log(`  of those withdrawals, a blocker in the target lane: ${s.blocked} · behind ${s.behind} (${pctBehind}%)`);
  console.log(`  blocker speed difference (km/h) p10/p50/p90: ${num(s.dv.p10)} / ${num(s.dv.p50)} / ${num(s.dv.p90)} · within ±5 km/h ${s.nearSameSpeed}${s.blocked ? ` (${Math.round((100 * s.nearSameSpeed) / s.blocked)}%)` : ''}`);
  console.log(`  blocker bumper gap behind (s) p10/p50/p90: ${num(s.gap.p10, 1)} / ${num(s.gap.p50, 1)} / ${num(s.gap.p90, 1)}`);
  console.log(`  blocker is the player: ${s.player}${s.blocked ? ` (${Math.round((100 * s.player) / s.blocked)}%)` : ''}`);
  console.log(`  empty-signal: ${s.emptySignal} (${num(s.emptyPer10)} per 10 min)`);
}

const isMain = process.argv[1] && /signals\.js$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const args = process.argv.slice(2);
  const groups = expand(args);
  if (!groups.length) {
    console.log('Usage: npm run signals -- <journal.json | run dir> [...]');
    process.exit(1);
  }
  const all = [];
  for (const g of groups) {
    const list = [];
    for (const file of g.files) {
      try {
        list.push({ file, j: JSON.parse(readFileSync(file, 'utf8')) });
      } catch (e) {
        console.error(`Skipping ${file}: ${e && e.message ? e.message : e}`);
      }
    }
    if (!list.length) continue;
    all.push(...list);
    printBlock(`${g.name}  (${list.length} drive${list.length > 1 ? 's' : ''})`, summarizeSignals(list));
    console.log('');
  }
  if (groups.length > 1) printBlock(`total  (${all.length} drives)`, summarizeSignals(all));
}
