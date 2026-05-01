import { mission01 } from "./mission-01.js";
import { mission02 } from "./mission-02.js";
import { mission03 } from "./mission-03.js";
import { mission04 } from "./mission-04.js";
import { mission05 } from "./mission-05.js";
import { mission06 } from "./mission-06.js";
import { mission07 } from "./mission-07.js";
import { mission08 } from "./mission-08.js";
import { mission09 } from "./mission-09.js";
import { mission10 } from "./mission-10.js";
import { mission11 } from "./mission-11.js";
import { mission12 } from "./mission-12.js";
import { mission13 } from "./mission-13.js";
import { mission14 } from "./mission-14.js";
import { mission15 } from "./mission-15.js";
import { mission16 } from "./mission-16.js";
import { mission17 } from "./mission-17.js";
import { mission18 } from "./mission-18.js";
import { mission19 } from "./mission-19.js";
import { mission20 } from "./mission-20.js";
import { mission21 } from "./mission-21.js";
import { mission22 } from "./mission-22.js";
import { mission23 } from "./mission-23.js";
import { mission24 } from "./mission-24.js";
import { mission25 } from "./mission-25.js";
import { mission26 } from "./mission-26.js";
import { mission27 } from "./mission-27.js";
import { mission28 } from "./mission-28.js";
import { mission29 } from "./mission-29.js";
import { mission30 } from "./mission-30.js";
import { mission31 } from "./mission-31.js";
import { mission32 } from "./mission-32.js";
import { mission33 } from "./mission-33.js";
import { mission34 } from "./mission-34.js";
import { mission35 } from "./mission-35.js";
import { mission36 } from "./mission-36.js";
import { mission37 } from "./mission-37.js";
import { mission38 } from "./mission-38.js";
import { mission39 } from "./mission-39.js";
import { mission40 } from "./mission-40.js";
import { mission41 } from "./mission-41.js";
import { mission42 } from "./mission-42.js";
import { mission43 } from "./mission-43.js";
import { mission44 } from "./mission-44.js";
import { mission45 } from "./mission-45.js";
import { mission46 } from "./mission-46.js";
import { mission47 } from "./mission-47.js";
import { mission48 } from "./mission-48.js";
import { mission49 } from "./mission-49.js";
import { mission50 } from "./mission-50.js";
import { mission51 } from "./mission-51.js";
import { mission52 } from "./mission-52.js";
import { mission53 } from "./mission-53.js";
import { mission54 } from "./mission-54.js";
import { mission55 } from "./mission-55.js";
import { mission56 } from "./mission-56.js";
import { mission58 } from "./mission-58.js";
import { mission59 } from "./mission-59.js";
import { mission64 } from "./mission-64.js";
import { mission65 } from "./mission-65.js";
import { mission66 } from "./mission-66.js";
import { mission70 } from "./mission-70.js";
import { mission71 } from "./mission-71.js";
import { mission72 } from "./mission-72.js";

// Display order. Mission file names stay as mission-NN.js for stability,
// but the array position determines where each appears in the contracts
// list (and which "M01..M48" badge is shown). We sometimes reorder to
// put a teaching mission right after the one it builds on, even when
// its file was added later. Internal IDs (m47 etc) never change, so
// saved progress in localStorage is preserved across reorderings.
//
// CURRICULUM TRACKS:
//   TRACK 1 — FOUNDATION (find addresses):  M01-M08 + base discovery
//   TRACK 2 — FEATURES (build cheats with the addresses you found):
//             everything from M09 onward — DLL code patterns, render
//             hooks, packet hooks, byte patching, engine calls,
//             multi-field packets, server-trust exploits
//   TRACK 3 — SYSTEMS (deeper systems programming): mostly Codex
//             articles — Windows API, PE format, manual mapping,
//             D3D pipeline, IDA/x64dbg/ReClass workflows
export const MISSIONS = [
  // ============================================================
  // TRACK 1 — FOUNDATION: finding addresses (Cheat Engine workflow)
  // ============================================================
  mission01, mission02, mission03, mission04, mission05,
  mission06, mission07, mission08,
  mission48,    // STATIC BASE DISCOVERY — module + offset workflow

  // ============================================================
  // TRACK 2 — FEATURES: writing code that USES those addresses
  // ============================================================
  // -- Engine function calls + server-trust exploits
  mission50,    // LITHTECH ENGINE CALLS — typedef + ADDR cast + invoke
  mission51,    // SERVER-TRUSTED COMMAND IDS — single-byte magic packets
  mission66,    // MULTI-FIELD PACKETS — CAutoMessage typed-field builder
  mission52,    // PATCH-RENAME ANTI-PATTERN — Nexon's failed fix strategy
  mission53,    // (DEFENSIVE) AUTH ON PRIVILEGED HANDLERS — the only correct fix

  // -- Cell-level cheats (HP, ammo, weapons)
  mission09,
  mission10, mission11, mission12,
  mission13, mission14, mission15,
  mission16, mission17,
  mission64,    // BYTE PATCHING — \x90 NOP / \xC3 RET, the NORECOIL/NORELOAD pattern

  // -- Player-state cheats (death/respawn/position)
  mission18, mission19, mission20,

  // -- Anti-cheat awareness + DLL fundamentals
  mission21, mission22, mission23, mission24,
  mission47,    // DLL ANATOMY — annotated C++ skeleton
  mission25, mission26,

  // -- Render-side cheats (ESP variants)
  mission55,    // CHAMS + SKELETON ESP — render-hook variants beyond M26
  mission56,    // WIREFRAME WALLS — render-state manipulation
  mission27, mission28, mission29,

  // -- Network / server-state cheats
  mission30, mission31, mission32,
  mission33, mission34, mission35, mission36,
  mission37,
  mission59,    // LAG WALK / DESYNC — drop outgoing position packets
  mission38,
  mission54,    // GHOST AIM — packet target rewrite
  mission58,    // OPK — damage packet injection
  mission39, mission40,
  mission49,    // OUT-OF-PIPELINE ESP — GPU framebuffer capture bypass

  // -- Engine API abuse + advanced movement
  mission41, mission42, mission43,
  mission65,    // GHOST MODE — FLAG_SOLID + camera-update RET-patch
  mission44, mission45, mission46,

  // ============================================================
  // TRACK 4 — BUILD YOUR OWN TRAINER: chained capstone arc.
  // Each mission grows the same trainer template. By the end the
  // player has authored a multi-feature toggle-menu trainer.
  // ============================================================
  mission70,    // STAGE 1: Single-address freeze (your first cheat)
  mission71,    // STAGE 2: Add a toggle (register_cheat menu entry)
  mission72,    // STAGE 3: Multi-feature menu (4 toggles in one cheat)
  // M73-M74: DIY canvas menu, save/load — coming next batch

  // ============================================================
  // TRACK 3 — SYSTEMS: see Codex for Windows API, PE format,
  // manual mapping, D3D pipeline, IDA/x64dbg/ReClass workflows
  // ============================================================
];
export const MISSIONS_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));
