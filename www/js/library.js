// Codex / Library — real-world reference material that bridges the
// in-game lessons to actual Cheat Engine, x64dbg, Frida, and friends.
//
// Articles are plain HTML strings stored inline. Add new ones by
// pushing to ARTICLES; each is { id, title, brief, body }.

const ARTICLES = [
  {
    id: "stat-cells",
    title: "Stats, Resources, and the Boring Truth of Game Hacks",
    brief: "Ammo, damage, speed, gold, mana — the same int-in-a-struct trick, dressed up.",
    body: `
      <h2>The unifying lesson</h2>
      <p>You've now done <strong>M10 INFINITE AMMO</strong>, <strong>M11 SUPER BULLETS</strong>,
      and <strong>M12 SPEED HACK</strong>. They all looked different — different counters
      on the HUD, different feedback, different mission text — but the workflow was
      identical:</p>

      <ol>
        <li>Note the current value on the HUD.</li>
        <li>First Scan that value.</li>
        <li>Cause the value to change OR stay still, and Next Scan with the right filter.</li>
        <li>Watch the survivor. Edit. Freeze.</li>
      </ol>

      <p>That's because under the hood they <em>are</em> identical: a four-byte int
      in the player or weapon struct. Naming it "ammo" or "damage" or
      "moveCooldownMs" is a developer convenience; the CPU sees a 32-bit slot.</p>

      <h2>Why scan-narrow-freeze keeps working</h2>
      <p>Every commercial game has a "player struct" or "entity struct" laid out
      in memory like:</p>
      <pre><code>struct Player {
  int   health;     // +0x00
  int   shield;     // +0x04
  int   ammo;       // +0x08
  int   maxAmmo;    // +0x0C
  float moveSpeed;  // +0x10
  float jumpHeight; // +0x14
  ...
};</code></pre>

      <p>Your hack reaches into this struct and rewrites a single field. The
      game's logic — <code>if (ammo &gt; 0) { ammo--; spawn_bullet(); }</code> —
      reads your modified value on the next frame. The dev never wrote a check
      that says "did the user just edit ammo from outside?" because that check
      doesn't fit anywhere in the inner loop.</p>

      <h2>Mapping in-app to Cheat Engine</h2>
      <table style="width:100%; border-collapse:collapse; margin: 0.5rem 0;">
        <tr><th style="text-align:left; padding:0.3em 0;">In Hacker Worlds</th><th style="text-align:left; padding:0.3em 0;">Real Cheat Engine</th></tr>
        <tr><td style="padding:0.2em 0;"><code>SCANNER → First Scan</code></td><td style="padding:0.2em 0;">CE main window → First Scan</td></tr>
        <tr><td style="padding:0.2em 0;">filter <em>unchanged</em></td><td style="padding:0.2em 0;">Scan Type → "Unchanged value" + Next Scan</td></tr>
        <tr><td style="padding:0.2em 0;"><code>+ watch</code></td><td style="padding:0.2em 0;">Double-click to "Add to address list"</td></tr>
        <tr><td style="padding:0.2em 0;">value-edit input</td><td style="padding:0.2em 0;">Click the value column, type new</td></tr>
        <tr><td style="padding:0.2em 0;"><code>freeze</code> checkbox</td><td style="padding:0.2em 0;">"Active" checkbox in the address list</td></tr>
      </table>

      <h2>Where the difficulty actually lives</h2>
      <p>In a real game, ammo isn't always stored as the displayed number. You'll
      hit:</p>
      <ul>
        <li><strong>Multiplied/encoded values</strong> — ammo of 30 stored as
            <code>30 * 4</code>, or XOR'd with a per-session key. Scan for the
            displayed value, get nothing. Solution: scan unknown initial value,
            fire a shot, scan "decreased" — works regardless of encoding.</li>
        <li><strong>Floats instead of ints</strong> — speed and damage often live
            as floats. CE has a "Float" scan type; the technique is identical.
            In this app we keep everything int for simplicity.</li>
        <li><strong>Server-authoritative state</strong> — multiplayer games keep
            ammo on the server. You can edit your local copy all day; the server
            says "no, you have 30." Different bypass, covered in the network
            track later (M27+).</li>
        <li><strong>Anti-cheat watchdogs</strong> — some games CRC-check the
            player struct every frame and crash if it changes. M06 already
            taught you the shape of that fight.</li>
      </ul>

      <h2>Why this matters outside games</h2>
      <p>The pattern <em>"find a value, narrow with filters, write to it"</em>
      is the same one a reverse engineer uses on:</p>
      <ul>
        <li><strong>License checks</strong> — find the boolean that gates "is_paid",
            flip it. (Don't actually do this with real software — but understanding
            the mechanism is what lets you defend against it.)</li>
        <li><strong>Embedded firmware</strong> — finding a calibration constant
            in a stripped binary uses identical scan-and-narrow logic.</li>
        <li><strong>Memory forensics</strong> — DFIR analysts pull live memory
            and search for known values (process names, encryption keys) using
            tools that are essentially Cheat Engine for forensic images.</li>
      </ul>

      <p>The workflow you just internalised is reusable. The targets change.</p>
    `,
  },
  {
    id: "pointer-chains",
    title: "Pointer Chains in Real Games",
    brief: "Why your address dies on restart — and how to lock onto a target that survives.",
    body: `
      <h2>The problem you just hit</h2>
      <p>You scanned for an enemy's HP, narrowed it down, watched the cell, froze it.
      Five minutes later the dev relaunches their game and your watchlist's pointing
      at noise. <em>Same hack, different memory layout.</em></p>

      <p>This happens because almost every modern game stores its dynamic state
      (entities, inventory, projectiles) in heap-allocated structs. The OS gives
      the game a different chunk of memory each time it starts — sometimes thanks
      to ASLR, sometimes just because allocation order changes between runs. The
      address you found is correct <em>for that one session.</em></p>

      <h2>The fix: a chain that resolves through a static pointer</h2>
      <p>Somewhere in the game's executable image — typically in the data segment
      of the main module — there's a pointer that <em>always</em> holds the current
      base of the entity array. That pointer's <em>address</em> never moves between
      sessions, even though its <em>value</em> updates each time the game allocates
      a new array.</p>

      <p>If you can find that pointer, you can build a chain like:</p>
      <pre><code>game.exe + 0x14B240   →   *p   →   p + 0x18 = enemy.hp</code></pre>

      <p>Resolved each frame, that lands on the right HP cell <em>across restarts</em>.
      That's the difference between "I cheated once" and "I shipped a trainer."</p>

      <h2>How Cheat Engine does it</h2>
      <ol>
        <li><strong>Find the dynamic address</strong> the normal way (scan, narrow, freeze).</li>
        <li>Right-click the address &rarr; <em>Find out what accesses this address</em>.
            CE attaches a debugger and waits for the game to read or write the cell.
            You'll see something like <code>mov eax,[rdx+18]</code>. That instruction's
            base register (here <code>rdx</code>) holds the entity-struct pointer.</li>
        <li>Note the value of <code>rdx</code> at that breakpoint. <strong>Scan memory for that
            value as a hex address</strong> — you're looking for whoever stored that pointer.</li>
        <li>Repeat one or two more levels until you reach a region of memory that
            doesn't move between runs (an address inside a known static module like
            <code>game.exe + 0x???</code>).</li>
        <li>Right-click any cell &rarr; <em>Add Address Manually</em> &rarr; tick
            <em>Pointer</em>. Type the static base, then the offsets in the order
            you discovered them. CE resolves the chain on every frame.</li>
      </ol>

      <h2>Anatomy of a pointer chain</h2>
      <p>A chain is just a sequence of <code>read 4/8 bytes, add offset</code> ops.
      For a 4-level chain with base <code>B</code> and offsets <code>o₁ o₂ o₃ o₄</code>:</p>
      <pre><code>addr = read64(B)
addr = read64(addr + o₁)
addr = read64(addr + o₂)
addr = read64(addr + o₃)
result = read32(addr + o₄)</code></pre>

      <p>Each level dereferences another pointer. The terminal offset reads the
      actual value (HP, ammo, whatever). If you write to <code>addr + o₄</code>,
      you've patched it — that's how a freeze works.</p>

      <h2>Defenses you'll run into</h2>
      <ul>
        <li><strong>Pointer encryption (XOR/rotate):</strong> some engines XOR pointers
            with a per-process key before storing them. You'll see "scrambled" values
            that aren't valid addresses. Defeated by reading the decrypt routine.</li>
        <li><strong>Indirection through handles:</strong> instead of a raw pointer, the
            game stores a 32-bit handle and looks up the object in a table. Two-level
            indirection plus a bounds check. Same idea, more legwork.</li>
        <li><strong>Re-allocation on every action:</strong> some games allocate fresh
            structs constantly so even a pointer chain points to the wrong instance.
            Solved with <em>Find what writes</em> + a unique signature for the player
            object.</li>
      </ul>

      <h2>How this maps to the in-app lesson</h2>
      <p>In M8 <strong>POINTER SCAN</strong>, the simulator gives you a single static
      cell labelled <code>entity_arr_ptr</code>. Its value always equals the current
      entity-array base. Tap RESTART, the array moves, the static cell's value
      updates. Tap <em>Find Pointers</em> on a known enemy address; the static
      cell shows up as a one-level chain (<code>[entity_arr_ptr] + 0x04 = enemy[0].x</code>).
      Watch the chain, freeze it, restart — the freeze still lands on the right cell.</p>

      <p>Real games rarely give you a one-level chain. Two or three levels is
      typical. The technique scales identically; you just call <em>Find Pointers</em>
      on each intermediate result.</p>
    `,
  },
];

export class Library {
  constructor() {
    this.$listWrap = document.getElementById("library-list-wrap");
    this.$list     = document.getElementById("library-list");
    this.$article  = document.getElementById("library-article");
    this._open = false;
  }

  isArticleOpen() { return this._open; }

  renderList() {
    this._open = false;
    this.$listWrap.hidden = false;
    this.$article.hidden = true;
    this.$list.innerHTML = ARTICLES.map(a => `
      <li data-id="${a.id}">
        <div class="title">${a.title}</div>
        <div class="brief">${a.brief}</div>
      </li>`).join("");
    this.$list.querySelectorAll("li").forEach(li => {
      li.addEventListener("click", () => this.openArticle(li.dataset.id));
    });
  }

  openArticle(id) {
    const a = ARTICLES.find(x => x.id === id);
    if (!a) return;
    this._open = true;
    this.$listWrap.hidden = true;
    this.$article.hidden = false;
    this.$article.innerHTML = `
      <h2 style="margin-top:0">${a.title}</h2>
      ${a.body}
    `;
    this.$article.scrollTop = 0;
  }

  backToList() {
    this.renderList();
  }
}
