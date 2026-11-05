// TEMPORARY STUB of js/art/sprites.js (engine dev/testing only). Real file is owned by the pixel artist.
const base = { k: '#1b1426', c: '#f5c542', p: '#7c4dff', e: '#f4f1ea', i: '#a78bfa', g: '#f5c542', s: '#2a2140', m: '#4a7a5a', w: '#ffffff' };
export const PALETTES = {
  default: base,
  frost: { ...base, c: '#bfe9ff', p: '#3aa0d8', i: '#7fdcff' },
  blood: { ...base, c: '#c2334a', p: '#7a1020', i: '#ff5a6e' },
  gold: { ...base, c: '#fff1a8', p: '#f5c542', i: '#ffd84d' },
};
export const SKINS = ['default', 'frost', 'blood', 'gold'];

function square(w, h, ch, border = 'k') {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? border : ch;
    rows.push(r);
  }
  return rows;
}
function king(squash, blink) {
  const rows = [];
  for (let y = 0; y < 32; y++) {
    let r = '';
    for (let x = 0; x < 32; x++) {
      let ch = '.';
      const top = squash ? 8 : 4;
      if (y >= top && y < top + 4 && x >= 10 && x < 22 && (y > top || x % 3 === 0)) ch = 'c';
      else if (y >= top + 4 && y < 30 && x >= 8 && x < 24) ch = 'k';
      if (y >= top + 9 && y < top + 11 && (x === 12 || x === 13 || x === 18 || x === 19)) ch = blink ? 'k' : 'i';
      if (y >= 18 && y < 30 && (x >= 5 && x < 8 || x >= 24 && x < 27)) ch = 'p';
      if (y >= 30) ch = (x >= 9 && x < 23) ? 's' : '.';
      r += ch;
    }
    rows.push(r);
  }
  return rows;
}
const icon = (ch, w = 12) => ({ w, h: w, frames: [square(w, w, ch)], palette: 'default' });
export const SPRITES = {
  king: { w: 32, h: 32, frames: [king(false, false), king(false, true), king(true, false)], palette: 'default' },
  eye: icon('e'), eye_gold: icon('g', 16), mana: icon('p'), feather: icon('s'),
  ach: icon('c'), lock: icon('s'), sound_on: icon('i'), sound_off: icon('s'), bg_tile: icon('s', 16),
  bg_castle: { w: 160, h: 90, frames: [Array.from({ length: 90 }, (_, y) => (y > 70 ? 'm' : y > 50 ? 's' : 'k').repeat(160))], palette: 'default' },
};
for (const id of ['servant_raven', 'scarecrow', 'rookery', 'blacksmith', 'watchtower', 'wizard_tower', 'catacombs', 'cathedral', 'moon_altar', 'eclipse_portal']) SPRITES[id] = icon('i', 16);
for (const id of ['up_talons', 'up_beak', 'up_cage', 'up_anvil', 'up_scroll', 'up_lens', 'up_crown', 'up_tome', 'up_potion', 'up_bell']) SPRITES[id] = icon('m');
for (const id of ['sp_frenzy', 'sp_gaze', 'sp_moon', 'sp_storm']) SPRITES[id] = icon('p');
for (const id of ['mk_jar', 'mk_potion', 'mk_chest']) SPRITES[id] = icon('c');

export function renderSprite(id, { scale = 4, frame = 0, skin = null } = {}) {
  const sp = SPRITES[id];
  if (!sp) throw new Error('no sprite ' + id);
  const pal = PALETTES[skin || sp.palette] || PALETTES.default;
  const rows = sp.frames[frame] || sp.frames[0];
  const c = document.createElement('canvas');
  c.width = sp.w * scale; c.height = sp.h * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const col = pal[row[x]]; if (!col || row[x] === '.') continue; g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale); } });
  return c;
}
const cache = new Map();
export function spriteDataURL(id, opts = {}) {
  const k = id + JSON.stringify(opts);
  if (!cache.has(k)) cache.set(k, renderSprite(id, opts).toDataURL());
  return cache.get(k);
}
