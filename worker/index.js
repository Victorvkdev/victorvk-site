// Krowlect API: accounts (name + password), cloud save and the Black Feather ranking.
// The site's static files (public/) are served by Cloudflare; only /api/* runs this code.
// Database: Cloudflare D1, bound as env.DB (see wrangler.jsonc). Tables are created on first use.

const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
const PASS_MIN = 8, PASS_MAX = 128;   // PASS_MIN applies to new accounts only; existing ones can still log in
const MAX_SESSIONS = 10;              // per user; oldest are dropped
const RESERVED = new Set(['admin', 'administrator', 'root', 'moderator', 'mod', 'staff', 'support', 'system', 'official',
  'krowlect', 'victorvk', 'vk', 'enois', 'null', 'undefined', 'ravenking', 'raven_king', 'owner', 'server']);
// Save plausibility (the save comes from the player's browser, so it is never fully trusted)
const BACKUP_EVERY_MS = 3600_000, BACKUPS_KEPT = 5;
const MAX_EYES = 1e100;
const FEATHER_DIVISOR = 2e9;          // keep in sync with PRESTIGE.divisor in js/data/config.js
const PBKDF2_ITER = 100000;          // max allowed by Workers
const SESSION_DAYS = 180;
const MAX_SAVE_BYTES = 200_000;
const MAX_FAILS = 5, LOCK_MINUTES = 15;
const RANK_LIMIT = 50;

let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS saves (
      user_id INTEGER PRIMARY KEY, data TEXT NOT NULL,
      feathers REAL NOT NULL DEFAULT 0, eyes REAL NOT NULL DEFAULT 0, eclipses INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS saves_rank ON saves (feathers DESC, eyes DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS save_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, data TEXT NOT NULL,
      eyes REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS save_backups_user ON save_backups (user_id, created_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)`),
  ]);
  ready = true;
}

// ------------------------------------------------------------------ helpers
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((x) => parseInt(x, 16)));
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}

function sameText(a, b) { // constant-time compare
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}
const fail = (error, status = 400) => json({ error }, status);

async function readJson(req, max = 10_000) {
  const text = await req.text();
  if (text.length > max) throw Object.assign(new Error('Too much data.'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Invalid request.'), { status: 400 }); }
}

async function newSession(db, userId) {
  const token = randomHex(32);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN
      (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT ?)`).bind(userId, userId, MAX_SESSIONS - 1),
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256(token), userId, now + SESSION_DAYS * 86400_000),
  ]);
  return token;
}

async function currentUser(req, db) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  return db.prepare(`SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await sha256(m[1]), Date.now()).first();
}

// Per-IP rate limit kept in D1. Returns minutes to wait, or 0 if the request is allowed.
async function rateLimit(req, db, name, max, windowMs, id) {
  const who = id != null ? 'u' + id : req.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `${name}:${who}`, now = Date.now();
  const row = await db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').bind(key).first();
  if (!row || row.reset_at <= now) {
    await db.prepare('INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at')
      .bind(key, now + windowMs).run();
    if (Math.random() < 0.02) await db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now).run();
    return 0;
  }
  if (row.count >= max) return Math.max(1, Math.ceil((row.reset_at - now) / 60000));
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return 0;
}

// Browsers always send Origin on cross-site POST/PUT: only our own pages may call the write API.
function sameOrigin(req, url) {
  const o = req.headers.get('origin');
  return !o || o === url.origin;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e300 ? v : 0);

// ------------------------------------------------------------------ routes
async function register(req, db) {
  const { username, password } = await readJson(req);
  if (typeof username !== 'string' || !USER_RE.test(username)) return fail('Name must be 3–16 letters, numbers or _.');
  if (typeof password !== 'string' || password.length < PASS_MIN || password.length > PASS_MAX) return fail(`Password must be at least ${PASS_MIN} characters.`);
  if (password.toLowerCase() === username.toLowerCase()) return fail('Password cannot be the same as your name.');
  if (RESERVED.has(username.toLowerCase().replace(/_/g, '')) || RESERVED.has(username.toLowerCase())) return fail('That name is reserved.', 409);
  if (await db.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first()) return fail('That name is already taken.', 409);
  const salt = randomHex(16);
  const res = await db.prepare('INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)')
    .bind(username, await hashPassword(password, salt), salt, Date.now()).run();
  const id = res.meta.last_row_id;
  return json({ token: await newSession(db, id), username });
}

async function login(req, db) {
  const { username, password } = await readJson(req);
  if (typeof username !== 'string' || typeof password !== 'string') return fail('Enter your name and password.');
  const u = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  const now = Date.now();
  if (!u) { await hashPassword(password, '00'.repeat(16)); return fail('Wrong name or password.', 401); } // same cost as a real check
  if (u.locked_until > now) return fail(`Too many tries. Wait ${Math.ceil((u.locked_until - now) / 60000)} min.`, 429);
  if (!sameText(await hashPassword(password, u.salt), u.pass_hash)) {
    const fails = u.fails + 1;
    if (fails >= MAX_FAILS) await db.prepare('UPDATE users SET fails = 0, locked_until = ? WHERE id = ?').bind(now + LOCK_MINUTES * 60000, u.id).run();
    else await db.prepare('UPDATE users SET fails = ? WHERE id = ?').bind(fails, u.id).run();
    return fail('Wrong name or password.', 401);
  }
  if (u.fails) await db.prepare('UPDATE users SET fails = 0 WHERE id = ?').bind(u.id).run();
  return json({ token: await newSession(db, u.id), username: u.username });
}

async function logout(req, db) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization') || '');
  if (m) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
  return json({ ok: true });
}

async function getSave(user, db) {
  const row = await db.prepare('SELECT data, updated_at FROM saves WHERE user_id = ?').bind(user.id).first();
  return json({ username: user.username, save: row ? JSON.parse(row.data) : null, updatedAt: row ? row.updated_at : 0 });
}

async function putSave(req, user, db) {
  const wait = await rateLimit(req, db, 'save', 15, 60_000, user.id);
  if (wait) return fail('Saving too often. Wait a moment.', 429);
  const body = await readJson(req, MAX_SAVE_BYTES);
  const save = body.save;
  if (!save || typeof save !== 'object' || typeof save.resources !== 'object' || typeof save.lifetime !== 'object') return fail('Invalid save.');
  const eyes = num(save.lifetime.eyes);
  const feathers = Math.max(num(save.lifetime.feathers), num(save.resources.feathers));
  const eclipses = Math.floor(num(save.prestiges));
  if (eyes > MAX_EYES || eclipses > 100000) return fail('Invalid save.', 422);
  // Feathers only come from Eclipses: feathers per Eclipse = floor(sqrt(runEyes / divisor)), so they are bounded by lifetime eyes.
  if (feathers > Math.sqrt(eyes / FEATHER_DIVISOR) * Math.sqrt(Math.max(eclipses, 1)) * 5 + 1000) return fail('Save rejected: progress does not add up.', 422);
  // Keep only known top-level fields.
  const KEEP = ['saveVersion', 'gameVersion', 'resources', 'lifetime', 'run', 'buildings', 'upgrades', 'featherUps', 'under', 'achievements', 'market', 'spells', 'buffs', 'prestiges', 'settings', 'equippedSkin', 'skin', 'lastSaved', 'startedAt', 'season'];
  for (const k of Object.keys(save)) if (!KEEP.includes(k)) delete save[k];
  // v1.3 fields: feather upgrades and the Underworld. Shape-check them so junk cannot be stored.
  const okIds = (a) => Array.isArray(a) && a.length <= 64 && a.every((x) => typeof x === 'string' && x.length <= 40);
  if (save.featherUps !== undefined && !okIds(save.featherUps)) return fail('Invalid save.', 422);
  if (save.under !== undefined) {
    const u = save.under;
    if (!u || typeof u !== 'object' || Array.isArray(u) || !okIds(u.upgrades || [])) return fail('Invalid save.', 422);
    if (u.pact !== undefined && u.pact !== null && !(typeof u.pact === 'string' && u.pact.length <= 40)) return fail('Invalid save.', 422);
    const b = u.buildings || {};
    if (typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length > 64) return fail('Invalid save.', 422);
    for (const k of Object.keys(b)) if (!(Number.isFinite(b[k]) && b[k] >= 0 && b[k] <= 1e6)) return fail('Invalid save.', 422);
  }
  if (save.season !== undefined && !Number.isFinite(save.season)) return fail('Invalid save.', 422);
  if (num(save.resources.souls) > 1e60 || num(save.lifetime.souls) > 1e60) return fail('Invalid save.', 422);
  // Never let an older copy (another device) overwrite newer progress, unless the player reset/imported on purpose.
  if (!body.force) {
    const cur = await db.prepare('SELECT eyes FROM saves WHERE user_id = ?').bind(user.id).first();
    if (cur && eyes < cur.eyes) return fail('The cloud has newer progress.', 409);
  }
  const now = Date.now();
  // No growth limit on purpose: real players jump far in one save (Eye Storm pays 1 hour of production, offline gains,
  // progress made locally before an account sync worked), and a limit here locked real players out of saving.
  const prev = await db.prepare('SELECT data, eyes, feathers, eclipses, updated_at FROM saves WHERE user_id = ?').bind(user.id).first();
  // Safety net: keep up to 5 older copies (at most one per hour, or right before a big drop such as a reset),
  // so a bug, a stale device or a mistaken reset can be undone from the D1 console.
  if (prev && prev.eyes > 0) {
    const last = await db.prepare('SELECT created_at FROM save_backups WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(user.id).first();
    if (!last || now - last.created_at > BACKUP_EVERY_MS || eyes < prev.eyes * 0.5) {
      await db.batch([
        db.prepare('INSERT INTO save_backups (user_id, data, eyes, created_at) VALUES (?, ?, ?, ?)').bind(user.id, prev.data, prev.eyes, now),
        db.prepare(`DELETE FROM save_backups WHERE user_id = ? AND id NOT IN
          (SELECT id FROM save_backups WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)`).bind(user.id, user.id, BACKUPS_KEPT),
      ]);
    }
  }
  // The "newer progress wins" rule is part of the write itself, so two devices saving at the same moment cannot race past it.
  const res = await db.prepare(`INSERT INTO saves (user_id, data, feathers, eyes, eclipses, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, feathers = excluded.feathers, eyes = excluded.eyes,
    eclipses = excluded.eclipses, updated_at = excluded.updated_at WHERE ? = 1 OR excluded.eyes >= saves.eyes`)
    .bind(user.id, JSON.stringify(save), feathers, eyes, eclipses, now, body.force ? 1 : 0).run();
  if (res.meta && res.meta.changes === 0) return fail('The cloud has newer progress.', 409);
  return json({ ok: true, updatedAt: now });
}

async function leaderboard(user, db) {
  const { results } = await db.prepare(`SELECT u.username, s.feathers, s.eyes, s.eclipses FROM saves s
    JOIN users u ON u.id = s.user_id ORDER BY s.feathers DESC, s.eyes DESC LIMIT ?`).bind(RANK_LIMIT).all();
  let me = null;
  if (user) {
    const mine = await db.prepare('SELECT feathers, eyes, eclipses FROM saves WHERE user_id = ?').bind(user.id).first();
    if (mine) {
      const above = await db.prepare('SELECT COUNT(*) AS n FROM saves WHERE feathers > ? OR (feathers = ? AND eyes > ?)')
        .bind(mine.feathers, mine.feathers, mine.eyes).first();
      me = { username: user.username, rank: above.n + 1, ...mine };
    }
  }
  const total = await db.prepare('SELECT COUNT(*) AS n FROM saves').first();
  return json({ top: results, me, players: total.n });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const route = req.method + ' ' + url.pathname.replace(/\/+$/, '');
    try {
      const db = env.DB;
      await init(db);
      if (req.method !== 'GET' && !sameOrigin(req, url)) return fail('Forbidden.', 403);
      if (req.method !== 'GET' && !(req.headers.get('content-type') || '').includes('application/json') && route !== 'POST /api/logout') return fail('Invalid request.', 415);
      if (route === 'POST /api/register') {
        const wait = await rateLimit(req, db, 'register', 10, 3600_000);
        if (wait) return fail(`Too many new accounts from this network. Try again in ${wait} min.`, 429);
        return await register(req, db);
      }
      if (route === 'POST /api/login') {
        const wait = await rateLimit(req, db, 'login', 40, 15 * 60_000);
        if (wait) return fail(`Too many tries. Wait ${wait} min.`, 429);
        return await login(req, db);
      }
      if (route === 'POST /api/logout') return await logout(req, db);
      const user = await currentUser(req, db);
      if (route === 'GET /api/leaderboard') return await leaderboard(user, db);
      if (route === 'GET /api/save' || route === 'PUT /api/save') {
        if (!user) return fail('Please log in again.', 401);
        return route === 'GET /api/save' ? await getSave(user, db) : await putSave(req, user, db);
      }
      return fail('Not found.', 404);
    } catch (e) {
      if (e.status) return fail(e.message, e.status);
      console.error(e);
      return fail('The castle is busy. Try again in a moment.', 500);
    }
  },
};
