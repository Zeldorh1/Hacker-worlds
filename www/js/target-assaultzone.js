// AssaultZone — minimal top-down target sim. The player has X / Y / HP / Ammo
// stats that get bound to SimMemory addresses so the Scanner can find them.

import { memory, SimMemory } from "./sim-memory.js";
import { EnemyManager } from "./enemies.js";

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
  constructor(canvas, { audio } = {}) {
    this.canvas = canvas;
    this.audio = audio || null;
    this.ctx = canvas.getContext("2d");
    this.map = buildMap();
    this.hazards = buildHazards(this.map);
    this.hazardsActive = false;
    this.player = new Player();
    this.input = { up: false, down: false, left: false, right: false };
    this.lastMoveAt = 0;
    this.moveCooldownMs = 110;
    this.tilesMoved = 0;
    this.lastHazardTickAt = 0;
    this.lastDamageAt = 0;
    this.damageEvents = 0;
    this.deaths = 0;

    this.bleedActive = false;
    this.bleedRate = 1;        // hp drained per bleedInterval
    this.bleedIntervalMs = 1500;
    this.lastBleedAt = 0;

    // M18 SERVER AUTHORITY — when enabled, damage events post to a
    // 'server' tracker that holds its own canonical HP. The server
    // ticks every ~1.5s; when its HP hits 0, you respawn regardless
    // of how the local player.hp cell is frozen. The lesson: in
    // multiplayer you have to find and freeze the AUTHORITATIVE
    // cell, not just the visible one.
    this.server = {
      enabled: false,
      canonicalHp: 100,
      pendingDamage: 0,
      lastTickAt: 0,
      tickIntervalMs: 1500,
    };

    // Player stats live in a contiguous 'player struct' in fake memory.
    // Real games do this — a single allocation holds every per-player
    // value, and code accesses them via [base + offset]. M16 STRUCT
    // DISCOVERY teaches the player to find one field, then walk the
    // struct to discover the rest.
    //
    // Layout (5 ints = 20 bytes; reserve 64 to leave room for future fields):
    //   +0x00  hp
    //   +0x04  ammo
    //   +0x08  x
    //   +0x0C  y
    //   +0x10  moveCooldownMs
    this.playerStructBase = memory.reserveBlock(64, 1);
    const PA = (off) => SimMemory.formatAddr(this.playerStructBase + off);
    this.addrHP   = memory.bindGameValueAt(PA(0x00), "player.hp",
      () => this.player.hp,   v => { this.player.hp = v; });
    this.addrAmmo = memory.bindGameValueAt(PA(0x04), "player.ammo",
      () => this.player.ammo, v => { this.player.ammo = v; });
    this.addrX    = memory.bindGameValueAt(PA(0x08), "player.x",
      () => this.player.x,    v => { this.player.x = v; });
    this.addrY    = memory.bindGameValueAt(PA(0x0C), "player.y",
      () => this.player.y,    v => { this.player.y = v; });
    this.addrMoveCooldown = memory.bindGameValueAt(PA(0x10), "player.moveCooldownMs",
      () => this.moveCooldownMs,
      v => { this.moveCooldownMs = v; });

    // Enemy entity array — patrol NPCs that future missions teach you to
    // find via the entity-array layout in memory.
    this.enemyManager = new EnemyManager({ mapW: MAP_W, mapH: MAP_H });
    this.enemiesActive = false;   // missions opt them in
    this.radarActive = false;
    this.espActive = false;
    this.enemiesCamouflaged = false;   // M13: enemies render dim until ESP flipped on

    // M13 WALLHACK — render flag bound as an int (0/1). Flipping it to 1
    // turns ESP on without touching the gameplay-side enableESP() path.
    // Real game equivalent: a boolean in a render config struct.
    this.addrEspVisible = memory.bindGameValue("render.espVisible",
      () => (this.espActive ? 1 : 0),
      v => { this.espActive = !!(v | 0); });

    // M18 — server's authoritative HP. Bound at a random address so
    // it doesn't sit next to the player struct (real game equivalent:
    // the server's authoritative state is a separate process or
    // remote machine). Default 100; mission turns it on via
    // enableServerAuthority(...).
    this.addrServerHp = memory.bindGameValue("server.canonicalHp",
      () => this.server.canonicalHp,
      v => { this.server.canonicalHp = v; });

    // Static pointer cell whose VALUE is always the current entity-array
    // base address. Survives rebases — the address itself never moves,
    // even though the value updates each tick. M8 POINTER SCAN teaches
    // you to find this cell so you can build a chain that resolves to
    // the current enemy[i].* across simulated game restarts.
    this.addrEntityArrPtr = memory.bindGameValue("entity_arr_ptr",
      () => this.enemyManager.baseAddr,
      () => {},   // read-only from gameplay's perspective
      "ptr");
    this.rebaseCount = 0;

    // Watchdog (M6) — a fake "anti-tamper" thread the target runs.
    // Bound to a memory cell that increments every 1.5s. While the cell
    // increments, an integrity check runs against the player's stat
    // cells; if any are frozen, violations climb. Freeze the watchdog
    // tick cell to halt the detection routine and stay safe.
    this.watchdog = {
      enabled: false,
      tickValue: 0,
      lastTickAt: 0,
      lastSeenTick: 0,
      violations: 0,
    };
    this.addrWatchdog = memory.bindGameValue("watchdog.tick",
      () => this.watchdog.tickValue,
      v => { this.watchdog.tickValue = v; });

    // Weapon (M7) — a fire button that damages whichever enemy is
    // currently in the crosshair (auto-targets the closest one).
    // crosshairTargetId is bound to memory so missions can teach
    // freezing it to lock onto a specific enemy.
    this.weapon = {
      enabled: false,
      lastFireAt: 0,
      cooldownMs: 320,
      damage: 25,
      recoilPerShot: 0,    // M17 enables this; 0 in earlier missions
      recoilCurrent: 0,    // accumulated recoil offset (decays in update)
    };
    this.crosshairTargetId = 0;
    this.aimbotKills = 0;
    this.killCount = 0;
    this.shotsFired = 0;
    this.shotsAtFullAmmoLock = 0;   // tracked from the moment ammo gets frozen
    this.addrCrosshair = memory.bindGameValue("crosshair.target",
      () => this.crosshairTargetId,
      v => { this.crosshairTargetId = v; });

    // Weapon stats live in their own struct, separately allocated.
    // Real games keep a weapon descriptor per gun and the player struct
    // holds a pointer to whichever is equipped. M17 RECOIL CONTROL
    // teaches the player to follow that pointer to find the recoil
    // stat — a 2-level chain rather than a flat scan.
    //
    // Layout (3 ints = 12 bytes; reserve 32 for future growth):
    //   +0x00  damage          (default 25, M11)
    //   +0x04  cooldownMs      (default 320, M14)
    //   +0x08  recoilPerShot   (M17 — typically 0; mission opts in)
    this.weaponStructBase = memory.reserveBlock(32, 1);
    const WA = (off) => SimMemory.formatAddr(this.weaponStructBase + off);
    this.addrWeaponDamage = memory.bindGameValueAt(WA(0x00), "weapon.damage",
      () => this.weapon.damage,
      v => { this.weapon.damage = v; });
    this.addrWeaponCooldown = memory.bindGameValueAt(WA(0x04), "weapon.cooldownMs",
      () => this.weapon.cooldownMs,
      v => { this.weapon.cooldownMs = v; });
    this.addrWeaponRecoil = memory.bindGameValueAt(WA(0x08), "weapon.recoilPerShot",
      () => this.weapon.recoilPerShot,
      v => { this.weapon.recoilPerShot = v; });

    // Player struct also holds a pointer to the active weapon
    // descriptor at +0x14. Browsing player struct shows this as a
    // huge int that 'looks like an address' — that's the M17 hook.
    // ptr-typed so memory.tick doesn't truncate the 44-bit value.
    this.addrPlayerWeaponPtr = memory.bindGameValueAt(
      SimMemory.formatAddr(this.playerStructBase + 0x14),
      "player.currentWeaponPtr",
      () => this.weaponStructBase,
      () => {},   // read-only from gameplay
      "ptr");

    this.paused = false;
    this._pausedAt = 0;

    this._wireInput();
    this._fitCanvas();
    window.addEventListener("resize", () => this._fitCanvas());
  }

  pause()  { if (!this.paused) { this.paused = true;  this._pausedAt = performance.now(); } }
  resume() {
    if (!this.paused) return;
    const pausedFor = performance.now() - this._pausedAt;
    this.paused = false;
    // Shift cooldown timestamps so the player doesn't get a free move
    // / hazard / bleed tick the instant they unpause.
    this.lastMoveAt      += pausedFor;
    this.lastBleedAt     += pausedFor;
    this.lastHazardTickAt += pausedFor;
    if (this.watchdog.lastTickAt) this.watchdog.lastTickAt += pausedFor;
    if (this.weapon.lastFireAt)   this.weapon.lastFireAt += pausedFor;
  }
  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  // ---- Mission control surface ----

  reset() {
    this.player.x = SPAWN.x;
    this.player.y = SPAWN.y;
    this.player.hp = 100;
    this.player.ammo = 30;
    this.paused = false;
    this.hazardsActive = false;
    this.bleedActive = false;
    this.enemiesActive = false;
    this.watchdog.enabled = false;
    this.watchdog.tickValue = 0;
    this.watchdog.lastTickAt = 0;
    this.watchdog.lastSeenTick = 0;
    this.watchdog.violations = 0;
    this.weapon.enabled = false;
    this.weapon.lastFireAt = 0;
    this.weapon.damage = 25;
    this.weapon.cooldownMs = 320;
    this.weapon.recoilPerShot = 0;
    this.weapon.recoilCurrent = 0;
    this.weapon.missesFromRecoil = 0;
    this._lastRecoilDecayAt = 0;
    this.crosshairTargetId = 0;
    this.aimbotKills = 0;
    this.killCount = 0;
    this.shotsFired = 0;
    this.shotsAtFullAmmoLock = 0;
    this.tilesMoved = 0;
    this.moveCooldownMs = 110;
    document.getElementById("hud-weapon")?.setAttribute("hidden", "");
    document.getElementById("hud-ammo")?.setAttribute("hidden", "");
    document.getElementById("hud-recoil")?.setAttribute("hidden", "");
    document.getElementById("btn-fire")?.setAttribute("hidden", "");
    // Note: radarActive / espActive intentionally persist across missions
    // — once a player has earned the unlock, the HUD stays available.
    this.lastDamageAt = 0;
    this.damageEvents = 0;
    this.deaths = 0;
    this.lastBleedAt = 0;
    this.enemyManager.reset();
    this.enemiesCamouflaged = false;
    this.server.enabled = false;
    this.server.canonicalHp = 100;
    this.server.pendingDamage = 0;
    this.server.lastTickAt = 0;
    document.getElementById("hud-server")?.setAttribute("hidden", "");
    // Unfreeze any cells from a previous run.
    for (const a of [this.addrX, this.addrY, this.addrHP, this.addrAmmo,
                     this.addrMoveCooldown, this.addrWeaponDamage,
                     this.addrWeaponCooldown, this.addrWeaponRecoil,
                     this.addrEspVisible, this.addrServerHp]) {
      memory.setFrozen(a, false);
    }
    // Also clear freezes on the enemy struct array.
    for (let i = 0; i < this.enemyManager.enemies.length; i++) {
      memory.setFrozen(this.enemyManager.baseAddressOf(i, EnemyManager.F_X),  false);
      memory.setFrozen(this.enemyManager.baseAddressOf(i, EnemyManager.F_Y),  false);
      memory.setFrozen(this.enemyManager.baseAddressOf(i, EnemyManager.F_HP), false);
    }
  }

  enableHazards()  { this.hazardsActive = true; }
  disableHazards() { this.hazardsActive = false; }
  enableBleed(rate = 1, intervalMs = 1500) {
    this.bleedActive = true;
    this.bleedRate = rate;
    this.bleedIntervalMs = intervalMs;
    this.lastBleedAt = performance.now();
  }
  disableBleed() { this.bleedActive = false; }
  enableEnemies() { this.enemiesActive = true; }
  disableEnemies() { this.enemiesActive = false; }

  /** Simulate a session restart: relocate the entity-array in memory,
   *  leaving the old cells as raw noise. Direct watchlist entries
   *  pointing at the old addresses keep "working" but now show
   *  garbage; pointer-chain entries (M8) re-resolve correctly. */
  triggerRebase() {
    this.enemyManager.rebase();
    this.rebaseCount++;
    if (this.audio) this.audio.fail && this.audio.fail();
  }
  enableRadar()   { this.radarActive = true; }
  disableRadar()  { this.radarActive = false; }
  enableESP()     { this.espActive = true; }
  disableESP()    { this.espActive = false; }

  // M13 WALLHACK — turns enemies near-invisible while espActive is off.
  enableCamouflage()  { this.enemiesCamouflaged = true; this.espActive = false; }
  disableCamouflage() { this.enemiesCamouflaged = false; }

  // M17 RECOIL — when enabled with a non-zero perShot value, every
  // fire() bumps recoilCurrent. While recoilCurrent is past the miss
  // threshold, fire() registers the shot and consumes ammo but
  // applies zero damage (the shot 'goes wide'). Recoil decays each
  // frame in update(). Win condition: freeze recoilPerShot at 0 so
  // sustained fire never builds.
  enableRecoil(perShot = 6) {
    this.weapon.recoilPerShot = perShot;
    this.weapon.recoilCurrent = 0;
    document.getElementById("hud-recoil")?.removeAttribute("hidden");
  }
  disableRecoil() {
    this.weapon.recoilPerShot = 0;
    this.weapon.recoilCurrent = 0;
    document.getElementById("hud-recoil")?.setAttribute("hidden", "");
  }

  // M18 — turn on server-authoritative HP.
  enableServerAuthority(initialHp = 100) {
    this.server.enabled = true;
    this.server.canonicalHp = initialHp;
    this.server.pendingDamage = 0;
    this.server.lastTickAt = performance.now();
    document.getElementById("hud-server")?.removeAttribute("hidden");
  }
  disableServerAuthority() {
    this.server.enabled = false;
    this.server.pendingDamage = 0;
    document.getElementById("hud-server")?.setAttribute("hidden", "");
  }

  enableWatchdog() {
    this.watchdog.enabled = true;
    this.watchdog.tickValue = 0;
    this.watchdog.lastTickAt = performance.now();
    this.watchdog.lastSeenTick = 0;
    this.watchdog.violations = 0;
  }
  disableWatchdog() { this.watchdog.enabled = false; }

  enableWeapon()  {
    this.weapon.enabled = true;
    this.aimbotKills = 0;
    document.getElementById("hud-weapon")?.removeAttribute("hidden");
    document.getElementById("hud-ammo")?.removeAttribute("hidden");
    document.getElementById("btn-fire")?.removeAttribute("hidden");
  }
  disableWeapon() {
    this.weapon.enabled = false;
    document.getElementById("hud-weapon")?.setAttribute("hidden", "");
    document.getElementById("hud-ammo")?.setAttribute("hidden", "");
    document.getElementById("hud-recoil")?.setAttribute("hidden", "");
    document.getElementById("btn-fire")?.setAttribute("hidden", "");
  }

  fire(now = performance.now()) {
    if (!this.weapon.enabled) return false;
    if (now - this.weapon.lastFireAt < this.weapon.cooldownMs) return false;
    // Out of ammo — silent click. The lesson of M10 INFINITE AMMO is
    // that freezing the ammo cell makes this branch unreachable.
    if (this.player.ammo <= 0) return false;
    this.weapon.lastFireAt = now;
    this.player.ammo -= 1;
    this.shotsFired++;
    // Apply recoil — sustained fire builds it up. perShot is 0 in
    // missions that don't enable recoil (M07-M15) so this is a no-op
    // for them. M17 sets perShot non-zero.
    this.weapon.recoilCurrent += this.weapon.recoilPerShot;
    const e = this.enemyManager.enemies.find(e => e.id === this.crosshairTargetId && e.alive);
    if (!e) return false;
    const aimbotting = memory.isFrozen(this.addrCrosshair);
    // Miss when recoil is past threshold. The shot still fires (ammo
    // gone, shotsFired counted) but no damage applied — the bullet
    // 'goes wide.' Threshold of 25 means roughly 4 unmitigated shots
    // at perShot=6 before you start missing.
    const RECOIL_MISS_THRESHOLD = 25;
    if (this.weapon.recoilCurrent > RECOIL_MISS_THRESHOLD) {
      this.weapon.missesFromRecoil = (this.weapon.missesFromRecoil | 0) + 1;
      if (this.audio) this.audio.scan();
      return true;
    }
    const dmg = Math.max(0, this.weapon.damage | 0);
    e.hp = Math.max(0, e.hp - dmg);
    if (this.audio) this.audio.scan();
    if (e.hp <= 0) {
      e.alive = 0;
      this.killCount++;
      if (aimbotting) this.aimbotKills++;
    }
    return true;
  }

  /** Auto-update crosshair target — closest alive enemy to the player. */
  _updateCrosshair() {
    let bestId = 0;
    let bestDist = Infinity;
    for (const e of this.enemyManager.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestId = e.id; }
    }
    // The setter writes through to crosshairTargetId; if frozen, the
    // freeze overrides on memory.tick() and the player keeps their
    // locked target.
    this.crosshairTargetId = bestId;
  }

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
    this.tilesMoved++;
  }

  _onHazardTile() {
    return this.hazards.some(h => h.x === this.player.x && h.y === this.player.y);
  }

  update(now) {
    if (this.paused) {
      // Still sync memory so frozen values stay frozen, and refresh
      // the HUD display, but skip all gameplay logic.
      memory.tick();
      this._renderHud();
      return;
    }
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

    // Bleed: a wound that ticks down HP regardless of position. Frozen HP
    // lets the player survive it indefinitely — exactly the lesson.
    if (this.bleedActive && now - this.lastBleedAt > this.bleedIntervalMs) {
      this.lastBleedAt = now;
      const hpFrozen = memory.isFrozen(this.addrHP);
      this.player.hp -= this.bleedRate;
      this.lastDamageAt = now;
      this.damageEvents++;
      // M18 — damage events also queue against the server's canonical
      // HP. A local HP freeze blocks the visible decrement but does
      // NOT block this push to pendingDamage; the server still gets
      // the damage event and ticks down server.canonicalHp.
      if (this.server.enabled) this.server.pendingDamage += this.bleedRate;
      if (hpFrozen) {
        this._flashBlock();
      } else {
        this._flashHit();
        if (this.audio) this.audio.damage();
        if (this.player.hp <= 0) {
          this.deaths++;
          this.player.hp = 100;
        }
      }
    }

    // Step enemies on their patrol routes.
    if (this.enemiesActive) {
      this.enemyManager.step(now);
      this._updateCrosshair();
    }

    // Recoil decay — drops by ~30 units per second back toward zero.
    // Just a passive decay; no interaction with freezes.
    {
      const lastT = this._lastRecoilDecayAt || now;
      const dt = Math.max(0, (now - lastT) / 1000);
      this._lastRecoilDecayAt = now;
      if (this.weapon.recoilCurrent > 0) {
        this.weapon.recoilCurrent = Math.max(0, this.weapon.recoilCurrent - dt * 30);
      }
    }

    // Watchdog: bumps its tick cell on a 1.5s clock unless that cell is
    // frozen. When the cell increments, run an integrity check on the
    // player's stat addresses; any frozen player cell counts as
    // tampering and adds violations. If violations hit 100 the mission
    // has been failed by the active failure handler in app.js.
    if (this.watchdog.enabled) {
      if (!memory.isFrozen(this.addrWatchdog) &&
          now - this.watchdog.lastTickAt > 1500) {
        this.watchdog.lastTickAt = now;
        this.watchdog.tickValue++;
      }
      const cur = this.watchdog.tickValue;
      if (cur > this.watchdog.lastSeenTick) {
        this.watchdog.lastSeenTick = cur;
        const tampered =
          memory.isFrozen(this.addrX) ||
          memory.isFrozen(this.addrY) ||
          memory.isFrozen(this.addrHP) ||
          memory.isFrozen(this.addrAmmo);
        if (tampered) {
          this.watchdog.violations = Math.min(100, this.watchdog.violations + 25);
          this._flashHit();
        } else {
          // Slow self-heal so a player who froze something briefly,
          // realised, and unfroze isn't permanently penalised.
          this.watchdog.violations = Math.max(0, this.watchdog.violations - 10);
        }
      }
    }

    // Hazards apply damage on a slow tick if the player is standing on one.
    if (this.hazardsActive && now - this.lastHazardTickAt > HAZARD_TICK_MS) {
      this.lastHazardTickAt = now;
      if (this._onHazardTile()) {
        const hpFrozen = memory.isFrozen(this.addrHP);
        const before = this.player.hp;
        this.player.hp -= HAZARD_DAMAGE;
        this.lastDamageAt = now;
        this.damageEvents++;
        // M18 — also push to server.pendingDamage so the canonical
        // server HP ticks down regardless of the local freeze.
        if (this.server.enabled) this.server.pendingDamage += HAZARD_DAMAGE;
        // Memory.tick() below will overwrite player.hp with the frozen value,
        // but we still count the event because the hazard fired.
        if (hpFrozen) {
          this._flashBlock();
          if (this.audio) this.audio.lock();
        } else {
          this._flashHit();
          if (this.audio) this.audio.damage();
        }
        if (!hpFrozen && this.player.hp <= 0) {
          this.deaths++;
          this.player.hp = 100;
          this.player.x = SPAWN.x;
          this.player.y = SPAWN.y;
        }
      }
    }

    // M18 SERVER TICK — periodically reconciles the server's HP with
    // accumulated damage. If server.canonicalHp hits 0 the server
    // 'kills' you (respawn + deaths++), regardless of how the local
    // player.hp is frozen. To survive, freeze server.canonicalHp.
    if (this.server.enabled && now - this.server.lastTickAt > this.server.tickIntervalMs) {
      this.server.lastTickAt = now;
      if (this.server.pendingDamage > 0) {
        const serverHpFrozen = memory.isFrozen(this.addrServerHp);
        if (!serverHpFrozen) {
          this.server.canonicalHp = Math.max(0, this.server.canonicalHp - this.server.pendingDamage);
        }
        // Always drain the queue — the damage event was 'sent.'
        this.server.pendingDamage = 0;
      }
      if (this.server.canonicalHp <= 0) {
        // Server says you're dead. Respawn happens client-side; you
        // can't refuse the order even with player.hp frozen at 100.
        this.deaths++;
        this.player.hp = 100;
        this.player.x = SPAWN.x;
        this.player.y = SPAWN.y;
        this.server.canonicalHp = 100;
        this._flashHit();
        if (this.audio) this.audio.fail && this.audio.fail();
      }
    }

    // Sync game <-> memory (also applies any frozen writes).
    memory.tick();

    this._renderHud();
  }

  _renderHud() {
    document.getElementById("hud-x").textContent  = this.player.x;
    document.getElementById("hud-y").textContent  = this.player.y;
    const $hp = document.getElementById("hud-hp");
    $hp.textContent = this.player.hp;
    const lockedNow = memory.isFrozen(this.addrHP);
    const $lock = document.getElementById("hud-lock");
    if ($lock) $lock.hidden = !lockedNow;
    if (this.server.enabled) {
      const $srv = document.getElementById("hud-server-val");
      if ($srv) {
        const srvLock = memory.isFrozen(this.addrServerHp) ? " ⛒" : "";
        $srv.textContent = `${this.server.canonicalHp}${srvLock}`;
      }
    }
    if (this.weapon.enabled) {
      const $tgt = document.getElementById("hud-target");
      if ($tgt) {
        const e = this.enemyManager.enemies.find(e => e.id === this.crosshairTargetId);
        const lock = memory.isFrozen(this.addrCrosshair) ? " ⛒" : "";
        $tgt.textContent = e ? `${e.name}#${e.id}${lock}` : `none${lock}`;
      }
      const $ammo = document.getElementById("hud-ammo-val");
      if ($ammo) {
        const ammoLock = memory.isFrozen(this.addrAmmo) ? " ⛒" : "";
        $ammo.textContent = `${this.player.ammo}${ammoLock}`;
      }
      const $dmg = document.getElementById("hud-dmg-val");
      if ($dmg) {
        const dmgLock = memory.isFrozen(this.addrWeaponDamage) ? " ⛒" : "";
        $dmg.textContent = `${this.weapon.damage}${dmgLock}`;
      }
      const $rcl = document.getElementById("hud-recoil-val");
      if ($rcl) {
        const rclLock = memory.isFrozen(this.addrWeaponRecoil) ? " ⛒" : "";
        const cur = Math.round(this.weapon.recoilCurrent * 10) / 10;
        const past = this.weapon.recoilCurrent > 25 ? " ✗MISS" : "";
        $rcl.textContent = `${cur}${past}${rclLock}`;
      }
    }
  }

  _flashHit() {
    const $flash = document.getElementById("damage-flash");
    const $shake = document.getElementById("canvas-shake");
    const $hp    = document.getElementById("hud-hp");
    if ($flash) {
      $flash.classList.remove("hit", "block");
      // force reflow to restart animation
      void $flash.offsetWidth;
      $flash.classList.add("hit");
      setTimeout(() => $flash.classList.remove("hit"), 140);
    }
    if ($shake) {
      $shake.classList.remove("shake");
      void $shake.offsetWidth;
      $shake.classList.add("shake");
      setTimeout(() => $shake.classList.remove("shake"), 300);
    }
    if ($hp) {
      $hp.classList.remove("flash-down");
      void $hp.offsetWidth;
      $hp.classList.add("flash-down");
      setTimeout(() => $hp.classList.remove("flash-down"), 420);
    }
  }

  _flashBlock() {
    const $flash = document.getElementById("damage-flash");
    const $hp    = document.getElementById("hud-hp");
    if ($flash) {
      $flash.classList.remove("hit", "block");
      void $flash.offsetWidth;
      $flash.classList.add("block");
      setTimeout(() => $flash.classList.remove("block"), 160);
    }
    if ($hp) {
      $hp.classList.remove("flash-lock");
      void $hp.offsetWidth;
      $hp.classList.add("flash-lock");
      setTimeout(() => $hp.classList.remove("flash-lock"), 300);
    }
  }

  _draw() {
    const ctx = this.ctx;
    const s = this.scale || 1;
    const T = TILE * s;

    // Palette: dim sandstone walls, dark sand floor — ac_desert by night.
    ctx.fillStyle = "#0a0805";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === 1) {
          ctx.fillStyle = "#3a2f1d";
          ctx.fillRect(x * T, y * T, T, T);
          ctx.strokeStyle = "#5a4a30";
          ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
          // brick lines
          ctx.fillStyle = "#1f1a10";
          ctx.fillRect(x * T, y * T + Math.floor(T / 2), T, 1);
        } else {
          // floor with subtle grid
          ctx.fillStyle = ((x + y) & 1) ? "#14110a" : "#181410";
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

    // Enemies — drawn under the player so the player sprite stays on top.
    if (this.enemiesActive) {
      // M13 WALLHACK — when enemies are camouflaged AND ESP is off,
      // they render almost invisible against the floor. Flipping the
      // render.espVisible cell turns ESP on, which both adds the label
      // overlay AND restores their full color.
      const camo = this.enemiesCamouflaged && !this.espActive;
      for (const e of this.enemyManager.enemies) {
        if (!e.alive) continue;
        const ex = e.x * T;
        const ey = e.y * T;
        ctx.fillStyle = camo ? "#1d1610" : "#7f1d1d";
        ctx.fillRect(ex + 2, ey + 2, T - 4, T - 4);
        ctx.strokeStyle = camo ? "#26201a" : "#f87171";
        ctx.strokeRect(ex + 2.5, ey + 2.5, T - 5, T - 5);

        // ESP overlay — name + HP label above each enemy.
        if (this.espActive) {
          const label = `${e.name}  ${e.hp}`;
          ctx.font = `${10 * s}px ui-monospace, Menlo, monospace`;
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          const w = ctx.measureText(label).width;
          ctx.fillRect(ex - 2, ey - 12 * s, w + 6, 12 * s);
          ctx.fillStyle = "#22d3ee";
          ctx.fillText(label, ex + 1, ey - 3 * s);

          // HP bar under the name.
          const hpFrac = Math.max(0, Math.min(1, e.hp / 100));
          ctx.fillStyle = "#1f2a33";
          ctx.fillRect(ex, ey + T, T, 2 * s);
          ctx.fillStyle = hpFrac > 0.5 ? "#4ade80" : hpFrac > 0.25 ? "#fbbf24" : "#f87171";
          ctx.fillRect(ex, ey + T, T * hpFrac, 2 * s);
        }
      }
    }

    const px = this.player.x * T;
    const py = this.player.y * T;
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
    ctx.fillStyle = "#022c12";
    ctx.fillRect(px + T / 2 - s, py + 2, 2 * s, T / 2);

    // Radar minimap — drawn in the bottom-right of the canvas as a small
    // overlay. Shows player + every alive enemy as a single-pixel dot.
    if (this.radarActive) {
      this._drawRadar(ctx, s);
    }
  }

  _drawRadar(ctx, s) {
    const padding = 6 * s;
    const size = Math.min(MAP_W, MAP_H) * 3 * s;
    const x0 = this.canvas.width - size - padding;
    const y0 = this.canvas.height - size - padding;
    ctx.fillStyle = "rgba(2, 6, 12, 0.85)";
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = "#22d3ee";
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);

    const sx = size / MAP_W;
    const sy = size / MAP_H;
    // Walls (faint).
    ctx.fillStyle = "rgba(58, 47, 29, 0.5)";
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === 1) ctx.fillRect(x0 + x * sx, y0 + y * sy, sx, sy);
      }
    }
    // Enemies (red).
    if (this.enemiesActive) {
      ctx.fillStyle = "#f87171";
      for (const e of this.enemyManager.enemies) {
        if (!e.alive) continue;
        ctx.fillRect(x0 + e.x * sx - 1, y0 + e.y * sy - 1, Math.max(2, sx + 1), Math.max(2, sy + 1));
      }
    }
    // Player (green).
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(x0 + this.player.x * sx - 1, y0 + this.player.y * sy - 1, Math.max(2, sx + 1), Math.max(2, sy + 1));

    // Label
    ctx.font = `${9 * s}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = "#22d3ee";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("RADAR", x0 + 3, y0 - 2);
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
