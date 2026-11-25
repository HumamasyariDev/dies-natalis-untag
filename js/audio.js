import { $, CONFIG, state, now } from './config.js';

const LOBBY_PHASES = new Set(['boot', 'calib', 'calib-done']);
const INTRO_PHASES = new Set(['intro-pad', 'intro-hand', 'stage-clear', 'result']);
const ARENA_PHASES = new Set(['stim-visual', 'stim-audio', 'stim-kin', 'feedback']);

export function normalizeAudioBuffer(buf, targetPeak = 0.98) {
  if (!buf) return buf;
  let maxPeak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > maxPeak) maxPeak = v;
    }
  }
  if (maxPeak > 0.005 && maxPeak < targetPeak) {
    const scale = targetPeak / maxPeak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        data[i] *= scale;
      }
    }
  }
  return buf;
}

export const bgm = {
  lobbyAudio: null,
  gameCtx: null,
  introBuffer: null,
  gameBuffer: null,
  auditoriBuffer: null,
  kinestetikBuffer: null,
  activeTrack: null,
  gameSource: null,
  gameGain: null,
  analyser: null,
  gameLoading: false,
  gameTargetVol: 0.78,
  enabled: true,
  started: false,
  init() {
    if (!this.lobbyAudio) {
      this.lobbyAudio = new Audio('assets/lobby-bgm.mp3?v=4');
      this.lobbyAudio.loop = true;
      this.lobbyAudio.volume = 0.85;
    }
    this.initGameAudio();
    this.updateUI();
  },
  initGameAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.gameCtx = this.gameCtx || new AC();
    if (!this.gameGain) {
      this.gameGain = this.gameCtx.createGain();
      this.gameGain.gain.value = this.gameTargetVol;
      this.bgmCompressor = this.gameCtx.createDynamicsCompressor();
      this.bgmCompressor.threshold.value = -3;
      this.bgmCompressor.knee.value = 10;
      this.bgmCompressor.ratio.value = 4;
      this.bgmCompressor.attack.value = 0.005;
      this.bgmCompressor.release.value = 0.10;
      this.analyser = this.gameCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.72;
      this.gameGain.connect(this.bgmCompressor);
      this.bgmCompressor.connect(this.analyser);
      this.analyser.connect(this.gameCtx.destination);
    }
    if (this.gameLoading || (this.introBuffer && this.gameBuffer && this.auditoriBuffer && this.kinestetikBuffer)) return;
    this.gameLoading = true;

    const loadSingle = (url, name) => fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((ab) => this.gameCtx.decodeAudioData(ab))
      .then((decoded) => {
        if (name === 'intro') this.introBuffer = decoded;
        else if (name === 'arena') this.gameBuffer = decoded;
        else if (name === 'auditori') this.auditoriBuffer = normalizeAudioBuffer(decoded, 0.98);
        else if (name === 'kinestetik') this.kinestetikBuffer = normalizeAudioBuffer(decoded, 0.98);

        if (this.enabled && (INTRO_PHASES.has(state.phase) || ARENA_PHASES.has(state.phase))) {
          const needed = (state.phase === 'stim-kin' || (state.current === 'kinestetik' && ARENA_PHASES.has(state.phase)))
            ? 'kinestetik'
            : (state.phase === 'stim-audio' || (state.current === 'auditori' && ARENA_PHASES.has(state.phase)))
              ? 'auditori'
              : ARENA_PHASES.has(state.phase)
                ? 'arena'
                : 'intro';
          if (needed === name && (!this.gameSource || this.activeTrack !== needed)) {
            this.syncPhase(state.phase);
          }
        }
        return decoded;
      })
      .catch((err) => {
        console.warn(`[BGM] Gagal memuat audio ${name} (${url}):`, err);
        return null;
      });

    Promise.allSettled([
      loadSingle('assets/intro-bgm.ogg?v=3', 'intro'),
      loadSingle('assets/game-bgm.ogg?v=6', 'arena'),
      loadSingle('assets/auditori-bgm.wav?v=4', 'auditori'),
      loadSingle('assets/kinestetik-bgm.wav?v=4', 'kinestetik'),
    ]).finally(() => {
      this.gameLoading = false;
    });
  },
  startTrack(kind) {
    const buf = kind === 'kinestetik'
      ? this.kinestetikBuffer
      : kind === 'auditori'
        ? this.auditoriBuffer
        : (kind === 'arena' ? this.gameBuffer : this.introBuffer);
    if (!buf || !this.gameCtx) return;
    if (this.gameCtx.state === 'suspended') this.gameCtx.resume().catch(() => {});
    if (this.gameSource && this.activeTrack === kind) return;

    this.stopGameLoop(0);

    const t = this.gameCtx.currentTime;
    if (this.gameGain) {
      this.gameGain.gain.cancelScheduledValues(t);
      const curVal = Math.max(0.0001, this.gameGain.gain.value);
      this.gameGain.gain.setValueAtTime(curVal, t);
      this.gameGain.gain.linearRampToValueAtTime(this.gameTargetVol, t + 0.12);
    }

    const src = this.gameCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.gameGain);
    src.start(0);
    this.gameSource = src;
    this.activeTrack = kind;
    this.started = true;
  },
  stopGameLoop(fadeMs = 0) {
    if (this.gameSource) {
      const src = this.gameSource;
      this.gameSource = null;
      this.activeTrack = null;
      if (fadeMs > 0 && this.gameGain && this.gameCtx) {
        const t = this.gameCtx.currentTime;
        this.gameGain.gain.cancelScheduledValues(t);
        this.gameGain.gain.setValueAtTime(Math.max(0.0001, this.gameGain.gain.value), t);
        this.gameGain.gain.linearRampToValueAtTime(0.0001, t + fadeMs / 1000);
        setTimeout(() => {
          try { src.stop(); src.disconnect(); } catch (_) {}
        }, fadeMs + 40);
      } else {
        try { src.stop(); } catch (_) {}
        try { src.disconnect(); } catch (_) {}
      }
    }
  },
  play() {
    this.init();
    if (!this.enabled) return;
    if (INTRO_PHASES.has(state.phase) || ARENA_PHASES.has(state.phase)) {
      if (this.gameCtx && this.gameCtx.state === 'suspended') this.gameCtx.resume();
      this.syncPhase(state.phase);
    } else if (LOBBY_PHASES.has(state.phase)) {
      this.lobbyAudio.play().then(() => { this.started = true; }).catch(() => { });
    }
  },
  toggle() {
    this.init();
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.syncPhase(state.phase);
    } else {
      this.lobbyAudio.pause();
      this.stopGameLoop();
    }
    this.updateUI();
  },
  syncPhase(phase) {
    this.init();
    if (LOBBY_PHASES.has(phase)) {
      this.stopGameLoop(200);
      this.lobbyAudio.volume = phase === 'boot' ? 0.85 : 1.0;
      if (this.enabled && this.lobbyAudio.paused && (this.started || phase !== 'boot')) {
        this.lobbyAudio.play().then(() => { this.started = true; }).catch(() => { });
      }
    } else if (phase === 'count') {
      if (!this.lobbyAudio.paused) {
        this.lobbyAudio.pause();
        this.lobbyAudio.currentTime = 0;
      }
      this.stopGameLoop(400);
    } else if (INTRO_PHASES.has(phase) || ARENA_PHASES.has(phase)) {
      if (!this.lobbyAudio.paused) {
        this.lobbyAudio.pause();
        this.lobbyAudio.currentTime = 0;
      }
      const isArena = ARENA_PHASES.has(phase);
      if (!isArena) {
        if (state.current === 'kinestetik') {
          this.setTarget(1.10, true);
          if (this.enabled) this.startTrack('intro');
          return;
        }
        this.setTarget(0.78, true);
        if (this.enabled) this.startTrack('intro');
        return;
      }
      if (state.current === 'kinestetik') {
        this.setTarget(1.30, true);
        if (this.enabled) this.startTrack('kinestetik');
        return;
      }
      if (state.current === 'auditori') {
        const vol = phase === 'stim-audio' ? 0.48 : 0.85;
        this.setTarget(vol, true);
        if (this.enabled) this.startTrack('auditori');
        return;
      }
      this.setTarget(0.90, true);
      if (this.enabled) this.startTrack('arena');
    } else {
      if (!this.lobbyAudio.paused) {
        this.lobbyAudio.pause();
        this.lobbyAudio.currentTime = 0;
      }
      this.stopGameLoop(600);
    }
  },
  setTarget(vol, force = false) {
    this.gameTargetVol = vol;
    if (this.gameGain && this.gameCtx) {
      const curGain = this.gameGain.gain.value;
      if (force || Math.abs(curGain - vol) > 0.05) {
        const t = this.gameCtx.currentTime;
        this.gameGain.gain.cancelScheduledValues(t);
        this.gameGain.gain.setValueAtTime(Math.max(0.0001, curGain), t);
        this.gameGain.gain.linearRampToValueAtTime(vol, t + 0.15);
      }
    }
  },
  duck(lowVol = 0.14, holdMs = 520, restoreVol = 0.55) {
    if (!this.enabled || !this.gameGain || !this.gameCtx) return;
    const t = this.gameCtx.currentTime;
    const holdSec = holdMs / 1000;
    this.gameTargetVol = restoreVol;
    this.gameGain.gain.cancelScheduledValues(t);
    this.gameGain.gain.setValueAtTime(this.gameGain.gain.value, t);
    this.gameGain.gain.linearRampToValueAtTime(lowVol, t + 0.03);
    this.gameGain.gain.setValueAtTime(lowVol, t + holdSec);
    this.gameGain.gain.linearRampToValueAtTime(restoreVol, t + holdSec + 0.25);
  },
  getFrequencyData(target) {
    if (!this.analyser || !this.enabled) return false;
    this.analyser.getByteFrequencyData(target);
    return true;
  },
  getTimeDomainData(target) {
    if (!this.analyser || !this.enabled) return false;
    this.analyser.getByteTimeDomainData(target);
    return true;
  },
  updateUI() {
    const label = this.enabled ? 'BGM: ON' : 'BGM: OFF';
    const bg = this.enabled ? '#fde047' : '#ffffff';
    const lbl = $('bgm-label');
    const btn = $('btn-bgm');
    if (lbl) lbl.textContent = label;
    if (btn) btn.style.background = bg;
    const hudBtn = $('btn-hud-bgm');
    if (hudBtn) hudBtn.style.background = bg;
    document.querySelectorAll('.bgm-label-sync').forEach((el) => { el.textContent = label; });
  },
};

if (typeof window !== 'undefined') {
  window.bgm = bgm;
}

export const sfx = {
  ctx: null,
  master: null,
  buffers: {},
  loadingCues: false,
  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      const boost = this.ctx.createGain();
      boost.gain.value = 2.0;
      comp.connect(boost).connect(this.ctx.destination);
      this.master = comp;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.loadingCues) {
      this.loadingCues = true;
      ['countdown-321go'].forEach((key) => {
        fetch(`assets/${key}.ogg?v=1`)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx.decodeAudioData(b))
          .then((decoded) => { this.buffers[key] = decoded; })
          .catch(() => { });
      });

      // Preload seluruh efek suara pukulan & UI dari folder assets/sounds
      const beatSounds = [
        ['beatHit', 'assets/sounds/beatHit.ogg'],
        ['hover', 'assets/sounds/hover.ogg'],
      ];
      for (let i = 1; i <= 10; i++) {
        beatSounds.push([`hit${i}`, `assets/sounds/hit${i}.ogg`]);
        beatSounds.push([`hit${i}left`, `assets/sounds/hit${i}left.ogg`]);
        beatSounds.push([`hit${i}right`, `assets/sounds/hit${i}right.ogg`]);
      }
      beatSounds.forEach(([key, url]) => {
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx.decodeAudioData(b))
          .then((decoded) => { this.buffers[key] = decoded; })
          .catch(() => { });
      });
    }
  },
  playBuffer(key, vol = 1.0) {
    this.init();
    const buf = this.buffers[key];
    if (!buf || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g).connect(this.master || this.ctx.destination);
    src.start(0);
    return true;
  },
  tone(freq, dur = 0.12, type = 'sine', vol = 0.25, delay = 0) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master || this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  sweep(fStart, fEnd, dur = 0.12, type = 'sawtooth', vol = 0.5, delay = 0) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(fStart, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master || this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  tick() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(340, t);
    o.frequency.exponentialRampToValueAtTime(660, t + 0.045);
    o.frequency.exponentialRampToValueAtTime(510, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.48, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + 0.14);
  },
  urgentTick() {
    this.sweep(1750, 880, 0.055, 'square', 0.65, 0);
    this.sweep(110, 48, 0.08, 'sine', 0.85, 0);
  },
  heartbeat(rushLevel = 0) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Lub (first heavy sub thump)
    const o1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(64, t);
    o1.frequency.exponentialRampToValueAtTime(32, t + 0.08);
    g1.gain.setValueAtTime(0.001, t);
    g1.gain.linearRampToValueAtTime(1.2, t + 0.015);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o1.connect(g1).connect(this.master || this.ctx.destination);
    o1.start(t);
    o1.stop(t + 0.14);

    // Dub (second higher thump, 100ms later)
    const t2 = t + 0.10;
    const o2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(54, t2);
    o2.frequency.exponentialRampToValueAtTime(28, t2 + 0.07);
    g2.gain.setValueAtTime(0.001, t2);
    g2.gain.linearRampToValueAtTime(1.0, t2 + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.11);
    o2.connect(g2).connect(this.master || this.ctx.destination);
    o2.start(t2);
    o2.stop(t2 + 0.13);

    // Tension high click / tick
    const pitch = rushLevel === 2 ? 1850 : rushLevel === 1 ? 1500 : 1200;
    this.sweep(pitch, pitch * 0.5, 0.04, 'triangle', 0.55, 0.01);
  },
  comboGood(combo = 1) {
    const step = Math.min(Math.max(0, combo - 1), 10);
    const base = 587.33 * Math.pow(1.06, step);
    this.sweep(base * 0.75, base, 0.04, 'sawtooth', 0.55, 0);
    this.tone(base, 0.1, 'square', 0.5, 0);
    this.tone(base * 1.5, 0.14, 'sawtooth', 0.45, 0.035);
    this.tone(base * 2, 0.12, 'triangle', 0.45, 0.045);
    if (combo >= 4) {
      this.tone(base * 2.5, 0.16, 'sawtooth', 0.4, 0.08);
    }
  },
  rushStart() {
    this.sweep(320, 1380, 0.24, 'sawtooth', 0.65, 0);
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.tone(f, 0.11, 'square', 0.48, 0.04 + i * 0.045);
    });
  },
  stageClear() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, 0.28, 'sawtooth', 0.45, i * 0.08);
      this.tone(f * 2, 0.24, 'triangle', 0.35, i * 0.08);
    });
  },
  playCountdown() {
    if (this.playBuffer('countdown-321go', 1.0)) return true;
    return false;
  },
  countStep(n) {
    this.init();
    if (!this.ctx) return;
    const freqs = { 3: 523.25, 2: 587.33, 1: 659.25 };
    const f = freqs[n] || 523.25;
    this.tone(f, 0.24, 'triangle', 0.32);
    this.tone(f * 2, 0.18, 'sine', 0.14);
  },
  countGo() {
    this.init();
    if (!this.ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      this.tone(f, 0.42, 'triangle', 0.26, idx * 0.02);
    });
  },
  good() { this.tone(880, 0.11, 'sawtooth', 0.52); this.tone(1320, 0.2, 'square', 0.52, 0.065); },
  shutter() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Short filtered noise burst (mechanical camera shutter curtain)
    const dur = 0.095;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      const env = Math.exp(-i / (ch.length * 0.28));
      ch[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, t);
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.75, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(bp).connect(g).connect(this.master || this.ctx.destination);
    noise.start(t);

    // Crisp mechanical double-click
    this.sweep(1600, 420, 0.032, 'triangle', 0.45, 0);
    this.sweep(1200, 320, 0.038, 'triangle', 0.38, 0.048);
  },
  bad() {
    this.sweep(165, 62, 0.24, 'sawtooth', 0.78, 0);
    this.sweep(173, 66, 0.24, 'sawtooth', 0.72, 0);
    this.sweep(95, 38, 0.2, 'sine', 0.9, 0);
  },
  prepTick(step = 0, rushLevel = 0) {
    this.init();
    if (!this.ctx) return;
    this.playBuffer('hover', 0.55);
    this.sweep(120, 46, 0.08, 'sine', 0.65, 0);
    const freq = (880 + step * 110) * (1 + rushLevel * 0.06);
    this.tone(freq, 0.035, 'triangle', 0.24, 0);
  },
  audCueImpact(rushLevel = 0) {
    this.init();
    if (!this.ctx) return;
    // Punchy tactile cue for stimulus card reveal, keeping speech frequencies unobstructed
    this.playBuffer('beatHit', 0.50);
    this.sweep(140 + rushLevel * 20, 42, 0.15, 'sine', 0.60, 0);
  },
  wireCut() {
    this.init();
    if (!this.ctx) return;
    this.playBuffer('beatHit', 0.85);
    [587.33, 880, 1174.66].forEach((f, i) => {
      this.tone(f, 0.14, 'triangle', 0.36, 0.02 + i * 0.025);
    });
  },
  dropSignal() {
    this.init();
    if (!this.ctx) return;
    this.sweep(180, 48, 0.28, 'sine', 0.95, 0);
    this.tone(1046.5, 0.34, 'triangle', 0.85, 0);
    this.tone(1567.98, 0.28, 'sine', 0.65, 0);
    this.tone(2093.0, 0.22, 'sine', 0.42, 0.01);
  },
  boing() {
    this.sweep(180, 560, 0.22, 'sine', 0.85, 0);
    this.sweep(560, 260, 0.14, 'triangle', 0.65, 0.12);
  },
  rocket() {
    this.sweep(240, 1480, 0.28, 'sawtooth', 0.58, 0);
    this.tone(1046.5, 0.18, 'triangle', 0.55, 0.14);
  },
  disco() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, 0.14, 'sawtooth', 0.42, i * 0.035);
    });
  },
  recordScratch() {
    this.sweep(920, 110, 0.26, 'sawtooth', 0.78, 0);
    this.sweep(620, 75, 0.24, 'square', 0.52, 0.03);
  },
  hitIdx: 0,
  smash(isCritical = false, side = 'both') {
    this.init();
    if (!this.ctx) return;
    this.hitIdx = (this.hitIdx % 10) + 1;
    const bankKey = side === 'left'
      ? `hit${this.hitIdx}left`
      : side === 'right'
        ? `hit${this.hitIdx}right`
        : `hit${this.hitIdx}`;
    const played = this.playBuffer(bankKey, isCritical ? 0.95 : 0.78);
    if (isCritical || side === 'both') this.playBuffer('beatHit', isCritical ? 0.65 : 0.42);
    if (!played) {
      this.sweep(180, 48, 0.16, 'sine', 0.95, 0);
      this.sweep(isCritical ? 1900 : 1350, 280, 0.11, 'sawtooth', isCritical ? 0.85 : 0.65, 0);
      this.tone(isCritical ? 1760 : 1320, 0.20, 'triangle', 0.55, 0.02);
    }
  },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.52, i * 0.12)); },
  padKey(key) {
    this.init();
    if (!this.ctx) return;
    if (key === 'CIRCLE') {
      // Fat EDM Synth Bass (audible on laptop speakers + deep sub)
      this.sweep(320, 98, 0.24, 'sawtooth', 0.72, 0);
      this.tone(130.81, 0.26, 'sawtooth', 0.62, 0);
      this.tone(196.0, 0.22, 'triangle', 0.58, 0);
      this.sweep(150, 65, 0.24, 'sine', 0.95, 0);
    } else if (key === 'CROSS') {
      // Bright Detuned Synth Lead Chord Pluck
      this.tone(440, 0.22, 'sawtooth', 0.55, 0);
      this.tone(444, 0.22, 'sawtooth', 0.50, 0);
      this.tone(659.25, 0.20, 'square', 0.40, 0);
      this.sweep(880, 440, 0.08, 'triangle', 0.45, 0);
    } else if (key === 'TRIANGLE') {
      // Sparkling High Crystal Bell
      this.tone(1046.5, 0.34, 'sine', 0.82, 0);
      this.tone(1567.98, 0.28, 'triangle', 0.52, 0);
      this.tone(2093.0, 0.26, 'sine', 0.48, 0.01);
      this.tone(3135.96, 0.16, 'sine', 0.28, 0.02);
    } else if (key === 'SQUARE') {
      // Layered Studio 909 Handclap + Snap
      [0, 0.014, 0.028].forEach((offset, idx) => {
        const dur = idx === 2 ? 0.16 : 0.045;
        const bufSize = Math.floor(this.ctx.sampleRate * dur);
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.36));
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1850;
        filter.Q.value = 0.9;
        const g = this.ctx.createGain();
        g.gain.value = 1.55;
        src.connect(filter).connect(g).connect(this.master || this.ctx.destination);
        src.start(this.ctx.currentTime + offset);
      });
      this.sweep(380, 150, 0.08, 'triangle', 0.65, 0);
    }
  },
};

export const voice = {
  selected: null,
  audioMap: {},
  bufferMap: {},
  activeNodes: [],
  currentEl: null,
  driveCurve: null,
  makeDriveCurve() {
    if (this.driveCurve) return this.driveCurve;
    const n = 512;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * 2.1);
    }
    this.driveCurve = curve;
    return curve;
  },
  init() {
    sfx.init();
    ['segitiga', 'lingkaran', 'silang', 'kotak'].forEach((key) => {
      const url = `assets/voice-${key}.ogg?v=9`;
      const a = new Audio(url);
      a.preload = 'auto';
      a.volume = 1.0;
      a.load();
      this.audioMap[key] = a;
      if (sfx.ctx) {
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((b) => sfx.ctx.decodeAudioData(b))
          .then((decoded) => { this.bufferMap[key] = normalizeAudioBuffer(decoded, 0.98); })
          .catch(() => {});
      }
    });
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.selected =
        vs.find((v) => /^id[-_]/i.test(v.lang)) ||
        vs.find((v) => /indonesia/i.test(v.name)) || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  },
  announceCount(n) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const words = { 3: 'Tiga', 2: 'Dua', 1: 'Satu' };
    const u = new SpeechSynthesisUtterance(words[n] || String(n));
    u.lang = CONFIG.speechLang;
    if (this.selected) u.voice = this.selected;
    u.rate = 1.15;
    u.pitch = n === 1 ? 1.18 : n === 2 ? 1.10 : 1.04;
    u.volume = 1;
    speechSynthesis.speak(u);
  },
  announceGo() {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('Go!');
    u.lang = 'en-US';
    u.rate = 1.2;
    u.pitch = 1.2;
    u.volume = 1;
    speechSynthesis.speak(u);
  },
  stopAll() {
    while (this.activeNodes.length) {
      const n = this.activeNodes.pop();
      try { n.stop(); n.disconnect(); } catch (_) {}
    }
    if (this.currentEl) {
      this.currentEl.pause();
      this.currentEl.currentTime = 0;
      this.currentEl = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
  playClip(clipKey, fallbackText = '') {
    this.stopAll();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(now()); } };
      const el = this.audioMap[clipKey];

      if (el) {
        this.currentEl = el;
        el.currentTime = 0;
        el.playbackRate = 1.0;
        el.addEventListener('ended', finish, { once: true });
        el.addEventListener('error', finish, { once: true });
        el.play().catch(finish);
        setTimeout(finish, 4800);
        return;
      }
      if (!('speechSynthesis' in window)) { finish(); return; }
      const u = new SpeechSynthesisUtterance(fallbackText || clipKey);
      u.lang = CONFIG.speechLang;
      if (this.selected) u.voice = this.selected;
      u.rate = 1.1; u.pitch = 1; u.volume = 1;
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTimeout(finish, 4800);
    });
  },
  play(shapeKey = 'segitiga', rate = 1.0) {
    this.stopAll();
    sfx.init();
    const rushLevel = rate >= 1.05 ? 2 : rate >= 1.02 ? 1 : 0;
    const restoreVol = state.phase === 'stim-audio' ? 0.48 : bgm.gameTargetVol;
    // Duck music deeply (down to 0.04) for 980ms so the voice is 100% unobstructed
    bgm.duck(0.04, 980, restoreVol);
    sfx.audCueImpact(rushLevel);

    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(now()); } };

      const buf = this.bufferMap[shapeKey] || this.bufferMap.segitiga;
      if (buf && sfx.ctx) {
        if (sfx.ctx.state === 'suspended') sfx.ctx.resume();
        const ctx = sfx.ctx;
        const t0 = ctx.currentTime + 0.012;
        const baseRate = Math.max(1.0, Math.min(1.14, (rate || 1.0) * 1.04));

        // Source buffer
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = baseRate;

        // 1. High-Pass Filter (140Hz highpass):
        // Strips unwanted sub-bass rumble & boominess that causes small speakers to distort
        const lowCut = ctx.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 140;
        lowCut.Q.value = 0.707;

        // 2. Vocal Chest & Warmth (280Hz peaking, +4.5dB):
        // Delivers solid authoritative vocal presence
        const bodyBoost = ctx.createBiquadFilter();
        bodyBoost.type = 'peaking';
        bodyBoost.frequency.value = 280;
        bodyBoost.Q.value = 1.1;
        bodyBoost.gain.value = 4.5;

        // 3. Speech Intelligibility & Consonant Piercing (3200Hz peaking, +7.0dB):
        // Specifically targets human ear sensitivity for speech perception in outdoor crowds
        const clarityBoost = ctx.createBiquadFilter();
        clarityBoost.type = 'peaking';
        clarityBoost.frequency.value = 3200;
        clarityBoost.Q.value = 1.0;
        clarityBoost.gain.value = 7.0;

        // 4. Air & Sibilance Crispness (5500Hz highshelf, +4.0dB)
        const airBoost = ctx.createBiquadFilter();
        airBoost.type = 'highshelf';
        airBoost.frequency.value = 5500;
        airBoost.gain.value = 4.0;

        // 5. Broadcast Stadium Announcer Dynamics Compressor:
        // Evens out every syllable, makes soft endings punchy, protects against distortion
        const vocalComp = ctx.createDynamicsCompressor();
        vocalComp.threshold.value = -18;
        vocalComp.knee.value = 6;
        vocalComp.ratio.value = 8;
        vocalComp.attack.value = 0.003;
        vocalComp.release.value = 0.12;

        // 6. Make-up / Output Gain for loud outdoor reproduction
        const vocalGain = ctx.createGain();
        vocalGain.gain.value = 4.2;

        // Connect chain cleanly:
        src.connect(lowCut);
        lowCut.connect(bodyBoost);
        bodyBoost.connect(clarityBoost);
        clarityBoost.connect(airBoost);
        airBoost.connect(vocalComp);
        vocalComp.connect(vocalGain);

        vocalGain.connect(sfx.master || ctx.destination);

        this.activeNodes.push(src);
        src.start(t0);

        setTimeout(finish, 18);
        return;
      }

      const el = this.audioMap[shapeKey] || this.audioMap.segitiga;
      if (el) {
        this.currentEl = el;
        el.pause();
        el.currentTime = 0;
        el.volume = 1.0;
        el.playbackRate = Math.max(1.0, Math.min(1.12, (rate || 1.0) * 1.04));
        el.addEventListener('playing', finish, { once: true });
        el.play().catch(finish);
        setTimeout(finish, 1500);
        return;
      }
      if (!('speechSynthesis' in window)) { finish(); return; }
      const u = new SpeechSynthesisUtterance(shapeKey);
      u.lang = CONFIG.speechLang;
      if (this.selected) u.voice = this.selected;
      u.rate = rate; u.pitch = 1; u.volume = 1;
      u.onstart = finish;
      u.onerror = finish;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTimeout(finish, 1500);
    });
  },
};
