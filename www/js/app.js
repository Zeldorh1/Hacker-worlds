// Boot + top-level routing between the contracts hub and an active mission.

import { AssaultZone } from "./target-assaultzone.js";
import { Scanner }     from "./scanner.js";
import { Dialog }      from "./dialog.js";
import { Desktop }     from "./desktop.js";
import { MatrixRain }  from "./matrix-rain.js";
import { Timer }       from "./timer.js";
import { Detection }   from "./anticheat.js";
import { runBoot }     from "./boot.js";
import { Tutorial }    from "./tutorial.js";
import { Library }     from "./library.js";
import { HintEngine, hintsEnabled, setHintsEnabled } from "./hints.js";
import { memory }      from "./sim-memory.js";
import { audio }       from "./audio.js";
import { MISSIONS_BY_ID } from "./missions/index.js";
import { missionState }   from "./mission-state.js";
import { dllRuntime }     from "./dll.js";
import { exportToCpp }    from "./cpp-export.js";

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const views = {
    target:  document.getElementById("view-target"),
    scanner: document.getElementById("view-scanner"),
    struct:  document.getElementById("view-struct"),
    dll:     document.getElementById("view-dll"),
  };
  // Lazy-init the struct view on first switch.
  let _structView = null;
  function switchTo(name) {
    tabs.forEach(t => t.classList.toggle("tab--active", t.dataset.view === name));
    Object.entries(views).forEach(([k, v]) => v.classList.toggle("view--active", k === name));
    // Start/stop the struct view's polling so it only ticks while visible.
    if (name === "struct") {
      if (!_structView) {
        import("./struct-view.js").then(mod => {
          _structView = new mod.StructView();
          _structView.start();
        });
      } else {
        _structView.start();
      }
    } else if (_structView) {
      _structView.stop();
    }
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

// Show a mission's escalation alert (set via m.alert) before its
// gameplay begins. Returns a Promise that resolves when the player
// taps ACKNOWLEDGE. Designed to look like an in-fiction patch
// notification — frames each new defense as something the dev team
// just shipped, so the curriculum reads as an arms race rather than
// a grab-bag of techniques.
function showMissionAlert(alert) {
  return new Promise((resolve) => {
    const $alert = document.getElementById("mission-alert");
    const $icon  = document.getElementById("mission-alert-icon");
    const $title = document.getElementById("mission-alert-title");
    const $body  = document.getElementById("mission-alert-body");
    const $ack   = document.getElementById("btn-mission-alert-ack");
    if (!$alert) { resolve(); return; }
    $icon.textContent  = alert.icon  || "⚠";    // ⚠
    $title.textContent = alert.title || "GAME UPDATE DETECTED";
    $body.textContent  = alert.body  || "";
    $alert.hidden = false;
    audio.fail && audio.fail();
    const onAck = () => {
      $ack.removeEventListener("click", onAck);
      $alert.hidden = true;
      audio.tap();
      resolve();
    };
    $ack.addEventListener("click", onAck);
  });
}

function setMode(mode) { document.body.dataset.mode = mode; }
function showHub() {
  document.getElementById("view-hub").classList.add("view--active");
  document.getElementById("view-target").classList.remove("view--active");
  document.getElementById("view-scanner").classList.remove("view--active");
  document.getElementById("view-library").classList.remove("view--active");
}
function showMission(switchTo) {
  document.getElementById("view-hub").classList.remove("view--active");
  document.getElementById("view-library").classList.remove("view--active");
  switchTo("target");
}
function showLibrary() {
  document.getElementById("view-hub").classList.remove("view--active");
  document.getElementById("view-target").classList.remove("view--active");
  document.getElementById("view-scanner").classList.remove("view--active");
  document.getElementById("view-library").classList.add("view--active");
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

function setupHintsButton() {
  const btn = document.getElementById("btn-hints");
  if (!btn) return;
  function refresh() { btn.textContent = "hints: " + (hintsEnabled() ? "on" : "off"); }
  refresh();
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setHintsEnabled(!hintsEnabled());
    refresh();
    audio.tap();
  });
}

function setupCheatMenu() {
  const $btn  = document.getElementById("btn-cheat-menu");
  const $menu = document.getElementById("cheat-menu");
  const $list = document.getElementById("cheat-menu-list");
  if (!$btn || !$menu) return;

  function render() {
    if (dllRuntime.cheats.length === 0) {
      $list.innerHTML = '<li class="empty">No cheats registered. Inject a DLL that calls register_cheat().</li>';
      return;
    }
    $list.innerHTML = dllRuntime.cheats.map((c, i) => `
      <li>
        <input type="checkbox" id="cheat-cb-${i}" data-label="${c.label.replace(/"/g, "&quot;")}" ${c.enabled ? "checked" : ""}/>
        <label for="cheat-cb-${i}">${c.label}</label>
      </li>
    `).join("");
    $list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", () => {
        dllRuntime.setCheatEnabled(cb.dataset.label, cb.checked);
        if (audio && cb.checked) audio.lock();
      });
    });
  }
  function toggle() {
    $menu.hidden = !$menu.hidden;
    if (!$menu.hidden) render();
    if (audio) audio.tap();
  }
  $btn.addEventListener("click", toggle);
  // DELETE key — desktop hotkey. Common cheat-menu binding.
  window.addEventListener("keydown", e => {
    if (e.key === "Delete" || e.key === "Insert") { e.preventDefault(); toggle(); }
  });
  // Live-refresh menu when cheats register/unregister.
  dllRuntime.on(() => { if (!$menu.hidden) render(); });
}

function setupDllEditor() {
  const $code    = document.getElementById("dll-code");
  const $compile = document.getElementById("btn-dll-compile");
  const $inject  = document.getElementById("btn-dll-inject");
  const $eject   = document.getElementById("btn-dll-eject");
  const $status  = document.getElementById("dll-status");
  const $console = document.getElementById("dll-console");
  if (!$code || !$compile) return;
  function setStatus(text, cls) {
    $status.textContent = text;
    $status.className = "dll-status " + (cls || "");
  }
  function renderConsole() {
    $console.textContent = dllRuntime.console.join("\n");
    $console.scrollTop = $console.scrollHeight;
  }
  $compile.addEventListener("click", () => {
    const result = dllRuntime.compile($code.value);
    if (result.ok) setStatus("compiled — ready to inject", "ok");
    else setStatus(result.error, "error");
    renderConsole();
  });
  $inject.addEventListener("click", () => {
    if (!dllRuntime.compiled) {
      // Auto-compile-then-inject for convenience.
      const result = dllRuntime.compile($code.value);
      if (!result.ok) { setStatus(result.error, "error"); renderConsole(); return; }
    }
    if (dllRuntime.inject()) setStatus("injected — running", "running");
  });
  $eject.addEventListener("click", () => {
    dllRuntime.eject();
    setStatus("ejected", "");
    renderConsole();
  });
  // M35 Export → C++ : translate the sim DLL into AC-targeting C++.
  const $export = document.getElementById("btn-dll-export");
  if ($export) {
    $export.addEventListener("click", () => {
      const cpp = exportToCpp($code.value);
      // Drop the result into the console panel so it's copyable on
      // mobile and visible without a download dialog.
      $console.textContent = cpp;
      $console.scrollTop = 0;
      setStatus("exported — scroll down for the .cpp file", "ok");
    });
  }
  // Subscribe to runtime events so console updates live.
  dllRuntime.on(() => renderConsole());
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

function showViolationBar() {
  const bar = document.getElementById("violation-bar");
  bar.removeAttribute("hidden");
  bar.removeAttribute("data-urgency");
  document.getElementById("violation-fill").style.width = "0%";
  document.getElementById("violation-pct").textContent = "0%";
}
function hideViolationBar() {
  document.getElementById("violation-bar").setAttribute("hidden", "");
}
function updateViolationBar(value) {
  const bar  = document.getElementById("violation-bar");
  const fill = document.getElementById("violation-fill");
  const pct  = document.getElementById("violation-pct");
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
  setupHintsButton();
  setupDllEditor();
  setupCheatMenu();
  await runBoot({ audio });

  // Show the orientation slides on first launch.
  const tutorial = new Tutorial({ audio });
  if (!Tutorial.hasSeen()) {
    await tutorial.show();
  }

  const switchTo = setupTabs();
  const dialog   = new Dialog(document.getElementById("dialog-bar"), { audio });
  const scanner  = new Scanner(document.getElementById("view-scanner"), { audio });
  const target   = new AssaultZone(document.getElementById("game-canvas"), { audio });
  target.start();

  const rain = new MatrixRain(document.getElementById("matrix-rain"));
  const heartbeat = new Heartbeat();
  const library = new Library();

  let activeTeardown = null;
  let activeId = null;
  let activeTimer = null;
  let activeDetection = null;
  let scannerScanUnsub = null;
  let activeHints = null;
  let activeWatchdogIv = null;

  function activeTabName() {
    const t = document.querySelector(".tab.tab--active");
    return t ? t.dataset.view : null;
  }
  function buildHintCtx(elapsed) {
    const watchAllEls = document.querySelectorAll(".watchlist li[data-key]");
    const watchDirectEls = document.querySelectorAll(".watchlist li[data-addr]");
    let anyFrozen = false;
    for (const li of watchAllEls) {
      const cb = li.querySelector(".freeze-cb");
      if (cb && cb.checked) { anyFrozen = true; break; }
    }
    let hasChain = false;
    let anyChainFrozen = false;
    for (const [, e] of (scanner.watch || new Map())) {
      if (e.type === "chain") {
        hasChain = true;
        if (e.frozen) anyChainFrozen = true;
      }
    }
    return {
      elapsed,
      activeTab: activeTabName(),
      target,
      memory,
      scannerState: {
        lastResults: scanner.lastResults,
        lastPointerResults: scanner.lastPointerResults,
        browseBase: scanner.lastBrowseBase,
      },
      dllState: {
        compiled: !!dllRuntime.compiled,
        running: dllRuntime.running,
        injectedFor: dllRuntime.injectedFor(),
      },
      watchSize: watchDirectEls.length,
      hasChain,
      anyChainFrozen,
      anyFrozen,
    };
  }

  function clearActiveMission() {
    if (activeTeardown) { activeTeardown(); activeTeardown = null; }
    if (activeTimer)    { activeTimer.stop(); activeTimer = null; }
    if (activeDetection) { activeDetection.stop(); activeDetection = null; }
    if (activeHints)    { activeHints.stop(); activeHints = null; }
    if (activeWatchdogIv) { clearInterval(activeWatchdogIv); activeWatchdogIv = null; }
    if (scannerScanUnsub) { scannerScanUnsub(); scannerScanUnsub = null; }
    heartbeat.stop();
    target.reset();
    scanner.reset();
    scanner.clearWatchlist();
    dialog.clear();
    dllRuntime.eject();
    hideTraceBar();
    hideDetectionBar();
    hideViolationBar();
    document.body.classList.remove("guided");
    const $paused = document.getElementById("paused-overlay");
    if ($paused) $paused.hidden = true;
    const $restart = document.getElementById("btn-restart");
    if ($restart) $restart.hidden = true;
    const $tabDll = document.getElementById("tab-dll");
    if ($tabDll) $tabDll.hidden = true;
    const $cheatBtn  = document.getElementById("btn-cheat-menu");
    const $cheatMenu = document.getElementById("cheat-menu");
    if ($cheatBtn)  $cheatBtn.hidden = true;
    if ($cheatMenu) $cheatMenu.hidden = true;
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

  async function launchMission(id) {
    const m = MISSIONS_BY_ID[id];
    if (!m) return;
    audio.tap();

    // If a mission is already running, tear it down first.
    clearActiveMission();
    hideFailOverlay();

    // Escalation alert — frames the next mission as a patch the
    // 'dev team' just shipped. Wait for the player to acknowledge
    // before starting the mission proper.
    if (m.alert) {
      await showMissionAlert(m.alert);
    }

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

    // Show the RESTART button only for missions that support rebase.
    const $restart = document.getElementById("btn-restart");
    if ($restart) $restart.hidden = !m.rebase;

    // DLL tab + template — only visible for missions that opt in.
    const $tabDll = document.getElementById("tab-dll");
    const $dllCode = document.getElementById("dll-code");
    if ($tabDll) $tabDll.hidden = !m.dll;
    const $exportBtn = document.getElementById("btn-dll-export");
    if ($exportBtn) $exportBtn.hidden = !m.cppExport;
    if (m.dll && $dllCode) {
      // M25 AUTO-INJECT: prefer the player's last-compiled source
      // (persisted on every successful compile). Falls back to the
      // mission's template if nothing's saved.
      const savedSource = dllRuntime.getSavedSource();
      const source = (m.autoInject && savedSource) ? savedSource : m.dllTemplate;
      if (source) $dllCode.value = source;
      const $status = document.getElementById("dll-status");
      if ($status) { $status.textContent = "not compiled"; $status.className = "dll-status"; }
      dllRuntime.clearConsole();

      // Auto-compile + auto-inject for missions that opt in. Mirrors
      // the DLL hijacking pattern: your code is already loaded before
      // the game logic gets a chance to run.
      if (m.autoInject && source) {
        const result = dllRuntime.compile(source);
        if (result.ok) {
          dllRuntime.inject();
          if ($status) { $status.textContent = "auto-injected — running"; $status.className = "dll-status running"; }
        } else if ($status) {
          $status.textContent = "auto-inject failed: " + result.error;
          $status.className = "dll-status error";
        }
      }
    }

    // Cheat menu button — only visible for missions that opt in.
    const $cheatBtn = document.getElementById("btn-cheat-menu");
    if ($cheatBtn) $cheatBtn.hidden = !m.cheatMenu;

    if (m.watchdog) {
      showViolationBar();
      target.enableWatchdog();
      // Poll the target's watchdog state and mirror it into the bar /
      // fail the mission when violations top out.
      activeWatchdogIv = setInterval(() => {
        const v = target.watchdog.violations;
        updateViolationBar(v);
        if (v >= 100) {
          failMission("memory integrity violation · session terminated");
          clearInterval(activeWatchdogIv);
          activeWatchdogIv = null;
        }
      }, 200);
    }

    if (Array.isArray(m.hints) && m.hints.length) {
      const guided = !missionState.isComplete(id);
      activeHints = new HintEngine({
        rules: m.hints,
        dialog,
        ctxFactory: (elapsed) => buildHintCtx(elapsed),
        guided,
      });
      activeHints.start();
      // Visual badge so the player knows they're in a guided first-run.
      document.body.classList.toggle("guided", guided);
    } else {
      document.body.classList.remove("guided");
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
        if (activeHints) { activeHints.stop(); activeHints = null; }
        if (activeWatchdogIv) { clearInterval(activeWatchdogIv); activeWatchdogIv = null; }
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

  document.getElementById("btn-tutorial").addEventListener("click", (e) => {
    e.stopPropagation();
    audio.tap();
    tutorial.show();
  });

  document.getElementById("btn-library").addEventListener("click", (e) => {
    e.stopPropagation();
    audio.tap();
    rain.stop();
    setMode("library");
    showLibrary();
    library.renderList();
  });
  document.getElementById("btn-library-back").addEventListener("click", (e) => {
    e.stopPropagation();
    audio.tap();
    if (library.isArticleOpen()) {
      library.backToList();
    } else {
      setMode("hub");
      showHub();
      rain.start();
    }
  });

  // Last-resort recovery if a stale service worker cache pinned an old
  // build: nuke every Cache Storage entry, unregister the SW, reload.
  document.getElementById("btn-force-update").addEventListener("click", async (e) => {
    e.stopPropagation();
    audio.tap();
    showToast("clearing caches · reloading", 1800);
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}
    setTimeout(() => location.reload(), 600);
  });

  document.getElementById("btn-fire").addEventListener("click", (e) => {
    e.stopPropagation();
    target.fire();
  });

  document.getElementById("btn-pause").addEventListener("click", (e) => {
    e.stopPropagation();
    target.togglePause();
    document.getElementById("paused-overlay").hidden = !target.paused;
    if (activeTimer) {
      if (target.paused) activeTimer.pause(); else activeTimer.resume();
    }
    if (audio) audio.tap();
  });

  document.getElementById("btn-restart").addEventListener("click", (e) => {
    e.stopPropagation();
    audio.tap();
    target.triggerRebase();
    showToast("session restarted · entity array relocated", 2200);
  });

  setMode("hub");
  showHub();
  rain.start();
  document.querySelector("#dialog-bar .speaker").textContent = "HW";

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => {
        // Aggressively poll for new SW versions every 30s while the
        // app is open. When a new one finishes installing, ask the
        // active SW to skip waiting + reload so the user sees the
        // latest code without manually clearing caches.
        const triggerUpdate = () => reg.update().catch(() => {});
        setInterval(triggerUpdate, 30 * 1000);
        if (reg.waiting) reg.waiting.postMessage({ type: "skip-waiting" });
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              showToast("update available · reloading", 1800);
              setTimeout(() => location.reload(), 1500);
            }
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Old SW released control to a new one — refresh once to ensure
      // the page is using new modules.
    });
  }

  window.__hw = { target, scanner, dialog, missionState, launchMission, endMission, audio, memory, dll: dllRuntime };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
