// AssaultZone — minimal top-down target sim. The player has X / Y / HP / Ammo
// stats that get bound to SimMemory addresses so the Scanner can find them.

import { memory } from "./sim-memory.js";

const TILE = 16;
const MAP_W = 22;
const MAP_H = 30;

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

class Player {
  constructor() {
    this.x = 5;     // tile coords; small ints so the scanner has work to do
    this.y = 5;
    this.hp = 100;
    this.ammo = 30;
  }
}

export class AssaultZone {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.map = buildMap();
    this.player = new Player();
    this.input = { up: false, down: false, left: false, right: false };
    this.lastMoveAt = 0;
    this.moveCooldownMs = 110;

    // Bind player stats to fake memory addresses. The Scanner sees these
    // as ordinary 4-byte ints among thousands of noise addresses.
    this.addrX = memory.bindGameValue("player.x", () => this.player.x, v => { this.player.x = v; });
    this.addrY = memory.bindGameValue("player.y", () => this.player.y, v => { this.player.y = v; });
    this.addrHP = memory.bindGameValue("player.hp", () => this.player.hp, v => { this.player.hp = v; });
    this.addrAmmo = memory.bindGameValue("player.ammo", () => this.player.ammo, v => { this.player.ammo = v; });

    this._wireInput();
    this._fitCanvas();
    window.addEventListener("resize", () => this._fitCanvas());
  }

  _fitCanvas() {
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight - 60; // leave room for tabs (handled by parent grid actually)
    // Keep map aspect ratio, fit width.
    const scale = Math.max(1, Math.floor(w / (MAP_W * TILE)));
    this.canvas.width  = MAP_W * TILE * scale;
    this.canvas.height = MAP_H * TILE * scale;
    this.scale = scale;
    this._draw();
  }

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

  _tryMove(dx, dy) {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
    if (this.map[ny][nx] === 1) return;
    this.player.x = nx;
    this.player.y = ny;
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

    // Sync game <-> memory (also applies any frozen writes).
    memory.tick();

    // HUD reads from the real game state (not memory) so the player can
    // see when a freeze is forcing memory to lie vs. observe.
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

    // Player
    const px = this.player.x * T;
    const py = this.player.y * T;
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
    ctx.fillStyle = "#022c12";
    ctx.fillRect(px + T / 2 - s, py + 2, 2 * s, T / 2);
  }

  start() {
    const loop = (t) => {
      this.update(t);
      this._draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
