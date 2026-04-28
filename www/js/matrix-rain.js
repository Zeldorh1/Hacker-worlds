// Matrix-style code rain behind the contracts hub.
// Lightweight: one canvas, ~30 columns, redraws once every ~70ms with a
// faint trail. Pause/resume to keep mobile battery sane.

const GLYPHS = "0123456789ABCDEF╔╗╚╝║═┼·:;<>~/\\@#$%&*+=";
const COLOR_FG    = "rgba(74, 222, 128, 0.82)";  // bright head
const COLOR_TRAIL = "rgba(74, 222, 128, 0.38)";
const FADE        = "rgba(6, 8, 10, 0.18)";       // background alpha to fade trail
const FONT_SIZE   = 14;
const STEP_MS     = 80;

export class MatrixRain {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cols = [];
    this.running = false;
    this.lastStep = 0;
    this._loopBound = (t) => this._loop(t);
    window.addEventListener("resize", () => this._fit());
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._fit());
      this._ro.observe(canvas);
    }
  }

  _fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = this.canvas.parentElement;
    const w = this.canvas.clientWidth  || (parent && parent.clientWidth)  || window.innerWidth  || 360;
    const h = this.canvas.clientHeight || (parent && parent.clientHeight) || window.innerHeight || 640;
    this.canvas.width  = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.font = `${FONT_SIZE}px ui-monospace, Menlo, monospace`;
    this.ctx.textBaseline = "top";

    const colCount = Math.max(1, Math.floor(w / FONT_SIZE));
    // Preserve existing column positions when resizing.
    const prev = this.cols;
    this.cols = [];
    for (let i = 0; i < colCount; i++) {
      this.cols.push(prev[i] || {
        y: -Math.random() * h,
        speed: 0.5 + Math.random() * 1.2,
      });
    }
    this.viewW = w;
    this.viewH = h;
  }

  start() {
    if (this.running) return;
    this._fit();
    this.running = true;
    this.lastStep = 0;
    requestAnimationFrame(this._loopBound);
  }

  stop() {
    this.running = false;
    // Optional: clear so when we resume there's no stale frame visible.
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  _loop(t) {
    if (!this.running) return;
    if (t - this.lastStep > STEP_MS) {
      this.lastStep = t;
      this._step();
    }
    requestAnimationFrame(this._loopBound);
  }

  _step() {
    const ctx = this.ctx;
    // Fade existing pixels toward background.
    ctx.fillStyle = FADE;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    for (let i = 0; i < this.cols.length; i++) {
      const c = this.cols[i];
      const x = i * FONT_SIZE;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];

      ctx.fillStyle = COLOR_TRAIL;
      ctx.fillText(ch, x, c.y);
      // bright head
      ctx.fillStyle = COLOR_FG;
      ctx.fillText(ch, x, c.y);

      c.y += FONT_SIZE * c.speed;
      if (c.y > this.viewH + Math.random() * 200) {
        c.y = -FONT_SIZE * (5 + Math.random() * 20);
        c.speed = 0.5 + Math.random() * 1.2;
      }
    }
  }
}
