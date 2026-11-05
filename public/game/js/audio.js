// Tiny WebAudio synth SFX. AudioContext is created lazily on the first user gesture.

let ctx = null, master = null, enabled = true, noiseBuf = null;
let lastClick = 0;
let musicEnabled = true, musicGain = null, musicTimer = null, musicNext = 0, musicStep = 0, ducked = false;

export function setSoundEnabled(on) {
  enabled = !!on; if (master) master.gain.value = enabled ? 0.5 : 0;
  if (!enabled) stopMusic(); else startMusic();
}
export function setMusicEnabled(on) { musicEnabled = !!on; if (musicEnabled) startMusic(); else stopMusic(); }
export function isSoundEnabled() { return enabled; }

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.5 : 0;
    master.connect(ctx.destination);
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
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ start = 0, dur = 0.4, vol = 0.25, from = 300, to = 3000 } = {}) {
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}


// ---- ambient music: slow dark pads (Am - F - C - E) with a sparse music-box arpeggio
const mf = (m) => 440 * 2 ** ((m - 69) / 12);
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]];
const BAR = 6;
function musicVoice(freq, t, dur, { type = 'triangle', vol = 0.05, attack = 1.2, lp = 900 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = lp;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(musicGain);
  o.start(t); o.stop(t + dur + 0.05);
}
function pluck(freq, t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  o.connect(g).connect(musicGain); o.start(t); o.stop(t + 1.7);
}
function scheduleBar(t, step) {
  const ch = CHORDS[step % CHORDS.length];
  ch.forEach((m, i) => { musicVoice(mf(m), t, BAR + 1.5, { vol: 0.045 }); musicVoice(mf(m) * 1.003, t, BAR + 1.5, { type: 'sine', vol: 0.03 }); });
  musicVoice(mf(ch[0] - 12), t, BAR + 1, { type: 'sine', vol: 0.07, attack: 0.6, lp: 400 });
  const arp = [0, 1, 2, 1, 2, 1];
  arp.forEach((k, i) => { if (Math.random() < 0.7) pluck(mf(ch[k] + 12), t + i * (BAR / arp.length) + 0.05); });
}
function musicTick() {
  if (!ctx || !enabled || !musicEnabled) return;
  if (musicNext < ctx.currentTime) musicNext = ctx.currentTime + 0.1;
  while (musicNext < ctx.currentTime + 2) { scheduleBar(musicNext, musicStep++); musicNext += BAR; }
}
export function startMusic() {
  if (!ctx || !enabled || !musicEnabled || musicTimer) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(ducked ? 0.08 : 0.7, ctx.currentTime + 2);
  musicNext = 0; musicTick(); musicTimer = setInterval(musicTick, 500);
}
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (musicGain && ctx) { musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); }
}
// lower the music while a cinematic plays
export function duck(on) {
  ducked = on;
  if (musicGain && ctx && musicTimer) { musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(on ? 0.08 : 0.7, ctx.currentTime, 0.6); }
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
  eclipse() { noise({ dur: 1.4, vol: 0.3, from: 3000, to: 120 }); [196, 147, 98].forEach((f, i) => tone(f, { type: 'sawtooth', start: i * 0.25, dur: 0.6, vol: 0.08 })); },
};

export function play(name) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  try { SFX[name] && SFX[name](); } catch { /* ignore */ }
}
