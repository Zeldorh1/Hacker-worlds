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
   * Returns the assigned address.
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
      if (cell.frozen) {
        // Write the frozen value back into the game.
        if (cell.setter) cell.setter(cell.frozenValue | 0);
        cell.value = cell.frozenValue | 0;
      } else {
        cell.value = cell.getter() | 0;
      }
    }
    this._driftNoise();
  }

  read(addr) {
    const cell = this.cells.get(addr);
    return cell ? cell.value : undefined;
  }

  write(addr, value) {
    const cell = this.cells.get(addr);
    if (!cell) return false;
    cell.value = value | 0;
    if (cell.frozen) cell.frozenValue = value | 0;
    if (cell.setter) cell.setter(value | 0);
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
