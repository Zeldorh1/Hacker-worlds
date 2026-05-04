// AssaultZone — minimal top-down target sim. The player has X / Y / HP / Ammo
// stats that get bound to SimMemory addresses so the Scanner can find them.

import { memory, SimMemory } from "./sim-memory.js";
import { EnemyManager } from "./enemies.js";
import { codeSegment } from "./code-segment.js";

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
    this.alive = 1;             // M19 — gates death state; freeze=1 to skip dying
    this.respawnTimerMs = 0;    // counts down from RESPAWN_DELAY when dead
    this.noClip = 0;            // M43 — when 1, _tryMove skips wall-collision check
  }
}

const RESPAWN_DELAY_MS = 3000;

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
      // M34: when true, server-side validates incoming damage
      // packets against current weapon stats. Crafted packets
      // claiming damage > weapon.damage * 2 get clamped down.
      validateDamage: false,
      // M58/M67: when true, damage events must be paired with a
      // recent fire packet from the same client. OPK injection of
      // damage packets without a preceding fire is rejected.
      requireFirePairing: false,
      // M59 lag-walk + M75 anti-aim: server's last-known position
      // for this client. Updated whenever a position packet survives
      // the DLL send-hooks. M59 drops position packets so canonicalPos
      // stays stale; M75 rewrites position packets so canonicalPos
      // moves to fake values.
      canonicalPos: { x: 0, y: 0 },
    };

    // M30+ NETWORK — packet emission for missions that opt in via
    // `network: true`. When enabled, fire() and similar paths route
    // damage application through _sendPacket so DLL packet hooks
    // can inspect / modify / drop them.
    this.network = {
      enabled: false,
      log: [],
      // M37 — server checks position-update packets against a max
      // velocity. Speed hacks above the threshold get snap-backed.
      movementValidation: {
        enabled: false,
        maxDeltaPerMs: 0.012,    // ~1 tile per 80ms; speed-cooldown
                                  // < ~83ms is too fast and trips it.
        lastSampleAt: 0,
        lastValidX: 0,
        lastValidY: 0,
        snapbacks: 0,
      },
      // M38 — every outgoing packet auto-tagged with HMAC computed
      // from a session key. Modified packets fail validation. Bypass:
      // find session key in memory, re-compute HMAC after mutation.
      hmac: {
        enabled: false,
        sessionKey: 0,
        rejected: 0,
      },
      // M39 — every outgoing packet auto-tagged with a sequence
      // number. Server rejects duplicates. M35's replay attack fails
      // unless you also forge new seq numbers.
      sequence: {
        enabled: false,
        nextOutSeq: 1,
        seenInRecv: new Set(),
        rejected: 0,
      },
      // M40 — server periodically broadcasts spectator events.
      // DLL OPSEC: detect them and auto-disable visual cheats so
      // admins watching don't see anything weird.
      spectator: {
        enabled: false,
        watching: false,
        nextToggleAt: 0,
      },
    };

    // M32 — simulated 'kernel' anti-cheat scanner. When enabled, it
    // periodically inspects the loaded DLL's source for known feature
    // strings (Aimbot / ESP / wallhack / etc) and tracks violations.
    // This is purely conceptual — the strings here are made-up
    // placeholders, not signatures from any real anti-cheat product.
    this.acScanner = {
      enabled: false,
      lastScanAt: 0,
      scanIntervalMs: 2000,
      violations: 0,
      lastHits: [],
    };

    // M41 — fake 'OS-level process list' the simulator pretends the
    // game can see. The scanner tool registers itself as a process
    // here; a HackShield-class detector walks this list looking for
    // suspicious entries. Bypass: DLL registers a proc-enum hook
    // that filters this list before the shield reads it.
    this.processes = [
      { name: "ac_anomaly.exe",       suspicious: false },
      { name: "explorer.exe",         suspicious: false },
      { name: "chrome.exe",           suspicious: false },
      { name: "Hacker Worlds Scanner", suspicious: true,  fingerprint: "scanner" },
    ];

    // M41 — HackShield-style anti-cheat. Periodically walks the
    // process list, matches against known suspicious fingerprints.
    // Detection accumulates; threshold trips a mission-fail
    // ("game closed by anti-cheat").
    this.cheatShield = {
      enabled: false,
      scanIntervalMs: 1500,
      lastScanAt: 0,
      detections: 0,
      threshold: 3,
      lastDetectedFingerprints: [],
    };

    // M45 — fake 'loaded modules in this process' list. Different
    // from M41's OS-level process list — this is what
    // EnumProcessModules sees inside the game's own process.
    // The cheat DLL is in here; bypass is hooking the enum and
    // filtering it out.
    this.modules = [
      { name: "ac_client.exe",  suspicious: false },
      { name: "kernel32.dll",   suspicious: false },
      { name: "user32.dll",     suspicious: false },
      { name: "d3d9.dll",       suspicious: false },
      { name: "Hacker Worlds Cheat.dll", suspicious: true, fingerprint: "cheat-dll" },
    ];
    this.moduleShield = {
      enabled: false,
      scanIntervalMs: 1500,
      lastScanAt: 0,
      detections: 0,
      threshold: 3,
    };

    // M46 — fake IsDebuggerPresent state. Sim toggles this on
    // periodically; if a registered isdebugger-hook returns false,
    // the AC's debug check is fooled. Otherwise mission fails.
    this.debugger = {
      enabled: false,
      detected: false,
      scanIntervalMs: 1200,
      lastScanAt: 0,
      detections: 0,
      threshold: 3,
    };

    // M49 — out-of-pipeline frame-audit. The AC periodically "captures"
    // the rendered frame from outside the game's render pipeline (DXGI
    // DesktopDuplication / kernel GPU sampler equivalent). It checks for
    // render hooks and esp activity. Any DLL-registered frame_audit_hook
    // can intercept the capture object and scrub it before the AC reads.
    // Bypass: register_frame_audit_hook(fn) where fn(frame) → frame.
    this.frameAudit = {
      enabled: false,
      // Interval has jitter to make timing-based bypass harder.
      baseIntervalMs: 4000,
      jitterMs: 2000,
      nextAuditAt: 0,
      detections: 0,
      threshold: 3,
      lastDetectedAt: 0,
      auditing: false,   // true during the brief capture window
    };

    // M75 — sniper system. Periodically fires at server.canonicalPos
    // (the SERVER's last-known position for the player). Hit detection
    // compares canonicalPos to the player's REAL position. Without
    // anti-aim, those are the same and shots hit. With anti-aim
    // installed (packet hook rewrites position to fake values),
    // canonicalPos diverges from real player.x/y and shots miss.
    this.snipers = {
      enabled: false,
      fireIntervalMs: 800,
      lastFireAt: 0,
      hitCount: 0,
      missCount: 0,
      hitRadius: 1.5,
      damagePerHit: 8,
    };

    // M60 — AC string scanner. Periodically searches the DLL's
    // compiled source for known cheat-keyword strings ("AIMBOT",
    // "ESP", "WALLHACK", etc.). Each hit is a violation. The cheat's
    // bypass: XOR-encrypt the strings at rest in source so the
    // scanner only finds garbage. Plaintext exists briefly at
    // runtime when decoded; not in the source memory image the
    // scanner reads.
    this.acStringScanner = {
      enabled: false,
      intervalMs: 1500,
      lastScanAt: 0,
      keywords: ["AIMBOT", "ESP", "WALLHACK", "CHAMS", "TRIGGERBOT", "NORECOIL"],
      hits: 0,
      cleanScans: 0,
      threshold: 4,
    };

    // M79 — anti-cheat reporter. Periodically the AC client sends a
    // status report to the AC server: "is the player running cheats?"
    // The server compares reports over time and trips violations when
    // the report shows tampering. The cheat's bypass: hook the
    // outgoing report packet, overwrite all flags with 'clean'. The
    // AC server keeps trusting the report; violation count never moves.
    // This is an anti-cheat-spoofing technique class (not detection
    // evasion — outright lying to the AC's monitoring layer).
    this.acReporter = {
      enabled: false,
      intervalMs: 700,
      lastReportAt: 0,
      violations: 0,
      threshold: 5,
      // For mission scoring: counts how many spoofed reports vs honest
      acceptedClean: 0,    // report said clean, AC trusted it
      detectedDirty: 0,    // report said dirty, violation registered
    };

    // M33 — behavioral detector. Tracks recent crosshair-target
    // changes. Bots that snap to a new target every frame (zero
    // reaction delay) generate a stream of instant changes that
    // humans can't physically produce. Tracks a sliding window of
    // recent target switches; violations climb when the rate is
    // unrealistic.
    this.behavioral = {
      enabled: false,
      recentSwitches: [],     // timestamps of recent target changes
      lastTargetId: 0,
      violations: 0,
      lastSampleAt: 0,
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
    // M38 — session HMAC key bound as a cell so the player can scan
    // for it / read it via read_label.
    this.addrHmacKey = memory.bindGameValue("session.hmac_key",
      () => this.network.hmac.sessionKey,
      v => { this.network.hmac.sessionKey = v | 0; });

    // Static pointer cell whose VALUE is always the current entity-array
    // base address. Survives rebases — the address itself never moves,
    // even though the value updates each tick. M8 POINTER SCAN teaches
    // you to find this cell so you can build a chain that resolves to
    // the current enemy[i].* across simulated game restarts.
    this.addrEntityArrPtr = memory.bindGameValue("entity_arr_ptr",
      () => this.enemyManager.baseAddr,
      () => {},   // read-only from gameplay's perspective
      "ptr");

    // Static pointer cell whose VALUE is the local player struct base.
    // This is the simulator's analogue of 'ac_client.exe + 0x10F4F4' in
    // real AssaultCube — the cell C++ trainers dereference to reach
    // the player struct. M48 STATIC BASE DISCOVERY teaches you to find
    // it by pointer-scanning a known player address (player.hp / .x).
    this.addrLocalPlayerPtr = memory.bindGameValue("local_player_ptr",
      () => this.playerStructBase,
      () => {},
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

    // M19 RESPAWN LOOP — alive flag and respawn timer at next offsets.
    // The 'alive' cell is what the death-state check reads each frame.
    // Freezing it at 1 means even when server.canonicalHp hits 0 and
    // the kill code sets alive=0, memory.tick re-applies 1 the next
    // frame — death state never lasts long enough to matter.
    this.addrPlayerAlive = memory.bindGameValueAt(
      SimMemory.formatAddr(this.playerStructBase + 0x18),
      "player.alive",
      () => this.player.alive,
      v => { this.player.alive = (v | 0) ? 1 : 0; });
    this.addrPlayerRespawnTimer = memory.bindGameValueAt(
      SimMemory.formatAddr(this.playerStructBase + 0x1C),
      "player.respawnTimerMs",
      () => this.player.respawnTimerMs,
      v => { this.player.respawnTimerMs = v | 0; });

    // M20 NO-TELEPORT — respawn point. When you die, the engine reads
    // these cells to decide where to teleport you. Default = SPAWN.
    // The exploit: after you've moved deep into the map, edit these
    // to your CURRENT position. Now respawn 'teleports' you to where
    // you already are — i.e., nowhere. You stay in place, keep
    // playing, kill feed shows the death but you didn't lose ground.
    this.respawnPoint = { x: SPAWN.x, y: SPAWN.y };
    this.addrRespawnX = memory.bindGameValueAt(
      SimMemory.formatAddr(this.playerStructBase + 0x20),
      "respawn.x",
      () => this.respawnPoint.x,
      v => { this.respawnPoint.x = v | 0; });
    this.addrRespawnY = memory.bindGameValueAt(
      SimMemory.formatAddr(this.playerStructBase + 0x24),
      "respawn.y",
      () => this.respawnPoint.y,
      v => { this.respawnPoint.y = v | 0; });
    // M43 NOCLIP — wall-collision flag. When 1, _tryMove skips the
    // wall check so the player can walk through walls.
    this.addrPlayerNoClip = memory.bindGameValueAt(
      SimMemory.formatAddr(this.playerStructBase + 0x28),
      "player.noClip",
      () => this.player.noClip,
      v => { this.player.noClip = (v | 0) ? 1 : 0; });

    // Code instructions — registered with the CodeSegment so the
    // player can use Find What Writes to discover and NOP them out.
    // Each instruction's exec body matches what used to be inline
    // in update(); the inline code now calls codeSegment.run(id).
    codeSegment.define("bleed_tick", {
      name: "BLEED_TICK_HANDLER",
      writesTo: [this.addrHP, this.addrServerHp],
      exec: () => {
        this.player.hp -= this.bleedRate;
        if (this.server.enabled) this.server.pendingDamage += this.bleedRate;
      },
    });
    codeSegment.define("hazard_apply", {
      name: "HAZARD_DAMAGE_APPLY",
      writesTo: [this.addrHP, this.addrServerHp],
      exec: () => {
        // M51 — server-trusted godMode flag. When the magic packet
        // ID has flipped session.godMode, the server tells the client
        // hazard ticks deal zero damage.
        if (this.session && this.session.godMode) return;
        this.player.hp -= HAZARD_DAMAGE;
        if (this.server.enabled) this.server.pendingDamage += HAZARD_DAMAGE;
      },
    });
    codeSegment.define("server_drain", {
      name: "SERVER_HP_RECONCILE",
      writesTo: [this.addrServerHp],
      exec: () => {
        if (!memory.isFrozen(this.addrServerHp)) {
          this.server.canonicalHp = Math.max(0, this.server.canonicalHp - this.server.pendingDamage);
        }
        this.server.pendingDamage = 0;
      },
    });

    // M64 — weapon range check. When enabled (this.weapon.rangeLimit
    // > 0), this instruction zeros damage if the target is farther
    // than the limit. The data cells (weapon.damage etc.) all read
    // correct; the limit is enforced by the INSTRUCTION, not a flag.
    // Cheat fix: NOP the instruction (the M64 byte-patch lesson).
    codeSegment.define("weapon_range_check", {
      name: "WEAPON_RANGE_CHECK",
      writesTo: [this.addrWeaponDamage],
      exec: () => {
        if (this.weapon.rangeLimit > 0 && this._lastFireDistance > this.weapon.rangeLimit) {
          this._rangeCheckBlocked = true;
        } else {
          this._rangeCheckBlocked = false;
        }
      },
    });
    this._lastFireDistance = 0;
    this._rangeCheckBlocked = false;
    this.weapon.rangeLimit = 0;

    // M56 — render-state flag. When false, walls draw outlines only
    // (D3DRS_FILLMODE wireframe equivalent).
    this.wallFillEnabled = true;

    this.paused = false;
    this._pausedAt = 0;

    this._initEngineFunctions();

    this._wireInput();
    this._wireCanvasClicks();
    this._fitCanvas();
    window.addEventListener("resize", () => this._fitCanvas());
  }

  /** Route canvas taps to DLL input hooks (M36). Coordinates are
   *  converted to canvas pixel-space so they line up with what the
   *  render hook drew. If any hook returns true, the event is
   *  considered handled and not forwarded to default game logic. */
  _wireCanvasClicks() {
    const dispatch = (e, x, y) => {
      const dll = (typeof window !== "undefined" && window.__hw)
        ? window.__hw.dll : null;
      if (!dll || !dll.inputHooks || dll.inputHooks.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = (x - rect.left) * (this.canvas.width / rect.width);
      const py = (y - rect.top) * (this.canvas.height / rect.height);
      for (const hook of dll.inputHooks) {
        try {
          const handled = hook({ type: "click", x: px, y: py });
          if (handled) { e.preventDefault(); return; }
        } catch (err) {
          if (dll.log) dll.log("[input_hook error] " + err.message);
        }
      }
    };
    this.canvas.addEventListener("click", (e) => dispatch(e, e.clientX, e.clientY));
    this.canvas.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (t) dispatch(e, t.clientX, t.clientY);
    }, { passive: false });
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

  // ---- LithTech-style engine functions ----
  //
  // M50 teaches calling the game's own functions directly. In real
  // C++ each is reached via:
  //   typedef return_t(*fn_t)(args...);
  //   fn_t pFn = (fn_t)ADDR_OF_FUNCTION;
  //   pFn(args);
  // Here we expose them as a namespace; the DLL API call_engine_function
  // forwards to these.
  _initEngineFunctions() {
    // Server message handler table — populated by missions that need
    // server-side packet IDs (M51 magic packets, M53 defensive auth).
    // Each entry: { auth: bool, handler: (session, opts) => void }.
    // M51 fills it with the leftover-debug-handler set; M53 enforces auth.
    this.serverHandlers = new Map();
    // M48a — synthetic 'module base' for the simulated ac_client.exe.
    // ASLR-style: pick a high address per session so it looks plausible.
    this._simModuleBase = 0x60000000 + ((Math.random() * 0x10000000) | 0);
    this.serverRequireAuth = false;   // M53 flips this on
    this.session = { id: 1, privileged: false, godMode: false, unkickable: false,
                     speedMult: 1, infiniteAmmo: false,
                     // M76 — when true, server stops broadcasting position
                     // to other clients; snipers/aimbots can't see you
                     broadcastDisabled: false,
                     // M77 — when true, server-side damage events targeting
                     // this session are dropped on receipt
                     damageImmune: false };
    this.engine = {
      // ID_God_Mode-style packet send — routes through the simulator's
      // server handler table. Two argument shapes:
      //   send_to_server(id, opts)  — simple single-byte ID + opts
      //   send_to_server(msg)       — CAutoMessage from new_message();
      //                               first field's value is the ID,
      //                               rest are passed to the handler
      // M51 lesson: send a magic byte, server honors it. M66 lesson:
      // multi-field packets carry richer payload (target_id, etc).
      send_to_server: (idOrMsg, opts) => {
        let id, payload;
        if (idOrMsg && idOrMsg._msg) {
          // CAutoMessage form — extract id from first field, rest = payload.
          if (!idOrMsg.fields || idOrMsg.fields.length === 0) {
            return { ok: false, reason: "empty_message" };
          }
          id = idOrMsg.fields[0].v | 0;
          payload = { fields: idOrMsg.fields.slice(1) };
        } else {
          id = idOrMsg | 0;
          payload = opts || {};
        }
        const entry = this.serverHandlers.get(id);
        if (!entry) return { ok: false, reason: "unknown_id" };
        if (this.serverRequireAuth && entry.auth && !this.session.privileged) {
          this.serverDeniedCount = (this.serverDeniedCount | 0) + 1;
          return { ok: false, reason: "auth_required" };
        }
        try {
          const result = entry.handler(this.session, payload);
          return { ok: true, result };
        }
        catch (e) { return { ok: false, reason: e.message }; }
      },
      // ValidPointer mirror — checks if an address has a binding in
      // simulator memory. Real engines do the equivalent: verify the
      // pointer references valid mapped memory before deref.
      valid_pointer: (addr) => memory.cells.has(addr),
      // M48a — GetModuleHandleA mirror. Returns the synthetic
      // 'module base' for the named module (only "ac_client.exe"
      // and the alias "game" recognized in our sim). Real Windows
      // returns the actual loaded address of the DLL/EXE in the
      // current process.
      get_module_base: (name) => {
        if (!name) return 0;
        const lower = String(name).toLowerCase();
        if (lower.includes("ac_client") || lower === "game" || lower === "game.exe") {
          return this._simModuleBase || 0x60000000;
        }
        return 0;
      },
      // M58 — OPK / damage-packet injection. Real C++ equivalent:
      // construct a 'damage' packet matching the server's wire format
      // and SendToServer it directly, bypassing the game's fire path.
      // Server sees a valid-looking damage event for an enemy, applies
      // it. Doesn't matter that the player never fired or aimed.
      // Only defense is server-side: validate that the damage event
      // pairs with a recent fire packet from this client (M58/M67).
      inject_damage: (targetId, amount) => {
        const e = this.enemyManager.enemies.find(x => x.id === (targetId | 0));
        if (!e) return { ok: false, reason: "unknown_target" };
        if (!e.alive) return { ok: false, reason: "already_dead" };
        let dmg = Math.max(0, amount | 0);
        if (this.server.validateDamage) {
          const cap = Math.max(1, (this.weapon.damage * 2) | 0);
          if (dmg > cap) dmg = cap;
        }
        // M67 (defensive) — if server requires fire-evidence, reject
        // damage events without a recent matching fire packet from us.
        if (this.server.requireFirePairing) {
          const window = 1500;
          const now = performance.now();
          const recentFire = (this.network.log || [])
            .some(l => l.dir === "send" && l.packet && l.packet.type === "fire" &&
                       (now - l.t) < window);
          if (!recentFire) {
            this.injectedDamageRejected = (this.injectedDamageRejected | 0) + 1;
            return { ok: false, reason: "no_fire_pairing" };
          }
        }
        e.hp = Math.max(0, e.hp - dmg);
        if (e.hp <= 0) {
          e.alive = 0;
          this.killCount = (this.killCount | 0) + 1;
          this.injectedDamageKills = (this.injectedDamageKills | 0) + 1;
        }
        this.injectedDamageApplied = (this.injectedDamageApplied | 0) + 1;
        return { ok: true, target: e.id, hp: e.hp, dead: !e.alive };
      },
      // M56 — D3D-style render-state setter. Real engine equivalent:
      // IDirect3DDevice9::SetRenderState(D3DRS_FILLMODE, ...). Cheats
      // hook this to force wireframe / disable depth-test / etc. The
      // simulator exposes a small whitelist of state flags missions
      // can flip — wall_fill maps directly to wallFillEnabled.
      set_render_state: (key, value) => {
        if (key === "wall_fill") {
          this.wallFillEnabled = !!value;
          return { ok: true, applied: { wall_fill: this.wallFillEnabled } };
        }
        return { ok: false, reason: "unknown_render_state" };
      },
      // M50 demo: instant respawn. In LithTech this would be a direct
      // call to the engine's PlayerRespawn function. Bypasses the
      // RESPAWN_DELAY_MS countdown the normal death-handler enforces.
      force_respawn: () => {
        if (this.player.alive) return { ok: false, reason: "already_alive" };
        this.player.alive = 1;
        this.player.hp = 100;
        this.player.respawnTimerMs = 0;
        this.player.x = this.respawnPoint.x;
        this.player.y = this.respawnPoint.y;
        this.server.canonicalHp = 100;
        this.engineCallCount = (this.engineCallCount | 0) + 1;
        return { ok: true };
      },
    };
    this.engineCallCount = 0;
    this.serverDeniedCount = 0;
    this.injectedDamageApplied = 0;
    this.injectedDamageKills = 0;
    this.injectedDamageRejected = 0;
  }

  // ---- Mission control surface ----

  reset() {
    this.player.x = SPAWN.x;
    this.player.y = SPAWN.y;
    this.player.hp = 100;
    this.player.ammo = 30;
    this.player.alive = 1;
    this.player.respawnTimerMs = 0;
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
    this.respawnPoint.x = SPAWN.x;
    this.respawnPoint.y = SPAWN.y;
    this.network.enabled = false;
    this.network.log = [];
    this.network.movementValidation.enabled = false;
    this.network.movementValidation.snapbacks = 0;
    this.network.hmac.enabled = false;
    this.network.hmac.rejected = 0;
    this.network.sequence.enabled = false;
    this.network.sequence.nextOutSeq = 1;
    this.network.sequence.seenInRecv = new Set();
    this.network.sequence.rejected = 0;
    this.network.spectator.enabled = false;
    this.network.spectator.watching = false;
    this.acScanner.enabled = false;
    this.acScanner.violations = 0;
    this.acScanner.lastHits = [];
    this.cheatShield.enabled = false;
    this.cheatShield.detections = 0;
    this.cheatShield.lastDetectedFingerprints = [];
    this.moduleShield.enabled = false;
    this.moduleShield.detections = 0;
    this.debugger.enabled = false;
    this.debugger.detections = 0;
    this.frameAudit.enabled = false;
    this.frameAudit.detections = 0;
    this.frameAudit.auditing = false;
    this.frameAudit.nextAuditAt = 0;
    // M64 — clear range limit (and the corresponding code-segment NOP).
    this.weapon.rangeLimit = 0;
    this._lastFireDistance = 0;
    this._rangeCheckBlocked = false;
    // M56 — restore wall fills.
    this.wallFillEnabled = true;
    this.player.noClip = 0;
    memory.setFrozen(this.addrPlayerNoClip, false);
    this.behavioral.enabled = false;
    this.behavioral.recentSwitches = [];
    this.behavioral.violations = 0;
    this.behavioral.lastTargetId = 0;
    this.server.validateDamage = false;
    this.server.requireFirePairing = false;
    // Engine / server state (M50-M53)
    this.engineCallCount = 0;
    this.serverDeniedCount = 0;
    this.injectedDamageApplied = 0;
    this.injectedDamageKills = 0;
    this.injectedDamageRejected = 0;
    this.serverHandlers.clear();
    this.serverRequireAuth = false;
    this.session.privileged = false;
    this.session.godMode = false;
    this.session.unkickable = false;
    this.session.speedMult = 1;
    this.session.infiniteAmmo = false;
    this.session.broadcastDisabled = false;
    this.session.damageImmune = false;
    this.snipers.enabled = false;
    this.snipers.hitCount = 0;
    this.snipers.missCount = 0;
    this.acReporter.enabled = false;
    this.acReporter.violations = 0;
    this.acReporter.acceptedClean = 0;
    this.acReporter.detectedDirty = 0;
    this.acStringScanner.enabled = false;
    this.acStringScanner.hits = 0;
    this.acStringScanner.cleanScans = 0;
    this.server.canonicalPos.x = this.player.x;
    this.server.canonicalPos.y = this.player.y;
    codeSegment.reset();
    document.getElementById("hud-server")?.setAttribute("hidden", "");
    // Unfreeze any cells from a previous run.
    for (const a of [this.addrX, this.addrY, this.addrHP, this.addrAmmo,
                     this.addrMoveCooldown, this.addrWeaponDamage,
                     this.addrWeaponCooldown, this.addrWeaponRecoil,
                     this.addrEspVisible, this.addrServerHp,
                     this.addrPlayerAlive, this.addrPlayerRespawnTimer,
                     this.addrRespawnX, this.addrRespawnY]) {
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
  // M64 — enable a weapon range cap. Distance > limit: damage is
  // zeroed by the weapon_range_check instruction. Cheat-side fix is
  // to NOP that instruction's bytes (the M64 lesson).
  enableRangeLimit(tiles = 4) {
    this.weapon.rangeLimit = tiles;
    this._lastFireDistance = 0;
    this._rangeCheckBlocked = false;
  }
  disableRangeLimit() { this.weapon.rangeLimit = 0; }
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

  // M30+ Networking. Once enabled, fire() routes damage application
  // through a packet pipeline that DLL hooks can intercept.
  enableNetwork() {
    this.network.enabled = true;
    this.network.log = [];
  }
  disableNetwork() {
    this.network.enabled = false;
  }

  // M37 — server-side position validation. Reject deltas above
  // maxDeltaPerMs and snap player back to the last valid position.
  enableMovementValidation() {
    this.network.movementValidation.enabled = true;
    this.network.movementValidation.lastSampleAt = performance.now();
    this.network.movementValidation.lastValidX = this.player.x;
    this.network.movementValidation.lastValidY = this.player.y;
    this.network.movementValidation.snapbacks = 0;
  }
  disableMovementValidation() {
    this.network.movementValidation.enabled = false;
  }

  // M38 — HMAC-sign every outgoing packet from a session key.
  // Modified packets that don't re-compute HMAC get rejected.
  enableHmac(sessionKey = 0xCAFE1234) {
    this.network.hmac.enabled = true;
    this.network.hmac.sessionKey = sessionKey | 0;
    this.network.hmac.rejected = 0;
  }
  disableHmac() {
    this.network.hmac.enabled = false;
  }

  // M39 — sequence-number every outgoing packet; server drops
  // duplicates. M35 replay fails unless seq is also forged.
  enableSequence() {
    this.network.sequence.enabled = true;
    this.network.sequence.nextOutSeq = 1;
    this.network.sequence.seenInRecv = new Set();
    this.network.sequence.rejected = 0;
  }
  disableSequence() {
    this.network.sequence.enabled = false;
  }

  // M41 — turn on the HackShield-style process scanner. It walks
  // target.processes through the DLL's proc-enum hooks, then
  // matches against suspicious fingerprints. detections climbs;
  // missions fail when it crosses threshold.
  enableCheatShield() {
    this.cheatShield.enabled = true;
    this.cheatShield.detections = 0;
    this.cheatShield.lastScanAt = performance.now();
    this.cheatShield.lastDetectedFingerprints = [];
  }
  disableCheatShield() {
    this.cheatShield.enabled = false;
  }

  // M45 — module-list scanner. Walks loaded modules, looks for the
  // cheat DLL. Bypass via register_module_enum_hook.
  enableModuleShield() {
    this.moduleShield.enabled = true;
    this.moduleShield.detections = 0;
    this.moduleShield.lastScanAt = performance.now();
  }
  disableModuleShield() { this.moduleShield.enabled = false; }

  // M46 — debugger-present scanner. If detected for >threshold
  // intervals in a row, mission fails. Bypass by registering an
  // isdebugger hook that returns false.
  enableDebuggerCheck() {
    this.debugger.enabled = true;
    this.debugger.detected = true;   // sim PRETENDS a debugger is attached
    this.debugger.detections = 0;
    this.debugger.lastScanAt = performance.now();
  }
  disableDebuggerCheck() { this.debugger.enabled = false; }

  // M49 — out-of-pipeline frame audit. Fires on a jittered timer so
  // a simple Sleep-based bypass isn't reliable.
  enableFrameAudit() {
    this.frameAudit.enabled = true;
    this.frameAudit.detections = 0;
    this.frameAudit.auditing = false;
    const now = performance.now();
    const jitter = (Math.random() - 0.5) * this.frameAudit.jitterMs;
    this.frameAudit.nextAuditAt = now + this.frameAudit.baseIntervalMs + jitter;
  }
  disableFrameAudit() { this.frameAudit.enabled = false; }

  // M75 — enable sniper fire that targets server.canonicalPos.
  // Anti-aim defense: rewrite outgoing position packets so server's
  // last-known position diverges from your real pos.
  enableSnipers() {
    this.snipers.enabled = true;
    this.snipers.hitCount = 0;
    this.snipers.missCount = 0;
    this.snipers.lastFireAt = performance.now();
    // Sync canonicalPos to current player pos so the first shot's
    // baseline is real. If the cheat hooks position packets BEFORE
    // any movement, canonicalPos will start matching player.x/y and
    // then diverge as the player moves and packets get rewritten.
    this.server.canonicalPos.x = this.player.x;
    this.server.canonicalPos.y = this.player.y;
  }
  disableSnipers() { this.snipers.enabled = false; }

  // M79 — turn on the AC reporter. Honest report by default; cheat's
  // job is to install a packet hook that rewrites outgoing 'ac_report'
  // packets to all-clear before they reach the AC server.
  enableACReporter() {
    this.acReporter.enabled = true;
    this.acReporter.violations = 0;
    this.acReporter.acceptedClean = 0;
    this.acReporter.detectedDirty = 0;
    this.acReporter.lastReportAt = performance.now();
  }
  disableACReporter() { this.acReporter.enabled = false; }

  // M60 — turn on the keyword-string scanner. Cheats with plaintext
  // 'AIMBOT' / 'ESP' / etc. strings in their source register hits.
  enableACStringScanner() {
    this.acStringScanner.enabled = true;
    this.acStringScanner.hits = 0;
    this.acStringScanner.cleanScans = 0;
    this.acStringScanner.lastScanAt = performance.now() - this.acStringScanner.intervalMs + 500;
  }
  disableACStringScanner() { this.acStringScanner.enabled = false; }

  // M40 — periodically simulate a spectator joining/leaving.
  // Emits 'spectator_joined' / 'spectator_left' recv packets.
  enableSpectator() {
    this.network.spectator.enabled = true;
    this.network.spectator.watching = false;
    this.network.spectator.nextToggleAt = performance.now() + 4000;
  }
  disableSpectator() {
    this.network.spectator.enabled = false;
    this.network.spectator.watching = false;
  }

  /** Tiny HMAC-shape signing function. NOT real cryptography —
   *  just a deterministic hash over (canonicalised) packet fields
   *  + key, so modifying any field invalidates the signature.
   *  Exposed to DLLs via the compute_hmac() API so the player
   *  can re-sign after they craft. */
  static computeHmac(pkt, key) {
    // Strip hmac field, sort keys for stable hash, then djb2 over
    // (key XOR each char). Output as a 32-bit integer.
    const cleaned = {};
    for (const k of Object.keys(pkt).sort()) {
      if (k === "hmac" || k === "seq") continue;
      cleaned[k] = pkt[k];
    }
    const s = JSON.stringify(cleaned);
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + (s.charCodeAt(i) ^ (key & 0xff))) | 0;
    }
    return h | 0;
  }

  // M32 — kernel-AC scanner concept. Periodically scans the loaded
  // DLL for known cheat-feature strings; violations climb on hits.
  // Strings here are intentionally generic / made-up so this stays
  // conceptual — nothing maps to a real anti-cheat product.
  enableAcScanner(suspiciousStrings) {
    this.acScanner.enabled = true;
    this.acScanner.violations = 0;
    this.acScanner.lastScanAt = performance.now();
    this.acScanner.lastHits = [];
    this.acScanner.suspiciousStrings = suspiciousStrings;
  }
  disableAcScanner() {
    this.acScanner.enabled = false;
  }

  // M33 — behavioral detector. Watches crosshair target switches.
  // Bots snap to new targets every frame (no reaction delay).
  // Humans don't.
  enableBehavioralDetector() {
    this.behavioral.enabled = true;
    this.behavioral.recentSwitches = [];
    this.behavioral.lastTargetId = this.crosshairTargetId;
    this.behavioral.violations = 0;
    this.behavioral.lastSampleAt = performance.now();
  }
  disableBehavioralDetector() {
    this.behavioral.enabled = false;
  }

  // M34 — server-side damage validation. When enabled, damage
  // packets get clamped to weapon.damage * 2 max before being
  // applied. M31's craft-to-999 fails directly; player has to
  // also boost weapon.damage so the cap rises.
  enableServerValidation() {
    this.server.validateDamage = true;
  }
  disableServerValidation() {
    this.server.validateDamage = false;
  }

  /** Run an outgoing packet through DLL send-hooks. Returns the
   *  possibly-modified packet, or null if a hook dropped it.
   *
   *  Order of operations matters for M38/M39:
   *    1. If hmac/seq enabled, ATTACH them to the original packet first.
   *    2. Run send-hooks (which may modify pkt — invalidating hmac).
   *    3. Return the (now possibly-stale-signed) packet for downstream
   *       validation at the recv / damage-application step.
   *  Player has to re-sign after their hook mutation if they want the
   *  packet to validate. */
  _sendPacket(pkt) {
    if (!this.network.enabled) return pkt;
    let p = { ...pkt };
    // Attach signature + sequence BEFORE hooks so hooks need to
    // refresh them after mutating fields.
    if (this.network.sequence.enabled) {
      p.seq = this.network.sequence.nextOutSeq++;
    }
    if (this.network.hmac.enabled) {
      p.hmac = AssaultZone.computeHmac(p, this.network.hmac.sessionKey);
    }
    const dll = (typeof window !== "undefined" && window.__hw) ? window.__hw.dll : null;
    if (dll && dll.packetHooks) {
      for (const h of dll.packetHooks) {
        if (h.direction !== "send") continue;
        try {
          const r = h.fn(p);
          if (r === null) return null;
          if (r && typeof r === "object") p = r;
        } catch (e) {
          if (dll.log) dll.log("[packet send-hook error] " + e.message);
        }
      }
    }
    this.network.log.push({ dir: "send", packet: p, t: performance.now() });
    if (this.network.log.length > 50) this.network.log.shift();
    // M59 / M75 — server-side canonicalPos tracking. Whenever a position
    // packet survives the DLL send-hooks, the server updates its
    // last-known position for this client. M59 drops position packets
    // entirely (canonicalPos goes stale). M75 rewrites x/y to fake
    // values (canonicalPos moves to fake coordinates).
    if (p && p.type === "position" && typeof p.x === "number") {
      this.server.canonicalPos.x = p.x;
      this.server.canonicalPos.y = p.y;
    }
    return p;
  }

  /** Validate a packet's HMAC + sequence (server-side check).
   *  Returns true if valid; false if rejected (caller should drop). */
  _validatePacket(p) {
    if (this.network.hmac.enabled) {
      const expected = AssaultZone.computeHmac(p, this.network.hmac.sessionKey);
      if (p.hmac !== expected) {
        this.network.hmac.rejected++;
        return false;
      }
    }
    if (this.network.sequence.enabled) {
      if (typeof p.seq !== "number" || this.network.sequence.seenInRecv.has(p.seq)) {
        this.network.sequence.rejected++;
        return false;
      }
      this.network.sequence.seenInRecv.add(p.seq);
    }
    return true;
  }

  /** Run an incoming packet through DLL recv-hooks, then apply its
   *  effects. Drop-able by hooks (return null). */
  _recvPacket(pkt) {
    if (!this.network.enabled) return;
    const dll = (typeof window !== "undefined" && window.__hw) ? window.__hw.dll : null;
    let p = pkt;
    if (dll && dll.packetHooks) {
      for (const h of dll.packetHooks) {
        if (h.direction !== "recv") continue;
        try {
          const r = h.fn(p);
          if (r === null) return;            // dropped
          if (r && typeof r === "object") p = r;
        } catch (e) {
          if (dll.log) dll.log("[packet recv-hook error] " + e.message);
        }
      }
    }
    this.network.log.push({ dir: "recv", packet: p, t: performance.now() });
    if (this.network.log.length > 50) this.network.log.shift();
    // Apply packet effects.
    switch (p.type) {
      case "kill_credit":
        this.killCount++;
        break;
      case "you_died":
        if (this.player.alive === 1) {
          this.player.alive = 0;
          this.player.respawnTimerMs = RESPAWN_DELAY_MS;
        }
        break;
      // 'position', 'fire' etc are informational — server side state
      // change happens via separate paths (server tick from M18).
    }
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
    if (this.player.alive !== 1) return false;   // can't fire while dead
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
    // M64 — weapon range check (the patchable instruction).
    if (this.weapon.rangeLimit > 0) {
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      this._lastFireDistance = Math.sqrt(dx * dx + dy * dy);
      codeSegment.run("weapon_range_check");
      if (this._rangeCheckBlocked) return false;
    }
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
    if (this.audio) this.audio.scan();

    if (this.network.enabled) {
      // Route damage through packet pipeline. DLL hooks can modify
      // amount, change target, or drop the packet entirely.
      const pkt = this._sendPacket({
        type: "damage", target: e.id, amount: dmg, t: now,
      });
      // M38/M39 — HMAC + sequence validation. Modified packets
      // without re-signed HMAC fail and the damage is dropped.
      if (pkt && !this._validatePacket(pkt)) return false;
      if (pkt && typeof pkt.amount === "number") {
        // M34 — server-side validation. Clamp damage to
        // weapon.damage * 2 so crafted 'amount=999' packets get
        // shaved down. Player workaround: boost weapon.damage
        // BEFORE firing so the cap is higher.
        let amount = pkt.amount;
        if (this.server.validateDamage) {
          const maxAllowed = Math.max(1, (this.weapon.damage * 2) | 0);
          if (amount > maxAllowed) amount = maxAllowed;
        }
        const dmgApplied = Math.max(0, amount | 0);
        const targetEnemy = (pkt.target !== e.id)
          ? this.enemyManager.enemies.find(x => x.id === pkt.target && x.alive)
          : e;
        if (targetEnemy) {
          targetEnemy.hp = Math.max(0, targetEnemy.hp - dmgApplied);
          if (targetEnemy.hp <= 0) {
            targetEnemy.alive = 0;
            this._recvPacket({ type: "kill_credit", target: targetEnemy.id, t: now });
            if (aimbotting) this.aimbotKills++;
          }
        }
      }
    } else {
      e.hp = Math.max(0, e.hp - dmg);
      if (e.hp <= 0) {
        e.alive = 0;
        this.killCount++;
        if (aimbotting) this.aimbotKills++;
      }
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
    // M43 NOCLIP — skip the wall check when player.noClip is set.
    if (this.map[ny][nx] === 1 && !this.player.noClip) return;
    this.player.x = nx;
    this.player.y = ny;
    this.tilesMoved++;
    if (this.network.enabled) {
      const now = performance.now();
      this._sendPacket({ type: "position", x: nx, y: ny, t: now });
      // M37 — server-side movement validation. Check delta against
      // maxDeltaPerMs. Speed-hack moves above the threshold get
      // snapped back to the last valid position.
      const mv = this.network.movementValidation;
      if (mv.enabled) {
        const dt = Math.max(1, now - mv.lastSampleAt);
        const dist = Math.hypot(nx - mv.lastValidX, ny - mv.lastValidY);
        const speed = dist / dt;
        if (speed > mv.maxDeltaPerMs) {
          // Snap player back; record violation.
          this.player.x = mv.lastValidX;
          this.player.y = mv.lastValidY;
          mv.snapbacks++;
          this._flashHit();
        } else {
          mv.lastSampleAt = now;
          mv.lastValidX = this.player.x;
          mv.lastValidY = this.player.y;
        }
      }
    }
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
    // Movement only when alive. If alive=0 (death state) the player
    // is locked until respawn timer completes — unless they froze
    // alive=1, in which case they're never in this branch.
    if (this.player.alive === 1 && now - this.lastMoveAt > this.moveCooldownMs) {
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
    // Routed through codeSegment so the player can NOP it (M22).
    if (this.bleedActive && now - this.lastBleedAt > this.bleedIntervalMs) {
      this.lastBleedAt = now;
      const hpFrozen = memory.isFrozen(this.addrHP);
      const ran = codeSegment.run("bleed_tick");
      if (ran) {
        this.lastDamageAt = now;
        this.damageEvents++;
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
    }

    // Step enemies on their patrol routes.
    if (this.enemiesActive) {
      this.enemyManager.step(now);
      this._updateCrosshair();
    }

    // M45 — module-list scan inside the game process. Walks
    // this.modules through DLL module-enum hooks, looks for
    // suspicious entries.
    if (this.moduleShield.enabled &&
        now - this.moduleShield.lastScanAt > this.moduleShield.scanIntervalMs) {
      this.moduleShield.lastScanAt = now;
      const dll = (typeof window !== "undefined" && window.__hw)
        ? window.__hw.dll : null;
      let visible = this.modules.slice();
      if (dll && dll.moduleEnumHooks) {
        for (const hook of dll.moduleEnumHooks) {
          try {
            const filtered = hook(visible);
            if (Array.isArray(filtered)) visible = filtered;
          } catch (e) { if (dll.log) dll.log("[module hook error] " + e.message); }
        }
      }
      const hits = visible.filter(m => m && m.suspicious);
      if (hits.length > 0) this.moduleShield.detections++;
      else this.moduleShield.detections = Math.max(0, this.moduleShield.detections - 1);
    }

    // M46 — debugger-present check. Sim claims a debugger is on
    // (debugger.detected = true). DLL hook can override the answer
    // to false. If anything still says true after hooks, bump
    // detections.
    if (this.debugger.enabled &&
        now - this.debugger.lastScanAt > this.debugger.scanIntervalMs) {
      this.debugger.lastScanAt = now;
      const dll = (typeof window !== "undefined" && window.__hw)
        ? window.__hw.dll : null;
      let answer = this.debugger.detected;
      if (dll && dll.isDebuggerHooks) {
        for (const hook of dll.isDebuggerHooks) {
          try {
            const r = hook(answer);
            if (typeof r === "boolean") answer = r;
          } catch (e) { if (dll.log) dll.log("[isdebugger hook error] " + e.message); }
        }
      }
      if (answer) this.debugger.detections++;
      else this.debugger.detections = Math.max(0, this.debugger.detections - 1);
    }

    // M41 — HackShield process scan. Every scanIntervalMs, ask the
    // OS for the running-process list (this.processes), pass it
    // through any DLL proc-enum hooks (which can filter / hide
    // processes), then match against suspicious fingerprints.
    if (this.cheatShield.enabled &&
        now - this.cheatShield.lastScanAt > this.cheatShield.scanIntervalMs) {
      this.cheatShield.lastScanAt = now;
      const dll = (typeof window !== "undefined" && window.__hw)
        ? window.__hw.dll : null;
      let visibleProcesses = this.processes.slice();
      if (dll && dll.processEnumHooks) {
        for (const hook of dll.processEnumHooks) {
          try {
            const filtered = hook(visibleProcesses);
            if (Array.isArray(filtered)) visibleProcesses = filtered;
          } catch (e) {
            if (dll.log) dll.log("[proc_enum hook error] " + e.message);
          }
        }
      }
      const hits = visibleProcesses.filter(p => p && p.suspicious);
      this.cheatShield.lastDetectedFingerprints = hits.map(p => p.fingerprint || p.name);
      if (hits.length > 0) this.cheatShield.detections++;
      else this.cheatShield.detections = Math.max(0, this.cheatShield.detections - 1);
    }

    // M49 — out-of-pipeline frame audit. Fires on a jittered timer.
    // During the capture window: pass a frame descriptor through any
    // registered frame_audit_hooks (bypass point), then check if the
    // frame still looks suspicious.
    if (this.frameAudit.enabled && now >= this.frameAudit.nextAuditAt) {
      const dll2 = (typeof window !== "undefined" && window.__hw)
        ? window.__hw.dll : null;
      // Build the capture object — what the AC "sees" from outside.
      const captureFrame = {
        espActive: this.espActive ? 1 : 0,
        renderHookCount: (dll2 && dll2.renderHooks) ? dll2.renderHooks.length : 0,
      };
      // Give DLL audit hooks a chance to scrub the capture before the
      // AC reads it. Real equivalent: hooking DXGI DesktopDuplication
      // or the driver-level GPU sampler before the AC's screenshot arrives.
      this.frameAudit.auditing = true;
      if (dll2 && dll2.frameAuditHooks && dll2.frameAuditHooks.length > 0) {
        for (const hook of dll2.frameAuditHooks) {
          try {
            const result = hook(captureFrame);
            if (result && typeof result === "object") {
              if ("espActive" in result) captureFrame.espActive = result.espActive;
              if ("renderHookCount" in result) captureFrame.renderHookCount = result.renderHookCount;
            }
          } catch (e) {
            if (dll2 && dll2.log) dll2.log("[frame_audit_hook error] " + e.message);
          }
        }
      }
      this.frameAudit.auditing = false;
      // Detection: frame still shows an overlay after hook ran.
      const suspicious = captureFrame.espActive > 0 || captureFrame.renderHookCount > 0;
      if (suspicious) {
        this.frameAudit.detections++;
        this.frameAudit.lastDetectedAt = now;
      } else {
        this.frameAudit.detections = Math.max(0, this.frameAudit.detections - 1);
      }
      // Schedule next audit with fresh jitter.
      const jitter = (Math.random() - 0.5) * this.frameAudit.jitterMs;
      this.frameAudit.nextAuditAt = now + this.frameAudit.baseIntervalMs + jitter;
    }

    // M60 — AC string scanner. Reads dll.lastSource and counts how
    // many keyword hits appear as STANDALONE TOKENS (word-boundary
    // regex). This avoids false positives inside compound identifiers
    // like 'render.espVisible' (where 'esp' is part of a larger
    // identifier, not a literal cheat-string).
    if (this.acStringScanner.enabled &&
        now - this.acStringScanner.lastScanAt > this.acStringScanner.intervalMs) {
      this.acStringScanner.lastScanAt = now;
      const dll3 = (typeof window !== "undefined" && window.__hw)
        ? window.__hw.dll : null;
      const src = (dll3 && dll3.lastSource) ? dll3.lastSource : "";
      let hits = 0;
      for (const kw of this.acStringScanner.keywords) {
        // Word-boundary match, case-insensitive
        const re = new RegExp("\\b" + kw + "\\b", "i");
        if (re.test(src)) hits++;
      }
      this.acStringScanner.hits = hits;
      if (hits === 0) this.acStringScanner.cleanScans++;
    }

    // M79 — AC reporter. Every intervalMs the AC client emits a
    // status report (a packet) describing current cheat state. The
    // packet flows through DLL send-hooks (the player's bypass point)
    // before the AC server reads it. Cheat reports honestly = AC
    // logs violation. Cheat reports cleanly = AC trusts it.
    if (this.acReporter.enabled && now - this.acReporter.lastReportAt > this.acReporter.intervalMs) {
      this.acReporter.lastReportAt = now;
      const dll2 = (typeof window !== "undefined" && window.__hw)
        ? window.__hw.dll : null;
      // Build the honest report based on real cheat state.
      const realState = {
        type: "ac_report",
        espActive: !!this.espActive,
        hpFrozen: memory.isFrozen(this.addrHP),
        ammoFrozen: memory.isFrozen(this.addrAmmo),
        renderHookCount: (dll2 && dll2.renderHooks) ? dll2.renderHooks.length : 0,
        cheatCount: (dll2 && dll2.cheats) ? dll2.cheats.length : 0,
        t: now,
      };
      const isActuallyDirty = realState.espActive || realState.hpFrozen ||
        realState.ammoFrozen || realState.renderHookCount > 0;
      // Send through DLL send-hook pipeline — cheat can rewrite.
      const reported = this._sendPacket(realState);
      if (!reported) {
        // Hook dropped the packet entirely; AC server gets no report
        // (treat as a quiet violation since AC notices missing reports).
        this.acReporter.violations++;
        return;
      }
      const reportSaysDirty = !!(reported.espActive || reported.hpFrozen ||
        reported.ammoFrozen || (reported.renderHookCount | 0) > 0);
      if (isActuallyDirty && reportSaysDirty) {
        // Honest report of cheats — AC logs violation.
        this.acReporter.violations++;
        this.acReporter.detectedDirty++;
      } else if (isActuallyDirty && !reportSaysDirty) {
        // Cheats running but report claims clean — AC fooled, no violation.
        this.acReporter.acceptedClean++;
      }
      // (Clean+clean and clean+dirty cases are uninteresting.)
    }

    // M75/M76/M77 — sniper fire. Enemies "fire" at the server's
    // last-known position. Three layered effects:
    //   M75 anti-aim:    rewrite outgoing position packets so
    //                    canonicalPos diverges from real pos -> miss
    //   M76 stealth:     session.broadcastDisabled true means snipers
    //                    don't fire at all (server hasn't told them
    //                    where you are)
    //   M77 godmode:     session.damageImmune true means hits register
    //                    but server drops the damage on receipt
    if (this.snipers.enabled && !this.session.broadcastDisabled &&
        now - this.snipers.lastFireAt > this.snipers.fireIntervalMs) {
      this.snipers.lastFireAt = now;
      const sp = this.server.canonicalPos;
      const dx = this.player.x - sp.x;
      const dy = this.player.y - sp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.snipers.hitRadius) {
        if (!memory.isFrozen(this.addrHP) && !this.session.damageImmune) {
          this.player.hp = Math.max(0, this.player.hp - this.snipers.damagePerHit);
        }
        this.snipers.hitCount++;
        if (!this.session.damageImmune) this._flashHit();
      } else {
        this.snipers.missCount++;
      }
    }

    // M40 — spectator events. Toggle 'watching' state every ~8s so
    // the player has clear windows to test their auto-disable logic.
    if (this.network.spectator.enabled && now >= this.network.spectator.nextToggleAt) {
      this.network.spectator.watching = !this.network.spectator.watching;
      this.network.spectator.nextToggleAt = now + 8000;
      // Emit a recv packet so DLL recv-hooks can detect the event.
      this._recvPacket({
        type: this.network.spectator.watching ? "spectator_joined" : "spectator_left",
        t: now,
      });
    }

    // M33 — behavioral detector. Records target switches and
    // counts how many fired in the last 1.5s. >5 switches/1.5s
    // is bot-like (humans take ~200ms minimum to react and switch
    // targets); each excess switch adds a violation.
    if (this.behavioral.enabled && now - this.behavioral.lastSampleAt > 100) {
      this.behavioral.lastSampleAt = now;
      const cur = this.crosshairTargetId;
      if (cur !== this.behavioral.lastTargetId && cur !== 0) {
        this.behavioral.recentSwitches.push(now);
        this.behavioral.lastTargetId = cur;
      }
      // Drop entries older than 1.5s.
      const cutoff = now - 1500;
      this.behavioral.recentSwitches = this.behavioral.recentSwitches.filter(t => t >= cutoff);
      // 5+ switches in a 1.5s window = inhuman.
      if (this.behavioral.recentSwitches.length > 5) {
        this.behavioral.violations++;
      }
    }

    // M32 — kernel-AC scanner concept. Every scanIntervalMs, inspect
    // the loaded DLL source for known suspicious strings + the cheat
    // labels / packet-hook count. Each match adds a violation. The
    // mission fails if violations cross a threshold. Conceptual only:
    // the 'strings' are placeholders, not real anti-cheat signatures.
    if (this.acScanner.enabled &&
        now - this.acScanner.lastScanAt > this.acScanner.scanIntervalMs) {
      this.acScanner.lastScanAt = now;
      const dll = (typeof window !== "undefined" && window.__hw)
        ? window.__hw.dll : null;
      const hits = [];
      if (dll && dll.running) {
        // Scan the loaded DLL source.
        const source = (typeof document !== "undefined" &&
          document.getElementById("dll-code"))
          ? document.getElementById("dll-code").value : "";
        const text = source.toLowerCase();
        for (const sig of (this.acScanner.suspiciousStrings || [])) {
          if (text.includes(sig.toLowerCase())) hits.push("source:" + sig);
        }
        // Scan cheat labels.
        for (const c of dll.cheats) {
          for (const sig of (this.acScanner.suspiciousStrings || [])) {
            if (c.label.toLowerCase().includes(sig.toLowerCase())) {
              hits.push("cheat-label:" + sig);
            }
          }
        }
      }
      this.acScanner.lastHits = hits;
      if (hits.length > 0) this.acScanner.violations += hits.length;
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
    // Routed through codeSegment so the hazard apply instruction can be
    // NOPed via the M22 Find What Writes workflow.
    if (this.hazardsActive && now - this.lastHazardTickAt > HAZARD_TICK_MS) {
      this.lastHazardTickAt = now;
      if (this._onHazardTile()) {
        const hpFrozen = memory.isFrozen(this.addrHP);
        const ran = codeSegment.run("hazard_apply");
        if (ran) {
          this.lastDamageAt = now;
          this.damageEvents++;
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
    }

    // M18 SERVER TICK — periodically reconciles the server's HP with
    // accumulated damage. If server.canonicalHp hits 0 the server
    // tries to flip player.alive to 0 (the 'death state'). The
    // M19 trick: freeze player.alive at 1 so the death flag never
    // sticks long enough for the respawn timer to fire.
    if (this.server.enabled && now - this.server.lastTickAt > this.server.tickIntervalMs) {
      this.server.lastTickAt = now;
      if (this.server.pendingDamage > 0) {
        // Routed through codeSegment — NOPing this instruction stops
        // the server's reconciliation entirely, preserving canonicalHp
        // even with damage queued.
        codeSegment.run("server_drain");
      }
      if (this.server.canonicalHp <= 0 && this.player.alive === 1) {
        // Server says you're dead. Set alive=0 (frozen alive=1 will
        // re-flip it on next memory.tick — that's the M19 exploit).
        this.player.alive = 0;
        this.player.respawnTimerMs = RESPAWN_DELAY_MS;
        if (this.audio) this.audio.fail && this.audio.fail();
      }
    }

    // Respawn timer — counts down each frame while dead. Once it
    // hits 0, full respawn (deaths++, HP/server reset). If the
    // player has frozen alive=1, alive flips back from 0 to 1 on
    // the next memory.tick(), this branch never enters, the timer
    // never reaches 0, the death never lands.
    if (this.player.alive === 0) {
      const lastT = this._lastRespawnTickAt || now;
      const dt = Math.max(0, now - lastT);
      this._lastRespawnTickAt = now;
      this.player.respawnTimerMs = Math.max(0, this.player.respawnTimerMs - dt);
      if (this.player.respawnTimerMs <= 0) {
        this.deaths++;
        this.player.alive = 1;
        this.player.hp = 100;
        // M20 — the engine reads respawnPoint cells to decide teleport
        // destination. If the player edited those to their current
        // position, they 'teleport' nowhere.
        this.player.x = this.respawnPoint.x;
        this.player.y = this.respawnPoint.y;
        this.server.canonicalHp = 100;
        this._flashHit();
      }
    } else {
      this._lastRespawnTickAt = now;
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
    const $dead = document.getElementById("dead-overlay");
    if ($dead) $dead.hidden = (this.player.alive === 1);
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
          // M56 — wireframe wall mode. When wallFillEnabled is false,
          // walls render outlines only (no fill, no brick lines), the
          // 2D-sim equivalent of D3DRS_FILLMODE = D3DFILL_WIREFRAME.
          if (this.wallFillEnabled !== false) {
            ctx.fillStyle = "#3a2f1d";
            ctx.fillRect(x * T, y * T, T, T);
          }
          ctx.strokeStyle = "#5a4a30";
          ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
          if (this.wallFillEnabled !== false) {
            // brick lines
            ctx.fillStyle = "#1f1a10";
            ctx.fillRect(x * T, y * T + Math.floor(T / 2), T, 1);
          }
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

    // M26 RENDER HOOK — call any DLL-registered render hooks AFTER all
    // game-side drawing. They get the canvas ctx + a sim helper. This
    // is the simulator equivalent of an EndScene detour: your code
    // runs after the game's last draw call, before the frame presents.
    const dll = (typeof window !== "undefined" && window.__hw)
      ? window.__hw.dll : null;
    if (dll && dll.renderHooks && dll.renderHooks.length > 0) {
      const sim = this._makeSimHelpers();
      for (const hook of dll.renderHooks) {
        try { hook(ctx, sim); }
        catch (e) {
          if (dll.log) dll.log("[render_hook error] " + e.message);
        }
      }
    }
  }

  /** Helper object passed to render hooks. Abstracts the world-to-
   *  screen math and entity enumeration so the player's hook is
   *  short and clear. Real-world equivalent: D3DXVec3Project +
   *  iterating the entity-list pointer. */
  _makeSimHelpers() {
    const T = TILE * (this.scale || 1);
    return {
      enemies: () => this.enemyManager.enemies.map(e => ({
        id: e.id, name: e.name, x: e.x, y: e.y, hp: e.hp, alive: !!e.alive,
      })),
      player: () => ({
        x: this.player.x, y: this.player.y, hp: this.player.hp,
      }),
      tile_size: () => T,
      tile_to_screen: (x, y) => [x * T, y * T],
    };
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
