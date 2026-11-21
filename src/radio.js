// Car radio (F-12): your own music folder, or a stream URL of your own. A plain
// <audio> element: live streams are cross-origin, and routing them through Web
// Audio would play silence.
//
// Y tunes to the next source (off -> my music -> your stream -> off). No built-in
// stations: a public game does not link a broadcaster's streams.
import { CONFIG } from './config.js';

export class Radio {
  constructor(toast) {
    this.toast = toast;
    this.el = new Audio();
    this.el.preload = 'none';
    this.el.addEventListener('ended', () => this.source === 'music' && this.nextTrack());
    this.el.addEventListener('error', () => {
      if (this.source === 'off') return;
      if (this.source === 'music') this.nextTrack();
      else this.toast('Radio: no signal', 'bad');
    });
    this.tracks = []; // {name, url}
    this.trackIdx = -1;
    this.source = 'off'; // 'off' | 'music' | 'url'
    this.muted = false;
    this.setVolume(CONFIG.radioVolume);
  }

  /** The stream URL as the player typed it, trimmed. */
  streamUrl() {
    return typeof CONFIG.radioUrl === 'string' ? CONFIG.radioUrl.trim() : '';
  }

  label() {
    if (this.source === 'off') return 'Radio off';
    if (this.source === 'music') return 'My music';
    try {
      return new URL(this.streamUrl()).host;
    } catch {
      return 'your stream';
    }
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
    if (this.streamUrl()) s.push('url');
    return s;
  }

  next() {
    const s = this.sources();
    if (s.length === 1) {
      this.toast('Radio: set a stream URL or a music folder in the menu (Esc)', 'bad');
      return;
    }
    this.tune(s[(s.indexOf(this.source) + 1) % s.length]);
  }

  tune(src) {
    if (src === 'off') {
      this.source = 'off';
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
      this.toast('Radio off');
      return;
    }
    if (src === 'music') {
      this.source = 'music';
      this.nextTrack();
      return;
    }
    const url = this.streamUrl();
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      this.toast('Radio: that is not a stream URL', 'bad');
      return;
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      this.toast('Radio: that is not a stream URL', 'bad');
      return;
    }
    // An http:// stream on the https:// hosted game is mixed content: the
    // browser blocks it silently, so say why nothing happens.
    if (typeof location !== 'undefined' && location.protocol === 'https:' && parsed.protocol === 'http:') {
      this.toast('Radio: this page needs an https:// stream', 'bad');
      return;
    }
    this.source = 'url';
    this.el.src = parsed.href;
    this.play();
    this.toast(`📻 ${parsed.host}`);
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
