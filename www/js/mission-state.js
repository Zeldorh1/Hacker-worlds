// Tracks which missions the player has completed; persisted to localStorage.

const KEY = "hw.state.v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.completed)) return null;
    return obj;
  } catch { return null; }
}

function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export class MissionState {
  constructor() {
    this.state = load() || { completed: [] };
    this._listeners = new Set();
  }

  isComplete(id) { return this.state.completed.includes(id); }

  markComplete(id) {
    if (this.isComplete(id)) return false;
    this.state.completed.push(id);
    save(this.state);
    this._emit();
    return true;
  }

  reset() {
    this.state = { completed: [] };
    save(this.state);
    this._emit();
  }

  on(fn)  { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(this); }
}

export const missionState = new MissionState();
