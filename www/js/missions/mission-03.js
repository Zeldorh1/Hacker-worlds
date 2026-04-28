// Mission 3 — PROCESS SHROUD
//
// First taste of anti-anti-cheat. The target's running an active sweep
// for known cheat tool signatures. Your scanner's process / window
// title is on the blacklist by default — every second the sweep is
// running on a flagged tool, the DETECTION meter fills. If it hits
// 100%, the target force-closes and the mission fails.
//
// Lesson: rename your tool to something innocuous (anything that
// doesn't match scanner|cheat|hack|trainer|injector|...). With a clean
// name detection still creeps up slowly (background suspicion) but
// you'll have time to do an M1-style coord freeze.
//
// Real-world parallel: anti-cheat code calls FindWindow / EnumProcesses
// looking for "Cheat Engine"; defenders rename the window/process or
// hook those APIs.

import { memory } from "../sim-memory.js";

export const mission03 = {
  id: "m03",
  title: "PROCESS SHROUD",
  brief: "Hide your tool from the target's anti-cheat sweep, then freeze X.",
  prerequisites: ["m02"],
  timeLimit: 90,
  detection: true,    // app.js will spin up the detection meter

  start({ dialog, target, complete }) {
    target.reset();

    dialog.script("VEX", [
      "New target. This one's running an active sweep — it scans process names and window titles for known cheat tools.",
      "Your scanner's default name is 'scanner.exe'. That's on every blacklist on the planet. Detection will fill in seconds.",
      "Open Scanner. The 'tool process / window' field at top is editable. Change it to something boring — calc.exe, notes.txt, whatever.",
      "Once the FLAGGED badge clears, detection slows to a crawl. Now do the M1 freeze loop on X.",
      "Detection hits 100%? Target force-closes. Trace hits 0? Same fail. Move.",
    ]);

    const xAddr = memory.addressOfLabel("player.x");
    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (memory.isFrozen(xAddr)) {
        done = true;
        complete("Tool concealed, freeze landed. That's how real ones do it.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  },
};
