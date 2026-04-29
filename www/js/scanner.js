// Memory Scanner UI controller — Cheat Engine clone, simplified.

import { memory } from "./sim-memory.js";
import { getToolName, setToolName, isToolFlagged } from "./anticheat.js";

const MAX_RESULT_ROWS = 200;

export class Scanner {
  constructor(root, { audio } = {}) {
    this.root = root;
    this.audio = audio || null;
    this.lastResults = null;
    this.watch = new Map();

    this.$value    = root.querySelector("#scan-value");
    this.$mode     = root.querySelector("#scan-mode");
    this.$first    = root.querySelector("#btn-first-scan");
    this.$next     = root.querySelector("#btn-next-scan");
    this.$reset    = root.querySelector("#btn-reset-scan");
    this.$status   = root.querySelector("#scan-status");
    this.$results  = root.querySelector("#scan-results");
    this.$watch    = root.querySelector("#watchlist");

    this.$first.addEventListener("click", () => this.firstScan());
    this.$next.addEventListener("click",  () => this.nextScan());
    this.$reset.addEventListener("click", () => this.reset());

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
    this.$results.innerHTML = '<li class="empty">No scan yet. Enter a value and tap "First Scan".</li>';
    this.$status.textContent = "No scan yet.";
    this.$next.disabled = true;
    if (this.$value) this.$value.value = "0";
    const exact = this.root.querySelector('input[name="filter"][value="exact"]');
    if (exact) exact.checked = true;
  }

  clearWatchlist() {
    for (const addr of [...this.watch.keys()]) {
      memory.setFrozen(addr, false);
      this.watch.delete(addr);
    }
    this._renderWatchlist();
  }

  firstScan() {
    const mode = this.$mode ? this.$mode.value : "exact";
    if (mode === "unknown") {
      // Cheat-Engine-style "Unknown initial value" — snapshot every
      // cell so the player can narrow with directional filters
      // (increased / decreased / changed) without having to read the
      // value off the HUD first.
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
    // Stagger each row's in-animation so they cascade like a stream.
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

  addToWatchlist(addr) {
    if (this.watch.has(addr)) return;
    this.watch.set(addr, { value: memory.read(addr) });
    this._renderWatchlist();
    if (this.audio) this.audio.tap();
    this._emit("watch");
  }

  removeFromWatchlist(addr) {
    this.watch.delete(addr);
    memory.setFrozen(addr, false);
    this._renderWatchlist();
    this._emit("watch");
  }

  _renderWatchlist() {
    if (this.watch.size === 0) {
      this.$watch.innerHTML = '<li class="empty">Tap "+ watch" on a result to track it here.</li>';
      return;
    }
    const html = [...this.watch.keys()].map(addr => {
      const cur = memory.read(addr);
      const frozen = memory.isFrozen(addr);
      return `
        <li data-addr="${addr}">
          <span class="addr">${addr}</span>
          <input class="value-edit" type="number" inputmode="numeric" value="${cur}" />
          <label class="freeze"><input type="checkbox" class="freeze-cb" ${frozen ? "checked" : ""}/> freeze</label>
          <button class="remove">x</button>
        </li>`;
    }).join("");
    this.$watch.innerHTML = html;
    this.$watch.querySelectorAll("li").forEach(li => {
      const addr = li.dataset.addr;
      li.querySelector(".value-edit").addEventListener("change", e => {
        const nv = parseInt(e.target.value, 10);
        if (Number.isNaN(nv)) return;
        memory.write(addr, nv);
        this._emit("write");
      });
      li.querySelector(".freeze-cb").addEventListener("change", e => {
        memory.setFrozen(addr, e.target.checked);
        if (this.audio && e.target.checked) this.audio.lock();
        this._emit("freeze");
      });
      li.querySelector(".remove").addEventListener("click", () => this.removeFromWatchlist(addr));
    });
  }

  // Live-refresh the displayed values in the watchlist so frozen vs. free are
  // visible without re-scanning. Pulses a row briefly when its value changes
  // so the user *sees* memory churning in front of them.
  _tickWatchlist() {
    const prev = new Map();
    setInterval(() => {
      for (const li of this.$watch.querySelectorAll("li[data-addr]")) {
        const addr = li.dataset.addr;
        const input = li.querySelector(".value-edit");
        if (!input) continue;
        const cur = memory.read(addr);
        const isFrozen = memory.isFrozen(addr);
        li.classList.toggle("frozen", isFrozen);
        if (document.activeElement !== input) {
          input.value = cur;
        }
        if (prev.has(addr) && prev.get(addr) !== cur) {
          li.classList.remove("changed");
          void li.offsetWidth;
          li.classList.add("changed");
          setTimeout(() => li.classList.remove("changed"), 350);
        }
        prev.set(addr, cur);
      }
    }, 200);
  }

  // Light pub/sub for missions to react to scanner activity.
  _listeners = new Set();
  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(kind) { for (const fn of this._listeners) fn(kind, this); }
}
