// Pure economy math: (state, config, now) -> numbers/objects. No DOM, no side effects.
// `config` is the module namespace of js/data/config.js (GAME, BUILDINGS, UPGRADES, ...).

const idx = new WeakMap();
/** Lookup maps by id, cached per config object. */
export function index(config) {
  let m = idx.get(config);
  if (!m) {
    const map = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));
    m = {
      buildings: map(config.BUILDINGS), upgrades: map(config.UPGRADES), spells: map(config.SPELLS),
      market: map(config.MARKET), achievements: map(config.ACHIEVEMENTS),
    };
    idx.set(config, m);
  }
  return m;
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------- requirements
export function meetsRequires(req, state, config) {
  if (!req) return true;
  if (Array.isArray(req)) return req.every((r) => meetsRequires(r, state, config));
  if (req.building) {
    const list = Array.isArray(req.building) ? req.building : [req.building];
    for (const b of list) if ((state.buildings[b.id] || 0) < num(b.count, 1)) return false;
  }
  if (req.lifetimeEyes != null && num(state.lifetime.eyes) < req.lifetimeEyes) return false;
  if (req.upgrade) {
    const list = Array.isArray(req.upgrade) ? req.upgrade : [req.upgrade];
    for (const u of list) if (!state.upgrades.includes(u)) return false;
  }
  if (req.prestiges != null && num(state.prestiges) < req.prestiges) return false;
  return true;
}

// ---------------------------------------------------------------- effects
/** All effects currently active: upgrades, achievement extra effects, active spells, buffs. */
export function activeEffects(state, config, now) {
  const I = index(config);
  const out = [];
  for (const id of state.upgrades) { const u = I.upgrades[id]; if (u && u.effects) out.push(...u.effects); }
  for (const id of state.achievements) { const a = I.achievements[id]; if (a && a.reward && a.reward.effects) out.push(...a.reward.effects); }
  for (const id in state.spells) {
    const s = I.spells[id], st = state.spells[id];
    if (s && st && num(st.activeUntil) > now && s.effects) out.push(...s.effects.filter((e) => e.type !== 'instantProduction'));
  }
  for (const b of state.buffs) if (num(b.until) > now && b.effects) out.push(...b.effects.filter((e) => e.type !== 'instantProduction'));
  return out;
}

/** Aggregate all multipliers into one object ("mods"). */
export function computeMods(state, config, now) {
  const I = index(config);
  const m = {
    clickMult: 1, clickAdd: 0, clickPctOfEps: 0,
    buildingMult: {}, perOwned: [], globalMult: {},
    manaConversion: num(config.GAME.transmute && config.GAME.transmute.passive), manaMult: 1,
    costMult: 1, omenRateMult: 1, omenDurationMult: 1, offlineEfficiency: 0, spellCooldownMult: 1,
    achPct: 0, achMult: 1, featherMult: 1,
  };
  for (const e of activeEffects(state, config, now)) {
    const v = num(e.value, e.type.endsWith('Mult') ? 1 : 0);
    switch (e.type) {
      case 'clickMult': m.clickMult *= v; break;
      case 'clickAdd': m.clickAdd += v; break;
      case 'clickPctOfEps': m.clickPctOfEps += v; break;
      case 'buildingMult': m.buildingMult[e.target] = (m.buildingMult[e.target] ?? 1) * v; break;
      case 'buildingMultPerOwned': m.perOwned.push({ target: e.target, source: e.source, value: v }); break;
      case 'globalMult': { const r = e.resource || 'eyes'; m.globalMult[r] = (m.globalMult[r] ?? 1) * v; break; }
      case 'manaConversion': m.manaConversion += v; break;
      case 'manaMult': m.manaMult *= v; break;
      case 'costMult': m.costMult *= v; break;
      case 'omenRateMult': m.omenRateMult *= v; break;
      case 'omenDurationMult': m.omenDurationMult *= v; break;
      case 'offlineEfficiency': m.offlineEfficiency += v; break;
      case 'spellCooldownMult': m.spellCooldownMult *= v; break;
      default: break; // instantProduction handled at application time; unknown types ignored
    }
  }
  for (const id of state.achievements) { const a = I.achievements[id]; if (a && a.reward) m.achPct += num(a.reward.globalMultPct); }
  m.achMult = 1 + m.achPct / 100;
  const P = config.PRESTIGE || {};
  m.featherMult = 1 + featherCount(state) * num(P.bonusPerFeatherPct) / 100;
  return m;
}

/** Feathers counted for the bonus: unspent + spent (= all ever earned). */
export function featherCount(state) {
  return Math.max(num(state.lifetime.feathers), num(state.resources.feathers));
}

// ---------------------------------------------------------------- production
/** Multiplier applied to a single unit of a building (before global). */
export function buildingUnitMult(id, state, mods) {
  let mult = mods.buildingMult[id] ?? 1;
  for (const p of mods.perOwned) if (p.target === id) mult *= 1 + p.value * (state.buildings[p.source] || 0);
  return mult;
}

export function resourceMult(res, mods) {
  let m = (mods.globalMult[res] ?? 1) * mods.achMult * mods.featherMult;
  if (res === 'mana') m *= mods.manaMult;
  return m;
}

/**
 * Production per second.
 * returns { total: {res: perSec}, perBuilding: {id: {res: perSec}}, conversion: manaPerSec from passive transmute }
 */
export function production(state, config, mods) {
  const total = {}, perBuilding = {};
  for (const b of config.BUILDINGS) {
    const count = state.buildings[b.id] || 0;
    if (!count || !b.produces) continue;
    const um = buildingUnitMult(b.id, state, mods);
    const pb = {};
    for (const res in b.produces) {
      const v = num(b.produces[res]) * count * um * resourceMult(res, mods);
      pb[res] = v; total[res] = (total[res] || 0) + v;
    }
    perBuilding[b.id] = pb;
  }
  const conversion = (total.eyes || 0) * mods.manaConversion * mods.manaMult;
  total.mana = (total.mana || 0) + conversion;
  if (total.eyes == null) total.eyes = 0;
  return { total, perBuilding, conversion };
}

/** Production of one more unit of building id (for tooltips). */
export function unitProduction(b, state, mods) {
  const out = {};
  const um = buildingUnitMult(b.id, state, mods);
  for (const res in b.produces || {}) out[res] = num(b.produces[res]) * um * resourceMult(res, mods);
  return out;
}

export function clickValue(state, config, mods, eps) {
  const base = num(config.GAME.click && config.GAME.click.baseEyes, 1);
  return (base + mods.clickAdd) * mods.clickMult * mods.achMult * mods.featherMult + mods.clickPctOfEps * num(eps);
}

// ---------------------------------------------------------------- costs
export function growthOf(b, config) { return num(b.growth, num(config.GAME.costGrowth, 1.15)); }

/** Cost of buying n units of building b when `owned` are owned. Returns {res: amount}. */
export function buildingCost(b, owned, n, config, mods) {
  const g = growthOf(b, config);
  const factor = g === 1 ? n : (g ** n - 1) / (g - 1);
  const out = {};
  for (const res in b.baseCost) out[res] = Math.ceil(num(b.baseCost[res]) * g ** owned * factor * mods.costMult - 1e-9);
  return out;
}

export function canAfford(resources, cost) {
  for (const r in cost) if (num(resources[r]) < cost[r]) return false;
  return true;
}

/** Fraction of a cost currently affordable (min over resources), 0..1+. */
export function affordFraction(resources, cost) {
  let f = Infinity;
  for (const r in cost) f = Math.min(f, cost[r] > 0 ? num(resources[r]) / cost[r] : Infinity);
  return f === Infinity ? 1 : f;
}

/** Max units of building affordable now. */
export function maxAffordable(b, owned, resources, config, mods) {
  const g = growthOf(b, config);
  let n = Infinity;
  for (const res in b.baseCost) {
    const c0 = num(b.baseCost[res]) * g ** owned * mods.costMult;
    if (c0 <= 0) continue;
    const have = num(resources[res]);
    const k = g === 1 ? Math.floor(have / c0) : Math.floor(Math.log(1 + (have * (g - 1)) / c0) / Math.log(g));
    n = Math.min(n, k);
  }
  if (!Number.isFinite(n)) n = 0;
  n = Math.max(0, Math.min(n, 1e6));
  while (n > 0 && !canAfford(resources, buildingCost(b, owned, n, config, mods))) n--;
  return n;
}

export function marketCost(item, timesBought) {
  const out = {};
  const g = item.kind === 'consumable' ? num(item.costGrowth, 1) : 1;
  for (const r in item.cost || {}) out[r] = Math.ceil(num(item.cost[r]) * g ** (timesBought || 0) - 1e-9);
  return out;
}


// ---------------------------------------------------------------- transmute
export function transmuteInfo(state, config, mods) {
  const t = config.GAME.transmute || {};
  const eyesPerMana = num(t.eyesPerMana, 100), fraction = num(t.fraction, 0.1);
  const spend = Math.min(num(state.resources.eyes), num(state.resources.eyes) * fraction);
  const gain = (spend / eyesPerMana) * mods.manaMult;
  return { spend, gain, eyesPerMana, fraction };
}

// ---------------------------------------------------------------- spells / omen / offline
export function spellCooldown(spell, mods) { return num(spell.cooldown) * mods.spellCooldownMult; }

export function omenInterval(config, mods) {
  const O = config.OMEN || {};
  return { min: num(O.minSeconds, 90) * mods.omenRateMult, max: num(O.maxSeconds, 240) * mods.omenRateMult };
}

export function offlineEfficiency(config, mods) {
  return Math.min(1, num(config.GAME.offline && config.GAME.offline.efficiency, 0.5) + mods.offlineEfficiency);
}

/** Offline gains for `elapsedSec`. Returns {seconds, efficiency, gains:{res:amount}} */
export function offlineGains(state, config, mods, elapsedSec) {
  const maxH = num(config.GAME.offline && config.GAME.offline.maxHours, 8);
  const seconds = Math.max(0, Math.min(elapsedSec, maxH * 3600));
  const eff = offlineEfficiency(config, mods);
  const prod = production(state, config, mods);
  const gains = {};
  for (const r in prod.total) if (prod.total[r] > 0) gains[r] = prod.total[r] * seconds * eff;
  return { seconds, efficiency: eff, gains };
}

/** instantProduction effect amount */
export function instantAmount(effect, prod) {
  const r = effect.resource || 'eyes';
  return Math.max(num(effect.min), num(prod.total[r]) * num(effect.seconds));
}

// ---------------------------------------------------------------- prestige
export function prestigeGain(state, config) {
  const P = config.PRESTIGE;
  if (!P) return 0;
  if (num(state.lifetime.eyes) < num(P.unlockAtLifetimeEyes, 1e9)) return 0;
  const g = Math.floor((num(state.run.eyes) / num(P.divisor, 1e9)) ** num(P.exponent, 0.5));
  return Math.max(0, g);
}

/** Lifetime run-eyes needed for the next feather (for progress display). */
export function nextFeatherAt(state, config) {
  const P = config.PRESTIGE;
  const g = prestigeGain(state, config);
  return num(P.divisor, 1e9) * (g + 1) ** (1 / num(P.exponent, 0.5));
}

export function prestigeUnlocked(state, config) {
  const P = config.PRESTIGE;
  return !!P && (num(state.lifetime.eyes) >= num(P.unlockAtLifetimeEyes, 1e9) * 0.1 || num(state.prestiges) > 0);
}

// ---------------------------------------------------------------- stats / achievements
export function totalBuildings(state) {
  let t = 0; for (const k in state.buildings) t += state.buildings[k] || 0; return t;
}

export function statValue(state, stat) {
  if (typeof stat !== 'string') return 0;
  if (stat.startsWith('building:')) return state.buildings[stat.slice(9)] || 0;
  switch (stat) {
    case 'lifetimeEyes': return num(state.lifetime.eyes);
    case 'lifetimeMana': return num(state.lifetime.mana);
    case 'clicks': return num(state.lifetime.clicks);
    case 'omens': return num(state.lifetime.omens);
    case 'spells': return num(state.lifetime.spells);
    case 'prestiges': return num(state.prestiges);
    case 'totalBuildings': return totalBuildings(state);
    case 'upgrades': return state.upgrades.length;
    case 'achievements': return state.achievements.length;
    case 'feathers': return featherCount(state);
    case 'runEyes': return num(state.run.eyes);
    default: return 0;
  }
}

export function conditionMet(cond, state) {
  if (!cond) return false;
  if (Array.isArray(cond)) return cond.every((c) => conditionMet(c, state));
  const v = statValue(state, cond.stat);
  return v >= num(cond.gte, 0);
}

/** Achievement ids newly satisfied (not yet owned). */
export function newAchievements(state, config) {
  const out = [];
  for (const a of config.ACHIEVEMENTS || []) if (!state.achievements.includes(a.id) && conditionMet(a.condition, state)) out.push(a.id);
  return out;
}

/** Building visibility: lifetime eyes >= unlockAt.eyes (or owned). */
export function buildingUnlocked(b, state) {
  if ((state.buildings[b.id] || 0) > 0) return true;
  const u = b.unlockAt || {};
  for (const r in u) {
    const have = r === 'eyes' ? num(state.lifetime.eyes) : r === 'mana' ? num(state.lifetime.mana) : num(state.resources[r]);
    if (have < num(u[r])) return false;
  }
  return true;
}

/** Weighted pick; rnd in [0,1). */
export function weightedPick(list, rnd) {
  const total = list.reduce((s, x) => s + num(x.weight, 1), 0);
  let t = rnd * total;
  for (const x of list) { t -= num(x.weight, 1); if (t < 0) return x; }
  return list[list.length - 1];
}
