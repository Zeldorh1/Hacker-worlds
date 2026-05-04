// Mission 50 — LITHTECH ENGINE CALLS
//
// Foundational lesson the curriculum hand-waved: every prior DLL
// mission has been about reading or writing memory cells. But cheats
// don't only manipulate data — they call the game's own functions.
//
// Real Combat Arms cheat code looks like this:
//
//   typedef void (*tSendToServer)(ILTMessage_Read*, uint32_t flags);
//   tSendToServer pSendToServer = (tSendToServer)ADDR_SENDTOSERVER;
//   pSendToServer(msg, MESSAGE_GUARANTEED);
//
// Three steps:
//   1. typedef the function signature
//   2. cast the known address to that type
//   3. invoke
//
// The "known address" comes from M48-style base discovery: AOB scan
// the engine module for a unique byte pattern at the function's
// prologue, or use hardcoded offsets reverse-engineered by the
// community.
//
// In the simulator we expose engine functions on target.engine:
//   - force_respawn()       — instant respawn (LithTech PlayerRespawn)
//   - send_to_server(id,..) — magic packet send (M51 uses this)
//   - valid_pointer(addr)   — engine pointer check (LTClient->ValidPointer)
//
// The DLL API call_engine_function(name, ...args) forwards to these.
//
// Mission flow:
//   1. Player gets killed by hazards (HP drains in the kill zone).
//   2. Normally they wait 3s for the respawn timer to count down.
//   3. With the engine call template injected, they call
//      call_engine_function("force_respawn") and respawn instantly.
//   4. Win: 3 instant-respawns within the time limit.

const TEMPLATE = `// M50 — LITHTECH ENGINE CALLS
//
// Real C++ pattern:
//   typedef void(*tForceRespawn)();
//   tForceRespawn pRespawn = (tForceRespawn)ADDR_FORCE_RESPAWN;
//   pRespawn();
//
// Sim equivalent:
//   call_engine_function("force_respawn")
//
// register_cheat installs a hotkey ('Instant Respawn') that calls the
// engine function whenever you tick it. While dead, ticking the cheat
// skips the 3-second respawn timer entirely.

void onInject() {
  log("Engine function table available — try call_engine_function");

  register_cheat("Instant Respawn", function() {
    // Only useful when dead — engine returns {ok:false, reason:"already_alive"}
    // otherwise. Same as calling LTClient->Respawn while still alive.
    const result = call_engine_function("force_respawn");
    if (result && result.ok) log("Engine PlayerRespawn invoked — back in the fight");
  });
}

void onTick() { }
`;

export const mission50 = {
  id: "m50",
  title: "LITHTECH ENGINE CALLS",
  brief: "Stop just READING the game's memory. Start CALLING its own functions.",
  prerequisites: ["m48", "m24"],
  timeLimit: 240,
  dll: true,
  cheatMenu: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "⚙",
    title: "ENGINE FUNCTION ACCESS UNLOCKED",
    body: `Up to now, every cheat has been READING or WRITING
memory cells. But cheats don't just manipulate data —
they CALL the game's own functions.

Real C++ pattern:
  typedef void(*tFn)(args);
  tFn pFn = (tFn)ADDR_OF_FUNCTION;
  pFn(args);

Once you can call engine functions directly, you can:
  • Force respawn (skip the death timer)
  • Send arbitrary packets (next mission)
  • Validate pointers like the engine does

The DLL exposes call_engine_function(name, ...args).
This mission proves the foundation: die in the hazard
zone, then call force_respawn instead of waiting.

Real-world: the addresses come from M48-style base
discovery. Once you have ADDR_FORCE_RESPAWN you cast
and invoke. That's the entire pattern.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template registers a cheat 'Instant Respawn' that calls call_engine_function('force_respawn'). Compile + Inject.",
    },
    {
      id: "die-first",
      min: 5,
      when: ({ target, dllState }) => dllState.running && target.player.alive === 1,
      say: "You need to BE DEAD first to test instant-respawn. Walk into the hazard zone (red tiles) — HP will drain to 0.",
    },
    {
      id: "tick-cheat",
      min: 3,
      when: ({ target, dllState }) =>
        dllState.running && target.player.alive === 0 && target.engineCallCount === 0,
      say: "Dead now. Open the cheat menu (DELETE key or menu button) and tick 'Instant Respawn'. The engine call fires once, you're back instantly — no 3-second wait.",
    },
    {
      id: "repeat",
      when: ({ target }) => target.engineCallCount > 0 && target.engineCallCount < 3,
      say: "Engine call worked. Die two more times in the hazard zone, instant-respawn each one. 3 total to clear.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();
    target.enableWeapon();
    target.player.ammo = 200;

    dialog.script("VEX", [
      "M24 had you write to player.hp via memory.write. M16 had you freeze cooldowns. M26 had you draw boxes. All of it has been DATA manipulation.",
      "Real cheats also call the engine's own functions. force_respawn, send_to_server, ValidPointer — they all live in the engine module at known offsets.",
      "Pattern: typedef the signature, cast the address to that typedef, invoke. C++ trainers do this for every engine function they want to abuse.",
      "Template: register_cheat with a body that calls call_engine_function('force_respawn'). Walk into the hazard zone, die, tick the cheat. Instant respawn — you skipped the 3s timer.",
      "Do it 3 times to demonstrate the pattern. Next mission generalizes this to send_to_server and the famous LithTech magic-packet exploits.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.engineCallCount >= 3) {
        done = true;
        complete("3 engine calls invoked successfully. You now have the same primitive every commercial cheat uses — direct invocation of game functions. Next: send_to_server and the leftover-debug-handler exploits.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
