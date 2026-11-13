// Car radio (F-12): your own music folder, or live Dutch radio over the
// internet. A plain <audio> element: live streams are cross-origin, and routing
// them through Web Audio would play silence.
//
// Y tunes to the next source (off -> my music -> stations -> off).
import { CONFIG } from './config.js';

export const STATIONS = [
  { name: 'NPO Radio 1', url: 'https://icecast.omroep.nl/radio1-bb-mp3' },
  { name: 'NPO Radio 2', url: 'https://icecast.omroep.nl/radio2-bb-mp3' },
  { name: 'NPO 3FM', url: 'https://icecast.omroep.nl/3fm-bb-mp3' },
  { name: 'NPO Klassiek', url: 'https://icecast.omroep.nl/radio4-bb-mp3' },
  { name: 'NPO Radio 5', url: 'https://icecast.omroep.nl/radio5-bb-mp3' },
];

export class Radio {
  constructor(toast) {
    this.toast = toast;
    this.el = new Audio();
    this.el.preload = 'none';
    this.el.addEventListener('ended', () => this.source === 'music' && this.nextTrack());
    this.el.addEventListener('error', () => {
      if (this.source === 'off') return;
      if (this.source === 'music') this.nextTrack();
      else this.toast(`${this.label()}: no signal`, 'bad');
    });
    this.tracks = []; // {name, url}
    this.trackIdx = -1;
    this.source = 'off'; // 'off' | 'music' | station index
    this.muted = false;
    this.setVolume(CONFIG.radioVolume);
  }

  label() {
    if (this.source === 'off') return 'Radio off';
    if (this.source === 'music') return 'My music';
    return STATIONS[this.source].name;
  }

  /** Files from a folder picker: keep the audio, shuffle. */
  setFiles(files) {
    for (const t of this.tracks) URL.revokeObjectURL(t.url);
    const audio = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|flac|wav)$/i.test(f.name));
    this.tracks = audio.map((f) => ({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) }));
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
    this.trackIdx = -1;
    this.toast(this.tracks.length ? `My music: ${this.tracks.length} tracks` : 'No audio files in that folder', this.tracks.length ? '' : 'bad');
    if (this.tracks.length) this.tune('music');
  }

  /** The sources Y cycles through. */
  sources() {
    const s = ['off'];
    if (this.tracks.length) s.push('music');
    if (CONFIG.radioStreams) s.push(...STATIONS.map((_, i) => i));
    return s;
  }

  next() {
    const s = this.sources();
    if (s.length === 1) {
      this.toast('Radio: pick a music folder in the menu (Esc), or turn on live stations', 'bad');
      return;
    }
    this.tune(s[(s.indexOf(this.source) + 1) % s.length]);
  }

  tune(src) {
    this.source = src;
    if (src === 'off') {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
      this.toast('Radio off');
      return;
    }
    if (src === 'music') {
      this.nextTrack();
      return;
    }
    this.el.src = STATIONS[src].url;
    this.play();
    this.toast(`📻 ${STATIONS[src].name}`);
  }

  nextTrack() {
    if (!this.tracks.length) return;
    this.trackIdx = (this.trackIdx + 1) % this.tracks.length;
    const t = this.tracks[this.trackIdx];
    this.el.src = t.url;
    this.play();
    this.toast(`♪ ${t.name}`);
  }

  play() {
    const p = this.el.play();
    if (p && p.catch) p.catch(() => {});
  }

  setVolume(v) {
    this.el.volume = Math.max(0, Math.min(1, v));
  }

  setMuted(m) {
    this.muted = m;
    this.el.muted = m;
  }

  /** Paused game: the radio keeps playing, like in a parked car. Off on close. */
}
