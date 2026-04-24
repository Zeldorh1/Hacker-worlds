// Boot.

import { AssaultZone } from "./target-assaultzone.js";
import { Scanner } from "./scanner.js";
import { Dialog } from "./dialog.js";
import { startMission01 } from "./missions/mission-01.js";

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const views = { target: document.getElementById("view-target"), scanner: document.getElementById("view-scanner") };
  tabs.forEach(t => t.addEventListener("click", () => switchTo(t.dataset.view)));
  function switchTo(name) {
    tabs.forEach(t => t.classList.toggle("tab--active", t.dataset.view === name));
    Object.entries(views).forEach(([k, v]) => v.classList.toggle("view--active", k === name));
  }
  return switchTo;
}

function showToast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2400);
}

function boot() {
  const switchTo = setupTabs();
  const dialog   = new Dialog(document.getElementById("dialog-bar"));
  const scanner  = new Scanner(document.getElementById("view-scanner"));
  const target   = new AssaultZone(document.getElementById("game-canvas"));
  target.start();

  startMission01({ dialog, scanner, target, switchTo, toast: showToast });

  // Register SW best-effort; the app works without it.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
