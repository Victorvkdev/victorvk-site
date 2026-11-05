// Visual effects: eye particles (canvas), floating numbers (pooled DOM), screen shake.

const MAX_PARTICLES = 80;
const MAX_FLOATERS = 24;

export class FX {
  constructor({ stage, canvas, floatLayer, getImage, reducedMotion }) {
    this.stage = stage; this.canvas = canvas; this.layer = floatLayer;
    this.getImage = getImage; // (id) => HTMLImageElement|Canvas
    this.reduced = reducedMotion; // () => boolean
    this.g = canvas.getContext('2d');
    this.parts = [];
    this.floaters = [];
    this.pool = [];
    this.w = 0; this.h = 0; this.dpr = 1;
    this.resize();
    if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(stage);
    else window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const r = this.stage.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.g.imageSmoothingEnabled = false;
  }

  /** stage-relative coordinates */
  burst(x, y, n = 6, sprite = 'eye', { speed = 1, size = 24 } = {}) {
    if (this.reduced()) return;
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const v = (180 + Math.random() * 260) * speed;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: (Math.random() - 0.5) * 6,
        r: Math.random() * 6, life: 0, max: 0.7 + Math.random() * 0.5, sprite, size: size * (0.6 + Math.random() * 0.5),
      });
    }
  }

  /** Rain of particles from the top of the stage (offline/omen celebration). */
  rain(n = 20, sprite = 'eye') {
    if (this.reduced()) return;
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
      this.parts.push({ x: Math.random() * this.w, y: -20 - Math.random() * 100, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120,
        rot: (Math.random() - 0.5) * 3, r: 0, life: 0, max: 1.6 + Math.random(), sprite, size: 20 + Math.random() * 12 });
    }
  }

  floatText(x, y, text, cls = '') {
    const reduced = this.reduced();
    if (this.floaters.length >= MAX_FLOATERS) { const old = this.floaters.shift(); old.el.remove(); this.pool.push(old.el); }
    const el = this.pool.pop() || document.createElement('span');
    el.className = 'floater ' + cls + (reduced ? ' still' : '');
    el.textContent = text;
    const jitter = reduced ? 0 : (Math.random() - 0.5) * 50;
    const pad = Math.min(this.w / 2, cls.includes('big') ? 110 : 30);
    el.style.left = `${Math.max(pad, Math.min(this.w - pad, x + jitter))}px`;
    el.style.top = `${y}px`;
    this.layer.appendChild(el);
    const f = { el, until: performance.now() + (reduced ? 700 : 1000) };
    this.floaters.push(f);
  }

  shake(strength = 1) {
    if (this.reduced()) return;
    const el = this.stage;
    el.style.setProperty('--shake', `${Math.round(3 * strength)}px`);
    el.classList.remove('shake');
    void el.offsetWidth; // restart animation
    el.classList.add('shake');
  }

  update(dt) {
    const now = performance.now();
    while (this.floaters.length && this.floaters[0].until < now) { const f = this.floaters.shift(); f.el.remove(); this.pool.push(f.el); }
    const g = this.g;
    if (!this.parts.length) { if (this._dirty) { g.clearRect(0, 0, this.canvas.width, this.canvas.height); this._dirty = false; } return; }
    this._dirty = true;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.imageSmoothingEnabled = false;
    const keep = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += 900 * dt * (p.r > 0 ? 1 : 0.15);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += 0;
      const img = this.getImage(p.sprite);
      if (img) {
        const s = Math.round(p.size);
        const alpha = 1 - Math.max(0, (p.life - p.max * 0.6) / (p.max * 0.4));
        g.globalAlpha = alpha;
        g.drawImage(img, Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
      keep.push(p);
    }
    g.globalAlpha = 1;
    this.parts = keep;
  }

  clear() { this.parts = []; }
}
