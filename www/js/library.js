// Codex / Library — real-world reference material that bridges the
// in-game lessons to actual Cheat Engine, x64dbg, Frida, and friends.
//
// Articles are plain HTML strings stored inline. Add new ones by
// pushing to ARTICLES; each is { id, title, brief, body }.

const ARTICLES = [
  {
    id: "death-state-desync",
    title: "Death-State Desync — Faking Liveness Faster Than the Server",
    brief: "When the server says you're dead but the client never quite agrees.",
    body: `
      <h2>The next layer past server authority</h2>
      <p>M18 taught the brute version: find the server's HP cell, freeze it.
      That works when the server-state cache is read-write from gameplay code.
      When it isn't (or when you can't find the cache cell), there's another
      angle:</p>

      <p><strong>The death state itself is usually client-side.</strong></p>

      <p>The server can tell you 'your HP is 0,' but turning that into 'you
      are dead' (lock inputs, play death animation, start respawn timer)
      happens on YOUR machine. There's a flag — call it
      <code>player.is_dead</code>, <code>player.alive</code>,
      <code>state.player.deathTimer</code>, whatever — that the client
      reads each frame to decide 'should I render the death screen and
      ignore inputs?' That flag lives in your memory.</p>

      <p>If you freeze it at 'alive,' the death state can be flipped on by
      the server-tick handler 60 times per second and it doesn't matter:
      your freeze re-applies on the next memory.tick (which runs faster
      than the server tick). The kill code runs, sets the flag, your code
      flips it back, the death animation never plays, the respawn timer
      never reaches zero.</p>

      <h2>Why this works</h2>
      <p>Three timing facts have to line up:</p>

      <ol>
        <li><strong>Memory.tick (your freeze) runs at frame rate</strong> —
            usually 60Hz or higher. Every frame your freeze re-writes the
            cell.</li>
        <li><strong>Server-state-apply runs at network tick rate</strong> —
            usually 30Hz, sometimes as low as 10Hz for non-critical state.</li>
        <li><strong>Game logic reads the death flag every frame</strong> —
            but only takes action (lock input, play animation) on the
            transition from alive to dead.</li>
      </ol>

      <p>If your freeze is faster than the server tick (it is — 60 &gt;
      30), and the game logic checks state-not-edge, then the brief
      window where the flag is 'dead' between server-tick and your
      memory.tick is too short for any visible effect. The death never
      lands.</p>

      <h2>The variations on the trick</h2>
      <ul>
        <li><strong>Freeze player.alive at 1.</strong> Most direct. M19
            simulates this exact case.</li>
        <li><strong>Freeze player.is_dead at 0.</strong> Same idea, opposite
            polarity. Some engines name the flag the other way.</li>
        <li><strong>Freeze player.respawnTimerMs at 0.</strong> Even if
            you're 'dead,' if the timer is at 0 the engine instantly
            respawns you back to alive. End result: you flicker between
            states 60 times/sec but functionally never die.</li>
        <li><strong>Freeze the kill function's branch register.</strong>
            Advanced — find the conditional jump in the kill code, NOP
            it out so the code never enters the death branch in the
            first place.</li>
        <li><strong>Intercept the death packet on the wire.</strong>
            Network-level — the server's 'you died' message has a known
            packet ID. Drop or rewrite it. Server eventually sends another
            after the kick threshold; chain them across all death packets.</li>
      </ul>

      <h2>Why games are vulnerable to this</h2>
      <p>Architecturally, dev teams keep the death-state machine client-side
      because it's tied tightly to rendering: animations, sound effects,
      camera transitions, UI. Pushing all of that to the server would mean
      the server knows about your camera FOV, your audio settings, your
      monitor refresh rate. Bad architecture.</p>

      <p>So the server says 'they're at 0 HP' and trusts the client to
      handle the consequences. Most players' clients do, and the dev's
      mental model holds. Cheaters' clients don't.</p>

      <p>The fix dev teams reach for is server-side <em>kick</em> when
      the client refuses to acknowledge the death — but kick logic is
      itself a state machine that can be defeated. Or they CRC-check
      the death-state code, but that's the M6 watchdog fight which
      you've already won.</p>

      <h2>How to recognise this opportunity in a real game</h2>
      <ul>
        <li>You die normally. HUD shows the death screen, respawn timer
            counts down, you respawn.</li>
        <li>Find the cells holding the respawn timer (it counts up or
            down — easy to scan-and-narrow).</li>
        <li>Adjacent to the timer there's almost always a 0/1 flag —
            that's <code>is_dead</code> / <code>alive</code>.</li>
        <li>Take damage to die. Watch which cell flipped from 1→0 (or
            0→1).</li>
        <li>Freeze it on the 'alive' side. Take damage. Death screen
            should never appear.</li>
      </ul>

      <h2>How M19 simulates this</h2>
      <p>The simulator now has <code>player.alive</code> bound at
      <code>player_base + 0x18</code> and <code>player.respawnTimerMs</code>
      at <code>+0x1C</code>. When the server's HP hits 0, the kill code
      sets alive=0 and respawnTimerMs=3000. The update loop counts the
      timer down each frame; when it hits 0, full respawn (deaths++,
      HP/server reset, position back to spawn).</p>

      <p>Freeze player.alive at 1 → kill code's <code>alive=0</code> write
      gets overwritten by your freeze on the next memory.tick →
      respawnTimerMs decrement branch never enters → no respawn → no
      death.</p>

      <p>Same trick, simulated. The technique transfers directly.</p>
    `,
  },
  {
    id: "server-authority",
    title: "When Memory Freezes Aren't Enough — Server-Side State",
    brief: "Why your local HP freeze does nothing in multiplayer, and what actually works.",
    body: `
      <h2>The lesson M15 hides and M18 surfaces</h2>
      <p>M15 GODMODE worked. You froze HP at 100, weathered the gauntlet,
      walked out clean. That works because <em>the simulator's HP cell IS
      the truth.</em> Single-player. Your machine, your memory, your call.</p>

      <p>In multiplayer, that's not how it works. The server holds the
      canonical state. Your client renders what the server tells it. If
      you freeze your local HP at 100 in Apex Legends:</p>

      <ul>
        <li>Your screen still shows 100 HP — the cell is frozen.</li>
        <li>The server still tracks 'real' HP behind the scenes.</li>
        <li>30Hz network ticks deliver server state updates to your client.</li>
        <li>Each update overwrites your local HP cell.</li>
        <li>Your freeze re-applies on the next frame (60Hz wins over 30Hz).</li>
        <li>Visually you're at 100 forever.</li>
        <li>But the server's authoritative HP still drops as you take damage.</li>
        <li>When server.HP &lt;= 0, server sends 'you died' message.</li>
        <li>Client respects it. You die / respawn.</li>
      </ul>

      <p>Local memory edits are <strong>cosmetic</strong> in the
      authoritative-server model. Welcome to multiplayer game hacking.</p>

      <h2>Why server authority exists</h2>
      <p>Trust. If clients held the truth, anyone could declare 'I have
      999 HP' or 'my opponent died.' Multiplayer would be unplayable in
      a week. So engines push the authoritative state to a machine the
      cheater can't reach: the dedicated server (or a peer, in
      peer-to-peer hosting).</p>

      <p>Common authoritative state in real games:</p>
      <ul>
        <li>HP, shield, ammo (almost always server-side in competitive games)</li>
        <li>Position (validated server-side; clients send inputs, server resolves)</li>
        <li>Hit registration (which bullets connected, in what order)</li>
        <li>Loot rolls (RNG happens server-side so clients can't peek)</li>
        <li>Currency / inventory (anti-dupe critical)</li>
      </ul>

      <h2>Things you CAN still hack client-side</h2>
      <p>Server-authoritative state isn't a death sentence for game hacking.
      Plenty of state is still trusted to the client because the alternative
      would cost too much bandwidth or latency:</p>
      <ul>
        <li><strong>Render flags</strong> — culling, fog, wallhacks. The
            server can't tell you stopped occluding enemies behind walls.
            (M13 ESP territory.)</li>
        <li><strong>Crosshair position / aim assist</strong> — where you're
            aiming is your input. Aimbots intercept input before it ships.</li>
        <li><strong>Animation skipping</strong> — reload animation, weapon
            switch. Local-only timing on most engines.</li>
        <li><strong>Recoil pattern compensation</strong> — where the bullets
            are visually drawn vs where the server thinks they went. M17
            stuff that works fine in multiplayer.</li>
        <li><strong>Movement prediction smoothing</strong> — how your
            character animates between server packets. Bunny-hop / strafe
            speed exploits live here.</li>
      </ul>

      <h2>Workarounds for server-authoritative state</h2>
      <p>Even for HP and similar 'untouchable' values, there are workarounds:</p>

      <h3>1. Find and freeze the local cache of the server's state</h3>
      <p>The server's value has to be stored locally somewhere — your client
      reads it every frame to render the HP bar. If you can find that
      cached cell (M18 territory) and freeze it, the cached value never
      drops, the 'is_dead' check never trips. <em>This is what M18
      simulates.</em> Real-world: works on poorly-coded games where the
      server-state cache is read-write from gameplay code.</p>

      <h3>2. Network-level packet filtering</h3>
      <p>Drop or modify incoming server packets that contain HP updates.
      Tools like Wireshark + a proxy can rewrite the bytes mid-flight.
      Risk: server expects acks; if you drop too many, server might
      kick you. Latency spikes give you away.</p>

      <h3>3. Prediction exploitation</h3>
      <p>Most modern engines do client-side prediction — your client
      computes where you'll be / what HP you'll have, server reconciles.
      Some engines never check certain fields server-side because
      'the prediction is good enough.' Find one of those and you've
      got a real exploit.</p>

      <h3>4. Hit-reg manipulation</h3>
      <p>Don't try to survive damage. Try to make damage <em>not happen</em>.
      Move clientside out of the line of fire faster than the server
      can validate, or register your shots with manipulated origin /
      direction so server-side hit detection lands them where you want.</p>

      <h3>5. Memory injection that fakes the server</h3>
      <p>For peer-to-peer games (or self-hosted servers): inject code
      that intercepts the server-state-apply function and skips the
      writes you don't want. This is closer to internal cheats / DLL
      injection territory.</p>

      <h2>How to recognise server-side state</h2>
      <ul>
        <li><strong>HP freeze 'works' but you still die.</strong> Classic
            sign — your local HP shows 100, but the death animation plays.
            The check that triggered death used a different cell.</li>
        <li><strong>Two HP values in memory.</strong> Browse the player
            struct, see one HP-shaped value at +0x00 and another similar
            value 200 bytes away. The far one might be the cached server
            state.</li>
        <li><strong>Cell updates on a slow tick (5-30Hz).</strong> If a
            value updates exactly every ~33ms or ~16ms, it's likely
            getting written by a network packet handler. Local cells
            usually update every frame (60Hz+) or never.</li>
        <li><strong>Cell value matches what the HUD shows but doesn't
            respond to your local damage events.</strong> If you walked
            into a hazard and your local HP dropped to 92 but cell X
            still says 100 for half a second, X is the local cache and
            something else is being read.</li>
      </ul>

      <h2>How M18 simulates this</h2>
      <p>The simulator's <code>server.canonicalHp</code> cell is bound at
      a random address (NOT inside the player struct — server state
      conceptually lives 'over there'). Bleed and hazards push damage
      events to <code>server.pendingDamage</code> regardless of your
      <code>player.hp</code> freeze. Every 1.5s a server tick fires:</p>

      <pre><code>server.canonicalHp -= server.pendingDamage
server.pendingDamage = 0
if server.canonicalHp &lt;= 0:
  player.hp = 100      // forced respawn
  deaths++
  server.canonicalHp = 100</code></pre>

      <p>Freezing <code>player.hp</code> doesn't touch this loop. Freezing
      <code>server.canonicalHp</code> stops the math at the first line
      (frozen value re-applies before the if-check). One freeze on the
      <em>right</em> cell beats ten on the wrong one.</p>

      <p>That's the entire shape of server-authoritative cheating. Find
      the cell the server-side check actually reads, and you win.</p>
    `,
  },
  {
    id: "multi-level-chains",
    title: "Multi-level Pointer Chains — Sub-structs and How To Walk Them",
    brief: "Real game stats live 2-4 pointers deep. Recoil, weapon stats, current target, animation state — they're all 'over there.'",
    body: `
      <h2>Why one struct isn't enough</h2>
      <p>M16 STRUCT DISCOVERY taught you to find HP and walk the player
      struct's adjacent fields. That's the entry-level technique. The next
      step up is when stats <em>aren't</em> in the player struct — they're
      in a separate struct, and the player struct just holds a pointer to it.</p>

      <p>Real game class layout looks something like:</p>
      <pre><code>class Player {
  int   hp;                  // +0x00
  int   ammo;                // +0x04
  Vec3  position;            // +0x08 (12 bytes)
  Weapon* currentWeapon;     // +0x14  ← pointer
  Inventory* inventory;      // +0x1C  ← pointer
  StatusEffects* effects;    // +0x24  ← pointer
  ...
};

class Weapon {
  int   damage;              // +0x00
  float fireRate;            // +0x04
  float recoilPerShot;       // +0x08
  int   magazineSize;        // +0x0C
  ...
};</code></pre>

      <p>If you scan for the recoil value, you won't find it next to HP.
      It's in the Weapon struct, which is allocated separately. To get
      there, you have to <em>follow</em> the pointer.</p>

      <h2>How to recognise a pointer in a hex dump</h2>
      <p>When you Browse Memory and see fields like:</p>
      <pre><code>+0x00  100              ← HP
+0x04  30               ← ammo
+0x08  5
+0x0C  5                ← position (x, y)
+0x10  110              ← move cooldown
+0x14  140737488355328  ← ?!
+0x18  &lt;random&gt;</code></pre>

      <p>That huge number at +0x14 isn't a stat — no game has 140 trillion
      of anything. It's an <strong>address</strong>. Specifically, the address
      of another struct in memory. Type that number into BROWSE MEMORY's
      target field and Browse it to see what's there.</p>

      <p>Heuristic: any value &gt; ~10⁹ that doesn't match a HUD readout
      is almost certainly a pointer. In real CE you'd toggle "Hex" view on
      the address column and see canonical pointer-shaped hex
      (<code>00007FF6...</code> on Windows x64).</p>

      <h2>Building a multi-level chain in CE</h2>
      <p>Once you know the path, you tell Cheat Engine "the value I care
      about lives at <code>[player_base + 0x14] + 0x08</code>." That's a
      2-level chain. CE resolves it every frame:</p>

      <ol>
        <li>Read 8 bytes at <code>player_base + 0x14</code>. That's the
            weapon pointer value.</li>
        <li>Add <code>0x08</code> to it. That's the address of the recoil
            cell.</li>
        <li>Read 4 bytes there. That's the recoil value.</li>
      </ol>

      <p>Right-click an address in CE → <em>Add Address Manually</em> → tick
      <em>Pointer</em> → enter base, tick <em>Pointer</em> again for each
      level, fill in offsets. The chain survives weapon swaps, level
      reloads, anything where the weapon pointer changes — because every
      frame you're reading the <em>current</em> pointer value.</p>

      <h2>Levels you'll see in real games</h2>
      <table style="width:100%; border-collapse:collapse; margin: 0.5rem 0;">
        <tr><th style="text-align:left; padding:0.3em 0;">Stat</th><th style="text-align:left; padding:0.3em 0;">Typical depth</th></tr>
        <tr><td>HP, ammo, score</td><td>0 — directly in player struct</td></tr>
        <tr><td>Position, rotation</td><td>0 or 1 — sometimes embedded, sometimes Vec3*</td></tr>
        <tr><td>Weapon damage, recoil, fire rate</td><td>1 — Weapon* in player struct</td></tr>
        <tr><td>Inventory item count</td><td>2 — Player → Inventory* → Item array → count</td></tr>
        <tr><td>Current target's HP</td><td>2-3 — Player → Camera → AimedAt* → HP</td></tr>
        <tr><td>Animation skeleton bone position</td><td>3-4 — Player → Mesh* → Skeleton* → Bone[i]</td></tr>
      </table>

      <h2>The simulator's M17 layout</h2>
      <p>For RECOIL CONTROL the simulator gives you exactly the shape from
      the table above:</p>
      <ul>
        <li><code>player_base + 0x14</code> = weapon pointer (a 12-hex-digit
            address that looks too big to be a stat)</li>
        <li><code>[player_base + 0x14] + 0x00</code> = damage (you know it's 25)</li>
        <li><code>[player_base + 0x14] + 0x04</code> = cooldownMs (320)</li>
        <li><code>[player_base + 0x14] + 0x08</code> = recoilPerShot ← target</li>
      </ul>

      <p>Two known values (damage, cooldown) flank the unknown one. That's
      the actual gift commercial trainer devs get — adjacent fields you
      already understand <em>tell you</em> you're in the right struct, so
      the unfamiliar value next to them must be the stat you came for.</p>

      <h2>Common gotchas</h2>
      <ul>
        <li><strong>Pointer encryption.</strong> Some engines XOR pointers
            with a per-process key before storing them. The +0x14 cell will
            look like noise (random-shaped int) until decoded. Defeated by
            finding the decode routine in the binary.</li>
        <li><strong>NULL during transitions.</strong> Weapon pointer is 0
            for a frame while the player swaps. CE chains read NULL → "??"
            → no value. Mostly cosmetic; freezes still apply once the
            pointer is non-NULL again.</li>
        <li><strong>Smart pointers / handles.</strong> Some games use
            <code>shared_ptr</code> or 32-bit handles into a table.
            +0x14 might hold an 8-byte struct (control block + ptr) or a
            small handle that has to be looked up. One more level of
            indirection, same workflow.</li>
      </ul>

      <p>Once you're comfortable with 2-level chains, every additional level
      is just "browse, recognise pointer, browse again." There's no
      qualitatively new technique. The ceiling is your patience for clicking
      Browse a few times.</p>
    `,
  },
  {
    id: "struct-discovery",
    title: "How Trainers Actually Work — Player Struct Discovery",
    brief: "Find one stat, walk the bytes, map the whole struct. The technique behind every game trainer ever shipped.",
    body: `
      <h2>The lesson the early missions hide</h2>
      <p>M01 through M15 had you find each stat separately. HP one mission,
      ammo another, speed in a third. That's a fine way to <em>learn</em> the
      scan workflow, but it's not how anyone who ships a real trainer
      actually works.</p>

      <p>Here's how a trainer dev finds 30 player stats in a couple of hours
      from a fresh game install:</p>

      <h2>The struct insight</h2>
      <p>Every per-player value lives in <strong>one struct</strong>, allocated
      once when the level loads. Memory layout looks something like:</p>
      <pre><code>struct Player {
  int   hp;             // +0x00
  int   maxHp;          // +0x04
  int   shield;         // +0x08
  int   ammo;           // +0x0C
  int   maxAmmo;        // +0x10
  float x, y, z;        // +0x14, +0x18, +0x1C
  float yaw, pitch;     // +0x20, +0x24
  int   weaponId;       // +0x28
  int   killCount;      // +0x2C
  int   deaths;         // +0x30
  ...
};</code></pre>

      <p>Find <em>any one of these</em> via a scan, and you've located the
      struct in memory. Every other field is right there — at base+offset.</p>

      <h2>The full real-world workflow</h2>
      <ol>
        <li><strong>Find one easy field.</strong> HP usually. It's on the HUD,
            it changes when you take damage, scan-narrow-watch it in 30 seconds.</li>
        <li><strong>Browse the surrounding memory.</strong> In Cheat Engine:
            right-click address → <em>Browse this memory region</em>. In x64dbg:
            <em>Dump → Follow in dump</em>. Either way you see a hex dump
            starting at your HP cell.</li>
        <li><strong>Identify fields by their values.</strong> You know what to
            look for. 100? Probably maxHp. A small int that matches your ammo
            counter? Yep. Two consecutive floats that match your in-game
            position? x and y. The values give the structure away.</li>
        <li><strong>Build a static map.</strong> Write down (or save to your
            CT file) every offset you can identify: <code>[base]+0x00 = hp</code>,
            <code>[base]+0x0C = ammo</code>, etc.</li>
        <li><strong>Find the static pointer to base.</strong> That's the M8
            POINTER SCAN lesson. Once you have <code>game.exe + 0x???</code>
            pointing to the player struct, every offset you mapped becomes
            a permanent trainer entry that survives restarts.</li>
      </ol>

      <h2>Why this is so much faster than 30 separate scans</h2>
      <p>Each individual scan-narrow takes 30s-2m of gameplay. 30 stats × 1m
      average = 30 minutes if everything goes smoothly. Add re-scans when a
      cell turns out to be wrong, and you're at 2 hours.</p>

      <p>Struct discovery: 1 scan (HP) + 5 minutes browsing + offset math.
      Total: 7-10 minutes for the same 30 stats. The rest of your session
      is spent on the <em>second</em> level of indirection — finding the
      static pointer chain so the trainer survives restarts.</p>

      <h2>How to recognise field types in a dump</h2>
      <table style="width:100%; border-collapse:collapse; margin: 0.5rem 0;">
        <tr>
          <th style="text-align:left; padding:0.3em 0;">What you see</th>
          <th style="text-align:left; padding:0.3em 0;">Likely field</th>
        </tr>
        <tr><td>0 or 1</td><td>boolean (alive, ads, sprinting)</td></tr>
        <tr><td>0..100, smooth changes</td><td>HP, shield, stamina (often int or normalized float)</td></tr>
        <tr><td>0..maxAmmo</td><td>ammo or magazine</td></tr>
        <tr><td>Pair of floats matching POS</td><td>x, y (or x, z depending on engine)</td></tr>
        <tr><td>Float in [-π..π]</td><td>yaw / pitch / roll</td></tr>
        <tr><td>Small positive int that increments slowly</td><td>kill count, level</td></tr>
        <tr><td>Pointer-shaped value (looks like an address)</td><td>linked struct (current weapon, current target)</td></tr>
      </table>

      <h2>Common gotchas</h2>
      <ul>
        <li><strong>Multiple instances.</strong> If the game allocates a
            struct per entity, you might be browsing an enemy struct, not
            yours. Anchor on a unique-to-you field (your name as a string,
            or HP if you're the only entity at exactly that value).</li>
        <li><strong>Embedded structs.</strong> Position might be a
            <code>struct Vec3</code> embedded inline, so x/y/z are actually
            <code>+0x14, +0x18, +0x1C</code>. Read the offsets as triplets
            of floats and they pop out.</li>
        <li><strong>Padding.</strong> Compilers align fields to 4 or 8 bytes.
            You might see "junk" 4-byte holes between fields. Skip them, the
            next field is usually at the next aligned offset.</li>
      </ul>

      <h2>How M16 maps to this</h2>
      <p>M16 STRUCT DISCOVERY puts your in-game player stats in a contiguous
      simulator struct. You find HP via standard scan, browse with the new
      BROWSE MEMORY tool, recognise sibling fields by their values (30 = ammo,
      5 = your HUD POS, etc.), and watch the whole struct. The kicker:
      <code>moveCooldownMs</code> — the M12 stat we said wasn't on the HUD —
      is sitting right at +0x10. You don't have to do M12's full
      Unknown-Initial-Value workflow ever again now that you can read the
      struct directly.</p>

      <p>That's the unlock: <strong>once you know how to find a struct,
      hidden stats stop being hidden.</strong></p>
    `,
  },
  {
    id: "unknown-initial-value",
    title: "When You Don't Know the Number",
    brief: "The Unknown Initial Value workflow — for stats the game refuses to show you.",
    body: `
      <h2>The realistic case</h2>
      <p>Most game stats <em>aren't</em> on the HUD. Health, ammo, score —
      sure, those are visible. But move speed, recoil decay, jump height,
      bullet velocity, hitbox size, gravity, tick rate, animation speed?
      The game holds those values somewhere in memory, reads them every
      frame, and never tells you the number.</p>

      <p>You can't scan for "320" if you don't know the cooldown is 320ms.
      So how does anyone find these cells?</p>

      <h2>Unknown Initial Value</h2>
      <p>Cheat Engine has a scan type called <strong>Unknown Initial Value</strong>.
      In this app it's the second option in the Scan dropdown. When you First
      Scan with it, CE doesn't filter — it snapshots <em>every cell</em> in
      the scanned region (millions of cells in a real process). Each cell's
      current value is recorded.</p>

      <p>That snapshot is your starting point. From there, every Next Scan
      uses one of these comparisons against the snapshot:</p>

      <ul>
        <li><strong>Unchanged</strong> — value still equals the snapshot.</li>
        <li><strong>Changed</strong> — value differs from the snapshot.</li>
        <li><strong>Increased</strong> — value is now greater than the snapshot.</li>
        <li><strong>Decreased</strong> — value is now less.</li>
        <li><strong>Increased by N</strong> / <strong>Decreased by N</strong> —
            value is now snapshot ± a specific delta.</li>
      </ul>

      <p>You drive narrowing by <em>causing the cell to change in a known way.</em>
      The game's logic does the rest.</p>

      <h2>Three workflows by stat type</h2>

      <h3>Stable stat (M12 / M14 — speed, fire-rate)</h3>
      <p>The cell's value stays put while you walk around. Noise cells around
      it drift constantly. Scan unknown → wait → filter <em>unchanged</em>. Each
      pass strips a few thousand drifters. After 3-4 cycles you're down to a
      short list of stable cells; trial-and-error edit until you find the
      one that changes the game's behavior.</p>

      <h3>Monotonic stat (HP-on-bleed, score)</h3>
      <p>The cell only ever decreases (HP draining) or only increases (kill
      score). Scan unknown → wait → filter <em>decreased</em>. Cells that
      randomly fluctuated up at any point are dropped instantly.</p>

      <h3>Two-state stat (toggles, render flags)</h3>
      <p>Boolean-ish cells flip between exactly two values (often 0 and 1).
      Scan for 0, narrow with <em>unchanged</em> while time passes; the cell
      stays 0 with the rest of the static zeros. Trial-and-error the survivors
      with edits to 1.</p>

      <h2>Why this is more powerful than direct scans</h2>
      <p>Direct scans require you to know <em>and trust</em> the displayed
      number. Unknown Initial Value lets you find a cell whose value is:</p>
      <ul>
        <li>Encoded (XOR, shifted, multiplied)</li>
        <li>A different type than you expected (game stores HP as float in [0,1])</li>
        <li>Quantized differently (1/3 of displayed, 2x stored)</li>
      </ul>

      <p>Because you never reference the actual number — only its <em>change
      behavior</em> — encoding doesn't matter.</p>

      <h2>Common gotchas</h2>
      <ul>
        <li><strong>Filter too aggressively too early.</strong> If your first
            'unchanged' filter comes too soon, noise cells haven't drifted yet
            and they'll be retained. Wait at least 2-3 seconds between
            unchanged passes for the random-drift cells to differ.</li>
        <li><strong>Pause the game before scanning.</strong> If the cell you
            want is changing right when you scan, your filter might exclude
            it. Pause, scan, unpause, repeat.</li>
        <li><strong>Trust the trial-and-error.</strong> The final list is
            usually 3-10 candidates. Editing each is faster than another
            filter pass — and the visible feedback (game changes) tells you
            instantly which is right.</li>
      </ul>

      <p>Once you internalise this, you'll find yourself reaching for
      Unknown Initial Value <em>first</em> on most scans, even when the
      number is on screen. It's the more general tool.</p>
    `,
  },
  {
    id: "render-flags",
    title: "Wallhacks Are Just Boolean Flips",
    brief: "Why visual cheats are usually the easiest hack you'll ever write.",
    body: `
      <h2>The render config struct</h2>
      <p>Every game engine has a render config — a struct of bools, ints, and
      floats that the renderer reads each frame to decide what to draw. Things
      like:</p>
      <pre><code>struct RenderConfig {
  bool  draw_player_outline;   // ESP toggle
  bool  draw_enemy_hp_bar;
  bool  draw_minimap;
  bool  cull_behind_walls;     // turn this off → wallhack
  float fov_multiplier;        // freeze high → fov hack
  int   chams_color;
};</code></pre>

      <p>These flags exist because dev builds need them. Programmers turn them
      on while debugging, then ship the binary with them off. The values are
      still in memory — a 0 where a 1 would change the picture.</p>

      <h2>Why this is the easiest external hack to ship</h2>
      <p>You don't have to find anything that <em>moves.</em> Render flags are
      typically static across a game session: ESP-off is 0 from launch to exit.
      That kills the usual "scan/walk/scan" workflow… because nothing changes.</p>

      <p>The trick — which M13 makes you live through — is the inverse:</p>
      <ol>
        <li><strong>Scan for 0</strong> (or use Unknown Initial Value).</li>
        <li><strong>Filter "unchanged"</strong> repeatedly while time passes. Noise
            cells drift; static cells don't. After a few passes you have a
            short list of stable zeros.</li>
        <li><strong>Trial and error.</strong> Edit each candidate to 1, watch the
            screen. The right one paints ESP / removes culling / lights up
            health bars. Wrong ones do nothing.</li>
      </ol>

      <p>Real CE workflow's identical. Right-click an address, "Change value,"
      see what changed.</p>

      <h2>Common render flags worth checking in real games</h2>
      <ul>
        <li><strong>Wireframe mode</strong> — leftover dev flag in many engines.
            Set <code>r_drawmodels</code> or <code>cull_disable</code> to 1
            and the world goes see-through.</li>
        <li><strong>HUD elements</strong> — show enemy team, hide team, force
            radar. Each is usually a separate bool.</li>
        <li><strong>FOV multiplier</strong> — float, often 1.0. Bump to 1.5 and
            you get peripheral vision the engine assumes you don't have.</li>
        <li><strong>Lighting / fog</strong> — fog density, ambient light. Float
            to 0 and night maps become daylight.</li>
      </ul>

      <h2>Defenses you'll see</h2>
      <ul>
        <li><strong>Server-side rendering decisions</strong> — competitive games
            cull enemies on the server before sending packets. No render flag
            you can flip will reveal them; the data isn't in your client. The
            network track (M27+) covers what to do here.</li>
        <li><strong>Render config in read-only memory</strong> — some engines
            map the config page <code>VirtualProtect</code>'d to PAGE_READONLY.
            CE can still write through it (it uses <code>WriteProcessMemory</code>),
            but trainer code that does direct pointer writes will fault. Switch
            to a CE auto-assembler script.</li>
        <li><strong>Periodic CRC of render config</strong> — same shape as M6
            watchdog. Defeated the same way: find the watchdog cell, freeze the
            tick, render flips stay applied.</li>
      </ul>

      <h2>How M13 maps to real ESP / wallhack devs</h2>
      <p>The mission gives you one boolean (<code>render.espVisible</code>) and
      asks you to find it. A real "ESP" cheat finds <em>several</em> bools and
      makes them all true:
      <code>show_enemies, show_their_hp, show_their_weapons, show_through_walls.</code>
      Same scan, repeated. Same trial-and-error. Same payoff.</p>

      <p>This is why visual cheat creators were the first internet game-hacking
      community: lowest barrier to entry, biggest visible payoff.</p>
    `,
  },
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
