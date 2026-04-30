// Memory Scanner UI controller — Cheat Engine clone, simplified.
//
// Watchlist supports two entry types:
//   - direct: { type: "direct", addr, prevValue }
//       Frozen state lives on the memory cell itself (memory.setFrozen).
//   - chain:  { type: "chain", baseAddr, offset, frozen, frozenValue, prevValue }
//       Freeze is managed here in the watchlist tick — every tick we
//       resolve baseAddr -> baseValue, then write frozenValue to the
//       cell at formatAddr(baseValue + offset). Survives rebases.

import { memory, SimMemory } from "./sim-memory.js";
import { getToolName, setToolName, isToolFlagged } from "./anticheat.js";
import { codeSegment } from "./code-segment.js";

const MAX_RESULT_ROWS = 200;

function chainKey(baseAddr, offset) {
  return `chain:${baseAddr}+${offset}`;
}
function offHex(off) {
  return "0x" + off.toString(16).padStart(2, "0").toUpperCase();
}

export class Scanner {
  constructor(root, { audio } = {}) {
    this.root = root;
    this.audio = audio || null;
    this.lastResults = null;
    /** @type {Map<string, object>} */
    this.watch = new Map();
    this.lastPointerResults = null;

    this.$value    = root.querySelector("#scan-value");
    this.$mode     = root.querySelector("#scan-mode");
    this.$first    = root.querySelector("#btn-first-scan");
    this.$next     = root.querySelector("#btn-next-scan");
    this.$reset    = root.querySelector("#btn-reset-scan");
    this.$status   = root.querySelector("#scan-status");
    this.$results  = root.querySelector("#scan-results");
    this.$watch    = root.querySelector("#watchlist");

    this.$manualAddr     = root.querySelector("#manual-addr");
    this.$btnManualAdd   = root.querySelector("#btn-manual-add");
    this.$pointerTarget  = root.querySelector("#pointer-target");
    this.$btnFindPtr     = root.querySelector("#btn-find-pointers");
    this.$pointerStatus  = root.querySelector("#pointer-status");
    this.$pointerResults = root.querySelector("#pointer-results");

    this.$browseTarget   = root.querySelector("#browse-target");
    this.$btnBrowse      = root.querySelector("#btn-browse");
    this.$browseStatus   = root.querySelector("#browse-status");
    this.$browseResults  = root.querySelector("#browse-results");

    this.$fwwTarget      = root.querySelector("#fww-target");
    this.$btnFww         = root.querySelector("#btn-fww");
    this.$fwwStatus      = root.querySelector("#fww-status");
    this.$fwwResults     = root.querySelector("#fww-results");

    this.$first.addEventListener("click", () => this.firstScan());
    this.$next.addEventListener("click",  () => this.nextScan());
    this.$reset.addEventListener("click", () => this.reset());

    if (this.$btnManualAdd) {
      this.$btnManualAdd.addEventListener("click", () => this._manualAdd());
      this.$manualAddr.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); this._manualAdd(); }
      });
    }
    if (this.$btnFindPtr) {
      this.$btnFindPtr.addEventListener("click", () => this.findPointers());
    }
    if (this.$btnBrowse) {
      this.$btnBrowse.addEventListener("click", () => this.browseMemory());
    }
    if (this.$btnFww) {
      this.$btnFww.addEventListener("click", () => this.findWhatWrites());
    }

    this.$tool     = root.querySelector("#tool-name");
    this.$toolRow  = root.querySelector(".tool-row");
    this.$toolFlag = root.querySelector("#tool-flag");
    if (this.$tool) {
      this.$tool.value = getToolName();
      this._refreshToolFlag();
      this.$tool.addEventListener("input", () => {
        setToolName(this.$tool.value);
        this._refreshToolFlag();
      });
    }

    this.reset();
    this._tickWatchlist();
  }

  _refreshToolFlag() {
    const flagged = isToolFlagged(this.$tool ? this.$tool.value : undefined);
    if (this.$toolRow)  this.$toolRow.classList.toggle("flagged", flagged);
    if (this.$toolFlag) this.$toolFlag.hidden = !flagged;
  }

  _filterMode() {
    const r = this.root.querySelector('input[name="filter"]:checked');
    return r ? r.value : "exact";
  }

  reset() {
    this.lastResults = null;
    this.lastPointerResults = null;
    this.$results.innerHTML = '<li class="empty">No scan yet. Enter a value and tap "First Scan".</li>';
    this.$status.textContent = "No scan yet.";
    this.$next.disabled = true;
    if (this.$value) this.$value.value = "0";
    const exact = this.root.querySelector('input[name="filter"][value="exact"]');
    if (exact) exact.checked = true;
    if (this.$pointerResults) this.$pointerResults.innerHTML = "";
    if (this.$pointerStatus) this.$pointerStatus.textContent = "";
  }

  clearWatchlist() {
    for (const [, entry] of this.watch) {
      if (entry.type === "direct") memory.setFrozen(entry.addr, false);
    }
    this.watch.clear();
    this._renderWatchlist();
  }

  // ---- Scan ----

  firstScan() {
    const mode = this.$mode ? this.$mode.value : "exact";
    if (mode === "unknown") {
      this.lastResults = memory.scanAll();
      this._renderResults();
      this.$next.disabled = this.lastResults.length === 0;
      this.$status.textContent = `${this.lastResults.length} cells snapshotted (unknown initial value). Use 'changed' / 'decreased' / 'increased' next.`;
    } else {
      const v = parseInt(this.$value.value, 10);
      if (Number.isNaN(v)) { this.$status.textContent = "Enter a number."; return; }
      this.lastResults = memory.scan(v);
      this._renderResults();
      this.$next.disabled = this.lastResults.length === 0;
      this.$status.textContent = `${this.lastResults.length} match(es) for ${v}.`;
    }
    if (this.audio) this.audio.scan();
    this._emit("scan");
    this._emit("scan-action");
  }

  nextScan() {
    if (!this.lastResults) return;
    const mode = this._filterMode();
    const v = parseInt(this.$value.value, 10);
    if (mode === "exact" && Number.isNaN(v)) { this.$status.textContent = "Enter a number."; return; }
    this.lastResults = memory.filter(this.lastResults, mode, v);
    this._renderResults();
    this.$next.disabled = this.lastResults.length === 0;
    this.$status.textContent = `${this.lastResults.length} match(es) after filter (${mode}).`;
    if (this.audio) this.audio.scan();
    this._emit("scan");
    this._emit("scan-action");
  }

  _renderResults() {
    if (!this.lastResults || this.lastResults.length === 0) {
      this.$results.innerHTML = '<li class="empty">No matches.</li>';
      return;
    }
    const rows = this.lastResults.slice(0, MAX_RESULT_ROWS);
    const html = rows.map((r, i) => `
      <li class="row-in" style="animation-delay:${Math.min(i, 24) * 12}ms">
        <span class="addr">${r.addr}</span>
        <span class="val">${r.value}</span>
        <button class="add" data-addr="${r.addr}">+ watch</button>
      </li>
    `).join("");
    const tail = this.lastResults.length > MAX_RESULT_ROWS
      ? `<li class="empty">+${this.lastResults.length - MAX_RESULT_ROWS} more (narrow further)</li>`
      : "";
    this.$results.innerHTML = html + tail;
    this.$results.querySelectorAll("button.add").forEach(b => {
      b.addEventListener("click", () => this.addToWatchlist(b.dataset.addr));
    });
  }

  // ---- Manual address add ----

  _manualAdd() {
    if (!this.$manualAddr) return;
    const raw = (this.$manualAddr.value || "").trim();
    if (!raw) { return; }
    // Accept pointer-chain syntax: [0x...]+0x...   →   chain entry.
    // Whitespace around the brackets / plus is tolerated.
    const chain = raw.match(/^\[\s*(0x[0-9a-fA-F]+)\s*\]\s*\+\s*(0x[0-9a-fA-F]+|\d+)\s*$/);
    if (chain) {
      const baseHex = chain[1].slice(2).toUpperCase().padStart(12, "0");
      const baseAddr = "0x" + baseHex;
      const offRaw = chain[2];
      const offset = offRaw.toLowerCase().startsWith("0x")
        ? parseInt(offRaw, 16) : parseInt(offRaw, 10);
      if (!Number.isFinite(offset)) {
        this.$status.textContent = "Manual add: chain offset is not a number.";
        return;
      }
      this.addChainToWatchlist(baseAddr, offset);
      this.$manualAddr.value = "";
      this.$status.textContent = `Added chain [${baseAddr}]+${offHex(offset)} to watchlist.`;
      return;
    }
    // Otherwise treat as a direct hex address.
    let direct = raw;
    if (!direct.toLowerCase().startsWith("0x")) direct = "0x" + direct;
    const hex = direct.slice(2).toUpperCase();
    if (!/^[0-9A-F]+$/.test(hex)) {
      this.$status.textContent = "Manual add: not valid hex (or use [0x…]+0x… for chains).";
      return;
    }
    const padded = "0x" + hex.padStart(12, "0");
    this.addToWatchlist(padded);
    this.$manualAddr.value = "";
    this.$status.textContent = `Added ${padded} to watchlist.`;
  }

  // ---- Pointer scan ----

  findPointers() {
    if (!this.$pointerResults) return;
    let target = (this.$pointerTarget && this.$pointerTarget.value || "").trim();
    if (!target) {
      // Default to the first watched DIRECT entry.
      for (const [, entry] of this.watch) {
        if (entry.type === "direct") { target = entry.addr; break; }
      }
    }
    if (!target) {
      this.$pointerStatus.textContent = "No target — type a hex address or watch one first.";
      return;
    }
    if (!target.toLowerCase().startsWith("0x")) target = "0x" + target;
    const hex = target.slice(2).toUpperCase();
    const padded = "0x" + hex.padStart(12, "0");
    const hits = memory.findPointersTo(padded, 0x80, 4);
    this.lastPointerResults = hits;
    if (this.$pointerTarget) this.$pointerTarget.value = padded;
    if (hits.length === 0) {
      this.$pointerResults.innerHTML = '<li class="empty">No pointers resolve to that address. Try a different target — entity-array bases tend to be the answer.</li>';
      this.$pointerStatus.textContent = `0 pointers found for ${padded}.`;
      return;
    }
    this.$pointerStatus.textContent = `${hits.length} pointer chain(s) found for ${padded}.`;
    const html = hits.slice(0, 12).map(h => `
      <li class="row-in">
        <span class="addr">[${h.ptrAddr}]+${offHex(h.offset)}</span>
        <button class="add" data-base="${h.ptrAddr}" data-off="${h.offset}">+ chain</button>
      </li>
    `).join("");
    this.$pointerResults.innerHTML = html;
    this.$pointerResults.querySelectorAll("button.add").forEach(b => {
      b.addEventListener("click", () => {
        this.addChainToWatchlist(b.dataset.base, parseInt(b.dataset.off, 10));
      });
    });
    if (this.audio) this.audio.scan();
  }

  // ---- Browse Memory ----
  //
  // Show a window of consecutive 4-byte cells around a base address,
  // so the player can walk a struct by eye. Each row is one int32.
  // Highlights labelled cells (player.hp, ammo, etc.) so the player
  // can recognise that fields cluster in real game structs.

  browseMemory() {
    if (!this.$browseResults) return;
    let target = (this.$browseTarget && this.$browseTarget.value || "").trim();
    if (!target) {
      // Default to the first watched DIRECT entry.
      for (const [, entry] of this.watch) {
        if (entry.type === "direct") { target = entry.addr; break; }
      }
    }
    if (!target) {
      this.$browseStatus.textContent = "No target — type a hex address or watch one first.";
      return;
    }
    if (!target.toLowerCase().startsWith("0x")) target = "0x" + target;
    const hex = target.slice(2).toUpperCase();
    if (!/^[0-9A-F]+$/.test(hex)) {
      this.$browseStatus.textContent = "Browse: not valid hex.";
      return;
    }
    const padded = "0x" + hex.padStart(12, "0");
    if (this.$browseTarget) this.$browseTarget.value = padded;
    const baseN = SimMemory.addressToInt(padded);
    if (!Number.isFinite(baseN)) {
      this.$browseStatus.textContent = "Browse: address out of range.";
      return;
    }
    // Walk -0x10 .. +0x40 from the base in 4-byte steps.
    // We deliberately do NOT show field labels here — discovering
    // which offset is which by recognising values is the lesson.
    const startOff = -0x10;
    const endOff   = 0x40;
    const rows = [];
    for (let off = startOff; off <= endOff; off += 4) {
      const a = SimMemory.formatAddr(baseN + off);
      const cell = memory.cells.get(a);
      const value = cell ? cell.value : "—";
      const offStr = (off >= 0 ? "+" : "-") + "0x" + Math.abs(off).toString(16).toUpperCase().padStart(2, "0");
      rows.push({ addr: a, value, offStr, isBase: off === 0 });
    }
    this.lastBrowseBase = padded;
    // A value > ~4 billion is too big to be any normal stat
    // (HP, ammo, position, cooldown) — it's almost certainly a
    // POINTER. Show its hex form alongside the decimal and offer
    // a "→ follow" button that browses to that address. This is
    // what makes M17's player-struct → weapon-struct chain
    // walkable without having to mentally convert decimals to hex.
    const POINTER_THRESHOLD = 0x100000000;   // 4_294_967_296
    const formatPointer = (v) => {
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      if (Math.abs(v) < POINTER_THRESHOLD) return null;
      return SimMemory.formatAddr(v);
    };
    const html = rows.map(r => {
      const ptrAddr = formatPointer(r.value);
      const valDisplay = ptrAddr
        ? `${r.value} <em class="ptr-hex">${ptrAddr}</em>`
        : `${r.value}`;
      const followBtn = ptrAddr
        ? `<button class="add follow" data-follow="${ptrAddr}">→ follow</button>`
        : "";
      return `
      <li class="row-in${r.isBase ? " browse-base" : ""}${ptrAddr ? " browse-ptr" : ""}">
        <span class="addr">${r.offStr}  ${r.addr}</span>
        <span class="val">${valDisplay}</span>
        ${followBtn}
        <button class="add" data-addr="${r.addr}">+ watch</button>
      </li>`;
    }).join("");
    this.$browseResults.innerHTML = html;
    this.$browseResults.querySelectorAll("button.add").forEach(b => {
      if (b.dataset.follow) {
        b.addEventListener("click", () => {
          if (this.$browseTarget) this.$browseTarget.value = b.dataset.follow;
          this.browseMemory();
        });
      } else {
        b.addEventListener("click", () => this.addToWatchlist(b.dataset.addr));
      }
    });
    this.$browseStatus.textContent = `Browsing ${padded}: ${rows.length} cells around it.`;
    if (this.audio) this.audio.scan();
  }

  // ---- Find What Writes ----
  //
  // M22 territory. Take a target memory address, find every code
  // instruction that has fired recently and writes to it. Each row
  // gets a NOP / Restore button so the player can patch out the
  // damage / drain / whatever code path. Real CE: right-click cell
  // → 'Find what writes to this address' → 'Replace with code that
  // does nothing.'

  findWhatWrites() {
    if (!this.$fwwResults) return;
    let target = (this.$fwwTarget && this.$fwwTarget.value || "").trim();
    if (!target) {
      // Default to the first watched DIRECT entry.
      for (const [, entry] of this.watch) {
        if (entry.type === "direct") { target = entry.addr; break; }
      }
    }
    if (!target) {
      this.$fwwStatus.textContent = "No target — type a hex address or watch one first.";
      return;
    }
    if (!target.toLowerCase().startsWith("0x")) target = "0x" + target;
    const hex = target.slice(2).toUpperCase();
    if (!/^[0-9A-F]+$/.test(hex)) {
      this.$fwwStatus.textContent = "Find What Writes: not valid hex.";
      return;
    }
    const padded = "0x" + hex.padStart(12, "0");
    if (this.$fwwTarget) this.$fwwTarget.value = padded;
    const hits = codeSegment.findWritesTo(padded);
    if (hits.length === 0) {
      this.$fwwResults.innerHTML = '<li class="empty">No recent writes detected. Trigger the damage / drain (take a hit, wait for bleed, etc.) and try again.</li>';
      this.$fwwStatus.textContent = `0 instructions found writing to ${padded}.`;
      return;
    }
    this.$fwwStatus.textContent = `${hits.length} instruction(s) write to ${padded}.`;
    this._renderFwwHits(hits);
  }

  _renderFwwHits(hits) {
    const html = hits.map(inst => `
      <li class="row-in${inst.nopped ? " nopped" : ""}" data-id="${inst.id}">
        <span class="addr">${inst.addr}</span>
        <span class="val">${inst.name}${inst.nopped ? " · NOP'd" : ""}</span>
        <button class="add nop-btn" data-id="${inst.id}">${inst.nopped ? "Restore" : "NOP"}</button>
      </li>
    `).join("");
    this.$fwwResults.innerHTML = html;
    this.$fwwResults.querySelectorAll("button.nop-btn").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.dataset.id;
        if (codeSegment.isNopped(id)) codeSegment.restore(id);
        else codeSegment.nop(id);
        // Re-render the same hit list so the toggle reflects the new state.
        const refreshed = hits.map(h => codeSegment.get(h.id));
        this._renderFwwHits(refreshed);
        if (this.audio) this.audio.lock();
      });
    });
  }

  // ---- Watchlist ----

  addToWatchlist(addr) {
    if (this.watch.has(addr)) return;
    this.watch.set(addr, { type: "direct", addr, prevValue: memory.read(addr) });
    this._renderWatchlist();
    if (this.audio) this.audio.tap();
    this._emit("watch");
  }

  addChainToWatchlist(baseAddr, offset) {
    const key = chainKey(baseAddr, offset);
    if (this.watch.has(key)) return;
    this.watch.set(key, {
      type: "chain", baseAddr, offset,
      frozen: false, frozenValue: 0, prevValue: undefined,
    });
    this._renderWatchlist();
    if (this.audio) this.audio.tap();
    this._emit("watch");
  }

  removeFromWatchlist(key) {
    const entry = this.watch.get(key);
    if (!entry) return;
    if (entry.type === "direct") memory.setFrozen(entry.addr, false);
    this.watch.delete(key);
    this._renderWatchlist();
    this._emit("watch");
  }

  _entryDisplayAddr(entry) {
    return entry.type === "chain"
      ? `[${entry.baseAddr.slice(0, 6)}…]+${offHex(entry.offset)}`
      : entry.addr;
  }
  _entryFullAddr(entry) {
    return entry.type === "chain"
      ? `[${entry.baseAddr}]+${offHex(entry.offset)}`
      : entry.addr;
  }
  _resolveChain(entry) {
    const baseVal = memory.read(entry.baseAddr);
    if (baseVal == null || !Number.isFinite(baseVal)) return null;
    return SimMemory.formatAddr(baseVal + entry.offset);
  }

  _renderWatchlist() {
    if (this.watch.size === 0) {
      this.$watch.innerHTML = '<li class="empty">Tap "+ watch" on a result to track it here.</li>';
      return;
    }
    const html = [...this.watch.entries()].map(([key, entry]) => {
      const isChain = entry.type === "chain";
      let curVal, isFrozen;
      if (isChain) {
        const realAddr = this._resolveChain(entry);
        curVal = realAddr ? memory.read(realAddr) : undefined;
        isFrozen = !!entry.frozen;
      } else {
        curVal = memory.read(entry.addr);
        isFrozen = memory.isFrozen(entry.addr);
      }
      const display = curVal == null ? "—" : curVal;
      const cls = isChain ? "chain" : "";
      const dataAddrAttr = isChain ? "" : `data-addr="${entry.addr}"`;
      return `
        <li class="${cls}" data-key="${key}" ${dataAddrAttr} title="${this._entryFullAddr(entry)}">
          <span class="addr">${this._entryDisplayAddr(entry)}</span>
          <input class="value-edit" type="number" inputmode="numeric" value="${display}" />
          <label class="freeze"><input type="checkbox" class="freeze-cb" ${isFrozen ? "checked" : ""}/> freeze</label>
          <button class="remove">x</button>
        </li>`;
    }).join("");
    this.$watch.innerHTML = html;
    this.$watch.querySelectorAll("li").forEach(li => {
      const key = li.dataset.key;
      const entry = this.watch.get(key);
      if (!entry) return;
      li.querySelector(".value-edit").addEventListener("change", e => {
        const nv = parseInt(e.target.value, 10);
        if (Number.isNaN(nv)) return;
        if (entry.type === "direct") {
          memory.write(entry.addr, nv);
        } else {
          if (entry.frozen) entry.frozenValue = nv;
          const realAddr = this._resolveChain(entry);
          if (realAddr) memory.write(realAddr, nv);
        }
        this._emit("write");
      });
      li.querySelector(".freeze-cb").addEventListener("change", e => {
        const checked = e.target.checked;
        if (entry.type === "direct") {
          memory.setFrozen(entry.addr, checked);
        } else {
          entry.frozen = checked;
          if (checked) {
            const realAddr = this._resolveChain(entry);
            entry.frozenValue = realAddr ? (memory.read(realAddr) | 0) : 0;
          }
        }
        if (this.audio && checked) this.audio.lock();
        this._emit("freeze");
      });
      li.querySelector(".remove").addEventListener("click", () => this.removeFromWatchlist(key));
    });
  }

  _tickWatchlist() {
    setInterval(() => {
      for (const li of this.$watch.querySelectorAll("li[data-key]")) {
        const key = li.dataset.key;
        const entry = this.watch.get(key);
        if (!entry) continue;
        const input = li.querySelector(".value-edit");
        if (!input) continue;
        let cur, isFrozen;
        if (entry.type === "chain") {
          const realAddr = this._resolveChain(entry);
          cur = realAddr ? memory.read(realAddr) : undefined;
          isFrozen = !!entry.frozen;
          // Apply chain freeze every tick — write back to whatever the
          // pointer currently resolves to.
          if (entry.frozen && realAddr != null) {
            memory.write(realAddr, entry.frozenValue);
            cur = entry.frozenValue;
          }
        } else {
          cur = memory.read(entry.addr);
          isFrozen = memory.isFrozen(entry.addr);
        }
        li.classList.toggle("frozen", isFrozen);
        const display = cur == null ? "—" : cur;
        if (document.activeElement !== input) input.value = display;
        if (entry.prevValue !== undefined && entry.prevValue !== cur) {
          li.classList.remove("changed");
          void li.offsetWidth;
          li.classList.add("changed");
          setTimeout(() => li.classList.remove("changed"), 350);
        }
        entry.prevValue = cur;
      }
    }, 200);
  }

  _listeners = new Set();
  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(kind) { for (const fn of this._listeners) fn(kind, this); }
}
