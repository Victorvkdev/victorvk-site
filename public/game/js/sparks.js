// Faíscas (Énóis currency) payments, via the real Énóis embed protocol.
//
//   game -> parent : { version:1, type:'enois:spend', amount, motivo, requestId }   (amount in mf; 1 faísca = 1000 mf)
//
// The parent page shows its own "O jogo quer gastar faíscas" modal and, on confirm, calls
// POST /games/{id}/despesas. It never answers the game (no result message), so the game
// asks the player to confirm "done" after the Énóis modal. Items are cosmetic / single-player.
// The game's origin must be listed under "Origens autorizadas" at enois.ia.br/developers.
// While LIVE is false: on localhost the shop runs in TEST mode (free); elsewhere it shows "coming soon".
export const LIVE = true;
const ENOIS_ORIGIN = 'https://enois.ia.br';

const embedded = (() => { try { return window.parent !== window; } catch { return true; } })();
const local = ['localhost', '127.0.0.1'].includes(location.hostname);

export const mode = () => (local && !embedded ? 'test' : LIVE && embedded ? 'enois' : 'soon');
export const available = () => mode() !== 'soon';

export const mf = (amount) => amount / 1000; // mf -> faíscas

const pt = (document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('pt');

function askDone(item) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(0,0,0,.65);padding:16px';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:340px;background:#1a1426;color:#f3ecff;border:2px solid #8a6ad8;padding:16px;font:600 14px/1.4 system-ui,sans-serif;text-align:center';
    const p = document.createElement('p');
    p.textContent = pt
      ? `Confirme o gasto de ${mf(item.sparks)} faísca(s) na janela do Énóis. Depois toque em "Já confirmei" para receber ${item.name}.`
      : `Confirm the ${mf(item.sparks)} spark charge in the Énóis window, then tap "Done" to get ${item.name}.`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:12px';
    const mk = (label, ok) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = 'padding:8px 12px;font:inherit;cursor:pointer;color:inherit;background:' + (ok ? '#5b3fb0' : '#2b2140') + ';border:1px solid #8a6ad8';
      b.onclick = () => { el.remove(); resolve(ok); };
      return b;
    };
    row.append(mk(pt ? 'Cancelar' : 'Cancel', false), mk(pt ? 'Já confirmei' : 'Done', true));
    box.append(p, row); el.append(box); document.body.append(el);
    row.lastChild.focus();
  });
}

export async function pay(item) {
  const m = mode();
  if (m === 'test') return { ok: true, receipt: 'test-' + Date.now() };
  if (m !== 'enois') return { ok: false, reason: 'unavailable' };
  const requestId = 'kw-' + ((crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now());
  try {
    window.parent.postMessage({ version: 1, type: 'enois:spend', amount: Math.round(item.sparks), motivo: String(item.name).slice(0, 80), requestId }, ENOIS_ORIGIN);
  } catch { return { ok: false, reason: 'unavailable' }; }
  const ok = await askDone(item);
  return ok ? { ok: true, receipt: requestId } : { ok: false, reason: 'declined' };
}
