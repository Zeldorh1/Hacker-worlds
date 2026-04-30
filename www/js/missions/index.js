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

export const MISSIONS = [
  mission01, mission02, mission03, mission04, mission05,
  mission06, mission07, mission08, mission09,
  mission10, mission11, mission12,
  mission13, mission14, mission15,
  mission16, mission17, mission18, mission19, mission20,
  mission21, mission22, mission23,
];
export const MISSIONS_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));
