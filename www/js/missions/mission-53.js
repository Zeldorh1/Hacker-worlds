// Mission 53 — DEFENSIVE: AUTH ON PRIVILEGED HANDLERS
//
// This is the only correct fix for the M51/M52 class of exploit.
// Renaming the ID does nothing — the cheat dev finds the new number.
// Encrypting the ID at the wire layer does nothing — the cheat dev
// reverses the encryption.
//
// The fix is server-side: every privileged-state-change handler
// MUST check session.privileged (or equivalent admin token) before
// honoring the request.
//
// Mission flow:
//   1. Server starts with auth DISABLED — like M51, ID 135 flips
//      godMode for anyone who sends it. Player verifies this works
//      (sends 135, godMode flips).
//   2. Player flips serverRequireAuth = true via the engine call
//      'enable_server_auth' (the mission exposes this as a one-line
//      defensive primitive).
//   3. Player sends 135 again. Server now checks session.privileged.
//      The handler entry is marked auth-required, so the request is
//      rejected (serverDeniedCount climbs).
//   4. Win: at least one denied request after auth was enabled,
//      AND godMode is no longer being granted.
//
// The lesson: this single line — checking auth on the handler —
// closes EVERY variant of the M51/M52 exploit at once. Doesn't
// matter if Nexon renamed the byte 100 times. The handler asks
// "are you authorized?" and the cheat dev's session isn't.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M53 — DEFENSIVE PATCH (server-side auth)
//
// First, demonstrate the M51 exploit still works (no auth). Then
// flip the defensive switch and demonstrate the same exploit fails.
//
// The defensive primitive 'enable_server_auth' is what a real game
// patch should add — one check before honoring privileged state
// changes:
//
//   case ID_God_Mode:
//       if (!session.is_admin) { reject(); return; }
//       session.godMode = true;
//       break;
//
// Notice this fix is ID-agnostic. Whether the byte is 135, 200, 404,
// or any number, the auth check rejects unauthorized callers. Renames
// become irrelevant.

void onInject() {
  log("=== Phase 1: confirm exploit works (no auth) ===");
  let r = call_engine_function("send_to_server", 135);
  log("ID 135 (no auth): " + (r.ok ? "ACCEPTED" : "rejected"));

  log("=== Phase 2: enable server-side auth ===");
  call_engine_function("enable_server_auth");
  log("Auth requirement is now ON for privileged handlers");

  log("=== Phase 3: re-attempt the same exploit ===");
  r = call_engine_function("send_to_server", 135);
  log("ID 135 (auth on): " + (r.ok ? "ACCEPTED" : "REJECTED — " + r.reason));
  log("Same byte. Same handler. Now requires auth. Rename is irrelevant.");
}

void onTick() { }
`;

export const mission53 = {
  id: "m53",
  title: "AUTH ON PRIVILEGED HANDLERS",
  brief: "The actual fix for M51/M52. One line on the server kills every rename variant.",
  prerequisites: ["m52"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛡",
    title: "DEFENSIVE PATCH AVAILABLE",
    body: `The M51/M52 exploit class has ONE correct fix:
require auth on every privileged handler.

  case ID_God_Mode:
      if (!session.is_admin) reject();
      session.godMode = true;
      break;

That's it. Two lines. Doesn't matter what byte triggers
the handler — 135, 200, 404, 99 — none of them work
without an authorized session.

Compare against the patch-rename approach (M52):
  • Rename: cheat dev finds new byte in 24 hours,
    ships new build, exploit lives. Repeat forever.
  • Auth check: cheat dev cannot synthesize a valid
    admin token. Exploit dies. One fix, forever.

This mission proves it. Same exploit code as M51 + M52.
Toggle the defensive primitive. Same code now fails.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template runs the exploit, enables auth, runs it again. Compile + Inject and watch the DLL console.",
    },
    {
      id: "check-denied",
      when: ({ target, dllState }) =>
        dllState.running && target.serverDeniedCount === 0,
      say: "Watching for a rejected request. Check DLL console — the second 'send_to_server' call should now fail with 'auth_required'. If not, ensure 'enable_server_auth' was called between the two attempts.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();

    // Register the same handler as M51 — but mark it auth-required.
    target.serverHandlers.set(135, {
      auth: true,
      handler: (session) => { session.godMode = true; },
    });

    // Expose the defensive primitive as an engine call. In real life
    // this is server-side configuration, not a runtime toggle — but
    // the lesson is about the existence and effect of the auth check.
    target.engine.enable_server_auth = () => {
      target.serverRequireAuth = true;
      return { ok: true };
    };

    target._m53StartedAt = performance.now();

    dialog.script("VEX", [
      "M51 worked because the server honored ID 135 unconditionally. M52 worked the same way after Nexon renamed it. The fix is not in the byte — it's in the handler.",
      "The correct patch: every privileged handler checks session.privileged before honoring the request. One line per handler. Done.",
      "Template demonstrates: send 135 (works, no auth), enable auth, send 135 again (FAILS with 'auth_required'). Same exploit code, different defensive posture.",
      "Win condition: serverDeniedCount > 0 AND session.godMode false (proving the second attempt was correctly rejected).",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      // Win: at least one auth-rejected request after auth was on,
      // and godMode is no longer flipped.
      if (target.serverDeniedCount > 0 &&
          target.serverRequireAuth &&
          !target.session.godMode) {
        done = true;
        complete("Auth-required handler rejected the same byte that exploited M51. Renames don't matter; auth does. This is the only fix in the game-server-trust class. Phase 1 of the LithTech arc complete.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
