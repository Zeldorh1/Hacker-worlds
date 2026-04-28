import { mission01 } from "./mission-01.js";
import { mission02 } from "./mission-02.js";

export const MISSIONS = [mission01, mission02];
export const MISSIONS_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));
