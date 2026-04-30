// Codex / Library — real-world reference material that bridges the
// in-game lessons to actual Cheat Engine, x64dbg, Frida, and friends.
//
// Articles are plain HTML strings stored inline. Add new ones by
// pushing to ARTICLES; each is { id, title, brief, body }.

const ARTICLES = [
  {
    id: "process-hiding-hackshield",
    title: "Process Hiding — Beating HackShield-Class Scanners",
    brief: "Why renaming Cheat Engine doesn't work and what does. Hooking the OS process-list call so your tool is invisible to the game's anti-cheat.",
    body: `
      <h2>The scanner you can't argue with</h2>
      <p>Some anti-cheat products run AS A SEPARATE PROCESS alongside
      the game (or as a kernel driver). They don't care what's
      happening inside the game's memory — they care about WHAT'S
      RUNNING ON THE PC. Every 1-3 seconds they enumerate the running
      processes, hash each .exe, check window titles, walk loaded
      modules. If they spot Cheat Engine, x64dbg, ReClass, or any
      known cheat-tool fingerprint, the game closes immediately.</p>

      <p>Names you might recognise: <strong>nProtect GameGuard,
      HackShield, BattlEye user-mode shim, Vanguard's process
      walker.</strong> All same shape: separate process, periodic
      enumeration, fingerprint match → kill the game.</p>

      <h2>Why renaming the .exe doesn't work</h2>
      <p>Real shields check more than the file name:</p>

      <table style="width:100%; border-collapse:collapse; margin:0.5rem 0;">
        <tr><th style="text-align:left;">What they check</th><th style="text-align:left;">Renaming defeats it?</th></tr>
        <tr><td>process name (cheatengine.exe)</td><td>✓ rename helps</td></tr>
        <tr><td>file hash (MD5/SHA of bytes)</td><td>✗ rename doesn't change content</td></tr>
        <tr><td>window title ("Cheat Engine 7.5")</td><td>✗ window title independent of file name</td></tr>
        <tr><td>loaded modules (CE's own DLLs)</td><td>✗ same DLLs regardless of EXE name</td></tr>
        <tr><td>PE imports / IAT signature</td><td>✗ binary content unchanged</td></tr>
        <tr><td>file path heuristics ("\\Cheat Engine\\")</td><td>○ helps if you also move the install</td></tr>
      </table>

      <p>Bottom line: rename + hash-spoof + title-spoof + path-move
      together raise the bar but don't beat a sophisticated scanner.
      You have to actually HIDE the process from the OS-level
      enumeration.</p>

      <h2>How to hide a process</h2>
      <p>Three layers of OS process hiding, increasing in
      sophistication:</p>

      <h3>1. Hook the user-mode enumeration call</h3>
      <p>Windows has <code>NtQuerySystemInformation</code> in
      <code>ntdll.dll</code>. When called with
      <code>SystemProcessInformation</code>, it returns a linked list
      of every running process. Hook this function with MinHook,
      filter the list before returning, and any user-mode code that
      walks processes never sees yours:</p>

      <pre><code>typedef NTSTATUS(NTAPI* NtQSI_t)(SYSTEM_INFORMATION_CLASS,
                                  PVOID, ULONG, PULONG);
NtQSI_t oNtQSI = nullptr;

NTSTATUS NTAPI hkNtQSI(SYSTEM_INFORMATION_CLASS cls,
                       PVOID buf, ULONG len, PULONG retLen) {
    NTSTATUS s = oNtQSI(cls, buf, len, retLen);
    if (s != 0 || cls != SystemProcessInformation) return s;

    // Walk the linked list, unlink any entry whose ImageName
    // matches "cheatengine" / our tool fingerprint.
    PSYSTEM_PROCESS_INFORMATION p = (PSYSTEM_PROCESS_INFORMATION)buf;
    PSYSTEM_PROCESS_INFORMATION prev = nullptr;
    while (true) {
        if (matches_cheat_tool(p->ImageName)) {
            if (prev) prev->NextEntryOffset += p->NextEntryOffset;
            else continue;   // first entry handled separately
        } else {
            prev = p;
        }
        if (p->NextEntryOffset == 0) break;
        p = (PSYSTEM_PROCESS_INFORMATION)((LPBYTE)p + p->NextEntryOffset);
    }
    return s;
}</code></pre>

      <p>Beats most user-mode scanners. Loses against kernel-mode
      anti-cheat that calls <code>ZwQuerySystemInformation</code>
      directly via syscall.</p>

      <h3>2. Direct syscall hooking</h3>
      <p>Some anti-cheats bypass <code>ntdll</code> and issue raw
      syscalls. Hooks at the <code>ntdll</code> layer don't catch them.
      Counter: install your hook deeper, at the syscall instruction
      itself. This requires SSDT manipulation or kernel-mode driver,
      out of user-mode reach on modern Windows (PatchGuard).</p>

      <h3>3. Driver-based hiding</h3>
      <p>Your own kernel driver intercepts the kernel's process-list
      operations. Pro cheat suites do this. Significantly raises the
      bar for the AC since now they're fighting a driver-vs-driver
      battle. Outside scope of an educational curriculum and
      requires Microsoft-signed driver capability or test-mode
      installation.</p>

      <h2>Other tools that achieve "hidden CE"</h2>
      <ul>
        <li><strong>Cheat Engine standalone variants</strong> with
            built-in stealth (rename + window-title + path randomization +
            user-mode ntdll hooks).</li>
        <li><strong>VMProtect / Themida wrappers</strong> on a CE
            build that make hash detection harder.</li>
        <li><strong>Running CE in a separate VM</strong> with shared
            memory or a proxy. AC sees only its own VM's processes;
            CE on the host is invisible. Practical for AC research.</li>
        <li><strong>Memory-only loaders</strong> — never write CE to
            disk, load it from a network buffer into memory, no .exe
            on disk for the AC's hash scan.</li>
      </ul>

      <h2>How M41 simulates this</h2>
      <p>The simulator has a fake <code>this.processes</code> array
      representing the OS's view of running processes. The
      "Hacker Worlds Scanner" entry is in the list with
      <code>suspicious: true</code>. The cheat-shield system walks
      this list every 1.5s; matches against suspicious accumulate
      detections; threshold trips a mission-fail.</p>

      <p><code>register_proc_enum_hook(fn)</code> is the simulator
      equivalent of an <code>NtQuerySystemInformation</code> detour.
      The shield calls every registered hook in chain before checking
      the result. Your hook returns a filtered list — scanner
      removed — shield sees nothing suspicious, no detection fires.</p>

      <p>Same architecture as real Windows. Same defense. Same bypass.
      Different layer (user-mode JS vs kernel-mode driver) but
      identical pedagogically.</p>

      <h2>Defenses against process-hiding hooks</h2>
      <ul>
        <li><strong>Hook integrity checks</strong> — AC reads the first
            5-15 bytes of <code>NtQuerySystemInformation</code>, hashes
            them, compares against a known-good baseline. JMP injected
            by your hook breaks the hash.</li>
        <li><strong>Direct syscall</strong> — AC bypasses ntdll
            entirely, performs the syscall via raw <code>syscall</code>
            instruction. Your hook never gets called.</li>
        <li><strong>Cross-validation</strong> — AC enumerates processes
            via two different APIs (NtQuerySystemInformation + WMI +
            EnumProcesses). Your hook needs to match all three.</li>
        <li><strong>Behavioral analysis</strong> — AC notices a
            never-shrinking memory footprint inconsistent with the
            visible process count. Statistical signal.</li>
      </ul>

      <p>The arms race: every layer of process hiding gets countered
      by a deeper layer of detection. The only stable equilibrium is
      kernel-vs-kernel, which requires driver dev experience.</p>

      <p>For AssaultCube and any open-source/offline-friendly target:
      none of this matters. AC ships zero anti-cheat. The lesson
      transfers conceptually to defensive AC engineering and to the
      protected-game side of the curriculum.</p>
    `,
  },
  {
    id: "multiplayer-defenses-full-spectrum",
    title: "Multiplayer Cheat Defenses — The Full Layered Stack",
    brief: "Every defense modern multiplayer ships and the bypass for each. Maps the M18-M20 + M30-M40 missions to the real-world arms race.",
    body: `
      <h2>The defensive stack</h2>
      <p>Modern multiplayer games don't ship one anti-cheat measure
      — they ship a whole stack. Cracking one layer doesn't beat the
      whole system. Here's the full set, each with its bypass and
      which simulator mission covers it:</p>

      <h3>Layer 1 — Server authority</h3>
      <p><strong>What it is:</strong> server holds canonical state for
      anything that affects gameplay (HP, ammo, score, position).
      Client renders what the server tells it. Local memory edits
      become cosmetic.</p>
      <p><strong>Bypass(es):</strong></p>
      <ul>
        <li>Find the local cache of server state, freeze that (M18).</li>
        <li>Freeze the death-state flag so the server's kill-event
            never sticks long enough (M19).</li>
        <li>Edit the respawn-position cells so respawn doesn't
            teleport you to base (M20).</li>
      </ul>

      <h3>Layer 2 — Client-side validation of damage</h3>
      <p><strong>What it is:</strong> server clamps incoming damage
      packets to the maximum the player's weapon allows. Crafted
      packets claiming amount=999 get shaved to weapon.damage * 2
      (or whatever the server's tolerance is).</p>
      <p><strong>Bypass:</strong> stack with a damage hike — boost
      weapon.damage so the cap rises with it. Crafted 999 clamped
      to (200 × 2) = 400, still one-shot territory (M34).</p>

      <h3>Layer 3 — HMAC-signed packets</h3>
      <p><strong>What it is:</strong> every outgoing packet signed
      with a per-session key derived during handshake. Receivers
      validate. Modified packets fail the signature check.</p>
      <p><strong>Bypass:</strong> find the session key in memory
      (it has to be there — your own client uses it to sign), mutate
      the packet, re-compute the signature, attach. Now your craft
      validates (M38).</p>

      <h3>Layer 4 — Sequence numbers + replay windows</h3>
      <p><strong>What it is:</strong> every packet auto-tagged with
      a monotonic sequence number. Server tracks seen seqs and
      rejects duplicates within a replay window.</p>
      <p><strong>Bypass:</strong> when replaying a captured packet,
      forge a new seq above any seen value. Server treats it as
      fresh (M39).</p>

      <h3>Layer 5 — Movement validation</h3>
      <p><strong>What it is:</strong> server rejects position-update
      packets where the position delta exceeds the maximum velocity
      the player's character can produce. Speed hacks and teleport
      hacks get snapped back to the last valid position.</p>
      <p><strong>Bypass:</strong> stay UNDER the threshold. 'Legal
      speed hack' — fast enough to feel cheating, slow enough the
      validator tolerates (M37). Or use legitimate movement chains
      (bunny-hop, strafe-jump) that produce above-baseline speed
      without tripping per-tick velocity limits.</p>

      <h3>Layer 6 — Lag compensation</h3>
      <p><strong>What it is:</strong> server records a history of
      every player's positions. When validating a hit, server
      rewinds time to where the target was when the shot was fired
      (compensating for the shooter's network latency).</p>
      <p><strong>Bypass:</strong> 'lag switch' — artificially
      inflate latency at strategic moments to gain larger rewind
      windows. Or hook the shot's timestamp on send to claim the
      shot was fired earlier than it actually was. Conceptual only
      in the simulator — too physically tied to real network
      conditions.</p>

      <h3>Layer 7 — Behavioral analysis</h3>
      <p><strong>What it is:</strong> server (or client-side AC)
      watches input timing distributions. Aimbot snaps that beat
      human reaction times → flag. Tracking through occlusion →
      flag. Perfect hit-rate over hours → flag.</p>
      <p><strong>Bypass:</strong> humanization — reaction delays
      (180-260ms randomized), target jitter, smoothing curves,
      miss-on-purpose, FOV-based activation (M33).</p>

      <h3>Layer 8 — Signature scanning (kernel AC)</h3>
      <p><strong>What it is:</strong> kernel-mode driver scans
      loaded process memory for known cheat signatures (specific
      byte patterns, suspicious strings, telltale symbol names).</p>
      <p><strong>Bypass:</strong> string obfuscation, mangled
      symbol names, polymorphism per build (M32). For active
      commercial AC: also requires manual mapping, hardware
      spoofing, or kernel-side hiding — out of scope here.</p>

      <h3>Layer 9 — Spectator detection</h3>
      <p><strong>What it is:</strong> when an admin or trusted
      player joins your view to watch for cheats, the server
      notifies your client via a packet event.</p>
      <p><strong>Bypass:</strong> hook recv for the event, set a
      'being watched' flag, conditionally disable visual cheats
      (ESP, menus, anything DRAWN) for the duration. Memory-only
      cheats (HP / ammo locks) stay on — they can't see those (M40).</p>

      <h2>How the layers stack</h2>
      <p>Defeating a single layer doesn't help if the others are
      still in play. Real cheats have to bypass simultaneously:</p>
      <pre><code>Crafted damage packet pipeline:
  1. Sign for hmac-clean validation       (M38)
  2. Stack with damage-cell hike           (M34)
  3. Forge seq number to dodge replay      (M39)
  4. Target position from lag-comp window  (lag switch)
  5. Behavioral throttle on aimbot         (M33)
  6. Hide visuals while spectator present  (M40)
  7. Obfuscate strings against scan        (M32)</code></pre>

      <p>That's why pro cheats are full-time engineering projects
      and why amateur cheats die instantly on protected games.
      AssaultCube, by contrast, ships none of these defenses —
      one layer at a time is enough. The lessons you've learned
      transfer to AC fully; against modern protected games they're
      conceptual ammunition, not deployable bypasses.</p>

      <h2>The full defensive stack as a defender</h2>
      <p>If you ever build the AC SIDE (defensive game security):
      ship every layer. Even imperfect implementations of each
      raise the bar significantly. Don't over-rely on one — pro
      cheaters will find that single layer and bypass it. The
      compound work of stacking is what defends.</p>

      <h2>Mission map for the full stack</h2>
      <table style="width:100%; border-collapse:collapse; margin:0.5rem 0;">
        <tr><th style="text-align:left;">Defense</th><th style="text-align:left;">Mission</th><th style="text-align:left;">Bypass</th></tr>
        <tr><td>Server authority (HP)</td><td>M18</td><td>Find local cache cell</td></tr>
        <tr><td>Death-state flag</td><td>M19</td><td>Freeze alive=1</td></tr>
        <tr><td>Respawn teleport</td><td>M20</td><td>Edit respawn cells</td></tr>
        <tr><td>Damage validation</td><td>M34</td><td>Boost weapon.damage</td></tr>
        <tr><td>HMAC signatures</td><td>M38</td><td>Find key, re-sign</td></tr>
        <tr><td>Sequence numbers</td><td>M39</td><td>Forge fresh seq</td></tr>
        <tr><td>Movement validation</td><td>M37</td><td>Legal-speed cheat</td></tr>
        <tr><td>Behavioral detection</td><td>M33</td><td>Humanization</td></tr>
        <tr><td>Signature scanning</td><td>M32</td><td>Obfuscate strings</td></tr>
        <tr><td>Spectator detection</td><td>M40</td><td>Auto-hide visuals</td></tr>
      </table>

      <p>Combined with M30-M31 (packet inspection + craft) and M35
      (replay), this is the full multiplayer-cheat / multiplayer-
      defense surface area in 13 missions.</p>
    `,
  },
  {
    id: "custom-menus-canvas-to-imgui",
    title: "Custom Menus — From Canvas to ImGui",
    brief: "What every menu actually is: state + drawing + hit-testing + toggle. Plus how the simulator's raw-canvas approach maps to real ImGui in C++.",
    body: `
      <h2>What a menu actually IS</h2>
      <p>Strip away the framework, every cheat menu does five things:</p>

      <ol>
        <li><strong>State</strong> — bool variables for each cheat
            ("is Infinite HP on?").</li>
        <li><strong>Drawing</strong> — colored rectangles + text
            positioned on screen. Every UI is just pixels.</li>
        <li><strong>Hit-testing</strong> — when the player taps,
            check if the tap point is inside any drawn rectangle.</li>
        <li><strong>Toggle</strong> — if the tap landed on a checkbox
            rect, flip the bool.</li>
        <li><strong>Apply</strong> — somewhere else (your tick loop),
            read each bool and run the cheat code if it's true.</li>
      </ol>

      <p>That's it. ImGui automates this; the underlying mechanics
      are unchanged.</p>

      <h2>The five sections in M36's template</h2>
      <p>The simulator template literally has five labeled sections:</p>
      <pre><code>// 1. STATE — bools
// 2. STYLE — colors / positions you can edit
// 3. LAYOUT — compute checkbox rects
// 4. DRAW — render every frame
// 5. INPUT — hit-test taps + flip bools
// 6. APPLY — onTick reads bools</code></pre>

      <p>Edit STYLE.bgColor, STYLE.borderColor, STYLE.font, STYLE.x/y
      to make it yours. The structure is what matters.</p>

      <h2>Drawing — the canvas API</h2>
      <p>The simulator gives you a Canvas 2D context. Real DirectX 9
      games give you an <code>IDirect3DDevice9*</code>. The primitives
      map almost one-to-one:</p>

      <table style="width:100%; border-collapse:collapse; margin:0.5rem 0;">
        <tr><th style="text-align:left;">Sim (Canvas 2D)</th><th style="text-align:left;">Real D3D9 / ImGui</th></tr>
        <tr><td><code>ctx.fillRect(x,y,w,h)</code></td><td>D3D vertex buffer with two triangles, or <code>ImGui::GetWindowDrawList()->AddRectFilled()</code></td></tr>
        <tr><td><code>ctx.strokeRect(...)</code></td><td>4 line segments, or <code>AddRect()</code></td></tr>
        <tr><td><code>ctx.fillText(s,x,y)</code></td><td><code>D3DXFont->DrawTextA(s, &rect, ...)</code> or <code>ImGui::Text()</code></td></tr>
        <tr><td><code>ctx.fillStyle</code></td><td><code>D3DCOLOR_ARGB(a,r,g,b)</code> or ImGui style colors</td></tr>
        <tr><td><code>ctx.font</code></td><td><code>D3DXCreateFontA(...)</code></td></tr>
      </table>

      <h2>Hit-testing — point-in-rect</h2>
      <p>When the player taps, you get a coord pair. Check if it's
      inside each clickable rect:</p>

      <pre><code>function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw &&
           py >= ry && py <= ry + rh;
}</code></pre>

      <p>Real ImGui does this internally — every <code>ImGui::Button</code>
      stores its rect, ImGui's input system checks the cursor against
      every rect each frame. You can write <code>ImGui::IsMouseHoveringRect</code>
      manually to see the same logic exposed.</p>

      <h2>Toggle — flip the bool</h2>
      <pre><code>if (pointInRect(ev.x, ev.y, r.x, r.y, r.w, r.h)) {
    state[r.key] = !state[r.key];
    return true;   // event handled
}</code></pre>

      <p>ImGui's <code>ImGui::Checkbox("label", &state)</code> is a
      one-liner because it bundles drawing + hit-testing + toggle. The
      <code>&state</code> is how it knows where to write the toggle —
      you pass a pointer to your bool, ImGui flips it on click.</p>

      <h2>The same menu in real C++ (ImGui)</h2>
      <p>Once you understand the simulator's raw approach, the real
      thing collapses:</p>

      <pre><code>// State — same bools as the sim's 'state' object
static bool g_inf_hp = false;
static bool g_inf_ammo = false;
static bool g_super_dmg = false;

// Inside your D3D9 EndScene hook:
ImGui_ImplDX9_NewFrame();
ImGui_ImplWin32_NewFrame();
ImGui::NewFrame();

ImGui::Begin("Custom Menu",
             nullptr,
             ImGuiWindowFlags_AlwaysAutoResize);
    ImGui::Checkbox("Infinite HP",    &g_inf_hp);
    ImGui::Checkbox("Infinite Ammo",  &g_inf_ammo);
    ImGui::Checkbox("Super Damage",   &g_super_dmg);
ImGui::End();

ImGui::Render();
ImGui_ImplDX9_RenderDrawData(ImGui::GetDrawData());

// Apply elsewhere:
if (g_inf_hp)    *(int*)(player_base + 0xEC) = 100;
if (g_inf_ammo)  *(int*)(player_base + 0x140) = 99;</code></pre>

      <p>Every one of those lines maps to a section in M36's template.
      <code>ImGui::Checkbox</code> is the simulator's draw + hit-test +
      toggle compressed into one call. <code>ImGui::Begin/End</code> is
      the simulator's background-rect + title-bar.</p>

      <h2>Customisation — how to actually change things</h2>

      <h3>Colors</h3>
      <p>Sim: edit STYLE.bgColor, STYLE.borderColor, etc. Hex /
      rgba(...) accepted.</p>
      <p>ImGui: <code>ImGui::PushStyleColor(ImGuiCol_WindowBg,
      ImVec4(0.0f, 0.0f, 0.0f, 0.9f));</code> before
      <code>ImGui::Begin</code>. Pop after End.</p>

      <h3>Position / size</h3>
      <p>Sim: STYLE.x, STYLE.y, STYLE.w. Just numbers.</p>
      <p>ImGui:
      <code>ImGui::SetNextWindowPos(ImVec2(12, 60));</code>
      <code>ImGui::SetNextWindowSize(ImVec2(220, 200));</code>
      before Begin.</p>

      <h3>Backgrounds / images</h3>
      <p>Sim: <code>ctx.drawImage(img, x, y)</code> would work if you
      preloaded an image. <code>ctx.fillStyle = pattern</code> for
      tiled backgrounds.</p>
      <p>ImGui: <code>ImGui::Image(textureID, size)</code> draws a
      D3D9 texture inside the menu. You'd use
      <code>D3DXCreateTextureFromFileInMemory</code> to load PNGs into
      D3D9 textures (CombatArms.dll's import for that purpose was
      visible in its PE).</p>

      <h3>Custom widgets</h3>
      <p>Sim: any widget you can DRAW you can BUILD. A slider is just
      a bg-rect + a fg-rect that gets repositioned on drag.</p>
      <p>ImGui: most widgets exist (<code>ImGui::SliderInt</code>,
      <code>ImGui::ColorEdit3</code>, <code>ImGui::TreeNode</code>).
      For exotic stuff, drop down to <code>ImGui::GetWindowDrawList()</code>
      and AddRectFilled / AddText directly — same primitive level
      as the simulator.</p>

      <h2>Why building from raw primitives matters</h2>
      <p>If you only ever write <code>ImGui::Checkbox</code> you don't
      know:</p>
      <ul>
        <li>How to add a custom widget ImGui doesn't have</li>
        <li>How to make a non-rectangular hit zone</li>
        <li>How to render a totally custom menu (e.g., a circular
            radial menu)</li>
        <li>How to debug when a click misses</li>
      </ul>

      <p>M36 forces you through the underlying mechanics so the
      ImGui shortcuts are <em>shortcuts you understand</em>, not
      magic.</p>
    `,
  },
  {
    id: "behavioral-evasion",
    title: "Behavioral Evasion — Making the Cheat Look Human",
    brief: "Why pro cheats add jitter, reaction delay, miss-on-purpose. The statistical layer of the arms race.",
    body: `
      <h2>Why this exists</h2>
      <p>M32 covered SIGNATURE-based detection: AC reads your DLL,
      spots known strings, flags. Defeated by string obfuscation.</p>

      <p>Behavioral detection is the next layer up. Even with a
      perfectly clean DLL — no suspicious strings, no telltale
      imports — the AC watches what your INPUTS LOOK LIKE. A
      signature scan can't catch your aimbot if the strings are
      mangled. But if your aimbot snaps the crosshair from one
      enemy to another in a single frame, then snaps to a third
      enemy 16ms later, that's a behavior no human can produce.</p>

      <h2>What the detector watches</h2>
      <p>Real behavioral systems analyze multiple input streams:</p>

      <h3>Mouse delta patterns</h3>
      <ul>
        <li><strong>Sub-pixel precision</strong>: real mouse sensors
            generate jitter at the optical level. Perfect straight
            lines or perfectly identical deltas across multiple
            shots are a hardware signature humans don't make.</li>
        <li><strong>Acceleration curves</strong>: human muscle
            movement follows characteristic acceleration profiles.
            Bots that linearly interpolate from current crosshair
            to target position have linear acceleration — wrong
            shape.</li>
        <li><strong>Overshoot + correction</strong>: humans aim
            past the target slightly and correct back. Bots
            usually land exactly on target every time. Statistical
            absence of overshoot is suspicious.</li>
      </ul>

      <h3>Reaction timing</h3>
      <ul>
        <li><strong>Onset latency</strong>: time between an enemy
            appearing in your field of view and your crosshair
            beginning to move. Humans average 200ms (visual
            perception + motor response). Bots hit ~16ms (one
            frame).</li>
        <li><strong>Reaction-time variance</strong>: a real human's
            reaction times follow a distribution (~80ms standard
            deviation around the mean). Bots have either zero
            variance (always exactly N ms) or wrong-shaped variance
            (uniform random instead of right-skewed normal).</li>
      </ul>

      <h3>Tracking accuracy</h3>
      <ul>
        <li><strong>Through occlusion</strong>: a human loses
            tracking when an enemy goes behind a wall. Bots that
            keep crosshair-on-enemy through walls get caught (real
            data: the enemy isn't on screen, your crosshair shouldn't
            know where they are).</li>
        <li><strong>Microcorrections</strong>: humans constantly
            twitch the mouse, even at rest. Periods of perfectly
            still cursor are robotic.</li>
        <li><strong>Streaks</strong>: humans miss occasionally
            even with practice. Bots that hit 100% of shots over
            long periods don't match human distributions.</li>
      </ul>

      <h2>The standard countermeasures</h2>

      <h3>Reaction delay</h3>
      <p>Don't update the aimbot's target every frame. Instead,
      pick a random delay between 180-260ms, and only update on
      that interval. Real M33 template:</p>

      <pre><code>let lastSwitchAt = 0;
function aimbot_tick() {
    const now = performance.now();
    const reactionMs = 180 + Math.random() * 80;
    if (now - lastSwitchAt < reactionMs) return;
    lastSwitchAt = now;

    const target = pick_closest_enemy();
    write_label("crosshair.target", target.id);
}</code></pre>

      <h3>Jitter (target picking)</h3>
      <p>Don't always pick the closest enemy. 70% of the time pick
      the closest, 30% pick the SECOND-closest. Or randomize by
      threat — most-dangerous-enemy heuristic. The variance makes
      your target selection look like priority-ordering humans
      consciously do.</p>

      <h3>Mouse curve smoothing</h3>
      <p>Don't snap directly to target. Move along a bezier curve
      with humanlike acceleration profile (slow-start, fast-middle,
      slow-finish — like a real arm motion):</p>

      <pre><code>// Pseudocode — interpolate from current crosshair to target
// over 80-150ms with cubic ease-in-out, plus ±2px random jitter
// each tick.
function smooth_aim(target_x, target_y) {
    const dur = 80 + Math.random() * 70;
    const steps = dur / 16;
    for (let i = 0; i < steps; i++) {
        const t = ease_in_out_cubic(i / steps);
        const x = lerp(current_x, target_x, t) + random_jitter(2);
        const y = lerp(current_y, target_y, t) + random_jitter(2);
        await sleep(16);
        write_mouse_pos(x, y);
    }
}</code></pre>

      <h3>Miss on purpose</h3>
      <p>A bot that hits 99% of shots over 100 hours is suspicious.
      Pro cheats randomly drop ~20% of shots — adds variance to
      hit-rate distributions, makes you look like a skilled human
      rather than a perfect machine. Counterintuitive, but it
      works.</p>

      <h3>Activation gating</h3>
      <p>Don't run the aimbot on every shot. Activate only when:</p>
      <ul>
        <li>Enemy enters your FOV (180° front cone)</li>
        <li>You've been holding the trigger or aim button</li>
        <li>The enemy is within typical engagement range</li>
      </ul>
      <p>Effect: when an enemy is OUT of normal aim range, your
      crosshair doesn't track them. Removes the 'tracking through
      walls' signal.</p>

      <h2>How M33 simulates this</h2>
      <p>The behavioral detector watches <code>crosshair.target</code>
      and counts switches in a 1.5s sliding window. >5 switches =
      inhuman → violations++. The default M28 aimbot updates
      crosshair.target every frame, so as enemies move it switches
      constantly — racks violations in 2 seconds.</p>

      <p>The M33 template adds reaction delay + 30% second-closest
      jitter. Same aim-snap effect over time, very different per-
      tick signal. Detector stays calm, you still drop 4 contacts.</p>

      <h2>Where this leaves competitive games</h2>
      <p>Modern AC products have multiple detection layers running
      simultaneously: signature + behavioral + statistical + hardware.
      Defeating one isn't enough. Pro cheats invest months tuning
      humanization curves; that's a full-time engineering effort.</p>

      <p>For AssaultCube the lesson is conceptual — AC ships no
      behavioral detection so you don't NEED humanization there.
      But understanding the pattern lets you build the AC side if
      you ever go that direction (defensive game-security work).</p>
    `,
  },
  {
    id: "modern-ac-conceptual-tour",
    title: "Modern Anti-Cheat — A Conceptual Tour",
    brief: "What kernel-level AC actually does, why your sim DLLs would die on real systems, and where the arms race lives. No real signatures, all concepts.",
    body: `
      <h2>Frame</h2>
      <p>This article is a conceptual tour of what modern anti-cheat
      products do at a high level. <strong>It uses no real
      signatures, no real vendor data, no real bypass techniques.</strong>
      The point is to build intuition for the arms race so you
      understand why simulator-grade cheats wouldn't survive on a
      kernel-AC-protected game — and to make defensive-engineering
      decisions if you ever build the AC side of the equation.</p>

      <h2>The fundamental shift: ring 3 → ring 0</h2>
      <p>Everything we've built so far runs in user-mode (ring 3).
      The game's process is in ring 3, your cheat DLL is in ring 3,
      they share an address space, you have full read/write access
      to the game's memory. Easy.</p>

      <p>Modern AC products (you know the names) install a kernel
      driver — ring 0. From kernel mode they can:</p>

      <ul>
        <li>Read the memory of any user-mode process without going
            through ReadProcessMemory (which user-mode AC bypasses
            could detour).</li>
        <li>Enumerate every loaded module in every process at any
            time. DLL hijacking gets caught.</li>
        <li>Watch for new processes starting (CreateProcess
            notification routines). Loader EXEs get caught the
            moment they spawn.</li>
        <li>Inspect handles. CreateRemoteThread + LoadLibraryA
            triggers a handle creation event the driver sees.</li>
        <li>Read CR3 / page tables. Manual mapping that hides from
            user-mode module enumeration is still visible.</li>
      </ul>

      <p>Your simulator DLL would be visible to all of these. The
      countermeasures (kernel-level driver of your own that races the
      AC driver, hypervisor-based hiding) require techniques that are
      out of scope for an educational curriculum and largely out of
      scope ethically.</p>

      <h2>Three categories of detection</h2>

      <h3>1. Signature-based</h3>
      <p>The AC driver hashes your DLL's bytes (or specific sections
      of it) at load time and compares against a known-bad list.
      Simple and fast. Defeated by:</p>
      <ul>
        <li>Mangled symbol names + XOR-encrypted strings (the M32
            simulator lesson)</li>
        <li>Per-build polymorphism (recompile changes byte layout)</li>
        <li>Manual mapping with byte-level transformations</li>
      </ul>
      <p>Real CAEU's plaintext "Aimbot" / "ESP" strings would be
      caught instantly by signature scans on any modern game.</p>

      <h3>2. Behavioral</h3>
      <p>The AC driver watches what your inputs LOOK like. Even with
      a signature-clean DLL, you trip behavioral detection by:</p>
      <ul>
        <li>Aim acceleration that's superhuman (instant 180° snaps)</li>
        <li>Reaction times faster than physically possible (tens of
            milliseconds vs. the human ~200ms floor)</li>
        <li>Perfect tracking through occlusion (you keep aim on an
            enemy you couldn't possibly see)</li>
        <li>Mouse delta patterns inconsistent with hardware (mouse
            sensors generate characteristic jitter — perfect lines
            don't)</li>
        <li>Identical timings across kills (humans vary; bots don't)</li>
      </ul>
      <p>Defeated by 'humanization': add jitter, reaction-delay,
      smoothing curves, miss-on-purpose. Same shape as accessibility
      tools that smooth aim for users with motor impairments — the
      problem is statistical, not technical.</p>

      <h3>3. Hardware / system fingerprinting</h3>
      <p>If you get banned, the AC fingerprints your motherboard /
      drive serials / MAC / etc. so you can't just buy the game
      again on a new account. Defeated by hardware spoofers (a
      different rabbit hole), or by simply accepting the ban.</p>

      <h2>Network-side defenses</h2>
      <p>Server-side anti-cheat exists alongside kernel AC and is
      arguably more important:</p>
      <ul>
        <li><strong>Lag compensation</strong>: server records
            historical positions, validates hits against where the
            target actually was N ms ago. Bots that aim at the
            target's CURRENT (lag-adjusted) position miss because
            the server uses the lag-rewinded position for hit
            registration.</li>
        <li><strong>Packet HMAC signatures</strong>: every packet
            includes a per-session-key MAC. Modified packets fail
            the check. Defeats simple packet-craft (M31 territory)
            on games that ship this.</li>
        <li><strong>Sequence numbers + replay windows</strong>:
            packets are numbered, server rejects out-of-window
            duplicates. Defeats replay attacks.</li>
        <li><strong>Movement bounds checking</strong>: server
            knows max movement speed; rejects positions that imply
            you teleported. Defeats raw position packet
            forgery.</li>
        <li><strong>Hit-event validation</strong>: server checks
            whether your shot's trajectory intersects the
            (server-side) target hitbox at the time of fire. 999-
            damage packets get rejected if the trajectory's
            impossible.</li>
      </ul>

      <h2>Where this leaves the curriculum</h2>
      <p>Everything M01-M32 teaches is real, useful, and works on
      games like AssaultCube where these defenses don't apply.
      The M32 mission lets you feel the signature-scan arms race in
      miniature without me handing you anything that would actually
      defeat a commercial AC. If you ever want to build the AC side
      (defensive game security as a career), every lesson here is
      directly applicable in reverse: you've seen what cheats do, so
      you know what to detect.</p>

      <p>For the offensive side targeting modern protected games:
      that's a path requiring driver-development experience, deep
      Windows internals knowledge, willingness to operate in legal
      grey areas, and a real player base who didn't consent to
      being fought against. Not a path this curriculum endorses or
      enables. AC's the right target — it's open-source, it's
      practice-friendly, the techniques transfer fully.</p>
    `,
  },
  {
    id: "packet-manipulation",
    title: "Packet Manipulation — Crafting and Replaying",
    brief: "Hook the network layer, modify packets in flight, replay captured packets. The server-comms angle of the cheat arms race.",
    body: `
      <h2>The fourth memory</h2>
      <p>Up till now you've worked with three kinds of state: cells
      in memory (M01-M16), code instructions (M22), and render
      buffers (M26). The fourth is the network: the packets your
      game sends to the server and the packets the server sends
      back. Hooking those gives you a fourth angle of attack.</p>

      <h2>Where to hook</h2>
      <p>On Windows, all TCP/UDP traffic goes through
      <code>ws2_32.dll</code>:</p>

      <pre><code>// Real-world C++ MinHook detour
typedef int (WSAAPI* send_t)(SOCKET, const char*, int, int);
send_t oSend = nullptr;

int WSAAPI hkSend(SOCKET s, const char* buf, int len, int flags) {
    // 'buf' is the raw packet bytes. Length-prefixed structures,
    // protobufs, custom binary — depends on the game.
    if (is_damage_packet(buf, len)) {
        edit_damage_field(buf, len, 999);
    }
    return oSend(s, buf, len, flags);
}

void install() {
    HMODULE ws2 = GetModuleHandleA("ws2_32.dll");
    void* sendAddr = GetProcAddress(ws2, "send");
    MH_CreateHook(sendAddr, &hkSend, (void**)&oSend);
    MH_EnableHook(sendAddr);
}</code></pre>

      <p>The simulator equivalent is <code>register_packet_hook("send", fn)</code>.
      The game emits a packet object via <code>_sendPacket(pkt)</code>;
      your hook gets it, can return it as-is, modified, or null
      (drop). Same pattern, JS objects instead of byte buffers.</p>

      <h2>The four packet exploits</h2>

      <h3>1. Inspection</h3>
      <p>M30. Hook send + recv, log everything to console. Phase
      one of any net-side cheat — you have to understand the
      protocol before you craft. Real games sometimes send hundreds
      of packet types per second; identify the ones you care about
      by triggering specific actions and watching what flies past.</p>

      <h3>2. Crafting (modification in flight)</h3>
      <p>M31. Mutate outgoing fields. Damage = 999. Position = wherever
      you want. Ammo = max. The server believes whatever you send IF
      it doesn't validate.</p>

      <p>This works against AssaultCube because AC's server logic
      is naive — it trusts the client's claim of "I dealt 25
      damage to player 3." Modern competitive games server-validate
      everything: they recompute damage from the (server-owned)
      weapon stats, target HP, and shot trajectory. Your "999"
      packet gets capped at the real weapon damage.</p>

      <h3>3. Replay</h3>
      <p>Capture a specific packet (e.g., the one the server sends
      that says "you scored a kill"), re-send it. Naive servers
      credit the kill multiple times. Defeated by sequence numbers:
      every packet has an incrementing nonce, server rejects
      duplicates within the replay window.</p>

      <h3>4. Drop</h3>
      <p>The recv-hook returns null instead of the packet, the
      simulator never applies it. Useful for:</p>
      <ul>
        <li>Dropping "you died" packets — server thinks you're
            dead but client never registers it (M19 territory but
            at the network layer).</li>
        <li>Dropping nerf-the-cheater packets — some games send
            "you've been server-banned" notifications; drop them
            and you keep playing.</li>
        <li>Dropping admin-spectator notifications — keep cheating
            with the safety of not knowing they're watching (sketchy
            for obvious reasons).</li>
      </ul>

      <h2>Why this is harder than scanner-side cheats</h2>
      <ul>
        <li><strong>Encryption</strong>: most modern games TLS-wrap
            their game traffic. Hooking <code>send</code> below the
            TLS layer gives you ciphertext. Hook ABOVE the TLS layer
            (closer to the game's serialization code) — but that
            requires reverse-engineering the game's packet
            serializers, much harder than scanning memory cells.</li>
        <li><strong>Protocol opacity</strong>: even unencrypted
            packets use custom binary formats (varint length
            prefixes, packed bitfields, type tags). You're
            decoding it yourself.</li>
        <li><strong>Stateful timing</strong>: many packet types
            have to arrive in specific orders, with specific
            timing. Crafted packets that violate these get
            ignored or trip detection.</li>
      </ul>

      <h2>Defenses you'll see</h2>
      <table style="width:100%; border-collapse:collapse; margin: 0.5rem 0;">
        <tr><th style="text-align:left;">Defense</th><th style="text-align:left;">Beats which exploit</th></tr>
        <tr><td>HMAC per packet</td><td>Crafting</td></tr>
        <tr><td>Sequence numbers</td><td>Replay</td></tr>
        <tr><td>Server-side validation</td><td>Crafting (revalidates content)</td></tr>
        <tr><td>Lag compensation</td><td>Forged hit packets</td></tr>
        <tr><td>TLS / protocol encryption</td><td>All of the above (lower-layer)</td></tr>
        <tr><td>Heartbeat + drop detection</td><td>Drop</td></tr>
      </table>

      <h2>How M30-M31 simulate this</h2>
      <p>The simulator's network layer is intentionally naive — no
      HMAC, no sequence numbers, no server-side revalidation. So
      the M31 'craft a 999 damage packet' exploit lands.
      That's pedagogically right: AC's network layer is similarly
      naive (the game's an offline-first / LAN-friendly title
      where strong server validation wasn't a goal). The
      techniques transfer to AC; the lessons translate to the
      modern landscape via 'and here's why this stops working.'</p>
    `,
  },
  {
    id: "ac-offsets-cheat-sheet",
    title: "AssaultCube Offsets — The Reference Sheet",
    brief: "The hardcoded numbers your trainer needs. Public, stable, copy into your .cpp.",
    body: `
      <h2>The single most useful page in this codex</h2>
      <p>Every trainer for AssaultCube hardcodes the same handful of
      offsets. They've been stable across the game's lifetime
      (1.2.0.2 has been the public version for years). These are
      documented on every public AC hacking tutorial — gamehacking.academy,
      GuidedHacking, UnknownCheats. Reproduced here so you don't have
      to leave the app to find them.</p>

      <h2>Module + base pointer</h2>
      <pre><code>HMODULE hMod = GetModuleHandleA("ac_client.exe");
uintptr_t base = (uintptr_t)hMod;

// The local player struct pointer:
uintptr_t player_base = *(uintptr_t*)(base + 0x10F4F4);</code></pre>

      <p><strong>0x10F4F4</strong> is the static offset from
      <code>ac_client.exe</code> to a pointer that holds the address
      of your local player struct. Read 4 bytes there, you've got
      the struct base. Re-read each frame — the struct can relocate
      across map changes.</p>

      <h2>Local player struct fields</h2>
      <table style="width:100%; border-collapse:collapse; margin: 0.5rem 0;">
        <tr><th style="text-align:left;">Field</th><th style="text-align:left;">Offset</th><th style="text-align:left;">Type</th></tr>
        <tr><td>position x</td><td><code>+0x4</code></td><td>float</td></tr>
        <tr><td>position z</td><td><code>+0x8</code></td><td>float (vertical in AC)</td></tr>
        <tr><td>position y</td><td><code>+0xC</code></td><td>float</td></tr>
        <tr><td>velocity</td><td><code>+0x28..0x30</code></td><td>3 floats</td></tr>
        <tr><td>view yaw</td><td><code>+0x34</code></td><td>float</td></tr>
        <tr><td>view pitch</td><td><code>+0x38</code></td><td>float</td></tr>
        <tr><td><strong>HP</strong></td><td><code>+0xEC</code></td><td>int</td></tr>
        <tr><td>armor</td><td><code>+0xF0</code></td><td>int</td></tr>
        <tr><td><strong>ammo (current weapon)</strong></td><td><code>+0x140</code></td><td>int</td></tr>
        <tr><td>weapon id</td><td><code>+0x374</code></td><td>int</td></tr>
        <tr><td>team</td><td><code>+0x32C</code></td><td>int (0/1)</td></tr>
        <tr><td>name</td><td><code>+0x205</code></td><td>char[16]</td></tr>
      </table>

      <p>Note: AC's coordinate convention is X-Z-horizontal, Y-vertical
      (typical for old idTech-derived engines). When you do
      world-to-screen, x and y are the floor plane, z is height.</p>

      <h2>Enemy enumeration</h2>
      <pre><code>uint32_t numplayers = *(uint32_t*)(base + 0x10F500);
Player** enemies   = *(Player***)(base + 0x10F4F8);

for (uint32_t i = 0; i < numplayers; i++) {
    Player* p = enemies[i];
    if (!p) continue;
    int hp = *(int*)((uintptr_t)p + 0xEC);
    if (hp <= 0) continue;
    // ESP / aimbot logic for this enemy
}</code></pre>

      <p><strong>0x10F500</strong> = enemy count (uint32). <strong>0x10F4F8</strong> =
      pointer to an array of <code>Player*</code> pointers. The array
      itself can relocate; re-read each frame.</p>

      <h2>View matrix (for world-to-screen)</h2>
      <p>D3DXVec3Project needs the view × projection matrix. AC keeps
      it at:</p>
      <pre><code>float* viewProj = (float*)(base + 0x17DFD0);
// 4x4 matrix in row-major order, 16 floats</code></pre>

      <p>Pass that to <code>D3DXVec3Project</code> when projecting
      enemy world coords to screen pixels for ESP. See the Codex
      'Render Hooking' article for the call shape.</p>

      <h2>Weapon descriptor</h2>
      <pre><code>uintptr_t weapon_ptr = *(uintptr_t*)(player_base + 0x374);
// Inside the weapon struct:
//   damage:      *(int*)(weapon_ptr + 0x18)   (varies by weapon kind)
//   reload time: *(int*)(weapon_ptr + 0x14)
//   recoil:      *(float*)(weapon_ptr + 0x60)</code></pre>

      <p>Weapon offsets vary slightly per weapon type. The pattern
      M17 taught (player → currentWeapon pointer → weapon stats) maps
      directly to <code>+0x374</code> in AC.</p>

      <h2>Putting it together — minimal C++ trainer skeleton</h2>
      <pre><code>#include &lt;windows.h&gt;
#include &lt;process.h&gt;

unsigned __stdcall cheat_thread(void*) {
    HMODULE hMod = GetModuleHandleA("ac_client.exe");
    uintptr_t base = (uintptr_t)hMod;

    while (true) {
        uintptr_t pb = *(uintptr_t*)(base + 0x10F4F4);
        if (pb) {
            *(int*)(pb + 0xEC)  = 100;   // HP
            *(int*)(pb + 0xF0)  = 100;   // armor
            *(int*)(pb + 0x140) = 99;    // ammo
        }
        Sleep(16);
    }
}

BOOL WINAPI DllMain(HINSTANCE h, DWORD r, LPVOID) {
    if (r == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(h);
        _beginthreadex(nullptr, 0, cheat_thread, nullptr, 0, nullptr);
    }
    return TRUE;
}</code></pre>

      <p>That's a working AC trainer. ~30 lines. Build as a DLL,
      inject, ac_client gets infinite HP/armor/ammo. The M29 Export
      button generates a more complete version with cheat menu wiring
      + render hook scaffolding.</p>

      <h2>Building in Visual Studio</h2>
      <ol>
        <li>VS 2017+ → New Project → C++ → Empty Project</li>
        <li>Project Properties → General → Configuration Type → <strong>Dynamic Library (.dll)</strong></li>
        <li>Project Properties → C/C++ → Code Generation → Runtime Library → <strong>/MT</strong> (static CRT, no msvcr*.dll dependency)</li>
        <li>Configuration → <strong>Win32</strong> (NOT x64 — AC is 32-bit)</li>
        <li>Drop the .cpp in Source Files</li>
        <li>Build → output is in <code>Release\\YourProject.dll</code></li>
        <li>Inject with any standard injector</li>
      </ol>

      <h2>Validating the offsets are still right</h2>
      <p>If your trainer compiles but does nothing, the offsets may
      have drifted (very unlikely for AC 1.2.0.2 which is frozen,
      but worth knowing the workflow):</p>
      <ol>
        <li>Open AC, attach Cheat Engine.</li>
        <li>Find your HP via scan. Right-click → "Find what writes."</li>
        <li>Take damage. CE shows the assembly. Note the base register +
            offset. That offset is your real <code>OFF_HP</code>.</li>
        <li>Compare against this article. Update if drifted.</li>
      </ol>

      <p>Then for the static base: in CE's pointer scan on your HP
      address, the result that resolves to
      <code>ac_client.exe + something</code> is your
      <code>OFF_PLAYER_BASE_PTR</code>. Done.</p>

      <h2>Why these are safe to share</h2>
      <p>AssaultCube is open-source. The source code itself shows
      where these struct fields are defined. Anyone with five minutes
      and a copy of the AC repo can derive these offsets. They've been
      public material in the game-hacking education community for over
      a decade.</p>
    `,
  },
  {
    id: "render-hooking",
    title: "Render Hooking — Drawing on the Game's Frame",
    brief: "Hook EndScene, get the device, draw your overlay. The technique behind every wallhack and ESP that survives 'don't draw enemies' flag freezes.",
    body: `
      <h2>Why this beats every flag-flip</h2>
      <p>M13 taught the data-side wallhack: find the bool that controls
      enemy rendering, flip it. M26 surfaces the limitation: when an
      anti-cheat watchdog freezes that bool at 0 (M6 territory),
      writing 1 bounces back. Data attack blocked.</p>

      <p>The render hook is the code-side answer. Instead of asking
      the engine to draw enemies, you draw them yourself, AFTER the
      engine has finished its frame, BEFORE it presents the back
      buffer. The engine never knows you added pixels.</p>

      <h2>The DirectX EndScene hook</h2>
      <p>D3D9 games render a frame by issuing draw calls between
      <code>BeginScene()</code> and <code>EndScene()</code>, then
      <code>Present()</code> swaps the back buffer onto the screen.
      Hooking <code>EndScene</code> gives you the device pointer
      right before present — perfect spot to draw extras.</p>

      <p>The standard pattern using MinHook:</p>

      <pre><code>#include &lt;d3d9.h&gt;
#include "MinHook.h"

typedef HRESULT(__stdcall* EndScene_t)(IDirect3DDevice9*);
EndScene_t oEndScene = nullptr;

HRESULT __stdcall hkEndScene(IDirect3DDevice9* device) {
    static ID3DXFont* font = nullptr;
    if (!font) {
        D3DXCreateFontA(device, 14, 0, FW_NORMAL, 1, FALSE,
                        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                        DEFAULT_QUALITY, DEFAULT_PITCH | FF_DONTCARE,
                        "Arial", &font);
    }

    // Iterate enemies, project their world coords to screen, draw.
    for (auto& e : iter_enemies()) {
        if (!e.alive) continue;
        D3DXVECTOR3 screen, world(e.x, e.y, e.z);
        D3DXVec3Project(&screen, &world, nullptr, nullptr, nullptr,
                        &g_view_proj, viewport_w, viewport_h);
        if (screen.z &gt; 1.0f) continue;   // behind camera
        // Draw a box centered on the screen pos.
        draw_rect(device, screen.x - 16, screen.y - 24, 32, 48,
                  D3DCOLOR_ARGB(255, 0, 255, 255));
        // Draw name + HP above.
        char buf[64];
        sprintf_s(buf, "%s %d", e.name, e.hp);
        RECT r = { (LONG)screen.x, (LONG)(screen.y - 36),
                   (LONG)screen.x + 200, (LONG)screen.y };
        font-&gt;DrawTextA(nullptr, buf, -1, &r, DT_LEFT,
                       D3DCOLOR_ARGB(255, 0, 255, 255));
    }

    return oEndScene(device);   // ALWAYS call original
}

void install_render_hook() {
    void* endscene_addr = get_endscene_via_dummy_device();
    MH_Initialize();
    MH_CreateHook(endscene_addr, &hkEndScene, (void**)&oEndScene);
    MH_EnableHook(endscene_addr);
}</code></pre>

      <p>That C++ matches the M26 simulator template line-for-line in
      intent — register a callback, draw boxes around enemies, return
      to the original code path.</p>

      <h2>How D3DXVec3Project works</h2>
      <p>Real games render in 3D. A player's HP cell tells you their
      world coords <code>(x, y, z)</code>; the screen is 2D pixels.
      <code>D3DXVec3Project</code> does the math:</p>

      <ol>
        <li>Multiply world coord by the view matrix → camera-space coord.</li>
        <li>Multiply by projection matrix → clip-space coord.</li>
        <li>Perspective-divide by w → normalized device coords.</li>
        <li>Map [-1..1] to [0..viewport] → screen pixels.</li>
      </ol>

      <p>Output's <code>screen.z</code> tells you depth — 0 is at the
      near plane, 1 is the far plane, &gt;1 means behind the camera
      (skip these so you don't draw enemies who aren't visible).</p>

      <p>You feed it the same view + projection matrices the game uses.
      For AssaultCube specifically those live at
      <code>ac_client.exe + 0x17DFD0</code> as a 4x4 float matrix —
      see the bridge article.</p>

      <p>The simulator skips this because the map is flat 2D — tile
      coords map directly to pixels via <code>tile_size()</code>.
      Real D3D9 you do the matrix math; the technique on top is
      identical.</p>

      <h2>Getting the EndScene address (the dummy-device trick)</h2>
      <p><code>EndScene</code> is a virtual method on
      <code>IDirect3DDevice9</code>. Each device instance has a
      vtable; the same vtable is shared across all devices. So you
      can:</p>

      <ol>
        <li>Create a hidden window with <code>CreateWindowEx</code>.</li>
        <li><code>Direct3DCreate9(D3D_SDK_VERSION)</code> for an interface.</li>
        <li>Call <code>CreateDevice</code> with that hidden window
            as the focus window — produces a real device.</li>
        <li>Read its vtable: <code>void** vtbl = *(void***)device;</code></li>
        <li><code>EndScene</code> is at vtable index 42 (well-known D3D9 offset).
            <code>void* endscene = vtbl[42];</code></li>
        <li>Release the device. You only needed it for the address.</li>
      </ol>

      <p>That's exactly the imports CombatArms.dll exposed
      (RegisterClassExA, CreateWindowExA, Direct3DCreate9,
      DestroyWindow) — they're the dummy-window dance.</p>

      <h2>What else render hooks unlock</h2>
      <ul>
        <li><strong>Bone ESP</strong> — project each bone of the enemy's
            skeleton, draw lines between them. Skeleton outlines
            visible through walls.</li>
        <li><strong>Tracers</strong> — line from player crosshair to
            each enemy. Helps with snap-aim.</li>
        <li><strong>Distance / health bars</strong> — text at each
            projected position.</li>
        <li><strong>Crosshair forcing</strong> — a custom crosshair
            drawn dead-center, regardless of the game's setting.</li>
        <li><strong>Field-of-view circles</strong> — debug overlay
            for aimbot FOV, helps tune.</li>
        <li><strong>Spectator warnings</strong> — when a spectator
            joins the game, the overlay shows a banner so you can
            disable cheats temporarily.</li>
      </ul>

      <h2>Defenses that target this</h2>
      <ul>
        <li><strong>Hook detection</strong> — anti-cheat reads the
            first few bytes of EndScene and checks for the JMP
            instruction MinHook installed. Defeated by trampoline
            inlining or by hooking earlier in the call chain.</li>
        <li><strong>VTable integrity</strong> — anti-cheat hashes
            the vtable at startup, re-checks. Vtable swap detected.
            Defeated by patching the function epilogue rather than
            the vtable entry.</li>
        <li><strong>Obscure render path</strong> — modern games use
            D3D11/D3D12, not D3D9. <code>EndScene</code> doesn't
            exist on those — you hook <code>Present</code> on
            <code>IDXGISwapChain</code> instead. Same idea, different
            vtable index.</li>
        <li><strong>Server-side validation of "could the player see
            that enemy?"</strong> — even with a perfect render hook
            showing enemies through walls, server-side culling means
            you can SEE them but can't easily hit them. Combined
            attacks needed (ESP + aimbot prediction).</li>
      </ul>

      <h2>How M26 simulates this</h2>
      <p><code>register_render_hook(fn)</code> pushes fn onto a list
      that <code>AssaultZone._draw()</code> iterates after all the
      game's drawing is done. fn gets the canvas 2D context plus a
      sim helper exposing <code>enemies()</code>,
      <code>player()</code>, <code>tile_size()</code>,
      <code>tile_to_screen(x,y)</code>.</p>

      <p>Mission setup forces the M13 data-side approach to fail:
      <code>render.espVisible</code> is frozen at 0 by simulated
      anti-cheat. The flag flip from M13 bounces. The render hook
      bypasses the whole fight by drawing outside the engine's
      flag-checking code path.</p>

      <p>Win condition explicitly checks both: render hook installed
      AND <code>render.espVisible</code> still 0 (proves the player
      didn't unfreeze the cell — they really used the hook).</p>
    `,
  },
  {
    id: "dll-auto-injection",
    title: "Auto-Injection — How Cheats Load Themselves",
    brief: "The four ways a DLL ends up in the game's process without you babysitting an injector each time.",
    body: `
      <h2>The end state you want</h2>
      <p>Manual injection (CreateRemoteThread + LoadLibraryA from a
      separate loader EXE) is fine for development. For shipping you
      want the cheat to load itself — start the game, your DLL is
      already running by the time the main menu draws. Four common
      patterns get you there, in roughly increasing order of
      sophistication:</p>

      <h2>1. DLL hijacking (the easy classic)</h2>
      <p>Find a DLL the game loads at startup. Replace it with your
      own DLL that:</p>
      <ol>
        <li>Forwards every export to the original (renamed to
            something like <code>SDL_orig.dll</code>).</li>
        <li>Spawns your cheat thread from <code>DllMain</code>.</li>
      </ol>

      <p>For AssaultCube, <code>SDL.dll</code> is a perfect target.
      Rename original → <code>SDL_orig.dll</code>. Your DLL exports
      every SDL function as a forwarder:</p>

      <pre><code>// dllexports.def
LIBRARY SDL
EXPORTS
  SDL_Init = SDL_orig.SDL_Init
  SDL_Quit = SDL_orig.SDL_Quit
  SDL_PollEvent = SDL_orig.SDL_PollEvent
  ... (every export from the real SDL.dll)</code></pre>

      <p>Tools like <strong>DLL Proxy Generator</strong> or
      <strong>Spartacus</strong> auto-generate the .def file from
      the original DLL's exports.</p>

      <p><strong>Pros:</strong> trivial to set up, no injector EXE,
      works on every game launch automatically.<br>
      <strong>Cons:</strong> AC's checksum (or any game's) might
      detect the size/hash mismatch on the patched SDL.dll. Anti-
      cheats sometimes scan loaded module names for known cheat
      DLL signatures.</p>

      <h2>2. AppInit_DLLs / IFEO injection (Windows-wide)</h2>
      <p>Windows has a registry key that auto-loads a DLL into every
      user-mode process:</p>
      <pre><code>HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Windows
  AppInit_DLLs = "C:\\path\\to\\cheat.dll"
  LoadAppInit_DLLs = 1</code></pre>

      <p>Or per-EXE via Image File Execution Options:</p>
      <pre><code>HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\ac_client.exe
  AppCertDlls or shim ...</code></pre>

      <p><strong>Pros:</strong> survives game updates that replace
      DLLs.<br>
      <strong>Cons:</strong> Requires admin, very visible to AV /
      EDR, modern Windows defaults to ignoring AppInit_DLLs unless
      Secure Boot is off.</p>

      <h2>3. Loader EXE that watches for the process</h2>
      <p>A small <code>watcher.exe</code> sits running in the
      background, polls the process list every second:</p>
      <pre><code>// watcher.cpp — runs as a tray app or hidden window
while (true) {
    DWORD pid = find_pid("ac_client.exe");
    if (pid && !already_injected) {
        Sleep(2000);   // let game finish init
        inject(pid, "cheat.dll");
        already_injected = true;
    }
    if (!pid) already_injected = false;
    Sleep(500);
}</code></pre>

      <p><strong>Pros:</strong> no game-folder modifications,
      survives updates that change DLL hashes, easy to develop.<br>
      <strong>Cons:</strong> watcher process is visible in Task
      Manager, requires user to run it (or set as a startup item).</p>

      <h2>4. Process hollowing (the heavy option)</h2>
      <p>Start the game in suspended mode, replace its loaded image
      with your own modified version that has the cheat code baked
      in, resume.</p>

      <pre><code>STARTUPINFOA si = { sizeof(si) };
PROCESS_INFORMATION pi;
CreateProcessA("ac_client.exe", nullptr, nullptr, nullptr, FALSE,
               CREATE_SUSPENDED, nullptr, nullptr, &si, &pi);
// Modify pi.hProcess's memory (unmap, replace, fix entry point)
ResumeThread(pi.hThread);</code></pre>

      <p><strong>Pros:</strong> Process appears 'clean' to most
      detection (no extra threads, no extra modules, no remote
      writes after launch).<br>
      <strong>Cons:</strong> Hard to write, easy to crash the game,
      requires deep PE format knowledge.</p>

      <h2>5. Manual mapping (no LoadLibrary trace)</h2>
      <p>Don't call <code>LoadLibrary</code> at all. Allocate
      memory in the target, write the DLL bytes there, manually
      perform import resolution + relocation fixups + call DllMain.
      The DLL never appears in the loaded module list — anti-cheat
      scans that enumerate modules see nothing.</p>

      <p><strong>Pros:</strong> Best stealth.<br>
      <strong>Cons:</strong> ~200 lines of careful PE-parsing code.
      Worth it for serious cheats; overkill for AC practice.</p>

      <h2>How M25 simulates this</h2>
      <p>Every successful DLL compile saves the source string to
      <code>localStorage</code>. Missions with
      <code>autoInject: true</code> read that source on launch,
      pre-fill the editor, compile + inject before <code>start()</code>
      runs. By the time the mission's gauntlet begins, the DLL is
      already running.</p>

      <p>That maps to options #1 (DLL hijacking) and #3 (loader-on-
      startup) in the table above — the practical patterns most
      hobby cheats actually ship with.</p>

      <h2>Defenses against auto-injection</h2>
      <ul>
        <li><strong>Module signature scanning</strong> — anti-cheat
            walks the loaded module list at startup, hashes each one,
            compares against a known-good list. DLL hijacking gets
            caught here.</li>
        <li><strong>Loader process detection</strong> — anti-cheat
            looks for processes with names matching known cheat
            loaders. Watcher EXE pattern gets caught.</li>
        <li><strong>Code segment integrity check</strong> — game's
            own .text bytes get CRC'd. Manual mapping that doesn't
            patch the game still passes; mapping that does fails.</li>
        <li><strong>Kernel-mode driver protection</strong> — Easy
            Anti-Cheat / BattlEye / Vanguard run in ring 0, can see
            user-mode operations the game itself can't. Beats
            everything in this list except the most advanced
            kernel-side bypasses (out of scope here).</li>
      </ul>

      <p>For AssaultCube and similar offline-friendly targets, you
      don't fight any of this. DLL hijacking via SDL.dll is fine.
      For competitive online games, the auto-inject pattern is
      where most amateur cheats die.</p>
    `,
  },
  {
    id: "real-world-bridge-assaultcube",
    title: "Real-World Bridge — From the Simulator to AssaultCube",
    brief: "The whole stack. Visual Studio setup, DllMain skeleton, AC offsets, menu, ESP, code patching — actual buildable C++.",
    body: `
      <h2>What this article is</h2>
      <p>You've completed M01-M23 in the simulator. Every concept maps
      to a real technique you can use against an actual game. This
      article is the bridge: the toolchain, the project layout, the
      C++ code, and the AssaultCube-specific offsets you need to
      ship something equivalent.</p>

      <p><strong>Target:</strong> AssaultCube — open-source FPS,
      single-player or local-network, freely available at
      assault.cubers.net. Picked because it's open source (you can
      grade your own work against the headers), runs well, and has a
      decade of community reverse-engineering tutorials behind it.
      Don't run cheats on online servers without consent — bot
      servers and offline matches only.</p>

      <h2>1. The toolchain</h2>
      <ul>
        <li><strong>Visual Studio Community</strong> (free, any version
            2017+). For maximum CAEU-style compatibility, install the
            "Desktop development with C++" workload + the "MSVC v141
            (or v142) - VS xxxx C++ x86/x64 build tools" component.</li>
        <li><strong>DirectX 9 SDK (June 2010)</strong> — Microsoft
            archive. Needed for D3DX9 functions used by ESP rendering.
            Installs to <code>C:\\Program Files (x86)\\Microsoft DirectX SDK (June 2010)\\</code>.</li>
        <li><strong>MinHook</strong> or <strong>Detours</strong> — for
            hooking the game's <code>EndScene</code> / <code>Present</code>
            functions. MinHook is MIT-licensed, header + small static lib.
            <code>github.com/TsudaKageyu/minhook</code></li>
        <li><strong>ImGui</strong> (optional but recommended) — drop-in
            menu UI library. <code>github.com/ocornut/imgui</code> +
            the <code>imgui_impl_dx9.cpp</code> backend.</li>
        <li><strong>AssaultCube</strong> — assault.cubers.net. Install
            it, run <code>ac_client.exe</code> at least once.</li>
      </ul>

      <h2>2. Project setup (Visual Studio, .vcxproj)</h2>
      <p>File → New → Project → Empty Project (C++).</p>
      <p>Project Properties (set for both Debug and Release, x86 / Win32):</p>
      <ul>
        <li><strong>General → Configuration Type</strong>: Dynamic Library (.dll)</li>
        <li><strong>VC++ Directories → Include Directories</strong>:
            add <code>$(DXSDK_DIR)Include</code> + your minhook /
            imgui include paths</li>
        <li><strong>VC++ Directories → Library Directories</strong>:
            add <code>$(DXSDK_DIR)Lib\\x86</code> + minhook lib path</li>
        <li><strong>Linker → Input → Additional Dependencies</strong>:
            <code>d3d9.lib;d3dx9.lib;user32.lib;libMinHook.x86.lib</code></li>
        <li><strong>C/C++ → Code Generation → Runtime Library</strong>:
            <code>Multi-threaded (/MT)</code> if you want a portable
            self-contained DLL, <code>(/MD)</code> if you don't mind
            requiring the C++ runtime on the host.</li>
      </ul>

      <p>Or skip the IDE and build with cl.exe directly:</p>
      <pre><code>cl /LD /EHsc /MT /I"%DXSDK_DIR%Include" \\
   cheat.cpp menu.cpp esp.cpp hooks.cpp \\
   /link /LIBPATH:"%DXSDK_DIR%Lib\\x86" \\
        d3d9.lib d3dx9.lib user32.lib kernel32.lib \\
        /OUT:cheat.dll</code></pre>

      <h2>3. The DllMain skeleton</h2>
      <p>Mirrors exactly what the M21 simulator template does:</p>
      <pre><code>// cheat.cpp
#include &lt;windows.h&gt;
#include &lt;process.h&gt;

void cheat_main(void*);   // forward declaration

BOOL WINAPI DllMain(HINSTANCE hinst, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hinst);
        _beginthread(cheat_main, 0, nullptr);
    }
    return TRUE;
}</code></pre>

      <p>That's the exact disassembly pattern you saw in the PE dump's
      entry point: <code>cmp [ebp+0xc], 1</code> is the
      <code>reason == DLL_PROCESS_ATTACH</code> check, and the
      <code>call</code> below it goes to the function that spawns
      <code>_beginthread</code>.</p>

      <h2>4. The cheat thread loop</h2>
      <pre><code>#include &lt;windows.h&gt;

void cheat_main(void*) {
    // Wait for the game to be fully initialised. AC takes a couple
    // of seconds to load before the player struct exists.
    Sleep(3000);

    while (true) {
        // Menu hotkey toggle (matches M23 simulator pattern).
        if (GetAsyncKeyState(VK_DELETE) & 1) {
            menu_visible = !menu_visible;
        }

        // Always-on cheats (run regardless of menu state).
        if (cheats.god_mode) {
            apply_god_mode();
        }
        if (cheats.infinite_ammo) {
            apply_infinite_ammo();
        }

        Sleep(16);   // ~60Hz, same cadence the game runs
    }
}</code></pre>

      <p>The <code>GetAsyncKeyState(VK_DELETE) & 1</code> idiom returns
      true only on the rising edge — same key being held doesn't
      keep toggling. <code>VK_DELETE</code> is 0x2E. For INSERT use
      0x2D, F11 is 0x7A.</p>

      <h2>5. AssaultCube offsets (1.2 / r2935)</h2>
      <p>These have been stable for years across AC 1.2 builds.
      Verify via Cheat Engine on your install before relying:</p>

      <table style="width:100%; border-collapse:collapse; margin: 0.5rem 0; font-family: ui-monospace, Menlo, monospace; font-size: 0.85em;">
        <tr><th style="text-align:left; padding:0.3em 0;">Field</th><th style="text-align:left; padding:0.3em 0;">Address / Offset</th></tr>
        <tr><td>Local player struct pointer</td><td><code>ac_client.exe + 0x0010F4F4</code></td></tr>
        <tr><td>Local player HP</td><td><code>[player] + 0xEC</code></td></tr>
        <tr><td>Local player armor</td><td><code>[player] + 0xF0</code></td></tr>
        <tr><td>Local player position (Vec3 floats)</td><td><code>[player] + 0x4</code></td></tr>
        <tr><td>Local player ammo (current weapon)</td><td><code>[player] + 0x140</code></td></tr>
        <tr><td>Team (0 = CLA, 1 = RVSF)</td><td><code>[player] + 0x32C</code></td></tr>
        <tr><td>Entity list pointer (all players)</td><td><code>ac_client.exe + 0x0018AC04</code></td></tr>
        <tr><td>Entity count</td><td><code>ac_client.exe + 0x0018AC0C</code></td></tr>
        <tr><td>View matrix (for ESP)</td><td><code>ac_client.exe + 0x0017DFD0</code></td></tr>
      </table>

      <p>That's the same shape as M16 STRUCT DISCOVERY in the simulator:
      one base pointer, every stat at a known offset.</p>

      <h2>6. Reading + writing memory (internal DLL — fast path)</h2>
      <p>Because the DLL lives inside <code>ac_client.exe</code>, no
      <code>WriteProcessMemory</code> needed — direct pointer
      dereferences:</p>

      <pre><code>uintptr_t base = (uintptr_t)GetModuleHandleA("ac_client.exe");
uintptr_t player = *(uintptr_t*)(base + 0x10F4F4);

if (player) {
    int* hp   = (int*)(player + 0xEC);
    int* ammo = (int*)(player + 0x140);

    *hp = 100;       // M2 freeze, native-speed
    *ammo = 99;      // M10 infinite ammo
}</code></pre>

      <p>That's the C++ equivalent of the M21 simulator template's
      <code>write_label("player.hp", 100)</code>. No syscall, no IPC
      roundtrip — direct memory access at game speed.</p>

      <h2>7. Code patching with VirtualProtect (M22 in C++)</h2>
      <p>NOPing an instruction in a real game means writing
      <code>0x90</code> bytes to the .text section, which is
      page-protected as read-only-execute. You unlock it with
      <code>VirtualProtect</code>, write the patch, restore.</p>

      <pre><code>// Patch the bleed/damage instruction. Address comes from CE's
// 'Find what writes to this address' workflow.
void nop_bytes(void* addr, size_t count) {
    DWORD old_protect;
    VirtualProtect(addr, count, PAGE_EXECUTE_READWRITE, &old_protect);
    memset(addr, 0x90, count);
    VirtualProtect(addr, count, old_protect, &old_protect);
}

// Usage — say CE shows the damage instruction at ac_client.exe + 0x4F8A2:
uintptr_t base = (uintptr_t)GetModuleHandleA("ac_client.exe");
nop_bytes((void*)(base + 0x4F8A2), 3);   // sub [reg], imm = 3 bytes</code></pre>

      <p>Restore: save the original 3 bytes before NOPing, write them
      back when you want the damage to work again.</p>

      <h2>8. World-to-screen for ESP (D3DXVec3Project)</h2>
      <p>This is the math that makes ESP boxes line up with players.
      Take a 3D world position, project it through the game's view +
      projection matrices, get a 2D screen pixel. Once you have the
      screen pixel, you can draw a box / text / line to it.</p>

      <pre><code>#include &lt;d3dx9.h&gt;

bool world_to_screen(D3DXVECTOR3 world, D3DXVECTOR3& screen,
                     D3DXMATRIX view_proj, int width, int height) {
    D3DXVec3Project(&screen, &world,
                    nullptr,           // viewport (use defaults below)
                    nullptr,
                    nullptr,
                    &view_proj,
                    width, height);
    // Behind the camera? screen.z > 1.0 means behind, skip.
    return screen.z &lt; 1.0f;
}</code></pre>

      <p>You get the view-projection matrix by reading
      <code>ac_client.exe + 0x17DFD0</code> as a
      <code>D3DXMATRIX</code> (16 floats / 64 bytes). Iterate the
      entity list, project each enemy's position, draw at the
      resulting screen coords.</p>

      <h2>9. Hooking DirectX EndScene (where you draw the menu)</h2>
      <p>EndScene is called by the game once per frame, right before
      it presents the back buffer. Hooking it lets you draw your
      stuff (menu, ESP, watermarks) <em>after</em> the game has
      drawn its frame but <em>before</em> the player sees it.</p>

      <p>Using MinHook:</p>
      <pre><code>#include &lt;d3d9.h&gt;
#include "MinHook.h"

typedef HRESULT(__stdcall* EndScene_t)(IDirect3DDevice9*);
EndScene_t oEndScene = nullptr;

HRESULT __stdcall hkEndScene(IDirect3DDevice9* device) {
    static bool init = false;
    if (!init) {
        // First call — set up our font, ImGui, whatever needs the device.
        D3DXCreateFontA(device, 14, 0, FW_NORMAL, 1, FALSE,
                        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                        DEFAULT_QUALITY, DEFAULT_PITCH | FF_DONTCARE,
                        "Arial", &g_font);
        init = true;
    }

    // Draw your overlay here.
    if (menu_visible) draw_menu(device);
    draw_esp(device);

    return oEndScene(device);   // call the original so the game frame still presents
}

void install_hook() {
    // Get the EndScene address from a dummy D3D9 device, then redirect.
    void* endscene_addr = get_endscene_via_dummy_device();
    MH_Initialize();
    MH_CreateHook(endscene_addr, &hkEndScene, (void**)&oEndScene);
    MH_EnableHook(endscene_addr);
}</code></pre>

      <p>The "dummy D3D9 device" pattern is a 30-line helper that
      creates an invisible D3D9 device just to read the EndScene
      function pointer out of its vtable, then immediately destroys
      it. Search "directx9 endscene hook vftable" for the standard
      implementation.</p>

      <h2>10. Drawing the menu (ImGui or hand-rolled)</h2>
      <p>If you use ImGui (recommended):</p>
      <pre><code>#include "imgui.h"
#include "backends/imgui_impl_dx9.h"
#include "backends/imgui_impl_win32.h"

// In hkEndScene, after the init block:
ImGui_ImplDX9_NewFrame();
ImGui_ImplWin32_NewFrame();
ImGui::NewFrame();

if (menu_visible) {
    ImGui::Begin("Cheat");
    ImGui::Checkbox("Infinite HP", &cheats.god_mode);
    ImGui::Checkbox("Infinite Ammo", &cheats.infinite_ammo);
    ImGui::Checkbox("ESP", &cheats.esp);
    ImGui::SliderInt("Damage", &cheats.weapon_damage, 1, 999);
    ImGui::End();
}

ImGui::EndFrame();
ImGui::Render();
ImGui_ImplDX9_RenderDrawData(ImGui::GetDrawData());</code></pre>

      <p>That's the M23 simulator pattern in C++. Each
      <code>Checkbox</code> bound to a global, the always-on loop in
      <code>cheat_main</code> reads those globals and applies the
      corresponding writes.</p>

      <h2>11. The injector (separate EXE)</h2>
      <p>You ship two files: <code>cheat.dll</code> (the payload above)
      and a small <code>loader.exe</code> that injects it. Simplest
      injector — CreateRemoteThread + LoadLibraryA:</p>

      <pre><code>// loader.cpp
#include &lt;windows.h&gt;
#include &lt;tlhelp32.h&gt;
#include &lt;cstdio&gt;

DWORD find_pid(const char* name) {
    PROCESSENTRY32 pe = { sizeof(pe) };
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    for (BOOL ok = Process32First(snap, &pe); ok; ok = Process32Next(snap, &pe)) {
        if (_stricmp(pe.szExeFile, name) == 0) {
            CloseHandle(snap); return pe.th32ProcessID;
        }
    }
    CloseHandle(snap); return 0;
}

int main(int argc, char** argv) {
    DWORD pid = find_pid("ac_client.exe");
    if (!pid) { puts("AC not running"); return 1; }

    char dll_path[MAX_PATH];
    GetFullPathNameA("cheat.dll", MAX_PATH, dll_path, nullptr);

    HANDLE proc = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
    LPVOID arg = VirtualAllocEx(proc, nullptr, strlen(dll_path) + 1,
                                MEM_COMMIT, PAGE_READWRITE);
    WriteProcessMemory(proc, arg, dll_path, strlen(dll_path) + 1, nullptr);

    LPTHREAD_START_ROUTINE load = (LPTHREAD_START_ROUTINE)
        GetProcAddress(GetModuleHandleA("kernel32.dll"), "LoadLibraryA");

    HANDLE thread = CreateRemoteThread(proc, nullptr, 0,
                                       load, arg, 0, nullptr);
    WaitForSingleObject(thread, INFINITE);
    CloseHandle(thread); CloseHandle(proc);
    puts("injected");
    return 0;
}</code></pre>

      <p>Build with <code>cl loader.cpp /link kernel32.lib</code>.
      Run AC, then run <code>loader.exe</code>. DllMain fires inside
      ac_client.exe, _beginthread spawns the cheat thread, you're in.</p>

      <h2>12. Auto-injection (the M22+ direction)</h2>
      <p>For convenience, replace a DLL the game loads on startup
      (DLL hijacking). AC loads <code>SDL.dll</code>. Rename your
      cheat to <code>SDL.dll</code>, rename the original to
      <code>SDL_orig.dll</code>, have your DllMain forward all
      exports to <code>SDL_orig.dll</code> after spawning the cheat
      thread. Now starting AC auto-loads your DLL.</p>

      <p>Look up "DLL proxy generator" tools — they auto-generate the
      forwarding stubs from the original DLL's exports.</p>

      <h2>13. The full simulator-to-C++ map</h2>
      <table style="width:100%; border-collapse:collapse; margin: 0.5rem 0; font-size: 0.9em;">
        <tr><th style="text-align:left; padding:0.3em 0;">Sim mission</th><th style="text-align:left; padding:0.3em 0;">Real C++ technique</th></tr>
        <tr><td>M01-M05 cell freeze</td><td><code>*(int*)addr = value;</code> in cheat thread loop</td></tr>
        <tr><td>M06 watchdog</td><td>Anti-cheat CRC check on .text — bypass via NOPing the check</td></tr>
        <tr><td>M07 aimbot crosshair</td><td>Iterate entity list, find closest enemy, write enemy.id to crosshair cell</td></tr>
        <tr><td>M08 pointer scan</td><td>Hardcoded multi-level chains: <code>*(int*)(*(int*)(base + offset1) + offset2)</code></td></tr>
        <tr><td>M09 manual address</td><td>Iterate entity list with <code>base + i * sizeof(Player)</code></td></tr>
        <tr><td>M11/M14 weapon stats</td><td>Hardcoded <code>weapon_struct + offset</code> writes</td></tr>
        <tr><td>M13 wallhack flag</td><td>Render-config bool flip OR (better) D3D9 EndScene hook</td></tr>
        <tr><td>M16 struct discovery</td><td>Reverse the player struct in CE, write a C struct that mirrors it</td></tr>
        <tr><td>M17 multi-level chains</td><td>Same as M08 above, with extra dereference levels</td></tr>
        <tr><td>M18-M20 server-side</td><td>Find the local cache cell, freeze. Or hook the recv() call to drop death packets.</td></tr>
        <tr><td>M21 internal cheat</td><td>The whole DLL — DllMain + _beginthread + cheat_main loop</td></tr>
        <tr><td>M22 NOP code</td><td><code>VirtualProtect</code> + <code>memset(addr, 0x90, n)</code></td></tr>
        <tr><td>M23 cheat menu</td><td>ImGui Checkbox bound to global, cheat_main reads global each tick</td></tr>
      </table>

      <h2>14. Where to go from here</h2>
      <ul>
        <li><strong>UnknownCheats AssaultCube section</strong> — decade
            of public source releases for AC. Read the source, see
            how each technique was implemented.</li>
        <li><strong>GuidedHacking starter project</strong> — fully-
            working AC trainer with menu, ESP, aimbot. Compile it,
            run it, then re-read its source after this article.</li>
        <li><strong>cherrytree's Game Hacking Bible</strong> + the AC
            chapters specifically.</li>
        <li>The book <em>Game Hacking</em> by Nick Cano (No Starch).
            Whole chapters dedicated to the techniques M01-M22 cover.</li>
      </ul>

      <p><strong>Final note on ethics</strong>: AssaultCube is open
      source and well-suited for solo / local-network practice.
      Don't run anything you build against online competitive servers
      (their players didn't consent to being targets). The whole
      point of an open-source target is that you can practice freely
      without harming anyone.</p>
    `,
  },
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
