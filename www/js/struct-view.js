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
const PLAYER_FIELDS = [
  { offset: 0x00, name: "hp",                  label: "player.hp" },
  { offset: 0x04, name: "ammo",                label: "player.ammo" },
  { offset: 0x08, name: "x",                   label: "player.x" },
  { offset: 0x0C, name: "y",                   label: "player.y" },
  { offset: 0x10, name: "moveCooldownMs",      label: "player.moveCooldownMs" },
  { offset: 0x14, name: "currentWeaponPtr",    label: "player.currentWeaponPtr" },
  { offset: 0x18, name: "alive",               label: "player.alive" },
  { offset: 0x1C, name: "respawnTimerMs",      label: "player.respawnTimerMs" },
  { offset: 0x20, name: "respawn.x",           label: "respawn.x" },
  { offset: 0x24, name: "respawn.y",           label: "respawn.y" },
  { offset: 0x28, name: "noClip",              label: "player.noClip" },
];

// Weapon struct fields — referenced via player + 0x14 chain.
const WEAPON_FIELDS = [
  { offset: 0x00, name: "damage",              label: "weapon.damage" },
  { offset: 0x04, name: "cooldownMs",          label: "weapon.cooldownMs" },
  { offset: 0x08, name: "recoilPerShot",       label: "weapon.recoilPerShot" },
];

// Enemy struct fields (each enemy entry in the entity array).
const ENEMY_FIELD_DEFS = [
  { offset: 0x00, name: "id" },
  { offset: 0x04, name: "x" },
  { offset: 0x08, name: "y" },
  { offset: 0x0C, name: "hp" },
];

function formatVal(v) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") {
    if (v > 0xFFFFFFF) return "0x" + v.toString(16).toUpperCase();
    return String(v | 0);
  }
  return String(v);
}

function fieldRow(label, offset, value, frozen) {
  const cls = frozen ? "struct-field frozen" : "struct-field";
  const offHex = "+0x" + offset.toString(16).toUpperCase().padStart(2, "0");
  return `
    <div class="${cls}">
      <span class="offset">${offHex}</span>
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

    const playerHtml = this._renderPlayerChain(target);
    const enemyHtml = this._renderEntityChain(target);
    const weaponHtml = this._renderWeaponChain(target);

    this.$root.innerHTML = playerHtml + weaponHtml + enemyHtml;
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
      return fieldRow(f.name, f.offset, value, frozen);
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
      return fieldRow(f.name, f.offset, value, frozen);
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
        return fieldRow(f.name, f.offset, value, frozen);
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
