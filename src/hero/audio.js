// Генеративный эмбиент на Web Audio: синтезируется в браузере, бесшовен по построению
// (непрерывные осцилляторы + медленные глиссандо между аккордами, без зацикленных сэмплов).
// Ничего не звучит, пока посетитель явно не включит звук.

const CHORDS = [ // тёплые раскладки: Dm9 → B♭maj9 → Fmaj9/C → Gm11
  [73.42, 110.0, 174.61, 261.63, 329.63],
  [58.27, 87.31, 146.83, 220.0, 261.63],
  [65.41, 98.0, 164.81, 220.0, 293.66],
  [49.0, 98.0, 146.83, 233.08, 261.63],
];
const PULSE_NOTES = { HR: 587.33, Legal: 698.46, IT: 880.0, Office: 659.25, Access: 783.99 };
const PULSE_PAN = { HR: 0.45, Legal: 0.35, IT: -0.15, Office: -0.5, Access: -0.25 };

export function createAudio() {
  let ctx = null, master, fxBus, reverbIn, delayIn, noiseBuf, voices = [], chordIdx = 0, chordTimer = 0, crackleTimer = 0;
  let enabled = false, suspendTimer = 0;

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'playback' });
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
    master.connect(comp).connect(ctx.destination);

    // реверберация: синтетический импульс
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 4.5, 2.8);
    const revOut = ctx.createGain(); revOut.gain.value = 0.6;
    reverbIn = ctx.createGain();
    reverbIn.connect(reverb).connect(revOut).connect(master);

    // лёгкое эхо для импульсов
    const delay = ctx.createDelay(1.5); delay.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    delayIn = ctx.createGain();
    delayIn.connect(delay); delay.connect(dlp).connect(fb).connect(delay);
    dlp.connect(master); dlp.connect(reverbIn);

    fxBus = ctx.createGain(); fxBus.gain.value = 1; fxBus.connect(master); fxBus.connect(reverbIn);
    noiseBuf = noise(ctx, 4);

    buildPads();
    buildRustle();
  }

  function buildPads() {
    const bus = ctx.createGain(); bus.gain.value = 0.9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 820; lp.Q.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(lp.frequency); lfo.start();
    bus.connect(lp); lp.connect(master);
    const send = ctx.createGain(); send.gain.value = 0.7; lp.connect(send).connect(reverbIn);

    CHORDS[0].forEach((f, i) => {
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.075 : 0.032;
      // медленное «дыхание» громкости каждого голоса — ощущение движения
      const trem = ctx.createOscillator(); trem.frequency.value = 0.04 + i * 0.017;
      const tremAmt = ctx.createGain(); tremAmt.gain.value = g.gain.value * 0.45;
      trem.connect(tremAmt).connect(g.gain); trem.start();
      const pan = ctx.createStereoPanner(); pan.pan.value = [-0.1, 0.25, -0.35, 0.4, -0.2][i];
      g.connect(pan).connect(bus);
      const oscs = (i === 0 ? ['sine', 'triangle'] : ['sawtooth', 'sawtooth', 'sine']).map((type, j) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        o.detune.value = type === 'sawtooth' ? (j ? 7 : -7) : 0;
        const og = ctx.createGain(); og.gain.value = type === 'sawtooth' ? 0.42 : 0.8;
        o.connect(og).connect(g); o.start();
        return o;
      });
      voices.push(oscs);
    });
  }

  function nextChord() {
    chordIdx = (chordIdx + 1) % CHORDS.length;
    const now = ctx.currentTime;
    voices.forEach((oscs, i) => oscs.forEach((o) => o.frequency.setTargetAtTime(CHORDS[chordIdx][i], now, 2.2)));
  }

  function buildRustle() {
    // мягкий «цифровой» шорох: полосовой шум с медленной модуляцией
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.006;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const amt = ctx.createGain(); amt.gain.value = 0.004;
    lfo.connect(amt).connect(g.gain); lfo.start();
    const pan = ctx.createStereoPanner();
    const plfo = ctx.createOscillator(); plfo.frequency.value = 0.031;
    const pamt = ctx.createGain(); pamt.gain.value = 0.6;
    plfo.connect(pamt).connect(pan.pan); plfo.start();
    src.connect(bp).connect(g).connect(pan).connect(master);
    src.start();
  }

  function crackle() {
    // редкие тихие «биты данных»
    if (!enabled || Math.random() > 0.35) return;
    const t = ctx.currentTime + Math.random() * 0.2;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2400 + Math.random() * 3600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.004 + Math.random() * 0.004, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
    o.connect(g).connect(p).connect(fxBus); o.start(t); o.stop(t + 0.05);
  }

  // ---------- события ----------
  function pulse(key) {
    if (!enabled) return;
    const t = ctx.currentTime, f = PULSE_NOTES[key] || 660;
    const out = ctx.createGain(); out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.022, t + 0.012); out.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const p = ctx.createStereoPanner(); p.pan.value = PULSE_PAN[key] || 0;
    out.connect(p); p.connect(fxBus); p.connect(delayIn);
    for (const [mul, gain, type] of [[1, 1, 'sine'], [2, 0.18, 'triangle']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g).connect(out); o.start(t); o.stop(t + 1.2);
    }
  }

  function whoosh(duration, dir = 1) {
    if (!enabled) return;
    const t = ctx.currentTime + 0.02, d = Math.max(0.4, duration);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = 0.8;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueCurveAtTime(curve((x) => 260 + 1500 * Math.sin(Math.PI * x) ** 1.6), t, d);
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setValueCurveAtTime(curve((x) => 0.11 * Math.sin(Math.PI * x) ** 2), t, d);
    const p = ctx.createStereoPanner();
    p.pan.setValueCurveAtTime(curve((x) => dir * (x - 0.5) * 1.1), t, d);
    src.connect(bp).connect(g).connect(p).connect(fxBus);
    // тёплое низкое «тело» движения
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueCurveAtTime(curve((x) => 55 + 30 * Math.sin(Math.PI * x)), t, d);
    const og = ctx.createGain(); og.gain.value = 0;
    og.gain.setValueCurveAtTime(curve((x) => 0.05 * Math.sin(Math.PI * x) ** 2), t, d);
    o.connect(og).connect(master);
    src.start(t); src.stop(t + d + 0.05); o.start(t); o.stop(t + d + 0.05);
  }

  function arrive(atModule) {
    if (!enabled) return;
    const t = ctx.currentTime;
    const freqs = atModule ? [[2093, 0.03], [3136, 0.012]] : [[1046.5, 0.02], [1568, 0.009]];
    for (const [f, a] of freqs) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + (atModule ? 0.35 : 0.9));
      o.connect(g).connect(fxBus); o.start(t); o.stop(t + 1);
    }
    // тихий «щелчок» фиксации
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    src.connect(hp).connect(g).connect(fxBus); src.start(t, Math.random()); src.stop(t + 0.03);
    const thud = ctx.createOscillator(); thud.frequency.setValueAtTime(180, t); thud.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    const tg = ctx.createGain(); tg.gain.setValueAtTime(0.06, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    thud.connect(tg).connect(master); thud.start(t); thud.stop(t + 0.2);
  }

  // ---------- управление ----------
  async function enable() {
    if (!ctx) init();
    enabled = true;
    clearTimeout(suspendTimer);
    await ctx.resume();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0.85, now + 2.2);
    clearInterval(chordTimer); clearInterval(crackleTimer);
    chordTimer = setInterval(nextChord, 15000);
    crackleTimer = setInterval(crackle, 420);
  }
  function disable() {
    enabled = false;
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.6);
    clearInterval(chordTimer); clearInterval(crackleTimer);
    suspendTimer = setTimeout(() => { if (!enabled) ctx.suspend(); }, 800);
  }
  function setHidden(hidden) {
    if (!ctx || !enabled) return;
    if (hidden) ctx.suspend(); else ctx.resume();
  }

  return { enable, disable, setHidden, pulse, whoosh, arrive, get enabled() { return enabled; } };
}

function curve(fn, n = 64) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = fn(i / (n - 1));
  return a;
}
function noise(ctx, seconds) {
  const b = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return b;
}
function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = lp * Math.pow(1 - i / len, decay); }
  }
  return b;
}
