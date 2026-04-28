// Brief Hacknet-style boot terminal that types out a few status lines on
// every launch. Tap anywhere to skip.

const LINES = [
  { text: "anomaly-labs::client > establishing tunnel...", delay: 12, pause: 220 },
  { text: "[ ok ] tor-circuit acquired",                  delay: 6,  pause: 180 },
  { text: "[ ok ] decrypting contract feed",              delay: 6,  pause: 180 },
  { text: "[ ok ] handshake with vex@anomaly",            delay: 6,  pause: 240 },
  { text: "vex.online()",                                  delay: 14, pause: 320, accent: true },
];

export function runBoot({ onSkip, audio } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("boot-overlay");
    const log = document.getElementById("boot-log");
    if (!overlay || !log) { resolve(); return; }

    let aborted = false;
    log.innerHTML = "";

    function finish() {
      if (overlay.classList.contains("hidden")) return;
      overlay.classList.add("hidden");
      setTimeout(() => { overlay.style.display = "none"; resolve(); }, 320);
    }

    function skip() {
      aborted = true;
      // Render any remaining lines instantly so the user sees what they skipped.
      for (let j = 0; j < LINES.length; j++) {
        if (log.children[j]) continue;
        const div = document.createElement("div");
        div.className = "boot-line" + (LINES[j].accent ? " accent" : "");
        div.textContent = LINES[j].text;
        log.appendChild(div);
      }
      if (onSkip) onSkip();
      setTimeout(finish, 220);
    }

    overlay.addEventListener("click", skip, { once: true });

    (async () => {
      for (const line of LINES) {
        if (aborted) break;
        const div = document.createElement("div");
        div.className = "boot-line" + (line.accent ? " accent" : "");
        log.appendChild(div);
        for (let i = 0; i < line.text.length; i++) {
          if (aborted) break;
          div.textContent = line.text.slice(0, i + 1);
          if (audio) audio.boot();
          await sleep(line.delay);
        }
        if (aborted) break;
        await sleep(line.pause);
      }
      if (!aborted) finish();
    })();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
