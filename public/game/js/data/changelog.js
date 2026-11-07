// Update log shown in Settings > News. Newest first. Add a new entry on top for every release
// (and bump GAME.version in config.js). The gear icon shows a dot until the player opens News.
export const CHANGELOG = [
  {
    version: '2.0.0', date: '2026-11-07',
    title: 'Krowlect 2.0: the Underworld, spark kings and a tougher late game',
    items: [
      'New audio panel (the speaker icon): pick your soundtrack, switch music and sound effects on or off, and set each volume.',
      'Accessibility: a readable sans-serif font option and a high contrast mode in Settings.',
      'Spark skins now have an Equip button and an info square that opens a full preview with its perks and how it changes the world.',
      'Entering and leaving the Underworld now opens a portal from where you clicked, and the Underworld has its own green palette.',
      'Each spark king now has its own soundtrack: warm forge heartbeat and crackling sparks for Ember, airy echoing bells for Aurora, a cold drone with slow glides for Void, and a sparkling bell arpeggio for Prism that changes key with the Spectrum. Music crossfades when you change skin.',
      'Jars of Eyes and Dragon\'s Hoards also cost Black Feathers from the 10th purchase in an Eclipse, and Souls from the 20th. Buildings past 200 owned also cost Souls.',
      'Weekly mini-season: every Monday (UTC) your unspent Black Feathers shrink by 20%. Spend them on Feather Upgrades or the Underworld. The Underworld also consumes everything it holds: its buildings, upgrades, pact and souls. Surface buildings and upgrades are never touched.',
      'Underworld souls now grow much slower (about 5x per tier instead of 8x, weaker soul multipliers), so the numbers stay readable and the surface bonus takes real investment.',
      'New Spark Shop in the Market: boosts and four animated king skins paid with Énóis faíscas. Each skin has its own perks and changes the world around the king. The Prism King now cycles through Ruby, Topaz and Sapphire phases and splits every Omen in two.',
      'Eclipses now make eye and mana prices a little higher each time (up to x4).',
      'From 150 owned of a building, each extra one also costs Black Feathers.',
      'Jars of Eyes and Dragon\'s Hoards pay a bit less with every purchase in the same Eclipse, and timed boosts count up to x2 on instant gains. The strategy is still the strongest one, just no longer unbounded.',
      'Feather bonus keeps growing past one million feathers, but slower.',
      'New Feather Upgrades in the Upgrades tab: permanent boosts bought with Black Feathers.',
      'New map: the Underworld. Everything there is bought with Black Feathers, and its Souls feed a bonus back to the surface. Unlock it with the Obsidian Key.',
      'Fixed: the golden Omen was invisible (only the sound played).',
    ],
  },
  {
    version: '1.2.1', date: '2026-10-24',
    title: 'A real Eclipse',
    items: [
      'The Eclipse is now a cinematic: the moon is swallowed by the dark, an orange aura flares, your buildings are destroyed one by one and your eyes drain to zero before the Black Feathers arrive.',
      'Tap anywhere to skip the animation. Reduced motion keeps the quick version.',
      'Eclipse sound effects: a magical aura, a counting tally while your eyes and buildings drain, and a crumble for every building lost.',
      'New ambient music, with its own Music switch in Settings.',
      'The game now speaks Portuguese (Brazil): every name, upgrade, feat and joke was adapted, not just translated. Pick the language in Settings (it follows your browser by default).',
    ],
  },
  {
    version: '1.1.3', date: '2026-10-23',
    title: 'Update log, account in Settings, roomier phone layout',
    items: [
      'Settings buttons now sit side by side, evenly aligned.',
      'New always-visible "Save progress" button in Settings (links an account if you have none).',
      'New News tab in Settings with the full update log.',
      'The raven account button moved into Settings, in its own Account tab: link your progress to an account to save it in the cloud.',
      'Phone layout: resources now have their own row, so the numbers are readable.',
      'Fixed for good: the cloud no longer limits how fast your progress can grow, so big jumps (Eye Storm, long offline gains, progress made before your account synced) save normally.',
      'If a cloud save ever fails, a message now tells you why (your progress stays safe on the device).',
    ],
  },
  {
    version: '1.1.2', date: '2026-10-23',
    title: 'Save fix',
    items: [
      'Fixed: saves could be refused after huge instant gains (like the Eye Storm spell). No progress was lost, and saving works normally again.',
    ],
  },
  {
    version: '1.1.1', date: '2026-10-22',
    title: 'Login fixed inside Énóis, safer saves',
    items: [
      'Fixed: login and sign-up now work inside Énóis.',
      'The name field cleans accents and spaces as you type.',
      'Logging out saves your kingdom, then resets this device so progress cannot leak into another account.',
      'Only one tab can own the save, so two open tabs cannot overwrite each other.',
      'Saves are checked on the server and backed up automatically.',
      'Extra account security: login rate limits and stronger passwords for new accounts (8+ characters).',
    ],
  },
  {
    version: '1.1.0', date: '2026-10-22',
    title: 'Raven Account and Feather Ranking',
    items: [
      'Raven Account: log in with a name and password and keep your kingdom in the cloud, on any device.',
      'Feather Ranking tab: the top 50 kings by Black Feathers, with your own position.',
    ],
  },
  {
    version: '1.0.0', date: '2026-10-19',
    title: 'Launch',
    items: [
      'The Raven King rises: 10 buildings, 62 upgrades, 4 spells, a market with 3 king skins and 35 feats.',
      'Omens (the golden eye), the Eclipse prestige with Black Feathers, offline progress and save export/import.',
    ],
  },
];
