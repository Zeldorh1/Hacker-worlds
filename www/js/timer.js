// Mission countdown / trace timer.
// Drives the trace bar UI; fires urgency callbacks when crossing
// 50%, 25%, and 10% remaining; fires timeout when it hits 0.

const TICK_MS = 100;
const URGENCY_FRACTIONS = [0.5, 0.25, 0.10];

export class Timer {
  constructor({ duration, onTick, onUrgency, onTimeout }) {
    this.duration  = duration;     // seconds
    this.remaining = duration;
    this.onTick     = onTick    || (() => {});
    this.onUrgency  = onUrgency || (() => {});
    this.onTimeout  = onTimeout || (() => {});
    this._interval  = null;
    this._lastWallClock = 0;
    this._fired = new Set();       // which urgency thresholds have fired
    this._stopped = false;
  }

  start() {
    if (this._interval || this._stopped) return;
    this._lastWallClock = performance.now();
    this.onTick(this.remaining, this.duration);
    this._interval = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    this._stopped = true;
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  pause()  { this._paused = true; }
  resume() { this._paused = false; this._lastWallClock = performance.now(); }

  _tick() {
    if (this._paused) { this._lastWallClock = performance.now(); return; }
    const now = performance.now();
    const dt  = (now - this._lastWallClock) / 1000;
    this._lastWallClock = now;
    this.remaining = Math.max(0, this.remaining - dt);
    this.onTick(this.remaining, this.duration);

    const frac = this.remaining / this.duration;
    for (const u of URGENCY_FRACTIONS) {
      if (!this._fired.has(u) && frac <= u) {
        this._fired.add(u);
        this.onUrgency(u, this.remaining);
      }
    }

    if (this.remaining <= 0) {
      this.stop();
      this.onTimeout();
    }
  }
}
