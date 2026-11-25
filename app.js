/* =====================================================================
   STROOP'S PARADOX: V-A-K TEST
   Vanilla JS · MediaPipe Hands · HTML5 Gamepad API · Web Speech API
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   0. KONFIGURASI (silakan tuning di lokasi bazar)
   --------------------------------------------------------------------- */
const CONFIG = {
  // MediaPipe
  mediapipeVersion: '0.4.1675469240',
  maxNumHands: 1,               // WAJIB 1 → ringan & tidak terganggu orang lewat
  modelComplexity: 1,           // 1 = model full (akurat & stabil untuk melacak jari saat menulis)
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.55,

  // Tahap 1 – Kalibrasi
  trailLifeMs: 25000,           // coretan bertahan selama kalibrasi agar tulisan inisial utuh
  minInkToUnlockFist: 0.45,     // panjang coretan minimal sebelum fase "kepalkan" terbuka
  calibMaxWaitMs: 12000,        // kalau tak menulis, fase "kepalkan" tetap terbuka setelah ini
  fistHoldMs: 2000,             // tahan kepalan 2 detik
  fistGraceMs: 400,             // toleransi frame hilang saat kepalan

  // Swipe (velositas horizontal telapak tangan)
  swipeWindowMs: 260,           // jendela pengukuran
  swipeMinVelocity: 0.6,        // lebar-frame per detik
  swipeMinDistance: 0.13,       // perpindahan minimal (fraksi lebar frame)
  swipeCooldownMs: 650,

  // Tes
  introReadDelayMs: 1500,       // jeda baca sebelum input diterima
  countdownStepMs: 700,
  fixationMinMs: 800,           // jeda acak "+" sebelum stimulus (anti-antisipasi)
  fixationMaxMs: 1600,
  trialTimeoutMs: 10000,        // batas waktu tiap tes
  errorPenaltyMs: 0,            // tambahan RT per kesalahan (0 = murni sesuai spesifikasi)

  // Audio tahap 3. Kosongkan untuk pakai suara sintesis (speechSynthesis).
  // Isi mis. 'audio/segitiga.mp3' jika ingin rekaman suara sendiri (lebih konsisten).
  segitigaAudioUrl: '',
  speechLang: 'id-ID',

  // Hasil
  resetLockMs: 3000,            // swipe reset baru aktif setelah ini
  autoResetMs: 90000,           // reset otomatis kalau ditinggal
  // URL publik (mis. GitHub Pages) agar QR bisa dibuka di HP. Kosong = otomatis/teks.
  // Kosongkan agar dinamis mengikuti server lokal / EdgeOne
  resultBaseUrl: 'https://digital-plum-ftdtrsmm.edgeone.dev/scan.html',

  // Tombol operator di keyboard (0-3 = tombol pad, ←/→ = swipe) untuk uji tanpa hardware
  debugKeys: true,
};

/* ---------------------------------------------------------------------
   GAMEPAD PROFILES & DYNAMIC MAPPING
   --------------------------------------------------------------------- */
const PRESETS = {
  // Standard W3C Gamepad API (Kabel USB di Linux / Windows)
  standard: {
    name: 'Standard PS3 (Kabel)',
    BTN: { CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, START: 9 },
  },
  // Bluetooth mode di Linux bila kontroler terbaca sebagai Xbox Gamepad / Wireless Controller
  xbox_bt: {
    name: 'Xbox / Wireless Bluetooth',
    // Di Xbox: A=0 (Cross), B=1 (Circle), X=2 (Square), Y=3 (Triangle), Start=9 atau 7
    BTN: { CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, START: 9 },
  },
  // Bluetooth DualShock 3 native Linux driver (hid-sony evdev raw)
  // Seringkali Cross=14, Circle=13, Square=15, Triangle=12 ATAU Cross=1, Circle=2
  ds3_raw_linux: {
    name: 'PS3 Bluetooth Raw Linux',
    BTN: { CROSS: 14, CIRCLE: 13, SQUARE: 15, TRIANGLE: 12, START: 3 },
  },
};

// Objek mapping dinamis
let activePresetKey = 'standard';
let BTN = { ...PRESETS.standard.BTN };

function setGamepadPreset(key) {
  if (!PRESETS[key]) return;
  activePresetKey = key;
  BTN = { ...PRESETS[key].BTN };
  TESTS.visual.correct = BTN.CIRCLE;
  TESTS.auditori.correct = BTN.TRIANGLE;
  TEST_BUTTONS = [BTN.CROSS, BTN.CIRCLE, BTN.SQUARE, BTN.TRIANGLE];
  updateDiagUI();
  console.info(`[Gamepad] Mengganti preset ke: ${PRESETS[key].name}`, BTN);
}

let PS = {
  get [BTN.CROSS]() { return { sym: '✕', color: '#4d8dff', shape: 'SILANG' }; },
  get [BTN.CIRCLE]() { return { sym: '○', color: '#ff3355', shape: 'LINGKARAN' }; },
  get [BTN.SQUARE]() { return { sym: '□', color: '#ff2bd6', shape: 'KOTAK' }; },
  get [BTN.TRIANGLE]() { return { sym: '△', color: '#22e07a', shape: 'SEGITIGA' }; },
};
let TEST_BUTTONS = [BTN.CROSS, BTN.CIRCLE, BTN.SQUARE, BTN.TRIANGLE];

const ORDER = ['visual', 'auditori', 'kinestetik'];
const TESTS = {
  visual: {
    step: 2, input: 'pad', get correct() { return BTN.CIRCLE; }, set correct(v) {},
    tag: '02 / UJI VISUAL',
    title: 'Tekan tombol sesuai <span class="text-[#0284c7]">WARNA TINTA</span>',
    sub: 'Abaikan arti katanya. Fokus pada warna teks yang tampil.',
  },
  auditori: {
    step: 3, input: 'pad', get correct() { return BTN.TRIANGLE; }, set correct(v) {},
    tag: '03 / UJI AUDITORI',
    title: 'Tekan tombol sesuai <span class="text-[#ea580c]">SUARA</span>',
    sub: 'Abaikan bentuk di layar. Dengarkan instruksi audio.',
  },
  kinestetik: {
    step: 4, input: 'hand',
    tag: '04 / UJI KINESTETIK',
    title: 'Geser tangan ke arah <span class="text-[#0284c7]">TEKS</span>',
    sub: 'Lepas controller. Arahkan swipe sesuai kata, bukan panahnya.',
  },
};
const STYLE_INFO = {
  visual:     { label: 'VISUAL',     code: 'V', color: '#00f0ff', tip: 'Gunakan mind map, diagram, dan warna saat belajar.' },
  auditori:   { label: 'AUDITORI',   code: 'A', color: '#ff2bd6', tip: 'Dengarkan penjelasan, diskusi, atau rekam dan dengar ulang.' },
  kinestetik: { label: 'KINESTETIK', code: 'K', color: '#b6ff3b', tip: 'Belajar sambil praktik, gerak, atau simulasi langsung.' },
};

/* ---------------------------------------------------------------------
   1. DOM & STATE
   --------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const video = $('webcam');
const canvas = $('fx');
const ctx = canvas.getContext('2d');

const state = {
  phase: 'boot',      // boot | calib | intro-pad | intro-hand | count | fixation | stim-visual | stim-audio | stim-kin | feedback | result
  session: 0,         // token: dinaikkan untuk membatalkan semua timer lama
  current: null,      // kunci tes aktif
  rt: { visual: null, auditori: null, kinestetik: null },
  errors: { visual: 0, auditori: 0, kinestetik: 0 },
  timedOut: { visual: false, auditori: false, kinestetik: false },
  stimT0: null,
  timeoutAt: Infinity,
  introReadyAt: 0,
  handStableSince: null,
  fixTimer: null,
  resetUnlockAt: 0,
  autoResetAt: Infinity,
};

const STAR_STAMPS = Array.from({ length: 24 }, (_, i) => {
  const img = new Image();
  img.src = `assets/stars/${i + 1}.png`;
  return img;
});

const calib = {
  strokes: [], current: null, ink: 0, startedAt: 0,
  shapes: [], currentShape: [], selectedShape: null,
  dragging: false, movePrev: null, clearWasActive: false,
  particles: [],
  tip: null, rawTip: null, tipVel: 0,
  drawing: false, penDownCount: 0, penUpCount: 0,
  gestureMode: 'none', // 'draw' | 'move' | 'clear' | 'hover' | 'fist' | 'none'
  sparks: [],
  fistEnabled: false, fistStart: null, lastFist: 0, progress: 0,
};

const now = () => performance.now();
const rand = (a, b) => a + Math.random() * (b - a);

/** setTimeout yang otomatis batal jika game di-reset / tahap dibatalkan */
function later(fn, ms) {
  const s = state.session;
  return setTimeout(() => { if (s === state.session) fn(); }, ms);
}
function abortPending() {
  state.session++;
  clearTimeout(state.fixTimer);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/* ---------------------------------------------------------------------
   2. UI HELPERS
   --------------------------------------------------------------------- */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
}
function setStep(n) {
  document.querySelectorAll('#stepper .step').forEach((li) => {
    const k = Number(li.dataset.step);
    li.classList.toggle('active', k === n);
    li.classList.toggle('done', k < n);
  });
}
function dimCam(on) { document.body.classList.toggle('dim-cam', on); }
function setGameMode(on) { document.body.classList.toggle('game-mode', on); }
function setChip(id, on, label) {
  const el = $(id);
  el.classList.toggle('on', !!on);
  el.classList.toggle('off', !on);
  if (label) el.textContent = label;
}
function flash(kind) {
  const f = $('flash');
  f.className = kind;
  requestAnimationFrame(() => requestAnimationFrame(() => { f.className = ''; }));
}
function legendHTML(type) {
  let items;
  if (type === 'visual') {
    items = [[BTN.CIRCLE, 'MERAH'], [BTN.CROSS, 'BIRU'], [BTN.TRIANGLE, 'HIJAU'], [BTN.SQUARE, 'PINK']];
  } else {
    items = [[BTN.TRIANGLE, 'SEGITIGA'], [BTN.CIRCLE, 'LINGKARAN'], [BTN.CROSS, 'SILANG'], [BTN.SQUARE, 'KOTAK']];
  }
  return `<div class="legend">${items.map(([b, label]) =>
    `<div class="ps-key" data-btn="${b}" style="color:${PS[b].color}">
       <div class="sym">${PS[b].sym}</div><span>${label}</span>
     </div>`).join('')}</div>`;
}
function hitKey(btn) {
  document.querySelectorAll(`.ps-key[data-btn="${btn}"]`).forEach((k) => {
    k.classList.add('hit');
    setTimeout(() => k.classList.remove('hit'), 200);
  });
}
function setFeedback(html, color = '#e2e8f0') {
  const el = $('stim-feedback');
  el.innerHTML = html;
  el.style.color = color;
}

/* ---------------------------------------------------------------------
   3. AUDIO: BGM LOBI + SFX (Web Audio API) + SUARA "SEGITIGA"
   --------------------------------------------------------------------- */
const bgm = {
  audio: null,
  enabled: true,
  started: false,
  init() {
    if (!this.audio) {
      this.audio = new Audio('assets/lobby-bgm.mp3?v=4');
      this.audio.loop = true;
      this.audio.volume = 0.85;
    }
    this.updateUI();
  },
  play() {
    this.init();
    if (!this.enabled) return;
    this.audio.play().then(() => { this.started = true; }).catch(() => {});
  },
  toggle() {
    this.init();
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.syncPhase(state.phase);
    } else {
      this.audio.pause();
    }
    this.updateUI();
  },
  syncPhase(phase) {
    this.init();
    if (phase === 'boot' || phase === 'calib') {
      this.audio.volume = phase === 'calib' ? 1.0 : 0.85;
      if (this.enabled && this.audio.paused && (this.started || phase === 'calib')) {
        this.audio.play().then(() => { this.started = true; }).catch(() => {});
      }
    } else {
      // Matikan BGM saat masuk ke tahap tes 02–04 & hasil
      if (!this.audio.paused) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }
    }
  },
  updateUI() {
    const lbl = $('bgm-label');
    const btn = $('btn-bgm');
    if (lbl) lbl.textContent = this.enabled ? 'BGM: ON' : 'BGM: OFF';
    if (btn) btn.style.background = this.enabled ? '#fde047' : '#ffffff';
  },
};

const sfx = {
  ctx: null,
  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = this.ctx || new AC();
    this.ctx.resume();
  },
  tone(freq, dur = 0.12, type = 'sine', vol = 0.12, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  tick() { this.tone(660, 0.07, 'square', 0.05); },
  good() { this.tone(880, 0.1, 'triangle'); this.tone(1320, 0.18, 'triangle', 0.12, 0.08); },
  bad()  { this.tone(140, 0.28, 'sawtooth', 0.1); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.1, i * 0.12)); },
};

const voice = {
  selected: null,
  audioEl: null,
  init() {
    if (CONFIG.segitigaAudioUrl) {
      this.audioEl = new Audio(CONFIG.segitigaAudioUrl);
      this.audioEl.preload = 'auto';
      this.audioEl.load();
    }
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.selected =
        vs.find((v) => /^id[-_]/i.test(v.lang)) ||
        vs.find((v) => /indonesia/i.test(v.name)) || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
    // "Unlock" speech dengan user gesture (Chrome memblokir speak() tanpa aktivasi pengguna)
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  },
  /** Memutar "SEGITIGA". Resolve dengan timestamp saat suara MULAI terdengar (onset). */
  play() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(now()); } };

      if (this.audioEl) {
        this.audioEl.currentTime = 0;
        this.audioEl.addEventListener('playing', finish, { once: true });
        this.audioEl.play().catch(finish);
        setTimeout(finish, 1500);
        return;
      }
      if (!('speechSynthesis' in window)) { finish(); return; }
      const u = new SpeechSynthesisUtterance('Segitiga');
      u.lang = CONFIG.speechLang;
      if (this.selected) u.voice = this.selected;
      u.rate = 1.05; u.pitch = 1; u.volume = 1;
      u.onstart = finish;
      u.onerror = finish;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTimeout(finish, 1500); // fallback bila onstart tidak terpanggil
    });
  },
};

/* ---------------------------------------------------------------------
   4. GAMEPAD API (polling + edge detection)
   --------------------------------------------------------------------- */
const pad = { index: null, prev: [], id: '' };

function getPad() {
  if (!navigator.getGamepads) return null;
  const list = navigator.getGamepads();
  let gp = pad.index != null ? list[pad.index] : null;
  if (!gp || !gp.connected) {
    gp = Array.from(list).find((g) => g && g.connected) || null;
    if (gp && gp.index !== pad.index) attachPad(gp);
  }
  return gp;
}
function padConnected() { return !!getPad(); }

function attachPad(gp) {
  pad.index = gp.index;
  pad.id = gp.id;
  pad.prev = gp.buttons.map((b) => b.pressed); // jangan anggap tombol yang sedang ditekan sebagai "press baru"
  console.info(`[Gamepad] terhubung: "${gp.id}" mapping="${gp.mapping || 'non-standard'}"`);

  // Auto-detect profile Linux Bluetooth vs Standard
  const name = gp.id.toLowerCase();
  if (gp.mapping === 'standard') {
    setGamepadPreset('standard');
  } else if (name.includes('playstation') || name.includes('sony') || name.includes('dualshock')) {
    // Bluetooth PS3 di Linux seringkali non-standard (raw evdev)
    if (gp.buttons.length > 16) {
      setGamepadPreset('ds3_raw_linux');
    } else {
      setGamepadPreset('standard');
    }
  } else if (name.includes('xbox') || name.includes('x-box')) {
    setGamepadPreset('xbox_bt');
  }

  updateDiagUI();
  refreshPadUI();
}

window.addEventListener('gamepadconnected', (e) => attachPad(e.gamepad));
window.addEventListener('gamepaddisconnected', (e) => {
  if (e.gamepad.index !== pad.index) return;
  pad.index = null;
  pad.prev = [];
  refreshPadUI();
  // Jika controller lepas di tengah tes berbasis pad → ulangi intro tes itu
  const t = TESTS[state.current];
  if (t && t.input === 'pad' && ['count', 'fixation', 'stim-visual', 'stim-audio'].includes(state.phase)) {
    abortPending();
    showIntro(state.current);
  }
});

function pollGamepad() {
  const gp = getPad();
  if (!gp) return;
  const tNow = now();
  // gp.timestamp berada di timeline yang sama dengan performance.now() → RT lebih presisi
  const tEvt = gp.timestamp && gp.timestamp <= tNow && tNow - gp.timestamp < 50 ? gp.timestamp : tNow;
  gp.buttons.forEach((b, i) => {
    const pressed = b.pressed || b.value > 0.5;
    if (pressed && !pad.prev[i]) onButtonDown(i, tEvt);
    pad.prev[i] = pressed;
  });

  // Update live diagnostic monitor jika sedang terbuka
  if (diagModalOpen) renderDiagButtons(gp);
}

function refreshPadUI() {
  const ok = padConnected();
  setChip('chip-pad', ok, ok ? 'PAD ✓' : 'PAD ✕');
  $('chip-pad').title = pad.id || 'Belum ada controller';
  const t = TESTS[state.current];
  const needPad = t && t.input === 'pad' &&
    ['intro-pad', 'count', 'fixation', 'stim-visual', 'stim-audio'].includes(state.phase);
  $('pad-banner').classList.toggle('hidden', !(needPad && !ok));
}

function onButtonDown(btn, t) {
  switch (state.phase) {
    case 'intro-pad':
      if (now() >= state.introReadyAt) { sfx.tick(); startCountdown(); }
      break;
    case 'fixation':
      if (TEST_BUTTONS.includes(btn)) prematureResponse();
      break;
    case 'stim-visual':
    case 'stim-audio':
      if (TEST_BUTTONS.includes(btn)) handlePadResponse(btn, t);
      break;
    case 'result':
      if (btn === BTN.START && now() >= state.resetUnlockAt) resetGame();
      break;
  }
}

/* ---------------------------------------------------------------------
   5. MEDIAPIPE HANDS + DETEKSI GESTUR
   --------------------------------------------------------------------- */
let hands = null;
const vision = {
  busy: false, lastVideoTime: -1, pendingTs: 0,
  lm: null, handVisible: false, lastSeen: 0,
  wristTrail: [], ready: false,
};

const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const palmSizeOf = (m) => Math.max(dist(m[0], m[9]), dist(m[0], m[5]), 0.06);
const palmCenterOf = (m) => ({
  x: (m[0].x + m[5].x + m[9].x + m[17].x) / 4,
  y: (m[0].y + m[5].y + m[9].y + m[17].y) / 4,
});

/**
 * Rasio ekstensi jari: seberapa jauh ujung jari dari pergelangan dibandingkan
 * sendi MCP (pangkal jari). > 1.35 = lurus/terbuka, < 1.15 = menekuk.
 */
function fingerExtRatio(m, tip, pip, mcp) {
  const dTip = dist(m[tip], m[0]);
  const dPip = dist(m[pip], m[0]);
  const dMcp = dist(m[mcp], m[0]) || 1e-5;
  return { tipMcp: dTip / dMcp, tipPip: dTip / (dPip || 1e-5) };
}

function isFingerExtended(m, tip, pip, mcp, thresh = 1.06) {
  const r = fingerExtRatio(m, tip, pip, mcp);
  return r.tipPip > thresh && r.tipMcp > 1.25;
}

function isFingerCurled(m, tip, pip, mcp) {
  const r = fingerExtRatio(m, tip, pip, mcp);
  return r.tipPip < 1.04 || r.tipMcp < 1.18;
}

/**
 * FIST (Mengepal Rapat): keempat jari + jempol menekuk rapat ke telapak tangan.
 * Dibuat ketat agar saat pengguna hanya menekuk/menurunkan telunjuk untuk
 * berhenti menulis, tidak dianggap sebagai kepalan "Siap Mulai".
 */
function isFist(m) {
  const fingers = [
    [8, 6, 5],   // telunjuk
    [12, 10, 9], // tengah
    [16, 14, 13],// manis
    [20, 18, 17],// kelingking
  ];
  for (const [tip, pip, mcp] of fingers) {
    if (!isFingerCurled(m, tip, pip, mcp)) return false;
    // Pastikan tidak ada jari yang masih terangkat di atas sendi PIP-nya
    if (m[tip].y < m[pip].y - 0.01) return false;
  }
  if (isFingerExtended(m, 8, 6, 5, 1.05)) return false;

  const pSize = palmSizeOf(m) || 1e-6;
  const pCenter = palmCenterOf(m);
  const avgDist = [8, 12, 16, 20].reduce((s, t) => s + dist(m[t], pCenter), 0) / 4 / pSize;
  const thumbDist = dist(m[4], pCenter) / pSize;
  return avgDist < 0.85 && thumbDist < 1.05;
}

/**
 * DRAWING GESTURE (Rotation-Invariant + Hysteresis-ready):
 *   - DRAW: Hanya jari telunjuk lurus, jari tengah/manis/kelingking menekuk
 *   - MOVE: Cubit (pinch jari telunjuk & jempol) untuk menggeser bentuk
 *   - CLEAR: Semua 5 jari terbuka lebar (harus ditahan 700ms di updateCalibration)
 *   - FIST: Mengepal rapat untuk lanjut/selesai kalibrasi
 *   - HOVER: 2+ jari terbuka / jari ditekuk ringan → berhenti menggambar dengan aman
 */
function checkDrawGesture(m, currentlyDrawing) {
  if (isFist(m)) return { canDraw: false, mode: 'fist' };

  const indexExt = isFingerExtended(m, 8, 6, 5, currentlyDrawing ? 1.02 : 1.08);
  const middleExt = isFingerExtended(m, 12, 10, 9, 1.06);
  const ringExt = isFingerExtended(m, 16, 14, 13, 1.06);
  const pinkyExt = isFingerExtended(m, 20, 18, 17, 1.06);

  const pSize = palmSizeOf(m) || 1e-6;
  const dTipPinky = dist(m[4], m[17]);
  const dIpPinky = dist(m[3], m[17]);
  const thumbOut = dTipPinky > dIpPinky * 1.12 && (dTipPinky / pSize) > 0.65;
  const pinchRatio = dist(m[4], m[8]) / pSize;

  if (indexExt && thumbOut && middleExt && ringExt && pinkyExt) {
    return { canDraw: false, mode: 'clear' };
  }
  if (indexExt && pinchRatio < 0.35 && !middleExt && !ringExt && !pinkyExt) {
    return { canDraw: false, mode: 'move' };
  }
  if (indexExt && !middleExt && !ringExt && !pinkyExt) {
    return { canDraw: true, mode: 'draw' };
  }

  return { canDraw: false, mode: 'hover' };
}

/** Detektor swipe berbasis velositas horizontal pergelangan tangan. */
class SwipeDetector {
  constructor(o) { Object.assign(this, o); this.hist = []; this.coolUntil = 0; }
  reset() { this.hist = []; }
  update(x, t) {
    if (t < this.coolUntil) { this.hist = []; return null; }
    this.hist.push({ x, t });
    while (this.hist.length && t - this.hist[0].t > 700) this.hist.shift();

    const first = this.hist.find((s) => t - s.t <= this.windowMs);
    if (!first) return null;
    const dt = (t - first.t) / 1000;
    if (dt < 0.05) return null;
    const dx = x - first.x;
    const v = dx / dt;
    if (Math.abs(dx) < this.minDistance || Math.abs(v) < this.minVelocity) return null;

    // Onset gerakan: telusuri mundur selama tangan masih bergerak ke arah yang sama
    const sign = Math.sign(dx);
    let k = this.hist.length - 1;
    while (k > 0 && (this.hist[k].x - this.hist[k - 1].x) * sign > 0.002) k--;
    const onset = this.hist[k].t;

    this.coolUntil = t + this.cooldownMs;
    this.hist = [];
    return { dir: sign > 0 ? 'right' : 'left', onset, velocity: v };
  }
}
const swipe = new SwipeDetector({
  windowMs: CONFIG.swipeWindowMs,
  minVelocity: CONFIG.swipeMinVelocity,
  minDistance: CONFIG.swipeMinDistance,
  cooldownMs: CONFIG.swipeCooldownMs,
});

async function initVision() {
  const idealW = 1920;
  const idealH = 1080;
  const idealFps = 60;

  const highQualityConstraints = {
    audio: false,
    video: {
      width: { ideal: idealW, max: 3840 },
      height: { ideal: idealH, max: 2160 },
      frameRate: { ideal: idealFps, min: 30 },
      facingMode: 'user',
    },
  };

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia(highQualityConstraints);
  } catch (err) {
    console.warn('[Camera] Fallback default:', err);
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');
    const currentTrack = stream.getVideoTracks()[0];
    const currentLabel = (currentTrack?.label || '').toLowerCase();
    const iriun = videoDevices.find((d) => /iriun|iphone|apple/i.test(d.label));
    if (iriun && !currentLabel.includes('iriun') && !currentLabel.includes('iphone')) {
      currentTrack.stop();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: iriun.deviceId },
          width: { ideal: idealW, max: 3840 },
          height: { ideal: idealH, max: 2160 },
          frameRate: { ideal: idealFps, min: 30 },
        },
      });
    }
  } catch (_) {}

  video.srcObject = stream;
  await video.play();
  const track = stream.getVideoTracks()[0];
  const s = track?.getSettings ? track.getSettings() : {};
  const resLabel = s.height >= 1080 ? 'CAM 1080p ✓' : s.height >= 720 ? 'CAM 720p ✓' : 'CAM ✓';
  setChip('chip-cam', true, resLabel);

  hands = new Hands({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${CONFIG.mediapipeVersion}/${f}`,
  });
  hands.setOptions({
    maxNumHands: CONFIG.maxNumHands,
    modelComplexity: CONFIG.modelComplexity,
    minDetectionConfidence: CONFIG.minDetectionConfidence,
    minTrackingConfidence: CONFIG.minTrackingConfidence,
  });
  hands.onResults(onHandResults);
  await hands.initialize();
  vision.ready = true;
}

/** Kirim frame baru ke MediaPipe (maksimal 1 frame in-flight agar tidak menumpuk/lag). */
function pumpVision() {
  if (!vision.ready || vision.busy || video.readyState < 2) return;
  if (video.currentTime === vision.lastVideoTime) return;
  vision.lastVideoTime = video.currentTime;
  vision.busy = true;
  vision.pendingTs = now();
  hands.send({ image: video })
    .catch((e) => console.error('[MediaPipe]', e))
    .finally(() => { vision.busy = false; });
}

function onHandResults(res) {
  const ts = vision.pendingTs;
  const raw = res.multiHandLandmarks && res.multiHandLandmarks[0];
  if (raw) {
    // Cerminkan sumbu X + terapkan EMA ringan pada 21 titik agar skeleton mulus 60fps
    const mirrored = raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
    if (vision.lm && vision.lm.length === mirrored.length) {
      vision.lm = mirrored.map((p, i) => ({
        x: vision.lm[i].x * 0.35 + p.x * 0.65,
        y: vision.lm[i].y * 0.35 + p.y * 0.65,
        z: vision.lm[i].z * 0.35 + p.z * 0.65,
      }));
    } else {
      vision.lm = mirrored;
    }
    vision.handVisible = true;
    vision.lastSeen = ts;
    processHand(vision.lm, ts);
  } else {
    vision.lm = null;
    if (ts - vision.lastSeen > 300) vision.handVisible = false;
    processNoHand(ts);
  }
}

function processHand(m, ts) {
  // Gunakan titik pusat telapak (palmCenter) untuk swipe agar lebih stabil daripada ujung pergelangan
  const pc = palmCenterOf(m);
  vision.wristTrail.push({ x: pc.x, y: pc.y, t: ts });
  while (vision.wristTrail.length && ts - vision.wristTrail[0].t > 350) vision.wristTrail.shift();

  if (state.phase === 'calib') updateCalibration(m, ts);

  // Swipe hanya dievaluasi di fase yang membutuhkannya
  if (['fixation', 'stim-kin', 'result'].includes(state.phase) && (state.phase !== 'fixation' || state.current === 'kinestetik')) {
    const s = swipe.update(pc.x, ts);
    if (s) onSwipe(s, ts);
  } else {
    swipe.reset();
  }
}

function processNoHand(ts) {
  if (ts - vision.lastSeen > 200) swipe.reset();
  if (state.phase === 'calib') {
    if (calib.drawing && calib.currentShape.length) {
      calib.shapes.push(calib.currentShape);
    }
    calib.currentShape = [];
    calib.current = null;
    calib.drawing = false;
    calib.dragging = false;
    calib.selectedShape = null;
    calib.movePrev = null;
    calib.clearWasActive = false;
    calib.gestureMode = 'none';
    if (calib.fistStart && ts - calib.lastFist > CONFIG.fistGraceMs) { calib.fistStart = null; calib.progress = 0; }
  }
}

function onSwipe(s, ts) {
  if (state.phase === 'fixation') { prematureResponse(); return; }
  if (state.phase === 'stim-kin') {
    if (s.dir === 'right') {
      const t = Math.max(s.onset, state.stimT0); // RT = onset gerakan
      recordResult('kinestetik', t - state.stimT0);
    } else {
      registerError('kinestetik', '⬅ Itu arah PANAHNYA! Ikuti <b>TULISANNYA</b>.');
    }
    return;
  }
  if (state.phase === 'result' && s.dir === 'right' && now() >= state.resetUnlockAt) resetGame();
}

/* ---------------------------------------------------------------------
   6. TAHAP 1 – AIR SIGNATURE & KALIBRASI
   --------------------------------------------------------------------- */
function startCalibration() {
  state.phase = 'calib';
  state.current = null;
  document.body.classList.add('cam-active');
  Object.assign(calib, {
    strokes: [], current: null, ink: 0, startedAt: now(),
    shapes: [], currentShape: [], selectedShape: null,
    dragging: false, movePrev: null, clearWasActive: false,
    particles: [],
    tip: null, rawTip: null, tipVel: 0,
    drawing: false, penDownCount: 0, penUpCount: 0,
    gestureMode: 'none', sparks: [],
    fistEnabled: false, fistStart: null, lastFist: 0, progress: 0,
  });
  $('calib-title').textContent = 'Gambar Inisialmu';
  $('calib-title').classList.remove('ready');
  $('fist-box').style.opacity = 0;
  $('fist-bar').style.width = '0%';
  if ($('ink-bar')) $('ink-bar').style.width = '0%';
  if ($('ink-pct')) $('ink-pct').textContent = '0%';
  showScreen('calib');
  setStep(1);
  setGameMode(false);
  dimCam(false);
  refreshPadUI();
}

function spawnStarParticles(shape) {
  for (const st of shape) {
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.002 + Math.random() * 0.006;
      // Studio Noir: champagne gold & crisp ivory sparks
      const isGold = Math.random() > 0.45;
      const r = isGold ? 234 : 244;
      const g = isGold ? 179 : 244;
      const b = isGold ? 8 : 240;
      calib.particles.push({
        x: st.x,
        y: st.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 35,
        maxLife: 35,
        color: `rgb(${r},${g},${b})`,
      });
    }
  }
}

function clearCalibrationInk() {
  for (const shape of calib.shapes) spawnStarParticles(shape);
  if (calib.currentShape.length) spawnStarParticles(calib.currentShape);
  calib.shapes = [];
  calib.currentShape = [];
  calib.selectedShape = null;
  calib.dragging = false;
  calib.movePrev = null;
  calib.strokes = [];
  calib.current = null;
  calib.sparks = [];
  calib.drawing = false;
  sfx.tick();
}

function getSelectedStarShape(x, y) {
  for (let i = calib.shapes.length - 1; i >= 0; i--) {
    const shape = calib.shapes[i];
    for (const st of shape) {
      if (Math.hypot(x - st.x, y - st.y) < 0.035) {
        return shape;
      }
    }
  }
  return null;
}

function updateCalibration(m, ts) {
  const raw = m[8];
  if (!calib.tip) {
    calib.tip = { x: raw.x, y: raw.y };
  } else {
    const delta = dist(raw, calib.tip);
    const alpha = Math.min(0.85, Math.max(0.32, delta * 14));
    calib.tip = {
      x: calib.tip.x * (1 - alpha) + raw.x * alpha,
      y: calib.tip.y * (1 - alpha) + raw.y * alpha,
    };
    calib.tipVel = delta;
  }

  const g = checkDrawGesture(m, calib.drawing);
  calib.gestureMode = g.mode;

  // Hysteresis 2 frame untuk DRAW agar tidak berkedip saat mulai/berhenti menulis
  if (g.mode === 'draw') {
    calib.penDownCount++;
    calib.penUpCount = 0;
  } else {
    calib.penUpCount++;
    calib.penDownCount = 0;
  }

  if (!calib.drawing && calib.penDownCount >= 2) {
    calib.currentShape = [];
    calib.drawing = true;
  } else if (calib.drawing && calib.penUpCount >= 2) {
    if (calib.currentShape.length) {
      calib.shapes.push(calib.currentShape);
    }
    calib.currentShape = [];
    calib.drawing = false;
  }

  // --- DRAW: tambah stempel bintang saat mode drawing aktif ---
  if (calib.drawing && g.mode === 'draw') {
    const last = calib.currentShape[calib.currentShape.length - 1];
    const stepDist = last ? Math.hypot(calib.tip.x - last.x, calib.tip.y - last.y) : Infinity;
    if (stepDist >= 0.022) {
      if (last) calib.ink += stepDist;
      else calib.ink += 0.022;
      calib.currentShape.push({
        x: calib.tip.x,
        y: calib.tip.y,
        stampIdx: Math.floor(Math.random() * STAR_STAMPS.length),
        angle: Math.random() * 360,
        speed: [-3, -2, -1, 1, 2, 3][Math.floor(Math.random() * 6)],
      });
    }
  }

  // --- MOVE: cubit (pinch jempol + telunjuk) ---
  const moveX = (m[4].x + m[8].x) / 2;
  const moveY = (m[4].y + m[8].y) / 2;
  if (g.mode === 'move') {
    if (!calib.dragging) {
      calib.selectedShape = getSelectedStarShape(moveX, moveY);
      if (calib.selectedShape) {
        calib.dragging = true;
        calib.movePrev = { x: moveX, y: moveY };
      }
    } else if (calib.selectedShape && calib.movePrev) {
      const dx = moveX - calib.movePrev.x;
      const dy = moveY - calib.movePrev.y;
      for (const st of calib.selectedShape) {
        st.x += dx;
        st.y += dy;
      }
      calib.movePrev = { x: moveX, y: moveY };
    }
  } else {
    calib.dragging = false;
    calib.selectedShape = null;
    calib.movePrev = null;
  }

  // --- CLEAR: tahan 5 jari terbuka selama 700ms agar tidak sengaja terhapus saat berhenti nulis ---
  if (g.mode === 'clear') {
    if (!calib.clearStart) calib.clearStart = ts;
    if (!calib.clearWasActive && ts - calib.clearStart >= 700) {
      clearCalibrationInk();
      calib.clearWasActive = true;
    }
  } else {
    calib.clearStart = null;
    calib.clearWasActive = false;
  }

  // Evaluasi kepalan tangan (Fist) untuk memulai game
  const fist = g.mode === 'fist';
  if (!calib.fistEnabled) return;
  if (fist) {
    if (!calib.fistStart) calib.fistStart = ts;
    calib.lastFist = ts;
    calib.progress = Math.min(1, (ts - calib.fistStart) / CONFIG.fistHoldMs);
    if (calib.progress >= 1) finishCalibration();
  } else if (calib.fistStart && ts - calib.lastFist > CONFIG.fistGraceMs) {
    calib.fistStart = null;
    calib.progress = 0;
  }
}

function tickCalibration() {
  const inkRatio = Math.min(1, calib.ink / CONFIG.minInkToUnlockFist);
  if ($('ink-bar')) $('ink-bar').style.width = `${(inkRatio * 100).toFixed(0)}%`;
  if ($('ink-pct')) $('ink-pct').textContent = `${(inkRatio * 100).toFixed(0)}%`;

  // Update indikator status gestur
  const badge = $('gesture-badge');
  if (badge) {
    const base = 'calib-card font-mono text-[11px] font-bold px-3 py-1 transition-colors';
    if (!vision.handVisible) {
      badge.textContent = 'Tangan belum terdeteksi';
      badge.className = `${base} text-zinc-500`;
    } else if (calib.gestureMode === 'fist') {
      badge.textContent = 'Kepal ditahan';
      badge.className = `${base} !bg-[#fde047]`;
    } else if (calib.gestureMode === 'clear') {
      badge.textContent = 'Menghapus coretan';
      badge.className = `${base} !bg-[#fb923c]`;
    } else if (calib.gestureMode === 'move') {
      badge.textContent = 'Menggeser bentuk';
      badge.className = `${base} !bg-[#e0f2fe]`;
    } else if (calib.drawing) {
      badge.textContent = 'Menggambar';
      badge.className = `${base} !bg-[#38bdf8]`;
    } else {
      badge.textContent = 'Angkat 1 telunjuk';
      badge.className = `${base}`;
    }
  }

  if (!calib.fistEnabled &&
      (calib.ink >= CONFIG.minInkToUnlockFist || now() - calib.startedAt > CONFIG.calibMaxWaitMs)) {
    calib.fistEnabled = true;
    $('fist-box').style.opacity = 1;
    $('calib-title').textContent = 'Kepal Tangan';
    $('calib-title').classList.add('ready');
    sfx.tick();
  }
  $('fist-bar').style.width = `${(calib.progress * 100).toFixed(1)}%`;
  $('fist-label').textContent = `${(calib.progress * 2).toFixed(1)} / 2.0s`;
}

function finishCalibration() {
  state.phase = 'feedback';
  sfx.good();
  flash('good');
  later(() => showIntro('visual'), 600);
}

/* ---------------------------------------------------------------------
   7. TAHAP 2–4 – INTRO, COUNTDOWN, FIKSASI, STIMULUS
   --------------------------------------------------------------------- */
function showIntro(key) {
  const t = TESTS[key];
  state.current = key;
  state.phase = t.input === 'pad' ? 'intro-pad' : 'intro-hand';
  state.introReadyAt = now() + CONFIG.introReadDelayMs;
  state.handStableSince = null;

  $('intro-tag').textContent = t.tag;
  $('intro-title').innerHTML = t.title;
  $('intro-sub').textContent = t.sub;
  $('intro-legend').innerHTML = t.input === 'pad' ? legendHTML(key === 'visual' ? 'visual' : 'shapes') : '';
  showScreen('intro');
  setStep(t.step);
  setGameMode(t.input === 'pad');
  dimCam(false);
  refreshPadUI();
}

function tickIntro() {
  const ready = $('intro-ready');
  const t = now();
  if (state.phase === 'intro-pad') {
    if (!padConnected()) ready.textContent = 'Menunggu controller PS3 terhubung';
    else if (t < state.introReadyAt) ready.textContent = 'Baca instruksi singkat di atas';
    else ready.textContent = 'Controller siap. Tekan tombol apa saja untuk mulai';
  } else if (state.phase === 'intro-hand') {
    if (t >= state.introReadyAt && vision.handVisible) {
      state.handStableSince ??= t;
      const left = Math.max(0, 1000 - (t - state.handStableSince));
      ready.textContent = `Tangan terdeteksi, tahan ${(left / 1000).toFixed(1)}s`;
      if (left === 0) startCountdown();
    } else {
      state.handStableSince = null;
      ready.textContent = 'Arahkan tangan ke depan kamera';
    }
  }
}

function startCountdown() {
  state.phase = 'count';
  showScreen('count');
  const el = $('count-num');
  el.style.fontSize = '';
  let n = 3;
  const step = () => {
    if (n === 0) { startFixation(); return; }
    el.textContent = n;
    sfx.tick();
    n--;
    later(step, CONFIG.countdownStepMs);
  };
  step();
  refreshPadUI();
}

function startFixation() {
  state.phase = 'fixation';
  const el = $('count-num');
  el.style.fontSize = '';
  el.textContent = '+';
  swipe.reset();
  state.fixTimer = later(presentStimulus, rand(CONFIG.fixationMinMs, CONFIG.fixationMaxMs));
}

function prematureResponse() {
  clearTimeout(state.fixTimer);
  state.phase = 'count';
  sfx.bad();
  flash('bad');
  const el = $('count-num');
  el.style.fontSize = 'clamp(2.5rem, 6vw, 5rem)';
  el.textContent = 'TERLALU CEPAT! TUNGGU…';
  later(startFixation, 1200);
}

function presentStimulus() {
  const key = state.current;
  const holder = $('stim-holder');
  setFeedback('');
  $('stim-legend').innerHTML = '';

  if (key === 'visual') {
    // Teks "BIRU" dengan tinta MERAH (#FF0000) → jawaban benar: Lingkaran (index 1)
    holder.innerHTML = '<div class="stim-word" style="color:#FF0000;text-shadow:0 0 40px rgba(255,0,0,.55)">BIRU</div>';
    $('stim-legend').innerHTML = legendHTML('visual');
    showScreen('stim');
    state.phase = 'stim-visual';
    markOnset(now());
  } else if (key === 'auditori') {
    // Layar "KOTAK", suara "SEGITIGA" → jawaban benar: Segitiga (index 3)
    holder.innerHTML = '<div class="speaker-pulse">🔊</div><div class="stim-word" style="color:#e2e8f0">KOTAK</div>';
    $('stim-legend').innerHTML = legendHTML('shapes');
    showScreen('stim');
    state.phase = 'stim-audio';
    state.stimT0 = null;              // RT dihitung sejak suara mulai terdengar
    state.timeoutAt = Infinity;
    const s = state.session;
    voice.play().then((tOnset) => { if (s === state.session && state.phase === 'stim-audio') markOnset(tOnset); });
  } else {
    // Panah ke KIRI berisi tulisan "KANAN" → jawaban benar: swipe ke KANAN
    holder.innerHTML = `
      <div class="arrow-wrap">
        <svg viewBox="0 0 1000 400" aria-hidden="true">
          <defs><linearGradient id="ag" x1="0" x2="1">
            <stop offset="0" stop-color="#ff2bd6"/><stop offset="1" stop-color="#00f0ff"/>
          </linearGradient></defs>
          <polygon points="0,200 320,0 320,110 1000,110 1000,290 320,290 320,400" fill="url(#ag)"/>
        </svg>
        <div class="arrow-label">KANAN</div>
      </div>`;
    showScreen('stim');
    state.phase = 'stim-kin';
    swipe.reset();
    markOnset(now());
  }
  refreshPadUI();
}

function markOnset(t) {
  state.stimT0 = t;
  state.timeoutAt = t + CONFIG.trialTimeoutMs;
}

function handlePadResponse(btn, t) {
  hitKey(btn);
  const key = state.current;
  if (state.stimT0 == null) { setFeedback('Dengarkan suaranya dulu…', '#ffb800'); return; }
  if (btn === TESTS[key].correct) {
    recordResult(key, t - state.stimT0);
  } else if (key === 'visual') {
    registerError(key, btn === BTN.CROSS
      ? '✕ Itu arti KATANYA (BIRU)! Lihat <b>WARNA TINTANYA</b>.'
      : 'Salah tombol! Perhatikan <b>WARNA TINTA</b>.');
  } else {
    registerError(key, btn === BTN.SQUARE
      ? '□ Itu tulisan di LAYAR! <b>Dengarkan suaranya</b>.'
      : 'Salah! Tombol mana yang <b>disebutkan suara</b>?');
  }
}

function registerError(key, msg) {
  state.errors[key]++;
  sfx.bad();
  flash('bad');
  setFeedback(`${msg} <span class="text-slate-500">(salah ×${state.errors[key]})</span>`, '#ff3355');
}

function recordResult(key, rtRaw, timedOut = false) {
  const rt = Math.max(0, Math.round(rtRaw + state.errors[key] * CONFIG.errorPenaltyMs));
  state.rt[key] = rt;
  state.timedOut[key] = timedOut;
  state.phase = 'feedback';
  if (timedOut) {
    sfx.bad();
    setFeedback(`⏱ WAKTU HABIS — dicatat ${rt} ms`, '#ffb800');
  } else {
    sfx.good();
    flash('good');
    if (TESTS[key].correct != null) hitKey(TESTS[key].correct);
    setFeedback(`✔ BENAR · waktu reaksi <b>${rt} ms</b>`, '#b6ff3b');
  }
  console.info(`[RT] rt_${key} = ${rt} ms (errors=${state.errors[key]}${timedOut ? ', timeout' : ''})`);
  refreshPadUI();
  later(() => {
    const i = ORDER.indexOf(key);
    if (i < ORDER.length - 1) showIntro(ORDER[i + 1]);
    else showResult();
  }, 1500);
}

function tickTrial() {
  if (state.phase.startsWith('stim-') && now() > state.timeoutAt) {
    recordResult(state.current, CONFIG.trialTimeoutMs, true);
  }
}

/* ---------------------------------------------------------------------
   8. TAHAP 5 – HASIL & QR
   --------------------------------------------------------------------- */
function winnerOf(rt) {
  // Waktu terkecil = gaya belajar utama (seri → urutan V, A, K)
  return ORDER.reduce((best, k) => (rt[k] < rt[best] ? k : best), ORDER[0]);
}

function showResult({ shared = false } = {}) {
  state.phase = 'result';
  state.current = null;
  const rt = state.rt;
  const win = winnerOf(rt);
  const info = STYLE_INFO[win];

  const styleEl = $('res-style');
  styleEl.textContent = info.label;
  styleEl.dataset.text = info.label;
  styleEl.style.color = info.color;
  styleEl.style.textShadow = `0 0 12px ${info.color}, 0 0 48px ${info.color}66`;
  $('res-tip').textContent = info.tip;

  const minRt = Math.min(...ORDER.map((k) => rt[k]));
  $('res-bars').innerHTML = ORDER.map((k) => {
    const s = STYLE_INFO[k];
    const isWin = k === win;
    const extra = shared ? '' :
      `${state.errors[k] ? ` · ${state.errors[k]} salah` : ''}${state.timedOut[k] ? ' · timeout' : ''}`;
    return `
      <div>
        <div class="flex justify-between mb-1 ${isWin ? '' : 'text-slate-400'}">
          <span style="${isWin ? `color:${s.color}` : ''}">${isWin ? '▶ ' : ''}rt_${k}</span>
          <span>${rt[k]} ms<span class="text-slate-500">${extra}</span></span>
        </div>
        <div class="bar-track"><div class="bar-fill" data-w="${((minRt / Math.max(rt[k], 1)) * 100).toFixed(1)}"
             style="background:${s.color};box-shadow:0 0 12px ${s.color};opacity:${isWin ? 1 : 0.45}"></div></div>
      </div>`;
  }).join('') + '<p class="text-[11px] text-slate-500 pt-1">Bar lebih panjang = respons lebih cepat</p>';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.bar-fill').forEach((b) => { b.style.width = `${b.dataset.w}%`; });
  }));

  renderQR(buildQrPayload(win));

  $('reset-hint').classList.toggle('hidden', shared);
  showScreen('result');
  setStep(5);
  setGameMode(true);
  dimCam(false);
  refreshPadUI();

  if (!shared) {
    sfx.fanfare();
    state.resetUnlockAt = now() + CONFIG.resetLockMs;
    state.autoResetAt = now() + CONFIG.autoResetMs;
  }
}

function buildQrPayload(win) {
  const r = state.rt;
  const ident = typeof loadIdentity === 'function' ? loadIdentity() : null;
  const pid = ident?.id || "VAK-2026";
  let params = `r=${STYLE_INFO[win].code}&id=${encodeURIComponent(pid)}&v=${r.visual}&a=${r.auditori}&k=${r.kinestetik}`;
  if (ident?.signatureVector) {
    params += `&sig=${encodeURIComponent(ident.signatureVector)}`;
  }
  if (ident?.photoServerUrl) {
    params += `&photo=${encodeURIComponent(ident.photoServerUrl)}`;
  }
  const isLocal = location.protocol === 'file:' || /^(localhost|127\.|\[::1\])/.test(location.hostname);
  if (CONFIG.resultBaseUrl) return `${CONFIG.resultBaseUrl}?${params}`;
  if (!isLocal) return `${location.origin}${location.pathname}?${params}`;
  // Fallback offline: teks ringkasan (tetap bisa di-scan HP tanpa internet)
  return `STROOP'S PARADOX: V-A-K TEST\nGaya belajar: ${STYLE_INFO[win].label}\n` +
    `Visual ${r.visual} ms | Auditori ${r.auditori} ms | Kinestetik ${r.kinestetik} ms\n` +
    `Saran: ${STYLE_INFO[win].tip}`;
}

function renderQR(text) {
  const box = $('qrcode');
  box.innerHTML = '';
  if (typeof QRCode === 'undefined') { box.textContent = 'QR library gagal dimuat'; return; }
  new QRCode(box, {
    text, width: 200, height: 200,
    colorDark: '#05050a', colorLight: '#e0fbff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function tickResult() {
  const left = state.resetUnlockAt - now();
  $('reset-lock').textContent = left > 0 ? `reset aktif dalam ${(left / 1000).toFixed(1)} s` : 'atau tekan START di controller';
  if (now() > state.autoResetAt) resetGame();
}

/** Mode "lihat hasil" saat QR dibuka di HP: index.html?r=V&v=..&a=..&k=.. */
function showSharedResult(qs) {
  const n = (k) => Number(qs.get(k)) || 0;
  state.rt = { visual: n('v'), auditori: n('a'), kinestetik: n('k') };
  $('hud').classList.remove('hidden');
  $('stepper').style.display = 'none';
  setGameMode(true);
  dimCam(false);
  showResult({ shared: true });
  state.phase = 'shared'; // mode baca-saja: tanpa kamera, tanpa reset
}

/* ---------------------------------------------------------------------
   9. RESET
   --------------------------------------------------------------------- */
function resetGame() {
  abortPending();
  state.rt = { visual: null, auditori: null, kinestetik: null };
  state.errors = { visual: 0, auditori: 0, kinestetik: 0 };
  state.timedOut = { visual: false, auditori: false, kinestetik: false };
  state.stimT0 = null;
  state.timeoutAt = Infinity;
  state.autoResetAt = Infinity;
  swipe.reset();
  sfx.tick();
  startCalibration();
}

/* ---------------------------------------------------------------------
   10. RENDER CANVAS (trail, skeleton, ring kepalan, jejak swipe)
   --------------------------------------------------------------------- */
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Pemetaan koordinat video (object-fit: cover) → layar
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s;
  return { W, H, ox: (W - dw) / 2, oy: (H - dh) / 2, dw, dh };
}
const toScreen = (p, M) => ({ x: M.ox + p.x * M.dw, y: M.oy + p.y * M.dh });

// Posisi teratur membingkai tipografi (kiri & kanan, tidak menutupi teks tengah/header)
const LOBBY_STAR_SLOTS = [
  { ax: 0.08, ay: 0.22, size: 54, stampIdx: 0, baseRot: -12, phase: 0.0 },
  { ax: 0.16, ay: 0.38, size: 42, stampIdx: 3, baseRot: 10,  phase: 0.8 },
  { ax: 0.07, ay: 0.56, size: 50, stampIdx: 6, baseRot: -8,  phase: 1.6 },
  { ax: 0.14, ay: 0.74, size: 44, stampIdx: 9, baseRot: 14,  phase: 2.4 },
  { ax: 0.92, ay: 0.24, size: 54, stampIdx: 12, baseRot: 12, phase: 0.4 },
  { ax: 0.84, ay: 0.40, size: 42, stampIdx: 15, baseRot: -10, phase: 1.2 },
  { ax: 0.93, ay: 0.58, size: 50, stampIdx: 18, baseRot: 8,  phase: 2.0 },
  { ax: 0.86, ay: 0.75, size: 44, stampIdx: 21, baseRot: -14, phase: 2.8 },
];
const lobbySparks = [];

window.addEventListener('pointermove', (e) => {
  if (state.phase !== 'boot') return;
  if (Math.random() > 0.6) return;
  lobbySparks.push({
    x: e.clientX,
    y: e.clientY,
    vx: (Math.random() - 0.5) * 1.2,
    vy: -0.9 - Math.random() * 0.9,
    size: 15 + Math.random() * 10,
    angle: Math.random() * 360,
    speed: (Math.random() > 0.5 ? 1 : -1) * 2.2,
    stampIdx: Math.floor(Math.random() * STAR_STAMPS.length),
    life: 24,
    maxLife: 24,
  });
});

function renderLobbyStars(M, t) {
  ctx.save();
  ctx.shadowColor = 'rgba(17, 17, 19, 0.85)';
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 0;

  for (const st of LOBBY_STAR_SLOTS) {
    const bobY = Math.sin(t * 0.0018 + st.phase) * 10;
    const tilt = st.baseRot + Math.sin(t * 0.0014 + st.phase) * 7;
    const pulse = 1 + Math.sin(t * 0.002 + st.phase) * 0.05;
    const sz = st.size * pulse;

    const img = STAR_STAMPS[st.stampIdx];
    const px = st.ax * M.W;
    const py = st.ay * M.H + bobY;

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((tilt * Math.PI) / 180);
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
  }

  for (let i = lobbySparks.length - 1; i >= 0; i--) {
    const sp = lobbySparks[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.vy += 0.06;
    sp.angle = (sp.angle + sp.speed + 360) % 360;
    sp.life -= 1;
    const k = Math.max(0, sp.life / sp.maxLife);
    const sz = sp.size * k;
    const img = STAR_STAMPS[sp.stampIdx];
    if (img && img.complete && img.naturalWidth > 0 && sz > 2) {
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(sp.x, sp.y);
      ctx.rotate((sp.angle * Math.PI) / 180);
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    if (sp.life <= 0) lobbySparks.splice(i, 1);
  }
  ctx.restore();
}

function render() {
  const M = fitCanvas();
  ctx.clearRect(0, 0, M.W, M.H);
  const t = now();

  if (state.phase === 'boot') {
    renderLobbyStars(M, t);
  }

  // --- Star-Hand-Drawing: stempel bintang berputar + partikel ledakan (Tahap 1) ---
  if (state.phase === 'calib' || (state.phase === 'feedback' && calib.shapes.length && !state.current)) {
    const drawStarShape = (shape) => {
      for (const st of shape) {
        const img = STAR_STAMPS[st.stampIdx];
        const sc = toScreen(st, M);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.translate(sc.x, sc.y);
          ctx.rotate((st.angle * Math.PI) / 180);
          ctx.drawImage(img, -17.5, -17.5, 35, 35);
          ctx.restore();
        } else {
          ctx.fillStyle = '#00f0ff';
          ctx.beginPath();
          ctx.arc(sc.x, sc.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        st.angle = (st.angle + st.speed + 360) % 360;
      }
    };

    for (const shape of calib.shapes) drawStarShape(shape);
    if (calib.currentShape.length) drawStarShape(calib.currentShape);

    for (let i = calib.particles.length - 1; i >= 0; i--) {
      const p = calib.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.00015;
      p.vx *= 0.98;
      p.life -= 1;
      const sc = toScreen(p, M);
      const radius = Math.max(1, (3 * p.life) / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (p.life <= 0) calib.particles.splice(i, 1);
    }
  }

  const m = vision.lm;
  if (!m || state.phase === 'boot') return;

  // --- Skeleton tangan ---
  const pts = m.map((p) => toScreen(p, M));
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(244, 244, 240, 0.42)';
  ctx.beginPath();
  for (const [a, b] of HAND_EDGES) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
  ctx.stroke();
  ctx.fillStyle = '#eab308';
  for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill(); }

  // --- Kursor ujung telunjuk (Tahap 1) ---
  if (state.phase === 'calib' && calib.tip) {
    const c = toScreen(calib.tip, M);
    const drawing = calib.drawing && calib.gestureMode !== 'fist';
    if (drawing) {
      // Pena turun (Menulis): titik terang putih + cincin champagne gold
      ctx.fillStyle = '#f4f4f0';
      ctx.shadowColor = '#eab308';
      ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, Math.PI * 2); ctx.stroke();
    } else {
      // Pena diangkat (Hover): cincin putus-putus transparan
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 244, 240, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // --- Ring progres kepalan ---
  if (state.phase === 'calib' && calib.fistEnabled && calib.progress > 0) {
    const c = toScreen({ x: (m[0].x + m[5].x + m[9].x + m[17].x) / 4, y: (m[0].y + m[5].y + m[9].y + m[17].y) / 4 }, M);
    const r = dist(pts[0], pts[9]) * 1.1 + 20;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#eab308'; ctx.shadowColor = '#eab308'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + calib.progress * Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // --- Jejak komet pergelangan (swipe) ---
  if (['stim-kin', 'result', 'fixation', 'intro-hand', 'count'].includes(state.phase) && vision.wristTrail.length > 1) {
    const tr = vision.wristTrail.map((p) => toScreen(p, M));
    for (let i = 1; i < tr.length; i++) {
      const k = i / tr.length;
      ctx.lineWidth = 4 + 18 * k;
      ctx.strokeStyle = `rgba(234, 179, 8, ${(0.6 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
    }
  }
}

/* ---------------------------------------------------------------------
   11. MAIN LOOP
   --------------------------------------------------------------------- */
function loop() {
  pollGamepad();
  pumpVision();

  switch (state.phase) {
    case 'calib': tickCalibration(); break;
    case 'intro-pad':
    case 'intro-hand': tickIntro(); break;
    case 'stim-visual':
    case 'stim-audio':
    case 'stim-kin': tickTrial(); break;
    case 'result': tickResult(); break;
  }
  if (state.phase !== 'boot') setChip('chip-hand', vision.handVisible, vision.handVisible ? 'HAND ✓' : 'HAND ✕');
  bgm.syncPhase(state.phase);
  refreshPadUI();
  render();
  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------------
   12. BOOT & KEYBOARD OPERATOR
   --------------------------------------------------------------------- */
async function boot() {
  const status = $('boot-status');
  const btn = $('btn-boot');
  btn.disabled = true;
  // User gesture: buka kunci AudioContext & speechSynthesis + fullscreen
  sfx.init();
  voice.init();
  document.documentElement.requestFullscreen?.().catch(() => {});

  try {
    status.textContent = '▸ Mengaktifkan kamera…';
    await initVision();
    status.textContent = '▸ Model AI siap.';
    $('hud').classList.remove('hidden');
    startCalibration();
  } catch (err) {
    console.error(err);
    setChip('chip-cam', false, 'CAM ✕');
    status.textContent = err && err.name === 'NotAllowedError'
      ? '✕ Izin kamera ditolak. Izinkan akses kamera lalu klik lagi.'
      : `✕ Gagal memulai: ${err && err.message ? err.message : err}. Pastikan dibuka via http://localhost & ada internet (CDN).`;
    btn.disabled = false;
  }
}

$('btn-boot').addEventListener('click', boot);

/* ---------------------------------------------------------------------
   13. HARDWARE DIAGNOSTIC MODAL & PRESETS
   --------------------------------------------------------------------- */
let diagModalOpen = false;

function toggleDiagModal(show) {
  diagModalOpen = typeof show === 'boolean' ? show : !diagModalOpen;
  $('gamepad-diag').classList.toggle('hidden', !diagModalOpen);
  if (diagModalOpen) updateDiagUI();
}

function updateDiagUI() {
  const gp = getPad();
  $('diag-id').textContent = gp ? gp.id : 'Controller tidak terhubung';
  $('diag-mapping').textContent = gp ? (gp.mapping || 'non-standard (raw Linux)') : '-';
  $('diag-preset').textContent = PRESETS[activePresetKey].name;

  $('map-circle').textContent = `Index ${BTN.CIRCLE}`;
  $('map-triangle').textContent = `Index ${BTN.TRIANGLE}`;
  $('map-cross').textContent = `Index ${BTN.CROSS}`;
  $('map-square').textContent = `Index ${BTN.SQUARE}`;

  document.querySelectorAll('.preset-btn').forEach((b) => {
    const isAct = b.dataset.preset === activePresetKey;
    b.classList.toggle('border-neon-cyan', isAct);
    b.classList.toggle('text-neon-cyan', isAct);
    b.classList.toggle('bg-neon-cyan/20', isAct);
  });
}

function renderDiagButtons(gp) {
  const container = $('diag-buttons-grid');
  if (!container) return;
  const count = gp.buttons.length;
  // Buat element jika jumlahnya berubah
  if (container.children.length !== count) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      d.id = `diag-btn-${i}`;
      d.className = 'p-1.5 rounded bg-white/5 border border-white/10 transition-colors';
      d.innerHTML = `<div class="font-bold">B${i}</div><div class="text-[9px] text-slate-400">0.0</div>`;
      container.appendChild(d);
    }
  }

  // Update nilai tombol live
  gp.buttons.forEach((b, i) => {
    const el = $(`diag-btn-${i}`);
    if (!el) return;
    const pressed = b.pressed || b.value > 0.5;
    el.classList.toggle('bg-neon-pink', pressed);
    el.classList.toggle('text-black', pressed);
    el.classList.toggle('border-neon-pink', pressed);
    const sub = el.querySelector('div:last-child');
    if (sub) {
      // Tandai jika tombol ini sedang dipetakan ke aksi tertentu
      let label = b.value.toFixed(1);
      if (i === BTN.CIRCLE) label = '○';
      else if (i === BTN.TRIANGLE) label = '△';
      else if (i === BTN.CROSS) label = '✕';
      else if (i === BTN.SQUARE) label = '□';
      sub.textContent = label;
    }
  });
}

// Event listener UI diagnostic & clear ink
$('btn-clear-ink')?.addEventListener('click', () => clearCalibrationInk());
$('diag-close')?.addEventListener('click', () => toggleDiagModal(false));
$('chip-pad')?.addEventListener('click', () => toggleDiagModal());
document.querySelectorAll('.preset-btn').forEach((b) => {
  b.addEventListener('click', (e) => {
    setGamepadPreset(e.target.dataset.preset);
    sfx.tick();
  });
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'Tab') {
    e.preventDefault();
    toggleDiagModal();
    return;
  }
  if (e.key === 'Escape' && diagModalOpen) {
    toggleDiagModal(false);
    return;
  }
  if (e.repeat) return;
  if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
  } else if (state.phase === 'shared') {
    return;
  } else if (k === 'c' && state.phase === 'calib') {
    clearCalibrationInk();
  } else if (k === 'r' && state.phase !== 'boot') {
    resetGame();
  } else if (state.phase === 'boot' && k === 'enter') {
    boot();
  } else if (CONFIG.debugKeys && state.phase !== 'boot') {
    // Simulasi tanpa hardware: 0..3 = tombol ✕ ○ □ △ , ←/→ = swipe
    if (['0', '1', '2', '3'].includes(k)) onButtonDown(Number(k), now());
    if (k === ' ' && state.phase === 'intro-pad') onButtonDown(BTN.CROSS, now());
    if (k === 'arrowright' || k === 'arrowleft') {
      const t = now();
      onSwipe({ dir: k === 'arrowright' ? 'right' : 'left', onset: t }, t);
    }
  }
});

/* Event listener tombol musik lobi */
$('btn-bgm')?.addEventListener('click', (e) => {
  e.stopPropagation();
  bgm.toggle();
});

/* Start */
(function init() {
  const qs = new URLSearchParams(location.search);
  if (qs.has('r')) {
    showSharedResult(qs);
  } else {
    showScreen('boot');
    bgm.init();
    bgm.play();
    const unlockBgm = () => {
      if (bgm.enabled && !bgm.started) bgm.play();
      window.removeEventListener('pointerdown', unlockBgm);
      window.removeEventListener('keydown', unlockBgm);
    };
    window.addEventListener('pointerdown', unlockBgm, { once: true });
    window.addEventListener('keydown', unlockBgm, { once: true });
  }
  requestAnimationFrame(loop);
})();
