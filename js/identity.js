import { $, STYLE_INFO } from './config.js';

const STORAGE_KEY = 'stroop_participant_identity_v1';

export const ARCHETYPES = {
  visual: {
    title: 'VISUAL STRATEGIST',
    stamp: 'PENGAMAT KILAT',
    accent: '#0284c7',
    lightBg: '#e0f2fe',
  },
  auditori: {
    title: 'AUDITORY ACE',
    stamp: 'FOKUS AKUSTIK',
    accent: '#db2777',
    lightBg: '#fce7f3',
  },
  kinestetik: {
    title: 'KINESTHETIC HERO',
    stamp: 'REFLEKS MOTORIK',
    accent: '#16a34a',
    lightBg: '#dcfce7',
  },
};

function generateBadgeId() {
  const num = Math.floor(100 + Math.random() * 900);
  return `VAK-${num}`;
}

function formatStampDate() {
  const d = new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`;
}

export function captureWebcamPhoto(videoEl) {
  if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null;
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;

  // Target portrait 4:5 aspect crop centered on participant's face/upper body
  const targetRatio = 4 / 5;
  let sw = vw;
  let sh = vh;
  let sx = 0;
  let sy = 0;

  if (vw / vh > targetRatio) {
    sw = Math.round(vh * targetRatio);
    sx = Math.round((vw - sw) / 2);
  } else {
    sh = Math.round(vw / targetRatio);
    sy = Math.round((vh - sh) / 2);
  }

  const outW = 480;
  const outH = 600;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');

  // Mirror horizontally to match the live mirror feed the participant sees
  ctx.translate(outW, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, outW, outH);

  try {
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch (err) {
    console.warn('[Identity] Gagal encode foto webcam:', err);
    return null;
  }
}

export function captureSignatureFromCalib(shapes, currentShape, starStamps) {
  const allShapes = [...(shapes || [])];
  if (currentShape && currentShape.length) allShapes.push(currentShape);
  const allPts = allShapes.flat();
  if (allPts.length < 3) return null;

  // Koordinat pt.x sudah dalam orientasi layar (MediaPipe webcam sudah di-mirror)
  // Gunakan pt.x langsung agar tanda tangan / inisial tidak terbalik (mirror)
  const mirroredShapes = allShapes.map((sh) => sh.map((pt) => ({ ...pt, mx: pt.x })));
  const mirroredPts = mirroredShapes.flat();

  // Compute tight bounding box in normalized [0..1] coordinates
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const pt of mirroredPts) {
    if (pt.mx < minX) minX = pt.mx;
    if (pt.mx > maxX) maxX = pt.mx;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const spanX = Math.max(0.08, maxX - minX);
  const spanY = Math.max(0.08, maxY - minY);
  const outW = 420;
  const outH = 160;
  const pad = 26;

  const scale = Math.min((outW - pad * 2) / spanX, (outH - pad * 2) / spanY);
  const offsetX = (outW - spanX * scale) / 2;
  const offsetY = (outH - spanY * scale) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');

  // Draw connecting ink path underneath for clear legibility on paper card
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 5;
  for (const sh of mirroredShapes) {
    if (sh.length < 2) continue;
    ctx.beginPath();
    sh.forEach((pt, idx) => {
      const px = offsetX + (pt.mx - minX) * scale;
      const py = offsetY + (pt.y - minY) * scale;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  ctx.restore();

  // Overlay crisp star stamps along the strokes
  const stampSize = Math.max(18, Math.min(30, scale * 0.045));
  for (const sh of mirroredShapes) {
    for (const pt of sh) {
      const px = offsetX + (pt.mx - minX) * scale;
      const py = offsetY + (pt.y - minY) * scale;
      const img = starStamps && starStamps[pt.stampIdx];
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(((pt.angle || 0) * Math.PI) / 180);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -stampSize / 2, -stampSize / 2, stampSize, stampSize);
      } else {
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#111113';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, stampSize * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  try {
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[Identity] Gagal encode tanda tangan:', err);
    return null;
  }
}

export function exportCompactSignature(shapes, currentShape) {
  const allShapes = [...(shapes || [])];
  if (currentShape && currentShape.length) allShapes.push(currentShape);
  const allPts = allShapes.flat();
  if (allPts.length < 3) return null;

  // Gunakan pt.x langsung agar tidak terbalik horizontal
  const mirroredShapes = allShapes.map((sh) => sh.map((pt) => ({ ...pt, mx: pt.x })));
  const mirroredPts = mirroredShapes.flat();

  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const pt of mirroredPts) {
    if (pt.mx < minX) minX = pt.mx;
    if (pt.mx > maxX) maxX = pt.mx;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  const spanX = Math.max(0.05, maxX - minX);
  const spanY = Math.max(0.05, maxY - minY);

  const bytes = [];
  for (const sh of mirroredShapes) {
    if (sh.length < 2) continue;
    if (bytes.length > 0) {
      bytes.push(255, 255);
    }
    const step = Math.max(1, Math.floor(sh.length / 18));
    for (let i = 0; i < sh.length; i += step) {
      const pt = sh[i];
      const nx = Math.max(0, Math.min(250, Math.round(((pt.mx - minX) / spanX) * 250)));
      const ny = Math.max(0, Math.min(250, Math.round(((pt.y - minY) / spanY) * 250)));
      bytes.push(nx, ny);
    }
    const last = sh[sh.length - 1];
    const lx = Math.max(0, Math.min(250, Math.round(((last.mx - minX) / spanX) * 250)));
    const ly = Math.max(0, Math.min(250, Math.round(((last.y - minY) / spanY) * 250)));
    if (bytes[bytes.length - 2] !== lx || bytes[bytes.length - 1] !== ly) {
      bytes.push(lx, ly);
    }
  }

  if (!bytes.length) return null;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  try {
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (err) {
    console.warn('[Identity] Gagal encode compact signature:', err);
    return null;
  }
}

export function hasValidIdentity() {
  const id = loadIdentity();
  return Boolean(
    id &&
    id.id &&
    typeof id.photoDataUrl === 'string' &&
    id.photoDataUrl.startsWith('data:image/') &&
    typeof id.signatureDataUrl === 'string' &&
    id.signatureDataUrl.startsWith('data:image/')
  );
}

export function saveIdentity({ id = null, photoDataUrl = null, signatureDataUrl = null, signatureVector = null, photoServerUrl = null } = {}) {
  const existing = loadIdentity();
  const payload = {
    id: id || existing?.id || generateBadgeId(),
    photoDataUrl: photoDataUrl !== undefined ? photoDataUrl : (existing?.photoDataUrl || null),
    signatureDataUrl: signatureDataUrl !== undefined ? signatureDataUrl : (existing?.signatureDataUrl || null),
    signatureVector: signatureVector !== undefined ? signatureVector : (existing?.signatureVector || null),
    photoServerUrl: photoServerUrl !== undefined ? photoServerUrl : (existing?.photoServerUrl || null),
    createdAt: existing?.createdAt || formatStampDate(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[Identity] Storage penuh, simpan tanpa foto:', err);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, photoDataUrl: null }));
    } catch (_) {}
  }
  return payload;
}

export function updateIdentityPhoto(photoDataUrl) {
  const existing = loadIdentity() || {
    id: generateBadgeId(),
    signatureDataUrl: null,
    createdAt: formatStampDate(),
  };
  existing.photoDataUrl = photoDataUrl;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (_) {}
  return existing;
}

export function loadIdentity() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function clearIdentity() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

export function renderHudIdentityChip() {
  const chip = $('hud-player-chip');
  const img = $('hud-player-avatar');
  const idEl = $('hud-player-id');
  if (!chip || !img || !idEl) return;

  const identity = loadIdentity();
  if (!identity || !identity.photoDataUrl) {
    chip.classList.add('hidden');
    return;
  }
  img.src = identity.photoDataUrl;
  idEl.textContent = `#${identity.id}`;
  chip.classList.remove('hidden');
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line ? `${line} ${words[n]}` : words[n];
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line, x, cy);
      line = words[n];
      cy += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

export async function exportIdCardPng({ identity, win, rt, scores, accuracy, qrContainer }) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const info = STYLE_INFO[win] || STYLE_INFO.visual;
  const arch = ARCHETYPES[win] || ARCHETYPES.visual;
  const badgeId = identity?.id || generateBadgeId();
  const stampDate = identity?.createdAt || formatStampDate();

  // 1. Paper Cream Background + UNTAG Red Bottom Wave
  ctx.fillStyle = '#fff7f7';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(0, H - 190);
  ctx.quadraticCurveTo(W * 0.5, H - 250, W, H - 175);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, H - 190);
  ctx.quadraticCurveTo(W * 0.5, H - 250, W, H - 175);
  ctx.stroke();

  // 2. Main Pop-Zine ID Card Container
  const cx = 66;
  const cy = 62;
  const cw = W - 132;
  const ch = H - 148;

  // Hard brutalist offset shadow
  ctx.fillStyle = '#111113';
  roundRectPath(ctx, cx + 14, cy + 14, cw, ch, 36);
  ctx.fill();

  // White card body
  ctx.fillStyle = '#ffffff';
  roundRectPath(ctx, cx, cy, cw, ch, 36);
  ctx.fill();
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 6;
  ctx.stroke();

  // 3. Top Header Band (UNTAG Red)
  ctx.save();
  roundRectPath(ctx, cx, cy, cw, ch, 36);
  ctx.clip();
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx, cy, cw, 134);
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 134);
  ctx.lineTo(cx + cw, cy + 134);
  ctx.stroke();
  ctx.restore();

  const [logoImg, photoImg, sigImg] = await Promise.all([
    loadImage('assets/logo-untag-emblem.png').catch(() => loadImage('assets/logo-untag.png')),
    loadImage(identity?.photoDataUrl),
    loadImage(identity?.signatureDataUrl),
  ]);

  if (logoImg) {
    const sw = logoImg.naturalWidth || logoImg.width;
    const sh = logoImg.naturalHeight || logoImg.height;
    if (sw === sh) {
      ctx.drawImage(logoImg, cx + 34, cy + 25, 84, 84);
    } else {
      ctx.drawImage(logoImg, 160, 21, 320, 320, cx + 34, cy + 25, 84, 84);
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px "Archivo Black", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('COGNITIVE ID PASS', cx + 138, cy + 66);

  ctx.fillStyle = '#fde047';
  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillText('STROOP\'S PARADOX · UNTAG SURABAYA', cx + 138, cy + 102);

  // Serial Pill on top right
  const serialText = `#${badgeId}`;
  ctx.fillStyle = '#fde047';
  roundRectPath(ctx, cx + cw - 204, cy + 38, 170, 56, 28);
  ctx.fill();
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#111113';
  ctx.font = '800 24px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(serialText, cx + cw - 119, cy + 75);
  ctx.textAlign = 'left';

  // 4. Portrait Photo Frame (Left side)
  const px = cx + 44;
  const py = cy + 174;
  const pw = 360;
  const ph = 450;

  ctx.save();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate(-0.025);
  // Polaroid shadow + border
  ctx.fillStyle = '#111113';
  roundRectPath(ctx, -pw / 2 + 10, -ph / 2 + 10, pw, ph + 54, 22);
  ctx.fill();

  ctx.fillStyle = '#faf8f2';
  roundRectPath(ctx, -pw / 2, -ph / 2, pw, ph + 54, 22);
  ctx.fill();
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Inner photo rect
  ctx.save();
  roundRectPath(ctx, -pw / 2 + 14, -ph / 2 + 14, pw - 28, ph - 28, 14);
  ctx.clip();
  if (photoImg) {
    ctx.drawImage(photoImg, -pw / 2 + 14, -ph / 2 + 14, pw - 28, ph - 28);
  } else {
    ctx.fillStyle = '#e4e4e7';
    ctx.fillRect(-pw / 2 + 14, -ph / 2 + 14, pw - 28, ph - 28);
    ctx.fillStyle = '#52525b';
    ctx.font = '800 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TANPA FOTO', 0, 8);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Inner photo stroke
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 3;
  roundRectPath(ctx, -pw / 2 + 14, -ph / 2 + 14, pw - 28, ph - 28, 14);
  ctx.stroke();

  // Polaroid caption strip
  ctx.fillStyle = '#111113';
  ctx.font = '800 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`★ ${arch.stamp} ★`, 0, ph / 2 + 28);
  ctx.textAlign = 'left';
  ctx.restore();

  // 5. Right Column Info: Dominant Style + Archetype + Air Signature
  const rx = px + pw + 44;
  const rw = cw - (rx - cx) - 42;

  ctx.fillStyle = '#52525b';
  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillText('GAYA BELAJAR DOMINAN', rx, py + 34);

  // Big Headline (auto-fit maxWidth agar kata panjang seperti KINESTETIK tidak pernah terpotong)
  const titleFontSize = info.label.length >= 9 ? 54 : 68;
  ctx.font = `900 ${titleFontSize}px "Archivo Black", "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#111113';
  ctx.fillText(info.label, rx + 4, py + 108, rw);
  ctx.fillStyle = info.color;
  ctx.fillText(info.label, rx, py + 104, rw);
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 3;
  ctx.strokeText(info.label, rx, py + 104, rw);

  // Archetype Pill
  ctx.fillStyle = '#fde047';
  roundRectPath(ctx, rx, py + 130, Math.min(rw, 340), 48, 24);
  ctx.fill();
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = '#111113';
  ctx.font = '800 21px "JetBrains Mono", monospace';
  ctx.fillText(`⚡ ${arch.title}`, rx + 20, py + 162);

  // Tip box
  ctx.fillStyle = '#faf8f2';
  roundRectPath(ctx, rx, py + 202, rw, 124, 18);
  ctx.fill();
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = '#18181b';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  wrapText(ctx, info.tip, rx + 20, py + 240, rw - 40, 32);

  // Air Signature Box
  ctx.fillStyle = '#ffffff';
  roundRectPath(ctx, rx, py + 348, rw, 156, 18);
  ctx.fill();
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.fillStyle = '#71717a';
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText('TANDA TANGAN UDARA (AIR SIGNATURE)', rx + 18, py + 378);

  if (sigImg) {
    ctx.drawImage(sigImg, rx + 18, py + 384, rw - 36, 108);
  } else {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '700 18px "JetBrains Mono", monospace';
    ctx.fillText('Terverifikasi Kamera AI', rx + 18, py + 448);
  }

  // 6. Balanced Integration Score (BIS) Performance Bars
  const by = py + ph + 94;
  ctx.fillStyle = '#111113';
  ctx.font = '800 19px "JetBrains Mono", monospace';
  ctx.fillText('BALANCED INTEGRATION SCORE (KECEPATAN + AKURASI)', px, by);

  const keys = ['visual', 'auditori', 'kinestetik'];
  const minRt = Math.min(...keys.map((k) => Math.max(1, rt[k] || 500)));
  const barAreaW = cw - 300;

  keys.forEach((k, idx) => {
    const rowY = by + 34 + idx * 66;
    const s = STYLE_INFO[k];
    const val = rt[k] || 0;
    const sc = scores && scores[k] != null ? scores[k] : Math.round(Math.min(1, minRt / Math.max(val, 1)) * 100);
    const ac = accuracy && accuracy[k] != null ? ` · ${accuracy[k]}%` : '';
    const pct = Math.max(0.08, Math.min(1, sc / 100));

    ctx.fillStyle = k === win ? s.color : '#52525b';
    ctx.font = '800 22px "JetBrains Mono", monospace';
    ctx.fillText(`${k === win ? '▶ ' : ''}${s.label}`, px, rowY + 20);

    ctx.fillStyle = '#111113';
    ctx.textAlign = 'right';
    ctx.fillText(`${sc}/100 (${val}ms${ac})`, px + barAreaW, rowY + 20);
    ctx.textAlign = 'left';

    // Track
    ctx.fillStyle = '#e4e4e7';
    roundRectPath(ctx, px, rowY + 30, barAreaW, 20, 10);
    ctx.fill();
    ctx.strokeStyle = '#111113';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Fill
    ctx.fillStyle = s.color;
    roundRectPath(ctx, px, rowY + 30, Math.max(24, barAreaW * pct), 20, 10);
    ctx.fill();
  });

  // 7. Official Seal / Badge in Bottom Right of Card (Replaces QR)
  const sealSize = 186;
  const sx = cx + cw - sealSize - 42;
  const sy = by + 28;

  ctx.save();
  // Container box
  ctx.fillStyle = '#faf8f5';
  roundRectPath(ctx, sx - 12, sy - 12, sealSize + 24, sealSize + 24, 20);
  ctx.fill();
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Circular seal
  const centerX = sx + sealSize / 2;
  const centerY = sy + sealSize / 2 - 10;
  const radius = 62;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626'; // UNTAG Crimson Red
  ctx.fill();
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Dotted/solid gold inner ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 7, 0, Math.PI * 2);
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Typography inside seal
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DIES NATALIS', centerX, centerY - 24);

  ctx.font = '900 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#fef08a'; // Gold
  ctx.fillText('UNTAG', centerX, centerY - 2);

  ctx.font = '900 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SURABAYA', centerX, centerY + 16);

  ctx.font = '800 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#fef08a';
  ctx.fillText('★ 2026 ★', centerX, centerY + 34);

  // Seal caption below circle
  ctx.fillStyle = '#111113';
  ctx.font = '800 12px "JetBrains Mono", monospace';
  ctx.fillText('OFFICIAL CERTIFIED', centerX, sy + sealSize + 2);
  ctx.restore();

  // Footer meta inside card
  ctx.fillStyle = '#52525b';
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText(`TERBIT: ${stampDate} · LAB PSIKOLOGI KOGNITIF UNTAG SURABAYA`, px, cy + ch - 26);

  // Trigger download
  const link = document.createElement('a');
  link.download = `Stroop-ID-${badgeId}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

