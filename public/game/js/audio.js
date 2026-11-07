// Tiny WebAudio synth SFX. AudioContext is created lazily on the first user gesture.

let ctx = null, master = null, sfxGain = null, enabled = true, noiseBuf = null, sfxVol = 1, musicVol = 1;
let lastClick = 0;
let musicEnabled = true, musicGain = null, musicTimer = null, musicNext = 0, musicStep = 0, ducked = false;

export function setSoundEnabled(on) {
  enabled = !!on; if (sfxGain) sfxGain.gain.value = enabled ? sfxVol : 0; // sound effects only; music has its own switch
}
export function setSfxVolume(v) { sfxVol = Math.min(1, Math.max(0, v)); if (sfxGain && enabled) sfxGain.gain.value = sfxVol; }
export function setMusicVolume(v) {
  musicVol = Math.min(1, Math.max(0, v));
  if (musicGain && ctx && musicTimer) { musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(Math.max(0.0001, musicLevel()), ctx.currentTime, 0.08); }
}
const musicLevel = () => (ducked ? 0.08 : 0.7) * musicVol;
export function setMusicEnabled(on) { musicEnabled = !!on; if (musicEnabled) startMusic(); else stopMusic(); }
export function isSoundEnabled() { return enabled; }

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = enabled ? sfxVol : 0; sfxGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    musicGain = ctx.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(master);
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
    });
    startMusic();
  } catch { ctx = null; }
}

function tone(freq, { type = 'square', start = 0, dur = 0.08, vol = 0.2, slide = 0, attack = 0.004 } = {}) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ start = 0, dur = 0.4, vol = 0.25, from = 300, to = 3000 } = {}) {
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t); src.stop(t + dur + 0.05);
}


// ---- ambient music: procedural themes. The default is slow dark pads (Am - F - C - E) with a sparse music-box arpeggio.
// Each spark skin has its own variation of the same idea, with a personality of its own. Themes crossfade when the skin changes.
const mf = (m) => 440 * 2 ** ((m - 69) / 12);
let bus = null, busTheme = null, themeName = 'default';

function makeBus(name) {
  const T = THEMES[name], g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime); g.connect(musicGain);
  g._extra = [];
  if (T.echo) {
    const d = ctx.createDelay(2), fb = ctx.createGain(), wet = ctx.createGain();
    d.delayTime.value = T.echo.time; fb.gain.value = T.echo.fb; wet.gain.value = T.echo.wet;
    g.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(musicGain);
    g._extra.push(d, fb, wet);
  }
  g.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
  return g;
}
function ensureBus() {
  if (bus && busTheme === themeName) return;
  const old = bus;
  if (old) {
    old.gain.cancelScheduledValues(ctx.currentTime); old.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);
    setTimeout(() => { try { old.disconnect(); old._extra.forEach((n) => n.disconnect()); } catch { /* ignore */ } }, 7000);
  }
  bus = makeBus(themeName); busTheme = themeName; musicNext = 0;
}
export function setMusicTheme(name) { themeName = THEMES[name] ? name : 'default'; }

function pad(freq, t, dur, { type = 'triangle', vol = 0.05, attack = 1.2, lp = 900 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = lp;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}
function pluck(freq, t, { type = 'sine', vol = 0.05, dec = 1.6 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dec + 0.1);
}
// glassy FM bell
function bell(freq, t, vol = 0.03, dec = 2.2) {
  const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  c.frequency.value = freq; m.frequency.value = freq * 2.76; mg.gain.setValueAtTime(freq * 0.9, t); mg.gain.exponentialRampToValueAtTime(1, t + dec * 0.7);
  m.connect(mg).connect(c.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  c.connect(g).connect(bus); c.start(t); m.start(t); c.stop(t + dec + 0.1); m.stop(t + dec + 0.1);
}
function mNoise(t, dur, { f = 2000, q = 1, vol = 0.03, type = 'bandpass', attack = 0.01 } = {}) {
  if (!noiseBuf) return;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(bus); s.start(t); s.stop(t + dur + 0.05);
}
function thump(t, vol = 0.1, f0 = 95, f1 = 38) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.28);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g).connect(bus); o.start(t); o.stop(t + 0.5);
}
function glide(t, f0, f1, dur, vol = 0.03) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sine'; f.type = 'lowpass'; f.frequency.value = 700;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.1);
}
const rnd = (a, b) => a + Math.random() * (b - a);

const THEMES = {
  // the original: slow dark pads with a sparse music-box
  default: { len: 6, bar(t, step) {
    const ch = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]][step % 4];
    ch.forEach((m) => { pad(mf(m), t, 7.5, { vol: 0.045 }); pad(mf(m) * 1.003, t, 7.5, { type: 'sine', vol: 0.03 }); });
    pad(mf(ch[0] - 12), t, 7, { type: 'sine', vol: 0.07, attack: 0.6, lp: 400 });
    [0, 1, 2, 1, 2, 1].forEach((k, i) => { if (Math.random() < 0.7) pluck(mf(ch[k] + 12), t + i + 0.05); });
  } },
  // Ember King: warm D minor, saw pads, a forge heartbeat, crackling sparks and a quick flickering arpeggio
  ember: { len: 5, bar(t, step) {
    const ch = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [45, 48, 52]][step % 4];
    ch.forEach((m) => { pad(mf(m), t, 6.2, { type: 'sawtooth', vol: 0.02, lp: 620, attack: 0.9 }); pad(mf(m + 12) * 1.004, t, 6.2, { type: 'sine', vol: 0.022 }); });
    pad(mf(ch[0] - 24), t, 5.8, { type: 'sine', vol: 0.085, attack: 0.4, lp: 300 });
    thump(t, 0.1); thump(t + 2.5, 0.07);
    for (let i = 0; i < 9; i++) mNoise(t + rnd(0, 4.8), 0.035, { f: rnd(3000, 6500), q: 0.7, vol: rnd(0.012, 0.03), type: 'highpass', attack: 0.004 });
    [0, 1, 2, 1, 2, 1, 2, 1].forEach((k, i) => { if (Math.random() < 0.78) pluck(mf(ch[k] + 12), t + i * 0.625 + 0.04, { type: 'triangle', vol: 0.04, dec: 0.55 }); });
    if (Math.random() < 0.4) pluck(mf(ch[2] + 24), t + rnd(0.5, 4), { type: 'sine', vol: 0.03, dec: 0.4 });
  } },
  // Aurora King: airy, major sevenths, detuned wide pads, shimmering bells that echo like ribbons of light
  aurora: { len: 8, echo: { time: 0.55, fb: 0.5, wet: 0.45 }, bar(t, step) {
    const ch = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 66]][step % 4];
    ch.forEach((m, i) => {
      pad(mf(m) * 0.997, t, 11, { type: 'sine', vol: 0.028, attack: 3, lp: 1500 });
      pad(mf(m) * 1.004, t, 11, { type: 'triangle', vol: 0.016, attack: 3.2, lp: 1200 });
      if (i > 1) pad(mf(m + 24), t + 1, 9, { type: 'sine', vol: 0.011, attack: 3.5, lp: 3000 });
    });
    pad(mf(ch[0] - 12), t, 10, { type: 'sine', vol: 0.06, attack: 2, lp: 350 });
    for (let i = 0; i < 5; i++) if (Math.random() < 0.8) bell(mf(ch[(Math.random() * ch.length) | 0] + (Math.random() < 0.5 ? 24 : 31)), t + rnd(0.2, 7), 0.024, 3.2);
  } },
  // Void King: cold, diminished and sparse; a sub drone, a wind of static, slow whale-like glides and a distant heartbeat
  void: { len: 8, echo: { time: 0.7, fb: 0.4, wet: 0.35 }, bar(t, step) {
    const ch = [[45, 48, 51], [44, 47, 50], [41, 44, 47], [43, 46, 49]][step % 4];
    ch.forEach((m) => pad(mf(m), t, 11, { type: 'sine', vol: 0.036, attack: 3.5, lp: 420 }));
    pad(mf(ch[0] + 1), t + 1, 9, { type: 'sine', vol: 0.014, attack: 4, lp: 500 });
    pad(mf(33), t, 10, { type: 'sine', vol: 0.09, attack: 2, lp: 200 });
    mNoise(t, 9, { f: 380, q: 0.8, vol: 0.02, attack: 3.5 });
    if (Math.random() < 0.55) glide(t + rnd(0.5, 3.5), mf(ch[1] + 12), mf(ch[1] - 5), 4.5, 0.032);
    if (Math.random() < 0.5) bell(mf(ch[2] + 24) * 1.006, t + rnd(1, 6.5), 0.018, 3.8);
    [0, 4].forEach((o) => { thump(t + o, 0.07, 70, 34); thump(t + o + 0.36, 0.045, 70, 34); });
  } },
  // Prism King: bright and crystalline, quicker, with a sparkling bell arpeggio. The key follows the Spectrum phase (Ruby, Topaz, Sapphire).
  prism: { len: 4, echo: { time: 0.28, fb: 0.35, wet: 0.3 }, bar(t, step) {
    const tp = [0, 3, 7][Math.floor(((Date.now() / 1000) % 60) / 20)] || 0;
    const ch = [[60, 64, 67], [62, 66, 69], [64, 67, 71], [65, 69, 72]][step % 4].map((m) => m + tp);
    ch.forEach((m) => { pad(mf(m), t, 5, { type: 'triangle', vol: 0.028, attack: 0.5, lp: 1900 }); pad(mf(m + 12) * 1.003, t, 5, { type: 'sine', vol: 0.014, attack: 0.6 }); });
    pad(mf(ch[0] - 24), t, 4.6, { type: 'sine', vol: 0.065, attack: 0.3, lp: 300 });
    [0, 1, 2, 1, 2, 1, 2, 0].forEach((k, i) => { if (Math.random() < 0.9) bell(mf(ch[k] + (i % 2 ? 24 : 12)), t + i * 0.5 + 0.03, 0.022, 1.5); });
    for (let i = 0; i < 4; i++) mNoise(t + i, 0.04, { f: 8000, q: 0.6, vol: 0.012, type: 'highpass', attack: 0.004 });
    if (Math.random() < 0.55) pluck(mf(ch[2] + 36), t + rnd(0.5, 3.5), { type: 'triangle', vol: 0.02, dec: 0.3 });
  } },
};
function musicTick() {
  if (!ctx || !musicEnabled) return;
  ensureBus();
  if (musicNext < ctx.currentTime) musicNext = ctx.currentTime + 0.1;
  while (musicNext < ctx.currentTime + 2) { const T = THEMES[busTheme]; T.bar(musicNext, musicStep++); musicNext += T.len; }
}
export function startMusic() {
  if (!ctx || !musicEnabled || musicTimer) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(Math.max(0.0001, musicLevel()), ctx.currentTime + 2);
  musicNext = 0; musicTick(); musicTimer = setInterval(musicTick, 500);
}
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (musicGain && ctx) { musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); }
}
// lower the music while a cinematic plays
export function duck(on) {
  ducked = on;
  if (musicGain && ctx && musicTimer) { musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(Math.max(0.0001, musicLevel()), ctx.currentTime, 0.6); }
}

const SFX = {
  click() {
    const now = performance.now();
    if (now - lastClick < 35) return; // avoid buzzing on autoclickers
    lastClick = now;
    tone(520 + Math.random() * 120, { dur: 0.06, vol: 0.12, slide: 260 });
  },
  buy() { tone(988, { dur: 0.07, vol: 0.12 }); tone(1319, { start: 0.06, dur: 0.14, vol: 0.12 }); },
  deny() { tone(140, { type: 'sawtooth', dur: 0.12, vol: 0.08, slide: -40 }); },
  achievement() { [523, 659, 784, 1047].forEach((f, i) => tone(f, { start: i * 0.08, dur: 0.16, vol: 0.12 })); tone(1568, { type: 'triangle', start: 0.34, dur: 0.4, vol: 0.12 }); },
  omen() { [1319, 1760, 2093].forEach((f, i) => tone(f, { type: 'triangle', start: i * 0.07, dur: 0.5, vol: 0.12 })); },
  omenAppear() { tone(1760, { type: 'triangle', dur: 0.25, vol: 0.06 }); tone(2349, { type: 'triangle', start: 0.12, dur: 0.35, vol: 0.05 }); },
  spell() { noise({ dur: 0.5, vol: 0.3, from: 200, to: 4000 }); tone(220, { type: 'triangle', dur: 0.5, vol: 0.1, slide: 440 }); },
  transmute() { tone(392, { type: 'triangle', dur: 0.12, vol: 0.12, slide: 400 }); tone(784, { type: 'triangle', start: 0.08, dur: 0.18, vol: 0.1, slide: 600 }); },
  // magical aura swelling as the moon covers the sun
  aura() {
    noise({ dur: 2.4, vol: 0.18, from: 400, to: 5000 });
    tone(110, { type: 'sine', dur: 2.6, vol: 0.16, slide: 110, attack: 0.8 });
    [440, 554, 659, 880, 1109, 1319].forEach((f, i) => tone(f, { type: 'triangle', start: 0.2 + i * 0.28, dur: 1.2, vol: 0.07 }));
  },
  totality() { tone(55, { type: 'sine', dur: 1.2, vol: 0.3, slide: -20 }); [1568, 2093, 2637].forEach((f, i) => tone(f, { type: 'triangle', start: i * 0.06, dur: 1.4, vol: 0.06 })); },
  tally() { tone(880 + Math.random() * 40, { type: 'square', dur: 0.04, vol: 0.07 }); tone(1320, { type: 'square', start: 0.03, dur: 0.04, vol: 0.05 }); },
  crumble() { noise({ dur: 0.3, vol: 0.28, from: 1800, to: 120 }); tone(90, { type: 'square', dur: 0.2, vol: 0.12, slide: -50 }); },
  // entering the Underworld: the dark swallows the screen (sinking drone, rumble, ghostly low chord)
  underEnter() {
    noise({ dur: 1.3, vol: 0.3, from: 2600, to: 80 });
    tone(65, { type: 'sawtooth', dur: 1.5, vol: 0.14, slide: -30, attack: 0.4 });
    tone(98, { type: 'sine', dur: 1.4, vol: 0.12, slide: -40, attack: 0.3 });
    [311, 233, 175].forEach((f, i) => tone(f, { type: 'triangle', start: 0.1 + i * 0.18, dur: 0.9, vol: 0.07, slide: -f * 0.5 }));
    tone(48, { type: 'sine', start: 0.6, dur: 1.2, vol: 0.25, slide: -12 });
    noise({ start: 0.7, dur: 0.9, vol: 0.09, from: 200, to: 900 });
  },
  // back to the surface: a quick rising sweep
  underLeave() {
    noise({ dur: 0.7, vol: 0.2, from: 150, to: 3500 });
    tone(110, { type: 'triangle', dur: 0.7, vol: 0.12, slide: 330 });
    [392, 523, 659].forEach((f, i) => tone(f, { type: 'triangle', start: 0.2 + i * 0.12, dur: 0.5, vol: 0.08 }));
  },
  eclipse() { noise({ dur: 1.4, vol: 0.3, from: 3000, to: 120 }); [196, 147, 98].forEach((f, i) => tone(f, { type: 'sawtooth', start: i * 0.25, dur: 0.6, vol: 0.08 })); },
};

export function play(name) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  try { SFX[name] && SFX[name](); } catch { /* ignore */ }
}
