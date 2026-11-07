/* =====================================================================
 * KROWLECT — game content & balance (owned by the GAME DESIGNER)
 * =====================================================================
 *
 * HOW TO ADD CONTENT (no coding experience needed)
 * ------------------------------------------------
 * Everything in this file is a list of plain objects { key: value, ... }.
 * To add something new, COPY an existing object, PASTE it right below,
 * and change the values. Rules of thumb:
 *
 *  1. Every `id` must be UNIQUE and never renamed later (saves use it).
 *     Use lowercase_with_underscores, e.g. 'grumpy_gargoyle'.
 *  2. `icon` must be one of the existing sprite IDs (see ARCHITECTURE.md,
 *     "Required sprite IDs"). Several items may share the same icon:
 *       buildings: servant_raven scarecrow rookery blacksmith watchtower
 *                  wizard_tower catacombs cathedral moon_altar eclipse_portal
 *       upgrades : up_talons up_beak up_cage up_anvil up_scroll up_lens
 *                  up_crown up_tome up_potion up_bell
 *       spells   : sp_frenzy sp_gaze sp_moon sp_storm
 *       market   : mk_jar mk_potion mk_chest   (skins use 'king')
 *       achievements: ach
 *  3. After editing, bump GAME.version (e.g. '1.0.0' -> '1.1.0') so
 *     players see the update. Only bump GAME.saveVersion if you changed
 *     the SAVE SHAPE (that also needs a migration in js/state.js) —
 *     adding new buildings/upgrades/achievements does NOT need it.
 *  4. Run the balance simulator to check pacing:
 *        node tools/sim.mjs
 *
 *  ADD A BUILDING: copy one BUILDINGS entry, give a new id, name, icon,
 *    desc, flavor. Rule of thumb: baseCost ~ 10x the previous building,
 *    produces ~ 6-7x the previous building. Put it at the END of the list
 *    (the list order is the shop order). unlockAt.eyes = lifetime eyes
 *    needed before it shows up (use ~ half its baseCost).
 *  ADD AN UPGRADE: copy one UPGRADES entry. `cost` is paid once.
 *    `requires` decides when it appears (see REQUIRES list below).
 *    `effects` is a list; use ONLY the effect types listed below.
 *  ADD AN ACHIEVEMENT: copy one ACHIEVEMENTS entry; `condition` is
 *    { stat, gte } (stat list is documented above ACHIEVEMENTS).
 *    reward.globalMultPct is a small % bonus to all production (1-3).
 *
 *  REQUIRES forms (optional; an array means "all of these"):
 *    { building: { id: 'rookery', count: 10 } }
 *    { lifetimeEyes: 5000 }
 *    { upgrade: 'some_upgrade_id' }
 *    { prestiges: 1 }
 *
 *  EFFECT TYPES:
 *    { type:'clickMult', value }                   x eyes per click
 *    { type:'clickAdd', value }                    + flat eyes per click (before mult)
 *    { type:'clickPctOfEps', value }               each click also gives value x eyes/sec (0.01 = 1%)
 *    { type:'buildingMult', target, value }        x one building's production
 *    { type:'buildingMultPerOwned', target, source, value }  target +value (0.01=1%) per source owned
 *    { type:'globalMult', resource, value }        x all production of a resource
 *    { type:'manaConversion', value }              passive: value x eyes/sec becomes mana/sec (eyes NOT consumed)
 *    { type:'manaMult', value }                    x all mana gains
 *    { type:'costMult', value }                    x all building costs (0.95 = 5% cheaper)
 *    { type:'omenRateMult', value }                x time between omens (0.8 = more often)
 *    { type:'omenDurationMult', value }            x duration of timed omen buffs
 *    { type:'offlineEfficiency', value }           + offline efficiency (capped at 1.0)
 *    { type:'instantProduction', resource, seconds, min }  gain production x seconds (at least min)
 *    { type:'spellCooldownMult', value }           x spell cooldowns
 *
 *  Balance note (assumed by tools/sim.mjs, matches SPEC):
 *    eyes per click = (baseEyes + sum clickAdd) x prod(clickMult) + sum(clickPctOfEps) x eyes/sec
 * ===================================================================== */

export const GAME = {
  version: '2.0.0',
  sparkShop: false, // faíscas shop closed in production until Énóis returns a spend result; localhost always open for tests
  saveVersion: 2,
  tickRate: 10,
  autosaveSeconds: 10,
  offline: { maxHours: 8, efficiency: 0.5 },
  season: { epoch: Date.UTC(2026, 0, 5), lengthDays: 7, featherKeep: 0.8, maxWeeks: 4 }, // weekly soft reset: unspent feathers x0.8
  click: { baseEyes: 1 },
  costGrowth: 1.15,
  // Manual Transmute button: spends `fraction` of current eyes, gives eyes / eyesPerMana mana.
  transmute: { eyesPerMana: 100, fraction: 0.1 },
  // --- late-game balance (v1.3) ---
  // Every Eclipse makes eye/mana prices a bit higher: x(1+k)^eclipses, capped.
  inflation: { k: 0.02, cap: 4 },
  // From `at` owned units of a building, every extra unit ALSO costs Black Feathers:
  // ceil(a * tier^buildingIndex * (j-at+1)^b * scale * gateCostMult) per unit j.
  gate: { at: 150, a: 0.3, b: 1.7, tier: 1.6, scale: { ref: 5e4, exp: 0.5 } },
  // From `at` owned, each extra unit also costs Souls: ceil(a * tier^buildingIndex * (j-at+1)^b) per unit j.
  soulGate: { at: 200, a: 2, b: 1.5, tier: 2.2 },
  // Feather bonus is linear up to `knee` feathers, then grows with a power < 1.
  featherSoftcap: { knee: 1e6, exp: 0.75 },
  // Instant production (jars, hoards, spells, omens) ignores timed eye multipliers above this factor.
  instantBuffCap: 2,
};

export const RESOURCES = [
  { id: 'eyes',     name: 'Eyes',           icon: 'eye' },
  { id: 'mana',     name: 'Mana',           icon: 'mana' },
  { id: 'feathers', name: 'Black Feathers', icon: 'feather' },
  { id: 'souls',    name: 'Souls',          icon: 'eclipse_portal' }, // Underworld only (shown once it is open)
];

/* ---------------------------------------------------------------------
 * BUILDINGS — order = shop order. produces = per second, per unit.
 * ------------------------------------------------------------------- */
export const BUILDINGS = [
  { id: 'servant_raven', name: 'Servant Raven', icon: 'servant_raven',
    desc: 'A loyal little raven that plucks eyes for the King.',
    flavor: '"Caw. Caw. Eye." — his whole vocabulary.',
    baseCost: { eyes: 15 }, growth: 1.15,
    produces: { eyes: 0.1 },
    unlockAt: { eyes: 0 } },

  { id: 'scarecrow', name: 'Scarecrow', icon: 'scarecrow',
    desc: 'Stares at crows so hard their eyes fall out. Very efficient.',
    flavor: 'Union rules forbid it from scaring ravens. Crows are fair game.',
    baseCost: { eyes: 100 }, growth: 1.15,
    produces: { eyes: 1 },
    unlockAt: { eyes: 50 } },

  { id: 'rookery', name: 'Rookery', icon: 'rookery',
    desc: 'A tower of nests. Ravens hatch here already holding eyes.',
    flavor: 'Rent is paid in shiny things. Mostly eyes.',
    baseCost: { eyes: 1100 }, growth: 1.15,
    produces: { eyes: 8 },
    unlockAt: { eyes: 500 } },

  { id: 'blacksmith', name: 'Blacksmith', icon: 'blacksmith',
    desc: 'Forges tiny steel spoons for scooping eyes. Clang, scoop, clang.',
    flavor: '"I used to make swords." "Now you make eye-spoons." "...Now I make eye-spoons."',
    baseCost: { eyes: 12000 }, growth: 1.15,
    produces: { eyes: 47 },
    unlockAt: { eyes: 5000 } },

  { id: 'watchtower', name: 'Watchtower', icon: 'watchtower',
    desc: 'Lookouts spot unattended eyes from miles away.',
    flavor: 'Ironically staffed entirely by the near-sighted.',
    baseCost: { eyes: 120000 }, growth: 1.15,
    produces: { eyes: 260 },
    unlockAt: { eyes: 55000 } },

  { id: 'wizard_tower', name: 'Wizard Tower', icon: 'wizard_tower',
    desc: 'Wizards conjure eyes out of thin air — and leak a little Mana.',
    flavor: 'Pointy hat sold separately. Beard mandatory.',
    baseCost: { eyes: 1.1e6 }, growth: 1.15,
    produces: { eyes: 1400, mana: 2 },
    unlockAt: { eyes: 500000 } },

  { id: 'catacombs', name: 'Catacombs', icon: 'catacombs',
    desc: 'Skeletons dig up eyes the dead forgot to take with them.',
    flavor: 'The skeletons have no eyes. They are VERY motivated.',
    baseCost: { eyes: 1.1e7 }, growth: 1.15,
    produces: { eyes: 7800 },
    unlockAt: { eyes: 5e6 } },

  { id: 'cathedral', name: 'Cathedral', icon: 'cathedral',
    desc: 'The faithful tithe one eye per prayer. Very devout. Slightly squinty.',
    flavor: 'Sunday sermon: "Thou shalt not blink."',
    baseCost: { eyes: 1.2e8 }, growth: 1.15,
    produces: { eyes: 44000 },
    unlockAt: { eyes: 5e7 } },

  { id: 'moon_altar', name: 'Moon Altar', icon: 'moon_altar',
    desc: 'Moonlight turns stones into eyes and puddles into Mana.',
    flavor: 'Closed during new moon. Please check opening hours.',
    baseCost: { eyes: 1.3e9 }, growth: 1.15,
    produces: { eyes: 260000, mana: 60 },
    unlockAt: { eyes: 6e8 } },

  { id: 'eclipse_portal', name: 'Eclipse Portal', icon: 'eclipse_portal',
    desc: 'Opens onto a dimension made entirely of eyeballs. Do not stare back.',
    flavor: 'The other side is staring back. It always was.',
    baseCost: { eyes: 1.5e10 }, growth: 1.15,
    produces: { eyes: 1.6e6 },
    unlockAt: { eyes: 7e9 } },
];

/* ---------------------------------------------------------------------
 * UPGRADES — bought once.
 * ------------------------------------------------------------------- */
export const UPGRADES = [
  // ---- Click upgrades (blacksmith-forged talons & beaks) ----
  { id: 'sharp_talons', name: 'Sharpened Talons', icon: 'up_talons',
    desc: 'Clicking collects twice as many eyes.',
    flavor: 'Filed on a gravestone. Very sharp. Very goth.',
    cost: { eyes: 100 }, requires: { lifetimeEyes: 40 },
    effects: [ { type: 'clickMult', value: 2 } ] },
  { id: 'polished_beak', name: 'Polished Beak', icon: 'up_beak',
    desc: 'Clicking collects twice as many eyes.',
    flavor: 'You can see your reflection. It is also collecting eyes.',
    cost: { eyes: 500 }, requires: { lifetimeEyes: 300 },
    effects: [ { type: 'clickMult', value: 2 } ] },
  { id: 'iron_talons', name: 'Iron Talons', icon: 'up_talons',
    desc: 'Forged by the Blacksmith. Clicks also grab 1% of your eyes/sec.',
    flavor: 'Heavy. Clanky. Extremely grabby.',
    cost: { eyes: 50000 }, requires: { building: { id: 'blacksmith', count: 1 } },
    effects: [ { type: 'clickPctOfEps', value: 0.01 } ] },
  { id: 'steel_beak', name: 'Steel Beak', icon: 'up_beak',
    desc: 'Clicks also grab another 1% of eyes/sec, and +5 base eyes per click.',
    flavor: 'Pecks through castle doors. And castle guards.',
    cost: { eyes: 5e6 }, requires: { building: { id: 'blacksmith', count: 10 } },
    effects: [ { type: 'clickPctOfEps', value: 0.01 }, { type: 'clickAdd', value: 5 } ] },
  { id: 'mithril_talons', name: 'Mithril Talons', icon: 'up_talons',
    desc: 'Clicks also grab another 2% of eyes/sec.',
    flavor: 'Light as a feather. Which is ironic, considering.',
    cost: { eyes: 5e8 }, requires: { building: { id: 'blacksmith', count: 25 } },
    effects: [ { type: 'clickPctOfEps', value: 0.02 } ] },
  { id: 'obsidian_beak', name: 'Obsidian Beak', icon: 'up_beak',
    desc: 'Clicks also grab another 3% of eyes/sec. Clicking x3.',
    flavor: 'Forged in a volcano. The volcano is now afraid of birds.',
    cost: { eyes: 5e10 }, requires: { building: { id: 'blacksmith', count: 50 } },
    effects: [ { type: 'clickPctOfEps', value: 0.03 }, { type: 'clickMult', value: 3 } ] },

  // ---- Servant Raven tiers ----
  { id: 'raven_collars', name: 'Shiny Collars', icon: 'up_cage',
    desc: 'Servant Ravens are twice as efficient.',
    flavor: 'Ravens love shiny things. Productivity up, mirror sales up.',
    cost: { eyes: 150 }, requires: { building: { id: 'servant_raven', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'servant_raven', value: 2 } ] },
  { id: 'raven_union', name: 'Raven Union Rights', icon: 'up_scroll',
    desc: 'Servant Ravens are twice as efficient.',
    flavor: 'They demanded worm breaks. Morale is through the roof.',
    cost: { eyes: 1000 }, requires: { building: { id: 'servant_raven', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'servant_raven', value: 2 } ] },
  { id: 'raven_helmets', name: 'Tiny Raven Helmets', icon: 'up_cage',
    desc: 'Servant Ravens are twice as efficient.',
    flavor: 'Adorable AND OSHA-compliant.',
    cost: { eyes: 50000 }, requires: { building: { id: 'servant_raven', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'servant_raven', value: 2 } ] },
  { id: 'raven_overtime', name: 'Overtime Caws', icon: 'up_cage',
    desc: 'Servant Ravens are twice as efficient.',
    flavor: 'Time and a half. Paid in eyes. Which they give back. Clever.',
    cost: { eyes: 5e6 }, requires: { building: { id: 'servant_raven', count: 50 } },
    effects: [ { type: 'buildingMult', target: 'servant_raven', value: 2 } ] },

  // ---- Scarecrow tiers ----
  { id: 'scarecrow_grins', name: 'Creepier Grins', icon: 'up_scroll',
    desc: 'Scarecrows are twice as efficient.',
    flavor: 'Painted by a very disturbed artist. Very talented, though.',
    cost: { eyes: 1000 }, requires: { building: { id: 'scarecrow', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'scarecrow', value: 2 } ] },
  { id: 'scarecrow_straw', name: 'Reinforced Straw', icon: 'up_scroll',
    desc: 'Scarecrows are twice as efficient.',
    flavor: 'Now with 30% more stuffing and 100% more staring.',
    cost: { eyes: 5000 }, requires: { building: { id: 'scarecrow', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'scarecrow', value: 2 } ] },
  { id: 'scarecrow_burlap', name: 'Haunted Burlap', icon: 'up_scroll',
    desc: 'Scarecrows are twice as efficient.',
    flavor: 'The sack whispers. Mostly about eyes.',
    cost: { eyes: 500000 }, requires: { building: { id: 'scarecrow', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'scarecrow', value: 2 } ] },
  { id: 'scarecrow_choir', name: 'Scarecrow Choir', icon: 'up_bell',
    desc: 'Scarecrows are twice as efficient.',
    flavor: 'They only know one song. It is a scream.',
    cost: { eyes: 5e7 }, requires: { building: { id: 'scarecrow', count: 50 } },
    effects: [ { type: 'buildingMult', target: 'scarecrow', value: 2 } ] },

  // ---- Rookery tiers ----
  { id: 'rookery_grants', name: 'Nesting Grants', icon: 'up_cage',
    desc: 'Rookeries are twice as efficient.',
    flavor: 'The Crown subsidizes twigs now. Twig lobby is powerful.',
    cost: { eyes: 11000 }, requires: { building: { id: 'rookery', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'rookery', value: 2 } ] },
  { id: 'rookery_mansions', name: 'Twig Mansions', icon: 'up_cage',
    desc: 'Rookeries are twice as efficient.',
    flavor: 'Three floors, a balcony and a view of other nests.',
    cost: { eyes: 55000 }, requires: { building: { id: 'rookery', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'rookery', value: 2 } ] },
  { id: 'rookery_bunks', name: 'Nest Bunk Beds', icon: 'up_cage',
    desc: 'Rookeries are twice as efficient.',
    flavor: 'Top bunk is for the senior raven. That is the rule.',
    cost: { eyes: 5.5e6 }, requires: { building: { id: 'rookery', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'rookery', value: 2 } ] },
  { id: 'rookery_mega', name: 'The Mega-Nest', icon: 'up_cage',
    desc: 'Rookeries are twice as efficient.',
    flavor: 'Visible from space. Space does not exist yet. Still visible.',
    cost: { eyes: 5.5e8 }, requires: { building: { id: 'rookery', count: 50 } },
    effects: [ { type: 'buildingMult', target: 'rookery', value: 2 } ] },

  // ---- Blacksmith tiers ----
  { id: 'smith_hammers', name: 'Bigger Hammers', icon: 'up_anvil',
    desc: 'Blacksmiths are twice as efficient.',
    flavor: 'Bigger hammer, bigger spoon, bigger eye. Science.',
    cost: { eyes: 120000 }, requires: { building: { id: 'blacksmith', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'blacksmith', value: 2 } ] },
  { id: 'smith_tongs', name: 'Precision Eye-Tongs', icon: 'up_anvil',
    desc: 'Blacksmiths are twice as efficient.',
    flavor: 'Fewer squished eyes. Fewer complaints from the eyes.',
    cost: { eyes: 500000 }, requires: { building: { id: 'blacksmith', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'blacksmith', value: 2 } ] },
  { id: 'smith_bellows', name: 'Dragon Bellows', icon: 'up_anvil',
    desc: 'Blacksmiths are twice as efficient.',
    flavor: 'The dragon is fine. He is paid in eyes too.',
    cost: { eyes: 6e7 }, requires: { building: { id: 'blacksmith', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'blacksmith', value: 2 } ] },
  { id: 'smith_dwarves', name: 'Dwarven Apprentices', icon: 'up_anvil',
    desc: 'Blacksmiths are twice as efficient.',
    flavor: 'Short, grumpy, and somehow forge twice as fast.',
    cost: { eyes: 6e9 }, requires: { building: { id: 'blacksmith', count: 50 } },
    effects: [ { type: 'buildingMult', target: 'blacksmith', value: 2 } ] },

  // ---- Watchtower tiers ----
  { id: 'tower_spyglass', name: 'Brass Spyglasses', icon: 'up_lens',
    desc: 'Watchtowers are twice as efficient.',
    flavor: 'An eye to find eyes. Very meta.',
    cost: { eyes: 1.2e6 }, requires: { building: { id: 'watchtower', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'watchtower', value: 2 } ] },
  { id: 'tower_stairs', name: 'Taller Stairs', icon: 'up_lens',
    desc: 'Watchtowers are twice as efficient.',
    flavor: 'Leg day, every day.',
    cost: { eyes: 6e6 }, requires: { building: { id: 'watchtower', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'watchtower', value: 2 } ] },
  { id: 'tower_lanterns', name: 'Eye-Seeking Lanterns', icon: 'up_lens',
    desc: 'Watchtowers are twice as efficient.',
    flavor: 'Moths hate them. Moths have very small eyes anyway.',
    cost: { eyes: 6e8 }, requires: { building: { id: 'watchtower', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'watchtower', value: 2 } ] },

  // ---- Wizard Tower tiers ----
  { id: 'wizard_hats', name: 'Pointier Hats', icon: 'up_tome',
    desc: 'Wizard Towers are twice as efficient.',
    flavor: 'Pointiness is directly proportional to power. Look it up.',
    cost: { eyes: 1.1e7 }, requires: { building: { id: 'wizard_tower', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'wizard_tower', value: 2 } ] },
  { id: 'wizard_index', name: 'Spellbook Index', icon: 'up_tome',
    desc: 'Wizard Towers are twice as efficient.',
    flavor: '"Eyes, conjuring of — see page 404."',
    cost: { eyes: 5.5e7 }, requires: { building: { id: 'wizard_tower', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'wizard_tower', value: 2 } ] },
  { id: 'wizard_familiars', name: 'Familiar Union', icon: 'up_tome',
    desc: 'Wizard Towers are twice as efficient.',
    flavor: 'The cats unionized. The ravens laughed. Then they joined.',
    cost: { eyes: 5.5e9 }, requires: { building: { id: 'wizard_tower', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'wizard_tower', value: 2 } ] },

  // ---- Catacombs tiers ----
  { id: 'cata_crew', name: 'Skeleton Crew', icon: 'up_bell',
    desc: 'Catacombs are twice as efficient.',
    flavor: 'Literally. They are skeletons.',
    cost: { eyes: 1.1e8 }, requires: { building: { id: 'catacombs', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'catacombs', value: 2 } ] },
  { id: 'cata_filing', name: 'Bone Filing System', icon: 'up_scroll',
    desc: 'Catacombs are twice as efficient.',
    flavor: 'Femurs in F, skulls in S, eyes in "Yes please".',
    cost: { eyes: 5.5e8 }, requires: { building: { id: 'catacombs', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'catacombs', value: 2 } ] },
  { id: 'cata_express', name: 'Ossuary Express', icon: 'up_bell',
    desc: 'Catacombs are twice as efficient.',
    flavor: 'Mine carts. Skeletons screaming "wheee". Rattly but fast.',
    cost: { eyes: 5.5e10 }, requires: { building: { id: 'catacombs', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'catacombs', value: 2 } ] },

  // ---- Cathedral tiers ----
  { id: 'cath_glass', name: 'Stained Glass Eyes', icon: 'up_bell',
    desc: 'Cathedrals are twice as efficient.',
    flavor: 'Every window depicts the King. Every window is watching you.',
    cost: { eyes: 1.2e9 }, requires: { building: { id: 'cathedral', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'cathedral', value: 2 } ] },
  { id: 'cath_choir', name: 'Choir of Crows', icon: 'up_bell',
    desc: 'Cathedrals are twice as efficient.',
    flavor: 'Hymn No. 1: "Caw". Hymn No. 2: "Caw (Remix)".',
    cost: { eyes: 6e9 }, requires: { building: { id: 'cathedral', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'cathedral', value: 2 } ] },
  { id: 'cath_buttress', name: 'Gothic Buttresses', icon: 'up_bell',
    desc: 'Cathedrals are twice as efficient.',
    flavor: 'Flying buttresses. The ravens find this very relatable.',
    cost: { eyes: 6e11 }, requires: { building: { id: 'cathedral', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'cathedral', value: 2 } ] },

  // ---- Moon Altar tiers ----
  { id: 'moon_offerings', name: 'Lunar Offerings', icon: 'up_potion',
    desc: 'Moon Altars are twice as efficient.',
    flavor: 'The moon accepts cheese. Rumors confirmed.',
    cost: { eyes: 1.3e10 }, requires: { building: { id: 'moon_altar', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'moon_altar', value: 2 } ] },
  { id: 'moon_tides', name: 'Tidal Rituals', icon: 'up_potion',
    desc: 'Moon Altars are twice as efficient.',
    flavor: 'High tide: lots of eyes. Low tide: also eyes. Weird beach.',
    cost: { eyes: 6.5e10 }, requires: { building: { id: 'moon_altar', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'moon_altar', value: 2 } ] },
  { id: 'moon_blood', name: 'Blood Moon Schedule', icon: 'up_potion',
    desc: 'Moon Altars are twice as efficient.',
    flavor: 'Now every Thursday. The astronomers have given up.',
    cost: { eyes: 6.5e12 }, requires: { building: { id: 'moon_altar', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'moon_altar', value: 2 } ] },

  // ---- Eclipse Portal tiers ----
  { id: 'portal_ushers', name: 'Void Ushers', icon: 'up_crown',
    desc: 'Eclipse Portals are twice as efficient.',
    flavor: '"Mind the gap. The gap is infinite."',
    cost: { eyes: 1.5e11 }, requires: { building: { id: 'eclipse_portal', count: 1 } },
    effects: [ { type: 'buildingMult', target: 'eclipse_portal', value: 2 } ] },
  { id: 'portal_doorstops', name: 'Dimensional Doorstops', icon: 'up_crown',
    desc: 'Eclipse Portals are twice as efficient.',
    flavor: 'Keeps reality propped open. Do not kick.',
    cost: { eyes: 7.5e11 }, requires: { building: { id: 'eclipse_portal', count: 10 } },
    effects: [ { type: 'buildingMult', target: 'eclipse_portal', value: 2 } ] },
  { id: 'portal_pass', name: 'Eclipse Season Pass', icon: 'up_crown',
    desc: 'Eclipse Portals are twice as efficient.',
    flavor: 'Unlimited void access. Blackout dates: all of them.',
    cost: { eyes: 7.5e13 }, requires: { building: { id: 'eclipse_portal', count: 25 } },
    effects: [ { type: 'buildingMult', target: 'eclipse_portal', value: 2 } ] },

  // ---- Synergies ----
  { id: 'syn_perches', name: 'Scarecrow Perches', icon: 'up_scroll',
    desc: 'Rookeries gain +1% per Servant Raven owned.',
    flavor: 'Ravens nap on scarecrows. Scarecrows pretend not to notice.',
    cost: { eyes: 80000 }, requires: [ { building: { id: 'rookery', count: 5 } }, { building: { id: 'servant_raven', count: 25 } } ],
    effects: [ { type: 'buildingMultPerOwned', target: 'rookery', source: 'servant_raven', value: 0.01 } ] },
  { id: 'syn_lookouts', name: 'Scarecrow Lookouts', icon: 'up_lens',
    desc: 'Watchtowers gain +1% per Scarecrow owned.',
    flavor: 'Scarecrows on the battlements. Nobody attacks. Nobody dares.',
    cost: { eyes: 3e6 }, requires: [ { building: { id: 'watchtower', count: 5 } }, { building: { id: 'scarecrow', count: 25 } } ],
    effects: [ { type: 'buildingMultPerOwned', target: 'watchtower', source: 'scarecrow', value: 0.01 } ] },
  { id: 'syn_enchanted_anvils', name: 'Enchanted Anvils', icon: 'up_anvil',
    desc: 'Blacksmiths gain +2% per Wizard Tower owned.',
    flavor: 'The anvil talks now. Mostly complaints.',
    cost: { eyes: 3e7 }, requires: [ { building: { id: 'blacksmith', count: 25 } }, { building: { id: 'wizard_tower', count: 5 } } ],
    effects: [ { type: 'buildingMultPerOwned', target: 'blacksmith', source: 'wizard_tower', value: 0.02 } ] },
  { id: 'syn_holy_bones', name: 'Holy Relics', icon: 'up_bell',
    desc: 'Cathedrals gain +1% per Catacombs owned.',
    flavor: 'Every cathedral needs a few bones in the basement. It is tradition.',
    cost: { eyes: 3e9 }, requires: [ { building: { id: 'cathedral', count: 5 } }, { building: { id: 'catacombs', count: 15 } } ],
    effects: [ { type: 'buildingMultPerOwned', target: 'cathedral', source: 'catacombs', value: 0.01 } ] },
  { id: 'syn_star_charts', name: 'Star Charts', icon: 'up_tome',
    desc: 'Moon Altars gain +1% per Wizard Tower owned.',
    flavor: 'Drawn by wizards. Mostly accurate. Some stars are doodles.',
    cost: { eyes: 5e10 }, requires: [ { building: { id: 'moon_altar', count: 5 } }, { building: { id: 'wizard_tower', count: 25 } } ],
    effects: [ { type: 'buildingMultPerOwned', target: 'moon_altar', source: 'wizard_tower', value: 0.01 } ] },

  // ---- Global production ----
  { id: 'royal_decree', name: 'Royal Decree of Eyes', icon: 'up_crown',
    desc: 'All eye production +25%.',
    flavor: '"By order of the King: more." — the whole decree.',
    cost: { eyes: 2e6 }, requires: { lifetimeEyes: 1e6 },
    effects: [ { type: 'globalMult', resource: 'eyes', value: 1.25 } ] },
  { id: 'crown_jewels', name: 'Crown of a Thousand Eyes', icon: 'up_crown',
    desc: 'All eye production +50%.',
    flavor: 'Heavy is the head that wears the crown. Heavier when it blinks.',
    cost: { eyes: 5e8 }, requires: { lifetimeEyes: 2e8 },
    effects: [ { type: 'globalMult', resource: 'eyes', value: 1.5 } ] },

  // ---- Mana: passive transmutation & mana multipliers ----
  { id: 'alchemist_monocle', name: "Alchemist's Monocle", icon: 'up_lens',
    desc: 'The King passively transmutes 1% of eyes/sec into Mana. (Eyes are kept!)',
    flavor: 'One lens. Infinite smugness.',
    cost: { eyes: 8000 }, requires: { lifetimeEyes: 4000 },
    effects: [ { type: 'manaConversion', value: 0.01 } ] },
  { id: 'eye_of_newt', name: 'Eye-of-Newt Distillery', icon: 'up_potion',
    desc: 'Passive transmutation +1% of eyes/sec.',
    flavor: 'Newts were consulted. Newts declined to comment.',
    cost: { eyes: 200000 }, requires: { lifetimeEyes: 100000 },
    effects: [ { type: 'manaConversion', value: 0.01 } ] },
  { id: 'wizard_tome', name: "Wizard's Tome", icon: 'up_tome',
    desc: 'All Mana gains x2.',
    flavor: 'Chapter 1: Mana. Chapter 2: More Mana. Chapter 3: Snacks.',
    cost: { eyes: 3e6 }, requires: { building: { id: 'wizard_tower', count: 1 } },
    effects: [ { type: 'manaMult', value: 2 } ] },
  { id: 'philosophers_pupil', name: "Philosopher's Pupil", icon: 'up_potion',
    desc: 'Passive transmutation +2% of eyes/sec.',
    flavor: 'Turns lead into gold. Turns eyes into Mana. Turns heads.',
    cost: { eyes: 5e7 }, requires: { lifetimeEyes: 2e7 },
    effects: [ { type: 'manaConversion', value: 0.02 } ] },
  { id: 'moonlit_grimoire', name: 'Moonlit Grimoire', icon: 'up_tome',
    desc: 'All Mana gains x2.',
    flavor: 'Only readable at night. Also only readable by owls. Bad design.',
    cost: { eyes: 5e9 }, requires: { building: { id: 'moon_altar', count: 1 } },
    effects: [ { type: 'manaMult', value: 2 } ] },
  { id: 'arcane_crown', name: 'Arcane Crown', icon: 'up_crown',
    desc: 'All Mana gains x3. (Requires one Eclipse.)',
    flavor: 'Fits better after the apocalypse.',
    cost: { eyes: 1e7 }, requires: { prestiges: 1 },
    effects: [ { type: 'manaMult', value: 3 } ] },

  // ---- Economy ----
  { id: 'feathered_guild', name: 'Feathered Merchant Guild', icon: 'up_scroll',
    desc: 'All buildings are 5% cheaper.',
    flavor: 'Haggling is just aggressive cawing.',
    cost: { eyes: 400000 }, requires: { lifetimeEyes: 200000 },
    effects: [ { type: 'costMult', value: 0.95 } ] },
  { id: 'tax_loophole', name: 'Royal Tax Loophole', icon: 'up_crown',
    desc: 'All buildings are 5% cheaper.',
    flavor: 'The King is exempt from taxes. He wrote the taxes.',
    cost: { eyes: 4e8 }, requires: { lifetimeEyes: 1.5e8 },
    effects: [ { type: 'costMult', value: 0.95 } ] },

  // ---- Omens ----
  { id: 'omen_bell', name: 'Bell of Ill Omens', icon: 'up_bell',
    desc: 'Golden Omens appear 15% more often.',
    flavor: 'Ring it and something golden flaps by. Probably.',
    cost: { eyes: 20000 }, requires: { lifetimeEyes: 10000 },
    effects: [ { type: 'omenRateMult', value: 0.85 } ] },
  { id: 'omen_lure', name: 'Glitter Lure', icon: 'up_potion',
    desc: 'Timed Omen effects last 50% longer.',
    flavor: 'Omens cannot resist glitter. Nobody can.',
    cost: { eyes: 2e6 }, requires: { lifetimeEyes: 1e6 },
    effects: [ { type: 'omenDurationMult', value: 1.5 } ] },
  { id: 'omen_bell_2', name: 'Cathedral Bells', icon: 'up_bell',
    desc: 'Golden Omens appear 15% more often.',
    flavor: 'DONG. DONG. Omen. DONG.',
    cost: { eyes: 5e9 }, requires: { building: { id: 'cathedral', count: 1 } },
    effects: [ { type: 'omenRateMult', value: 0.85 } ] },

  // ---- Offline ----
  { id: 'night_shift', name: 'Night Shift Ravens', icon: 'up_cage',
    desc: 'Offline production efficiency +15%.',
    flavor: 'Ravens are nocturnal. Mostly. When it suits them.',
    cost: { eyes: 50000 }, requires: { lifetimeEyes: 25000 },
    effects: [ { type: 'offlineEfficiency', value: 0.15 } ] },
  { id: 'sleepwalking', name: 'Royal Sleepwalking', icon: 'up_potion',
    desc: 'Offline production efficiency +20%.',
    flavor: 'The King collects eyes in his sleep. The castle staff are concerned.',
    cost: { eyes: 5e7 }, requires: { lifetimeEyes: 2e7 },
    effects: [ { type: 'offlineEfficiency', value: 0.2 } ] },

  // ---- Spells ----
  { id: 'hourglass_of_crows', name: 'Hourglass of Crows', icon: 'up_tome',
    desc: 'Spell cooldowns are 20% shorter.',
    flavor: 'The sand is tiny ground-up feathers. Do not ask.',
    cost: { eyes: 1e8 }, requires: { building: { id: 'wizard_tower', count: 10 } },
    effects: [ { type: 'spellCooldownMult', value: 0.8 } ] },

  // ---- Post-Eclipse perks ----
  { id: 'feather_memory', name: 'Feathered Memory', icon: 'up_scroll',
    desc: 'Clicking x3 and offline efficiency +15%. (Requires one Eclipse.)',
    flavor: 'You remember the last world. Mostly the eyes.',
    cost: { eyes: 1000 }, requires: { prestiges: 1 },
    effects: [ { type: 'clickMult', value: 3 }, { type: 'offlineEfficiency', value: 0.15 } ] },
];

/* ---------------------------------------------------------------------
 * SPELLS — paid in Mana. duration/cooldown in seconds.
 * ------------------------------------------------------------------- */
export const SPELLS = [
  // ---- Rituals: cast with Souls once the Underworld is open (Obsidian Key)
  { id: 'ritual_harvest', name: 'Soul Harvest', icon: 'sp_moon', ritual: true,
    desc: 'Reap the Underworld: instantly gain 20 minutes of eye production.',
    flavor: 'The dead do not need them anymore.',
    cost: { souls: 400 }, duration: 0, cooldown: 600,
    requires: { featherUp: 'obsidian_key' },
    effects: [ { type: 'instantProduction', resource: 'eyes', seconds: 1200, min: 1000 } ] },
  { id: 'ritual_whispers', name: 'Veil of Whispers', icon: 'sp_gaze', ritual: true,
    desc: 'Tears the veil: a golden Omen appears right now, and Omens last twice as long for 3 minutes.',
    flavor: 'Something golden answered the call.',
    cost: { souls: 1500 }, duration: 180, cooldown: 900,
    requires: { featherUp: 'obsidian_key' },
    effects: [ { type: 'spawnOmen' }, { type: 'omenDurationMult', value: 2 } ] },
  { id: 'ritual_frenzy', name: 'Grave Frenzy', icon: 'sp_frenzy', ritual: true,
    desc: 'The dead cheer you on: clicks x25 and eye production x2 for 60 seconds.',
    flavor: 'Loud. Very loud.',
    cost: { souls: 4000 }, duration: 60, cooldown: 900,
    requires: { featherUp: 'obsidian_key' },
    effects: [ { type: 'clickMult', value: 25 }, { type: 'globalMult', resource: 'eyes', value: 2 } ] },
  { id: 'murder_frenzy', name: 'Murder Frenzy', icon: 'sp_frenzy',
    desc: 'All eye production x3 for 30s.',
    flavor: 'A group of crows is a murder. A group of ravens is an unkindness. This is both.',
    cost: { mana: 25 }, duration: 30, cooldown: 180,
    requires: { upgrade: 'alchemist_monocle' },
    effects: [ { type: 'globalMult', resource: 'eyes', value: 3 } ] },
  { id: 'kings_gaze', name: "King's Gaze", icon: 'sp_gaze',
    desc: 'Clicks x20 and each click grabs 10% of eyes/sec, for 20s.',
    flavor: 'He looks at you. You give him your eyes. Simple as that.',
    cost: { mana: 150 }, duration: 20, cooldown: 300,
    requires: { lifetimeEyes: 100000 },
    effects: [ { type: 'clickMult', value: 20 }, { type: 'clickPctOfEps', value: 0.1 } ] },
  { id: 'harvest_moon', name: 'Harvest Moon', icon: 'sp_moon',
    desc: 'Instantly gain 5 minutes of eye production.',
    flavor: 'The moon goes "boing" and eyes rain down. Bring an umbrella.',
    cost: { mana: 2000 }, duration: 0, cooldown: 600,
    requires: { building: { id: 'wizard_tower', count: 1 } },
    effects: [ { type: 'instantProduction', resource: 'eyes', seconds: 300, min: 1000 } ] },
  { id: 'eye_storm', name: 'Eyestorm', icon: 'sp_storm',
    desc: 'All eye production x2 and Mana x3 for 2 minutes.',
    flavor: 'Forecast: 100% chance of eyeballs. Occasional pupils.',
    cost: { mana: 25000 }, duration: 120, cooldown: 600,
    requires: { building: { id: 'catacombs', count: 1 } },
    effects: [ { type: 'globalMult', resource: 'eyes', value: 2 }, { type: 'manaMult', value: 3 } ] },
];

/* ---------------------------------------------------------------------
 * MARKET — consumables (repeatable, cost x costGrowth each buy) and skins.
 * Consumables with `duration` apply their effects as a timed buff.
 * ------------------------------------------------------------------- */
export const MARKET = [
  { id: 'eye_jar', kind: 'consumable', name: 'Jar of Eyes', icon: 'mk_jar',
    desc: 'Instantly gain 10 minutes of eye production.',
    flavor: 'Pickled. Do not open at dinner.',
    cost: { mana: 40 }, costGrowth: 2.5, yield: { free: 5, decay: 0.8 },
    gates: [ { res: 'feathers', from: 10, base: 5, growth: 1.35 }, { res: 'souls', from: 20, base: 20, growth: 1.3 } ],
    requires: { upgrade: 'alchemist_monocle' },
    effects: [ { type: 'instantProduction', resource: 'eyes', seconds: 600, min: 100 } ] },
  { id: 'haste_potion', kind: 'consumable', name: 'Potion of Haste', icon: 'mk_potion',
    desc: 'All eye production x2 for 5 minutes.',
    flavor: 'Side effects include: speed, more speed, mild cawing.',
    cost: { mana: 300 }, costGrowth: 2, duration: 300,
    requires: { lifetimeEyes: 50000 },
    effects: [ { type: 'globalMult', resource: 'eyes', value: 2 } ] },
  { id: 'fury_tonic', kind: 'consumable', name: 'Tonic of Fury', icon: 'mk_potion',
    desc: 'Clicks x10 for 60 seconds.',
    flavor: 'Tastes like rage and blueberries.',
    cost: { mana: 200 }, costGrowth: 2, duration: 60,
    requires: { lifetimeEyes: 20000 },
    effects: [ { type: 'clickMult', value: 10 } ] },
  { id: 'dragon_hoard', kind: 'consumable', name: "Dragon's Hoard", icon: 'mk_chest',
    desc: 'Instantly gain 1 hour of eye production.',
    flavor: 'The dragon is not home. Probably. Be quick.',
    cost: { mana: 5000 }, costGrowth: 4, yield: { free: 3, decay: 0.7 },
    gates: [ { res: 'feathers', from: 10, base: 10, growth: 1.5 }, { res: 'souls', from: 20, base: 40, growth: 1.4 } ],
    requires: { building: { id: 'wizard_tower', count: 1 } },
    effects: [ { type: 'instantProduction', resource: 'eyes', seconds: 3600, min: 1e6 } ] },

  { id: 'skin_frost', kind: 'skin', name: 'Frost King', icon: 'king', skin: 'frost',
    desc: 'An icy crown and a cape of winter. Cool. Literally.',
    cost: { mana: 20000 } },
  { id: 'skin_blood', kind: 'skin', name: 'Blood King', icon: 'king', skin: 'blood',
    desc: 'Crimson cape, red eyes. Spooky season, all year.',
    cost: { feathers: 10 } },
  { id: 'skin_gold', kind: 'skin', name: 'Golden King', icon: 'king', skin: 'gold',
    desc: 'Solid gold everything. Tasteful? No. Magnificent? Yes.',
    cost: { feathers: 50 } },
];

/* ---------------------------------------------------------------------
 * SPARK_SHOP — items paid with faíscas (Énóis currency). `sparks` is in mf (1 faísca = 1000 mf).
 * Payment goes through js/sparks.js. Effects reuse the Market effect types.
 * ------------------------------------------------------------------- */
export const SPARK_SHOP = [
  // sparks in mf: 1 faísca = 1000 mf. Tiers by rarity: 1 · 3 · 5 · 10 · 20 · 50 · 100 faíscas.
  // Balance: only ONE timed spark boost can be active at a time (js/main.js buySpark), so multipliers never pile up.
  { id: 'spark_fury', name: 'Spark of Fury', icon: 'mk_potion',
    desc: 'Clicks x10 for 2 minutes.', flavor: 'Crackles when you hold it.',
    sparks: 1000, duration: 120,
    effects: [ { type: 'clickMult', value: 10 } ] },
  { id: 'ember_elixir', name: 'Ember Elixir', icon: 'mk_potion',
    desc: 'All eye production x2 for 10 minutes.', flavor: 'Warm. Slightly alive.',
    sparks: 3000, duration: 600,
    effects: [ { type: 'globalMult', resource: 'eyes', value: 2 } ] },
  { id: 'spark_hoard', name: 'Spark Hoard', icon: 'mk_chest',
    desc: 'Instantly gain 2 hours of eye production.', flavor: 'The ravens whisper: worth it.',
    sparks: 5000,
    effects: [ { type: 'instantProduction', resource: 'eyes', seconds: 7200, min: 1e5 } ] },
  { id: 'phoenix_tonic', name: 'Phoenix Tonic', icon: 'mk_potion',
    desc: 'All eye production x3 for 30 minutes.', flavor: 'Burns going down. Rises again.',
    sparks: 10000, duration: 1800,
    effects: [ { type: 'globalMult', resource: 'eyes', value: 3 } ] },
  { id: 'dragon_spark', name: "Dragon's Spark", icon: 'mk_chest',
    desc: 'Instantly gain 8 hours of eye production.', flavor: 'A whole shift, folded into one flame.',
    sparks: 20000,
    effects: [ { type: 'instantProduction', resource: 'eyes', seconds: 28800, min: 1e6 } ] },
  { id: 'raven_blessing', name: "Raven's Blessing", icon: 'mk_potion',
    desc: 'All eye production x5 and clicks x5 for 2 hours.', flavor: 'The whole flock sings your name.',
    sparks: 50000, duration: 7200,
    effects: [ { type: 'globalMult', resource: 'eyes', value: 5 }, { type: 'clickMult', value: 5 } ] },
  { id: 'crown_of_embers', name: 'Crown of Embers', icon: 'mk_chest',
    desc: 'Instantly gain 24 hours of eye production.', flavor: 'Legendary. The merchant refuses to haggle.',
    sparks: 100000,
    effects: [ { type: 'instantProduction', resource: 'eyes', seconds: 86400, min: 1e7 } ] },

  // Skins (bought once, equip anytime)
  { id: 'skin_ember', kind: 'skin', name: 'Ember King', icon: 'king', skin: 'ember',
    desc: 'A crown of living flame. Warm to the touch.', sparks: 10000,
    world: 'Embers rise around the king and the whole stage glows like a forge.',
    ostName: 'Forge Embers', ostDesc: 'Warm and low, with a forge heartbeat and crackling sparks.',
    ambient: 'ember', perks: ['+25% eyes / sec'],
    effects: [ { type: 'globalMult', resource: 'eyes', value: 1.25 } ] },
  { id: 'skin_aurora', kind: 'skin', name: 'Aurora King', icon: 'king', skin: 'aurora',
    desc: 'Northern lights stitched into the cape.', sparks: 20000,
    world: 'Ribbons of green and violet light ripple across the night sky.',
    ostName: 'Northern Lights', ostDesc: 'Airy chords and bells that echo like ribbons of light.',
    ambient: 'aurora', perks: ['+15% eyes / sec', 'Omens 30% more often', 'Omens last 50% longer'],
    effects: [ { type: 'globalMult', resource: 'eyes', value: 1.15 }, { type: 'omenRateMult', value: 0.7 }, { type: 'omenDurationMult', value: 1.5 } ] },
  { id: 'skin_void', kind: 'skin', name: 'Void King', icon: 'king', skin: 'void',
    desc: 'Cut from the dark between the stars.', sparks: 50000,
    world: 'The sky darkens and a cyan and violet rift breathes behind the king.',
    ostName: 'The Hollow Between', ostDesc: 'Cold and sparse: a deep drone, slow glides, a distant heartbeat.',
    ambient: 'void', perks: ['Clicks x2', '+50% mana', 'Spells recharge 20% faster'],
    effects: [ { type: 'clickMult', value: 2 }, { type: 'manaMult', value: 1.5 }, { type: 'spellCooldownMult', value: 0.8 } ] },
  { id: 'skin_prism', kind: 'skin', name: 'Prism King', icon: 'king', skin: 'prism',
    desc: 'Every color at once. The rarest crown in the realm.', sparks: 100000,
    world: 'Prismatic light spins around the king. Every 20 seconds the Spectrum changes phase. Ruby: clicks x3 and each click adds 3% of your eyes per second. Topaz: eyes x1.5. Sapphire: mana x2 and spells recharge 30% faster.',
    ostName: 'Spectrum', ostDesc: 'Bright crystal bells whose key follows the Spectrum phase.',
    ambient: 'prism',
    perks: ['Eyes / sec x1.5, +25% mana, buildings 5% cheaper', 'Refraction: every Omen splits in two', 'Spectrum: Ruby, Topaz and Sapphire phases every 20s'],
    effects: [ { type: 'globalMult', resource: 'eyes', value: 1.5 }, { type: 'manaMult', value: 1.25 }, { type: 'costMult', value: 0.95 },
               { type: 'omenRateMult', value: 0.85 }, { type: 'omenSplit', value: 0.5 } ],
    // Spectrum: a 60s wall-clock cycle, 20s per phase. Only the current phase's effects are active.
    cycle: { period: 60, phases: [
      { id: 'ruby',     label: 'Ruby',     effects: [ { type: 'clickMult', value: 3 }, { type: 'clickPctOfEps', value: 0.03 } ] },
      { id: 'topaz',    label: 'Topaz',    effects: [ { type: 'globalMult', resource: 'eyes', value: 1.5 } ] },
      { id: 'sapphire', label: 'Sapphire', effects: [ { type: 'manaMult', value: 2 }, { type: 'spellCooldownMult', value: 0.7 } ] },
    ] } },
];

/* ---------------------------------------------------------------------
 * FEATHER_UPGRADES — permanent, bought with Black Feathers, survive the Eclipse.
 * (Feathers spent here do NOT lower the feather bonus: the bonus counts feathers ever earned.)
 * ------------------------------------------------------------------- */
export const FEATHER_UPGRADES = [
  { id: 'fu_pinion', name: 'Pinion Pact', icon: 'up_crown', desc: 'All eye production x1.25.', cost: { feathers: 25 }, requires: { prestiges: 1 }, effects: [ { type: 'globalMult', resource: 'eyes', value: 1.25 } ] },
  { id: 'fu_tithe', name: 'Night Tithe', icon: 'up_scroll', desc: 'All eye production x1.25.', cost: { feathers: 400 }, requires: { prestiges: 2 }, effects: [ { type: 'globalMult', resource: 'eyes', value: 1.25 } ] },
  { id: 'fu_quill', name: 'Moonfeather Quill', icon: 'up_tome', desc: 'All eye production x1.3.', cost: { feathers: 5000 }, requires: { prestiges: 3 }, effects: [ { type: 'globalMult', resource: 'eyes', value: 1.3 } ] },
  { id: 'fu_crown', name: 'Crown of Pinions', icon: 'up_crown', desc: 'All eye production x1.35.', cost: { feathers: 60000 }, requires: { prestiges: 5 }, effects: [ { type: 'globalMult', resource: 'eyes', value: 1.35 } ] },
  { id: 'fu_nest', name: 'Heirloom Nest', icon: 'up_cage', desc: 'All eye production x1.4.', cost: { feathers: 8e5 }, requires: { prestiges: 8 }, effects: [ { type: 'globalMult', resource: 'eyes', value: 1.4 } ] },
  { id: 'fu_eclipse_eye', name: 'Eye of the Eclipse', icon: 'up_lens', desc: 'All eye production x1.5.', cost: { feathers: 1.2e7 }, requires: { prestiges: 12 }, effects: [ { type: 'globalMult', resource: 'eyes', value: 1.5 } ] },
  { id: 'fu_molt', name: "Merchant's Molt", icon: 'up_scroll', desc: 'Buildings cost 5% less.', cost: { feathers: 1500 }, requires: { prestiges: 3 }, effects: [ { type: 'costMult', value: 0.95 } ] },
  { id: 'fu_plumage', name: 'Tax Plumage', icon: 'up_crown', desc: 'Buildings cost another 5% less.', cost: { feathers: 3e5 }, requires: { prestiges: 8 }, effects: [ { type: 'costMult', value: 0.95 } ] },
  { id: 'fu_ink', name: 'Inkwell of Ash', icon: 'up_potion', desc: 'Mana gains x1.5.', cost: { feathers: 800 }, requires: { prestiges: 2 }, effects: [ { type: 'manaMult', value: 1.5 } ] },
  { id: 'fu_void_quill', name: 'Void Quill', icon: 'up_lens', desc: 'Passive transmute +3% of eye production.', cost: { feathers: 20000 }, requires: { prestiges: 4 }, effects: [ { type: 'manaConversion', value: 0.03 } ] },
  { id: 'fu_grimoire', name: 'Black Grimoire', icon: 'up_tome', desc: 'Mana gains x1.5 again.', cost: { feathers: 5e5 }, requires: { prestiges: 10 }, effects: [ { type: 'manaMult', value: 1.5 } ] },
  { id: 'fu_bell', name: 'Carrion Bell', icon: 'up_bell', desc: 'Omens appear 15% more often.', cost: { feathers: 3000 }, requires: { prestiges: 3 }, effects: [ { type: 'omenRateMult', value: 0.85 } ] },
  { id: 'fu_glitter', name: 'Glitter Hoard', icon: 'up_potion', desc: 'Omens last 30% longer.', cost: { feathers: 40000 }, requires: { prestiges: 6 }, effects: [ { type: 'omenDurationMult', value: 1.3 } ] },
  { id: 'fu_hourglass', name: 'Hourglass of Ash', icon: 'up_tome', desc: 'Spells recharge 15% faster.', cost: { feathers: 10000 }, requires: { prestiges: 4 }, effects: [ { type: 'spellCooldownMult', value: 0.85 } ] },
  { id: 'fu_night', name: 'The Long Night', icon: 'up_cage', desc: 'Offline progress lasts 4 hours longer.', cost: { feathers: 5000 }, requires: { prestiges: 3 }, effects: [ { type: 'offlineHours', value: 4 } ] },
  { id: 'fu_longer_night', name: 'The Longer Night', icon: 'up_cage', desc: 'Offline progress lasts 4 more hours.', cost: { feathers: 1e5 }, requires: { prestiges: 8 }, effects: [ { type: 'offlineHours', value: 4 } ] },
  { id: 'fu_echo', name: 'Talon Echo', icon: 'up_talons', desc: 'Each click also gives 2% of your eyes per second.', cost: { feathers: 2000 }, requires: { prestiges: 2 }, effects: [ { type: 'clickPctOfEps', value: 0.02 } ] },
  { id: 'fu_storm', name: 'Talon Storm', icon: 'up_beak', desc: 'Each click also gives 3% more of your eyes per second.', cost: { feathers: 1e5 }, requires: { prestiges: 7 }, effects: [ { type: 'clickPctOfEps', value: 0.03 } ] },
  { id: 'fu_roost1', name: 'Rooted Roost I', icon: 'up_anvil', desc: 'Keep 3% of each building through an Eclipse (max 20 each).', cost: { feathers: 2e5 }, requires: { prestiges: 6 }, effects: [ { type: 'keepBuildingsPct', value: 3 } ] },
  { id: 'fu_roost2', name: 'Rooted Roost II', icon: 'up_anvil', desc: 'Keep 4% more of each building through an Eclipse.', cost: { feathers: 3e6 }, requires: { prestiges: 10 }, effects: [ { type: 'keepBuildingsPct', value: 4 } ] },
  { id: 'fu_roost3', name: 'Rooted Roost III', icon: 'up_anvil', desc: 'Keep 3% more of each building through an Eclipse.', cost: { feathers: 5e7 }, requires: { prestiges: 20 }, effects: [ { type: 'keepBuildingsPct', value: 3 } ] },
  { id: 'fu_mercy1', name: 'Gate Mercy I', icon: 'up_scroll', desc: 'Feather costs past 150 buildings x0.85.', cost: { feathers: 2e6 }, requires: { prestiges: 12 }, effects: [ { type: 'gateCostMult', value: 0.85 } ] },
  { id: 'fu_mercy2', name: 'Gate Mercy II', icon: 'up_scroll', desc: 'Feather costs past 150 buildings x0.85 again.', cost: { feathers: 2e7 }, requires: { prestiges: 20 }, effects: [ { type: 'gateCostMult', value: 0.85 } ] },
  { id: 'obsidian_key', name: 'Obsidian Key', icon: 'lock', desc: 'Opens the way to the Underworld.', cost: { feathers: 2500 }, requires: { prestiges: 5 }, effects: [] },
];

/* ---------------------------------------------------------------------
 * UNDERWORLD — second map. EVERYTHING here is bought with Black Feathers.
 * Buildings make Souls (not a currency). Souls give a bounded bonus to the surface:
 * f = souls / (souls + H); eyes x(1+2f), mana x(1+f), feather gate -30%*f.
 * ------------------------------------------------------------------- */
export const UNDERWORLD = {
  H: 3e4, growth: 1.22,
  buildings: [
    { id: 'u_shade_raven',  name: 'Shade Raven',     icon: 'servant_raven',  baseCost: 10,   souls: 0.1,  desc: 'A raven that never learned to leave.' },
    { id: 'u_scarecrow',    name: 'Bone Scarecrow',  icon: 'scarecrow',      baseCost: 60,   souls: 0.5,  desc: 'Guards nothing. Collects everything.' },
    { id: 'u_roost',        name: 'Gloom Roost',     icon: 'rookery',        baseCost: 400,  souls: 2.5,  desc: 'Damp, dark, and very popular.' },
    { id: 'u_hellforge',    name: 'Hellforge',       icon: 'blacksmith',     baseCost: 3000, souls: 12,   desc: 'Tempers souls into something useful.' },
    { id: 'u_spire',        name: 'Lantern Spire',   icon: 'watchtower',     baseCost: 25000, souls: 60,  desc: 'Lights the way down. Not back up.' },
    { id: 'u_ossuary',      name: 'Ossuary',         icon: 'catacombs',      baseCost: 2e5,  souls: 300, desc: 'Every bone has a story. Most are short.' },
    { id: 'u_cathedral',    name: 'Pale Cathedral',  icon: 'cathedral',      baseCost: 1.8e6, souls: 1500, desc: 'The choir has been singing for centuries.' },
    { id: 'u_maw',          name: 'Maw of the Abyss', icon: 'eclipse_portal', baseCost: 2e7, souls: 7500, desc: 'It is hungry. It is always hungry.' },
  ],
  // PACTS: pick ONE at a time (swapping costs souls again). Souls are SPENT here, so the choice is a real build decision.
  pacts: [
    { id: 'pact_greed',   name: 'Pact of Greed',   icon: 'up_crown',  cost: { souls: 300 }, desc: 'Eyes x1.4, but buildings cost 25% more.',
      effects: [ { type: 'globalMult', resource: 'eyes', value: 1.4 }, { type: 'costMult', value: 1.25 } ] },
    { id: 'pact_haste',   name: 'Pact of Haste',   icon: 'up_bell',   cost: { souls: 300 }, desc: 'Spells recharge twice as fast. Omens come 40% more often and last 50% longer.',
      effects: [ { type: 'spellCooldownMult', value: 0.5 }, { type: 'omenRateMult', value: 0.6 }, { type: 'omenDurationMult', value: 1.5 } ] },
    { id: 'pact_blood',   name: 'Pact of Blood',   icon: 'up_talons', cost: { souls: 300 }, desc: 'Clicks x4 and each click adds 5% of your eyes per second.',
      effects: [ { type: 'clickMult', value: 4 }, { type: 'clickPctOfEps', value: 0.05 } ] },
    { id: 'pact_silence', name: 'Pact of Silence', icon: 'up_tome',   cost: { souls: 300 }, desc: 'Mana x2.5 and passive transmute +5% of eye production.',
      effects: [ { type: 'manaMult', value: 2.5 }, { type: 'manaConversion', value: 0.05 } ] },
    { id: 'pact_memory',  name: 'Pact of Memory',  icon: 'up_cage',   cost: { souls: 300 }, desc: 'Offline progress lasts 8 hours longer and is 25% more efficient. Keep 5% of each building through an Eclipse.',
      effects: [ { type: 'offlineHours', value: 8 }, { type: 'offlineEfficiency', value: 0.25 }, { type: 'keepBuildingsPct', value: 5 } ] },
  ],
  upgrades: [
    { id: 'uu_tithe',   name: 'Grave Tithe',    icon: 'up_scroll', desc: 'Souls x1.5.', cost: { feathers: 300 }, effects: [ { type: 'globalMult', resource: 'souls', value: 1.5 } ] },
    { id: 'uu_lineage', name: 'Shade Lineage',  icon: 'up_cage',   desc: 'Shade Ravens and Bone Scarecrows x2.', cost: { feathers: 1500 }, effects: [ { type: 'buildingMult', target: 'u_shade_raven', value: 2 }, { type: 'buildingMult', target: 'u_scarecrow', value: 2 } ] },
    { id: 'uu_choir',   name: 'Whisper Choir',  icon: 'up_bell',   desc: 'Souls x1.5.', cost: { feathers: 6000 }, effects: [ { type: 'globalMult', resource: 'souls', value: 1.5 } ] },
    { id: 'uu_lantern', name: 'Soul Lantern',   icon: 'up_lens',   desc: 'Souls x1.5.', cost: { feathers: 1e5 }, effects: [ { type: 'globalMult', resource: 'souls', value: 1.5 } ] },
    { id: 'uu_throne',  name: 'Hollow Throne',  icon: 'up_crown',  desc: 'Souls count double toward the surface bonus.', cost: { feathers: 2e6 }, effects: [ { type: 'soulHMult', value: 0.5 } ] },
    { id: 'uu_pact',    name: 'Abyssal Pact',   icon: 'up_tome',   desc: 'Souls x2.', cost: { feathers: 5e7 }, effects: [ { type: 'globalMult', resource: 'souls', value: 2 } ] },
  ],
};

/* ---------------------------------------------------------------------
 * ACHIEVEMENTS
 * condition = { stat, gte } where stat is one of:
 *   'lifetimeEyes'    total eyes ever collected (all runs)
 *   'lifetimeMana'    total mana ever gained
 *   'clicks'          total clicks on the King
 *   'omens'           golden Omens clicked
 *   'prestiges'       Eclipses performed
 *   'totalBuildings'  sum of all buildings currently owned
 *   'building:<id>'   count of one building, e.g. 'building:rookery'
 *   'upgrades'        number of upgrades owned
 *   'achievements'    number of achievements unlocked
 * reward.globalMultPct: % added to the additive achievement pool.
 * ------------------------------------------------------------------- */
export const ACHIEVEMENTS = [
  // Lifetime eyes
  { id: 'first_blink', name: 'First Blink', desc: 'Collect your first eye.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1 }, reward: { globalMultPct: 1 } },
  { id: 'eye_see_you', name: 'Eye See You', desc: 'Collect 100 eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 100 }, reward: { globalMultPct: 1 } },
  { id: 'pupil_of_note', name: 'Pupil of Note', desc: 'Collect 1,000 eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e3 }, reward: { globalMultPct: 1 } },
  { id: 'eyeball_hoarder', name: 'Eyeball Hoarder', desc: 'Collect 10,000 eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e4 }, reward: { globalMultPct: 1 } },
  { id: 'iris_ascendant', name: 'Iris Ascendant', desc: 'Collect 100,000 eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e5 }, reward: { globalMultPct: 2 } },
  { id: 'eye_millionaire', name: 'Eye-llionaire', desc: 'Collect 1 million eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e6 }, reward: { globalMultPct: 2 } },
  { id: 'all_seeing', name: 'All-Seeing', desc: 'Collect 10 million eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e7 }, reward: { globalMultPct: 2 } },
  { id: 'eye_of_the_storm', name: 'Eye of the Storm', desc: 'Collect 100 million eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e8 }, reward: { globalMultPct: 3 } },
  { id: 'billion_blinks', name: 'A Billion Blinks', desc: 'Collect 1 billion eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e9 }, reward: { globalMultPct: 3 } },
  { id: 'cosmic_cornea', name: 'Cosmic Cornea', desc: 'Collect 100 billion eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e11 }, reward: { globalMultPct: 3 } },
  { id: 'eye_singularity', name: 'Eye Singularity', desc: 'Collect 10 trillion eyes.', icon: 'ach',
    condition: { stat: 'lifetimeEyes', gte: 1e13 }, reward: { globalMultPct: 5 } },

  // Clicks
  { id: 'poke', name: 'Poke', desc: 'Click the King 10 times.', icon: 'ach',
    condition: { stat: 'clicks', gte: 10 }, reward: { globalMultPct: 1 } },
  { id: 'pokey_poke', name: 'Royal Annoyance', desc: 'Click the King 500 times.', icon: 'ach',
    condition: { stat: 'clicks', gte: 500 }, reward: { globalMultPct: 1 } },
  { id: 'carpal_crown', name: 'Carpal Crown Syndrome', desc: 'Click the King 3,000 times.', icon: 'ach',
    condition: { stat: 'clicks', gte: 3000 }, reward: { globalMultPct: 2 } },
  { id: 'click_tyrant', name: 'Click Tyrant', desc: 'Click the King 15,000 times. Please rest.', icon: 'ach',
    condition: { stat: 'clicks', gte: 15000 }, reward: { globalMultPct: 3 } },

  // Buildings
  { id: 'tiny_kingdom', name: 'Tiny Kingdom', desc: 'Own 10 buildings.', icon: 'ach',
    condition: { stat: 'totalBuildings', gte: 10 }, reward: { globalMultPct: 1 } },
  { id: 'growing_realm', name: 'Growing Realm', desc: 'Own 50 buildings.', icon: 'ach',
    condition: { stat: 'totalBuildings', gte: 50 }, reward: { globalMultPct: 1 } },
  { id: 'gothic_sprawl', name: 'Gothic Sprawl', desc: 'Own 150 buildings.', icon: 'ach',
    condition: { stat: 'totalBuildings', gte: 150 }, reward: { globalMultPct: 2 } },
  { id: 'empire_of_eyes', name: 'Empire of Eyes', desc: 'Own 300 buildings.', icon: 'ach',
    condition: { stat: 'totalBuildings', gte: 300 }, reward: { globalMultPct: 3 } },
  { id: 'unkindness', name: 'An Unkindness', desc: 'Own 50 Servant Ravens.', icon: 'ach',
    condition: { stat: 'building:servant_raven', gte: 50 }, reward: { globalMultPct: 1 } },
  { id: 'hammer_time', name: 'Hammer Time', desc: 'Own 25 Blacksmiths.', icon: 'ach',
    condition: { stat: 'building:blacksmith', gte: 25 }, reward: { globalMultPct: 2 } },
  { id: 'tower_defense', name: 'Tower Offense', desc: 'Own 10 Watchtowers.', icon: 'ach',
    condition: { stat: 'building:watchtower', gte: 10 }, reward: { globalMultPct: 1 } },
  { id: 'wizard_council', name: 'Council of Hats', desc: 'Own 10 Wizard Towers.', icon: 'ach',
    condition: { stat: 'building:wizard_tower', gte: 10 }, reward: { globalMultPct: 2 } },
  { id: 'through_the_void', name: 'Through the Void', desc: 'Own an Eclipse Portal.', icon: 'ach',
    condition: { stat: 'building:eclipse_portal', gte: 1 }, reward: { globalMultPct: 3 } },

  // Omens
  { id: 'lucky_glint', name: 'Lucky Glint', desc: 'Catch a golden Omen.', icon: 'ach',
    condition: { stat: 'omens', gte: 1 }, reward: { globalMultPct: 1 } },
  { id: 'omen_hunter', name: 'Omen Hunter', desc: 'Catch 10 golden Omens.', icon: 'ach',
    condition: { stat: 'omens', gte: 10 }, reward: { globalMultPct: 2 } },
  { id: 'prophet', name: 'Prophet of Gold', desc: 'Catch 50 golden Omens.', icon: 'ach',
    condition: { stat: 'omens', gte: 50 }, reward: { globalMultPct: 3 } },

  // Mana
  { id: 'first_spark', name: 'First Spark', desc: 'Gain 100 Mana.', icon: 'ach',
    condition: { stat: 'lifetimeMana', gte: 100 }, reward: { globalMultPct: 1 } },
  { id: 'apprentice', name: 'Sorcerer\'s Apprentice', desc: 'Gain 10,000 Mana.', icon: 'ach',
    condition: { stat: 'lifetimeMana', gte: 1e4 }, reward: { globalMultPct: 2 } },
  { id: 'archmage', name: 'Archmage of Eyes', desc: 'Gain 1 million Mana.', icon: 'ach',
    condition: { stat: 'lifetimeMana', gte: 1e6 }, reward: { globalMultPct: 3 } },

  // Upgrades / meta
  { id: 'tinkerer', name: 'Tinkerer', desc: 'Own 10 upgrades.', icon: 'ach',
    condition: { stat: 'upgrades', gte: 10 }, reward: { globalMultPct: 1 } },
  { id: 'over_engineered', name: 'Over-Engineered', desc: 'Own 35 upgrades.', icon: 'ach',
    condition: { stat: 'upgrades', gte: 35 }, reward: { globalMultPct: 2 } },
  { id: 'trophy_case', name: 'Trophy Case', desc: 'Unlock 25 achievements.', icon: 'ach',
    condition: { stat: 'achievements', gte: 25 }, reward: { globalMultPct: 3 } },

  // Prestige
  { id: 'first_eclipse', name: 'Total Eclipse of the Heart', desc: 'Perform your first Eclipse.', icon: 'ach',
    condition: { stat: 'prestiges', gte: 1 }, reward: { globalMultPct: 3 } },
  { id: 'eclipse_veteran', name: 'Eclipse Veteran', desc: 'Perform 5 Eclipses.', icon: 'ach',
    condition: { stat: 'prestiges', gte: 5 }, reward: { globalMultPct: 5 } },
];

/* ---------------------------------------------------------------------
 * PRESTIGE — "Eclipse": reset the run, earn Black Feathers.
 * feathers = floor((runEyes / divisor) ** exponent) - already earned
 * At the unlock point a first Eclipse pays ~5 feathers (= +10%).
 * ------------------------------------------------------------------- */
export const PRESTIGE = {
  name: 'Eclipse', resource: 'feathers',
  unlockAtLifetimeEyes: 5e10,
  divisor: 2e9, exponent: 0.5,
  bonusPerFeatherPct: 2,
};

/* ---------------------------------------------------------------------
 * OMEN — golden winged eye. Click it for a random reward.
 * ------------------------------------------------------------------- */
export const OMEN = {
  minSeconds: 90, maxSeconds: 240, lifetime: 12,
  rewards: [
    { weight: 50, text: 'Gift of Eyes!', effects: [ { type: 'instantProduction', resource: 'eyes', seconds: 300, min: 50 } ] },
    { weight: 30, text: 'Raven Rush!', duration: 20, effects: [ { type: 'globalMult', resource: 'eyes', value: 7 } ] },
    { weight: 15, text: 'Clicking Fury!', duration: 10, effects: [ { type: 'clickMult', value: 50 } ] },
    { weight: 5, text: 'Mana Geyser!', effects: [ { type: 'instantProduction', resource: 'mana', seconds: 600, min: 50 } ] },
  ],
};

/* ---------------------------------------------------------------------
 * CHATTER — news ticker lines; shown once lifetime eyes >= minEyes.
 * ------------------------------------------------------------------- */
export const CHATTER = [
  { text: 'The peasants report fewer eyes than usual.', minEyes: 0 },
  { text: 'A raven landed on your head. It is now Royal Advisor.', minEyes: 0 },
  { text: 'The King is staring into the void. The void politely looks away.', minEyes: 0 },
  { text: 'Local man claims he "only blinked for a second". Eye now missing.', minEyes: 10 },
  { text: 'Royal decree: winking is now considered tax evasion.', minEyes: 50 },
  { text: 'Opticians across the kingdom report record profits.', minEyes: 200 },
  { text: 'Scarecrows unionize. Demand better hats.', minEyes: 500 },
  { text: 'Breaking: crows deny everything. Ravens refuse to comment.', minEyes: 1000 },
  { text: 'New fashion trend: eyepatches. Mostly out of necessity.', minEyes: 3000 },
  { text: 'The court jester tried juggling eyes. It was a sight to behold.', minEyes: 8000 },
  { text: 'Blacksmith guild unveils the spork-spoon-scoop. Nobody asked.', minEyes: 15000 },
  { text: 'Village elder: "Back in my day we had TWO eyes each."', minEyes: 40000 },
  { text: 'Pirates file complaint: "Eyepatches were OUR thing."', minEyes: 100000 },
  { text: 'Watchtower guard reports seeing "too much". Promoted.', minEyes: 250000 },
  { text: 'The Royal Treasury now measured in "blinks".', minEyes: 600000 },
  { text: 'Wizards argue whether a pupil counts as a student. Fight breaks out.', minEyes: 1e6 },
  { text: 'Mana prices soar after King hoards it in a sock.', minEyes: 3e6 },
  { text: 'Skeletons in the catacombs request eyes "just to try them on".', minEyes: 1e7 },
  { text: 'Neighboring kingdom sends envoy. Envoy returns slightly fewer eyes.', minEyes: 3e7 },
  { text: 'Cathedral choir hits a high note. Seventeen windows and one bishop crack.', minEyes: 1e8 },
  { text: 'Scholars confirm: the moon is just a very large eye. It has been watching.', minEyes: 5e8 },
  { text: 'The Raven King has been named "Most Watched Monarch" for the 9th year.', minEyes: 1e9 },
  { text: 'The sun nervously asks if the Eclipse thing is "a joke".', minEyes: 3e9 },
  { text: 'Eclipse Portal tourists report "eyes on the other side, too, but sadder".', minEyes: 2e10 },
  { text: 'Astronomers count the stars. They are all eyes. They all blinked.', minEyes: 1e11 },
  { text: 'The kingdom runs out of eyes. The kingdom finds more eyes.', minEyes: 1e12 },
  { text: 'Reality files a formal complaint about the number of eyeballs in it.', minEyes: 1e13 },
  { text: 'A raven brought back a shiny button. Kingdom-wide holiday declared.', minEyes: 5000 },
  { text: 'Tip: the golden winged eye is good luck. Its cousin, the regular eye, is lunch.', minEyes: 2000 },
  { text: 'Royal astrologer predicts: eyes. Lots of eyes. Accuracy: 100%.', minEyes: 400000 },
  { text: 'The King has started a book club. The book is about eyes. Everyone is in it.', minEyes: 2e8 },
];
