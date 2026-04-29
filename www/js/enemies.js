// Enemy NPCs for AssaultZone.
//
// Each enemy is a simple struct: { id, x, y, hp, alive }. They walk
// fixed patrol routes and bind their fields to consecutive simulated
// memory addresses — so missions can teach the "iterate the entity
// array" pattern (find one enemy's HP, then see that enemy[1] is
// +sizeof(struct) bytes away).
//
// Memory layout (per enemy, 4 ints = 16 bytes apart):
//   base + 0x00  -> id
//   base + 0x04  -> x
//   base + 0x08  -> y
//   base + 0x0C  -> hp
//
// We pick a random base address per game session and bind each cell
// at base + i*STRIDE + offset.

import { memory, SimMemory } from "./sim-memory.js";

const STRIDE = 16;
const F_ID = 0, F_X = 4, F_Y = 8, F_HP = 12;

const NAMES = ["GHOST", "RAVEN", "ECHO", "VYPER", "ORACLE"];

class Enemy {
  constructor(id, name, route) {
    this.id = id;
    this.name = name;
    this.route = route;        // [{x,y}, {x,y}, ...] waypoints
    this.target = 0;
    this.x = route[0].x;
    this.y = route[0].y;
    this.hp = 100;
    this.alive = 1;
    this.lastMoveAt = 0;
    this.moveCooldownMs = 220 + ((id * 47) % 90);   // staggered speeds
  }

  step(now) {
    if (!this.alive) return;
    if (now - this.lastMoveAt < this.moveCooldownMs) return;
    this.lastMoveAt = now;
    const tgt = this.route[this.target];
    if (this.x < tgt.x) this.x++;
    else if (this.x > tgt.x) this.x--;
    else if (this.y < tgt.y) this.y++;
    else if (this.y > tgt.y) this.y--;
    if (this.x === tgt.x && this.y === tgt.y) {
      this.target = (this.target + 1) % this.route.length;
    }
  }
}

// A handful of patrol loops scattered across the map.
function defaultRoutes(MAP_W, MAP_H) {
  return [
    [{ x: 4,  y: 12 }, { x: 18, y: 12 }],
    [{ x: 6,  y: 22 }, { x: 6,  y: 8  }],
    [{ x: 14, y: 18 }, { x: 14, y: 25 }, { x: 8, y: 25 }],
    [{ x: 16, y: 6  }, { x: 12, y: 6  }, { x: 12, y: 14 }, { x: 16, y: 14 }],
  ];
}

export class EnemyManager {
  constructor({ mapW, mapH }) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.enemies = [];
    this.baseAddr = 0;
    this._spawn();
    this._bindMemory();
  }

  _spawn() {
    const routes = defaultRoutes(this.mapW, this.mapH);
    for (let i = 0; i < routes.length; i++) {
      this.enemies.push(new Enemy(i + 1, NAMES[i % NAMES.length], routes[i]));
    }
  }

  _bindMemory() {
    // Reserve a contiguous block in fake memory for the entity array.
    this.baseAddr = memory.reserveBlock(STRIDE, this.enemies.length);
    this.enemies.forEach((e, i) => {
      const base = this.baseAddr + i * STRIDE;
      const A = (off) => SimMemory.formatAddr(base + off);
      memory.bindGameValueAt(A(F_ID), `enemy[${i}].id`,
        () => e.id, v => { e.id = v; });
      memory.bindGameValueAt(A(F_X),  `enemy[${i}].x`,
        () => e.x,  v => { e.x = v; });
      memory.bindGameValueAt(A(F_Y),  `enemy[${i}].y`,
        () => e.y,  v => { e.y = v; });
      memory.bindGameValueAt(A(F_HP), `enemy[${i}].hp`,
        () => e.hp, v => { e.hp = v; });
    });
  }

  reset() {
    for (const e of this.enemies) {
      e.x = e.route[0].x;
      e.y = e.route[0].y;
      e.target = 0;
      e.hp = 100;
      e.alive = 1;
      e.lastMoveAt = 0;
    }
  }

  /** Rebase: simulate "the dev relaunched the game and the OS allocated
   *  the entity array somewhere new in memory." Existing addresses
   *  become noise; new addresses get bound. Used by M8 POINTER SCAN. */
  rebase() {
    // Unbind every old enemy field — the cells stay (any watchlist
    // entry pointed at them will keep displaying), but they're now
    // ordinary noise.
    this.enemies.forEach((_, i) => {
      const base = this.baseAddr + i * STRIDE;
      [F_ID, F_X, F_Y, F_HP].forEach(off => {
        memory.unbind(SimMemory.formatAddr(base + off));
      });
    });
    // Pick a fresh base and re-bind.
    this.baseAddr = memory.reserveBlock(STRIDE, this.enemies.length);
    this.enemies.forEach((e, i) => {
      const base = this.baseAddr + i * STRIDE;
      const A = (off) => SimMemory.formatAddr(base + off);
      memory.bindGameValueAt(A(F_ID), `enemy[${i}].id`,
        () => e.id, v => { e.id = v; });
      memory.bindGameValueAt(A(F_X),  `enemy[${i}].x`,
        () => e.x,  v => { e.x = v; });
      memory.bindGameValueAt(A(F_Y),  `enemy[${i}].y`,
        () => e.y,  v => { e.y = v; });
      memory.bindGameValueAt(A(F_HP), `enemy[${i}].hp`,
        () => e.hp, v => { e.hp = v; });
    });
  }

  step(now) {
    for (const e of this.enemies) e.step(now);
  }

  /** Returns true if any of the player's watchlist addresses
      points into our bound enemy struct array. */
  baseAddressOf(idx, field) {
    return SimMemory.formatAddr(this.baseAddr + idx * STRIDE + field);
  }
}

EnemyManager.STRIDE = STRIDE;
EnemyManager.F_ID = F_ID;
EnemyManager.F_X  = F_X;
EnemyManager.F_Y  = F_Y;
EnemyManager.F_HP = F_HP;
