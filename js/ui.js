import { $, gamepadState, getPsStyle } from './config.js';

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
}

export function setStep(n) {
  document.querySelectorAll('#stepper .step').forEach((li) => {
    const k = Number(li.dataset.step);
    li.classList.toggle('active', k === n);
    li.classList.toggle('done', k < n);
  });
}

export function dimCam(on) {
  document.body.classList.toggle('dim-cam', on);
}

export function setGameMode(on) {
  document.body.classList.toggle('game-mode', on);
}

export function setChip(id, on, label) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle('on', !!on);
  el.classList.toggle('off', !on);
  if (label) el.textContent = label;
}

export function flash(kind) {
  const f = $('flash');
  if (!f) return;
  f.className = kind;
  requestAnimationFrame(() => requestAnimationFrame(() => { f.className = ''; }));
}

const PS_SVGS = {
  '○': '<svg viewBox="0 0 24 24" class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="3.2"><circle cx="12" cy="12" r="7.5"/></svg>',
  '✕': '<svg viewBox="0 0 24 24" class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  '△': '<svg viewBox="0 0 24 24" class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"><path d="M12 5L4.5 18.5h15L12 5z"/></svg>',
  '□': '<svg viewBox="0 0 24 24" class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/></svg>',
};

export function legendHTML(type, targetBtn = null) {
  const { BTN } = gamepadState;
  const items = type === 'visual'
    ? [[BTN.CIRCLE, 'MERAH'], [BTN.CROSS, 'BIRU'], [BTN.TRIANGLE, 'HIJAU'], [BTN.SQUARE, 'PINK']]
    : [[BTN.TRIANGLE, 'SEGITIGA'], [BTN.CIRCLE, 'LINGKARAN'], [BTN.CROSS, 'SILANG'], [BTN.SQUARE, 'KOTAK']];

  return `<div class="legend">${items.map(([b, label]) => {
    const info = getPsStyle(b);
    const icon = PS_SVGS[info.sym] || info.sym;
    const isTarget = targetBtn !== null && b === targetBtn;
    return `<button type="button" class="ps-key${isTarget ? ' target-key' : ''}" data-btn="${b}" data-label="${label}" aria-label="Tombol ${label}">
      <div class="sym" style="background:${info.color}">${icon}</div><span>${label}</span>
    </button>`;
  }).join('')}</div>`;
}

export function hitKey(btn) {
  document.querySelectorAll(`.ps-key[data-btn="${btn}"]`).forEach((k) => {
    k.classList.add('hit');
    setTimeout(() => k.classList.remove('hit'), 200);
  });
}

export function setFeedback(html, color = '#111113') {
  const el = $('stim-feedback');
  if (!el) return;
  el.innerHTML = html;
  el.style.color = color;
}

