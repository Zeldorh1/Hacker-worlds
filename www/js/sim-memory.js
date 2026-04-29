// Simulated process memory.
// Holds many "noise" addresses with random values, plus a small set of
// addresses bound to real game state via getter/setter callbacks.
//
// Public API mirrors the conceptual flow of Cheat Engine:
//   memory.scan(value)              -> addresses currently equal to value
//   memory.filter(prev, mode, val?) -> narrow a previous result set
//   memory.read(addr) / .write(addr, val)
//   memory.setFrozen(addr, true)    -> writes pinned value back every tick

const NOISE_COUNT = 12000;
// Per tick we re-randomize a small batch of noise cells so scans don't
// snap to a single result on the first narrow — mirrors the "lots of memory
// is constantly changing" feel of a real running game.
const NOISE_DRIFT_PER_TICK = 40;

function randHex(len) {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789ABCDEF"[Math.floor(Math.random() * 16)];
  return s;
}

function randomAddress() {
  // 12-hex-char address, plausible-looking
  return "0x" + randHex(12);
}

class SimMemory {
  constructor() {
    /** @type {Map<string, {value:number, type:string, label?:string, getter?:Function, setter?:Function, frozen?:boolean, frozenValue?:number}>} */
    this.cells = new Map();
    /** @type {Map<string, string>} label -> address */
    this.labelIndex = new Map();
    this._populateNoise();
  }

  _randomNoiseValue() {
    const r = Math.random();
    if (r < 0.35)      return Math.floor(Math.random() * 200);
    else if (r < 0.6)  return Math.floor(Math.random() * 1000);
    else if (r < 0.85) return Math.floor(Math.random() * 0xFFFF);
    else               return (Math.random() * 0x7FFFFFFF) | 0;
  }

  _populateNoise() {
    this._noiseAddrs = [];
    for (let i = 0; i < NOISE_COUNT; i++) {
      const addr = randomAddress();
      if (this.cells.has(addr)) { i--; continue; }
      this.cells.set(addr, { value: this._randomNoiseValue(), type: "int32" });
      this._noiseAddrs.push(addr);
    }
  }

  _driftNoise() {
    for (let i = 0; i < NOISE_DRIFT_PER_TICK; i++) {
      const addr = this._noiseAddrs[(Math.random() * this._noiseAddrs.length) | 0];
      const cell = this.cells.get(addr);
      if (!cell) continue;
      cell.value = this._randomNoiseValue();
    }
  }

  /**
   * Bind a labeled value to a game-state getter/setter.
   * Returns the assigned address. Pass type="ptr" for cells that hold
   * 44-bit address values (skips int32 truncation in tick/write).
   */
  bindGameValue(label, getter, setter, type = "int32") {
    const addr = randomAddress();
    this._bindAt(addr, label, getter, setter, type);
    return addr;
  }

  /**
   * Bind a labeled value at a specific address — used to lay out
   * struct arrays at consecutive offsets so missions can teach the
   * "iterate the entity array" pattern.
   */
  bindGameValueAt(addr, label, getter, setter, type = "int32") {
    this._bindAt(addr, label, getter, setter, type);
    return addr;
  }

  _bindAt(addr, label, getter, setter, type) {
    // If a noise cell already holds this address, evict it from the
    // noise drift pool so it doesn't randomize over our bound value.
    if (this._noiseAddrs) {
      const i = this._noiseAddrs.indexOf(addr);
      if (i >= 0) this._noiseAddrs.splice(i, 1);
    }
    this.cells.set(addr, {
      value: getter() | 0,
      type,
      label,
      getter,
      setter,
    });
    this.labelIndex.set(label, addr);
  }

  /** Pick a fresh, unused base address that won't collide with existing cells.
   *  Uses 11 hex digits (44 bits) for the base so adding stride*count
   *  doesn't risk overflowing JS Number's 53-bit safe range. */
  reserveBlock(stride, count) {
    for (let attempt = 0; attempt < 32; attempt++) {
      const base = parseInt(randHex(11), 16);
      let ok = true;
      for (let i = 0; i < count; i++) {
        const a = SimMemory.formatAddr(base + i * stride);
        if (this.cells.has(a)) { ok = false; break; }
      }
      if (ok) return base;
    }
    // Extremely unlikely; fall back to a far-out base.
    return 0x100000000000 + ((Math.random() * 0x1000) | 0) * stride * count;
  }

  /** Format a numeric address back into the canonical "0x..." form. */
  static formatAddr(n) {
    return "0x" + n.toString(16).padStart(12, "0").toUpperCase();
  }

  addressOfLabel(label) { return this.labelIndex.get(label); }

  /** Called every game frame. Syncs bound values both directions and drifts noise. */
  tick() {
    for (const [, cell] of this.cells) {
      if (!cell.getter) continue;
      // Pointer-typed cells hold full address-sized numbers (up to ~44
      // bits in our sim), so we must NOT | 0 them; that would truncate.
      const truncate = cell.type !== "ptr";
      if (cell.frozen) {
        const fv = truncate ? (cell.frozenValue | 0) : cell.frozenValue;
        if (cell.setter) cell.setter(fv);
        cell.value = fv;
      } else {
        const gv = cell.getter();
        cell.value = truncate ? (gv | 0) : gv;
      }
    }
    this._driftNoise();
  }

  read(addr) {
    const cell = this.cells.get(addr);
    return cell ? cell.value : undefined;
  }

  /** Convert "0x..." back to a numeric address. */
  static addressToInt(addr) {
    if (typeof addr !== "string") return NaN;
    const s = addr.startsWith("0x") || addr.startsWith("0X") ? addr.slice(2) : addr;
    return parseInt(s, 16);
  }

  /** Drop the getter/setter binding for an address — used when an
   *  entity-array rebase relocates a struct, leaving the old cells as
   *  ordinary noise that no longer reflects any game state. */
  unbind(addr) {
    const cell = this.cells.get(addr);
    if (!cell) return;
    delete cell.getter;
    delete cell.setter;
    delete cell.label;
    delete cell.frozen;
    delete cell.frozenValue;
    if (this._noiseAddrs && !this._noiseAddrs.includes(addr)) {
      this._noiseAddrs.push(addr);
    }
    // Re-randomize so it looks like trash now, not the value it held.
    cell.value = this._randomNoiseValue();
  }

  /**
   * Find every cell whose `value + offset` equals the numeric form of
   * targetAddr, for offset in [0, alignment, 2*alignment, ..., maxOffset].
   * Returns [{ptrAddr, offset, value}], sorted by offset.
   *
   * Matches Cheat Engine's "Find pointers" first pass — given a
   * dynamic address you want to keep tabs on across restarts, you're
   * looking for any cell whose value, plus a small structure offset,
   * lands on it.
   */
  findPointersTo(targetAddr, maxOffset = 0x80, alignment = 4) {
    const targetN = SimMemory.addressToInt(targetAddr);
    if (!Number.isFinite(targetN)) return [];
    const out = [];
    for (const [addr, cell] of this.cells) {
      // DON'T truncate with | 0 — pointer-typed cells hold full 44-bit
      // address values. The check needs the raw value.
      const v = cell.value;
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      for (let off = 0; off <= maxOffset; off += alignment) {
        if (v + off === targetN) {
          out.push({ ptrAddr: addr, offset: off, value: cell.value });
          break;
        }
      }
    }
    return out;
  }

  write(addr, value) {
    const cell = this.cells.get(addr);
    if (!cell) return false;
    const v = (cell.type === "ptr") ? value : (value | 0);
    cell.value = v;
    if (cell.frozen) cell.frozenValue = v;
    if (cell.setter) cell.setter(v);
    return true;
  }

  setFrozen(addr, frozen) {
    const cell = this.cells.get(addr);
    if (!cell) return false;
    cell.frozen = !!frozen;
    if (frozen) cell.frozenValue = cell.value | 0;
    else delete cell.frozenValue;
    return true;
  }

  isFrozen(addr) {
    const cell = this.cells.get(addr);
    return !!(cell && cell.frozen);
  }

  /**
   * Find every address currently equal to value.
   * Returns: [{addr, value}]
   */
  scan(value) {
    const v = value | 0;
    const out = [];
    for (const [addr, cell] of this.cells) {
      if (cell.value === v) out.push({ addr, value: cell.value });
    }
    return out;
  }

  /**
   * Snapshot every cell — Cheat Engine's "Unknown initial value" first
   * scan. Subsequent narrows with increased / decreased / changed /
   * unchanged filters whittle the list down without you ever needing
   * to type a number.
   */
  scanAll() {
    const out = [];
    for (const [addr, cell] of this.cells) {
      out.push({ addr, value: cell.value });
    }
    return out;
  }

  /**
   * Filter a previous scan result against current memory.
   *   mode = "exact"      -> still equals value
   *   mode = "changed"    -> value differs from prev.value
   *   mode = "unchanged"  -> value still equals prev.value
   *   mode = "increased"  -> value is strictly greater than prev.value
   *   mode = "decreased"  -> value is strictly less than prev.value
   */
  filter(prev, mode, value) {
    const out = [];
    const v = value | 0;
    for (const r of prev) {
      const cell = this.cells.get(r.addr);
      if (!cell) continue;
      const cur = cell.value;
      if (mode === "exact"      && cur === v)         out.push({ addr: r.addr, value: cur });
      if (mode === "changed"    && cur !== r.value)   out.push({ addr: r.addr, value: cur });
      if (mode === "unchanged"  && cur === r.value)   out.push({ addr: r.addr, value: cur });
      if (mode === "increased"  && cur > r.value)     out.push({ addr: r.addr, value: cur });
      if (mode === "decreased"  && cur < r.value)     out.push({ addr: r.addr, value: cur });
    }
    return out;
  }
}

export const memory = new SimMemory();
export { SimMemory };
