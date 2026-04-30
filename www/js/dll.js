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
import { AssaultZone } from "./target-assaultzone.js";

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
    /** Render hooks — registered via register_render_hook(fn). Each fn
     *  is called every frame from inside AssaultZone._draw() AFTER the
     *  game has drawn its frame. Receives (ctx, sim) — ctx is the
     *  Canvas 2D context, sim is a helper object with enemies(),
     *  player(), tile_size(), tile_to_screen(x, y).
     *
     *  Real-world equivalent: a MinHook detour on
     *  IDirect3DDevice9::EndScene that draws extra geometry between
     *  the game's last draw call and the device's Present. */
    this.renderHooks = [];
    /** Payload onTick functions registered via load_payload(). Each
     *  fires alongside the parent's onTick every frame, so a
     *  stager → payload chain just works. */
    this._payloadTicks = [];
    /** Packet hooks — { direction: "send"|"recv", fn }. The game
     *  sim runs each outgoing/incoming packet through the matching
     *  hooks before applying it. fn(packet) → packet | null
     *  (null drops the packet). Real-world equivalent: a detour on
     *  ws2_32!send / ws2_32!recv. */
    this.packetHooks = [];
    /** Input hooks — fn({type, x, y}) → boolean. Fired when the
     *  player taps the game canvas. M36 uses these to build a
     *  custom in-game menu without the simulator's built-in
     *  cheat-menu UI. Real-world equivalent: an ImGui WndProc
     *  detour or a custom Win32 input handler. */
    this.inputHooks = [];
    /** Process-enumeration hooks — fn(processes) → filtered list.
     *  M41 uses these to hide the simulator's Scanner from the
     *  HackShield-style anti-cheat scan. Real-world equivalent:
     *  hooking NtQuerySystemInformation in ntdll to filter the
     *  process list before the AC walks it. */
    this.processEnumHooks = [];
    /** Module-enumeration hooks — fn(modules) → filtered list.
     *  M45 uses these to hide an injected DLL from
     *  EnumProcessModules walks inside the game's own process. */
    this.moduleEnumHooks = [];
    /** IsDebuggerPresent hooks — fn(detected) → boolean.
     *  M46 uses these to lie about debugger presence. */
    this.isDebuggerHooks = [];
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
      // M26 — install a render hook. Every frame, after the game
      // finishes drawing, fn is called with (ctx, sim). ctx is the
      // canvas 2D context. sim has enemies(), player(),
      // tile_size(), tile_to_screen(x, y). Draw whatever you want.
      // Real-world equivalent: MinHook detour on EndScene.
      register_render_hook: (fn) => {
        if (typeof fn !== "function") {
          this.log("[register_render_hook] fn must be a function");
          return;
        }
        this.renderHooks.push(fn);
        this._emit();
      },
      // M38 — compute the simulator's session-HMAC over a packet
      // using the supplied key. Player workflow: read session.hmac_key
      // from memory, mutate the packet, then call this to re-sign.
      // The simulator's recv-side validator will accept the new sig.
      compute_hmac: (pkt, key) => {
        return AssaultZone.computeHmac(pkt, key | 0);
      },
      // M41 — hook the OS process-enumeration call. fn(processes)
      // gets the current process list; return a filtered list to
      // hide processes from anyone who walks the enumeration.
      // Real-world equivalent: NtQuerySystemInformation detour
      // (or ZwQuerySystemInformation, same thing).
      register_proc_enum_hook: (fn) => {
        if (typeof fn !== "function") {
          this.log("[register_proc_enum_hook] fn must be a function");
          return;
        }
        this.processEnumHooks.push(fn);
        this._emit();
      },
      // M45 — hook the in-process module-list call. Real-world
      // equivalent: detour on K32EnumProcessModules / Module32First.
      register_module_enum_hook: (fn) => {
        if (typeof fn !== "function") {
          this.log("[register_module_enum_hook] fn must be a function");
          return;
        }
        this.moduleEnumHooks.push(fn);
        this._emit();
      },
      // M46 — hook the IsDebuggerPresent check. fn(detected) →
      // boolean, where you can lie about whether a debugger is
      // attached. Real-world: detour on kernel32!IsDebuggerPresent
      // (or patch the PEB.BeingDebugged byte directly).
      register_isdebugger_hook: (fn) => {
        if (typeof fn !== "function") {
          this.log("[register_isdebugger_hook] fn must be a function");
          return;
        }
        this.isDebuggerHooks.push(fn);
        this._emit();
      },
      // M44 — scan memory for a sequence of consecutive int values
      // and return the address of the first match. Real-world
      // equivalent: AOB (array-of-bytes) pattern scan over the
      // game's loaded module — used by trainers to self-resolve
      // offsets across game updates without hardcoding.
      find_pattern: (values) => {
        if (!Array.isArray(values) || values.length === 0) return null;
        // Sort cells by numeric address so we can walk consecutive
        // 4-byte runs.
        const entries = [];
        for (const [addr, cell] of memory.cells) {
          entries.push({ n: parseInt(addr.slice(2), 16), addr, cell });
        }
        entries.sort((a, b) => a.n - b.n);
        for (let i = 0; i <= entries.length - values.length; i++) {
          let match = true;
          for (let j = 0; j < values.length; j++) {
            const e = entries[i + j];
            if (e.n !== entries[i].n + j * 4) { match = false; break; }
            if (e.cell.value !== values[j]) { match = false; break; }
          }
          if (match) return entries[i].addr;
        }
        return null;
      },
      // M36 — install an input hook. fn({type, x, y}) is called for
      // every canvas tap. Coordinates are in canvas pixel space (the
      // same space your render hook draws in). Return true to mark
      // the event 'handled' so the game doesn't react to the click.
      register_input_hook: (fn) => {
        if (typeof fn !== "function") {
          this.log("[register_input_hook] fn must be a function");
          return;
        }
        this.inputHooks.push(fn);
        this._emit();
      },
      // M30+ — install a packet hook. direction is "send" or "recv".
      // fn(packet) is called for every matching packet; return the
      // (possibly modified) packet, or null to drop it. Real-world
      // equivalent: MinHook detour on ws2_32!send / ws2_32!recv.
      register_packet_hook: (direction, fn) => {
        if (direction !== "send" && direction !== "recv") {
          this.log("[register_packet_hook] direction must be 'send' or 'recv'");
          return;
        }
        if (typeof fn !== "function") {
          this.log("[register_packet_hook] fn must be a function");
          return;
        }
        this.packetHooks.push({ direction, fn });
        this._emit();
      },
      // M35 — inject a packet directly into the network pipeline as
      // if the simulator generated it. direction is "send" or "recv".
      // Replay attack territory: capture a packet via recv-hook,
      // re-inject it later to claim repeat credit. Real-world
      // equivalent: replaying a captured 'kill' or 'level up' packet
      // against a server with no sequence-number validation.
      inject_packet: (direction, pkt) => {
        const target = (typeof window !== "undefined" && window.__hw)
          ? window.__hw.target : null;
        if (!target || !target.network || !target.network.enabled) {
          this.log("[inject_packet] no network target available");
          return false;
        }
        if (direction === "send") return target._sendPacket(pkt);
        if (direction === "recv") return target._recvPacket(pkt);
        this.log("[inject_packet] direction must be 'send' or 'recv'");
        return false;
      },
      // M27 STAGER — load a payload string as if it were a second DLL.
      // The stager DLL's job is to bootstrap, then call this with the
      // real cheat code (which can be embedded as a string literal,
      // decoded from base64, downloaded from a URL, etc).
      // Real-world equivalent: manual mapping a payload buffer, or
      // calling LoadLibraryA on a decrypted DLL written to disk.
      load_payload: (source) => {
        if (typeof source !== "string" || source.length === 0) {
          this.log("[load_payload] source must be a non-empty string");
          return false;
        }
        try {
          // Use the same factory wrapping as compile() so the payload
          // sees the same API surface — recursion through register_*
          // calls works (a payload can register cheats / render hooks).
          const wrapped = `"use strict";\n${source}\nreturn {
            onInject: typeof onInject === "function" ? onInject : null,
            onTick:   typeof onTick   === "function" ? onTick   : null,
          };`;
          const factory = new Function(
            "read", "write", "freeze", "unfreeze", "is_frozen",
            "addr_of", "read_label", "write_label", "freeze_label",
            "find_pointers_to", "log", "register_cheat",
            "register_render_hook", "register_packet_hook", "load_payload",
            "inject_packet", "register_input_hook", "compute_hmac",
        "register_proc_enum_hook", "register_module_enum_hook",
        "register_isdebugger_hook", "find_pattern",
            wrapped
          );
          const a = this._makeApi();
          const payload = factory(
            a.read, a.write, a.freeze, a.unfreeze, a.is_frozen,
            a.addr_of, a.read_label, a.write_label, a.freeze_label,
            a.find_pointers_to, a.log, a.register_cheat,
            a.register_render_hook, a.register_packet_hook, a.load_payload,
            a.inject_packet, a.register_input_hook, a.compute_hmac,
        a.register_proc_enum_hook, a.register_module_enum_hook,
        a.register_isdebugger_hook, a.find_pattern
          );
          // Fire the payload's onInject immediately. Schedule onTick
          // alongside the parent's onTick by appending to a list.
          if (payload.onInject) payload.onInject();
          if (payload.onTick) this._payloadTicks.push(payload.onTick);
          this.log("[load_payload] payload loaded — " + (payload.onTick ? "onTick scheduled" : "init only"));
          return true;
        } catch (e) {
          this.log("[load_payload error] " + e.message);
          return false;
        }
      },
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
        "register_render_hook", "register_packet_hook", "load_payload",
        "inject_packet", "register_input_hook", "compute_hmac",
        "register_proc_enum_hook", "register_module_enum_hook",
        "register_isdebugger_hook", "find_pattern",
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
        a.find_pointers_to, a.log, a.register_cheat,
        a.register_render_hook, a.register_packet_hook, a.load_payload,
        a.inject_packet, a.register_input_hook, a.compute_hmac,
        a.register_proc_enum_hook, a.register_module_enum_hook,
        a.register_isdebugger_hook, a.find_pattern
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
      // Run any payload onTick functions loaded via load_payload().
      for (const t of this._payloadTicks) {
        try { t(); }
        catch (e) {
          this.log("[payload tick error] " + e.message + " — payload removed");
          // Remove the broken tick to avoid spamming.
          this._payloadTicks = this._payloadTicks.filter(x => x !== t);
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
    this.cheats = [];           // clear registered cheats — re-inject re-registers
    this.renderHooks = [];      // clear render hooks
    this._payloadTicks = [];    // clear payload tick functions
    this.packetHooks = [];      // clear packet hooks
    this.inputHooks = [];       // clear input hooks
    this.processEnumHooks = []; // clear proc-enum hooks
    this.moduleEnumHooks = [];  // clear module-enum hooks
    this.isDebuggerHooks = [];  // clear isdebugger hooks
    this.log("DLL ejected");
    this._emit();
  }
}

export const dllRuntime = new DllRuntime();
