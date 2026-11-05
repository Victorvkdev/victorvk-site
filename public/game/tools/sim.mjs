#!/usr/bin/env node
// KROWLECT balance simulator.
// Usage:  node tools/sim.mjs [hours=4] [activeMinutes=10] [clicksPerSec=5] [seed=1] [checkInMinutes=15]
//
// Simulates a greedy player: clicks `clicksPerSec` for the first `activeMinutes`
// (also catching every Omen while active), then goes idle (no clicks, no omens) but
// keeps buying whatever has the best payback. Casts spells whenever ready while active;
// when idle, only on a short 'check-in' every `checkInMinutes` (0 = never).
// Effect semantics follow SPEC.md exactly:
//   eyes/click = (baseEyes + Σ clickAdd) × Π clickMult + Σ clickPctOfEps × eyes/sec
//   building eps = base × count × Π buildingMult × (1 + Σ perOwned.value × count(source))
//   eyes/sec = Σ building eps × Π globalMult(eyes) × (1 + Σ achievementPct/100) × feather bonus
//   mana/sec = (Σ building mana × Π globalMult(mana) × ach × feathers + Σ manaConversion × eyes/sec) × Π manaMult
//   building cost = baseCost × growth^owned × Π costMult
import { GAME, BUILDINGS, UPGRADES, SPELLS, ACHIEVEMENTS, PRESTIGE, OMEN, MARKET } from '../js/data/config.js';

const [HOURS = 4, ACTIVE_MIN = 10, CPS = 5, SEED = 1, CHECKIN_MIN = 15] = process.argv.slice(2).map(Number);
const DT = 1; // seconds per step
let seed = SEED;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// ---------- state ----------
const S = {
  t: 0, eyes: 0, mana: 0, feathers: 0,
  lifetimeEyes: 0, lifetimeMana: 0, clicks: 0, omens: 0, prestiges: 0,
  b: Object.fromEntries(BUILDINGS.map(x => [x.id, 0])),
  up: new Set(), ach: new Set(),
  buffs: [], // {effects, until}
  spells: Object.fromEntries(SPELLS.map(s => [s.id, { cooldownUntil: 0 }])),
  nextOmen: 0,
};

const fmt = n => n < 1000 ? n.toFixed(n < 10 ? 2 : 0) : n.toExponential(2);
const fmtT = s => s == null ? '—' : `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;

function activeEffects(st, extraUp) {
  const list = [];
  for (const u of UPGRADES) if (st.up.has(u.id) || u.id === extraUp) list.push(...u.effects);
  for (const bf of st.buffs) if (bf.until > st.t) list.push(...bf.effects);
  return list;
}

function checkReq(req, st) {
  if (!req) return true;
  if (Array.isArray(req)) return req.every(r => checkReq(r, st));
  if (req.building) return (st.b[req.building.id] || 0) >= req.building.count;
  if (req.lifetimeEyes != null) return st.lifetimeEyes >= req.lifetimeEyes;
  if (req.upgrade) return st.up.has(req.upgrade);
  if (req.prestiges != null) return st.prestiges >= req.prestiges;
  return true;
}

function rates(st, extra = {}) {
  const counts = { ...st.b };
  if (extra.building) counts[extra.building]++;
  const eff = activeEffects(st, extra.upgrade);
  const bMult = {}, perOwned = {};
  let gEyes = 1, gMana = 1, manaMult = 1, conv = 0, clickMult = 1, clickAdd = 0, clickPct = 0, costMult = 1;
  let omenRate = 1, omenDur = 1, cdMult = 1;
  for (const e of eff) {
    switch (e.type) {
      case 'clickMult': clickMult *= e.value; break;
      case 'clickAdd': clickAdd += e.value; break;
      case 'clickPctOfEps': clickPct += e.value; break;
      case 'buildingMult': bMult[e.target] = (bMult[e.target] || 1) * e.value; break;
      case 'buildingMultPerOwned': perOwned[e.target] = (perOwned[e.target] || 0) + e.value * (counts[e.source] || 0); break;
      case 'globalMult': if (e.resource === 'eyes') gEyes *= e.value; else if (e.resource === 'mana') gMana *= e.value; break;
      case 'manaConversion': conv += e.value; break;
      case 'manaMult': manaMult *= e.value; break;
      case 'costMult': costMult *= e.value; break;
      case 'omenRateMult': omenRate *= e.value; break;
      case 'omenDurationMult': omenDur *= e.value; break;
      case 'spellCooldownMult': cdMult *= e.value; break;
    }
  }
  let achPct = 0;
  for (const a of ACHIEVEMENTS) if (st.ach.has(a.id)) achPct += a.reward.globalMultPct || 0;
  const meta = (1 + achPct / 100) * (1 + st.feathers * PRESTIGE.bonusPerFeatherPct / 100);
  let eyesBase = 0, manaBase = 0;
  for (const B of BUILDINGS) {
    const n = counts[B.id]; if (!n) continue;
    const m = n * (bMult[B.id] || 1) * (1 + (perOwned[B.id] || 0));
    eyesBase += (B.produces.eyes || 0) * m;
    manaBase += (B.produces.mana || 0) * m;
  }
  const eps = eyesBase * gEyes * meta;
  const mps = (manaBase * gMana * meta + conv * eps) * manaMult;
  const click = (GAME.click.baseEyes + clickAdd) * clickMult + clickPct * eps;
  return { eps, mps, click, costMult, omenRate, omenDur, cdMult, manaMult };
}

function bCost(B, st, costMult) {
  return B.baseCost.eyes * Math.pow(B.growth ?? GAME.costGrowth, st.b[B.id]) * costMult;
}

function applyInstant(e, R, st) {
  const gain = Math.max(e.min || 0, (e.resource === 'mana' ? R.mps : R.eps) * e.seconds);
  if (e.resource === 'mana') { st.mana += gain; st.lifetimeMana += gain; }
  else { st.eyes += gain; st.lifetimeEyes += gain; }
}

function applyEffects(effects, duration, st, durMult = 1) {
  const R = rates(st);
  const timed = effects.filter(e => e.type !== 'instantProduction');
  for (const e of effects) if (e.type === 'instantProduction') applyInstant(e, R, st);
  if (timed.length && duration) st.buffs.push({ effects: timed, until: st.t + duration * durMult });
}

// ---------- logs ----------
const firstBuy = {}, firstSpell = {}, purchases = [];
let prestigeAt = null, manaFirstAt = null;
const achAt = [];
const milestones = {}; // lifetime-eyes power of ten -> time

function income(R, active) { return R.eps + (active ? CPS * R.click : 0); }

const END = HOURS * 3600;
S.nextOmen = OMEN.minSeconds;
while (S.t < END) {
  const active = S.t < ACTIVE_MIN * 60;
  S.buffs = S.buffs.filter(b => b.until > S.t);

  // --- buy loop (greedy best payback) ---
  for (let guard = 0; guard < 50; guard++) {
    const R = rates(S);
    const inc = income(R, active);
    let best = null;
    for (const B of BUILDINGS) {
      if (S.lifetimeEyes < B.unlockAt.eyes) continue;
      const cost = bCost(B, S, R.costMult);
      const d = income(rates(S, { building: B.id }), active) - inc;
      if (d <= 0) continue;
      const score = cost / d + Math.max(0, cost - S.eyes) / Math.max(inc, 1e-9);
      if (!best || score < best.score) best = { kind: 'b', id: B.id, cost, score };
    }
    for (const U of UPGRADES) {
      if (S.up.has(U.id) || !checkReq(U.requires, S)) continue;
      const cost = U.cost.eyes; if (cost == null) continue;
      const d = income(rates(S, { upgrade: U.id }), active) - inc;
      let score;
      if (d > 1e-9 * inc) score = cost / d + Math.max(0, cost - S.eyes) / Math.max(inc, 1e-9);
      else if (cost <= 60 * inc && cost <= S.eyes) score = -1; // utility upgrade: cheap enough, just buy it
      else continue;
      if (!best || score < best.score) best = { kind: 'u', id: U.id, cost, score };
    }
    if (!best || best.cost > S.eyes) break;
    S.eyes -= best.cost;
    if (best.kind === 'b') { S.b[best.id]++; if (firstBuy[best.id] == null) firstBuy[best.id] = S.t; }
    else S.up.add(best.id);
    purchases.push({ t: S.t, id: best.id });
  }

  // --- spells ---
  const R0 = rates(S);
  const checkIn = CHECKIN_MIN > 0 && S.t % (CHECKIN_MIN * 60) < 60; // one-minute visit
  for (const sp of SPELLS) {
    if (!active && !checkIn) continue;
    if (!checkReq(sp.requires, S)) continue;
    const st = S.spells[sp.id];
    if (S.t < st.cooldownUntil || S.mana < sp.cost.mana) continue;
    S.mana -= sp.cost.mana;
    applyEffects(sp.effects, sp.duration, S);
    st.cooldownUntil = S.t + sp.cooldown * R0.cdMult;
    if (firstSpell[sp.id] == null) firstSpell[sp.id] = S.t;
  }

  // --- omens (only caught while active) ---
  if (S.t >= S.nextOmen) {
    const R = rates(S);
    if (active) {
      const tot = OMEN.rewards.reduce((a, r) => a + r.weight, 0);
      let x = rnd() * tot, pick = OMEN.rewards[0];
      for (const r of OMEN.rewards) { if ((x -= r.weight) < 0) { pick = r; break; } }
      applyEffects(pick.effects, pick.duration, S, R.omenDur);
      S.omens++;
    }
    S.nextOmen = S.t + (OMEN.minSeconds + rnd() * (OMEN.maxSeconds - OMEN.minSeconds)) * R.omenRate;
  }

  // --- produce ---
  const R = rates(S);
  const gainE = (R.eps + (active ? CPS * R.click : 0)) * DT;
  S.eyes += gainE; S.lifetimeEyes += gainE;
  if (active) S.clicks += CPS * DT;
  const gainM = R.mps * DT;
  S.mana += gainM; S.lifetimeMana += gainM;
  if (manaFirstAt == null && R.mps > 0) manaFirstAt = S.t;

  // --- achievements ---
  const totalB = Object.values(S.b).reduce((a, b) => a + b, 0);
  const stat = k => k.startsWith('building:') ? S.b[k.slice(9)] || 0
    : ({ lifetimeEyes: S.lifetimeEyes, lifetimeMana: S.lifetimeMana, clicks: S.clicks, omens: S.omens,
      prestiges: S.prestiges, totalBuildings: totalB, upgrades: S.up.size, achievements: S.ach.size })[k] ?? 0;
  for (const a of ACHIEVEMENTS) if (!S.ach.has(a.id) && stat(a.condition.stat) >= a.condition.gte) { S.ach.add(a.id); achAt.push({ t: S.t, id: a.id }); }

  for (let k = Math.floor(Math.log10(Math.max(1, S.lifetimeEyes))); k >= 3 && milestones[k] == null; k--) milestones[k] = S.t;
  if (prestigeAt == null && S.lifetimeEyes >= PRESTIGE.unlockAtLifetimeEyes) prestigeAt = S.t;
  S.t += DT;
}

// ---------- report ----------
const R = rates(S);
console.log(`\nKROWLECT sim — ${HOURS}h, clicking ${CPS}/s for ${ACTIVE_MIN}min then idle, seed ${SEED}\n`);
console.log('First purchase of each building:');
for (const B of BUILDINGS) console.log(`  ${B.id.padEnd(16)} ${fmtT(firstBuy[B.id]).padStart(9)}   owned at end: ${S.b[B.id]}`);
console.log(`\nMana starts flowing:        ${fmtT(manaFirstAt)}`);
console.log('First cast of each spell:');
for (const sp of SPELLS) console.log(`  ${sp.id.padEnd(16)} ${fmtT(firstSpell[sp.id]).padStart(9)}`);
const feathersAt = runEyes => Math.floor(Math.pow(runEyes / PRESTIGE.divisor, PRESTIGE.exponent));
console.log(`\nEclipse (prestige) unlock:  ${fmtT(prestigeAt)}   (needs ${fmt(PRESTIGE.unlockAtLifetimeEyes)} lifetime eyes)`);
console.log(`Feathers if Eclipsing at end: ${feathersAt(S.lifetimeEyes)}`);

console.log('Lifetime eyes milestones: ' + Object.entries(milestones).map(([k, t]) => `1e${k}@${fmtT(t)}`).join('  '));

// pacing: gaps between purchases
const gapsIn = (from, to) => {
  const ts = purchases.filter(p => p.t >= from && p.t < to).map(p => p.t);
  let max = 0, at = 0;
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > max) { max = ts[i] - ts[i - 1]; at = ts[i - 1]; }
  return { n: ts.length, max, at };
};
console.log('\nPacing (purchases / longest wait between purchases):');
for (const [a, b] of [[0, 600], [600, 1800], [1800, 3600], [3600, 7200], [7200, 10800], [10800, 14400]]) {
  if (a >= END) break;
  const g = gapsIn(a, b);
  console.log(`  ${fmtT(a).padStart(7)} – ${fmtT(b).padEnd(7)}  ${String(g.n).padStart(4)} buys   longest gap ${fmtT(g.max)} (at ${fmtT(g.at)})`);
}
console.log(`\nEnd state: eps ${fmt(R.eps)}  mana/s ${fmt(R.mps)}  lifetime eyes ${fmt(S.lifetimeEyes)}  upgrades ${S.up.size}/${UPGRADES.length}  achievements ${S.ach.size}/${ACHIEVEMENTS.length}`);
const notBought = UPGRADES.filter(u => !S.up.has(u.id)).map(u => u.id);
console.log(`Upgrades not bought: ${notBought.join(', ')}`);
if (process.env.VERBOSE) for (const p of purchases.slice(0, 80)) console.log(`  ${fmtT(p.t)} ${p.id}`);

// ---------- content sanity checks ----------
const ICONS = new Set(['king', 'eye', 'eye_gold', 'mana', 'feather', ...BUILDINGS.map(b => b.id),
  'up_talons', 'up_beak', 'up_cage', 'up_anvil', 'up_scroll', 'up_lens', 'up_crown', 'up_tome', 'up_potion', 'up_bell',
  'sp_frenzy', 'sp_gaze', 'sp_moon', 'sp_storm', 'mk_jar', 'mk_potion', 'mk_chest', 'ach', 'lock', 'sound_on', 'sound_off']);
const TYPES = new Set(['clickMult', 'clickAdd', 'clickPctOfEps', 'buildingMult', 'buildingMultPerOwned', 'globalMult', 'manaConversion',
  'manaMult', 'costMult', 'omenRateMult', 'omenDurationMult', 'offlineEfficiency', 'instantProduction', 'spellCooldownMult']);
const ids = new Set(); const problems = [];
for (const list of [BUILDINGS, UPGRADES, SPELLS, MARKET, ACHIEVEMENTS]) for (const x of list) {
  if (ids.has(x.id)) problems.push(`duplicate id ${x.id}`); ids.add(x.id);
  if (x.icon && !ICONS.has(x.icon)) problems.push(`bad icon ${x.icon} on ${x.id}`);
  for (const e of x.effects || []) if (!TYPES.has(e.type)) problems.push(`bad effect ${e.type} on ${x.id}`);
}
for (const r of OMEN.rewards) for (const e of r.effects) if (!TYPES.has(e.type)) problems.push(`bad omen effect ${e.type}`);
console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nContent check: OK (unique ids, valid icons & effect types)');
