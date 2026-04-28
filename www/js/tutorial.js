// First-run orientation. Five slides explaining scan -> narrow -> watch
// -> freeze, then the trace timer and detection meter. Persists a "seen"
// flag in localStorage; can be replayed via the hub footer.

const KEY_SEEN = "hw.tutorial.seen.v1";

const SLIDES = [
  {
    title: "Welcome to Hacker Worlds.",
    body: [
      "Every game keeps your stats — HP, ammo, position — as plain numbers in RAM.",
      "Game hacking is finding those numbers and changing them. On a PC you'd use Cheat Engine; here you'll use a simulated version against simulated games. Same workflow, no risk.",
    ],
  },
  {
    title: "Step 1 — First Scan.",
    body: [
      "Note a value in the game's HUD (your X coord, your HP).",
      "Open the Scanner tab. Type that number, tap First Scan.",
      "You'll get a long list. Most of those addresses just happen to hold the same small number — they aren't yours.",
    ],
  },
  {
    title: "Step 2 — Narrow it down.",
    body: [
      "Make the value change in the game (walk, take damage, fire).",
      "Back in Scanner, type the new value and tap Next Scan. Or use 'decreased' / 'changed' filters if you don't know the new value.",
      "Most addresses didn't move with the game. They drop. Repeat until 1–2 remain.",
    ],
  },
  {
    title: "Step 3 — Watch & Freeze.",
    body: [
      "Tap '+ watch' on the survivor. In the Watchlist, tick 'freeze'.",
      "The value is now locked. The game keeps trying to write it; your scanner forces it back every frame.",
      "If the in-game value won't budge when it should — you nailed the right address.",
    ],
  },
  {
    title: "The stakes.",
    body: [
      "Every contract has a TRACE timer up top. Hit zero and you're caught.",
      "Some targets run an active sweep — DETECTION meter. They scan for known cheat tool names. Rename your tool BEFORE scanning, or it trips. M3 teaches this directly.",
      "Hit GO when you're ready. Mentor's name is VEX. Good luck, recruit.",
    ],
  },
];

export class Tutorial {
  constructor({ audio } = {}) {
    this.audio = audio || null;
    this.idx = 0;
    this.$root  = document.getElementById("tutorial-overlay");
    this.$tag   = document.getElementById("tutorial-tag");
    this.$slide = document.getElementById("tutorial-slide");
    this.$dots  = document.getElementById("tutorial-dots");
    this.$prev  = document.getElementById("btn-tutorial-prev");
    this.$next  = document.getElementById("btn-tutorial-next");
    this.$skip  = document.getElementById("btn-skip-tutorial");

    this.$prev.addEventListener("click", () => this._step(-1));
    this.$next.addEventListener("click", () => this._step(+1));
    this.$skip.addEventListener("click", () => this.close());

    this._resolve = null;
    this._open = false;
  }

  static hasSeen() {
    try { return localStorage.getItem(KEY_SEEN) === "1"; } catch { return false; }
  }
  static markSeen() {
    try { localStorage.setItem(KEY_SEEN, "1"); } catch {}
  }
  static reset() {
    try { localStorage.removeItem(KEY_SEEN); } catch {}
  }

  show() {
    this._open = true;
    this.idx = 0;
    this._render();
    this.$root.removeAttribute("hidden");
    return new Promise(r => { this._resolve = r; });
  }

  close() {
    if (!this._open) return;
    this._open = false;
    Tutorial.markSeen();
    this.$root.setAttribute("hidden", "");
    if (this.audio) this.audio.tap();
    if (this._resolve) { this._resolve(); this._resolve = null; }
  }

  _step(d) {
    const next = this.idx + d;
    if (next < 0) return;
    if (next >= SLIDES.length) { this.close(); return; }
    this.idx = next;
    this._render();
    if (this.audio) this.audio.tap();
  }

  _render() {
    const s = SLIDES[this.idx];
    this.$tag.textContent = `ORIENTATION · ${this.idx + 1} / ${SLIDES.length}`;
    this.$slide.innerHTML = `
      <div class="tutorial-title">${s.title}</div>
      <div class="tutorial-body">${s.body.map(p => `<p>${p}</p>`).join("")}</div>
    `;
    this.$dots.innerHTML = SLIDES.map((_, i) =>
      `<span class="tutorial-dot ${i === this.idx ? "active" : ""}"></span>`
    ).join("");
    this.$prev.disabled = this.idx === 0;
    this.$next.textContent = this.idx === SLIDES.length - 1 ? "got it" : "next";
  }
}
