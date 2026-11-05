// Update log shown in Settings > News. Newest first. Add a new entry on top for every release
// (and bump GAME.version in config.js). The gear icon shows a dot until the player opens News.
export const CHANGELOG = [
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
