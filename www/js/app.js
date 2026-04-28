// Boot + top-level routing between the contracts hub and an active mission.

import { AssaultZone } from "./target-assaultzone.js";
import { Scanner }     from "./scanner.js";
import { Dialog }      from "./dialog.js";
import { Desktop }     from "./desktop.js";
import { MatrixRain }  from "./matrix-rain.js";
import { Timer }       from "./timer.js";
import { Detection }   from "./anticheat.js";
import { runBoot }     from "./boot.js";
import { audio }       from "./audio.js";
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
    audio.tap();
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

function setMode(mode) { document.body.dataset.mode = mode; }
function showHub() {
  document.getElementById("view-hub").classList.add("view--active");
  document.getElementById("view-target").classList.remove("view--active");
  document.getElementById("view-scanner").classList.remove("view--active");
}
function showMission(switchTo) {
  document.getElementById("view-hub").classList.remove("view--active");
  switchTo("target");
}

function setupMuteButton() {
  const btn = document.getElementById("btn-mute");
  if (!btn) return;
  function refresh() { btn.textContent = "audio: " + (audio.isMuted() ? "off" : "on"); }
  refresh();
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.toggleMute();
    refresh();
    if (!audio.isMuted()) audio.tap();
  });
}

// ---- Trace bar (mission timer) ----

function formatTime(secs) {
  const s = Math.max(0, Math.ceil(secs));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function showTraceBar(duration) {
  const bar = document.getElementById("trace-bar");
  const fill = document.getElementById("trace-fill");
  const time = document.getElementById("trace-time");
  bar.removeAttribute("hidden");
  bar.removeAttribute("data-urgency");
  fill.style.width = "100%";
  time.textContent = formatTime(duration);
}
function hideTraceBar() {
  const bar = document.getElementById("trace-bar");
  bar.setAttribute("hidden", "");
}
function updateTraceBar(remaining, duration) {
  const fill = document.getElementById("trace-fill");
  const time = document.getElementById("trace-time");
  const bar  = document.getElementById("trace-bar");
  const frac = duration > 0 ? remaining / duration : 0;
  fill.style.width = (frac * 100).toFixed(2) + "%";
  time.textContent = formatTime(remaining);
  if (frac <= 0.10)      bar.setAttribute("data-urgency", "crit");
  else if (frac <= 0.25) bar.setAttribute("data-urgency", "warn");
  else                   bar.removeAttribute("data-urgency");
}

function showDetectionBar() {
  const bar = document.getElementById("detection-bar");
  bar.removeAttribute("hidden");
  bar.removeAttribute("data-urgency");
  document.getElementById("detection-fill").style.width = "0%";
  document.getElementById("detection-pct").textContent = "0%";
}
function hideDetectionBar() {
  document.getElementById("detection-bar").setAttribute("hidden", "");
}
function updateDetectionBar(value) {
  const bar  = document.getElementById("detection-bar");
  const fill = document.getElementById("detection-fill");
  const pct  = document.getElementById("detection-pct");
  fill.style.width = value.toFixed(1) + "%";
  pct.textContent = Math.round(value) + "%";
  if (value >= 80)      bar.setAttribute("data-urgency", "crit");
  else if (value >= 50) bar.setAttribute("data-urgency", "warn");
  else                  bar.removeAttribute("data-urgency");
}

// ---- Heartbeat (last 10s) ----

class Heartbeat {
  constructor() { this._iv = null; }
  start() {
    if (this._iv) return;
    audio.heartbeat();
    this._iv = setInterval(() => audio.heartbeat(), 900);
  }
  stop() {
    if (this._iv) { clearInterval(this._iv); this._iv = null; }
  }
}

async function boot() {
  setupMuteButton();
  await runBoot({ audio });

  const switchTo = setupTabs();
  const dialog   = new Dialog(document.getElementById("dialog-bar"), { audio });
  const scanner  = new Scanner(document.getElementById("view-scanner"), { audio });
  const target   = new AssaultZone(document.getElementById("game-canvas"), { audio });
  target.start();

  const rain = new MatrixRain(document.getElementById("matrix-rain"));
  const heartbeat = new Heartbeat();

  let activeTeardown = null;
  let activeId = null;
  let activeTimer = null;
  let activeDetection = null;
  let scannerScanUnsub = null;

  function clearActiveMission() {
    if (activeTeardown) { activeTeardown(); activeTeardown = null; }
    if (activeTimer)    { activeTimer.stop(); activeTimer = null; }
    if (activeDetection) { activeDetection.stop(); activeDetection = null; }
    if (scannerScanUnsub) { scannerScanUnsub(); scannerScanUnsub = null; }
    heartbeat.stop();
    target.reset();
    scanner.reset();
    scanner.clearWatchlist();
    dialog.clear();
    hideTraceBar();
    hideDetectionBar();
  }

  function endMission() {
    clearActiveMission();
    activeId = null;
    setMode("hub");
    showHub();
    rain.start();
  }

  function failMission(reason) {
    if (!activeId) return;
    const $sub = document.getElementById("fail-sub");
    if ($sub) $sub.textContent = reason || "session terminated";
    document.getElementById("fail-overlay").removeAttribute("hidden");
    audio.fail();
    if (activeTeardown) { activeTeardown(); activeTeardown = null; }
    if (activeTimer)    { activeTimer.stop(); activeTimer = null; }
    heartbeat.stop();
  }

  function hideFailOverlay() {
    document.getElementById("fail-overlay").setAttribute("hidden", "");
  }

  function launchMission(id) {
    const m = MISSIONS_BY_ID[id];
    if (!m) return;
    audio.tap();

    // If a mission is already running, tear it down first.
    clearActiveMission();
    hideFailOverlay();

    activeId = id;
    setMode("mission");
    showMission(switchTo);
    rain.stop();

    if (m.timeLimit) {
      showTraceBar(m.timeLimit);
      activeTimer = new Timer({
        duration: m.timeLimit,
        onTick: (rem, dur) => updateTraceBar(rem, dur),
        onUrgency: (frac) => {
          if (frac <= 0.10) {
            heartbeat.start();
            audio.urgent();
            dialog.say("VEX", "Ten seconds. Move.");
          } else if (frac <= 0.25) {
            audio.urgent();
            dialog.say("VEX", "Quarter trace remaining. Hurry up.");
          } else if (frac <= 0.5) {
            dialog.say("VEX", "Halfway through trace window. Stay sharp.");
          }
        },
        onTimeout: () => failMission("trace complete · " + m.title),
      });
      activeTimer.start();
    }

    if (m.detection) {
      showDetectionBar();
      activeDetection = new Detection({
        onChange: (v) => updateDetectionBar(v),
        onTrip:   () => failMission("process terminated · anti-cheat"),
      });
      activeDetection.start();
      // Each scan action bumps detection if the tool name is flagged.
      scannerScanUnsub = scanner.on((kind) => {
        if (kind === "scan-action" && activeDetection) activeDetection.noteScan();
      });
    }

    activeTeardown = m.start({
      dialog, scanner, target, switchTo,
      toast: showToast,
      complete(message) {
        if (activeId !== id) return;
        missionState.markComplete(id);
        audio.complete();
        showToast("Mission Complete · " + m.title);
        if (message) dialog.say("VEX", message);
        if (activeTimer) { activeTimer.stop(); activeTimer = null; }
        if (activeDetection) { activeDetection.stop(); activeDetection = null; }
        heartbeat.stop();
        setTimeout(() => { if (activeId === id) endMission(); }, 3200);
      },
      fail(reason) { failMission(reason); },
    });
  }

  const desktop = new Desktop(document.getElementById("view-hub"), {
    onLaunch: launchMission,
    audio,
  });

  document.getElementById("btn-back").addEventListener("click", () => {
    if (activeId) { audio.tap(); endMission(); }
  });

  document.getElementById("btn-retry").addEventListener("click", () => {
    audio.tap();
    const id = activeId;
    if (!id) { hideFailOverlay(); return; }
    hideFailOverlay();
    launchMission(id);
  });
  document.getElementById("btn-quit-mission").addEventListener("click", () => {
    audio.tap();
    hideFailOverlay();
    endMission();
  });

  setMode("hub");
  showHub();
  rain.start();
  document.querySelector("#dialog-bar .speaker").textContent = "HW";

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.__hw = { target, scanner, dialog, missionState, launchMission, endMission, audio };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
