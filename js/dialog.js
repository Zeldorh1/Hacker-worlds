// Lightweight mentor dialog system. Plays a queue of lines into the dialog bar
// at the top of the screen; each line advances on tap.

export class Dialog {
  constructor(root) {
    this.root = root;
    this.$text = root.querySelector("#dialog-text");
    this.$next = root.querySelector("#dialog-next");
    this.queue = [];
    this.onEmpty = null;
    this.$next.addEventListener("click", () => this.advance());
  }

  /** Queue a single line; `who` is shown in the speaker tag. */
  say(who, text) {
    this.queue.push({ who, text });
    if (this.queue.length === 1) this._renderHead();
    this._refreshNext();
    return this;
  }

  /** Queue many lines at once. */
  script(who, lines) {
    for (const l of lines) this.say(who, l);
    return this;
  }

  advance() {
    if (this.queue.length === 0) return;
    this.queue.shift();
    if (this.queue.length === 0) {
      if (this.onEmpty) this.onEmpty();
    } else {
      this._renderHead();
    }
    this._refreshNext();
  }

  _renderHead() {
    const head = this.queue[0];
    if (!head) return;
    this.root.querySelector(".speaker").textContent = head.who;
    this.$text.textContent = head.text;
  }

  _refreshNext() {
    this.$next.disabled = this.queue.length <= 1 && !this.onEmpty;
    if (this.queue.length === 0) {
      this.$text.textContent = "";
    }
  }
}
