// Procedural ambient soundtrack — Hacknet-flavored.
// All audio synthesized via Web Audio (no asset files, no copyright).
//
// Layers:
//   1. Bass drone — two slightly detuned sines around A1 (55Hz) with
//      a tiny beating effect.
//   2. Pad — three sawtooth oscillators forming an A-minor chord
//      (A2 / C3 / E3) routed through a slow lowpass sweep (LFO ~0.06Hz).
//   3. Hiss — high-passed pink-ish noise at very low gain (tape feel).
//   4. Sparse blips — a pentatonic scale of muted sine notes scheduled
//      every 4–14 seconds with a long decay, like distant data pings.
//
// Pauses cleanly when the page is hidden (battery friendly on mobile)
// and resumes when visible. Whole graph respects the AudioBank master
// gain, so the existing mute toggle silences music too.

const NOTE = {
  A1: 55,
  A2: 110,
  C3: 130.81,
  E3: 164.81,
};
const PENTATONIC_MIDS = [220, 261.63, 293.66, 329.63, 392.0]; // A3 minor pentatonic-ish

export class Music {
  /** @param {AudioContext} ctx */
  constructor(ctx, masterGain) {
    this.ctx = ctx;
    this.master = masterGain;
    this.musicGain = null;
    this.nodes = [];
    this.running = false;
    this._blipTimer = null;
    this._visListener = null;
  }

  start() {
    if (this.running || !this.ctx) return;
    this.running = true;

    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Sub-bus for music — kept low relative to SFX so taps and alarms
    // still cut through.
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.55;
    musicGain.connect(this.master);
    this.musicGain = musicGain;

    // ---- Bass drone ----
    const bassMix = ctx.createGain();
    bassMix.gain.value = 0.18;
    bassMix.connect(musicGain);
    for (const detune of [0, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = NOTE.A1;
      osc.detune.value = detune;
      osc.connect(bassMix);
      osc.start(t);
      this.nodes.push(osc);
    }

    // ---- Pad: A-minor with slow filter sweep ----
    const padMix = ctx.createGain();
    padMix.gain.value = 0.05;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 600;
    padFilter.Q.value = 4;
    padFilter.connect(padMix);
    padMix.connect(musicGain);

    for (const f of [NOTE.A2, NOTE.C3, NOTE.E3]) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(padFilter);
        osc.start(t);
        this.nodes.push(osc);
      }
    }
    // LFO modulating the pad filter cutoff — makes the pad breathe.
    const filterLFO = ctx.createOscillator();
    filterLFO.frequency.value = 0.06;
    const filterLFOGain = ctx.createGain();
    filterLFOGain.gain.value = 320;
    filterLFO.connect(filterLFOGain);
    filterLFOGain.connect(padFilter.frequency);
    filterLFO.start(t);
    this.nodes.push(filterLFO);

    // Slight tremolo on the pad gain itself.
    const padLFO = ctx.createOscillator();
    padLFO.frequency.value = 0.13;
    const padLFOGain = ctx.createGain();
    padLFOGain.gain.value = 0.012;
    padLFO.connect(padLFOGain);
    padLFOGain.connect(padMix.gain);
    padLFO.start(t);
    this.nodes.push(padLFO);

    // ---- Tape hiss ----
    const noise = ctx.createBufferSource();
    noise.buffer = this._buildNoiseBuffer(2);
    noise.loop = true;
    const hiss = ctx.createBiquadFilter();
    hiss.type = "highpass";
    hiss.frequency.value = 5500;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.014;
    noise.connect(hiss);
    hiss.connect(hissGain);
    hissGain.connect(musicGain);
    noise.start(t);
    this.nodes.push(noise);

    // ---- Sparse blips ----
    this._scheduleBlip();

    // Pause when the page is hidden to save battery.
    this._visListener = () => {
      if (document.hidden) this._suspend();
      else                 this._resume();
    };
    document.addEventListener("visibilitychange", this._visListener);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this._blipTimer) { clearTimeout(this._blipTimer); this._blipTimer = null; }
    if (this._visListener) {
      document.removeEventListener("visibilitychange", this._visListener);
      this._visListener = null;
    }
    const t = this.ctx.currentTime;
    for (const n of this.nodes) {
      try { n.stop && n.stop(t + 0.05); } catch {}
      try { n.disconnect(); } catch {}
    }
    this.nodes = [];
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(0, t + 0.2);
      const g = this.musicGain;
      setTimeout(() => { try { g.disconnect(); } catch {} }, 250);
      this.musicGain = null;
    }
  }

  _suspend() {
    if (!this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(0, t + 0.4);
  }
  _resume() {
    if (!this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(0.55, t + 0.6);
  }

  _scheduleBlip() {
    if (!this.running) return;
    const delay = 4000 + Math.random() * 9000;
    this._blipTimer = setTimeout(() => {
      this._playBlip();
      this._scheduleBlip();
    }, delay);
  }

  _playBlip() {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const freq = PENTATONIC_MIDS[(Math.random() * PENTATONIC_MIDS.length) | 0];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);

    osc.connect(lp);
    lp.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 1.7);
  }

  _buildNoiseBuffer(seconds) {
    const sr = this.ctx.sampleRate;
    const len = sr * seconds;
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}
