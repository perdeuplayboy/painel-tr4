// Animações retrô desenhadas em canvas (originais, no espírito dos rádios de carro antigos).
// Cada uma recebe (ctx, largura, altura, segundos, cor) e desenha um quadro inteiro.
// A cor é a da música tocando ou o laranja do painel.

import { drone } from './lidar.js';
import { ceu, regiao, previsao, cardume, vida } from './cenas.js';
import { satelites, terremotos, terra, avioes } from './mundo.js';
import { chuva, vento, lua, ar } from './aovivo.js';
import { pipes, maze } from './retro3d.js';
import { loadJohnnyFiles, extraURL, extrasReady } from './store.js';

const TAU = Math.PI * 2;

// Equalizador de LEDs: barras "dançando" com picos que caem devagar
const peaks = [];
function equalizer(ctx, w, h, t, color) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const n = 26, gap = w * 0.008, bw = (w - gap * (n + 1)) / n;
  const rows = 16, seg = (h * 0.86) / rows;
  for (let i = 0; i < n; i++) {
    const f = i / n;
    let v = 0.55 + 0.22 * Math.sin(t * 2.3 + i * 0.6) + 0.16 * Math.sin(t * 5.1 + i * 1.9) +
      0.12 * Math.sin(t * 11.3 + i * 0.37) + 0.1 * Math.sin(t * 1.3 + i * 3.1);
    v = Math.max(0.05, Math.min(1, v * (1.1 - 0.4 * f)));        // graves mais altos
    const lit = Math.round(v * rows);
    peaks[i] = Math.max(lit, (peaks[i] ?? 0) - 0.15);
    const x = gap + i * (bw + gap);
    for (let s = 0; s < rows; s++) {
      const y = h - (s + 1) * seg - h * 0.05;
      ctx.globalAlpha = s < lit ? 1 : 0.08;
      ctx.fillStyle = s >= rows - 2 ? '#ff3b30' : s >= rows - 5 ? '#ffd60a' : color;
      ctx.fillRect(x, y, bw, seg * 0.72);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, h - Math.ceil(peaks[i]) * seg - h * 0.05 - seg * 0.3, bw, seg * 0.25);
  }
}

// Estrada retrô: sol listrado, montanhas e grade neon correndo
const ridge = Array.from({ length: 33 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1));
function road(ctx, w, h, t, color) {
  const hz = h * 0.52;
  let g = ctx.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#05030c'); g.addColorStop(1, '#2b0f3d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hz);

  const sr = h * 0.34, sx = w / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(sx, hz, sr, Math.PI, 0); ctx.clip();
  g = ctx.createLinearGradient(0, hz - sr, 0, hz);
  g.addColorStop(0, '#ffd34d'); g.addColorStop(1, '#ff3d7f');
  ctx.fillStyle = g;
  ctx.fillRect(sx - sr, hz - sr, 2 * sr, sr);
  ctx.fillStyle = '#2b0f3d';
  for (let k = 0; k < 6; k++) ctx.fillRect(sx - sr, hz - sr * (0.08 + k * 0.13), 2 * sr, sr * 0.014 * (6 - k));
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(0, hz);
  ridge.forEach((r, i) => ctx.lineTo(i / (ridge.length - 1) * w, hz - r * h * 0.13 * (Math.abs(i - 16) / 16 + 0.15)));
  ctx.lineTo(w, hz);
  ctx.fillStyle = '#12061d'; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;

  ctx.fillStyle = '#07030c';
  ctx.fillRect(0, hz, w, h - hz);
  ctx.strokeStyle = color; ctx.lineWidth = 1.3;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  const run = (t * 0.9) % 1;
  for (let k = 1; k < 16; k++) {                                  // linhas que vêm na sua direção
    const y = hz + (h - hz) / (k - run + 0.35);
    if (y > h) continue;
    ctx.globalAlpha = Math.min(1, (y - hz) / (h - hz) * 4);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let j = -14; j <= 14; j++) {                               // linhas que fogem para o horizonte
    ctx.beginPath(); ctx.moveTo(sx + j * w * 0.01, hz); ctx.lineTo(sx + j * w * 0.16, h); ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

// Hiperespaço: estrelas esticando a partir do centro
const stars = Array.from({ length: 220 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
let warpLast = 0;
function warp(ctx, w, h, t, color) {
  const dt = Math.min(0.1, Math.max(0, t - warpLast));
  warpLast = t;
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';                            // rastro curto
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, sc = w * 0.5;
  ctx.lineCap = 'round';
  stars.forEach((s, i) => {
    const z0 = s.z;
    s.z -= dt * (0.35 + 0.25 * Math.sin(t * 0.3) ** 2);
    const px = cx + s.x / s.z * sc * 0.25, py = cy + s.y / s.z * sc * 0.25;
    if (s.z <= 0.02 || px < 0 || px > w || py < 0 || py > h) {
      Object.assign(s, { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: 1 });
      return;
    }
    const qx = cx + s.x / z0 * sc * 0.25, qy = cy + s.y / z0 * sc * 0.25;
    ctx.strokeStyle = i % 4 ? '#fff' : color;
    ctx.globalAlpha = Math.min(1, (1 - s.z) * 1.5);
    ctx.lineWidth = (1 - s.z) * 3 + 0.5;
    ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

// Mapa topográfico: curvas de nível deslizando e um trajeto de GPS sendo desenhado
function topo(ctx, w, h, t, color) {
  ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, w, h);
  const off = t * w * 0.025;
  ctx.strokeStyle = '#121a24'; ctx.lineWidth = 1;
  for (let x = -(off % (w / 8)); x < w; x += w / 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = h / 4; y < h; y += h / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const span = w * 1.6;
  const peaks = [[0.1, 0.45, 1.0], [0.55, 0.3, 0.8], [0.95, 0.65, 1.2], [1.35, 0.4, 0.9]];
  ctx.strokeStyle = color;
  for (const [px, py, size] of peaks) {
    const x0 = ((px * w - off) % span + span) % span - w * 0.3, y0 = py * h;
    for (let i = 0; i < 8; i++) {
      const base = h * 0.06 * size * (i + 1);
      ctx.globalAlpha = 0.65 - i * 0.07;
      ctx.lineWidth = i % 4 === 3 ? 1.6 : 0.8;
      ctx.beginPath();
      for (let a = 0; a <= 48; a++) {
        const th = a / 48 * TAU;
        const r = base * (1 + 0.14 * Math.sin(3 * th + size * 5 + i * 0.4) + 0.08 * Math.sin(5 * th - i * 0.3 + t * 0.2));
        const x = x0 + Math.cos(th) * r * 1.4, y = y0 + Math.sin(th) * r;
        a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const head = (t * w * 0.08) % (w * 1.3);                          // trilha percorrida
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
  ctx.beginPath();
  for (let x = 0; x <= Math.min(head, w); x += 4) {
    const y = h * 0.55 + Math.sin(x * 0.012 + 1) * h * 0.18 + Math.sin(x * 0.031) * h * 0.06;
    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke(); ctx.setLineDash([]);
  if (head <= w) {
    const y = h * 0.55 + Math.sin(head * 0.012 + 1) * h * 0.18 + Math.sin(head * 0.031) * h * 0.06;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(head, y, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = color; ctx.globalAlpha = 0.5 * (1 - (t * 1.5 % 1));
    ctx.beginPath(); ctx.arc(head, y, 5 + (t * 1.5 % 1) * 14, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

// Osciloscópio: ondas brilhando numa tela de CRT
function scope(ctx, w, h, t, color) {
  ctx.fillStyle = '#020503'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#0d1a12'; ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, h); ctx.stroke(); }
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, i * h / 4); ctx.lineTo(w, i * h / 4); ctx.stroke(); }
  ctx.lineJoin = 'round';
  const wave = (f, ph, amp, lw, alpha, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.globalAlpha = alpha;
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const u = x / w * TAU;
      const y = h / 2 + amp * h * (0.55 * Math.sin(u * f + t * 2.2 + ph) + 0.3 * Math.sin(u * f * 2.7 - t * 3.9) + 0.15 * Math.sin(u * f * 6.1 + t * 7));
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  wave(1.5, 0, 0.32, 2.2, 1, color);
  wave(2.3, 2, 0.2, 1.4, 0.55, '#7dffb0');
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}

// Chuva de dados: código verde caindo, no estilo do filme. A cada ciclo a chuva vai desenhando o logo
// da CAD360 (mapa, alfinete e CAD360): cada caractere fica mais claro onde o logo é mais forte.
const GLYPHS = '0123456789ABCDEFZアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ';
const RAIN_CYCLE = 20;
const logoImg = Object.assign(new Image(), { src: 'img/cad360.webp' });
let rain$ = null, rainLast = Infinity;
function glyphAtlas(cw, fs, color, glow) {                          // caracteres pré-desenhados (espelhados)
  const c = Object.assign(document.createElement('canvas'), { width: Math.ceil(cw * GLYPHS.length), height: Math.ceil(fs * 1.25) });
  const g = c.getContext('2d');
  g.font = `${fs}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.shadowColor = glow; g.shadowBlur = fs * 0.35;
  [...GLYPHS].forEach((ch, i) => {
    g.save(); g.translate(i * cw + cw / 2, c.height / 2); g.scale(-1, 1); g.fillText(ch, 0, 0); g.restore();
  });
  return c;
}
function rainSetup(w, h) {
  const fs = Math.max(5, h / 52), cw = fs * 0.62, cols = Math.ceil(w / cw), rows = Math.ceil(h / fs);
  const logo = new Float32Array(cols * rows);
  if (logoImg.complete && logoImg.naturalWidth) {                   // logo deitado: ícone à esquerda, letras à direita
    const m = Object.assign(document.createElement('canvas'), { width: cols, height: rows }), g = m.getContext('2d');
    const sx = 1 / cw, sy = 1 / fs, H = h * 0.84, iconW = H * 575 / 520, textH = H * 0.46, textW = textH * 1125 / 200;
    const k = Math.min(1, w * 0.9 / (iconW + H * 0.12 + textW)), x0 = (w - (iconW + H * 0.12 + textW) * k) / 2;
    g.scale(sx, sy);
    g.drawImage(logoImg, 275, 5, 575, 520, x0, (h - H * k) / 2, iconW * k, H * k);
    g.drawImage(logoImg, 0, 614, 1125, 200, x0 + (iconW + H * 0.12) * k, (h - textH * k) / 2, textW * k, textH * k);   // só CAD360
    const px = g.getImageData(0, 0, cols, rows).data;
    for (let i = 0; i < cols * rows; i++) {
      const lum = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
      logo[i] = px[i * 4 + 3] / 255 * Math.min(1, Math.max(0, (1 - lum) * 1.4 - 0.1));
    }
  }
  rain$ = { w, h, fs, cw, cols, rows, logo, ready: logo.some(v => v > 0), shown: new Float32Array(cols * rows).fill(-1),
    heads: Array.from({ length: cols }, () => ({ y: Math.random() * rows, v: 6 + Math.random() * 10, len: 8 + Math.random() * 16 })),
    green: glyphAtlas(cw, fs, '#4dff7c', '#00ff55'), white: glyphAtlas(cw, fs, '#eafff0', '#9dffb4') };
}
function rain(ctx, w, h, t) {
  if (!rain$ || rain$.w !== w || rain$.h !== h || t < rainLast || (!rain$.ready && logoImg.complete && logoImg.naturalWidth)) rainSetup(w, h);
  const R = rain$, dt = Math.min(0.1, Math.max(0, t - rainLast));
  rainLast = t;
  const p = t % RAIN_CYCLE, forming = p > 2 && p < 10, melt = p > 17 ? (p - 17) / 2.5 : 0;
  if (p < 2) R.shown.fill(-1);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const gh = R.green.height, cw = R.cw;
  for (let i = 0; i < R.cols; i++) {
    const hd = R.heads[i];
    hd.y += hd.v * dt;
    if (hd.y - hd.len > R.rows) Object.assign(hd, { y: -Math.random() * 40, v: 6 + Math.random() * 10, len: 6 + Math.random() * 12 });
    const head = Math.floor(hd.y);
    for (let j = 0; j < R.rows; j++) {
      const c = j * R.cols + i, d = head - j;
      const trail = d >= 0 && d < hd.len ? 1 - d / hd.len : 0;
      if (forming && d === 0 && R.logo[c] > 0.05 && R.shown[c] < 0) R.shown[c] = t;   // a cabeça da coluna grava o logo
      if (p >= 10 && p < 17 && R.shown[c] < 0 && R.logo[c] > 0.05) R.shown[c] = t;      // completa o que faltou
      let logo = 0;
      if (R.shown[c] >= 0 && R.logo[c] > 0) {
        const gone = melt > 0 && melt > ((i * 7 + j * 3) % 11) / 11 + (R.rows - j) / R.rows * 0.3;   // escorre de baixo para cima
        if (!gone) logo = R.logo[c] * (0.75 + 0.25 * Math.sin(t * 2.3 + i * 0.7 + j * 1.3)) * Math.min(1, (t - R.shown[c]) * 4);
      }
      const b = Math.max(trail * trail * 0.38, logo);
      if (b < 0.04) continue;
      const atlas = d === 0 || (logo > 0 && t - R.shown[c] < 0.15) ? R.white : R.green;
      const g = (i * 13 + j * 7 + Math.floor(t * (logo > 0 ? 1.2 : 6) + i * 0.37)) % GLYPHS.length;
      ctx.globalAlpha = Math.min(1, b + trail * logo * 0.4);
      ctx.drawImage(atlas, g * cw, 0, cw, gh, i * cw, j * R.fs - (gh - R.fs) / 2, cw, gh);
    }
  }
  ctx.globalAlpha = 1;
}

// Oceano digital: mar de pontos visto da praia. O mar de fundo e as ondas são sorteados; as ondas
// chegam de frente ou na diagonal, de um lado ou do outro, e crescem perto da praia; algumas são gigantes.
let sea = null, seaLast = Infinity;
function ocean(ctx, w, h, t, color) {
  const R = Math.random;
  if (!sea || t < seaLast) {
    sea = { swell: Array.from({ length: 3 }, () => ({ a: 0.05 + R() * 0.1, k: 0.6 + R() * 1.2, dir: (R() - 0.5) * 0.5, sp: 1 + R() * 1.5, ph: R() * TAU })),
      waves: [], next: 0.3, giants: 0.1 + R() * 0.25 };
  }
  seaLast = t;
  while (sea.next <= t) {                                           // próxima onda da série
    const giant = R() < sea.giants;
    const th = (R() - 0.5) * 2.2, sn = Math.abs(Math.sin(th));       // direção sorteada: até ~60° para cada lado
    sea.waves.push({ t0: sea.next, A: giant ? 1 + R() * 0.6 : 0.2 + R() * 0.45, ph: R() * TAU, c: 1.4 + R() * 0.6,
      cos: Math.cos(th), sin: Math.sin(th), s0: 16 * Math.cos(th) + 44 * sn + 2, end: -44 * sn - 3 });
    sea.next += 2 + R() * 3.5 + (giant ? 2.5 : 0);
  }
  sea.waves = sea.waves.filter(v => v.s0 - v.c * (t - v.t0) > v.end);

  const wave = (X, z) => {
    let y = 0;
    for (const s of sea.swell) y += s.a * Math.sin(s.k * (z + X * s.dir) + s.sp * t + s.ph);
    for (const v of sea.waves) {
      // distância até a crista, medida na direção em que a onda anda (X é ~4x mais estreito que z na tela)
      const d = z * v.cos + X * 0.24 * v.sin - (v.s0 - v.c * (t - v.t0)) - 0.35 * Math.sin(X * 0.18 + v.ph);
      if (d < -3 || d > 4) continue;
      const grow = Math.min(1, Math.max(0, (15 - z) / 11));          // cresce chegando perto e some na areia
      const H = v.A * (1 + 0.8 * grow) * Math.min(1, Math.max(0, z / 1.5));
      y += H * (d < 0 ? Math.exp(-((d / 0.6) ** 2)) : Math.exp(-((d / 1.3) ** 2)));
    }
    return y;
  };

  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const hz = h * 0.3, rows = 90;
  const buckets = Array.from({ length: 8 }, () => []);               // 8 brilhos: desenha em lotes
  for (let r = rows; r >= 1; r--) {
    const z = 0.62 + r * 0.175, step = Math.max(0.26, z * 0.085), xmax = 11.5 * z;
    for (let X = -xmax; X <= xmax; X += step) {
      const Y = wave(X, z), x = w / 2 + X * w * 0.045 / z, y = hz + (1 - Y) * (h - hz) * 0.85 / z;
      if (x < -4 || x > w + 4 || y > h + 4 || y < -4) continue;
      const a = Math.min(1, 3.5 / z) * Math.min(1, 0.4 + Math.max(0, Y) * 0.6);
      const s = Math.max(1, h * 0.02 / z);
      buckets[Math.min(7, Math.floor(a * 8))].push(x - s / 2, y - s / 2, s);
    }
  }
  buckets.forEach((b, i) => {
    if (!b.length) return;
    ctx.fillStyle = color; ctx.globalAlpha = (i + 0.5) / 8;
    ctx.beginPath();
    for (let k = 0; k < b.length; k += 3) ctx.rect(b[k], b[k + 1], b[k + 2], b[k + 2]);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// Bússola giroscópica: o mostrador balança procurando a direção e, ao travar no Norte, pulsa
function compass(ctx, w, h, t, color) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = h * 0.43, rad = Math.PI / 180;
  const cycle = Math.floor(t / 9), p = t % 9;
  const A = 70 + 60 * Math.sin(cycle * 2.3);
  const env = A * Math.exp(-p * 0.75), hd = env * Math.cos(p * 2.6);
  const locked = env < 1.5;
  if (locked) {
    const q = (p % 1.3) / 1.3;
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = (1 - q) * 0.8;
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(cx, cy, R * (1 + q * 1.3), 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-hd * rad);
  ctx.strokeStyle = '#c9ced8';
  for (let d = 0; d < 360; d += 5) {
    const len = d % 30 === 0 ? R * 0.14 : d % 10 === 0 ? R * 0.09 : R * 0.05;
    ctx.lineWidth = d % 30 === 0 ? 2 : 1;
    ctx.save(); ctx.rotate(d * rad);
    ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(0, -R + len); ctx.stroke();
    ctx.restore();
  }
  ctx.font = `bold ${h * 0.09}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [d, label] of [[0, 'N'], [90, 'L'], [180, 'S'], [270, 'O']]) {
    ctx.fillStyle = d ? '#e6e9ef' : color;
    ctx.fillText(label, Math.sin(d * rad) * R * 0.7, -Math.cos(d * rad) * R * 0.7);
  }
  ctx.font = `${h * 0.05}px sans-serif`; ctx.fillStyle = '#8a8f98';
  for (let d = 30; d < 360; d += 30) if (d % 90) ctx.fillText(String(d), Math.sin(d * rad) * R * 0.72, -Math.cos(d * rad) * R * 0.72);
  ctx.restore();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.4 + hd * 0.5 * rad);   // anel interno ao contrário
  ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.setLineDash([4, 6]);
  ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.rotate(Math.sin(t * 0.7) * 8 * rad - t * 0.4);                 // horizonte do giroscópio
  ctx.beginPath(); ctx.moveTo(-R * 0.36, 0); ctx.lineTo(R * 0.36, 0); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;                                              // marca fixa no topo
  ctx.beginPath(); ctx.moveTo(cx, cy - R - 2); ctx.lineTo(cx - 7, cy - R - 14); ctx.lineTo(cx + 7, cy - R - 14); ctx.fill();
  ctx.font = `bold ${h * 0.14}px monospace`; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e6e9ef';
  ctx.fillText(`${String(locked ? 0 : Math.round(hd + 360) % 360).padStart(3, '0')}°`, w * 0.15, cy);
  ctx.font = `${h * 0.07}px sans-serif`;
  ctx.fillStyle = locked ? color : '#8a8f98';
  ctx.fillText(locked ? 'TRAVADO' : 'BUSCANDO…', w * 0.85, cy);
  ctx.textBaseline = 'alphabetic';
}

// Brilho ciano: vídeo retrô em loop (veio pronto, fica só no aparelho), desenhado no canvas como as outras animações
const glowVideo = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true });
extraURL('brilho-ciano.webm').then(url => { if (url) glowVideo.src = url; });   // vem dos "Arquivos extras" do aparelho
let glowStop = 0;
function glow(ctx, w, h) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (!extrasReady('glow')) {
    ctx.fillStyle = '#9a9aa2'; ctx.font = `${Math.max(12, h * 0.07)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('Escolha os Arquivos do painel TR4 nas configurações', w / 2, h / 2);
    return;
  }
  if (glowVideo.paused) glowVideo.play().catch(() => {});
  clearTimeout(glowStop);
  glowStop = setTimeout(() => glowVideo.pause(), 500);             // parou de desenhar: pausa o vídeo
  const vw = glowVideo.videoWidth, vh = glowVideo.videoHeight;
  if (!vw || glowVideo.readyState < 2) return;
  const s = Math.max(w / vw, h / vh);                               // preenche a faixa, cortando o que sobrar
  ctx.drawImage(glowVideo, (w - vw * s) / 2, (h - vh * s) / 2, vw * s, vh * s);
}

// Johnny Castaway: o protetor original rodando no motor Johnny Reborn (página johnny/ num iframe escondido).
// Os dados do original ficam só no aparelho; sem eles aparece um aviso.
let jFrame = null, jStop = 0, jScan = 0, jCrop = 180, jTarget = 180;
let jAudio = null, jSounds = null;
// a página do motor avisa qual efeito tocar; toca aqui, por cima da música (opção "Som do Johnny")
window.johnnySound = async nb => {
  if (localStorage.getItem('johnnySom') !== '1') return;
  try {
    jAudio ??= new AudioContext();
    if (jAudio.state === 'suspended') jAudio.resume().catch(() => {});
    jSounds ??= loadJohnnyFiles().then(async files => {
      const out = {};
      for (const [name, data] of Object.entries(files)) {
        const m = /^SOUND(\d+)\.WAV$/.exec(name);
        if (m) out[m[1]] = await jAudio.decodeAudioData(data.slice(0));
      }
      return out;
    });
    const buf = (await jSounds)[nb];
    if (!buf) return;
    const src = jAudio.createBufferSource();
    src.buffer = buf; src.connect(jAudio.destination); src.start();
  } catch {}
};
function johnny(ctx, w, h) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (!jFrame) {
    jFrame = Object.assign(document.createElement('iframe'), { src: 'johnny/index.html', tabIndex: -1 });
    jFrame.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:480px;opacity:0;pointer-events:none;border:0;z-index:-1';
    document.body.append(jFrame);
  }
  clearTimeout(jStop);
  jStop = setTimeout(() => { jFrame?.remove(); jFrame = null; }, 2000);   // saiu da tela: desliga o motor
  let src = null, missing = false;
  try { missing = jFrame.contentWindow.johnnyMissing; src = jFrame.contentDocument?.getElementById('canvas'); } catch {}
  if (missing) {
    ctx.fillStyle = '#9a9aa2'; ctx.font = `${Math.max(12, h * 0.07)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('Escolha os Arquivos do painel TR4 nas configurações', w / 2, h / 2);
    return;
  }
  if (!src?.width) return;
  const s = w / src.width, sh = h / s, now = performance.now();
  if (now - jScan > 1000) {                                          // a ilha muda de lugar entre as cenas: acha a areia
    jScan = now;
    try {
      const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
      let top = -1, bottom = -1;                                     // topo da copa (verde) e areia (amarelo)
      for (let y = 0; y < src.height; y += 3) {
        for (let x = 0; x < src.width; x += 6) {
          const i = (y * src.width + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
          if (top < 0 && g > 140 && r < 120 && b < 120) top = y;
          if (r > 190 && g > 160 && b < 140) bottom = y;
        }
      }
      if (top >= 0 && bottom > top) jTarget = bottom - top + 20 <= sh ? (top + bottom) / 2 - sh / 2 : top - 6;   // palmeira inteira
      else if (bottom > 0) jTarget = bottom + 12 - sh * 0.9;
    } catch {}
  }
  jCrop += (jTarget - jCrop) * 0.06;                                 // desliza suave
  const sy = Math.min(src.height - sh, Math.max(0, jCrop));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, sy, src.width, sh, 0, 0, w, h);
}

// Aventuras do Joni: a série fica só no aparelho (Arquivos do painel → offroad.js); aqui só o carregador
let joniMod = null, joniLoading = false;
function joni(ctx, w, h, t) {
  if (!joniMod) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    if (!joniLoading) { joniLoading = true; extraURL('offroad.js').then(u => u && import(u)).then(m => { joniMod = m || null; }).catch(() => {}).finally(() => { joniLoading = false; }); }
    return;
  }
  return joniMod.trilha(ctx, w, h, t);                                 // true quando a cena termina
}
joni.untilDone = true;

export const ANIMS = {
  equalizer, road, warp, topo, scope,
  pipes, maze, rain, ocean, drone, compass, glow, johnny, joni,
  ceu, regiao, previsao, cardume, vida, satelites, terremotos, terra, avioes,
  chuva, vento, lua, ar,
};
export const ANIM_NAMES = {
  equalizer: 'Equalizador', road: 'Estrada retrô', warp: 'Hiperespaço', topo: 'Mapa topográfico', scope: 'Osciloscópio',
  pipes: 'Canos 3D', maze: 'Labirinto de tijolos', rain: 'Chuva de dados', ocean: 'Oceano digital', drone: 'Escaneamento por drone',
  compass: 'Bússola giroscópica', glow: 'Brilho ciano', johnny: 'Johnny Castaway', joni: 'Aventuras do Joni',
  ceu: 'Céu de hoje', regiao: 'Relevo da região', previsao: 'Previsão do tempo', cardume: 'Cardume', vida: 'Jogo da Vida',
  satelites: 'Satélites sobre você', terremotos: 'Terremotos do mundo', terra: 'Terra dia e noite', avioes: 'Aviões passando agora',
  chuva: 'Radar de chuva', vento: 'Vento agora', lua: 'Lua de hoje', ar: 'Qualidade do ar',
};
