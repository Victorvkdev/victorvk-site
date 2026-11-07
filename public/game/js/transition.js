// Full-screen transition between the surface and the Underworld (canvas, no assets).
//   enter: dark ink bleeds in from the edges and swallows the screen, green light rims the flow,
//          soul wisps rise, the theme swaps while covered, then the ink recedes in a soft bloom.
//   leave: the dark dissolves upward while a ring of pale violet light sweeps out from the center.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - clamp(t)) ** 3;

function glowSprite(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.25, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

function inkFallback(toUnder, apply) {
  return new Promise((resolve) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:80;pointer-events:none';
    cv.setAttribute('aria-hidden', 'true');
    document.body.append(cv);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);

    const SWAP = toUnder ? 1.05 : 0.08;          // seconds: when the theme changes (screen is covered)
    const DUR = toUnder ? 2.0 : 1.35;
    const inkRGB = toUnder ? '2,12,9' : '14,9,34';
    const rimRGB = toUnder ? '61,255,154' : '176,150,255';
    const glow = glowSprite(rimRGB), white = glowSprite('232,255,246');

    // ink blobs (mostly from the bottom and sides)
    const blobs = [];
    for (let i = 0; i < (toUnder ? 18 : 12); i++) {
      const r = Math.random();
      const x = r < 0.6 ? Math.random() * W : r < 0.8 ? -W * 0.05 : W * 1.05;
      const y = r < 0.6 ? H * (0.95 + Math.random() * 0.2) : H * (0.3 + Math.random() * 0.7);
      blobs.push({ x, y, delay: Math.random() * 0.3, R: diag * (0.55 + Math.random() * 0.35), ph: Math.random() * 6.28, wob: 0.05 + Math.random() * 0.05 });
    }
    // wisps
    const wisps = [];
    for (let i = 0; i < (toUnder ? 90 : 50); i++) {
      wisps.push({
        s: (toUnder ? 0.15 : 0.1) + Math.random() * (toUnder ? 1.4 : 0.7), life: 1.0 + Math.random() * 0.9,
        x: toUnder ? Math.random() * W : W * (0.3 + Math.random() * 0.4), y: toUnder ? H * (0.9 + Math.random() * 0.15) : H * (0.45 + Math.random() * 0.3),
        v: 110 + Math.random() * 190, sway: 10 + Math.random() * 28, ph: Math.random() * 6.28, size: 14 + Math.random() * 26,
      });
    }

    let swapped = false, t0 = 0;
    function frame(ts) {
      if (!t0) t0 = ts;
      const t = (ts - t0) / 1000;
      if (!swapped && t >= SWAP) { swapped = true; try { apply(); } catch { /* ignore */ } }
      g.clearRect(0, 0, W, H);

      // --- ink
      const recede = toUnder ? ease((t - 1.15) / 0.8) : ease(t / 0.95);
      const alpha = 1 - (toUnder ? recede : 0);
      for (const b of blobs) {
        const p = toUnder ? clamp((t - b.delay) / 0.85) : clamp((t - b.delay * 0.4) / 0.8);
        const f = toUnder ? ease(p) : 1 - ease(p);
        if (f <= 0.003 || alpha <= 0.003) continue;
        const r = b.R * f;
        g.globalCompositeOperation = 'source-over';
        for (let k = 0; k < 4; k++) {
          const a = b.ph + k * 1.57 + t * 0.9;
          const ox = Math.cos(a) * r * b.wob * 3, oy = Math.sin(a * 1.3) * r * b.wob * 3, rr = r * (0.82 + 0.18 * Math.sin(a * 2 + k));
          const gr = g.createRadialGradient(b.x + ox, b.y + oy, rr * 0.2, b.x + ox, b.y + oy, rr);
          gr.addColorStop(0, `rgba(${inkRGB},${0.97 * alpha})`); gr.addColorStop(0.7, `rgba(${inkRGB},${0.92 * alpha})`);
          gr.addColorStop(0.92, `rgba(${inkRGB},${0.5 * alpha})`); gr.addColorStop(1, `rgba(${inkRGB},0)`);
          g.fillStyle = gr; g.beginPath(); g.arc(b.x + ox, b.y + oy, rr, 0, 6.2832); g.fill();
        }
        // light rim while the ink is moving
        const move = Math.sin(Math.PI * p);
        if (move > 0.02) {
          g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(b.x, b.y, r * 0.78, b.x, b.y, r * 1.04);
          gr.addColorStop(0, `rgba(${rimRGB},0)`); gr.addColorStop(0.65, `rgba(${rimRGB},${0.3 * move * alpha})`); gr.addColorStop(1, `rgba(${rimRGB},0)`);
          g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, r * 1.04, 0, 6.2832); g.fill();
        }
      }

      // --- light
      g.globalCompositeOperation = 'lighter';
      if (toUnder) {
        const a = Math.sin(Math.PI * clamp((t - 0.85) / 0.85));
        if (a > 0) {
          const gr = g.createRadialGradient(W / 2, H * 0.56, 0, W / 2, H * 0.56, diag * 0.45);
          gr.addColorStop(0, `rgba(190,255,225,${0.55 * a})`); gr.addColorStop(0.35, `rgba(61,255,154,${0.28 * a})`); gr.addColorStop(1, 'rgba(61,255,154,0)');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
        }
      } else {
        const p = clamp(t / 1.0), r = easeOut(p) * diag * 0.75;
        if (p < 1) {
          const gr = g.createRadialGradient(W / 2, H * 0.56, Math.max(0, r - 90), W / 2, H * 0.56, r + 50);
          gr.addColorStop(0, 'rgba(176,150,255,0)'); gr.addColorStop(0.7, `rgba(210,195,255,${0.55 * (1 - p)})`); gr.addColorStop(1, 'rgba(176,150,255,0)');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
        }
      }

      // --- wisps
      for (const w of wisps) {
        const lt = (t - w.s) / w.life;
        if (lt < 0 || lt > 1) continue;
        const a = Math.sin(Math.PI * lt) * (toUnder ? 0.9 : 0.8);
        const x = w.x + Math.sin(w.ph + lt * 6) * w.sway, y = w.y - lt * w.v * w.life;
        const s = w.size * (0.6 + 0.6 * Math.sin(Math.PI * lt));
        g.globalAlpha = a; g.drawImage(glow, x - s / 2, y - s / 2, s, s);
        g.globalAlpha = a * 0.6; g.drawImage(white, x - s * 0.18, y - s * 0.18, s * 0.36, s * 0.36);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

      if (t < DUR) requestAnimationFrame(frame);
      else { cv.remove(); resolve(); }
    }
    requestAnimationFrame(frame);
  });
}

// ---------------------------------------------------------------------------------------------
// Main transition: a real "portal". The new map is revealed through an organic, noisy circle that
// grows from where the player clicked (View Transitions API), while the old map sinks into the dark.
// A live canvas draws a glowing corona along the edge plus embers drifting off it.
// Browsers without View Transitions fall back to the ink version above.
let lastPt = null;
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => { lastPt = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);

const TAU = Math.PI * 2, NPTS = 96;
const easeIO = (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

export function playMapTransition(toUnder, apply) {
  if (!document.startViewTransition) return inkFallback(toUnder, apply);
  return new Promise((resolve) => {
    const W = window.innerWidth, H = window.innerHeight;
    const o = lastPt && performance.now() - lastPt.t < 1500 ? lastPt : { x: W / 2, y: H * 0.5 };
    const ox = o.x, oy = o.y;
    const maxR = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy)) * 1.25;
    const DUR = toUnder ? 1700 : 1300;
    const rgb = toUnder ? '61,255,154' : '186,160,255';
    const core = toUnder ? '225,255,240' : '245,238,255';
    const seed = Math.random() * 6;

    const edge = (u, k) => {
      const p = easeIO(u), t = u * DUR / 1000, R = maxR * p;
      const amp = 0.1 * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, u)));
      const a = (k / NPTS) * TAU;
      const n = Math.sin(a * 3 + seed + t * 2.1) * 0.5 + Math.sin(a * 5 - seed * 1.7 - t * 3.3) * 0.3 + Math.sin(a * 9 + seed * 2.3 + t * 4.7) * 0.2;
      const r = R * (1 + n * amp);
      return [ox + Math.cos(a) * r, oy + Math.sin(a) * r, a];
    };
    const poly = (u) => {
      let s = 'polygon(';
      for (let k = 0; k < NPTS; k++) { const [x, y] = edge(u, k); s += (k ? ',' : '') + x.toFixed(1) + 'px ' + y.toFixed(1) + 'px'; }
      return s + ')';
    };

    const fx = document.createElement('div');
    fx.style.cssText = 'position:fixed;inset:0;z-index:90;pointer-events:none;view-transition-name:portal-fx';
    fx.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.cssText = 'width:100%;height:100%;display:block';
    fx.append(cv); document.body.append(fx);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);

    const css = document.createElement('style');
    css.textContent = `
      ::view-transition-group(root), ::view-transition-image-pair(root) { animation: none; }
      ::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }
      ::view-transition-new(root) { clip-path: circle(0px at ${ox}px ${oy}px); }
      ::view-transition-group(portal-fx), ::view-transition-image-pair(portal-fx), ::view-transition-new(portal-fx) { animation: none; }
      ::view-transition-old(portal-fx) { display: none; }`;
    document.head.append(css);

    const glow = glowSprite(rgb), white = glowSprite(core);
    const parts = [];
    let alive = true, t0 = 0;

    const cleanup = () => { alive = false; css.remove(); fx.remove(); };
    const draw = (now) => {
      if (!alive) return;
      if (!t0) t0 = now;
      const u = Math.min(1, (now - t0) / DUR);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const fade = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
      if (u < 1 && u > 0.004) {
        const pts = []; for (let k = 0; k <= NPTS; k++) pts.push(edge(u, k % NPTS));
        g.lineJoin = 'round';
        for (const [w, al, col] of [[34, 0.06, rgb], [16, 0.13, rgb], [7, 0.3, rgb], [2.4, 0.95, core]]) {
          g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
          g.lineWidth = w; g.strokeStyle = `rgba(${col},${al * fade})`; g.stroke();
        }
        const n = Math.round(5 + 9 * Math.sin(Math.PI * u));
        for (let i = 0; i < n; i++) {
          const q = pts[(Math.random() * NPTS) | 0];
          parts.push({ x: q[0], y: q[1], vx: Math.cos(q[2]) * (10 + Math.random() * 50) + (Math.random() - 0.5) * 30, vy: -(30 + Math.random() * 110), life: 0, max: 0.6 + Math.random() * 0.9, s: 10 + Math.random() * 20 });
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life += 1 / 60; if (p.life >= p.max) { parts.splice(i, 1); continue; }
        p.x += p.vx / 60; p.y += p.vy / 60;
        const lt = p.life / p.max, a = Math.sin(Math.PI * lt) * 0.9, s = p.s * (1 - lt * 0.4);
        g.globalAlpha = a; g.drawImage(glow, p.x - s / 2, p.y - s / 2, s, s);
        g.globalAlpha = a * 0.6; g.drawImage(white, p.x - s * 0.17, p.y - s * 0.17, s * 0.34, s * 0.34);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      requestAnimationFrame(draw);
    };

    let vt;
    try { vt = document.startViewTransition(() => { apply(); }); } catch { cleanup(); try { apply(); } catch { /* ignore */ } resolve(); return; }
    vt.ready.then(() => {
      const K = 56, kfs = [];
      for (let i = 0; i < K; i++) kfs.push(poly(i / (K - 1)));
      document.documentElement.animate({ clipPath: kfs }, { duration: DUR, easing: 'linear', fill: 'forwards', pseudoElement: '::view-transition-new(root)' });
      document.documentElement.animate(
        { filter: ['brightness(1) saturate(1) blur(0px)', 'brightness(0.22) saturate(0.55) blur(3px)'] },
        { duration: DUR, easing: 'ease-in', fill: 'forwards', pseudoElement: '::view-transition-old(root)' });
      requestAnimationFrame(draw);
    }).catch(() => {});
    vt.finished.then(() => {}, () => {}).then(() => { cleanup(); resolve(); });
  });
}
