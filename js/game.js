import { $, CONFIG, ORDER, TESTS, STYLE_INFO, gamepadState, getPsStyle, state, vision, now, rand, later, abortPending } from './config.js';

import { showScreen, setStep, dimCam, setGameMode, flash, legendHTML, hitKey, setFeedback } from './ui.js';

import { bgm, sfx, voice } from './audio.js';

import { padConnected, refreshPadUI } from './gamepad.js';

import { swipe, stopVisionCamera, resumeVisionCamera } from './vision.js';

import { startCalibration } from './calib.js';

import { ARCHETYPES, loadIdentity, saveIdentity, clearIdentity, exportIdCardPng } from './identity.js';

import { buildVisualDeck, renderVisualStimulus, getVisualErrorMsg } from './games/visual.js';

import { buildAuditoriDeck, renderAuditoriStimulus, activateAuditoriCue, flashFakeoutPad, flashCorrectAuditoriPad, getAuditoriErrorMsg, pulseAudOrb, flashAuditoriError, setAudTimer } from './games/auditori.js';

import { buildKinestetikDeck, renderKinestetikStimulus, initBeatSmasher, tickBeatSmasher, debugTriggerBeatSmasherHit, playPoseSfx, sendSubwayAction, resetKinCalibration } from './games/kinestetik.js';



function kinestetikLegendHTML() {

  const items = [

    {

      label: 'LONCAT',

      sub: 'BAHU NAIK',

      color: '#16a34a',

      svg: '<svg viewBox="0 0 24 24" class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',

    },

    {

      label: 'NUNDUK',

      sub: 'BAHU TURUN',

      color: '#ea580c',

      svg: '<svg viewBox="0 0 24 24" class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',

    },

    {

      label: 'KIRI / KANAN',

      sub: 'CONDONG BADAN',

      color: '#0284c7',

      svg: '<svg viewBox="0 0 24 24" class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8l4 4-4 4M7 8l-4 4 4 4M3 12h18"/></svg>',

    },

  ];

  return `<div class="legend">${items.map((it) => `

    <div class="ps-key cursor-default">

      <div class="sym" style="background:${it.color}">${it.svg}</div>

      <span>${it.label}</span>

    </div>`).join('')}</div>`;

}



export function showIntro(key) {

  closeBeatPoseFrame();

  document.body.classList.remove('aud-arena');

  document.body.classList.toggle('kin-intro', key === 'kinestetik');

  state.audResults = [];

  const t = TESTS[key];

  $('stage-clear-modal')?.classList.add('hidden');

  state.current = key;

  if (key === 'kinestetik') {
    resetKinCalibration();
  }

  state.phase = t.input === 'pad' ? 'intro-pad' : 'intro-hand';

  state.introReadyAt = now() + CONFIG.introReadDelayMs;

  state.handStableSince = null;

  state.practiceHint = '';

  state.deck = key === 'visual' ? buildVisualDeck() : key === 'auditori' ? buildAuditoriDeck() : buildKinestetikDeck();

  state.qIndex = 0;

  state.trialRts = [];

  state.trialErrors = 0;

  state.trialTimeouts = 0;

  state.combo = 0;

  state.maxCombo = 0;

  state.lastUrgentTickAt = 0;

  state.kinFreezeActive = false;

  state.kinRoundStartedAt = null;

  state.kinRoundDurationMs = 60000;

  state.kinScore = 0;

  state.kinClearedCount = 0;

  state.kinRepIndex = 0;

  vision.baselineShoulderY = null;

  state.errors[key] = 0;

  state.timeouts[key] = 0;

  state.timedOut[key] = false;

  state.scores[key] = null;

  state.accuracy[key] = null;

  setEdgeDanger(false);



  $('intro-tag').textContent = t.tag;

  $('intro-title').innerHTML = `

    <span class="hero-word hero-word-blue text-4xl sm:text-6xl md:text-7xl">${t.line1}</span>

    <span class="hero-word hero-word-yellow text-4xl sm:text-6xl md:text-7xl mt-1">${t.line2}</span>

  `;

  $('intro-sub').textContent = t.sub;

  if ($('intro-demo-label')) $('intro-demo-label').textContent = t.demoLabel;

  if ($('intro-demo')) $('intro-demo').innerHTML = t.demoHtml;



  const testVoiceBtn = $('btn-test-voice');

  if (testVoiceBtn) {

    testVoiceBtn.classList.toggle('hidden', key !== 'auditori');

    testVoiceBtn.classList.toggle('inline-flex', key === 'auditori');

  }



  $('intro-legend').innerHTML = t.input === 'pad'

    ? legendHTML(key === 'visual' ? 'visual' : 'shapes')

    : kinestetikLegendHTML();

  showScreen('intro');

  setStep(t.step);

  setGameMode(t.input === 'pad');

  dimCam(false);

  refreshPadUI();

}



export function tickIntro() {

  const ready = $('intro-ready');

  const t = now();

  if (state.phase === 'intro-pad') {

    if (state.practiceHint) {

      ready.textContent = state.practiceHint;

    } else if (!padConnected()) {
      ready.textContent = 'Tekan START di controller / klik di sini';
    } else if (t < state.introReadyAt) {
      ready.textContent = 'Siap...';
    } else {
      ready.textContent = 'Tekan START di controller / klik di sini';
    }

  } else if (state.phase === 'intro-hand') {

    const lm = vision.poseLm;

    const bodyOk = vision.poseVisible || vision.handVisible;

    if (lm && lm[11] && lm[12]) {

      const sy = (lm[11].y + lm[12].y) / 2;

      vision.baselineShoulderY = vision.baselineShoulderY == null

        ? sy

        : vision.baselineShoulderY * 0.9 + sy * 0.1;

    }



    // Jangan langsung start saat badan terlihat — tunggu pemain SILANG TANGAN DI DEPAN DADA (🙅)

    let armsCrossed = false;

    if (lm && lm[11] && lm[12] && lm[15] && lm[16] &&

      (lm[15].visibility ?? 1) > 0.3 && (lm[16].visibility ?? 1) > 0.3) {

      const sL = lm[11];

      const sR = lm[12];

      const wL = lm[15];

      const wR = lm[16];

      const shoulderW = Math.max(Math.abs(sR.x - sL.x), 0.08);

      const midX = (sL.x + sR.x) / 2;

      const shoulderY = (sL.y + sR.y) / 2;

      const crossedOrTouch = (wL.x - wR.x) * (sR.x - sL.x) > -shoulderW * 0.15;

      const nearCenter = Math.abs(wL.x - midX) < shoulderW * 0.7 && Math.abs(wR.x - midX) < shoulderW * 0.7;

      const atChest = wL.y > shoulderY - 0.08 && wL.y < shoulderY + 0.28 &&

        wR.y > shoulderY - 0.08 && wR.y < shoulderY + 0.28;

      armsCrossed = crossedOrTouch && nearCenter && atChest;

    }



    if (t >= state.introReadyAt && bodyOk && armsCrossed) {

      state.handStableSince ??= t;

      const left = Math.max(0, 800 - (t - state.handStableSince));

      ready.textContent = `Siap! Tahan silang dada ${(left / 1000).toFixed(1)}s...`;

      if (left === 0) startCountdown();

    } else {

      state.handStableSince = null;

      ready.textContent = bodyOk

        ? 'Badan terdeteksi! Silangkan tangan di dada atau klik Mulai'

        : 'Posisikan bahu di kotak kamera kiri (atau klik Mulai)';

    }

  }

}



export function startDemoMode() {

  if (!state.current || (state.phase !== 'intro-pad' && state.phase !== 'intro-hand')) return;

  sfx.tick();

  state.isDemo = true;

  if (state.current !== 'kinestetik' && state.deck.length > 3) {

    state.deck = state.deck.slice(0, 3);

  }

  $('demo-banner')?.classList.remove('hidden');

  startCountdown();

}



export function exitDemoMode(completed = false) {

  const key = state.current || 'visual';

  abortPending();

  state.isDemo = false;

  $('demo-banner')?.classList.add('hidden');

  document.body.classList.remove('aud-arena');

  voice.stopAll();

  closeBeatPoseFrame();

  setEdgeDanger(false);

  sfx.tick();

  showIntro(key);

  state.practiceHint = completed

    ? '✓ Uji coba selesai (data tidak disimpan) · Siap mulai tes asli!'

    : 'Uji coba dihentikan (data tidak disimpan) · Siap mulai tes asli!';

  tickIntro();

}



export function startCountdown() {

  if (!state.isDemo) $('demo-banner')?.classList.add('hidden');

  document.body.classList.remove('kin-intro');

  state.phase = 'count';

  showScreen('count');

  const el = $('count-num');

  el.style.fontSize = '';

  el.style.color = '';



  const hasAudio = sfx.playCountdown();

  const schedule = hasAudio

    ? [

      { delay: 0, text: '3', color: '' },

      { delay: 990, text: '2', color: '' },

      { delay: 1930, text: '1', color: '' },

      { delay: 2960, text: 'GO!', color: '#0284c7' },

    ]

    : [

      { delay: 0, text: '3', color: '', fn: () => sfx.countStep(3) },

      { delay: 700, text: '2', color: '', fn: () => sfx.countStep(2) },

      { delay: 1400, text: '1', color: '', fn: () => sfx.countStep(1) },

      { delay: 2100, text: 'GO!', color: '#0284c7', fn: () => sfx.countGo() },

    ];



  schedule.forEach(({ delay, text, color, fn }) => {

    later(() => {

      el.textContent = text;

      el.style.color = color;

      if (fn) fn();

    }, delay);

  });



  later(() => {

    el.style.color = '';

    presentStimulus();

  }, hasAudio ? 3650 : 2580);

  refreshPadUI();

}



function startFixation() {

  state.phase = 'fixation';

  const el = $('count-num');

  el.style.fontSize = '';

  el.textContent = '+';

  swipe.reset();

  state.fixTimer = later(presentStimulus, rand(CONFIG.fixationMinMs, CONFIG.fixationMaxMs));

}



export function prematureResponse() {

  clearTimeout(state.fixTimer);

  state.phase = 'count';

  sfx.bad();

  flash('bad');

  const el = $('count-num');

  el.style.fontSize = 'clamp(2.5rem, 6vw, 5rem)';

  el.textContent = 'TERLALU CEPAT! TUNGGU';

  later(startFixation, 1200);

}



function getQuestionLimitMs(qIndex, key = state.current) {

  if (key === 'auditori') {

    if (qIndex < 3) return 3100;

    if (qIndex < 7) return 2400;

    return 2000;

  }

  if (key === 'kinestetik') {

    return 3200;

  }

  if (qIndex < 3) return 3200;
  if (qIndex < 6) return 2500;
  return 1900;
}

function pulseAnim(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function setEdgeDanger(active) {
  const el = $('edge-danger');
  if (!el) return;
  el.style.opacity = active ? '1' : '0';
  if (!active) {
    el.classList.remove('heartbeat-active');
  }
}



function updateComboUI() {

  const el = $('stim-combo');

  if (!el) return;

  if (state.current === 'kinestetik') {

    if (state.kinScore > 0 || state.combo >= 2) {

      el.textContent = `🔥 COMBO x${state.combo} · ${state.kinScore} PTS`;

      el.classList.remove('hidden');

    } else {

      el.classList.add('hidden');

    }

    return;

  }

  if (state.combo >= 2) {

    el.textContent = `🔥 COMBO x${state.combo}`;

    el.classList.remove('hidden');

  } else {

    el.classList.add('hidden');

  }

}



function presentStimulus() {

  const key = state.current;

  const holder = $('stim-holder');

  const progress = $('stim-progress');

  const rush = $('stim-rush');

  const q = state.deck[state.qIndex];

  state.activeQuestion = q;

  state.trialErrors = 0;

  state.audStep = 0;

  state.audPlayingSeq = false;

  state.currentLimitMs = getQuestionLimitMs(state.qIndex, key);

  state.lastUrgentTickAt = 0;



  if (key === 'kinestetik') {

    state.kinRoundStartedAt ??= now();

    state.kinRepIndex = 0;

    initBeatSmasher(state.kinRoundStartedAt);

    if (progress) progress.textContent = state.isDemo ? '★ UJI COBA · POSE 3D' : `⚡ ${state.kinClearedCount} TARGET`;

    const elapsed = now() - state.kinRoundStartedAt;

    const isDrop = elapsed >= 32000;

    if (rush) {

      rush.classList.toggle('hidden', !isDrop);

      rush.textContent = '🔥 CHORUS FRENZY (2X SCORE)';

      if (isDrop && !rush.dataset.alerted) {

        rush.dataset.alerted = 'true';

        sfx.rushStart();

      }

    }

  } else {

    if (progress) progress.textContent = state.isDemo

      ? `UJI COBA ${state.qIndex + 1} / ${state.deck.length}`

      : `SOAL ${state.qIndex + 1} / ${state.deck.length}`;

    const rushAt = Math.max(7, state.deck.length - 5);

    if (rush) rush.classList.toggle('hidden', state.isDemo || state.qIndex < rushAt);

    if (!state.isDemo && state.qIndex === rushAt) sfx.rushStart();

  }

  updateComboUI();

  setEdgeDanger(false);



  const fill = $('stim-timer-fill');

  const tText = $('stim-timer-text');

  const track = $('stim-timer-track');

  const tLabel = $('stim-timer-label');

  if (tLabel) tLabel.textContent = key === 'kinestetik' ? 'SISA WAKTU LAGU (1 MENIT)' : 'BATAS WAKTU';

  if (fill) {

    fill.style.width = '100%';

    fill.className = 'h-full bg-emerald-500 transition-colors duration-100';

  }

  if (tText) {

    if (key === 'kinestetik' && state.kinRoundStartedAt) {

      const leftRound = Math.max(0, state.kinRoundDurationMs - (now() - state.kinRoundStartedAt));

      tText.textContent = `${Math.ceil(leftRound / 1000)}s`;

    } else {

      tText.textContent = `${(state.currentLimitMs / 1000).toFixed(1)}s`;

    }

  }

  if (track) track.classList.remove('timer-urgent');



  setFeedback('');

  $('stim-legend').innerHTML = '';



  if (key === 'visual') {

    renderVisualStimulus(holder, q);

    $('stim-legend').innerHTML = legendHTML('visual');

    showScreen('stim');

    state.phase = 'stim-visual';

    markOnset(now());

  } else if (key === 'auditori') {

    renderAuditoriStimulus(holder, q, { index: state.qIndex, total: state.deck.length, results: state.audResults || [], combo: state.combo });

    $('stim-legend').innerHTML = '';

    setAudTimer(100, state.currentLimitMs);

    showScreen('stim');

    state.phase = 'stim-audio';

    state.stimT0 = null;

    state.timeoutAt = Infinity;

    state.audPlayingSeq = true;

    setFeedback('Siaga dengar suara, abaikan gambar yang muncul.', '#0284c7');

    const s = state.session;



    // Detak ketegangan + fakeout flicker untuk mengunci fokus pemain (RUSH/HYPER)

    const rushLevel = q.phaseMode === 'HYPER' ? 2 : q.phaseMode === 'RUSH' ? 1 : 0;

    const tickInterval = q.phaseMode === 'HYPER' ? 230 : q.phaseMode === 'RUSH' ? 280 : 340;

    const tickCount = Math.floor((q.waitMs - 80) / tickInterval);

    for (let i = 0; i < tickCount; i++) {

      later(() => {

        if (s !== state.session || state.phase !== 'stim-audio' || state.stimT0 != null) return;

        sfx.prepTick(i, rushLevel);

        pulseAudOrb(i, rushLevel);

        if (q.phaseMode !== 'FOCUS' && i % 2 === 1) {

          flashFakeoutPad(q.fakeKey || q.decoyKey);

        }

      }, 120 + i * tickInterval);

    }



    later(() => {

      if (s !== state.session || state.phase !== 'stim-audio') return;

      state.audPlayingSeq = false;

      activateAuditoriCue(q);

      setFeedback(

        q.phaseMode === 'HYPER'

          ? 'HYPER: Tekan sesuai suara sekarang!'

          : 'Tekan sesuai suara, jangan tertipu gambar!',

        '#dc2626',

      );

      voice.play(q.voiceKey, q.voiceRate || 1.0).then((tPlay) => {

        if (s !== state.session || state.phase !== 'stim-audio') return;

        markOnset(tPlay || now());

      });

    }, q.waitMs);

  } else {

    state.kinRoundStartedAt ??= now();

    state.kinSubwayActive = false;

    state.kinSubwayLastRetry = now();

    const bpWrap = $('beatpose-wrap');

    preloadBeatPose();

    if (bpWrap) {

      bpWrap.classList.remove('opacity-0', 'pointer-events-none', 'invisible', 'hidden');

      bpWrap.classList.add('opacity-100', 'pointer-events-auto');

    }

    startKinestetikSubway();

    initBeatSmasher(state.kinRoundStartedAt);

    renderKinestetikStimulus(holder, q);

    showScreen('stim');

    state.phase = 'stim-kin';

    bgm.syncPhase('stim-kin');

    vision.poseMatchSince = null;

    vision.freezeStillSince = null;

    vision.prevPoseRef = null;

    state.kinFreezeActive = false;

    setFeedback(`🏃 Hindari 10 Rintangan! ⬆ Loncat · ⬇ Nunduk · ⬅ Kiri · ➡ Kanan`, '#22c55e');

    markOnset(now());

  }

  refreshPadUI();

}



function markOnset(t) {

  state.stimT0 = t;

  state.timeoutAt = t + state.currentLimitMs;

  state.lastUrgentTickAt = 0;

}



export function handlePadResponse(btn, t) {

  hitKey(btn);

  const key = state.current;

  const q = state.activeQuestion;



  if (key === 'kinestetik') {

    const { BTN } = gamepadState;

    if (btn === BTN.CROSS || btn === BTN.TRIANGLE) {

      sendSubwayAction('up');

    } else if (btn === BTN.SQUARE) {

      sendSubwayAction('left');

    } else if (btn === BTN.CIRCLE) {

      sendSubwayAction('right');

    } else {

      sendSubwayAction('down');

    }

    return;

  }



  if (state.stimT0 == null) {

    if (key === 'auditori') {

      registerError(key, '<b>TERLALU CEPAT!</b> Tunggu suara perintah keluar.');

    } else {

      setFeedback('Tunggu instruksi dulu', '#d97706');

    }

    return;

  }



  const correctBtn = q && q.correctBtn != null ? q.correctBtn : TESTS[key].correct;

  if (btn === correctBtn) {

    recordResult(key, t - state.stimT0);

  } else if (key === 'visual') {

    registerError(key, getVisualErrorMsg(btn, q));

  } else {

    registerError(key, getAuditoriErrorMsg(btn, q));

  }

}



function registerError(key, msg) {

  if (!state.isDemo) state.errors[key]++;

  state.trialErrors++;

  state.combo = 0;

  updateComboUI();

  sfx.bad();

  if (key === 'auditori') flashAuditoriError();

  pulseAnim($('stim-holder'), 'stim-shake');

  setEdgeDanger(true);

  later(() => {

    if (state.phase.startsWith('stim-')) setEdgeDanger(false);

  }, 160);

  const errNote = state.isDemo ? '(mode uji coba)' : `(salah ×${state.errors[key]})`;

  setFeedback(`${msg} <span class="text-zinc-500">${errNote}</span>`, '#dc2626');

}



function recordResult(key, rtRaw, timedOut = false) {

  const qRt = Math.max(0, Math.round(rtRaw + state.trialErrors * CONFIG.errorPenaltyMs));

  state.trialRts.push(qRt);

  if (timedOut) {

    state.trialTimeouts++;

    if (!state.isDemo) {

      state.timedOut[key] = true;

      state.timeouts[key] = (state.timeouts[key] || 0) + 1;

    }

    state.combo = 0;

  } else {

    state.combo = state.trialErrors === 0 ? state.combo + 1 : 0;

    state.maxCombo = Math.max(state.maxCombo, state.combo);

  }

  state.phase = 'feedback';

  state.kinFreezeActive = false;

  setEdgeDanger(false);

  $('stim-timer-track')?.classList.remove('timer-urgent');
  $('stim-timer-fill')?.classList.remove('danger-striped');
  $('visual-word-el')?.classList.remove('stim-panic');

  updateComboUI();

  if (key === 'auditori') {

    state.audResults = state.audResults || [];

    state.audResults.push(timedOut || state.trialErrors > 0 ? 'bad' : 'ok');

    if (timedOut) flashAuditoriError();

  }



  const q = state.activeQuestion;

  const correctBtn = q && q.correctBtn != null ? q.correctBtn : TESTS[key].correct;

  const stepNum = state.qIndex + 1;

  const total = state.deck.length;



  if (timedOut) {

    sfx.bad();

    pulseAnim($('stim-holder'), 'stim-shake');

    if (key === 'kinestetik') {

      setFeedback(`Lewat! Lanjut gerakan berikutnya!`, '#d97706');

    } else {

      setFeedback(`Waktu habis (${stepNum}/${total}): ${qRt} ms`, '#d97706');

    }

  } else {

    pulseAnim($('stim-holder'), 'stim-pop');

    if (correctBtn != null) hitKey(correctBtn);

    if (key === 'kinestetik') {

      state.kinClearedCount++;

      const elapsed = now() - (state.kinRoundStartedAt || now());

      const isDrop = elapsed >= 32000;

      const mult = isDrop ? 2 : 1;

      const pts = (100 + state.combo * 25) * mult;

      state.kinScore += pts;

      playPoseSfx(q);

      const comboTxt = state.combo >= 2 ? ` · 🔥 COMBO x${state.combo}` : '';

      setFeedback(`⚡ <b>+${pts} PTS!</b>${isDrop ? ' 🔥 2X DROP!' : ''}${comboTxt}`, '#16a34a');

    } else {

      sfx.comboGood(Math.max(1, state.combo));

      if (key === 'auditori') flashCorrectAuditoriPad(q, qRt);

      const rank = qRt < 480 ? 'KILAT!' : qRt < 750 ? 'CEPAT!' : 'TEPAT!';

      const comboTxt = state.combo >= 2 ? ` · STREAK x${state.combo}` : '';

      setFeedback(`${rank} <b>${qRt} ms</b>${comboTxt}`, '#16a34a');

    }

  }

  refreshPadUI();



  if (key === 'kinestetik') {

    const elapsed = now() - (state.kinRoundStartedAt || now());

    const isSongDone = elapsed >= state.kinRoundDurationMs;

    if (!isSongDone) {

      state.qIndex++;

      if (state.qIndex >= state.deck.length) {

        state.deck.push(...buildKinestetikDeck().slice(8));

      }

      later(presentStimulus, 160);

      return;

    }

  } else if (state.qIndex < total - 1) {

    state.qIndex++;

    const nextDelay = state.qIndex >= 3 ? 160 : 240;

    later(presentStimulus, nextDelay);

    return;

  }



  if (state.isDemo) {

    later(() => exitDemoMode(true), 450);

    return;

  }



  const robustRt = computeRobustRt(state.trialRts);

  state.rt[key] = robustRt;

  const bis = computeModalityBis(key, robustRt, state.errors[key] || 0, state.timeouts[key] || 0);

  state.scores[key] = bis.score;

  state.accuracy[key] = bis.accPct;

  console.info(`[BIS] ${key}: score=${bis.score}/100, medianRT=${robustRt}ms, acc=${bis.accPct}%, errors=${state.errors[key]}, timeouts=${state.timeouts[key]}`);

  later(() => {

    showStageClear(key, robustRt);

  }, 500);

}



function showStageClear(key, avgRt) {

  state.phase = 'stage-clear';

  document.body.classList.remove('aud-arena');

  closeBeatPoseFrame();

  setEdgeDanger(false);

  sfx.stageClear();

  const errs = state.errors[key] || 0;

  const stageLabels = {

    visual: '02 VISUAL · SELESAI',

    auditori: '03 AUDITORI · SELESAI',

    kinestetik: '04 KINESTETIK · SUBWAY SURFERS TUNTAS',

  };

  const nextNotes = {

    visual: 'Siapkan telingamu! Babak berikutnya: 03 AUDITORI (Dengar suara, abaikan teks layar).',

    auditori: 'Mundur 1.5 - 2 meter di depan kamera untuk babak 04 KINESTETIK (Subway Surfers 3D).',

    kinestetik: `Tantangan lintasan tuntas! ${state.kinClearedCount}/10 rintangan berhasil dihindari dengan skor ${state.kinScore} PTS!`,

  };

  const nextButtons = {

    visual: 'LANJUT KE 03 AUDITORI →',

    auditori: 'LANJUT KE 04 KINESTETIK →',

    kinestetik: 'LIHAT HASIL ANALISIS →',

  };

  const tier = key === 'kinestetik'

    ? state.kinClearedCount >= 9

      ? '🌟 SSS-RANK · SUBWAY MASTER'

      : state.kinClearedCount >= 7

        ? '⚡ S-RANK · SPEED RUNNER'

        : state.kinClearedCount >= 5

          ? '🎯 A-RANK · ACTIVE RUNNER'

          : '🔥 B-RANK · SURVIVOR'

    : avgRt < 650 && errs === 0

      ? '⚡ REFLEKS KILAT · SEMPURNA'

      : avgRt < 950

        ? '🎯 FOKUS TAJAM'

        : '🔥 BABAK TUNTAS';



  if ($('sc-badge')) $('sc-badge').textContent = stageLabels[key] || 'SELESAI';

  if ($('sc-tier')) $('sc-tier').textContent = tier;

  if ($('sc-avg')) $('sc-avg').textContent = key === 'kinestetik' ? `${state.kinClearedCount}/10 Target (${avgRt} ms)` : `${avgRt} ms`;

  if ($('sc-err')) $('sc-err').textContent = key === 'kinestetik' ? `${state.kinScore} PTS · ${state.errors.kinestetik || 0} Tabrakan` : (errs === 0 ? '0 (Sempurna)' : `${errs} salah`);

  if ($('sc-note')) $('sc-note').textContent = nextNotes[key] || '';

  if ($('btn-stage-next')) $('btn-stage-next').textContent = nextButtons[key] || 'LANJUT →';



  $('stage-clear-modal')?.classList.remove('hidden');

  refreshPadUI();

}



export function advanceFromStageClear() {

  if (state.phase !== 'stage-clear') return;

  $('stage-clear-modal')?.classList.add('hidden');

  sfx.tick();

  const i = ORDER.indexOf(state.current);

  if (i >= 0 && i < ORDER.length - 1) showIntro(ORDER[i + 1]);

  else showResult();

}



export function startKinestetikSubway() {

  const bpFrame = $('beatpose-frame');

  if (bpFrame?.contentWindow) {

    try {

      bpFrame.contentWindow.postMessage({ type: 'START_ASSESSMENT' }, '*');

      bpFrame.contentWindow.postMessage({ type: 'MUTE', muted: !bgm.enabled }, '*');

    } catch (_) { }

    try {

      if (typeof bpFrame.contentWindow.startSubwayAssessment === 'function') {

        bpFrame.contentWindow.startSubwayAssessment();

      }

    } catch (_) { }

  }

}



export function preloadBeatPose() {

  const bpFrame = $('beatpose-frame');

  if (bpFrame && !bpFrame.dataset.loaded) {

    bpFrame.src = 'subway-surfers/dist/index.html?assessment=1&v=112';

    bpFrame.dataset.loaded = '1';

  }

}



function closeBeatPoseFrame() {

  const bpWrap = $('beatpose-wrap');

  if (bpWrap) {

    bpWrap.classList.remove('opacity-100', 'pointer-events-auto');

    bpWrap.classList.add('opacity-0', 'pointer-events-none', 'invisible');

  }

  const bpFrame = $('beatpose-frame');

  if (bpFrame?.contentWindow) {

    try {

      bpFrame.contentWindow.postMessage({ type: 'PAUSE' }, '*');

      bpFrame.contentWindow.postMessage({ type: 'MUTE', muted: true }, '*');

    } catch (_) { }

  }

}



window.addEventListener('message', (ev) => {

  if (ev.data?.type === 'SUBWAY_READY') {

    if (state.phase === 'stim-kin') {

      startKinestetikSubway();

    }

  } else if (ev.data?.type === 'KINESTETIK_PROGRESS') {

    state.kinSubwayActive = true;

    const { evaluated } = ev.data;

    const tgtEl = $('subway-targets');

    if (tgtEl) tgtEl.textContent = `${evaluated}`;

  } else if (ev.data?.type === 'KINESTETIK_COMPLETE') {

    state.kinSubwayActive = false;

    if (state.isDemo) {

      closeBeatPoseFrame();

      exitDemoMode(true);

      return;

    }

    const { reactionTimes, errors, score, clearedCount, avgRt } = ev.data;

    state.trialRts = reactionTimes || [];

    state.errors.kinestetik = errors || 0;

    state.timeouts.kinestetik = 0;

    state.kinScore = score || 0;

    state.kinClearedCount = clearedCount ?? Math.max(0, 10 - (errors || 0));

    const finalRt = state.trialRts.length ? computeRobustRt(state.trialRts) : (avgRt || 560);

    state.rt.kinestetik = finalRt;

    const bis = computeModalityBis('kinestetik', finalRt, state.errors.kinestetik, 0);

    state.scores.kinestetik = bis.score;

    state.accuracy.kinestetik = bis.accPct;

    closeBeatPoseFrame();

    showStageClear('kinestetik', finalRt);

  }

});



function finishBeatPoseRound() {

  if (state.phase !== 'stim-kin') return;

  closeBeatPoseFrame();

  if (state.isDemo) {

    exitDemoMode(true);

    return;

  }

  const finalRt = state.trialRts.length > 0 ? computeRobustRt(state.trialRts) : 560;

  state.rt.kinestetik = finalRt;

  const bis = computeModalityBis('kinestetik', finalRt, state.errors.kinestetik || 0, 0);

  state.scores.kinestetik = bis.score;

  state.accuracy.kinestetik = bis.accPct;

  showStageClear('kinestetik', finalRt);

}



export function tickTrial() {

  if (!state.phase.startsWith('stim-') || state.stimT0 == null) return;

  const t = now();



  if (state.phase === 'stim-kin') {

    if (!state.kinSubwayActive && (t - (state.kinSubwayLastRetry || 0) > 400)) {

      state.kinSubwayLastRetry = t;

      startKinestetikSubway();

    }

    if (state.kinRoundStartedAt) {

      const elapsed = t - state.kinRoundStartedAt;

      if (elapsed >= 80000) {

        finishBeatPoseRound();

        return;

      }

    }

    return;

  }



  const left = Math.max(0, state.timeoutAt - t);

  const pct = Math.max(0, Math.min(100, (left / state.currentLimitMs) * 100));



  const fill = $('stim-timer-fill');

  const tText = $('stim-timer-text');

  const track = $('stim-timer-track');
  const wordEl = $('visual-word-el');
  const edgeEl = $('edge-danger');

  if (fill) {

    fill.style.width = `${pct.toFixed(1)}%`;

    if (left <= 1500) {

      fill.className = 'h-full bg-red-600 danger-striped transition-colors duration-100';

    } else if (pct <= 50) {

      fill.className = 'h-full bg-amber-400 transition-colors duration-100';
      fill.classList.remove('danger-striped');

    } else {

      fill.className = 'h-full bg-emerald-500 transition-colors duration-100';
      fill.classList.remove('danger-striped');

    }

  }

  if (tText) {
    tText.textContent = `${(left / 1000).toFixed(1)}s`;
    if (left <= 1500) {
      tText.classList.add('text-red-600', 'font-black');
    } else {
      tText.classList.remove('text-red-600', 'font-black');
    }
  }

  if (state.current === 'auditori') setAudTimer(pct, left);



  if (left <= 1800 && left > 0) {

    track?.classList.add('timer-urgent');
    if (wordEl) wordEl.classList.add('stim-panic');
    if (edgeEl) {
      edgeEl.style.opacity = '1';
      edgeEl.classList.add('heartbeat-active');
    }

    const beatInterval = left <= 750 ? 320 : left <= 1250 ? 440 : 600;
    if (t - (state.lastUrgentTickAt || 0) >= beatInterval) {

      state.lastUrgentTickAt = t;
      const rushLevel = left <= 750 ? 2 : left <= 1250 ? 1 : 0;
      sfx.heartbeat(rushLevel);

    }

  } else {
    track?.classList.remove('timer-urgent');
    if (wordEl) wordEl.classList.remove('stim-panic');
    if (edgeEl) {
      edgeEl.classList.remove('heartbeat-active');
      edgeEl.style.opacity = '0';
    }
  }



  if (t > state.timeoutAt) {

    if (wordEl) wordEl.classList.remove('stim-panic');
    if (edgeEl) {
      edgeEl.classList.remove('heartbeat-active');
      edgeEl.style.opacity = '0';
    }
    track?.classList.remove('timer-urgent');
    fill?.classList.remove('danger-striped');
    recordResult(state.current, state.currentLimitMs, true);

  }

}



export function debugTriggerKinPose() {

  if (state.phase === 'stim-kin') {

    debugTriggerBeatSmasherHit();

  }

}



export function onSwipe(s) {

  if (state.phase === 'fixation') { prematureResponse(); return; }

  if (state.phase === 'result' && s.dir === 'right' && now() >= state.resetUnlockAt) resetGame();

}



/* ─── Psikometri V-A-K: Balanced Integration Score (Liesefeld et al., 2015) ─── */

const VAK_NORMS = {

  visual: { meanRt: 900, sdRt: 350, trials: 10 },

  auditori: { meanRt: 1050, sdRt: 380, trials: 10 }, // kompensasi durasi artikulasi suara ~250-350ms

  kinestetik: { meanRt: 560, sdRt: 200, trials: 10 }, // jendela reaksi rintangan 3D Subway

};



// Median RT (tahan outlier: 1x timeout tidak merusak kecepatan asli peserta — Ratcliff, 1993)

function computeRobustRt(rts) {

  if (!rts || !rts.length) return 900;

  const sorted = [...rts].sort((a, b) => a - b);

  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return Math.round(sorted[mid]);

  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);

}



function clamp(v, lo, hi) {

  return Math.max(lo, Math.min(hi, v));

}



function computeModalityBis(key, rtMs, errors = 0, timeouts = 0) {

  const norm = VAK_NORMS[key] || VAK_NORMS.visual;

  const safeRt = Math.max(150, Number(rtMs) || norm.meanRt);



  // 1. Z-Score Kecepatan terhadap norma modalitas (lebih cepat dari rata-rata = z positif)

  const zSpeed = clamp((norm.meanRt - safeRt) / norm.sdRt, -2.2, 2.2);



  // 2. Proporsi Akurasi & Z-Score Akurasi (Speed-Accuracy Trade-Off control)

  const penaltyUnits = key === 'kinestetik'

    ? errors * 1.0

    : (errors * 0.75) + (timeouts * 1.0);

  const pc = clamp((norm.trials - penaltyUnits) / norm.trials, 0, 1);

  const zAcc = clamp((pc - 0.80) / 0.16, -2.2, 2.2);



  // 3. Balanced Integration Score (50% zSpeed + 50% zAcc) diskalakan ke 10..99

  const bis = 0.50 * zSpeed + 0.50 * zAcc;

  const score = Math.round(clamp(60 + bis * 18, 10, 99));

  return {

    score,

    accPct: Math.round(pc * 100),

    bis: Number(bis.toFixed(2)),

  };

}



function computeAllVakScores() {

  const scores = {};

  const acc = {};

  for (const k of ORDER) {

    if (state.scores[k] != null && state.accuracy[k] != null) {

      scores[k] = state.scores[k];

      acc[k] = state.accuracy[k];

    } else {

      const res = computeModalityBis(k, state.rt[k], state.errors[k] || 0, state.timeouts[k] || 0);

      scores[k] = res.score;

      acc[k] = res.accPct;

    }

  }

  return { scores, acc };

}



function winnerOf(scores, rt) {

  return ORDER.reduce((best, k) => {

    const sK = scores[k] ?? 0;

    const sBest = scores[best] ?? 0;

    if (sK !== sBest) return sK > sBest ? k : best;

    return (rt[k] ?? Infinity) < (rt[best] ?? Infinity) ? k : best;

  }, ORDER[0]);

}



let lastResultWin = 'visual';



function syncResultIdentityUI(win) {
  const identity = loadIdentity();
  const arch = ARCHETYPES[win] || ARCHETYPES.visual;

  if ($("id-card-serial")) $("id-card-serial").textContent = `#${identity?.id || "VAK-2026"}`;
  if ($("id-card-date")) $("id-card-date").textContent = identity?.createdAt || "23 NOV 2026";
  if ($("id-card-stamp")) $("id-card-stamp").textContent = `★ ${arch.stamp} ★`;
  if ($("res-archetype")) $("res-archetype").textContent = arch.title;

  const photoEl = $("id-card-photo");
  const photoEmpty = $("id-card-photo-empty");
  if (photoEl && photoEmpty) {
    if (identity?.photoDataUrl) {
      photoEl.src = identity.photoDataUrl;
      photoEl.style.display = "block";
      photoEmpty.style.display = "none";
    } else {
      photoEl.removeAttribute("src");
      photoEl.style.display = "none";
      photoEmpty.style.display = "flex";
    }
  }

  const sigEl = $("id-card-sig");
  const sigEmpty = $("id-card-sig-empty");
  if (sigEl && sigEmpty) {
    if (identity?.signatureDataUrl) {
      sigEl.src = identity.signatureDataUrl;
      sigEl.style.display = "block";
      sigEmpty.style.display = "none";
    } else {
      sigEl.removeAttribute("src");
      sigEl.style.display = "none";
      sigEmpty.style.display = "flex";
    }
  }
}

export function downloadResultCard() {
  sfx.tick();
  const { scores, acc } = computeAllVakScores();
  exportIdCardPng({
    identity: loadIdentity(),
    win: lastResultWin,
    rt: state.rt,
    scores,
    accuracy: acc,
    qrContainer: $("qrcode"),
  });
}

export function showResult({ shared = false, forcedWin = null, forcedScores = null } = {}) {
  state.phase = "result";
  state.current = null;
  const rt = state.rt;
  const { scores, acc } = computeAllVakScores();

  if (forcedScores) {
    if (forcedScores.visual != null) scores.visual = forcedScores.visual;
    if (forcedScores.auditori != null) scores.auditori = forcedScores.auditori;
    if (forcedScores.kinestetik != null) scores.kinestetik = forcedScores.kinestetik;
  }

  const win = forcedWin || winnerOf(scores, rt);
  lastResultWin = win;
  const info = STYLE_INFO[win] || STYLE_INFO.visual;

  const styleEl = $("res-style");
  if (styleEl) {
    styleEl.textContent = info.label;
    styleEl.dataset.text = info.label;
    styleEl.style.color = info.color;
    styleEl.style.textShadow = "none";
  }

  if ($("res-tip-title")) $("res-tip-title").textContent = info.tipTitle || "Catatan Cara Belajar";
  if ($("res-tip")) $("res-tip").textContent = info.tip || "";
  if ($("res-style-sub")) $("res-style-sub").textContent = info.sub || "";

  if (info.traits && info.traits.length >= 3) {
    if ($("res-trait-1")) $("res-trait-1").textContent = info.traits[0];
    if ($("res-trait-2")) $("res-trait-2").textContent = info.traits[1];
    if ($("res-trait-3")) $("res-trait-3").textContent = info.traits[2];
  }

  syncResultIdentityUI(win);

  if ($("res-fastest-pill")) $("res-fastest-pill").textContent = `SKOR BIS ${scores[win]}/100`;

  $("res-bars").innerHTML = ORDER.map((k) => {
    const s = STYLE_INFO[k];
    const isWin = k === win;
    const detail = shared
      ? `${rt[k]} ms`
      : `${rt[k]} ms · ${acc[k]}% akurat`;
    return `
      <div class="res-bar-row ${isWin ? "is-win" : ""}">
        <div class="flex justify-between items-center mb-1.5 ${isWin ? "font-black text-zinc-900" : "font-bold text-zinc-600"}">
          <span class="flex items-center gap-1.5" style="${isWin ? `color:${s.color}` : ""}">
            ${isWin ? '<span class="text-xs">▶</span>' : ''}
            <span>${s.label}</span>
          </span>
          <span class="tabular-nums font-mono text-xs font-bold text-zinc-900">
            ${scores[k]}<span class="text-[10px] text-zinc-400 font-semibold">/100</span>
            <span class="ml-1 text-[10px] text-zinc-500 font-medium">(${detail})</span>
          </span>
        </div>
        <div class="bar-track"><div class="bar-fill" data-w="${scores[k]}"
             style="background:${s.color};opacity:${isWin ? 1 : 0.55}; width:0%"></div></div>
      </div>`;
  }).join("") + '<p class="text-[9px] text-zinc-400 font-bold uppercase tracking-wider pt-1.5 px-0.5">Balanced Integration Score (50% Kecepatan + 50% Akurasi)</p>';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll(".bar-fill").forEach((b) => { b.style.width = `${b.dataset.w}%`; });
  }));

  renderQR(buildQrPayload(win));

  $("reset-hint").classList.toggle("hidden", shared);
  showScreen("result");
  setStep(5);
  setGameMode(true);
  dimCam(false);
  refreshPadUI();

  if (!shared) {
    sfx.fanfare();
    state.resetUnlockAt = now() + CONFIG.resetLockMs;
    state.autoResetAt = now() + CONFIG.autoResetMs;
  }
}
function buildQrPayload(win) {
  const r = state.rt;
  const ident = loadIdentity();
  const pid = ident?.id || "VAK-2026";
  const { scores } = computeAllVakScores();

  let params = `r=${STYLE_INFO[win].code}&id=${encodeURIComponent(pid)}&v=${r.visual || 0}&a=${r.auditori || 0}&k=${r.kinestetik || 0}&sv=${scores.visual || 0}&sa=${scores.auditori || 0}&sk=${scores.kinestetik || 0}`;

  if (ident?.signatureVector) {
    params += `&sig=${encodeURIComponent(ident.signatureVector)}`;
  }

  if (ident?.photoServerUrl) {
    let photoUrl = ident.photoServerUrl;
    const targetIp = CONFIG.localIp || '192.168.1.19';
    const targetPort = CONFIG.serverPort || 3000;
    // Ubah localhost ke IP LAN agar HP peserta di Wi-Fi yang sama bisa load foto
    photoUrl = photoUrl.replace(/localhost:\d+/, `${targetIp}:${targetPort}`)
                       .replace(/127\.0\.0\.1:\d+/, `${targetIp}:${targetPort}`);
    params += `&photo=${encodeURIComponent(photoUrl)}`;
  }

  // Tentukan Base URL QR Code (Wajib IP LAN lokal, bukan localhost)
  let qrBase = CONFIG.resultBaseUrl;
  if (!qrBase || qrBase.includes('localhost') || qrBase.includes('127.0.0.1')) {
    const hostIp = (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')
      ? location.hostname
      : (CONFIG.localIp || '192.168.1.19');
    const port = location.port || CONFIG.serverPort || 3000;
    qrBase = `http://${hostIp}:${port}/scan.html`;
  }

  console.log('[Game] Render QR Code Payload URL:', `${qrBase}?${params}`);
  return `${qrBase}?${params}`;
}



function renderQR(text) {
  const box = $('qrcode');
  if (!box) return;
  box.innerHTML = '';
  if (typeof window.QRCode === 'undefined') { box.textContent = 'QR library gagal dimuat'; return; }

  new window.QRCode(box, {

    text, width: 108, height: 108,

    colorDark: '#111113', colorLight: '#ffffff',

    correctLevel: window.QRCode.CorrectLevel.M,

  });

}

if (typeof window !== 'undefined') {
  const refreshQrNow = () => {
    if ((state.phase === 'result' || state.phase === 'shared') && lastResultWin) {
      console.log('[Game] Auto-refreshing QR Code with newly updated target URL...');
      renderQR(buildQrPayload(lastResultWin));
    }
  };
  window.addEventListener('stroop_photo_uploaded', refreshQrNow);
  window.addEventListener('stroop_config_updated', refreshQrNow);
}



export function tickResult() {

  const left = state.resetUnlockAt - now();

  $('reset-lock').textContent = left > 0 ? `reset aktif dalam ${(left / 1000).toFixed(1)}s` : 'atau tekan START di controller';

  if (now() > state.autoResetAt) resetGame();

}



export function showSharedResult(qs) {
  const n = (k) => Number(qs.get(k)) || 0;
  state.rt = { visual: n('v'), auditori: n('a'), kinestetik: n('k') };

  const codeToStyle = { V: 'visual', A: 'auditori', K: 'kinestetik' };
  const rCode = (qs.get('r') || '').toUpperCase();
  const forcedWin = codeToStyle[rCode] || null;

  const forcedScores = {
    visual: qs.has('sv') ? n('sv') : null,
    auditori: qs.has('sa') ? n('sa') : null,
    kinestetik: qs.has('sk') ? n('sk') : null,
  };

  const forcedId = qs.get('id');
  if (forcedId) {
    const ident = loadIdentity() || {};
    ident.id = forcedId;
    saveIdentity(ident);
  }

  $('hud').classList.remove('hidden');
  $('stepper').style.display = 'none';
  setGameMode(true);
  dimCam(false);
  showResult({ shared: true, forcedWin, forcedScores });
  state.phase = 'shared';
}



export function skipCurrentTest() {

  if (!CONFIG.debugKeys) return;

  abortPending();

  document.body.classList.remove('aud-arena');

  voice.stopAll();

  closeBeatPoseFrame();

  setEdgeDanger(false);

  $('stage-clear-modal')?.classList.add('hidden');

  state.audPlayingSeq = false;

  sfx.tick();



  if (state.phase === 'result' || state.phase === 'shared') {

    resetGame();

    return;

  }



  const key = state.current || ORDER[0];

  if (state.rt[key] == null) {

    state.rt[key] = state.trialRts.length > 0

      ? Math.round(state.trialRts.reduce((a, b) => a + b, 0) / state.trialRts.length)

      : 500;

  }



  const i = ORDER.indexOf(key);

  if (i >= 0 && i < ORDER.length - 1) showIntro(ORDER[i + 1]);

  else showResult();

}



export function resetGame() {

  abortPending();

  clearIdentity();

  document.body.classList.remove('aud-arena');

  voice.stopAll();

  sfx.tick();

  location.href = 'index.html';

}



