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

import { memory, SimMemory } from "./sim-memory.js";
import { AssaultZone } from "./target-assaultzone.js";
import { codeSegment } from "./code-segment.js";

// Real-world DLL entry-point transform.
//
// Detects the canonical injectable-DLL shape and rewrites it to the
// simulator's onInject/onTick contract:
//
//   DWORD WINAPI MainThread(LPVOID) {
//     <inject phase>
//     while (true) {
//       <tick phase>
//       Sleep(16);
//     }
//   }
//
//   BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, LPVOID) {
//     if (reason == DLL_PROCESS_ATTACH) {
//       DisableThreadLibraryCalls(h);
//       CreateThread(NULL, 0, MainThread, NULL, 0, NULL);
//     }
//     return TRUE;
//   }
//
// becomes:
//   void onInject() { <inject phase> }
//   void onTick()   { <tick phase, Sleep stripped> }
//
// Backwards-compat: templates that already define onInject/onTick
// directly skip the transform untouched.
function _findBalancedBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i + 1 < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function _extractFnBlock(src, headerRe) {
  const m = headerRe.exec(src);
  if (!m) return null;
  const braceIdx = m.index + m[0].length - 1;
  const endIdx = _findBalancedBrace(src, braceIdx);
  if (endIdx < 0) return null;
  return {
    start: m.index,
    end: endIdx + 1,
    bodyStart: braceIdx + 1,
    bodyEnd: endIdx,
  };
}

function _transformDllMainPattern(source) {
  const mainRe = /(?:[A-Za-z_]\w*\s+)*MainThread\s*\([^)]*\)\s*\{/;
  const main = _extractFnBlock(source, mainRe);
  if (!main) return source;

  const mainBody = source.slice(main.bodyStart, main.bodyEnd);

  let injectBody = mainBody;
  let tickBody = "";

  const whileRe = /\bwhile\s*\(\s*(?:true|1)\s*\)\s*\{/;
  const wm = whileRe.exec(mainBody);
  if (wm) {
    const wBraceIdx = wm.index + wm[0].length - 1;
    const wEnd = _findBalancedBrace(mainBody, wBraceIdx);
    if (wEnd >= 0) {
      injectBody = mainBody.slice(0, wm.index);
      tickBody = mainBody.slice(wBraceIdx + 1, wEnd);
      // Sleep() is the cooperative yield in a real DLL thread loop; the
      // simulator drives ticks via requestAnimationFrame, so we drop it.
      tickBody = tickBody.replace(/\bSleep\s*\([^)]*\)\s*;?/g, "");
    }
  }

  let cleaned = source.slice(0, main.start) + source.slice(main.end);

  // DllMain is pure boilerplate (CreateThread call) — strip it.
  const dllRe = /(?:[A-Za-z_]\w*\s+)*DllMain\s*\([^)]*\)\s*\{/;
  const dll = _extractFnBlock(cleaned, dllRe);
  if (dll) {
    cleaned = cleaned.slice(0, dll.start) + cleaned.slice(dll.end);
  }

  // Drop preprocessor directives — JS doesn't speak C preprocessor.
  cleaned = cleaned.replace(/^\s*#\s*(?:include|pragma|define)\b[^\n]*\n?/gm, "");

  cleaned += `\nvoid onInject() {\n${injectBody}\n}\n`;
  cleaned += `void onTick() {\n${tickBody}\n}\n`;
  return cleaned;
}

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
    /** Frame-audit hooks — fn(frame) → frame. Called when the AC's
     *  out-of-pipeline frame capture fires. frame = {espActive,
     *  renderHookCount}. Scrub the values to hide your overlay.
     *  M49 teaches this pattern (DXGI / kernel GPU sampler bypass). */
    this.frameAuditHooks = [];
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
    // Address normalizer — accepts both string format ("0x...") and
    // raw numbers (for arithmetic like client_base + 0x10F4F4 in the
    // M22a/M48a/M26a real-C++ form templates). If number, format to
    // the simulator's 12-char-padded hex string.
    const _addr = (a) => (typeof a === "number") ? SimMemory.formatAddr(a) : a;
    return {
      read:          (addr) => memory.read(_addr(addr)),
      write:         (addr, val) => memory.write(_addr(addr), val),
      freeze:        (addr) => memory.setFrozen(_addr(addr), true),
      unfreeze:      (addr) => memory.setFrozen(_addr(addr), false),
      is_frozen:     (addr) => memory.isFrozen(_addr(addr)),
      addr_of:       (label) => memory.addressOfLabel(label),
      read_label:    (label) => memory.read(memory.addressOfLabel(label)),
      write_label:   (label, val) => memory.write(memory.addressOfLabel(label), val),
      freeze_label:  (label) => memory.setFrozen(memory.addressOfLabel(label), true),
      find_pointers_to: (addr) => memory.findPointersTo(_addr(addr), 0x80, 4),
      // Win32 API aliases — let player write GetModuleHandleA("ac_client.exe")
      // exactly like real C++. Returns the synthetic module base from
      // target.engine.get_module_base.
      GetModuleHandleA: (name) => {
        const t = (typeof window !== "undefined" && window.__hw)
          ? window.__hw.target : null;
        return t && t.engine ? t.engine.get_module_base(name) : 0;
      },
      GetModuleHandleW: (name) => {
        const t = (typeof window !== "undefined" && window.__hw)
          ? window.__hw.target : null;
        return t && t.engine ? t.engine.get_module_base(name) : 0;
      },
      // Sleep alias — for cheat_thread loops in real-C++ form templates.
      // Returns a Promise the parser ignores; the simulator runs onTick
      // every frame regardless.
      Sleep: (ms) => undefined,
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
      // M64 — patch a code instruction. In real C++ this is a
      // memcpy at a known function address with a one-byte opcode:
      //   MemCopy((void*)ADDR_NORECOIL, "\\x90", 1);   // NOP
      //   MemCopy((void*)ADDR_RESPAWN,  "\\xC3", 1);   // RET (early-out)
      // Both effectively neutralize the instruction. The simulator's
      // codeSegment exposes named instructions (id-keyed); patch_code
      // toggles them between executing and NOPed.
      //   patch_code(id, "nop")  - NOP (instruction skipped)
      //   patch_code(id, "ret")  - early return (also skipped here)
      //   patch_code(id, null)   - restore original
      patch_code: (id, opcode) => {
        const inst = codeSegment.get(id);
        if (!inst) {
          this.log("[patch_code] unknown instruction id: " + id);
          return false;
        }
        if (opcode === null || opcode === undefined) {
          codeSegment.restore(id);
          this.log("[patch_code] " + id + " restored");
          return true;
        }
        const op = String(opcode).toLowerCase();
        const validOps = ["nop", "\\x90", "ret", "\\xc3"];
        if (!validOps.includes(op)) {
          this.log("[patch_code] unknown opcode: " + opcode + " (use nop or ret)");
          return false;
        }
        codeSegment.nop(id);
        this.log("[patch_code] " + id + " patched with " + op);
        return true;
      },
      // M64 — list code instructions the cheat can see, with their
      // simulated code addresses. Mirrors a reverse-engineering
      // session's address dump (from the Combat Arms cheat reference).
      list_code_addresses: () => {
        const out = [];
        for (const [, inst] of codeSegment.instructions) {
          out.push({ id: inst.id, name: inst.name, addr: inst.addr, nopped: !!inst.nopped });
        }
        return out;
      },
      // M66 — CAutoMessage-style packet builder. Real LithTech:
      //   CAutoMessage Msg;
      //   Msg.Writeuint8(ID_VoteKick);
      //   Msg.Writeuint16(target_id);
      //   pSendToServer(Msg.Read(), MESSAGE_GUARANTEED);
      // Sim equivalent: a builder that records typed fields, then
      // returns a structured packet you can hand to send_to_server.
      // Field types matter — Writeuint8 vs Writeuint16 changes the
      // binary layout the server expects.
      new_message: () => {
        const fields = [];
        return {
          write_uint8: (v) => { fields.push({ t: "u8", v: v & 0xff }); },
          write_uint16: (v) => { fields.push({ t: "u16", v: v & 0xffff }); },
          write_uint32: (v) => { fields.push({ t: "u32", v: v >>> 0 }); },
          write_string: (s) => { fields.push({ t: "str", v: String(s) }); },
          read: () => ({ _msg: true, fields: fields.slice() }),
          // Convenience: extract typed fields by index for the receiver.
          field_count: () => fields.length,
        };
      },
      // M54 — enumerate enemies from inside packet hooks / cheats.
      // Returns [{id, name, x, y, hp, alive}]. Real-world equivalent:
      // walking the engine's player/entity list (LTClient->GetClientList
      // in LithTech, IClientEntityList::GetClientEntity in Source).
      sim_enemies: () => {
        const t = (typeof window !== "undefined" && window.__hw)
          ? window.__hw.target : null;
        if (!t || !t.enemyManager) return [];
        return t.enemyManager.enemies.map(e => ({
          id: e.id, name: e.name, x: e.x, y: e.y, hp: e.hp, alive: !!e.alive,
        }));
      },
      // M50 — call a game-engine function directly. In real C++ this
      // is the typedef + ADDR cast + invoke pattern:
      //   typedef ret_t(*fn_t)(args...);
      //   fn_t pFn = (fn_t)ADDR_OF_FUNCTION;
      //   pFn(args);
      // The simulator exposes a name-keyed table of engine functions
      // on target.engine. M50/M51 use 'force_respawn', 'send_to_server',
      // 'valid_pointer'.
      call_engine_function: (name, ...args) => {
        const t = (typeof window !== "undefined" && window.__hw)
          ? window.__hw.target : null;
        if (!t || !t.engine) {
          this.log("[call_engine_function] engine not available");
          return null;
        }
        const fn = t.engine[name];
        if (typeof fn !== "function") {
          this.log("[call_engine_function] unknown function: " + name);
          return null;
        }
        try { return fn.apply(t.engine, args); }
        catch (e) {
          this.log("[call_engine_function error] " + e.message);
          return null;
        }
      },
      // M49 — hook the AC's out-of-pipeline frame capture. fn receives
      // a frame descriptor {espActive, renderHookCount} and should
      // return a scrubbed version with those fields zeroed to hide the
      // overlay from the AC's GPU sampler. Real-world equivalent:
      // hooking DXGI IDXGIOutputDuplication::AcquireNextFrame or
      // the kernel-mode GPU capture path before the AC reads the buffer.
      register_frame_audit_hook: (fn) => {
        if (typeof fn !== "function") {
          this.log("[register_frame_audit_hook] fn must be a function");
          return;
        }
        this.frameAuditHooks.push(fn);
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
        "register_isdebugger_hook", "find_pattern", "register_frame_audit_hook",
        "call_engine_function", "sim_enemies",
        "patch_code", "list_code_addresses", "new_message",
        "GetModuleHandleA", "GetModuleHandleW", "Sleep",
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
        a.register_isdebugger_hook, a.find_pattern, a.register_frame_audit_hook,
        a.call_engine_function, a.sim_enemies,
        a.patch_code, a.list_code_addresses, a.new_message,
        a.GetModuleHandleA, a.GetModuleHandleW, a.Sleep
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
    // M60 — keep the original source available so the AC string
    // scanner can search it for known cheat keywords. Cheats that
    // XOR-encrypt their strings hide them from this scan because
    // the plaintext doesn't appear in the source code at all.
    this.lastSource = source || "";
    // Strip C-style cruft so JS new Function() accepts the body. We
    // keep the user-typed code mostly intact — just rewrite a few
    // patterns that would be JS errors.
    //
    // The preprocessor handles real C++ syntax that the M22a/M48a/M26a
    // 'transparency sibling' missions use, so the player can write code
    // that looks LIKE real C++ in the editor and have it executed
    // against the simulator. Specifically translates:
    //   - Type declarations:   uintptr_t x = ... → var x = ...
    //   - Type casts:          (uintptr_t)expr → expr
    //   - Pointer-deref read:  *(int*)(addr) → read(addr)
    //   - Pointer-deref write: *(int*)(addr) = val; → write(addr, val);
    //   - const TYPE x = ...   → const x = ...
    //
    // Plus the existing function-decl conversion (void/int/etc. → function).
    const TYPE_NAMES = "HMODULE|HINSTANCE|HANDLE|HHOOK|HWND|uintptr_t|intptr_t|" +
      "DWORD|WORD|BYTE|QWORD|BOOL|UINT|" +
      "int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t|" +
      "LPVOID|LPCVOID|SIZE_T|HRESULT|LRESULT|WPARAM|LPARAM|LONG_PTR|WNDPROC|" +
      "Vector2|Vector3|Vector4|Matrix4x4|" +
      "ImVec2|ImVec4|IDirect3DDevice9";
    const SCALAR_TYPES = TYPE_NAMES + "|float|int|double|bool|char|void|wchar_t";

    let js = source;

    // STEP 0. Real-world DLL entry-point transform — extract the
    // MainThread/DllMain pattern into onInject/onTick. No-op for
    // templates that already define onInject/onTick directly.
    js = _transformDllMainPattern(js);

    // ORDER MATTERS. Pointer-deref patterns must run BEFORE cast strips
    // (otherwise cast strip eats the inner (TYPE*) and the deref pattern
    // can never match). Within deref patterns: WRITE before READ.

    // 1. Pointer-deref WRITE: *(TYPE*)(expr) = val; → write(expr, val);
    js = js.replace(
      /\*\s*\(\s*\w+\s*\*+\s*\)\s*\(([^)]+)\)\s*=\s*([^;]+);/g,
      "write($1, $2);");

    // 2. Pointer-deref READ: *(TYPE*)(expr) → read(expr) (as expression)
    js = js.replace(
      /\*\s*\(\s*\w+\s*\*+\s*\)\s*\(([^)]+)\)/g,
      "read($1)");

    // 3. NOW strip remaining C-style type casts: (TYPE)expr or (TYPE*)expr
    js = js.replace(
      new RegExp(`\\(\\s*(?:${SCALAR_TYPES})\\s*\\*?\\s*\\)\\s*`, "g"),
      "");

    // 4. const TYPE name = ... → const name = ...
    js = js.replace(
      new RegExp(`\\bconst\\s+(?:${SCALAR_TYPES})\\s+(?=\\w+\\s*=)`, "g"),
      "const ");

    // 5. TYPE name = ... → var name = ...   (decl with init)
    //    TYPE name;     → var name;         (decl without init)
    //    Excludes function decls (TYPE name(...)) — handled below
    //    because the lookahead requires '=' or ';' after the name.
    //    Uses SCALAR_TYPES (the broader set) so primitive decls like
    //    "bool g_HpFreeze = false;" or "int counter = 0;" rewrite too.
    js = js.replace(
      new RegExp(`\\b(?:${SCALAR_TYPES})\\s+(?=\\w+\\s*[=;])`, "g"),
      "var ");

    // 6. Existing function-decl rewrite: void/int/auto/etc. name(...) → function name(...)
    js = js.replace(
      /\b(?:void|int|float|double|auto|bool)\s+(?=\w+\s*\()/g,
      "function ");

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
        "register_isdebugger_hook", "find_pattern", "register_frame_audit_hook",
        "call_engine_function", "sim_enemies",
        "patch_code", "list_code_addresses", "new_message",
        "GetModuleHandleA", "GetModuleHandleW", "Sleep",
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
        a.register_isdebugger_hook, a.find_pattern, a.register_frame_audit_hook,
        a.call_engine_function, a.sim_enemies,
        a.patch_code, a.list_code_addresses, a.new_message,
        a.GetModuleHandleA, a.GetModuleHandleW, a.Sleep
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
    this.frameAuditHooks = []; // clear frame-audit hooks
    this.log("DLL ejected");
    this._emit();
  }
}

export const dllRuntime = new DllRuntime();
