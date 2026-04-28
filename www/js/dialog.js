// Mentor dialog with a typewriter effect.
// Tap the dialog area or the next button to skip the typewriter on the
// current line; tap again to advance to the next line.

const TYPE_MS_PER_CHAR = 24;

export class Dialog {
  constructor(root, { audio } = {}) {
    this.root = root;
    this.audio = audio || null;
    this.$text  = root.querySelector("#dialog-text");
    this.$next  = root.querySelector("#dialog-next");
    this.$speak = root.querySelector(".speaker");
    this.queue = [];
    this.onEmpty = null;

    this._typingFull = "";
    this._typingIdx = 0;
    this._typingTimer = null;
    this._isTyping = false;

    this.$next.addEventListener("click", () => this.tap());
    this.$text.addEventListener("click", () => this.tap());
  }

  say(who, text) {
    this.queue.push({ who, text });
    if (this.queue.length === 1) this._renderHead();
    this._refreshNext();
    return this;
  }

  script(who, lines) {
    for (const l of lines) this.say(who, l);
    return this;
  }

  /** Tap: skip typewriter on current line if mid-type, otherwise advance. */
  tap() {
    if (this._isTyping) { this._completeTyping(); return; }
    this.advance();
  }

  advance() {
    if (this.queue.length === 0) return;
    this.queue.shift();
    if (this.queue.length === 0) {
      this._stopTyping();
      this.$text.classList.remove("typing");
      this.$text.textContent = "";
      if (this.onEmpty) this.onEmpty();
    } else {
      this._renderHead();
    }
    this._refreshNext();
  }

  clear() {
    this._stopTyping();
    this.queue = [];
    this.$text.classList.remove("typing");
    this.$text.textContent = "";
    this._refreshNext();
  }

  _renderHead() {
    const head = this.queue[0];
    if (!head) return;
    this.$speak.textContent = head.who;
    this.root.classList.toggle("is-tip", /tip/i.test(head.who));
    this._startTyping(head.text);
  }

  _startTyping(text) {
    this._stopTyping();
    this._typingFull = text;
    this._typingIdx = 0;
    this._isTyping = true;
    this.$text.classList.add("typing");
    this.$text.textContent = "";
    const tick = () => {
      if (!this._isTyping) return;
      this._typingIdx++;
      this.$text.textContent = this._typingFull.slice(0, this._typingIdx);
      // Soft typewriter blip every other char.
      if (this.audio && (this._typingIdx & 1)) this.audio.type();
      if (this._typingIdx >= this._typingFull.length) {
        this._completeTyping();
      } else {
        this._typingTimer = setTimeout(tick, TYPE_MS_PER_CHAR);
      }
    };
    this._typingTimer = setTimeout(tick, TYPE_MS_PER_CHAR);
  }

  _completeTyping() {
    this._stopTyping();
    this.$text.textContent = this._typingFull;
    this._isTyping = false;
  }

  _stopTyping() {
    if (this._typingTimer) { clearTimeout(this._typingTimer); this._typingTimer = null; }
    this._isTyping = false;
  }

  _refreshNext() {
    // Always allow advancing once the queue exists; the tap also skips typing.
    this.$next.disabled = this.queue.length === 0 && !this.onEmpty;
  }
}
