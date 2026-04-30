// Code segment — the executable part of the simulator's "process."
//
// Memory cells live in sim-memory.js. Code instructions live HERE:
// named callbacks the game runs each tick to mutate cells (bleed,
// hazards, server reconciliation, etc.). Each instruction has:
//
//   id        — internal ref ("bleed_tick")
//   name      — disassembly-style label ("BLEED_TICK_HANDLER")
//   addr      — fake "code address" the player sees in Find What Writes
//   writesTo  — list of memory addresses this instruction modifies
//   exec      — the actual function
//
// Real Cheat Engine flow this models:
//   1. Right-click cell → "Find what writes to this address"
//   2. CE attaches debugger, breakpoints on writes
//   3. You trigger damage; CE shows the instruction that fired
//   4. "Replace with code that does nothing" → NOPs the bytes
//
// In the simulator, "Find What Writes" returns instructions that have
// fired RECENTLY (last 8s) targeting the queried address. NOP flips a
// flag so the instruction's exec() doesn't run.

const RECENT_WRITE_WINDOW_MS = 8000;

function randHex(len) {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789ABCDEF"[Math.floor(Math.random() * 16)];
  return s;
}

class CodeSegment {
  constructor() {
    /** @type {Map<string, {id:string, name:string, addr:string, writesTo:string[], exec:Function, nopped:boolean, attemptedCount:number, executedCount:number, lastFiredAt:number}>} */
    this.instructions = new Map();
  }

  /** Register an instruction. */
  define(id, { name, writesTo = [], exec }) {
    // Fake "code address" — short hex like a real x64 instruction
    // pointer. Different format from data addresses to make it
    // recognisable as code (real CE shows code addrs without 0x
    // padding, so we mirror that visual cue).
    const addr = "0x" + randHex(8) + "_C";
    this.instructions.set(id, {
      id, name, addr, writesTo, exec,
      nopped: false,
      attemptedCount: 0,
      executedCount: 0,
      lastFiredAt: 0,
    });
  }

  /** Run an instruction. Returns true if it executed, false if NOPed
   *  or unknown. Always increments attemptedCount + lastFiredAt so
   *  Find What Writes can find it. */
  run(id) {
    const inst = this.instructions.get(id);
    if (!inst) return false;
    inst.attemptedCount++;
    inst.lastFiredAt = performance.now();
    if (inst.nopped) return false;
    inst.executedCount++;
    inst.exec();
    return true;
  }

  get(id) { return this.instructions.get(id); }

  nop(id) {
    const inst = this.instructions.get(id);
    if (inst) inst.nopped = true;
  }
  restore(id) {
    const inst = this.instructions.get(id);
    if (inst) inst.nopped = false;
  }
  isNopped(id) {
    const inst = this.instructions.get(id);
    return !!(inst && inst.nopped);
  }

  /** All instructions currently NOPed — used in mission win checks. */
  noppedIds() {
    const out = [];
    for (const [, inst] of this.instructions) if (inst.nopped) out.push(inst.id);
    return out;
  }

  /** Find What Writes — returns instructions that have FIRED recently
   *  and target the queried memory address. Mimics CE's "Find what
   *  writes to this address" workflow: you have to trigger the write
   *  by playing the game first, otherwise nothing shows up. */
  findWritesTo(addr) {
    const now = performance.now();
    const out = [];
    for (const [, inst] of this.instructions) {
      if (!inst.writesTo.includes(addr)) continue;
      // Skip instructions that have never fired — same as a CE
      // breakpoint that never gets hit.
      if (inst.lastFiredAt === 0) continue;
      if (now - inst.lastFiredAt > RECENT_WRITE_WINDOW_MS) continue;
      out.push(inst);
    }
    return out;
  }

  /** Reset all NOPs and counters — called between missions. */
  reset() {
    for (const [, inst] of this.instructions) {
      inst.nopped = false;
      inst.attemptedCount = 0;
      inst.executedCount = 0;
      inst.lastFiredAt = 0;
    }
  }
}

export const codeSegment = new CodeSegment();
export { CodeSegment };
