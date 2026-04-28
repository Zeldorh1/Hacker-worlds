// Per-mission hint engine.
//
// Each mission can declare a list of hint rules:
//   { id: "...", when: (ctx) => bool, say: "...", min?: seconds }
//
// While a mission is active and the global hint toggle is on, the engine
// evaluates each rule once per second. The first rule whose `when` is
// true (and that hasn't already fired in this run, and that respects the
// global throttle) gets pushed into the dialog as a "VEX TIP" line.
//
// Rules with a `min` field aren't considered until that many seconds
// have elapsed in the mission — good for "you've been idle 20 seconds"
// style nudges.

const KEY_HINTS = "hw.hints.enabled";
const TICK_MS = 1000;
const THROTTLE_MS = 6000;     // min gap between any two hints

export function hintsEnabled() {
  try { return localStorage.getItem(KEY_HINTS) === "1"; }
  catch { return false; }
}
export function setHintsEnabled(v) {
  try { localStorage.setItem(KEY_HINTS, v ? "1" : "0"); } catch {}
}

export class HintEngine {
  constructor({ rules = [], dialog, ctxFactory }) {
    this.rules = rules;
    this.dialog = dialog;
    this.ctxFactory = ctxFactory;
    this.fired = new Set();
    this.startedAt = 0;
    this.lastFireAt = 0;
    this._iv = null;
  }

  start() {
    if (this._iv) return;
    this.startedAt = performance.now();
    this._iv = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    if (this._iv) { clearInterval(this._iv); this._iv = null; }
  }

  _tick() {
    if (!hintsEnabled()) return;
    const now = performance.now();
    if (now - this.lastFireAt < THROTTLE_MS) return;
    const elapsed = (now - this.startedAt) / 1000;

    let ctx;
    try { ctx = this.ctxFactory(elapsed); }
    catch { return; }

    for (const r of this.rules) {
      if (this.fired.has(r.id)) continue;
      if (r.min && elapsed < r.min) continue;
      let on = false;
      try { on = !!r.when(ctx); } catch { on = false; }
      if (!on) continue;
      this.fired.add(r.id);
      this.lastFireAt = now;
      this.dialog.say("VEX TIP", r.say);
      break;
    }
  }
}
