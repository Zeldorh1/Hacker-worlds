// Codex / Library — real-world reference material that bridges the
// in-game lessons to actual Cheat Engine, x64dbg, Frida, and friends.
//
// Articles are plain HTML strings stored inline. Add new ones by
// pushing to ARTICLES; each is { id, title, brief, body }.

const ARTICLES = [
  {
    id: "code-patching",
    title: "Code Patching — When Freezing the Cell Isn't Enough",
    brief: "Right-click → Find what writes → Replace with code that does nothing. The big leap from data hacks to code hacks.",
    body: `
      <h2>Two completely different things to hack</h2>
      <p>Every cheat you've shipped through M21 has been a <strong>data
      hack</strong>: find a memory cell, write a different value to it,
      maybe freeze it. The cell gets re-written each frame by your code
      and by the game's code in a tug-of-war, and your faster writes win.</p>

      <p>M22 introduces <strong>code patching</strong>: instead of fighting
      the game over a value, you reach into the game's <em>instructions</em>
      and edit them directly. Replace the <code>sub eax, 5</code>
      (subtract 5 from HP) with three NOP bytes (<code>0x90 0x90 0x90</code>),
      and the CPU literally executes nothing where the damage used to be.
      The game's source code says it should subtract HP. The compiled
      machine code says it should do nothing. The CPU obeys the bytes.</p>

      <h2>Why this is qualitatively stronger</h2>
      <table style="width:100%; border-collapse:collapse; margin: 0.5rem 0;">
        <tr><th style="text-align:left; padding:0.3em 0;">Freeze</th><th style="text-align:left; padding:0.3em 0;">NOP</th></tr>
        <tr>
          <td style="padding:0.3em 0; vertical-align:top;">Game writes 95, you write 100. Repeat 60 times/sec.</td>
          <td style="padding:0.3em 0; vertical-align:top;">Game's write instruction is gone. Nothing to overwrite.</td>
        </tr>
        <tr>
          <td style="padding:0.3em 0; vertical-align:top;">CRC watchdog (M6) sees the cell is frozen → trips.</td>
          <td style="padding:0.3em 0; vertical-align:top;">Cell isn't frozen. Watchdog has nothing to detect.</td>
        </tr>
        <tr>
          <td style="padding:0.3em 0; vertical-align:top;">If the game stops reading the cell, your freeze stops mattering.</td>
          <td style="padding:0.3em 0; vertical-align:top;">If the game stops reading the cell, the NOP'd write also stops mattering — both go dormant.</td>
        </tr>
        <tr>
          <td style="padding:0.3em 0; vertical-align:top;">Lives in your trainer process or DLL.</td>
          <td style="padding:0.3em 0; vertical-align:top;">Lives in the GAME process — applied directly to the loaded module's bytes.</td>
        </tr>
      </table>

      <p>The watchdog point is the M22 lesson. Anti-cheat systems can
      easily detect 'this cell value never changes when it should' (cell
      freeze). They have a much harder time detecting 'this code path
      doesn't fire as often as expected' — that's a behavioral signal,
      not a memory signal.</p>

      <h2>How Cheat Engine does it</h2>
      <ol>
        <li><strong>Find the cell</strong> the normal way (scan, narrow,
            watch).</li>
        <li><strong>Right-click → "Find what writes to this address."</strong>
            CE attaches a debugger and sets a hardware breakpoint on
            the cell. Trigger the write (take damage, fire the gun,
            whatever).</li>
        <li>The debugger breaks. CE shows the instruction that
            performed the write, like:
            <pre><code>game.exe + 0x14B232:  29 50 00       sub [eax+0x00], edx</code></pre>
            That's the bleed-tick / damage-apply / whatever code, in
            assembly.</li>
        <li><strong>Right-click the instruction → "Replace with code that
            does nothing."</strong> CE writes <code>0x90 0x90 0x90</code> to
            those bytes. The instruction is now <code>nop nop nop</code>.
            Damage doesn't happen anymore.</li>
        <li>CE saves the patch as an AOB (array-of-bytes) script in the
            CT file so it auto-applies on game restart.</li>
      </ol>

      <h2>Where you'll use this in real games</h2>
      <ul>
        <li><strong>Damage skips</strong> — NOP the <code>sub hp, dmg</code>
            instruction. Most common use.</li>
        <li><strong>Ammo decrements</strong> — NOP the
            <code>dec [rcx+0x08]</code>. Infinite ammo without a freeze
            (which some games detect).</li>
        <li><strong>Cooldown timers</strong> — NOP the
            <code>add cooldown, frame_time</code>. Abilities never go
            on cooldown.</li>
        <li><strong>Server packet apply</strong> — NOP the call to
            <code>apply_server_state(packet)</code>. Local cells never
            get overwritten by server reconciliation. Combined with M18
            cell freezes, this is how some multiplayer godmodes survive.</li>
        <li><strong>Anti-cheat checks</strong> — find the
            <code>cmp eax, expected_crc / je good</code>, replace
            <code>je</code> with <code>jmp</code> so the check always
            passes regardless of whether bytes were tampered with.</li>
      </ul>

      <h2>Other "code patching" verbs</h2>
      <ul>
        <li><strong>NOP</strong> (today's lesson) — replace with do-nothing
            bytes. Skips a single instruction or a few.</li>
        <li><strong>JMP patch</strong> — replace a conditional jump with an
            unconditional one. Forces a branch that wasn't supposed to
            be taken.</li>
        <li><strong>RET patch</strong> — replace the first byte of a
            function with <code>0xC3</code> (ret). Function exits
            immediately, doing nothing. Useful for skipping entire
            handlers.</li>
        <li><strong>Code cave</strong> — find unused space in the binary,
            write your own assembly there, JMP from the original
            location into your code, JMP back when done. Lets you
            ADD logic, not just remove it.</li>
        <li><strong>Detour / hook</strong> — overwrite the function's
            prologue with a JMP into your DLL, where you do whatever
            you want before (optionally) jumping back to the original
            code. The Cheat Engine "Auto Assemble" tab generates these.</li>
      </ul>

      <h2>How the simulator models this</h2>
      <p>The game's "code" lives in <code>code-segment.js</code> as a
      registry of named instructions. Each one has a fake code address
      (<code>0x12AB34CD_C</code>), a list of memory addresses it writes
      to, and an <code>exec()</code> function. The bleed handler, hazard
      apply, and server reconciliation tick are all registered there.</p>

      <p>FIND WHAT WRITES queries the registry and returns instructions
      that have FIRED in the last 8 seconds and target the queried
      address. (Mirrors CE's behavior — if the write hasn't actually
      happened recently, the breakpoint never fires, you see nothing.)</p>

      <p>NOP flips a flag on the instruction. The instruction stays
      registered, still gets called every tick, still increments its
      'attempted' counter — but its <code>exec()</code> body doesn't
      run. From the game's perspective, the code is still there. From
      the player's perspective, it does nothing. From an anti-cheat
      watchdog's perspective: no frozen cell, no detection.</p>

      <h2>Defenses you'll see</h2>
      <ul>
        <li><strong>Code segment integrity check</strong> — anti-cheat
            CRC-checks the .text section. NOPs change the CRC. Defeated
            by ALSO NOPing or hooking the integrity check itself.</li>
        <li><strong>Self-modifying code</strong> — the game restores its
            own .text section every few seconds. Your NOP gets undone.
            Defeated by hooking the restore function or NOPing it.</li>
        <li><strong>Code obfuscation / virtualization</strong> (VMProtect,
            Themida) — the relevant code path is hidden inside an
            interpreter that's hard to read. Pure code patching
            stops being feasible; you fall back to data hacks or
            external tools.</li>
      </ul>

      <p>Code patching is the next step beyond data hacking. Once you
      can NOP arbitrary instructions, you stop fighting the game and
      start editing it.</p>
    `,
  },
  {
    id: "internal-vs-external",
    title: "Internal Cheats vs External — What a DLL Actually Does",
    brief: "Where DLL injection sits, why it's stronger than a scanner, and what it CAN'T do.",
    body: `
      <h2>The two architectures</h2>
      <p>Game cheats live in one of two places relative to the game's
      process:</p>

      <h3>External (what M01-M20 taught)</h3>
      <p>A separate program (Cheat Engine, an EXE you wrote) attaches
      to the game from outside. It uses Windows APIs like
      <code>OpenProcess</code>, <code>ReadProcessMemory</code>, and
      <code>WriteProcessMemory</code> to peek and poke at the game's
      memory across the process boundary.</p>

      <ul>
        <li><strong>Pros:</strong> easy to write, easy to update, can be
            run as a separate user account, can detach without affecting
            the game.</li>
        <li><strong>Cons:</strong> every read/write is a syscall (slow);
            anti-cheat sees an unknown process opening handles to the
            game and flags it; can't hook game functions directly.</li>
      </ul>

      <h3>Internal (DLL — what M21 starts teaching)</h3>
      <p>Your code is loaded INTO the game's process. Once injected, your
      cheat runs in the same address space as the game itself. Reads and
      writes are just <code>*ptr = value</code> — no syscall, no
      cross-process handle, microsecond latency.</p>

      <ul>
        <li><strong>Pros:</strong> orders of magnitude faster; can hook
            game functions (intercept network packets, modify render
            calls, replace allocator); can read encrypted state because
            it has access to the same crypto keys; harder to detect
            (lives inside an "approved" module).</li>
        <li><strong>Cons:</strong> harder to write (need C++ + Win32
            knowledge); needs to BE injected first (the injector itself
            is detectable); a crash in your DLL crashes the game.</li>
      </ul>

      <h2>What a real DLL looks like</h2>
      <p>Skeleton C++ for a Windows DLL — what M21 simulates:</p>

      <pre><code>// hp_lock.cpp — compiled to hp_lock.dll
#include &lt;windows.h&gt;

DWORD WINAPI cheat_thread(LPVOID) {
    while (true) {
        // Resolve player struct via known offsets each iteration
        // (handles relocations).
        uintptr_t game_base = (uintptr_t)GetModuleHandle("game.exe");
        uintptr_t player    = *(uintptr_t*)(game_base + 0x14B240);
        if (player) {
            *(int*)(player + 0x00) = 100;   // hp
        }
        Sleep(16);   // ~60Hz
    }
}

BOOL WINAPI DllMain(HINSTANCE, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        CreateThread(nullptr, 0, cheat_thread, nullptr, 0, nullptr);
    }
    return TRUE;
}</code></pre>

      <p>Compiled to <code>hp_lock.dll</code>, you'd then inject it with
      a loader (CreateRemoteThread + LoadLibraryA, manual mapping,
      hijacked module). Once loaded, <code>cheat_thread</code> runs on
      its own thread inside the game process and re-applies HP every
      ~16ms.</p>

      <p>That's exactly what M21's pseudo-code does — JS instead of C++,
      simulator instead of Windows, but the same architecture: a function
      called every tick that reads and writes memory.</p>

      <h2>What DLLs unlock that external cheats can't</h2>

      <h3>Function hooking</h3>
      <p>You can replace any game function with your own, calling the
      original when you want and skipping it when you don't.</p>
      <ul>
        <li>Hook <code>recv()</code> → drop "you died" packets before
            the game sees them. Server thinks you're dead, client
            never knows.</li>
        <li>Hook the rendering function → draw enemies even when the
            game culled them as occluded. Wallhack that the
            render-flag flip (M13) can't do.</li>
        <li>Hook <code>memcpy</code> → log every frame's
            transformations to the player struct. Reverse-engineering
            tool.</li>
      </ul>

      <h3>Pattern scanning</h3>
      <p>External cheats hardcode offsets per game version. Internal
      cheats can scan the loaded module's memory at startup looking
      for instruction byte patterns ("AOB scans") and resolve offsets
      automatically. Updates that move things around don't break your
      cheat.</p>

      <h3>Reading encrypted state</h3>
      <p>If the game encrypts critical state in memory (anti-cheat
      tactic), the decryption key is somewhere in the game's memory
      too. Your DLL has access; an external scanner sees garbage.</p>

      <h2>What DLLs still CAN'T do</h2>
      <p>Server-authoritative state from M18 still wins. A DLL that
      writes <code>player.hp = 100</code> sixty times a second has
      exactly the same effect on multiplayer as M18's external freeze
      on the local cell — the visible cell stays at 100 but the
      server's copy drains and you 'die' anyway.</p>

      <p>The DLL advantages on the multiplayer front:</p>
      <ul>
        <li>Hook <code>recv()</code> to drop server-state-update
            packets before they overwrite your local cell. (External
            cheats can't do this — they'd need a network proxy.)</li>
        <li>Hook the death-state-apply function to NOP out its
            kill-code path. (External cheats can only freeze the
            output cell; they can't stop the function from running.)</li>
        <li>Hook the encryption routine to capture the server's HP
            value before the client decrypts it for display. (External
            cheats only see what the game has already decrypted into
            visible cells.)</li>
      </ul>

      <p>Future M2X missions will teach each of these. M21 is the
      starting point: the workflow of writing → compiling → injecting
      a piece of code that runs inside the process.</p>

      <h2>Injection mechanisms in real life</h2>
      <ul>
        <li><strong>CreateRemoteThread + LoadLibraryA</strong> — most
            common. Open the game process, allocate a string with the
            DLL path, spawn a remote thread that calls
            <code>LoadLibraryA</code> with that path. Detected by
            most anti-cheats.</li>
        <li><strong>Manual mapping</strong> — bypass <code>LoadLibrary</code>
            entirely. Allocate memory, copy the DLL bytes in, fix up
            relocations and imports yourself, jump to entry point.
            Harder to detect (no module appears in the loaded list).</li>
        <li><strong>DLL hijacking</strong> — replace a DLL the game
            loads on startup (e.g., dxgi.dll, d3d11.dll) with your own
            that re-exports the originals. Auto-loads when game starts.
            This is the 'auto-injection' pattern.</li>
        <li><strong>Process hollowing</strong> — start the game in a
            suspended state, replace its image, resume. Heaviest, most
            invasive.</li>
      </ul>

      <p>The simulator's "Inject" button is the simplest case — equivalent
      to CreateRemoteThread + LoadLibrary. Auto-injection (mission M22+)
      will simulate the DLL hijacking pattern: your code persists across
      mission restarts and pre-loads automatically.</p>
    `,
  },
  {
    id: "respawn-position",
    title: "Respawn-Position Tampering — Stay Where You Died",
    brief: "Let the death register on the kill feed. Just don't get sent back to spawn.",
    body: `
      <h2>The pain isn't dying</h2>
      <p>In a real shooter, dying once isn't usually mission-critical. The
      mission-critical part is what happens AFTER:</p>

      <ul>
        <li>You get teleported back to your team's spawn area.</li>
        <li>Your map position resets — that hard-won angle on the choke
            point, gone.</li>
        <li>The 30-second walk back to the fight gives the enemy team
            time to lock in their objective.</li>
        <li>If your weapon was looted off a corpse, sometimes you respawn
            with the default loadout instead.</li>
      </ul>

      <p>Compare that to: brief death animation, then you're standing
      RIGHT back where you fell, holding the same angle, wearing the
      same gear. The kill feed updated. Your KDR took a -1. But
      mechanically, you didn't lose anything except a couple seconds.
      That's the no-teleport exploit.</p>

      <h2>Why this works</h2>
      <p>Spawn placement is almost never server-validated. The server
      tells the client 'you died, please respawn.' The client looks at
      its own respawn-point cells (or its map's spawn-point list and
      a 'which spawn am I assigned to' index) and runs the teleport
      locally. Then it tells the server 'I respawned at X,Y.'</p>

      <p>The server usually trusts that. Spawn validation costs CPU
      (server has to know every map's spawn list, validate distance
      from line of sight, etc.) and adds latency. Most engines skip
      it — or only validate that the chosen spawn is in the team's
      list, not that it's a sensible distance from the death location.</p>

      <h2>How to find the respawn cells</h2>
      <p>Easier than M18 / M19, because the values are constants you
      can read off the map:</p>

      <ol>
        <li>Note the spawn coordinates (where you start, where you
            respawn after death).</li>
        <li>Scan for that X coord. Scan for that Y coord. Or both
            at once if your CE supports compound scans.</li>
        <li>Walk far away. Filter 'unchanged' — your player.x changes,
            the respawn.x stays put.</li>
        <li>Trial-and-error: edit candidates to your current position,
            die, see who respawns where. The right cells make you
            respawn in place.</li>
      </ol>

      <h3>Variants you'll see</h3>
      <ul>
        <li><strong>Spawn-list index.</strong> Some games store an int
            'which spawn am I assigned to' (0..N) and look up coords
            from a static list. Edit the int to point at a spawn near
            your death location.</li>
        <li><strong>Per-respawn callback.</strong> The respawn destination
            is computed from a function call, not a stored cell. Defeated
            by hooking the function or NOPing the position-write
            instructions.</li>
        <li><strong>'Random spawn' mode.</strong> Game picks a random
            spawn each time. Find the RNG state, freeze it, every spawn
            picks the same coordinates — pick the one closest to where
            you fight.</li>
      </ul>

      <h2>Combining with M19</h2>
      <p>The two tricks stack. Freeze player.alive at 1 (M19) and the
      death never registers at all — best case. If the game has
      countermeasures that prevent the alive-freeze (server-side
      death detection, watchdog, or the alive cell is encrypted),
      fall back to M20: let the death happen, just neutralize the
      teleport.</p>

      <p>The two also stack the other way: freeze respawn.x/y AND
      freeze the kill-feed cell (server-side) and you've shipped
      true online godmode — kill enemies indefinitely, the board
      shows 0 deaths because the server never registers them, you
      never get teleported away because you never die anyway.</p>

      <h2>How M20 simulates this</h2>
      <p>The simulator now binds <code>respawn.x</code> at
      <code>player_base + 0x20</code> and <code>respawn.y</code> at
      <code>+0x24</code>. The server-tick respawn code reads from
      those cells (not from the SPAWN constant) when teleporting you.
      Default values match SPAWN (5, 5).</p>

      <p>Edit those cells to your current X / Y. Freeze. Die. The
      respawn fires, reads the cells, teleports you to your own
      coordinates — i.e., nowhere. You stay in place.</p>

      <p>Win condition: 2 deaths with the respawn cells edited away
      from default. Proves the trick is repeatable.</p>
    `,
  },
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
