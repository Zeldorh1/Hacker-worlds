import { mission01 } from "./mission-01.js";
import { mission02 } from "./mission-02.js";
import { mission03 } from "./mission-03.js";

export const MISSIONS = [mission01, mission02, mission03];
export const MISSIONS_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));
