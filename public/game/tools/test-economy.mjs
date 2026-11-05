// Unit tests for js/economy.js + js/state.js + js/format.js (run: node tools/test-economy.mjs)
// Uses the real js/data/config.js when present, otherwise tools/stubs/config.js.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const real = path.join(root, 'js/data/config.js');
const configPath = existsSync(real) ? real : path.join(root, 'tools/stubs/config.js');
const config = await import(pathToFileURL(configPath));
const E = await import(pathToFileURL(path.join(root, 'js/economy.js')));
const S = await import(pathToFileURL(path.join(root, 'js/state.js')));
const F = await import(pathToFileURL(path.join(root, 'js/format.js')));
console.log('config:', path.relative(root, configPath));

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} !~ ${b}`);
const fresh = () => S.defaultState(config);
const NOW = 1_000_000;

// synthetic config for exact math, independent of balance
const T = {
  GAME: { version: 't', saveVersion: 1, costGrowth: 1.15, click: { baseEyes: 1 }, offline: { maxHours: 8, efficiency: 0.5 }, transmute: { eyesPerMana: 100, fraction: 0.1 } },
  RESOURCES: config.RESOURCES,
  BUILDINGS: [
    { id: 'a', name: 'A', baseCost: { eyes: 10 }, growth: 1.15, produces: { eyes: 1 }, unlockAt: { eyes: 0 } },
    { id: 'b', name: 'B', baseCost: { eyes: 100 }, produces: { eyes: 10 }, unlockAt: { eyes: 50 } },
  ],
  UPGRADES: [
    { id: 'u_click', cost: { eyes: 1 }, effects: [{ type: 'clickMult', value: 3 }, { type: 'clickAdd', value: 1 }] },
    { id: 'u_bm', cost: { eyes: 1 }, effects: [{ type: 'buildingMult', target: 'a', value: 2 }] },
    { id: 'u_po', cost: { eyes: 1 }, effects: [{ type: 'buildingMultPerOwned', target: 'b', source: 'a', value: 0.01 }] },
    { id: 'u_gm', cost: { eyes: 1 }, effects: [{ type: 'globalMult', resource: 'eyes', value: 1.5 }] },
    { id: 'u_mc', cost: { eyes: 1 }, effects: [{ type: 'manaConversion', value: 0.01 }, { type: 'manaMult', value: 2 }] },
    { id: 'u_cost', cost: { eyes: 1 }, effects: [{ type: 'costMult', value: 0.5 }] },
    { id: 'u_misc', cost: { eyes: 1 }, effects: [{ type: 'omenRateMult', value: 0.5 }, { type: 'omenDurationMult', value: 2 }, { type: 'offlineEfficiency', value: 0.7 }, { type: 'spellCooldownMult', value: 0.5 }, { type: 'clickPctOfEps', value: 0.1 }] },
  ],
  SPELLS: [{ id: 's', cost: { mana: 1 }, duration: 10, cooldown: 60, effects: [{ type: 'globalMult', resource: 'eyes', value: 7 }] }],
  MARKET: [{ id: 'm', kind: 'consumable', cost: { mana: 10 }, costGrowth: 1.5, effects: [] }, { id: 'sk', kind: 'skin', skin: 'frost', cost: { feathers: 1 } }],
  ACHIEVEMENTS: [
    { id: 'x', condition: { stat: 'lifetimeEyes', gte: 1 }, reward: { globalMultPct: 10 } },
    { id: 'y', condition: { stat: 'building:a', gte: 5 }, reward: { globalMultPct: 5 } },
  ],
  PRESTIGE: { name: 'Eclipse', resource: 'feathers', unlockAtLifetimeEyes: 1e9, divisor: 1e9, exponent: 0.5, bonusPerFeatherPct: 2 },
  OMEN: { minSeconds: 100, maxSeconds: 200, lifetime: 12, rewards: [{ weight: 1, text: 'a', effects: [] }, { weight: 3, text: 'b', effects: [] }] },
  CHATTER: [],
};
const tstate = () => S.defaultState(T);

test('building cost single + bulk (geometric sum)', () => {
  const s = tstate(); const m = E.computeMods(s, T, NOW);
  assert.deepEqual(E.buildingCost(T.BUILDINGS[0], 0, 1, T, m), { eyes: 10 });
  assert.deepEqual(E.buildingCost(T.BUILDINGS[0], 1, 1, T, m), { eyes: Math.ceil(11.5) });
  const ten = E.buildingCost(T.BUILDINGS[0], 0, 10, T, m).eyes;
  near(ten, Math.ceil(10 * (1.15 ** 10 - 1) / 0.15));
});

test('maxAffordable matches cost', () => {
  const s = tstate(); s.resources.eyes = 1000; const m = E.computeMods(s, T, NOW);
  const n = E.maxAffordable(T.BUILDINGS[0], 0, s.resources, T, m);
  assert.ok(E.canAfford(s.resources, E.buildingCost(T.BUILDINGS[0], 0, n, T, m)));
  assert.ok(!E.canAfford(s.resources, E.buildingCost(T.BUILDINGS[0], 0, n + 1, T, m)));
  s.resources.eyes = 5; assert.equal(E.maxAffordable(T.BUILDINGS[0], 0, s.resources, T, m), 0);
});

test('production with every multiplier', () => {
  const s = tstate();
  s.buildings.a = 10; s.buildings.b = 2;
  s.upgrades = ['u_bm', 'u_po', 'u_gm'];
  s.achievements = ['x']; // +10%
  s.lifetime.feathers = 5; // +10%
  const m = E.computeMods(s, T, NOW);
  const p = E.production(s, T, m);
  const g = 1.5 * 1.1 * 1.1;
  near(p.perBuilding.a.eyes, 10 * 1 * 2 * g);
  near(p.perBuilding.b.eyes, 2 * 10 * (1 + 0.01 * 10) * g);
  near(p.total.eyes, p.perBuilding.a.eyes + p.perBuilding.b.eyes);
});

test('click value: add before mult, pct of eps', () => {
  const s = tstate(); s.upgrades = ['u_click', 'u_misc'];
  const m = E.computeMods(s, T, NOW);
  near(E.clickValue(s, T, m, 100), (1 + 1) * 3 + 0.1 * 100);
});

test('mana conversion + manaMult, costMult', () => {
  const s = tstate(); s.buildings.a = 100; s.upgrades = ['u_mc', 'u_cost'];
  const m = E.computeMods(s, T, NOW);
  const p = E.production(s, T, m);
  near(p.total.eyes, 100);
  near(p.total.mana, 100 * 0.01 * 2);
  assert.deepEqual(E.buildingCost(T.BUILDINGS[0], 0, 1, T, m), { eyes: 5 });
});

test('spells are active only within window; misc mods', () => {
  const s = tstate(); s.buildings.a = 1; s.upgrades = ['u_misc'];
  s.spells.s = { activeUntil: NOW + 5000, cooldownUntil: NOW + 60000 };
  near(E.production(s, T, E.computeMods(s, T, NOW)).total.eyes, 7);
  near(E.production(s, T, E.computeMods(s, T, NOW + 6000)).total.eyes, 1);
  const m = E.computeMods(s, T, NOW);
  assert.equal(E.spellCooldown(T.SPELLS[0], m), 30);
  assert.deepEqual(E.omenInterval(T, m), { min: 50, max: 100 });
  assert.equal(m.omenDurationMult, 2);
  assert.equal(E.offlineEfficiency(T, m), 1); // capped
});

test('buffs expire', () => {
  const s = tstate(); s.buildings.a = 1;
  s.buffs = [{ id: 'omen:1', effects: [{ type: 'globalMult', resource: 'eyes', value: 7 }], until: NOW + 1000 }];
  near(E.production(s, T, E.computeMods(s, T, NOW)).total.eyes, 7);
  near(E.production(s, T, E.computeMods(s, T, NOW + 2000)).total.eyes, 1);
});

test('requires forms', () => {
  const s = tstate(); s.buildings.a = 2; s.upgrades = ['u_bm']; s.lifetime.eyes = 500;
  assert.ok(E.meetsRequires({ building: { id: 'a', count: 2 } }, s, T));
  assert.ok(!E.meetsRequires({ building: { id: 'a', count: 3 } }, s, T));
  assert.ok(E.meetsRequires({ lifetimeEyes: 500 }, s, T));
  assert.ok(E.meetsRequires({ upgrade: 'u_bm' }, s, T));
  assert.ok(!E.meetsRequires({ prestiges: 1 }, s, T));
  assert.ok(!E.meetsRequires([{ upgrade: 'u_bm' }, { prestiges: 1 }], s, T));
  assert.ok(E.meetsRequires(undefined, s, T));
});

test('achievement stats', () => {
  const s = tstate(); s.lifetime.eyes = 5; s.buildings.a = 5;
  assert.deepEqual(E.newAchievements(s, T), ['x', 'y']);
  assert.equal(E.statValue(s, 'totalBuildings'), 5);
  assert.equal(E.statValue(s, 'building:a'), 5);
  assert.equal(E.statValue(s, 'nonsense'), 0);
});

test('prestige gain & reset', () => {
  const s = tstate(); s.lifetime.eyes = 4e9; s.run.eyes = 4e9;
  assert.equal(E.prestigeGain(s, T), 2);
  s.lifetime.eyes = 1e8; assert.equal(E.prestigeGain(s, T), 0);
  s.lifetime.eyes = 4e9;
  s.achievements = ['x']; s.market.sk = 1; s.market.m = 3; s.buildings.a = 9; s.resources.feathers = 1; s.lifetime.feathers = 1;
  const n = S.prestigeReset(s, T, 2, NOW);
  assert.equal(n.resources.feathers, 3); assert.equal(n.lifetime.feathers, 3);
  assert.equal(n.buildings.a, 0); assert.equal(n.prestiges, 1);
  assert.deepEqual(n.achievements, ['x']); assert.deepEqual(n.market, { sk: 1 });
  assert.equal(n.lifetime.eyes, 4e9); assert.equal(n.run.eyes, 0);
});

test('market cost growth and offline gains', () => {
  assert.deepEqual(E.marketCost(T.MARKET[0], 2), { mana: Math.ceil(10 * 1.5 ** 2) });
  assert.deepEqual(E.marketCost(T.MARKET[1], 5), { feathers: 1 });
  const s = tstate(); s.buildings.a = 10;
  const m = E.computeMods(s, T, NOW);
  const o = E.offlineGains(s, T, m, 20 * 3600);
  assert.equal(o.seconds, 8 * 3600); near(o.gains.eyes, 10 * 8 * 3600 * 0.5);
});

test('weighted pick', () => {
  assert.equal(E.weightedPick(T.OMEN.rewards, 0).text, 'a');
  assert.equal(E.weightedPick(T.OMEN.rewards, 0.3).text, 'b');
});

test('save normalize, unknown ids, export/import roundtrip', () => {
  globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
  const raw = { saveVersion: 1, resources: { eyes: 50, mana: -3 }, buildings: { a: 3, gone: 9 }, upgrades: ['u_bm', 'deleted'], equippedSkin: 'frost', market: {} };
  const s = S.normalize(raw, T);
  assert.equal(s.resources.eyes, 50); assert.equal(s.resources.mana, 0);
  assert.equal(s.buildings.a, 3); assert.equal(s.buildings.b, 0); assert.ok(!('gone' in s.buildings));
  assert.deepEqual(s.upgrades, ['u_bm']); assert.equal(s.equippedSkin, 'default');
  const back = S.importSave(S.exportSave(s), T);
  assert.equal(back.buildings.a, 3);
  assert.throws(() => S.importSave('not base64 !!', T));
});

test('migrations run in order', () => {
  S.MIGRATIONS[2] = (x) => { x.trace = (x.trace || '') + '2'; return x; };
  S.MIGRATIONS[3] = (x) => { x.trace += '3'; return x; };
  const out = S.migrate({ saveVersion: 1 }, 3);
  assert.equal(out.trace, '23'); assert.equal(out.saveVersion, 3);
  delete S.MIGRATIONS[2]; delete S.MIGRATIONS[3];
});

test('number format', () => {
  assert.equal(F.fmt(999), '999');
  assert.equal(F.fmt(1234), '1.23K');
  assert.equal(F.fmt(4.56e6), '4.56M');
  assert.equal(F.fmt(1e15), '1aa');
  assert.equal(F.fmt(2.5e18), '2.5ab');
  assert.equal(F.fmt(999999), '1M');
  assert.equal(F.fmtRate(0.1), '0.1');
  assert.equal(F.fmtTime(3725), '1h 02m');
  assert.equal(F.fmtPct(0.2), '20%'); assert.equal(F.fmtPct(0.015), '1.5%'); assert.equal(F.fmtPct(1), '100%');
});

test('real config sanity: every effect type is known, ids unique', () => {
  const known = new Set(['clickMult', 'clickAdd', 'clickPctOfEps', 'buildingMult', 'buildingMultPerOwned', 'globalMult', 'manaConversion', 'manaMult', 'costMult', 'omenRateMult', 'omenDurationMult', 'offlineEfficiency', 'instantProduction', 'spellCooldownMult']);
  const all = [...config.UPGRADES, ...config.SPELLS, ...config.MARKET, ...config.OMEN.rewards];
  for (const x of all) for (const e of x.effects || []) assert.ok(known.has(e.type), `unknown effect ${e.type} in ${x.id || x.text}`);
  for (const list of [config.BUILDINGS, config.UPGRADES, config.SPELLS, config.MARKET, config.ACHIEVEMENTS]) {
    const ids = list.map((x) => x.id); assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  }
  const s = fresh(); const m = E.computeMods(s, config, NOW);
  assert.ok(Number.isFinite(E.production(s, config, m).total.eyes));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
