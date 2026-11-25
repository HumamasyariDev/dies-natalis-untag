import { $, PRESETS, TESTS, gamepadState, state, now, abortPending } from './config.js';
import { setChip } from './ui.js';
import { sfx } from './audio.js';

export const pad = { index: null, prev: [], id: '' };

let onButtonDownCb = () => {};
let onPadDisconnectAbortCb = () => {};

export function setGamepadHandlers({ onButtonDown, onPadDisconnectAbort }) {
  onButtonDownCb = onButtonDown;
  onPadDisconnectAbortCb = onPadDisconnectAbort;
}

export function setGamepadPreset(key) {
  if (!PRESETS[key]) return;
  gamepadState.activePresetKey = key;
  gamepadState.BTN = { ...PRESETS[key].BTN };
  const { BTN } = gamepadState;
  gamepadState.TEST_BUTTONS = [BTN.CROSS, BTN.CIRCLE, BTN.SQUARE, BTN.TRIANGLE];
  updateDiagUI();
  console.info(`[Gamepad] Preset: ${PRESETS[key].name}`, BTN);
}

export function getPad() {
  if (!navigator.getGamepads) return null;
  const list = navigator.getGamepads();
  let gp = pad.index != null ? list[pad.index] : null;
  if (!gp || !gp.connected) {
    gp = Array.from(list).find((g) => g && g.connected) || null;
    if (gp && gp.index !== pad.index) attachPad(gp);
  }
  return gp;
}

export function padConnected() {
  return !!getPad();
}

function attachPad(gp) {
  pad.index = gp.index;
  pad.id = gp.id;
  pad.prev = gp.buttons.map((b) => b.pressed);
  console.info(`[Gamepad] terhubung: "${gp.id}" mapping="${gp.mapping || 'non-standard'}"`);

  const name = gp.id.toLowerCase();
  if (gp.mapping === 'standard') {
    setGamepadPreset('standard');
  } else if (name.includes('playstation') || name.includes('sony') || name.includes('dualshock')) {
    setGamepadPreset(gp.buttons.length > 16 ? 'ds3_raw_linux' : 'standard');
  } else if (name.includes('xbox') || name.includes('x-box')) {
    setGamepadPreset('xbox_bt');
  }

  updateDiagUI();
  refreshPadUI();
}

export function pollGamepad() {
  const gp = getPad();
  if (!gp) return;
  const tNow = now();
  const tEvt = gp.timestamp && gp.timestamp <= tNow && tNow - gp.timestamp < 50 ? gp.timestamp : tNow;
  gp.buttons.forEach((b, i) => {
    const pressed = b.pressed || b.value > 0.5;
    if (pressed && !pad.prev[i]) onButtonDownCb(i, tEvt);
    pad.prev[i] = pressed;
  });

  if (gamepadState.diagModalOpen) renderDiagButtons(gp);
}

export function refreshPadUI() {
  const ok = padConnected();
  setChip('chip-pad', ok, ok ? 'PAD ✓' : 'PAD ✕');
  const chip = $('chip-pad');
  if (chip) chip.title = pad.id || 'Belum ada controller';

  const t = TESTS[state.current];
  // Jangan tampilkan pad-banner di layar intro-pad karena sudah ada status di bawah halaman
  const needPad = t && t.input === 'pad' &&
    ['count', 'fixation', 'stim-visual', 'stim-audio'].includes(state.phase);
  $('pad-banner')?.classList.toggle('hidden', !(needPad && !ok));
}

export function toggleDiagModal(show) {
  gamepadState.diagModalOpen = typeof show === 'boolean' ? show : !gamepadState.diagModalOpen;
  $('gamepad-diag')?.classList.toggle('hidden', !gamepadState.diagModalOpen);
  if (gamepadState.diagModalOpen) updateDiagUI();
}

export function updateDiagUI() {
  const gp = getPad();
  const { BTN, activePresetKey } = gamepadState;
  if ($('diag-id')) $('diag-id').textContent = gp ? gp.id : 'Controller tidak terhubung';
  if ($('diag-mapping')) $('diag-mapping').textContent = gp ? (gp.mapping || 'non-standard (raw Linux)') : '-';
  if ($('diag-preset')) $('diag-preset').textContent = PRESETS[activePresetKey].name;

  if ($('map-circle')) $('map-circle').textContent = `Index ${BTN.CIRCLE}`;
  if ($('map-triangle')) $('map-triangle').textContent = `Index ${BTN.TRIANGLE}`;
  if ($('map-cross')) $('map-cross').textContent = `Index ${BTN.CROSS}`;
  if ($('map-square')) $('map-square').textContent = `Index ${BTN.SQUARE}`;

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

  const { BTN } = gamepadState;
  gp.buttons.forEach((b, i) => {
    const el = $(`diag-btn-${i}`);
    if (!el) return;
    const pressed = b.pressed || b.value > 0.5;
    el.classList.toggle('bg-neon-pink', pressed);
    el.classList.toggle('text-black', pressed);
    el.classList.toggle('border-neon-pink', pressed);
    const sub = el.querySelector('div:last-child');
    if (sub) {
      let label = b.value.toFixed(1);
      if (i === BTN.CIRCLE) label = '○';
      else if (i === BTN.TRIANGLE) label = '△';
      else if (i === BTN.CROSS) label = '✕';
      else if (i === BTN.SQUARE) label = '□';
      sub.textContent = label;
    }
  });
}

export function initGamepadEvents() {
  window.addEventListener('gamepadconnected', (e) => attachPad(e.gamepad));
  window.addEventListener('gamepaddisconnected', (e) => {
    if (e.gamepad.index !== pad.index) return;
    pad.index = null;
    pad.prev = [];
    refreshPadUI();
    const t = TESTS[state.current];
    if (t && t.input === 'pad' && ['count', 'fixation', 'stim-visual', 'stim-audio'].includes(state.phase)) {
      abortPending();
      onPadDisconnectAbortCb(state.current);
    }
  });

  $('diag-close')?.addEventListener('click', () => toggleDiagModal(false));
  $('chip-pad')?.addEventListener('click', () => toggleDiagModal());
  document.querySelectorAll('.preset-btn').forEach((b) => {
    b.addEventListener('click', (e) => {
      setGamepadPreset(e.target.dataset.preset);
      sfx.tick();
    });
  });
}

