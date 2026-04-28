// Synthesized UI sounds + procedural ambient music via Web Audio. No
// asset files; tones are generated on demand. Browsers won't let audio
// play before a user gesture, so the AudioContext is created lazily on
// first call and a gesture-safe wrapper resumes it (and starts the
// music) when needed.
//
// Public API: audio.tap(), .scan(), .lock(), .damage(), .type(), .boot(),
// .complete(), .heartbeat(), .urgent(), .fail(). The mute toggle silences
// SFX and music via the master gain.

import { Music } from "./music.js";

const KEY = "hw.audio.muted";

class AudioBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.music = null;
    this.muted = (localStorage.getItem(KEY) === "1");
    this._unlocked = false;
    this._installUnlock();
  }

  _installUnlock() {
    const unlock = () => {
      if (this._unlocked) return;
      this._unlocked = true;
      this._ensureCtx();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      this._startMusic();
    };
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("mousedown",  unlock);
    window.addEventListener("keydown",    unlock);
  }

  _ensureCtx() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      this.ctx = new C();
      // Master gain controls the overall mute. SFX go through their own
      // bus so they aren't ducked by the music's slower envelope.
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.18;
      this.sfxGain.connect(this.master);
    } catch { this.ctx = null; }
    return this.ctx;
  }

  _startMusic() {
    if (!this.ctx || this.music) return;
    this.music = new Music(this.ctx, this.master);
    this.music.start();
  }

  setMuted(v) {
    this.muted = !!v;
    try { localStorage.setItem(KEY, this.muted ? "1" : "0"); } catch {}
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 1, t + 0.15);
    }
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  isMuted() { return this.muted; }

  // ---- tone helpers ----

  _blip({ freq = 600, type = "square", duration = 0.06, volume = 0.5, slide = 0 }) {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(this.sfxGain || this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // ---- named sfx ----

  tap()    { this._blip({ freq: 1400, type: "square",   duration: 0.04, volume: 0.35 }); }
  type()   { this._blip({ freq: 2000, type: "triangle", duration: 0.02, volume: 0.18 }); }
  boot()   { this._blip({ freq: 1100, type: "square",   duration: 0.02, volume: 0.20 }); }
  scan()   { this._blip({ freq: 800,  type: "sine",     duration: 0.18, volume: 0.45, slide: -200 }); }
  lock()   {
    if (this.muted) return;
    this._blip({ freq: 220, type: "square", duration: 0.10, volume: 0.55 });
    setTimeout(() => this._blip({ freq: 90, type: "square", duration: 0.16, volume: 0.55 }), 80);
  }
  damage() { this._blip({ freq: 380, type: "square",   duration: 0.10, volume: 0.55, slide: -120 }); }
  complete() {
    if (this.muted) return;
    this._blip({ freq: 660,  type: "sine", duration: 0.14, volume: 0.55 });
    setTimeout(() => this._blip({ freq: 990,  type: "sine", duration: 0.20, volume: 0.55 }), 130);
    setTimeout(() => this._blip({ freq: 1320, type: "sine", duration: 0.30, volume: 0.55 }), 280);
  }
  heartbeat() {
    if (this.muted) return;
    this._blip({ freq: 110, type: "sine",   duration: 0.06, volume: 0.55 });
    setTimeout(() => this._blip({ freq: 90, type: "sine", duration: 0.08, volume: 0.45 }), 90);
  }
  fail() {
    if (this.muted) return;
    this._blip({ freq: 220, type: "sawtooth", duration: 0.20, volume: 0.55, slide: -120 });
    setTimeout(() => this._blip({ freq: 150, type: "sawtooth", duration: 0.30, volume: 0.55, slide: -100 }), 200);
    setTimeout(() => this._blip({ freq: 90,  type: "square",   duration: 0.50, volume: 0.55 }), 480);
  }
  urgent() {
    if (this.muted) return;
    this._blip({ freq: 880, type: "square", duration: 0.07, volume: 0.45 });
    setTimeout(() => this._blip({ freq: 1100, type: "square", duration: 0.07, volume: 0.45 }), 90);
  }
}

export const audio = new AudioBank();
