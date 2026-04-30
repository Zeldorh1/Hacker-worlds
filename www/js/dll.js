// DLL runtime — simulates an internal cheat written in C-style pseudocode
// and "injected" into the game process.
//
// Player writes two function bodies in the editor:
//   void onInject() { ... }   // called once when injected
//   void onTick()   { ... }   // called every frame (~60Hz)
//
// They get a small API equivalent to the Windows DLL surface a real
// internal cheat would use — read/write memory by address or label,
// freeze cells, log to a console, etc.
//
// "Compile" parses the source into JS via new Function() with the API
// names available as globals in the function's scope. "Inject" runs
// onInject once, then schedules onTick on requestAnimationFrame.
// "Eject" stops the rAF loop.
//
// Note: real C++ DLLs use stricter syntax than what the editor accepts.
// We're intentionally lenient so the player can paste the templates
// without fighting syntax. The Codex covers what the real C++ would
// look like.

import { memory } from "./sim-memory.js";

const MAX_CONSOLE_LINES = 200;
// localStorage key for the last successfully-compiled DLL source.
// M25 AUTO-INJECT reads this to auto-load on mission start, mirroring
// the DLL-hijacking pattern where your code persists across game
// restarts.
const SAVED_SOURCE_KEY = "hw.dll.lastSource";

export class DllRuntime {
  constructor() {
    /** @type {{onInject?:Function, onTick?:Function}|null} */
    this.compiled = null;
    this.running = false;
    this._rafId = 0;
    this._injectedAt = 0;
    this.console = [];
    this._listeners = new Set();
    /** Registered cheats — populated by register_cheat() calls in the
     *  player's DLL. Each: { label, tickFn, enabled }. The cheat menu
     *  reads this and renders a checkbox per entry; checked entries
     *  have their tickFn invoked every frame. */
    this.cheats = [];
  }

  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(this); }

  injectedFor() {
    return this.running ? performance.now() - this._injectedAt : 0;
  }

  log(msg) {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    this.console.push(line);
    if (this.console.length > MAX_CONSOLE_LINES) this.console.shift();
    this._emit();
  }

  clearConsole() { this.console = []; this._emit(); }

  /** Build the API the player's code will see as globals. */
  _makeApi() {
    return {
      read:          (addr) => memory.read(addr),
      write:         (addr, val) => memory.write(addr, val),
      freeze:        (addr) => memory.setFrozen(addr, true),
      unfreeze:      (addr) => memory.setFrozen(addr, false),
      is_frozen:     (addr) => memory.isFrozen(addr),
      addr_of:       (label) => memory.addressOfLabel(label),
      read_label:    (label) => memory.read(memory.addressOfLabel(label)),
      write_label:   (label, val) => memory.write(memory.addressOfLabel(label), val),
      freeze_label:  (label) => memory.setFrozen(memory.addressOfLabel(label), true),
      find_pointers_to: (addr) => memory.findPointersTo(addr, 0x80, 4),
      log:           (msg) => this.log(String(msg)),
      // M23 — register a cheat in the in-game menu. The menu pops up
      // on DELETE key (or the menu button). Checked cheats invoke
      // their tickFn each frame after the user's onTick.
      register_cheat: (label, tickFn) => {
        if (typeof tickFn !== "function") {
          this.log("[register_cheat] tickFn must be a function for '" + label + "'");
          return;
        }
        // Replace if a cheat with the same label is already registered
        // (so re-injects don't pile up duplicates).
        const idx = this.cheats.findIndex(c => c.label === label);
        if (idx >= 0) this.cheats[idx] = { label, tickFn, enabled: this.cheats[idx].enabled };
        else this.cheats.push({ label, tickFn, enabled: false });
        this._emit();
      },
    };
  }

  /** Toggle a registered cheat. Called by the menu UI. */
  setCheatEnabled(label, enabled) {
    const c = this.cheats.find(x => x.label === label);
    if (c) { c.enabled = !!enabled; this._emit(); }
  }

  clearCheats() { this.cheats = []; this._emit(); }

  /**
   * Compile the source. Stops any current injection first.
   * Returns { ok: true } or { ok: false, error: "..." }.
   */
  compile(source) {
    this.eject();
    // Strip C-style cruft so JS new Function() accepts the body. We
    // keep the user-typed code mostly intact — just rewrite a few
    // patterns that would be JS errors.
    const js = source
      // void / int / auto declarations → just the function name
      .replace(/\b(?:void|int|float|double|auto|bool)\s+(?=\w+\s*\()/g, "function ")
      // // comments stay
      // /* */ comments stay
      ;
    const wrapped = `
"use strict";
${js}
return {
  onInject: typeof onInject === "function" ? onInject : null,
  onTick:   typeof onTick   === "function" ? onTick   : null,
};
`;
    let factory;
    try {
      factory = new Function(
        "read", "write", "freeze", "unfreeze", "is_frozen",
        "addr_of", "read_label", "write_label", "freeze_label",
        "find_pointers_to", "log", "register_cheat",
        wrapped
      );
    } catch (e) {
      return { ok: false, error: "compile error: " + e.message };
    }
    let result;
    try {
      const a = this._makeApi();
      result = factory(
        a.read, a.write, a.freeze, a.unfreeze, a.is_frozen,
        a.addr_of, a.read_label, a.write_label, a.freeze_label,
        a.find_pointers_to, a.log, a.register_cheat
      );
    } catch (e) {
      return { ok: false, error: "factory error: " + e.message };
    }
    if (!result.onInject && !result.onTick) {
      return { ok: false, error: "no onInject() or onTick() function defined" };
    }
    this.compiled = result;
    // Persist source on successful compile — M25 AUTO-INJECT picks
    // this up on mission start to pre-load + auto-inject. Real-world
    // equivalent: the DLL file sitting on disk between game launches.
    try { localStorage.setItem(SAVED_SOURCE_KEY, source); } catch {}
    this._emit();
    return { ok: true };
  }

  /** Read the last successfully-compiled source from localStorage.
   *  M25 AUTO-INJECT uses this. Returns null if nothing saved. */
  getSavedSource() {
    try { return localStorage.getItem(SAVED_SOURCE_KEY); }
    catch { return null; }
  }
  hasSavedSource() { return !!this.getSavedSource(); }
  clearSavedSource() {
    try { localStorage.removeItem(SAVED_SOURCE_KEY); } catch {}
  }

  inject() {
    if (!this.compiled) return false;
    if (this.running) return true;
    this.running = true;
    this._injectedAt = performance.now();
    if (this.compiled.onInject) {
      try { this.compiled.onInject(); }
      catch (e) { this.log("[onInject error] " + e.message); }
    }
    const loop = () => {
      if (!this.running) return;
      if (this.compiled && this.compiled.onTick) {
        try { this.compiled.onTick(); }
        catch (e) {
          this.log("[onTick error] " + e.message + " — DLL ejected");
          this.eject();
          return;
        }
      }
      // Run every enabled menu-registered cheat after the user's tick.
      for (const c of this.cheats) {
        if (!c.enabled) continue;
        try { c.tickFn(); }
        catch (e) {
          this.log("[cheat '" + c.label + "' error] " + e.message);
          c.enabled = false;   // disable broken cheats so they don't spam
          this._emit();
        }
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
    this._emit();
    return true;
  }

  eject() {
    if (!this.running) return;
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    this.cheats = [];   // clear registered cheats — re-inject re-registers
    this.log("DLL ejected");
    this._emit();
  }
}

export const dllRuntime = new DllRuntime();
