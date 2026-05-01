// Mission 60 — STRING ENCRYPTION (anti-AC keyword scan)
//
// Real anti-cheats (HackShield, EAC, BattlEye) scan the loaded DLL's
// memory and source data for known cheat keywords: "AIMBOT",
// "WALLHACK", "ESP", "TRIGGERBOT", etc. If a cheat DLL has any of
// these as plaintext strings (e.g., as cheat-menu labels or log
// messages), the AC's signature scanner immediately flags it.
//
// The bypass: XOR-encrypt the strings at rest. The DLL's binary
// contains only the encrypted gibberish — no plaintext keywords for
// the scanner to match. At runtime, when the cheat needs the string
// (to display the menu label, for example), it decodes the XOR.
// The plaintext exists in memory only briefly between decode and
// use; the scanner's snapshot rarely catches that window.
//
// Why this is its own technique class: every other anti-AC mission
// is about hiding the cheat's BEHAVIOR. M60 is about hiding the
// cheat's IDENTITY at the source-code level. Even before any cheat
// runs, the AC can flag a DLL whose strings look suspicious.
//
// Mission flow:
//   1. AC string scanner active. It reads dll.lastSource every 1.5s
//      and searches for keywords.
//   2. Without protection: a typical cheat has plaintext "AIMBOT" /
//      "ESP" in register_cheat labels and log messages. Scanner hits.
//   3. With protection: cheat builds strings via XOR decode at
//      runtime. The source has only encrypted bytes; scanner finds
//      nothing.
//   4. Win: cheat runs (HP freeze active) AND scanner records 4+
//      consecutive clean scans (hits === 0).

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M60 — String obfuscation pass.
//
// Every label and tag goes through XOR encoding. Source contains
// only ciphertext. Runtime decode brings the plaintext back briefly
// for use, then the variable goes out of scope. Source never has
// the trigger words in plain form.

function decode(enc, key) {
  let out = "";
  for (let i = 0; i < enc.length; i++) {
    out += String.fromCharCode(enc.charCodeAt(i) ^ key);
  }
  return out;
}

// Each constant below is a label, encoded with XOR key 0x42.
// We never write the decoded form in this file.
const E1 = "\\x03\\x2B\\x2F\\x20\\x2D\\x36";   // 6-letter feature label
const E2 = "\\x07\\x31\\x32";                  // 3-letter feature label

void onInject() {
  log("Cheat installed (labels are runtime-decoded)");

  const a = decode(E1, 0x42);
  const b = decode(E2, 0x42);

  register_cheat(a, function() {
    write_label("player.hp", 9999);
  });
  register_cheat(b, function() {
    write_label("render.espVisible", 1);
  });

  // Auto-enable both for verification.
  freeze_label("player.hp");
  write_label("render.espVisible", 1);
}

void onTick() {
  write_label("render.espVisible", 1);
}
`;

export const mission60 = {
  id: "m60",
  title: "STRING ENCRYPTION",
  brief: "AC scans your DLL's source for 'AIMBOT'/'ESP'. XOR-encrypt the strings, decode at runtime.",
  prerequisites: ["m41"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🔐",
    title: "AC SCANS YOUR STRINGS",
    body: `Anti-cheats don't only watch your behavior. They
fingerprint your binary. Walk the cheat DLL's memory,
search for known suspicious keywords:

  "AIMBOT", "ESP", "WALLHACK", "TRIGGERBOT",
  "NORECOIL", "CHAMS", "RAPIDFIRE"

Every match → flag. Even before any cheat fires. Just
having those words AS LITERAL STRINGS in your source
is a detection.

The bypass: XOR-encrypt the strings at rest. Source
contains only ciphertext bytes. At runtime, decode
the XOR right before the string is used. Plaintext
exists for microseconds in heap; the scanner's
snapshot misses it.

Mission proves both:
  1. Without obfuscation, scanner finds 4+ keywords
     instantly (mission fails)
  2. With XOR obfuscation, scanner finds 0 keywords
     even though the cheat is fully running

This is why every competitive cheat ships with a
string-obfuscation pass. Same technique class
malware uses to evade AV signature scans.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template uses XOR-encoded labels — no plaintext 'AIMBOT' or 'ESP' anywhere. Compile + Inject.",
    },
    {
      id: "verify-clean-scans",
      when: ({ target, dllState }) =>
        dllState.running && target.acStringScanner.cleanScans < 3,
      say: "Watching for 4 consecutive clean scans. The scanner runs every 1.5s. If you see hits > 0, your source still has plaintext keywords — re-check the template that no comments or strings contain 'AIMBOT' / 'ESP' / 'WALLHACK' / etc.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableACStringScanner();

    target._m60StartedAt = performance.now();

    dialog.script("VEX", [
      "AC's signature scanner is live. Every 1.5s it reads your DLL's source code looking for plaintext cheat keywords: AIMBOT, ESP, WALLHACK, etc. Find any → flag.",
      "Without obfuscation a normal cheat would trip the scanner immediately just by having these words as register_cheat labels or log messages. Even the comments in your code would flag.",
      "The fix: XOR-encrypt every suspicious string. Source contains ciphertext bytes. Decode at runtime right before use. Plaintext exists only briefly in heap — too narrow a window for the scanner to catch.",
      "Win: cheat runs (HP frozen) AND 4 consecutive clean scans recorded. Real-world this is the same technique class malware uses to evade AV signature scans.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.acStringScanner.hits > 0 && target.acStringScanner.lastScanAt > 0) {
        // Don't fail; just block the win. The hint will tell them what's wrong.
      }
      const cheatActive = memory.isFrozen(target.addrHP);
      if (target.acStringScanner.cleanScans >= 4 &&
          target.acStringScanner.hits === 0 &&
          cheatActive) {
        done = true;
        complete("4 clean scans, cheat actively running. AC's keyword scanner found nothing because every suspicious string was XOR-encoded at rest. Same technique malware uses against AV signature scans.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
