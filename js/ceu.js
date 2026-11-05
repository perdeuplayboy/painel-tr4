// CÉU DE HOJE: o céu de verdade sobre o carro, na hora certa (de dia, o céu das 21h30 de hoje).
// Todas as estrelas que se vê a olho nu (catálogo HYG, do pacote d3-celestial, baixado uma vez e guardado), as 88
// constelações com nome em português, a Via Láctea, as Nuvens de Magalhães, os planetas e a Lua na fase certa, com o
// lado aceso virado para o Sol. A vista é a de uma lente grande-angular (estereográfica, como nos planetários), que gira
// devagar pelo horizonte e olha para cima quando um planeta ou a Lua está alto. Sem o catálogo, usa só as estrelas brilhantes.
import { here, load, keep, hudText, HUD, clamp, ease, rng, ST, skyAt, galToEq } from './cenas.js';
import { sunEq, moonEq, wrap, hhmm, online } from './mundo.js';

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const CEL = 'https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/';
const PT = {
  And: 'Andrômeda', Ant: 'Máquina Pneumática', Aps: 'Ave-do-Paraíso', Aql: 'Águia', Aqr: 'Aquário', Ara: 'Altar', Ari: 'Áries', Aur: 'Cocheiro',
  Boo: 'Boieiro', CMa: 'Cão Maior', CMi: 'Cão Menor', CVn: 'Cães de Caça', Cae: 'Buril', Cam: 'Girafa', Cap: 'Capricórnio', Car: 'Quilha',
  Cas: 'Cassiopeia', Cen: 'Centauro', Cep: 'Cefeu', Cet: 'Baleia', Cha: 'Camaleão', Cir: 'Compasso', Cnc: 'Câncer', Col: 'Pomba',
  Com: 'Cabeleira de Berenice', CrA: 'Coroa Austral', CrB: 'Coroa Boreal', Crt: 'Taça', Cru: 'Cruzeiro do Sul', Crv: 'Corvo', Cyg: 'Cisne',
  Del: 'Golfinho', Dor: 'Dourado', Dra: 'Dragão', Equ: 'Cavalo Menor', Eri: 'Erídano', For: 'Forno', Gem: 'Gêmeos', Gru: 'Grou',
  Her: 'Hércules', Hor: 'Relógio', Hya: 'Hidra', Hyi: 'Hidra Macho', Ind: 'Índio', LMi: 'Leão Menor', Lac: 'Lagarto', Leo: 'Leão',
  Lep: 'Lebre', Lib: 'Libra', Lup: 'Lobo', Lyn: 'Lince', Lyr: 'Lira', Men: 'Mesa', Mic: 'Microscópio', Mon: 'Unicórnio', Mus: 'Mosca',
  Nor: 'Esquadro', Oct: 'Oitante', Oph: 'Ofiúco', Ori: 'Órion', Pav: 'Pavão', Peg: 'Pégaso', Per: 'Perseu', Phe: 'Fênix', Pic: 'Pintor',
  PsA: 'Peixe Austral', Psc: 'Peixes', Pup: 'Popa', Pyx: 'Bússola', Ret: 'Retículo', Scl: 'Escultor', Sco: 'Escorpião', Sct: 'Escudo',
  Ser: 'Serpente', Sex: 'Sextante', Sge: 'Flecha', Sgr: 'Sagitário', Tau: 'Touro', Tel: 'Telescópio', TrA: 'Triângulo Austral',
  Tri: 'Triângulo', Tuc: 'Tucano', UMa: 'Ursa Maior', UMi: 'Ursa Menor', Vel: 'Vela', Vir: 'Virgem', Vol: 'Peixe Voador', Vul: 'Raposa',
};
const NOMES = { sirius: 'Sírius', canopus: 'Canopus', acen: 'Alfa do Centauro', arcturus: 'Arcturo', vega: 'Vega', capella: 'Capela', rigel: 'Rigel',
  procyon: 'Prócion', achernar: 'Achernar', betelgeuse: 'Betelgeuse', hadar: 'Hadar', altair: 'Altair', acrux: 'Acrux', aldebaran: 'Aldebarã',
  antares: 'Antares', spica: 'Espiga', pollux: 'Pólux', fomalhaut: 'Fomalhaut', deneb: 'Deneb', mimosa: 'Mimosa', regulus: 'Régulo' };
const APELIDOS = [['Três Marias', 83.86, -1.2], ['Plêiades', 56.75, 24.12], ['Grande Nuvem de Magalhães', 80.9, -69.75], ['Pequena Nuvem de Magalhães', 13.2, -72.8]];
// sem o catálogo (primeira vez, sem internet): as figuras principais, ligando as estrelas brilhantes da tabela ST
const CONST0 = [
  ['Cru', [['acrux', 'gacrux'], ['mimosa', 'imai']]], ['Cen', [['acen', 'hadar']]],
  ['Sco', [['acrab', 'dschubba'], ['dschubba', 'pisco'], ['dschubba', 'sigsco'], ['sigsco', 'antares'], ['antares', 'tausco'], ['tausco', 'epssco'], ['epssco', 'musco'], ['musco', 'etasco'], ['etasco', 'sargas'], ['sargas', 'kappasco'], ['kappasco', 'shaula']]],
  ['Ori', [['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'], ['alnitak', 'alnilam'], ['alnilam', 'mintaka'], ['alnitak', 'saiph'], ['mintaka', 'rigel'], ['betelgeuse', 'meissa'], ['bellatrix', 'meissa']]],
  ['CMa', [['sirius', 'mirzam'], ['sirius', 'wezen'], ['wezen', 'adhara'], ['wezen', 'aludra']]], ['Gem', [['castor', 'pollux'], ['pollux', 'alhena']]],
  ['Leo', [['regulus', 'algieba'], ['algieba', 'zosma'], ['zosma', 'denebola']]], ['UMa', [['dubhe', 'alioth'], ['alioth', 'alkaid']]],
].map(([id, segs]) => [id, 1, null, null, segs.map(([a, b]) => [ST[a][0], ST[a][1], ST[b][0], ST[b][1]])]);
const PCOL = { 'Mercúrio': '#e8dcc8', 'Vênus': '#fff6dc', 'Marte': '#ff9060', 'Júpiter': '#ffe8c0', 'Saturno': '#ffe0a0' };
const PSZ = { 'Mercúrio': 0.55, 'Vênus': 1, 'Marte': 0.65, 'Júpiter': 0.85, 'Saturno': 0.65 };
const COLS = ['#a9bfff', '#cad8ff', '#f4f6ff', '#fff3e0', '#ffdcb0', '#ffc080'];       // cor pela temperatura da estrela (índice B-V)
const bvCol = bv => bv < -0.05 ? 0 : bv < 0.25 ? 1 : bv < 0.55 ? 2 : bv < 0.85 ? 3 : bv < 1.25 ? 4 : 5;
const hit = (taken, b) => taken.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

// catálogo: estrelas até magnitude 5,5 (umas 2.850), as linhas das constelações e onde vai cada nome (~75 KB guardados)
const CAT = { d: null, loading: false, at: 0, s: null };
function catalog() {
  if (!CAT.d) { const c = load('ceu', null); if (c?.v === 1) CAT.d = c; }
  if (!CAT.d && !CAT.loading && online() && Date.now() - CAT.at > 60000) loadCat();
  if (CAT.d && !CAT.s) {                                          // em ordem de cor e brilho, para trocar pouco de pincel
    const a = CAT.d.stars, n = a.length / 4, idx = Array.from({ length: n }, (_, i) => i), bin = m => m < 2.5 ? 0 : m < 3.5 ? 1 : m < 4.5 ? 2 : 3;
    idx.sort((i, j) => (bvCol(a[i * 4 + 3]) * 4 + bin(a[i * 4 + 2])) - (bvCol(a[j * 4 + 3]) * 4 + bin(a[j * 4 + 2])) || a[i * 4 + 2] - a[j * 4 + 2]);
    CAT.s = { n, ra: Float32Array.from(idx, i => a[i * 4]), dec: Float32Array.from(idx, i => a[i * 4 + 1]), mag: Float32Array.from(idx, i => a[i * 4 + 2]),
      key: Uint8Array.from(idx, i => bvCol(a[i * 4 + 3]) * 4 + bin(a[i * 4 + 2])) };
  }
  return CAT.d;
}
async function loadCat() {
  CAT.loading = true; CAT.at = Date.now();
  try {
    const get = async f => { const r = await fetch(CEL + f, { signal: AbortSignal.timeout(40000) }); if (!r.ok) throw new Error(f); return r.json(); };
    const [s, l, c] = await Promise.all(['stars.6.json', 'constellations.lines.json', 'constellations.json'].map(get));
    const r2 = x => Math.round(x * 100) / 100, ra = x => r2((x + 360) % 360), stars = [];
    for (const f of s.features) {
      const m = f.properties.mag; if (!(m <= 5.5)) continue;
      const [x, y] = f.geometry.coordinates; stars.push(ra(x), r2(y), Math.round(m * 10) / 10, Math.round((parseFloat(f.properties.bv) || 0.6) * 10) / 10);
    }
    const labs = c.features.map(f => [f.id, ...f.geometry.coordinates]), seen = new Map();
    const cons = l.features.map(f => {
      const k = seen.get(f.id) || 0, L = labs.filter(q => q[0] === f.id)[k]; seen.set(f.id, k + 1);   // a Serpente tem duas partes
      return [f.id, f.id === 'Cru' ? 1 : +f.properties.rank, L ? ra(L[1]) : null, L ? r2(L[2]) : null, f.geometry.coordinates.map(line => line.flatMap(([x, y]) => [ra(x), r2(y)]))];
    });
    CAT.d = { v: 1, stars, cons }; CAT.s = null; keep('ceu', CAT.d);
  } catch {}
  CAT.loading = false;
}

// câmera: estereográfica, olhando para o azimute az e a altura pitch; PX, PY e PK são a saída de proj()
const CM = { S: 0, cx: 0, cy: 0, fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, ux: 0, uy: 0, uz: 0 };
let PX = 0, PY = 0, PK = 0;
function cam(w, h, az, pitch) {
  const a = az * RAD, p = pitch * RAD, ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
  Object.assign(CM, { S: h * 0.7, cx: w / 2, cy: h * 0.5, fx: sa * cp, fy: ca * cp, fz: sp, rx: ca, ry: -sa, ux: -sa * sp, uy: -ca * sp, uz: cp });
}
function proj(E, N, U) {
  const Z = E * CM.fx + N * CM.fy + U * CM.fz; if (Z < -0.3) return false;
  PK = CM.S * 2 / (1 + Z); PX = CM.cx + PK * (E * CM.rx + N * CM.ry); PY = CM.cy - PK * (E * CM.ux + N * CM.uy + U * CM.uz);
  return true;
}
const enuAz = (az, alt) => [Math.cos(alt * RAD) * Math.sin(az * RAD), Math.cos(alt * RAD) * Math.cos(az * RAD), Math.sin(alt * RAD)];

let SK = null, AZ = null, SPR = null;
function sprite() {                                                 // mancha difusa para a Via Láctea
  if (SPR) return SPR;
  SPR = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const g = SPR.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(160,175,230,1)'); gr.addColorStop(0.5, 'rgba(160,175,230,.35)'); gr.addColorStop(1, 'rgba(160,175,230,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return SPR;
}
function build(p) {
  const now = Date.now();
  let ms = now, label = null;                                       // sem título: só diz a hora quando o céu não é o de agora
  if (skyAt(new Date(now), p.lat, p.lon).sun[1] > -8) { const d = new Date(now); d.setHours(21, 30, 0, 0); ms = d.getTime(); label = 'céu desta noite, às 21:30'; }   // de dia: o céu desta noite
  const sky = skyAt(new Date(ms), p.lat, p.lon), d = ms / 86400000 + 2440587.5 - 2451545.0;
  const lst = ((280.46061837 + 360.98564736629 * d + p.lon) % 360 + 360) % 360, sf = Math.sin(p.lat * RAD), cf = Math.cos(p.lat * RAD);
  const enu = (ra, dec, out, o) => {                                // ascensão reta e declinação para leste, norte e para cima
    const H = (lst - ra) * RAD, de = dec * RAD, cd = Math.cos(de), sd = Math.sin(de), cH = Math.cos(H);
    out[o] = -cd * Math.sin(H); out[o + 1] = sd * cf - cd * sf * cH; out[o + 2] = sd * sf + cd * cf * cH;
  };
  const one = (ra, dec) => { const v = [0, 0, 0]; enu(ra, dec, v, 0); return v; };
  const C = catalog(), S = CAT.s;
  let stars, bright = [];
  if (C && S) {
    stars = { n: S.n, v: new Float32Array(S.n * 3), mag: S.mag, key: S.key };
    for (let i = 0; i < S.n; i++) enu(S.ra[i], S.dec[i], stars.v, i * 3);
    const named = Object.entries(NOMES).map(([k, nome]) => [ST[k][0], ST[k][1], nome]);
    const idx = [...S.mag.keys()].filter(i => S.mag[i] < 2).sort((i, j) => S.mag[i] - S.mag[j]);
    for (const i of idx) {                                          // as brilhantes do catálogo, com nome em português quando têm
      const ra = S.ra[i], dec = S.dec[i], k = named.findIndex(([r, d]) => Math.abs(d - dec) < 0.4 && Math.abs(wrap(r - ra)) * Math.cos(dec * RAD) < 0.4);
      bright.push({ v: one(ra, dec), mag: S.mag[i], col: COLS[S.key[i] >> 2], nome: k >= 0 ? named.splice(k, 1)[0][2] : null, tw: ra % 1 });
    }
  } else bright = Object.entries(ST).map(([k, s]) => ({ v: one(s[0], s[1]), mag: s[2], col: s[3] || '#ffffff', nome: NOMES[k], tw: s[0] % 1 }));
  const cons = (C ? C.cons : CONST0).map(([id, rank, lra, ldec, lines]) => {
    const L = lines.map(a => { const f = new Float32Array(a.length / 2 * 3); for (let q = 0; q < a.length; q += 2) enu(a[q], a[q + 1], f, q / 2 * 3); return f; });
    let lab = lra !== null ? one(lra, ldec) : null;
    if (!lab) { lab = [0, 0, 0]; let n = 0; for (const f of L) for (let q = 0; q < f.length; q += 3) { lab[0] += f[q]; lab[1] += f[q + 1]; lab[2] += f[q + 2]; n++; } const m = Math.hypot(...lab) || 1; lab = lab.map(x => x / m); }
    return { nome: PT[id] || id, rank, L, lab };
  });
  const mw = [];
  for (let l = 0; l < 360; l += 2.5) {                              // Via Láctea, mais forte perto do centro da galáxia (Sagitário)
    const core = 0.35 + 0.65 * Math.exp(-((((l + 180) % 360 - 180) / 40) ** 2));
    for (const b of l % 5 ? [0] : [-4, 4]) { const [ra, dec] = galToEq(l, b); mw.push({ v: one(ra, dec), r: (b ? 5 : 7) + 5 * core, a: (b ? 0.05 : 0.08) * core }); }
  }
  for (const [ra, dec, r] of [[80.9, -69.75, 4.5], [13.2, -72.8, 3]]) mw.push({ v: one(ra, dec), r, a: 0.22 });
  const [mra, mdec, mf] = moonEq(ms), [sra, sdec] = sunEq(ms);
  const planets = sky.planets.map(([nome, az, alt]) => ({ nome, az, alt, v: enuAz(az, alt) }));
  const moon = { v: one(mra, mdec), f: mf, sun: one(sra, sdec) };
  moon.alt = Math.asin(moon.v[2]) / RAD; moon.az = (Math.atan2(moon.v[0], moon.v[1]) / RAD + 360) % 360;
  const sun = { v: moon.sun, alt: Math.asin(moon.sun[2]) / RAD };
  const alvos = [...planets.filter(o => o.alt > 3), ...(moon.alt > 3 ? [moon] : [])];
  if (AZ === null) { const top = alvos.sort((a, b) => (b === moon) - (a === moon) || b.alt - a.alt)[0]; AZ = top ? top.az - 55 : 80; }   // começa perto do que tem de melhor
  const vistos = [...(moon.alt > 0 ? ['Lua'] : []), ...planets.filter(o => o.alt > 0).sort((a, b) => b.alt - a.alt).map(o => o.nome)];
  return { p, label, stars, bright, cons, mw, planets, moon, sun, alvos, vistos, az0: AZ, pitch: null,
    apelidos: APELIDOS.map(([n, ra, dec]) => ({ nome: n, v: one(ra, dec) })),
    hills: Array.from({ length: 72 }, (_, i) => 0.5 + 0.5 * Math.sin(i * 0.7) * Math.cos(i * 0.23 + 1) + (rng(i + 3)() - 0.5) * 0.4) };
}

export function ceu(ctx, w, h, t, color) {
  if (!SK || t < SK.last) { if (SK) AZ = SK.azC; SK = build(here()); }
  const dt = clamp(t - (SK.last ?? t), 0, 0.2); SK.last = t;
  const azC = SK.az0 + t * 9; SK.azC = azC;                           // gira 9° por segundo e continua de onde parou no clipe seguinte
  let want = 24;                                                      // olha para cima quando um planeta ou a Lua está alto à frente
  for (const o of SK.alvos) { const da = Math.abs(wrap(o.az - azC)); if (da < 75) want = Math.max(want, 24 + (clamp(o.alt - 24, 24, 52) - 24) * (1 - da / 75)); }
  SK.pitch = SK.pitch === null ? want : SK.pitch + (want - SK.pitch) * clamp(dt * 0.9);
  cam(w, h, azC, SK.pitch);
  const sc = Math.max(1, h / 360), fs = Math.max(10, h * 0.055), sfs = Math.max(9, h * 0.045);
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#02040b'); g.addColorStop(0.7, '#050a1a'); g.addColorStop(1, '#0b1330');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (SK.sun.alt > -18 && proj(...SK.sun.v)) {                        // fim de tarde: o resto de luz do lado do Sol
    const r = h * 0.9, gr = ctx.createRadialGradient(PX, PY, 0, PX, PY, r), a = 0.35 * (SK.sun.alt + 18) / 18;
    gr.addColorStop(0, `rgba(255,150,90,${a})`); gr.addColorStop(1, 'rgba(255,150,90,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  }
  // Via Láctea desenhada num quadro de 1/4 do tamanho e esticada (é toda difusa, e assim pesa bem menos no celular)
  const q = 4, mw = SK.mwc && SK.mwc.width === Math.ceil(w / q) ? SK.mwc : (SK.mwc = Object.assign(document.createElement('canvas'), { width: Math.ceil(w / q), height: Math.ceil(h / q) }));
  const mg = mw.getContext('2d'), spr = sprite();
  mg.globalCompositeOperation = 'source-over'; mg.clearRect(0, 0, mw.width, mw.height); mg.globalCompositeOperation = 'lighter';
  for (const m of SK.mw) {
    if (m.v[2] < -0.08 || !proj(...m.v)) continue;
    const r = m.r * RAD * PK; if (PX < -r || PX > w + r || PY < -r || PY > h + r) continue;
    mg.globalAlpha = m.a; mg.drawImage(spr, (PX - r) / q, (PY - r) / q, r * 2 / q, r * 2 / q);
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(mw, 0, 0, w, h); ctx.restore();
  // estrelas do catálogo, em lotes da mesma cor e brilho (as mais fracas somem perto do horizonte, como de verdade)
  const SZ = [2.2, 1.7, 1.3, 1], AL = [0.95, 0.8, 0.6, 0.42], st = SK.stars;
  if (st) {
    let key = -1, s = 1;
    for (let i = 0, o = 0; i < st.n; i++, o += 3) {
      const U = st.v[o + 2], m = st.mag[i]; if (m < 2 || U < (m > 4 ? 0.12 : 0.035)) continue;
      if (!proj(st.v[o], st.v[o + 1], U) || PX < 0 || PX > w || PY < 0 || PY > h) continue;
      if (st.key[i] !== key) { key = st.key[i]; ctx.fillStyle = COLS[key >> 2]; ctx.globalAlpha = AL[key & 3]; s = SZ[key & 3] * sc; }
      ctx.fillRect(PX - s / 2, PY - s / 2, s, s);
    }
  }
  for (const b of SK.bright) {                                        // as brilhantes: redondas, piscando de leve
    const U = b.v[2]; if (U < 0.01 || !proj(...b.v) || PX < -10 || PX > w + 10 || PY < -10) continue;
    const r = clamp(2.9 - b.mag * 0.5, 1.6, 3.6) * sc;
    ctx.globalAlpha = clamp(U / 0.14, 0.2, 1) * (0.82 + 0.18 * Math.sin(t * (2 + b.tw * 3) + b.tw * 40)) * clamp(1.25 - b.mag * 0.15, 0.4, 1);
    ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(PX, PY, r, 0, TAU); ctx.fill();
    if (b.mag < 1) { ctx.globalAlpha *= 0.22; ctx.beginPath(); ctx.arc(PX, PY, r * 3, 0, TAU); ctx.fill(); }
    b.x = PX; b.y = PY; b.on = true;
  }
  // linhas das constelações
  const la = ease((t - 0.5) / 1.5);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, h * 0.0028);
  for (const c of SK.cons) {
    ctx.globalAlpha = la * (c.rank < 3 ? 0.32 : 0.18); ctx.beginPath();
    for (const f of c.L) {
      let up = false, px = 0, py = 0;
      for (let q = 0; q < f.length; q += 3) {
        const ok = f[q + 2] > -0.02 && proj(f[q], f[q + 1], f[q + 2]);
        if (ok && up && Math.abs(PX - px) < w * 0.6) { ctx.moveTo(px, py); ctx.lineTo(PX, PY); }
        up = ok; px = PX; py = PY;
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const o of SK.planets) {                                       // planetas: ponto firme, sem piscar
    o.on = o.alt > 0 && proj(...o.v) && PX > 0 && PX < w && PY > 0; if (!o.on) continue;
    o.x = PX; o.y = PY; ctx.fillStyle = PCOL[o.nome]; ctx.beginPath(); ctx.arc(PX, PY, Math.max(2.2, h * 0.011 * PSZ[o.nome]), 0, TAU); ctx.fill();
  }
  const M = SK.moon, mr = Math.max(7, h * 0.032);                     // Lua com o lado aceso virado para o Sol
  M.on = M.alt > -1 && proj(...M.v) && PX > -mr && PX < w + mr && PY > -mr;
  if (M.on) {
    const x = PX, y = PY, u = M.v, s = M.sun, dot = u[0] * s[0] + u[1] * s[1] + u[2] * s[2];
    let tx = s[0] - dot * u[0], ty = s[1] - dot * u[1], tz = s[2] - dot * u[2]; const tn = Math.hypot(tx, ty, tz) || 1; tx /= tn; ty /= tn; tz /= tn;
    const e = 0.03, ang = proj(u[0] + tx * e, u[1] + ty * e, u[2] + tz * e) ? Math.atan2(PY - y, PX - x) : 0;
    M.x = x; M.y = y;
    const gl = ctx.createRadialGradient(x, y, mr, x, y, mr * 5); gl.addColorStop(0, `rgba(230,230,210,${0.22 * M.f})`); gl.addColorStop(1, 'rgba(230,230,210,0)');
    ctx.fillStyle = gl; ctx.fillRect(x - mr * 5, y - mr * 5, mr * 10, mr * 10);
    ctx.fillStyle = '#1a1c24'; ctx.beginPath(); ctx.arc(x, y, mr, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#f1ecd8'; ctx.beginPath(); ctx.arc(0, 0, mr, -Math.PI / 2, Math.PI / 2);
    ctx.ellipse(0, 0, Math.abs(1 - 2 * M.f) * mr, mr, 0, Math.PI / 2, -Math.PI / 2, M.f < 0.5); ctx.fill(); ctx.restore();
  }
  // chão: morros em silhueta ao longo do horizonte (curvo, por causa da lente)
  ctx.fillStyle = '#020306'; ctx.beginPath(); let first = true;
  for (let da = -110; da <= 110; da += 2.5) {
    const az = azC + da, hv = SK.hills[(Math.round(((az % 360) + 360) % 360 / 5)) % 72];
    if (!proj(...enuAz(az, hv * 1.8 - 0.3))) continue;
    first ? ctx.moveTo(PX, PY) : ctx.lineTo(PX, PY); first = false;
  }
  ctx.lineTo(w + 60, h + 60); ctx.lineTo(-60, h + 60); ctx.closePath(); ctx.fill();
  // nomes, do mais importante para o menos, sem um cobrir o outro nem o texto do canto e o relógio
  const hud = [SK.label, SK.vistos.length ? `à vista: ${SK.vistos.join(', ')}` : 'nenhum planeta à vista', SK.p.padrao ? 'sem GPS: centro de São Paulo' : null].filter(Boolean);
  const hx = w * 0.04, hfs = Math.max(10, h * 0.075); ctx.font = `${hfs}px monospace`;
  const taken = [[hx - 6, 0, hx + Math.max(...hud.map(s => ctx.measureText(s).width)) + 6, h * 0.04 + hud.length * hfs * 1.3 + 4], [w * 0.55, h * 0.7, w, h]];
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const put = (s, x, y, f, col, a, bold = false, d = null) => {     // com d: tenta em cima, embaixo, à direita e à esquerda do astro
    ctx.font = `${bold ? '600 ' : ''}${f}px system-ui, sans-serif`;
    const tw = ctx.measureText(s).width;
    for (const [px, py] of d === null ? [[x, y]] : [[x, y - d], [x, y + d + f], [x + d + tw / 2, y + f / 2], [x - d - tw / 2, y + f / 2]]) {
      const b = [px - tw / 2 - 3, py - f - 2, px + tw / 2 + 3, py + 2];
      if (b[0] < w * 0.03 || b[2] > w * 0.97 || b[1] < h * 0.02 || b[3] > h * 0.97 || hit(taken, b)) continue;
      taken.push(b); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillText(s, px, py); return;
    }
  };
  const na = ease((t - 1.2) / 1.5);
  if (M.on) put('Lua', M.x, M.y, fs, '#f1ecd8', 0.9 * na, true, mr + 4);
  for (const o of SK.planets) if (o.on) put(o.nome, o.x, o.y, fs, PCOL[o.nome], 0.9 * na, true, h * 0.018);
  for (const b of SK.bright) if (b.on && b.nome && b.v[2] > 0.06) put(b.nome, b.x, b.y - h * 0.016, sfs, HUD, 0.6 * na);
  for (const a of SK.apelidos) if (a.v[2] > 0.06 && proj(...a.v)) put(a.nome, PX, PY + sfs * 1.6, sfs, HUD, 0.5 * na);
  for (const r of [1, 2, 3]) for (const c of SK.cons) {
    if (c.rank !== r || c.lab[2] < 0.06 || !proj(...c.lab)) continue;
    put(c.nome, PX, PY, r === 1 ? fs : sfs, color, (r === 1 ? 0.85 : r === 2 ? 0.65 : 0.45) * na);
  }
  for (const b of SK.bright) b.on = false;
  ctx.font = `${sfs}px monospace`; ctx.fillStyle = HUD; ctx.textBaseline = 'middle';
  for (const [n, az] of [['N', 0], ['NE', 45], ['L', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315]]) {
    if (Math.abs(wrap(az - azC)) > 100 || !proj(...enuAz(az, -3.5)) || PX < 0 || PX > w || PY > h * 0.97 || (PX > w * 0.55 && PY > h * 0.7)) continue;
    ctx.globalAlpha = 0.6; ctx.fillText(n, PX, PY);
  }
  ctx.globalAlpha = 1;
  hudText(ctx, h, hud, hx, h * 0.04);
}
ceu.prep = catalog;                                                 // o catálogo de estrelas, antes de a cena entrar
