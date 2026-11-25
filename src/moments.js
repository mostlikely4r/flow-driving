// Proefrit (F-37): moment detectors over a drive journal.
//
// Rules over what a driver in the car could actually know: the journal stores
// only positions, speeds, lanes, indicators, gaps and your own controls. Nothing
// here reads `intent`, `p`, `tSafe` or an archetype, so "unreadable" means
// unreadable from the driver's seat (truth rule 2).
//
// Rendering-free and DOM-free: runs in Node for `tools/report.js` and later for
// the bot runner. Thresholds live in CONFIG.moments so your marks can tune them.
import { CONFIG } from './config.js';
import { KMH } from './util.js';

/** Every moment kind, with its pillar and whether it is a good moment. */
export const MOMENT_KINDS = {
  'cut-off': { pillar: 'Calm', good: false },
  unannounced: { pillar: 'Readable', good: false },
  'phantom-brake': { pillar: 'Readable', good: false },
  'pop-in': { pillar: 'Authentic', good: false },
  'not-let-in': { pillar: 'Authentic', good: false },
  'boxed-in': { pillar: 'Calm', good: false },
  tailgated: { pillar: 'Authentic', good: false },
  'left-dawdler': { pillar: 'Authentic', good: false },
  'forced-brake': { pillar: 'Calm', good: false },
  'near-miss': { pillar: 'Calm', good: false },
  'empty-signal': { pillar: 'Readable', good: false },
  'pointless-lane': { pillar: 'Readable', good: false },
  'let-in': { pillar: 'Readable', good: true },
  'moved-over': { pillar: 'Authentic', good: true },
  'clean-overtake': { pillar: 'Calm', good: true },
  'elephant-race': { pillar: 'Authentic', good: true },
  'wave-ridden': { pillar: 'Readable', good: true },
};

/** Read the column journal into per-sample records (with a vehicle map). */
export function readSamples(j) {
  const n = j.t.length;
  const out = new Array(n);
  const meta = j.meta || {};
  for (let i = 0; i < n; i++) {
    const veh = new Map();
    for (const row of j.veh[i] || []) {
      const m = meta[row[0]] || { type: 'car', variant: 'car', len: 4.5, width: 1.8 };
      veh.set(row[0], {
        id: row[0],
        dl: row[1],
        off: row[2],
        kmh: row[3],
        ind: row[4] || 0,
        lane: row[5],
        brake: row.length > 6 ? row[6] === 1 : null,
        len: m.len,
        // a lane closure's obstacle: a reason ahead, never a subject
        obstacle: m.type === 'obstacle',
      });
    }
    out[i] = {
      i,
      t: j.t[i],
      s: j.s[i],
      lane: j.lane[i],
      lat: j.lat[i],
      kmh: j.v[i],
      a: j.a[i],
      thr: j.thr[i],
      brk: j.brk[i],
      steer: j.steer[i],
      ind: j.ind[i],
      ccSet: j.ccSet ? j.ccSet[i] : 0,
      ccOn: j.ccOn ? j.ccOn[i] : 0,
      limit: j.limit[i],
      fps: j.fps && j.fps.length ? j.fps[i] : null,
      veh,
    };
  }
  return out;
}

const typeWord = (m) => (m.variant === m.type ? m.type : `${m.variant} ${m.type}`);

/**
 * The lane the body is actually in, halfway across counts as the new lane.
 * Off is positive toward the right (outer) edge, and lane 0 is the rightmost,
 * so a positive off means the body is over the line into lane - 1.
 * Exported so the stage test can read the same lane the detectors read.
 */
export function effLane(v, laneW, nLanes) {
  // lane -1 is the acceleration strip (F-20): not one of the lanes, so no
  // detector treats a car there as being in yours until it actually merges
  if (v.lane < 0) return -1;
  let l = v.lane;
  if (v.off > laneW / 2) l--;
  else if (v.off < -laneW / 2) l++;
  return Math.max(0, Math.min(nLanes - 1, l));
}

/**
 * Detect moments in a journal. `thresholds` overrides the journal's recorded
 * CONFIG.moments (used by calibration and by tools/report.js).
 */
export function detectMoments(j, thresholds = null) {
  const cfg = { ...CONFIG.moments, ...(j.header && j.header.moments), ...(thresholds || {}) };
  const plen = (j.header && j.header.playerLen) || 4.8;
  const laneW = (j.header && j.header.laneWidth) || 3.5;
  const nLanes = (j.header && j.header.lanes) || CONFIG.lanes;
  const meta = j.meta || {};
  const hasBrake = !!(j.header && j.header.hasBrake);
  const S = readSamples(j);
  const n = S.length;
  const moments = [];
  if (n < 2) return moments;

  const label = (id) => {
    const m = meta[id];
    if (m && m.type === 'obstacle') return 'the closed lane';
    return m ? `the ${typeWord(m)}` : 'a car';
  };
  const half = (id) => ((meta[id] && meta[id].len) || 4.5) / 2;
  /** The lane the body is actually in, at this journal's lane width. */
  const effLaneAt = (v) => effLane(v, laneW, nLanes);
  const add = (kind, severity, s, vid, text) => {
    const k = MOMENT_KINDS[kind];
    moments.push({
      kind,
      pillar: k.pillar,
      good: k.good,
      severity: Math.max(1, Math.min(3, Math.round(severity))),
      t: Math.round(s.t * 10) / 10,
      s: Math.round(s.s * 10) / 10,
      vehicles: vid == null ? [] : [vid],
      text,
    });
  };

  // ---- per-vehicle state across samples
  const truckPairs = new Map();
  const tr = new Map(); // id -> state
  const stateOf = (v, t) => {
    let s = tr.get(v.id);
    if (!s) {
      s = {
        lane: v.lane,
        eff: effLaneAt(v),
        ind: v.ind,
        indSince: v.ind ? t : null,
        latHist: [], // [{t, lat}] absolute lateral coordinate
        tailS: 0,
        tailFired: false,
        dawdlerS: 0,
        dawdlerFired: false,
        nearT: -99,
        phantomT: -99,
        pointlessT: -99,
        cueSince: null,
        sigSince: null,
        sigDir: 0,
        sigEff: -1,
        sigFired: false,
        lastSeen: t,
      };
      tr.set(v.id, s);
    }
    return s;
  };
  // ---- player-level state
  let brakeEp = null; // forced braking episode
  let boxRun = 0; // seconds under set speed with no escape
  let boxT = 0;
  let boxS = null;
  let signal = null; // indicator episode (not-let-in / let-in)
  let overtake = null; // clean-overtake state machine
  let wave = null; // wave-ridden state machine
  let peak = null; // highest recent speed for wave-ridden
  const recent = []; // friction moments, for "after the ... cut in" wording

  const P0 = S[0];
  peak = { kmh: P0.kmh, t: P0.t, s: P0.s };

  for (let i = 1; i < n; i++) {
    const P = S[i];
    const Q = S[i - 1];
    const dt = Math.max(0.05, P.t - Q.t);
    const pV = P.kmh * KMH; // m/s
    const pl = P.lane;

    // ------------------------------------------------------------ vehicles
    for (const v of P.veh.values()) {
      if (v.obstacle) continue; // a closure is the reason, not a subject (below)
      const st = stateOf(v, P.t);
      const ahead = v.dl > 0;
      const gap = ahead ? v.dl - half(v.id) - plen / 2 : -v.dl - half(v.id) - plen / 2;
      const vm = v.kmh * KMH;
      const eff = effLaneAt(v);
      const wasEff = st.eff;

      // --- lane entry / lane change, judged as the body crosses the line
      if (eff !== wasEff) {
        // Visible warning before the move: the indicator, or a lean toward the
        // line that lasted at least `unannouncedSignal` seconds. The lean is
        // the small offset a driver shows *before* pulling out; the crossing
        // itself is the lane change, not a warning.
        const signalTime = st.indSince == null ? 0 : P.t - st.indSince;
        const driftTime = st.cueSince == null ? 0 : P.t - st.cueSince;

        // cut-off: entered your lane close ahead of you
        if (eff === pl && Math.abs(v.dl) < cfg.cutOffChaseM && gap > -2) {
          const tGap = gap / Math.max(pV, 1);
          if (tGap < cfg.cutOffTGap) {
            add(
              'cut-off',
              tGap < 0.4 || P.a < -3.5 ? 3 : 2,
              P,
              v.id,
              `${label(v.id)} merged into your lane ${Math.round(gap)} m ahead at a ${tGap.toFixed(1)} s gap${P.a < -2.5 ? `, you braked ${Math.abs(P.a).toFixed(1)} m/s²` : ''}`,
            );
            recent.push(moments[moments.length - 1]);
          }
        }

        // unannounced: a lane change close to you with less than a second of clue
        if (Math.abs(v.dl) < cfg.unannouncedM) {
          const clue = Math.max(signalTime, driftTime);
          if (clue < cfg.unannouncedSignal) {
            const sev = signalTime === 0 && driftTime === 0 ? 3 : 2;
            add(
              'unannounced',
              sev,
              P,
              v.id,
              `${label(v.id)} moved ${eff > wasEff ? 'left' : 'right'} ${Math.round(Math.abs(v.dl))} m ${ahead ? 'ahead of' : 'behind'} you after ${clue.toFixed(1)} s of visible warning`,
            );
          }
        }

        // pointless-lane: it moved left, but there is nothing slower to overtake
        // (a car merging in from an acceleration strip is not "moving left")
        if (wasEff >= 0 && eff > wasEff && v.dl > 5 && v.dl < cfg.pointlessM && P.t - st.pointlessT > 30) {
          let ld = null;
          for (const o of P.veh.values()) {
            if (o.id === v.id || o.dl <= v.dl) continue;
            if (effLaneAt(o) !== wasEff) continue;
            if (!o.obstacle && o.dl - v.dl > cfg.pointlessLookM) continue; // a closure you can see coming explains it at any distance
            if (!ld || o.dl < ld.dl) ld = o;
          }
          // A car following a slower (or equally fast) car may pull out to
          // overtake: that has a visible reason. Only no leader, or a faster
          // one, leaves the driver asking "what is it moving for?".
          if (!ld || ld.kmh > v.kmh + 0.5) {
            st.pointlessT = P.t;
            add(
              'pointless-lane',
              2,
              P,
              v.id,
              `${label(v.id)} moved left from lane ${wasEff} with ${ld ? `a ${Math.round(ld.kmh)} km/h car ahead, faster than it` : 'nothing ahead'}, nothing to overtake`,
            );
            moments[moments.length - 1].cueT = st.indSince != null && P.t - st.indSince < 6 ? st.indSince : P.t;
          }
        }
      }
      st.eff = eff;

      // --- tailgated: same lane behind you, closer than the threshold
      if (!ahead && eff === pl && gap > 0) {
        const tGap = gap / Math.max(vm, 1);
        if (tGap < cfg.tailgateTGap) {
          st.tailS += dt;
          if (st.tailS >= cfg.tailgateS && !st.tailFired) {
            st.tailFired = true;
            add(
              'tailgated',
              3 - Math.min(2, Math.floor(st.tailS / 20)),
              P,
              v.id,
              `${label(v.id)} sat ${gap.toFixed(0)} m behind you at ${v.kmh.toFixed(0)} km/h for ${Math.round(st.tailS)} s (${tGap.toFixed(1)} s gap)`,
            );
          }
        } else if (tGap > 1.0) {
          st.tailS = 0;
          st.tailFired = false;
        }
      } else {
        st.tailS = 0;
        st.tailFired = false;
      }

      // --- left-dawdler: a slower car blocking a left lane ahead of you
      if (ahead && eff === pl && pl >= 1 && gap > 0 && gap < 100 && vm < pV - cfg.dawdlerKmh * KMH) {
        st.dawdlerS += dt;
        if (st.dawdlerS >= cfg.dawdlerS && !st.dawdlerFired) {
          st.dawdlerFired = true;
          add(
            'left-dawdler',
            2,
            P,
            v.id,
            `${label(v.id)} held lane ${pl} at ${v.kmh.toFixed(0)} km/h ${Math.round(gap)} m ahead for ${Math.round(st.dawdlerS)} s`,
          );
        }
      } else st.dawdlerS = 0;

      // --- near-miss: time to collision with a car in your lane
      if (eff === pl && Math.abs(v.dl) < 120 && gap > 0) {
        const closing = ahead ? pV - vm : vm - pV;
        if (closing > 0.5) {
          const ttc = gap / closing;
          if (ttc < cfg.nearMissTTC && P.t - st.nearT > 10) {
            st.nearT = P.t;
            add(
              'near-miss',
              ttc < 0.9 ? 3 : ttc < 1.2 ? 2 : 1,
              P,
              v.id,
              `${ttc.toFixed(1)} s to ${label(v.id)} ${Math.round(gap)} m ${ahead ? 'ahead' : 'behind'}, closing ${Math.round(closing / KMH)} km/h`,
            );
            recent.push(moments[moments.length - 1]);
          }
        }
      }

      // --- phantom-brake: a visible car brakes with nothing in front of it.
      // Brake lights are the clue from the seat; speed alone misses a light tap.
      if (ahead && Math.abs(eff - pl) <= 1 && gap > 0 && gap < 80 && v.kmh > 5) {
        const prev = Q.veh.get(v.id);
        if (prev && prev.lane === v.lane && Math.abs(prev.off - v.off) < 1.0) {
          const decel = (prev.kmh * KMH - vm) / dt;
          const braking = hasBrake ? v.brake === true : decel > cfg.phantomBrake;
          if (braking && P.t - st.phantomT > 8) {
            let explained = false;
            for (const o of P.veh.values()) {
              if (o.id === v.id) continue;
              if (o.dl <= v.dl) continue;
              const oe = effLaneAt(o);
              if (oe !== v.lane && oe !== eff) continue;
              // A closure is visible from way back (red cross, the arrow board on
              // the matrix signs), so braking early for it has a reason; the 40 m
              // window is about a car in front, which you only see up close.
              if (o.obstacle || o.dl - v.dl - half(o.id) - half(v.id) < cfg.phantomLook) {
                explained = true;
                break;
              }
            }
            if (!explained) {
              st.phantomT = P.t;
              const how = decel >= cfg.phantomBrake ? `braked ${decel.toFixed(1)} m/s²` : 'tapped the brakes';
              add(
                'phantom-brake',
                P.a < -2 ? 3 : 2,
                P,
                v.id,
                `${label(v.id)} ${how} with nothing visible in front of it`,
              );
            }
          }
        }
      }

      // --- per-sample state for the next iteration
      // A lean counts as a leading clue only while the body is still clearly
      // inside its own lane; crossing the line is the move itself.
      const absOff = Math.abs(v.off);
      if (absOff > cfg.unannouncedDrift && absOff < 0.8 && st.cueSince == null) st.cueSince = P.t;
      else if (absOff < cfg.unannouncedDrift * 0.5) st.cueSince = null;
      if (v.lane !== st.lane) st.cueSince = null;
      st.lane = v.lane;
      if (v.ind !== st.ind) {
        if (v.ind !== 0) {
          st.sigSince = P.t;
          st.sigDir = v.ind;
          st.sigEff = eff;
          st.sigFired = false;
        } else {
          if (st.sigSince != null && !st.sigFired && P.t - st.sigSince >= cfg.signalPatienceS && Math.abs(v.dl) < 80 && eff === st.sigEff) {
            add(
              'empty-signal',
              P.t - st.sigSince >= 10 ? 3 : 2,
              P,
              v.id,
              `${label(v.id)} signalled ${st.sigDir < 0 ? 'left' : 'right'} for ${Math.round(P.t - st.sigSince)} s, then withdrew it without moving`,
            );
          }
          st.sigSince = null;
        }
        st.ind = v.ind;
        st.indSince = v.ind ? P.t : null;
      }
      // A signal held without the lane change: a promise not kept.
      if (v.ind !== 0 && st.sigSince != null) {
        if (eff !== st.sigEff) {
          st.sigSince = null; // it moved
        } else if (!st.sigFired && Math.abs(v.dl) < 80 && P.t - st.sigSince >= cfg.signalPatienceS) {
          st.sigFired = true;
          add(
            'empty-signal',
            P.t - st.sigSince >= 10 ? 3 : 2,
            P,
            v.id,
            `${label(v.id)} has indicated ${st.sigDir < 0 ? 'left' : 'right'} for ${Math.round(P.t - st.sigSince)} s without changing lane`,
          );
        }
      }
      st.lastSeen = P.t;
    }

    // --- pop-in: a vehicle appears or vanishes inside the near field
    // (the recorder keeps a wider window, so crossing its edge is not a pop)
    for (const [id, v] of P.veh) {
      if (v.obstacle) continue;
      if (!Q.veh.has(id) && Math.abs(v.dl) < cfg.popInM) {
        add('pop-in', Math.abs(v.dl) < 80 ? 2 : 1, P, id, `${label(id)} appeared ${Math.round(Math.abs(v.dl))} m ${v.dl > 0 ? 'ahead' : 'behind'} you`);
      }
    }
    for (const [id, v] of Q.veh) {
      if (v.obstacle) continue;
      if (!P.veh.has(id) && Math.abs(v.dl) < cfg.popInM) {
        add('pop-in', Math.abs(v.dl) < 80 ? 2 : 1, P, id, `${label(id)} vanished ${Math.round(Math.abs(v.dl))} m ${v.dl > 0 ? 'ahead' : 'behind'} you`);
      }
    }

    // ------------------------------------------------------------ your controls
    // forced braking (one moment per episode, with the peak)
    if (P.a < -cfg.forcedBrake) {
      if (!brakeEp) brakeEp = { t: P.t, s: P.s, peak: P.a };
      brakeEp.peak = Math.min(brakeEp.peak, P.a);
    } else if (brakeEp && P.a > -1) {
      const cause = recent.filter((m) => m.t > brakeEp.t - 4 && m.t < brakeEp.t + 1).pop();
      add(
        'forced-brake',
        Math.abs(brakeEp.peak) > 7 ? 3 : Math.abs(brakeEp.peak) > 5 ? 2 : 1,
        { t: brakeEp.t, s: brakeEp.s },
        null,
        `you braked ${Math.abs(brakeEp.peak).toFixed(1)} m/s²${cause ? ` (${cause.text})` : ''}`,
      );
      brakeEp = null;
    }

    // boxed-in: under your set speed with no lane to escape to
    if (P.ccOn && P.ccSet && P.kmh < P.ccSet - cfg.boxedInKmh) {
      let escape = false;
      for (const l of [pl - 1, pl + 1]) {
        if (l < 0 || l >= nLanes) continue;
        let gapA = Infinity;
        let gapB = Infinity;
        for (const v of P.veh.values()) {
          if (effLaneAt(v) !== l) continue;
          const g = v.dl > 0 ? v.dl - half(v.id) - plen / 2 : -v.dl - half(v.id) - plen / 2;
          if (v.dl > 0) gapA = Math.min(gapA, g);
          else gapB = Math.min(gapB, g);
        }
        if (gapA > cfg.escapeGapM && gapB > cfg.escapeGapM) escape = true;
      }
      if (!escape) {
        if (boxRun === 0) {
          boxT = P.t;
          boxS = P.s;
        }
        boxRun += dt;
        if (boxRun >= cfg.boxedInS) {
          add(
            'boxed-in',
            2,
            { t: boxT, s: boxS },
            null,
            `stuck at ${P.kmh.toFixed(0)} km/h, ${(P.ccSet - P.kmh).toFixed(0)} under your ${P.ccSet}, for ${Math.round(boxRun)} s with no lane to escape to`,
          );
          boxRun = 0;
        }
      } else boxRun = 0;
    } else boxRun = 0;

    // indicator episode: not-let-in, and the good half of let-in
    if (P.ind !== 0) {
      if (!signal || signal.dir !== P.ind) {
        const target = pl + (P.ind < 0 ? 1 : -1);
        const behind = [];
        for (const v of P.veh.values()) {
          if (effLaneAt(v) !== target || v.dl > 0) continue;
          const g = -v.dl - half(v.id) - plen / 2;
          if (g > 0 && g < 60) behind.push({ id: v.id, gap: g, kmh: v.kmh });
        }
        signal = { dir: P.ind, t0: P.t, s0: P.s, lane0: pl, behind, merged: false, letIn: false, fired: false };
      }
      if (!signal.merged && P.lane !== signal.lane0) signal.merged = true;

      if (signal.merged && !signal.letIn) {
        signal.letIn = true;
        for (const b of signal.behind) {
          const now = P.veh.get(b.id);
          const gNow = now && now.dl < 0 ? -now.dl - half(b.id) - plen / 2 : null;
          const eased = gNow == null ? true : gNow > b.gap + cfg.letInGainM || (now && now.kmh < b.kmh - 3);
          if (eased) {
            add(
              'let-in',
              2,
              P,
              b.id,
              `you signalled and ${label(b.id)} eased off to let you in${gNow != null ? ` (${Math.round(gNow)} m back)` : ''}`,
            );
            break;
          }
        }
      }

      if (!signal.fired && !signal.merged && P.t - signal.t0 > cfg.notLetInS) {
        let there = null;
        for (const b of signal.behind) {
          const now = P.veh.get(b.id);
          const g = now && now.dl < 0 ? -now.dl - half(b.id) - plen / 2 : null;
          if (g != null && g < 80) {
            there = { b, g };
            break;
          }
        }
        if (there) {
          signal.fired = true;
          add(
            'not-let-in',
            3,
            P,
            there.b.id,
            `you signalled for ${Math.round(P.t - signal.t0)} s; ${label(there.b.id)} ${Math.round(there.g)} m back never made room`,
          );
        }
      }
    } else {
      if (signal && !signal.fired && !signal.merged && signal.behind.length && P.t - signal.t0 > cfg.notLetInS) {
        add('not-let-in', 2, { t: signal.t0, s: signal.s0 }, null, `you signalled for ${Math.round(P.t - signal.t0)} s but no gap opened`);
      }
      signal = null;
    }

    // clean-overtake: out, past, back, no braking
    if (!overtake) {
      if (P.ind < 0 && Q.ind >= 0) {
        let target = null;
        for (const v of P.veh.values()) {
          if (v.obstacle) continue;
          if (v.dl > 0 && effLaneAt(v) === pl && v.dl < 150) {
            if (!target || v.dl < target.dl) target = { id: v.id, dl: v.dl };
          }
        }
        overtake = { t0: P.t, s0: P.s, lane0: pl, merged: false, brake: false, target, done: false };
      }
    } else {
      if (P.a < -cfg.cleanOvertakeNoBrake) overtake.brake = true;
      if (P.lane > overtake.lane0) overtake.merged = true;
      if (overtake.merged && P.lane <= overtake.lane0 && !overtake.done) {
        overtake.done = true;
        let passed = false;
        if (overtake.target) {
          const now = P.veh.get(overtake.target.id);
          passed = !now || now.dl < 0;
        }
        if (passed && !overtake.brake) {
          add(
            'clean-overtake',
            2,
            { t: overtake.t0, s: overtake.s0 },
            overtake.target ? overtake.target.id : null,
            `you signalled out, passed${overtake.target ? ` ${label(overtake.target.id)}` : ''}, signalled back and never braked hard`,
          );
        }
      }
      if (P.t - overtake.t0 > 90 || P.lane < overtake.lane0) overtake = null;
    }

    // wave-ridden: speed drops > 30 km/h and recovers without a hard brake
    if (!wave && P.kmh > peak.kmh) peak = { kmh: P.kmh, t: P.t, s: P.s };
    if (!wave && P.kmh < peak.kmh - cfg.waveDropKmh) {
      wave = { peak, min: P.kmh, minT: P.t, minS: P.s, brake: false };
    }
    if (wave) {
      if (P.a < -cfg.forcedBrake) wave.brake = true;
      if (P.kmh < wave.min) {
        wave.min = P.kmh;
        wave.minT = P.t;
        wave.minS = P.s;
      }
      if (P.kmh < peak.kmh - cfg.waveDropKmh) wave.stillDown = true;
      if (wave.stillDown && P.kmh > wave.min + 20 && P.kmh > peak.kmh - cfg.waveDropKmh) {
        const drop = peak.kmh - wave.min;
        if (!wave.brake && drop >= cfg.waveDropKmh) {
          add(
            'wave-ridden',
            drop >= 45 ? 2 : 1,
            { t: wave.minT, s: wave.minS },
            null,
            `a wave pulled you from ${peak.kmh.toFixed(0)} down to ${wave.min.toFixed(0)} km/h and back without a hard brake`,
          );
        }
        wave = null;
      }
    }

    // elephant-race: two trucks side by side ahead of you
    if (P.veh.size > 1) {
      const trucks = [];
      for (const v of P.veh.values()) {
        const m = meta[v.id];
        if (m && m.type === 'truck' && v.dl > 0 && v.dl < cfg.elephantM) trucks.push(v);
      }
      for (let a = 0; a < trucks.length; a++) {
        for (let b = a + 1; b < trucks.length; b++) {
          const A = trucks[a];
          const B = trucks[b];
          if (Math.abs(effLaneAt(A) - effLaneAt(B)) !== 1) continue;
          if (Math.abs(A.dl - B.dl) > 14) continue;
          const key = A.id < B.id ? `${A.id}:${B.id}` : `${B.id}:${A.id}`;
          const pair = pairState(truckPairs, key, P.t);
          if (pair.since == null) pair.since = P.t;
          if (P.t - pair.since >= cfg.elephantS && !pair.fired) {
            pair.fired = true;
            add(
              'elephant-race',
              2,
              { t: pair.since, s: P.s },
              A.id,
              `two trucks side by side ${Math.round(Math.min(A.dl, B.dl))} m ahead for ${Math.round(P.t - pair.since)} s`,
            );
          }
        }
      }
    }
  }

  // close a braking episode that was still running when the drive ended
  if (brakeEp) {
    add(
      'forced-brake',
      Math.abs(brakeEp.peak) > 7 ? 3 : Math.abs(brakeEp.peak) > 5 ? 2 : 1,
      { t: brakeEp.t, s: brakeEp.s },
      null,
      `you braked ${Math.abs(brakeEp.peak).toFixed(1)} m/s²`,
    );
  }

  // moved-over: read from the flash events, plus pressure without a flash
  moments.push(...movedOver(j, S, cfg, label, plen, effLaneAt, meta));

  moments.sort((a, b) => a.t - b.t);
  return moments;
}

/** Truck pairs for the elephant-race accumulator (one map per journal). */
function pairState(pairs, key, t) {
  let p = pairs.get(key);
  if (!p) {
    p = { since: null, fired: false, last: t };
    pairs.set(key, p);
  } else if (t - p.last > 2.5) {
    p.since = null;
    p.fired = false;
  }
  p.last = t;
  return p;
}

/** A car ahead moves right after you flash (or after you close right up). */
function movedOver(j, S, cfg, label, plen, effLaneAt, meta) {
  const out = [];
  const half = (id) => ((meta[id] && meta[id].len) || 4.5) / 2;
  const flashes = (j.events || []).filter((e) => e.type === 'flash').map((e) => e.t);
  const seen = new Map(); // id -> {eff, t, gap, ind}
  const fired = new Set();
  for (let i = 1; i < S.length; i++) {
    const P = S[i];
    const Q = S[i - 1];
    for (const v of P.veh.values()) {
      const eff = effLaneAt(v);
      const prev = Q.veh.get(v.id);
      if (!prev) {
        seen.set(v.id, { eff, t: P.t, gap: v.dl, lane: v.lane });
        continue;
      }
      const prevEff = effLaneAt(prev);
      const gap = v.dl - half(v.id) - plen / 2;
      const st = seen.get(v.id) || { eff: prevEff, t: Q.t, gap: prev.dl, lane: prev.lane };
      if (eff < prevEff && st.eff >= prevEff && !fired.has(v.id)) {
        // it changed one lane to the right
        const flashT = flashes.filter((t) => t <= P.t && t > P.t - cfg.movedOverS).pop();
        const close = gap > 0 && gap < cfg.movedOverM && st.gap < cfg.movedOverM + 10;
        const blocked = v.kmh < P.kmh + 1 && Q.veh.get(v.id) && prev.lane === Q.lane;
        if ((flashT != null || close) && blocked) {
          fired.add(v.id);
          out.push({
            kind: 'moved-over',
            pillar: MOMENT_KINDS['moved-over'].pillar,
            good: true,
            severity: 2,
            t: Math.round(P.t * 10) / 10,
            s: Math.round(P.s * 10) / 10,
            vehicles: [v.id],
            text: flashT != null
              ? `you flashed and ${label(v.id)} moved over ${Math.round(gap)} m ahead`
              : `${label(v.id)} moved over after you closed to ${Math.round(gap)} m`,
          });
        }
      }
      seen.set(v.id, { eff, t: P.t, gap, lane: v.lane });
    }
  }
  return out;
}

// ---------------------------------------------------------------- summaries
/** Fraction of driving time with no friction moment in the last `calmWindowS`. */
export function calmShare(j, moments, windowS = null) {
  const win = windowS ?? CONFIG.moments.calmWindowS;
  const friction = moments.filter((m) => !m.good).map((m) => m.t).sort((a, b) => a - b);
  if (!j.t.length) return 0;
  let calm = 0;
  for (const t of j.t) {
    const recent = friction.filter((x) => x <= t && x > t - win);
    if (!recent.length) calm++;
  }
  return calm / j.t.length;
}

/** Health: a bug report, not a feeling. */
export function health(j) {
  const S = readSamples(j);
  const laneW = (j.header && j.header.laneWidth) || 3.5;
  let nan = 0;
  let offRoad = 0;
  const offIds = new Set();
  let emergency = 0;
  const emergencyIds = new Set();
  const braking = new Map();
  for (let i = 0; i < S.length; i++) {
    const P = S[i];
    if (![P.t, P.s, P.lat, P.kmh, P.a].every(Number.isFinite)) nan++;
    for (const v of P.veh.values()) {
      // distance from the nearest lane centre: a body halfway across a line is
      // changing lanes, not off the road
      const e = v.off > laneW / 2 ? 1 : v.off < -laneW / 2 ? -1 : 0;
      const offC = v.off - e * laneW;
      if (Math.abs(offC) > laneW / 2 + 0.9) offIds.add(v.id);
      if (i > 0) {
        const prev = S[i - 1].veh.get(v.id);
        if (prev) {
          const decel = (prev.kmh * KMH - v.kmh * KMH) / Math.max(0.05, P.t - S[i - 1].t);
          if (Math.abs(v.dl) < 100) {
            if (decel > 6 && !braking.get(v.id)) {
              braking.set(v.id, true);
              emergency++;
              emergencyIds.add(v.id);
            } else if (decel < 3) braking.set(v.id, false);
          }
        }
      }
    }
  }
  offRoad = offIds.size;
  const crashes = (j.events || []).filter((e) => e.type === 'crash');
  const scrapes = (j.events || []).filter((e) => e.type === 'scrape');
  const fps = j.fps && j.fps.length ? j.fps : null;
  return {
    collisions: crashes.length,
    crashPeak: crashes.reduce((a, e) => Math.max(a, e.strength || 0), 0),
    scrapes: scrapes.length,
    nan,
    offRoad,
    emergencyStops: emergency,
    emergencyVehicles: emergencyIds.size,
    fpsMin: fps ? Math.min(...fps) : null,
    fpsUnder30: fps ? fps.filter((f) => f < 30).length : 0,
    samples: S.length,
  };
}

/** All the numbers a report needs, for one journal. */
export function summarise(j, moments = null) {
  const ms = moments || detectMoments(j);
  const minutes = j.t.length ? j.t[j.t.length - 1] / 60 : 0;
  const counts = {};
  for (const k of Object.keys(MOMENT_KINDS)) counts[k] = 0;
  for (const m of ms) counts[m.kind] = (counts[m.kind] || 0) + 1;
  const rates = {};
  for (const [k, c] of Object.entries(counts)) rates[k] = minutes > 0 ? (c / minutes) * 10 : 0;
  const good = ms.filter((m) => m.good && m.severity >= 2);
  const bad = ms.filter((m) => ['unannounced', 'pop-in', 'phantom-brake'].includes(m.kind));
  const speeds = j.v.filter((v) => v > 5);
  speeds.sort((a, b) => a - b);
  const pct = (p) => (speeds.length ? speeds[Math.min(speeds.length - 1, Math.floor(p * speeds.length))] : 0);
  const limit = j.header && j.header.limitKmh ? j.header.limitKmh : CONFIG.speedLimitDay;
  return {
    minutes,
    distanceKm: j.header && j.header.distance ? j.header.distance / 1000 : j.t.length ? (j.s[j.s.length - 1] - j.s[0]) / 1000 : 0,
    counts,
    rates,
    good: good.length,
    bad: bad.length,
    m1: good.length > 0 && bad.length === 0,
    calm: calmShare(j, ms),
    speeds: {
      avg: speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
      p10: pct(0.1),
      p90: pct(0.9),
      aboveLimit10: j.v.length ? j.v.filter((v) => v > limit + 10).length / j.v.length : 0,
      underLimit: j.v.length ? j.v.filter((v) => v < limit).length / j.v.length : 0,
    },
    cruiseShare: j.ccOn && j.ccOn.length ? j.ccOn.reduce((a, b) => a + b, 0) / j.ccOn.length : 0,
    laneShare: laneShare(j),
    health: health(j),
  };
}

function laneShare(j) {
  const n = (j.header && j.header.lanes) || CONFIG.lanes;
  const t = new Array(n).fill(0);
  for (const l of j.lane) if (l >= 0 && l < n) t[l]++;
  const tot = t.reduce((a, b) => a + b, 0) || 1;
  return t.map((x) => x / tot);
}
