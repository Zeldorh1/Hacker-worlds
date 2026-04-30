// Per-mission hint engine.
//
// Each mission can declare a list of hint rules:
//   { id: "...", when: (ctx) => bool, say: "...", min?: seconds }
//
// Two modes:
//   - Standard: respects the global hint toggle, throttles 6s between
//     hints, honors each rule's `min` delay.
//   - Guided (forced on for first-run of each mission): toggle is
//     bypassed, throttle drops to 2.5s, and `min` delays are clamped
//     to a brief 2s grace so VEX's intro can finish before the first
//     tip fires. Used to walk new players through their first attempt.

const KEY_HINTS = "hw.hints.enabled";
const TICK_MS = 800;
const THROTTLE_STANDARD_MS = 6000;
const THROTTLE_GUIDED_MS   = 2500;
const GUIDED_MIN_FLOOR_S   = 2;

export function hintsEnabled() {
  try { return localStorage.getItem(KEY_HINTS) === "1"; }
  catch { return false; }
}
export function setHintsEnabled(v) {
  try { localStorage.setItem(KEY_HINTS, v ? "1" : "0"); } catch {}
}

export class HintEngine {
  constructor({ rules = [], dialog, ctxFactory, guided = false }) {
    this.rules = rules;
    this.dialog = dialog;
    this.ctxFactory = ctxFactory;
    this.guided = !!guided;
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

  isActive() {
    return this.guided || hintsEnabled();
  }

  _tick() {
    if (!this.isActive()) return;
    // Don't pile hints onto an already-busy dialog queue — let the
    // player catch up first. This keeps guided walkthroughs feeling
    // like the *next* step rather than spam stacked behind the intro.
    if (this.dialog.queue && this.dialog.queue.length > 0) return;
    const now = performance.now();
    const throttle = this.guided ? THROTTLE_GUIDED_MS : THROTTLE_STANDARD_MS;
    if (now - this.lastFireAt < throttle) return;
    const elapsed = (now - this.startedAt) / 1000;

    let ctx;
    try { ctx = this.ctxFactory(elapsed); }
    catch { return; }

    for (const r of this.rules) {
      if (this.fired.has(r.id)) continue;
      const minDelay = this.guided ? Math.min(r.min ?? 0, GUIDED_MIN_FLOOR_S) : (r.min ?? 0);
      if (elapsed < minDelay) continue;
      let on = false;
      try { on = !!r.when(ctx); } catch { on = false; }
      if (!on) continue;
      this.fired.add(r.id);
      this.lastFireAt = now;
      const speaker = this.guided ? "VEX GUIDE" : "VEX TIP";
      const text = (typeof r.say === "function") ? r.say(ctx) : r.say;
      this.dialog.say(speaker, text);
      break;
    }
  }
}
