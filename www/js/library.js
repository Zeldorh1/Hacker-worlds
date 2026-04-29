// Codex / Library — real-world reference material that bridges the
// in-game lessons to actual Cheat Engine, x64dbg, Frida, and friends.
//
// Articles are plain HTML strings stored inline. Add new ones by
// pushing to ARTICLES; each is { id, title, brief, body }.

const ARTICLES = [
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
