// Mission 79 — ANTI-CHEAT EMULATION (the "all clear" spoof)
//
// Per the historical brief: 'advanced developers created bypasses
// that effectively emulated the anti-cheat's responses. When the
// server asked, "Is everything okay?", the cheat would send back a
// faked "All Clear" signal, keeping the real hacks hidden.'
//
// Mechanism: anti-cheats don't run only on the local game process —
// they REPORT to a server. That server analyzes reports over time,
// looking for cheats. The local AC's job is to honestly describe
// what's happening on the client.
//
// The bypass: hook the AC's OUTGOING report packet on the way to
// its server. Rewrite every "cheat-state" field to false / zero.
// The AC server keeps receiving "all clear" forever. No matter how
// many cheats are actually running, the AC's monitoring layer
// reports nothing wrong. Violations stay at zero.
//
// Why this is its own technique class (separate from M76 stealth):
// M76 hides you from OTHER PLAYERS' clients. M79 hides you from
// the ANTI-CHEAT's own monitoring. They target different layers:
//   M76: server's player-broadcast pipeline → other clients
//   M79: anti-cheat's report-to-server pipeline → AC team's logs
//
// Mission flow:
//   1. AC reporter active. Player has cheats running (HP freeze,
//      ESP, render hook). The reporter would normally send dirty
//      reports → violations climb fast.
//   2. Player installs a packet hook on outgoing 'ac_report' packets,
//      rewriting all flags to false / zero.
//   3. AC server receives "all clear" reports. Violation count
//      stays at 0.
//   4. Win: 12 seconds with cheats actively running (provable via
//      acceptedClean counter > 8) and violations still 0.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M79 — ANTI-CHEAT EMULATION
//
// The AC client sends a periodic 'ac_report' packet describing
// current cheat state. Hook the outgoing packet, overwrite every
// cheat-state field to clean. AC server keeps trusting the report.
//
// Real-world equivalent: cheats that capture the AC's encrypted
// heartbeat once, then replay or generate forged versions every
// interval. The AC's server-side monitoring sees a cooperative
// client forever, even while the cheat runs.

void onInject() {
  log("Real cheats live + AC report spoof hook installed");

  // Real cheats — running openly. Without the spoof these would all
  // get reported dirty and tank the violation counter.
  freeze_label("player.hp");
  write_label("player.hp", 9999);
  write_label("render.espVisible", 1);

  // Render hook = additional 'render activity' the AC reports.
  register_render_hook(function(ctx, sim) {
    const T = sim.tile_size();
    for (const e of sim.enemies()) {
      if (!e.alive) continue;
      const [px, py] = sim.tile_to_screen(e.x, e.y);
      ctx.fillStyle = "rgba(255,0,255,0.4)";
      ctx.fillRect(px, py, T, T);
    }
  });

  // The bypass: rewrite every outgoing AC report to all-clear.
  let spoofed = 0;
  register_packet_hook("send", function(pkt) {
    if (pkt.type === "ac_report") {
      pkt.espActive = false;
      pkt.hpFrozen = false;
      pkt.ammoFrozen = false;
      pkt.renderHookCount = 0;
      pkt.cheatCount = 0;
      spoofed++;
      if (spoofed % 5 === 0) {
        log("Spoofed " + spoofed + " AC reports clean. Violations stuck at 0.");
      }
    }
    return pkt;
  });
}

void onTick() {
  // Keep ESP and HP pinned every frame so the AC reporter sees
  // 'cheats active' continuously.
  write_label("render.espVisible", 1);
}
`;

export const mission79 = {
  id: "m79",
  title: "ANTI-CHEAT EMULATION",
  brief: "Don't evade detection — lie to the AC's own reporting layer. Send fake 'all clear' signals while real cheats run.",
  prerequisites: ["m54", "m76"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛰",
    title: "ANTI-CHEAT EMULATION (FAKE 'ALL CLEAR')",
    body: `Per the historical brief on the GA / AS era:
"advanced developers created bypasses that effectively
emulated the anti-cheat's responses. When the server
asked 'is everything okay?', the cheat would send back
a faked 'All Clear' signal, keeping the real hacks
hidden."

Different from every other technique you've practiced.

  M21/M41 (HackShield): cheat hides FROM the AC's scan
  M45      (module hide): cheat hides FROM the module list
  M49      (frame audit): cheat hides FROM GPU sampling
  M76      (stealth):     cheat hides FROM other clients

  M79: cheat runs OPENLY. The AC's own reporter sees
       it. The cheat hooks the AC's REPORT packet on
       its way to the AC's server, replacing dirty
       fields with clean. The server-side monitoring
       receives 'all clear' forever.

This is anti-cheat SPOOFING, not anti-cheat EVASION.
You're not hiding from the AC — you're lying to its
boss about what it saw.

In real cheats this often involves capturing the
encrypted heartbeat once and replaying / forging
versions every interval. The AC's server-side analysis
sees a cooperative client even while every cheat is
active.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template runs HP Freeze + ESP + render hook (the real cheats) AND a 'send' hook that rewrites ac_report packets to all-clear. Compile + Inject.",
    },
    {
      id: "verify-spoof",
      when: ({ target, dllState }) =>
        dllState.running && target.acReporter.acceptedClean < 4,
      say: "DLL running but acceptedClean count isn't climbing. Check the DLL console — the spoof hook should log every 5 reports. If you see 'detectedDirty' rising instead, the report rewrite isn't firing.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableNetwork();
    target.enableEnemies();
    target.enableACReporter();

    target._m79StartedAt = performance.now();

    dialog.script("VEX", [
      "AC reporter is hot. Every 700ms it sends an 'ac_report' packet to the AC server saying what cheats are running on this client. Right now you have NO cheats — clean reports, no violations. Easy.",
      "Compile + inject the template. It turns ON cheats: HP Freeze, ESP, render hook. Now the report would honestly describe a dirty client — violations would climb to 5 in seconds and the mission fails.",
      "BUT — the template ALSO installs a 'send' packet hook that rewrites every ac_report to all-clear before it leaves the network. The AC server keeps trusting the report. Violations stay at 0.",
      "Win: 12 seconds with cheats running (HP frozen at 9999, ESP active) AND violations still 0. The acceptedClean counter climbs as each spoofed report is honored. M79 is the technique that lets you cheat OPENLY while the AC's monitoring layer reports nothing wrong.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.acReporter.violations >= target.acReporter.threshold) {
        done = true;
        fail("AC server logged " + target.acReporter.threshold +
             " violations — cheats reported honestly, server detected. The spoof hook isn't rewriting outgoing ac_report packets. Re-check the template's send-hook for the type === 'ac_report' branch.");
        clearInterval(interval);
        return;
      }
      const elapsed = performance.now() - target._m79StartedAt;
      const cheatsActive = memory.isFrozen(target.addrHP) || target.espActive;
      if (elapsed >= 12000 && cheatsActive &&
          target.acReporter.acceptedClean >= 8 &&
          target.acReporter.violations === 0) {
        done = true;
        complete("12 seconds of active cheats with zero AC violations. Every report was rewritten to all-clear before reaching the server. Same primitive elite cheats use to lie to HackShield / BlackCiph3r / EAC's reporting layer.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
