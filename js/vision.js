import { $, CONFIG, state, calib, vision, now } from './config.js';
import { setChip } from './ui.js';

let hands = null;
let pose = null;
let onCalibUpdateCb = () => {};
let onSwipeCb = () => {};

export function setVisionHandlers({ onCalibUpdate, onSwipe }) {
  onCalibUpdateCb = onCalibUpdate;
  onSwipeCb = onSwipe;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const palmSizeOf = (m) => Math.max(dist(m[0], m[9]), dist(m[0], m[5]), 0.06);
export const palmCenterOf = (m) => ({
  x: (m[0].x + m[5].x + m[9].x + m[17].x) / 4,
  y: (m[0].y + m[5].y + m[9].y + m[17].y) / 4,
});

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

export function isFist(m) {
  const fingers = [
    [8, 6, 5],
    [12, 10, 9],
    [16, 14, 13],
    [20, 18, 17],
  ];
  for (const [tip, pip, mcp] of fingers) {
    if (!isFingerCurled(m, tip, pip, mcp)) return false;
    if (m[tip].y < m[pip].y - 0.01) return false;
  }
  if (isFingerExtended(m, 8, 6, 5, 1.05)) return false;

  const pSize = palmSizeOf(m) || 1e-6;
  const pCenter = palmCenterOf(m);
  const avgDist = [8, 12, 16, 20].reduce((s, t) => s + dist(m[t], pCenter), 0) / 4 / pSize;
  const thumbDist = dist(m[4], pCenter) / pSize;
  return avgDist < 0.85 && thumbDist < 1.05;
}

export function checkDrawGesture(m, currentlyDrawing) {
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

  const thumbOpen = thumbOut || (dTipPinky / pSize) > 0.55;

  if (indexExt && thumbOpen && middleExt && ringExt && pinkyExt) {
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

    const sign = Math.sign(dx);
    let k = this.hist.length - 1;
    while (k > 0 && (this.hist[k].x - this.hist[k - 1].x) * sign > 0.002) k--;
    const onset = this.hist[k].t;

    this.coolUntil = t + this.cooldownMs;
    this.hist = [];
    return { dir: sign > 0 ? 'right' : 'left', onset, velocity: v };
  }
}

export const swipe = new SwipeDetector({
  windowMs: CONFIG.swipeWindowMs,
  minVelocity: CONFIG.swipeMinVelocity,
  minDistance: CONFIG.swipeMinDistance,
  cooldownMs: CONFIG.swipeCooldownMs,
});

export async function initVision() {
  const video = $('webcam');

  const idealW = CONFIG.camIdealWidth || 1920;
  const idealH = CONFIG.camIdealHeight || 1080;
  const idealFps = CONFIG.camIdealFps || 60;

  // Prioritaskan resolusi Full HD / 60fps untuk iPhone 12 + Iriun Webcam
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
    console.warn('[Camera] High-def constraint gagal, fallback ke resolusi standar:', err);
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
  }

  // Cek apakah ada kamera khusus iPhone / Iriun Webcam jika browser memilih webcam default lain
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');
    const currentTrack = stream.getVideoTracks()[0];
    const currentLabel = (currentTrack?.label || '').toLowerCase();

    const iriunDevice = videoDevices.find((d) => /iriun|iphone|apple/i.test(d.label));
    if (iriunDevice && !currentLabel.includes('iriun') && !currentLabel.includes('iphone')) {
      console.info(`[Camera] Terdeteksi kamera iPhone / Iriun Webcam: "${iriunDevice.label}". Beralih otomatis...`);
      currentTrack.stop();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: iriunDevice.deviceId },
          width: { ideal: idealW, max: 3840 },
          height: { ideal: idealH, max: 2160 },
          frameRate: { ideal: idealFps, min: 30 },
        },
      });
    }
  } catch (enumErr) {
    console.warn('[Camera] Enumerasi device dilewati:', enumErr);
  }

  video.srcObject = stream;
  await video.play();

  const activeTrack = stream.getVideoTracks()[0];
  const settings = activeTrack?.getSettings ? activeTrack.getSettings() : {};
  const actualW = settings.width || video.videoWidth || idealW;
  const actualH = settings.height || video.videoHeight || idealH;
  const actualFps = settings.frameRate ? Math.round(settings.frameRate) : null;
  const trackName = activeTrack?.label || 'Webcam';

  console.info(`[Camera HD Active] ${trackName} (${actualW}x${actualH}${actualFps ? ` @${actualFps}fps` : ''})`);

  const chipText = actualH >= 1080 ? 'CAM 1080p ✓' : actualH >= 720 ? 'CAM 720p ✓' : 'CAM ✓';
  setChip('chip-cam', true, chipText);
  const chipEl = $('chip-cam');
  if (chipEl) {
    chipEl.title = `${trackName} (${actualW}x${actualH}${actualFps ? ` @${actualFps}fps` : ''})`;
  }

  hands = new window.Hands({
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

  if (typeof window.Pose !== 'undefined') {
    pose = new window.Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${CONFIG.poseVersion}/${f}`,
    });
    pose.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      minDetectionConfidence: 0.50,
      minTrackingConfidence: 0.50,
    });
    pose.onResults(onPoseResults);
    await pose.initialize();
  }

  vision.ready = true;
}

export function stopVisionCamera() {
  const video = $('webcam');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((tr) => tr.stop());
    video.srcObject = null;
  }
  vision.ready = false;
  vision.busy = false;
}

export async function resumeVisionCamera() {
  const video = $('webcam');
  if (!video) return;
  if (video.srcObject && vision.ready) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
    });
    video.srcObject = stream;
    await video.play();
    vision.ready = true;
  } catch (err) {
    console.warn('[Camera] Gagal menyalakan ulang kamera:', err);
  }
}

function shouldUsePose() {
  return Boolean(
    pose &&
    state.current === 'kinestetik' &&
    ['intro-hand', 'count', 'stim-kin', 'feedback'].includes(state.phase)
  );
}

export function pumpVision() {
  const video = $('webcam');
  if (!vision.ready || vision.busy || !video || video.readyState < 2) return;
  if (video.currentTime === vision.lastVideoTime) return;
  vision.lastVideoTime = video.currentTime;
  vision.busy = true;
  vision.pendingTs = now();
  const runner = shouldUsePose() ? pose : hands;
  runner.send({ image: video })
    .catch((e) => console.error('[MediaPipe]', e))
    .finally(() => { vision.busy = false; });
}

function onPoseResults(res) {
  const ts = vision.pendingTs;
  const raw = res.poseLandmarks;
  if (raw && raw.length >= 29) {
    const mirrored = raw.map((p) => ({
      x: 1 - p.x,
      y: p.y,
      z: p.z,
      visibility: p.visibility ?? 1,
    }));
    if (vision.poseLm && vision.poseLm.length === mirrored.length) {
      vision.poseLm = mirrored.map((p, i) => ({
        x: vision.poseLm[i].x * 0.08 + p.x * 0.92,
        y: vision.poseLm[i].y * 0.08 + p.y * 0.92,
        z: vision.poseLm[i].z * 0.08 + p.z * 0.92,
        visibility: p.visibility,
      }));
    } else {
      vision.poseLm = mirrored;
    }
    const visOk = (vision.poseLm[11].visibility > 0.45 && vision.poseLm[12].visibility > 0.45);
    vision.poseVisible = visOk;
    if (visOk) vision.poseLastSeen = ts;
    vision.handVisible = visOk;
    vision.lastSeen = visOk ? ts : vision.lastSeen;
  } else {
    vision.poseLm = null;
    if (ts - vision.poseLastSeen > 350) {
      vision.poseVisible = false;
      vision.handVisible = false;
    }
  }
}

function onHandResults(res) {
  const ts = vision.pendingTs;
  const raw = res.multiHandLandmarks && res.multiHandLandmarks[0];
  if (raw) {
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
  const pc = palmCenterOf(m);
  vision.wristTrail.push({ x: pc.x, y: pc.y, t: ts });
  while (vision.wristTrail.length && ts - vision.wristTrail[0].t > 350) vision.wristTrail.shift();

  if (state.phase === 'calib') onCalibUpdateCb(m, ts);

  if (['fixation', 'stim-kin', 'result'].includes(state.phase) && (state.phase !== 'fixation' || state.current === 'kinestetik')) {
    const s = swipe.update(pc.x, ts);
    if (s) onSwipeCb(s, ts);
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
    if (calib.fistStart && ts - calib.lastFist > CONFIG.fistGraceMs) {
      calib.fistStart = null;
      calib.progress = 0;
    }
  }
}

