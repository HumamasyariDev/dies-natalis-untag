import { sfx } from '../audio.js';
import { now, state, vision, STAR_STAMPS, $ } from '../config.js';

/* ─── POP-ZINE 3D RUNWAY ENGINE (DanceRush Stardom + Stay On Beat — Neo-Brutalist Edition) ─── */
const BEAT_MS = 468.75; // 128 BPM (Magic in the Air)

/**
 * 78 Aksi Ritmis Full-Body selama 60 Detik (128 BPM)
 * Types:
 * - 'punch_l' : Tinju Kiri (Kartu Biru #38bdf8 meluncur di kiri atas runway)
 * - 'punch_r' : Tinju Kanan (Kartu Oranye #fb923c meluncur di kanan atas runway)
 * - 'dual'    : Dual Smash (2 Kartu Kuning #fde047 kiri & kanan sekaligus)
 * - 'step_0'..'step_3' : Note Lantai DanceRush di Jalur 0 (Kiri) s/d 3 (Kanan)
 * - 'wall_l'  : Dinding Rintangan Kiri -> Geser Badan ke Kanan!
 * - 'wall_r'  : Dinding Rintangan Kanan -> Geser Badan ke Kiri!
 * - 'duck'    : Palang Hazard Kuning-Hitam Atas -> Nunduk / Squat!
 * - 'jump'    : Bar Lantai Hijau-Emas Penuh -> Loncat / Angkat Badan!
 */
const TARGET_BLUEPRINTS = [
  // ── 1. Warm-Up Groove: Tinju & Step Jalur (0s - 15s) ──
  { beat: 2,  type: 'punch_l' },
  { beat: 4,  type: 'punch_r' },
  { beat: 6,  type: 'step_1' },
  { beat: 8,  type: 'step_2' },
  { beat: 10, type: 'punch_l' },
  { beat: 12, type: 'punch_r' },
  { beat: 14, type: 'dual' },
  { beat: 16, type: 'step_0' },
  { beat: 18, type: 'step_1' },
  { beat: 20, type: 'step_2' },
  { beat: 22, type: 'step_3' },
  { beat: 24, type: 'wall_l' },   // Geser ke kanan!
  { beat: 27, type: 'punch_r' },
  { beat: 29, type: 'wall_r' },   // Geser ke kiri!
  { beat: 31, type: 'punch_l' },

  // ── 2. Build-Up: Rintangan Nunduk, Loncat & Combo Cepat (15s - 31.8s) ──
  { beat: 33, type: 'duck' },     // NUNDUK!
  { beat: 36, type: 'dual' },
  { beat: 38, type: 'step_1' },
  { beat: 39, type: 'step_2' },
  { beat: 41, type: 'jump' },     // LONCAT!
  { beat: 44, type: 'punch_l' },
  { beat: 45, type: 'punch_r' },
  { beat: 47, type: 'wall_l' },
  { beat: 50, type: 'wall_r' },
  { beat: 53, type: 'duck' },     // NUNDUK!
  { beat: 56, type: 'punch_l' },
  { beat: 57, type: 'punch_r' },
  { beat: 58, type: 'dual' },
  { beat: 60, type: 'step_0' },
  { beat: 61, type: 'step_1' },
  { beat: 62, type: 'step_2' },
  { beat: 63, type: 'step_3' },
  { beat: 65, type: 'jump' },     // LONCAT menuju Drop!

  // ── 3. EXPLOSIVE CHORUS DROP 🔥 (31.8s - 55.5s) - 2X SCORE FRENZY! ──
  { beat: 68,  type: 'dual' },
  { beat: 70,  type: 'punch_l' },
  { beat: 71,  type: 'punch_r' },
  { beat: 72,  type: 'step_0' },
  { beat: 73,  type: 'step_3' },
  { beat: 75,  type: 'duck' },    // NUNDUK!
  { beat: 78,  type: 'dual' },
  { beat: 80,  type: 'wall_l' },  // GESER KANAN!
  { beat: 82,  type: 'punch_r' },
  { beat: 84,  type: 'wall_r' },  // GESER KIRI!
  { beat: 86,  type: 'punch_l' },
  { beat: 88,  type: 'jump' },    // LONCAT!
  { beat: 91,  type: 'punch_l' },
  { beat: 92,  type: 'punch_r' },
  { beat: 93,  type: 'punch_l' },
  { beat: 94,  type: 'punch_r' },
  { beat: 95,  type: 'dual' },
  { beat: 97,  type: 'step_1' },
  { beat: 98,  type: 'step_2' },
  { beat: 99,  type: 'step_0' },
  { beat: 100, type: 'step_3' },
  { beat: 102, type: 'duck' },    // NUNDUK!
  { beat: 105, type: 'jump' },    // LONCAT!
  { beat: 108, type: 'wall_l' },
  { beat: 110, type: 'wall_r' },
  { beat: 112, type: 'punch_l' },
  { beat: 113, type: 'punch_r' },
  { beat: 114, type: 'dual' },
  { beat: 116, type: 'jump' },
  { beat: 118, type: 'dual' },

  // ── 4. Grand Climax Finale (55.5s - 60s) ──
  { beat: 120, type: 'punch_l' },
  { beat: 121, type: 'punch_r' },
  { beat: 122, type: 'dual' },
  { beat: 124, type: 'jump' },
  { beat: 126, type: 'dual' },
];

const UNTAG_LOGO = new Image();
UNTAG_LOGO.src = 'assets/logo-untag.png';

const loadImg = (src) => {
  const img = new Image();
  img.src = src;
  return img;
};

const BP_ASSETS = {
  glow: loadImg('assets/img/glow.png'),
  beam: loadImg('assets/img/beam.png'),
  spark1: loadImg('assets/img/spark.png'),
  spark2: loadImg('assets/img/spark2.png'),
  slice: loadImg('assets/img/slice.png'),
  cursor: loadImg('assets/img/cursor-mesh.png'),
};

export const TARGET_CONFIGS = {
  punch_l: { category: 'punch', hand: 'left',  lane: 0.5, color: '#ff1f81', accent: '#9d0b4c', label: '▼',      call: 'SLASH!' },
  punch_r: { category: 'punch', hand: 'right', lane: 2.5, color: '#00d2ff', accent: '#007799', label: '▼',      call: 'SLASH!' },
  dual:    { category: 'dual',  hand: 'both',  lane: 1.5, color: '#fbbf24', accent: '#b45309', label: '⚡',      call: 'DOUBLE CUT!' },
  step_0:  { category: 'step',  lane: 0,       color: '#ff1f81', accent: '#9d0b4c', label: '👟 KIRI',  call: 'STEP!' },
  step_1:  { category: 'step',  lane: 1,       color: '#ff1f81', accent: '#9d0b4c', label: '👟 TENGAH', call: 'GROOVE!' },
  step_2:  { category: 'step',  lane: 2,       color: '#00d2ff', accent: '#007799', label: '👟 TENGAH', call: 'GROOVE!' },
  step_3:  { category: 'step',  lane: 3,       color: '#00d2ff', accent: '#007799', label: '👟 KANAN', call: 'STEP!' },
  wall_l:  { category: 'wall',  side: 'left',  color: '#ff1f81', accent: '#9d0b4c', label: '👉 GESER KANAN!', call: 'DODGE!' },
  wall_r:  { category: 'wall',  side: 'right', color: '#00d2ff', accent: '#007799', label: '👈 GESER KIRI!',  call: 'DODGE!' },
  duck:    { category: 'duck',                 color: '#fbbf24', accent: '#b45309', label: '⬇️ NUNDUK!',      call: 'LOW CLEAR!' },
  jump:    { category: 'jump',                 color: '#22c55e', accent: '#15803d', label: '⬆️ LONCAT!',      call: 'AIR JUMP!' },
};

export const beatSmasher = {
  active: false,
  roundStartedAt: null,
  durationMs: 60000,
  targets: [],
  particles: [],
  starBursts: [],
  sparks: [],
  slices: [],
  shockwaves: [],
  popups: [],
  skyBanner: null,
  handTrails: { left: [], right: [] },
  prevHandL: null,
  prevHandR: null,
  glassShards: [],       // Serpihan kaca saat tabrak dinding (Shatter Impact Konsep 1)
  screenShake: 0,        // Getaran layar saat tabrakan
  damageFlash: 0,        // Flash merah saat terkena rintangan
  playerX: 0.5,          // Posisi horizontal badan (0..1)
  playerLane: 1,         // Lane aktif (0..3)
  footPadL: null,        // Pad bawah yang diinjak kaki kiri (0..3 atau null)
  footPadR: null,        // Pad bawah yang diinjak kaki kanan (0..3 atau null)
  baselineY: null,       // Kalibrasi tinggi berdiri normal
  isDucking: false,
  isJumping: false,
  postureState: 'STAND', // 'STAND' | 'DUCK' | 'JUMP'
  approachWindowMs: 1850, // Waktu meluncur dari ujung lorong 3D ke garis depan
  missGraceMs: 360,
  comboPopScale: 1,
};

export function buildKinestetikDeck() {
  return [
    {
      id: 'pop_runway_round',
      title: 'DANCE RUSH · POP RUNWAY',
      emoji: '🕺',
      bg: '#fde047',
      hint: 'Tinju kartu, injak jalur lantai, nunduk & loncat sesuai ketukan 128 BPM!',
    },
  ];
}

export function initBeatSmasher(startedAt = now()) {
  beatSmasher.active = true;
  beatSmasher.roundStartedAt = startedAt;
  beatSmasher.particles = [];
  beatSmasher.starBursts = [];
  beatSmasher.sparks = [];
  beatSmasher.slices = [];
  beatSmasher.shockwaves = [];
  beatSmasher.popups = [];
  beatSmasher.glassShards = [];
  beatSmasher.screenShake = 0;
  beatSmasher.damageFlash = 0;
  beatSmasher.skyBanner = { text: 'LET\'S RUSH!', color: '#fde047', life: 45, maxLife: 45 };
  beatSmasher.handTrails = { left: [], right: [] };
  beatSmasher.prevHandL = null;
  beatSmasher.prevHandR = null;
  resetKinCalibration();
  beatSmasher.isDucking = false;
  beatSmasher.isJumping = false;
  beatSmasher.postureState = 'STAND';
  beatSmasher.comboPopScale = 1;

  beatSmasher.targets = TARGET_BLUEPRINTS.map((bp, i) => {
    const cfg = TARGET_CONFIGS[bp.type];
    const targetTimeMs = Math.round(bp.beat * BEAT_MS);
    return {
      id: `target_${i}`,
      type: bp.type,
      category: cfg.category,
      hand: cfg.hand || null,
      lane: cfg.lane ?? 1.5,
      side: cfg.side || null,
      color: cfg.color,
      accent: cfg.accent,
      label: cfg.label,
      call: cfg.call,
      stampIdx: i % 24,
      targetTimeMs,
      hit: false,
      missed: false,
      subHits: bp.type === 'dual' ? { left: false, right: false } : null,
      _spawned3D: false,
    };
  });

  const bpFrame = $('beatpose-frame');
  if (bpFrame && bpFrame.contentWindow && bpFrame.contentWindow.clearEntities3D) {
    bpFrame.contentWindow.clearEntities3D();
  }
}

export function renderKinestetikStimulus(holder) {
  if (!holder) return;
  holder.innerHTML = `
    <div id="bs-hud" class="flex items-center gap-3 bg-[#faf8f2]/95 border-[2.5px] border-[#111113] rounded-full px-5 py-1.5 shadow-[4px_4px_0_#111113]">
      <span class="font-mono text-xs md:text-sm font-black text-[#111113] bg-[#fde047] px-2.5 py-0.5 rounded-full border-[1.5px] border-[#111113]">⚡ <span id="bs-hits">${state.kinClearedCount || 0}</span> HIT</span>
      <span class="font-mono text-xs md:text-sm font-black text-[#0284c7]">🎯 <span id="bs-score">${state.kinScore || 0}</span> PTS</span>
      <span id="bs-posture" class="font-mono text-[11px] font-bold bg-white text-[#111113] px-2.5 py-0.5 rounded-full border-[1.5px] border-[#111113]">👟 LANE 2</span>
    </div>
  `;
}

function toViewportNorm(p) {
  return {
    x: Math.max(0, Math.min(1, p.x)),
    y: Math.max(0, Math.min(1, p.y)),
  };
}

// --- STATE SENSOR KINESTETIK (AUTO-CALIBRATION & ZERO-DRIFT TRACKING) ---
let calibSamples = [];
let baselineCenterX = null;
let baselineShoulderY = null;
let baselineWidth = null;

let currentSubwayLane = 1; // 0: Left, 1: Center, 2: Right
let prevJumping = false;
let prevDucking = false;
let lastJumpTime = 0;
let lastDuckTime = 0;
let lastLaneTime = 0;
let prevMetricY = null;
let lastVelY = 0;
let laneQueueTimer = null;

export function resetKinCalibration() {
  calibSamples = [];
  baselineCenterX = null;
  baselineShoulderY = null;
  baselineWidth = null;
  currentSubwayLane = 1;
  prevJumping = false;
  prevDucking = false;
  lastJumpTime = 0;
  lastDuckTime = 0;
  lastLaneTime = 0;
  prevMetricY = null;
  lastVelY = 0;
  if (laneQueueTimer) { clearTimeout(laneQueueTimer); laneQueueTimer = null; }
  console.log('[Kinestetik] Kalibrasi sensor di-reset.');
}

export function sendSubwayAction(act) {
  if (state.current !== 'kinestetik' || state.phase !== 'stim-kin') return;
  const bpFrame = document.getElementById('beatpose-frame');
  if (bpFrame?.contentWindow) {
    if (typeof bpFrame.contentWindow.triggerSubwayAction === 'function') {
      bpFrame.contentWindow.triggerSubwayAction(act);
    } else {
      bpFrame.contentWindow.postMessage({ type: 'ACTION', action: act }, '*');
    }
  }
}

window.addEventListener('keydown', (e) => {
  if (state.current !== 'kinestetik' || state.phase !== 'stim-kin') return;
  if (e.code === 'KeyC') {
    resetKinCalibration();
    const postureEl = $('subway-posture');
    if (postureEl) {
      postureEl.textContent = '🎯 RE-KALIBRASI OK!';
      postureEl.className = 'font-mono text-xs font-black bg-[#fde047] text-[#111113] px-3 py-0.5 rounded-full border-[1.5px] border-[#111113]';
    }
  } else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
    sendSubwayAction('up');
  } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    sendSubwayAction('down');
  } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    sendSubwayAction('left');
  } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    sendSubwayAction('right');
  }
});

function updateBodyTracking() {
  let hL = null;
  let hR = null;
  let fL = null;
  let fR = null;

  if (vision.poseLm && vision.poseLm.length >= 25) {
    const lm = vision.poseLm;
    const nose = lm[0];
    const sL = lm[11];
    const sR = lm[12];
    const wL = lm[15];
    const wR = lm[16];
    const iL = lm[19];
    const iR = lm[20];
    const ankL = lm[27];
    const ankR = lm[28];
    const footL = lm[31];
    const footR = lm[32];

    // Posisi Tangan Kiri & Kanan (untuk visualisasi dan target kepalan)
    if (wL && (wL.visibility ?? 1) > 0.25) {
      const rawL = (iL && (iL.visibility ?? 1) > 0.25)
        ? { x: wL.x * 0.4 + iL.x * 0.6, y: wL.y * 0.4 + iL.y * 0.6 }
        : wL;
      hL = toViewportNorm(rawL);
    }
    if (wR && (wR.visibility ?? 1) > 0.25) {
      const rawR = (iR && (iR.visibility ?? 1) > 0.25)
        ? { x: wR.x * 0.4 + iR.x * 0.6, y: wR.y * 0.4 + iR.y * 0.6 }
        : wR;
      hR = toViewportNorm(rawR);
    }

    // Posisi Kaki Kiri & Kanan
    if (ankL && (ankL.visibility ?? 1) > 0.2) {
      const rawFL = (footL && (footL.visibility ?? 1) > 0.2)
        ? { x: ankL.x * 0.5 + footL.x * 0.5, y: ankL.y * 0.5 + footL.y * 0.5 }
        : ankL;
      fL = toViewportNorm(rawFL);
      const normFLX = Math.max(0, Math.min(0.999, (fL.x - 0.22) / 0.56));
      beatSmasher.footPadL = Math.floor(normFLX * 4);
    } else {
      beatSmasher.footPadL = null;
    }
    if (ankR && (ankR.visibility ?? 1) > 0.2) {
      const rawFR = (footR && (footR.visibility ?? 1) > 0.2)
        ? { x: ankR.x * 0.5 + footR.x * 0.5, y: ankR.y * 0.5 + footR.y * 0.5 }
        : ankR;
      fR = toViewportNorm(rawFR);
      const normFRX = Math.max(0, Math.min(0.999, (fR.x - 0.22) / 0.56));
      beatSmasher.footPadR = Math.floor(normFRX * 4);
    } else {
      beatSmasher.footPadR = null;
    }

    // Upper-body tracking (Bahu + Hidung/Kepala - tahan terhadap posisi setengah badan / meja booth)
    if (sL && sR && (sL.visibility ?? 1) > 0.25 && (sR.visibility ?? 1) > 0.25) {
      const sNormL = toViewportNorm(sL);
      const sNormR = toViewportNorm(sR);
      const shoulderCenterX = (sNormL.x + sNormR.x) / 2;
      const noseNormX = nose && (nose.visibility ?? 1) > 0.25 ? toViewportNorm(nose).x : shoulderCenterX;
      // Posisi horizontal tubuh: 70% bahu + 30% kepala
      const currentCenterX = shoulderCenterX * 0.70 + noseNormX * 0.30;

      // Posisi vertikal tubuh: 75% bahu + 25% kepala
      const shoulderY = (sNormL.y + sNormR.y) / 2;
      const noseNormY = nose && (nose.visibility ?? 1) > 0.25 ? toViewportNorm(nose).y : (shoulderY - 0.12);
      const currentMetricY = shoulderY * 0.75 + noseNormY * 0.25;

      // Lebar bahu untuk normalisasi jarak kamera
      const currentWidth = Math.max(0.14, Math.abs(sNormL.x - sNormR.x));

      // 1. AUTO-KALIBRASI POSISI BERDIRI AWAL (Sampel 20 frame pertama)
      if (baselineCenterX == null || calibSamples.length < 25) {
        calibSamples.push({ x: currentCenterX, y: currentMetricY, w: currentWidth });
        if (calibSamples.length >= 10) {
          let sumX = 0, sumY = 0, sumW = 0;
          for (const s of calibSamples) {
            sumX += s.x; sumY += s.y; sumW += s.w;
          }
          baselineCenterX = sumX / calibSamples.length;
          baselineShoulderY = sumY / calibSamples.length;
          baselineWidth = sumW / calibSamples.length;
          beatSmasher.baselineY = baselineShoulderY;
        } else {
          baselineCenterX = currentCenterX;
          baselineShoulderY = currentMetricY;
          baselineWidth = currentWidth;
          beatSmasher.baselineY = baselineShoulderY;
        }
      }

      const bodyUnit = Math.max(0.14, baselineWidth || currentWidth);

      // 2. NORMALISASI RELATIF TERHADAP LEBAR BAHU
      // relX: positif = condong KANAN, negatif = condong KIRI
      const relX = (currentCenterX - baselineCenterX) / bodyUnit;
      // relY: positif = bahu TURUN (nunduk), negatif = bahu NAIK (loncat)
      const relY = (currentMetricY - baselineShoulderY) / bodyUnit;

      // Hitung kecepatan vertikal
      const velY = prevMetricY == null ? 0 : (currentMetricY - prevMetricY) / bodyUnit;
      prevMetricY = currentMetricY;
      lastVelY = lastVelY * 0.6 + velY * 0.4;

      const nowMs = performance.now();

      // 3. DETEKSI LONCAT (JUMP) DENGAN HYSTERESIS & VELOCITY
      // Syarat: Bahu naik > 18% lebar bahu ATAU hentakan impuls naik > 10% dengan velY < -0.016
      const isJumpCondition = (relY < -0.18) || (relY < -0.10 && lastVelY < -0.016);
      const isJump = isJumpCondition && !beatSmasher.isDucking;

      if (isJump && !prevJumping && (nowMs - lastJumpTime > 450)) {
        sendSubwayAction('up');
        lastJumpTime = nowMs;
        beatSmasher.isJumping = true;
      }
      prevJumping = isJump;

      // 4. DETEKSI NUNDUK (DUCK / SLIDE) DENGAN HYSTERESIS & VELOCITY
      // Syarat: Bahu turun > 20% lebar bahu ATAU hentakan impuls turun > 12% dengan velY > +0.016
      const isDuckCondition = (relY > +0.20) || (relY > +0.12 && lastVelY > +0.016);
      const isDuck = isDuckCondition && !beatSmasher.isJumping;

      if (isDuck && !prevDucking && (nowMs - lastDuckTime > 400)) {
        sendSubwayAction('down');
        lastDuckTime = nowMs;
        beatSmasher.isDucking = true;
      }
      prevDucking = isDuck;

      // Reset state loncat / nunduk jika sudah kembali ke zona netral tegak
      if (Math.abs(relY) < 0.08) {
        beatSmasher.isJumping = false;
        beatSmasher.isDucking = false;
      }

      beatSmasher.postureState = beatSmasher.isDucking
        ? 'DUCK'
        : beatSmasher.isJumping
          ? 'JUMP'
          : 'STAND';

      // 5. DETEKSI JALUR KIRI / TENGAH / KANAN DENGAN SCHMITT TRIGGER
      // Jalur 0 = KIRI, Jalur 1 = TENGAH, Jalur 2 = KANAN
      let targetLane = currentSubwayLane;
      if (currentSubwayLane === 1) {
        if (relX > 0.26) targetLane = 2; // Pindah Kanan
        else if (relX < -0.26) targetLane = 0; // Pindah Kiri
      } else if (currentSubwayLane === 2) {
        if (relX < 0.14) targetLane = 1; // Kembali ke Tengah
      } else if (currentSubwayLane === 0) {
        if (relX > -0.14) targetLane = 1; // Kembali ke Tengah
      }

      if (targetLane !== currentSubwayLane && (nowMs - lastLaneTime > 90)) {
        const diff = targetLane - currentSubwayLane;
        lastLaneTime = nowMs;

        if (Math.abs(diff) === 1) {
          sendSubwayAction(diff > 0 ? 'right' : 'left');
          currentSubwayLane = targetLane;
        } else if (Math.abs(diff) === 2) {
          // Pindah 2 jalur sekaligus (Kiri ke Kanan atau Kanan ke Kiri)
          const dir = diff > 0 ? 'right' : 'left';
          sendSubwayAction(dir);
          currentSubwayLane = 1;
          if (laneQueueTimer) clearTimeout(laneQueueTimer);
          laneQueueTimer = setTimeout(() => {
            sendSubwayAction(dir);
            currentSubwayLane = targetLane;
          }, 85);
        }
      }

      // Update badge HUD posture di atas arena Subway Surfers
      const postureEl = $('subway-posture');
      if (postureEl) {
        if (beatSmasher.isJumping) {
          postureEl.textContent = '⬆ LONCAT!';
          postureEl.className = 'font-mono text-xs font-black bg-[#22c55e] text-white px-3 py-0.5 rounded-full border-[1.5px] border-[#111113] shadow-[2px_2px_0_#111113]';
        } else if (beatSmasher.isDucking) {
          postureEl.textContent = '⬇ NUNDUK / SLIDE!';
          postureEl.className = 'font-mono text-xs font-black bg-[#fb923c] text-white px-3 py-0.5 rounded-full border-[1.5px] border-[#111113] shadow-[2px_2px_0_#111113]';
        } else if (targetLane === 0) {
          postureEl.textContent = '⬅ JALUR KIRI';
          postureEl.className = 'font-mono text-xs font-black bg-[#38bdf8] text-[#111113] px-3 py-0.5 rounded-full border-[1.5px] border-[#111113]';
        } else if (targetLane === 2) {
          postureEl.textContent = '➡ JALUR KANAN';
          postureEl.className = 'font-mono text-xs font-black bg-[#38bdf8] text-[#111113] px-3 py-0.5 rounded-full border-[1.5px] border-[#111113]';
        } else {
          postureEl.textContent = '🏃 JALUR TENGAH';
          postureEl.className = 'font-mono text-xs font-black bg-white text-[#111113] px-3 py-0.5 rounded-full border-[1.5px] border-[#111113]';
        }
      }
    }
  }

  // Fallback MediaPipe Hands jika Pose belum aktif
  if (!hL && !hR && vision.lm && vision.lm.length >= 10) {
    const pCenter = toViewportNorm({
      x: (vision.lm[0].x + vision.lm[9].x) / 2,
      y: (vision.lm[0].y + vision.lm[9].y) / 2,
    });
    beatSmasher.playerX = beatSmasher.playerX * 0.5 + pCenter.x * 0.5;
    beatSmasher.playerLane = Math.max(0, Math.min(3, Math.floor(beatSmasher.playerX * 4)));
    if (pCenter.x < 0.5) hL = pCenter;
    else hR = pCenter;
  }

  return { hL, hR, fL, fR };
}

/* ─── PROYEKSI 3D RUNWAY KE KOORDINAT LAYAR (0..1) ─── */
function projectRunwayPoint(laneIndex, zProgress, heightOffset = 0) {
  // zProgress: 0.0 (ujung jauh di tengah) -> 1.0 (garis Judgment di bawah)
  const z = Math.max(0, Math.min(1.25, zProgress));
  // Kurva perspektif eksponensial agar efek meluncur ke depan terasa nyata
  const p = Math.pow(z, 1.55);

  const vpX = 0.50;
  const vpY = 0.46;
  const botY = 0.90;

  const topHalfW = 0.075;
  const botHalfW = 0.41;

  const curHalfW = topHalfW + (botHalfW - topHalfW) * p;
  const yFloor = vpY + (botY - vpY) * p;

  // laneIndex: 0..4 (garis batas) atau 0.5..3.5 (tengah lane)
  const laneNorm = (laneIndex - 2) / 2; // -1.0 (kiri luar) s/d +1.0 (kanan luar)
  const x = vpX + laneNorm * curHalfW;
  const scale = 0.24 + 0.76 * p;
  const y = yFloor - heightOffset * scale;

  return { x, y, yFloor, scale, curHalfW, p };
}

export function tickBeatSmasher(t, onHitCallback) {
  if (!beatSmasher.active || !beatSmasher.roundStartedAt) return;
  const elapsed = t - beatSmasher.roundStartedAt;
  const { hL, hR, fL, fR } = updateBodyTracking();

  const speedL = (hL && beatSmasher.prevHandL) ? Math.hypot(hL.x - beatSmasher.prevHandL.x, hL.y - beatSmasher.prevHandL.y) : 0;
  const speedR = (hR && beatSmasher.prevHandR) ? Math.hypot(hR.x - beatSmasher.prevHandR.x, hR.y - beatSmasher.prevHandR.y) : 0;
  beatSmasher.prevHandL = hL ? { ...hL } : null;
  beatSmasher.prevHandR = hR ? { ...hR } : null;

  // Rekam jejak pita neon saber tangan: HANYA saat tangan bergerak aktif (speed >= 0.012)
  // Ini mencegah garis membentang atau menumpuk saat tangan diam/istirahat!
  const nowTime = t;
  const trailLifespan = 150; // memudar cepat dalam 150ms seperti pedang Beat Saber
  beatSmasher.handTrails.left = beatSmasher.handTrails.left.filter(p => nowTime - p.t <= trailLifespan);
  beatSmasher.handTrails.right = beatSmasher.handTrails.right.filter(p => nowTime - p.t <= trailLifespan);

  if (hL && speedL >= 0.012) {
    const lastL = beatSmasher.handTrails.left[beatSmasher.handTrails.left.length - 1];
    const isJump = lastL && Math.hypot(hL.x - lastL.x, hL.y - lastL.y) > 0.12;
    if (!isJump) {
      beatSmasher.handTrails.left.push({ x: hL.x, y: hL.y, t: nowTime });
      while (beatSmasher.handTrails.left.length > 6) beatSmasher.handTrails.left.shift();
    }
  }
  if (hR && speedR >= 0.012) {
    const lastR = beatSmasher.handTrails.right[beatSmasher.handTrails.right.length - 1];
    const isJump = lastR && Math.hypot(hR.x - lastR.x, hR.y - lastR.y) > 0.12;
    if (!isJump) {
      beatSmasher.handTrails.right.push({ x: hR.x, y: hR.y, t: nowTime });
      while (beatSmasher.handTrails.right.length > 6) beatSmasher.handTrails.right.shift();
    }
  }

  beatSmasher.comboPopScale = Math.max(1, beatSmasher.comboPopScale * 0.92);

  const isFrenzy = elapsed >= 32000;
  const punchHitRad = 0.145;

  const bpFrame = $('beatpose-frame');
  const bpWin = (bpFrame && bpFrame.contentWindow) ? bpFrame.contentWindow : null;

  for (const tgt of beatSmasher.targets) {
    if (tgt.hit || tgt.missed) continue;
    const diff = tgt.targetTimeMs - elapsed;

    if (diff > beatSmasher.approachWindowMs) continue;

    // Trigger spawn 3D di WebGL A-Frame BeatPose saat target mulai mendekat
    if (bpWin && !tgt._spawned3D) {
      tgt._spawned3D = true;
      if (tgt.category === 'punch') {
        const col = tgt.hand === 'left' ? 'red' : 'blue';
        if (bpWin.spawnBeat3D) bpWin.spawnBeat3D(tgt.id, col, tgt.lane, 'arrow', 'down', 8.0);
      } else if (tgt.category === 'dual') {
        if (bpWin.spawnBeat3D) {
          bpWin.spawnBeat3D(tgt.id + '_L', 'red', 1, 'arrow', 'down', 8.0);
          bpWin.spawnBeat3D(tgt.id + '_R', 'blue', 2, 'arrow', 'down', 8.0);
        }
      } else if (tgt.category === 'wall') {
        if (bpWin.spawnWall3D) bpWin.spawnWall3D(tgt.id, tgt.side, false, 1.2, 8.0);
      } else if (tgt.category === 'duck') {
        if (bpWin.spawnWall3D) bpWin.spawnWall3D(tgt.id, 'middle', true, 1.2, 8.0);
      }
    }

    if (diff < -beatSmasher.missGraceMs) {
      tgt.missed = true;
      state.combo = 0;
      updateHudUI();
      continue;
    }

    const z = 1 - (diff / beatSmasher.approachWindowMs);
    // Hanya evaluasi tabrakan saat target sudah dekat dengan pemain (Zona Hit)
    if (z < 0.68) continue;

    let didHit = false;
    let hitX = 0.5;
    let hitY = 0.6;
    let isCritical = false;

    if (tgt.category === 'punch') {
      const proj = projectRunwayPoint(tgt.lane + 0.5, Math.min(1, z), 0.46);
      const hand = tgt.hand === 'left' ? hL : hR;
      const spd = tgt.hand === 'left' ? speedL : speedR;
      if (hand && Math.hypot(hand.x - proj.x, hand.y - proj.y) < punchHitRad) {
        didHit = true;
        hitX = proj.x;
        hitY = proj.y;
        isCritical = spd > 0.014;
      }
    } else if (tgt.category === 'dual') {
      const projL = projectRunwayPoint(1.0, Math.min(1, z), 0.46);
      const projR = projectRunwayPoint(3.0, Math.min(1, z), 0.46);
      if (hL && Math.hypot(hL.x - projL.x, hL.y - projL.y) < punchHitRad && !tgt.subHits.left) {
        tgt.subHits.left = true;
        spawnStarBurst(projL.x, projL.y, tgt.color, 6);
      }
      if (hR && Math.hypot(hR.x - projR.x, hR.y - projR.y) < punchHitRad && !tgt.subHits.right) {
        tgt.subHits.right = true;
        spawnStarBurst(projR.x, projR.y, tgt.color, 6);
      }
      if (tgt.subHits.left && tgt.subHits.right) {
        didHit = true;
        hitX = 0.5;
        hitY = projL.y;
        isCritical = true;
      }
    } else if (tgt.category === 'step' && z >= 0.84) {
      const proj = projectRunwayPoint(tgt.lane + 0.5, 1.0, 0);
      const hasFeet = fL !== null || fR !== null;
      const footLaneL = fL ? Math.max(0, Math.min(1, (fL.x - 0.22) / 0.56)) * 4 : -99;
      const footLaneR = fR ? Math.max(0, Math.min(1, (fR.x - 0.22) / 0.56)) * 4 : -99;
      const footOnLane = Math.abs(footLaneL - (tgt.lane + 0.5)) <= 0.95 ||
                         Math.abs(footLaneR - (tgt.lane + 0.5)) <= 0.95;
      const torsoDist = Math.abs(beatSmasher.playerX * 4 - (tgt.lane + 0.5));
      if (hasFeet ? footOnLane : torsoDist <= 1.05) {
        didHit = true;
        hitX = proj.x;
        hitY = proj.y - 0.05;
        isCritical = footOnLane || torsoDist <= 0.55;
      }
    } else if (tgt.category === 'wall' && z >= 0.88) {
      // Dinding kiri menutup Jalur 1 & 2 (playerX < 0.5) -> harus geser ke KANAN (>= 0.58)
      // Dinding kanan menutup Jalur 3 & 4 (playerX > 0.5) -> harus geser ke KIRI (<= 0.42)
      const safe = tgt.side === 'left'
        ? (beatSmasher.playerX >= 0.58 || (beatSmasher.footPadL !== null && beatSmasher.footPadL >= 2 && (beatSmasher.footPadR === null || beatSmasher.footPadR >= 2)))
        : (beatSmasher.playerX <= 0.42 || (beatSmasher.footPadR !== null && beatSmasher.footPadR <= 1 && (beatSmasher.footPadL === null || beatSmasher.footPadL <= 1)));
      if (safe) {
        didHit = true;
        hitX = tgt.side === 'left' ? 0.72 : 0.28;
        hitY = 0.58;
        isCritical = true;
      } else {
        // Tabrak dinding seketika di z >= 0.88 (tanpa delay atau menembus!)
        tgt.missed = true;
        state.combo = 0;
        sfx.bad();
        if (bpWin && bpWin.shatterWall3D) bpWin.shatterWall3D(tgt.id);
        spawnWallShatter(tgt.side, '#ff1f81');
        addPopup('💥 DINDING HANCUR!', tgt.side === 'left' ? 0.35 : 0.65, 0.42, '#ef4444');
        updateHudUI();
        continue;
      }
    } else if (tgt.category === 'duck' && z >= 0.86) {
      if (beatSmasher.isDucking) {
        didHit = true;
        hitX = 0.50;
        hitY = 0.55;
        isCritical = true;
      } else {
        tgt.missed = true;
        state.combo = 0;
        sfx.bad();
        if (bpWin && bpWin.shatterWall3D) bpWin.shatterWall3D(tgt.id);
        spawnWallShatter('middle', '#f59e0b');
        addPopup('💥 PALANG HANCUR!', 0.5, 0.42, '#f59e0b');
        updateHudUI();
        continue;
      }
    } else if (tgt.category === 'jump' && z >= 0.86) {
      if (beatSmasher.isJumping) {
        didHit = true;
        hitX = 0.50;
        hitY = 0.48;
        isCritical = true;
      } else {
        tgt.missed = true;
        state.combo = 0;
        sfx.bad();
        spawnWallShatter('floor', '#00d2ff');
        addPopup('💥 KESANDUNG LASER!', 0.5, 0.72, '#00d2ff');
        updateHudUI();
        continue;
      }
    }

    if (didHit) {
      tgt.hit = true;
      if (bpWin) {
        if (tgt.category === 'wall' || tgt.category === 'duck') {
          if (bpWin.shatterWall3D) bpWin.shatterWall3D(tgt.id);
        } else if (bpWin.hitBeat3D) {
          if (tgt.category === 'dual') {
            bpWin.hitBeat3D(tgt.id + '_L');
            bpWin.hitBeat3D(tgt.id + '_R');
          } else {
            bpWin.hitBeat3D(tgt.id);
          }
        }
      }
      state.kinClearedCount++;
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      beatSmasher.comboPopScale = 1.38;

      const mult = isFrenzy ? 2 : 1;
      const basePts = isCritical ? 200 : 120;
      const pts = (basePts + state.combo * 20) * mult;
      state.kinScore += pts;

      const rt = Math.max(130, Math.round(420 - Math.abs(diff) * 0.45));
      state.trialRts.push(rt);

      sfx.smash(isCritical, tgt.hand || 'both');
      sfx.comboGood(state.combo);
      spawnStarBurst(hitX, hitY, tgt.color, isCritical ? 12 : 8);

      beatSmasher.skyBanner = {
        text: tgt.call || 'MANTAP!',
        color: tgt.color,
        life: 26,
        maxLife: 26,
      };

      addPopup(`${tgt.call} +${pts}`, hitX, hitY, tgt.color);
      updateHudUI();
      if (onHitCallback) onHitCallback(pts, isCritical);
    }
  }

  updateHudUI();
}

function updateHudUI() {
  const h = $('bs-hits');
  const s = $('bs-score');
  const p = $('bs-posture');
  if (h) h.textContent = state.kinClearedCount;
  if (s) s.textContent = state.kinScore.toLocaleString();
  if (p) {
    if (beatSmasher.isDucking) {
      p.textContent = 'POSTUR: MENUNDUK';
      p.className = 'font-mono text-[11px] font-bold bg-[#fde047] text-[#111113] px-2.5 py-0.5 rounded-full border-[1.5px] border-[#111113]';
    } else if (beatSmasher.isJumping) {
      p.textContent = 'POSTUR: LONCAT';
      p.className = 'font-mono text-[11px] font-bold bg-[#22c55e] text-white px-2.5 py-0.5 rounded-full border-[1.5px] border-[#111113]';
    } else {
      p.textContent = `POSTUR: BERDIRI (JALUR ${beatSmasher.playerLane + 1})`;
      p.className = 'font-mono text-[11px] font-bold bg-white text-[#111113] px-2.5 py-0.5 rounded-full border-[1.5px] border-[#111113]';
    }
  }
}

function spawnWallShatter(side, color = '#ff1f81') {
  beatSmasher.screenShake = 18;
  beatSmasher.damageFlash = 1.0;
  const originX = side === 'left' ? 0.32 : (side === 'right' ? 0.68 : 0.50);
  const originY = side === 'floor' ? 0.82 : 0.54;
  for (let i = 0; i < 34; i++) {
    const angle = (Math.PI * 2 * i) / 34 + (Math.random() - 0.5) * 0.6;
    const speed = 0.007 + Math.random() * 0.022;
    const shardSize = 14 + Math.random() * 28;
    const pts = [];
    const numPts = 3 + (i % 2);
    for (let p = 0; p < numPts; p++) {
      const a = (Math.PI * 2 * p) / numPts + (Math.random() - 0.5) * 0.5;
      const r = shardSize * (0.5 + Math.random() * 0.5);
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    beatSmasher.glassShards.push({
      x: originX + (Math.random() - 0.5) * 0.12,
      y: originY + (Math.random() - 0.5) * 0.16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.003,
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 20,
      pts,
      color,
      life: 26 + Math.floor(Math.random() * 10),
      maxLife: 36,
    });
  }
}

function spawnStarBurst(x, y, color, count = 10) {
  beatSmasher.shockwaves.push({ x, y, r: 10, maxR: 85, color, alpha: 1 });
  beatSmasher.slices.push({
    x,
    y,
    angle: (Math.random() - 0.5) * 1.4,
    size: 130,
    life: 16,
    maxLife: 16,
  });
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
    const spd = 0.005 + Math.random() * 0.012;
    beatSmasher.sparks.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      rot: Math.random() * 360,
      size: 28 + Math.random() * 20,
      alt: i % 2 === 0,
      life: 18,
      maxLife: 18,
    });
  }
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const spd = 0.004 + Math.random() * 0.011;
    beatSmasher.starBursts.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 0.003,
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 18,
      size: 24 + Math.random() * 18,
      stampIdx: Math.floor(Math.random() * 24),
      color,
      life: 28 + Math.floor(Math.random() * 10),
      maxLife: 38,
    });
  }
}

function addPopup(text, x, y, color) {
  beatSmasher.popups.push({
    text,
    x,
    y: y - 0.04,
    color,
    life: 26,
    maxLife: 26,
  });
}

export function debugTriggerBeatSmasherHit() {
  if (!beatSmasher.active || !beatSmasher.roundStartedAt) return;
  const elapsed = now() - beatSmasher.roundStartedAt;
  const pending = beatSmasher.targets.find((tgt) => !tgt.hit && !tgt.missed && tgt.targetTimeMs >= elapsed - 400);
  if (pending) {
    pending.hit = true;
    state.kinClearedCount++;
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    beatSmasher.comboPopScale = 1.38;
    state.kinScore += 250;
    state.trialRts.push(280);
    spawnStarBurst(0.5, 0.58, pending.color, 12);
    beatSmasher.skyBanner = { text: pending.call || 'BAM!', color: pending.color, life: 26, maxLife: 26 };
    addPopup(`${pending.call} +250`, 0.5, 0.55, pending.color);
    sfx.smash(true);
    updateHudUI();
  }
}

/* ─── RENDER SUBWAY SURFERS POSE TRACKING & PIP CAMERA (60 FPS) ─── */
export function renderBeatSmasherCanvas(M, t) {
  const { ctx, W, H } = M;

  // 1. Bersihkan canvas #fx sepenuhnya agar arena 3D Subway Surfers tampil jernih tanpa halangan
  ctx.clearRect(0, 0, W, H);

  // 2. Gambar Skeleton Computer Vision di dalam Kotak Kamera Kiri (#cam-overlay)
  renderCamOverlay();

  // 3. Jalankan pelacakan pose tubuh setiap frame (Loncat, Nunduk, Geser Jalur Kiri/Tengah/Kanan)
  updateBodyTracking();
}

const FULL_BODY_EDGES = [
  // Wajah (Hidung, Mata, Telinga, Mulut)
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Lengan & Tangan Kiri
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Lengan & Tangan Kanan
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Kaki Kiri & Kanan
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];
const FULL_BODY_DOTS = Array.from({ length: 33 }, (_, i) => i);

function visThresh(idx) {
  if (idx <= 10) return 0.20;
  return idx >= 25 ? 0.16 : 0.25;
}

function renderCamOverlay() {
  const cv = $('cam-overlay');
  const video = $('webcam');
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(rect.width * dpr);
  const ch = Math.round(rect.height * dpr);
  if (cv.width !== cw || cv.height !== ch) {
    cv.width = cw;
    cv.height = ch;
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const lm = vision.poseLm;
  if (!lm) return;

  const vw = (video && video.videoWidth) || 640;
  const vh = (video && video.videoHeight) || 480;
  const s = Math.max(rect.width / vw, rect.height / vh);
  const dw = vw * s;
  const dh = vh * s;
  const ox = (rect.width - dw) / 2;
  const oy = (rect.height - dh) / 2;
  const pt = (p) => ({ x: ox + p.x * dw, y: oy + p.y * dh });

  ctx.save();
  // Garis panduan zona tracking (kiri / tengah / kanan & loncat / nunduk)
  const bodyUnit = Math.max(0.14, baselineWidth || 0.22);
  const centerNorm = baselineCenterX != null ? baselineCenterX : 0.5;
  const lx = ox + (centerNorm - bodyUnit * 0.26) * dw;
  const rx = ox + (centerNorm + bodyUnit * 0.26) * dw;

  // Zona Jalur Aktif (Highlight visual)
  if (currentSubwayLane === 0) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
    ctx.fillRect(0, 0, Math.max(0, lx), rect.height);
  } else if (currentSubwayLane === 2) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
    ctx.fillRect(rx, 0, Math.max(0, rect.width - rx), rect.height);
  } else {
    ctx.fillStyle = 'rgba(253, 224, 71, 0.08)';
    ctx.fillRect(Math.max(0, lx), 0, Math.max(0, rx - lx), rect.height);
  }

  // Garis pembatas jalur vertikal
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.8;

  ctx.strokeStyle = currentSubwayLane === 0 ? '#38bdf8' : 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.moveTo(lx, 0);
  ctx.lineTo(lx, rect.height);
  ctx.stroke();

  ctx.strokeStyle = currentSubwayLane === 2 ? '#38bdf8' : 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.moveTo(rx, 0);
  ctx.lineTo(rx, rect.height);
  ctx.stroke();

  // Garis horizontal acuan loncat & nunduk
  if (baselineShoulderY != null) {
    const by = oy + baselineShoulderY * dh;
    const jumpY = oy + (baselineShoulderY - bodyUnit * 0.18) * dh;
    const duckY = oy + (baselineShoulderY + bodyUnit * 0.20) * dh;

    // Batas Loncat (Hijau Neon)
    ctx.strokeStyle = beatSmasher.isJumping ? '#22c55e' : 'rgba(34, 197, 94, 0.50)';
    ctx.lineWidth = beatSmasher.isJumping ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(0, jumpY);
    ctx.lineTo(rect.width, jumpY);
    ctx.stroke();

    // Tinggi Netral Berdiri (Kuning Dotted)
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.40)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, by);
    ctx.lineTo(rect.width, by);
    ctx.stroke();

    // Batas Nunduk (Oranye Neon)
    ctx.strokeStyle = beatSmasher.isDucking ? '#fb923c' : 'rgba(251, 146, 60, 0.50)';
    ctx.lineWidth = beatSmasher.isDucking ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(0, duckY);
    ctx.lineTo(rect.width, duckY);
    ctx.stroke();
  }
  ctx.restore();

  // Titik pusat bahu sebagai indikator posisi aktif
  if (lm[11] && lm[12] && (lm[11].visibility ?? 1) > 0.35 && (lm[12].visibility ?? 1) > 0.35) {
    const mid = pt({ x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 });
    ctx.fillStyle = beatSmasher.isJumping ? '#22c55e' : beatSmasher.isDucking ? '#fb923c' : '#38bdf8';
    ctx.strokeStyle = '#111113';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2.8;
  for (const [a, b] of FULL_BODY_EDGES) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb || (pa.visibility ?? 1) < visThresh(a) || (pb.visibility ?? 1) < visThresh(b)) continue;
    const sa = pt(pa);
    const sb = pt(pb);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }

  for (const idx of FULL_BODY_DOTS) {
    const p = lm[idx];
    if (!p || (p.visibility ?? 1) < visThresh(idx)) continue;
    const sPt = pt(p);
    const isHand = idx === 15 || idx === 16;
    const isFoot = idx === 27 || idx === 28 || idx === 31 || idx === 32;
    ctx.beginPath();
    ctx.arc(sPt.x, sPt.y, isHand || isFoot ? 5.5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = idx === 15 ? '#ef4444'
      : idx === 16 ? '#fbbf24'
      : isFoot ? '#22c55e'
      : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#111113';
    ctx.stroke();
  }
  ctx.restore();
}

function drawArenaAvatar(ctx, W, H, beatPulse) {
  const lm = vision.poseLm;
  if (!lm) return;
  ctx.save();
  ctx.lineCap = 'round';

  // Outline hitam Stikman Full-Body (Kepala sampai Kaki)
  ctx.strokeStyle = 'rgba(17, 17, 19, 0.35)';
  ctx.lineWidth = 10;
  for (const [a, b] of FULL_BODY_EDGES) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb || (pa.visibility ?? 1) < visThresh(a) || (pb.visibility ?? 1) < visThresh(b)) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * W, pa.y * H);
    ctx.lineTo(pb.x * W, pb.y * H);
    ctx.stroke();
  }

  // Isi merah UNTAG Stikman Full-Body
  ctx.strokeStyle = 'rgba(220, 38, 38, 0.45)';
  ctx.lineWidth = 5;
  for (const [a, b] of FULL_BODY_EDGES) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb || (pa.visibility ?? 1) < visThresh(a) || (pb.visibility ?? 1) < visThresh(b)) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * W, pa.y * H);
    ctx.lineTo(pb.x * W, pb.y * H);
    ctx.stroke();
  }

  // Lingkaran Kepala Stikman
  const nose = lm[0];
  if (nose && (nose.visibility ?? 1) > 0.25) {
    ctx.beginPath();
    ctx.arc(nose.x * W, nose.y * H, 18 + beatPulse * 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(17, 17, 19, 0.45)';
    ctx.stroke();
  }

  // Penanda Kaki Kiri & Kanan di Arena jika terdeteksi
  for (const [idx, col, lbl] of [[27, '#22c55e', '👟L'], [28, '#38bdf8', '👟R']]) {
    const f = lm[idx];
    if (!f || (f.visibility ?? 1) < 0.16) continue;
    const fx = f.x * W;
    const fy = f.y * H;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(fx, fy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111113';
    ctx.stroke();
    ctx.font = '900 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111113';
    ctx.fillText(lbl, fx, fy);
  }

  ctx.restore();
}

function drawBeatPose3DStage(ctx, W, H, elapsed, beatPulse) {
  const cx = W * 0.50;
  const cy = H * 0.44;
  const speedPhase = (elapsed / (BEAT_MS * 2)) % 1;
  const ringCount = 6;

  ctx.save();

  // 1. Panggung 3D Diamond Tunnel Berputar ala BeatPose (Nuansa Merah-Emas UNTAG)
  for (let i = 0; i < ringCount; i++) {
    const z = ((i + speedPhase) / ringCount);
    const scale = Math.pow(z, 1.45);
    const size = 55 + scale * Math.max(W, H) * 0.62;
    const rot = Math.PI / 4 + Math.sin(elapsed * 0.0005 + i * 0.25) * 0.14;
    const alpha = Math.min(0.45, scale * 0.55) * (1 - z * 0.15);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = i % 2 === 0 ? '#dc2626' : '#fbbf24';
    ctx.lineWidth = 2.5 + scale * 4 + beatPulse * 1.5;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // 2. Sorotan Laser Panggung Samping Kiri & Kanan Berdenyut Mengikuti Beat 128 BPM
  const laserSway = Math.sin(elapsed * 0.0018) * (W * 0.08);
  const laserAlpha = 0.12 + beatPulse * 0.14;
  for (const [startX, col] of [[W * 0.14, '#ef4444'], [W * 0.86, '#fbbf24']]) {
    ctx.save();
    ctx.globalAlpha = laserAlpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = 5 + beatPulse * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, H * 0.05);
    ctx.lineTo(cx + (startX < cx ? -1 : 1) * (W * 0.12) + laserSway, cy);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawPopZineRunway(ctx, W, H, elapsed, beatPulse) {
  const topL = projectRunwayPoint(0, 0);
  const topR = projectRunwayPoint(4, 0);
  const botL = projectRunwayPoint(0, 1);
  const botR = projectRunwayPoint(4, 1);

  ctx.save();

  // Permukaan Runway Transparan agar Arena 3D BeatPose WebGL di belakang terlihat penuh!
  const grad = ctx.createLinearGradient(0, topL.y * H, 0, botL.y * H);
  grad.addColorStop(0, 'rgba(255, 31, 129, 0.03)');
  grad.addColorStop(1, 'rgba(0, 210, 255, 0.08)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(topL.x * W, topL.y * H);
  ctx.lineTo(topR.x * W, topR.y * H);
  ctx.lineTo(botR.x * W, botR.y * H);
  ctx.lineTo(botL.x * W, botL.y * H);
  ctx.closePath();
  ctx.fill();

  // Sorot Jalur Aktif tempat pemain berdiri
  const actLane = beatSmasher.playerLane;
  const lTop0 = projectRunwayPoint(actLane, 0);
  const lTop1 = projectRunwayPoint(actLane + 1, 0);
  const lBot0 = projectRunwayPoint(actLane, 1);
  const lBot1 = projectRunwayPoint(actLane + 1, 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(lTop0.x * W, lTop0.y * H);
  ctx.lineTo(lTop1.x * W, lTop1.y * H);
  ctx.lineTo(lBot1.x * W, lBot1.y * H);
  ctx.lineTo(lBot0.x * W, lBot0.y * H);
  ctx.closePath();
  ctx.fill();

  // Garis Horizontal Beat mengalir dari ujung lorong ke bawah
  const scrollOffset = (elapsed % BEAT_MS) / BEAT_MS;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const zGrid = (i + scrollOffset) / 6;
    const gL = projectRunwayPoint(0, zGrid);
    const gR = projectRunwayPoint(4, zGrid);
    ctx.beginPath();
    ctx.moveTo(gL.x * W, gL.y * H);
    ctx.lineTo(gR.x * W, gR.y * H);
    ctx.stroke();
  }

  // Garis Pembagi 4 Jalur (Lanes) Neon Halus
  for (let lane = 1; lane <= 3; lane++) {
    const pTop = projectRunwayPoint(lane, 0);
    const pBot = projectRunwayPoint(lane, 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pTop.x * W, pTop.y * H);
    ctx.lineTo(pBot.x * W, pBot.y * H);
    ctx.stroke();
  }

  // Bingkai Tepi Kiri (Magenta) & Kanan (Cyan) Runway ala BeatPose
  ctx.strokeStyle = 'rgba(255, 31, 129, 0.75)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(topL.x * W, topL.y * H);
  ctx.lineTo(botL.x * W, botL.y * H);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 210, 255, 0.75)';
  ctx.beginPath();
  ctx.moveTo(topR.x * W, topR.y * H);
  ctx.lineTo(botR.x * W, botR.y * H);
  ctx.stroke();

  // 4 Pad Injak BeatPose Magenta-Cyan di Garis Judgment Bawah (z = 0.90 .. 1.02)
  const padColors = ['#ff1f81', '#ff1f81', '#00d2ff', '#00d2ff'];
  const hasFoot = beatSmasher.footPadL !== null || beatSmasher.footPadR !== null;
  for (let lane = 0; lane < 4; lane++) {
    const p0 = projectRunwayPoint(lane + 0.06, 0.90);
    const p1 = projectRunwayPoint(lane + 0.94, 0.90);
    const p2 = projectRunwayPoint(lane + 0.94, 1.02);
    const p3 = projectRunwayPoint(lane + 0.06, 1.02);
    const isHere = hasFoot
      ? (beatSmasher.footPadL === lane || beatSmasher.footPadR === lane)
      : beatSmasher.playerLane === lane;

    // Hard Shadow Pad
    ctx.fillStyle = '#111113';
    ctx.beginPath();
    ctx.moveTo(p0.x * W + 4, p0.y * H + 4);
    ctx.lineTo(p1.x * W + 4, p1.y * H + 4);
    ctx.lineTo(p2.x * W + 4, p2.y * H + 4);
    ctx.lineTo(p3.x * W + 4, p3.y * H + 4);
    ctx.closePath();
    ctx.fill();

    // Warna Pad (Semi-transparan elegan saat idle agar refleksi panggung 3D terlihat)
    ctx.fillStyle = isHere ? '#22c55e' : padColors[lane];
    ctx.globalAlpha = isHere ? 0.96 : 0.38;
    ctx.beginPath();
    ctx.moveTo(p0.x * W, p0.y * H);
    ctx.lineTo(p1.x * W, p1.y * H);
    ctx.lineTo(p2.x * W, p2.y * H);
    ctx.lineTo(p3.x * W, p3.y * H);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = isHere ? '#ffffff' : padColors[lane];
    ctx.lineWidth = isHere ? 3.5 : 2.0;
    ctx.stroke();

    // Pilar cahaya beat-pose halus saat pad bawah sedang diinjak
    if (isHere && BP_ASSETS.beam.complete && BP_ASSETS.beam.naturalWidth > 0) {
      const cx = ((p0.x + p1.x) / 2) * W;
      const cy = p0.y * H;
      const bw = Math.abs(p1.x - p0.x) * W * 0.85;
      const bh = 95 + beatPulse * 25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.28 + beatPulse * 0.14;
      ctx.drawImage(BP_ASSETS.beam, cx - bw / 2, cy - bh, bw, bh);
      ctx.restore();
    }
  }

  // Indikator Posisi Badan Pemain ("KAMU") di Garis Depan Runway
  const markerPos = projectRunwayPoint(beatSmasher.playerX * 4, 0.96);
  const mx = markerPos.x * W;
  const my = markerPos.y * H - 14 - beatPulse * 4;
  drawNeoPill(ctx, mx, my, beatSmasher.isDucking ? '⬇️ DUCK' : beatSmasher.isJumping ? '⬆️ JUMP' : '👟 KAMU', '#faf8f2', '#111113', 12);

  ctx.restore();
}

function drawRunwayTarget(ctx, W, H, tgt, z, beatPulse) {
  // Target tangan (punch, dual) serta rintangan badan (wall, duck) dirender langsung
  // dalam 3D WebGL oleh BeatPose scene di background dengan model 3D asli, bukan gambar 2D flat di canvas.
  if (tgt.category === 'punch' || tgt.category === 'dual' || tgt.category === 'wall' || tgt.category === 'duck') {
    return;
  }

  ctx.save();

  if (tgt.category === 'step') {
    // Pad Lantai Neon BeatPose (untuk gerakan kaki / step)
    const z0 = Math.max(0, z - 0.07);
    const z1 = Math.min(1.12, z + 0.04);
    const p0 = projectRunwayPoint(tgt.lane + 0.08, z0);
    const p1 = projectRunwayPoint(tgt.lane + 0.92, z0);
    const p2 = projectRunwayPoint(tgt.lane + 0.92, z1);
    const p3 = projectRunwayPoint(tgt.lane + 0.08, z1);

    const mid = projectRunwayPoint(tgt.lane + 0.5, z, 0.02);
    if (BP_ASSETS.glow.complete && BP_ASSETS.glow.naturalWidth > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + beatPulse * 0.25;
      const gw = Math.max(40, (p2.x - p3.x) * W * 1.45);
      ctx.drawImage(BP_ASSETS.glow, mid.x * W - gw / 2, mid.y * H - gw * 0.35, gw, gw * 0.7);
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = tgt.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = tgt.color;
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.moveTo(p0.x * W, p0.y * H);
    ctx.lineTo(p1.x * W, p1.y * H);
    ctx.lineTo(p2.x * W, p2.y * H);
    ctx.lineTo(p3.x * W, p3.y * H);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    if (mid.scale > 0.45) {
      drawNeoPill(ctx, mid.x * W, mid.y * H, tgt.label, 'rgba(9, 6, 16, 0.85)', '#ffffff', Math.round(13 * mid.scale));
    }
  } else if (tgt.category === 'jump') {
    // Laser Lantai Penuh Cyan-Gold Gaya BeatPose (LONCAT!)
    const tL = projectRunwayPoint(0, z, 0.08);
    const tR = projectRunwayPoint(4, z, 0.08);
    const bL = projectRunwayPoint(0, z, 0);
    const jX = tL.x * W;
    const jY = tL.y * H;
    const jW = (tR.x - tL.x) * W;
    const jH = (bL.y - tL.y) * H;

    if (BP_ASSETS.glow.complete && BP_ASSETS.glow.naturalWidth > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + beatPulse * 0.25;
      ctx.drawImage(BP_ASSETS.glow, jX - jW * 0.1, jY - jH * 0.8, jW * 1.2, jH * 2.6);
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = '#00d2ff';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(0, 210, 255, 0.65)';
    ctx.fillRect(jX, jY, jW, jH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(jX, jY, jW, jH);
    ctx.restore();

    const midX = jX + jW / 2;
    const midY = jY + jH / 2;
    if (tL.scale > 0.38) {
      drawNeoPill(ctx, midX, midY, '⬆️ LONCAT!', 'rgba(9, 6, 16, 0.88)', '#00d2ff', Math.round(16 * tL.scale));
    }
  }

  ctx.restore();
}

function draw3DPunchCard(ctx, cx, cy, scale, color, label, stampIdx, beatPulse) {
  const size = Math.max(26, 94 * scale * (1 + beatPulse * 0.06));
  const half = size / 2;
  const r = Math.max(6, 14 * scale);

  ctx.save();

  // Aura Glow BeatPose di belakang kubus
  if (BP_ASSETS.glow.complete && BP_ASSETS.glow.naturalWidth > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    const gSz = size * 1.9;
    ctx.drawImage(BP_ASSETS.glow, cx - gSz / 2, cy - gSz / 2, gSz, gSz);
    ctx.restore();
  }

  // Kubus 3D BeatPose (Sisi Gelap + Depan Bercahaya)
  ctx.shadowColor = color;
  ctx.shadowBlur = 18 * scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(cx - half, cy - half, size, size, r);
  ctx.fill();

  // Inner 3D Bevel Frame
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = Math.max(2, 3.2 * scale);
  ctx.stroke();

  // Panah Putih Ikonik Beat Saber / BeatPose di Tengah Kubus
  ctx.fillStyle = '#ffffff';
  const aW = size * 0.34;
  const aH = size * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx - aW, cy - aH * 0.45);
  ctx.lineTo(cx + aW, cy - aH * 0.45);
  ctx.lineTo(cx, cy + aH * 0.75);
  ctx.closePath();
  ctx.fill();

  // Label kecil L / R
  if (scale > 0.45 && label) {
    ctx.font = `900 ${Math.max(10, Math.round(12 * scale))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx, cy - size * 0.31);
  }

  ctx.restore();
}

function drawNeonSaberTrail(ctx, W, H, points, color, handCode, nowTime, curHand) {
  ctx.save();

  // 1. Gambar Busur Jejak Saber (HANYA jika ada gerakan busur aktif)
  const trailLifespan = 150;
  if (points && points.length >= 2) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      if (p1.break) continue;

      const age = nowTime ? Math.max(0, nowTime - p1.t) : 0;
      const ageAlpha = Math.max(0, 1 - age / trailLifespan);
      if (ageAlpha <= 0.05) continue;

      const ratio = i / points.length;
      const w = 3 + ratio * 8; // Ramping, elegan (bukan batang raksasa)

      // Glow neon luar halus
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.globalAlpha = ageAlpha * 0.65;
      ctx.lineWidth = w * 1.4;
      ctx.beginPath();
      ctx.moveTo(p0.x * W, p0.y * H);
      ctx.lineTo(p1.x * W, p1.y * H);
      ctx.stroke();

      // Inti putih neon tipis
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = ageAlpha * 0.85;
      ctx.lineWidth = Math.max(1.5, w * 0.35);
      ctx.beginPath();
      ctx.moveTo(p0.x * W, p0.y * H);
      ctx.lineTo(p1.x * W, p1.y * H);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 2. Reticle / Cincin Neon di Posisi Tangan Nyata Saat Ini
  if (curHand) {
    const hx = curHand.x * W;
    const hy = curHand.y * H;

    // Aura Glow BeatPose halus
    if (BP_ASSETS.glow.complete && BP_ASSETS.glow.naturalWidth > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(BP_ASSETS.glow, hx - 36, hy - 36, 72, 72);
      ctx.restore();
    }

    // Reticle Cyber Berputar Ramping
    if (BP_ASSETS.cursor.complete && BP_ASSETS.cursor.naturalWidth > 0) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(performance.now() * 0.003);
      ctx.globalAlpha = 0.75;
      ctx.drawImage(BP_ASSETS.cursor, -22, -22, 44, 44);
      ctx.restore();
    }

    // Cincin Neon Saber Tip
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.font = '900 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(handCode, hx, hy);
    ctx.restore();
  }

  ctx.restore();
}

function drawBurstsAndPopups(ctx, W, H) {
  // 0. Serpihan Kaca Laser Pecah Saat Tabrak Dinding (Shatter Impact Konsep 1)
  for (let i = beatSmasher.glassShards.length - 1; i >= 0; i--) {
    const sh = beatSmasher.glassShards[i];
    sh.x += sh.vx;
    sh.y += sh.vy;
    sh.vy += 0.0007; // Gravitasi serpihan kaca
    sh.rot += sh.vRot;
    sh.life--;
    const alpha = Math.max(0, sh.life / sh.maxLife);
    const sx = sh.x * W;
    const sy = sh.y * H;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((sh.rot * Math.PI) / 180);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = sh.color;
    ctx.shadowColor = sh.color;
    ctx.shadowBlur = 16;

    ctx.beginPath();
    ctx.moveTo(sh.pts[0].x, sh.pts[0].y);
    for (let p = 1; p < sh.pts.length; p++) {
      ctx.lineTo(sh.pts[p].x, sh.pts[p].y);
    }
    ctx.closePath();
    ctx.fill();

    // Garis tepi putih laser tajam
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    if (sh.life <= 0) beatSmasher.glassShards.splice(i, 1);
  }

  // 0.2. Efek Tebasan Slash (slice.png dari beat-pose)
  for (let i = beatSmasher.slices.length - 1; i >= 0; i--) {
    const sl = beatSmasher.slices[i];
    sl.life--;
    const alpha = Math.max(0, sl.life / sl.maxLife);
    if (BP_ASSETS.slice.complete && BP_ASSETS.slice.naturalWidth > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.9;
      ctx.translate(sl.x * W, sl.y * H);
      ctx.rotate(sl.angle);
      const sz = sl.size * (1.2 - 0.3 * alpha);
      ctx.drawImage(BP_ASSETS.slice, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    if (sl.life <= 0) beatSmasher.slices.splice(i, 1);
  }

  // 0.5. Percikan Cahaya (spark.png & spark2.png dari beat-pose)
  for (let i = beatSmasher.sparks.length - 1; i >= 0; i--) {
    const sp = beatSmasher.sparks[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.life--;
    const alpha = Math.max(0, sp.life / sp.maxLife);
    const img = sp.alt ? BP_ASSETS.spark1 : BP_ASSETS.spark2;
    if (img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.85;
      ctx.translate(sp.x * W, sp.y * H);
      ctx.rotate(sp.rot);
      const sz = sp.size * alpha;
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    if (sp.life <= 0) beatSmasher.sparks.splice(i, 1);
  }

  // 1. Neon Shockwaves (BeatPose Style)
  for (let i = beatSmasher.shockwaves.length - 1; i >= 0; i--) {
    const sw = beatSmasher.shockwaves[i];
    sw.r += 4.5;
    sw.alpha -= 0.055;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, sw.alpha);
    ctx.shadowColor = sw.color;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sw.x * W, sw.y * H, sw.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    if (sw.alpha <= 0 || sw.r >= sw.maxR) beatSmasher.shockwaves.splice(i, 1);
  }

  // 2. Pecahan Kubus & Partikel Neon BeatPose (menggantikan stiker bintang flat)
  for (let i = beatSmasher.starBursts.length - 1; i >= 0; i--) {
    const st = beatSmasher.starBursts[i];
    st.x += st.vx;
    st.y += st.vy;
    st.vy += 0.00028;
    st.rot += st.vRot;
    st.life--;
    const alpha = Math.max(0, st.life / st.maxLife);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.9;
    ctx.translate(st.x * W, st.y * H);
    ctx.rotate((st.rot * Math.PI) / 180);
    const sz = Math.max(6, (st.size * 0.42) * (0.4 + 0.6 * alpha));
    ctx.shadowColor = st.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = st.color;
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
    ctx.restore();

    if (st.life <= 0) beatSmasher.starBursts.splice(i, 1);
  }

  // 3. Teks Popup Komik Melayang
  for (let i = beatSmasher.popups.length - 1; i >= 0; i--) {
    const pop = beatSmasher.popups[i];
    pop.y -= 0.0018;
    pop.life--;
    const alpha = Math.max(0, pop.life / pop.maxLife);

    ctx.save();
    ctx.globalAlpha = alpha;
    drawComicHeadline(ctx, pop.text, pop.x * W, pop.y * H, 24, pop.color);
    ctx.restore();

    if (pop.life <= 0) beatSmasher.popups.splice(i, 1);
  }
}

function drawArcadeOverlays(ctx, W, H, elapsed, beatPulse) {
  if (!beatSmasher.active || !beatSmasher.roundStartedAt) return;

  // 1. Sky Callout ("BAM!", "DOUBLE BAM!", "LOW CLEAR!") di antara HUD atas dan ujung Runway
  if (beatSmasher.skyBanner && beatSmasher.skyBanner.life > 0) {
    const b = beatSmasher.skyBanner;
    b.life--;
    const scale = 1 + 0.12 * Math.sin((b.life / b.maxLife) * Math.PI);
    ctx.save();
    ctx.translate(W * 0.5, H * 0.32);
    ctx.scale(scale, scale);
    drawComicHeadline(ctx, b.text, 0, 0, 42, b.color);
    ctx.restore();
  }

  // 2. Giant Combo Counter Pojok Kanan Atas (Gaya Stay On Beat versi Pop-Zine)
  if (state.combo >= 1) {
    const cx = W - 115;
    const cy = 118;
    const sc = beatSmasher.comboPopScale;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.04);
    ctx.scale(sc, sc);

    drawComicHeadline(ctx, `${state.combo}`, 0, 0, 62, '#fde047');
    drawComicHeadline(ctx, 'COMBO', 0, 38, 18, '#ffffff');

    const tierLabel = state.combo >= 20 ? 'DEWA RUSH!' : state.combo >= 10 ? 'GOKIL!' : state.combo >= 5 ? 'MANTAP!' : 'NICE!';
    const tierColor = state.combo >= 20 ? '#22c55e' : state.combo >= 10 ? '#fb923c' : '#38bdf8';
    drawNeoPill(ctx, 0, 68, tierLabel, tierColor, '#111113', 13);

    ctx.restore();
  }

  // 3. Bingkai Chorus Frenzy 2X (Detik 32 - 60)
  if (elapsed >= 32000) {
    ctx.save();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 8 + beatPulse * 4;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.strokeStyle = '#111113';
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.restore();
  }
}

function drawNeoPill(ctx, x, y, text, bgColor, textColor, fontSize = 13) {
  ctx.save();
  ctx.font = `800 ${fontSize}px "JetBrains Mono", monospace`;
  const padX = fontSize * 0.85;
  const padY = fontSize * 0.45;
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontSize + padY * 2;

  ctx.fillStyle = '#111113';
  ctx.beginPath();
  ctx.roundRect(x - w / 2 + 3, y - h / 2 + 3, w, h, 999);
  ctx.fill();

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 999);
  ctx.fill();

  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function drawComicHeadline(ctx, text, x, y, fontSize, fillColor) {
  ctx.save();
  ctx.font = `900 ${fontSize}px "Archivo Black", "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Hard offset shadow
  ctx.fillStyle = '#111113';
  ctx.fillText(text, x + 4, y + 4);

  // Thick ink outline
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = Math.max(4, fontSize * 0.16);
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);

  // Main pop fill
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Fallback kompatibilitas
export function playPoseSfx() { sfx.smash(false); }
export function detectPoseMatch() { return false; }
export function measurePoseMotion() { return 0; }
export function renderPoseGuideCanvas() {}
