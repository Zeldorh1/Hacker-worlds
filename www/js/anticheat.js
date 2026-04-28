// Anti-cheat detection meter.
// Models a target game scanning for known cheat tool signatures
// (process names, window titles). The detection meter fills over time
// while a blacklist match is active; if it hits 100% the mission fails
// with a "process terminated" reason.
//
// Real-world parallel: anti-cheat systems like EAC, BattlEye, or even
// indie homebrew checks call EnumProcesses / EnumWindows / FindWindowEx
// looking for strings like "Cheat Engine", "ArtMoney", "Memory Hack".
// The defender lesson is: rename your tool's window/process to something
// off the blacklist.

const KEY_TOOL_NAME = "hw.tool.name";
const DEFAULT_TOOL_NAME = "scanner.exe";

const BLACKLIST = [
  /scanner/i,
  /cheat/i,
  /\bhack/i,
  /memhack/i,
  /trainer/i,
  /injector/i,
  /artmoney/i,
  /editor\.exe/i,
];

export function getToolName() {
  try { return localStorage.getItem(KEY_TOOL_NAME) || DEFAULT_TOOL_NAME; }
  catch { return DEFAULT_TOOL_NAME; }
}
export function setToolName(v) {
  try { localStorage.setItem(KEY_TOOL_NAME, v || ""); } catch {}
}
export function isToolFlagged(name = getToolName()) {
  const s = String(name || "").trim();
  if (!s) return true;
  return BLACKLIST.some(rx => rx.test(s));
}

// Tunables — exposed so missions can adjust difficulty.
const TICK_MS = 200;
const RATE_FLAGGED   = 6.0;  // % per second while name matches a blacklist entry
const RATE_BENIGN    = 0.8;  // % per second otherwise — narrative pressure
const RATE_SCAN      = 4.0;  // one-shot bump on each First/Next Scan if flagged

export class Detection {
  constructor({ onChange, onTrip } = {}) {
    this.value = 0;          // 0..100
    this.running = false;
    this.onChange = onChange || (() => {});
    this.onTrip   = onTrip   || (() => {});
    this._iv = null;
    this._lastT = 0;
    this._tripped = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastT = performance.now();
    this._iv = setInterval(() => this._tick(), TICK_MS);
    this.onChange(this.value);
  }

  stop() {
    this.running = false;
    if (this._iv) { clearInterval(this._iv); this._iv = null; }
  }

  reset() {
    this.value = 0;
    this._tripped = false;
    this.onChange(this.value);
  }

  /** Add a one-shot bump (e.g. when the player presses "First Scan"). */
  bump(amount) {
    if (this._tripped) return;
    this.value = Math.min(100, this.value + amount);
    this.onChange(this.value);
    if (this.value >= 100) this._trip();
  }

  /** External signal: a "scan" action just occurred. Bumps if flagged. */
  noteScan() {
    if (isToolFlagged()) this.bump(RATE_SCAN);
  }

  _tick() {
    if (this._tripped) return;
    const now = performance.now();
    const dt = (now - this._lastT) / 1000;
    this._lastT = now;
    const rate = isToolFlagged() ? RATE_FLAGGED : RATE_BENIGN;
    this.value = Math.min(100, this.value + rate * dt);
    this.onChange(this.value);
    if (this.value >= 100) this._trip();
  }

  _trip() {
    if (this._tripped) return;
    this._tripped = true;
    this.stop();
    this.onTrip();
  }
}
