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
  const known = new Set(['clickMult', 'clickAdd', 'clickPctOfEps', 'buildingMult', 'buildingMultPerOwned', 'globalMult', 'manaConversion', 'manaMult', 'costMult', 'omenRateMult', 'omenDurationMult', 'offlineEfficiency', 'instantProduction', 'spellCooldownMult', 'gateCostMult', 'offlineHours', 'keepBuildingsPct', 'omenSplit', 'soulHMult', 'spawnOmen']);
  const all = [...config.UPGRADES, ...config.SPELLS, ...config.MARKET, ...config.OMEN.rewards, ...(config.FEATHER_UPGRADES || []), ...config.SPARK_SHOP, ...config.UNDERWORLD.upgrades, ...config.UNDERWORLD.pacts, ...config.SPARK_SHOP.flatMap((x) => (x.cycle ? x.cycle.phases : []))];
  for (const x of all) for (const e of x.effects || []) assert.ok(known.has(e.type), `unknown effect ${e.type} in ${x.id || x.text}`);
  for (const list of [config.BUILDINGS, config.UPGRADES, config.SPELLS, config.MARKET, config.ACHIEVEMENTS]) {
    const ids = list.map((x) => x.id); assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  }
  const s = fresh(); const m = E.computeMods(s, config, NOW);
  assert.ok(Number.isFinite(E.production(s, config, m).total.eyes));
});

// ---------------------------------------------------------------- v1.3 balance
test('eclipse inflation grows 2% per Eclipse and is capped at x4', () => {
  const s = fresh();
  near(E.inflation(s, config), 1);
  s.prestiges = 10; near(E.inflation(s, config), 1.02 ** 10);
  s.prestiges = 500; near(E.inflation(s, config), 4);
  s.prestiges = 10; const m = E.computeMods(s, config, NOW);
  near(E.buildingCost(config.BUILDINGS[0], 0, 1, config, m).eyes, Math.ceil(config.BUILDINGS[0].baseCost.eyes * 1.02 ** 10 - 1e-9));
  near(E.marketCost(config.MARKET[0], 0, m.inflation).mana, Math.ceil(config.MARKET[0].cost.mana * m.inflation - 1e-9));
  assert.deepEqual(E.upgradeCost({ cost: { feathers: 100, eyes: 100 } }, m), { feathers: 100, eyes: Math.ceil(100 * m.inflation - 1e-9) });
});

test('feather gate: units past 150 also cost feathers, across the boundary and with maxAffordable', () => {
  const b = config.BUILDINGS[0], s = fresh(), m = E.computeMods(s, config, NOW);
  assert.equal(E.buildingCost(b, 0, 10, config, m).feathers, undefined);
  assert.equal(E.buildingCost(b, 148, 1, config, m).feathers, undefined); // 149th unit is still free of feathers
  assert.ok(E.buildingCost(b, 149, 1, config, m).feathers >= 1);        // the 150th unit is the first that costs feathers
  const one = E.buildingCost(b, 148, 3, config, m); // units 149, 150, 151 -> gate only for 150 and 151
  const sum = E.gateFeathers(b, 148, 3, config, m);
  assert.equal(one.feathers, E.gateFeathers(b, 149, 2, config, m));
  assert.equal(one.feathers, sum);
  assert.ok(sum >= 2);
  assert.ok(E.gateFeathers(b, 150, 10, config, m) > E.gateFeathers(b, 150, 1, config, m));
  // later buildings are pricier
  assert.ok(E.gateFeathers(config.BUILDINGS[5], 150, 1, config, m) > E.gateFeathers(b, 150, 1, config, m));
  // maxAffordable never returns a count it cannot pay for (eyes AND feathers)
  const res = { eyes: 1e300, mana: 0, feathers: 5 };
  const n = E.maxAffordable(b, 149, res, config, m);
  assert.ok(E.canAfford(res, E.buildingCost(b, 149, n, config, m)));
  assert.ok(!E.canAfford(res, E.buildingCost(b, 149, n + 1, config, m)));
});

test('feather softcap: linear to the knee, power law above, continuous', () => {
  const s = fresh(), SC = config.GAME.featherSoftcap, bonus = config.PRESTIGE.bonusPerFeatherPct / 100;
  s.lifetime.feathers = 1000; near(E.computeMods(s, config, NOW).featherMult, 1 + 1000 * bonus);
  s.lifetime.feathers = SC.knee; near(E.computeMods(s, config, NOW).featherMult, 1 + SC.knee * bonus);
  s.lifetime.feathers = SC.knee * 1e4;
  near(E.computeMods(s, config, NOW).featherMult, (1 + SC.knee * bonus) * 1e4 ** SC.exp);
  assert.ok(E.computeMods(s, config, NOW).featherMult < 1 + s.lifetime.feathers * bonus);
});

test('instant production: yield decay per buy and timed-boost cap', () => {
  const jar = config.MARKET.find((m) => m.id === 'eye_jar'), e = jar.effects[0];
  const prod = { total: { eyes: 1000 } };
  const base = E.instantAmount(e, prod, { yield: jar.yield, k: 1, cap: 2, timedMult: 1 });
  near(base, 1000 * e.seconds);
  near(E.instantAmount(e, prod, { yield: jar.yield, k: jar.yield.free + 3, cap: 2, timedMult: 1 }), 1000 * e.seconds * jar.yield.decay ** 3);
  // timed multiplier 7x only counts as 2x
  near(E.instantAmount(e, { total: { eyes: 7000 } }, { yield: jar.yield, k: 1, cap: 2, timedMult: 7 }), 7000 * (2 / 7) * e.seconds);
  // total a min-maxer can pull from 40 jars is bounded
  let tot = 0; for (let k = 1; k <= 40; k++) tot += E.instantAmount(e, prod, { yield: jar.yield, k, cap: 2, timedMult: 1 });
  assert.ok(tot <= 1000 * e.seconds * (jar.yield.free + 1 / (1 - jar.yield.decay)) + 1);
});

test('timedEyesMult only counts spells and buffs', () => {
  const s = fresh(); s.upgrades.push(config.UPGRADES[0].id);
  near(E.timedEyesMult(s, config, NOW), 1);
  s.buffs.push({ id: 'x', until: NOW + 1000, effects: [{ type: 'globalMult', resource: 'eyes', value: 3 }, { type: 'clickMult', value: 9 }] });
  near(E.timedEyesMult(s, config, NOW), 3);
  near(E.timedEyesMult(s, config, NOW + 2000), 1);
});

test('feather upgrades, underworld and spark skin perks flow into mods', () => {
  const s = fresh();
  s.featherUps.push('fu_pinion', 'fu_molt', 'fu_night', 'fu_roost1', 'fu_mercy1');
  let m = E.computeMods(s, config, NOW);
  near(m.globalMult.eyes, 1.25); near(m.costMult, 0.95); near(m.offlineHours, 4); near(m.keepPct, 3); near(m.gateCostMult, 0.85);
  // underworld production + bounded feedback
  s.under.buildings.u_shade_raven = 10; s.under.upgrades.push('uu_tithe');
  m = E.computeMods(s, config, NOW);
  const p = E.production(s, config, m);
  near(p.total.souls, 0.1 * 10 * 1.5);
  s.lifetime.souls = 1e30; m = E.computeMods(s, config, NOW);
  assert.ok(m.soulF > 0.999999); assert.ok(m.globalMult.eyes < 1.25 * 3.0001); assert.ok(m.manaMult < 2.0001);
  // prism: static perks + only the current phase of the cycle
  const sk = config.SPARK_SHOP.find((x) => x.id === 'skin_prism');
  const q = fresh(); q.market.skin_prism = 1; q.equippedSkin = 'prism';
  const T0 = 0; const len = sk.cycle.period / sk.cycle.phases.length * 1000;
  const mr = E.computeMods(q, config, T0 + 1), mt = E.computeMods(q, config, T0 + len + 1), ms = E.computeMods(q, config, T0 + 2 * len + 1);
  near(mr.clickMult, 3); near(mt.globalMult.eyes, 1.5 * 1.5); near(ms.manaMult, 1.25 * 2);
  near(mr.globalMult.eyes, 1.5); assert.equal(mt.clickMult, 1);
  near(mr.omenSplit, 0.5);
});

test('save v2: new keys survive normalize and Eclipse; Rooted Roost keeps a capped share', () => {
  const s = fresh(); s.featherUps.push('fu_pinion'); s.under.buildings.u_roost = 7; s.under.upgrades.push('uu_tithe'); s.resources.souls = 55; s.lifetime.souls = 99;
  s.buildings.servant_raven = 500; s.buildings.scarecrow = 100; s.lifetime.eyes = 1e12; s.run.eyes = 4e12;
  const n = S.normalize(JSON.parse(JSON.stringify(s)), config);
  assert.deepEqual(n.featherUps, ['fu_pinion']); assert.equal(n.under.buildings.u_roost, 7); assert.equal(n.resources.souls, 55);
  const r = S.prestigeReset(n, config, 10, NOW, 10);
  assert.deepEqual(r.featherUps, ['fu_pinion']); assert.equal(r.under.buildings.u_roost, 7); assert.equal(r.lifetime.souls, 99);
  assert.equal(r.buildings.servant_raven, 20); assert.equal(r.buildings.scarecrow, 10); assert.equal(r.resources.souls, 55);
  const old = S.normalize({ saveVersion: 1, resources: { eyes: 5 }, lifetime: {} }, config);
  assert.deepEqual(old.featherUps, []); assert.deepEqual(old.under, { buildings: {}, upgrades: [], pact: null });
  const bad = S.normalize({ saveVersion: 2, resources: {}, lifetime: {}, featherUps: ['nope', 'fu_pinion'], under: { buildings: { zz: 5, u_roost: -3 }, upgrades: ['x'] } }, config);
  assert.deepEqual(bad.featherUps, ['fu_pinion']); assert.equal(bad.under.buildings.u_roost, 0);
});

test('pacts: one active, needs the key, effects flow into mods; rituals cost souls', () => {
  const U = config.UNDERWORLD, s = fresh();
  s.under.pact = 'pact_blood';
  assert.equal(E.computeMods(s, config, NOW).clickMult, 1); // no Obsidian Key yet -> inactive
  s.featherUps.push('obsidian_key');
  near(E.computeMods(s, config, NOW).clickMult, 4);
  s.under.pact = 'pact_greed';
  const m = E.computeMods(s, config, NOW); near(m.globalMult.eyes, 1.4); near(m.costMult, 1.25);
  assert.equal(S.normalize(JSON.parse(JSON.stringify(s)), config).under.pact, 'pact_greed');
  s.under.pact = 'nope'; assert.equal(S.normalize(JSON.parse(JSON.stringify(s)), config).under.pact, null);
  for (const p of U.pacts) assert.deepEqual(Object.keys(p.cost), ['souls']);
  const rit = config.SPELLS.filter((x) => x.ritual);
  assert.equal(rit.length, 3);
  for (const r of rit) { assert.deepEqual(Object.keys(r.cost), ['souls']); assert.equal(E.meetsRequires(r.requires, fresh(), config), false); assert.equal(E.meetsRequires(r.requires, s, config), true); }
});

test('underworld costs are feathers only and maxAffordable matches', () => {
  const U = config.UNDERWORLD, b = U.buildings[0];
  assert.deepEqual(Object.keys(E.underCost(b, 0, 5, config)), ['feathers']);
  const have = 1234, n = E.underMax(b, 3, have, config);
  assert.ok(E.underCost(b, 3, n, config).feathers <= have); assert.ok(E.underCost(b, 3, n + 1, config).feathers > have);
  for (const x of U.upgrades) assert.deepEqual(Object.keys(x.cost), ['feathers']);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);

test('weekly season: unspent feathers x0.8 per week passed (max 4), lifetime and buildings untouched', () => {
  const D = 7 * 864e5, t0 = config.GAME.season.epoch + 10 * D + 1000;
  const s = fresh(); s.season = S.seasonIndex(config, t0); s.resources.feathers = 1000; s.lifetime.feathers = 5000; s.buildings.servant_raven = 7;
  let r = S.applySeason(s, config, t0 + 1000); assert.equal(r.weeks, 0); assert.equal(s.resources.feathers, 1000);
  r = S.applySeason(s, config, t0 + D); assert.equal(r.weeks, 1); near(s.resources.feathers, 800); near(r.lost, 200);
  assert.equal(s.lifetime.feathers, 5000); assert.equal(s.buildings.servant_raven, 7);
  assert.equal(r.wiped.any, false);
  s.under.buildings.u_shade_raven = 5; s.under.upgrades.push('uu_tithe'); s.under.pact = 'pact_greed'; s.resources.souls = 99; s.lifetime.souls = 500; s.featherUps.push('fu_pinion');
  r = S.applySeason(s, config, t0 + D * 2); assert.equal(r.wiped.any, true); assert.equal(r.wiped.buildings, 5);
  assert.deepEqual(s.under, { buildings: {}, upgrades: [], pact: null }); assert.equal(s.resources.souls, 0); assert.equal(s.lifetime.souls, 0); assert.deepEqual(s.featherUps, ['fu_pinion']);
  r = S.applySeason(s, config, t0 + D * 30); assert.equal(r.weeks, 4); assert.ok(s.resources.feathers < 800);
  assert.ok(S.seasonEnd(config, t0) > t0 && S.seasonEnd(config, t0) - t0 <= D);
});

test('jar/hoard gates (feathers from 10th, souls from 20th) and building soul gate at 200', () => {
  const jar = config.MARKET.find((x) => x.id === 'eye_jar'), hoard = config.MARKET.find((x) => x.id === 'dragon_hoard');
  for (const m of [jar, hoard]) {
    assert.equal(E.marketCost(m, 8, 1).feathers, undefined);
    assert.ok(E.marketCost(m, 9, 1).feathers > 0); assert.equal(E.marketCost(m, 9, 1).souls, undefined);
    assert.ok(E.marketCost(m, 18, 1).souls === undefined); assert.ok(E.marketCost(m, 19, 1).souls > 0);
    assert.ok(E.marketCost(m, 25, 1).feathers > E.marketCost(m, 19, 1).feathers);
  }
  const b = config.BUILDINGS[0], mods = { costMult: 1, gateMult: 1 };
  assert.equal(E.buildingCost(b, 150, 49, config, mods).souls, undefined);
  assert.ok(E.buildingCost(b, 150, 50, config, mods).souls > 0);
  assert.ok(E.buildingCost(config.BUILDINGS[3], 199, 1, config, mods).souls > E.buildingCost(b, 199, 1, config, mods).souls);
  const n = E.maxAffordable(b, 190, { eyes: 1e300, feathers: 1e300, souls: 0 }, config, mods); assert.ok(n <= 10);
});
