// Cenas do que está em volta do carro, com dados ao vivo (o que baixa fica guardado no aparelho):
// LUGARES PERTO: o que tem artigo na Wikipédia num raio de 25 km (cidades, museus, usinas, estações, igrejas), com a
// foto, a distância, a direção e o começo do artigo. A lista vem do Wikidata e muda sozinha quando o carro se afasta.
// Lugar sem foto aparece num radar, na direção em que está.
// RIO MAIS PERTO: quanta água o rio daqui está levando hoje, comparado com o normal desta época do ano desde 1997, e a
// previsão para as próximas duas semanas. É a estimativa do modelo de rios GloFAS (Copernicus), pelo Open-Meteo, em
// quadrados de 5 km; o nome do rio vem do OpenStreetMap, quando ele responde.
import { here, load, keep, hudText, HUD, clamp, ease, TELA, LER } from './cenas.js';
import { kmBetween, online, fmtN, say } from './mundo.js';
import { foto, falhou, borrado, cover, caixa, linhas, caber, PARA, MESES } from './curiosidades.js';

const TAU = Math.PI * 2, RAD = Math.PI / 180, FAM = 'px system-ui, sans-serif';
const OVP = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function overpass(q, ms = 100000) {                           // OpenStreetMap; o servidor principal vive ocupado, então tenta o espelho
  let err;
  for (const u of OVP) { try { const r = await fetch(u + '?data=' + encodeURIComponent(q), { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(r.status); return await r.json(); } catch (e) { err = e; } }
  throw err;
}
const rumo = (p, o) => ((Math.atan2((o.lon - p.lon) * Math.cos(p.lat * RAD), o.lat - p.lat) / RAD) % 360 + 360) % 360;
const kmTxt = km => km < 10 ? km.toFixed(1).replace('.', ',') : fmtN(km);
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// =====================================================================================
// LUGARES PERTO
const LG = { c: null, list: null, at: 0, loading: false, tried: 0, i: 0 };
const NAO = /homic|atentado|ataque|acidente|crime|massacre|batalha|tiroteio|desastre|naufr|chacina|sequestro/i;   // fatos, não lugares
const NAO_TIPO = /municipalidad|administração|microrregião|mesorregião|região intermediária|região imediata|lista/i;   // não são lugares para visitar
const GERAL = /^(edifício|construção|estrutura|barragem|prédio|obra arquitet[óô]nica|entidade territorial administrativa)$/i;
function tipoDe(tipos) {                                            // o tipo mais curto e mais específico ("museu", "usina hidrelétrica")
  const T = tipos.split('|').filter(Boolean).map(s => s.replace(/ (do|no) Brasil$/i, '').replace(/hidroel[eé]c?trica/i, 'hidrelétrica').replace(/^central hidrelétrica/i, 'usina hidrelétrica')
    .replace(/^estrutura arquitet[óô]nica$/i, 'prédio').replace(/^aeródromo.*/i, 'aeroporto').replace(/caminhos de ferro/i, 'trem'));
  const bom = T.filter(s => !GERAL.test(s)), s = (bom.length ? bom : T).sort((a, b) => a.length - b.length)[0] || 'lugar';
  return /^município/i.test(s) ? 'cidade' : s;
}
const sparql = (p, km) => `SELECT ?item ?coord ?dist ?art (SAMPLE(?img) AS ?foto) (GROUP_CONCAT(DISTINCT ?tl; separator="|") AS ?tipos) WHERE {
SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${p.lon.toFixed(4)} ${p.lat.toFixed(4)})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "${km}". bd:serviceParam wikibase:distance ?dist. }
?art schema:about ?item; schema:isPartOf <https://pt.wikipedia.org/>.
FILTER NOT EXISTS { ?item wdt:P585 [] }
OPTIONAL { ?item wdt:P18 ?img. }
OPTIONAL { ?item wdt:P31 ?tipo. ?tipo rdfs:label ?tl. FILTER(LANG(?tl) = "pt") }
} GROUP BY ?item ?coord ?dist ?art ORDER BY ?dist LIMIT 120`;
const limpa = s => s.replace(/\s*\([^()]*\)/g, '').replace(/\s*\([^()]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+([,.;:])/g, '$1').replace(/\s+/g, ' ').trim();
async function loadLugares(p) {
  LG.loading = true; LG.tried = Date.now();
  try {
    const get = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(r.status); return r.json(); };
    let rows = [];
    for (const km of [25, 50]) {                                    // no interior tem pouca coisa: se vier pouco, olha mais longe
      rows = (await get('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql(p, km)))).results?.bindings || [];
      if (rows.length >= 12) break;
    }
    const seen = new Set(), base = [];
    for (const b of rows) {
      const tipos = b.tipos?.value || '', m = b.coord?.value.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
      if (!m || !b.art || seen.has(b.item.value) || NAO.test(tipos) || NAO_TIPO.test(tipos)) continue; seen.add(b.item.value);
      const title = decodeURIComponent(b.art.value.split('/wiki/')[1] || '').replace(/_/g, ' ');
      if (title && !/^(Lista|Anexo|Administração)\b/i.test(title)) base.push({ title, la: +m[2], lo: +m[1], tipo: tipoDe(tipos), p18: b.foto?.value || '' });
    }
    const info = new Map();                                         // o começo do artigo e a foto, de 20 em 20
    for (let k = 0; k < base.length; k += 20) {
      const part = base.slice(k, k + 20), q = new URLSearchParams({ action: 'query', format: 'json', formatversion: 2, origin: '*', redirects: 1,
        prop: 'extracts|pageimages', exintro: 1, explaintext: 1, exsentences: 4, exlimit: 20, piprop: 'thumbnail', pithumbsize: 500, pilimit: 20, titles: part.map(o => o.title).join('|') });
      const j = await get('https://pt.wikipedia.org/w/api.php?' + q);
      const alias = new Map([...(j.query?.normalized || []), ...(j.query?.redirects || [])].map(x => [x.from, x.to]));
      const pages = new Map((j.query?.pages || []).map(x => [x.title, x]));
      for (const o of part) { let tt = o.title; for (let n = 0; n < 3 && alias.has(tt); n++) tt = alias.get(tt); if (pages.has(tt)) info.set(o, pages.get(tt)); }
    }
    const cid = [], out = [];
    for (const o of base) {
      const pg = info.get(o); if (!pg || pg.missing || /^(Lista|Anexo)\b/i.test(pg.title)) continue;   // bairro que é só um redirecionamento para a lista
      const x = limpa(pg.extract || ''); if (x.length < 40) continue;   // artigo sem texto
      const th = pg.thumbnail?.source || '', ruim = /\.svg|mapa|map[_ ]|locator|localiza|bandeira|flag|bras[ãa]o|coat/i;
      const u = o.p18 && !ruim.test(decodeURIComponent(o.p18)) ? o.p18.replace(/^http:/, 'https:') + '?width=500' : th && !ruim.test(decodeURIComponent(th)) ? th : '';
      const it = { n: pg.title.replace(/\s*\(.*\)$/, ''), t: o.tipo, la: o.la, lo: o.lo, x, u };
      (/^(cidade|distrito)$/.test(o.tipo) ? cid : out).push(it);
    }
    // onde você está primeiro; depois dois lugares para cada cidade, do mais perto para o mais longe
    const list = [], km = o => kmBetween(p, { lat: o.la, lon: o.lo });
    if (cid.length && km(cid[0]) < 4) list.push(cid.shift());
    while (cid.length || out.length) { for (let n = 0; n < 2 && out.length; n++) list.push(out.shift()); if (cid.length) list.push(cid.shift()); }
    Object.assign(LG, { c: { lat: p.lat, lon: p.lon }, list: list.slice(0, 30), at: Date.now(), i: 0 });
    keep('lugares', { v: 1, c: LG.c, at: LG.at, list: LG.list }); keep('lugares.i', 0);   // lista nova: começa por onde você está
  } catch {}
  LG.loading = false;
}
function ondeFica(p, o, L) {
  const q = { lat: o.la, lon: o.lo }, km = kmBetween(p, q);
  if (o.t === 'cidade' && km < 4 && !L.some(c => c.t === 'cidade' && kmBetween(p, { lat: c.la, lon: c.lo }) < km)) return 'você está aqui';   // a cidade mais perto
  if (km < 1.5) return 'pertinho daqui';
  return `${kmTxt(km)} km ${PARA[Math.round(rumo(p, q) / 45) % 8]}`;
}
async function lugaresPrep() {                                     // também chamada antes de a cena entrar, para ela já abrir pronta
  const p = here();
  if (!LG.list) { const c = load('lugares', null); if (c?.v === 1 && c.list) Object.assign(LG, { c: c.c, list: c.list, at: c.at, i: c.list.length ? load('lugares.i', 0) % c.list.length : 0 }); }   // continua de onde parou
  const dist = LG.c ? kmBetween(p, LG.c) : Infinity;
  if ((dist > 8 || Date.now() - LG.at > 14 * 86400000) && !LG.loading && online() && Date.now() - LG.tried > 120000) await loadLugares(p);
  const o = LG.list?.[LG.i]; if (o?.u) foto(o.u);                   // a foto do próximo lugar
}
let LS = null;
export function lugares(ctx, w, h, t, color) {
  const p = here();
  lugaresPrep();
  const dist = LG.c ? kmBetween(p, LG.c) : Infinity;
  ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, w, h);
  const L = dist < 40 ? LG.list : null;                             // a lista velha serve enquanto a nova chega, se não estiver longe demais
  if (!L?.length) {
    if ((!LG.loading && t > 1) || t > 15) return true;
    hudText(ctx, h, ['LUGARES PERTO · procurando…'], w / 2, h * 0.45, 'center'); return;
  }
  if (!LS || t < LS.last) LS = { cur: null, t0: 0 };
  LS.last = t;
  if (!LS.cur) {                                                    // um lugar por vez: fica a cena inteira, e o próximo vem na próxima vez
    let pick = -1;                                                  // espera a foto chegar (ou desiste dela e mostra o radar)
    for (let k = 0; k < Math.min(6, L.length); k++) { const j = (LG.i + k) % L.length, o = L[j]; if (!o.u || falhou(o.u) || foto(o.u)) { pick = j; break; } if (t < 3) break; }   // 3 s pela foto da vez; depois, o próximo que estiver pronto
    if (pick < 0 && t > 5) pick = LG.i % L.length;
    if (pick >= 0) { const o = L[pick]; LS.cur = { o, im: o.u ? foto(o.u) : null, lay: null }; LS.t0 = t; LG.i = (pick + 1) % L.length; keep('lugares.i', LG.i); }
  }
  for (let k = 0; k < 3; k++) { const o = L[(LG.i + k) % L.length]; if (o.u) foto(o.u); }   // a foto do próximo já vai chegando
  if (!LS.cur) { hudText(ctx, h, ['LUGARES PERTO · carregando a foto…'], w / 2, h * 0.45, 'center'); return; }
  const a = ease((t - LS.t0) / 0.8);
  cartao(ctx, w, h, t, color, LS.cur, a, p, clamp(a * 2 - 1), L);
}
function cartao(ctx, w, h, t, color, it, A, p, ta, L) {             // A: a foto (ou o radar); ta: o texto
  const { o, im } = it, k = t - LS.t0, x0 = w * 0.1, y0 = h * 0.08, ch = h * 0.84;
  let cw;
  ctx.save(); ctx.globalAlpha = A;
  if (im) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(borrado(im), -w * 0.05, -h * 0.05, w * 1.1, h * 1.1);   // fundo: a própria foto desfocada e escura
    ctx.fillStyle = 'rgba(3,5,8,0.62)'; ctx.fillRect(0, 0, w, h);
    cw = Math.min(w * 0.36, ch * clamp(im.naturalWidth / im.naturalHeight, 0.72, 1.4));
    ctx.save(); caixa(ctx, x0, y0, cw, ch, h * 0.03); ctx.clip(); cover(ctx, im, x0, y0, cw, ch, 1.02 + 0.06 * clamp(k / 25)); ctx.restore();
    caixa(ctx, x0, y0, cw, ch, h * 0.03); ctx.strokeStyle = color; ctx.globalAlpha = A * 0.35; ctx.lineWidth = Math.max(1, h * 0.003); ctx.stroke();
  } else {
    ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, w, h);
    cw = Math.min(w * 0.36, ch);
    radar(ctx, x0 + cw / 2, y0 + ch / 2, Math.min(cw, ch) * 0.46, h, p, o, L, color, k, A);
  }
  const tx = x0 + cw + w * 0.035, tw = w * 0.96 - tx;
  if (!it.lay || it.lay.w !== w) it.lay = { w, ops: colunaL(ctx, h, o, p, tw, color, L) };   // o texto é medido uma vez por lugar
  say(ctx, h, 'LUGARES PERTO DE VOCÊ', tx, h * 0.08, ta * 0.85);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (const op of it.lay.ops) { ctx.font = op.f; ctx.fillStyle = op.c; ctx.globalAlpha = ta * op.a; ctx.fillText(op.s, tx, op.y); }
  ctx.restore();
}
// o texto do lado direito: tipo, nome, distância e o começo do artigo, sem descer até o relógio
function colunaL(ctx, h, o, p, tw, color, L) {
  const frases = o.x.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÚÇ"“])/), fim = h * (TELA.relogio ? 0.64 : 0.87);   // "4.149 habitantes" não é fim de frase; embaixo, o crédito
  let ops = [];
  for (const k of [1, 0.85, 0.72]) {                                // nome comprido: diminui o nome antes de cortar o texto
    ops = []; let y = h * 0.2;
    const txt = (s, px, peso, c, a, lh) => {                        // uma linha, diminuindo a letra se passar da largura
      let f = Math.max(9, h * px); ctx.font = `${peso}${f}${FAM}`; const lw = ctx.measureText(s).width; if (lw > tw) f *= tw / lw;
      ops.push({ s, y, f: `${peso}${f}${FAM}`, c, a }); y += f * lh;
    };
    txt(o.t.toUpperCase(), 0.072, '600 ', color, 0.95, 1.3);
    const N = caber(ctx, o.n, tw, h * 0.15 * k, h * 0.1 * k, 2, '600 ');
    for (const s of N.L) { ops.push({ s, y, f: `600 ${N.f}${FAM}`, c: '#ffffff', a: 1 }); y += N.f * 1.12; }
    y += h * 0.008;
    txt(ondeFica(p, o, L), 0.088 * Math.sqrt(k), '', HUD, 0.9, 1.35);
    // o artigo: as frases inteiras que couberem, de preferência com letra boa de ler
    let T = null, cortou = false, inteiro = null;
    for (let n = frases.length; n >= 1; n--) {
      const s = frases.slice(0, n).join(' ').replace(/\s+/g, ' ').trim();
      T = caber(ctx, s, tw, h * 0.095, h * LER, 99, '', fim - y, 1.22);
      ctx.font = `${T.f}${FAM}`; cortou = linhas(ctx, s, tw).length > T.L.length;
      if (!cortou && T.f >= h * LER) { inteiro = null; break; }
      if (!cortou && !inteiro) inteiro = T;
    }
    if (inteiro && (cortou || T.f < h * LER)) { T = inteiro; cortou = false; }
    if (cortou) {                                                   // nem uma frase coube: corta com reticências
      ctx.font = `${T.f}${FAM}`; let s = T.L[T.L.length - 1];
      while (s.includes(' ') && ctx.measureText(s + '…').width > tw) s = s.slice(0, s.lastIndexOf(' '));
      T.L[T.L.length - 1] = s + '…';
    }
    for (const s of T.L) { ops.push({ s, y, f: `${T.f}${FAM}`, c: '#e8eef2', a: 0.92 }); y += T.f * 1.22; }
    y += h * 0.01;
    txt('fonte: Wikipédia', 0.05, '', HUD, 0.45, 1.3);
    break;
  }
  return ops;
}
// radar dos lugares em volta (norte para cima), com o lugar da vez destacado
function radar(ctx, cx, cy, R, h, p, o, L, color, k, A) {
  const far = Math.max(1, ...L.map(q => kmBetween(p, { lat: q.la, lon: q.lo }))), esc = [5, 10, 25, 50, 100].find(v => v >= far) || Math.ceil(far / 50) * 50;
  const pos = q => { const g = rumo(p, { lat: q.la, lon: q.lo }) * RAD, d = Math.min(1, kmBetween(p, { lat: q.la, lon: q.lo }) / esc) * R; return [cx + Math.sin(g) * d, cy - Math.cos(g) * d]; };
  const lw = Math.max(1, h * 0.003);
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  for (const f of [0.5, 1]) { ctx.globalAlpha = A * (f === 1 ? 0.4 : 0.2); ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = A * 0.12; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  const sw = k * 1.3;                                               // a varredura do radar
  for (let n = 0; n < 12; n++) { ctx.globalAlpha = A * 0.12 * (1 - n / 12); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sw - (n + 1) * 0.06 - Math.PI / 2, sw - n * 0.06 - Math.PI / 2); ctx.closePath(); ctx.fill(); }
  ctx.font = `${Math.max(9, h * 0.034)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = HUD;
  ctx.globalAlpha = A * 0.6; ctx.fillText('N', cx, cy - R - h * 0.03);
  ctx.globalAlpha = A * 0.4; ctx.textAlign = 'left'; ctx.fillText(`${esc / 2} km`, cx + R * 0.5 * 0.71 + 4, cy - R * 0.5 * 0.71); ctx.fillText(`${esc} km`, cx + R * 0.71 + 4, cy - R * 0.71);
  for (const q of L) { if (q === o) continue; const [x, y] = pos(q); ctx.globalAlpha = A * 0.45; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, h * 0.006), 0, TAU); ctx.fill(); }
  const [x, y] = pos(o), pr = (k * 0.8) % 1;
  ctx.setLineDash([lw * 3, lw * 3]); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = A * 0.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = A * (1 - pr); ctx.beginPath(); ctx.arc(x, y, h * 0.012 + h * 0.04 * pr, 0, TAU); ctx.stroke();
  ctx.globalAlpha = A; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, Math.max(3, h * 0.011), 0, TAU); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.022); ctx.lineTo(cx + h * 0.014, cy + h * 0.014); ctx.lineTo(cx - h * 0.014, cy + h * 0.014); ctx.closePath(); ctx.fill();   // você
}

// =====================================================================================
// RIO MAIS PERTO
const FL = 'https://flood-api.open-meteo.com/v1/flood';
const RV = { c: null, cell: null, hist: null, now: null, nome: undefined, loading: false, tried: 0, nLoading: false, nTry: 0 };
const salvaRio = () => keep('rio', { v: 1, c: RV.c, cell: RV.cell, hist: RV.hist, now: RV.now, nome: RV.nome ?? null });
function clima(time, q) {                                           // o normal de cada época do ano: faixas de 5 dias, olhando 12 dias para cada lado
  const bins = Array.from({ length: 73 }, () => []); let max = null, ano0 = 9999;
  time.forEach((s, i) => {
    const v = q[i]; if (!Number.isFinite(v)) return;
    const d = Date.parse(s + 'T12:00:00Z'), doy = Math.floor((d - Date.UTC(+s.slice(0, 4), 0, 1)) / 86400000);
    bins[Math.min(72, Math.floor(doy / 5))].push(v); if (!max || v > max[0]) max = [v, s]; ano0 = Math.min(ano0, +s.slice(0, 4));
  });
  const P = bins.map((_, b) => {
    const a = [-2, -1, 0, 1, 2].flatMap(k => bins[(b + k + 73) % 73]).sort((x, y) => x - y);
    return a.length ? [0.1, 0.25, 0.5, 0.75, 0.9].map(f => +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(2)) : null;
  });
  return { P, max, ano0 };
}
const binDe = s => { const d = Date.parse(s + 'T12:00:00Z'); return Math.min(72, Math.floor(Math.floor((d - Date.UTC(+s.slice(0, 4), 0, 1)) / 86400000) / 5)); };
async function loadRio(p) {
  RV.loading = true; RV.tried = Date.now();
  try {
    const get = async q => { const r = await fetch(`${FL}?${new URLSearchParams(q)}`, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(r.status); return r.json(); };
    if (!RV.cell || !RV.c || kmBetween(p, RV.c) > 5) {
      // 25 pontos em volta, de 5 em 5 km (a grade do modelo): o rio é o mais perto que levou pelo menos 3 m³/s nos últimos 3 meses
      const la = [], lo = [];
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { la.push((p.lat + i * 0.05).toFixed(3)); lo.push((p.lon + j * 0.05).toFixed(3)); }
      const j = await get({ latitude: la.join(','), longitude: lo.join(','), daily: 'river_discharge', past_days: 92, forecast_days: 1 });
      const pts = (Array.isArray(j) ? j : [j]).map(o => ({ la: o.latitude, lo: o.longitude, q: Math.max(0, ...(o.daily?.river_discharge || []).filter(Number.isFinite)) }));
      pts.forEach(o => { o.km = kmBetween(p, { lat: o.la, lon: o.lo }); });
      const cell = pts.filter(o => o.q >= 3).sort((a, b) => a.km - b.km)[0] || pts.sort((a, b) => b.q - a.q)[0];
      Object.assign(RV, { c: { lat: p.lat, lon: p.lon }, cell: cell && cell.q >= 0.5 ? { la: cell.la, lo: cell.lo } : { none: true }, hist: null, now: null, nome: undefined, nTry: 0 });
      if (RV.cell.none) { salvaRio(); return; }
    }
    const { la, lo } = RV.cell;
    if (!RV.hist) {                                                 // de 1997 até 3 dias atrás (~280 KB, uma vez por lugar)
      const end = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
      const j = await get({ latitude: la, longitude: lo, daily: 'river_discharge', start_date: '1997-01-01', end_date: end });
      RV.hist = clima(j.daily.time, j.daily.river_discharge);
    }
    const j = await get({ latitude: la, longitude: lo, daily: 'river_discharge,river_discharge_median,river_discharge_p25,river_discharge_p75', past_days: 45, forecast_days: 16 }), d = j.daily;
    RV.now = { at: Date.now(), t: d.time, q: d.river_discharge, m: d.river_discharge_median, a: d.river_discharge_p25, b: d.river_discharge_p75 };
    salvaRio();
  } catch {}
  RV.loading = false;
}
function nomeRio() {                                                // o rio com mais trechos em volta do quadrado do modelo (só "rio", não córrego)
  if (RV.nome !== undefined || RV.nLoading || Date.now() - RV.nTry < 30 * 60000 || !online()) return;
  RV.nLoading = true; RV.nTry = Date.now();
  const { la, lo } = RV.cell, q = `[out:json][timeout:50];way(around:3500,${la.toFixed(3)},${lo.toFixed(3)})[waterway=river][name];out tags;`;
  overpass(q, 70000).then(j => {
    const n = new Map(); for (const e of j.elements || []) { const s = e.tags?.name; if (s) n.set(s, (n.get(s) || 0) + 1); }
    const s = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    RV.nome = s && !/^(rio|ribeirão|córrego|arroio|riacho)\b/i.test(s) ? `Rio ${s}` : s; salvaRio();
  }).catch(() => {}).finally(() => { RV.nLoading = false; });
}
const fmtQ = v => v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 });
const diaTxt = s => { const d = new Date(s + 'T12:00:00'); return `${SEM[d.getDay()]}, ${s.slice(8, 10)}/${s.slice(5, 7)}`; };
function tempoTxt(s) {
  if (s < 90) return `${Math.max(1, Math.round(s))} segundos`;
  if (s < 5400) return `${Math.round(s / 60)} minutos`;
  const hh = Math.floor(s / 3600), mm = Math.round((s % 3600) / 60); return mm ? `${hh} h ${mm} min` : `${hh} h`;
}
function estado(Q, P, max) {                                        // [título, cor], comparando com os anos de 1997 para cá nesta época
  if (Q > Math.max(P[4] * 1.8, max * 0.5)) return ['CHEIA', '#ff6a5a'];
  if (Q > P[4]) return ['MUITO ACIMA DO NORMAL', '#ff9a4a'];
  if (Q > P[3]) return ['ACIMA DO NORMAL', '#ffd34d'];
  if (Q >= P[1]) return ['NORMAL', '#5fd3a0'];
  if (Q >= P[0]) return ['ABAIXO DO NORMAL', '#7fb0ff'];
  return ['MUITO BAIXO', '#c58cff'];
}
function rioPrep() {
  const p = here();
  if (!RV.cell) { const c = load('rio', null); if (c?.v === 1 && c.cell) Object.assign(RV, { c: c.c, cell: c.cell, hist: c.hist, now: c.now, nome: c.nome ?? undefined }); }
  const longe = !RV.c || kmBetween(p, RV.c) > 5, velho = !RV.now || Date.now() - RV.now.at > 6 * 3600000;
  if ((longe || velho || (!RV.cell?.none && !RV.hist)) && !RV.loading && online() && Date.now() - RV.tried > 120000) loadRio(p);
  if (RV.cell && !RV.cell.none && !longe) nomeRio();
}
let RS = null;
export function rio(ctx, w, h, t, color) {
  const p = here();
  rioPrep();
  const longe = !RV.c || kmBetween(p, RV.c) > 5;
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#03090f'); g.addColorStop(1, '#020508');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const N = RV.now, hoje = new Date().toLocaleDateString('sv'), i0 = N ? N.t.indexOf(hoje) : -1;
  if (RV.cell?.none && !longe) return true;                         // nenhum rio que o modelo enxergue por perto
  if (!RV.cell || RV.cell.none || !RV.hist || !N || i0 < 0 || kmBetween(p, RV.c) > 30 || !Number.isFinite(N.q[i0])) {
    if ((!RV.loading && t > 1) || t > 15) return true;
    hudText(ctx, h, ['RIO MAIS PERTO · procurando o rio…'], w / 2, h * 0.45, 'center'); return;
  }
  if (!RS || t < RS.last || RS.w !== w || RS.N !== N || RS.nome !== RV.nome) RS = rioInit(ctx, w, h, p, N, i0);
  RS.last = t;
  const S = RS, x0 = w * 0.05;
  // à esquerda: o nome, quanta água passa agora e o que isso quer dizer
  say(ctx, h, S.tit, x0, h * 0.04);
  ctx.font = `${Math.max(9, h * 0.055)}px ${FAM.slice(3)}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = HUD;
  ctx.globalAlpha = 0.65; ctx.fillText(S.sub[0], x0, h * 0.135);
  ctx.globalAlpha = 1;
  for (const op of S.ops) {
    const a = ease((t - op.d) / 0.6);
    if (op.chip) {
      const { s, cor, y, f, cw, rh } = op;
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#05070a'; caixa(ctx, x0, y, cw, rh, rh * 0.3); ctx.fill();
      ctx.strokeStyle = cor; ctx.globalAlpha = a * 0.5; ctx.lineWidth = Math.max(1, h * 0.003); ctx.stroke();
      ctx.globalAlpha = a; ctx.fillStyle = cor; ctx.font = `700 ${f}${FAM}`; ctx.textBaseline = 'middle'; ctx.fillText(s, x0 + rh * 0.42, y + rh * 0.53); ctx.textBaseline = 'top';
      continue;
    }
    ctx.font = op.f; ctx.fillStyle = op.c; ctx.globalAlpha = a * op.a; ctx.fillText(op.s, x0, op.y);
  }
  ctx.globalAlpha = 1;
  grafico(ctx, w, h, t, color, S);
}
function rioInit(ctx, w, h, p, N, i0) {
  const { P, max, ano0 } = RV.hist, Q = N.q[i0], nP = P[binDe(N.t[i0])] || P[0], [est, cor] = estado(Q, nP, max[0]);
  const km = kmBetween(p, { lat: RV.cell.la, lon: RV.cell.lo }), dir = PARA[Math.round(rumo(p, { lat: RV.cell.la, lon: RV.cell.lo }) / 45) % 8];
  const tit = RV.nome ? RV.nome.toUpperCase() : 'O RIO DAQUI';
  const sub = [km < 2.5 ? 'passa aqui perto' : `passa a ${kmTxt(km)} km daqui, ${dir}`, 'estimativa do modelo GloFAS · Open-Meteo'];
  // previsão: o que muda na próxima semana
  const fut = []; for (let i = i0 + 1; i <= Math.min(N.t.length - 1, i0 + 7); i++) { const v = Number.isFinite(N.m[i]) ? N.m[i] : N.q[i]; if (Number.isFinite(v)) fut.push([v, N.t[i]]); }
  const hi = fut.reduce((a, b) => b[0] > a[0] ? b : a, [Q, '']), lo = fut.reduce((a, b) => b[0] < a[0] ? b : a, [Q, '']);
  const prev = hi[0] > Q * 1.25 ? `deve subir para ${fmtQ(hi[0])} até ${diaTxt(hi[1])}` : lo[0] < Q * 0.8 ? `deve baixar para ${fmtQ(lo[0])} até ${diaTxt(lo[1])}` : 'semana que vem: parecido';
  const [my, mm] = max[1].split('-').map(Number);
  const tw = w * 0.5, ops = []; let y = h * 0.2;
  const txt = (s, px, peso, c, a, lh, d) => {
    let f = Math.max(9, h * px); ctx.font = `${peso}${f}${FAM}`; const lw = ctx.measureText(s).width; if (lw > tw) f *= tw / lw;
    ops.push({ s, y, f: `${peso}${f}${FAM}`, c, a, d }); y += f * lh;
  };
  txt(`${fmtQ(Q)} m³/s`, 0.17, '700 ', '#ffffff', 1, 1.02, 0.2);
  { const f = h * 0.06; ctx.font = `700 ${f}${FAM}`; const rh = f * 1.6, cw = ctx.measureText(est).width + rh * 0.84; ops.push({ chip: true, s: est, cor, y, f, cw, rh, d: 0.6 }); y += rh + h * 0.035; }
  txt(`normal nesta época: ${fmtQ(nP[2])}`, LER, '', HUD, 0.9, 1.3, 0.8);
  txt(prev, LER, '', HUD, 0.9, 1.3, 1);
  txt(`enche uma piscina em ${tempoTxt(2500 / Math.max(0.01, Q))}`, LER, '', HUD, 0.9, 1.3, 1.2);
  txt(`maior cheia: ${fmtQ(max[0])} m³/s em ${my}`, LER, '', HUD, 0.9, 1.3, 1.4);
  // o gráfico: 45 dias para trás e 16 para a frente, com a faixa do normal de cada dia
  const n = N.t.length, norm = N.t.map(s => P[binDe(s)] || nP);
  let top = 0; for (let i = 0; i < n; i++) top = Math.max(top, N.q[i] || 0, N.b[i] || 0, norm[i][3]);
  const step = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(s => top * 1.15 / s <= 4) || 20000;
  return { w, N, nome: RV.nome, tit, sub, ops, i0, n, norm, vmax: Math.ceil(top * 1.15 / step) * step, step, cor, Q };
}
function grafico(ctx, w, h, t, color, S) {
  const gx = w * 0.63, gw = w * 0.34, gy = h * 0.16, gh = h * (TELA.relogio ? 0.44 : 0.62), { N, n, i0, norm, vmax } = S;
  const X = i => gx + i / (n - 1) * gw, Y = v => gy + gh - clamp(v / vmax) * gh, lw = Math.max(1, h * 0.003);
  const rev = ease(t / 1.8), last = Math.max(1, Math.floor(rev * (n - 1)));   // vai desenhando da esquerda para a direita
  ctx.font = `${Math.max(9, h * 0.045)}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = HUD; ctx.globalAlpha = 0.55;
  ctx.fillText('ÁGUA (m³/s)', gx, gy - h * 0.035);
  ctx.globalAlpha = 0.12; ctx.strokeStyle = HUD; ctx.lineWidth = 1;   // linhas de referência
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = 0; v <= vmax + 1e-9; v += S.step) { const y = Y(v); ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke(); ctx.globalAlpha = 0.4; ctx.fillText(fmtQ(v), gx - h * 0.012, y); }
  // a faixa do normal (metade dos anos fica dentro dela)
  ctx.beginPath(); for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(norm[i][3])); for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(norm[i][1])); ctx.closePath();
  ctx.fillStyle = HUD; ctx.globalAlpha = 0.09; ctx.fill();
  ctx.setLineDash([lw * 2, lw * 3]); ctx.strokeStyle = HUD; ctx.globalAlpha = 0.35; ctx.lineWidth = lw; ctx.beginPath(); for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(norm[i][2])); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = `${Math.max(9, h * 0.045)}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = HUD; ctx.globalAlpha = 0.45;
  ctx.fillText('normal', gx + h * 0.008, Y(norm[0][3]) - 2);
  // o que já passou: água com correnteza
  const ate = Math.min(i0, last), area = new Path2D(); area.moveTo(X(0), Y(0));
  for (let i = 0; i <= ate; i++) area.lineTo(X(i), Y(N.q[i] || 0)); area.lineTo(X(ate), Y(0)); area.closePath();
  const gr = ctx.createLinearGradient(0, gy, 0, gy + gh); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr; ctx.globalAlpha = 0.45; ctx.fill(area);
  ctx.save(); ctx.clip(area); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw;
  const vel = h * 0.05 * clamp(Math.sqrt(S.Q / Math.max(0.1, S.norm[i0][2])), 0.4, 3);
  for (let k = 0; k < 7; k++) { const yy = gy + gh * (0.3 + k * 0.1); ctx.setLineDash([h * 0.03, h * 0.05 + k * 3]); ctx.lineDashOffset = -t * vel * (1 - k * 0.06); ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(X(ate), yy); ctx.stroke(); }
  ctx.restore(); ctx.setLineDash([]);
  ctx.strokeStyle = color; ctx.globalAlpha = 1; ctx.lineWidth = lw * 1.6; ctx.lineJoin = 'round';
  ctx.beginPath(); for (let i = 0; i <= ate; i++) ctx.lineTo(X(i), Y(N.q[i] || 0)); ctx.stroke();
  // a previsão: a faixa onde estão as simulações do meio, e a do meio tracejada
  if (last > i0) {
    ctx.beginPath(); for (let i = i0; i <= last; i++) ctx.lineTo(X(i), Y(Number.isFinite(N.b[i]) ? N.b[i] : N.q[i])); for (let i = last; i >= i0; i--) ctx.lineTo(X(i), Y(Number.isFinite(N.a[i]) ? N.a[i] : N.q[i])); ctx.closePath();
    ctx.fillStyle = color; ctx.globalAlpha = 0.18; ctx.fill();
    ctx.setLineDash([lw * 3, lw * 2.5]); ctx.globalAlpha = 0.9; ctx.lineWidth = lw * 1.3; ctx.beginPath();
    for (let i = i0; i <= last; i++) ctx.lineTo(X(i), Y(Number.isFinite(N.m[i]) ? N.m[i] : N.q[i])); ctx.stroke(); ctx.setLineDash([]);
  }
  // hoje
  const hx = X(i0), hy = Y(S.Q), pr = (t * 0.7) % 1;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(hx, gy); ctx.lineTo(hx, gy + gh); ctx.stroke();
  if (last >= i0) {
    ctx.globalAlpha = 1 - pr; ctx.beginPath(); ctx.arc(hx, hy, h * 0.01 + h * 0.035 * pr, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx, hy, Math.max(2.5, h * 0.009), 0, TAU); ctx.fill();
  }
  ctx.font = `${Math.max(9, h * 0.045)}px monospace`; ctx.textBaseline = 'top'; ctx.fillStyle = HUD; ctx.globalAlpha = 0.5;
  const dm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  ctx.textAlign = 'left'; ctx.fillText(dm(N.t[0]), gx, gy + gh + h * 0.015);
  ctx.textAlign = 'center'; ctx.globalAlpha = 0.85; ctx.fillText('hoje', hx, gy + gh + h * 0.015);
  ctx.textAlign = 'right'; ctx.globalAlpha = 0.5; ctx.fillText(dm(N.t[n - 1]), gx + gw, gy + gh + h * 0.015);
  if (!TELA.relogio) { ctx.font = `${Math.max(9, h * 0.038)}px ${FAM.slice(3)}`; ctx.globalAlpha = 0.35; ctx.fillText('modelo GloFAS · Open-Meteo', gx + gw, gy + gh + h * 0.09); }
  ctx.globalAlpha = 1;
}
lugares.prep = lugaresPrep;
rio.prep = rioPrep;

// =====================================================================================
// TRILHAS E CACHOEIRAS PERTO: as estradas de terra e as trilhas num raio de 15 km do carro e os passeios num raio de
// 40 km (cachoeiras, mirantes, picos com nome e grutas), tudo do OpenStreetMap. Cada vez que a cena entra, um passeio
// fica em destaque, do mais perto para o mais longe. A busca é pesada (até 1 minuto e ~1,5 MB), por isso é feita antes
// de a cena entrar e fica guardada por 30 dias; só busca de novo quando o carro se afasta.
const TL = { c: null, at: 0, roads: null, km: 0, kt: 0, pc: null, pat: 0, pts: null, loading: false, tried: 0, i: 0 };
const SURF = 'unpaved|dirt|gravel|ground|sand|earth|compacted|fine_gravel|grass|mud';
const TIPO = { cachoeira: ['CACHOEIRA', '#6fc3ff'], mirante: ['MIRANTE', '#ffd34d'], pico: ['PICO', '#e0b48a'], gruta: ['GRUTA', '#c58cff'] };
const PLUR = { cachoeira: 'cachoeiras', mirante: 'mirantes', pico: 'picos', gruta: 'grutas' };
async function loadTrilhas(p, estradas, passeios) {
  TL.loading = true; TL.tried = Date.now();
  try {
    const at = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, cl = Math.cos(p.lat * RAD);
    const dk = (a, b, c, d) => Math.hypot((c - a) * 111.2, (d - b) * 111.2 * cl);
    if (estradas) {
      const j = await overpass(`[out:json][timeout:90];(way(around:15000,${at})[highway=track];way(around:15000,${at})[highway~"^(unclassified|tertiary|residential|secondary)$"][surface~"^(${SURF})$"];);out geom qt;`);
      const roads = []; let km = 0, kt = 0;
      for (const e of j.elements || []) {
        const g = e.geometry; if (!g || g.length < 2) continue;
        const tr = e.tags?.highway === 'track' ? 1 : 0; let la = Math.round(g[0].lat * 1e4), lo = Math.round(g[0].lon * 1e4), kla = g[0].lat, klo = g[0].lon;
        const out = [tr, la, lo];                                   // em décimos de milésimo de grau, cada ponto como diferença do anterior
        for (let i = 1; i < g.length; i++) {
          const q = g[i], d = dk(g[i - 1].lat, g[i - 1].lon, q.lat, q.lon); km += d; if (tr) kt += d;
          if (i < g.length - 1 && dk(kla, klo, q.lat, q.lon) < 0.025) continue;   // ponto a menos de 25 m do anterior não muda o desenho
          const a = Math.round(q.lat * 1e4), b = Math.round(q.lon * 1e4); out.push(a - la, b - lo); la = a; lo = b; kla = q.lat; klo = q.lon;
        }
        roads.push(out);
      }
      Object.assign(TL, { c: { lat: p.lat, lon: p.lon }, at: Date.now(), roads, km, kt });
      keep('trilhas', { v: 1, c: TL.c, at: TL.at, roads, km, kt });
    }
    if (passeios) {
      const a40 = `around:40000,${at}`;
      const j = await overpass(`[out:json][timeout:90];(nwr(${a40})[waterway=waterfall];nwr(${a40})[tourism=viewpoint];node(${a40})[natural=peak][name];nwr(${a40})[natural=cave_entrance];);out center tags qt;`);
      const pts = [];
      for (const e of j.elements || []) {
        const g = e.tags || {}, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (!Number.isFinite(la)) continue;
        const t = g.waterway === 'waterfall' ? 'cachoeira' : g.tourism === 'viewpoint' ? 'mirante' : g.natural === 'peak' ? 'pico' : 'gruta';
        const n = (g['name:pt'] || g.name || '').trim(), ele = parseFloat(String(g.ele || '').replace(',', '.'));
        pts.push({ t, n: /^[A-Z]{1,3}\d+$/.test(n) ? '' : n, la, lo, ele: Number.isFinite(ele) && ele > 0 ? Math.round(ele) : null, alt: parseFloat(g.height) || null });
      }
      Object.assign(TL, { pc: { lat: p.lat, lon: p.lon }, pat: Date.now(), pts, i: 0 });
      keep('passeios', { v: 1, c: TL.pc, at: TL.pat, pts }); keep('trilhas.i', 0);
    }
  } catch {}
  TL.loading = false;
}
function trilhasPrep() {                                            // também chamada antes de a cena entrar, para ela já abrir pronta
  const p = here();
  if (!TL.roads) { const c = load('trilhas', null); if (c?.v === 1 && c.roads) Object.assign(TL, { c: c.c, at: c.at, roads: c.roads, km: c.km, kt: c.kt }); }
  if (!TL.pts) { const c = load('passeios', null); if (c?.v === 1 && c.pts) Object.assign(TL, { pc: c.c, pat: c.at, pts: c.pts, i: load('trilhas.i', 0) }); }
  const mes = 30 * 86400000, er = !TL.roads || kmBetween(p, TL.c) > 7 || Date.now() - TL.at > mes, ep = !TL.pts || kmBetween(p, TL.pc) > 15 || Date.now() - TL.pat > mes;
  if ((er || ep) && !TL.loading && online() && Date.now() - TL.tried > 10 * 60000) loadTrilhas(p, er, ep);
}
let TS = null;
export function trilhas(ctx, w, h, t, color) {
  const p = here();
  trilhasPrep();
  ctx.fillStyle = '#04070a'; ctx.fillRect(0, 0, w, h);
  if (!TL.roads || kmBetween(p, TL.c) > 12) {
    if ((!TL.loading && t > 1) || t > 15) return true;
    hudText(ctx, h, ['TRILHAS E CACHOEIRAS · procurando no mapa…'], w / 2, h * 0.45, 'center'); return;
  }
  const nova = !TS || t < TS.last;
  if (nova || TS.w !== w || TS.roads !== TL.roads || TS.src !== TL.pts) TS = trilhasInit(ctx, w, h, p, nova ? null : TS.f);
  TS.last = t;
  const S = TS, x0 = w * 0.03, y0 = h * 0.04, B = h * 0.92, cx = x0 + B / 2, cy = y0 + B / 2, f = S.f;
  // o mapa: começa bem perto do carro, abre até 15 km e, se o destaque for mais longe, abre até ele
  const R = 4 + 11 * ease(t / 3) + (f && f.d > 14 ? (f.d * 1.15 - 15) * ease((t - 6) / 2.5) : 0), k = B / 2 / R, lw = Math.max(1, h * 0.0028);
  ctx.save(); caixa(ctx, x0, y0, B, B, h * 0.03); ctx.clip();
  ctx.fillStyle = '#060b10'; ctx.fillRect(x0, y0, B, B);
  ctx.strokeStyle = HUD; ctx.lineWidth = 1; ctx.font = `${Math.max(9, h * 0.042)}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  for (const r of [5, 10, 15, 25, 40]) {                            // distâncias em volta do carro
    if (r > R * 1.4 || r * k < h * 0.04) continue;
    ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.35; ctx.fillStyle = HUD; ctx.fillText(`${r} km`, cx + r * k * 0.71 + 4, cy - r * k * 0.71);
  }
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, B * 0.75 * ease(t / 2.5) + 1, 0, TAU); ctx.clip();   // as estradas aparecem do carro para fora
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = lw / k; ctx.stroke(S.terra);
  ctx.strokeStyle = '#ffe2b0'; ctx.globalAlpha = 0.85; ctx.lineWidth = lw * 1.2 / k; ctx.setLineDash([lw * 3 / k, lw * 2.5 / k]); ctx.stroke(S.trilha); ctx.setLineDash([]);
  ctx.restore();
  const XY = o => [cx + o.x * k, cy + o.y * k], dot = Math.max(2.5, h * 0.008);
  for (const o of S.pts) {                                          // os passeios
    const [x, y] = XY(o); if (x < x0 - dot || x > x0 + B + dot || y < y0 - dot || y > y0 + B + dot) continue;
    ctx.globalAlpha = o === f ? 1 : 0.75 * ease(t - 1); ctx.fillStyle = TIPO[o.t][1]; ctx.beginPath();
    if (o.t === 'pico') { ctx.moveTo(x, y - dot * 1.3); ctx.lineTo(x + dot * 1.1, y + dot * 0.8); ctx.lineTo(x - dot * 1.1, y + dot * 0.8); ctx.closePath(); }
    else if (o.t === 'mirante') { ctx.moveTo(x, y - dot * 1.2); ctx.lineTo(x + dot, y); ctx.lineTo(x, y + dot * 1.2); ctx.lineTo(x - dot, y); ctx.closePath(); }
    else ctx.arc(x, y, dot, 0, TAU);
    ctx.fill();
  }
  if (f) {                                                          // o destaque: linha reta do carro até ele
    const [x, y] = XY(f), pr = (t * 0.7) % 1, a = ease(t - 2);
    ctx.setLineDash([lw * 3, lw * 3]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw; ctx.globalAlpha = 0.45 * a; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = a * (1 - pr); ctx.beginPath(); ctx.arc(x, y, h * 0.014 + h * 0.045 * pr, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';                    // o carro
  ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.022); ctx.lineTo(cx + h * 0.014, cy + h * 0.014); ctx.lineTo(cx - h * 0.014, cy + h * 0.014); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = `${Math.max(9, h * 0.042)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = HUD; ctx.globalAlpha = 0.6;
  ctx.fillText('N', cx, y0 + 3);
  // à direita: quanto tem de terra em volta e o passeio da vez
  const ta = ease((t - 0.5) / 0.8), tx = x0 + B + w * 0.035;
  say(ctx, h, 'TRILHAS E CACHOEIRAS PERTO', tx, h * 0.04, ta * 0.85);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (const op of S.ops) { ctx.font = op.f; ctx.fillStyle = op.c; ctx.globalAlpha = ta * op.a * (op.f2 ? ease((t - op.f2) / 0.8) : 1); ctx.fillText(op.s, tx, op.y); }
  ctx.globalAlpha = 1;
}
function trilhasInit(ctx, w, h, p, f0) {
  const cl = Math.cos(p.lat * RAD), X = lo => (lo - p.lon) * 111.2 * cl, Y = la => -(la - p.lat) * 111.2;   // km para o leste e para o sul
  const terra = new Path2D(), trilha = new Path2D(); let near = Infinity, nx = 0, ny = 0;
  for (const r of TL.roads) {
    const P = r[0] ? trilha : terra; let la = r[1], lo = r[2];
    for (let i = 1; i < r.length; i += 2) {
      if (i > 1) { la += r[i]; lo += r[i + 1]; }
      const x = X(lo / 1e4), y = Y(la / 1e4), d = Math.hypot(x, y); if (d < near) { near = d; nx = x; ny = y; }
      i === 1 ? P.moveTo(x, y) : P.lineTo(x, y);
    }
  }
  const pts = (TL.pts || []).map(o => ({ ...o, x: X(o.lo), y: Y(o.la), d: kmBetween(p, { lat: o.la, lon: o.lo }) })).filter(o => o.d <= 42);
  let f = f0 ? pts.find(o => o.n === f0.n && o.t === f0.t) || null : null;
  if (!f0) {                                                        // um passeio com nome por vez, do mais perto para o mais longe
    const com = pts.filter(o => o.n).sort((a, b) => a.d - b.d);
    if (com.length) { f = com[TL.i % com.length]; TL.i = (TL.i + 1) % com.length; keep('trilhas.i', TL.i); }
  }
  const tw = w * 0.97 - (w * 0.03 + h * 0.92 + w * 0.035), ops = [], fim = h * (TELA.relogio ? 0.7 : 0.97);
  const dir = (x, y) => PARA[Math.round(((Math.atan2(x, -y) / RAD) % 360 + 360) % 360 / 45) % 8];
  const conta = Object.keys(TIPO).map(k => [k, pts.filter(o => o.t === k).length]).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? k : PLUR[k]}`);
  for (const k of [1, 0.9, 0.8]) {                                  // diminui as letras se não couber (no standby, até a altura do relógio)
    ops.length = 0; let y = h * 0.15;
    const txt = (s, px, peso, c, a, lh, f2) => { let fz = Math.max(9, h * px * k); ctx.font = `${peso}${fz}${FAM}`; const lw = ctx.measureText(s).width; if (lw > tw) fz *= tw / lw; ops.push({ s, y, f: `${peso}${fz}${FAM}`, c, a, f2 }); y += fz * lh; };
    if (TL.km >= 1) {
      txt(`${fmtN(TL.km)} km de estrada de terra`, 0.095, '700 ', '#ffffff', 1, 1.15);
      txt(near < 0.05 ? 'você está numa estrada de terra' : `a mais perto: ${near < 1 ? `${Math.max(1, Math.round(near * 10)) * 100} m` : `${kmTxt(near)} km`}, ${dir(nx, ny)}`, LER, '', HUD, 0.9, 1.5);
    } else txt('nenhuma estrada de terra perto', LER, '', HUD, 0.9, 1.5);
    if (f) {
      const [nome, cor] = TIPO[f.t];
      txt(nome, 0.065, '600 ', cor, 0.95, 1.25, 2);
      const N = caber(ctx, f.n, tw, h * 0.13 * k, h * 0.085 * k, 2, '600 ');
      for (const s of N.L) { ops.push({ s, y, f: `600 ${N.f}${FAM}`, c: '#ffffff', a: 1, f2: 2 }); y += N.f * 1.1; }
      txt([`${kmTxt(f.d)} km ${dir(f.x, f.y)}`, f.ele ? `${fmtN(f.ele)} m` : '', f.alt ? `queda de ${fmtN(f.alt)} m` : ''].filter(Boolean).join(' · '), LER, '', HUD, 0.9, 1.45, 2.3);
    }
    const resto = y;
    if (conta.length) txt(`em 40 km: ${conta.join(' · ')}`, 0.065, '', HUD, 0.7, 1.4, 1);
    txt('mapa: OpenStreetMap', 0.042, '', HUD, 0.45, 1.3);
    if (y > fim && resto <= fim) {                                  // o que sobra embaixo sai antes de diminuir as letras
      while (ops.length && ops[ops.length - 1].y >= resto) ops.pop();
      y = resto;
    }
    if (y <= fim) break;
  }
  return { w, roads: TL.roads, src: TL.pts, terra, trilha, pts, f, ops };
}
trilhas.prep = trilhasPrep;
