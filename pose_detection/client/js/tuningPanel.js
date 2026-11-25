/**
 * tuningPanel.js — a tiny live-tuning overlay for the pose demos.
 *
 * Renders a collapsible panel of sliders / toggles bound to game parameters,
 * so feel can be dialed in while playing (no edit-reload cycle). Values persist
 * to localStorage and there's a "Copy values" button so the tuned numbers can be
 * read back and baked into the source defaults.
 *
 * Usage:
 *   createTuningPanel({
 *     mount: someEl,
 *     storageKey: 'flapper.flight.tune',
 *     params: [
 *       { type: 'header', label: 'Steering' },
 *       { key: 'STEER_SIGN', label: 'Invert steering', type: 'toggle', get: () => SIGN < 0, set: v => SIGN = v ? -1 : 1 },
 *       { key: 'THETA_MAX', label: 'Sensitivity', min: 0.2, max: 1, step: 0.02, get: () => T, set: v => T = v },
 *     ]
 *   });
 *
 * Each non-header param exposes get()/set() closures over the game's (mutable)
 * variables. The panel reads defaults from get() at construction, applies any
 * saved overrides via set(), and calls set() live on input.
 */

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
  .tp-panel { position: absolute; top: 12px; left: 12px; width: 232px; z-index: 5;
    font: 12px 'Segoe UI', system-ui, sans-serif; color: #eaf0ff;
    background: rgba(10,12,22,0.82); backdrop-filter: blur(6px);
    border: 1px solid rgba(140,170,255,0.25); border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0,0,0,0.45); overflow: hidden; }
  .tp-head { display: flex; align-items: center; justify-content: space-between;
    padding: 8px 11px; cursor: pointer; user-select: none; font-weight: 700; letter-spacing: 0.3px; }
  .tp-head .tp-caret { color: #8fb0ff; transition: transform 0.15s; }
  .tp-panel.tp-collapsed .tp-body, .tp-panel.tp-collapsed .tp-btns { display: none; }
  .tp-panel.tp-collapsed .tp-caret { transform: rotate(-90deg); }
  .tp-body { max-height: 60vh; overflow-y: auto; padding: 4px 11px 6px; }
  .tp-section { color: #8fb0ff; font-weight: 700; font-size: 10.5px; letter-spacing: 0.6px;
    text-transform: uppercase; margin: 10px 0 3px; opacity: 0.85; }
  .tp-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6px; margin: 5px 0; }
  .tp-row.tp-range { grid-template-columns: 84px 1fr 38px; }
  .tp-label { color: #c8d4f0; }
  .tp-row input[type=range] { width: 100%; accent-color: #4ad6ff; }
  .tp-row input[type=checkbox] { accent-color: #4ad6ff; width: 16px; height: 16px; }
  .tp-val { color: #4ad6ff; font-variant-numeric: tabular-nums; text-align: right; }
  .tp-btns { display: flex; gap: 6px; padding: 6px 11px 10px; }
  .tp-btn { flex: 1; background: rgba(120,150,255,0.14); color: #eaf0ff; border: 1px solid rgba(140,170,255,0.25);
    border-radius: 6px; padding: 5px 0; font: 600 11px 'Segoe UI', sans-serif; cursor: pointer; }
  .tp-btn:hover { background: rgba(120,150,255,0.26); }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}

const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const fmt = (v) => (typeof v === 'number' ? (Math.round(v * 1000) / 1000).toString() : String(v));

export function createTuningPanel({ mount, storageKey, params, title = 'Tuning', collapsed = false }) {
  injectStyle();
  const tunables = params.filter(p => p.type !== 'header');

  // Capture defaults from the current values, then apply saved overrides.
  const defaults = {};
  tunables.forEach(p => { defaults[p.key] = p.get(); });
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (e) { /* ignore */ }
  tunables.forEach(p => { if (Object.prototype.hasOwnProperty.call(saved, p.key)) p.set(saved[p.key]); });

  const persist = () => {
    const o = {}; tunables.forEach(p => { o[p.key] = p.get(); });
    try { localStorage.setItem(storageKey, JSON.stringify(o)); } catch (e) { /* ignore */ }
  };

  const panel = el('div', 'tp-panel');
  if (collapsed) panel.classList.add('tp-collapsed');
  const head = el('div', 'tp-head');
  head.innerHTML = `<span>${title}</span><span class="tp-caret">&#9662;</span>`;
  head.addEventListener('click', () => panel.classList.toggle('tp-collapsed'));
  const body = el('div', 'tp-body');

  const syncers = [];
  params.forEach(p => {
    if (p.type === 'header') { const h = el('div', 'tp-section'); h.textContent = p.label; body.appendChild(h); return; }
    const row = el('div', 'tp-row');
    const lab = el('label', 'tp-label'); lab.textContent = p.label;
    if (p.type === 'toggle') {
      const input = el('input'); input.type = 'checkbox'; input.checked = !!p.get();
      input.addEventListener('change', () => { p.set(input.checked); persist(); });
      row.append(lab, input);
      syncers.push(() => { input.checked = !!p.get(); });
    } else {
      row.classList.add('tp-range');
      const input = el('input'); input.type = 'range';
      input.min = p.min; input.max = p.max; input.step = p.step; input.value = p.get();
      const val = el('span', 'tp-val'); val.textContent = fmt(p.get());
      input.addEventListener('input', () => { const v = parseFloat(input.value); p.set(v); val.textContent = fmt(v); persist(); });
      row.append(lab, input, val);
      syncers.push(() => { input.value = p.get(); val.textContent = fmt(p.get()); });
    }
    body.appendChild(row);
  });

  const btns = el('div', 'tp-btns');
  const resetBtn = el('button', 'tp-btn'); resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => { tunables.forEach(p => p.set(defaults[p.key])); syncers.forEach(s => s()); persist(); });
  const copyBtn = el('button', 'tp-btn'); copyBtn.textContent = 'Copy values';
  copyBtn.addEventListener('click', () => {
    const txt = tunables.map(p => `${p.key} = ${fmt(p.get())}`).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
    copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy values'; }, 1200);
  });
  btns.append(resetBtn, copyBtn);

  panel.append(head, body, btns);
  mount.appendChild(panel);
  return { persist, sync: () => syncers.forEach(s => s()) };
}
