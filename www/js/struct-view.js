// Live ReClass-style structure viewer.
//
// Shows the chain that resolves real-game-style pointer references:
//
//   [ local_player_ptr (static cell) ]
//             ↓
//   [ PLAYER STRUCT ]
//     +0x00  hp
//     +0x04  ammo
//     ...
//
//   [ entity_arr_ptr (static cell) ]
//             ↓
//   [ ENTITY ARRAY ]
//     enemy[0] (substruct)
//     enemy[1] (substruct)
//     ...
//
// Values update every 250ms while the tab is visible. Frozen fields
// get a green tint. This is the curriculum's equivalent of opening
// ReClass.NET on a target process — the visual map of memory layout.

import { memory } from "./sim-memory.js";

// Player struct field layout — must match what target binds at the
// playerStructBase. Mirrors the comments in target-assaultzone.js.
// Type column: int32 (4 bytes signed), uint32 (4 bytes unsigned),
// ptr (pointer-sized: 4 on x86, 8 on x64). See "C++ Types for Cheat
// Devs" codex article for what each type means at the byte level.
const PLAYER_FIELDS = [
  { offset: 0x00, name: "hp",                  type: "int32", label: "player.hp" },
  { offset: 0x04, name: "ammo",                type: "int32", label: "player.ammo" },
  { offset: 0x08, name: "x",                   type: "int32", label: "player.x" },
  { offset: 0x0C, name: "y",                   type: "int32", label: "player.y" },
  { offset: 0x10, name: "moveCooldownMs",      type: "int32", label: "player.moveCooldownMs" },
  { offset: 0x14, name: "currentWeaponPtr",    type: "ptr",   label: "player.currentWeaponPtr" },
  { offset: 0x18, name: "alive",               type: "int32", label: "player.alive" },
  { offset: 0x1C, name: "respawnTimerMs",      type: "int32", label: "player.respawnTimerMs" },
  { offset: 0x20, name: "respawn.x",           type: "int32", label: "respawn.x" },
  { offset: 0x24, name: "respawn.y",           type: "int32", label: "respawn.y" },
  { offset: 0x28, name: "noClip",              type: "int32", label: "player.noClip" },
];

// Weapon struct fields — referenced via player + 0x14 chain.
const WEAPON_FIELDS = [
  { offset: 0x00, name: "damage",              type: "int32", label: "weapon.damage" },
  { offset: 0x04, name: "cooldownMs",          type: "int32", label: "weapon.cooldownMs" },
  { offset: 0x08, name: "recoilPerShot",       type: "int32", label: "weapon.recoilPerShot" },
];

// Enemy struct fields (each enemy entry in the entity array).
const ENEMY_FIELD_DEFS = [
  { offset: 0x00, name: "id",   type: "int32" },
  { offset: 0x04, name: "x",    type: "int32" },
  { offset: 0x08, name: "y",    type: "int32" },
  { offset: 0x0C, name: "hp",   type: "int32" },
];

function formatVal(v) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") {
    if (v > 0xFFFFFFF) return "0x" + v.toString(16).toUpperCase();
    return String(v | 0);
  }
  return String(v);
}

// Type → byte size + display color, helps reinforce the C++ Types codex.
const TYPE_INFO = {
  int32:  { bytes: 4, color: "#22d3ee", short: "i32" },
  uint32: { bytes: 4, color: "#22d3ee", short: "u32" },
  int16:  { bytes: 2, color: "#a78bfa", short: "i16" },
  uint16: { bytes: 2, color: "#a78bfa", short: "u16" },
  int8:   { bytes: 1, color: "#fbbf24", short: "i8"  },
  uint8:  { bytes: 1, color: "#fbbf24", short: "u8"  },
  float:  { bytes: 4, color: "#34d399", short: "f32" },
  double: { bytes: 8, color: "#34d399", short: "f64" },
  ptr:    { bytes: 8, color: "#f472b6", short: "ptr" },
  bool:   { bytes: 1, color: "#fbbf24", short: "b" },
};

function fieldRow(label, offset, value, frozen, type) {
  const cls = frozen ? "struct-field frozen" : "struct-field";
  const offHex = "+0x" + offset.toString(16).toUpperCase().padStart(2, "0");
  const tinfo = TYPE_INFO[type] || { bytes: 4, color: "#94a3b8", short: type || "?" };
  const typeBadge = `<span class="type-badge" style="color:${tinfo.color};border-color:${tinfo.color}88;" title="${tinfo.bytes} byte${tinfo.bytes !== 1 ? 's' : ''}">${tinfo.short}</span>`;
  return `
    <div class="${cls}">
      <span class="offset">${offHex}</span>
      ${typeBadge}
      <span class="name">${label}</span>
      <span class="value">${formatVal(value)}</span>
      <span class="icon">${frozen ? "❄" : ""}</span>
    </div>`;
}

function staticCellHtml(label, addr, valueDescription) {
  return `
    <div class="struct-cell">
      <div class="label">${label}</div>
      <div class="addr">cell @ ${addr || "—"}</div>
      <div class="ptr-value">value: ${valueDescription}</div>
    </div>`;
}

function arrowHtml() {
  return `<div class="struct-arrow">↓</div>`;
}

export class StructView {
  constructor() {
    this.$root = document.getElementById("struct-content");
    this._timer = null;
  }

  start() {
    if (this._timer) return;
    this._render();
    this._timer = setInterval(() => this._render(), 250);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _render() {
    if (!this.$root) return;
    const target = window.__hw && window.__hw.target;
    if (!target) {
      this.$root.innerHTML = `<div class="struct-empty">Target not initialized.</div>`;
      return;
    }

    const modulesHtml = this._renderModules(target);
    const playerHtml = this._renderPlayerChain(target);
    const enemyHtml = this._renderEntityChain(target);
    const weaponHtml = this._renderWeaponChain(target);

    this.$root.innerHTML = modulesHtml + playerHtml + weaponHtml + enemyHtml;
  }

  _renderModules(target) {
    // Mirrors Cheat Engine's "View -> Memory View -> Modules" pane.
    // Shows the synthetic module base for ac_client.exe (and the other
    // 'always loaded' Windows DLLs we expose for M45 module-hide
    // missions). Real CE would list every DLL in the target process
    // with its current loaded base.
    const moduleBase = target._simModuleBase || 0;
    const moduleBaseStr = "0x" + moduleBase.toString(16).toUpperCase().padStart(8, "0");
    // Other 'visible' modules from M45 (cosmetic — the simulator
    // doesn't actually load them, but the M45 list mimics what
    // EnumProcessModules would return).
    const otherMods = (target.modules || [])
      .filter(m => m.name && !m.name.toLowerCase().includes("hacker worlds"))
      .map((m, i) => {
        const base = (moduleBase + 0x800000 * (i + 2)) >>> 0;
        const baseStr = "0x" + base.toString(16).toUpperCase().padStart(8, "0");
        return `<div class="mod-row"><span class="mod-name">${m.name}</span><span class="mod-base">${baseStr}</span></div>`;
      }).join("");

    return `
      <div class="struct-modules">
        <div class="struct-modules-title">LOADED MODULES (CE: View → Modules)</div>
        <div class="mod-row mod-row-primary">
          <span class="mod-name">ac_client.exe</span>
          <span class="mod-base">${moduleBaseStr}</span>
        </div>
        ${otherMods}
        <div class="struct-modules-tip">
          In CE, use <code>ac_client.exe+0x10F4F4</code> notation —
          CE auto-resolves the module base + offset.
        </div>
      </div>`;
  }

  _renderPlayerChain(target) {
    const localPlayerPtrAddr = memory.addressOfLabel("local_player_ptr");
    const localPlayerPtrValue = localPlayerPtrAddr
      ? "0x" + ((target.playerStructBase || 0).toString(16).toUpperCase().padStart(12, "0"))
      : "—";

    const fields = PLAYER_FIELDS.map(f => {
      const addr = memory.addressOfLabel(f.label);
      const value = addr ? memory.read(addr) : undefined;
      const frozen = addr ? memory.isFrozen(addr) : false;
      return fieldRow(f.name, f.offset, value, frozen, f.type);
    }).join("");

    return `
      <div class="struct-chain">
        ${staticCellHtml("local_player_ptr (M48 static base)", localPlayerPtrAddr, localPlayerPtrValue)}
        ${arrowHtml()}
        <div class="struct-box">
          <div class="struct-box-title">PLAYER STRUCT @ ${localPlayerPtrValue}</div>
          ${fields}
        </div>
      </div>`;
  }

  _renderWeaponChain(target) {
    const weaponPtrAddr = memory.addressOfLabel("player.currentWeaponPtr");
    const weaponBase = weaponPtrAddr ? memory.read(weaponPtrAddr) : undefined;
    const weaponBaseStr = weaponBase
      ? "0x" + (weaponBase | 0).toString(16).toUpperCase().padStart(12, "0")
      : "—";

    const fields = WEAPON_FIELDS.map(f => {
      const addr = memory.addressOfLabel(f.label);
      const value = addr ? memory.read(addr) : undefined;
      const frozen = addr ? memory.isFrozen(addr) : false;
      return fieldRow(f.name, f.offset, value, frozen, f.type);
    }).join("");

    return `
      <div class="struct-chain">
        <div class="struct-cell">
          <div class="label">player + 0x14 → currentWeaponPtr</div>
          <div class="ptr-value">value: ${weaponBaseStr}</div>
        </div>
        ${arrowHtml()}
        <div class="struct-box">
          <div class="struct-box-title">WEAPON STRUCT @ ${weaponBaseStr}</div>
          ${fields}
        </div>
      </div>`;
  }

  _renderEntityChain(target) {
    if (!target.enemyManager) return "";
    const entityPtrAddr = memory.addressOfLabel("entity_arr_ptr");
    const entityBase = entityPtrAddr ? memory.read(entityPtrAddr) : undefined;
    const entityBaseStr = entityBase
      ? "0x" + (entityBase | 0).toString(16).toUpperCase().padStart(12, "0")
      : "—";

    const enemies = target.enemyManager.enemies || [];
    const STRIDE = 0x10;   // 16 bytes per enemy (matches enemies.js)

    const enemyBlocks = enemies.map((e, i) => {
      const baseAddr = "0x" + (((target.enemyManager.baseAddr || 0) + i * STRIDE)
        .toString(16).toUpperCase().padStart(12, "0"));
      const fields = ENEMY_FIELD_DEFS.map(f => {
        const addr = memory.addressOfLabel(`enemy[${i}].${f.name}`);
        const value = addr ? memory.read(addr) : undefined;
        const frozen = addr ? memory.isFrozen(addr) : false;
        return fieldRow(f.name, f.offset, value, frozen, f.type);
      }).join("");
      const aliveTag = e.alive ? "" : ' <span style="color:#f87171">[dead]</span>';
      return `
        <div class="struct-substruct">
          <div class="struct-substruct-title">enemy[${i}] @ ${baseAddr} — ${e.name || "?"}${aliveTag}</div>
          ${fields}
        </div>`;
    }).join("");

    return `
      <div class="struct-chain">
        ${staticCellHtml("entity_arr_ptr (M08 static base)", entityPtrAddr, entityBaseStr)}
        ${arrowHtml()}
        <div class="struct-box">
          <div class="struct-box-title">ENTITY ARRAY @ ${entityBaseStr} (stride 0x10)</div>
          ${enemyBlocks}
        </div>
      </div>`;
  }
}
