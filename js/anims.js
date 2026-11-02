// Animações retrô desenhadas em canvas (originais, no espírito dos rádios de carro antigos).
// Cada uma recebe (ctx, largura, altura, segundos, cor) e desenha um quadro inteiro.
// A cor é a da música tocando ou o laranja do painel.

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

  // carro: 100 unidades de comprimento, frente para a direita
  const s = h / 190, cx = w * 0.34, half = 34 * s;
  const yA = ground(cx - half), yB = ground(cx + half);
  const ang = Math.atan2(yB - yA, half * 2);
  ctx.save();
  ctx.translate(cx, (yA + yB) / 2 + Math.sin(t * 17) * 1.2 * s);
  ctx.rotate(ang);
  ctx.scale(s, s);
  ctx.translate(0, -12);

  ctx.fillStyle = color;                                           // farol
  ctx.globalAlpha = 0.12;
  ctx.beginPath(); ctx.moveTo(50, -26); ctx.lineTo(170, -50); ctx.lineTo(170, 6); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  for (let p = 0; p < 14; p++) {                                   // poeira
    const a = (t * 1.6 + p / 14) % 1;
    ctx.globalAlpha = (1 - a) * 0.3;
    ctx.fillStyle = '#9a8f80';
    ctx.beginPath(); ctx.arc(-46 - a * 70, 4 - a * 26 + Math.sin(p * 7.1) * 6, 4 + a * 12, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#000'; ctx.strokeStyle = color; ctx.lineWidth = 2 / s * 0.6;
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

  for (const wx of [-30, 32]) {                                     // rodas girando
    ctx.save();
    ctx.translate(wx, 0);
    ctx.rotate(t * 9);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    for (let r = 0; r < 5; r++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(r * TAU / 5) * 7, Math.sin(r * TAU / 5) * 7); }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export const ANIMS = { equalizer, road, trail };
