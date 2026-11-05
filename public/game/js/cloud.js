import { t as tr, ts } from './i18n.js';
// Cloud account for Krowlect: log in with name + password, keep progress in the cloud, Black Feather ranking.
// Talks to /api/* on victorvk.com (worker/index.js in the site repo). The login token stays in this browser.

// Cloud accounts only work on victorvk.com (same-origin API). Elsewhere (itch.io, other hosts) the game saves locally only.
export const cloudEnabled = /(^|\.)victorvk\.com$|^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const AUTH_KEY = 'krowlect.auth';
const API = '/api/';
const listeners = [];

let auth = readAuth();
function readAuth() {
  try { const a = JSON.parse(localStorage.getItem(AUTH_KEY)); return a && a.token && a.username ? a : null; } catch { return null; }
}
function writeAuth(a) {
  auth = a;
  try { if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
  for (const fn of listeners) { try { fn(user()); } catch (e) { console.error(e); } }
}

export const user = () => (auth ? auth.username : null);
export const onAuthChange = (fn) => listeners.push(fn);

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(method, path, body, { keepalive = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) headers.authorization = 'Bearer ' + auth.token;
  let res;
  try {
    res = await fetch(API + path, { method, headers, keepalive, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(tr('The ravens could not reach the castle. Check your connection.'), 0);
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && auth && path !== 'login') writeAuth(null); // session expired
  if (!res.ok) throw new ApiError(ts(data.error) || (res.status >= 500 ? tr('The castle is busy. Try again in a moment.') : tr('Something went wrong. Try again.')), res.status);
  return data;
}

export async function register(username, password) {
  const d = await call('POST', 'register', { username, password });
  writeAuth({ token: d.token, username: d.username });
}

export async function login(username, password) {
  const d = await call('POST', 'login', { username, password });
  writeAuth({ token: d.token, username: d.username });
}

export async function logout() {
  try { await call('POST', 'logout'); } catch { /* ignore */ }
  writeAuth(null);
}

export const pull = () => call('GET', 'save');
export const push = (state, { force = false, keepalive = false } = {}) => call('PUT', 'save', { save: state, force }, { keepalive });
export const leaderboard = () => call('GET', 'leaderboard');
