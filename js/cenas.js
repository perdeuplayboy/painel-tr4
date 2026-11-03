// Mais animações do standby, desenhadas em canvas 2D: céu de hoje, nível e areia, relevo da região,
// previsão do tempo, cardume e Jogo da Vida. Cada uma recebe (ctx, largura, altura, segundos, cor)
// e guarda o próprio estado; quando o tempo volta a zero, começa de novo.

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = p => (p = clamp(p), p * p * (3 - 2 * p));
const HUD = '#d8f6ff';
const load = (k, d) => { try { const v = localStorage.getItem('tr4.' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem('tr4.' + k, JSON.stringify(v)); } catch {} };
const here = () => { const p = load('lastPos', null); return p && Number.isFinite(p.lat) ? p : { lat: -23.55, lon: -46.63 }; };   // sem GPS ainda: São Paulo
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hudText(ctx, h, lines, x, y, align = 'left') {
  const fs = Math.max(10, h * 0.055);
  ctx.save(); ctx.font = `${fs}px monospace`; ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = HUD; ctx.globalAlpha = 0.85; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  lines.forEach((s, i) => ctx.fillText(s, x, y + i * fs * 1.3));
  ctx.restore();
}

// =====================================================================================
// CÉU DE HOJE: estrelas, constelações, Via Láctea, planetas e a Lua na fase certa, calculados pela hora e
// pelo lugar do carro. De dia mostra o céu das 21h30 de hoje. A vista gira de nordeste até oeste, do horizonte ao zênite.
// Estrelas: [ascensão reta (graus), declinação (graus), magnitude, cor opcional]
const ST = {
  sirius: [101.287, -16.716, -1.46], canopus: [95.988, -52.696, -0.74], acen: [219.90, -60.835, -0.27, '#ffe9c4'], arcturus: [213.915, 19.182, -0.05, '#ffd29a'],
  vega: [279.234, 38.784, 0.03], capella: [79.172, 45.998, 0.08, '#fff2c8'], rigel: [78.634, -8.202, 0.13, '#cfe0ff'], procyon: [114.825, 5.225, 0.34],
  achernar: [24.429, -57.237, 0.46, '#cfe0ff'], betelgeuse: [88.793, 7.407, 0.5, '#ffb070'], hadar: [210.956, -60.373, 0.61, '#cfe0ff'], altair: [297.696, 8.868, 0.77],
  acrux: [186.650, -63.099, 0.77, '#d6e4ff'], aldebaran: [68.980, 16.509, 0.85, '#ffbe80'], antares: [247.352, -26.432, 0.96, '#ff8a60'], spica: [201.298, -11.161, 0.97, '#cfe0ff'],
  pollux: [116.329, 28.026, 1.14, '#ffe0b0'], fomalhaut: [344.413, -29.622, 1.16], deneb: [310.358, 45.280, 1.25], mimosa: [191.930, -59.689, 1.25, '#cfe0ff'],
  regulus: [152.093, 11.967, 1.35], adhara: [104.656, -28.972, 1.5], castor: [113.650, 31.888, 1.58], gacrux: [187.791, -57.113, 1.63, '#ffb890'],
  shaula: [263.402, -37.104, 1.62], bellatrix: [81.283, 6.350, 1.64], elnath: [81.573, 28.608, 1.65], miaplacidus: [138.300, -69.717, 1.67],
  alnilam: [84.053, -1.202, 1.69], alnair: [332.058, -46.961, 1.73], alnitak: [85.190, -1.943, 1.77], mintaka: [83.002, -0.299, 2.23], saiph: [86.939, -9.670, 2.06],
  wezen: [107.098, -26.393, 1.83], kaus: [276.043, -34.385, 1.85], avior: [125.628, -59.510, 1.86], sargas: [264.330, -42.998, 1.87], atria: [252.166, -69.028, 1.91],
  alhena: [99.428, 16.399, 1.93], peacock: [306.412, -56.735, 1.94], mirzam: [95.675, -17.956, 1.98], alphard: [141.897, -8.659, 1.98], nunki: [283.816, -26.297, 2.05],
  menkent: [211.671, -36.370, 2.06], denebola: [177.265, 14.572, 2.13], muhlifain: [190.380, -48.960, 2.17], imai: [183.786, -58.749, 2.79], ecru: [185.340, -60.401, 3.59],
  dschubba: [240.083, -22.622, 2.29], pisco: [239.713, -26.114, 2.89], sigsco: [245.297, -25.593, 2.89], tausco: [248.971, -28.216, 2.82], epssco: [252.541, -34.293, 2.29],
  musco: [252.968, -38.047, 3.0], etasco: [258.038, -43.239, 3.33], kappasco: [265.622, -39.030, 2.41], acrab: [241.359, -19.805, 2.62], meissa: [83.784, 9.934, 3.39],
  aludra: [111.024, -29.303, 2.45], algieba: [154.993, 19.842, 2.08], zosma: [168.527, 20.524, 2.56], alcyone: [56.871, 24.105, 2.87],
  dubhe: [165.932, 61.751, 1.8], alioth: [193.507, 55.960, 1.77], alkaid: [206.885, 49.313, 1.86], polaris: [37.955, 89.264, 1.98],
};
const CONST = [
  ['Cruzeiro do Sul', [['acrux', 'gacrux'], ['mimosa', 'imai']]],
  ['Alfa e Beta do Centauro', [['acen', 'hadar']]],
  ['Escorpião', [['acrab', 'dschubba'], ['dschubba', 'pisco'], ['dschubba', 'sigsco'], ['sigsco', 'antares'], ['antares', 'tausco'], ['tausco', 'epssco'], ['epssco', 'musco'], ['musco', 'etasco'], ['etasco', 'sargas'], ['sargas', 'kappasco'], ['kappasco', 'shaula']]],
  ['Órion', [['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'], ['alnitak', 'alnilam'], ['alnilam', 'mintaka'], ['alnitak', 'saiph'], ['mintaka', 'rigel'], ['betelgeuse', 'meissa'], ['bellatrix', 'meissa']]],
  ['Cão Maior', [['sirius', 'mirzam'], ['sirius', 'wezen'], ['wezen', 'adhara'], ['wezen', 'aludra']]],
  ['Gêmeos', [['castor', 'pollux'], ['pollux', 'alhena']]],
  ['Leão', [['regulus', 'algieba'], ['algieba', 'zosma'], ['zosma', 'denebola']]],
  ['Triângulo de verão', [['vega', 'altair'], ['altair', 'deneb'], ['deneb', 'vega']]],
  ['Ursa Maior', [['dubhe', 'alioth'], ['alioth', 'alkaid']]],
];
// elementos orbitais aproximados (J2000 + taxa por século): a, e, I, L, longitude do periélio, longitude do nodo
const PLANETS = {
  'Mercúrio': [[0.38709927, 0.00000037], [0.20563593, 0.00001906], [7.00497902, -0.00594749], [252.2503235, 149472.67411175], [77.45779628, 0.16047689], [48.33076593, -0.12534081]],
  'Vênus': [[0.72333566, 0.0000039], [0.00677672, -0.00004107], [3.39467605, -0.0007889], [181.9790995, 58517.81538729], [131.60246718, 0.00268329], [76.67984255, -0.27769418]],
  'Terra': [[1.00000261, 0.00000562], [0.01671123, -0.00004392], [-0.00001531, -0.01294668], [100.46457166, 35999.37244981], [102.93768193, 0.32327364], [0, 0]],
  'Marte': [[1.52371034, 0.00001847], [0.0933941, 0.00007882], [1.84969142, -0.00813131], [-4.55343205, 19140.30268499], [-23.94362959, 0.44441088], [49.55953891, -0.29257343]],
  'Júpiter': [[5.202887, -0.00011607], [0.04838624, -0.00013253], [1.30439695, -0.00183714], [34.39644051, 3034.74612775], [14.72847983, 0.21252668], [100.47390909, 0.20469106]],
  'Saturno': [[9.53667594, -0.0012506], [0.05386179, -0.00050991], [2.48599187, 0.00193609], [49.95424423, 1222.49362201], [92.59887831, -0.41897216], [113.66242448, -0.28867794]],
};
const PCOL = { 'Mercúrio': '#e8dcc8', 'Vênus': '#fff6dc', 'Marte': '#ff9060', 'Júpiter': '#ffe8c0', 'Saturno': '#ffe0a0' };
function helio(el, T) {
  const [a, e, I, L, wp, O] = el.map(([v, r]) => v + r * T);
  const M = ((L - wp) % 360 + 540) % 360 - 180, w = wp - O;
  let E = M * RAD + e * Math.sin(M * RAD);
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M * RAD) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w * RAD), sw = Math.sin(w * RAD), cO = Math.cos(O * RAD), sO = Math.sin(O * RAD), cI = Math.cos(I * RAD), sI = Math.sin(I * RAD);
  return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, sw * sI * xp + cw * sI * yp];
}
const EPS = 23.43928 * RAD;
function eclToEq(x, y, z) { const ye = y * Math.cos(EPS) - z * Math.sin(EPS), ze = y * Math.sin(EPS) + z * Math.cos(EPS); return [((Math.atan2(ye, x) / RAD) + 360) % 360, Math.atan2(ze, Math.hypot(x, ye)) / RAD]; }
function skyAt(date, lat, lon) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0, T = d / 36525;
  const lst = ((280.46061837 + 360.98564736629 * d + lon) % 360 + 360) % 360, phi = lat * RAD;
  const altaz = (ra, dec) => {
    const H = (lst - ra) * RAD, de = dec * RAD;
    const alt = Math.asin(Math.sin(phi) * Math.sin(de) + Math.cos(phi) * Math.cos(de) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H) * Math.cos(de), Math.sin(de) * Math.cos(phi) - Math.cos(de) * Math.sin(phi) * Math.cos(H));
    return [((az / RAD) + 360) % 360, alt / RAD];
  };
  const earth = helio(PLANETS['Terra'], T), planets = [];
  for (const [name, el] of Object.entries(PLANETS)) {
    if (name === 'Terra') continue;
    const p = helio(el, T), [ra, dec] = eclToEq(p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]);
    planets.push([name, ...altaz(ra, dec)]);
  }
  const sunLon = Math.atan2(-earth[1], -earth[0]) / RAD, [sra, sdec] = eclToEq(-earth[0], -earth[1], -earth[2]);
  const Lm = 218.316 + 13.176396 * d, Mm = 134.963 + 13.064993 * d, Fm = 93.272 + 13.22935 * d;
  const mlon = Lm + 6.289 * Math.sin(Mm * RAD), mlat = 5.128 * Math.sin(Fm * RAD);
  const [mra, mdec] = eclToEq(Math.cos(mlat * RAD) * Math.cos(mlon * RAD), Math.cos(mlat * RAD) * Math.sin(mlon * RAD), Math.sin(mlat * RAD));
  const elong = ((mlon - sunLon) % 360 + 360) % 360;
  return { altaz, planets, sun: altaz(sra, sdec), moon: [...altaz(mra, mdec), elong] };
}
function galToEq(l, b) {
  const aN = 192.85948 * RAD, dN = 27.12825 * RAD, lN = 122.93192 * RAD, L = l * RAD, B = b * RAD;
  const sd = Math.sin(dN) * Math.sin(B) + Math.cos(dN) * Math.cos(B) * Math.cos(lN - L);
  const ra = aN + Math.atan2(Math.cos(B) * Math.sin(lN - L), Math.cos(dN) * Math.sin(B) - Math.sin(dN) * Math.cos(B) * Math.cos(lN - L));
  return [((ra / RAD) % 360 + 360) % 360, Math.asin(sd) / RAD];
}
const FAINT = (() => { const r = rng(7), a = []; for (let i = 0; i < 700; i++) a.push([r() * 360, Math.asin(r() * 2 - 1) / RAD, 3.6 + r() * 2.4, r()]); return a; })();
let SK = null;
export function ceu(ctx, w, h, t, color) {
  if (!SK || t < SK.last) {
    const p = here(), now = new Date();
    let date = now, label = 'AGORA';
    if (skyAt(now, p.lat, p.lon).sun[1] > -8) { date = new Date(now); date.setHours(21, 30, 0, 0); label = 'HOJE ÀS 21:30'; }   // de dia: o céu desta noite
    SK = { sky: skyAt(date, p.lat, p.lon), label, p, az0: 70 };
    SK.hills = Array.from({ length: 64 }, (_, i) => 0.5 + 0.5 * Math.sin(i * 0.7) * Math.cos(i * 0.23 + 1) + (rng(i + 3)() - 0.5) * 0.4);
  }
  SK.last = t;
  const { sky } = SK, fov = 150, hy = h * 0.86, k = w / fov, azC = SK.az0 + t * 8;   // gira de nordeste até oeste
  // panorâmica: o céu inteiro cabe na faixa, do horizonte ao zênite (o alto fica comprimido)
  const pos = (az, alt) => { const da = ((az - azC + 540) % 360) - 180; return [w / 2 + da * k, hy - (alt > 0 ? (hy - h * 0.03) * (alt / 90) ** 0.8 : alt * k)]; };
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#02040c'); g.addColorStop(0.75, '#060b1c'); g.addColorStop(1, '#0c1430');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let l = 0; l < 360; l += 3) {                                // Via Láctea: faixa difusa, mais forte perto do centro da galáxia
    const [ra, dec] = galToEq(l, 0), [az, alt] = sky.altaz(ra, dec);
    if (alt < -5) continue;
    const [x, y] = pos(az, alt), core = 0.35 + 0.65 * Math.exp(-((((l + 180) % 360 - 180) / 40) ** 2));
    const r = k * (6 + 5 * core), gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(150,165,220,${0.07 * core})`); gr.addColorStop(1, 'rgba(150,165,220,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (const [ra, dec, sz] of [[80.9, -69.75, 4], [13.2, -72.8, 2.6]]) {   // Nuvens de Magalhães
    const [az, alt] = sky.altaz(ra, dec); if (alt < 0) continue;
    const [x, y] = pos(az, alt), r = k * sz, gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(190,200,240,.16)'); gr.addColorStop(1, 'rgba(190,200,240,0)'); ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  const star = (az, alt, mag, col = '#ffffff', tw = 0) => {
    if (alt < -1) return;
    const [x, y] = pos(az, alt); if (x < -10 || x > w + 10 || y < -10) return;
    const ext = clamp(alt / 8, 0.15, 1), r = clamp(2.6 - mag * 0.5, 0.5, 3.4) * Math.max(1, h / 300);
    ctx.globalAlpha = ext * (0.8 + 0.2 * Math.sin(t * (2 + tw * 3) + tw * 40)) * clamp(1.2 - mag * 0.17, 0.25, 1);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (mag < 1.5) { ctx.globalAlpha *= 0.25; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill(); }
  };
  for (const [ra, dec, mag, tw] of FAINT) { const [az, alt] = sky.altaz(ra, dec); star(az, alt, mag, '#dfe6ff', tw); }
  for (const [ra, dec, mag, col] of Object.values(ST)) { const [az, alt] = sky.altaz(ra, dec); star(az, alt, mag, col, ra % 1); }
  ctx.globalAlpha = 1;
  // constelações se desenhando uma de cada vez
  const fs = Math.max(10, h * 0.05);
  ctx.font = `${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  CONST.forEach(([name, lines], i) => {
    const a = ease((t - 1 - i * 0.3) / 2) * 0.55; if (a <= 0) return;
    ctx.strokeStyle = color; ctx.globalAlpha = a; ctx.lineWidth = Math.max(1, h * 0.004); ctx.beginPath();
    let top = null;                                               // o nome vai na estrela mais alta que estiver à vista
    for (const [s1, s2] of lines) {
      const A = sky.altaz(ST[s1][0], ST[s1][1]), B = sky.altaz(ST[s2][0], ST[s2][1]);
      if (A[1] < 0 || B[1] < 0) continue;
      const [x1, y1] = pos(...A), [x2, y2] = pos(...B);
      if (Math.abs(x1 - x2) > w * 0.5) continue;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      for (const q of [[x1, y1], [x2, y2]]) if (!top || q[1] < top[1]) top = q;
    }
    ctx.stroke();
    if (top && top[0] > 0 && top[0] < w) { ctx.globalAlpha = a * 1.6; ctx.fillStyle = color; ctx.fillText(name, top[0], top[1] - fs * 0.6); }
  });
  ctx.globalAlpha = 1;
  for (const [name, az, alt] of sky.planets) {                     // planetas: ponto firme (não pisca) com o nome
    if (alt < 0) continue;
    const [x, y] = pos(az, alt); if (x < 0 || x > w) continue;
    ctx.fillStyle = PCOL[name]; ctx.beginPath(); ctx.arc(x, y, Math.max(2, h * 0.009), 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.font = `${fs * 0.9}px system-ui, sans-serif`; ctx.fillText(name, x, y - fs * 0.5); ctx.globalAlpha = 1;
  }
  const [maz, malt, el] = sky.moon;                                 // Lua com a parte iluminada certa
  if (malt > -2) {
    const [x, y] = pos(maz, malt), r = Math.max(6, h * 0.045), f = (1 - Math.cos(el * RAD)) / 2;
    const gl = ctx.createRadialGradient(x, y, r, x, y, r * 4); gl.addColorStop(0, `rgba(230,230,210,${0.2 * f})`); gl.addColorStop(1, 'rgba(230,230,210,0)');
    ctx.fillStyle = gl; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    ctx.fillStyle = '#1a1c22'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, y); if (SK.p.lat < 0) ctx.scale(-1, 1);   // no hemisfério sul a Lua crescente fica com a barriga para a esquerda
    const waxing = el < 180, sd = waxing ? 1 : -1;
    ctx.fillStyle = '#f1ecd8'; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, sd < 0);
    ctx.ellipse(0, 0, Math.abs(1 - 2 * f) * r, r, 0, Math.PI / 2, -Math.PI / 2, (f > 0.5) === (sd > 0)); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = '#020306'; ctx.beginPath(); ctx.moveTo(0, h);       // horizonte: morros e pinheiros em silhueta
  for (let i = 0; i <= 64; i++) { const x = i / 64 * w, v = SK.hills[(i + Math.floor(azC / 4) + 6400) % 64]; ctx.lineTo(x, hy - v * h * 0.05); }
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = HUD; ctx.globalAlpha = 0.7; ctx.font = `${fs * 0.85}px monospace`; ctx.textBaseline = 'top';
  for (const [n, az] of [['N', 0], ['NE', 45], ['L', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315]]) { const [x] = pos(az, 0); if (x > 0 && x < w) ctx.fillText(n, x, hy + h * 0.02); }
  ctx.globalAlpha = 1;
  hudText(ctx, h, [`CÉU ${SK.label}`, `${Math.abs(SK.p.lat).toFixed(1)}°${SK.p.lat < 0 ? 'S' : 'N'} ${Math.abs(SK.p.lon).toFixed(1)}°${SK.p.lon < 0 ? 'O' : 'L'}`], w * 0.11, h * 0.08);
}

// =====================================================================================
// NÍVEL E AREIA: a inclinação de verdade do carro (o mesmo sensor do inclinômetro). Dois níveis de bolha
// (lateral e frontal) e uma caixa de areia que escorre para o lado que o carro inclina.
const grav = { x: 0, y: 9.8, z: 0, ok: false };
addEventListener('devicemotion', e => {
  const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
  if (!grav.ok) Object.assign(grav, { x: g.x, y: g.y, z: g.z, ok: true });
  grav.x += (g.x - grav.x) * 0.1; grav.y += (g.y - grav.y) * 0.1; grav.z += (g.z - grav.z) * 0.1;
});
function carTilt(t) {
  if (!grav.ok) return { roll: 9 * Math.sin(t * 0.35), pitch: 5 * Math.sin(t * 0.27 + 1), sim: true };   // sem sensor (PC): balança sozinho
  const ang = screen.orientation?.angle ?? window.orientation ?? 0;
  let sx, sy;
  if (ang === 90) { sx = -grav.y; sy = grav.x; } else if (ang === 270 || ang === -90) { sx = grav.y; sy = -grav.x; } else { sx = grav.x; sy = grav.y; }
  const z = load('settings', {}).level || { roll: 0, pitch: 0 };
  return { roll: Math.atan2(sx, sy) / RAD - z.roll, pitch: Math.atan2(-grav.z, sy) / RAD - z.pitch };
}
let SA = null;
export function nivel(ctx, w, h, t, color) {
  const C = 120, R = 40;
  if (!SA || t < SA.last) {
    const g = new Uint8Array(C * R), r = rng(11);
    for (let y = Math.floor(R * 0.5); y < R; y++) for (let x = 0; x < C; x++) if (r() < 0.93) g[y * C + x] = 1 + Math.floor((y - R * 0.5) / 3) % 4;   // camadas de areia
    SA = { g, r, ang: 0, last: 0 };
  }
  const dt = clamp(t - SA.last, 0, 0.1); SA.last = t;
  const { roll, pitch, sim } = carTilt(t);
  SA.ang += (clamp(roll * 2.2, -70, 70) * RAD - SA.ang) * Math.min(1, dt * 3);   // a areia sente a inclinação lateral (aumentada)
  const gx = Math.sin(SA.ang), gy = Math.cos(SA.ang), G = SA.g, r = SA.r;
  const dirs = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
  const di = Math.round((Math.atan2(gx, gy) / (Math.PI / 4) + 8)) % 8;
  const free = (u, w2) => u >= 0 && u < C && w2 >= 0 && w2 < R && !G[w2 * C + u];
  for (let pass = 0; pass < 2; pass++) {
    const [dx, dy] = dirs[di], [ax, ay] = dirs[(di + 1) % 8], [bx, by] = dirs[(di + 7) % 8];
    const ys = dy >= 0 ? [R - 1, -1, -1] : [0, R, 1], xs = dx >= 0 ? [C - 1, -1, -1] : [0, C, 1];
    for (let y = ys[0]; y !== ys[1]; y += ys[2]) for (let x = xs[0]; x !== xs[1]; x += xs[2]) {
      const v = G[y * C + x]; if (!v) continue;
      let nx = x + dx, ny = y + dy;
      if (!free(nx, ny)) { const s = r() < 0.5; const [p1, q1] = s ? [ax, ay] : [bx, by], [p2, q2] = s ? [bx, by] : [ax, ay];
        if (free(x + p1, y + q1)) { nx = x + p1; ny = y + q1; } else if (free(x + p2, y + q2)) { nx = x + p2; ny = y + q2; } else continue; }
      G[ny * C + nx] = v; G[y * C + x] = 0;
    }
  }
  ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, w, h);
  const bx0 = w * 0.36, bw = w * 0.56, cs = bw / C, bh = cs * R, by0 = (h - bh) / 2;
  const sand = ['#000', '#c9a26b', '#b98a52', '#d8b47a', '#a8763f'];
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) { const v = G[y * C + x]; if (v) { ctx.fillStyle = sand[v]; ctx.fillRect(bx0 + x * cs, by0 + y * cs, cs + 0.5, cs + 0.5); } }
  ctx.strokeStyle = color; ctx.globalAlpha = 0.7; ctx.lineWidth = Math.max(1.5, h * 0.008); ctx.strokeRect(bx0 - 2, by0 - 2, bw + 4, bh + 4); ctx.globalAlpha = 1;
  const vial = (cy, ang, lab) => {                                  // nível de bolha: a bolha foge para o lado mais alto
    const vx = w * 0.06, vw = w * 0.24, vh = h * 0.16;
    ctx.fillStyle = '#0e1a12'; ctx.strokeStyle = '#7fb08a'; ctx.lineWidth = Math.max(1, h * 0.006);
    ctx.beginPath(); ctx.roundRect(vx, cy - vh / 2, vw, vh, vh / 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,255,210,.5)'; ctx.beginPath(); for (const o of [-0.09, 0.09]) { ctx.moveTo(vx + vw / 2 + o * vw, cy - vh * 0.4); ctx.lineTo(vx + vw / 2 + o * vw, cy + vh * 0.4); } ctx.stroke();
    const bxp = vx + vw / 2 + clamp(-ang / 15, -1, 1) * (vw / 2 - vh * 0.7);
    const gr = ctx.createRadialGradient(bxp - vh * 0.12, cy - vh * 0.12, 1, bxp, cy, vh * 0.42); gr.addColorStop(0, '#f6fff0'); gr.addColorStop(1, '#8fdc9c');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(bxp, cy, vh * 0.55, vh * 0.32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = HUD; ctx.font = `${h * 0.06}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${lab} ${Math.abs(ang).toFixed(1).replace('.', ',')}°`, vx, cy - vh * 0.65);
  };
  vial(h * 0.42, roll, 'LATERAL'); vial(h * 0.78, pitch, 'FRONTAL');
  if (sim) hudText(ctx, h, ['SIMULAÇÃO'], w * 0.06, h * 0.08);
}

// =====================================================================================
// SUA REGIÃO EM 3D: o relevo de verdade em volta do carro (mapas de elevação abertos da AWS, Terrarium),
// em linhas que escondem o que está atrás, girando devagar, com a posição do carro marcada.
// Precisa de internet uma vez por lugar; depois fica guardado. Sem dados, a animação termina na hora.
const RG = { grid: null, key: '', loading: false, failed: false, S: 64 };
function regionKey(p) { return `relevo.${p.lat.toFixed(2)},${p.lon.toFixed(2)}`; }
async function loadRegion(p) {
  RG.loading = true;
  try {
    const z = 12, n = 2 ** z, fx = (p.lon + 180) / 360 * n, la = p.lat * RAD;
    const fy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n, span = 1.1;   // ~11 km em volta
    const tx0 = Math.floor(fx - span / 2), ty0 = Math.floor(fy - span / 2), tx1 = Math.floor(fx + span / 2), ty1 = Math.floor(fy + span / 2);
    const cv = document.createElement('canvas'); cv.width = (tx1 - tx0 + 1) * 256; cv.height = (ty1 - ty0 + 1) * 256;
    const g = cv.getContext('2d', { willReadFrequently: true });
    await Promise.all([...Array((tx1 - tx0 + 1) * (ty1 - ty0 + 1)).keys()].map(i => new Promise((ok, bad) => {
      const tx = tx0 + i % (tx1 - tx0 + 1), ty = ty0 + Math.floor(i / (tx1 - tx0 + 1)), img = new Image();
      img.crossOrigin = 'anonymous'; img.onload = () => { g.drawImage(img, (tx - tx0) * 256, (ty - ty0) * 256); ok(); }; img.onerror = bad;
      img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`;
    })));
    const d = g.getImageData(0, 0, cv.width, cv.height).data, S = RG.S, H = new Int16Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const px = Math.round((fx - span / 2 + span * i / (S - 1) - tx0) * 256), py = Math.round((fy - span / 2 + span * j / (S - 1) - ty0) * 256), o = (py * cv.width + px) * 4;
      H[j * S + i] = Math.round(d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768);
    }
    RG.grid = H; RG.km = span * 40075 * Math.cos(la) / n;
    keep(regionKey(p), { h: Array.from(H), km: RG.km });
  } catch { RG.failed = true; }
  RG.loading = false;
}
let RS = null;
export function regiao(ctx, w, h, t, color) {
  const p = here(), key = regionKey(p);
  if (RG.key !== key) {
    RG.key = key; RG.failed = false; RG.grid = null;
    const c = load(key, null);
    if (c?.h?.length === RG.S * RG.S) { RG.grid = Int16Array.from(c.h); RG.km = c.km; } else if (navigator.onLine !== false) loadRegion(p); else RG.failed = true;
  }
  ctx.fillStyle = '#020407'; ctx.fillRect(0, 0, w, h);
  if (!RG.grid) {
    if (RG.failed || (!RG.loading && t > 1)) return true;          // sem dados e sem internet: passa para a próxima
    hudText(ctx, h, ['RELEVO · carregando…'], w / 2, h * 0.45, 'center');
    if (t > 12) return true;
    return;
  }
  if (!RS || t < RS.last) { let lo = 1e9, hi = -1e9; for (const v of RG.grid) { lo = Math.min(lo, v); hi = Math.max(hi, v); } RS = { lo, hi }; }
  RS.last = t;
  const S = RG.S, H = RG.grid, half = (S - 1) / 2, size = RG.km * 1000;
  const ex = clamp(size * 0.09 / Math.max(1, RS.hi - RS.lo), 2, 12);   // exagero do relevo: lugar plano também aparece
  const ang = t * 0.12 + 0.6, ca = Math.cos(ang), sa = Math.sin(ang), tiltK = 0.6, f = w * 0.55;
  const center = H[Math.round(half) * S + Math.round(half)];
  const proj = (i, j) => {                                         // malha em metros, girando em volta do carro, vista de cima em ângulo
    const x = (i - half) / (S - 1) * size, z = (j - half) / (S - 1) * size, y = (H[j * S + i] - center) * ex;
    const xr = x * ca - z * sa, zr = x * sa + z * ca, dist = size * 1.3 + zr * Math.cos(tiltK) - y * Math.sin(tiltK);
    const yv = y * Math.cos(tiltK) + zr * Math.sin(tiltK);           // o que está longe sobe na tela, como o chão visto do alto
    return [w / 2 + xr / dist * f, h * 0.5 - yv / dist * f, dist];
  };
  // linhas na direção mais de frente para a câmera, de trás para a frente, cada uma tampando o que está atrás
  const alongI = Math.abs(ca) > Math.abs(sa), order = [];
  for (let k = 0; k < S; k++) order.push(k);
  const depth = k => alongI ? proj(Math.round(half), k)[2] : proj(k, Math.round(half))[2];
  order.sort((a, b) => depth(b) - depth(a));
  const span = Math.max(1, RS.hi - RS.lo);
  for (const k of order) {
    const pts = []; for (let m = 0; m < S; m++) pts.push(alongI ? proj(m, k) : proj(k, m));
    ctx.beginPath(); ctx.moveTo(pts[0][0], h); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(pts[S - 1][0], h); ctx.closePath();
    ctx.fillStyle = '#020407'; ctx.fill();
    const fog = clamp(1.25 - pts[0][2] / (size * 1.6), 0.15, 1);
    ctx.beginPath(); pts.forEach(([x, y], m) => m ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    const hk = alongI ? H[k * S + Math.round(half)] : H[Math.round(half) * S + k];
    ctx.strokeStyle = color; ctx.globalAlpha = fog * (0.45 + 0.55 * (hk - RS.lo) / span); ctx.lineWidth = Math.max(1, h * 0.004); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const [cx, cy] = proj(Math.round(half), Math.round(half)), pr = (t * 0.8) % 1;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - h * 0.16); ctx.stroke();
  ctx.globalAlpha = 1 - pr; ctx.beginPath(); ctx.ellipse(cx, cy, h * 0.12 * pr, h * 0.04 * pr, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy - h * 0.16, h * 0.018, 0, TAU); ctx.fill();
  hudText(ctx, h, ['VOCÊ', `${center} m`], cx + h * 0.04, cy - h * 0.2);
  hudText(ctx, h, ['RELEVO DA REGIÃO', `${RG.km.toFixed(0)} km · ${RS.lo}–${RS.hi} m`], w * 0.11, h * 0.08);
}

// =====================================================================================
// PREVISÃO DO TEMPO: as próximas 12 horas em cena (Open-Meteo, o mesmo do painel): céu de cada hora,
// sol ou lua, nuvens pela cobertura, chuva pela chance, relâmpago em tempestade e a linha da temperatura.
const FC = { data: null, loading: false, at: 0 };
async function loadForecast() {
  const p = here(); FC.loading = true;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(2)}&longitude=${p.lon.toFixed(2)}` +
      '&hourly=temperature_2m,precipitation_probability,weather_code,cloud_cover,is_day&forecast_hours=13&timezone=auto';
    const j = await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json();
    const H = j.hourly;
    FC.data = H.time.map((tm, i) => ({ hour: +tm.slice(11, 13), temp: H.temperature_2m[i], rain: H.precipitation_probability[i] ?? 0, code: H.weather_code[i], cloud: H.cloud_cover[i], day: H.is_day[i] }));
    FC.at = Date.now(); keep('previsao', { at: FC.at, data: FC.data });
  } catch {}
  FC.loading = false;
}
let FS = null;
export function previsao(ctx, w, h, t, color) {
  if (!FC.data) { const c = load('previsao', null); if (c) { FC.data = c.data; FC.at = c.at; } }
  if ((!FC.data || Date.now() - FC.at > 30 * 60000) && !FC.loading && navigator.onLine !== false) loadForecast();
  ctx.fillStyle = '#03050a'; ctx.fillRect(0, 0, w, h);
  const ok = FC.data && Date.now() - FC.at < 6 * 3600000;
  if (!ok) { if (!FC.loading || t > 10) return true; hudText(ctx, h, ['PREVISÃO · carregando…'], w / 2, h * 0.45, 'center'); return; }
  if (!FS || t < FS.last) FS = { drops: Array.from({ length: 160 }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.8]), flash: 0 };
  const dt = clamp(t - (FS.last ?? t), 0, 0.1); FS.last = t;
  const D = FC.data.slice(0, 13), n = D.length, cw = w / n, top = h * 0.12, skyH = h * 0.5;
  D.forEach((o, i) => {                                            // céu de cada hora
    const x = i * cw, cl = o.cloud / 100, g = ctx.createLinearGradient(0, top, 0, top + skyH);
    const a = o.day ? [`rgb(${40 - 10 * cl},${90 - 20 * cl},${150 - 40 * cl})`, `rgb(${110 - 30 * cl},${150 - 40 * cl},${190 - 50 * cl})`] : ['#060a18', '#101a34'];
    g.addColorStop(0, a[0]); g.addColorStop(1, a[1]); ctx.fillStyle = g; ctx.fillRect(x, top, cw + 1, skyH);
    const cx = x + cw / 2, cy = top + skyH * 0.32;
    if (o.day && cl < 0.85) { ctx.fillStyle = '#ffd35a'; ctx.globalAlpha = 1 - cl * 0.8; ctx.beginPath(); ctx.arc(cx, cy, cw * 0.18, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    else if (!o.day && cl < 0.85) { ctx.fillStyle = '#e8e4d4'; ctx.globalAlpha = 0.9 - cl * 0.7; ctx.beginPath(); ctx.arc(cx, cy, cw * 0.13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#060a18'; ctx.beginPath(); ctx.arc(cx + cw * 0.06, cy - cw * 0.03, cw * 0.11, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    for (let k = 0; k < Math.round(cl * 4); k++) {                  // nuvens passando devagar
      const ox = ((k * 0.37 + t * 0.03 + i * 0.13) % 1) * cw, oy = top + skyH * (0.2 + 0.18 * (k % 3));
      ctx.fillStyle = o.day ? `rgba(235,240,248,${0.55 + cl * 0.3})` : `rgba(90,100,120,${0.5 + cl * 0.3})`;
      ctx.beginPath(); for (const [dx, dy, rr] of [[0, 0, 0.16], [0.13, -0.05, 0.13], [-0.13, -0.03, 0.12], [0.06, -0.1, 0.12]]) ctx.ellipse(x + ox + dx * cw, oy + dy * cw, rr * cw, rr * cw * 0.75, 0, 0, TAU); ctx.fill();
    }
    const storm = o.code >= 95, wet = o.rain >= 30 || (o.code >= 51 && o.code <= 82) || storm;
    if (wet) {                                                     // chuva: quantidade pela chance de chover
      ctx.strokeStyle = 'rgba(160,200,255,.75)'; ctx.lineWidth = Math.max(1, h * 0.003); ctx.beginPath();
      const nd = Math.round(FS.drops.length / n * clamp(o.rain / 100, 0.3, 1));
      for (let q = 0; q < nd; q++) { const dr = FS.drops[(q * n + i) % FS.drops.length]; dr[1] = (dr[1] + dt * dr[2] * 1.2) % 1;
        const dx = x + dr[0] * cw, dy = top + skyH * (0.35 + dr[1] * 0.65); ctx.moveTo(dx, dy); ctx.lineTo(dx - 2, dy + h * 0.03); }
      ctx.stroke();
    }
    if (storm && Math.random() < dt * 0.6) FS.flash = 1;
    if (storm && FS.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${FS.flash * 0.5})`; ctx.fillRect(x, top, cw, skyH); }
  });
  FS.flash = Math.max(0, FS.flash - dt * 4);
  ctx.strokeStyle = '#000'; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath();   // divisões das horas
  for (let i = 1; i < n; i++) { ctx.moveTo(i * cw, top); ctx.lineTo(i * cw, top + skyH); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.strokeRect(1, top, cw - 2, skyH);   // agora
  const temps = D.map(o => o.temp), lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1;
  const ty = v => top + skyH + h * 0.06 + (1 - (v - lo) / (hi - lo)) * h * 0.18;
  const prog = ease(t / 4);                                        // a linha da temperatura vai se desenhando
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, h * 0.007); ctx.beginPath();
  D.forEach((o, i) => { const x = i * cw + cw / 2; if (i / (n - 1) <= prog) i ? ctx.lineTo(x, ty(o.temp)) : ctx.moveTo(x, ty(o.temp)); }); ctx.stroke();
  const fs = Math.max(10, h * 0.05);
  ctx.font = `${fs}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = HUD;
  D.forEach((o, i) => {
    const x = i * cw + cw / 2;
    if (i / (n - 1) <= prog) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, ty(o.temp), Math.max(2, h * 0.008), 0, TAU); ctx.fill(); }
    ctx.fillStyle = HUD;
    if (i % 2 === 0 && i / (n - 1) <= prog) ctx.fillText(`${Math.round(o.temp)}°`, x, ty(o.temp) - fs * 0.3);
    ctx.textBaseline = 'top'; ctx.globalAlpha = 0.75; ctx.fillText(i ? `${String(o.hour).padStart(2, '0')}h` : 'agora', x, h * 0.9);
    if (o.rain >= 30) { ctx.fillStyle = '#9cc4ff'; ctx.fillText(`${o.rain}%`, x, top + skyH + h * 0.005); }
    ctx.globalAlpha = 1; ctx.textBaseline = 'bottom';
  });
  hudText(ctx, h, ['PRÓXIMAS 12 HORAS'], w * 0.5, h * 0.01, 'center');
}

// =====================================================================================
// CARDUME: peixes nadando juntos (cada um segue os vizinhos, sem trombar), luz entrando de cima, bolhas,
// algas no fundo; de vez em quando passa um peixe grande e o cardume se espalha.
let CD = null;
export function cardume(ctx, w, h, t, color) {
  if (!CD || t < CD.last || CD.w !== w) {
    const r = rng(5);
    CD = { w, last: t, fish: Array.from({ length: 80 }, () => ({ x: r() * w, y: h * (0.15 + r() * 0.6), vx: (r() - 0.5) * 40, vy: (r() - 0.5) * 20, s: 0.7 + r() * 0.6, ph: r() * 9 })),
      bub: Array.from({ length: 40 }, () => [r() * w, r() * h, 0.5 + r()]), big: null, nextBig: 6 + r() * 6, r };
  }
  const dt = clamp(t - CD.last, 0, 0.05); CD.last = t;
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b3a5c'); g.addColorStop(0.6, '#04203a'); g.addColorStop(1, '#020c18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {                                    // raios de luz
    const x = ((i * 0.19 + Math.sin(t * 0.1 + i) * 0.05) % 1) * w * 1.2 - w * 0.1, gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(120,200,255,.10)'); gr.addColorStop(1, 'rgba(120,200,255,0)'); ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w * 0.05, 0); ctx.lineTo(x + w * 0.16, h); ctx.lineTo(x + w * 0.09, h); ctx.fill();
  }
  ctx.restore();
  if (t > CD.nextBig && !CD.big) CD.big = { x: -w * 0.15, y: h * (0.3 + CD.r() * 0.4), dir: 1 };
  if (CD.big) { CD.big.x += dt * w * 0.12; if (CD.big.x > w * 1.2) { CD.big = null; CD.nextBig = t + 10 + CD.r() * 8; } }
  const F = CD.fish;
  for (const a of F) {                                             // separação, alinhamento e coesão com os vizinhos
    let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0;
    for (const b of F) { if (a === b) continue; const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 < (h * 0.25) ** 2) { cx += b.x; cy += b.y; ax += b.vx; ay += b.vy; n++; if (d2 < (h * 0.05) ** 2) { sx -= dx; sy -= dy; } } }
    if (n) { a.vx += ((cx / n - a.x) * 0.5 + (ax / n - a.vx) * 1.2 + sx * 6) * dt; a.vy += ((cy / n - a.y) * 0.5 + (ay / n - a.vy) * 1.2 + sy * 6) * dt; }
    if (CD.big) { const dx = a.x - CD.big.x, dy = a.y - CD.big.y, d = Math.hypot(dx, dy); if (d < h * 0.45) { a.vx += dx / d * 260 * dt; a.vy += dy / d * 260 * dt; } }   // foge do peixe grande
    if (a.y < h * 0.08) a.vy += 80 * dt; if (a.y > h * 0.8) a.vy -= 80 * dt;
    a.vx += (a.vx >= 0 ? 12 : -12) * dt;
    const sp = Math.hypot(a.vx, a.vy), mx = h * 0.6, mn = h * 0.15;
    if (sp > mx) { a.vx *= mx / sp; a.vy *= mx / sp; } else if (sp < mn) { a.vx *= mn / sp; a.vy *= mn / sp; }
    a.x += a.vx * dt; a.y += a.vy * dt;
    if (a.x < -h * 0.1) a.x = w + h * 0.08; if (a.x > w + h * 0.1) a.x = -h * 0.08;
  }
  for (const a of F) {
    const L = h * 0.05 * a.s, an = Math.atan2(a.vy, a.vx), wag = Math.sin(t * 12 + a.ph) * 0.35;
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(an);
    const gr = ctx.createLinearGradient(0, -L * 0.3, 0, L * 0.3); gr.addColorStop(0, '#d8eef8'); gr.addColorStop(1, '#5c8ca8');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.5, L * 0.18, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.4, 0); ctx.lineTo(-L * 0.75, -L * 0.2 + wag * L * 0.2); ctx.lineTo(-L * 0.75, L * 0.2 + wag * L * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#02101c'; ctx.beginPath(); ctx.arc(L * 0.3, -L * 0.03, L * 0.04, 0, TAU); ctx.fill();
    ctx.restore();
  }
  if (CD.big) {                                                    // peixe grande em silhueta
    const { x, y } = CD.big, L = h * 0.5;
    ctx.fillStyle = '#01070e'; ctx.beginPath(); ctx.ellipse(x, y, L * 0.5, L * 0.13, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - L * 0.42, y); ctx.lineTo(x - L * 0.68, y - L * 0.18 + Math.sin(t * 5) * L * 0.04); ctx.lineTo(x - L * 0.64, y + L * 0.16); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - L * 0.05, y - L * 0.1); ctx.lineTo(x - L * 0.15, y - L * 0.3); ctx.lineTo(x + L * 0.08, y - L * 0.1); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(200,235,255,.5)'; ctx.lineWidth = 1;
  for (const b of CD.bub) { b[1] -= dt * h * 0.12 * b[2]; b[0] += Math.sin(t * 2 + b[2] * 9) * 0.3; if (b[1] < -5) { b[1] = h + 5; b[0] = Math.random() * w; } ctx.beginPath(); ctx.arc(b[0], b[1], h * 0.008 * b[2], 0, TAU); ctx.stroke(); }
  ctx.fillStyle = '#020a12'; ctx.beginPath(); ctx.moveTo(0, h);   // fundo com algas
  for (let x = 0; x <= w; x += w / 40) ctx.lineTo(x, h * 0.93 - Math.sin(x * 0.02) * h * 0.03); ctx.lineTo(w, h); ctx.fill();
  ctx.strokeStyle = '#0d3a2a'; ctx.lineWidth = Math.max(2, h * 0.012); ctx.lineCap = 'round';
  for (let i = 0; i < 22; i++) { const x = (i + 0.5) / 22 * w, hh = h * (0.12 + 0.1 * ((i * 7) % 5) / 5); ctx.beginPath(); ctx.moveTo(x, h * 0.95);
    ctx.quadraticCurveTo(x + Math.sin(t * 1.3 + i) * h * 0.03, h * 0.95 - hh * 0.5, x + Math.sin(t * 1.1 + i * 2) * h * 0.05, h * 0.95 - hh); ctx.stroke(); }
}

// =====================================================================================
// JOGO DA VIDA: células nascem com 3 vizinhas e sobrevivem com 2 ou 3. Começa sorteado, de tempos em tempos
// chega um planador; quando a população para de mudar, recomeça. As células velhas ficam com a cor do painel.
let LF = null;
export function vida(ctx, w, h, t, color) {
  const cs = Math.max(4, h / 32), C = Math.floor(w / cs), R = Math.floor(h / cs);
  const seed = () => { const a = new Uint16Array(C * R), r = Math.random; for (let i = 0; i < a.length; i++) a[i] = r() < 0.3 ? 1 : 0; return a; };
  if (!LF || t < LF.last || LF.C !== C) LF = { C, R, a: seed(), fade: new Float32Array(C * R), step: 0, acc: 0, pops: [], last: t };
  const dt = clamp(t - LF.last, 0, 0.1); LF.last = t; LF.acc += dt;
  while (LF.acc > 0.11) {
    LF.acc -= 0.11; LF.step++;
    const a = LF.a, b = new Uint16Array(C * R); let pop = 0;
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += a[((y + dy + R) % R) * C + (x + dx + C) % C] ? 1 : 0;
      const i = y * C + x, age = a[i];
      if (age ? n === 2 || n === 3 : n === 3) { b[i] = Math.min(age + 1, 60); pop++; } else if (age) LF.fade[i] = 1;
    }
    if (LF.step % 45 === 0) {                                      // planador entrando por um canto
      const ox = Math.floor(Math.random() * C), oy = Math.floor(Math.random() * R);
      for (const [dx, dy] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) b[((oy + dy) % R) * C + (ox + dx) % C] = 1;
    }
    LF.pops.push(pop); if (LF.pops.length > 60) LF.pops.shift();
    const still = LF.pops.length === 60 && Math.max(...LF.pops) - Math.min(...LF.pops) < 6;
    LF.a = still || pop < C * R * 0.02 ? seed() : b;
    if (still) LF.pops = [];
  }
  ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, w, h);
  const ox = (w - C * cs) / 2, oy = (h - R * cs) / 2;
  for (let i = 0; i < C * R; i++) {
    const age = LF.a[i], x = ox + (i % C) * cs, y = oy + Math.floor(i / C) * cs;
    if (age) { ctx.fillStyle = age < 3 ? '#e8f6ff' : color; ctx.globalAlpha = age < 3 ? 1 : 0.55 + 0.45 * Math.min(1, age / 20); ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2); }
    else if (LF.fade[i] > 0.02) { ctx.fillStyle = color; ctx.globalAlpha = LF.fade[i] * 0.35; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2); LF.fade[i] *= 1 - dt * 3; }
  }
  ctx.globalAlpha = 1;
}
