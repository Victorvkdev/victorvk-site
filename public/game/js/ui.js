// DOM rendering: layout, panels, tabs, tooltips, modals, toasts, king & omen animation.
import * as E from './economy.js';
import { fmt, fmtRate, fmtCost, fmtPct, fmtTime } from './format.js';
import * as audio from './audio.js';
import { FX } from './fx.js';
import { ownedSkins } from './state.js';
import { playEclipse } from './eclipse.js';
import { t as tr, tt, tn, localizeData, pref as langPref, setPref as setLangPref } from './i18n.js';
import { CHANGELOG } from './data/changelog.js';
import { cloudEnabled } from './cloud.js';

// ------------------------------------------------------------------ tiny DOM helpers
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
function setText(el, t) { if (el._t !== t) { el._t = t; el.textContent = t; } }
function setCls(el, cls, on) { on = !!on; const k = '_c' + cls; if (el[k] !== on) { el[k] = on; el.classList.toggle(cls, on); } }
function setHidden(el, hide) { hide = !!hide; if (el._h !== hide) { el._h = hide; el.hidden = hide; } }
function setAttr(el, a, v) { const k = '_a' + a; if (el[k] !== v) { el[k] = v; if (v == null) el.removeAttribute(a); else el.setAttribute(a, v); } }
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
localizeData(CHANGELOG);
const NEWS_KEY = 'krowlect.newsSeen';

const mqMobile = window.matchMedia('(max-width: 900px)');
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarse = window.matchMedia('(hover: none)');

export class UI {
  constructor(game) {
    this.game = game;
    this.cfg = game.config;
    this.art = game.art;
    this.qty = lsGet('krowlect.qty', '1');
    this.tab = lsGet('krowlect.tab', 'buildings');
    this.seenUpgrades = new Set();
    this.imgCache = new Map();
    this.kingFrame = 0; this.kingNext = 0; this.squashUntil = 0;
    this.listTimer = 0;
    this.tip = { el: $('#tooltip'), key: null, anchor: null, timer: 0 };
    this.tickerIdx = -1;
  }

  // ------------------------------------------------------------------ sprites
  src(id, opts = {}) {
    const o = { scale: opts.scale ?? 4, frame: opts.frame ?? 0, skin: opts.skin ?? null };
    try { return this.art.spriteDataURL(id, o); } catch {
      try { return this.art.spriteDataURL('eye', o); } catch { return ''; }
    }
  }
  sprite(id, cls = '', opts = {}) {
    const img = h('img', { class: 'px-img ' + cls, src: this.src(id, opts), alt: '', draggable: 'false' });
    return img;
  }
  image(id) { // canvas for particles
    let c = this.imgCache.get(id);
    if (!c) {
      try { c = this.art.renderSprite(id, { scale: 2 }); } catch { c = null; }
      this.imgCache.set(id, c);
    }
    return c;
  }
  reduced() { return this.game.state.settings.reducedMotion || mqReduce.matches; }

  // ------------------------------------------------------------------ mount
  mount() {
    const g = this.game;
    document.querySelectorAll('[data-sprite]').forEach((el) => el.append(this.sprite(el.dataset.sprite)));
    // background scene
    $('#stage-bg').style.backgroundImage = `url(${this.src('bg_castle', { scale: 4 })})`;
    try { document.documentElement.style.setProperty('--tile', `url(${this.art.spriteDataURL('bg_tile', { scale: 4 })})`); } catch { /* optional */ }

    this.buildResbar();
    this.buildTabs();
    this.buildBuildings();
    this.buildUpgrades();
    this.buildMagic();
    this.buildMarket();
    this.buildFeats();
    this.buildRanks();
    this.placeMagic();
    mqMobile.addEventListener?.('change', () => this.placeMagic());

    this.fx = new FX({ stage: $('#stage'), canvas: $('#fx-canvas'), floatLayer: $('#floaters'), getImage: (id) => this.image(id), reducedMotion: () => this.reduced() });
    this.bindKing();
    this.bindTop();
    this.bindTooltips();
    this.bindEvents();
    this.applySettings();
    this.updateKingSprite(true);
    this.nextChatter();
    this.tickerInterval = setInterval(() => this.nextChatter(), 9000);

    document.getElementById('boot')?.remove();
    // first gesture unlocks audio
    const unlock = () => { audio.unlockAudio(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    this.render(true);
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      this.frame(t, dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    if (g.offlineReport) setTimeout(() => this.offlineModal(g.offlineReport), 300);
    if (g.fresh) setHidden($('#click-hint'), false);
  }

  /** Gold dot on the gear until the player has opened Settings > News for the latest version. */
  updateNewsDot() {
    const btn = $('#btn-settings');
    if (btn) btn.classList.toggle('has-news', lsGet(NEWS_KEY, '') !== CHANGELOG[0].version);
  }

  applySettings() {
    this.updateNewsDot();
    const s = this.game.state.settings;
    document.documentElement.classList.toggle('reduce-motion', this.reduced());
    const btn = $('#btn-sound');
    btn.setAttribute('aria-pressed', String(!!s.sound));
    btn.replaceChildren(this.sprite(s.sound ? 'sound_on' : 'sound_off'));
    btn.title = s.sound ? tr('Sound on') : tr('Sound off');
  }

  // ------------------------------------------------------------------ top bar
  buildResbar() {
    const bar = $('#resbar');
    bar.replaceChildren();
    this.res = {};
    for (const r of this.cfg.RESOURCES) {
      const amt = h('span', { class: 'res-amt' }, '0');
      const rate = h('span', { class: 'res-rate' }, '');
      const chip = h('div', { class: 'res-chip res-' + r.id, title: r.name },
        h('span', { class: 'res-icon' }, this.sprite(r.icon)),
        h('span', { class: 'res-text' }, amt, rate),
        h('span', { class: 'sr-only' }, ' ' + r.name));
      bar.append(chip);
      this.res[r.id] = { chip, amt, rate };
    }
  }

  bindTop() {
    $('#btn-sound').addEventListener('click', () => {
      const on = !this.game.state.settings.sound;
      this.game.setSetting('sound', on);
      audio.unlockAudio();
      this.applySettings();
      if (on) audio.play('buy');
    });
    $('#btn-settings').addEventListener('click', () => this.settingsModal());
    $('#btn-account').addEventListener('click', () => this.accountModal());
  }

  // ------------------------------------------------------------------ tabs
  buildTabs() {
    const defs = [
      { id: 'buildings', label: tr('Buildings|tab'), icon: 'rookery' },
      { id: 'upgrades', label: tr('Upgrades'), icon: 'up_anvil' },
      { id: 'magic', label: tr('Magic'), icon: 'mana', mobileOnly: true },
      { id: 'market', label: tr('Market'), icon: 'mk_chest' },
      { id: 'feats', label: tr('Feats'), icon: 'ach' },
      { id: 'ranks', label: tr('Ranking'), icon: 'feather' },
    ];
    const nav = $('#tabs'), panels = $('#tab-panels');
    this.tabs = {};
    for (const d of defs) {
      const badge = h('span', { class: 'tab-badge', hidden: true });
      const btn = h('button', { class: 'tab' + (d.mobileOnly ? ' mobile-only' : ''), role: 'tab', id: 'tab-' + d.id, type: 'button',
        'aria-controls': 'panel-' + d.id, 'aria-selected': 'false', tabindex: '-1' },
      this.sprite(d.icon, 'tab-icon'), h('span', { class: 'tab-label' }, d.label), badge);
      btn.addEventListener('click', () => this.selectTab(d.id, true));
      nav.append(btn);
      const panel = h('div', { class: 'tab-panel', role: 'tabpanel', id: 'panel-' + d.id, 'aria-labelledby': 'tab-' + d.id, hidden: true });
      panels.append(panel);
      this.tabs[d.id] = { btn, panel, badge, def: d };
    }
    nav.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const vis = Object.values(this.tabs).filter((t) => t.btn.offsetParent !== null);
      let i = vis.findIndex((t) => t.btn === document.activeElement);
      if (e.key === 'ArrowLeft') i = (i - 1 + vis.length) % vis.length;
      else if (e.key === 'ArrowRight') i = (i + 1) % vis.length;
      else if (e.key === 'Home') i = 0; else i = vis.length - 1;
      e.preventDefault();
      this.selectTab(vis[i].def.id, true); vis[i].btn.focus();
    });
    if (!this.tabs[this.tab]) this.tab = 'buildings';
    this.selectTab(this.tab);
  }

  selectTab(id, user = false) {
    if (id === 'magic' && !mqMobile.matches) id = 'buildings';
    this.tab = id;
    lsSet('krowlect.tab', id);
    for (const k in this.tabs) {
      const t = this.tabs[k], on = k === id;
      t.btn.setAttribute('aria-selected', String(on));
      t.btn.tabIndex = on ? 0 : -1;
      t.btn.classList.toggle('active', on);
      t.panel.hidden = !on;
    }
    if (user) { this.hideTip(); this.render(true); }
    if (id === 'ranks') this.loadRanks();
  }

  placeMagic() {
    const panel = this.magicPanel;
    if (mqMobile.matches) this.tabs.magic.panel.append(panel);
    else { $('#col-left').append(panel); if (this.tab === 'magic') this.selectTab('buildings'); }
  }

  // ------------------------------------------------------------------ cost widget
  costEl() { return h('span', { class: 'cost' }); }
  updateCost(el, cost, resources) {
    const keys = Object.keys(cost).join(',');
    if (el._keys !== keys) {
      el._keys = keys;
      el.replaceChildren();
      el._parts = {};
      for (const r of Object.keys(cost)) {
        const icon = this.resIcon(r);
        const t = h('span', { class: 'cost-num' });
        const part = h('span', { class: 'cost-part' }, this.sprite(icon, 'cost-icon'), t);
        el._parts[r] = { part, t };
        el.append(part);
      }
    }
    for (const r in cost) {
      const p = el._parts[r];
      setText(p.t, fmtCost(cost[r]));
      setCls(p.part, 'short', (resources[r] || 0) < cost[r]);
    }
  }
  resIcon(r) { return (this.cfg.RESOURCES.find((x) => x.id === r) || {}).icon || r; }
  resName(r) { return (this.cfg.RESOURCES.find((x) => x.id === r) || {}).name || r; }

  // ------------------------------------------------------------------ BUILDINGS
  buildBuildings() {
    const panel = this.tabs.buildings.panel;
    const qtyBtns = {};
    const qty = h('div', { class: 'qty', role: 'radiogroup', 'aria-label': tr('Buy quantity') });
    for (const q of ['1', '10', 'max']) {
      const b = h('button', { class: 'qty-btn', type: 'button', role: 'radio', 'aria-checked': String(this.qty === q) }, q === 'max' ? tr('Max') : 'x' + q);
      b.addEventListener('click', () => { this.qty = q; lsSet('krowlect.qty', q); for (const k in qtyBtns) { qtyBtns[k].setAttribute('aria-checked', String(k === q)); qtyBtns[k].classList.toggle('on', k === q); } this.render(true); });
      b.classList.toggle('on', this.qty === q);
      qtyBtns[q] = b; qty.append(b);
    }
    const head = h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, tr('Buildings')), qty);
    const list = h('div', { class: 'items' });
    this.bRows = {};
    for (const b of this.cfg.BUILDINGS) {
      const icon = this.sprite(b.icon || b.id, 'item-img');
      const name = h('span', { class: 'item-name' }, b.name);
      const cost = this.costEl();
      const count = h('span', { class: 'item-count' }, '0');
      const badge = h('span', { class: 'item-qty' });
      const rate = h('span', { class: 'item-rate' });
      const main = h('button', { class: 'item-main', type: 'button', dataset: { tip: 'building:' + b.id } },
        h('span', { class: 'item-icon' }, icon),
        h('span', { class: 'item-body' }, name, h('span', { class: 'item-line' }, cost, badge), rate),
        count);
      main.addEventListener('click', (e) => { if (this.consumeLongPress()) return; this.buyBuilding(b.id, e); });
      const info = h('button', { class: 'item-info', type: 'button', 'aria-label': tr('About ') + b.name, dataset: { tipBtn: 'building:' + b.id } }, 'i');
      const row = h('div', { class: 'item building' }, main, info);
      list.append(row);
      this.bRows[b.id] = { row, main, icon, name, cost, count, badge, rate, info };
    }
    panel.append(head, list);
  }

  buyBuilding(id, e) {
    const q = this.qty === 'max' ? 'max' : +this.qty;
    const n = this.game.buyBuilding(id, q);
    if (n > 0) {
      const r = this.bRows[id].main.getBoundingClientRect();
      this.pop(this.bRows[id].row);
      this.uiFloat(r.left + r.width - 40, r.top + 4, '+' + n);
    }
  }

  updateBuildings() {
    const g = this.game, s = g.state;
    let shownLocked = false;
    for (const b of this.cfg.BUILDINGS) {
      const R = this.bRows[b.id];
      const unlocked = E.buildingUnlocked(b, s);
      const owned = s.buildings[b.id] || 0;
      if (!unlocked) {
        if (shownLocked) { setHidden(R.row, true); continue; }
        shownLocked = true;
        setHidden(R.row, false);
        setCls(R.row, 'locked', true);
        setText(R.name, '???');
        setAttr(R.main, 'aria-label', tr('Unknown building, locked'));
        setAttr(R.main, 'aria-disabled', 'true');
        setText(R.count, '');
        setText(R.badge, '');
        setText(R.rate, tt`appears at ${fmt((b.unlockAt && b.unlockAt.eyes) || 0)} eyes`);
        this.updateCost(R.cost, E.buildingCost(b, owned, 1, this.cfg, g.mods), s.resources);
        setCls(R.row, 'can', false);
        continue;
      }
      setHidden(R.row, false);
      setCls(R.row, 'locked', false);
      setText(R.name, b.name);
      let n = this.qty === 'max' ? E.maxAffordable(b, owned, s.resources, this.cfg, g.mods) : +this.qty;
      const shownN = Math.max(1, n);
      const cost = E.buildingCost(b, owned, shownN, this.cfg, g.mods);
      const can = (this.qty !== 'max' || n >= 1) && E.canAfford(s.resources, cost);
      this.updateCost(R.cost, cost, s.resources);
      setText(R.badge, shownN > 1 || this.qty !== '1' ? '×' + shownN : '');
      setText(R.count, owned ? String(owned) : '');
      const per = g.prod.perBuilding[b.id];
      setText(R.rate, owned && per ? Object.keys(per).map((r) => `+${fmtRate(per[r])} ${r === 'eyes' ? '' : this.resName(r).toLowerCase() + ' '}/s`).join(' · ').replace(/ +\//g, '/') : '');
      setCls(R.row, 'can', can);
      setAttr(R.main, 'aria-disabled', can ? null : 'true');
      setAttr(R.main, 'aria-label', tt`Buy ${shownN} ${b.name}. Owned ${owned}.`);
    }
  }

  // ------------------------------------------------------------------ UPGRADES
  buildUpgrades() {
    const panel = this.tabs.upgrades.panel;
    this.upList = h('div', { class: 'items' });
    this.upEmpty = h('p', { class: 'empty' }, tr('No upgrades for sale yet. The blacksmith is still sharpening… keep collecting eyes.'));
    this.upOwned = h('div', { class: 'icon-grid' });
    this.upOwnedHead = h('h3', { class: 'sub-title' }, tr('Owned'));
    panel.append(h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, tr('Upgrades'))), this.upList, this.upEmpty, this.upOwnedHead, this.upOwned);
    this.uRows = {};
    for (const u of this.cfg.UPGRADES) {
      const cost = this.costEl();
      const main = h('button', { class: 'item-main', type: 'button', dataset: { tip: 'upgrade:' + u.id } },
        h('span', { class: 'item-icon small' }, this.sprite(u.icon || 'up_talons', 'item-img')),
        h('span', { class: 'item-body' }, h('span', { class: 'item-name' }, u.name), h('span', { class: 'item-desc' }, u.desc || ''), h('span', { class: 'item-line' }, cost)));
      main.addEventListener('click', () => {
        if (this.consumeLongPress()) return;
        if (this.game.buyUpgrade(u.id)) { this.hideTip(); this.uiFloatEl(main, 'NEW!'); }
      });
      const info = h('button', { class: 'item-info', type: 'button', 'aria-label': tr('About ') + u.name, dataset: { tipBtn: 'upgrade:' + u.id } }, 'i');
      const row = h('div', { class: 'item upgrade', hidden: true }, main, info);
      row._h = true;
      this.upList.append(row);
      this.uRows[u.id] = { row, main, cost };
    }
    this.ownedCount = -1;
  }

  upgradeShown(u) {
    const g = this.game;
    if (!g.upgradeVisible(u)) return false;
    if (this.seenUpgrades.has(u.id)) return true;
    if (E.affordFraction(g.state.resources, u.cost) >= 0.5) { this.seenUpgrades.add(u.id); return true; }
    return false;
  }

  updateUpgrades() {
    const g = this.game, s = g.state;
    let shown = 0, affordable = 0;
    // sort shown rows by cost (first resource) once per change
    for (const u of this.cfg.UPGRADES) {
      const R = this.uRows[u.id];
      const vis = this.upgradeShown(u);
      setHidden(R.row, !vis);
      if (!vis) continue;
      shown++;
      const can = E.canAfford(s.resources, u.cost);
      if (can) affordable++;
      this.updateCost(R.cost, u.cost, s.resources);
      setCls(R.row, 'can', can);
      setAttr(R.main, 'aria-disabled', can ? null : 'true');
    }
    setHidden(this.upEmpty, shown > 0);
    if (this.ownedCount !== s.upgrades.length) {
      this.ownedCount = s.upgrades.length;
      this.upOwned.replaceChildren(...s.upgrades.map((id) => {
        const u = g.I.upgrades[id];
        return h('button', { class: 'icon-tile owned', type: 'button', 'aria-label': u.name, dataset: { tip: 'upgrade:' + id, tipBtn: 'upgrade:' + id } }, this.sprite(u.icon || 'up_talons'));
      }));
      setText(this.upOwnedHead, tt`Owned · ${s.upgrades.length}/${this.cfg.UPGRADES.length}`);
      setHidden(this.upOwnedHead, !s.upgrades.length);
    }
    this.setBadge('upgrades', affordable);
  }

  setBadge(tab, n) {
    const b = this.tabs[tab].badge;
    setHidden(b, !n);
    setText(b, n > 9 ? '9+' : String(n));
  }

  // ------------------------------------------------------------------ MAGIC (stats, transmute, spells, eclipse)
  buildMagic() {
    const panel = h('div', { class: 'magic' });
    this.magicPanel = panel;

    // King stats
    this.st = {};
    const stat = (k, label, icon) => {
      const v = h('span', { class: 'stat-val' }, '0');
      this.st[k] = v;
      return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, icon ? this.sprite(icon, 'stat-icon') : null, label), v);
    };
    const kingCard = h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, tr('The Raven King')),
      h('div', { class: 'stats' },
        stat('eps', tr('Eyes / sec'), 'eye'), stat('click', tr('Eyes / click'), 'up_talons'),
        stat('mps', tr('Mana / sec'), 'mana'), stat('bonus', tr('Production bonus'), 'ach')));

    // Transmute
    this.tmBtn = h('button', { class: 'btn btn-violet btn-wide', type: 'button' },
      h('span', { class: 'btn-main' }, tr('Transmute')), h('span', { class: 'btn-sub' }));
    this.tmBtn.addEventListener('click', () => {
      const t = this.game.transmute();
      if (t) { this.uiFloatEl(this.tmBtn, '+' + fmtRate(t.gain) + ' mana', 'mana'); this.pop(this.tmBtn); }
    });
    const tcfg = this.cfg.GAME.transmute || {};
    this.tmInfo = h('p', { class: 'card-note' });
    this.tmPassive = h('p', { class: 'card-note passive' });
    const tmCard = h('section', { class: 'card card-transmute' },
      h('h2', { class: 'card-title' }, this.sprite('mana', 'title-icon'), tr('Transmute')),
      h('p', { class: 'card-text' }, tt`Melt ${Math.round((tcfg.fraction ?? 0.1) * 100)}% of your eyes into mana. ${fmt(tcfg.eyesPerMana ?? 100)} eyes = 1 mana.`),
      this.tmBtn, this.tmPassive);

    // Spells
    this.spRows = {};
    const spList = h('div', { class: 'spells' });
    for (const sp of this.cfg.SPELLS || []) {
      const cost = this.costEl();
      const bar = h('span', { class: 'bar-fill' });
      const state = h('span', { class: 'spell-state' });
      const name = h('span', { class: 'item-name' }, sp.name);
      const req = h('span', { class: 'spell-req' });
      const btn = h('button', { class: 'spell', type: 'button', dataset: { tip: 'spell:' + sp.id } },
        h('span', { class: 'item-icon small' }, this.sprite(sp.icon || 'sp_frenzy', 'item-img')),
        h('span', { class: 'item-body' }, name, h('span', { class: 'item-line' }, cost, req, state)),
        h('span', { class: 'bar' }, bar));
      btn.addEventListener('click', () => { if (this.consumeLongPress()) return; this.game.castSpell(sp.id); });
      const info = h('button', { class: 'item-info', type: 'button', 'aria-label': tr('About ') + sp.name, dataset: { tipBtn: 'spell:' + sp.id } }, 'i');
      const row = h('div', { class: 'item spell-row' }, btn, info);
      spList.append(row);
      this.spRows[sp.id] = { row, btn, cost, bar, state, name, req };
    }
    const spCard = h('section', { class: 'card' }, h('h2', { class: 'card-title' }, this.sprite('sp_frenzy', 'title-icon'), tr('Spells')), spList);

    // Eclipse
    const P = this.cfg.PRESTIGE || { name: 'Eclipse' };
    this.ecGain = h('span', { class: 'ec-gain' }, '0');
    this.ecNext = h('p', { class: 'card-note' });
    this.ecBonus = h('p', { class: 'card-note' });
    this.ecBtn = h('button', { class: 'btn btn-eclipse btn-wide', type: 'button' }, h('span', { class: 'btn-main' }, tt`Summon the ${P.name}`));
    this.ecBtn.addEventListener('click', () => this.eclipseModal());
    this.ecCard = h('section', { class: 'card card-eclipse', hidden: true },
      h('div', { class: 'eclipse-sun', 'aria-hidden': 'true' }),
      h('h2', { class: 'card-title' }, this.sprite('feather', 'title-icon'), P.name),
      h('p', { class: 'card-text' }, tr('Plunge the realm into darkness. Lose your eyes, mana, buildings and upgrades — earn Black Feathers that boost all production forever.')),
      h('div', { class: 'ec-row' }, this.sprite('feather', 'ec-icon'), h('span', null, tr('Feathers on '), P.name, ': '), this.ecGain),
      this.ecNext, this.ecBonus, this.ecBtn);
    this.ecCard._h = true;

    panel.append(kingCard, tmCard, spCard, this.ecCard);
  }

  updateMagic() {
    const g = this.game, s = g.state, m = g.mods;
    setText(this.st.eps, fmtRate(g.eps));
    setText(this.st.click, fmtRate(g.clickVal));
    setText(this.st.mps, fmtRate(g.mps));
    const bonus = (E.resourceMult('eyes', { ...m, globalMult: {} }) - 1);
    setText(this.st.bonus, '+' + fmtPct(bonus));

    const t = E.transmuteInfo(s, this.cfg, m);
    const can = t.spend >= 1 && t.gain > 0;
    setText(this.tmBtn.lastChild, can ? tt`−${fmt(t.spend)} eyes → +${fmtRate(t.gain)} mana` : tt`need ${fmt((t.eyesPerMana))} eyes`);
    setCls(this.tmBtn, 'can', t.gain >= 1);
    setAttr(this.tmBtn, 'aria-disabled', can ? null : 'true');
    setText(this.tmPassive, m.manaConversion > 0 ? tt`Passive: the King melts ${fmtPct(m.manaConversion)} of eyes/sec → +${fmtRate(g.prod.conversion)} mana/sec` : tr('Passive transmutation: none yet. Find lenses and tomes.'));

    let ready = 0;
    for (const sp of this.cfg.SPELLS || []) {
      const R = this.spRows[sp.id], st = g.spellState(sp.id);
      setCls(R.row, 'locked', !st.unlocked);
      setText(R.name, st.unlocked ? sp.name : '???');
      this.updateCost(R.cost, sp.cost, s.resources);
      let label = '', pct = 0;
      setHidden(R.cost, !st.unlocked);
      setText(R.req, st.unlocked ? '' : this.reqText(sp.requires));
      if (!st.unlocked) label = '';
      else if (st.active) { label = tt`active ${fmtTime(st.activeLeft)}`; pct = st.activeLeft / (sp.duration || 1); }
      else if (st.cooling) { label = tt`recharging ${fmtTime(st.coolLeft)}`; pct = 1 - st.coolLeft / Math.max(1, st.cooldownTotal); }
      else if (!st.affordable) label = tr('not enough mana');
      else { label = tr('ready!'); ready++; }
      setText(R.state, label);
      setCls(R.row, 'active', st.active);
      setCls(R.row, 'cooling', st.cooling && !st.active);
      const ok = st.unlocked && !st.active && !st.cooling && st.affordable;
      setCls(R.row, 'can', ok);
      setAttr(R.btn, 'aria-disabled', ok ? null : 'true');
      setAttr(R.btn, 'aria-label', st.unlocked ? tt`Cast ${sp.name}. ${label}` : tr('Locked spell'));
      const w = Math.round(Math.max(0, Math.min(1, pct)) * 100);
      if (R.bar._w !== w) { R.bar._w = w; R.bar.style.width = w + '%'; }
    }
    this.setBadge('magic', ready);

    const show = E.prestigeUnlocked(s, this.cfg);
    setHidden(this.ecCard, !show);
    if (show) {
      const gain = g.prestigeGain();
      setText(this.ecGain, '+' + fmt(gain));
      const P = this.cfg.PRESTIGE;
      setText(this.ecNext, s.lifetime.eyes < P.unlockAtLifetimeEyes
        ? tt`Requires ${fmt(P.unlockAtLifetimeEyes)} lifetime eyes (${fmtPct(s.lifetime.eyes / P.unlockAtLifetimeEyes)}).`
        : tt`Next feather at ${fmt(E.nextFeatherAt(s, this.cfg))} eyes this run (now ${fmt(s.run.eyes)}).`);
      const fc = E.featherCount(s);
      setText(this.ecBonus, tt`Feathers: ${fmt(s.resources.feathers)} · bonus +${fmtPct(fc * (P.bonusPerFeatherPct || 0) / 100)} production`);
      setCls(this.ecBtn, 'can', gain >= 1);
      setAttr(this.ecBtn, 'aria-disabled', gain >= 1 ? null : 'true');
    }
  }

  reqText(req) {
    if (!req) return '';
    const list = Array.isArray(req) ? req : [req];
    const parts = [];
    for (const r of list) {
      if (r.building) for (const b of [].concat(r.building)) parts.push(`${b.count ?? 1} ${(this.game.I.buildings[b.id] || {}).name || b.id}`);
      if (r.lifetimeEyes != null) parts.push(tt`${fmt(r.lifetimeEyes)} lifetime eyes`);
      if (r.upgrade) for (const u of [].concat(r.upgrade)) parts.push((this.game.I.upgrades[u] || {}).name || u);
      if (r.prestiges != null) parts.push(tn(r.prestiges, '{n} Eclipse', '{n} Eclipses'));
    }
    return parts.length ? tr('needs ') + parts.join(', ') : '';
  }

  // ------------------------------------------------------------------ MARKET
  buildMarket() {
    const panel = this.tabs.market.panel;
    const cons = h('div', { class: 'items' });
    const skins = h('div', { class: 'skins' });
    this.mRows = {};
    for (const m of this.cfg.MARKET || []) {
      if (m.kind === 'skin') continue;
      const cost = this.costEl();
      const times = h('span', { class: 'item-count small' });
      const main = h('button', { class: 'item-main', type: 'button', dataset: { tip: 'market:' + m.id } },
        h('span', { class: 'item-icon small' }, this.sprite(m.icon || 'mk_jar', 'item-img')),
        h('span', { class: 'item-body' }, h('span', { class: 'item-name' }, m.name), h('span', { class: 'item-desc' }, m.desc || ''), h('span', { class: 'item-line' }, cost)),
        times);
      main.addEventListener('click', () => {
        if (this.consumeLongPress()) return;
        if (this.game.buyMarket(m.id)) this.pop(row);
      });
      const info = h('button', { class: 'item-info', type: 'button', 'aria-label': tr('About ') + m.name, dataset: { tipBtn: 'market:' + m.id } }, 'i');
      const row = h('div', { class: 'item market' }, main, info);
      cons.append(row);
      this.mRows[m.id] = { row, main, cost, times };
    }
    // skins: default + market skins
    this.skinCards = [];
    const mkCard = (skin, m) => {
      const cost = m ? this.costEl() : null;
      const action = h('span', { class: 'skin-action' });
      const btn = h('button', { class: 'skin-card', type: 'button', dataset: m ? { tip: 'market:' + m.id } : {} },
        h('span', { class: 'skin-preview' }, this.sprite('king', 'skin-img', { skin, scale: 3 })),
        h('span', { class: 'skin-name' }, m ? m.name : tr('Raven King')),
        cost || h('span', { class: 'cost' }, 'classic'), action);
      btn.addEventListener('click', () => {
        if (this.consumeLongPress()) return;
        const owned = ownedSkins(this.game.state, this.cfg).includes(skin);
        if (owned) this.game.equipSkin(skin);
        else if (m) this.game.buyMarket(m.id);
      });
      skins.append(btn);
      this.skinCards.push({ skin, m, btn, cost, action });
    };
    mkCard('default', null);
    for (const m of this.cfg.MARKET || []) if (m.kind === 'skin') mkCard(m.skin, m);
    this.marketEmpty = h('p', { class: 'empty' }, tr('The merchant ravens are still unpacking.'));
    panel.append(
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, tr('Night Market'))),
      h('p', { class: 'panel-note' }, tr('Trinkets and potions, paid in mana. Prices rise as you buy.')),
      cons, this.marketEmpty,
      h('h3', { class: 'sub-title' }, tr('Royal Wardrobe')), skins);
  }

  updateMarket() {
    const g = this.game, s = g.state;
    let shown = 0;
    for (const id in this.mRows) {
      const R = this.mRows[id], st = g.marketState(id);
      setHidden(R.row, !st.unlocked);
      if (!st.unlocked) continue;
      shown++;
      this.updateCost(R.cost, st.cost, s.resources);
      setText(R.times, st.times ? '×' + st.times : '');
      setCls(R.row, 'can', st.affordable);
      setAttr(R.main, 'aria-disabled', st.affordable ? null : 'true');
      const buff = s.buffs.find((b) => b.id === 'market:' + id);
      setCls(R.row, 'active', !!buff);
    }
    setHidden(this.marketEmpty, shown > 0);
    const owned = ownedSkins(s, this.cfg);
    for (const c of this.skinCards) {
      const has = owned.includes(c.skin), eq = s.equippedSkin === c.skin;
      const st = c.m ? g.marketState(c.m.id) : null;
      const locked = st && !st.unlocked;
      setHidden(c.btn, !!locked && !has);
      if (c.cost) { setHidden(c.cost, has); if (!has) this.updateCost(c.cost, st.cost, s.resources); }
      setText(c.action, eq ? tr('equipped') : has ? tr('equip') : tr('buy'));
      setCls(c.btn, 'equipped', eq);
      setCls(c.btn, 'can', !has && st && st.affordable);
      setAttr(c.btn, 'aria-pressed', has ? String(eq) : null);
      setAttr(c.btn, 'aria-label', tt`${c.m ? c.m.name : tr('Raven King')} skin — ${eq ? tr('equipped') : has ? tr('owned, equip') : tr('buy')}`);
    }
  }

  // ------------------------------------------------------------------ FEATS (achievements)
  buildFeats() {
    const panel = this.tabs.feats.panel;
    this.featHead = h('p', { class: 'panel-note' });
    const grid = h('div', { class: 'icon-grid feats' });
    this.aTiles = {};
    for (const a of this.cfg.ACHIEVEMENTS || []) {
      const img = this.sprite(a.icon || 'ach');
      const lock = this.sprite('lock', 'lock-img');
      const tile = h('button', { class: 'icon-tile feat', type: 'button', dataset: { tip: 'ach:' + a.id, tipBtn: 'ach:' + a.id } }, img, lock);
      grid.append(tile);
      this.aTiles[a.id] = { tile, lock };
    }
    panel.append(h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, tr('Feats of the Crown'))), this.featHead, grid);
    this.featCount = -1;
  }

  updateFeats() {
    const s = this.game.state;
    if (this.featCount === s.achievements.length) return;
    this.featCount = s.achievements.length;
    const got = new Set(s.achievements);
    for (const a of this.cfg.ACHIEVEMENTS || []) {
      const T = this.aTiles[a.id], on = got.has(a.id);
      setCls(T.tile, 'got', on);
      setHidden(T.lock, on);
      setAttr(T.tile, 'aria-label', `${on ? a.name : tr('Locked feat')}${on ? tr(' (earned)') : ''}`);
    }
    setText(this.featHead, tt`${s.achievements.length} / ${(this.cfg.ACHIEVEMENTS || []).length} earned · +${fmtPct(this.game.mods.achPct / 100)} production`);
  }

  // ------------------------------------------------------------------ king, stage
  bindKing() {
    const king = $('#king');
    this.kingImg = $('#king-img');
    king.addEventListener('click', (e) => {
      const stage = $('#stage').getBoundingClientRect();
      let x, y;
      if (e.detail === 0 || (!e.clientX && !e.clientY)) { const r = king.getBoundingClientRect(); x = r.left + r.width / 2 - stage.left; y = r.top + r.height * 0.35 - stage.top; }
      else { x = e.clientX - stage.left; y = e.clientY - stage.top; }
      const v = this.game.click();
      audio.play('click');
      this.fx.floatText(x, y - 10, '+' + fmtRate(v), v >= this.game.eps * 5 && v > 10 ? 'big' : '');
      this.fx.burst(x, y, 3 + Math.floor(Math.random() * 3), 'eye');
      this.squashUntil = performance.now() + 110;
      king.classList.remove('squash'); void king.offsetWidth; king.classList.add('squash');
      if (this.game.state.lifetime.clicks >= 5) setHidden($('#click-hint'), true);
    });
  }

  updateKingSprite(force) {
    const skin = this.game.state.equippedSkin || 'default';
    const t = performance.now();
    let frame;
    if (t < this.squashUntil) frame = 2;
    else {
      if (t >= this.kingNext) { this.kingFrame = this.kingFrame ? 0 : 1; this.kingNext = t + (this.kingFrame ? 380 : 1100); }
      frame = this.reduced() ? 0 : this.kingFrame;
    }
    const key = skin + ':' + frame;
    if (force || this.kingKey !== key) {
      this.kingKey = key;
      this.kingImg.src = this.src('king', { scale: 8, frame, skin: skin === 'default' ? null : skin });
    }
  }

  // ------------------------------------------------------------------ omen
  updateOmen() {
    const o = this.game.omen.active;
    const layer = $('#omen-layer');
    if (!o) { if (this.omenEl) { this.omenEl.remove(); this.omenEl = null; } return; }
    if (!this.omenEl || this.omenEl._o !== o) {
      if (this.omenEl) this.omenEl.remove();
      const btn = h('button', { class: 'omen', type: 'button', 'aria-label': tr('A golden omen! Catch it for a reward.') }, this.sprite('eye_gold', 'omen-img'));
      btn._o = o;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const st = $('#stage').getBoundingClientRect(), r = btn.getBoundingClientRect();
        const x = r.left + r.width / 2 - st.left, y = r.top + r.height / 2 - st.top;
        const rw = this.game.catchOmen();
        if (rw) { this.fx.burst(x, y, 14, 'eye_gold', { speed: 1.2, size: 28 }); this.fx.floatText(x, y, rw.text, 'gold big'); }
      });
      layer.append(btn);
      this.omenEl = btn;
    }
    const st = $('#stage');
    const W = st.clientWidth, H = st.clientHeight;
    const now = this.game.now();
    const p = Math.min(1, (now - o.spawnedAt) / (o.until - o.spawnedAt));
    let x, y;
    if (this.reduced()) { x = W * (0.15 + o.seed * 0.6); y = H * 0.3; }
    else {
      const ltr = o.seed > 0.5;
      const q = ltr ? p : 1 - p;
      x = -60 + q * (W + 120) - 32;
      y = H * (0.18 + 0.35 * ((o.seed * 7) % 1)) + Math.sin(p * Math.PI * 6 + o.seed * 10) * H * 0.08;
    }
    const tr = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (this.omenEl._tr !== tr) { this.omenEl._tr = tr; this.omenEl.style.transform = tr; }
    setCls(this.omenEl, 'fading', p > 0.85);
  }

  // ------------------------------------------------------------------ buffs strip
  updateBuffs() {
    const g = this.game, s = g.state, now = g.now();
    const list = [];
    for (const b of s.buffs) if (b.until > now) list.push({ key: b.id, icon: b.icon || 'eye_gold', label: b.label || tr('Buff'), left: (b.until - now) / 1000, total: b.dur || 1 });
    for (const sp of this.cfg.SPELLS || []) {
      const st = s.spells[sp.id];
      if (st && st.activeUntil > now) list.push({ key: 'spell:' + sp.id, icon: sp.icon, label: sp.name, left: (st.activeUntil - now) / 1000, total: sp.duration || 1 });
    }
    const wrap = $('#buffs');
    const keys = list.map((x) => x.key).join('|');
    if (wrap._keys !== keys) {
      wrap._keys = keys;
      wrap.replaceChildren(...list.map((b) => {
        const t = h('span', { class: 'buff-time' });
        const fill = h('span', { class: 'buff-fill' });
        const el = h('div', { class: 'buff', title: b.label }, this.sprite(b.icon, 'buff-icon'), h('span', { class: 'buff-label' }, b.label), t, h('span', { class: 'buff-bar' }, fill));
        el._t2 = t; el._fill = fill;
        return el;
      }));
    }
    list.forEach((b, i) => {
      const el = wrap.children[i]; if (!el) return;
      setText(el._t2, fmtTime(b.left));
      const w = Math.round(Math.min(1, b.left / b.total) * 100);
      if (el._fill._w !== w) { el._fill._w = w; el._fill.style.width = w + '%'; }
    });
  }

  // ------------------------------------------------------------------ realm (owned buildings strip)
  updateRealm() {
    const s = this.game.state, el = $('#realm');
    if (!el || el.offsetParent === null && el._key !== undefined) return;
    const key = this.cfg.BUILDINGS.map((b) => s.buildings[b.id] || 0).join(',') + '|' + (s.equippedSkin || '');
    if (el._key === key) return;
    el._key = key;
    const rows = [];
    for (const b of this.cfg.BUILDINGS) {
      const n = s.buildings[b.id] || 0;
      if (!n) continue;
      const show = Math.min(n, 24);
      const src = this.src(b.icon || b.id, { scale: 2 });
      const strip = h('span', { class: 'realm-strip' });
      for (let i = 0; i < show; i++) strip.append(h('img', { class: 'px-img', src, alt: '', style: `--i:${i}` }));
      if (n > show) strip.append(h('span', { class: 'realm-more' }, '+' + fmt(n - show)));
      rows.push(h('div', { class: 'realm-row', dataset: { tip: 'building:' + b.id } }, h('span', { class: 'realm-n' }, fmt(n)), strip));
    }
    if (!rows.length) rows.push(h('p', { class: 'realm-empty' }, tr('Your realm is empty. Hire a Servant Raven to start the eye harvest.')));
    el.replaceChildren(h('h2', { class: 'realm-title' }, tr('Your Realm')), ...rows);
  }

  // ------------------------------------------------------------------ chatter ticker
  nextChatter() {
    const lines = (this.cfg.CHATTER || []).filter((c) => (c.minEyes || 0) <= this.game.state.lifetime.eyes && (c.minPrestiges || 0) <= this.game.state.prestiges);
    if (!lines.length) return;
    let i = Math.floor(Math.random() * lines.length);
    if (lines.length > 1 && lines[i] === this.lastChatter) i = (i + 1) % lines.length;
    this.lastChatter = lines[i];
    this.say(lines[i].text);
  }
  say(text) {
    const el = $('#ticker-text');
    el.classList.remove('in'); void el.offsetWidth;
    el.textContent = text;
    el.classList.add('in');
  }

  // ------------------------------------------------------------------ per-frame
  frame(t, dt) {
    this.fx.update(dt);
    this.updateKingSprite();
    this.updateOmen();
    this.listTimer += dt;
    if (this.listTimer >= 0.1) { this.listTimer = 0; this.render(); }
    if (this.tip.key) { this.tip.timer += dt; if (this.tip.timer > 0.25) { this.tip.timer = 0; this.fillTip(); } }
  }

  render(all = false) {
    const g = this.game, s = g.state;
    // resource bar
    for (const r of this.cfg.RESOURCES) {
      const R = this.res[r.id]; if (!R) continue;
      setText(R.amt, fmt(s.resources[r.id] || 0));
      const rate = g.prod.total[r.id] || 0;
      setText(R.rate, rate > 0 ? '+' + fmtRate(rate) + '/s' : '');
      if (r.id === 'feathers') setHidden(R.chip, !(s.resources.feathers > 0 || s.prestiges > 0 || E.prestigeGain(s, this.cfg) > 0));
    }
    setText($('#sc-eyes'), fmt(s.resources.eyes));
    setText($('#sc-eps'), fmtRate(g.eps));
    setText($('#sc-click'), fmtRate(g.clickVal));
    this.updateBuffs();
    this.updateRealm();
    // the magic panel is always visible on desktop
    const tab = this.tab;
    if (all || tab === 'buildings') this.updateBuildings();
    this.updateUpgrades(); // computes badge
    this.updateMagic();
    if (all || tab === 'market') this.updateMarket();
    if (all || tab === 'feats') this.updateFeats();
    if (all) { this.updateBuildings(); this.updateMarket(); this.updateFeats(); }
  }

  // ------------------------------------------------------------------ small juice helpers
  pop(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  uiFloat(x, y, text, cls = '') {
    const el = h('span', { class: 'ui-float ' + cls + (this.reduced() ? ' still' : '') }, text);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.append(el);
    setTimeout(() => el.remove(), 900);
  }
  uiFloatEl(target, text, cls = '') { const r = target.getBoundingClientRect(); this.uiFloat(r.left + r.width / 2, r.top, text, cls); }

  // ------------------------------------------------------------------ events from game
  bindEvents() {
    const g = this.game;
    g.on('buy', (d) => { audio.play('buy'); if (d.instant && Object.keys(d.instant).length) this.instantFx(d.instant); this.render(true); });
    g.on('deny', () => audio.play('deny'));
    g.on('spell', ({ spell, instant }) => {
      audio.play('spell');
      this.fx.shake(1);
      this.flashStage('violet');
      this.toast({ icon: spell.icon, title: spell.name, text: spell.desc });
      if (instant && Object.keys(instant).length) this.instantFx(instant);
    });
    g.on('transmute', () => { audio.play('transmute'); this.fx.burst(this.stageCenter().x, this.stageCenter().y, 6, 'mana'); });
    g.on('achievement', (a) => {
      audio.play('achievement');
      this.toast({ icon: a.icon || 'ach', title: tr('Feat earned: ') + a.name, text: a.desc + (a.reward?.globalMultPct ? tt` (+${a.reward.globalMultPct}% production)` : ''), kind: 'gold' });
    });
    g.on('omenSpawn', () => audio.play('omenAppear'));
    g.on('omen', ({ reward, instant }) => {
      audio.play('omen');
      this.fx.shake(1.5);
      this.flashStage('gold');
      let text = '';
      if (instant && Object.keys(instant).length) text = Object.entries(instant).map(([r, v]) => `+${fmt(v)} ${this.resName(r).toLowerCase()}`).join(', ');
      else if (reward.duration) text = tt`for ${fmtTime(reward.duration * this.game.mods.omenDurationMult)}`;
      this.toast({ icon: 'eye_gold', title: reward.text, text, kind: 'gold' });
    });
    g.on('prestige', (n) => {
      const snap = this.eclipseSnap; this.eclipseSnap = null;
      const done = () => this.toast({ icon: 'feather', title: tr('The Eclipse has passed'), text: tt`+${fmt(n)} Black Feathers. The realm begins anew…`, kind: 'violet' });
      if (snap && !this.reduced()) { playEclipse(this, snap, n).then(done, done); return; }
      audio.play('eclipse');
      this.flashStage('eclipse');
      this.fx.shake(3);
      this.toast({ icon: 'feather', title: tr('The Eclipse has passed'), text: tt`+${fmt(n)} Black Feathers. The realm begins anew…`, kind: 'violet' });
    });
    g.on('skin', () => { this.updateKingSprite(true); this.render(true); });
    g.on('reload', () => { this.seenUpgrades.clear(); this.ownedCount = -1; this.featCount = -1; this.applySettings(); this.updateKingSprite(true); this.render(true); });
    g.on('settings', () => this.applySettings());
    g.on('cloud', () => this.updateAccount());
    g.on('cloudError', (msg) => this.toast({ icon: 'king', title: tr('Cloud save problem'), text: tt`${msg} Your progress is safe on this device.`, kind: 'gold' }));
    g.on('cloudLoaded', () => this.toast({ icon: 'king', title: tr('Kingdom restored'), text: tr('Your cloud save was loaded on this device.'), kind: 'gold' }));
  }

  instantFx(instant) {
    const c = this.stageCenter();
    for (const r in instant) { this.fx.floatText(c.x, c.y - 60, '+' + fmt(instant[r]), 'gold big'); this.fx.burst(c.x, c.y, 12, this.resIcon(r)); }
  }

  stageCenter() { const st = $('#stage'); return { x: st.clientWidth / 2, y: st.clientHeight / 2 }; }

  flashStage(kind) {
    if (this.reduced()) return;
    const st = $('#stage');
    const f = h('div', { class: 'stage-flash ' + kind, 'aria-hidden': 'true' });
    st.append(f);
    setTimeout(() => f.remove(), 700);
  }

  welcomeBack(seconds, eyes) {
    if (eyes <= 0) return;
    this.toast({ icon: 'servant_raven', title: tr('Welcome back!'), text: tt`While you were away (${fmtTime(seconds)}) the ravens gathered +${fmt(eyes)} eyes.` });
  }

  // ------------------------------------------------------------------ toasts
  toast({ icon = 'ach', title, text = '', kind = '' }) {
    const wrap = $('#toasts');
    const max = mqMobile.matches ? 1 : 3;
    while (wrap.children.length >= max) wrap.firstChild.remove();
    const el = h('div', { class: 'toast ' + kind, role: 'status' },
      h('span', { class: 'toast-icon' }, this.sprite(icon)),
      h('span', { class: 'toast-body' }, h('strong', null, title), text ? h('span', null, text) : null));
    el.addEventListener('click', () => el.remove());
    wrap.append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 4200);
  }

  // ------------------------------------------------------------------ RANKING + ACCOUNT (cloud save)
  buildRanks() {
    const panel = this.tabs.ranks.panel;
    this.rankNote = h('p', { class: 'panel-note' }, tr('The kings with the most Black Feathers ever earned.'));
    this.rankMe = h('div', { class: 'rank-me' });
    this.rankList = h('ol', { class: 'rank-list', 'aria-live': 'polite' });
    this.rankMsg = h('p', { class: 'muted rank-msg' });
    const refresh = h('button', { class: 'btn', type: 'button' }, tr('Refresh'));
    refresh.addEventListener('click', () => this.loadRanks(true));
    panel.append(h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, tr('Feather Ranking')), refresh),
      this.rankNote, this.rankMe, this.rankList, this.rankMsg);
    this.ranksAt = 0;
    this.updateAccount();
  }

  async loadRanks(force = false) {
    if (!this.rankList || this.ranksBusy) return;
    if (!force && Date.now() - this.ranksAt < 20000) return;
    if (!cloudEnabled) { this.rankMsg.textContent = tr('Cloud saves and the Feather Ranking live at victorvk.com/game. Here your progress is saved in this browser only.'); return; }
    this.ranksBusy = true;
    this.rankMsg.textContent = tr('The ravens are counting feathers…');
    try {
      const cloud = this.game.cloud;
      if (cloud.user && cloud.synced) await cloud.push();
      const { leaderboard } = await import('./cloud.js');
      const d = await leaderboard();
      this.ranksAt = Date.now();
      const me = cloud.user ? cloud.user.toLowerCase() : '';
      this.rankList.replaceChildren(...d.top.map((r, i) => h('li', { class: 'rank-row' + (r.username.toLowerCase() === me ? ' mine' : '') + (i < 3 ? ' top' + (i + 1) : '') },
        h('span', { class: 'rank-pos' }, String(i + 1)),
        h('span', { class: 'rank-name' }, r.username),
        h('span', { class: 'rank-feathers' }, this.sprite('feather', 'rank-icon'), fmt(r.feathers)),
        h('span', { class: 'rank-sub' }, tt`${fmt(r.eyes)} eyes · ${tn(r.eclipses, '{n} eclipse', '{n} eclipses')}`))));
      this.rankMsg.textContent = d.top.length ? tn(d.players, '{n} king in the realm.', '{n} kings in the realm.') : tr('No kings yet. Be the first!');
      this.rankMeData = d.me;
      this.updateAccount();
    } catch (e) {
      this.rankMsg.textContent = e.message;
    } finally {
      this.ranksBusy = false;
    }
  }

  updateAccount() {
    const cloud = this.game.cloud;
    const btn = $('#btn-account');
    if (btn) btn.setAttribute('aria-label', cloud && cloud.user ? tt`Account: ${cloud.user}` : tr('Log in to save in the cloud'));
    if (btn) btn.classList.toggle('on', !!(cloud && cloud.user));
    if (!this.rankMe) return;
    if (!cloud || !cloud.user) {
      const b = h('button', { class: 'btn btn-gold', type: 'button' }, tr('Log in or create account'));
      b.addEventListener('click', () => this.accountModal());
      this.rankMe.replaceChildren(h('p', null, tr('Create an account to join the ranking and keep your kingdom on any device.')), b);
      return;
    }
    const me = this.rankMeData;
    this.rankMe.replaceChildren(h('p', null, me ? tt`You are #${me.rank} — ${cloud.user}, ${fmt(me.feathers)} feathers.` : tt`Logged in as ${cloud.user}. Earn Black Feathers to climb the ranking.`));
  }

  accountModal() {
    const cloud = this.game.cloud;
    if (!cloudEnabled) {
      this.modal({ title: tr('Raven Account'), icon: 'king', body: h('div', null,
        h('p', null, tr('Cloud saves and the Feather Ranking live at victorvk.com/game. Here your progress is saved in this browser only.')),
        h('p', { class: 'muted small' }, tr('Use Export in Settings to keep a backup, and Import it at victorvk.com/game to continue there.'))),
        actions: [{ label: tr('Close') }, { label: tr('Open victorvk.com/game'), kind: 'primary', onClick: () => { window.open('https://victorvk.com/game/', '_blank', 'noopener'); return true; } }] });
      return;
    }
    if (cloud.user) {
      const when = cloud.lastSync ? new Date(cloud.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : tr('not yet');
      const status = h('p', { class: 'muted', 'aria-live': 'polite' }, cloud.error ? cloud.error : tt`Last cloud save: ${when}.`);
      const body = h('div', null,
        h('p', null, tt`Logged in as `, h('b', { class: 'acc-name' }, cloud.user), '.'),
        h('p', null, tr('Your kingdom saves to the cloud every minute and when you leave. Log in with the same name on any device to continue.')),
        status);
      this.modal({ title: tr('Your account'), icon: 'king', body, actions: [
        { label: tr('Log out'), onClick: (close) => { status.textContent = tr('Saving before logout…'); cloud.logout().then((ok) => {
          if (!ok) { status.textContent = tr('Could not save to the cloud, so you stay logged in. Check your connection and try again.'); return; }
          close(); this.toast({ icon: 'king', title: tr('Logged out'), text: tr('Your kingdom is saved in your account. This device was reset.') }); }); return true; } },
        { label: tr('Save now'), kind: 'primary', onClick: () => { status.textContent = tr('Saving…'); cloud.push().then(() => { status.textContent = cloud.error || tr('Saved to the cloud.'); }); return true; } },
      ] });
      return;
    }
    let isNew = false;
    const name = h('input', { class: 'acc-input', type: 'text', autocomplete: 'username', maxlength: '16', spellcheck: 'false', autocapitalize: 'off', 'aria-label': tr('Name'), enterkeyhint: 'next' });
    // Players come from the Enois iframe with real names ("João Silva", "ana.maria"): clean it up as they type.
    const cleanName = (v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s.\-]+/g, '_').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
    name.addEventListener('input', () => { const c = cleanName(name.value); if (c !== name.value) name.value = c; });
    const pass = h('input', { class: 'acc-input', type: 'password', autocomplete: 'current-password', maxlength: '128', 'aria-label': tr('Password') });
    const pass2 = h('input', { class: 'acc-input', type: 'password', autocomplete: 'new-password', maxlength: '128', 'aria-label': tr('Repeat password') });
    const rowPass2 = h('label', { class: 'acc-field', hidden: true }, h('span', null, tr('Repeat password')), pass2);
    const hint = h('p', { class: 'muted small', hidden: true }, tr('Name: 3–16 letters, numbers or _ (no spaces or accents). It shows in the ranking. Password: 8+ characters. There is no e-mail recovery, so keep it safe.'));
    const msg = h('p', { class: 'acc-msg', 'aria-live': 'polite' });
    const switchBtn = h('button', { class: 'link-btn', type: 'button' });
    // Not a <form>: the Énóis iframe is sandboxed without allow-forms, which blocks any form submission.
    const form = h('div', { class: 'acc-form', role: 'group', 'aria-label': tr('Raven Account') },
      h('label', { class: 'acc-field' }, h('span', null, tr('Name')), name),
      h('label', { class: 'acc-field' }, h('span', null, tr('Password')), pass),
      rowPass2, hint, msg,
      h('button', { class: 'btn btn-gold btn-wide acc-submit', type: 'button' }, tr('Log in')),
      h('p', { class: 'acc-switch' }, switchBtn));
    const submit = form.querySelector('.acc-submit');
    const setMode = (n) => {
      isNew = n;
      rowPass2.hidden = !n; hint.hidden = !n;
      pass.setAttribute('autocomplete', n ? 'new-password' : 'current-password');
      submit.textContent = n ? tr('Create account') : tr('Log in');
      switchBtn.textContent = n ? tr('I already have an account') : tr('New here? Create an account');
      msg.textContent = '';
    };
    switchBtn.addEventListener('click', () => { setMode(!isNew); name.focus(); });
    setMode(false);
    let inFrame = false; try { inFrame = window.self !== window.top; } catch { inFrame = true; }
    const tabLink = inFrame ? h('p', { class: 'muted small' }, tr('Trouble signing up here? '), h('a', { class: 'link-btn', href: 'https://victorvk.com/game/', target: '_blank', rel: 'noopener' }, tr('Open Krowlect in a new tab'))) : null;
    const body = h('div', null, h('p', null, tr('Save your kingdom in the cloud, play on any device and join the Feather Ranking.')), form, tabLink);
    const m = this.modal({ title: tr('Raven Account'), icon: 'king', body });
    const doSubmit = async () => {
      if (submit.disabled) return;
      const n = name.value.trim(), p = pass.value;
      if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) { msg.textContent = tr('Name must be 3–16 letters, numbers or _.'); name.focus(); return; }
      if (p.length < (isNew ? 8 : 1)) { msg.textContent = isNew ? tr('Password must be at least 8 characters.') : tr('Enter your password.'); pass.focus(); return; }
      if (isNew && p.toLowerCase() === n.toLowerCase()) { msg.textContent = tr('Password cannot be the same as your name.'); pass.focus(); return; }
      if (isNew && p !== pass2.value) { msg.textContent = tr('Passwords do not match.'); pass2.focus(); return; }
      submit.setAttribute('aria-disabled', 'true'); submit.disabled = true;
      msg.textContent = isNew ? tr('Creating your account…') : tr('Opening the gates…');
      try {
        await cloud.login(n, p, isNew);
        m.close();
        audio.play('achievement');
        this.toast({ icon: 'king', title: tt`Welcome, ${cloud.user}`, text: tr('Your kingdom is now saved in the cloud.'), kind: 'gold' });
        this.ranksAt = 0;
        if (this.tab === 'ranks') this.loadRanks(true);
      } catch (err) {
        msg.textContent = err.message;
        audio.play('deny');
      } finally {
        submit.removeAttribute('aria-disabled'); submit.disabled = false;
      }
    };
    submit.addEventListener('click', doSubmit);
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); doSubmit(); } });
    setTimeout(() => name.focus(), 50);
  }

  // ------------------------------------------------------------------ modal
  modal({ title, body, actions = [], icon = null, cls = '' }) {
    const root = $('#modal-root');
    const prev = document.activeElement;
    const titleId = 'm-title-' + Math.random().toString(36).slice(2, 7);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); };
    const btns = actions.map((a) => {
      const b = h('button', { class: 'btn ' + (a.kind === 'primary' ? 'btn-gold' : a.kind === 'danger' ? 'btn-danger' : a.kind === 'violet' ? 'btn-violet' : ''), type: 'button' }, a.label);
      b.addEventListener('click', () => { const keep = a.onClick ? a.onClick(close) : false; if (keep !== true) close(); });
      return b;
    });
    const dialog = h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'modal-head' }, icon ? this.sprite(icon, 'modal-icon') : null, h('h2', { id: titleId }, title),
        h('button', { class: 'modal-x', type: 'button', 'aria-label': tr('Close'), onclick: () => close() }, '×')),
      h('div', { class: 'modal-body' }, body),
      btns.length ? h('div', { class: 'modal-actions' }, btns) : null);
    const overlay = h('div', { class: 'overlay' }, dialog);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { // focus trap
        const f = [...dialog.querySelectorAll('button, [href], input, textarea, select')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    root.append(overlay);
    (btns.find((b) => b.classList.contains('btn-gold')) || dialog.querySelector('.modal-x')).focus({ preventScroll: true });
    return { close, dialog };
  }

  offlineModal(r) {
    const lines = Object.entries(r.gains).filter(([, v]) => v > 0).map(([res, v]) =>
      h('div', { class: 'gain-line' }, this.sprite(this.resIcon(res), 'gain-icon'), h('span', { class: 'gain-num' }, '+' + fmt(v)), h('span', null, this.resName(res))));
    const capped = r.elapsed > r.seconds + 1;
    const body = h('div', null,
      h('p', null, tt`You were gone for ${fmtTime(r.elapsed)}. Your ravens kept working at ${fmtPct(r.efficiency)} efficiency${capped ? tt` (capped at ${fmtTime(r.seconds)})` : ''}.`),
      h('div', { class: 'gains' }, lines));
    this.modal({ title: tr('While you slept…'), icon: 'servant_raven', body, actions: [{ label: tr('Collect'), kind: 'primary', onClick: () => { audio.unlockAudio(); audio.play('buy'); this.fx.rain(30, 'eye'); } }] });
  }

  eclipseModal() {
    const g = this.game, n = g.prestigeGain(), P = this.cfg.PRESTIGE;
    if (n < 1) {
      this.toast({ icon: 'feather', title: tr('The moon is not ready'), text: tt`Gather ${fmt(E.nextFeatherAt(g.state, this.cfg))} eyes this run to earn a feather.` });
      audio.play('deny');
      return;
    }
    const fc = E.featherCount(g.state) + n;
    const body = h('div', null,
      h('p', null, tt`The ${P.name} will swallow your eyes, mana, buildings, upgrades and market purchases.`),
      h('p', null, tr('You keep: feats, Black Feathers and royal skins.')),
      h('div', { class: 'gains' }, h('div', { class: 'gain-line' }, this.sprite('feather', 'gain-icon'), h('span', { class: 'gain-num' }, '+' + fmt(n)), h('span', null, tr('Black Feathers')))),
      h('p', { class: 'muted' }, tt`Total production bonus after: +${fmtPct(fc * (P.bonusPerFeatherPct || 0) / 100)}`));
    this.modal({ title: tt`Summon the ${P.name}?`, icon: 'feather', cls: 'modal-eclipse', body, actions: [
      { label: tr('Not yet') },
      { label: tt`Summon ${P.name}`, kind: 'danger', onClick: () => {
        this.eclipseSnap = { eyes: g.state.resources.eyes, buildings: this.cfg.BUILDINGS.filter((b) => g.state.buildings[b.id] > 0).map((b) => ({ id: b.id, name: b.name, icon: b.icon, n: g.state.buildings[b.id] })) };
        g.prestige();
      } },
    ] });
  }

  settingsModal(startTab = 'options') {
    const g = this.game, s = g.state;
    const toggle = (key, label, onChange) => {
      const input = h('input', { type: 'checkbox', class: 'switch-input' });
      input.checked = !!s.settings[key];
      input.addEventListener('change', () => { g.setSetting(key, input.checked); onChange && onChange(); this.applySettings(); });
      return h('label', { class: 'switch' }, input, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }), h('span', null, label));
    };
    const fmtSel = h('select', { class: 'select', 'aria-label': tr('Number format') },
      h('option', { value: 'short' }, tr('Short (1.2M, 3.4aa)')), h('option', { value: 'sci' }, tr('Scientific (1.2e6)')));
    fmtSel.value = s.settings.numberFormat;
    const langSel = h('select', { class: 'select', 'aria-label': tr('Language') },
      h('option', { value: 'auto' }, tr('Auto (browser)')), h('option', { value: 'en' }, 'English'), h('option', { value: 'pt' }, 'Português'));
    langSel.value = langPref();
    langSel.addEventListener('change', () => { setLangPref(langSel.value); g.save(); location.reload(); });
    fmtSel.addEventListener('change', () => { g.setSetting('numberFormat', fmtSel.value); this.render(true); });

    const area = h('textarea', { class: 'save-area', rows: '4', spellcheck: 'false', 'aria-label': tr('Save string'), placeholder: tr('Paste a save string here to import…') });
    const msg = h('p', { class: 'muted save-msg', 'aria-live': 'polite' });
    const expBtn = h('button', { class: 'btn btn-violet', type: 'button' }, tr('Export'));
    expBtn.addEventListener('click', async () => {
      area.value = g.exportSave(); area.select();
      try { await navigator.clipboard.writeText(area.value); msg.textContent = tr('Save copied to clipboard. Keep it somewhere safe!'); } catch { msg.textContent = tr('Save string ready — copy it from the box.'); }
    });
    const impBtn = h('button', { class: 'btn', type: 'button' }, tr('Import'));
    impBtn.addEventListener('click', () => {
      try { g.importSave(area.value); msg.textContent = tr('Save imported. Welcome back, Your Majesty.'); audio.play('achievement'); } catch (e) { msg.textContent = e.message; audio.play('deny'); }
    });
    const saveBtn = h('button', { class: 'btn', type: 'button' }, tr('Save now'));
    saveBtn.addEventListener('click', () => { g.save(); msg.textContent = tr('Saved.'); });
    const resetBtn = h('button', { class: 'btn btn-danger', type: 'button' }, tr('Hard reset'));

    const played = (g.now() - s.startedAt) / 1000;
    const statRow = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('span', null, v));
    const optionsPanel = h('div', { class: 'settings' },
      h('h3', { class: 'sub-title' }, tr('Options')),
      toggle('sound', tr('Sound effects')),
      toggle('music', tr('Music')),
      toggle('reducedMotion', tr('Reduced motion')),
      h('label', { class: 'field' }, h('span', null, tr('Numbers')), fmtSel),
      h('label', { class: 'field' }, h('span', null, tr('Language')), langSel),
      h('h3', { class: 'sub-title' }, tr('Save')),
      h('p', { class: 'muted' }, tr('Progress autosaves in this browser. Link an account (Account tab) to keep it in the cloud on any device, or export a backup.')),
      area, h('div', { class: 'btn-row' }, expBtn, impBtn, saveBtn), msg,
      h('h3', { class: 'sub-title' }, tr('Chronicle')),
      h('div', { class: 'kvs' },
        statRow(tr('Eyes collected (all time)'), fmt(s.lifetime.eyes)),
        statRow(tr('Mana gathered'), fmt(s.lifetime.mana)),
        statRow(tr('King clicks'), fmt(s.lifetime.clicks)),
        statRow(tr('Omens caught'), fmt(s.lifetime.omens)),
        statRow(tr('Eclipses'), fmt(s.prestiges)),
        statRow(tr('Buildings owned'), fmt(E.totalBuildings(s))),
        statRow(tr('Reign length'), fmtTime(played))),
      h('h3', { class: 'sub-title danger' }, tr('Danger zone')),
      h('div', { class: 'btn-row' }, resetBtn),
      h('p', { class: 'muted small' }, tt`Krowlect v${CHANGELOG[0].version} · save v${this.cfg.GAME.saveVersion}`));
    // ---- Account tab: the raven icon lives here, as a clear "link your progress" entry
    const user = g.cloud && g.cloud.user;
    const accountPanel = h('div', { class: 'settings', hidden: true },
      h('div', { class: 'acc-hero' },
        this.sprite('king', 'acc-hero-icon'),
        h('div', { class: 'acc-hero-text' },
          h('b', null, user ? tt`Linked to ${user}` : tr('Link your progress to an account')),
          h('p', { class: 'muted' }, user
            ? tr('Your kingdom is saved in the cloud. Log in with the same name on any device to continue.')
            : tr('Create an account or log in to save your kingdom in the cloud, keep it on any device and join the Feather Ranking.')))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-gold', type: 'button', onclick: () => { m.close(); this.accountModal(); } }, user ? tr('Manage account') : tr('Log in / Create account'))),
      user ? null : h('p', { class: 'muted small' }, tr('Without an account, your progress lives only in this browser and can be lost if its data is cleared.')));

    // ---- News tab: update log
    const seen = lsGet(NEWS_KEY, '');
    const newsPanel = h('div', { class: 'settings news', hidden: true },
      CHANGELOG.map((e, i) => h('section', { class: 'news-entry' },
        h('h3', { class: 'sub-title' }, `v${e.version}`, h('span', { class: 'news-date' }, ` · ${e.date}`), i === 0 && seen !== e.version ? h('span', { class: 'news-new' }, tr('NEW')) : null),
        h('p', { class: 'news-title' }, e.title),
        h('ul', { class: 'news-list' }, e.items.map((it) => h('li', null, it))))));

    const panels = { options: optionsPanel, account: accountPanel, news: newsPanel };
    const tabBtns = {};
    const show = (id) => {
      for (const k in panels) { panels[k].hidden = k !== id; tabBtns[k].setAttribute('aria-selected', String(k === id)); tabBtns[k].classList.toggle('on', k === id); }
      if (id === 'news') { lsSet(NEWS_KEY, CHANGELOG[0].version); this.updateNewsDot(); }
    };
    const mkTab = (id, label, icon) => {
      const b = h('button', { class: 'seg-btn', type: 'button', role: 'tab', onclick: () => show(id) }, icon ? this.sprite(icon, 'seg-icon') : null, h('span', null, label));
      tabBtns[id] = b; return b;
    };
    const tabs = h('div', { class: 'seg', role: 'tablist' }, mkTab('options', tr('Options')), mkTab('account', tr('Account'), 'king'), mkTab('news', tr('News')));
    const body = h('div', null, tabs, optionsPanel, accountPanel, newsPanel);
    const m = this.modal({ title: tr('Settings'), body, cls: 'modal-settings', actions: [
      { label: (g.cloud && g.cloud.user) || !cloudEnabled ? tr('Save progress') : tr('Save to account'), kind: 'primary', onClick: (close) => {
        if (!cloudEnabled) { g.save(); audio.play('buy'); this.toast({ icon: 'king', title: tr('Progress saved'), text: tr('Saved in this browser.') }); return true; }
        if (g.cloud && g.cloud.user) {
          g.save(); try { g.cloud.push(); } catch {}
          audio.play('buy'); this.toast({ icon: 'king', title: tr('Progress saved'), text: tr('Your kingdom is safe in the cloud.') });
          return true;
        }
        close(); this.accountModal(); return true;
      } },
      { label: tr('Close') }] });
    show(startTab);
    resetBtn.addEventListener('click', () => {
      m.close();
      this.modal({ title: tr('Erase everything?'), icon: 'lock', body: h('p', null, tr('This wipes your kingdom, feathers, feats and skins. There is no undo. Export a save first if unsure.')),
        actions: [{ label: tr('Keep my kingdom') }, { label: tr('Erase forever'), kind: 'danger', onClick: () => { g.hardReset(); this.toast({ icon: 'king', title: tr('A new reign begins'), text: tr('All progress erased.') }); } }] });
    });
  }

  // ------------------------------------------------------------------ tooltips
  bindTooltips() {
    const tipEl = this.tip.el;
    // desktop hover
    document.addEventListener('mouseover', (e) => {
      if (coarse.matches) return;
      const t = e.target.closest?.('[data-tip]');
      if (t) this.showTip(t.dataset.tip, t);
      else if (this.tip.key && !this.tip.pinned) this.hideTip();
    });
    document.addEventListener('focusin', (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (t && !coarse.matches && e.target.matches(':focus-visible')) this.showTip(t.dataset.tip, t);
    });
    document.addEventListener('focusout', () => { if (!this.tip.pinned) this.hideTip(); });
    // info buttons (mobile) — toggle pinned tooltip
    document.addEventListener('click', (e) => {
      const b = e.target.closest?.('[data-tip-btn]');
      if (b && (b.classList.contains('item-info') || coarse.matches)) {
        e.preventDefault();
        if (this.tip.key === b.dataset.tipBtn && this.tip.pinned) this.hideTip();
        else { this.showTip(b.dataset.tipBtn, b.closest('.item') || b); this.tip.pinned = true; }
        return;
      }
      if (this.tip.pinned && !tipEl.contains(e.target)) this.hideTip();
    }, true);
    // long press
    let timer = 0, startXY = null;
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const t = e.target.closest?.('[data-tip]');
      if (!t) return;
      startXY = [e.clientX, e.clientY];
      clearTimeout(timer);
      timer = setTimeout(() => { this.longPressed = performance.now(); this.showTip(t.dataset.tip, t.closest('.item') || t); this.tip.pinned = true; navigator.vibrate?.(10); }, 450);
    });
    const cancel = (e) => { if (e && e.type === 'pointermove' && startXY && Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) < 10) return; clearTimeout(timer); };
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('pointermove', cancel);
    document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-tip]') && e.pointerType !== 'mouse' && coarse.matches) e.preventDefault(); });
    window.addEventListener('scroll', () => { if (this.tip.key) this.placeTip(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.tip.key) this.hideTip(); });
  }

  consumeLongPress() {
    if (this.longPressed && performance.now() - this.longPressed < 800) { this.longPressed = 0; return true; }
    return false;
  }

  showTip(key, anchor) {
    this.tip.key = key; this.tip.anchor = anchor; this.tip.pinned = false; this.tip.timer = 0;
    this.tip.el.hidden = false;
    this.fillTip();
  }
  hideTip() { this.tip.key = null; this.tip.pinned = false; this.tip.el.hidden = true; }

  fillTip() {
    const key = this.tip.key; if (!key) return;
    if (!this.tip.anchor || !this.tip.anchor.isConnected || this.tip.anchor.offsetParent === null) { this.hideTip(); return; }
    const [kind, id] = key.split(/:(.+)/);
    const c = this.tipContent(kind, id);
    if (!c) { this.hideTip(); return; }
    const html = c;
    if (this.tip.el._html !== html) { this.tip.el._html = html; this.tip.el.innerHTML = html; }
    this.placeTip();
  }

  placeTip() {
    const el = this.tip.el, a = this.tip.anchor; if (!a) return;
    const r = a.getBoundingClientRect(), tw = el.offsetWidth, th = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    let x, y;
    if (!mqMobile.matches && r.left - tw - 12 > m && r.left > vw / 2) { x = r.left - tw - 12; y = r.top; }
    else if (!mqMobile.matches && r.right + tw + 12 < vw - m) { x = r.right + 12; y = r.top; }
    else { x = r.left + r.width / 2 - tw / 2; y = r.top - th - 10; if (y < 60) y = r.bottom + 10; }
    x = Math.max(m, Math.min(vw - tw - m, x)); y = Math.max(m, Math.min(vh - th - m, y));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  costHTML(cost) {
    const s = this.game.state.resources;
    return Object.entries(cost).map(([r, v]) => `<span class="tcost ${s[r] >= v ? '' : 'short'}"><img class="px-img" alt="" src="${this.src(this.resIcon(r))}">${fmtCost(v)}</span>`).join(' ');
  }

  tipContent(kind, id) {
    const g = this.game, s = g.state, I = g.I;
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const head = (icon, name, right = '') => `<div class="tip-head"><img class="px-img tip-icon" alt="" src="${this.src(icon)}"><b>${esc(name)}</b><span class="tip-right">${right}</span></div>`;
    if (kind === 'building') {
      const b = I.buildings[id]; if (!b) return null;
      if (!E.buildingUnlocked(b, s)) return `${head('lock', '???')}<p>${tt`A mysterious structure. Collect ${fmt(b.unlockAt?.eyes || 0)} eyes to reveal it.`}</p>`;
      const owned = s.buildings[id] || 0;
      const unit = E.unitProduction(b, s, g.mods);
      const per = g.prod.perBuilding[id] || {};
      const lines = Object.keys(b.produces || {}).map((r) => {
        const share = (g.prod.total[r] || 0) > 0 ? (per[r] || 0) / g.prod.total[r] : 0;
        return `<li>${tr('Each makes')} <b>${fmtRate(unit[r])}</b> ${esc(this.resName(r).toLowerCase())}/s</li>` +
          (owned ? `<li>${tt`${owned} make`} <b>${fmtRate(per[r] || 0)}</b>/s · <b>${fmtPct(share)}</b> ${tr('of total')}</li>` : '');
      }).join('');
      const q = this.qty === 'max' ? Math.max(1, E.maxAffordable(b, owned, s.resources, this.cfg, g.mods)) : +this.qty;
      return `${head(b.icon || b.id, b.name, tt`owned ${owned}`)}<p>${esc(b.desc)}</p><ul>${lines}</ul>` +
        `<div class="tip-cost">${tr('Next')} ${q > 1 ? '×' + q : ''}: ${this.costHTML(E.buildingCost(b, owned, q, this.cfg, g.mods))}</div>` +
        (b.flavor ? `<p class="tip-flavor">${esc(b.flavor)}</p>` : '');
    }
    if (kind === 'upgrade') {
      const u = I.upgrades[id]; if (!u) return null;
      const owned = s.upgrades.includes(id);
      return `${head(u.icon, u.name, owned ? tr('owned') : tr('upgrade'))}<p>${esc(u.desc)}</p>` +
        (owned ? '' : `<div class="tip-cost">${tr('Cost')}: ${this.costHTML(u.cost)}</div>`) + (u.flavor ? `<p class="tip-flavor">${esc(u.flavor)}</p>` : '');
    }
    if (kind === 'spell') {
      const sp = I.spells[id]; if (!sp) return null;
      const st = g.spellState(id);
      if (!st.unlocked) return `${head('lock', '???')}<p>${tr('A spell not yet learned. It ')}${esc(this.reqText(sp.requires))}.</p>`;
      return `${head(sp.icon, sp.name, tr('spell'))}<p>${esc(sp.desc)}</p><ul>` +
        (sp.duration ? `<li>${tr('Lasts')} <b>${fmtTime(sp.duration)}</b></li>` : '') +
        `<li>${tr('Recharge')} <b>${fmtTime(Math.max(sp.duration || 0, st.cooldownTotal))}</b></li></ul>` +
        `<div class="tip-cost">${tr('Cost')}: ${this.costHTML(sp.cost)}</div>` + (sp.flavor ? `<p class="tip-flavor">${esc(sp.flavor)}</p>` : '');
    }
    if (kind === 'market') {
      const m = I.market[id]; if (!m) return null;
      const st = g.marketState(id);
      const right = m.kind === 'skin' ? (st.owned ? tr('owned') : tr('skin')) : (st.times ? tr('bought ×') + st.times : tr('consumable'));
      return `${head(m.icon, m.name, right)}<p>${esc(m.desc)}</p>` +
        (m.duration ? `<ul><li>${tr('Lasts')} <b>${fmtTime(m.duration)}</b></li></ul>` : '') +
        (st.owned ? '' : `<div class="tip-cost">${tr('Cost')}: ${this.costHTML(st.cost)}</div>`) + (m.flavor ? `<p class="tip-flavor">${esc(m.flavor)}</p>` : '');
    }
    if (kind === 'ach') {
      const a = I.achievements[id]; if (!a) return null;
      const got = s.achievements.includes(id);
      const reward = a.reward?.globalMultPct ? tt`+${a.reward.globalMultPct}% production` : '';
      return `${head(got ? a.icon || 'ach' : 'lock', got ? a.name : a.hidden ? '???' : a.name, got ? tr('earned') : tr('locked'))}` +
        `<p>${esc(a.hidden && !got ? tr('A secret feat.') : a.desc)}</p>${reward ? `<div class="tip-cost">${tr('Reward')}: <b>${reward}</b></div>` : ''}`;
    }
    return null;
  }
}
