// Mission 35 — PACKET REPLAY
//
// Network-side trick. The server emits a kill_credit packet when
// you drop an enemy. The recv-side of your DLL hooks it. Capture
// the packet, then re-inject it later via inject_packet("recv", pkt)
// to claim repeat kill credit the server didn't issue.
//
// Real-world equivalent: capture an in-game packet (level-up,
// loot-rolled, kill-confirmed), replay it to reward yourself
// repeatedly. Defeated by per-packet sequence numbers + replay
// windows on the server side; M30-style naive servers (and AC's)
// have no such defense.
//
// Mission flow:
//   1. DLL template registers a recv-hook that captures the first
//      kill_credit packet seen.
//   2. After fire() drops one enemy, the captured packet has a
//      kill_credit. recv-hook stores it.
//   3. Player calls inject_packet("recv", capturedPkt) three more
//      times via a register_cheat callback.
//   4. killCount goes from 1 (real) to 4 (one real + three replay).
//   5. Win = killCount >= 4 AND only one enemy actually died.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M35 — PACKET REPLAY
//
// Naive servers don't enforce replay windows. Capture a kill_credit
// packet, re-inject it three times, claim 4 kill credits for one
// actual kill.

let captured = null;

void onInject() {
  log("replay DLL loaded — will capture first kill_credit");

  // Recv-hook: capture the first kill_credit, then forward as-is.
  register_packet_hook("recv", function(pkt) {
    if (pkt.type === "kill_credit" && !captured) {
      captured = JSON.parse(JSON.stringify(pkt));   // deep copy
      log("kill_credit captured — replay armed");
    }
    return pkt;
  });

  // Cheat in the menu: when ticked, replay the captured packet.
  register_cheat("Replay 3x", function() {
    if (!captured) return;
    log("replaying kill_credit x3");
    for (let i = 0; i < 3; i++) {
      inject_packet("recv", { ...captured, t: performance.now() });
    }
    captured = null;   // one-shot, don't loop forever
  });
}

void onTick() { }
`;

export const mission35 = {
  id: "m35",
  title: "PACKET REPLAY",
  brief: "Capture a kill_credit packet. Replay it 3x for 4 total kills from 1 real kill.",
  prerequisites: ["m34"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,
  network: true,

  hints: [
    {
      id: "compile-and-kill-one",
      min: 6,
      when: ({ dllState, target }) =>
        !dllState.running || target.killCount === 0,
      say: "Compile + Inject. Drop ONE enemy normally — fire 4 times, kill_credit packet flies past the recv-hook, gets captured. Console will log 'kill_credit captured.'",
    },
    {
      id: "replay-it",
      when: ({ target }) => target.killCount >= 1 && target.killCount < 4,
      say: "Captured? Open ≡ CHEATS, tick 'Replay 3x'. The cheat re-injects the captured kill_credit packet three more times. killCount jumps from 1 to 4 with no extra kills.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.enableNetwork();
    target.player.ammo = 30;

    dialog.script("VEX", [
      "Different exploit class. Server emits a kill_credit packet when you drop an enemy. Naive servers don't sequence-number these — capture one, re-inject it three more times, server-side scoreboard credits you 4 times for 1 actual kill.",
      "Template registers a recv-hook that captures the FIRST kill_credit. A second cheat — togglable in ≡ CHEATS — replays it 3x via the new inject_packet() API.",
      "Compile + Inject. Fire 4 shots at one enemy, drop them, watch the console log 'kill_credit captured.' Then ≡ CHEATS → tick Replay 3x. Mission's killCount counter jumps to 4.",
      "Defenses: per-packet sequence numbers + server-side replay windows. AC doesn't ship those. Modern competitive games do — that's why this trick is dead against them, alive against AC.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.killCount >= 4) {
        done = true;
        complete("4 kill credits from 1 real kill. Naive servers + replay windows are exactly the vulnerability class real-world packet capture frameworks were built to exploit.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
