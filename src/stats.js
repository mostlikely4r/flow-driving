// Gentle driving feedback: not a score attack, just a mirror on how you drive.
import { KMH } from './util.js';
import { CONFIG } from './config.js';
import { gapBetween } from './traffic.js';

export class Stats {
  constructor() {
    this.reset();
  }
  reset() {
    this.time = 0;
    this.dist = 0;
    this.ccTime = 0;
    this.leftTime = 0; // time in a non-rightmost lane
    this.hogTime = 0; // time in a left lane while the lane to the right was free
    this.hogRun = 0;
    this.undertakes = 0;
    this.tailgateTime = 0;
    this.hardBrakes = 0;
    this.brakeLatch = false;
    this.collisions = 0;
    this.redCrosses = 0;
    this.side = new Map();
    this.speedDevSum = 0;
    this.speedDevN = 0;
    this.hogWarned = false;
  }

  update(dt, player, traffic, toast) {
    const v = player.vAlong;
    if (v < 1) return;
    this.time += dt;
    this.dist += v * dt;
    if (player.cc.on) this.ccTime += dt;
    // smoothness: deviation from own average speed
    this.speedDevSum += Math.abs(player.acc) * dt;
    this.speedDevN += dt;

    // tailgating (< 1 s time gap)
    if (player.leader && v > 50 * KMH) {
      const tg = player.leaderGap / v;
      if (tg < 1.0) this.tailgateTime += dt;
    }

    // hard braking
    if (player.acc < -3.5 && !this.brakeLatch) {
      this.hardBrakes++;
      this.brakeLatch = true;
    } else if (player.acc > -1.5) this.brakeLatch = false;

    // keep right
    const lane = player.lane;
    if (lane > 0 && v > 60 * KMH) {
      this.leftTime += dt;
      const rl = lane - 1;
      let blocked = false;
      for (const veh of traffic.vehicles) {
        if (veh.lane !== rl && !(veh.state === 'move' && veh.targetLane === rl)) continue;
        const g = veh.u - player.s;
        if (g > -15 && g < 25) {
          blocked = true; // something alongside
          break;
        }
        if (g >= 25 && g < 300 && veh.v < v - 4 * KMH) {
          blocked = true; // we'd catch up within a few hundred metres
          break;
        }
      }
      if (!blocked) {
        this.hogTime += dt;
        this.hogRun += dt;
        if (this.hogRun > 14 && !this.hogWarned) {
          toast('Keep right: the lane to your right is free', 'warn');
          this.hogWarned = true;
        }
      } else this.hogRun = 0;
      if (this.hogRun === 0) this.hogWarned = false;
    } else {
      this.hogRun = 0;
      this.hogWarned = false;
    }

    // undertaking (overtaking on the right) at speed
    for (const veh of traffic.vehicles) {
      const du = veh.u - player.s;
      if (Math.abs(du) > 40) {
        this.side.delete(veh.id);
        continue;
      }
      const leftOfUs = veh.lane > lane && lane >= 0 && veh.state === 'none';
      const sd = du > 0 ? 1 : -1;
      const prev = this.side.get(veh.id);
      this.side.set(veh.id, sd);
      if (leftOfUs && prev === 1 && sd === -1 && v > 60 * KMH && veh.v > 50 * KMH && veh.lane === lane + 1) {
        this.undertakes++;
        toast('Passed on the right', 'warn');
      }
    }
  }

  rows() {
    const km = this.dist / 1000;
    const avg = this.time > 0 ? this.dist / this.time / KMH : 0;
    const pct = (x) => (this.time > 0 ? Math.round((100 * x) / this.time) : 0);
    const mm = Math.floor(this.time / 60), ss = Math.floor(this.time % 60);
    const keepRight = this.leftTime > 0 ? Math.max(0, 100 - Math.round((100 * this.hogTime) / Math.max(this.time, 1))) : 100;
    return [
      ['Driving time', `${mm}:${String(ss).padStart(2, '0')}`],
      ['Distance', `${km.toFixed(1)} km`],
      ['Average speed', `${avg.toFixed(0)} km/h`],
      ['On cruise control', `${pct(this.ccTime)}%`],
      ['Keeping right', `${keepRight}%`],
      ['Passed on the right', `${this.undertakes}×`],
      ['Tailgating (<1 s gap)', `${this.tailgateTime.toFixed(0)} s`],
      ['Hard braking', `${this.hardBrakes}×`],
      ['Collisions', `${this.collisions}×`],
      ['Red crosses ignored', `${this.redCrosses}×`],
      ['Smoothness', `${(this.speedDevN > 0 ? Math.max(0, 100 - (this.speedDevSum / this.speedDevN) * 120) : 100).toFixed(0)}`],
    ];
  }
}
