// Number & time formatting. Pure, no DOM.
// short: 999 -> "999", 1234 -> "1.23K", ... K M B T, then aa, ab, ... zz, then scientific.
// sci:   1234 -> "1.23e3"

const BASE_SUFFIX = ['', 'K', 'M', 'B', 'T'];
const A = 'abcdefghijklmnopqrstuvwxyz';

let mode = 'short';
export function setNumberFormat(m) { mode = m === 'sci' ? 'sci' : 'short'; }
export function getNumberFormat() { return mode; }

function suffixFor(tier) {
  if (tier < BASE_SUFFIX.length) return BASE_SUFFIX[tier];
  const i = tier - BASE_SUFFIX.length; // 0 => aa
  if (i >= 26 * 26) return null;
  return A[Math.floor(i / 26)] + A[i % 26];
}

function mantissa(m) {
  // 3 significant digits, trailing zeros trimmed
  const s = m < 10 ? m.toFixed(2) : m < 100 ? m.toFixed(1) : m.toFixed(0);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function big(n) {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (mode === 'sci') {
    const e = Math.floor(Math.log10(n));
    let m = n / 10 ** e;
    let s = m.toFixed(2);
    if (parseFloat(s) >= 10) return sign + (m / 10).toFixed(2) + 'e' + (e + 1);
    return sign + s + 'e' + e;
  }
  let tier = Math.floor(Math.log10(n) / 3);
  let m = n / 10 ** (tier * 3);
  // rounding can push 999.996 -> 1000
  if (parseFloat(m < 100 ? m.toFixed(m < 10 ? 2 : 1) : m.toFixed(0)) >= 1000) { tier++; m = n / 10 ** (tier * 3); }
  const suf = suffixFor(tier);
  if (suf === null) { const prev = mode; mode = 'sci'; const r = big(n); mode = prev; return sign + r; }
  return sign + mantissa(m) + suf;
}

/** Amount held (floors small values). */
export function fmt(n) {
  if (n == null || Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return '∞';
  if (Math.abs(n) < 1000) return String(Math.floor(n + 1e-9));
  return big(n);
}

/** Rates / costs / small decimals: shows up to 1-2 decimals below 100. */
export function fmtRate(n) {
  if (n == null || Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a < 1000) {
    let s = a < 10 ? n.toFixed(2) : a < 100 ? n.toFixed(1) : n.toFixed(0);
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    if (s === '0' || s === '-0') return a < 0.005 ? '<0.01' : '0';
    return s;
  }
  return big(n);
}

/** Costs are integers for small values. */
export function fmtCost(n) {
  if (Math.abs(n) < 1000) return String(Math.ceil(n - 1e-9));
  return fmt(n);
}

export function fmtPct(x) { // 0.123 -> "12.3%"
  const p = x * 100;
  let t = p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2);
  if (t.includes('.')) t = t.replace(/\.?0+$/, '');
  return t + '%';
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
