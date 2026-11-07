// Tiny i18n: English is the source language, Portuguese (Brazil) is a lookup table keyed by the English text.
//   t('Close')                         plain string
//   tt`Buy ${n} ${name}`               tagged template (key 'Buy {0} {1}')
//   tn(n, '{n} king', '{n} kings')     plural
// The language is chosen in Settings (auto = browser language) and applied on load (the page reloads when it changes).
import { PT_UI } from './data/pt-ui.js';
import { PT_CFG } from './data/pt-config.js';

const LS = 'krowlect.lang';
export const pref = () => { try { const v = localStorage.getItem(LS); return v === 'en' || v === 'pt' ? v : 'auto'; } catch { return 'auto'; } };
export function setPref(v) { try { localStorage.setItem(LS, v); } catch { /* ignore */ } }
const detect = () => { const p = pref(); if (p !== 'auto') return p; const n = (navigator.language || 'en').toLowerCase(); return n.startsWith('pt') ? 'pt' : 'en'; };

export const lang = detect();
export const isPt = lang === 'pt';
if (typeof document !== 'undefined') document.documentElement.lang = isPt ? 'pt-BR' : 'en';

const lookup = (k) => (isPt ? (PT_UI[k] ?? PT_CFG[k] ?? k.replace(/\|tab$/, '')) : k.replace(/\|tab$/, ''));
const fill = (s, vals) => s.replace(/\{(\w+)\}/g, (m, i) => (i in vals ? vals[i] : m));

export const t = (k) => lookup(k);
export function tt(strs, ...vals) {
  let key = strs[0];
  for (let i = 0; i < vals.length; i++) key += '{' + i + '}' + strs[i + 1];
  return fill(lookup(key), vals);
}
export const tn = (n, one, other, fmt = String) => fill(lookup(n === 1 ? one : other), { n: fmt(n) });

// Server / API messages: exact match, or a pattern with numbers.
const SERVER = [
  [/^Too many tries\. Wait (\d+) min\.$/, 'Too many tries. Wait {0} min.'],
  [/^Too many new accounts from this network\. Try again in (\d+) min\.$/, 'Too many new accounts from this network. Try again in {0} min.'],
];
export function ts(msg) {
  if (!isPt || typeof msg !== 'string') return msg;
  if (PT_UI[msg]) return PT_UI[msg];
  for (const [re, key] of SERVER) { const m = msg.match(re); if (m && PT_UI[key]) return fill(PT_UI[key], m.slice(1)); }
  return msg;
}

// Replace the English texts of the game data (names, descriptions, jokes) in place.
const FIELDS = ['name', 'desc', 'flavor', 'text', 'label', 'title'];
export function localizeData(...roots) {
  if (!isPt) return;
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach((x, i) => { if (typeof x === 'string') { if (PT_UI[x]) o[i] = PT_UI[x]; } else walk(x); }); return; }
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string') { if (FIELDS.includes(k) && (PT_CFG[v] || PT_UI[v])) o[k] = PT_CFG[v] ?? PT_UI[v]; }
      else walk(v);
    }
  };
  roots.forEach(walk);
}

// Static texts in index.html
export function localizePage() {
  if (!isPt) return;
  const $ = (s) => document.querySelector(s);
  const txt = (s, k) => { const e = $(s); if (e) e.textContent = t(k); };
  const aria = (s, k) => { const e = $(s); if (e) e.setAttribute('aria-label', t(k)); };
  document.title = t('Krowlect — an idle game of eyes and magic');
  const md = $('meta[name="description"]'); if (md) md.setAttribute('content', t('Krowlect is a tiny pixel-art idle clicker. Rule as the Raven King, collect cartoon eyeballs, transmute them into mana, cast spells and summon the Eclipse.'));
  txt('.skip-link', 'Skip to the Raven King');
  aria('#resbar', 'Resources'); aria('#btn-account', 'Log in to save in the cloud'); aria('#btn-sound', 'Audio and music'); aria('#btn-settings', 'Settings and save');
  aria('#col-left', 'Magic'); aria('.col-center', 'The Raven King'); aria('#king', 'The Raven King. Click to collect eyes.');
  aria('#realm', 'Your realm'); aria('.col-right', 'Shop'); aria('#tabs', 'Shop sections');
  txt('#click-hint', 'click the king!'); txt('#ticker-text', 'The ravens are waking up…'); txt('#boot-msg', 'Summoning the ravens…');
  const sub = $('.sc-sub'); if (sub && sub.lastChild) sub.lastChild.textContent = ' ' + t('eyes / sec');
  const foot = $('.stage-foot'); if (foot && foot.lastChild) foot.lastChild.textContent = ' ' + t('per click');
  const mk = document.querySelectorAll('.footer a'); if (mk[1]) mk[1].textContent = t('made by Victor VK');
}
