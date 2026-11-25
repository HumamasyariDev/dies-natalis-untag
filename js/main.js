import { $, CONFIG, gamepadState, state, vision, now } from './config.js';
import { showScreen, setChip } from './ui.js';
import { bgm, sfx, voice } from './audio.js';
import { pollGamepad, refreshPadUI, toggleDiagModal, initGamepadEvents, setGamepadHandlers } from './gamepad.js';
import { initVision, pumpVision, setVisionHandlers } from './vision.js';
import { startCalibration, clearCalibrationInk, updateCalibration, tickCalibration, setCalibFinishHandler, renderCanvas, retakeCalibPhoto, confirmCalibIdentity } from './calib.js';
import { showIntro, tickIntro, startCountdown, prematureResponse, handlePadResponse, tickTrial, tickResult, showSharedResult, resetGame, onSwipe } from './game.js';

function onButtonDown(btn, t) {
  const { BTN, TEST_BUTTONS } = gamepadState;
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

async function boot() {
  const status = $('boot-status');
  const btn = $('btn-boot');
  btn.disabled = true;
  sfx.init();
  voice.init();
  document.documentElement.requestFullscreen?.().catch(() => {});

  try {
    status.textContent = 'Mengaktifkan kamera…';
    await initVision();
    status.textContent = 'Model AI siap.';
    $('hud').classList.remove('hidden');
    startCalibration();
  } catch (err) {
    console.error(err);
    setChip('chip-cam', false, 'CAM ✕');
    status.textContent = err && err.name === 'NotAllowedError'
      ? 'Izin kamera ditolak. Izinkan akses kamera lalu klik lagi.'
      : `Gagal memulai: ${err && err.message ? err.message : err}. Pastikan dibuka via http://localhost.`;
    btn.disabled = false;
  }
}

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

  if (state.phase !== 'boot') {
    setChip('chip-hand', vision.handVisible, vision.handVisible ? 'HAND ✓' : 'HAND ✕');
  }
  bgm.syncPhase(state.phase);
  refreshPadUI();
  renderCanvas();
  requestAnimationFrame(loop);
}

/* --- Wire Handlers --- */
setGamepadHandlers({
  onButtonDown,
  onPadDisconnectAbort: (key) => showIntro(key),
});
setVisionHandlers({
  onCalibUpdate: updateCalibration,
  onSwipe,
});
setCalibFinishHandler(() => {
  location.href = `game.html?bgm=${bgm.enabled ? '1' : '0'}`;
});

initGamepadEvents();

$('btn-boot')?.addEventListener('click', () => {
  sfx.tick();
  boot();
});
$('btn-clear-ink')?.addEventListener('click', () => clearCalibrationInk());
$('btn-calib-retake')?.addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.tick();
  retakeCalibPhoto();
});
$('btn-calib-confirm')?.addEventListener('click', (e) => {
  e.stopPropagation();
  confirmCalibIdentity();
});
const onBgmToggle = (e) => {
  e.stopPropagation();
  sfx.tick();
  bgm.toggle();
};
$('btn-bgm')?.addEventListener('click', onBgmToggle);
$('btn-hud-bgm')?.addEventListener('click', onBgmToggle);

const fsBtn = $('btn-fullscreen');
if (fsBtn) {
  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.tick();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement ? '🗗 EXIT' : '⛶ FULL';
  });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('button, a, #chip-pad') && !e.target.closest('#btn-boot, #btn-clear-ink, #btn-bgm')) {
    sfx.tick();
  }
});

function skipCalibDebug() {
  if (!CONFIG.debugKeys) return;
  sfx.tick();
  location.href = `game.html?bgm=${bgm.enabled ? '1' : '0'}`;
}

if (CONFIG.debugKeys) {
  const skipBtn = $('btn-debug-skip');
  if (skipBtn) {
    skipBtn.classList.remove('hidden');
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      skipCalibDebug();
    });
  }
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'Tab') {
    e.preventDefault();
    toggleDiagModal();
    return;
  }
  if (e.key === 'Escape' && gamepadState.diagModalOpen) {
    toggleDiagModal(false);
    return;
  }
  if (e.repeat) return;
  if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  } else if (state.phase === 'shared') {
    return;
  } else if (k === 'c' && state.phase === 'calib') {
    clearCalibrationInk();
  } else if (k === 'r' && state.phase !== 'boot') {
    resetGame();
  } else if (state.phase === 'boot' && k === 'enter') {
    boot();
  } else if (state.phase === 'calib-done' && (k === 'enter' || k === ' ')) {
    if (!$('calib-id-preview')?.classList.contains('hidden')) confirmCalibIdentity();
  } else if (CONFIG.debugKeys && state.phase !== 'boot') {
    if (k === 'n') { skipCalibDebug(); return; }
    if (['0', '1', '2', '3'].includes(k)) onButtonDown(Number(k), now());
    if (k === ' ' && state.phase === 'intro-pad') onButtonDown(gamepadState.BTN.CROSS, now());
    if (k === 'arrowright' || k === 'arrowleft') {
      const t = now();
      onSwipe({ dir: k === 'arrowright' ? 'right' : 'left', onset: t }, t);
    }
  }
});

/* --- Start --- */
const qs = new URLSearchParams(location.search);
if (qs.has('r')) {
  location.replace(`game.html${location.search}`);
} else {
  showScreen('boot');
  if (qs.get('need_calib') === '1' && $('boot-status')) {
    $('boot-status').textContent = '⚠ Selesaikan gambar inisial & foto ID di Tahap 01 terlebih dahulu.';
  }
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

