import { $, CONFIG, gamepadState, getPsStyle, state, vision, now, later } from './config.js';
import { setChip, hitKey } from './ui.js';
import { bgm, sfx, voice } from './audio.js';
import { pollGamepad, refreshPadUI, toggleDiagModal, initGamepadEvents, setGamepadHandlers } from './gamepad.js';
import { initVision, pumpVision, setVisionHandlers } from './vision.js';
import { renderCanvas } from './calib.js';
import { renderHudIdentityChip, hasValidIdentity } from './identity.js';
import { showIntro, tickIntro, startCountdown, startDemoMode, exitDemoMode, prematureResponse, handlePadResponse, tickTrial, tickResult, showSharedResult, resetGame, onSwipe, advanceFromStageClear, skipCurrentTest, debugTriggerKinPose, preloadBeatPose, downloadResultCard } from './game.js';

function handleIntroPadPress(btn) {
  const { BTN } = gamepadState;
  if (btn === BTN.START) {
    if (now() < state.introReadyAt) return;
    state.practiceHint = 'Siap! Memulai hitung mundur...';
    sfx.good();
    later(() => {
      if (state.phase === 'intro-pad') startCountdown();
    }, 180);
    return;
  }

  hitKey(btn);
  const info = getPsStyle(btn);
  sfx.tick();
  const label = { '○': 'MERAH', '✕': 'BIRU', '△': 'HIJAU', '□': 'PINK' }[info.sym] || '';
  state.practiceHint = `Tes tombol ${info.sym} ${label} OK · Tekan START di stik PS untuk mulai`.trim();
}

function onButtonDown(btn, t) {
  const { BTN, TEST_BUTTONS } = gamepadState;
  sfx.init();
  if (bgm.enabled && !bgm.started) bgm.play();

  switch (state.phase) {
    case 'intro-pad':
      handleIntroPadPress(btn);
      break;
    case 'fixation':
      if (TEST_BUTTONS.includes(btn)) prematureResponse();
      break;
    case 'stim-visual':
    case 'stim-audio':
      if (TEST_BUTTONS.includes(btn)) handlePadResponse(btn, t);
      break;
    case 'stage-clear':
      if (btn === BTN.START || btn === BTN.CROSS) advanceFromStageClear();
      break;
    case 'result':
      if (btn === BTN.START && now() >= state.resetUnlockAt) resetGame();
      break;
  }
}

function loop() {
  pollGamepad();
  pumpVision();

  switch (state.phase) {
    case 'intro-pad':
    case 'intro-hand': tickIntro(); break;
    case 'stim-visual':
    case 'stim-audio':
    case 'stim-kin': tickTrial(); break;
    case 'result': tickResult(); break;
  }

  setChip('chip-hand', vision.handVisible, vision.handVisible ? 'HAND ✓' : 'HAND ✕');
  bgm.syncPhase(state.phase);
  refreshPadUI();
  renderCanvas();
  requestAnimationFrame(loop);
}

setGamepadHandlers({
  onButtonDown,
  onPadDisconnectAbort: (key) => showIntro(key),
});
setVisionHandlers({
  onCalibUpdate: () => { },
  onSwipe,
});

initGamepadEvents();

if (CONFIG.debugKeys) {
  const skipBtn = $('btn-debug-skip');
  if (skipBtn) {
    skipBtn.classList.remove('hidden');
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      skipCurrentTest();
    });
  }
}

$('btn-bgm')?.addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.tick();
  bgm.toggle();
});

const fsBtn = $('btn-fullscreen');
if (fsBtn) {
  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.tick();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    } else {
      document.documentElement.requestFullscreen?.().catch(() => { });
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement ? '🗗 EXIT' : '⛶ FULL';
  });
}

$('btn-test-voice')?.addEventListener('click', (e) => {
  e.stopPropagation();
  voice.play('lingkaran', 1.0);
  state.practiceHint = 'Contoh suara instruksi: "LINGKARAN". Pastikan terdengar lantang!';
});

$('btn-intro-start')?.addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.tick();
  if (bgm.enabled && !bgm.started) bgm.play();
  startCountdown();
});

$('btn-stage-next')?.addEventListener('click', (e) => {
  e.stopPropagation();
  advanceFromStageClear();
});

document.addEventListener('click', (e) => {
  const keyBtn = e.target.closest('.ps-key');
  if (keyBtn) {
    const btn = Number(keyBtn.dataset.btn);
    if (!Number.isNaN(btn)) onButtonDown(btn, now());
    return;
  }
  if (e.target.closest('button, a, #chip-pad')) {
    sfx.tick();
  }
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'Tab') {
    e.preventDefault();
    toggleDiagModal();
    return;
  }
  if (e.key === 'Escape') {
    if (gamepadState.diagModalOpen) {
      toggleDiagModal(false);
      return;
    }
    if (state.isDemo) {
      exitDemoMode(false);
      return;
    }
  }
  if (e.repeat) return;
  if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  } else if (state.phase === 'shared') {
    return;
  } else if (k === 'r') {
    resetGame();
  } else if ((k === ' ' || k === 'enter') && state.phase === 'stage-clear') {
    advanceFromStageClear();
  } else if (CONFIG.debugKeys) {
    if (k === 'n') { skipCurrentTest(); return; }
    if (['0', '1', '2', '3'].includes(k)) onButtonDown(Number(k), now());
    if ((k === ' ' || k === 'enter') && state.phase === 'intro-pad') onButtonDown(gamepadState.BTN.START, now());
    if (k === 'arrowright' || k === 'arrowleft' || k === 'arrowup' || k === 'arrowdown') {
      if (state.phase === 'stim-kin') { debugTriggerKinPose(); return; }
      const t = now();
      onSwipe({ dir: k === 'arrowright' ? 'right' : 'left', onset: t }, t);
    }
  }
});

const qs = new URLSearchParams(location.search);
if (qs.get('bgm') === '0') bgm.enabled = false;

$('btn-download-card')?.addEventListener('click', () => downloadResultCard());
$('btn-new-player')?.addEventListener('click', () => resetGame());
$('btn-intro-demo')?.addEventListener('click', (e) => {
  e.stopPropagation();
  startDemoMode();
});
$('btn-exit-demo')?.addEventListener('click', (e) => {
  e.stopPropagation();
  exitDemoMode(false);
});

if (qs.has('r')) {
  showSharedResult(qs);
} else if (!hasValidIdentity()) {
  location.replace('index.html?need_calib=1');
} else {
  document.body.classList.add('cam-active');
  initVision().catch((err) => {
    console.warn('[Game] Kamera belum aktif:', err);
    setChip('chip-cam', false, 'CAM ✕');
  });

  sfx.init();
  voice.init();
  bgm.init();
  renderHudIdentityChip();
  showIntro('visual');
  bgm.syncPhase(state.phase);

  // Preload A-Frame 3D stage BeatPose di latar belakang agar pas masuk Kinestetik tidak ada lag/stutter sama sekali
  setTimeout(() => {
    preloadBeatPose();
  }, 500);

  const unlockAudio = () => {
    sfx.init();
    if (bgm.enabled && !bgm.started) bgm.play();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
}

requestAnimationFrame(loop);

