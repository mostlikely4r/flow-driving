// Keyboard, mouse wheel and gamepad input.
import { clamp } from './util.js';

export const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  lookLeft: ['KeyZ'],
  lookRight: ['KeyX'],
  lookBack: ['KeyB'],
  flash: ['KeyF'],
  horn: ['Space'],
};

/**
 * Keyboard pedal ramp, shared by the keyboard and the bot. `st` carries
 * { thr, brk, thrHeld, brkHeld }; `keys` carries what is held down now.
 * A tap is gentle, holding goes deeper. Behaviour-identical to the old
 * inline keyboard branch.
 */
export function pedalStep(st, { throttle, brake, left, right }, dt) {
  st.thrHeld = throttle ? st.thrHeld + dt : 0;
  st.brkHeld = brake ? st.brkHeld + dt : 0;
  const thrTarget = throttle ? clamp(0.35 + st.thrHeld * 0.8, 0, 1) : 0;
  const brkTarget = brake ? clamp(0.12 + st.brkHeld * 0.45, 0, 1) : 0;
  st.thr += clamp(thrTarget - st.thr, -3 * dt, 2.5 * dt);
  st.brk += clamp(brkTarget - st.brk, -4 * dt, 3 * dt);
  let steer = 0;
  if (left) steer -= 1;
  if (right) steer += 1;
  return { steer, throttle: st.thr, brake: st.brk, analog: false };
}

export class Input {
  constructor(el) {
    this.down = new Set();
    this.presses = [];
    this.wheel = 0;
    this.thr = 0;
    this.brk = 0;
    this.brkHeld = 0;
    this.thrHeld = 0;
    this.mouseLook = { active: false, yaw: 0, pitch: 0 };
    this.lastPadButtons = [];
    this.padConnected = false;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (['Tab', 'Space', 'Backspace', 'F8', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.presses.push({ code: e.code, shift: e.shiftKey, key: e.key });
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += e.deltaY < 0 ? 1 : -1;
      },
      { passive: false },
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        this.mouseLook.active = true;
        el.setPointerCapture(e.pointerId);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.mouseLook.active = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.mouseLook.active) return;
      this.mouseLook.yaw = clamp(this.mouseLook.yaw - e.movementX * 0.004, -2.6, 2.6);
      this.mouseLook.pitch = clamp(this.mouseLook.pitch - e.movementY * 0.003, -0.5, 0.4);
    });
    window.addEventListener('gamepadconnected', () => (this.padConnected = true));
  }

  is(action) {
    return KEYS[action].some((k) => this.down.has(k));
  }

  takePresses() {
    const p = this.presses;
    this.presses = [];
    return p;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Progressive pedals for keyboard: a tap is gentle, holding goes deeper. */
  controls(dt) {
    const pad = this.pollPad();
    if (pad && (Math.abs(pad.steer) > 0.06 || pad.throttle > 0.02 || pad.brake > 0.02)) {
      return { steer: Math.abs(pad.steer) > 0.06 ? pad.steer : 0, throttle: pad.throttle, brake: pad.brake, analog: true, pad };
    }
    const ctl = pedalStep(this, { throttle: this.is('throttle'), brake: this.is('brake'), left: this.is('left'), right: this.is('right') }, dt);
    return { ...ctl, pad };
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const btn = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const pressed = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const now = gp.buttons.map((b) => b.pressed);
    const edges = [];
    now.forEach((p, i) => {
      if (p && !this.lastPadButtons[i]) edges.push(i);
    });
    this.lastPadButtons = now;
    return {
      steer: gp.axes[0] || 0,
      lookX: gp.axes[2] || 0,
      throttle: btn(7),
      brake: btn(6),
      edges,
      held: (i) => pressed(i),
    };
  }
}
