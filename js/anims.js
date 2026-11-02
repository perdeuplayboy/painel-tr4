// Animações retrô desenhadas em canvas (originais, no espírito dos rádios de carro antigos).
// Cada uma recebe (ctx, largura, altura, segundos, cor) e desenha um quadro inteiro.
// A cor é a da música tocando ou o laranja do painel.

import { drone } from './lidar.js';

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

// Trilha: morros em camadas passando e um 4x4 subindo e descendo, levantando poeira
const hill = (x, seed, amp, base) =>
  base + amp * (0.6 * Math.sin(x * 0.004 + seed) + 0.3 * Math.sin(x * 0.011 + seed * 2) + 0.1 * Math.sin(x * 0.029 + seed * 3));
function trail(ctx, w, h, t, color) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#04060a'); g.addColorStop(1, '#1d2230');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(w * 0.82, h * 0.22, h * 0.07, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  const k = h / 220;                                               // escala: tudo proporcional à altura
  const layers = [
    { v: 12, seed: 1, amp: 34, base: 0.42, fill: '#202839' },
    { v: 35, seed: 4, amp: 28, base: 0.6, fill: '#141a26' },
    { v: 95, seed: 7, amp: 20, base: 0.86, fill: '#050608' },
  ];
  let ground = null;
  for (const L of layers) {
    const off = t * L.v * k * 3;
    const y = x => hill((x + off) / k, L.seed, L.amp * k, h * L.base);
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 4; x += 4) ctx.lineTo(x, y(x));
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = L.fill; ctx.fill();
    ground = y;
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
  ctx.beginPath();
  for (let x = 0; x <= w + 4; x += 4) x ? ctx.lineTo(x, ground(x)) : ctx.moveTo(x, ground(x));
  ctx.stroke(); ctx.globalAlpha = 1;

  const s = h / 190, cx = w * 0.34, half = 34 * s;
  const yA = ground(cx - half), yB = ground(cx + half);
  ctx.save();
  ctx.translate(cx, (yA + yB) / 2 + Math.sin(t * 17) * 1.2 * s);
  ctx.rotate(Math.atan2(yB - yA, half * 2));
  truck(ctx, t, color, s, '#9a8f80', 0.3);
  ctx.restore();
}

// 4x4 quadradão: 100 unidades de comprimento, frente para a direita, origem no chão entre as rodas.
// wheels: quanto cada roda (traseira, dianteira) desce ou sobe na suspensão, em unidades.
function truck(ctx, t, color, s, dust, dustAlpha, beam = true, wheels = [0, 0]) {
  ctx.save();
  ctx.scale(s, s);
  ctx.translate(0, -12);

  if (beam) {                                                      // farol
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.moveTo(50, -26); ctx.lineTo(170, -50); ctx.lineTo(170, 6); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (let p = 0; p < 14; p++) {                                   // poeira
    const a = (t * 1.6 + p / 14) % 1;
    ctx.globalAlpha = (1 - a) * dustAlpha;
    ctx.fillStyle = dust;
    ctx.beginPath(); ctx.arc(-46 - a * 70, 4 - a * 26 + Math.sin(p * 7.1) * 6, 4 + a * 12, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#000'; ctx.strokeStyle = color; ctx.lineWidth = 1.2 / s;
  ctx.beginPath();                                                  // carroceria quadradona
  ctx.moveTo(-50, -2); ctx.lineTo(-50, -30); ctx.lineTo(-28, -32); ctx.lineTo(-22, -54); ctx.lineTo(24, -54);
  ctx.lineTo(34, -34); ctx.lineTo(50, -31); ctx.lineTo(52, -2); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-24, -58); ctx.lineTo(22, -58); ctx.stroke();     // rack no teto
  ctx.globalAlpha = 0.35; ctx.fillStyle = color;                   // vidros
  ctx.beginPath(); ctx.moveTo(-18, -50); ctx.lineTo(-1, -50); ctx.lineTo(-1, -35); ctx.lineTo(-22, -34); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(3, -50); ctx.lineTo(21, -50); ctx.lineTo(29, -35); ctx.lineTo(3, -35); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(-55, -18, 9, 0, TAU); ctx.fill(); ctx.stroke();      // estepe

  [-30, 32].forEach((wx, i) => {                                    // rodas girando, com amortecedor
    ctx.beginPath(); ctx.moveTo(wx, -10); ctx.lineTo(wx, wheels[i]); ctx.stroke();
    ctx.save();
    ctx.translate(wx, wheels[i]);
    ctx.rotate(t * 9);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    for (let r = 0; r < 5; r++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(r * TAU / 5) * 7, Math.sin(r * TAU / 5) * 7); }
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
}

// Estrada à noite: postes passando, faixas tracejadas e as lanternas de um carro à frente
function night(ctx, w, h, t, color) {
  const hz = h * 0.45, cx = w / 2, run = t * 7;
  let g = ctx.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#02030a'); g.addColorStop(1, '#151a2b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, hz);
  ctx.fillStyle = color; ctx.globalAlpha = 0.18;                   // brilho da cidade no horizonte
  ctx.fillRect(0, hz - h * 0.05, w, h * 0.05);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#040406'; ctx.fillRect(0, hz, w, h - hz);
  const Y = z => hz + (h - hz) / z;                                // profundidade → altura na tela
  ctx.fillStyle = '#101114';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.006, hz); ctx.lineTo(cx + w * 0.006, hz); ctx.lineTo(cx + w * 0.8, h); ctx.lineTo(cx - w * 0.8, h);
  ctx.fill();

  ctx.fillStyle = '#d9d9d0';                                       // faixas: 2 divisórias de pista
  for (let k = 0; k < 14; k++) {
    const a = k * 3 - (run % 3) + 1, b = a + 1.3;
    if (a < 0.9) continue;
    for (const lane of [-0.27, 0.27]) {
      ctx.globalAlpha = Math.min(1, 6 / a);
      ctx.beginPath();
      ctx.moveTo(cx + (lane - 0.01) * w / a, Y(a)); ctx.lineTo(cx + (lane + 0.01) * w / a, Y(a));
      ctx.lineTo(cx + (lane + 0.01) * w / b, Y(b)); ctx.lineTo(cx + (lane - 0.01) * w / b, Y(b));
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  const lamps = [];
  for (let k = 0; k < 9; k++) {
    const z = k * 4 - (run % 4) + 1;
    if (z > 0.8) for (const side of [-1, 1]) lamps.push([z, side]);
  }
  lamps.sort((a, b) => b[0] - a[0]);                               // longe primeiro
  for (const [z, side] of lamps) {
    const x = cx + side * w * 0.95 / z, y = Y(z), ph = h * 1.1 / z;
    ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = Math.max(1, 6 / z);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - ph); ctx.lineTo(x - side * ph * 0.25, y - ph); ctx.stroke();
    const lx = x - side * ph * 0.25, ly = y - ph, r = h * 0.35 / z;
    const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    glow.addColorStop(0, 'rgba(255, 210, 140, .9)'); glow.addColorStop(1, 'rgba(255, 180, 90, 0)');
    ctx.fillStyle = glow; ctx.fillRect(lx - r, ly - r, 2 * r, 2 * r);
  }

  const z = 5 + Math.sin(t * 0.4) * 0.8, x = cx + w * 0.135 / z + Math.sin(t * 0.7) * w * 0.01, y = Y(z);
  const cw = w * 0.2 / z;
  ctx.fillStyle = '#000';
  ctx.fillRect(x - cw / 2, y - cw * 0.55, cw, cw * 0.5);
  for (const sx of [-0.38, 0.38]) {
    const tl = ctx.createRadialGradient(x + sx * cw, y - cw * 0.35, 0, x + sx * cw, y - cw * 0.35, cw * 0.3);
    tl.addColorStop(0, 'rgba(255, 40, 40, 1)'); tl.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = tl; ctx.fillRect(x + sx * cw - cw * 0.3, y - cw * 0.65, cw * 0.6, cw * 0.6);
  }
}

// Dunas: 4x4 saltando as cristas ao pôr do sol, levantando areia
const dune = (x, seed, amp, base) =>
  base - amp * (0.75 * (1 - Math.abs(Math.sin(x * 0.0045 + seed))) ** 1.6 + 0.25 * Math.sin(x * 0.013 + seed * 2));
const bumps = x => 9 * Math.sin(x * 0.035 + 1.3) + 6 * Math.sin(x * 0.07 + 0.4) + 1.5 * Math.sin(x * 0.15 + 2.1);   // costelas na areia
let dunesCar = null;                                                  // carroceria balançando na suspensão
function dunes(ctx, w, h, t, color) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0c0610'); g.addColorStop(0.6, '#4a2214'); g.addColorStop(1, '#7a3a1c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.7, h * 0.5, 0, w * 0.7, h * 0.5, h * 0.3);
  sun.addColorStop(0, '#ffd27a'); sun.addColorStop(0.4, '#ff9a3d'); sun.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);

  const k = h / 220;
  const layers = [
    { v: 10, seed: 0.5, amp: 40, base: 0.56, fill: '#3b200f' },
    { v: 30, seed: 2.5, amp: 46, base: 0.74, fill: '#26140a' },
    { v: 90, seed: 5, amp: 40, base: 0.88, fill: '#120904', rough: true },
  ];
  let ground = null;
  for (const L of layers) {
    const off = t * L.v * k * 3;
    const y = x => dune((x + off) / k, L.seed, L.amp * k, h * L.base) - (L.rough ? bumps((x + off) / k) * k : 0);
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 4; x += 4) ctx.lineTo(x, y(x));
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = L.fill; ctx.fill();
    ground = y;
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (let x = 0; x <= w + 4; x += 4) x ? ctx.lineTo(x, ground(x)) : ctx.moveTo(x, ground(x));
  ctx.stroke(); ctx.globalAlpha = 1;

  const s = h / 200, cx = w * 0.36, xA = cx - 30 * s, xB = cx + 32 * s;
  const yA = ground(xA), yB = ground(xB);
  let lift = 0;                                                      // na crista, o carro passa por cima dela
  for (let x = xA; x <= xB; x += 2) lift = Math.max(lift, yA + (yB - yA) * (x - xA) / (xB - xA) - ground(x));
  const ty = yA + (yB - yA) * (cx - xA) / (xB - xA) - lift, ta = Math.atan2(yB - yA, xB - xA);
  if (!dunesCar || t < dunesCar.t) dunesCar = { t, y: ty, vy: 0, a: ta, va: 0 };
  const c = dunesCar, dt = Math.min(0.05, t - c.t);                 // mola + amortecedor: a carroceria vai atrás das rodas
  c.t = t;
  for (let i = 0, d = dt / 4; i < 4; i++) {
    c.vy += ((ty - c.y) * 320 - c.vy * 22) * d; c.y += c.vy * d;
    c.va += ((ta - c.a) * 260 - c.va * 20) * d; c.a += c.va * d;
  }
  const wheel = (wx, gy) => Math.max(-12, Math.min(12, (gy - (c.y + Math.sin(c.a) * wx * s)) / s - 1));   // roda encosta no chão
  ctx.save();
  ctx.translate(cx, c.y);
  ctx.rotate(c.a);
  truck(ctx, t, color, s, '#c9a26b', 0.45, true, [wheel(-30, yA), wheel(32, yB)]);
  ctx.restore();
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

// Wireframe 3D: um toro de arame girando em perspectiva
function wire(ctx, w, h, t, color) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const U = 30, V = 14, ax = t * 0.5, ay = t * 0.33, az = t * 0.21;
  const pts = [];
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const u = i / U * TAU, v = j / V * TAU;
      const x = (1 + 0.42 * Math.cos(v)) * Math.cos(u), y = (1 + 0.42 * Math.cos(v)) * Math.sin(u), z = 0.42 * Math.sin(v);
      const y1 = y * Math.cos(ax) - z * Math.sin(ax), z1 = y * Math.sin(ax) + z * Math.cos(ax);
      const x2 = x * Math.cos(ay) + z1 * Math.sin(ay), z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
      const x3 = x2 * Math.cos(az) - y1 * Math.sin(az), y3 = x2 * Math.sin(az) + y1 * Math.cos(az);
      const d = 3.2 / (z2 + 4);
      pts.push([w / 2 + x3 * d * h * 0.27, h / 2 + y3 * d * h * 0.27, z2]);
    }
  }
  const P = (i, j) => pts[(i % U) * V + (j % V)];
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1);
      ctx.globalAlpha = Math.max(0.15, Math.min(1, 0.25 + 0.75 * (1 - (a[2] + 1.5) / 3)));   // perto mais forte
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
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
// chegam e crescem perto da praia, algumas pequenas e outras gigantes.
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
    sea.waves.push({ t0: sea.next, A: giant ? 1 + R() * 0.6 : 0.2 + R() * 0.45, ph: R() * TAU, c: 1.4 + R() * 0.6 });
    sea.next += 2.5 + R() * 3.5 + (giant ? 2.5 : 0);
  }
  sea.waves = sea.waves.filter(v => 15 - v.c * (t - v.t0) > -2);

  const wave = (X, z) => {
    let y = 0;
    for (const s of sea.swell) y += s.a * Math.sin(s.k * (z + X * s.dir) + s.sp * t + s.ph);
    for (const v of sea.waves) {
      const zc = 15 - v.c * (t - v.t0) + 0.35 * Math.sin(X * 0.18 + v.ph), d = z - zc;
      if (d < -3 || d > 4) continue;
      const grow = Math.min(1, Math.max(0, (15 - zc) / 11));         // cresce chegando perto e some na areia
      const H = v.A * (1 + 0.8 * grow) * Math.min(1, Math.max(0, zc / 1.5));
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

// Fita K7: rolos girando em velocidades diferentes, um enchendo e outro esvaziando
function cassette(ctx, w, h, t, color) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const W = Math.max(w * 0.86, h * 1.7), H = W / 1.6, x0 = (w - W) / 2, y0 = h * 0.5 - H * 0.38;   // close-up nos rolos
  ctx.fillStyle = '#16181d'; ctx.strokeStyle = '#2e323a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x0, y0, W, H, H * 0.06); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2e323a';
  for (const [sx, sy] of [[0.03, 0.05], [0.97, 0.05], [0.03, 0.93], [0.97, 0.93], [0.5, 0.93]]) {
    ctx.beginPath(); ctx.arc(x0 + W * sx, y0 + H * sy, H * 0.018, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#d9d2bf';                                        // etiqueta
  ctx.beginPath(); ctx.roundRect(x0 + W * 0.06, y0 + H * 0.08, W * 0.88, H * 0.58, H * 0.03); ctx.fill();
  ctx.fillStyle = color; ctx.fillRect(x0 + W * 0.06, y0 + H * 0.5, W * 0.88, H * 0.06);
  ctx.fillStyle = '#2a2a2a'; ctx.font = `bold ${H * 0.1}px sans-serif`; ctx.textAlign = 'left';
  ctx.fillText('A', x0 + W * 0.09, y0 + H * 0.2);
  ctx.strokeStyle = '#8a8478'; ctx.lineWidth = 1;
  for (const ly of [0.16, 0.24]) { ctx.beginPath(); ctx.moveTo(x0 + W * 0.17, y0 + H * ly); ctx.lineTo(x0 + W * 0.9, y0 + H * ly); ctx.stroke(); }
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.5;                 // "letra de mão" na etiqueta
  ctx.beginPath();
  for (let x = 0; x < W * 0.5; x += 3) ctx.lineTo(x0 + W * 0.2 + x, y0 + H * 0.145 + Math.sin(x * 0.5) * H * 0.012);
  ctx.stroke();

  const wx = x0 + W * 0.2, wy = y0 + H * 0.28, ww = W * 0.6, wh = H * 0.2;
  ctx.fillStyle = '#0a0b0e';
  ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, wh * 0.5); ctx.fill();
  const p = (t / 45) % 1, rMin = H * 0.07, rMax = H * 0.21;
  const rL = rMin + (rMax - rMin) * (1 - p), rR = rMin + (rMax - rMin) * p;
  const hubs = [[x0 + W * 0.31, rL], [x0 + W * 0.69, rR]], hy = wy + wh / 2;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, wh * 0.5); ctx.clip();
  for (const [hx, r] of hubs) { ctx.fillStyle = '#3b2a1c'; ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fill(); }
  const [[ax, ar], [bx, br]] = hubs;                                // fita passando de um rolo ao outro
  ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(ax, hy + ar); ctx.lineTo(bx, hy + br); ctx.stroke();
  ctx.strokeStyle = '#a07a54'; ctx.lineWidth = 2.5;
  const len = bx - ax;
  for (let s = (t * 60) % 16; s < len; s += 16) {
    const f = s / len;
    ctx.beginPath(); ctx.moveTo(ax + s, hy + ar + (br - ar) * f); ctx.lineTo(ax + s + 5, hy + ar + (br - ar) * (f + 5 / len)); ctx.stroke();
  }
  ctx.restore();
  for (const [hx, r] of hubs) {                                     // cubo branco com dentes girando
    const a = t * 18 * rMin / r;
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath(); ctx.arc(hx, hy, H * 0.055, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a0b0e';
    ctx.beginPath(); ctx.arc(hx, hy, H * 0.032, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8e4da';
    for (let q = 0; q < 6; q++) {
      const b = a + q * TAU / 6;
      ctx.fillRect(hx + Math.cos(b) * H * 0.028 - 1.5, hy + Math.sin(b) * H * 0.028 - 1.5, 3, 3);
    }
  }
  const ty = y0 + H * 0.86;                                         // fita correndo embaixo
  ctx.fillStyle = '#0a0b0e';
  ctx.beginPath(); ctx.moveTo(x0 + W * 0.18, y0 + H); ctx.lineTo(x0 + W * 0.24, y0 + H * 0.76);
  ctx.lineTo(x0 + W * 0.76, y0 + H * 0.76); ctx.lineTo(x0 + W * 0.82, y0 + H); ctx.fill();
  ctx.strokeStyle = '#5a3d26'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0 + W * 0.2, ty); ctx.lineTo(x0 + W * 0.8, ty); ctx.stroke();
  ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 2;
  for (let x = (t * 40) % 14; x < W * 0.6; x += 14) { ctx.beginPath(); ctx.moveTo(x0 + W * 0.2 + x, ty); ctx.lineTo(x0 + W * 0.2 + x + 4, ty); ctx.stroke(); }
  ctx.fillStyle = '#2e323a';
  for (const gx of [0.27, 0.5, 0.73]) ctx.fillRect(x0 + W * gx - 4, ty - 2, 8, 6);
}

// Golfinhos: dois golfinhos pixelados saltando sincronizados num mar de ondas vetoriais
const DOLPHIN = [
  '...........##.......',
  '..........###.......',
  '.....###########....',
  '...#############o##.',
  '#.#################.',
  '##.##############...',
  '#....#########......',
  '.......##...........',
];
let dolphinSprite = null, dolphinColor = '';
function dolphinImg(color) {
  if (dolphinSprite && dolphinColor === color) return dolphinSprite;
  const c = document.createElement('canvas');
  c.width = DOLPHIN[0].length; c.height = DOLPHIN.length;
  const g = c.getContext('2d');
  DOLPHIN.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = ch === 'o' ? '#fff' : color;
    g.fillRect(x, y, 1, 1);
  }));
  dolphinSprite = c; dolphinColor = color;
  return c;
}
function dolphins(ctx, w, h, t, color) {
  ctx.fillStyle = '#02040b'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(t + i));
    ctx.fillRect((i * 97) % w, (i * 53) % (h * 0.45), 2, 2);
  }
  ctx.globalAlpha = 1;
  const sea = h * 0.62;
  ctx.lineWidth = 1.5;
  for (let r = 0; r < 9; r++) {                                     // ondas vetoriais
    const y0 = sea + r * h * 0.045;
    ctx.strokeStyle = r % 2 ? '#1d6fa5' : color; ctx.globalAlpha = 0.9 - r * 0.08;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const y = y0 + Math.sin(x * 0.03 + t * 2 + r) * h * 0.012 + Math.sin(x * 0.011 - t * 1.3 + r * 2) * h * 0.01;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const img = dolphinImg(color), px = Math.max(2, Math.round(h / 55)), sw = img.width * px, shh = img.height * px;
  const period = 5;
  for (const [lag, dy] of [[0, 0], [0.035, h * 0.07]]) {             // dois, quase juntos
    const p = (t / period + lag) % 1;
    const x = -sw + p * (w + 2 * sw);
    const arc = Math.sin(p * TAU * 2);                               // dois saltos por travessia
    const y = sea + dy - Math.max(0, arc) * h * 0.38 + Math.max(0, -arc) * h * 0.08;
    const slope = -Math.cos(p * TAU * 2) * (arc > 0 ? 0.9 : 0.25);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = arc > -0.1 ? 1 : 0.35;                          // debaixo d'água fica apagado
    ctx.translate(x, y); ctx.rotate(slope);
    ctx.drawImage(img, -sw / 2, -shh / 2, sw, shh);
    ctx.restore();
    if (Math.abs(arc) < 0.12) {                                       // respingo ao entrar/sair da água
      ctx.fillStyle = '#cfe8ff';
      for (let q = 0; q < 8; q++) ctx.fillRect(x + (q - 4) * px * 1.5, sea + dy - Math.abs(Math.sin(q * 1.7 + t * 9)) * h * 0.08, px, px);
    }
  }
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

// Acampamento: jipe parado sob a árvore, fogueira de pixels e estrela cadente de vez em quando
const campStars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 0.618) % 1, y: ((i * 0.377) % 1) * 0.6, p: i * 1.7 }));
function camp(ctx, w, h, t, color) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#020309'); g.addColorStop(1, '#0e1424');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  for (const s of campStars) { ctx.globalAlpha = 0.3 + 0.6 * Math.abs(Math.sin(t * 1.3 + s.p)); ctx.fillRect(s.x * w, s.y * h, 1.5, 1.5); }
  const q = (t % 7) / 7;
  if (q < 0.12) {                                                     // estrela cadente
    const r = q / 0.12, n = Math.floor(t / 7);
    const sx = w * (0.1 + (n * 0.37) % 0.5), sy = h * 0.08;
    const hx = sx + r * w * 0.3, hy = sy + r * h * 0.22;
    const tr = ctx.createLinearGradient(hx - w * 0.08, hy - h * 0.06, hx, hy);
    tr.addColorStop(0, 'rgba(255,255,255,0)'); tr.addColorStop(1, 'rgba(255,255,255,.95)');
    ctx.strokeStyle = tr; ctx.lineWidth = 2; ctx.globalAlpha = 1 - r * 0.6;
    ctx.beginPath(); ctx.moveTo(hx - w * 0.08, hy - h * 0.06); ctx.lineTo(hx, hy); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const ground = x => h * 0.8 + Math.sin(x * 0.01) * h * 0.025;
  const fx = w * 0.34, fy = ground(fx);
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, h * 0.55);
  glow.addColorStop(0, `rgba(255, 140, 40, ${0.35 + 0.08 * Math.sin(t * 11)})`); glow.addColorStop(1, 'rgba(255, 120, 30, 0)');
  ctx.fillStyle = '#030405';
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w + 6; x += 6) ctx.lineTo(x, ground(x));
  ctx.lineTo(w, h); ctx.fill();
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  const tx = w * 0.8, ty = ground(tx);                                // árvore
  ctx.fillStyle = '#020203';
  ctx.fillRect(tx - h * 0.025, ty - h * 0.42, h * 0.05, h * 0.42);
  for (const [ox, oy, r] of [[0, -0.5, 0.17], [-0.13, -0.42, 0.13], [0.13, -0.43, 0.13], [-0.06, -0.62, 0.12], [0.08, -0.6, 0.12]]) {
    ctx.beginPath(); ctx.arc(tx + ox * h, ty + oy * h, r * h, 0, TAU); ctx.fill();
  }
  ctx.save(); ctx.translate(w * 0.62, ground(w * 0.62)); ctx.scale(-1, 1);   // jipe virado para a fogueira
  truck(ctx, 0, '#6b4423', h / 230, '#000', 0, false);
  ctx.restore();
  ctx.fillStyle = '#2a1608';                                          // lenha
  ctx.save(); ctx.translate(fx, fy - 2); ctx.rotate(0.3); ctx.fillRect(-h * 0.06, -2, h * 0.12, 4); ctx.rotate(-0.6); ctx.fillRect(-h * 0.06, -2, h * 0.12, 4); ctx.restore();
  const cell = Math.max(2, Math.round(h / 55));                       // chamas de pixels
  for (let gy = 0; gy < 11; gy++) {
    for (let gx = -4; gx <= 4; gx++) {
      const v = (1 - gy / 11) * (0.65 + 0.35 * Math.sin(t * 10 + gx * 1.7 + gy * 0.9)) - Math.abs(gx) / (5 - gy * 0.3);
      if (v < 0.12) continue;
      ctx.fillStyle = v > 0.6 ? '#fff3b0' : v > 0.35 ? '#ffb020' : '#ff5a1f';
      ctx.fillRect(fx + gx * cell - cell / 2, fy - 4 - (gy + 1) * cell, cell, cell);
    }
  }
  for (let i = 0; i < 10; i++) {                                      // faíscas subindo
    const a = (t * 0.7 + i / 10) % 1;
    ctx.fillStyle = '#ffb020'; ctx.globalAlpha = 1 - a;
    ctx.fillRect(fx + Math.sin(i * 3 + t * 2) * cell * 3 * a, fy - 4 - a * h * 0.45, cell * 0.6, cell * 0.6);
  }
  ctx.globalAlpha = 1;
}

export const ANIMS = {
  equalizer, road, trail, night, dunes, warp, topo, scope,
  wire, rain, ocean, drone, cassette, dolphins, compass, camp,
};
export const ANIM_NAMES = {
  equalizer: 'Equalizador', road: 'Estrada retrô', trail: 'Trilha', night: 'Estrada à noite',
  dunes: 'Dunas', warp: 'Hiperespaço', topo: 'Mapa topográfico', scope: 'Osciloscópio',
  wire: 'Wireframe 3D', rain: 'Chuva de dados', ocean: 'Oceano digital', drone: 'Escaneamento por drone',
  cassette: 'Fita K7', dolphins: 'Golfinhos',
  compass: 'Bússola giroscópica', camp: 'Acampamento',
};
