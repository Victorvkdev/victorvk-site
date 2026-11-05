import { t as tr } from './i18n.js';
// Save/load, migrations, normalization, export/import. Storage access always guarded.

export const SAVE_KEY = 'krowlect.save.v1';

/** Migrations: key N upgrades a save from version N-1 to N. */
export const MIGRATIONS = {
  // 2: (s) => { ...; return s; },
};

export function defaultState(config) {
  const now = Date.now();
  return {
    saveVersion: config.GAME.saveVersion || 1,
    gameVersion: config.GAME.version || '0',
    resources: { eyes: 0, mana: 0, feathers: 0 },
    lifetime: { eyes: 0, mana: 0, clicks: 0, omens: 0, feathers: 0, spells: 0 },
    run: { eyes: 0, startedAt: now },
    buildings: Object.fromEntries(config.BUILDINGS.map((b) => [b.id, 0])),
    upgrades: [],
    achievements: [],
    market: {},
    skin: 'default',
    equippedSkin: 'default',
    spells: {},
    buffs: [],
    prestiges: 0,
    settings: { sound: true, music: true, reducedMotion: false, numberFormat: 'short' },
    lastSaved: now,
    startedAt: now,
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Apply migrations from save.saveVersion+1 .. target. */
export function migrate(save, target) {
  let v = isNum(save.saveVersion) ? save.saveVersion : 1;
  while (v < target) {
    v++;
    const fn = MIGRATIONS[v];
    if (typeof fn === 'function') save = fn(save) || save;
    save.saveVersion = v;
  }
  return save;
}

/** Merge a (possibly old/foreign) save into a fresh default state; drop unknown ids. */
export function normalize(raw, config) {
  const s = defaultState(config);
  if (!isObj(raw)) return s;
  raw = migrate(raw, config.GAME.saveVersion || 1);
  const ids = (arr) => new Set((arr || []).map((x) => x.id));
  const B = ids(config.BUILDINGS), U = ids(config.UPGRADES), A = ids(config.ACHIEVEMENTS), S = ids(config.SPELLS), M = ids(config.MARKET);
  const copyNums = (dst, src) => { if (isObj(src)) for (const k in dst) if (isNum(src[k]) && src[k] >= 0) dst[k] = src[k]; };
  copyNums(s.resources, raw.resources);
  copyNums(s.lifetime, raw.lifetime);
  if (isObj(raw.run)) { if (isNum(raw.run.eyes)) s.run.eyes = raw.run.eyes; if (isNum(raw.run.startedAt)) s.run.startedAt = raw.run.startedAt; }
  if (isObj(raw.buildings)) for (const k in raw.buildings) if (B.has(k) && isNum(raw.buildings[k])) s.buildings[k] = Math.max(0, Math.floor(raw.buildings[k]));
  if (Array.isArray(raw.upgrades)) s.upgrades = [...new Set(raw.upgrades.filter((id) => U.has(id)))];
  if (Array.isArray(raw.achievements)) s.achievements = [...new Set(raw.achievements.filter((id) => A.has(id)))];
  if (isObj(raw.market)) for (const k in raw.market) if (M.has(k) && isNum(raw.market[k])) s.market[k] = raw.market[k];
  if (isObj(raw.spells)) for (const k in raw.spells) if (S.has(k) && isObj(raw.spells[k])) s.spells[k] = { activeUntil: +raw.spells[k].activeUntil || 0, cooldownUntil: +raw.spells[k].cooldownUntil || 0 };
  if (Array.isArray(raw.buffs)) s.buffs = raw.buffs.filter((b) => isObj(b) && Array.isArray(b.effects) && isNum(b.until));
  if (isNum(raw.prestiges)) s.prestiges = raw.prestiges;
  if (isObj(raw.settings)) Object.assign(s.settings, {
    sound: raw.settings.sound !== false,
    music: raw.settings.music !== false,
    reducedMotion: !!raw.settings.reducedMotion,
    numberFormat: raw.settings.numberFormat === 'sci' ? 'sci' : 'short',
  });
  // skins: equipped must be owned (default always owned)
  const owned = ownedSkins(s, config);
  const eq = typeof raw.equippedSkin === 'string' ? raw.equippedSkin : raw.skin;
  s.equippedSkin = owned.includes(eq) ? eq : 'default';
  s.skin = s.equippedSkin;
  if (isNum(raw.lastSaved)) s.lastSaved = raw.lastSaved;
  if (isNum(raw.startedAt)) s.startedAt = raw.startedAt;
  s.lifetime.feathers = Math.max(s.lifetime.feathers, s.resources.feathers);
  s.saveVersion = config.GAME.saveVersion || 1;
  s.gameVersion = config.GAME.version || '0';
  return s;
}

export function ownedSkins(state, config) {
  const out = ['default'];
  for (const m of config.MARKET || []) if (m.kind === 'skin' && (state.market[m.id] || 0) > 0 && m.skin) out.push(m.skin);
  return out;
}

// ------------------------------------------------------------ storage
export function readRaw() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

export function save(state, now = Date.now()) {
  state.lastSaved = now;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

/** Load: returns { state, fresh, elapsedSec } */
export function load(config, now = Date.now()) {
  const raw = readRaw();
  if (!raw) return { state: defaultState(config), fresh: true, elapsedSec: 0 };
  const state = normalize(raw, config);
  return { state, fresh: false, elapsedSec: Math.max(0, (now - state.lastSaved) / 1000) };
}

// ------------------------------------------------------------ export / import
export function exportSave(state) {
  const json = JSON.stringify(state);
  try { return btoa(unescape(encodeURIComponent(json))); } catch { return ''; }
}

/** Returns normalized state or throws. */
export function importSave(str, config) {
  const clean = String(str || '').trim();
  if (!clean) throw new Error(tr('Empty save string'));
  let json;
  try { json = decodeURIComponent(escape(atob(clean))); } catch { throw new Error(tr('That is not a valid Krowlect save.')); }
  let raw;
  try { raw = JSON.parse(json); } catch { throw new Error(tr('Save data is corrupted.')); }
  if (!isObj(raw) || !isObj(raw.resources)) throw new Error(tr('That is not a valid Krowlect save.'));
  return normalize(raw, config);
}

// ------------------------------------------------------------ mutations helpers
/** Add a resource gain, tracking lifetime/run counters. */
export function gain(state, res, amount) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  state.resources[res] = (state.resources[res] || 0) + amount;
  if (res === 'eyes') { state.lifetime.eyes += amount; state.run.eyes += amount; }
  else if (res === 'mana') state.lifetime.mana += amount;
  else if (res === 'feathers') state.lifetime.feathers += amount;
}

export function spend(state, cost) {
  for (const r in cost) state.resources[r] = Math.max(0, (state.resources[r] || 0) - cost[r]);
}

/** Eclipse reset: keep lifetime, achievements, feathers, skins, settings. */
export function prestigeReset(state, config, feathersGained, now = Date.now()) {
  const fresh = defaultState(config);
  const keepMarket = {};
  for (const m of config.MARKET || []) if (m.kind === 'skin' && state.market[m.id]) keepMarket[m.id] = state.market[m.id];
  const next = {
    ...fresh,
    resources: { eyes: 0, mana: 0, feathers: (state.resources.feathers || 0) },
    lifetime: { ...state.lifetime },
    achievements: [...state.achievements],
    market: keepMarket,
    skin: state.skin, equippedSkin: state.equippedSkin,
    prestiges: (state.prestiges || 0) + 1,
    settings: { ...state.settings },
    startedAt: state.startedAt,
    run: { eyes: 0, startedAt: now },
  };
  gain(next, 'feathers', feathersGained);
  return next;
}
