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

  const s = h / 190, cx = w * 0.34, half = 34 * s;
  const yA = ground(cx - half), yB = ground(cx + half);
  ctx.save();
  ctx.translate(cx, (yA + yB) / 2 + Math.sin(t * 17) * 1.2 * s);
  ctx.rotate(Math.atan2(yB - yA, half * 2));
  truck(ctx, t, color, s, '#9a8f80', 0.3);
  ctx.restore();
}

// 4x4 quadradão: 100 unidades de comprimento, frente para a direita, origem no chão entre as rodas
function truck(ctx, t, color, s, dust, dustAlpha) {
  ctx.save();
  ctx.scale(s, s);
  ctx.translate(0, -12);

  ctx.fillStyle = color;                                           // farol
  ctx.globalAlpha = 0.12;
  ctx.beginPath(); ctx.moveTo(50, -26); ctx.lineTo(170, -50); ctx.lineTo(170, 6); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

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

// Rali na terra: estrada com curvas em perspectiva (pseudo-3D) e pinheiros passando
function rally(ctx, w, h, t, color) {
  const hz = h * 0.42, speed = 12;
  const curve = 0.8 * Math.sin(t * 0.33) + 0.45 * Math.sin(t * 0.11 + 1);
  const bend = z => w / 2 + curve * w * 0.45 * Math.min(z / 40, 1) ** 2;
  const halfW = z => w * 0.75 / z;
  const g = ctx.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#060912'); g.addColorStop(1, '#1e2536');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, hz);
  ctx.fillStyle = color; ctx.globalAlpha = 0.25; ctx.fillRect(0, hz - h * 0.03, w, h * 0.03); ctx.globalAlpha = 1;
  ctx.fillStyle = '#0d111a';                                        // serra ao fundo, desliza com a curva
  ctx.beginPath(); ctx.moveTo(0, hz);
  for (let x = 0; x <= w; x += 6) {
    const X = x / w * 9 - curve * 1.5;
    ctx.lineTo(x, hz - h * (0.07 + 0.05 * Math.abs(Math.sin(X * 1.7)) + 0.03 * Math.sin(X * 4.1)));
  }
  ctx.lineTo(w, hz); ctx.fill();

  for (let y = h; y > hz + 1; y -= 2) {                            // chão linha a linha, de perto para longe
    const z = (h - hz) * 1.6 / (y - hz), c = bend(z), r = halfW(z);
    const band = Math.floor((z + t * speed) / 3) % 2;
    ctx.fillStyle = band ? '#16210f' : '#1b2813'; ctx.fillRect(0, y - 2, w, 2);
    ctx.fillStyle = band ? '#5b4631' : '#523f2c'; ctx.fillRect(c - r, y - 2, 2 * r, 2);
    ctx.fillStyle = band ? '#8a7357' : '#3b2e20'; ctx.fillRect(c - r - r * 0.08, y - 2, r * 0.08, 2); ctx.fillRect(c + r, y - 2, r * 0.08, 2);
  }

  const trees = [];
  for (let k = 0; k < 14; k++) {
    const z = k * 3 - ((t * speed) % 3) + 1.7;
    if (z > 1.6) for (const side of [-1, 1]) trees.push([z, side * (1.6 + (k * 7 % 5) * 0.25)]);
  }
  trees.sort((a, b) => b[0] - a[0]);
  for (const [z, off] of trees) {
    const y = hz + (h - hz) * 1.6 / z, x = bend(z) + off * halfW(z), th = h * 1.3 / z;
    if (y > h + th) continue;
    ctx.fillStyle = '#07100a'; ctx.strokeStyle = color; ctx.globalAlpha = 1; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - th); ctx.lineTo(x + th * 0.28, y - th * 0.15); ctx.lineTo(x - th * 0.28, y - th * 0.15); ctx.closePath();
    ctx.fill(); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillRect(x - th * 0.03, y - th * 0.16, th * 0.06, th * 0.16);
  }
}

// Dunas: 4x4 saltando as cristas ao pôr do sol, levantando areia
const dune = (x, seed, amp, base) =>
  base - amp * (0.75 * (1 - Math.abs(Math.sin(x * 0.0045 + seed))) ** 1.6 + 0.25 * Math.sin(x * 0.013 + seed * 2));
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
    { v: 90, seed: 5, amp: 40, base: 0.9, fill: '#120904' },
  ];
  let ground = null;
  for (const L of layers) {
    const off = t * L.v * k * 3;
    const y = x => dune((x + off) / k, L.seed, L.amp * k, h * L.base);
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

  const s = h / 200, cx = w * 0.36, half = 34 * s;
  const yA = ground(cx - half), yB = ground(cx + half);
  const jump = Math.max(0, Math.sin(t * 1.3)) ** 6;                // de tempos em tempos sai do chão
  ctx.save();
  ctx.translate(cx, (yA + yB) / 2 - jump * h * 0.16 + Math.sin(t * 19) * s);
  ctx.rotate(Math.atan2(yB - yA, half * 2) * (1 - jump) - 0.18 * jump * Math.cos(t * 1.3));
  truck(ctx, t, color, s, '#c9a26b', 0.45);
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

export const ANIMS = { equalizer, road, trail, night, rally, dunes, warp, topo, scope };
export const ANIM_NAMES = {
  equalizer: 'Equalizador', road: 'Estrada retrô', trail: 'Trilha', night: 'Estrada à noite', rally: 'Rali na terra',
  dunes: 'Dunas', warp: 'Hiperespaço', topo: 'Mapa topográfico', scope: 'Osciloscópio',
};
