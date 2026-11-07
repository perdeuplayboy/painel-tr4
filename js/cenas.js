// Mais animações do standby, desenhadas em canvas 2D: relevo da região, previsão do tempo, cardume e
// Jogo da Vida, mais as contas do céu (a cena do céu de hoje fica em js/ceu.js). Cada uma recebe (ctx, largura, altura, segundos, cor)
// e guarda o próprio estado; quando o tempo volta a zero, começa de novo.

const TAU = Math.PI * 2, RAD = Math.PI / 180;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = p => (p = clamp(p), p * p * (3 - 2 * p));
export const HUD = '#d8f6ff';
// TELA.relogio: a cena está no standby, com o relógio por cima no canto de baixo à direita (o texto não desce até lá)
export const TELA = { relogio: false, janela: null, canvas: null };
// Formato da janela da moldura (TELA.janela: pontos em mm da tela, e TELA.tela(): retângulo da tela e mm em px, do app).
// livre(x0, x1) diz, em px do canvas da cena, de que altura até que altura a faixa x0..x1 aparece pela moldura:
// nos cantos arredondados o texto desce o necessário em vez de sumir atrás da moldura.
let LV = { t: 0, r: null };
export function livre(x0, x1) {
  const J = TELA.janela, c = TELA.canvas;
  if (!J || !c || !TELA.tela) return [-1e9, 1e9];
  const now = performance.now();
  if (now - LV.t > 500 || LV.c !== c) { LV = { t: now, c, r: c.getBoundingClientRect(), T: TELA.tela() }; }
  const { r, T } = LV; if (!r.width || !T) return [-1e9, 1e9];
  let top = -1e9, bot = 1e9;
  for (let k = 0; k <= 6; k++) {
    const xm = (r.left + x0 + (x1 - x0) * k / 6 - T.left) / T.mm;   // em mm da tela
    let a = 1e9, b = -1e9;
    for (let i = 0; i < J.length; i++) {
      const [ax, ay] = J[i], [bx, by] = J[(i + 1) % J.length];
      if ((ax <= xm) === (bx <= xm) || ax === bx) continue;
      const y = ay + (by - ay) * (xm - ax) / (bx - ax); a = Math.min(a, y); b = Math.max(b, y);
    }
    if (a > b) continue;
    top = Math.max(top, (a * T.mm + T.top - r.top) + 2); bot = Math.min(bot, (b * T.mm + T.top - r.top) - 2);
  }
  if (TELA.relogio && TELA.relogioBox) {                             // standby: o relógio no canto de baixo à direita também ocupa lugar
    const b = LV.rb ??= TELA.relogioBox();
    if (b && b.width && r.left + x1 > b.left - 6 && r.left + x0 < b.right + 6) return [top, bot, { l: b.left - r.left - 8, t: b.top - r.top - 4 }];
  }
  return [top, bot, null];                                           // [livre em cima, livre embaixo, relógio no caminho (em px do canvas)]
}
// tamanho mínimo das letras de texto corrido, em fração da altura (lido de longe, no painel do carro)
export const LER = 0.088;
// nomes das cidades nos radares (chuva, vento e aviões): o mesmo tamanho em todos
export const CIDADE = 0.063;
export const SEM_CIDADE = new Set(['Guarará'].map(n => n.normalize()));   // cidades que não aparecem nos radares
export const load = (k, d) => { try { const v = localStorage.getItem('tr4.' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
export const keep = (k, v) => { try { localStorage.setItem('tr4.' + k, JSON.stringify(v)); } catch {} };
export const here = () => { const p = load('lastPos', null); return p && Number.isFinite(p.lat) ? p : { lat: -23.55, lon: -46.63, padrao: true }; };   // sem GPS ainda: centro de São Paulo
export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hudText(ctx, h, lines, x, y, align = 'left') {
  const fs = Math.max(10, h * 0.075);
  ctx.save(); ctx.font = `${fs}px monospace`; ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = HUD; ctx.globalAlpha = 0.85; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  let yy = y; const cw = ctx.canvas.width / (ctx.getTransform().a || 1), room = align === 'left' ? cw * 0.98 - x : align === 'right' ? x - cw * 0.02 : cw * 0.96;
  for (const s of lines) {
    ctx.font = `${fs}px monospace`; if (ctx.measureText(s).width > room) ctx.font = `${fs * room / ctx.measureText(s).width}px monospace`;
    const tw = ctx.measureText(s).width, x0 = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
    yy = Math.max(yy, livre(x0, x0 + tw)[0]); ctx.fillText(s, x, yy); yy += fs * 1.3;
  }
  ctx.restore();
}

// Coluna de texto para ler de longe: cada item [texto, opacidade, cor, tamanho (fração de h), peso ou 'mono', linhas no máximo, pode cortar].
// Só corta com reticências o item de 3 linhas ou mais, ou marcado como 'pode cortar'; nos outros, o encher diminui a letra.
// O item de 1 linha que não pode cortar encolhe só ele até caber na largura (as outras linhas continuam grandes).
// Diminui a letra até 85% para caber na largura; se ainda não couber, quebra em até `n` linhas e corta com reticências.
// Para em `fim` (o que não couber fica de fora). Devolve a altura onde parou. Com draw = false, só mede.
// s: escala de todas as letras. Depois de medir, coluna.cortou diz se algum item ficou de fora.
export function coluna(ctx, h, itens, x, y, tw, fim = h * 0.97, draw = true, s = 1, m = 1) {   // m: opacidade geral
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  coluna.cortou = false;
  for (const it of itens) {
    if (!it) continue;
    let [t, a = 0.85, cor = HUD, px = LER, peso = '', n = 2, corta = n >= 3] = it;
    let f = Math.max(9, h * px * s); const mono = peso === 'mono', fam = mono ? 'px monospace' : 'px system-ui, sans-serif';
    if (mono) peso = '';                                            // 'mono': título no estilo do hudText
    const f0 = f;
    const lay = W => {                                               // quebra o item na largura W
      f = f0; ctx.font = `${peso}${f}${fam}`; const lw = ctx.measureText(t).width;
      let L = [t];
      if (lw > W && (lw * 0.85 <= W || (n === 1 && !corta))) { f *= W / lw; ctx.font = `${peso}${f}${fam}`; }   // de uma linha só: encolhe só ela
      else if (lw > W) {
        L = []; let cur = '';
        for (const wd of t.split(' ')) { const tr = cur ? `${cur} ${wd}` : wd; if (cur && ctx.measureText(tr).width > W) { L.push(cur); cur = wd; } else cur = tr; }
        if (cur) L.push(cur);
        const mw = Math.max(...L.map(l => ctx.measureText(l).width));   // palavra sozinha mais larga que a coluna: diminui a letra
        if (mw > W) { f *= W / mw; ctx.font = `${peso}${f}${fam}`; }
        if (L.length > n) { cut = !corta; L = L.slice(0, n); let u = L[n - 1]; while (u.includes(' ') && ctx.measureText(u + '…').width > W) u = u.slice(0, u.lastIndexOf(' ')); L[n - 1] = u.replace(/[,;:·]\s*$/, '') + '…'; }
      }
      return L;
    };
    let cut = false, L = lay(tw);
    for (const l of L) { const [lt] = livre(x, x + ctx.measureText(l).width); if (y < lt) y = lt; break; }   // canto arredondado em cima
    const [, bot, rel] = livre(x, x + tw);
    if (rel && y + f * L.length * 1.22 > rel.t && rel.l - x > tw * 0.35) { cut = false; L = lay(rel.l - x); }   // desce ao lado do relógio do standby, mais estreito
    if (cut) coluna.cortou = true;
    const lim = Math.min(fim, bot);
    if (y + f * L.length * 1.22 > lim + f * 0.2) { coluna.cortou = true; break; }
    for (const l of L) { const lt = livre(x, x + ctx.measureText(l).width)[0]; if (y < lt) y = lt; if (draw) { ctx.globalAlpha = a * m; ctx.fillStyle = cor; ctx.fillText(l, x, y); } y += f * 1.22; }
    y += f * 0.12;
  }
  ctx.restore();
  return y;
}
// A mesma coluna, com as letras no maior tamanho em que tudo cabe até `fim` (aproveita a altura toda). Devolve a escala.
export function encher(ctx, h, itens, x, y, tw, fim, max = 1.9, draw = true, m = 1) {
  let s = max;
  for (; s > 0.7; s *= 0.95) { coluna(ctx, h, itens, x, y, tw, fim, false, s); if (!coluna.cortou) break; }
  if (draw) coluna(ctx, h, itens, x, y, tw, fim, true, s, m);
  return s;
}

// =====================================================================================
// ESTRELAS BRILHANTES E PLANETAS: posições no céu de um lugar e hora (usadas pelo céu de hoje, em js/ceu.js, e pelos satélites).
// Estrelas: [ascensão reta (graus), declinação (graus), magnitude, cor opcional]
export const ST = {
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
// elementos orbitais aproximados (J2000 + taxa por século): a, e, I, L, longitude do periélio, longitude do nodo
const PLANETS = {
  'Mercúrio': [[0.38709927, 0.00000037], [0.20563593, 0.00001906], [7.00497902, -0.00594749], [252.2503235, 149472.67411175], [77.45779628, 0.16047689], [48.33076593, -0.12534081]],
  'Vênus': [[0.72333566, 0.0000039], [0.00677672, -0.00004107], [3.39467605, -0.0007889], [181.9790995, 58517.81538729], [131.60246718, 0.00268329], [76.67984255, -0.27769418]],
  'Terra': [[1.00000261, 0.00000562], [0.01671123, -0.00004392], [-0.00001531, -0.01294668], [100.46457166, 35999.37244981], [102.93768193, 0.32327364], [0, 0]],
  'Marte': [[1.52371034, 0.00001847], [0.0933941, 0.00007882], [1.84969142, -0.00813131], [-4.55343205, 19140.30268499], [-23.94362959, 0.44441088], [49.55953891, -0.29257343]],
  'Júpiter': [[5.202887, -0.00011607], [0.04838624, -0.00013253], [1.30439695, -0.00183714], [34.39644051, 3034.74612775], [14.72847983, 0.21252668], [100.47390909, 0.20469106]],
  'Saturno': [[9.53667594, -0.0012506], [0.05386179, -0.00050991], [2.48599187, 0.00193609], [49.95424423, 1222.49362201], [92.59887831, -0.41897216], [113.66242448, -0.28867794]],
};
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
export function skyAt(date, lat, lon) {
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
export function galToEq(l, b) {                                 // coordenadas da galáxia para o céu
  const aN = 192.85948 * RAD, dN = 27.12825 * RAD, lN = 122.93192 * RAD, L = l * RAD, B = b * RAD;
  const sd = Math.sin(dN) * Math.sin(B) + Math.cos(dN) * Math.cos(B) * Math.cos(lN - L);
  const ra = aN + Math.atan2(Math.cos(B) * Math.sin(lN - L), Math.cos(dN) * Math.sin(B) - Math.sin(dN) * Math.cos(B) * Math.cos(lN - L));
  return [((ra / RAD) % 360 + 360) % 360, Math.asin(sd) / RAD];
}

// =====================================================================================
// SUA REGIÃO EM 3D: o relevo de verdade em volta do carro (mapas de elevação abertos da AWS, Terrarium),
// em linhas que escondem o que está atrás, girando devagar, com a posição do carro marcada.
// Precisa de internet uma vez por lugar; depois fica guardado. Sem dados, a animação termina na hora.
const RG = { grid: null, key: '', loading: false, failed: false, S: 64 };
function regionKey(p) { const r = v => (Math.round(v * 200) / 200).toFixed(3); return `relevo2.${r(p.lat)},${r(p.lon)}`; }   // um quadrado de 2 km a cada ~500 m andados
try {                                                               // os relevos de 10 km de antes e os muitos guardados de 2 km saem
  const ks = Object.keys(localStorage).filter(k => k.startsWith('tr4.relevo.') || k.startsWith('tr4.relevo2.'));
  for (const k of ks.filter(k => k.startsWith('tr4.relevo.'))) localStorage.removeItem(k);
  const novos = ks.filter(k => k.startsWith('tr4.relevo2.'));
  for (const k of novos.slice(0, Math.max(0, novos.length - 30))) localStorage.removeItem(k);   // fica só com os 30 últimos
} catch {}
async function loadRegion(p) {
  RG.loading = true;
  try {
    const z = 14, n = 2 ** z, fx = (p.lon + 180) / 360 * n, la = p.lat * RAD;
    const fy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n, span = 0.88;   // ~2 km em volta
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
    placeName(p);
  } catch { RG.failed = true; }
  RG.loading = false;
}
// nome do lugar (bairro e cidade) pelo OpenStreetMap, uma vez por lugar; fica guardado junto do relevo
async function placeName(p) {
  if (p.padrao || RG.asked === RG.key) return; RG.asked = RG.key;
  try {
    const q = `format=jsonv2&zoom=14&accept-language=pt-BR&lat=${p.lat.toFixed(4)}&lon=${p.lon.toFixed(4)}`;
    const a = (await (await fetch('https://nominatim.openstreetmap.org/reverse?' + q, { signal: AbortSignal.timeout(10000) })).json()).address || {};
    const parts = [a.suburb || a.neighbourhood || a.quarter || a.hamlet || a.village, a.city || a.town || a.municipality].filter(Boolean);
    RG.nome = [...new Set(parts)].join(', ') || null;
    const k = regionKey(p), c = load(k, null); if (c && RG.nome) keep(k, { ...c, nome: RG.nome });
  } catch {}
}
let RS = null;
function regiaoPrep() {                                            // também chamada antes de a cena entrar, para ela já abrir pronta
  const p = here(), key = regionKey(p);
  if (RG.key !== key) {
    RG.key = key; RG.failed = false; RG.grid = null; RG.nome = null;
    const c = load(key, null);
    if (c?.h?.length === RG.S * RG.S) { RG.grid = Int16Array.from(c.h); RG.km = c.km; RG.nome = c.nome || null; if (!RG.nome && navigator.onLine !== false) placeName(p); }
    else if (navigator.onLine !== false) loadRegion(p); else RG.failed = true;
  }
}
export function regiao(ctx, w, h, t, color) {
  const p = here(), key = regionKey(p);
  regiaoPrep();
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
  const ang = t * 0.1, ca = Math.cos(ang), sa = Math.sin(ang), tiltK = 0.6, f = Math.min(w * 0.6, h * 1.4);   // começa com o norte lá no fundo, como um mapa
  const center = H[Math.round(half) * S + Math.round(half)];
  const at = (x, z, y) => {                                        // x para o leste, z para o norte, y para cima (metros)
    const xr = x * ca - z * sa, zr = x * sa + z * ca, dist = size * 1.3 + zr * Math.cos(tiltK) - y * Math.sin(tiltK);
    const yv = y * Math.cos(tiltK) + zr * Math.sin(tiltK);           // o que está longe sobe na tela, como o chão visto do alto
    return [w * 0.6 + xr / dist * f, h * 0.45 - yv / dist * f, dist];   // à direita do texto do canto, onde sobra tela
  };
  // malha em metros, girando em volta do carro. A linha j=0 do mapa é a do norte.
  const proj = (i, j) => at((i - half) / (S - 1) * size, (half - j) / (S - 1) * size, (H[j * S + i] - center) * ex);
  // linhas na direção mais de frente para a câmera, de trás para a frente, cada uma tampando o que está atrás
  const alongI = Math.abs(ca) > Math.abs(sa), order = [];
  for (let k = 0; k < S; k++) order.push(k);
  const depth = k => alongI ? proj(Math.round(half), k)[2] : proj(k, Math.round(half))[2];
  order.sort((a, b) => depth(b) - depth(a));
  const span = Math.max(1, RS.hi - RS.lo), base = (i, j) => at((i - half) / (S - 1) * size, (half - j) / (S - 1) * size, (RS.lo - center) * ex);
  for (const k of order) {
    const pts = []; for (let m = 0; m < S; m++) pts.push(alongI ? proj(m, k) : proj(k, m));
    // tampa só até o pé da fatia (na altitude mais baixa): o que está atrás e mais baixo não passa daí, e pinta bem menos tela
    const [b0, b1] = alongI ? [base(0, k), base(S - 1, k)] : [base(k, 0), base(k, S - 1)];
    ctx.beginPath(); pts.forEach(([x, y], m) => m ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.lineTo(b1[0], b1[1] + 2); ctx.lineTo(b0[0], b0[1] + 2); ctx.closePath();
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
  hudText(ctx, h, [p.padrao ? 'CENTRO' : 'VOCÊ', `${center} m`], cx + h * 0.04, cy - h * 0.2);
  const fs = Math.max(11, h * 0.07);                               // pontos cardeais na beira do mapa
  ctx.save(); ctx.font = `bold ${fs}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  for (const [txt, x, z] of [['N', 0, 1], ['S', 0, -1], ['L', 1, 0], ['O', -1, 0]]) {
    const [px, py] = at(x * size * 0.58, z * size * 0.58, 0);
    ctx.fillStyle = txt === 'N' ? '#ff6a5a' : HUD; ctx.globalAlpha = txt === 'N' ? 1 : 0.8; ctx.fillText(txt, px, py);
  }
  ctx.restore();
  const lugar = p.padrao ? 'sem GPS: centro de São Paulo' : RG.nome || `${Math.abs(p.lat).toFixed(3)}°${p.lat < 0 ? 'S' : 'N'} ${Math.abs(p.lon).toFixed(3)}°${p.lon < 0 ? 'O' : 'L'}`;
  hudText(ctx, h, [lugar, `${RS.lo} a ${RS.hi} m`], w * 0.03, h * 0.04);
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
function previsaoPrep() {
  if (!FC.data) { const c = load('previsao', null); if (c) { FC.data = c.data; FC.at = c.at; } }
  if ((!FC.data || Date.now() - FC.at > 30 * 60000) && !FC.loading && navigator.onLine !== false) loadForecast();
}
export function previsao(ctx, w, h, t, color) {
  previsaoPrep();
  ctx.fillStyle = '#03050a'; ctx.fillRect(0, 0, w, h);
  const ok = FC.data && Date.now() - FC.at < 6 * 3600000;
  if (!ok) { if (!FC.loading || t > 10) return true; hudText(ctx, h, ['PREVISÃO · carregando…'], w / 2, h * 0.45, 'center'); return; }
  if (!FS || t < FS.last) FS = { drops: Array.from({ length: 160 }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.8]), flash: 0 };
  const dt = clamp(t - (FS.last ?? t), 0, 0.1); FS.last = t;
  const D = FC.data.slice(0, 13), n = D.length, mx = w * 0.04 /* a moldura come as bordas da tela */, cw = (w - 2 * mx) / n, top = h * 0.02, skyH = h * (TELA.relogio ? 0.36 : 0.5);   // no standby, embaixo fica livre para o relógio
  D.forEach((o, i) => {                                            // céu de cada hora
    const x = mx + i * cw, cl = o.cloud / 100, g = ctx.createLinearGradient(0, top, 0, top + skyH);
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
  for (let i = 1; i < n; i++) { ctx.moveTo(mx + i * cw, top); ctx.lineTo(mx + i * cw, top + skyH); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.strokeRect(mx + 1, top, cw - 2, skyH);   // agora
  const temps = D.map(o => o.temp), lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1;
  const base = top + skyH + h * 0.15, ty = v => base + (1 - (v - lo) / (hi - lo)) * h * 0.08;
  const prog = ease(t / 4);                                        // a linha da temperatura vai se desenhando
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, h * 0.007); ctx.beginPath();
  D.forEach((o, i) => { const x = mx + i * cw + cw / 2; if (i / (n - 1) <= prog) i ? ctx.lineTo(x, ty(o.temp)) : ctx.moveTo(x, ty(o.temp)); }); ctx.stroke();
  const fs = Math.max(10, h * 0.09), fr = Math.max(9, h * 0.06);
  ctx.font = `600 ${fs}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = HUD;
  D.forEach((o, i) => {
    const x = mx + i * cw + cw / 2;
    if (i / (n - 1) <= prog) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, ty(o.temp), Math.max(2, h * 0.008), 0, TAU); ctx.fill(); }
    ctx.fillStyle = HUD;
    if (i % 2 === 0 && i / (n - 1) <= prog) ctx.fillText(`${Math.round(o.temp)}°`, x, ty(o.temp) - fs * 0.3);
    ctx.textBaseline = 'top'; ctx.globalAlpha = 0.8;
    if (i % 2 === 0) ctx.fillText(i ? `${String(o.hour).padStart(2, '0')}h` : 'agora', i ? x : Math.max(x, mx + ctx.measureText('agora').width / 2 + 2), base + h * 0.14);
    if (o.rain >= 30) { ctx.save(); ctx.font = `${fr}px monospace`; ctx.fillStyle = '#9cc4ff'; ctx.fillText(`${o.rain}%`, x, top + skyH + h * 0.01); ctx.restore(); }
    ctx.globalAlpha = 1; ctx.textBaseline = 'bottom';
  });
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
// JOGO DA VIDA (Conway, 1970): cada quadradinho é uma célula. Ela nasce se tiver 3 vizinhas vivas e continua viva
// com 2 ou 3; com menos morre de solidão, com mais morre sufocada. Dessa regra só aparecem formas que andam,
// piscam e até fabricam outras. Cada rodada é sorteada: quase sempre um punhado de formas conhecidas (com o nome
// escrito no começo) em lugares e sentidos sorteados; às vezes manchas de células ao acaso. Quando tudo para,
// ou depois de um minuto, sorteia outra. As bordas não dão a volta: o que sai da tela some.
const LIFE = {
  canhao: { nome: 'canhão de planadores', rows: ['........................O', '......................O.O', '............OO......OO............OO',
    '...........O...O....OO............OO', 'OO........O.....O...OO', 'OO........O...O.OO....O.O', '..........O.....O.......O', '...........O...O', '............OO'] },
  semente: { nome: 'semente: vira caos', rows: ['.OO', 'OO.', '.O.'] },
  bolota: { nome: 'bolota: cresce muito', rows: ['.O.....', '...O...', 'OO..OOO'] },
  pulsar: { nome: 'pulsar', ext: 1, max: 1, rows: ['..OOO...OOO..', '', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..', '',
    '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '', '..OOO...OOO..'] },
  oscilador: { nome: 'oscilador', ext: 3, max: 1, rows: ['..O....O..', 'OO.OOOO.OO', '..O....O..'] },
  galaxia: { nome: 'galáxia', ext: 2, max: 1, rows: ['OOOOOO.OO', 'OOOOOO.OO', '.......OO', 'OO.....OO', 'OO.....OO', 'OO.....OO', 'OO.......', 'OO.OOOOOO', 'OO.OOOOOO'] },
  nave: { nome: 'nave', ext: 1, v: [-0.5, 0], rows: ['.O..O', 'O....', 'O...O', 'OOOO.'] },
  naveMedia: { nome: 'nave média', ext: 2, v: [-0.5, 0], rows: ['...O..', '.O...O', 'O.....', 'O....O', 'OOOOO.'] },
  naveGrande: { nome: 'nave grande', ext: 2, v: [-0.5, 0], rows: ['...OO..', '.O....O', 'O......', 'O.....O', 'OOOOOO.'] },
  planador: { nome: 'planador', v: [0.25, 0.25], rows: ['.O.', '..O', 'OOO'] },
  sapo: { nome: 'sapo', ext: 1, rows: ['.OOO', 'OOO.'] },
  farol: { nome: 'farol', rows: ['OO..', 'OO..', '..OO', '..OO'] },
};
const LIFE_EXTRAS = ['pulsar', 'pulsar', 'oscilador', 'oscilador', 'galaxia', 'galaxia', 'nave', 'nave', 'naveMedia', 'naveGrande', 'planador', 'planador', 'sapo', 'farol'];
function flipPat(rows, fx, fy) {
  const wd = Math.max(...rows.map(r => r.length));
  let r = rows.map(q => q.padEnd(wd, '.'));
  if (fx) r = r.map(q => [...q].reverse().join(''));
  return fy ? r.reverse() : r;
}
function lifeStart(L, t) {
  const { C, R } = L, a = new Uint8Array(C * R), occ = new Uint8Array(C * R), rnd = Math.random, items = [];
  const x0 = Math.round(C * 0.07), x1 = Math.round(C * 0.93), y0 = 3, y1 = R - 2;   // longe dos cantos arredondados da moldura
  const block = (x, y, bw, bh) => { for (let v = Math.max(0, y); v < Math.min(R, y + bh); v++) for (let u = Math.max(0, x); u < Math.min(C, x + bw); u++) occ[v * C + u] = 1; };
  const free = (x, y, bw, bh) => { for (let v = y; v < y + bh; v++) for (let u = x; u < x + bw; u++) if (u < 0 || v < 0 || u >= C || v >= R || occ[v * C + u]) return false; return true; };
  block(Math.round(C * 0.54), Math.round(R * 0.68), Math.round(C * 0.32), R);   // relógio e música ficam aqui
  const put = k => {
    const P = LIFE[k], e = P.ext || 0, m = e + 2, bw = Math.max(...P.rows.map(q => q.length)), bh = P.rows.length;
    for (let tries = 0; tries < 40; tries++) {
      const x = x0 + Math.floor(rnd() * Math.max(1, x1 - x0 - bw)), y = y0 + Math.floor(rnd() * Math.max(1, y1 - y0 - bh));
      if (!free(x - m, y - m, bw + 2 * m, bh + 2 * m)) continue;
      const cx = x + bw / 2, cy = y + bh / 2;
      // quem anda vai para o lado que tem mais espaço; o canhão atira para o lado mais largo
      const fx = k === 'canhao' ? cx > C / 2 : P.v ? (P.v[0] < 0 ? cx < C / 2 : cx > C / 2) : rnd() < 0.5;
      const fy = k === 'canhao' ? cy > R / 2 : P.v && P.v[1] ? cy > R / 2 : rnd() < 0.5;
      flipPat(P.rows, fx, fy).forEach((q, v) => { for (let u = 0; u < q.length; u++) if (q[u] === 'O') a[(y + v) * C + x + u] = 1; });
      block(x - m, y - m, bw + 2 * m, bh + 2 * m);
      items.push({ nome: P.nome, x, y, w: bw, h: bh, e, v: P.v ? [fx ? -P.v[0] : P.v[0], fy ? -P.v[1] : P.v[1]] : null });
      return true;
    }
    return false;
  };
  const formas = rnd() < 0.75;
  if (formas) {
    put(C >= 45 && rnd() < 0.6 ? 'canhao' : rnd() < 0.5 ? 'semente' : 'bolota');
    const used = {};
    for (let n = 3 + Math.floor(rnd() * 3), tries = 0; n > 0 && tries < 40; tries++) {
      const k = LIFE_EXTRAS[Math.floor(rnd() * LIFE_EXTRAS.length)];
      if (LIFE[k].max && used[k]) continue;
      if (put(k)) { used[k] = 1; n--; }
    }
  } else {                                                         // manchas de células ao acaso (ou a tela toda)
    const blobs = rnd() < 0.3 ? 0 : 1 + Math.floor(rnd() * 4);
    if (!blobs) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * C + x] = rnd() < 0.28 ? 1 : 0;
    for (let b = 0; b < blobs; b++) {
      const r0 = 3 + rnd() * 6, bx = x0 + r0 + rnd() * Math.max(1, x1 - x0 - 2 * r0), by = y0 + r0 + rnd() * Math.max(1, y1 - y0 - 2 * r0);
      for (let y = Math.floor(by - r0); y <= by + r0; y++) for (let x = Math.floor(bx - r0); x <= bx + r0; x++)
        if (x >= 0 && y >= 0 && x < C && y < R && (x - bx) ** 2 + (y - by) ** 2 < r0 * r0 && rnd() < 0.4) a[y * C + x] = 1;
    }
  }
  Object.assign(L, { a, gen: 0, pops: [], since: t, formas, items });
}
let LF = null;
export function vida(ctx, w, h, t, color) {
  const cs = Math.max(4, h / 30), C = Math.floor(w / cs), R = Math.floor(h / cs);
  if (!LF || t < LF.last || LF.C !== C || LF.R !== R) { LF = { C, R, fade: new Float32Array(C * R), acc: 0, last: t }; lifeStart(LF, t); }
  const dt = clamp(t - LF.last, 0, 0.1); LF.last = t; LF.acc += dt;
  while (LF.acc > 0.1) {
    LF.acc -= 0.1; LF.gen++;
    const a = LF.a, b = new Uint8Array(C * R); let pop = 0;
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= R) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if ((dx || dy) && xx >= 0 && xx < C && a[yy * C + xx]) n++; }
      }
      const i = y * C + x, age = a[i];
      if (age ? n === 2 || n === 3 : n === 3) { b[i] = Math.min(age + 1, 250); pop++; } else if (age) LF.fade[i] = 1;
    }
    LF.a = b;
    LF.pops.push(pop); if (LF.pops.length > 80) LF.pops.shift();
    const still = LF.pops.length === 80 && Math.max(...LF.pops) - Math.min(...LF.pops) < 6;
    if (still || pop < 4 || t - LF.since > 60) lifeStart(LF, t);
  }
  ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, w, h);
  const ox = (w - C * cs) / 2, oy = (h - R * cs) / 2, g = Math.max(1, cs * 0.1), sz = cs - 2 * g;
  ctx.fillStyle = color;                                           // rastro de quem acabou de morrer
  for (let i = 0; i < C * R; i++) {
    if (LF.a[i]) { LF.fade[i] = 0; continue; }
    if (LF.fade[i] < 0.03) continue;
    ctx.globalAlpha = LF.fade[i] * 0.3; ctx.fillRect(ox + (i % C) * cs + g, oy + ((i / C) | 0) * cs + g, sz, sz); LF.fade[i] *= 1 - dt * 2.5;
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < C * R; i++) {                                // vivas: recém-nascidas mais claras
    const age = LF.a[i]; if (!age) continue;
    ctx.fillStyle = age === 1 ? '#ffffff' : HUD; ctx.fillRect(ox + (i % C) * cs + g, oy + ((i / C) | 0) * cs + g, sz, sz);
  }
  const shown = t - LF.since, la = clamp((12 - shown) / 3);
  if (la > 0 && LF.formas) {                                       // nomes das formas nos primeiros segundos
    const fs = Math.max(9, h * 0.045);
    ctx.save(); ctx.fillStyle = color; ctx.font = `${fs}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    for (const it of LF.items) {
      const mv = it.v ? clamp((8.5 - shown) / 1.5) : 1; if (mv <= 0) continue;   // quem anda: o nome some antes de trombar
      const gx = it.v ? it.v[0] * LF.gen : 0, gy = it.v ? it.v[1] * LF.gen : 0;
      let ly = it.y - it.e - 1.6; if (ly < 3) ly = it.y + it.h + it.e + 0.3;
      ctx.globalAlpha = la * 0.9 * mv; ctx.fillText(it.nome, ox + (it.x + it.w / 2 + gx) * cs, oy + (ly + gy) * cs);
    }
    ctx.restore();
  }
}
regiao.prep = regiaoPrep;
previsao.prep = previsaoPrep;
