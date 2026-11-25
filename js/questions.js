export function cryptoRandInt(max) {
  if (max <= 1) return 0;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function shuffleDeck(bank, storageKey, isConflict) {
  let lastFirstId = null;
  try {
    lastFirstId = localStorage.getItem(storageKey);
  } catch (_) {}

  for (let attempt = 0; attempt < 40; attempt++) {
    const remaining = bank.slice();
    const deck = [];

    const firstPool = remaining.filter((item) => item.id !== lastFirstId);
    const firstChoices = firstPool.length > 0 ? firstPool : remaining;
    const first = firstChoices[cryptoRandInt(firstChoices.length)];
    deck.push(first);
    remaining.splice(remaining.indexOf(first), 1);

    let stuck = false;
    while (remaining.length > 0) {
      const prev = deck[deck.length - 1];
      const valid = remaining.filter((item) => !isConflict(prev, item));
      if (valid.length === 0) {
        stuck = true;
        break;
      }
      const next = valid[cryptoRandInt(valid.length)];
      deck.push(next);
      remaining.splice(remaining.indexOf(next), 1);
    }

    if (!stuck) {
      try {
        if (deck[0]) localStorage.setItem(storageKey, deck[0].id);
      } catch (_) {}
      return deck;
    }
  }

  const fallback = bank.slice();
  for (let i = fallback.length - 1; i > 0; i--) {
    const j = cryptoRandInt(i + 1);
    const tmp = fallback[i];
    fallback[i] = fallback[j];
    fallback[j] = tmp;
  }
  return fallback;
}
