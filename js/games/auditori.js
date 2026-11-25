import { gamepadState } from '../config.js';
import { shuffleDeck, cryptoRandInt } from '../questions.js';
import { bgm, sfx } from '../audio.js?v=73';

const PS_SVGS = {
  '△': '<svg viewBox="0 0 24 24" class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"><path d="M12 5L4.5 18.5h15L12 5z"/></svg>',
  '○': '<svg viewBox="0 0 24 24" class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="3.2"><circle cx="12" cy="12" r="7.5"/></svg>',
  '✕': '<svg viewBox="0 0 24 24" class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  '□': '<svg viewBox="0 0 24 24" class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/></svg>',
};

const TARGET_META = {
  TRIANGLE: { sym: '△', label: 'SEGITIGA',  voiceKey: 'segitiga',  color: '#16a34a', tx: '175%',  rot: '-12deg' },
  CIRCLE:   { sym: '○', label: 'LINGKARAN', voiceKey: 'lingkaran', color: '#dc2626', tx: '58%',   rot: '-5deg'  },
  CROSS:    { sym: '✕', label: 'SILANG',    voiceKey: 'silang',    color: '#2563eb', tx: '-58%',  rot: '5deg'   },
  SQUARE:   { sym: '□', label: 'KOTAK',     voiceKey: 'kotak',     color: '#db2777', tx: '-175%', rot: '12deg'  },
};

const SHAPE_KEYS = ['TRIANGLE', 'CIRCLE', 'CROSS', 'SQUARE'];

export const AUDITORI_QUESTIONS = [
  { id: 'a1',  targetKey: 'TRIANGLE', waitRange: [650, 1020] },
  { id: 'a2',  targetKey: 'CIRCLE',   waitRange: [660, 1050] },
  { id: 'a3',  targetKey: 'CROSS',    waitRange: [620, 980] },
  { id: 'a4',  targetKey: 'SQUARE',   waitRange: [560, 920] },
  { id: 'a5',  targetKey: 'CIRCLE',   waitRange: [520, 880] },
  { id: 'a6',  targetKey: 'TRIANGLE', waitRange: [500, 850] },
  { id: 'a7',  targetKey: 'CROSS',    waitRange: [460, 820] },
  { id: 'a8',  targetKey: 'SQUARE',   waitRange: [420, 760] },
  { id: 'a9',  targetKey: 'TRIANGLE', waitRange: [380, 720] },
  { id: 'a10', targetKey: 'CIRCLE',   waitRange: [360, 700] },
];

export function buildAuditoriDeck() {
  return shuffleDeck(
    AUDITORI_QUESTIONS,
    'stroop_soundburst_tidy_v15',
    (a, b) => a.targetKey === b.targetKey,
  ).map((q, idx) => {
    const [minW, maxW] = q.waitRange;
    const waitMs = minW + cryptoRandInt(Math.max(1, maxW - minW));
    const others = SHAPE_KEYS.filter((k) => k !== q.targetKey);
    const decoyKey = others[cryptoRandInt(others.length)];
    const fakeKey = others[cryptoRandInt(others.length)];
    const phaseMode = idx >= 7 ? 'HYPER' : idx >= 3 ? 'RUSH' : 'FOCUS';
    return {
      ...q,
      waitMs,
      decoyKey,
      fakeKey,
      phaseMode,
      voiceRate: idx >= 7 ? 1.07 : idx >= 3 ? 1.04 : 1.0,
      voiceKey: TARGET_META[q.targetKey].voiceKey,
      get correctBtn() { return gamepadState.BTN[q.targetKey]; },
    };
  });
}

let waveRafId = 0;
let waveAccentColor = '#fbbf24';
let waveBeatEnergy = 0;
const freqBins = new Uint8Array(64);

function stopWaveLoop() {
  if (waveRafId) {
    cancelAnimationFrame(waveRafId);
    waveRafId = 0;
  }
}

function startWaveLoop() {
  stopWaveLoop();
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = () => {
    const cv = document.getElementById('aud-wave-canvas');
    if (!cv || !cv.isConnected) {
      waveRafId = 0;
      return;
    }
    const ctx = cv.getContext('2d');
    const w = cv.width;
    const h = cv.height;
    ctx.clearRect(0, 0, w, h);

    const hasFreq = bgm.getFrequencyData(freqBins);
    const barCount = 24;
    const gap = 10;
    const barW = (w - gap * (barCount - 1) - 32) / barCount;
    const cy = h * 0.5;
    waveBeatEnergy *= 0.87;

    // Medali raksasa ikut berdenyut halus sesuai bass 160 BPM
    const bassLevel = hasFreq ? ((freqBins[1] + freqBins[2]) / 510) : waveBeatEnergy * 0.5;
    if (!reduced) {
      const giantMed = document.getElementById('aud-giant-med');
      if (giantMed) {
        const sc = 1 + bassLevel * 0.07;
        giantMed.style.transform = `scale(${sc.toFixed(3)})`;
      }
    }

    // 24 bar equalizer rapi & lembut di latar belakang (tanpa mengganggu keterbacaan teks)
    for (let i = 0; i < barCount; i++) {
      const distFromMid = Math.abs(i - (barCount - 1) / 2);
      const binIdx = Math.min(28, Math.floor(distFromMid * 2.1));
      const rawVal = hasFreq
        ? (freqBins[binIdx] / 255)
        : (0.16 + waveBeatEnergy * 0.55 * Math.max(0.2, 1 - distFromMid / 12));
      const amp = reduced ? 0.2 : Math.max(0.12, Math.min(0.95, rawVal * 0.88 + waveBeatEnergy * 0.28));
      const barH = Math.max(14, amp * (h * 0.78));
      const x = 16 + i * (barW + gap);
      const y = cy - barH / 2;

      const isAccent = i % 2 === 0;
      ctx.fillStyle = isAccent ? waveAccentColor : '#111113';
      ctx.globalAlpha = isAccent ? 0.24 : 0.09;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 6);
      ctx.fill();

      ctx.globalAlpha = isAccent ? 0.28 : 0.14;
      ctx.strokeStyle = '#111113';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (!reduced) {
      waveRafId = requestAnimationFrame(draw);
    }
  };
  waveRafId = requestAnimationFrame(draw);
}

function ensureStyles() {
  if (document.getElementById('aud-tidy-css')) return;
  const css = document.createElement('style');
  css.id = 'aud-tidy-css';
  css.textContent = `
  #stim-feedback:not(:empty) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: auto !important;
    min-height: 2.1rem;
    background: #ffffff;
    border: 2.5px solid #111113;
    box-shadow: 3px 3px 0 #111113;
    border-radius: 9999px;
    padding: 0.25rem 1.2rem;
    z-index: 10;
  }

  .aud-open-stage {
    position: relative;
    display: grid;
    place-items: center;
    width: min(660px, 94vw);
    min-height: 245px;
  }
  .aud-wave-canvas {
    grid-area: 1 / 1;
    width: 100%;
    height: 190px;
    pointer-events: none;
    z-index: 1;
  }

  /* FASE 1: 4 Medali PS3 rapi di atas equalizer */
  .aud-medallion-row {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(1rem, 3.2vw, 2.2rem);
    flex-wrap: wrap;
    z-index: 3;
  }
  .aud-medallion {
    will-change: transform, opacity;
    transition:
      transform 0.14s cubic-bezier(.22,1,.36,1),
      opacity 0.12s ease-out;
  }
  .aud-medallion .sym {
    width: 5.4rem;
    height: 5.4rem;
    border: 3.5px solid #111113;
    box-shadow: 5px 5px 0 #111113;
  }
  .aud-medallion.is-scanning {
    transform: translate3d(0, -10px, 0) scale(1.08);
  }
  .aud-medallion.is-scanning .sym {
    box-shadow: 0 0 0 5px #fbbf24, 6px 6px 0 #111113;
  }
  .aud-medallion-row.is-clashing {
    pointer-events: none;
  }
  .aud-medallion-row.is-clashing .aud-medallion {
    transform: translate3d(var(--tx, 0), 0, 0) scale(0.32) rotate(var(--rot, 0deg)) !important;
    opacity: 0 !important;
  }

  /* FASE 2: 1 Simbol Raksasa + Comic Burst Rapi + 4 Tombol Cepat Berwarna */
  .aud-burst-wrap {
    grid-area: 1 / 1;
    display: none;
    position: relative;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    z-index: 5;
  }
  .aud-burst-wrap.is-active {
    display: flex;
  }
  .aud-hero-center {
    position: relative;
    display: grid;
    place-items: center;
    width: 136px;
    height: 136px;
  }
  .aud-impact-ring {
    position: absolute;
    inset: -10px;
    border-radius: 9999px;
    border: 3.5px solid var(--gc, #111113);
    pointer-events: none;
    z-index: 0;
    animation: audRingOut 0.34s cubic-bezier(.16,1,.3,1) forwards;
  }
  .aud-comic-burst {
    position: absolute;
    width: 200px;
    height: 200px;
    pointer-events: none;
    z-index: 1;
    animation: audBurstPop 0.22s cubic-bezier(.16,1.3,.36,1) both;
  }
  .aud-giant-medallion {
    position: relative;
    z-index: 3;
    width: 6.9rem;
    height: 6.9rem;
    border-radius: 9999px;
    background: var(--gc);
    color: #ffffff;
    border: 4px solid #111113;
    box-shadow: 0 0 0 4px #fbbf24, 6px 6px 0 #111113;
    display: grid;
    place-items: center;
    will-change: transform;
    animation: audHeroSlam 0.18s cubic-bezier(.16,1.3,.36,1) both;
  }
  .aud-giant-medallion svg {
    width: 3.6rem;
    height: 3.6rem;
  }
  .aud-giant-medallion.is-correct {
    box-shadow: 0 0 0 5px #22c55e, 6px 6px 0 #111113;
  }
  .aud-giant-label {
    position: relative;
    z-index: 6;
    font-family: "Archivo Black", "Plus Jakarta Sans", sans-serif;
    font-weight: 900;
    font-size: clamp(2.5rem, 6.4vw, 3.8rem);
    line-height: 0.96;
    letter-spacing: -0.02em;
    color: var(--gc);
    -webkit-text-stroke: 3px #111113;
    text-shadow: 4.5px 4.5px 0 #111113;
    text-transform: uppercase;
    animation: audHeroSlam 0.2s cubic-bezier(.16,1.3,.36,1) both;
  }
  .aud-rt-pill {
    position: relative;
    z-index: 6;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.82rem;
    font-weight: 900;
    background: #16a34a;
    color: #ffffff;
    border: 2.5px solid #111113;
    box-shadow: 3px 3px 0 #111113;
    border-radius: 9999px;
    padding: 0.18rem 0.9rem;
  }

  /* 4 Tombol Cepat Berwarna rapi sejajar */
  .aud-mini-controls {
    position: relative;
    z-index: 6;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    margin-top: 0.35rem;
  }
  .ps-key.aud-mini-pill {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.05em;
    color: #111113;
    background: #ffffff;
    border: 2.5px solid #111113;
    box-shadow: 3px 3px 0 #111113;
    border-radius: 9999px;
    padding: 0.24rem 0.75rem 0.24rem 0.34rem;
    cursor: pointer;
    transition: transform 0.1s ease, background 0.1s ease, box-shadow 0.1s ease;
  }
  .ps-key.aud-mini-pill:hover {
    transform: translateY(-2px);
    background: #fde047;
    box-shadow: 4px 4px 0 #111113;
  }
  .aud-mini-badge {
    display: inline-grid;
    place-items: center;
    width: 1.45rem;
    height: 1.45rem;
    border-radius: 9999px;
    background: var(--mc);
    color: #ffffff;
    border: 2px solid #111113;
    font-style: normal;
    font-size: 0.82rem;
    font-weight: 900;
    line-height: 1;
  }

  @keyframes audHeroSlam {
    0% { transform: scale(0.42); opacity: 0; }
    68% { transform: scale(1.07); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes audBurstPop {
    0% { transform: scale(0.3) rotate(-14deg); opacity: 0; }
    70% { transform: scale(1.06) rotate(3deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes audRingOut {
    0% { transform: scale(0.55); opacity: 0.9; }
    100% { transform: scale(1.85); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .aud-medallion,
    .aud-comic-burst,
    .aud-impact-ring,
    .aud-giant-medallion,
    .aud-giant-label {
      transition: none !important;
      animation: none !important;
    }
  }
  `;
  document.head.appendChild(css);
}

function comicBurstSvg(fillColor) {
  return `
    <svg viewBox="0 0 240 240" class="aud-comic-burst" aria-hidden="true">
      <polygon
        points="120,10 140,60 190,30 170,82 228,90 182,122 226,162 168,162 180,218 134,182 120,232 106,182 60,218 72,162 14,162 58,122 12,90 70,82 50,30 100,60"
        fill="${fillColor}" fill-opacity="0.22" stroke="#111113" stroke-width="2.6" stroke-linejoin="round" />
    </svg>`;
}

function miniControlsHtml() {
  return `<div class="aud-mini-controls">${SHAPE_KEYS.map((k) => {
    const m = TARGET_META[k];
    const btnId = gamepadState.BTN[k];
    return `<button type="button" class="ps-key aud-mini-pill" data-btn="${btnId}" data-label="${m.label}" aria-label="Tombol ${m.label}" style="--mc:${m.color}">
      <i class="aud-mini-badge" aria-hidden="true">${m.sym}</i>${m.label}
    </button>`;
  }).join('')}</div>`;
}

export function renderAuditoriStimulus(holder) {
  ensureStyles();
  waveAccentColor = '#fbbf24';
  waveBeatEnergy = 0.25;

  const medallionsHtml = SHAPE_KEYS.map((k) => {
    const m = TARGET_META[k];
    const btnId = gamepadState.BTN[k];
    const svg = PS_SVGS[m.sym] || m.sym;
    return `
      <button type="button" id="aud-med-${k}" class="ps-key aud-medallion" data-btn="${btnId}" data-label="${m.label}" aria-label="Tombol ${m.label}" style="--tx:${m.tx};--rot:${m.rot}">
        <div class="sym" style="background:${m.color}">${svg}</div>
        <span>${m.label}</span>
      </button>`;
  }).join('');

  holder.innerHTML = `
    <div id="aud-open-stage" class="aud-open-stage">
      <canvas id="aud-wave-canvas" class="aud-wave-canvas" width="660" height="190"></canvas>
      <div id="aud-medallion-row" class="aud-medallion-row">
        ${medallionsHtml}
      </div>
      <div id="aud-burst-wrap" class="aud-burst-wrap"></div>
    </div>`;

  startWaveLoop();
}

export function pulseAudOrb(step = 0) {
  waveBeatEnergy = 0.95;
  const activeKey = SHAPE_KEYS[step % SHAPE_KEYS.length];
  SHAPE_KEYS.forEach((k) => {
    document.getElementById(`aud-med-${k}`)?.classList.toggle('is-scanning', k === activeKey);
  });
}

export function flashFakeoutPad(padKey) {
  waveBeatEnergy = 0.8;
  const el = document.getElementById(`aud-med-${padKey}`);
  if (!el) return;
  el.classList.add('is-scanning');
  setTimeout(() => el.classList.remove('is-scanning'), 110);
}

export function activateAuditoriCue(q) {
  const decoyKey = q?.decoyKey || 'SQUARE';
  const decoyMeta = TARGET_META[decoyKey] || TARGET_META.SQUARE;
  const svg = PS_SVGS[decoyMeta.sym] || decoyMeta.sym;
  waveAccentColor = decoyMeta.color;
  waveBeatEnergy = 1.25;

  const row = document.getElementById('aud-medallion-row');
  if (row) row.classList.add('is-clashing');

  const wrap = document.getElementById('aud-burst-wrap');
  if (wrap) {
    wrap.innerHTML = `
      <div class="aud-hero-center">
        <div class="aud-impact-ring" style="--gc:${decoyMeta.color}"></div>
        ${comicBurstSvg(decoyMeta.color)}
        <div id="aud-giant-med" class="aud-giant-medallion" style="--gc:${decoyMeta.color}">${svg}</div>
      </div>
      <div class="aud-giant-label" style="--gc:${decoyMeta.color}">${decoyMeta.label}</div>
      ${miniControlsHtml()}`;
    wrap.classList.add('is-active');
  }
}

export function flashCorrectAuditoriPad(q, rtMs) {
  sfx.wireCut();
  const targetKey = q?.targetKey || 'CIRCLE';
  const targetMeta = TARGET_META[targetKey] || TARGET_META.CIRCLE;
  const svg = PS_SVGS[targetMeta.sym] || targetMeta.sym;
  waveAccentColor = '#22c55e';
  waveBeatEnergy = 1.1;

  const row = document.getElementById('aud-medallion-row');
  if (row) row.classList.add('is-clashing');

  const wrap = document.getElementById('aud-burst-wrap');
  if (wrap) {
    wrap.innerHTML = `
      <div class="aud-hero-center">
        ${comicBurstSvg('#22c55e')}
        <div id="aud-giant-med" class="aud-giant-medallion is-correct" style="--gc:${targetMeta.color}">${svg}</div>
      </div>
      <div class="aud-giant-label" style="--gc:${targetMeta.color}">${targetMeta.label}</div>
      ${rtMs != null ? `<div class="aud-rt-pill">TEPAT · ${rtMs} ms</div>` : ''}`;
    wrap.classList.add('is-active');
  }
}

export function flashAuditoriError() {
  waveAccentColor = '#ef4444';
  waveBeatEnergy = 1.2;
  const holder = document.getElementById('stim-holder');
  if (!holder) return;
  holder.classList.remove('stim-shake');
  void holder.offsetWidth;
  holder.classList.add('stim-shake');
}

export function setAudTimer() {}

export function setDropActiveUI() {}

export function getAuditoriErrorMsg(btn, q) {
  const meta = TARGET_META[q?.targetKey] || TARGET_META.CIRCLE;
  const decoyMeta = TARGET_META[q?.decoyKey] || TARGET_META.CROSS;
  const decoyBtn = gamepadState.BTN[q?.decoyKey];
  if (btn === decoyBtn) {
    return `Terkecoh visual ${decoyMeta.label}! Suara menyebut: <b>${meta.label}</b>.`;
  }
  return `Salah tombol. Suara menyebut <b>${meta.label}</b>.`;
}
