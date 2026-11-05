# Changelog


## 1.2.1 — 2026-10-24
- Portuguese (Brazil) translation of the whole game with localized jokes; language picker in Settings (auto-detects the browser language).
- Cinematic Eclipse: moon eclipse with orange aura, buildings destroyed one by one, eyes drain to zero. Tap to skip.
- Eclipse sound effects (aura, tally, crumble) and a new ambient music with a Music switch in Settings.
## 1.1.3 — 2026-10-23

- Settings buttons aligned side by side; new always-visible "Save progress" button.
- In-game update log: Settings > News (gear shows a dot until read). Raven account button moved to Settings > Account on phones.
- Phone layout: resources on their own row so the numbers are readable.
- Cloud saves no longer have a progress-growth cap (it locked real players out after big jumps). Only absurd values are rejected.
- A toast now explains why a cloud save failed instead of failing silently.

## 1.1.2 — 2026-10-23
- Fix: saves were wrongly rejected as "progress grew too fast" after big instant gains (Eye Storm, Harvest Moon, omens). The server limit now allows them; progress was never lost, it saves as soon as the update is live.

## 1.1.1 — 2026-10-23
- Sync safety: only one tab owns the save (the other pauses), failed first sync retries every minute, same-account re-login keeps newer local progress, no overwrite of saves from a newer game version, last save still goes out when the page closes, warning when the browser blocks saving.
- Cloud safety: "newer progress wins" is now enforced inside the database write (no race between devices) and up to 5 backups per account are kept (one per hour, or right before a big drop like a reset).
- Logout now saves, then resets this device (no carrying progress into another account). If the cloud save fails, you stay logged in so nothing is lost.
- Logging into an existing account always loads that account's cloud kingdom.
- Security: server-side save checks (plausible growth, feathers vs eyes, known fields only), per-IP rate limits on login/sign-up, reserved names, same-origin check on the API, 8+ character passwords for new accounts, max 10 sessions per account, timing-safe login, Content-Security-Policy for the game, debug console hooks only on localhost.
- Fix: login and sign-up work inside the Énóis iframe (it blocks form submission; the account modal no longer uses a <form>).
- Sign-up inside the Énóis iframe: name field auto-cleans as you type (accents, spaces and dots become valid characters), clearer hint, "Open in a new tab" fallback link when embedded, friendlier server-error message.

## 1.1.0 — 2026-10-22
- Raven Account: log in with name + password, cloud save on any device (newest kingdom wins).
- Feather Ranking tab: top 50 kings by Black Feathers earned, with your own position.
- API in `worker/index.js` (Cloudflare Worker + D1 database `krowlect`).

## 1.0.0 — 2026-10-19
- Launch: Raven King, 10 buildings, 62 upgrades, 4 spells, market (consumables + 3 king skins),
  35 feats, Omens (golden eye), Eclipse prestige with Black Feathers, offline progress, save export/import.
