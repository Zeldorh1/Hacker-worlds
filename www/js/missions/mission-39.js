// Mission 39 — SEQUENCE NUMBERS
//
// Server upgrade #3. Every outgoing packet auto-numbered with a seq.
// Server tracks seen seqs and rejects duplicates within a replay
// window. M35's replay attack (capture + re-inject kill_credit)
// fails: same seq → rejected.
//
// Bypass: when replaying, also forge a NEW seq that hasn't been
// seen yet. Pick one larger than any seen seq.
//
// Real-world: TCP-style sequence tracking + replay window is one
// of the easiest ways to defeat naive packet replay. Defeated
// either by forging fresh seqs (M39) or by attacking the seq
// generator itself.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M39 — SEQUENCE NUMBERS
//
// Server tracks packet seq numbers and rejects duplicates.
// Naive replay (re-inject the same packet) fails — server saw the
// seq already. Bypass: forge a fresh seq when replaying.

let captured = null;

void onInject() {
  log("seq-aware replay DLL loaded — will forge new seq for replays");

  register_packet_hook("recv", function(pkt) {
    if (pkt.type === "kill_credit" && !captured) {
      captured = JSON.parse(JSON.stringify(pkt));
      log("kill_credit captured at seq=" + pkt.seq);
    }
    return pkt;
  });

  register_cheat("Replay 3x", function() {
    if (!captured) return;
    log("replaying with forged seqs");
    // Pick fresh seqs well above any we've seen. Real games use
    // 32-bit seqs; pick something far ahead of the current value.
    for (let i = 0; i < 3; i++) {
      const forged = { ...captured, seq: captured.seq + 1000 + i };
      inject_packet("recv", forged);
    }
    captured = null;
  });
}

void onTick() { }
`;

export const mission39 = {
  id: "m39",
  title: "SEQUENCE NUMBERS",
  brief: "Server rejects duplicate seqs. Replay still works — forge fresh seqs.",
  prerequisites: ["m38"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,
  network: true,

  hints: [
    {
      id: "kill-one",
      min: 6,
      when: ({ dllState, target }) =>
        !dllState.running || target.killCount === 0,
      say: "Compile + Inject. Drop ONE enemy normally — kill_credit captured (with its original seq number).",
    },
    {
      id: "replay-with-forged-seq",
      when: ({ target }) => target.killCount >= 1 && target.killCount < 4,
      say: "≡ CHEATS → Replay 3x. The cheat re-injects the captured packet THREE times, but with seq+1000, +1001, +1002 — fresh numbers the server hasn't seen. They get credited.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.enableNetwork();
    target.enableSequence();
    target.player.ammo = 30;

    dialog.script("VEX", [
      "Server upgrade #3: sequence numbers. Every packet auto-tagged. Server rejects any seq it's already seen → M35's naive replay fails.",
      "Bypass: when you replay a captured packet, also forge a fresh seq. Pick one well above the current — server treats it as new.",
      "Template captures the first kill_credit (along with its seq). 'Replay 3x' cheat re-injects with seq+1000/+1001/+1002.",
      "Drop ONE enemy normally (kill_credit captured), then ≡ CHEATS → Replay 3x. killCount 1 → 4. Same lesson: replay defenses can be beaten by forging the sequencer.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.killCount >= 4) {
        done = true;
        complete("4 credits, 1 real kill. Forged seqs let replay attacks survive sequence-number defenses.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
