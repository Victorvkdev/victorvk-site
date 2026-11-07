// KROWLECT bootstrap + game engine (actions, tick loop, omens, autosave).
import * as E from './economy.js';
import * as S from './state.js';
import * as audio from './audio.js';
import { setNumberFormat } from './format.js';
import * as cloud from './cloud.js';
import * as Sparks from './sparks.js';
import { t as tr, localizeData, localizePage } from './i18n.js';

class Game {
  constructor(config, art) {
    this.config = config;
    this.art = art;
    this.I = E.index(config);
    this.timeOffset = 0; // debug time-warp (ms)
    this.listeners = {};
    const { state, fresh, elapsedSec } = S.load(config, this.now());
    this.state = state;
    this.fresh = fresh;
    this.seasonReport = null;
    if (!fresh) { const r = S.applySeason(state, config, this.now()); if (r.weeks > 0 && (r.lost >= 1 || r.wiped?.any)) this.seasonReport = r; }
    this.nextSeasonAt = S.seasonEnd(config, this.now());
    this.omen = { nextAt: 0, active: null };
    this.recompute();
    this.scheduleOmen(true);
    this.offlineReport = null;
    if (!fresh && elapsedSec > 30) this.applyOffline(elapsedSec);
    setNumberFormat(state.settings.numberFormat);
    this.applyAudioSettings();
    this.saveTimer = 0;
    this.achTimer = 0;
    this.suspended = false;
    this.storageOk = true;
  }

  now() { return Date.now() + this.timeOffset; }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { for (const fn of this.listeners[ev] || []) { try { fn(data); } catch (e) { console.error(e); } } }

  recompute() {
    const now = this.now();
    this.mods = E.computeMods(this.state, this.config, now);
    this.prod = E.production(this.state, this.config, this.mods);
    this.eps = this.prod.total.eyes || 0;
    this.mps = this.prod.total.mana || 0;
    this.clickVal = E.clickValue(this.state, this.config, this.mods, this.eps);
  }

  // ------------------------------------------------------------- loop
  tick(dtSec) {
    if (!(dtSec > 0)) return;
    // Big gaps (background tab throttling) are simulated in chunks so buffs expire on time.
    if (dtSec > 2) {
      const maxSec = ((this.config.GAME.offline?.maxHours ?? 8) + (this.mods.offlineHours || 0)) * 3600;
      const total = Math.min(dtSec, maxSec);
      const chunk = Math.max(1, total / 600);
      const saved = this.timeOffset;
      let done = 0;
      while (done < total) {
        const d = Math.min(chunk, total - done);
        done += d;
        this.timeOffset = saved - (total - done) * 1000; // replay the gap on a virtual clock
        this.step(d);
      }
      this.timeOffset = saved;
      this.recompute();
      return;
    }
    this.step(dtSec);
  }

  step(dt) {
    const s = this.state, now = this.now();
    if (now >= this.nextSeasonAt) {
      const r = S.applySeason(s, this.config, now);
      this.nextSeasonAt = S.seasonEnd(this.config, now);
      if (r.weeks > 0) { this.recompute(); this.emit('season', r); }
    }
    // expire buffs & spells
    if (s.buffs.length) {
      const before = s.buffs.length;
      s.buffs = s.buffs.filter((b) => b.until > now);
      if (s.buffs.length !== before) this.emit('buffs');
    }
    for (const id in s.spells) {
      const sp = s.spells[id];
      if (sp.activeUntil && sp.activeUntil <= now && !sp._ended) { sp._ended = true; this.emit('spellEnd', id); }
    }
    this.recompute();
    for (const r in this.prod.total) S.gain(s, r, this.prod.total[r] * dt);
    // achievements (throttled)
    this.achTimer += dt;
    if (this.achTimer >= 0.25) { this.achTimer = 0; this.checkAchievements(); }
    // omen
    this.updateOmen(now);
    // autosave
    this.saveTimer += dt;
    if (this.saveTimer >= (this.config.GAME.autosaveSeconds || 10)) { this.saveTimer = 0; this.save(); }
  }

  checkAchievements() {
    const ids = E.newAchievements(this.state, this.config);
    if (!ids.length) return;
    for (const id of ids) this.state.achievements.push(id);
    // unlocking may chain ("achievements" stat)
    const more = E.newAchievements(this.state, this.config);
    for (const id of more) this.state.achievements.push(id);
    this.recompute();
    for (const id of [...ids, ...more]) this.emit('achievement', this.I.achievements[id]);
  }

  save() {
    if (this.suspended) return; // another tab owns the save
    this.storageOk = S.save(this.state, this.now());
    this.emit('saved');
  }

  applyOffline(elapsedSec) {
    const r = E.offlineGains(this.state, this.config, this.mods, elapsedSec);
    for (const k in r.gains) S.gain(this.state, k, r.gains[k]);
    if (Object.values(r.gains).some((v) => v > 0)) this.offlineReport = { ...r, elapsed: elapsedSec };
    this.recompute();
  }

  // ------------------------------------------------------------- omen
  scheduleOmen(first = false) {
    const { min, max } = E.omenInterval(this.config, this.mods);
    const sec = min + Math.random() * Math.max(0, max - min);
    this.omen.nextAt = this.now() + (first ? sec * 0.5 : sec) * 1000;
  }

  updateOmen(now) {
    const o = this.omen;
    if (o.active) {
      if (now >= o.active.until) { o.active = null; this.emit('omenGone'); this.scheduleOmen(); }
    } else if (now >= o.nextAt && !document.hidden) {
      const life = (this.config.OMEN?.lifetime ?? 12) * 1000;
      o.active = { spawnedAt: now, until: now + life, seed: Math.random() };
      this.emit('omenSpawn', o.active);
    }
  }

  spawnOmen() { this.omen.nextAt = 0; this.omen.active = null; this.updateOmen(this.now()); }

  catchOmen() {
    if (!this.omen.active) return null;
    this.omen.active = null;
    const O = this.config.OMEN;
    const reward = E.weightedPick(O.rewards || [], Math.random());
    this.state.lifetime.omens++;
    const res = this.applyEffects(reward.effects || [], reward.duration, { id: 'omen:' + (O.rewards.indexOf(reward)), label: reward.text, icon: 'eye_gold', omen: true });
    // Refraction (Prism King): a second, different reward at reduced strength
    if (this.mods.omenSplit > 0 && (O.rewards || []).length > 1) {
      const pool = O.rewards.filter((r) => r !== reward);
      const r2 = E.weightedPick(pool, Math.random());
      this.applyEffects(r2.effects || [], r2.duration, { id: 'omen:' + O.rewards.indexOf(r2) + ':b', label: r2.text, icon: 'eye_gold', omen: true, scale: this.mods.omenSplit });
      res.split = r2;
    }
    this.scheduleOmen();
    this.recompute();
    this.checkAchievements();
    this.emit('omen', { reward, ...res });
    return reward;
  }

  /** Apply effects: instantProduction now, the rest as a timed buff if duration > 0. */
  /** Context for instantAmount: timed-boost cap + per-Eclipse yield decay. */
  instCtx(meta = {}) {
    return { cap: this.config.GAME.instantBuffCap, timedMult: E.timedEyesMult(this.state, this.config, this.now()), yield: meta.yield, k: meta.k, scale: meta.scale };
  }

  applyEffects(effects, duration, meta) {
    const instant = {};
    this.recompute();
    for (const e of effects) {
      if (e.type === 'instantProduction') {
        const amt = E.instantAmount(e, this.prod, this.instCtx(meta));
        const r = e.resource || 'eyes';
        S.gain(this.state, r, amt);
        instant[r] = (instant[r] || 0) + amt;
      }
    }
    const timed = effects.filter((e) => e.type !== 'instantProduction');
    let buff = null;
    if (timed.length && duration > 0) {
      let dur = duration * (meta.scale || 1);
      if (meta.omen) dur *= this.mods.omenDurationMult;
      const now = this.now();
      buff = this.state.buffs.find((b) => b.id === meta.id);
      if (buff) { buff.until = Math.max(buff.until, now) + dur * 1000; buff.dur = (buff.until - now) / 1000; }
      else { buff = { id: meta.id, effects: timed, until: now + dur * 1000, dur, label: meta.label, icon: meta.icon }; this.state.buffs.push(buff); }
      this.emit('buffs');
    }
    this.recompute();
    return { instant, buff };
  }

  // ------------------------------------------------------------- actions
  click() {
    const v = this.clickVal;
    S.gain(this.state, 'eyes', v);
    this.state.lifetime.clicks++;
    this.emit('click', v);
    return v;
  }

  buyBuilding(id, qty) {
    const b = this.I.buildings[id]; if (!b) return 0;
    const s = this.state, owned = s.buildings[id] || 0;
    if (!E.buildingUnlocked(b, s)) return 0;
    let n = qty === 'max' ? E.maxAffordable(b, owned, s.resources, this.config, this.mods) : qty;
    if (qty !== 'max') {
      const cost = E.buildingCost(b, owned, n, this.config, this.mods);
      if (!E.canAfford(s.resources, cost)) n = 0;
    }
    if (n < 1) { this.emit('deny'); return 0; }
    S.spend(s, E.buildingCost(b, owned, n, this.config, this.mods));
    s.buildings[id] = owned + n;
    this.recompute();
    this.checkAchievements();
    this.emit('buy', { kind: 'building', id, n });
    return n;
  }

  upgradeVisible(u) { return !this.state.upgrades.includes(u.id) && E.meetsRequires(u.requires, this.state, this.config); }

  buyUpgrade(id) {
    const u = this.I.upgrades[id], s = this.state;
    const ucost = u && E.upgradeCost(u, this.mods);
    if (!u || s.upgrades.includes(id) || !E.meetsRequires(u.requires, s, this.config) || !E.canAfford(s.resources, ucost)) { this.emit('deny'); return false; }
    S.spend(s, ucost);
    s.upgrades.push(id);
    this.recompute();
    this.checkAchievements();
    this.emit('buy', { kind: 'upgrade', id });
    return true;
  }

  // ------------------------------------------------------------- feather upgrades & Underworld
  featherUpState(u) {
    const s = this.state;
    return { owned: s.featherUps.includes(u.id), unlocked: E.meetsRequires(u.requires, s, this.config), affordable: E.canAfford(s.resources, u.cost) };
  }

  buyFeatherUpgrade(id) {
    const u = (this.config.FEATHER_UPGRADES || []).find((x) => x.id === id), s = this.state;
    if (!u || s.featherUps.includes(id) || !E.meetsRequires(u.requires, s, this.config) || !E.canAfford(s.resources, u.cost)) { this.emit('deny'); return false; }
    S.spend(s, u.cost);
    s.featherUps.push(id);
    this.recompute();
    this.emit('buy', { kind: 'featherUp', id });
    this.save();
    return true;
  }

  underUnlocked() { return this.state.featherUps.includes('obsidian_key'); }

  buyUnderBuilding(id, qty) {
    const U = this.config.UNDERWORLD, b = U && U.buildings.find((x) => x.id === id), s = this.state;
    if (!b || !this.underUnlocked()) return 0;
    const owned = s.under.buildings[id] || 0;
    let n = qty === 'max' ? E.underMax(b, owned, s.resources.feathers, this.config) : qty;
    if (n < 1 || !E.canAfford(s.resources, E.underCost(b, owned, n, this.config))) { this.emit('deny'); return 0; }
    S.spend(s, E.underCost(b, owned, n, this.config));
    s.under.buildings[id] = owned + n;
    this.recompute();
    this.emit('buy', { kind: 'underBuilding', id, n });
    return n;
  }

  /** Pacts: one active at a time, paid in Souls (swapping costs again). */
  buyPact(id) {
    const U = this.config.UNDERWORLD, p = U && U.pacts && U.pacts.find((x) => x.id === id), s = this.state;
    if (!p || !this.underUnlocked() || s.under.pact === id || !E.canAfford(s.resources, p.cost)) { this.emit('deny'); return false; }
    S.spend(s, p.cost);
    s.under.pact = id;
    this.recompute();
    this.emit('buy', { kind: 'pact', id });
    this.emit('pact', p);
    this.save();
    return true;
  }

  buyUnderUpgrade(id) {
    const U = this.config.UNDERWORLD, u = U && U.upgrades.find((x) => x.id === id), s = this.state;
    if (!u || !this.underUnlocked() || s.under.upgrades.includes(id) || !E.canAfford(s.resources, u.cost)) { this.emit('deny'); return false; }
    S.spend(s, u.cost);
    s.under.upgrades.push(id);
    this.recompute();
    this.emit('buy', { kind: 'underUpgrade', id });
    return true;
  }

  spellState(id) {
    const sp = this.I.spells[id], st = this.state.spells[id] || { activeUntil: 0, cooldownUntil: 0 };
    const now = this.now();
    return {
      unlocked: E.meetsRequires(sp.requires, this.state, this.config),
      active: st.activeUntil > now, activeLeft: Math.max(0, (st.activeUntil - now) / 1000),
      cooling: st.cooldownUntil > now, coolLeft: Math.max(0, (st.cooldownUntil - now) / 1000),
      cooldownTotal: E.spellCooldown(sp, this.mods),
      affordable: E.canAfford(this.state.resources, sp.cost),
    };
  }

  castSpell(id) {
    const sp = this.I.spells[id]; if (!sp) return false;
    const st = this.spellState(id);
    if (!st.unlocked || st.cooling || st.active || !st.affordable) { this.emit('deny'); return false; }
    const s = this.state, now = this.now();
    S.spend(s, sp.cost);
    const dur = sp.duration || 0;
    const cd = Math.max(dur, E.spellCooldown(sp, this.mods));
    s.spells[id] = { activeUntil: dur > 0 ? now + dur * 1000 : 0, cooldownUntil: now + cd * 1000 };
    s.lifetime.spells = (s.lifetime.spells || 0) + 1;
    // instant parts of the spell
    const instant = {};
    this.recompute();
    if ((sp.effects || []).some((e) => e.type === 'spawnOmen')) { this.omen.nextAt = 0; this.omen.active = null; this.updateOmen(this.now()); }
    for (const e of sp.effects || []) if (e.type === 'instantProduction') {
      const amt = E.instantAmount(e, this.prod, this.instCtx()); S.gain(s, e.resource || 'eyes', amt); instant[e.resource || 'eyes'] = amt;
    }
    this.recompute();
    this.checkAchievements();
    this.emit('spell', { spell: sp, instant });
    return true;
  }

  marketState(id) {
    const m = this.I.market[id], s = this.state;
    const times = s.market[id] || 0;
    const cost = E.marketCost(m, times, this.mods.inflation);
    return {
      unlocked: E.meetsRequires(m.requires, s, this.config),
      owned: m.kind === 'skin' && times > 0,
      equipped: m.kind === 'skin' && s.equippedSkin === m.skin,
      times, cost, affordable: E.canAfford(s.resources, cost),
    };
  }

  buyMarket(id) {
    const m = this.I.market[id]; if (!m) return false;
    const st = this.marketState(id), s = this.state;
    if (!st.unlocked || st.owned || !st.affordable) { this.emit('deny'); return false; }
    S.spend(s, st.cost);
    s.market[id] = st.times + 1;
    let res = {};
    if (m.kind === 'skin') { this.equipSkin(m.skin); }
    else res = this.applyEffects(m.effects || [], m.duration, { id: 'market:' + id, label: m.name, icon: m.icon, yield: m.yield, k: st.times + 1 });
    this.checkAchievements();
    this.emit('buy', { kind: 'market', id, ...res });
    return true;
  }

  async buySpark(id) {
    const it = (this.config.SPARK_SHOP || []).find((x) => x.id === id);
    if (!it || this._sparkBusy) return false;
    const s = this.state;
    const isSkin = it.kind === 'skin';
    if (isSkin && (s.market[id] || 0) > 0) { this.equipSkin(it.skin); return true; }
    // balance: one timed spark boost at a time, so multipliers never stack
    const timed = !isSkin && it.duration > 0;
    if (timed) {
      const now = this.now();
      const active = s.buffs.find((b) => b.id.startsWith('spark:') && b.until > now);
      if (active) { this.emit('deny'); this.emit('spark-fail', 'active'); return false; }
    }
    this._sparkBusy = true;
    try {
      const r = await Sparks.pay(it);
      if (!r.ok) { this.emit('deny'); this.emit('spark-fail', r.reason); return false; }
      let res = {};
      if (isSkin) { s.market[id] = 1; this.equipSkin(it.skin); }
      else res = this.applyEffects(it.effects || [], it.duration, { id: 'spark:' + id, label: it.name, icon: it.icon });
      this.checkAchievements();
      this.emit('buy', { kind: 'spark', id, ...res });
      this.save();
      this.cloud?.push();
      return true;
    } finally { this._sparkBusy = false; }
  }

  equipSkin(skin) {
    if (!S.ownedSkins(this.state, this.config).includes(skin)) return;
    this.state.equippedSkin = skin; this.state.skin = skin;
    this.applyMusicTheme();
    this.recompute();
    this.emit('skin', skin);
  }

  transmute() {
    const t = E.transmuteInfo(this.state, this.config, this.mods);
    if (t.gain <= 0 || t.spend < 1) { this.emit('deny'); return null; }
    this.state.resources.eyes -= t.spend;
    S.gain(this.state, 'mana', t.gain);
    this.checkAchievements();
    this.emit('transmute', t);
    return t;
  }

  prestigeGain() { return E.prestigeGain(this.state, this.config); }

  prestige() {
    const g = this.prestigeGain();
    if (g < 1) { this.emit('deny'); return 0; }
    this.state = S.prestigeReset(this.state, this.config, g, this.now(), this.mods.keepPct);
    this.omen.active = null;
    this.recompute();
    this.checkAchievements();
    this.scheduleOmen();
    this.save();
    this.emit('prestige', g);
    this.cloud?.push();
    this.emit('reload');
    return g;
  }

  /** Which soundtrack plays: the chosen OST if you own it, otherwise the one of the king you wear. */
  musicTheme() {
    const s = this.state, owned = S.ownedSkins(s, this.config), o = s.settings.ost;
    if (o === 'default') return 'default';
    if (o && o !== 'auto' && owned.includes(o)) return o;
    return owned.includes(s.equippedSkin) ? s.equippedSkin : 'default';
  }
  applyMusicTheme() { audio.setMusicTheme(this.musicTheme()); }
  applyAudioSettings() {
    const st = this.state.settings;
    audio.setSfxVolume((st.sfxVolume ?? 100) / 100);
    audio.setMusicVolume((st.musicVolume ?? 100) / 100);
    this.applyMusicTheme();
    audio.setSoundEnabled(st.sound);
    audio.setMusicEnabled(st.music);
  }

  setSetting(k, v) {
    this.state.settings[k] = v;
    if (k === 'sound') audio.setSoundEnabled(v);
    if (k === 'music') audio.setMusicEnabled(v);
    if (k === 'numberFormat') setNumberFormat(v);
    if (k === 'ost') this.applyMusicTheme();
    if (k === 'musicVolume') audio.setMusicVolume(v / 100);
    if (k === 'sfxVolume') audio.setSfxVolume(v / 100);
    this.save();
    this.emit('settings', { k, v });
  }

  exportSave() { this.save(); return S.exportSave(this.state); }

  importSave(str) {
    this.loadState(S.importSave(str, this.config));
    this.forcePush = true; // player chose this save: overwrite the cloud copy too
  }

  /** Replace the current game with a save (already normalized or raw). */
  loadState(raw) {
    const st = S.normalize(raw, this.config);
    this.state = st;
    setNumberFormat(st.settings.numberFormat);
    this.applyAudioSettings();
    this.omen.active = null; this.scheduleOmen();
    this.recompute();
    this.save();
    this.emit('reload');
  }

  /** Wipe this device's kingdom (keeps settings) without touching the cloud copy. Used on logout. */
  resetLocal() {
    S.clearSave();
    const settings = { ...this.state.settings };
    this.state = S.defaultState(this.config);
    this.state.settings = settings;
    this.omen.active = null; this.scheduleOmen(true);
    this.recompute();
    this.save();
    this.forcePush = false;
    this.emit('reload');
  }

  /** Player-requested reset: also overwrite the cloud copy. */
  hardReset() {
    this.resetLocal();
    this.forcePush = true;
  }

  /** Debug: jump time forward, simulating production and expiring timers. */
  warp(seconds) {
    const chunk = Math.max(0.1, seconds / 600);
    let left = seconds;
    while (left > 0) { const d = Math.min(chunk, left); this.timeOffset += d * 1000; this.step(d); left -= d; }
    this.recompute();
  }
}

// ---------------------------------------------------------------- cloud save
// Logged-in players keep their kingdom in the cloud: it loads on any device and feeds the ranking.
const OWNER_KEY = 'krowlect.owner'; // who the kingdom on this device belongs to
const ownerGet = () => { try { return localStorage.getItem(OWNER_KEY) || ''; } catch { return ''; } };
const ownerSet = (n) => { try { if (n) localStorage.setItem(OWNER_KEY, n); else localStorage.removeItem(OWNER_KEY); } catch { /* ignore */ } };

class CloudSync {
  constructor(game) {
    this.game = game;
    this.synced = false;   // only push after we know what the cloud has
    this.busy = false;
    this.lastSync = 0;
    this.error = '';
  }
  get user() { return cloud.user(); }

  /** Compare cloud vs this device and keep whichever kingdom went further. */
  async start(fresh = false) {
    this.synced = false;
    if (!cloud.user() || this.game.suspended) { this.game.emit('cloud'); return; }
    try {
      const { save } = await cloud.pull();
      // A newer game version wrote this save: never overwrite it with an older client that would drop its new fields.
      if (save && (save.saveVersion || 1) > (this.game.config.GAME.saveVersion || 1)) {
        this.error = tr('A newer version of Krowlect saved this kingdom. Reload the page to update.');
        this.game.emit('cloud'); return;
      }
      const localEyes = this.game.state.lifetime.eyes || 0;
      const cloudEyes = (save && save.lifetime && save.lifetime.eyes) || 0;
      this.synced = true;
      // fresh login: the account's cloud kingdom always wins over whatever is on this device
      if (save && (fresh || cloudEyes > localEyes)) {
        this.game.loadState(save);
        this.lastSync = Date.now();
        this.error = '';
        this.game.emit('cloudLoaded');
      } else {
        await this.push({ force: true });
      }
    } catch (e) {
      this.error = e.message;
      console.warn('[krowlect cloud]', e);
    }
    this.game.emit('cloud');
  }

  async push({ force = false, keepalive = false } = {}) {
    if (!cloud.user() || !this.synced || this.game.suspended) return;
    if (this.busy && !keepalive) return; // a leaving page still gets its last save out
    this.busy = true;
    const f = force || this.game.forcePush;
    try {
      this.game.save();
      await cloud.push(this.game.state, { force: f, keepalive });
      this.game.forcePush = false;
      this.lastSync = Date.now();
      this.error = '';
      this.lastNotified = '';
    } catch (e) {
      this.error = e.message;
      if (e.status === 409) { this.busy = false; await this.start(); return; } // another device is ahead
      // Tell the player (once per distinct problem) instead of failing silently, so a stuck save is never invisible.
      if (e.status !== 0 && e.message !== this.lastNotified) { this.lastNotified = e.message; this.game.emit('cloudError', e.message); }
    } finally {
      this.busy = false;
    }
    this.game.emit('cloud');
  }

  async login(name, pass, isNew) {
    const prev = ownerGet();
    const same = !!prev && prev.toLowerCase() === name.toLowerCase();
    if (isNew) { await cloud.register(name, pass); if (prev && !same) this.game.resetLocal(); } else await cloud.login(name, pass);
    ownerSet(cloud.user());
    // Same account as this device's kingdom (e.g. session expired): keep whichever went further.
    // Different account or anonymous play: the account's cloud kingdom wins.
    await this.start(!isNew && !same);
  }

  /** Save, log out and wipe the local kingdom (so it cannot be carried into another account). Returns false if the save failed. */
  async logout() {
    for (let i = 0; this.busy && i < 50; i++) await new Promise((r) => setTimeout(r, 100));
    await this.push({ force: this.game.forcePush });
    if (this.user && (!this.synced || this.error)) return false; // never wipe progress that is not safely in the cloud
    await cloud.logout();
    ownerSet(null);
    this.synced = false;
    this.game.resetLocal();
    this.game.emit('cloud');
    return true;
  }
}

async function boot() {
  localizePage();
  let config, art;
  try {
    [config, art] = await Promise.all([import('./data/config.js'), import('./art/sprites.js')]);
  } catch (e) {
    console.error(e);
    const el = document.getElementById('boot-msg');
    if (el) el.textContent = tr('The ravens could not find the castle (failed to load game data). Please refresh.');
    return;
  }
  localizeData(config.RESOURCES, config.BUILDINGS, config.UPGRADES, config.SPELLS, config.MARKET, config.SPARK_SHOP, config.ACHIEVEMENTS, config.PRESTIGE, config.OMEN, config.CHATTER);
  const { UI } = await import('./ui.js');
  const game = new Game(config, art);
  game.cloud = new CloudSync(game);
  const ui = new UI(game);
  ui.mount();
  if (cloud.user() && !ownerGet()) ownerSet(cloud.user());
  game.cloud.start();
  // keep the cloud copy fresh; if the first sync failed (offline), retry instead of staying local-only forever
  setInterval(() => { const c = game.cloud; if (!c.user) return; if (c.synced) c.push(); else c.start(); }, 60_000);

  // Only one tab may own the save, otherwise two open tabs overwrite each other's progress.
  try {
    const tabId = Math.random().toString(36).slice(2);
    let claimedAt = Date.now();
    const bc = new BroadcastChannel('krowlect-tabs');
    let pausedModal = null;
    const claim = () => { claimedAt = Date.now(); bc.postMessage({ t: 'claim', id: tabId, at: claimedAt }); };
    const resume = () => {
      claim();
      const raw = S.readRaw();
      if (raw && (raw.lifetime?.eyes || 0) > game.state.lifetime.eyes) game.loadState(raw);
      game.suspended = false; game.save(); game.cloud.start();
    };
    bc.onmessage = (e) => {
      const m = e.data || {};
      if (m.id === tabId) return;
      if (m.t === 'claim' && m.at >= claimedAt && !game.suspended) {
        game.save(); game.cloud.push({ keepalive: true });
        game.suspended = true;
        bc.postMessage({ t: 'handoff', id: tabId });
        pausedModal = ui.modal({ title: tr('Krowlect is open in another tab'), icon: 'king',
          body: h2(tr('Progress is saved only in one tab at a time, so this one is paused to protect your kingdom.')),
          actions: [{ label: tr('Play here instead'), kind: 'primary', onClick: () => { resume(); return false; } }] });
      } else if (m.t === 'handoff' && !game.suspended) {
        const raw = S.readRaw();
        if (raw && (raw.lifetime?.eyes || 0) > game.state.lifetime.eyes) game.loadState(raw);
      }
    };
    claim();
  } catch { /* BroadcastChannel unavailable: single-tab protection off */ }

  // Browser blocks saving (private mode, third-party iframe): tell the player once.
  let warnedStorage = false;
  game.on('saved', () => {
    if (game.storageOk || warnedStorage) return;
    warnedStorage = true;
    ui.toast({ icon: 'king', title: tr('Saving is blocked here'), text: tr('This browser will not keep your progress. Log in to save it in the cloud, or open Krowlect in its own tab.'), kind: 'gold' });
  });
  cloud.onAuthChange(() => game.emit('cloud'));

  // logic loop (fixed-ish rate, delta based)
  let last = performance.now();
  const rate = config.GAME.tickRate || 10;
  setInterval(() => {
    const t = performance.now();
    const dt = (t - last) / 1000; last = t;
    game.tick(dt);
  }, 1000 / rate);

  // save on hide/unload; "welcome back" summary after long hidden periods
  let hiddenAt = 0, eyesAtHide = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); eyesAtHide = game.state.lifetime.eyes; game.save(); game.cloud.push({ keepalive: true }); }
    else if (hiddenAt) {
      // make sure throttled time has been simulated before reporting
      const t = performance.now(); game.tick((t - last) / 1000); last = t;
      const away = (Date.now() - hiddenAt) / 1000;
      if (away > 60) ui.welcomeBack(away, game.state.lifetime.eyes - eyesAtHide);
      hiddenAt = 0;
    }
  });
  window.addEventListener('beforeunload', () => game.save());
  window.addEventListener('pagehide', () => { game.save(); game.cloud.push({ keepalive: true }); });

  // debug hooks
  const isDev = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (isDev) window.__krowlect = {
    game, ui,
    get state() { return game.state; },
    addResource(res, n) { S.gain(game.state, res, n); game.recompute(); },
    setBuilding(id, n) { game.state.buildings[id] = n; game.recompute(); },
    warp(seconds) { game.warp(seconds); },
    spawnOmen() { game.spawnOmen(); },
    catchOmen() { return game.catchOmen(); },
    save() { game.save(); },
    reset() { game.hardReset(); },
    economy: E,
  };
  // Local testing shortcut: open /?dev=underworld to get Eclipses + feathers and unlock the Underworld.
  if (new URLSearchParams(location.search).get('dev') === 'underworld') {
    const st = game.state;
    st.prestiges = Math.max(st.prestiges, 6);
    if ((st.resources.feathers || 0) < 1e6) S.gain(st, 'feathers', 1e6);
    game.recompute();
    game.buyFeatherUpgrade('obsidian_key');
    history.replaceState(null, '', location.pathname);
  }
}

const h2 = (t) => { const p = document.createElement('p'); p.textContent = t; return p; };
boot();
