// Cenas de curiosidades com dados ao vivo:
// BICHOS VISTOS PERTO: fotos de bichos e plantas que pessoas fotografaram num raio de 50 km do carro (iNaturalist),
// com o nome em português, quando e onde foram vistos e o crédito da foto. Só entram fotos com licença aberta.
// Selos ao lado da foto: ameaçado de extinção, raro por aqui (poucos registros na região), raro no mundo, endêmico e veio de fora.
// HOJE NA HISTÓRIA: o que aconteceu neste mesmo dia em outros anos (Wikipédia em português), com a foto do artigo.
// O que baixa fica guardado; sem dados, a cena termina na hora.
import { here, load, keep, hudText, HUD, clamp, ease, rng, TELA, LER, coluna as colunaT, encher } from './cenas.js';
import { cities, kmBetween, online, fmtN, say } from './mundo.js';

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const PARA = ['ao norte', 'a nordeste', 'a leste', 'a sudeste', 'ao sul', 'a sudoeste', 'a oeste', 'a noroeste'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const IMG = new Map();
function foto(url) {                                                // a foto já carregada, ou null enquanto chega
  let im = IMG.get(url);
  if (!im) {
    im = new Image(); im.decoding = 'async'; im.onerror = () => { im.falhou = true; }; im.src = url; IMG.set(url, im);
    if (IMG.size > 16) IMG.delete(IMG.keys().next().value);
  }
  return im.complete && im.naturalWidth ? im : null;
}
const falhou = url => IMG.get(url)?.falhou;
const BL = new WeakMap();
function borrado(im) {                                              // a foto bem pequena: esticada, vira um fundo desfocado
  let c = BL.get(im); if (c) return c;
  const mid = Object.assign(document.createElement('canvas'), { width: 128, height: 72 }), mg = mid.getContext('2d');
  const s = Math.max(128 / im.naturalWidth, 72 / im.naturalHeight);
  mg.drawImage(im, (128 - im.naturalWidth * s) / 2, (72 - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
  c = Object.assign(document.createElement('canvas'), { width: 24, height: 14 }); c.getContext('2d').drawImage(mid, 0, 0, 24, 14);
  BL.set(im, c); return c;
}
function cover(ctx, im, x, y, w, h, z = 1) {                        // preenche a caixa cortando o que sobra
  const s = Math.max(w / im.naturalWidth, h / im.naturalHeight) * z, iw = im.naturalWidth * s, ih = im.naturalHeight * s;
  ctx.drawImage(im, x + (w - iw) / 2, y + (h - ih) * 0.42, iw, ih);
}
function caixa(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function linhas(ctx, s, max) {                                      // quebra o texto em linhas que cabem na largura
  const out = []; let cur = '';
  for (const wd of s.split(' ')) { const tr = cur ? `${cur} ${wd}` : wd; if (cur && ctx.measureText(tr).width > max) { out.push(cur); cur = wd; } else cur = tr; }
  if (cur) out.push(cur); return out;
}
function caber(ctx, s, max, f0, f1, n, peso = '', altura = Infinity, lh = 1.28) {   // o maior tamanho de letra em que o texto cabe
  for (let f = f0; ; f *= 0.93) {
    ctx.font = `${peso}${f}px system-ui, sans-serif`; const L = linhas(ctx, s, max), cabe = Math.min(n, Math.floor(altura / (f * lh)));
    if (L.length <= cabe || f * 0.93 < f1) return { f, L: L.slice(0, Math.max(1, cabe)) };
  }
}

// =====================================================================================
// BICHOS VISTOS PERTO
const INAT = 'https://api.inaturalist.org/v1/observations';
const LIC = 'cc0,cc-by,cc-by-nc,cc-by-sa,cc-by-nd,cc-by-nc-sa,cc-by-nc-nd';
const GRUPO = { Aves: 'ave', Mammalia: 'mamífero', Reptilia: 'réptil', Amphibia: 'anfíbio', Actinopterygii: 'peixe', Mollusca: 'molusco',
  Arachnida: 'aracnídeo', Insecta: 'inseto', Plantae: 'planta', Fungi: 'fungo', Animalia: 'animal', Chromista: 'alga', Protozoa: 'protozoário' };
const BX = { key: '', list: null, total: 0, at: 0, loading: false, tried: 0, i: 0 };
const IUCN = { 30: 'vulnerável', 40: 'em perigo', 50: 'criticamente em perigo', 60: 'extinto na natureza' };
// selos da ficha: [título, explicação, cor]. "Raro" quer dizer pouco fotografado, que é o que o iNaturalist sabe.
function selos(o) {
  const s = [];
  if (o.thr) s.push(o.iu >= 30 ? ['AMEAÇADO DE EXTINÇÃO', IUCN[o.iu] || 'em lista oficial', '#ff6a5a'] : o.iu === 20 ? ['QUASE AMEAÇADO', 'na lista vermelha mundial', '#ff9a4a'] : ['AMEAÇADO DE EXTINÇÃO', 'em lista oficial', '#ff6a5a']);
  if (o.lc === 1) s.push(['RARO POR AQUI', 'único registro na região', '#c58cff']);
  else if (o.lc && o.lc <= 3) s.push(['POUCO VISTO', `só ${o.lc} registros na região`, '#c58cff']);
  if (o.sp && o.wc && o.wc < 150) s.push(['RARO NO MUNDO', `só ${fmtN(o.wc)} registros no mundo`, '#ffd34d']);
  if (o.end) s.push(['ENDÊMICO', 'só vive nesta parte do mundo', '#5fd3a0']);
  if (o.intro) s.push(['VEIO DE FORA', 'espécie trazida de outro lugar', '#7fb0ff']);
  return s.slice(0, 2);
}
async function loadBichos(p, key) {
  BX.loading = true; BX.tried = Date.now();
  try {
    const at = { lat: p.lat.toFixed(3), lng: p.lon.toFixed(3), radius: 50 };
    const get = async (path, q) => { const r = await fetch(`${INAT}${path}?${new URLSearchParams({ ...at, ...q })}`, { signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error(r.status); return r.json(); };
    const base = { photos: 'true', captive: 'false', quality_grade: 'research', locale: 'pt-BR', order_by: 'observed_on', order: 'desc', photo_license: LIC };
    // as fotos mais recentes e, à parte, as das espécies ameaçadas (que senão quase nunca apareceriam)
    const [j, jt] = await Promise.all([get('', { ...base, per_page: 200 }), get('', { ...base, per_page: 100, threatened: 'true' }).catch(() => ({ results: [] }))]);
    const seen = new Set(), all = [];
    for (const o of [...(jt.results || []), ...(j.results || [])]) {
      const t = o.taxon, ph = (o.photos || []).find(f => f.license_code && f.url), c = o.geojson?.coordinates;
      if (!t || !ph || !c || seen.has(t.id)) continue; seen.add(t.id);
      const quem = (ph.attribution || '').match(/^\(c\)\s*(.+?),\s*(?:some|all|no) rights/i)?.[1] || '', cs = t.conservation_status;
      all.push({ id: t.id, n: t.preferred_common_name || '', s: t.name, g: t.iconic_taxon_name || '', d: o.observed_on, la: c[1], lo: c[0],
        u: ph.url.replace('/square.', '/large.'), q: quem.slice(0, 40), l: ph.license_code.toUpperCase().replace(/^CC-/, 'CC '),
        sp: t.rank_level <= 10, wc: t.observations_count || 0, thr: !!t.threatened, iu: /iucn/i.test(cs?.authority || '') ? cs.iucn : null,
        end: !!t.endemic, intro: !!t.introduced, ob: !!o.obscured });
    }
    const ids = all.filter(o => o.sp).map(o => o.id);                // quantas vezes cada espécie já foi registrada na região
    if (ids.length) try {
      const sc = await get('/species_counts', { verifiable: 'true', per_page: 200, taxon_id: ids.join(',') }), cnt = new Map((sc.results || []).map(x => [x.taxon.id, x.count]));
      for (const o of all) if (o.sp && cnt.has(o.id)) o.lc = cnt.get(o.id);
    } catch {}
    const peso = o => (o.thr ? (o.iu >= 30 || o.iu == null ? 4 : 3) : 0) + (o.lc === 1 ? 2 : o.lc <= 3 ? 1 : 0) + (o.sp && o.wc && o.wc < 150 ? 1.5 : 0) + (o.end ? 1 : 0);
    const by = new Map();
    for (const o of all) { delete o.id; if (!by.has(o.g)) by.set(o.g, []); by.get(o.g).push(o); }
    for (const a of by.values()) a.sort((x, y) => peso(y) - peso(x) || (!!y.n - !!x.n) || (y.d > x.d ? 1 : y.d < x.d ? -1 : 0));   // as raras primeiro, depois as com nome popular
    const list = []; for (let left = true; left;) { left = false; for (const a of by.values()) if (a.length) { list.push(a.shift()); left = true; } }   // um de cada grupo por vez
    Object.assign(BX, { key, list: list.slice(0, 80), total: j.total_results || list.length, at: Date.now(), i: 0 });
    keep('bichos', { v: 2, key, at: BX.at, list: BX.list, total: BX.total });
  } catch {}
  BX.loading = false;
}
function quando(d) {
  const [y, m, dd] = (d || '').split('-').map(Number); if (!y) return '';
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const n = Math.round((hoje - new Date(y, m - 1, dd)) / 86400000);
  return n <= 0 ? 'visto hoje' : n === 1 ? 'visto ontem' : n <= 45 ? `visto há ${n} dias` : `visto em ${MESES[m - 1]} de ${y}`;
}
function onde(p, o) {
  const km = kmBetween(p, { lat: o.la, lon: o.lo }); if (km < 1.5) return 'pertinho daqui';
  const dir = PARA[Math.round(((Math.atan2((o.lo - p.lon) * Math.cos(p.lat * RAD), o.la - p.lat) / RAD) % 360 + 360) % 360 / 45) % 8];
  if (o.ob) return `uns ${fmtN(km)} km ${dir} (local protegido)`;   // o iNaturalist esconde o ponto exato das espécies ameaçadas
  const CL = cities(p); let perto = null;
  if (CL) for (const c of CL) { const d = kmBetween(c, { lat: o.la, lon: o.lo }); if (d < 12 && (!perto || d < perto.d)) perto = { n: c.n, d }; }
  return `${perto ? `perto de ${perto.n} · ` : ''}${fmtN(km)} km ${dir}`;
}
let BS = null;
async function bichosPrep() {                                     // também chamada antes de a cena entrar, para ela já abrir pronta
  const p = here(), key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  if (BX.key !== key) { const c = load('bichos', null); if (c?.v === 2 && c.key === key && c.list?.length) Object.assign(BX, { key, list: c.list, total: c.total, at: c.at, i: load('bichos.i', 0) % c.list.length }); }   // continua de onde parou
  if ((BX.key !== key || Date.now() - BX.at > 6 * 3600000) && !BX.loading && online() && Date.now() - BX.tried > 120000) await loadBichos(p, key);
  const o = BX.key === key ? BX.list?.[BX.i] : null; if (o?.u) foto(o.u);   // a foto do próximo bicho
}
export function bichos(ctx, w, h, t, color) {
  const p = here(), key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  bichosPrep();
  ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, w, h);
  const L = BX.key === key ? BX.list : null;
  if (!L?.length) {
    if ((!BX.loading && t > 1) || t > 12) return true;
    hudText(ctx, h, ['BICHOS VISTOS PERTO · procurando…'], w / 2, h * 0.45, 'center'); return;
  }
  if (!BS || t < BS.last) BS = { cur: null, t0: 0 };
  BS.last = t;
  if (!BS.cur) {                                                    // um bicho por vez: fica a cena inteira, e o próximo vem na próxima vez
    for (let k = 0; k < Math.min(6, L.length); k++) {
      const j = (BX.i + k) % L.length, o = L[j];
      if (falhou(o.u)) continue;
      const im = foto(o.u); if (!im) { if (t < 3) break; continue; }   // 3 s pela foto da vez; depois, o próximo que estiver pronto
      BS.cur = { o, im, lay: null }; BS.t0 = t; BX.i = (j + 1) % L.length; keep('bichos.i', BX.i); break;
    }
  }
  for (let k = 0; k < 3; k++) foto(L[(BX.i + k) % L.length].u);    // a foto do próximo já vai chegando
  if (!BS.cur) {
    if (t > 12) return true;
    hudText(ctx, h, ['BICHOS VISTOS PERTO · carregando as fotos…'], w / 2, h * 0.45, 'center'); return;
  }
  const a = ease((t - BS.t0) / 0.8);
  ficha(ctx, w, h, t, color, BS.cur, a, p, clamp(a * 2 - 1));
}
function ficha(ctx, w, h, t, color, it, alpha, p, ta) {   // alpha: a foto; ta: o texto (entra depois da foto)
  const { o, im } = it, kb = clamp((t - BS.t0) / 25);              // a foto chega mais perto devagar, a cena inteira
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(borrado(im), -w * 0.05, -h * 0.05, w * 1.1, h * 1.1);   // fundo: a própria foto desfocada e escura
  ctx.fillStyle = 'rgba(3,5,8,0.62)'; ctx.fillRect(0, 0, w, h);
  const ar = im.naturalWidth / im.naturalHeight, ch = h * 0.92, cw = Math.min(w * 0.38, ch * clamp(ar, 0.72, 1.4)), x0 = w * 0.03, y0 = h * 0.04;
  ctx.save(); caixa(ctx, x0, y0, cw, ch, h * 0.03); ctx.clip(); cover(ctx, im, x0, y0, cw, ch, 1.02 + 0.06 * kb); ctx.restore();
  caixa(ctx, x0, y0, cw, ch, h * 0.03); ctx.strokeStyle = color; ctx.globalAlpha = alpha * 0.35; ctx.lineWidth = Math.max(1, h * 0.003); ctx.stroke();
  const tx = x0 + cw + w * 0.035, tw = w * 0.97 - tx, fim = h * (TELA.relogio ? 0.66 : 0.96);   // no standby, embaixo à direita fica o relógio
  if (!it.lay || it.lay.w !== w) { const itens = itensB(o, p, color); it.lay = { w, itens, s: encher(ctx, h, itens, tx, h * 0.04, tw, fim, 1.6, false) }; }   // medido uma vez por foto
  colunaT(ctx, h, it.lay.itens, tx, h * 0.04, tw, fim, true, it.lay.s, ta);
  ctx.restore();
}
// o texto do lado direito da foto: grupo, nome, nome científico, os selos de raridade, quando e onde foi visto
function itensB(o, p, color) {
  const nome = o.n ? o.n[0].toUpperCase() + o.n.slice(1) : o.s;
  return [[(GRUPO[o.g] || 'ser vivo').toUpperCase(), 0.95, color, 0.06, '600 ', 1], [nome, 1, '#ffffff', 0.12, '600 ', 2],
    o.n ? [o.s, 0.7, HUD, 0.06, 'italic ', 1] : null,
    ...selos(o).map(([tt, ex, cor]) => [`${tt} · ${ex}`, 1, cor, 0.055, '700 ', 2]),
    [quando(o.d), 0.85, HUD, LER * 0.85, '', 1], [onde(p, o), 0.85, HUD, LER * 0.85, '', 2]];
}

// =====================================================================================
// HOJE NA HISTÓRIA
const WIKI = 'https://pt.wikipedia.org/api/rest_v1/feed/onthisday/';
const RUIM = /\b(mort[oa]s?|morre|morrem|morreram|cai|caiu|queda|acidente|massacre|assassin|atentado|explos|naufrag|terremoto|bombarde|genoc|execu|incêndio|desastre|refém|reféns)/i;
const BR = /Brasil|brasileir|Rio de Janeiro|São Paulo|Minas Gerais|Santos Dumont|Juiz de Fora|Pelé|Copa do Mundo/;
const WK = { day: '', list: null, hol: [], loading: false, tried: 0, i: 0 };
async function loadHist(day) {
  WK.loading = true; WK.tried = Date.now();
  try {
    const [mm, dd] = day.split('/'), get = async k => { const r = await fetch(`${WIKI}${k}/${mm}/${dd}`, { signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error(r.status); return r.json(); };
    const [ev, sel, hol] = await Promise.all([get('events'), get('selected').catch(() => ({})), get('holidays').catch(() => ({}))]);
    const seen = new Set(), items = [];
    for (const e of [...(sel.selected || []).map(x => ({ ...x, sel: true })), ...(ev.events || [])]) {
      if (typeof e.year !== 'number' || !e.text) continue;
      const k = `${e.year}:${e.pages?.[0]?.title || e.text.slice(0, 20)}`; if (seen.has(k)) continue; seen.add(k);   // os destaques também vêm na lista
      const txt = e.text.replace(/\s*\((?:na |à )?(?:imagem|foto|figura)[^)]*\)/gi, '').replace(/\s+/g, ' ').trim();
      const fotos = (e.pages || []).filter(q => q.thumbnail?.source && !/^\d+$/.test(q.title) && !/_de_[a-zç]+$/i.test(q.title));
      const nome = q => (q.normalizedtitle || q.title.replace(/_/g, ' ')).replace(/\s*\(.*\)$/, '');
      const pg = fotos.find(q => txt.includes(nome(q))) || fotos[0];   // de preferência o artigo cujo nome aparece no texto (com maiúscula)
      let img = null;
      if (pg) { const or = pg.originalimage; img = or?.width >= 500 ? pg.thumbnail.source.replace(/\/\d+px-/, '/500px-') : pg.thumbnail.source; }
      items.push({ y: e.year, txt, img, pr: e.sel ? 0 : BR.test(txt) ? 1 : RUIM.test(txt) ? 3 : 2 });
    }
    const r = rng(Number(mm) * 100 + Number(dd) + new Date().getFullYear() * 1000), ord = new Map(items.map(o => [o, r()]));
    items.sort((a, b) => a.pr - b.pr || ord.get(a) - ord.get(b));   // destaques e Brasil primeiro; tragédias por último
    const datas = (hol.holidays || []).map(x => x.text.replace(/\.$/, '').trim()).filter(s => /^Dia /.test(s) && !s.includes(' - ') && s.length < 40).slice(0, 2);
    Object.assign(WK, { day, list: items, hol: datas, i: 0 });
    keep('historia', { day, list: items, hol: datas }); keep('historia.i', { day, i: 0 });
  } catch {}
  WK.loading = false;
}
let HS = null;
const anoTxt = y => y < 0 ? `${-y} a.C.` : String(y);
async function historiaPrep() {
  const now = new Date(), day = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  if (WK.day !== day) { const c = load('historia', null), ci = load('historia.i', null); if (c?.day === day && c.list?.length) Object.assign(WK, { day, list: c.list, hol: c.hol || [], i: ci?.day === day ? ci.i % c.list.length : 0 }); }   // continua de onde parou
  if (WK.day !== day && !WK.loading && online() && Date.now() - WK.tried > 120000) await loadHist(day);
  const o = WK.day === day ? WK.list?.[WK.i % WK.list.length] : null; if (o?.img) foto(o.img);   // a foto do próximo fato
}
export function historia(ctx, w, h, t, color) {
  const now = new Date(), day = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  historiaPrep();
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b0906'); g.addColorStop(1, '#050403');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const L = WK.day === day ? WK.list : null;
  if (!L?.length) {
    if ((!WK.loading && t > 1) || t > 12) return true;
    hudText(ctx, h, ['HOJE NA HISTÓRIA · procurando…'], w / 2, h * 0.45, 'center'); return;
  }
  if (!HS || t < HS.last) HS = { cur: null, t0: 0, imT: null };
  HS.last = t;
  const Y = now.getFullYear();
  if (!HS.cur) {                                                    // um fato por vez: fica a cena inteira, e o próximo vem na próxima vez
    const o = L[WK.i % L.length];
    if (!o.img || foto(o.img) || falhou(o.img) || t > 3) { HS.cur = { o, lay: null }; HS.t0 = t; WK.i = (WK.i + 1) % L.length; keep('historia.i', { day, i: WK.i }); }
    else return;                                                    // a foto ainda está chegando (já vem pedida da vez anterior)
  }
  if (L.length > 1) { const nx = L[WK.i % L.length]; if (nx.img) foto(nx.img); }   // a foto do próximo já vai chegando
  const { o } = HS.cur, k = t - HS.t0, roll = ease(k / 1.6), fade = ease((k - 1.4) / 0.8), out = 1;
  // em cima, a data comemorativa de hoje (se tiver); depois o ano rodando até o do fato, e o fato com a maior letra que couber
  const lx0 = w * 0.05, cw = w * 0.56;
  let y = h * 0.04;
  if (WK.hol[0]) { y = colunaT(ctx, h, [[`hoje: ${WK.hol[0]}`, 0.8, HUD, 0.065, '', 1]], lx0, y, cw); }
  const yr = Math.round(Y + (o.y - Y) * roll), n = Y - o.y, fy0 = y + h * 0.19;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = out;
  ctx.font = `700 ${h * 0.2}px monospace`; ctx.fillStyle = color; ctx.fillText(anoTxt(yr), lx0, fy0);
  const aw = ctx.measureText(anoTxt(o.y)).width;
  ctx.font = `${Math.max(10, h * LER)}px system-ui, sans-serif`; ctx.fillStyle = HUD; ctx.globalAlpha = out * fade * 0.85;
  ctx.fillText(n <= 0 ? 'este ano' : n === 1 ? 'há 1 ano' : `há ${fmtN(n)} anos`, lx0 + aw + h * 0.04, fy0);
  const fy = fy0 + h * 0.05, fim = h * 0.96;                      // a coluna da esquerda não chega no relógio do standby
  if (!HS.cur.lay || HS.cur.lay.w !== w || HS.cur.lay.fy !== fy) { const itens = [[o.txt, 1, '#f4efe6', LER, '', 8]]; HS.cur.lay = { w, fy, itens, s: encher(ctx, h, itens, lx0, fy, cw, fim, 1.5, false) }; }
  colunaT(ctx, h, HS.cur.lay.itens, lx0, fy, cw, fim, true, HS.cur.lay.s, out * ease((k - 1.5) / 0.6));
  // a foto do artigo, do lado direito (sem descer até o relógio)
  const im = o.img ? foto(o.img) : null;
  if (im) {
    const bx = w * 0.64, by = h * 0.04, bw = w * 0.33, bh = h * (TELA.relogio ? 0.62 : 0.92), s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
    const iw = im.naturalWidth * s, ih = im.naturalHeight * s, ix = bx + (bw - iw) / 2, iy = by + (bh - ih) / 2, z = 1 + 0.05 * clamp(k / 25);
    if (HS.imT === null) HS.imT = k;                               // foto que chegou atrasada aparece aos poucos
    ctx.globalAlpha = out * ease((k - Math.max(0.6, HS.imT)) / 0.8);
    ctx.save(); caixa(ctx, ix, iy, iw, ih, h * 0.02); ctx.clip(); ctx.drawImage(im, ix - iw * (z - 1) / 2, iy - ih * (z - 1) / 2, iw * z, ih * z); ctx.restore();
    caixa(ctx, ix, iy, iw, ih, h * 0.02); ctx.strokeStyle = color; ctx.globalAlpha *= 0.35; ctx.lineWidth = Math.max(1, h * 0.003); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export { foto, falhou, borrado, cover, caixa, linhas, caber, PARA, MESES };
bichos.prep = bichosPrep;
historia.prep = historiaPrep;
