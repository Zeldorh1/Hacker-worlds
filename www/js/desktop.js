// Contracts hub — Hacknet-style mission browser.

import { MISSIONS } from "./missions/index.js";
import { missionState } from "./mission-state.js";

export class Desktop {
  constructor(root, { onLaunch }) {
    this.root = root;
    this.onLaunch = onLaunch;
    this.$list     = root.querySelector("#contract-list");
    this.$progress = root.querySelector("#hub-progress");
    this.$reset    = root.querySelector("#btn-reset-progress");

    this.$reset.addEventListener("click", () => {
      if (confirm("Reset all mission progress?")) {
        missionState.reset();
      }
    });
    missionState.on(() => this.render());
    this.render();
  }

  _statusOf(m) {
    if (missionState.isComplete(m.id)) return "complete";
    const ready = (m.prerequisites || []).every(p => missionState.isComplete(p));
    return ready ? "available" : "locked";
  }

  _badgeOf(status) {
    return { complete: "complete", available: "available", locked: "locked" }[status];
  }

  render() {
    const html = MISSIONS.map((m, i) => {
      const status = this._statusOf(m);
      const num = String(i + 1).padStart(2, "0");
      const marker = status === "complete" ? "[✓]" : status === "available" ? "[ ]" : "[—]";
      return `
        <li class="contract" data-id="${m.id}" data-status="${status}">
          <div class="marker">${marker}</div>
          <div class="title">M${num} · ${m.title}</div>
          <div class="brief">${m.brief}</div>
          <div class="badge">${this._badgeOf(status)}</div>
        </li>`;
    }).join("");
    this.$list.innerHTML = html;

    const done = MISSIONS.filter(m => missionState.isComplete(m.id)).length;
    this.$progress.textContent = `PROGRESS: ${done}/${MISSIONS.length}`;

    this.$list.querySelectorAll(".contract").forEach(el => {
      const id = el.dataset.id;
      const status = el.dataset.status;
      if (status === "locked") return;
      el.addEventListener("click", () => this.onLaunch(id));
    });
  }
}
