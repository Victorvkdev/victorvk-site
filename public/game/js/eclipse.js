// Cinematic Eclipse: the moon is swallowed, then every building is destroyed one by one
// while the eyes counter drains to zero. Purely visual: the real reset already happened.
import { fmt } from './format.js';
import * as audio from './audio.js';
import { t as tr, tt } from './i18n.js';


// ---- pixel art drawn on tiny canvases and scaled up with image-rendering: pixelated
const N = 64, C = N / 2;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function canvas(cls, paint) {
  const c = document.createElement('canvas'); c.width = c.height = N; c.className = cls;
  const x = c.getContext('2d');
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const dx = px + .5 - C, dy = py + .5 - C, col = paint(dx, dy, px, py);
    if (col) { x.fillStyle = col; x.fillRect(px, py, 1, 1); }
  }
  return c;
}
const sunPaint = (dx, dy, px, py) => {
  const d = Math.hypot(dx, dy), R = 17;
  if (d <= R) { const t = d / R; return t < .45 ? '#fff6bf' : t < .75 ? ((px + py) % 2 && t < .6 ? '#fff6bf' : '#ffd84a') : ((px + py) % 2 && t < .88 ? '#ffd84a' : '#ff9a1f'); }
  const a = Math.atan2(dy, dx), k = Math.abs(((a / (Math.PI / 8)) % 1 + 1) % 1 - .5) * 2; // 16 rays
  const len = 4 + ((Math.round(a / (Math.PI / 8)) % 2 + 2) % 2) * 4;
  return d > R + 2 && d < R + 2 + len * (1 - k * .9) ? '#ffb02e' : null;
};
const moonPaint = (dx, dy) => {
  const d = Math.hypot(dx, dy), R = 20;
  if (d > R) return null;
  const crater = [[-7, -6, 4], [8, 5, 5], [-3, 10, 3], [9, -9, 3]].some(([cx, cy, r]) => Math.hypot(dx - cx, dy - cy) < r);
  if (crater) return '#bdb6a3';
  return dx + dy > 8 ? '#dcd6c4' : '#f6f3ea';
};

// bloodshot eyeball, round like the game's eye sprite (32x32 pixel art)
function bloodEye() {
  const c = document.createElement('canvas'); c.width = c.height = 32; c.className = 'ecl-sceneye';
  const x = c.getContext('2d'), put = (px, py, col) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); };
  const cx = 16, cy = 14, R = 12.5;
  for (let py = 0; py < 32; py++) for (let px = 0; px < 32; px++) {
    const dx = px + .5 - cx, dy = py + .5 - cy, d = Math.hypot(dx, dy);
    if (d > R) continue;
    if (d > R - 1.3) { put(px, py, '#2a0505'); continue; }                       // outline
    let col = dx + dy > 6 ? '#d9b3ab' : '#f6ece6';                               // sclera, shaded bottom-right
    // veins creeping in from the edge
    const ang = Math.atan2(dy, dx);
    for (let k = 0; k < 9; k++) {
      const a0 = k * .7 + hash(k, 7) * .4, w = .09 + hash(k, 3) * .06;
      if (d > 6.5 && Math.abs(Math.atan2(Math.sin(ang - a0 - Math.sin(d * .9) * .12), Math.cos(ang - a0))) < w) col = '#c4151c';
    }
    if (d < 6.2) col = d < 2.4 ? '#000' : d < 4 ? '#e0261b' : d < 5.2 ? '#a30d0d' : '#6e0606';   // iris
    put(px, py, col);
  }
  put(13, 11, '#fff'); put(14, 11, '#ffd6d6'); put(13, 12, '#ffd6d6');           // shine
  for (const [px, len] of [[10, 6], [20, 8], [15, 4]]) {                         // blood dripping from the bottom
    const y0 = Math.round(cy + Math.sqrt(R * R - (px - cx) ** 2)) - 1;
    for (let i = 0; i < len && y0 + i < 31; i++) { put(px, y0 + i, '#b3101a'); put(px + 1, y0 + i, i < len - 2 ? '#8c0a12' : '#b3101a'); }
    put(px, Math.min(31, y0 + len), '#ff3b3b');
  }
  return c;
}
// pixel cloud (32x16)
function cloud(seed) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 16; c.className = 'ecl-cloud';
  const x = c.getContext('2d');
  const blobs = [[8, 10, 5], [14, 7, 6], [21, 9, 5], [26, 11, 4], [16, 11, 6]];
  for (let py = 0; py < 16; py++) for (let px = 0; px < 32; px++) {
    let hit = false, low = false;
    for (const [bx, by, r] of blobs) { const d = Math.hypot(px - bx, (py - by) * 1.25); if (d < r + hash(seed, px) * .6) { hit = true; if (py > by + 1) low = true; } }
    if (hit && py < 14) { x.fillStyle = low ? '#cfe6fb' : '#ffffff'; x.fillRect(px, py, 1, 1); }
  }
  return c;
}
const coronaPaint = (dx, dy) => {
  const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const ray = 1 + .45 * Math.max(0, Math.sin(a * 12 + 1)) + hash(Math.round(a * 40), 3) * .2;
  const r = d - 20;
  if (r < 0 || r > 6 * ray) return null;
  const t = r / (6 * ray);
  return t < .25 ? '#ffd27a' : t < .5 ? '#ff8a1f' : t < .75 ? '#d4430c' : '#7a230a';
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export async function playEclipse(ui, snap, gained) {
  const root = document.body;
  let skipped = false;
  const wait = async (ms) => { const t = Date.now(); while (!skipped && Date.now() - t < ms) await sleep(40); };

  const overlay = el('div', 'ecl');
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', tr('The Eclipse'));
  const sky = el('div', 'ecl-sky');
  const day = el('div', 'ecl-day'), night = el('div', 'ecl-night');
  for (let i = 0; i < 6; i++) { const c = cloud(i + 1); c.style.top = (6 + i * 11) + '%'; c.style.width = (150 + hash(i, 9) * 110) + 'px'; c.style.animationDuration = (38 + i * 9) + 's'; c.style.animationDelay = (-i * 11) + 's'; day.append(c); }
  sky.append(day, night);
  for (let i = 0; i < 46; i++) { const s = el('div', 'ecl-star'); s.style.left = (hash(i, 1) * 100) + '%'; s.style.top = (hash(i, 2) * 70) + '%'; s.style.opacity = .3 + hash(i, 3) * .6; night.append(s); }
  const scene = el('div', 'ecl-scene');
  const corona = canvas('ecl-corona', coronaPaint), sun = canvas('ecl-sun', sunPaint), moon = canvas('ecl-moon', moonPaint);
  const eye = bloodEye();
  scene.append(corona, sun, moon, eye);
  const title = el('div', 'ecl-panel ecl-title', tr('The Eclipse'));
  const counter = el('div', 'ecl-panel ecl-counter');
  counter.append(ui.sprite('eye', 'ecl-eye'));
  const num = el('span', 'ecl-num', fmt(snap.eyes));
  counter.append(num, el('span', 'ecl-lbl', tr('eyes')));
  const grid = el('div', 'ecl-grid');
  const tiles = snap.buildings.map((b) => {
    const t = el('div', 'ecl-tile');
    t.append(ui.sprite(b.icon, 'ecl-ico'), el('span', 'ecl-name', b.name));
    const c = el('span', 'ecl-cnt', 'x' + fmt(b.n));
    t.append(c); grid.append(t);
    return { t, c, b };
  });
  const reward = el('div', 'ecl-panel ecl-reward');
  reward.append(ui.sprite('feather', 'ecl-feather'), el('span', 'ecl-rtext', tt`+${fmt(gained)} Black Feathers`));
  const hint = el('div', 'ecl-hint', tr('tap to skip'));
  overlay.append(sky, scene, title, counter, grid, reward, hint);
  overlay.addEventListener('pointerdown', () => { skipped = true; });
  root.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('on'));
  audio.duck(true);
  audio.play('aura');

  // 1. the dark disc slides over the moon; orange corona flares
  await wait(600);
  overlay.classList.add('cover');
  await wait(1900);
  overlay.classList.add('total');
  audio.play('totality');
  await wait(800);

  // 2. destroy buildings one by one while eyes drain
  overlay.classList.add('destroy');
  const R = tiles.length;
  const per = Math.max(260, Math.min(720, 5200 / Math.max(R, 1)));
  let lastTick = 0;
  const drain = (from, to, ms) => new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => {
      const p = skipped ? 1 : Math.min(1, (now - t0) / ms);
      num.textContent = fmt(snap.eyes * (from + (to - from) * p));
      if (!skipped && now - lastTick > 70) { lastTick = now; audio.play('tally'); }
      if (p < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  for (let i = 0; i < R && !skipped; i++) {
    const { t, c, b } = tiles[i];
    t.classList.add('hit');
    const from = 1 - i / R, to = 1 - (i + 1) / R;
    const tick = (async () => {
      const t0 = Date.now(), ms = per * 0.7;
      while (!skipped && Date.now() - t0 < ms) {
        c.textContent = 'x' + fmt(Math.ceil(b.n * (1 - (Date.now() - t0) / ms)));
        await sleep(40);
      }
      c.textContent = 'x0';
    })();
    await Promise.all([drain(from, to, per), tick]);
    t.classList.add('dead'); audio.play('crumble');
  }
  num.textContent = '0';
  tiles.forEach(({ t }) => t.classList.add('dead'));
  overlay.classList.add('void');
  await wait(700);

  // 3. dawn: feathers reward
  overlay.classList.add('dawn');
  audio.play('achievement');
  await wait(2200);
  overlay.classList.add('out');
  await sleep(350);
  overlay.classList.remove('on');
  audio.duck(false);
  await sleep(1000);
  overlay.remove();
}
