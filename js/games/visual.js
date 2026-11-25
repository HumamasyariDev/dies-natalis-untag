import { gamepadState, getPsStyle } from '../config.js';
import { shuffleDeck } from '../questions.js';

export const VISUAL_QUESTIONS = [
  { id: 'v1',  word: 'MERAH', trapBtnKey: 'CIRCLE',   inkColor: '#2563eb', inkLabel: 'BIRU',  correctBtnKey: 'CROSS' },
  { id: 'v2',  word: 'PINK',  trapBtnKey: 'SQUARE',   inkColor: '#16a34a', inkLabel: 'HIJAU', correctBtnKey: 'TRIANGLE' },
  { id: 'v3',  word: 'HIJAU', trapBtnKey: 'TRIANGLE', inkColor: '#db2777', inkLabel: 'PINK',  correctBtnKey: 'SQUARE' },
  { id: 'v4',  word: 'HIJAU', trapBtnKey: 'TRIANGLE', inkColor: '#ef4444', inkLabel: 'MERAH', correctBtnKey: 'CIRCLE' },
  { id: 'v5',  word: 'PINK',  trapBtnKey: 'SQUARE',   inkColor: '#2563eb', inkLabel: 'BIRU',  correctBtnKey: 'CROSS' },
  { id: 'v6',  word: 'MERAH', trapBtnKey: 'CIRCLE',   inkColor: '#16a34a', inkLabel: 'HIJAU', correctBtnKey: 'TRIANGLE' },
  { id: 'v7',  word: 'BIRU',  trapBtnKey: 'CROSS',    inkColor: '#db2777', inkLabel: 'PINK',  correctBtnKey: 'SQUARE' },
  { id: 'v8',  word: 'PINK',  trapBtnKey: 'SQUARE',   inkColor: '#ef4444', inkLabel: 'MERAH', correctBtnKey: 'CIRCLE' },
  { id: 'v9',  word: 'HIJAU', trapBtnKey: 'TRIANGLE', inkColor: '#2563eb', inkLabel: 'BIRU',  correctBtnKey: 'CROSS' },
  { id: 'v10', word: 'BIRU',  trapBtnKey: 'CROSS',    inkColor: '#16a34a', inkLabel: 'HIJAU', correctBtnKey: 'TRIANGLE' },
];

export function buildVisualDeck() {
  return shuffleDeck(
    VISUAL_QUESTIONS,
    'stroop_deck_first_visual_v3',
    (a, b) => a.inkLabel === b.inkLabel || a.word === b.word,
  ).map((q) => ({
    ...q,
    get correctBtn() { return gamepadState.BTN[q.correctBtnKey]; },
    get trapBtn() { return gamepadState.BTN[q.trapBtnKey]; },
  }));
}

export function renderVisualStimulus(holder, q) {
  holder.innerHTML = `<div id="visual-word-el" class="stim-word stim-pop-in" style="color:${q.inkColor}">${q.word}</div>`;
}

export function getVisualErrorMsg(btn, q) {
  const sym = getPsStyle(btn).sym;
  return q && btn === q.trapBtn
    ? `${sym} Itu arti KATANYA (${q.word}). Pilih <b>WARNA TINTA (${q.inkLabel})</b>.`
    : `Salah tombol. Pilih warna tinta <b>${q ? q.inkLabel : ''}</b>.`;
}

