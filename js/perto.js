// Cenas do que está em volta do carro, com dados ao vivo (o que baixa fica guardado no aparelho):
// LUGARES PERTO: o que tem artigo na Wikipédia num raio de 25 km (cidades, museus, usinas, estações, igrejas), com a
// foto, a distância, a direção e o começo do artigo. A lista vem do Wikidata e muda sozinha quando o carro se afasta.
// Lugar sem foto aparece num radar, na direção em que está.
import { here, load, keep, hudText, HUD, clamp, ease, TELA, LER, coluna, encher } from './cenas.js';
import { kmBetween, online, fmtN, say } from './mundo.js';
import { foto, falhou, borrado, cover, caixa, linhas, caber, PARA } from './curiosidades.js';

const TAU = Math.PI * 2, RAD = Math.PI / 180, FAM = 'px system-ui, sans-serif';
const OVP = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function overpass(q, ms = 100000) {                           // OpenStreetMap; o servidor principal vive ocupado, então tenta o espelho
  let err;
  for (const u of OVP) { try { const r = await fetch(u + '?data=' + encodeURIComponent(q), { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(r.status); return await r.json(); } catch (e) { err = e; } }
  throw err;
}
const rumo = (p, o) => ((Math.atan2((o.lon - p.lon) * Math.cos(p.lat * RAD), o.lat - p.lat) / RAD) % 360 + 360) % 360;
const kmTxt = km => km < 10 ? km.toFixed(1).replace('.', ',') : fmtN(km);
try { localStorage.removeItem('tr4.rio'); } catch {}                // a cena do rio saiu: apaga o que ela guardava

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
  const { o, im } = it, k = t - LS.t0, x0 = w * 0.03, y0 = h * 0.04, ch = h * 0.92;
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
  const tx = x0 + cw + w * 0.035, tw = w * 0.97 - tx, fim = h * 0.96;
  if (!it.lay || it.lay.w !== w) { const itens = itensL(o, p, L, color); it.lay = { w, itens, s: encher(ctx, h, itens, tx, h * 0.04, tw, fim, 2.2, false) }; }   // medido uma vez por lugar
  coluna(ctx, h, it.lay.itens, tx, h * 0.04, tw, fim, true, it.lay.s, ta);
  ctx.restore();
}
// o texto do lado direito: tipo, nome, distância e o começo do artigo, com a maior letra que couber
function itensL(o, p, L, color) {
  const frases = o.x.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÚÇ"“])/);       // "4.149 habitantes" não é fim de frase
  let txt = frases[0]; for (const f of frases.slice(1)) { if ((txt + ' ' + f).length > 230) break; txt += ' ' + f; }
  return [[o.t.toUpperCase(), 0.95, color, 0.06, '600 ', 1], [o.n, 1, '#ffffff', 0.12, '600 ', 2],
    [ondeFica(p, o, L), 0.9, HUD, LER * 0.9, '', 1], [txt.replace(/\s+/g, ' ').trim(), 0.92, '#e8eef2', LER * 0.85, '', 4]];
}
// radar dos lugares em volta (norte para cima), com o lugar da vez destacado
function radar(ctx, cx, cy, R, h, p, o, L, color, k, A) {
  const far = Math.max(1, ...L.map(q => kmBetween(p, { lat: q.la, lon: q.lo }))), esc = [5, 10, 25].find(v => v >= far) || 25;   // no máximo 25 km: o que passar fica na borda
  const pos = q => { const g = rumo(p, { lat: q.la, lon: q.lo }) * RAD, d = Math.min(1, kmBetween(p, { lat: q.la, lon: q.lo }) / esc) * R; return [cx + Math.sin(g) * d, cy - Math.cos(g) * d]; };
  const lw = Math.max(1, h * 0.003);
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  for (const f of [0.5, 1]) { ctx.globalAlpha = A * (f === 1 ? 0.4 : 0.2); ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = A * 0.12; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  const sw = k * 1.3;                                               // a varredura do radar
  for (let n = 0; n < 12; n++) { ctx.globalAlpha = A * 0.12 * (1 - n / 12); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sw - (n + 1) * 0.06 - Math.PI / 2, sw - n * 0.06 - Math.PI / 2); ctx.closePath(); ctx.fill(); }
  ctx.font = `${Math.max(9, h * 0.05)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = HUD;
  ctx.globalAlpha = A * 0.6; ctx.fillText('N', cx, cy - R - h * 0.03);
  ctx.globalAlpha = A * 0.4; ctx.textAlign = 'left'; ctx.fillText(`${esc / 2} km`, cx + R * 0.5 * 0.71 + 4, cy - R * 0.5 * 0.71); ctx.fillText(`${esc} km`, cx + R * 0.71 + 4, cy - R * 0.71);
  for (const q of L) { if (q === o) continue; const [x, y] = pos(q); ctx.globalAlpha = A * 0.45; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, h * 0.006), 0, TAU); ctx.fill(); }
  const [x, y] = pos(o), pr = (k * 0.8) % 1;
  ctx.setLineDash([lw * 3, lw * 3]); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = A * 0.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = A * (1 - pr); ctx.beginPath(); ctx.arc(x, y, h * 0.012 + h * 0.04 * pr, 0, TAU); ctx.stroke();
  ctx.globalAlpha = A; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, Math.max(3, h * 0.011), 0, TAU); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.022); ctx.lineTo(cx + h * 0.014, cy + h * 0.014); ctx.lineTo(cx - h * 0.014, cy + h * 0.014); ctx.closePath(); ctx.fill();   // você
}

lugares.prep = lugaresPrep;

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
  // o mapa bem perto do carro (de longe, no painel, só assim dá para ver as estradas): abre de 1,5 até 4 km
  const R = 1.5 + 2.5 * ease(t / 3), k = B / 2 / R, lw = Math.max(1.5, h * 0.008);
  ctx.save(); caixa(ctx, x0, y0, B, B, h * 0.03); ctx.clip();
  ctx.fillStyle = '#060b10'; ctx.fillRect(x0, y0, B, B);
  ctx.strokeStyle = HUD; ctx.lineWidth = 1; ctx.font = `${Math.max(9, h * 0.05)}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  for (const r of [1, 2, 4]) {                                      // distâncias em volta do carro
    if (r > R * 1.4) continue;
    ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.4; ctx.fillStyle = HUD; ctx.fillText(`${r} km`, cx + r * k * 0.71 + 4, cy - r * k * 0.71);
  }
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, B * 0.75 * ease(t / 2.5) + 1, 0, TAU); ctx.clip();   // as estradas aparecem do carro para fora
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = color; ctx.globalAlpha = 0.7; ctx.lineWidth = lw / k; ctx.stroke(S.terra);
  ctx.strokeStyle = '#ffe2b0'; ctx.globalAlpha = 0.95; ctx.lineWidth = lw * 1.1 / k; ctx.setLineDash([lw * 2.2 / k, lw * 1.6 / k]); ctx.stroke(S.trilha); ctx.setLineDash([]);
  ctx.restore();
  const XY = o => [cx + o.x * k, cy + o.y * k], dot = Math.max(4, h * 0.022);
  const icone = (o, x, y, d) => {
    ctx.fillStyle = TIPO[o.t][1]; ctx.beginPath();
    if (o.t === 'pico') { ctx.moveTo(x, y - d * 1.3); ctx.lineTo(x + d * 1.1, y + d * 0.8); ctx.lineTo(x - d * 1.1, y + d * 0.8); ctx.closePath(); }
    else if (o.t === 'mirante') { ctx.moveTo(x, y - d * 1.2); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d * 1.2); ctx.lineTo(x - d, y); ctx.closePath(); }
    else ctx.arc(x, y, d, 0, TAU);
    ctx.fill();
  };
  for (const o of S.pts) {                                          // os passeios que caem no mapa
    const [x, y] = XY(o); if (x < x0 - dot || x > x0 + B + dot || y < y0 - dot || y > y0 + B + dot) continue;
    ctx.globalAlpha = o === f ? 1 : 0.8 * ease(t - 1); icone(o, x, y, dot);
  }
  if (f) {                                                          // o destaque: dentro do mapa, pulsando; fora, uma seta na borda
    let [x, y] = XY(f); const a = ease(t - 2), fora = Math.hypot(x - cx, y - cy) > B / 2 - dot * 2;
    if (fora) { const g = Math.atan2(y - cy, x - cx), r = B / 2 - dot * 2.2; x = cx + Math.cos(g) * r; y = cy + Math.sin(g) * r; }
    ctx.setLineDash([lw * 1.5, lw * 1.5]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 0.5; ctx.globalAlpha = 0.6 * a; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = a; icone(f, x, y, dot * 1.25);
    const pr = (t * 0.7) % 1; ctx.globalAlpha = a * (1 - pr); ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.arc(x, y, dot * 1.5 + h * 0.05 * pr, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';                    // o carro
  ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.035); ctx.lineTo(cx + h * 0.022, cy + h * 0.022); ctx.lineTo(cx - h * 0.022, cy + h * 0.022); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = `${Math.max(9, h * 0.05)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = HUD; ctx.globalAlpha = 0.6;
  ctx.fillText('N', cx, y0 + 3); ctx.globalAlpha = 1;
  // à direita: quanto tem de terra em volta e o passeio da vez, com a maior letra que couber
  const tx = x0 + B + w * 0.035;
  if (!S.s) S.s = encher(ctx, h, S.itens, tx, h * 0.04, S.tw, S.fim, 2.2, false);
  coluna(ctx, h, S.itens, tx, h * 0.04, S.tw, S.fim, true, S.s, ease((t - 0.5) / 0.8));
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
  const tw = w * 0.97 - (w * 0.03 + h * 0.92 + w * 0.035), fim = h * 0.96;
  const dir = (x, y) => PARA[Math.round(((Math.atan2(x, -y) / RAD) % 360 + 360) % 360 / 45) % 8];
  const conta = Object.keys(TIPO).map(k => [k, pts.filter(o => o.t === k).length]).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? k : PLUR[k]}`);
  const itens = [];
  if (TL.km >= 1) {
    itens.push([`${fmtN(TL.km)} km de terra`, 1, '#ffffff', 0.1, '700 ', 1]);
    itens.push([near < 0.05 ? 'você está numa estrada de terra' : `a mais perto: ${near < 1 ? `${Math.max(1, Math.round(near * 10)) * 100} m` : `${kmTxt(near)} km`} ${dir(nx, ny)}`, 0.9, HUD, LER * 0.85, '', 1]);
  } else itens.push(['nenhuma estrada de terra perto', 0.9, HUD, LER * 0.85]);
  if (f) {
    const [nome, cor] = TIPO[f.t];
    itens.push([nome, 0.95, cor, 0.06, '600 ', 1], [f.n, 1, '#ffffff', 0.11, '600 ', 2],
      [[`${kmTxt(f.d)} km ${dir(f.x, f.y)}`, f.ele ? `${fmtN(f.ele)} m` : '', f.alt ? `queda de ${fmtN(f.alt)} m` : ''].filter(Boolean).join(' · '), 0.9, HUD, LER * 0.85, '', 1]);
  }
  if (conta.length) itens.push([`em 40 km: ${conta.join(' · ')}`, 0.7, HUD, 0.055, '', 1]);
  return { w, roads: TL.roads, src: TL.pts, terra, trilha, pts, f, itens, tw, fim };
}
trilhas.prep = trilhasPrep;
