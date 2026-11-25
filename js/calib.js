import { $, CONFIG, STAR_STAMPS, HAND_EDGES, POSE_EDGES, POSE_DOTS, state, calib, vision, now, later } from './config.js';
import { showScreen, setStep, dimCam, setGameMode, flash } from './ui.js';
import { sfx } from './audio.js';
import { refreshPadUI } from './gamepad.js';
import { captureWebcamPhoto, captureSignatureFromCalib, exportCompactSignature, saveIdentity, updateIdentityPhoto, hasValidIdentity } from './identity.js';

let lastPhotoCountStep = null;
let retakeCountdownTimer = null;

export function getDrawnPointCount() {
  let count = calib.currentShape ? calib.currentShape.length : 0;
  for (const sh of calib.shapes || []) count += sh.length;
  return count;
}

export function hasValidDrawing() {
  return getDrawnPointCount() >= 6 && calib.ink >= CONFIG.minInkToUnlockFist;
}
import { dist, checkDrawGesture } from './vision.js';
import { renderBeatSmasherCanvas } from './games/kinestetik.js';

let onCalibFinishCb = () => { };
export function setCalibFinishHandler(fn) {
  onCalibFinishCb = fn;
}

export function startCalibration() {
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
  $('calib-viewfinder')?.classList.remove('active');
  $('calib-id-preview')?.classList.add('hidden');
  if ($('calib-photo-count')) {
    $('calib-photo-count').textContent = '3';
    $('calib-photo-count').style.opacity = '0';
  }
  lastPhotoCountStep = null;
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
      const isGold = Math.random() > 0.45;
      calib.particles.push({
        x: st.x,
        y: st.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 35,
        maxLife: 35,
        color: `rgb(${isGold ? 234 : 244},${isGold ? 179 : 244},${isGold ? 8 : 240})`,
      });
    }
  }
}

export function clearCalibrationInk() {
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
  calib.ink = 0;
  calib.fistEnabled = false;
  calib.fistStart = null;
  calib.progress = 0;
  lastPhotoCountStep = null;

  if ($('ink-bar')) $('ink-bar').style.width = '0%';
  if ($('ink-pct')) $('ink-pct').textContent = '0%';
  if ($('fist-box')) $('fist-box').style.opacity = 0;
  if ($('fist-bar')) $('fist-bar').style.width = '0%';
  if ($('calib-title')) {
    $('calib-title').textContent = 'Gambar Inisialmu';
    $('calib-title').classList.remove('ready');
  }
  $('calib-viewfinder')?.classList.remove('active');
  if ($('calib-photo-count')) $('calib-photo-count').style.opacity = '0';
  sfx.tick();
}

function getSelectedStarShape(x, y) {
  for (let i = calib.shapes.length - 1; i >= 0; i--) {
    const shape = calib.shapes[i];
    for (const st of shape) {
      if (Math.hypot(x - st.x, y - st.y) < 0.035) return shape;
    }
  }
  return null;
}

export function updateCalibration(m, ts) {
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
    if (calib.currentShape.length) calib.shapes.push(calib.currentShape);
    calib.currentShape = [];
    calib.drawing = false;
  }

  if (calib.drawing && g.mode === 'draw') {
    const last = calib.currentShape[calib.currentShape.length - 1];
    const stepDist = last ? Math.hypot(calib.tip.x - last.x, calib.tip.y - last.y) : Infinity;
    if (stepDist >= 0.022) {
      calib.ink += last ? stepDist : 0.022;
      calib.currentShape.push({
        x: calib.tip.x,
        y: calib.tip.y,
        stampIdx: Math.floor(Math.random() * STAR_STAMPS.length),
        angle: Math.random() * 360,
        speed: [-3, -2, -1, 1, 2, 3][Math.floor(Math.random() * 6)],
      });
    }
  }

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

  if (g.mode === 'clear') {
    if (!calib.clearStart) calib.clearStart = ts;
    if (!calib.clearWasActive && ts - calib.clearStart >= 180) {
      if (calib.shapes.length || calib.currentShape.length) {
        clearCalibrationInk();
      }
      calib.clearWasActive = true;
    }
  } else {
    calib.clearStart = null;
    calib.clearWasActive = false;
  }

  if (g.mode === 'fist' && calib.fistEnabled && hasValidDrawing()) {
    calib.fistStart ??= ts;
    calib.lastFist = ts;
    calib.progress = Math.min(1, (ts - calib.fistStart) / CONFIG.fistHoldMs);
    if (calib.progress >= 1) finishCalibration();
  } else if (calib.fistStart && ts - calib.lastFist > CONFIG.fistGraceMs) {
    calib.fistStart = null;
    calib.progress = 0;
  }
}

export function tickCalibration() {
  const validDraw = hasValidDrawing();
  const ptCount = getDrawnPointCount();
  const inkRatio = ptCount > 0 ? Math.min(1, calib.ink / CONFIG.minInkToUnlockFist) : 0;
  if ($('ink-bar')) $('ink-bar').style.width = `${(inkRatio * 100).toFixed(0)}%`;
  if ($('ink-pct')) $('ink-pct').textContent = `${(inkRatio * 100).toFixed(0)}%`;

  const badge = $('gesture-badge');
  if (badge) {
    const base = 'calib-card font-mono text-[11px] font-bold px-3 py-1 transition-colors';
    if (!vision.handVisible) {
      badge.textContent = 'Tangan belum terdeteksi';
      badge.className = `${base} text-zinc-500`;
    } else if (calib.gestureMode === 'fist' && !validDraw) {
      badge.textContent = '⚠ Gambar inisialmu dulu!';
      badge.className = `${base} !bg-[#fecaca] text-[#991b1b]`;
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

  // Validasi ketat: wajib ada gambar coretan nyata sebelum bisa kepal & foto
  if (!calib.fistEnabled && validDraw) {
    calib.fistEnabled = true;
    $('fist-box').style.opacity = 1;
    $('calib-title').textContent = 'Senyum & Kepal Tangan';
    $('calib-title').classList.add('ready');
    $('calib-viewfinder')?.classList.add('active');
    sfx.tick();
  } else if (calib.fistEnabled && !validDraw) {
    calib.fistEnabled = false;
    calib.fistStart = null;
    calib.progress = 0;
    $('fist-box').style.opacity = 0;
    $('calib-title').textContent = 'Gambar Inisialmu';
    $('calib-title').classList.remove('ready');
    $('calib-viewfinder')?.classList.remove('active');
  }
  $('fist-bar').style.width = `${(calib.progress * 100).toFixed(1)}%`;
  $('fist-label').textContent = `${(calib.progress * 2).toFixed(1)} / 2.0s`;

  const countEl = $('calib-photo-count');
  if (countEl && calib.fistEnabled) {
    if (calib.progress > 0.02) {
      const step = calib.progress < 0.34 ? 3 : calib.progress < 0.67 ? 2 : 1;
      countEl.textContent = String(step);
      countEl.style.opacity = '1';
      if (step !== lastPhotoCountStep) {
        lastPhotoCountStep = step;
        countEl.style.transform = 'scale(1.18)';
        setTimeout(() => { countEl.style.transform = 'scale(1)'; }, 120);
        sfx.countStep(step);
      }
    } else {
      countEl.style.opacity = '0';
      lastPhotoCountStep = null;
    }
  }
}

function showCalibIdPreview(identity) {
  const preview = $('calib-id-preview');
  if (!preview) {
    onCalibFinishCb();
    return;
  }
  if ($('calib-preview-serial')) $('calib-preview-serial').textContent = `#${identity.id}`;
  const photoEl = $('calib-preview-photo');
  if (photoEl && identity.photoDataUrl) {
    photoEl.src = identity.photoDataUrl;
    photoEl.classList.remove('hidden');
  }
  const sigEl = $('calib-preview-sig');
  if (sigEl && identity.signatureDataUrl) {
    sigEl.src = identity.signatureDataUrl;
    sigEl.classList.remove('hidden');
  }
  preview.classList.remove('hidden');
}

export function retakeCalibPhoto() {
  clearInterval(retakeCountdownTimer);
  retakeCountdownTimer = null;

  $('calib-id-preview')?.classList.add('hidden');
  $('calib-viewfinder')?.classList.add('active');
  if ($('calib-title')) $('calib-title').textContent = 'Pasang Pose Terbaikmu!';

  const countEl = $('calib-photo-count');
  let step = 3;
  if (countEl) {
    countEl.textContent = String(step);
    countEl.style.opacity = '1';
    countEl.style.transform = 'scale(1.18)';
    setTimeout(() => { countEl.style.transform = 'scale(1)'; }, 120);
  }
  sfx.countStep(step);

  retakeCountdownTimer = setInterval(() => {
    step--;
    if (step > 0) {
      if (countEl) {
        countEl.textContent = String(step);
        countEl.style.transform = 'scale(1.18)';
        setTimeout(() => { countEl.style.transform = 'scale(1)'; }, 120);
      }
      sfx.countStep(step);
    } else {
      clearInterval(retakeCountdownTimer);
      retakeCountdownTimer = null;
      if (countEl) countEl.style.opacity = '0';
      $('calib-viewfinder')?.classList.remove('active');

      const photoDataUrl = captureWebcamPhoto($('webcam'));
      sfx.shutter();
      flash('shutter');
      const identity = updateIdentityPhoto(photoDataUrl);
      later(() => {
        sfx.good();
        showCalibIdPreview(identity);
      }, 180);
    }
  }, 850);
}

export function confirmCalibIdentity() {
  if (!hasValidIdentity()) {
    sfx.bad();
    flash('bad');
    $('calib-id-preview')?.classList.add('hidden');
    startCalibration();
    return;
  }
  clearInterval(retakeCountdownTimer);
  retakeCountdownTimer = null;
  sfx.tick();
  onCalibFinishCb();
}

function finishCalibration() {
  if (!hasValidDrawing()) {
    calib.fistStart = null;
    calib.progress = 0;
    sfx.bad();
    return;
  }

  const photoDataUrl = captureWebcamPhoto($('webcam'));
  const signatureDataUrl = captureSignatureFromCalib(calib.shapes, calib.currentShape, STAR_STAMPS);
  const signatureVector = exportCompactSignature(calib.shapes, calib.currentShape);
  if (!signatureDataUrl) {
    calib.fistStart = null;
    calib.progress = 0;
    sfx.bad();
    return;
  }

  state.phase = 'calib-done';
  $('calib-viewfinder')?.classList.remove('active');

  const identity = saveIdentity({ photoDataUrl, signatureDataUrl, signatureVector });

  // Upload photo ke server booth & cloud storage otomatis
  if (photoDataUrl) {
    fetch('/api/upload-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: identity.id, photo: photoDataUrl })
    })
      .then(res => res.json())
      .then(data => {
        const photoUrl = data.cloudUrl || data.url;
        if (photoUrl) {
          saveIdentity({ photoServerUrl: photoUrl });
          window.dispatchEvent(new CustomEvent('stroop_photo_uploaded', { detail: { url: photoUrl } }));
          console.log('[Calib] Foto peserta berhasil tersimpan di Cloud:', photoUrl);
        }
      })
      .catch((err) => {
        console.warn('[Calib] Upload photo error:', err);
      });
  }

  sfx.shutter();
  flash('shutter');

  if (photoDataUrl) {
    later(() => {
      sfx.good();
      showCalibIdPreview(identity);
    }, 180);
  } else {
    later(() => { sfx.good(); onCalibFinishCb(); }, 650);
  }
}

/* --- Canvas Rendering --- */
const LOBBY_STAR_SLOTS = [
  { ax: 0.08, ay: 0.22, size: 54, stampIdx: 1, baseRot: -12, phase: 0.0 },
  { ax: 0.16, ay: 0.38, size: 42, stampIdx: 4, baseRot: 10, phase: 0.8 },
  { ax: 0.07, ay: 0.56, size: 50, stampIdx: 7, baseRot: -8, phase: 1.6 },
  { ax: 0.14, ay: 0.74, size: 44, stampIdx: 10, baseRot: 14, phase: 2.4 },
  { ax: 0.92, ay: 0.24, size: 54, stampIdx: 13, baseRot: 12, phase: 0.4 },
  { ax: 0.84, ay: 0.40, size: 42, stampIdx: 16, baseRot: -10, phase: 1.2 },
  { ax: 0.93, ay: 0.58, size: 50, stampIdx: 19, baseRot: 8, phase: 2.0 },
  { ax: 0.86, ay: 0.75, size: 44, stampIdx: 22, baseRot: -14, phase: 2.8 },
];
const lobbySparks = [];

window.addEventListener('pointermove', (e) => {
  if (state.phase !== 'boot' && !document.body.classList.contains('game-mode')) return;
  if (Math.random() > 0.5) return;
  lobbySparks.push({
    x: e.clientX,
    y: e.clientY,
    vx: (Math.random() - 0.5) * 1.5,
    vy: -1.0 - Math.random() * 1.0,
    size: 16 + Math.random() * 12,
    angle: Math.random() * 360,
    speed: (Math.random() > 0.5 ? 1 : -1) * 2.5,
    stampIdx: Math.floor(Math.random() * STAR_STAMPS.length),
    life: 26,
    maxLife: 26,
  });
});


function fitCanvas() {
  const canvas = $('fx');
  const video = $('webcam');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s;
  const dh = vh * s;
  return { ctx, W, H, ox: (W - dw) / 2, oy: (H - dh) / 2, dw, dh };
}

const toScreen = (p, M) => ({ x: M.ox + p.x * M.dw, y: M.oy + p.y * M.dh });

function renderLobbyStars(M, t) {
  const { ctx } = M;
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

function renderPoseSkeleton(M) {
  const lm = vision.poseLm;
  if (!lm) return;
  const { ctx } = M;
  const isMatched = state.phase === 'feedback';
  const dotColor = state.kinFreezeActive
    ? '#38bdf8'
    : isMatched
      ? '#22e07a'
      : '#ff00e5';

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [a, b] of POSE_EDGES) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb || (pa.visibility ?? 1) < 0.35 || (pb.visibility ?? 1) < 0.35) continue;
    const sa = toScreen(pa, M);
    const sb = toScreen(pb, M);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }

  for (const idx of POSE_DOTS) {
    const p = lm[idx];
    if (!p || (p.visibility ?? 1) < 0.35) continue;
    const s = toScreen(p, M);
    const r = idx === 0 ? 11 : 9;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(17, 17, 19, 0.45)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  ctx.restore();
}

export function renderCanvas() {
  const M = fitCanvas();
  const { ctx } = M;
  ctx.clearRect(0, 0, M.W, M.H);
  const t = now();

  if (state.current === 'kinestetik' && ['intro-hand', 'count', 'stim-kin', 'feedback'].includes(state.phase)) {
    renderBeatSmasherCanvas(M, t);
    return;
  }

  if (state.phase === 'boot' || document.body.classList.contains('game-mode')) {
    renderLobbyStars(M, t);
    return;
  }

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

  if (document.body.classList.contains('game-mode')) return;

  const m = vision.lm;
  if (!m) return;

  const pts = m.map((p) => toScreen(p, M));
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(244, 244, 240, 0.42)';
  ctx.beginPath();
  for (const [a, b] of HAND_EDGES) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
  ctx.stroke();
  ctx.fillStyle = '#eab308';
  for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill(); }

  if (state.phase === 'calib' && calib.tip) {
    const c = toScreen(calib.tip, M);
    const drawing = calib.drawing && calib.gestureMode !== 'fist';
    if (drawing) {
      ctx.fillStyle = '#f4f4f0';
      ctx.shadowColor = '#eab308';
      ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 244, 240, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

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

  if (['stim-kin', 'fixation', 'intro-hand', 'count'].includes(state.phase) && vision.wristTrail.length > 1) {
    const tr = vision.wristTrail.map((p) => toScreen(p, M));
    for (let i = 1; i < tr.length; i++) {
      const k = i / tr.length;
      ctx.lineWidth = 4 + 18 * k;
      ctx.strokeStyle = `rgba(234, 179, 8, ${(0.6 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
    }
  }
}

