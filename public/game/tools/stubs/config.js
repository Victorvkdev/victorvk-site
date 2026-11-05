// TEMPORARY STUB of js/data/config.js (engine dev/testing only). Real file is owned by the game designer.
export const GAME = {
  version: '0.0.0-stub',
  saveVersion: 1,
  tickRate: 10,
  autosaveSeconds: 10,
  offline: { maxHours: 8, efficiency: 0.5 },
  click: { baseEyes: 1 },
  costGrowth: 1.15,
  transmute: { eyesPerMana: 100, fraction: 0.1, passive: 0 },
};

export const RESOURCES = [
  { id: 'eyes', name: 'Eyes', icon: 'eye' },
  { id: 'mana', name: 'Mana', icon: 'mana' },
  { id: 'feathers', name: 'Black Feathers', icon: 'feather' },
];

const B = (id, name, cost, rate, unlock) => ({
  id, name, icon: id,
  desc: `A ${name.toLowerCase()} that gathers eyes for the King.`,
  flavor: '"Caw." — someone, probably',
  baseCost: { eyes: cost }, growth: 1.15, produces: { eyes: rate }, unlockAt: { eyes: unlock },
});

export const BUILDINGS = [
  B('servant_raven', 'Servant Raven', 15, 0.1, 0),
  B('scarecrow', 'Scarecrow', 100, 1, 0),
  B('rookery', 'Rookery', 1100, 8, 100),
  B('blacksmith', 'Blacksmith', 12000, 47, 1000),
  B('watchtower', 'Watchtower', 130000, 260, 10000),
  B('wizard_tower', 'Wizard Tower', 1.4e6, 1400, 1e5),
  B('catacombs', 'Catacombs', 2e7, 7800, 1e6),
  B('cathedral', 'Cathedral', 3.3e8, 44000, 1e7),
  B('moon_altar', 'Moon Altar', 5.1e9, 260000, 1e8),
  B('eclipse_portal', 'Eclipse Portal', 7.5e10, 1.6e6, 1e9),
];
BUILDINGS[5].produces = { eyes: 1400, mana: 0.5 };

export const UPGRADES = [
  { id: 'sharp_talons', name: 'Sharpened Talons', icon: 'up_talons', desc: 'Clicking collects twice as many eyes.',
    cost: { eyes: 100 }, effects: [{ type: 'clickMult', value: 2 }] },
  { id: 'iron_beak', name: 'Iron Beak', icon: 'up_beak', desc: '+1 eye per click.',
    cost: { eyes: 50 }, effects: [{ type: 'clickAdd', value: 1 }] },
  { id: 'raven_cage', name: 'Gilded Cage', icon: 'up_cage', desc: 'Servant Ravens are twice as efficient.',
    cost: { eyes: 200 }, requires: { building: { id: 'servant_raven', count: 1 } },
    effects: [{ type: 'buildingMult', target: 'servant_raven', value: 2 }] },
  { id: 'anvil', name: 'Cursed Anvil', icon: 'up_anvil', desc: 'Scarecrows gain +1% per Servant Raven.',
    cost: { eyes: 1000 }, requires: [{ building: { id: 'scarecrow', count: 1 } }, { lifetimeEyes: 500 }],
    effects: [{ type: 'buildingMultPerOwned', target: 'scarecrow', source: 'servant_raven', value: 0.01 }] },
  { id: 'scroll', name: 'Scroll of Gaze', icon: 'up_scroll', desc: 'Clicks also give 5% of eyes/sec.',
    cost: { eyes: 5000 }, requires: { upgrade: 'sharp_talons' }, effects: [{ type: 'clickPctOfEps', value: 0.05 }] },
  { id: 'lens', name: 'Crystal Lens', icon: 'up_lens', desc: 'The King passively transmutes 1% of eyes/sec into mana.',
    cost: { eyes: 500 }, effects: [{ type: 'manaConversion', value: 0.01 }] },
  { id: 'crown', name: 'Heavier Crown', icon: 'up_crown', desc: '+10% eye production.',
    cost: { eyes: 20000 }, effects: [{ type: 'globalMult', resource: 'eyes', value: 1.1 }] },
  { id: 'tome', name: 'Tome of Mana', icon: 'up_tome', desc: 'Mana gains x2.',
    cost: { eyes: 3000, mana: 10 }, effects: [{ type: 'manaMult', value: 2 }] },
  { id: 'potion', name: 'Haggling Potion', icon: 'up_potion', desc: 'Buildings cost 5% less.',
    cost: { eyes: 8000 }, effects: [{ type: 'costMult', value: 0.95 }] },
  { id: 'bell', name: 'Omen Bell', icon: 'up_bell', desc: 'Omens appear 20% more often and last 50% longer. Spells recharge 10% faster. +10% offline.',
    cost: { eyes: 15000 }, requires: { prestiges: 0 },
    effects: [{ type: 'omenRateMult', value: 0.8 }, { type: 'omenDurationMult', value: 1.5 },
      { type: 'spellCooldownMult', value: 0.9 }, { type: 'offlineEfficiency', value: 0.1 }] },
];

export const SPELLS = [
  { id: 'murder_frenzy', name: 'Murder Frenzy', icon: 'sp_frenzy', desc: 'All ravens work 7x faster for 30s.',
    cost: { mana: 5 }, duration: 30, cooldown: 120, effects: [{ type: 'globalMult', resource: 'eyes', value: 7 }] },
  { id: 'kings_gaze', name: "King's Gaze", icon: 'sp_gaze', desc: 'Clicks x10 for 15s.',
    cost: { mana: 10 }, duration: 15, cooldown: 90, effects: [{ type: 'clickMult', value: 10 }] },
  { id: 'moon_call', name: 'Call the Moon', icon: 'sp_moon', desc: 'Instantly gain 5 minutes of eyes.',
    cost: { mana: 25 }, duration: 0, cooldown: 300, requires: { building: { id: 'wizard_tower', count: 1 } },
    effects: [{ type: 'instantProduction', resource: 'eyes', seconds: 300, min: 100 }] },
  { id: 'storm', name: 'Feather Storm', icon: 'sp_storm', desc: 'Mana x3 for 60s.',
    cost: { mana: 50 }, duration: 60, cooldown: 600, requires: { lifetimeEyes: 1e6 }, effects: [{ type: 'manaMult', value: 3 }] },
];

export const MARKET = [
  { id: 'eye_jar', kind: 'consumable', name: 'Jar of Eyes', icon: 'mk_jar', desc: 'Instantly gain 10 minutes of eye production.',
    cost: { mana: 20 }, costGrowth: 1.5, effects: [{ type: 'instantProduction', resource: 'eyes', seconds: 600 }] },
  { id: 'focus_potion', kind: 'consumable', name: 'Focus Potion', icon: 'mk_potion', desc: 'Clicks x3 for 60s.',
    cost: { mana: 5 }, costGrowth: 1.3, duration: 60, effects: [{ type: 'clickMult', value: 3 }] },
  { id: 'chest', kind: 'consumable', name: 'Raven Chest', icon: 'mk_chest', desc: 'Eyes x2 for 5 minutes.',
    cost: { mana: 30 }, costGrowth: 1.4, duration: 300, effects: [{ type: 'globalMult', resource: 'eyes', value: 2 }] },
  { id: 'skin_frost', kind: 'skin', name: 'Frost King', icon: 'king', skin: 'frost', desc: 'An icy crown.', cost: { mana: 10 } },
  { id: 'skin_blood', kind: 'skin', name: 'Blood King', icon: 'king', skin: 'blood', desc: 'A crimson cape.', cost: { feathers: 1 } },
  { id: 'skin_gold', kind: 'skin', name: 'Golden King', icon: 'king', skin: 'gold', desc: 'Shiny.', cost: { feathers: 5 } },
];

export const ACHIEVEMENTS = [
  { id: 'first_blink', name: 'First Blink', desc: 'Collect your first eye.', icon: 'ach', condition: { stat: 'lifetimeEyes', gte: 1 }, reward: { globalMultPct: 1 } },
  { id: 'eyes_1k', name: 'Thousand Stares', desc: 'Collect 1,000 eyes.', icon: 'ach', condition: { stat: 'lifetimeEyes', gte: 1000 }, reward: { globalMultPct: 1 } },
  { id: 'clicks_100', name: 'Clicky Claws', desc: 'Click 100 times.', icon: 'ach', condition: { stat: 'clicks', gte: 100 }, reward: { globalMultPct: 1 } },
  { id: 'ravens_10', name: 'Unkindness', desc: 'Own 10 Servant Ravens.', icon: 'ach', condition: { stat: 'building:servant_raven', gte: 10 }, reward: { globalMultPct: 2 } },
  { id: 'build_25', name: 'Small Kingdom', desc: 'Own 25 buildings.', icon: 'ach', condition: { stat: 'totalBuildings', gte: 25 }, reward: { globalMultPct: 2 } },
  { id: 'mana_1', name: 'First Spark', desc: 'Gain 1 mana.', icon: 'ach', condition: { stat: 'lifetimeMana', gte: 1 }, reward: { globalMultPct: 1 } },
  { id: 'omen_1', name: 'Lucky Glance', desc: 'Catch an omen.', icon: 'ach', condition: { stat: 'omens', gte: 1 }, reward: { globalMultPct: 1 } },
  { id: 'up_3', name: 'Tinkerer', desc: 'Buy 3 upgrades.', icon: 'ach', condition: { stat: 'upgrades', gte: 3 }, reward: { globalMultPct: 1 } },
  { id: 'prest_1', name: 'Darkness Falls', desc: 'Eclipse once.', icon: 'ach', condition: { stat: 'prestiges', gte: 1 }, reward: { globalMultPct: 5 } },
  { id: 'ach_5', name: 'Collector', desc: 'Earn 5 achievements.', icon: 'ach', condition: { stat: 'achievements', gte: 5 }, reward: { globalMultPct: 1 } },
];

export const PRESTIGE = {
  name: 'Eclipse', resource: 'feathers', unlockAtLifetimeEyes: 1e9, divisor: 1e9, exponent: 0.5, bonusPerFeatherPct: 2,
};

export const OMEN = {
  minSeconds: 90, maxSeconds: 240, lifetime: 12,
  rewards: [
    { weight: 50, text: 'Gift of Eyes!', effects: [{ type: 'instantProduction', resource: 'eyes', seconds: 900, min: 50 }] },
    { weight: 30, text: 'Raven Rush!', duration: 20, effects: [{ type: 'globalMult', resource: 'eyes', value: 7 }] },
    { weight: 20, text: 'Clicking Fury!', duration: 10, effects: [{ type: 'clickMult', value: 50 }] },
  ],
};

export const CHATTER = [
  { text: 'The peasants report fewer eyes than usual.', minEyes: 0 },
  { text: 'A raven was seen wearing a tiny hat.', minEyes: 0 },
  { text: 'The scarecrows have unionized. Demands: more straw.', minEyes: 100 },
  { text: 'Wizards complain the tower smells of feathers.', minEyes: 1e5 },
];
