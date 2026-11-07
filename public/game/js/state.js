import { t as tr } from './i18n.js';
// Save/load, migrations, normalization, export/import. Storage access always guarded.

export const SAVE_KEY = 'krowlect.save.v1';

/** Migrations: key N upgrades a save from version N-1 to N. */
export const MIGRATIONS = {
  2: (s) => { // v1.3: feather upgrades + Underworld
    if (!Array.isArray(s.featherUps)) s.featherUps = [];
    if (!s.under || typeof s.under !== 'object') s.under = { buildings: {}, upgrades: [], pact: null };
    return s;
  },
};

/** Weekly mini-season (Mondays 00:00 UTC): unspent Black Feathers shrink by 20% per week passed. */
export function seasonIndex(config, now = Date.now()) {
  const se = config.GAME.season || { epoch: 0, lengthDays: 7 };
  return Math.floor((now - se.epoch) / (se.lengthDays * 864e5));
}
export function seasonEnd(config, now = Date.now()) {
  const se = config.GAME.season || { epoch: 0, lengthDays: 7 };
  return se.epoch + (seasonIndex(config, now) + 1) * se.lengthDays * 864e5;
}
/** Returns { weeks, lost } (weeks 0 when nothing changed). Lifetime feathers are untouched. */
export function applySeason(state, config, now = Date.now()) {
  const se = config.GAME.season, idx = seasonIndex(config, now);
  if (!se) return { weeks: 0, lost: 0 };
  if (!Number.isFinite(state.season)) state.season = idx;
  const passed = idx - state.season;
  state.season = Math.max(state.season, idx);
  if (passed <= 0) return { weeks: 0, lost: 0, wiped: null };
  const weeks = Math.min(passed, se.maxWeeks ?? 4), before = state.resources.feathers || 0;
  state.resources.feathers = before * Math.pow(se.featherKeep ?? 0.8, weeks);
  // The Underworld consumes everything that is its own: buildings, upgrades, pact and souls (and the surface bonus they fed).
  const u = state.under || {}, ub = Object.values(u.buildings || {}).reduce((a, b) => a + (b || 0), 0);
  const wiped = { buildings: ub, upgrades: (u.upgrades || []).length, pact: !!u.pact, souls: (state.resources.souls || 0) };
  wiped.any = ub > 0 || wiped.upgrades > 0 || wiped.pact || wiped.souls > 0;
  state.under = { buildings: {}, upgrades: [], pact: null };
  state.resources.souls = 0;
  state.lifetime.souls = 0;
  return { weeks, lost: before - state.resources.feathers, wiped };
}

export function defaultState(config) {
  const now = Date.now();
  return {
    saveVersion: config.GAME.saveVersion || 1,
    gameVersion: config.GAME.version || '0',
    resources: { eyes: 0, mana: 0, feathers: 0, souls: 0 },
    lifetime: { eyes: 0, mana: 0, clicks: 0, omens: 0, feathers: 0, spells: 0, souls: 0 },
    run: { eyes: 0, startedAt: now },
    buildings: Object.fromEntries(config.BUILDINGS.map((b) => [b.id, 0])),
    upgrades: [],
    featherUps: [],
    under: { buildings: {}, upgrades: [], pact: null },
    achievements: [],
    market: {},
    skin: 'default',
    equippedSkin: 'default',
    spells: {},
    buffs: [],
    prestiges: 0,
    settings: { sound: true, music: true, reducedMotion: false, numberFormat: 'short', font: 'pixel', contrast: false, ost: 'auto', musicVolume: 100, sfxVolume: 100 },
    lastSaved: now,
    startedAt: now,
    season: seasonIndex(config, now),
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
/** Spark shop entitlements only count while the shop is open (always open on localhost for testing). */
export function sparkShopOpen(config) {
  if (config.GAME.sparkShop === true) return true;
  try { return typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname); } catch { return false; }
}
const sparkIds = (config) => (config.SPARK_SHOP || []).map((x) => x.id);

export function normalize(raw, config) {
  const s = defaultState(config);
  if (!isObj(raw)) return s;
  raw = migrate(raw, config.GAME.saveVersion || 1);
  const ids = (arr) => new Set((arr || []).map((x) => x.id));
  const B = ids(config.BUILDINGS), U = ids(config.UPGRADES), A = ids(config.ACHIEVEMENTS), S = ids(config.SPELLS), M = new Set([...ids(config.MARKET), ...(config.SPARK_SHOP || []).map((x) => x.id)]);
  const copyNums = (dst, src) => { if (isObj(src)) for (const k in dst) if (isNum(src[k]) && src[k] >= 0) dst[k] = src[k]; };
  copyNums(s.resources, raw.resources);
  copyNums(s.lifetime, raw.lifetime);
  if (isObj(raw.run)) { if (isNum(raw.run.eyes)) s.run.eyes = raw.run.eyes; if (isNum(raw.run.startedAt)) s.run.startedAt = raw.run.startedAt; }
  if (isObj(raw.buildings)) for (const k in raw.buildings) if (B.has(k) && isNum(raw.buildings[k])) s.buildings[k] = Math.max(0, Math.floor(raw.buildings[k]));
  if (Array.isArray(raw.upgrades)) s.upgrades = [...new Set(raw.upgrades.filter((id) => U.has(id)))];
  if (Array.isArray(raw.featherUps)) { const F = new Set((config.FEATHER_UPGRADES || []).map((x) => x.id)); s.featherUps = [...new Set(raw.featherUps.filter((id) => F.has(id)))]; }
  if (isObj(raw.under)) {
    const UB = new Set(((config.UNDERWORLD && config.UNDERWORLD.buildings) || []).map((x) => x.id)), UU = new Set(((config.UNDERWORLD && config.UNDERWORLD.upgrades) || []).map((x) => x.id));
    if (isObj(raw.under.buildings)) for (const k in raw.under.buildings) if (UB.has(k) && isNum(raw.under.buildings[k])) s.under.buildings[k] = Math.max(0, Math.min(1e6, Math.floor(raw.under.buildings[k])));
    if (Array.isArray(raw.under.upgrades)) s.under.upgrades = [...new Set(raw.under.upgrades.filter((id) => UU.has(id)))];
    const PA = new Set(((config.UNDERWORLD && config.UNDERWORLD.pacts) || []).map((x) => x.id));
    s.under.pact = typeof raw.under.pact === 'string' && PA.has(raw.under.pact) ? raw.under.pact : null;
  }
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
    font: raw.settings.font === 'clean' ? 'clean' : 'pixel',
    contrast: !!raw.settings.contrast,
    ost: typeof raw.settings.ost === 'string' && raw.settings.ost.length <= 24 ? raw.settings.ost : 'auto',
    musicVolume: isNum(raw.settings.musicVolume) ? Math.min(100, Math.max(0, raw.settings.musicVolume)) : 100,
    sfxVolume: isNum(raw.settings.sfxVolume) ? Math.min(100, Math.max(0, raw.settings.sfxVolume)) : 100,
  });
  // skins: equipped must be owned (default always owned)
  const owned = ownedSkins(s, config);
  const eq = typeof raw.equippedSkin === 'string' ? raw.equippedSkin : raw.skin;
  s.equippedSkin = owned.includes(eq) ? eq : 'default';
  s.skin = s.equippedSkin;
  if (isNum(raw.lastSaved)) s.lastSaved = raw.lastSaved;
  if (isNum(raw.startedAt)) s.startedAt = raw.startedAt;
  if (isNum(raw.season)) s.season = raw.season;
  s.lifetime.feathers = Math.max(s.lifetime.feathers, s.resources.feathers);
  s.saveVersion = config.GAME.saveVersion || 1;
  s.gameVersion = config.GAME.version || '0';
  if (!sparkShopOpen(config)) {
    for (const id of sparkIds(config)) delete s.market[id];
    s.buffs = s.buffs.filter((b) => !String(b.id || '').startsWith('spark:'));
  }
  return s;
}

export function ownedSkins(state, config) {
  const out = ['default'];
  const open = sparkShopOpen(config);
  for (const m of [...(config.MARKET || []), ...(open ? config.SPARK_SHOP || [] : [])]) if (m.kind === 'skin' && (state.market[m.id] || 0) > 0 && m.skin) out.push(m.skin);
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
  else if (res === 'souls') state.lifetime.souls = (state.lifetime.souls || 0) + amount;
}

export function spend(state, cost) {
  for (const r in cost) state.resources[r] = Math.max(0, (state.resources[r] || 0) - cost[r]);
}

/** Eclipse reset: keep lifetime, achievements, feathers, skins, settings. */
export function prestigeReset(state, config, feathersGained, now = Date.now(), keepPct = 0) {
  const fresh = defaultState(config);
  const keepMarket = {};
  for (const m of [...(config.MARKET || []), ...(config.SPARK_SHOP || [])]) if (m.kind === 'skin' && state.market[m.id]) keepMarket[m.id] = state.market[m.id];
  const next = {
    ...fresh,
    resources: { eyes: 0, mana: 0, feathers: (state.resources.feathers || 0), souls: (state.resources.souls || 0) },
    featherUps: [...(state.featherUps || [])],
    under: { buildings: { ...(state.under ? state.under.buildings : {}) }, upgrades: [...(state.under ? state.under.upgrades : [])], pact: state.under ? state.under.pact || null : null },
    lifetime: { ...state.lifetime },
    achievements: [...state.achievements],
    market: keepMarket,
    skin: state.skin, equippedSkin: state.equippedSkin,
    prestiges: (state.prestiges || 0) + 1,
    settings: { ...state.settings },
    startedAt: state.startedAt,
    run: { eyes: 0, startedAt: now },
  };
  // Rooted Roost: keep a small share of each building (never more than 20 of each)
  if (keepPct > 0) for (const id in state.buildings) next.buildings[id] = Math.min(20, Math.floor((state.buildings[id] || 0) * Math.min(keepPct, 50) / 100));
  gain(next, 'feathers', feathersGained);
  return next;
}
