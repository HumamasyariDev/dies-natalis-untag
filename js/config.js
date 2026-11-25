export const CONFIG = {
  mediapipeVersion: '0.4.1675469240',
  poseVersion: '0.5.1675469404',
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.55,

  // Kamera / Webcam HD (Maksimal untuk iPhone 12 / Iriun Webcam)
  camIdealWidth: 1920,
  camIdealHeight: 1080,
  camIdealFps: 60,

  // Tahap 1 – Kalibrasi
  trailLifeMs: 25000,
  minInkToUnlockFist: 0.45,
  calibMaxWaitMs: 12000,
  fistHoldMs: 2000,
  fistGraceMs: 400,

  // Swipe
  swipeWindowMs: 260,
  swipeMinVelocity: 0.6,
  swipeMinDistance: 0.13,
  swipeCooldownMs: 650,

  // Tes
  introReadDelayMs: 1500,
  countdownStepMs: 700,
  fixationMinMs: 800,
  fixationMaxMs: 1600,
  trialTimeoutMs: 4000,
  errorPenaltyMs: 150,

  segitigaAudioUrl: 'assets/voice-segitiga.ogg?v=6',
  speechLang: 'id-ID',

  // Hasil
  resetLockMs: 3000,
  autoResetMs: 90000,
  resultBaseUrl: 'https://digital-plum-ftdtrsmm.edgeone.dev/scan.html',
  cloudScanUrl: 'https://digital-plum-ftdtrsmm.edgeone.dev/scan.html',
  debugKeys: true,
};

// Auto-detect Server / Tunnel Config on boot
if (typeof window !== 'undefined' && typeof fetch === 'function') {
  fetch('/api/config')
    .then(r => r.json())
    .then(cfg => {
      if (cfg && cfg.cloudScanUrl) {
        CONFIG.resultBaseUrl = cfg.cloudScanUrl;
        console.log('[Config] Permanent Cloud Scan URL:', CONFIG.resultBaseUrl);
      } else if (cfg && cfg.tunnelUrl && !CONFIG.resultBaseUrl) {
        CONFIG.resultBaseUrl = `${cfg.tunnelUrl}/scan.html`;
        console.log('[Config] Active Cloudflare Tunnel URL:', CONFIG.resultBaseUrl);
      } else if (cfg && cfg.localIps && cfg.localIps.length > 0 && !CONFIG.resultBaseUrl) {
        CONFIG.resultBaseUrl = `http://${cfg.localIps[0]}:${cfg.port}/scan.html`;
        console.log('[Config] Active Local IP URL:', CONFIG.resultBaseUrl);
      }
    })
    .catch(() => {});
}

export const PRESETS = {
  standard: {
    name: 'Standard PS3 (Kabel)',
    BTN: { CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, START: 9 },
  },
  xbox_bt: {
    name: 'Xbox / Wireless Bluetooth',
    BTN: { CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, START: 9 },
  },
  ds3_raw_linux: {
    name: 'PS3 Bluetooth Raw Linux',
    BTN: { CROSS: 14, CIRCLE: 13, SQUARE: 15, TRIANGLE: 12, START: 3 },
  },
};

export const gamepadState = {
  activePresetKey: 'standard',
  BTN: { ...PRESETS.standard.BTN },
  TEST_BUTTONS: [0, 1, 2, 3],
  diagModalOpen: false,
};

export const PS = {
  get [gamepadState.BTN.CROSS]() { return { sym: '✕', color: '#4d8dff', shape: 'SILANG' }; },
  get [gamepadState.BTN.CIRCLE]() { return { sym: '○', color: '#ff3355', shape: 'LINGKARAN' }; },
  get [gamepadState.BTN.SQUARE]() { return { sym: '□', color: '#ff2bd6', shape: 'KOTAK' }; },
  get [gamepadState.BTN.TRIANGLE]() { return { sym: '△', color: '#22e07a', shape: 'SEGITIGA' }; },
};

export function getPsStyle(btn) {
  const { BTN } = gamepadState;
  if (btn === BTN.CROSS) return { sym: '✕', color: '#2563eb', shape: 'SILANG' };
  if (btn === BTN.CIRCLE) return { sym: '○', color: '#dc2626', shape: 'LINGKARAN' };
  if (btn === BTN.SQUARE) return { sym: '□', color: '#db2777', shape: 'KOTAK' };
  if (btn === BTN.TRIANGLE) return { sym: '△', color: '#16a34a', shape: 'SEGITIGA' };
  return { sym: '?', color: '#111113', shape: '' };
}

export const ORDER = ['visual', 'auditori', 'kinestetik'];

export const TESTS = {
  visual: {
    step: 2,
    input: 'pad',
    get correct() { return gamepadState.BTN.CIRCLE; },
    set correct(_) { },
    tag: '02 · UJI VISUAL',
    line1: 'LIHAT WARNA',
    line2: 'ABAIKAN KATA',
    stampTop: 'MODE',
    stampMid: '02',
    stampBot: 'VISUAL',
    sub: 'Pilih tombol sesuai warna tintanya, bukan bacaan katanya.',
    demoLabel: 'CONTOH JEBAKAN',
    demoHtml: '<span class="font-display font-black text-xl text-[#ef4444] tracking-tight">BIRU</span> <span class="text-zinc-400 mx-1">→</span> <span class="font-mono font-bold text-xs bg-[#fee2e2] text-[#dc2626] px-2 py-0.5 rounded border border-zinc-900">○ MERAH</span>',
    leftTitle: 'PERANGKAT INPUT',
    leftDesc: 'Gunakan 4 tombol bentuk pada Controller PS3.',
    rightTitle: 'TARGET RESPON',
    rightDesc: 'Pilih warna tinta secepat mungkin tanpa salah tekan.',
  },
  auditori: {
    step: 3,
    input: 'pad',
    get correct() { return gamepadState.BTN.TRIANGLE; },
    set correct(_) { },
    tag: '03 · UJI AUDITORI',
    line1: 'DENGAR SUARA',
    line2: 'ABAIKAN LAYAR',
    stampTop: 'MODE',
    stampMid: '03',
    stampBot: 'AUDIO',
    sub: 'Tekan tombol sesuai bentuk yang diucapkan speaker, abaikan gambar raksasa yang muncul di layar.',
    demoLabel: 'CONTOH JEBAKAN',
    demoHtml: '<span class="font-mono font-bold text-xs bg-[#fce7f3] text-[#db2777] px-2 py-0.5 rounded border border-zinc-900">Layar: □ KOTAK</span> <span class="text-zinc-400 font-bold">+</span> <span class="font-mono font-bold text-xs bg-[#fef3c7] text-zinc-900 px-2 py-0.5 rounded border border-zinc-900">Suara: "LINGKARAN"</span> <span class="text-zinc-400 font-bold">→</span> <span class="font-mono font-bold text-xs bg-[#fee2e2] text-[#dc2626] px-2 py-0.5 rounded border border-zinc-900">○ LINGKARAN</span>',
    leftTitle: 'PERANGKAT INPUT',
    leftDesc: 'Gunakan 4 tombol bentuk pada Controller PS3.',
    rightTitle: 'TARGET RESPON',
    rightDesc: 'Dengarkan suara speaker dan abaikan gambar jebakan di layar.',
  },
  kinestetik: {
    step: 4,
    input: 'hand',
    tag: '04 · UJI KINESTETIK',
    line1: 'SUBWAY',
    line2: 'RUNNER 3D',
    stampTop: 'MODE',
    stampMid: '04',
    stampBot: 'RUN',
    sub: 'Hindari 10 rintangan kereta dan palang dengan gerakan bahu dan tubuhmu di depan kamera.',
    demoLabel: 'CARA MULAI',
    demoHtml: '<span class="font-mono font-bold text-xs bg-[#fef3c7] text-zinc-900 px-2.5 py-0.5 rounded border border-zinc-900">Posisikan bahu di kamera</span> <span class="text-zinc-400 font-bold">+</span> <span class="font-mono font-bold text-xs bg-[#dcfce7] text-[#15803d] px-2.5 py-0.5 rounded border border-zinc-900">Silangkan tangan di dada</span>',
    leftTitle: 'FULL-BODY CV TRACKING',
    leftDesc: 'Kamera melacak gerakan tubuhmu: loncat, menunduk, dan geser badan kiri/kanan secara real-time.',
    rightTitle: 'TARGET RESPON',
    rightDesc: 'Bereaksi secepat mungkin menghindari 10 rintangan yang menghadang di rel!',
  },
};

export const STYLE_INFO = {
  visual: {
    label: 'VISUAL',
    code: 'V',
    color: '#0284c7',
    sub: 'Memproses informasi paling efektif melalui representasi spasial, warna, bagan, dan pola visual terstruktur.',
    traits: ['Analisis Pola Visual Cepat', 'Pemetaan Spasial & Grafis', 'Memori Bentuk & Warna Kuat'],
    tipTitle: 'Catatan Cara Belajar',
    tip: 'Gunakan mind map, diagram alur, stabilo warna, dan rangkuman grafis saat mempelajari materi baru.'
  },
  auditori: {
    label: 'AUDITORI',
    code: 'A',
    color: '#db2777',
    sub: 'Lebih cepat menyerap materi melalui instruksi lisan, intonasi suara, diskusi kelompok, dan rekaman audio.',
    traits: ['Fokus Auditori Tinggi', 'Sensitivitas Nada & Ritme', 'Retensi Narasi Verbal Kuat'],
    tipTitle: 'Catatan Cara Belajar',
    tip: 'Dengarkan penjelasan lisan secara utuh, rekam dan putar ulang materi, serta diskusikan konsep secara verbal.'
  },
  kinestetik: {
    label: 'KINESTETIK',
    code: 'K',
    color: '#16a34a',
    sub: 'Paling optimal memahami konsep melalui gerakan motorik, simulasi taktil, eksperimen, dan keterlibatan aktif.',
    traits: ['Refleks Motorik Responsif', 'Memori Taktil & Eksperimen', 'Pemahaman Berbasis Praktik'],
    tipTitle: 'Catatan Cara Belajar',
    tip: 'Pelajari konsep melalui simulasi langsung, eksperimen mandiri, studi kasus nyata, dan praktik langsung.'
  },
};

export const $ = (id) => document.getElementById(id);
export const now = () => performance.now();
export const rand = (a, b) => a + Math.random() * (b - a);

export const state = {
  phase: 'boot',
  isDemo: false,
  session: 0,
  current: null,
  deck: [],
  qIndex: 0,
  audStep: 0,
  audPlayingSeq: false,
  kinFreezeActive: false,
  trialRts: [],
  trialErrors: 0,
  trialTimeouts: 0,
  combo: 0,
  maxCombo: 0,
  currentLimitMs: 4000,
  lastUrgentTickAt: 0,
  rt: { visual: null, auditori: null, kinestetik: null },
  errors: { visual: 0, auditori: 0, kinestetik: 0 },
  timeouts: { visual: 0, auditori: 0, kinestetik: 0 },
  timedOut: { visual: false, auditori: false, kinestetik: false },
  scores: { visual: null, auditori: null, kinestetik: null },
  accuracy: { visual: null, auditori: null, kinestetik: null },
  stimT0: null,
  timeoutAt: Infinity,
  introReadyAt: 0,
  handStableSince: null,
  fixTimer: null,
  resetUnlockAt: 0,
  autoResetAt: Infinity,
};

export function later(fn, ms) {
  const s = state.session;
  return setTimeout(() => { if (s === state.session) fn(); }, ms);
}

export function abortPending() {
  state.session++;
  clearTimeout(state.fixTimer);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export const STAR_STAMPS = Array.from({ length: 24 }, (_, i) => {
  const img = new Image();
  img.src = `assets/stars/${i + 1}.png`;
  return img;
});

export const calib = {
  strokes: [], current: null, ink: 0, startedAt: 0,
  shapes: [], currentShape: [], selectedShape: null,
  dragging: false, movePrev: null, clearWasActive: false,
  particles: [],
  tip: null, rawTip: null, tipVel: 0,
  drawing: false, penDownCount: 0, penUpCount: 0,
  gestureMode: 'none', sparks: [],
  fistEnabled: false, fistStart: null, lastFist: 0, progress: 0,
};

export const vision = {
  busy: false, lastVideoTime: -1, pendingTs: 0,
  lm: null, handVisible: false, lastSeen: 0,
  poseLm: null, poseVisible: false, poseLastSeen: 0,
  baselineShoulderY: null, poseMatchSince: null,
  freezeStillSince: null, prevPoseRef: null,
  wristTrail: [], ready: false,
};

export const POSE_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];

export const POSE_DOTS = Array.from({ length: 33 }, (_, i) => i);

export const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

