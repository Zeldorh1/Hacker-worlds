import { mission01 } from "./mission-01.js";
import { mission02 } from "./mission-02.js";
import { mission03 } from "./mission-03.js";
import { mission04 } from "./mission-04.js";
import { mission05 } from "./mission-05.js";
import { mission06 } from "./mission-06.js";
import { mission07 } from "./mission-07.js";
import { mission08 } from "./mission-08.js";
import { mission09 } from "./mission-09.js";

export const MISSIONS = [
  mission01, mission02, mission03, mission04, mission05,
  mission06, mission07, mission08, mission09,
];
export const MISSIONS_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));
