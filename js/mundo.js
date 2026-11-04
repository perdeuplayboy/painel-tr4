// Cenas com o mundo de verdade, pela internet (o que baixa fica guardado no aparelho):
// satélites passando sobre o carro agora (órbitas do CelesTrak), terremotos das últimas 24 horas num globo (USGS)
// e a Terra com o dia e a noite deste instante (mapa do Natural Earth), mais os aviões em volta (ADS-B, por um
// intermediário no Cloudflare). Sem dados, a cena termina na hora.
import { here, load, keep, hudText, skyAt, ST, HUD, rng, clamp, ease } from './cenas.js';

const TAU = Math.PI * 2, RAD = Math.PI / 180, RE = 6378.137;
const days = ms => ms / 86400000 + 2440587.5 - 2451545.0;          // dias desde o ano 2000 ao meio-dia (J2000)
const gmst = ms => ((280.46061837 + 360.98564736629 * days(ms)) % 360 + 360) % 360;   // hora sideral de Greenwich, em graus
const wrap = a => ((a % 360) + 540) % 360 - 180;
const hhmm = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const online = () => navigator.onLine !== false;
const fmtN = n => Math.round(n).toLocaleString('pt-BR');
function sunEq(ms) {                                                // Sol: ascensão reta e declinação, em graus (erro de ~0,01°)
  const d = days(ms), g = (357.529 + 0.98560028 * d) * RAD, e = (23.439 - 3.6e-7 * d) * RAD;
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  return [(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD + 360) % 360, Math.asin(Math.sin(e) * Math.sin(L)) / RAD];
}
function moonEq(ms) {                                               // Lua (erro de ~1°) e quanto dela está iluminado (0 a 1)
  const d = days(ms), Mm = (134.963 + 13.064993 * d) * RAD, Fm = (93.272 + 13.22935 * d) * RAD, e = 23.439 * RAD;
  const lo = (218.316 + 13.176396 * d + 6.289 * Math.sin(Mm)) * RAD, la = 5.128 * Math.sin(Fm) * RAD;
  const x = Math.cos(la) * Math.cos(lo), y = Math.cos(la) * Math.sin(lo), z = Math.sin(la);
  const ra = (Math.atan2(y * Math.cos(e) - z * Math.sin(e), x) / RAD + 360) % 360, dec = Math.asin(y * Math.sin(e) + z * Math.cos(e)) / RAD;
  const [sra, sdec] = sunEq(ms), c = Math.sin(dec * RAD) * Math.sin(sdec * RAD) + Math.cos(dec * RAD) * Math.cos(sdec * RAD) * Math.cos((ra - sra) * RAD);
  return [ra, dec, (1 - c) / 2];
}
const below = ([ra, dec], ms) => [wrap(ra - gmst(ms)), dec];       // o ponto da Terra que tem o astro bem em cima
function altOf([ra, dec], ms, lat, lon) {                          // altura do astro no céu de um lugar, em graus
  const H = (gmst(ms) + lon - ra) * RAD, f = lat * RAD, d = dec * RAD;
  return Math.asin(Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H)) / RAD;
}
const unit = ([ra, dec]) => [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)];
function kmBetween(a, b) {                                          // distância pela superfície da Terra
  const f1 = a.lat * RAD, f2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  return 6371 * Math.acos(clamp(Math.sin(f1) * Math.sin(f2) + Math.cos(f1) * Math.cos(f2) * Math.cos(dl), -1, 1));
}
function say(ctx, h, s, x, y, a = 0.85, col = HUD, align = 'left') {   // uma linha no estilo do hudText, com brilho próprio
  const fs = Math.max(10, h * 0.055);
  ctx.save(); ctx.font = `${fs}px monospace`; ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = col; ctx.globalAlpha = a; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText(s, x, y); ctx.restore();
}

// =====================================================================================
// MAPA DO MUNDO (Natural Earth 1:110 milhões, pelo pacote world-atlas): contornos dos continentes e fronteiras.
// Baixa uma vez (~110 KB) e fica guardado. Cada ponto vira [longitude, latitude] e também o vetor no globo.
const WM = { data: null, loading: false, failed: false };
function decodeWorld(tj) {
  const [sx, sy] = tj.transform.scale, [tx, ty] = tj.transform.translate;
  const arcs = tj.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
  const pack = pts => {
    const ll = new Float32Array(pts.length * 2), v = new Float32Array(pts.length * 3);
    pts.forEach(([lo, la], k) => { ll[k * 2] = lo; ll[k * 2 + 1] = la; const c = Math.cos(la * RAD); v[k * 3] = c * Math.cos(lo * RAD); v[k * 3 + 1] = c * Math.sin(lo * RAD); v[k * 3 + 2] = Math.sin(la * RAD); });
    return { ll, v };
  };
  const ring = r => r.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
  const walk = (g, fn) => g.type === 'GeometryCollection' ? g.geometries.forEach(x => walk(x, fn))
    : g.type === 'Polygon' ? g.arcs.forEach(fn) : g.type === 'MultiPolygon' ? g.arcs.forEach(p => p.forEach(fn)) : 0;
  const land = [], use = new Map();
  walk(tj.objects.land, r => land.push(pack(ring(r))));
  walk(tj.objects.countries, r => r.forEach(i => { const k = i < 0 ? ~i : i; use.set(k, (use.get(k) || 0) + 1); }));
  const borders = [...use].filter(([, n]) => n > 1).map(([k]) => pack(arcs[k]));   // trecho dividido por dois países = fronteira
  const grid = [];                                                  // paralelos e meridianos de 30 em 30 graus
  for (let la = -60; la <= 60; la += 30) grid.push(pack(Array.from({ length: 73 }, (_, i) => [i * 5 - 180, la])));
  for (let lo = -180; lo < 180; lo += 30) grid.push(pack(Array.from({ length: 37 }, (_, i) => [lo, i * 5 - 90])));
  return { land, borders, grid };
}
function world() {
  if (WM.data || WM.loading || WM.failed) return WM.data;
  const c = load('mundo', null);
  if (c?.arcs) { try { WM.data = decodeWorld(c); return WM.data; } catch {} }
  if (!online()) { WM.failed = true; return null; }
  WM.loading = true;
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json', { signal: AbortSignal.timeout(20000) }).then(r => r.json())
    .then(tj => { WM.data = decodeWorld(tj); keep('mundo', tj); }).catch(() => { WM.failed = true; }).finally(() => { WM.loading = false; });
  return null;
}

// =====================================================================================
// SATÉLITES SOBRE VOCÊ: o céu inteiro em volta do carro (360°, do horizonte ao alto) com os satélites que estão
// passando agora, pelas órbitas publicadas pelo CelesTrak: as ~150 coisas mais fáceis de ver no céu, mais a Estação
// Espacial e a chinesa. Cada um deixa o rastro dos últimos minutos e uma linha tracejada para onde vai.
// Quem está no sol com o céu escuro aqui embaixo dá para ver a olho nu: fica aceso e branco.
// Cálculo: órbita de Kepler com o achatamento da Terra, a mesma base do SGP4 (erro de poucos km, nada que se veja no céu).
const SAT = { list: null, at: 0, loading: false };
const SAT_NOME = { 'ISS (ZARYA)': 'ISS', 'CSS (TIANHE)': 'Tiangong', 'HST': 'Hubble' };
const SAT_CAMPOS = ['OBJECT_NAME', 'NORAD_CAT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'MEAN_MOTION_DOT'];
function orbit(o) {
  const n0 = o.MEAN_MOTION * TAU / 1440, e = o.ECCENTRICITY, i = o.INCLINATION * RAD, ci = Math.cos(i), b2 = 1 - e * e, k2 = 5.41308e-4;
  const a1 = (0.0743669161 / n0) ** (2 / 3), d1 = 1.5 * k2 * (3 * ci * ci - 1) / (a1 * a1 * b2 ** 1.5);   // do jeito do TLE para o da fórmula, como o SGP4
  const a0 = a1 * (1 - d1 / 3 - d1 * d1 - 134 / 81 * d1 ** 3), d0 = 1.5 * k2 * (3 * ci * ci - 1) / (a0 * a0 * b2 ** 1.5);
  const n = n0 / (1 + d0), a = a0 / (1 - d0), f = 0.75 * 1.08262668e-3 / (a * a * b2 * b2) * n;
  const nm = SAT_NOME[o.OBJECT_NAME] || o.OBJECT_NAME.replace(/ R\/B$/, ' (foguete)').replace(/ DEB$/, ' (detrito)');
  return { nm, big: !!SAT_NOME[o.OBJECT_NAME], ep: Date.parse(o.EPOCH + 'Z'), a: a * RE, e, i, M0: o.MEAN_ANOMALY * RAD, w0: o.ARG_OF_PERICENTER * RAD,
    O0: o.RA_OF_ASC_NODE * RAD, dM: n + f * Math.sqrt(b2) * (3 * ci * ci - 1), dw: f * (5 * ci * ci - 1), dO: -2 * f * ci, nd: (o.MEAN_MOTION_DOT || 0) * TAU };
}
function satAt(s, ms) {                                             // posição em km, presa às estrelas (não gira com a Terra)
  const tm = (ms - s.ep) / 60000, td = tm / 1440, e = s.e;
  const M = (s.M0 + s.dM * tm + s.nd * td * td) % TAU, w = s.w0 + s.dw * tm, O = s.O0 + s.dO * tm;
  let E = M; for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = s.a * (Math.cos(E) - e), yp = s.a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(s.i), si = Math.sin(s.i);
  return [(cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp, (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp, sw * si * xp + cw * si * yp];
}
function lookAt(r, ms, lat, lon) {                                  // azimute, altura no céu e distância, vistos do chão
  const th = (gmst(ms) + lon) * RAD, f = lat * RAD, ct = Math.cos(th), st = Math.sin(th), cf = Math.cos(f), sf = Math.sin(f);
  const dx = r[0] - RE * cf * ct, dy = r[1] - RE * cf * st, dz = r[2] - RE * sf;
  const S = sf * ct * dx + sf * st * dy - cf * dz, E = -st * dx + ct * dy, Z = cf * ct * dx + cf * st * dy + sf * dz, d = Math.hypot(dx, dy, dz);
  return [(Math.atan2(E, -S) / RAD + 360) % 360, Math.asin(Z / d) / RAD, d];
}
function inSun(r, s) {                                              // fora da sombra da Terra (sombra como um cilindro)
  const k = r[0] * s[0] + r[1] * s[1] + r[2] * s[2];
  return k > 0 || Math.hypot(r[0] - k * s[0], r[1] - k * s[1], r[2] - k * s[2]) > RE;
}
function nextPass(s, from, lat, lon) {                              // próxima vez que dá para ver: acima de 10°, no sol, céu escuro aqui
  for (let ms = from; ms < from + 86400000; ms += 30000) {
    const r = satAt(s, ms); if (lookAt(r, ms, lat, lon)[1] < 10) continue;
    const sun = sunEq(ms); if (altOf(sun, ms, lat, lon) > -6 || !inSun(r, unit(sun))) continue;
    let top = 0; for (let m = ms; m < ms + 900000; m += 15000) { const el = lookAt(satAt(s, m), m, lat, lon)[1]; if (el < 10) break; top = Math.max(top, el); }
    return { ms, top };
  }
  return null;
}
async function loadSats() {
  SAT.loading = true;
  try {
    const get = g => fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=json`, { signal: AbortSignal.timeout(20000) }).then(r => r.json());
    const [st, vis] = await Promise.all([get('stations'), get('visual')]);
    const seen = new Set(), raw = [];
    for (const o of [...st.filter(o => SAT_NOME[o.OBJECT_NAME]), ...vis]) {
      if (seen.has(o.NORAD_CAT_ID)) continue; seen.add(o.NORAD_CAT_ID);
      raw.push(Object.fromEntries(SAT_CAMPOS.map(k => [k, o[k]])));
    }
    if (raw.length) { SAT.list = raw.map(orbit); SAT.at = Date.now(); keep('satelites', { at: SAT.at, raw }); }
  } catch {}
  SAT.loading = false;
}
let SS = null;
export function satelites(ctx, w, h, t, color) {
  if (!SAT.list) { const c = load('satelites', null); if (c?.raw?.length) { SAT.list = c.raw.map(orbit); SAT.at = c.at; } }
  if ((!SAT.list || Date.now() - SAT.at > 12 * 3600000) && !SAT.loading && online()) loadSats();   // o CelesTrak pede no máximo a cada 2 h
  const now = Date.now(), p = here();
  if (!SAT.list || now - SAT.at > 5 * 86400000) {                  // órbita de muitos dias atrás já erra demais
    ctx.fillStyle = '#02040c'; ctx.fillRect(0, 0, w, h);
    if (!SAT.loading || t > 12) return true;
    hudText(ctx, h, ['SATÉLITES · carregando…'], w / 2, h * 0.45, 'center'); return;
  }
  if (!SS || t < SS.last || now - SS.at > 600000) {
    const iss = SAT.list.find(s => s.nm === 'ISS');
    SS = { at: now, iss, pass: iss ? nextPass(iss, now, p.lat, p.lon) : null, hills: Array.from({ length: 73 }, (_, i) => rng(i + 11)()),
      faint: Array.from({ length: 220 }, (_, i) => { const r = rng(i * 7 + 3); return [r() * 360, Math.asin(r()) / RAD, r()]; }) };
  }
  SS.last = t;
  const hy = h * 0.64, top = h * 0.05, k = w / 360;                 // horizonte acima do relógio; o céu todo, de norte a norte
  const X = az => az * k, Y = el => el >= 0 ? hy - (hy - top) * (el / 90) ** 0.85 : hy - el * (hy - top) / 90;
  const sun = sunEq(now), sunAlt = altOf(sun, now, p.lat, p.lon), dark = sunAlt < -6, sv = unit(sun);
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  if (dark) { g.addColorStop(0, '#02040c'); g.addColorStop(1, '#070d20'); } else { g.addColorStop(0, '#04101f'); g.addColorStop(1, '#0b2440'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const starA = dark ? 1 : 0.3;
  for (const [az, el, b] of SS.faint) { ctx.globalAlpha = starA * (0.15 + 0.35 * b); ctx.fillStyle = '#dfe6ff'; ctx.fillRect(X(az), Y(el), 1, 1); }
  const sky = skyAt(new Date(now), p.lat, p.lon);                   // as estrelas brilhantes de verdade, no lugar certo
  for (const [ra, dec, mag, col] of Object.values(ST)) {
    const [az, el] = sky.altaz(ra, dec); if (el < 0) continue;
    ctx.globalAlpha = starA * clamp(1.1 - mag * 0.2, 0.3, 1); ctx.fillStyle = col || '#ffffff';
    ctx.beginPath(); ctx.arc(X(az), Y(el), clamp(2 - mag * 0.4, 0.6, 2.6) * Math.max(1, h / 300), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const up = [];
  for (const s of SAT.list) {
    const r = satAt(s, now), [az, el] = lookAt(r, now, p.lat, p.lon);
    if (el > -3) up.push({ s, az, el, lit: inSun(r, sv), km: Math.hypot(...r) - RE });
  }
  const lw = Math.max(1, h * 0.004);
  for (const u of up) {                                             // rastro dos últimos 4 minutos e o caminho dos próximos 4
    const vis = u.lit && dark;
    let prev = null;
    for (let q = -12; q <= 12; q++) {
      const ms = now + q * 20000, [az, el] = lookAt(satAt(u.s, ms), ms, p.lat, p.lon), pt = [X(az), Y(el)];
      if (prev && Math.abs(pt[0] - prev[0]) < w / 2 && el > -3) {
        ctx.strokeStyle = vis ? '#ffffff' : color; ctx.lineWidth = lw * (u.s.big ? 1.5 : 1);
        ctx.globalAlpha = q <= 0 ? (vis ? 0.6 : 0.35) * (1 + q / 12) : 0.25; ctx.setLineDash(q > 0 ? [lw * 2, lw * 3] : []);
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
      }
      prev = pt;
    }
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  const n0 = up.filter(u => u.el > 0).length, nv = up.filter(u => u.el > 0 && u.lit && dark).length;
  const issUp = up.find(u => u.s === SS.iss && u.el > 0);
  const dia = ms => new Date(ms).toDateString() === new Date(now).toDateString() ? 'hoje' : 'amanhã';
  const issTxt = !SS.iss ? null : issUp ? `ISS passando agora a ${Math.round(issUp.el)}° de altura`
    : SS.pass ? `ISS: dá para ver ${dia(SS.pass.ms)} às ${hhmm(SS.pass.ms)}, até ${Math.round(SS.pass.top)}° de altura` : 'ISS: sem passagem visível nas próximas 24 h';
  const hud = ['SATÉLITES SOBRE VOCÊ', `${n0} acima do horizonte · ${dark ? `${nv} dá para ver agora` : 'de dia não dá para ver'}`, issTxt, p.padrao ? 'sem GPS: céu do centro de São Paulo' : null].filter(Boolean);
  const hfs = Math.max(10, h * 0.055), fs = Math.max(10, h * 0.05);
  ctx.font = `${hfs}px monospace`;
  const taken = [[w * 0.14 - 6, 0, w * 0.14 + Math.max(...hud.map(s => ctx.measureText(s).width)) + 6, h * 0.08 + hud.length * hfs * 1.3 + 4]];   // o texto do canto
  const free = b => !taken.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const named = up.filter(u => u.el > 0).sort((a, b) => (b.s.big - a.s.big) || (b.el - a.el));
  let labels = 0;
  ctx.font = `${fs}px monospace`;
  for (const u of named) {                                          // nomes sem trombar com o texto nem entre si
    if (labels >= 6) break;
    const x = X(u.az), y = Y(u.el), r = (u.s.big ? 3.2 : 1.8) * Math.max(1, h / 300), s = `${u.s.nm} · ${fmtN(u.km)} km`, tw = ctx.measureText(s).width;
    for (const side of x > w * 0.8 ? [-1, 1] : [1, -1]) {
      for (const up2 of [1, -1]) {
        const x0 = side > 0 ? x + r + 4 : x - r - 4 - tw, y1 = up2 > 0 ? y - r : y + r + fs * 1.1, b = [x0 - 2, y1 - fs * 1.1, x0 + tw + 2, y1 + 2];
        if (x0 < 4 || x0 + tw > w - 4 || b[1] < 2 || b[3] > hy || !free(b)) continue;
        taken.push(b); u.label = [s, x0, y1]; labels++; break;
      }
      if (u.label) break;
    }
  }
  for (const u of up) {
    if (u.el < 0) continue;
    const vis = u.lit && dark, x = X(u.az), y = Y(u.el), r = (u.s.big ? 3.2 : 1.8) * Math.max(1, h / 300);
    if (vis) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = vis ? 1 : 0.75; ctx.fillStyle = vis ? '#ffffff' : color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (u.label) {
      ctx.globalAlpha = vis ? 0.95 : 0.7; ctx.fillStyle = HUD; ctx.font = `${fs}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(...u.label);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#020306'; ctx.beginPath(); ctx.moveTo(0, h);     // chão em silhueta
  for (let i = 0; i <= 72; i++) ctx.lineTo(i / 72 * w, hy - SS.hills[i % 72] * h * 0.025);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  ctx.font = `${fs * 0.9}px monospace`; ctx.textBaseline = 'top'; ctx.fillStyle = HUD; ctx.globalAlpha = 0.7;
  for (const [n, az] of [['N', 0], ['NE', 45], ['L', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315], ['N', 360]]) {
    ctx.textAlign = az === 0 ? 'left' : az === 360 ? 'right' : 'center'; ctx.fillText(n, X(az) + (az === 0 ? 4 : az === 360 ? -4 : 0), hy + h * 0.02);
  }
  ctx.globalAlpha = 1;
  hudText(ctx, h, hud, w * 0.14, h * 0.08);
}

// =====================================================================================
// TERREMOTOS DO MUNDO: o globo com os tremores de magnitude 2,5 ou mais das últimas 24 horas (USGS), cada um pulsando
// no tamanho da força. A cada poucos segundos o globo vira para um dos maiores e a lista mostra onde foi.
const EQ = { list: null, at: 0, loading: false };
const PT = {
  CA: 'Califórnia', California: 'Califórnia', AK: 'Alasca', Alaska: 'Alasca', HI: 'Havaí', Hawaii: 'Havaí', NV: 'Nevada', OK: 'Oklahoma', TX: 'Texas',
  UT: 'Utah', MT: 'Montana', WA: 'Washington', OR: 'Oregon', ID: 'Idaho', WY: 'Wyoming', NM: 'Novo México', 'New Mexico': 'Novo México',
  'Puerto Rico': 'Porto Rico', Japan: 'Japão', Indonesia: 'Indonésia', Philippines: 'Filipinas', Mexico: 'México', Turkey: 'Turquia', 'Türkiye': 'Turquia',
  Greece: 'Grécia', Italy: 'Itália', Iran: 'Irã', 'New Zealand': 'Nova Zelândia', 'Papua New Guinea': 'Papua-Nova Guiné', Bolivia: 'Bolívia',
  Colombia: 'Colômbia', Ecuador: 'Equador', Nicaragua: 'Nicarágua', Panama: 'Panamá', Brazil: 'Brasil', 'Solomon Islands': 'Ilhas Salomão',
  Russia: 'Rússia', Afghanistan: 'Afeganistão', Pakistan: 'Paquistão', India: 'Índia', Myanmar: 'Mianmar', Iceland: 'Islândia', Canada: 'Canadá',
  'Dominican Republic': 'República Dominicana', 'Mid-Atlantic Ridge': 'Dorsal Meso-Atlântica', 'Kermadec Islands': 'Ilhas Kermadec',
  'South Sandwich Islands': 'Ilhas Sandwich do Sul', 'Northern Mariana Islands': 'Ilhas Marianas', Tajikistan: 'Tajiquistão', Kyrgyzstan: 'Quirguistão',
  Kazakhstan: 'Cazaquistão', Ethiopia: 'Etiópia', Algeria: 'Argélia', Morocco: 'Marrocos', Spain: 'Espanha', Albania: 'Albânia', Croatia: 'Croácia',
  Romania: 'Romênia', Cyprus: 'Chipre', Iraq: 'Iraque', Syria: 'Síria', Yemen: 'Iêmen', 'Saudi Arabia': 'Arábia Saudita', Malaysia: 'Malásia',
  'Timor Leste': 'Timor-Leste', 'East Timor': 'Timor-Leste', Vietnam: 'Vietnã', 'South Korea': 'Coreia do Sul', Mongolia: 'Mongólia',
  Australia: 'Austrália', Antarctica: 'Antártida', Greenland: 'Groenlândia', Norway: 'Noruega', 'Fiji Islands': 'Ilhas Fiji', Fiji: 'Fiji',
  'Mid-Indian Ridge': 'Dorsal Centro-Índica', 'Southwest Indian Ridge': 'Dorsal Sudoeste da Índia', 'Southeast Indian Ridge': 'Dorsal Sudeste da Índia',
  'East Pacific Rise': 'Dorsal do Pacífico Leste', 'Pacific-Antarctic Ridge': 'Dorsal Pacífico-Antártica', 'Carlsberg Ridge': 'Dorsal de Carlsberg',
  'Reykjanes Ridge': 'Dorsal de Reykjanes', 'Easter Island': 'Ilha de Páscoa', 'Galapagos Islands': 'Ilhas Galápagos', 'Galápagos Islands': 'Ilhas Galápagos',
  'Bonin Islands': 'Ilhas Bonin', 'Izu Islands': 'Ilhas Izu', 'Ryukyu Islands': 'Ilhas Ryukyu', 'Santa Cruz Islands': 'Ilhas Santa Cruz', 'Loyalty Islands': 'Ilhas Loyalty',
  'New Caledonia': 'Nova Caledônia', 'Samoa Islands': 'Ilhas Samoa', 'Andaman Islands': 'Ilhas Andaman', 'Nicobar Islands': 'Ilhas Nicobar', 'Gulf of California': 'Golfo da Califórnia',
  'Kuril Islands': 'Ilhas Curilas', 'Aleutian Islands': 'Ilhas Aleutas', 'Banda Sea': 'Mar de Banda', 'Molucca Sea': 'Mar das Molucas',
};
function lugarPt(place) {
  let s = (place || '').split(', ').pop().trim();
  const reg = s.match(/^(.*) region$/i); if (reg) return `${PT[reg[1]] || reg[1]} (região)`;
  const of = s.match(/^(?:north|south|east|west|northern|southern|eastern|western|central)?\s*(?:of the |of )?(.+)$/i);
  return PT[s] || (of && PT[of[1]]) || s;
}
const agoTxt = ms => { const m = Math.max(1, Math.round((Date.now() - ms) / 60000)); return m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`; };
async function loadQuakes() {
  EQ.loading = true;
  try {
    const j = await (await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', { signal: AbortSignal.timeout(15000) })).json();
    EQ.list = j.features.filter(f => f.geometry?.coordinates).map(f => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2],
      m: f.properties.mag ?? 2.5, place: f.properties.place || '', time: f.properties.time }));
    EQ.at = Date.now(); keep('terremotos', { at: EQ.at, list: EQ.list });
  } catch {}
  EQ.loading = false;
}
function globe(ctx, cx, cy, R, l0, p0, color, W) {                  // globo visto de longe, centrado em (l0, p0)
  const cl = Math.cos(l0 * RAD), sl = Math.sin(l0 * RAD), cp = Math.cos(p0 * RAD), sp = Math.sin(p0 * RAD);
  const P = (x, y, z) => [-sl * x + cl * y, -sp * cl * x - sp * sl * y + cp * z, cp * cl * x + cp * sl * y + sp * z];
  ctx.fillStyle = '#04101e'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  const lines = (arr, a, lwk) => {                                  // só os trechos do lado de cá
    ctx.beginPath();
    for (const { v } of arr) { let pen = false; for (let k = 0; k < v.length; k += 3) { const [x, y, z] = P(v[k], v[k + 1], v[k + 2]); if (z > 0) { pen ? ctx.lineTo(cx + x * R, cy - y * R) : ctx.moveTo(cx + x * R, cy - y * R); pen = true; } else pen = false; } }
    ctx.strokeStyle = color; ctx.globalAlpha = a; ctx.lineWidth = Math.max(0.6, R * lwk); ctx.stroke(); ctx.globalAlpha = 1;
  };
  if (W) {
    ctx.beginPath();                                                // terra: o que fica atrás encosta na borda do globo
    for (const { v } of W.land) {
      for (let k = 0; k < v.length; k += 3) {
        let [x, y, z] = P(v[k], v[k + 1], v[k + 2]); if (z < 0) { const m = Math.hypot(x, y) || 1; x /= m; y /= m; }
        k ? ctx.lineTo(cx + x * R, cy - y * R) : ctx.moveTo(cx + x * R, cy - y * R);
      }
      ctx.closePath();
    }
    ctx.fillStyle = color; ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1;
    lines(W.grid, 0.08, 0.004); lines(W.borders, 0.22, 0.004); lines(W.land, 0.7, 0.008);
  }
  ctx.strokeStyle = color; ctx.globalAlpha = 0.45; ctx.lineWidth = Math.max(1, R * 0.012); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  return (lat, lon) => { const c = Math.cos(lat * RAD), [x, y, z] = P(c * Math.cos(lon * RAD), c * Math.sin(lon * RAD), Math.sin(lat * RAD)); return [cx + x * R, cy - y * R, z]; };
}
let QS = null;
export function terremotos(ctx, w, h, t, color) {
  if (!EQ.list) { const c = load('terremotos', null); if (c?.list) { EQ.list = c.list; EQ.at = c.at; } }
  if ((!EQ.list || Date.now() - EQ.at > 15 * 60000) && !EQ.loading && online()) loadQuakes();
  const W = world(), now = Date.now();
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, w, h);
  if (!EQ.list || now - EQ.at > 6 * 3600000 || (!W && WM.loading && t < 8)) {
    if ((!EQ.loading && !WM.loading) || t > 12) return true;
    hudText(ctx, h, ['TERREMOTOS · carregando…'], w / 2, h * 0.45, 'center'); return;
  }
  if (!QS || t < QS.last) {
    const p = here(), Q = EQ.list.filter(q => now - q.time < 86400000);
    const near = Q.length ? Q.reduce((a, b) => kmBetween(p, b) < kmBetween(p, a) ? b : a) : null;
    QS = { p, Q, near, nearKm: near ? kmBetween(p, near) : 0, top: [...Q].sort((a, b) => b.m - a.m).slice(0, 5), l0: p.lon, p0: clamp(p.lat, -45, 45), ph: Q.map(() => Math.random()) };
  }
  const dt = clamp(t - (QS.last ?? t), 0, 0.1); QS.last = t;
  const idx = t < 2 ? -1 : Math.floor((t - 2) / 4.5) % Math.max(1, QS.top.length), cur = QS.top[idx] || null;
  if (cur) { const k = Math.min(1, dt * 2.2); QS.l0 += wrap(cur.lon - QS.l0) * k; QS.p0 += (clamp(cur.lat, -50, 50) - QS.p0) * k; }
  else QS.l0 += dt * 4;
  const cx = w * 0.19, cy = h * 0.5, R = h * 0.44, at = globe(ctx, cx, cy, R, QS.l0, QS.p0, color, W);
  QS.Q.forEach((q, i) => {
    const [x, y, z] = at(q.lat, q.lon); if (z < 0.03) return;
    const sel = q === cur, fresh = clamp(1 - (now - q.time) / 86400000, 0.35, 1), sz = Math.max(1, q.m - 2) * h * 0.012 * (sel ? 1.5 : 1);
    const col = sel ? '#ffffff' : q.m >= 5 ? '#ff7a5a' : color, fr = (t * 0.45 + QS.ph[i]) % 1;
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, h * 0.004); ctx.globalAlpha = (1 - fr) * fresh * z;
    ctx.beginPath(); ctx.arc(x, y, sz * (0.4 + fr * 2.2), 0, TAU); ctx.stroke();
    ctx.globalAlpha = fresh * (0.5 + 0.5 * z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, sz * 0.3), 0, TAU); ctx.fill();
    if (sel) say(ctx, h, `M ${q.m.toFixed(1)}`, x + sz + 4, y - sz - h * 0.06, 1);
  });
  ctx.globalAlpha = 1;
  const [ux, uy, uz] = at(QS.p.lat, QS.p.lon);                      // o carro
  if (uz > 0) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ux, uy, Math.max(1.5, h * 0.01), 0, TAU); ctx.fill(); }
  const fs = Math.max(10, h * 0.055), x0 = w * 0.4, lh = fs * 1.3;
  say(ctx, h, `TERREMOTOS · 24 h · ${QS.Q.length} tremores`, x0, h * 0.08);
  if (!QS.Q.length) say(ctx, h, 'nenhum tremor forte no mundo hoje', x0, h * 0.08 + lh * 1.2, 0.7);
  QS.top.forEach((q, i) => {
    const sel = q === cur;
    say(ctx, h, `${sel ? '▸' : ' '} M ${q.m.toFixed(1)}  ${lugarPt(q.place)} · ${agoTxt(q.time)}`, x0, h * 0.08 + lh * (1.2 + i), sel ? 1 : 0.6, sel ? '#ffffff' : q.m >= 5 ? '#ffb09a' : HUD);
  });
  if (QS.near) say(ctx, h, `mais perto de você: M ${QS.near.m.toFixed(1)} · ${lugarPt(QS.near.place)} · ${fmtN(QS.nearKm)} km`, x0, h * 0.08 + lh * (1.5 + QS.top.length), 0.7);
}

// =====================================================================================
// TERRA DIA E NOITE: o mapa do mundo com a sombra da noite onde ela está agora, o Sol e a Lua em cima de onde estão,
// as luzes das cidades no lado escuro e o carro no meio. Começa passando as últimas 24 horas em poucos segundos
// e para no agora.
// cidades grandes: [latitude, longitude, tamanho]
const CITIES = [
  [-23.55, -46.63, 1], [-22.91, -43.17, .9], [-19.92, -43.94, .7], [-15.79, -47.88, .6], [-12.97, -38.5, .6], [-3.73, -38.52, .6], [-8.05, -34.88, .6],
  [-30.03, -51.22, .6], [-25.43, -49.27, .6], [-3.12, -60.02, .5], [-1.46, -48.5, .5], [-16.68, -49.25, .5], [-22.91, -47.06, .5], [-2.53, -44.3, .4],
  [-5.79, -35.21, .4], [-27.6, -48.55, .4], [-20.46, -54.62, .35], [-15.6, -56.1, .35], [-20.32, -40.34, .4], [-21.18, -47.81, .35], [-18.92, -48.28, .3],
  [-23.31, -51.16, .3], [-5.09, -42.8, .35], [-7.12, -34.86, .35], [-9.67, -35.74, .35], [-10.91, -37.07, .3], [-8.76, -63.9, .25], [-10.18, -48.33, .2],
  [-23.18, -45.88, .35], [-23.96, -46.33, .35], [-22.75, -47.33, .3], [-26.3, -48.85, .3], [-29.17, -51.18, .3], [-21.76, -43.35, .3], [-19.47, -42.54, .25],
  [-34.6, -58.38, .9], [-33.45, -70.67, .7], [-12.05, -77.04, .7], [4.71, -74.07, .7], [10.49, -66.88, .5], [-0.18, -78.47, .4], [-34.9, -56.16, .4],
  [-25.26, -57.58, .35], [-16.5, -68.15, .35], [6.24, -75.58, .4], [-31.42, -64.18, .35], [-2.17, -79.92, .4], [10.97, -74.8, .3],
  [19.43, -99.13, 1], [40.71, -74.01, 1], [34.05, -118.24, .9], [41.88, -87.63, .8], [29.76, -95.37, .7], [32.78, -96.8, .7], [25.76, -80.19, .6],
  [33.75, -84.39, .6], [43.65, -79.38, .7], [45.5, -73.57, .5], [37.77, -122.42, .6], [47.61, -122.33, .5], [38.9, -77.04, .6], [33.45, -112.07, .5],
  [39.74, -104.99, .45], [25.69, -100.32, .5], [20.66, -103.35, .5], [23.11, -82.37, .35], [49.28, -123.12, .4], [42.36, -71.06, .5], [39.95, -75.17, .5],
  [51.51, -0.13, .9], [48.86, 2.35, .9], [40.42, -3.7, .7], [41.39, 2.17, .5], [38.72, -9.14, .5], [41.9, 12.5, .6], [45.46, 9.19, .6], [52.52, 13.4, .6],
  [53.55, 9.99, .4], [48.14, 11.58, .4], [52.37, 4.9, .5], [50.85, 4.35, .45], [48.21, 16.37, .45], [52.23, 21.01, .45], [55.76, 37.62, .9],
  [59.93, 30.36, .5], [50.45, 30.52, .5], [41.01, 28.98, .9], [37.98, 23.73, .45], [59.33, 18.07, .35], [53.48, -2.24, .45], [50.11, 8.68, .4],
  [30.04, 31.24, .9], [6.52, 3.38, .8], [-4.44, 15.27, .6], [-26.2, 28.05, .7], [-33.92, 18.42, .45], [-1.29, 36.82, .5], [9.03, 38.74, .45],
  [33.57, -7.59, .45], [36.75, 3.06, .45], [-8.84, 13.23, .45], [5.6, -0.19, .4], [14.72, -17.47, .35], [15.5, 32.56, .4], [-6.79, 39.21, .4],
  [25.2, 55.27, .6], [24.71, 46.68, .6], [35.69, 51.39, .8], [33.31, 44.36, .5], [32.09, 34.78, .45], [21.49, 39.19, .45],
  [24.86, 67, .8], [28.61, 77.21, 1], [19.08, 72.88, .9], [12.97, 77.59, .7], [22.57, 88.36, .8], [13.08, 80.27, .6], [23.81, 90.41, .8], [31.55, 74.34, .7],
  [17.39, 78.49, .6], [23.02, 72.57, .5], [13.76, 100.5, .8], [-6.21, 106.85, .9], [1.35, 103.82, .6], [3.14, 101.69, .5], [14.6, 120.98, .8],
  [10.82, 106.63, .6], [21.03, 105.85, .5], [22.32, 114.17, .7], [23.13, 113.26, .9], [22.54, 114.06, .8], [31.23, 121.47, 1], [39.9, 116.41, .9],
  [30.57, 104.07, .7], [29.56, 106.55, .7], [30.59, 114.31, .6], [34.34, 108.94, .5], [39.13, 117.2, .6], [32.06, 118.8, .5], [37.57, 126.98, .9],
  [35.68, 139.69, 1], [34.69, 135.5, .8], [35.18, 136.91, .5], [25.03, 121.57, .6], [-7.25, 112.75, .5], [16.87, 96.2, .4], [43.24, 76.89, .35],
  [-33.87, 151.21, .6], [-37.81, 144.96, .55], [-27.47, 153.03, .4], [-31.95, 115.86, .35], [-36.85, 174.76, .35],
];
let TS = null;
function terraInit(W, w, h, p, now) {
  const lonC = p.lon, latT = 75, latB = -60;
  const X = rel => w / 2 + rel / 360 * w, Y = la => (latT - la) / (latT - latB) * h;
  const path = (arr, closed) => {                                   // o que passa da beira aparece do outro lado
    const P = new Path2D();
    for (const { ll } of arr) {
      const xs = [], ys = []; let rel = wrap(ll[0] - lonC);
      for (let k = 0; k < ll.length; k += 2) { if (k) rel += wrap(ll[k] - ll[k - 2]); xs.push(X(rel)); ys.push(Y(ll[k + 1])); }
      const lo = Math.min(...xs), hi = Math.max(...xs);
      for (const off of [0, lo < 0 ? w : null, hi > w ? -w : null]) {
        if (off === null) continue;
        xs.forEach((x, i) => i ? P.lineTo(x + off, ys[i]) : P.moveTo(x + off, ys[i])); if (closed) P.closePath();
      }
    }
    return P;
  };
  const r = rng(5), lights = [];
  for (const [la, lo, s] of CITIES) { lights.push([la, lo, s]); for (let i = 0; i < 3 + s * 9; i++) { const a = r() * TAU, d = r() * s * 1.4; lights.push([la + Math.sin(a) * d, lo + Math.cos(a) * d / Math.cos(la * RAD), s * (0.2 + r() * 0.4)]); } }
  // nascer e pôr do sol hoje aqui (minuto a minuto)
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0); let rise = null, set = null, prev = null;
  for (let m = 0; m <= 1440; m += 2) { const ms = d0.getTime() + m * 60000, a = altOf(sunEq(ms), ms, p.lat, p.lon) + 0.833; if (prev !== null) { if (prev < 0 && a >= 0 && !rise) rise = ms; if (prev >= 0 && a < 0) set = ms; } prev = a; }
  const NX = 180, NY = 68, nc = Object.assign(document.createElement('canvas'), { width: NX, height: NY });
  return { w, h, p, lonC, X, Y, land: path(W.land, true), borders: path(W.borders, false), grid: path(W.grid, false), lights, rise, set,
    nc, nx: nc.getContext('2d'), img: new ImageData(NX, NY), NX, NY, nightAt: -1 };
}
export function terra(ctx, w, h, t, color) {
  const W = world();
  ctx.fillStyle = '#020812'; ctx.fillRect(0, 0, w, h);
  if (!W) {
    if (WM.failed || (!WM.loading && t > 1) || t > 12) return true;
    hudText(ctx, h, ['TERRA · carregando o mapa…'], w / 2, h * 0.45, 'center'); return;
  }
  const now = Date.now();
  if (!TS || t < TS.last || TS.w !== w || TS.h !== h) TS = terraInit(W, w, h, here(), now);
  TS.last = t;
  const replay = t < 8, sim = replay ? now - 86400000 * (1 - ease(t / 8)) : now;   // as últimas 24 horas passando, e depois o agora
  const S = TS, sun = sunEq(sim), [slon, sdec] = below(sun, sim), relX = lon => S.X(wrap(lon - S.lonC));
  ctx.fillStyle = color; ctx.globalAlpha = 0.2; ctx.fill(S.land); ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.6, h * 0.0025); ctx.globalAlpha = 0.07; ctx.stroke(S.grid);
  ctx.globalAlpha = 0.25; ctx.stroke(S.borders); ctx.globalAlpha = 0.75; ctx.lineWidth = Math.max(0.8, h * 0.004); ctx.stroke(S.land); ctx.globalAlpha = 1;
  if (Math.abs(sim - S.nightAt) > 60000) {                          // sombra da noite, com o crepúsculo
    S.nightAt = sim; const d = S.img.data, sd = Math.sin(sdec * RAD), cd = Math.cos(sdec * RAD);
    for (let j = 0; j < S.NY; j++) {
      const la = (75 - (j + 0.5) / S.NY * 135) * RAD, a1 = Math.sin(la) * sd, a2 = Math.cos(la) * cd;
      for (let i = 0; i < S.NX; i++) {
        const lon = S.lonC + ((i + 0.5) / S.NX - 0.5) * 360, alt = Math.asin(clamp(a1 + a2 * Math.cos((lon - slon) * RAD), -1, 1)) / RAD;
        const o = (j * S.NX + i) * 4; d[o] = 1; d[o + 1] = 3; d[o + 2] = 10; d[o + 3] = 205 * clamp((0.8 - alt) / 12.8);
      }
    }
    S.nx.putImageData(S.img, 0, 0);
  }
  ctx.imageSmoothingEnabled = true; ctx.drawImage(S.nc, 0, 0, w, h);
  const sd = Math.sin(sdec * RAD), cd = Math.cos(sdec * RAD), lr = Math.max(1, h * 0.006);
  ctx.fillStyle = '#ffd98a';                                        // luzes das cidades no escuro
  for (const [la, lo, s] of S.lights) {
    const alt = Math.asin(clamp(Math.sin(la * RAD) * sd + Math.cos(la * RAD) * cd * Math.cos((lo - slon) * RAD), -1, 1)) / RAD, n = clamp((-alt - 2) / 8);
    if (n <= 0) continue;
    const y = S.Y(la); if (y < 0 || y > h) continue;
    ctx.globalAlpha = n * clamp(0.35 + s * 0.65); ctx.fillRect(relX(lo) - lr / 2, y - lr / 2, lr * (0.6 + s), lr * (0.6 + s));
  }
  ctx.globalAlpha = 1;
  const sx = relX(slon), sy = S.Y(sdec), sr = Math.max(4, h * 0.03);  // Sol bem em cima de onde é meio-dia
  const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4); gl.addColorStop(0, 'rgba(255,220,120,.55)'); gl.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = gl; ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
  ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
  const [mra, mdec, lit] = moonEq(sim), [mlon] = below([mra, mdec], sim), mx = relX(mlon), my = S.Y(mdec), mr = sr * 0.7;
  ctx.fillStyle = '#20232a'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ece8d8'; ctx.globalAlpha = 0.25 + 0.75 * lit; ctx.beginPath(); ctx.arc(mx, my, mr * (0.45 + 0.55 * lit), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  say(ctx, h, `Lua ${Math.round(lit * 100)}%`, mx + mr + 3, my - mr, 0.6);
  const cxp = relX(S.p.lon), cyp = S.Y(S.p.lat), pr = (t * 0.7) % 1;  // o carro
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 1 - pr; ctx.beginPath(); ctx.arc(cxp, cyp, h * 0.02 + h * 0.06 * pr, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cxp, cyp, Math.max(2, h * 0.012), 0, TAU); ctx.fill();
  say(ctx, h, S.p.padrao ? 'SÃO PAULO' : 'VOCÊ', cxp + h * 0.03, cyp - h * 0.035, 0.9);
  const simD = new Date(sim), quando = replay ? `${simD.toDateString() === new Date(now).toDateString() ? 'hoje' : 'ontem'} ${hhmm(sim)}` : `agora · ${hhmm(now)}`;
  const aqui = altOf(sun, sim, S.p.lat, S.p.lon) > -0.833 ? 'aqui é dia' : 'aqui é noite';
  const sol = S.rise && S.set ? `o sol nasce ${hhmm(S.rise)} e se põe ${hhmm(S.set)}` : null;
  hudText(ctx, h, [`TERRA · ${quando}`, sol ? `${aqui} · ${sol}` : aqui], w * 0.14, h * 0.08);
}

// =====================================================================================
// AVIÕES PASSANDO AGORA: o radar dos aviões em volta do carro, pelos sinais que os próprios aviões transmitem (ADS-B,
// rede aberta adsb.lol). Os sites de aviões não deixam o painel ler direto, então passa por um intermediário seu
// (Cloudflare Worker, código em cloudflare/avioes.js). A rota de cada voo vem do adsbdb. Entre uma leitura e outra
// (a cada 10 s) cada avião segue no rumo e na velocidade que informou, para andar liso na tela.
const AV_PADRAO = 'https://tr4-avioes.perdeuplayboy.workers.dev';  // o intermediário no Cloudflare
const AV = { list: [], at: 0, loading: false, fail: 0, routes: null, asking: 0, trail: new Map(), tAt: 0 };
const PLANE_D = 'M0,-10L1.5,-7L1.5,-2L9,3L9,5L1.5,2.5L1.2,7L4,9L4,10.5L0,9.5L-4,10.5L-4,9L-1.2,7L-1.5,2.5L-9,5L-9,3L-1.5,-2L-1.5,-7Z';   // avião visto de cima
let PLANE = null;
const CAT = { A1: 0.65, A2: 0.8, A3: 1, A4: 1.1, A5: 1.3 };
const avUrl = () => load('avioesUrl', null) || AV_PADRAO;
function predict(a, ms) {                                           // onde o avião está agora, seguindo rumo e velocidade
  const km = a.gs * 1.852 * clamp((ms - a.at) / 3600000, 0, 60 / 3600), tr = a.trk * RAD;
  return [a.lat + km * Math.cos(tr) / 110.57, a.lon + km * Math.sin(tr) / (111.32 * Math.cos(a.lat * RAD))];
}
async function loadPlanes(p) {
  AV.loading = true;
  try {
    const j = await (await fetch(`${avUrl()}?lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}&r=80`, { signal: AbortSignal.timeout(10000) })).json();
    const now = Date.now(), old = new Map(AV.list.map(a => [a.hex, a]));
    AV.list = (j.ac || j.aircraft || []).filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon) && (a.seen_pos ?? 0) < 60).map(a => {
      const ground = a.alt_baro === 'ground', prev = old.get(a.hex);
      return { hex: a.hex, cs: (a.flight || '').trim(), reg: a.r || '', type: a.t || '', cat: a.category || '', lat: a.lat, lon: a.lon,
        at: now - (a.seen_pos || 0) * 1000, gs: a.gs || 0, trk: a.track ?? a.true_heading ?? 0, ground,
        alt: ground ? 0 : (a.alt_geom ?? a.alt_baro ?? 0) * 0.3048, vs: a.baro_rate ?? a.geom_rate ?? 0,
        from: prev?.shown || null, fromAt: now };                   // de onde estava desenhado, para não dar pulo
    });
    AV.at = now; AV.fail = 0;
  } catch { AV.fail++; }
  AV.loading = false;
}
function route(cs) {                                                // de onde vem e para onde vai (fica guardado por 3 dias)
  if (!AV.routes) AV.routes = load('rotas', {});
  if (!cs || !/^[A-Z]{3}\d/.test(cs)) return null;                  // só voos de companhia (GLO1234), não prefixos de avião
  const r = AV.routes[cs];
  if (r && Date.now() - r.at < 3 * 86400000) return r.v;
  if (Date.now() - AV.asking > 1200 && online()) {
    AV.asking = Date.now(); AV.routes[cs] = { at: Date.now(), v: null };
    fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`, { signal: AbortSignal.timeout(8000) }).then(x => x.json()).then(j => {
      const f = j?.response?.flightroute, ap = a => a && { code: a.iata_code || a.icao_code, city: a.municipality, lat: a.latitude, lon: a.longitude };
      AV.routes[cs] = { at: Date.now(), v: f ? { from: ap(f.origin), to: ap(f.destination) } : null };
      const keys = Object.keys(AV.routes).sort((a, b) => AV.routes[b].at - AV.routes[a].at);
      keep('rotas', Object.fromEntries(keys.slice(0, 400).map(k => [k, AV.routes[k]])));
    }).catch(() => { delete AV.routes[cs]; });
  }
  return null;
}
let AS = null;
export function avioes(ctx, w, h, t, color) {
  if (!avUrl()) return true;                                        // sem o intermediário configurado, não tem como
  const p = here(), now = Date.now();
  if (now - AV.at > 10000 && !AV.loading && online()) loadPlanes(p);
  ctx.fillStyle = '#02050a'; ctx.fillRect(0, 0, w, h);
  if (!AV.at || now - AV.at > 120000) {
    if ((!AV.loading && (AV.fail || !online())) || t > 10) return true;
    hudText(ctx, h, ['AVIÕES · procurando…'], w / 2, h * 0.45, 'center'); return;
  }
  const W = world();
  const cx = w * 0.34, cy = h * 0.5, k = h * 0.44 / 50;             // 50 km até a borda de cima
  const kx = 111.32 * Math.cos(p.lat * RAD) * k, ky = 110.57 * k, P = (la, lo) => [cx + (lo - p.lon) * kx, cy - (la - p.lat) * ky];
  if (!AS || AS.w !== w || AS.h !== h || AS.lat !== p.lat || AS.lon !== p.lon || (W && !AS.coast)) {
    AS = { w, h, lat: p.lat, lon: p.lon, coast: null };
    if (W) {                                                        // litoral e fronteiras por perto, de fundo
      const coast = new Path2D(), near = ({ ll }) => { for (let q = 0; q < ll.length; q += 2) if (Math.abs(ll[q + 1] - p.lat) < 4 && Math.abs(wrap(ll[q] - p.lon)) < 8) return true; return false; };
      for (const r of [...W.land.filter(near), ...W.borders.filter(near)]) { const ll = r.ll; for (let q = 0; q < ll.length; q += 2) { const [x, y] = P(ll[q + 1], ll[q]); q ? coast.lineTo(x, y) : coast.moveTo(x, y); } }
      AS.coast = coast;
    }
  }
  if (AS.coast) { ctx.strokeStyle = color; ctx.globalAlpha = 0.3; ctx.lineWidth = Math.max(1, h * 0.004); ctx.stroke(AS.coast); ctx.globalAlpha = 1; }
  const fs = Math.max(10, h * 0.05), lw = Math.max(1, h * 0.004);
  ctx.strokeStyle = color; ctx.lineWidth = lw;                      // círculos de 10, 25 e 50 km
  for (const r of [10, 25, 50]) { ctx.globalAlpha = r === 50 ? 0.3 : 0.18; ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.stroke(); }
  const marks = [];                                                 // o que os nomes dos aviões não podem cobrir
  ctx.globalAlpha = 0.5; ctx.fillStyle = HUD; ctx.font = `${fs * 0.85}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const r of [10, 25, 50]) {
    const x = cx - r * k * 0.71 - 3, y = cy + r * k * 0.71, s = `${r} km`, tw = ctx.measureText(s).width;   // embaixo à esquerda de cada círculo
    ctx.textAlign = 'right'; ctx.fillText(s, x, y); marks.push([x - tw - 2, y - fs * 0.5, x + 2, y + fs * 0.5]);
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a5a'; ctx.globalAlpha = 0.9; ctx.fillText('N', cx, cy - 50 * k + fs * 0.6);
  ctx.globalAlpha = 1;
  for (const a of AV.list) {                                        // posição de agora, sem pulo quando chega leitura nova
    let [la, lo] = predict(a, now);
    if (a.from && now - a.fromAt < 1500) { const q = 1 - ease((now - a.fromAt) / 1500), [la0, lo0] = predict(a, a.fromAt); la += (a.from[0] - la0) * q; lo += (a.from[1] - lo0) * q; }
    a.shown = [la, lo]; a.xy = P(la, lo); a.km = kmBetween(p, { lat: la, lon: lo }); a.label = null;
  }
  if (now - AV.tAt > 2500) {                                        // rastro dos últimos 2 minutos
    AV.tAt = now; const seen = new Set();
    for (const a of AV.list) { seen.add(a.hex); const tr = AV.trail.get(a.hex) || []; tr.push(a.shown); if (tr.length > 48) tr.shift(); AV.trail.set(a.hex, tr); }
    for (const k2 of [...AV.trail.keys()]) if (!seen.has(k2)) AV.trail.delete(k2);
  }
  const airports = new Map();
  for (const a of AV.list) {
    const tr = AV.trail.get(a.hex);
    if (tr?.length > 1) {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.globalAlpha = a.ground ? 0.12 : 0.35; ctx.beginPath();
      tr.forEach(([la, lo], i) => { const [x, y] = P(la, lo); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.lineTo(...a.xy); ctx.stroke();
    }
    if (a.km < 70 && !a.ground) { a.route = route(a.cs); for (const ap of [a.route?.from, a.route?.to]) if (ap?.lat != null) airports.set(ap.code, ap); }
  }
  ctx.globalAlpha = 1;
  for (const ap of airports.values()) {                             // aeroportos das rotas que caem no mapa
    const [x, y] = P(ap.lat, ap.lon); if (x < 0 || x > w || y < 0 || y > h) continue;
    ctx.fillStyle = HUD; ctx.globalAlpha = 0.6; ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    ctx.font = `${fs * 0.85}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(ap.code, x + 6, y);
    marks.push([x - 4, y - fs * 0.5, x + 8 + ctx.measureText(ap.code).width, y + fs * 0.5]);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, h * 0.012), 0, TAU); ctx.fill();   // o carro
  const n50 = AV.list.filter(a => a.km <= 50 && !a.ground).length, flying = AV.list.filter(a => !a.ground).sort((a, b) => a.km - b.km);
  const near = flying[0], who = a => a.cs || a.reg || a.hex.toUpperCase();
  const hud = ['AVIÕES AGORA', `${n50} no raio de 50 km`, near ? `mais perto: ${who(near)} a ${fmtN(near.km)} km` : 'nenhum voando por perto', p.padrao ? 'sem GPS: centro de São Paulo' : null].filter(Boolean);
  const hfs = Math.max(10, h * 0.055), hx = w * 0.64; ctx.font = `${hfs}px monospace`;
  const taken = [[hx - 6, 0, hx + Math.max(...hud.map(s => ctx.measureText(s).width)) + 6, h * 0.08 + hud.length * hfs * 1.3 + 4], [w * 0.55, h * 0.7, w, h], ...marks];   // texto do canto, relógio e marcas
  const free = b => !taken.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  ctx.font = `${fs}px monospace`;
  let labels = 0;
  for (const a of flying) {                                         // nome, altura e rota dos mais perto, sem trombar
    if (labels >= 6 || a.km > 90) break;
    const [x, y] = a.xy; if (x < 0 || x > w || y < 0 || y > h) continue;
    const vs = a.vs > 300 ? ' ↑' : a.vs < -300 ? ' ↓' : '', rt = a.route;
    const lines = [`${who(a)}${a.type ? ' · ' + a.type : ''}`, `${fmtN(a.alt)} m${vs} · ${fmtN(a.gs * 1.852)} km/h`];
    if (rt?.from?.city && rt?.to?.city) lines.push(`${rt.from.city} → ${rt.to.city}`.slice(0, 34));
    const tw = Math.max(...lines.map(s => ctx.measureText(s).width)), th = lines.length * fs * 1.15, r = h * 0.04;
    for (const [dx, dy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
      const x0 = dx > 0 ? x + r : x - r - tw, y0 = dy < 0 ? y - r - th : y + r, b = [x0 - 2, y0 - 2, x0 + tw + 2, y0 + th + 2];
      if (x0 < w * 0.06 || x0 + tw > w * 0.97 || y0 < h * 0.04 || y0 + th > h * 0.96 || !free(b)) continue;
      taken.push(b); a.label = [lines, x0, y0]; labels++; break;
    }
  }
  for (const a of AV.list) {
    const [x, y] = a.xy; if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
    const s = h * 0.0045 * (CAT[a.cat] || 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a.trk * RAD); ctx.scale(s, s);
    ctx.globalAlpha = a.ground ? 0.35 : 1; ctx.fillStyle = a.ground ? '#7a8a96' : a.label ? '#ffffff' : color;
    if (a.cat === 'A7') { ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.fillRect(-10, -0.8, 20, 1.6); ctx.fillRect(-0.8, -10, 1.6, 20); }   // helicóptero
    else ctx.fill(PLANE ||= new Path2D(PLANE_D));
    ctx.restore();
    if (a.label) {
      const [lines, x0, y0] = a.label;
      ctx.font = `${fs}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = HUD; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      lines.forEach((s2, i) => { ctx.globalAlpha = i ? 0.7 : 0.95; ctx.fillText(s2, x0, y0 + i * fs * 1.15); });
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;
  hudText(ctx, h, hud, hx, h * 0.08);
  say(ctx, h, 'dados: adsb.lol · adsbdb', w * 0.13, h * 0.86, 0.35);
}
