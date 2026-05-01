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

// Display order. Mission file names stay as mission-NN.js for stability,
// but the array position determines where each appears in the contracts
// list (and which "M01..M48" badge is shown). We sometimes reorder to
// put a teaching mission right after the one it builds on, even when
// its file was added later. Internal IDs (m47 etc) never change, so
// saved progress in localStorage is preserved across reorderings.
export const MISSIONS = [
  mission01, mission02, mission03, mission04, mission05,
  mission06, mission07, mission08,
  mission48,    // STATIC BASE DISCOVERY — natural follow-up to M08 ptr scan
  mission50,    // LITHTECH ENGINE CALLS — once you can find addresses (M48), call them
  mission51,    // SERVER-TRUSTED COMMAND IDS — magic packet exploit, the LithTech ID_God_Mode pattern
  mission52,    // PATCH-RENAME ANTI-PATTERN — Nexon's failed fix strategy (153//404//200)
  mission53,    // (DEFENSIVE) AUTH ON PRIVILEGED HANDLERS — the only correct fix
  mission09,
  mission10, mission11, mission12,
  mission13, mission14, mission15,
  mission16, mission17, mission18, mission19, mission20,
  mission21, mission22, mission23, mission24,
  mission47,    // DLL ANATOMY — taught here so M24's template makes sense
  mission25, mission26, mission27, mission28, mission29,
  mission30, mission31, mission32,
  mission33, mission34, mission35, mission36,
  mission37, mission38, mission39, mission40,
  mission49,    // OUT-OF-PIPELINE ESP — GPU framebuffer capture bypass, follows spectator detection
  mission41, mission42, mission43, mission44, mission45, mission46,
];
export const MISSIONS_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));
