// AssaultZone — minimal top-down target sim. The player has X / Y / HP / Ammo
// stats that get bound to SimMemory addresses so the Scanner can find them.

import { memory } from "./sim-memory.js";

const TILE = 16;
const MAP_W = 22;
const MAP_H = 30;
const SPAWN = { x: 5, y: 5 };
const HAZARD_TICK_MS = 650;
const HAZARD_DAMAGE = 8;

// Static map: 0 = floor, 1 = wall. Generated once.
function buildMap() {
  const m = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      const wall = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1
                || (x % 7 === 3 && y > 4 && y < MAP_H - 4 && y % 5 !== 0);
      row.push(wall ? 1 : 0);
    }
    m.push(row);
  }
  return m;
}

// Pick floor tiles for spike traps — deterministic so the layout is stable
// from one play to the next.
function buildHazards(map) {
  const list = [];
  let seed = 0x1234;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  let placed = 0;
  for (let attempt = 0; attempt < 400 && placed < 14; attempt++) {
    const x = 1 + (rng() % (MAP_W - 2));
    const y = 6 + (rng() % (MAP_H - 8));
    if (map[y][x] === 1) continue;
    if (Math.abs(x - SPAWN.x) + Math.abs(y - SPAWN.y) < 4) continue;
    list.push({ x, y });
    placed++;
  }
  return list;
}

class Player {
  constructor() {
    this.x = SPAWN.x;
    this.y = SPAWN.y;
    this.hp = 100;
    this.ammo = 30;
  }
}

export class AssaultZone {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.map = buildMap();
    this.hazards = buildHazards(this.map);
    this.hazardsActive = false;
    this.player = new Player();
    this.input = { up: false, down: false, left: false, right: false };
    this.lastMoveAt = 0;
    this.moveCooldownMs = 110;
    this.lastHazardTickAt = 0;
    this.lastDamageAt = 0;
    this.damageEvents = 0;
    this.deaths = 0;

    // Bind player stats to fake memory addresses. The Scanner sees these
    // as ordinary 4-byte ints among thousands of noise addresses.
    this.addrX    = memory.bindGameValue("player.x",    () => this.player.x,    v => { this.player.x = v; });
    this.addrY    = memory.bindGameValue("player.y",    () => this.player.y,    v => { this.player.y = v; });
    this.addrHP   = memory.bindGameValue("player.hp",   () => this.player.hp,   v => { this.player.hp = v; });
    this.addrAmmo = memory.bindGameValue("player.ammo", () => this.player.ammo, v => { this.player.ammo = v; });

    this._wireInput();
    this._fitCanvas();
    window.addEventListener("resize", () => this._fitCanvas());
  }

  // ---- Mission control surface ----

  reset() {
    this.player.x = SPAWN.x;
    this.player.y = SPAWN.y;
    this.player.hp = 100;
    this.player.ammo = 30;
    this.hazardsActive = false;
    this.lastDamageAt = 0;
    this.damageEvents = 0;
    this.deaths = 0;
    // Unfreeze any cells from a previous run.
    for (const a of [this.addrX, this.addrY, this.addrHP, this.addrAmmo]) {
      memory.setFrozen(a, false);
    }
  }

  enableHazards()  { this.hazardsActive = true; }
  disableHazards() { this.hazardsActive = false; }

  // ---- Input ----

  _wireInput() {
    const setDir = (dir, on) => { this.input[dir] = on; };
    document.querySelectorAll("#touch-pad .pad-btn").forEach(btn => {
      const dir = btn.dataset.dir;
      const start = e => { e.preventDefault(); setDir(dir, true); };
      const end   = e => { e.preventDefault(); setDir(dir, false); };
      btn.addEventListener("touchstart", start, { passive: false });
      btn.addEventListener("touchend",   end,   { passive: false });
      btn.addEventListener("touchcancel", end,  { passive: false });
      btn.addEventListener("mousedown",  start);
      btn.addEventListener("mouseup",    end);
      btn.addEventListener("mouseleave", end);
    });
    window.addEventListener("keydown", e => {
      if (e.key === "ArrowUp"    || e.key === "w") setDir("up", true);
      if (e.key === "ArrowDown"  || e.key === "s") setDir("down", true);
      if (e.key === "ArrowLeft"  || e.key === "a") setDir("left", true);
      if (e.key === "ArrowRight" || e.key === "d") setDir("right", true);
    });
    window.addEventListener("keyup", e => {
      if (e.key === "ArrowUp"    || e.key === "w") setDir("up", false);
      if (e.key === "ArrowDown"  || e.key === "s") setDir("down", false);
      if (e.key === "ArrowLeft"  || e.key === "a") setDir("left", false);
      if (e.key === "ArrowRight" || e.key === "d") setDir("right", false);
    });
  }

  _fitCanvas() {
    const wrap = this.canvas.parentElement;
    const w = wrap ? wrap.clientWidth : 360;
    const scale = Math.max(1, Math.floor(w / (MAP_W * TILE)));
    this.canvas.width  = MAP_W * TILE * scale;
    this.canvas.height = MAP_H * TILE * scale;
    this.scale = scale;
    this._draw();
  }

  _tryMove(dx, dy) {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
    if (this.map[ny][nx] === 1) return;
    this.player.x = nx;
    this.player.y = ny;
  }

  _onHazardTile() {
    return this.hazards.some(h => h.x === this.player.x && h.y === this.player.y);
  }

  update(now) {
    if (now - this.lastMoveAt > this.moveCooldownMs) {
      let dx = 0, dy = 0;
      if (this.input.up) dy -= 1;
      else if (this.input.down) dy += 1;
      else if (this.input.left) dx -= 1;
      else if (this.input.right) dx += 1;
      if (dx !== 0 || dy !== 0) {
        this._tryMove(dx, dy);
        this.lastMoveAt = now;
      }
    }

    // Hazards apply damage on a slow tick if the player is standing on one.
    if (this.hazardsActive && now - this.lastHazardTickAt > HAZARD_TICK_MS) {
      this.lastHazardTickAt = now;
      if (this._onHazardTile()) {
        this.player.hp -= HAZARD_DAMAGE;
        this.lastDamageAt = now;
        this.damageEvents++;
        if (this.player.hp <= 0) {
          this.deaths++;
          this.player.hp = 100;
          this.player.x = SPAWN.x;
          this.player.y = SPAWN.y;
        }
      }
    }

    // Sync game <-> memory (also applies any frozen writes).
    memory.tick();

    // HUD reflects current game state.
    document.getElementById("hud-x").textContent  = this.player.x;
    document.getElementById("hud-y").textContent  = this.player.y;
    document.getElementById("hud-hp").textContent = this.player.hp;
  }

  _draw() {
    const ctx = this.ctx;
    const s = this.scale || 1;
    const T = TILE * s;

    ctx.fillStyle = "#02030a";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === 1) {
          ctx.fillStyle = "#1f2a33";
          ctx.fillRect(x * T, y * T, T, T);
          ctx.strokeStyle = "#2a3a45";
          ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
        } else {
          ctx.fillStyle = "#0a0f12";
          ctx.fillRect(x * T, y * T, T, T);
        }
      }
    }

    if (this.hazardsActive) {
      for (const h of this.hazards) {
        const hx = h.x * T;
        const hy = h.y * T;
        ctx.fillStyle = "#3a0e10";
        ctx.fillRect(hx, hy, T, T);
        ctx.strokeStyle = "#f87171";
        ctx.beginPath();
        // X mark
        ctx.moveTo(hx + 3, hy + 3);
        ctx.lineTo(hx + T - 3, hy + T - 3);
        ctx.moveTo(hx + T - 3, hy + 3);
        ctx.lineTo(hx + 3, hy + T - 3);
        ctx.stroke();
      }
    }

    const px = this.player.x * T;
    const py = this.player.y * T;
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
    ctx.fillStyle = "#022c12";
    ctx.fillRect(px + T / 2 - s, py + 2, 2 * s, T / 2);
  }

  start() {
    if (this._loopStarted) return;
    this._loopStarted = true;
    const loop = (t) => {
      this.update(t);
      this._draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
