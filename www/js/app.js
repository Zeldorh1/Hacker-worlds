// Boot + top-level routing between the contracts hub and an active mission.

import { AssaultZone } from "./target-assaultzone.js";
import { Scanner }     from "./scanner.js";
import { Dialog }      from "./dialog.js";
import { Desktop }     from "./desktop.js";
import { MISSIONS_BY_ID } from "./missions/index.js";
import { missionState }   from "./mission-state.js";

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const views = {
    target:  document.getElementById("view-target"),
    scanner: document.getElementById("view-scanner"),
  };
  function switchTo(name) {
    tabs.forEach(t => t.classList.toggle("tab--active", t.dataset.view === name));
    Object.entries(views).forEach(([k, v]) => v.classList.toggle("view--active", k === name));
  }
  tabs.forEach(t => t.addEventListener("click", () => switchTo(t.dataset.view)));
  return switchTo;
}

function showToast(text, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, ms);
}

function setMode(mode) {
  document.body.dataset.mode = mode;
}

function showHub() {
  document.getElementById("view-hub").classList.add("view--active");
  document.getElementById("view-target").classList.remove("view--active");
  document.getElementById("view-scanner").classList.remove("view--active");
}

function showMission(switchTo) {
  document.getElementById("view-hub").classList.remove("view--active");
  switchTo("target");
}

function boot() {
  const switchTo = setupTabs();
  const dialog   = new Dialog(document.getElementById("dialog-bar"));
  const scanner  = new Scanner(document.getElementById("view-scanner"));
  const target   = new AssaultZone(document.getElementById("game-canvas"));
  target.start();

  let activeTeardown = null;
  let activeId = null;

  function endMission() {
    if (activeTeardown) { activeTeardown(); activeTeardown = null; }
    activeId = null;
    target.reset();
    scanner.reset();
    scanner.clearWatchlist();
    dialog.clear();
    setMode("hub");
    showHub();
  }

  function launchMission(id) {
    const m = MISSIONS_BY_ID[id];
    if (!m) return;
    activeId = id;

    target.reset();
    scanner.reset();
    scanner.clearWatchlist();
    dialog.clear();

    setMode("mission");
    showMission(switchTo);

    activeTeardown = m.start({
      dialog, scanner, target, switchTo,
      toast: showToast,
      complete(message) {
        if (activeId !== id) return;
        missionState.markComplete(id);
        showToast("Mission Complete · " + m.title);
        if (message) dialog.say("VEX", message);
        // Auto-return to hub after a brief beat.
        setTimeout(() => { if (activeId === id) endMission(); }, 3200);
      },
    });
  }

  const desktop = new Desktop(document.getElementById("view-hub"), {
    onLaunch: launchMission,
  });

  document.getElementById("btn-back").addEventListener("click", () => {
    if (activeId) endMission();
  });

  // Brand line for hub mode.
  setMode("hub");
  showHub();
  document.querySelector("#dialog-bar .speaker").textContent = "HW";

  // Service worker (PWA offline) — best effort.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // Test/debug hook (no-op for normal users, used by Playwright smoke tests).
  window.__hw = { target, scanner, dialog, missionState, launchMission, endMission };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
