// Mais cenas com dados ao vivo do lugar onde o carro está:
// radar de chuva (RainViewer), vento agora (Open-Meteo), qualidade do ar (Open-Meteo) e a Lua de hoje com os
// próximos eventos do céu (foto da NASA; eclipses, superluas e chuvas de meteoros calculados aqui, pelo Meeus).
// O que baixa fica guardado; sem dados, a cena termina na hora.
import { here, load, keep, hudText, HUD, rng, clamp, coluna, encher, TELA, LER, CIDADE } from './cenas.js';
import { world, cities, kmBetween, sunEq, moonEq, altOf, wrap, hhmm, online, fmtN, say } from './mundo.js';

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const DIRS = ['do norte', 'do nordeste', 'do leste', 'do sudeste', 'do sul', 'do sudoeste', 'do oeste', 'do noroeste'];
const PARA = ['ao norte', 'a nordeste', 'a leste', 'a sudeste', 'ao sul', 'a sudoeste', 'a oeste', 'a noroeste'];
const dir8 = deg => Math.round(((deg % 360) + 360) % 360 / 45) % 8;
const hit = (taken, b) => taken.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

// mapa em volta do carro (o mesmo do radar dos aviões): 25 km do carro até a borda de cima
function mapa(w, h, p) {
  const cx = w * 0.34, cy = h * 0.5, k = h * 0.44 / 25, kx = 111.32 * Math.cos(p.lat * RAD) * k, ky = 110.57 * k;
  return { cx, cy, k, P: (la, lo) => [cx + (lo - p.lon) * kx, cy - (la - p.lat) * ky], inv: (x, y) => [p.lat - (y - cy) / ky, p.lon + (x - cx) / kx] };
}
// fundo comum dos mapas: litoral, até 10 cidades (as grandes e as de perto) e o carro, sem cobrir o que já está em taken
const MP = { key: '', coast: null };
function fundoMapa(ctx, w, h, p, M, color, taken, alpha = 1) {
  const W = world(), key = `${w}x${h}:${p.lat},${p.lon}:${!!W}`;
  if (MP.key !== key) {
    MP.key = key; MP.coast = null;
    if (W) {
      const coast = new Path2D(), near = ({ ll }) => { for (let q = 0; q < ll.length; q += 2) if (Math.abs(ll[q + 1] - p.lat) < 4 && Math.abs(wrap(ll[q] - p.lon)) < 8) return true; return false; };
      for (const r of [...W.land.filter(near), ...W.borders.filter(near)]) { const ll = r.ll; for (let q = 0; q < ll.length; q += 2) { const [x, y] = M.P(ll[q + 1], ll[q]); q ? coast.lineTo(x, y) : coast.moveTo(x, y); } }
      MP.coast = coast;
    }
  }
  if (MP.coast) { ctx.strokeStyle = color; ctx.globalAlpha = 0.3 * alpha; ctx.lineWidth = Math.max(1, h * 0.004); ctx.stroke(MP.coast); }
  const fs = Math.max(10, h * 0.05), CL = cities(p);
  if (CL) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const pick = CL.map(c => ({ c, d: kmBetween(p, c) })).filter(o => o.d <= 55).sort((a, b) => b.c.pop / (1 + b.d / 10) - a.c.pop / (1 + a.d / 10));
    let n = 0;
    for (const { c } of pick) {
      if (n >= 10) break;
      const cfs = Math.max(9, h * CIDADE); ctx.font = `${cfs}px system-ui, sans-serif`;   // o mesmo tamanho em todos os radares, sem negrito
      const [x, y] = M.P(c.lat, c.lon), tw = ctx.measureText(c.n).width, dr = Math.max(1.2, h * 0.0052);
      for (const [x0, y0] of [[x + dr + 3, y], [x - dr - 3 - tw, y], [x - tw / 2, y - cfs * 0.95], [x - tw / 2, y + cfs * 0.95]]) {
        const b = [x0 - 2, y0 - cfs * 0.55, x0 + tw + 2, y0 + cfs * 0.55];
        if (x0 < w * 0.03 || x0 + tw > w * 0.98 || b[1] < h * 0.01 || b[3] > h * 0.99 || hit(taken, b)) continue;
        taken.push(b); n++;
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85 * alpha; ctx.beginPath(); ctx.arc(x, y, dr * 1.4, 0, TAU); ctx.fill();
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.globalAlpha = 0.92 * alpha; ctx.fillText(c.n, x0, y0); ctx.shadowBlur = 0; break;
      }
    }
  }
  ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(M.cx, M.cy, Math.max(2, h * 0.012), 0, TAU); ctx.fill();
}

// =====================================================================================
// RADAR DE CHUVA: a chuva das últimas 2 horas andando sobre o mapa da região, quadro a quadro de 10 em 10 minutos
// (radares do RainViewer), e no fim o agora. Diz se está chovendo aí ou a que distância está a chuva mais perto.
const RV = { host: '', frames: null, at: 0, loading: false, img: new Map(), near: null, nearAt: '' };
async function loadRadar() {
  RV.loading = true;
  try {
    const j = await (await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: AbortSignal.timeout(12000) })).json();
    if (j?.radar?.past?.length) { RV.host = j.host; RV.frames = j.radar.past; RV.at = Date.now(); }
  } catch {}
  RV.loading = false;
}
function radarImg(url) {
  let im = RV.img.get(url);
  if (!im) {
    im = new Image(); im.crossOrigin = 'anonymous'; im.src = url; RV.img.set(url, im);
    if (RV.img.size > 160) RV.img.delete(RV.img.keys().next().value);
  }
  return im.complete && im.naturalWidth ? im : null;
}
function radarTiles(w, h, p) {                                      // os pedaços do radar que cobrem a tela
  const M = mapa(w, h, p), z = 7, N = 2 ** z, [laT, loL] = M.inv(0, 0), [laB, loR] = M.inv(w, h);
  const ty = la => Math.floor((1 - Math.log(Math.tan(la * RAD) + 1 / Math.cos(la * RAD)) / Math.PI) / 2 * N);
  const tiles = [];
  for (let x = Math.floor((loL + 180) / 360 * N); x <= Math.floor((loR + 180) / 360 * N); x++) for (let y = ty(laT); y <= ty(laB); y++) tiles.push([x, y]);
  return { z, N, tiles };
}
async function chuvaPrep() {                                        // também chamada antes de a cena entrar: já baixa os quadros
  if ((!RV.frames || Date.now() - RV.at > 5 * 60000) && !RV.loading && online()) await loadRadar();
  if (RV.frames && RV.wh) { const { z, tiles } = radarTiles(RV.wh[0], RV.wh[1], here()); for (const f of RV.frames) for (const [x, y] of tiles) radarImg(`${RV.host}${f.path}/256/${z}/${x}/${y}/2/1_1.png`); }
}
const tileLon = (x, n) => x / n * 360 - 180, tileLat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / RAD;
let RS = null;
export function chuva(ctx, w, h, t, color) {
  RV.wh = [w, h];                                                   // o tamanho da tela, para a próxima vez já baixar antes
  if ((!RV.frames || Date.now() - RV.at > 5 * 60000) && !RV.loading && online()) loadRadar();
  ctx.fillStyle = '#03060b'; ctx.fillRect(0, 0, w, h);
  if (!RV.frames || Date.now() - RV.at > 30 * 60000) {
    if ((!RV.loading && t > 1) || t > 10) return true;
    hudText(ctx, h, ['RADAR DE CHUVA · carregando…'], w / 2, h * 0.45, 'center'); return;
  }
  const p = here(), M = mapa(w, h, p), F = RV.frames, n = F.length;
  const pk = `${w}x${h}:${p.lat},${p.lon}`;
  if (!RS || t < RS.last || RS.pk !== pk) {
    const { z, N, tiles } = radarTiles(w, h, p);
    const oc = Object.assign(document.createElement('canvas'), { width: Math.round(w / 2), height: Math.round(h / 2) });
    RS = { pk, z, N, tiles, oc, ox: oc.getContext('2d', { willReadFrequently: true }), drawn: '' };
    for (const f of RV.frames) for (const [x, y] of tiles) radarImg(`${RV.host}${f.path}/256/${z}/${x}/${y}/2/1_1.png`);   // já pede todos os quadros
  }
  RS.last = t;
  const step = 0.45, hold = 3, cyc = (n - 1) * step + hold, tc = t % cyc, fi = Math.min(n - 1, Math.floor(tc / step)), fr = F[fi];
  // o quadro da vez, montado com os pedaços do radar (cada pedaço já vem pronto do RainViewer)
  const key = `${fr.path}:${pk}`;
  let ready = true;
  if (RS.drawn !== key) {
    const g = RS.ox, sx = RS.oc.width / w;
    g.clearRect(0, 0, RS.oc.width, RS.oc.height);
    for (const [x, y] of RS.tiles) {
      const im = radarImg(`${RV.host}${fr.path}/256/${RS.z}/${x}/${y}/2/1_1.png`); if (!im) { ready = false; continue; }
      const [x0, y0] = M.P(tileLat(y, RS.N), tileLon(x, RS.N)), [x1, y1] = M.P(tileLat(y + 1, RS.N), tileLon(x + 1, RS.N));
      g.drawImage(im, x0 * sx, y0 * sx, (x1 - x0) * sx, (y1 - y0) * sx);
    }
    if (ready) RS.drawn = key;
    if (ready && fi === n - 1 && RV.nearAt !== key) {                // no quadro de agora: onde está a chuva mais perto
      RV.nearAt = key;
      try {
        const d = g.getImageData(0, 0, RS.oc.width, RS.oc.height).data, W2 = RS.oc.width; let best = null;
        for (let i = 3; i < d.length; i += 16) {
          if (d[i] < 60) continue;
          const px = ((i - 3) / 4) % W2, py = Math.floor((i - 3) / 4 / W2), [la, lo] = M.inv(px / sx, py / sx), km = kmBetween(p, { lat: la, lon: lo });
          if (km <= 60 && (!best || km < best.km)) best = { km, la, lo };
        }
        RV.near = best ? { ...best, dir: Math.atan2((best.lo - p.lon) * Math.cos(p.lat * RAD), best.la - p.lat) / RAD } : { km: Infinity };
      } catch { RV.near = null; }
    }
  }
  ctx.globalAlpha = 0.9; ctx.imageSmoothingEnabled = true; ctx.drawImage(RS.oc, 0, 0, w, h); ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, h * 0.004);
  for (const r of [10, 25]) { ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.arc(M.cx, M.cy, r * M.k, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const ago = Math.round((F[n - 1].time - fr.time) / 60), quando = ago ? `há ${ago} min · ${hhmm(fr.time * 1000)}` : `agora · ${hhmm(fr.time * 1000)}`;
  const nr = RV.near, situ = !nr ? '' : nr.km <= 3 ? 'está chovendo aí' : nr.km === Infinity ? 'sem chuva num raio de 60 km' : `chuva mais perto: ${fmtN(nr.km)} km ${PARA[dir8(nr.dir)]}`;
  const hx = w * 0.6, tw = w * 0.97 - hx, fs = Math.max(10, h * 0.075), fim = h * 0.97;
  const itens = [situ ? [situ, 1, '#ffffff', LER, '600 ', 3] : null, [quando, 0.8, HUD, LER * 0.8, '', 1]];
  const sc = encher(ctx, h, itens, hx, h * 0.04, tw, fim, 2.2, false), yEnd = coluna(ctx, h, itens, hx, h * 0.04, tw, fim, false, sc);
  const x0 = w * 0.05, x1 = w * 0.5, yb = h * 0.92, taken = [[hx - 8, 0, w, yEnd + 4], [w * 0.55, h * 0.7, w, h], [x0 - 10, yb - fs * 1.4, x1 + 10, h]];
  fundoMapa(ctx, w, h, p, M, color, taken);
  ctx.strokeStyle = HUD; ctx.globalAlpha = 0.35; ctx.lineWidth = Math.max(1, h * 0.006); ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x1, yb); ctx.stroke();
  const cx = x0 + (x1 - x0) * fi / (n - 1);
  ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, yb, Math.max(3, h * 0.018), 0, TAU); ctx.fill();
  say(ctx, h, '-2 h', x0, yb - fs * 1.35, 0.55); say(ctx, h, 'agora', x1, yb - fs * 1.35, 0.75, HUD, 'right');
  coluna(ctx, h, itens, hx, h * 0.04, tw, fim, true, sc);
}

// =====================================================================================
// VENTO AGORA: milhares de partículas levadas pelo vento de verdade, medido agora em 35 pontos da região (Open-Meteo).
// Mais rápido e mais amarelo onde venta mais.
const VT = { key: '', g: null, at: 0, loading: false };
async function loadWind(p, key) {
  VT.loading = true;
  try {
    const las = [], los = [], ny = 5, nx = 7, la0 = p.lat - 0.5, lo0 = p.lon - 1.5;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { las.push((la0 + j * 0.25).toFixed(2)); los.push((lo0 + i * 0.5).toFixed(2)); }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${las}&longitude=${los}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh`;
    let j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json(); if (!Array.isArray(j)) j = [j];
    const c = j.map(o => o.current), g = { la0, lo0, dla: 0.25, dlo: 0.5, nx, ny, spd: c.map(o => o.wind_speed_10m), dirs: c.map(o => o.wind_direction_10m), gust: c.map(o => o.wind_gusts_10m) };
    g.u = g.spd.map((s, i) => -s * Math.sin(g.dirs[i] * RAD)); g.v = g.spd.map((s, i) => -s * Math.cos(g.dirs[i] * RAD));   // para onde o vento vai
    if (VT.key === key) { VT.g = g; VT.at = Date.now(); keep('vento', { key, at: VT.at, g }); }
  } catch {}
  VT.loading = false;
}
function windAt(g, la, lo) {                                        // vento (km/h, leste e norte) num ponto, entre as medições
  const fj = clamp((la - g.la0) / g.dla, 0, g.ny - 1.001), fi = clamp((lo - g.lo0) / g.dlo, 0, g.nx - 1.001), j = fj | 0, i = fi | 0, a = fj - j, b = fi - i;
  const at = (arr, jj, ii) => arr[jj * g.nx + ii], mix = arr => (at(arr, j, i) * (1 - b) + at(arr, j, i + 1) * b) * (1 - a) + (at(arr, j + 1, i) * (1 - b) + at(arr, j + 1, i + 1) * b) * a;
  return [mix(g.u), mix(g.v)];
}
let VS = null;
function ventoPrep() {
  const p = here(), key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  if (VT.key !== key) { VT.key = key; VT.g = null; const c = load('vento', null); if (c?.key === key) { VT.g = c.g; VT.at = c.at; } }
  if ((!VT.g || Date.now() - VT.at > 30 * 60000) && !VT.loading && online()) loadWind(p, key);
}
export function vento(ctx, w, h, t, color) {
  const p = here(), key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  ventoPrep();
  ctx.fillStyle = '#03060b'; ctx.fillRect(0, 0, w, h);
  if (!VT.g || Date.now() - VT.at > 3 * 3600000) {
    if ((!VT.loading && t > 1) || t > 10) return true;
    hudText(ctx, h, ['VENTO · carregando…'], w / 2, h * 0.45, 'center'); return;
  }
  const g = VT.g, M = mapa(w, h, p);
  if (!VS || t < VS.last || VS.w !== w || VS.h !== h) {
    const tc = Object.assign(document.createElement('canvas'), { width: Math.round(w), height: Math.round(h) });
    VS = { w, h, tc, tx: tc.getContext('2d'), P: Array.from({ length: 700 }, () => [Math.random() * w, Math.random() * h, Math.random() * 3]) };
  }
  const dt = clamp(t - (VS.last ?? t), 0, 0.1); VS.last = t;
  const tx = VS.tx, sp = h * 0.12;                                // 10 km/h anda 12% da altura por segundo
  tx.globalCompositeOperation = 'destination-out'; tx.fillStyle = 'rgba(0,0,0,0.06)'; tx.fillRect(0, 0, w, h); tx.globalCompositeOperation = 'source-over';
  tx.lineWidth = Math.max(1, h * 0.005); tx.lineCap = 'round';
  const groups = [[], [], [], []];
  for (const q of VS.P) {
    const [la, lo] = M.inv(q[0], q[1]), [u, v] = windAt(g, la, lo), s = Math.hypot(u, v), x0 = q[0], y0 = q[1];
    const vis = s > 0.1 ? sp * (1.5 + s) / 10 / s : 0;             // vento fraco ainda anda um pouco na tela, para dar para ver o rumo
    q[0] += u * vis * dt; q[1] -= v * vis * dt; q[2] -= dt;
    groups[s < 6 ? 0 : s < 20 ? 1 : s < 40 ? 2 : 3].push(x0, y0, q[0], q[1]);
    if (q[2] < 0 || q[0] < 0 || q[0] > w || q[1] < 0 || q[1] > h) { q[0] = Math.random() * w; q[1] = Math.random() * h; q[2] = 1 + Math.random() * 3; }
  }
  [[color, 0.45], [color, 0.85], ['#ffe08a', 0.9], ['#ff8a5a', 0.95]].forEach(([c, a], gi) => {
    const L = groups[gi]; if (!L.length) return;
    tx.strokeStyle = c; tx.globalAlpha = a; tx.beginPath(); for (let i = 0; i < L.length; i += 4) { tx.moveTo(L[i], L[i + 1]); tx.lineTo(L[i + 2], L[i + 3]); } tx.stroke();
  });
  tx.globalAlpha = 1;
  ctx.drawImage(VS.tc, 0, 0, w, h);
  // o vento aqui (o ponto do meio da grade) e na região
  const mid = Math.floor(g.ny / 2) * g.nx + Math.floor(g.nx / 2), sHere = g.spd[mid], gHere = g.gust[mid];
  const nome = s => s < 6 ? 'quase parado' : s < 20 ? 'fraco' : s < 40 ? 'moderado' : s < 60 ? 'forte' : 'muito forte';
  const hx = w * 0.6, tw = w * 0.97 - hx, fim = h * 0.97;
  const itens = [[`${fmtN(sHere)} km/h`, 1, '#ffffff', 0.15, '700 '],
    [`${sHere < 2 ? '' : DIRS[dir8(g.dirs[mid])] + ' · '}${nome(sHere)}`, 0.9], [`rajadas até ${fmtN(gHere)} km/h`, 0.85],
    [`na região: ${fmtN(Math.min(...g.spd))} a ${fmtN(Math.max(...g.spd))} km/h`, 0.7]];
  const sc = encher(ctx, h, itens, hx, h * 0.04, tw, fim, 2.2, false), yEnd = coluna(ctx, h, itens, hx, h * 0.04, tw, fim, false, sc);
  fundoMapa(ctx, w, h, p, M, color, [[hx - 8, 0, w, yEnd + 4], [w * 0.55, h * 0.7, w, h]], 0.9);
  ctx.fillStyle = 'rgba(2,4,8,0.55)'; ctx.fillRect(hx - w * 0.02, 0, w, yEnd + h * 0.02);   // o texto não some no meio das linhas do vento
  coluna(ctx, h, itens, hx, h * 0.04, tw, fim, true, sc);
}

// =====================================================================================
// QUALIDADE DO AR: o ar daí agora (Open-Meteo, modelo europeu CAMS): índice de qualidade, poeira fina e grossa,
// ozônio e dióxido de nitrogênio, e o índice UV. As partículas no ar são tantas quanto a poeira fina medida.
const AQ = { key: '', d: null, at: 0, loading: false };
const AQI = [[50, 'bom', '#5fd36b'], [100, 'moderado', '#f2d84a'], [150, 'ruim para quem é sensível', '#f29a3a'], [200, 'ruim', '#e8503a'], [300, 'muito ruim', '#a35bd6'], [1e9, 'péssimo', '#8a3b2c']];
const UVN = [[3, 'baixo'], [6, 'moderado'], [8, 'alto'], [11, 'muito alto'], [99, 'extremo']];
async function loadAir(p, key) {
  AQ.loading = true;
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.lat.toFixed(2)}&longitude=${p.lon.toFixed(2)}` +
      '&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,uv_index,dust&hourly=uv_index&forecast_days=1&timezone=auto';
    const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json(), u = j.hourly?.uv_index || [];
    const im = u.reduce((b, v, i) => v > u[b] ? i : b, 0);
    const d = { ...j.current, uvMax: u[im] ?? null, uvMaxH: j.hourly?.time?.[im]?.slice(11, 13) ?? null };
    if (AQ.key === key) { AQ.d = d; AQ.at = Date.now(); keep('ar', { key, at: AQ.at, d }); }
  } catch {}
  AQ.loading = false;
}
let AS = null;
function arPrep() {
  const p = here(), key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  if (AQ.key !== key) { AQ.key = key; AQ.d = null; const c = load('ar', null); if (c?.key === key) { AQ.d = c.d; AQ.at = c.at; } }
  if ((!AQ.d || Date.now() - AQ.at > 60 * 60000) && !AQ.loading && online()) loadAir(p, key);
}
export function ar(ctx, w, h, t, color) {
  const p = here(), key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  arPrep();
  const now = Date.now(), sunAlt = altOf(sunEq(now), now, p.lat, p.lon), day = sunAlt > -3;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (day) { g.addColorStop(0, '#0a2038'); g.addColorStop(1, '#1d3b5a'); } else { g.addColorStop(0, '#02040b'); g.addColorStop(1, '#0a1428'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (!AQ.d || now - AQ.at > 6 * 3600000) {
    if ((!AQ.loading && t > 1) || t > 10) return true;
    hudText(ctx, h, ['AR · carregando…'], w / 2, h * 0.45, 'center'); return;
  }
  const d = AQ.d, cat = AQI.find(c => (d.us_aqi ?? 0) <= c[0]), pm = d.pm2_5 ?? 0;
  if (!AS || t < AS.last || AS.w !== w || AS.h !== h || AS.pm !== pm) {
    const r = rng(7), n = Math.round(clamp(pm * 30, 40, 1600));
    AS = { w, h, pm, P: Array.from({ length: n }, () => [r() * w, r() * h * 0.85, r() * TAU, 0.6 + r() * 1.6]), hills: Array.from({ length: 41 }, (_, i) => 0.6 + 0.4 * Math.abs(Math.sin(i * 0.9 + 1)) * r()) };
  }
  const dt = clamp(t - (AS.last ?? t), 0, 0.1); AS.last = t;
  const gx = w * 0.2, gy = h * 0.47, gr = h * 0.3, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, av = clamp((d.us_aqi ?? 0) / 300);   // mostrador do índice
  const x0 = w * 0.42, gw = Math.max(3, h * 0.035);
  if (day && sunAlt > 0) {                                          // sol, mais alto quanto mais alto ele está, no vão entre o mostrador e o texto
    const vao = x0 - (gx + gr + gw / 2), sx = gx + gr + gw / 2 + vao / 2, sy = h * (0.75 - 0.6 * clamp(sunAlt / 70)), sr = Math.max(5, Math.min(h * 0.05, vao * 0.3));
    const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4); gl.addColorStop(0, 'rgba(255,220,120,.5)'); gl.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = gl; ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8); ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = cat[2];
  for (const q of AS.P) {                                           // a poeira flutuando
    q[2] += (Math.random() - 0.5) * 0.6; q[0] += (Math.cos(q[2]) * 6 + 2) * dt * h / 200; q[1] += Math.sin(q[2]) * 4 * dt * h / 200;
    if (q[0] > w) q[0] = 0; if (q[0] < 0) q[0] = w; if (q[1] < 0) q[1] = h * 0.85; if (q[1] > h * 0.88) q[1] = 0;
    ctx.globalAlpha = 0.45; ctx.fillRect(q[0], q[1], q[3] * Math.max(1, h / 250), q[3] * Math.max(1, h / 250));
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round'; ctx.lineWidth = gw; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(gx, gy, gr, a0, a1); ctx.stroke();
  ctx.strokeStyle = cat[2]; ctx.beginPath(); ctx.arc(gx, gy, gr, a0, a0 + (a1 - a0) * Math.max(0.02, av)); ctx.stroke(); ctx.lineCap = 'butt';
  ctx.fillStyle = cat[2]; ctx.font = `bold ${h * 0.2}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(fmtN(d.us_aqi ?? 0), gx, gy);
  ctx.fillStyle = HUD; ctx.globalAlpha = 0.6; ctx.font = `${Math.max(10, h * 0.06)}px monospace`; ctx.fillText('índice', gx, gy + gr * 0.55); ctx.globalAlpha = 1;
  ctx.fillStyle = '#010205'; ctx.beginPath(); ctx.moveTo(0, h);        // morros
  AS.hills.forEach((v, i) => ctx.lineTo(i / 40 * w, h * (0.9 - v * 0.08))); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  const uv = d.uv_index ?? 0, uvn = UVN.find(u => uv < u[0])[1];
  const tw = w * 0.97 - x0, fim = h * 0.97, bh = Math.max(3, h * 0.03);
  const itens = [[cat[1], 1, cat[2], 0.13, '700 ', 1], null,
    [`poeira fina: ${fmtN(pm)} µg/m³ · grossa: ${fmtN(d.pm10 ?? 0)}`, 0.8],
    [day ? `sol (UV): ${uv.toFixed(0)}, ${uvn}${uv >= 6 ? ' · use protetor' : ''}` : 'sol (UV): 0 · é noite', 0.8],
    d.uvMax != null && d.uvMax > 0 ? [`UV mais forte hoje: ${d.uvMax.toFixed(0)} às ${d.uvMaxH}h`, 0.7] : null,
    (d.dust ?? 0) > 50 ? [`poeira do deserto: ${fmtN(d.dust)} µg/m³`, 0.8] : null,
    [`ozônio ${fmtN(d.ozone ?? 0)} · NO₂ ${fmtN(d.nitrogen_dioxide ?? 0)}`, 0.6]];
  const yCat = coluna(ctx, h, itens.slice(0, 1), x0, h * 0.04, tw, fim);
  const by = yCat + h * 0.01, bw = Math.min(tw, w * 0.36);          // régua do índice, de bom a péssimo
  encher(ctx, h, itens.slice(2), x0, by + bh + h * 0.06, tw, fim, 2.2);
  {
    [[0, 50], [50, 100], [100, 150], [150, 200], [200, 300]].forEach(([a], i) => { ctx.fillStyle = AQI[i][2]; ctx.globalAlpha = 0.8; ctx.fillRect(x0 + i * bw / 5, by, bw / 5 - 2, bh); });
    const v = clamp(d.us_aqi ?? 0, 0, 300), mx = x0 + (v <= 200 ? v / 200 * 0.8 : 0.8 + (v - 200) / 100 * 0.2) * bw;
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 1.5, by - h * 0.02, 3, bh + h * 0.04);
  }
  ctx.globalAlpha = 1;
}

// =====================================================================================
// LUA DE HOJE: a Lua na fase de agora (foto da Lua cheia da NASA com a sombra da fase calculada aqui, virada como se vê
// do hemisfério do carro), quando nasce e se põe aí, e os próximos eventos do céu: lua cheia, superlua, lua azul,
// eclipses da Lua (o total é a "lua de sangue", com aviso se dá para ver daí) e as chuvas de meteoros, com a Lua da noite
// do pico, que é o que mais atrapalha. Eclipses e luas cheias pelo Meeus (Astronomical Algorithms, cap. 47, 49 e 54).
const LUA_FOTO = 'https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/frames/730x730_1x1_30p/moon.0059.jpg';   // Lua cheia de 3/1/2026 (NASA)
const LUA_R = 345 / 730;                                            // raio do disco na foto
const sin = x => Math.sin(x * RAD), cos = x => Math.cos(x * RAD), jdMs = jd => (jd - 2440587.5) * 86400000;
function moonDist(ms) {                                             // distância Terra–Lua em km (erro de dezenas de km)
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525, D = 297.8501921 + 445267.1114034 * T, Ms = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T, F = 93.272095 + 483202.0175233 * T, E = 1 - 0.002516 * T;
  const tr = [[0, 0, 1, 0, -20905355], [2, 0, -1, 0, -3699111], [2, 0, 0, 0, -2955968], [0, 0, 2, 0, -569925], [0, 1, 0, 0, 48888], [0, 0, 0, 2, -3149],
    [2, 0, -2, 0, 246158], [2, -1, -1, 0, -152138], [2, 0, 1, 0, -170733], [2, -1, 0, 0, -204586], [0, 1, -1, 0, -129620], [1, 0, 0, 0, 108743],
    [0, 1, 1, 0, 104755], [2, 0, 0, -2, 10321], [0, 0, 1, -2, 79661], [4, 0, -1, 0, -34782], [0, 0, 3, 0, -23210], [4, 0, -2, 0, -21636],
    [2, 1, -1, 0, 24208], [2, 1, 0, 0, 30824], [1, 0, -1, 0, -8379], [1, 1, 0, 0, -16675], [2, -1, 1, 0, -12831], [2, 0, 2, 0, -10445],
    [4, 0, 0, 0, -11650], [2, 0, -3, 0, 14403], [0, 1, -2, 0, -7003], [2, -1, -2, 0, 10056], [1, 0, 1, 0, 6322], [2, -2, 0, 0, -9884]];
  let s = 0; for (const [d, m, mp, f, c] of tr) s += c * (Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1) * cos(d * D + m * Ms + mp * Mp + f * F);
  return 385000.56 + s / 1000;
}
function fullMoon(k) {                                              // lua cheia de número k (+0,5), com o que o eclipse precisa
  const T = k / 1236.85, E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = 2.5534 + 29.1053567 * k, Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T * T, F = 160.7108 + 390.67050284 * k - 0.0016118 * T * T, O = 124.7746 - 1.56375588 * k;
  const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F)
    + 0.00734 * E * sin(Mp - M) - 0.00515 * E * sin(Mp + M) + 0.00209 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
    + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O);
  return { ms: jdMs(jde) - 69000, k, T, E, M, Mp, F, O };
}
function eclipse(fm) {                                              // eclipse da Lua nessa lua cheia? (cap. 54)
  const { k, T, E, M, Mp, F, O } = fm;
  if (Math.abs(sin(F)) > 0.36) return null;
  const F1 = F - 0.02665 * sin(O), A1 = 299.77 + 0.107408 * k;
  const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.4065 * sin(Mp) + 0.1727 * E * sin(M) + 0.0161 * sin(2 * Mp) - 0.0097 * sin(2 * F1)
    + 0.0073 * E * sin(Mp - M) - 0.005 * E * sin(Mp + M) - 0.0023 * sin(Mp - 2 * F1) + 0.0021 * E * sin(2 * M) + 0.0012 * sin(Mp + 2 * F1) + 0.0006 * E * sin(2 * Mp + M)
    - 0.0004 * sin(3 * Mp) - 0.0003 * E * sin(M + 2 * F1) + 0.0003 * sin(A1) - 0.0002 * E * sin(M - 2 * F1) - 0.0002 * E * sin(2 * Mp - M) - 0.0002 * sin(O);
  const P = 0.207 * E * sin(M) + 0.0024 * E * sin(2 * M) - 0.0392 * sin(Mp) + 0.0116 * sin(2 * Mp) - 0.0073 * E * sin(Mp + M) + 0.0067 * E * sin(Mp - M) + 0.0118 * sin(2 * F1);
  const Q = 5.2207 - 0.0048 * E * cos(M) + 0.002 * E * cos(2 * M) - 0.3299 * cos(Mp) - 0.006 * E * cos(Mp + M) + 0.0041 * E * cos(Mp - M);
  const g = (P * cos(F1) + Q * sin(F1)) * (1 - 0.0048 * Math.abs(cos(F1))), u = 0.0059 + 0.0046 * E * cos(M) - 0.0182 * cos(Mp) + 0.0004 * cos(2 * Mp) - 0.0005 * cos(M + Mp);
  const pen = (1.5573 + u - Math.abs(g)) / 0.545, umb = (1.0128 - u - Math.abs(g)) / 0.545;
  if (pen <= 0.05) return null;                                    // raspão que ninguém nota
  const n = 0.5458 + 0.04 * cos(Mp), semi = hh => hh * hh > g * g ? 60 / n * Math.sqrt(hh * hh - g * g) : 0;
  return { ms: jdMs(jde) - 69000, tipo: umb >= 1 ? 'total' : umb > 0 ? 'parcial' : 'penumbral', half: (umb > 0 ? semi(1.0128 - u) : semi(1.5573 + u)) * 60000 };
}
const sunLon = ms => { const d = ms / 86400000 + 2440587.5 - 2451545, g = (357.529 + 0.98560028 * d) * RAD; return ((280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360 + 360) % 360; };
// chuvas de meteoros: nome, pico (longitude do Sol, IMO), meteoros por hora no melhor caso, declinação do radiante
const CHUVAS = [['Quadrântidas', 283.15, 110, 49], ['Líridas', 32.32, 18, 34], ['Eta Aquáridas', 45.5, 50, -1], ['Delta Aquáridas', 127, 25, -16], ['Perseidas', 140, 100, 58],
  ['Oriônidas', 208, 20, 16], ['Leônidas', 235.27, 15, 22], ['Gemínidas', 262.2, 150, 33], ['Ursídeas', 270.7, 10, 75]];
const litAt = ms => moonEq(ms)[2];
function skyEvents(p, now) {
  const ev = [], fms = [];
  let k = Math.floor((now / 86400000 + 2440587.5 - 2451550.1) / 29.530588861) - 1.5;
  while (fms.length < 32) { const fm = fullMoon(k++); if (fm.ms > now - 30 * 86400000) fms.push(fm); }
  const month = ms => { const d = new Date(ms); return d.getFullYear() * 12 + d.getMonth(); };
  const up = fms.filter(f => f.ms > now - 10 * 3600000);
  up.forEach(f => { f.dist = moonDist(f.ms); const prev = fms[fms.indexOf(f) - 1]; f.azul = !!prev && month(prev.ms) === month(f.ms); });
  const tag = f => [f.dist < 361600 ? `superlua, a ${fmtN(f.dist / 1000)} mil km` : f.dist > 405000 ? 'microlua, a Lua mais longe' : '', f.azul ? 'lua azul (2ª cheia do mês)' : ''].filter(Boolean).join(' · ');
  const nf = up[0]; if (nf) ev.push({ ms: nf.ms, pr: 0, s: `lua cheia${tag(nf) ? ' · ' + tag(nf) : ''}` });
  const sl = up.find(f => f !== nf && f.dist < 361600); if (sl) ev.push({ ms: sl.ms, pr: tag(nf).includes('superlua') ? 5 : 4, s: `superlua · a ${fmtN(sl.dist / 1000)} mil km` });
  const az = up.find(f => f !== nf && f.azul); if (az) ev.push({ ms: az.ms, pr: 6, s: 'lua azul · a 2ª lua cheia do mês' });
  let ne = 0;
  for (const f of up) {                                             // eclipses: o próximo de qualquer tipo e o próximo total
    const e = eclipse(f); if (!e) continue;
    if (ne && e.tipo !== 'total') continue;
    const vis = [e.ms, e.ms - e.half, e.ms + e.half].map(ms => altOf(moonEq(ms), ms, p.lat, p.lon) > 0);
    const daqui = vis[0] ? 'dá para ver daqui' : vis[1] || vis[2] ? 'só um pedaço daqui' : 'não aparece daqui';
    ev.push({ ms: e.ms, pr: e.tipo === 'total' ? 2 : 1, s: `${e.tipo === 'total' ? 'lua de sangue (eclipse total)' : e.tipo === 'parcial' ? 'eclipse parcial da Lua' : 'eclipse penumbral (fraquinho)'} · ${daqui}` });
    if (e.tipo === 'total' || ++ne >= 2) break;
  }
  const lam = sunLon(now);                                          // chuvas de meteoros que sobem bem daí
  for (const [nome, l, zhr, dec] of CHUVAS) {
    const alt = 90 - Math.abs(p.lat - dec); if (alt < 20) continue;
    let ms = now + ((l - lam + 360) % 360) / 0.98565 * 86400000;
    for (let i = 0; i < 3; i++) ms += wrap(l - sunLon(ms)) / 0.98565 * 86400000;
    if (ms < now - 86400000) ms += 365.25 * 86400000;
    const night = new Date(ms); night.setHours(23, 59, 0, 0);
    const rate = Math.max(5, Math.round(zhr * sin(Math.min(alt, 70)) / 5) * 5);
    ev.push({ ms, pr: 3, s: `meteoros ${nome} · até ${rate}/h · lua ${Math.round(litAt(night.getTime()) * 100)}%`, met: true });
  }
  // cabem 5: a próxima cheia, o próximo eclipse, a próxima lua de sangue, a próxima chuva de meteoros e o resto pela data
  const byDate = ev.sort((a, b) => a.ms - b.ms), met = byDate.filter(e => e.met);
  met.forEach((e, i) => { e.pr = i === 0 ? 3 : 4.5; });
  return [...byDate].sort((a, b) => a.pr - b.pr || a.ms - b.ms).slice(0, 5).sort((a, b) => a.ms - b.ms);
}
const fase = (f, wax) => f < 0.03 ? 'lua nova' : f > 0.97 ? 'lua cheia' : f < 0.4 ? (wax ? 'crescente' : 'minguante') : f < 0.6 ? (wax ? 'quarto crescente' : 'quarto minguante') : (wax ? 'crescente quase cheia' : 'minguante, depois da cheia');
let LUA_IM = null;
const luaFoto = () => LUA_IM || (LUA_IM = Object.assign(new Image(), { src: LUA_FOTO }));   // baixa uma vez e fica na memória
let LS = null;
export function lua(ctx, w, h, t, color) {
  const p = here(), now = Date.now();
  if (!LS || t < LS.last || LS.w !== w || LS.h !== h) {
    const [mra, , f] = moonEq(now), [sra] = sunEq(now), wax = ((mra - sra) % 360 + 360) % 360 < 180;
    const d0 = new Date(now); d0.setHours(0, 0, 0, 0); let rise = null, set = null, prev = null;
    for (let m = 0; m <= 1440; m += 5) { const ms = d0.getTime() + m * 60000, a = altOf(moonEq(ms), ms, p.lat, p.lon) - 0.125; if (prev !== null) { if (prev < 0 && a >= 0 && !rise) rise = ms; if (prev >= 0 && a < 0 && !set) set = ms; } prev = a; }
    // sombra da fase (vista do hemisfério norte; no sul a Lua inteira vira de cabeça para baixo)
    const N = 180, mc = Object.assign(document.createElement('canvas'), { width: N, height: N }), mx = mc.getContext('2d'), im = mx.createImageData(N, N);
    const e = Math.acos(clamp(1 - 2 * f, -1, 1)), sx = (wax ? 1 : -1) * Math.sin(e), sz = -Math.cos(e);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = 1 - (j + 0.5) / N * 2, q = 1 - x * x - y * y, o = (j * N + i) * 4; if (q <= 0) continue;
      const lit = x * sx + Math.sqrt(q) * sz, dark = 1 - clamp((lit + 0.03) / 0.09);
      im.data[o + 3] = 235 * dark;                                    // o lado escuro ainda aparece um pouco (luz da Terra)
    }
    mx.putImageData(im, 0, 0);
    const foto = luaFoto();
    LS = { w, h, f, wax, rise, set, mask: mc, foto, dist: moonDist(now), alt: altOf(moonEq(now), now, p.lat, p.lon), ev: skyEvents(p, now),
      stars: Array.from({ length: 90 }, (_, i) => { const r = rng(i + 5); return [r() * w, r() * h, r()]; }) };
  }
  LS.last = t;
  ctx.fillStyle = '#03050a'; ctx.fillRect(0, 0, w, h);
  for (const [x, y, b] of LS.stars) { ctx.globalAlpha = 0.15 + 0.35 * b * (0.7 + 0.3 * Math.sin(t * 2 + b * 30)); ctx.fillStyle = '#dfe6ff'; ctx.fillRect(x, y, 1, 1); }
  ctx.globalAlpha = 1;
  const r = Math.min(h * 0.42, w * 0.17), cx = w * 0.03 + r, cy = h * 0.5, south = p.lat < 0;
  const gl = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.5); gl.addColorStop(0, `rgba(230,230,210,${0.12 * LS.f})`); gl.addColorStop(1, 'rgba(230,230,210,0)');
  ctx.fillStyle = gl; ctx.fillRect(cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip(); ctx.translate(cx, cy); if (south) ctx.rotate(Math.PI);
  if (LS.foto.complete && LS.foto.naturalWidth) { const s = r / LUA_R; ctx.drawImage(LS.foto, -s / 2, -s / 2, s, s); }
  else { ctx.fillStyle = '#9a9a92'; ctx.fillRect(-r, -r, r * 2, r * 2); }
  ctx.drawImage(LS.mask, -r, -r, r * 2, r * 2); ctx.restore();
  const x0 = Math.max(w * 0.4, w * 0.03 + 2 * Math.min(h * 0.42, w * 0.17) + w * 0.04), dm = d => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...(d - now > 300 * 86400000 ? { year: '2-digit' } : {}) });
  encher(ctx, h, [[`${Math.round(LS.f * 100)}% · ${fase(LS.f, LS.wax)}`, 1, '#ffffff', 0.11, '700 ', 1],
    [`nasce ${LS.rise ? hhmm(LS.rise) : '—'} · se põe ${LS.set ? hhmm(LS.set) : '—'}`, 0.85],
    ['PRÓXIMOS NO CÉU', 0.9, color, 0.06, '600 '],
    ...LS.ev.slice(0, 3).map(e => [`${dm(e.ms)} · ${e.s}`, 0.75, HUD, LER * 0.85, '', 1, true])], x0, h * 0.04, w * 0.97 - x0, h * 0.96, 2.2);   // no standby, nada embaixo, onde fica o relógio
}
chuva.prep = chuvaPrep;
vento.prep = ventoPrep;
ar.prep = arPrep;
lua.prep = luaFoto;
