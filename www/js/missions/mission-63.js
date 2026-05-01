// Mission 63 — INFO ESP (rank / metadata overlay)
//
// M55 chams replaced enemy pixels with flat color. M63 adds the
// information layer real cheats ship: name, HP, distance, weapon,
// rank, kills, etc. — stacked text labels over each enemy.
//
// Reference (from leaked Combat Arms cheat code, sanitized):
//   if (Variable.ESPRank) {
//       sprintf(szRank, "Rank : [%s]", GetRankName(player->index));
//       Menu->DrawText(pDevice, x, y + 25, color, szRank);
//   }
//
// Pattern: per enemy, draw a vertical stack of text labels at
// fixed Y-offsets. Each line is one metadata field. The cheat
// looks up the metadata via the engine's player struct and
// resolves human-readable values from static tables (rank index
// → rank name).
//
// In our simulator: each sim NPC has metadata fields (name, hp,
// rank index → looked up in a static rank table). The render hook
// reads them and stacks the text per enemy.
//
// Mission flow:
//   1. Render hook installed, draws stacked labels per enemy:
//      - Name
//      - HP / max
//      - Distance from player
//      - Rank (looked up from static table)
//   2. Camouflage on so enemies need ESP to be useful at all
//   3. Win: 4 enemies dropped with the info ESP active
//      (verified by render hooks count + kill count)

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M63 — Info ESP (stacked metadata overlay).
//
// Render hook draws per-enemy text stack. Real cheats lookup
// metadata via the engine's player struct + static name tables.
// Simulator equivalent: sim_enemies() returns per-NPC fields,
// plus a static rank table for name lookup.

const RANK_NAMES = [
  "Trainee", "Recruit", "Private", "Corporal",
  "Sergeant", "Staff Sgt", "Master Sgt", "Captain"
];

function rank_name(idx) {
  return (idx >= 0 && idx < RANK_NAMES.length) ? RANK_NAMES[idx] : "Unknown";
}

void onInject() {
  log("Installing info-ESP render hook (name / HP / dist / rank)");

  register_render_hook(function(ctx, sim) {
    const T = sim.tile_size();
    const player = sim.player();
    const enemies = sim.enemies();

    for (const e of enemies) {
      if (!e.alive) continue;
      const [px, py] = sim.tile_to_screen(e.x, e.y);

      // Box outline around enemy (M26 base)
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, T, T);

      // Stacked text labels above the box.
      ctx.font = "10px ui-monospace, Menlo, monospace";
      const lines = [
        e.name,
        "HP: " + e.hp,
        "Dist: " + Math.round(Math.sqrt(
          (e.x - player.x) ** 2 + (e.y - player.y) ** 2)),
        "Rank: " + rank_name((e.id - 1) % 8),
      ];

      // Background box for readability.
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(px - 2, py - 4 - lines.length * 11, 90, lines.length * 11 + 2);

      // Draw each line.
      ctx.fillStyle = "#22d3ee";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], px, py - 6 - (lines.length - 1 - i) * 11);
      }
    }
  });
}

void onTick() { }
`;

export const mission63 = {
  id: "m63",
  title: "INFO ESP (RANK / METADATA)",
  brief: "Beyond box ESP. Stacked text labels per enemy: name, HP, distance, rank — real cheats' info layer.",
  prerequisites: ["m55"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🏷",
    title: "INFO ESP — METADATA OVERLAY",
    body: `M26 / M55 drew shapes (boxes, chams). M63 adds the
INFORMATION layer real cheats ship.

Reference from a leaked Combat Arms cheat (sanitized):

  if (Variable.ESPRank) {
      sprintf(szRank, "Rank : [%s]",
              GetRankName(player->index));
      Menu->DrawText(pDevice, x, y + 25, color, szRank);
  }

Pattern: per enemy, draw a vertical stack of text
labels — name, HP, distance, weapon, rank, kills.
Each line at a fixed Y-offset. Metadata read from
the engine's player struct + static name tables
(rank index → rank string).

Goal of info ESP isn't combat advantage — it's
TARGET PRIORITIZATION. Pick the high-rank enemy
first. Avoid the one with full HP. Engage the
short-distance threat. The boxes tell you WHERE
they are; info ESP tells you WHO they are.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template draws stacked text per enemy: name / HP / dist / rank. Compile + Inject. Tab to ac_anomaly to see overlay.",
    },
    {
      id: "kill-with-info",
      when: ({ target, dllState }) =>
        dllState.running && target.killCount < 4,
      say: "Info ESP is live — every enemy has a metadata stack above their box. Use the rank/HP info to pick targets, fire, drop them. 4 kills closes.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableCamouflage();
    target.player.ammo = 200;
    target._m63StartKills = target.killCount;

    dialog.script("VEX", [
      "Boxes alone aren't enough at high tiers — you want to know WHO's in front of you. Real cheats render metadata stacks: name, HP, distance, rank, weapon, K/D ratio.",
      "Template gives you a 4-line stack: name, HP, distance, rank. Rank is looked up from a static table (RANK_NAMES) by enemy ID — same workflow as the real Combat Arms cheat code that did sprintf('Rank : [%s]', GetRankName(player->index)).",
      "Compile + inject. Each enemy now has a 4-line label above their box. Use the rank info for prioritization (high-rank first, low-rank last).",
      "4 kills with the info ESP active to close.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const dll = window.__hw && window.__hw.dll;
      if (!dll) return;
      const kills = target.killCount - target._m63StartKills;
      if (kills >= 4 && dll.renderHooks.length > 0) {
        done = true;
        complete("4 kills with info ESP. Stacked metadata overlay = same architecture every commercial cheat ships for target prioritization. Real cheats just have more lines in the stack.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
