// Cenas de curiosidades com dados ao vivo:
// BICHOS VISTOS PERTO: fotos de bichos e plantas que pessoas fotografaram num raio de 50 km do carro (iNaturalist),
// com o nome em português, quando e onde foram vistos e o crédito da foto. Só entram fotos com licença aberta.
// Selos ao lado da foto: ameaçado de extinção, raro por aqui (poucos registros na região), raro no mundo, endêmico e veio de fora.
// HOJE NA HISTÓRIA: o que aconteceu neste mesmo dia em outros anos (Wikipédia em português), com a foto do artigo.
// O que baixa fica guardado; sem dados, a cena termina na hora.
import { here, load, keep, hudText, HUD, clamp, ease, rng } from './cenas.js';
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
export function bichos(ctx, w, h, t, color) {
  const p = here(), key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  if (BX.key !== key) { const c = load('bichos', null); if (c?.v === 2 && c.key === key && c.list?.length) Object.assign(BX, { key, list: c.list, total: c.total, at: c.at, i: 0 }); }
  if ((BX.key !== key || Date.now() - BX.at > 6 * 3600000) && !BX.loading && online() && Date.now() - BX.tried > 120000) loadBichos(p, key);
  ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, w, h);
  const L = BX.key === key ? BX.list : null;
  if (!L?.length) {
    if ((!BX.loading && t > 1) || t > 12) return true;
    hudText(ctx, h, ['BICHOS VISTOS PERTO · procurando…'], w / 2, h * 0.45, 'center'); return;
  }
  if (!BS || t < BS.last) BS = { cur: null, prev: null, t0: 0 };
  BS.last = t;
  const D = 5.5;
  if (!BS.cur || t - BS.t0 > D) {                                   // a próxima entra quando a atual cumpriu o tempo e a foto já chegou
    for (let k = 0; k < Math.min(6, L.length); k++) {
      const j = (BX.i + k) % L.length, o = L[j];
      if (falhou(o.u)) continue;
      const im = foto(o.u); if (!im) continue;
      BS.prev = BS.cur; BS.cur = { o, im, lay: null }; BS.t0 = t; BX.i = (j + 1) % L.length; break;
    }
  }
  for (let k = 0; k < 3; k++) foto(L[(BX.i + k) % L.length].u);    // já vai pedindo as próximas
  if (!BS.cur) {
    if (t > 12) return true;
    hudText(ctx, h, ['BICHOS VISTOS PERTO · carregando as fotos…'], w / 2, h * 0.45, 'center'); return;
  }
  const a = ease((t - BS.t0) / 0.8);
  if (BS.prev && a < 1) ficha(ctx, w, h, t, color, BS.prev, 1, p, 1 - clamp(a * 2));
  ficha(ctx, w, h, t, color, BS.cur, a, p, clamp(a * 2 - 1));
}
function ficha(ctx, w, h, t, color, it, alpha, p, ta) {   // alpha: a foto; ta: o texto (o velho some antes de o novo aparecer)
  const { o, im } = it, kb = clamp((t - BS.t0 + (it === BS.prev ? 5.5 : 0)) / 6.5);
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(borrado(im), -w * 0.05, -h * 0.05, w * 1.1, h * 1.1);   // fundo: a própria foto desfocada e escura
  ctx.fillStyle = 'rgba(3,5,8,0.62)'; ctx.fillRect(0, 0, w, h);
  const ar = im.naturalWidth / im.naturalHeight, ch = h * 0.84, cw = Math.min(w * 0.46, ch * clamp(ar, 0.72, 1.4)), x0 = w * 0.1, y0 = h * 0.08;
  ctx.save(); caixa(ctx, x0, y0, cw, ch, h * 0.03); ctx.clip(); cover(ctx, im, x0, y0, cw, ch, 1.02 + 0.06 * kb); ctx.restore();
  caixa(ctx, x0, y0, cw, ch, h * 0.03); ctx.strokeStyle = color; ctx.globalAlpha = alpha * 0.35; ctx.lineWidth = Math.max(1, h * 0.003); ctx.stroke();
  const tx = x0 + cw + w * 0.035, tw = w * 0.96 - tx;
  if (!it.lay || it.lay.w !== w) it.lay = { w, ops: coluna(ctx, w, h, o, p, tw, color) };   // o texto é medido uma vez por foto
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  say(ctx, h, 'VISTOS PERTO DE VOCÊ', tx, h * 0.08, ta * 0.85);
  for (const op of it.lay.ops) {
    if (!op.selo) { ctx.font = op.f; ctx.fillStyle = op.c; ctx.globalAlpha = ta * op.a; ctx.fillText(op.s, tx, op.y); continue; }
    const { tt, ex, cor, y, f1, f2, w1, w2, rh } = op, pad = rh * 0.32;   // selo: título colorido e a explicação, numa linha
    ctx.globalAlpha = ta * 0.85; ctx.fillStyle = '#05070a'; caixa(ctx, tx, y, w1 + w2 + pad * 2.6, rh, rh * 0.3); ctx.fill();
    ctx.globalAlpha = ta; ctx.fillStyle = cor; ctx.fillRect(tx + pad * 0.55, y + rh * 0.22, Math.max(2, h * 0.006), rh * 0.56);
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${f1}px system-ui, sans-serif`; ctx.fillText(tt, tx + pad * 1.4, y + rh * 0.53);
    ctx.font = `${f2}px system-ui, sans-serif`; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = ta * 0.85; ctx.fillText(` · ${ex}`, tx + pad * 1.4 + w1, y + rh * 0.53);
    ctx.textBaseline = 'top';
  }
  ctx.restore();
}
// o texto do lado direito da foto, com os selos de raridade; se não couber até a altura do relógio, aperta as letras
function coluna(ctx, w, h, o, p, tw, color) {
  const sel = selos(o), nome = o.n ? o.n[0].toUpperCase() + o.n.slice(1) : o.s, fam = 'px system-ui, sans-serif';
  let ops = [];
  for (const [k, sub] of [[1, true], [1, false], [0.93, false], [0.86, false], [0.8, false], [0.74, false]]) {
    ops = []; let y = h * 0.155;
    const txt = (s, px, peso, c, a, lh) => {                        // uma linha, diminuindo a letra se passar da largura
      let f = Math.max(9, h * px * k); ctx.font = `${peso}${f}${fam}`; const lw = ctx.measureText(s).width; if (lw > tw) f *= tw / lw;
      ops.push({ s, y, f: `${peso}${f}${fam}`, c, a }); y += f * lh;
    };
    if (sub) { ops.push({ s: `${fmtN(BX.total)} registros num raio de 50 km`, y, f: `${Math.max(9, h * 0.036)}px monospace`, c: HUD, a: 0.5 }); y += h * 0.085; }
    else y += h * 0.03;
    txt((GRUPO[o.g] || 'ser vivo').toUpperCase(), 0.042, '600 ', color, 0.95, 1.5);
    const N = caber(ctx, nome, tw, h * 0.085 * k, h * 0.05 * k, 2, '600 ');
    for (const s of N.L) { ops.push({ s, y, f: `600 ${N.f}${fam}`, c: '#ffffff', a: 1 }); y += N.f * 1.12; }
    if (o.n) { y += h * 0.008; txt(o.s, 0.048, 'italic ', HUD, 0.7, 1.35); }
    y += h * 0.018 * k;
    for (const [tt, ex, cor] of sel) {
      let f1 = h * 0.038 * k, f2 = h * 0.031 * k, w1, w2;
      for (let n = 0; n < 8; n++, f1 *= 0.93, f2 *= 0.93) {
        ctx.font = `700 ${f1}${fam}`; w1 = ctx.measureText(tt).width; ctx.font = `${f2}${fam}`; w2 = ctx.measureText(` · ${ex}`).width;
        if (w1 + w2 + f1 * 1.6 * 0.32 * 2.6 <= tw) break;
      }
      const rh = f1 * 1.6; ops.push({ selo: true, tt, ex, cor, y, f1, f2, w1, w2, rh }); y += rh + h * 0.014;
    }
    if (sel.length) y += h * 0.006;
    txt(quando(o.d), 0.045, '', HUD, 0.85, 1.38);
    txt(onde(p, o), 0.045, '', HUD, 0.85, 1.38);
    y += h * 0.01;
    txt(`foto: ${o.q || 'iNaturalist'} (${o.l}) · iNaturalist`, 0.032, '', HUD, 0.45, 1.3);
    if (y <= h * 0.7) break;                                        // daqui para baixo, do lado direito, fica o relógio
  }
  return ops;
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
    keep('historia', { day, list: items, hol: datas });
  } catch {}
  WK.loading = false;
}
let HS = null;
const anoTxt = y => y < 0 ? `${-y} a.C.` : String(y);
export function historia(ctx, w, h, t, color) {
  const now = new Date(), day = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  if (WK.day !== day) { const c = load('historia', null); if (c?.day === day && c.list?.length) Object.assign(WK, { day, list: c.list, hol: c.hol || [], i: 0 }); }
  if (WK.day !== day && !WK.loading && online() && Date.now() - WK.tried > 120000) loadHist(day);
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b0906'); g.addColorStop(1, '#050403');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const L = WK.day === day ? WK.list : null;
  if (!L?.length) {
    if ((!WK.loading && t > 1) || t > 12) return true;
    hudText(ctx, h, ['HOJE NA HISTÓRIA · procurando…'], w / 2, h * 0.45, 'center'); return;
  }
  if (!HS || t < HS.last) HS = { cur: null, from: null, t0: 0 };
  HS.last = t;
  const D = 7.5, Y = now.getFullYear();
  if (!HS.cur || t - HS.t0 > D) {                                   // o próximo fato (espera a foto chegar, se tiver)
    const o = L[WK.i % L.length], ok = !o.img || foto(o.img) || falhou(o.img) || t - HS.t0 > D + 3;
    if (ok || !HS.cur) { HS.from = HS.cur ? HS.cur.o.y : Y; HS.cur = { o, lay: null }; HS.t0 = t; WK.i = (WK.i + 1) % L.length; }
  }
  if (L.length > 1) { const nx = L[WK.i % L.length]; if (nx.img) foto(nx.img); }
  const { o } = HS.cur, k = t - HS.t0, roll = ease(k / 1.3), fade = ease((k - 1.1) / 0.8), out = 1 - ease((k - D + 0.4) / 0.4);
  // cabeçalho, com as datas comemorativas de hoje
  ctx.font = `${Math.max(10, h * 0.055)}px monospace`;
  const cabe = s => ctx.measureText(s).width <= w * 0.45;
  let tit = `HOJE NA HISTÓRIA · ${now.getDate()} de ${MESES[now.getMonth()]}`; if (!cabe(tit)) tit = `HOJE NA HISTÓRIA · ${day.split('/').reverse().join('/')}`;
  let dia = ''; for (const s of WK.hol) { const tr = dia ? `${dia} · ${s}` : `hoje: ${s}`; if (cabe(tr)) dia = tr; }
  const hud = [tit, dia || null].filter(Boolean);
  hudText(ctx, h, hud, w * 0.14, h * 0.08);
  ctx.font = `${Math.max(9, h * 0.034)}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = HUD; ctx.globalAlpha = 0.35;
  ctx.fillText('fonte: Wikipédia', w * 0.14, h * 0.08 + hud.length * Math.max(10, h * 0.055) * 1.3 + 2); ctx.globalAlpha = 1;
  // linha do tempo com todos os fatos do dia; os mais antigos ficam apertados à esquerda
  const lx0 = w * 0.14, lx1 = w * 0.54, ly = h * 0.33, y0 = Math.min(1500, ...L.map(q => q.y)) - 10;
  const X = y => lx0 + (lx1 - lx0) * (1 - Math.sqrt(clamp((Y - y) / (Y - y0))));
  ctx.strokeStyle = HUD; ctx.globalAlpha = 0.25; ctx.lineWidth = Math.max(1, h * 0.003); ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.lineTo(lx1, ly); ctx.stroke();
  ctx.font = `${Math.max(8, h * 0.028)}px monospace`; ctx.textAlign = 'center'; ctx.fillStyle = HUD;
  for (const ty of [1500, 1800, 1900, 1950, 2000]) if (ty > y0 + 40) { const x = X(ty); ctx.globalAlpha = 0.3; ctx.fillRect(x - 0.5, ly - h * 0.012, 1, h * 0.024); ctx.globalAlpha = 0.35; ctx.fillText(String(ty), x, ly + h * 0.02); }
  ctx.fillStyle = HUD; ctx.globalAlpha = 0.35;
  for (const q of L) { ctx.beginPath(); ctx.arc(X(q.y), ly, Math.max(1.5, h * 0.004), 0, TAU); ctx.fill(); }
  const yr = Math.round(HS.from + (o.y - HS.from) * roll), mx = X(HS.from + (o.y - HS.from) * roll);
  ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx, ly, Math.max(3, h * 0.013), 0, TAU); ctx.fill();
  // o ano rodando até o do fato, e quantos anos faz
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = out;
  ctx.font = `700 ${h * 0.15}px monospace`; ctx.fillStyle = color; ctx.fillText(anoTxt(yr), lx0, h * 0.54);
  const n = Y - o.y;
  ctx.font = `${Math.max(10, h * 0.048)}px system-ui, sans-serif`; ctx.fillStyle = HUD; ctx.globalAlpha = out * fade * 0.8;
  ctx.fillText(n <= 0 ? 'este ano' : n === 1 ? 'há 1 ano' : `há ${fmtN(n)} anos`, lx0, h * 0.62);
  // o fato, com a letra do maior tamanho que couber no espaço
  if (!HS.cur.lay || HS.cur.lay.w !== w) HS.cur.lay = { w, T: caber(ctx, o.txt, w * 0.41, h * 0.05, h * 0.034, 99, '', h * 0.27) };
  const { T } = HS.cur.lay;
  ctx.font = `${T.f}px system-ui, sans-serif`; ctx.fillStyle = '#f4efe6'; ctx.textBaseline = 'top';
  T.L.forEach((s, i) => { ctx.globalAlpha = out * ease((k - 1.2 - i * 0.12) / 0.6); ctx.fillText(s, lx0, h * 0.67 + i * T.f * 1.28); });
  // a foto do artigo, do lado direito (sem descer até o relógio)
  const im = o.img ? foto(o.img) : null;
  if (im) {
    const bx = w * 0.62, by = h * 0.1, bw = w * 0.3, bh = h * 0.58, s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
    const iw = im.naturalWidth * s, ih = im.naturalHeight * s, ix = bx + (bw - iw) / 2, iy = by + (bh - ih) / 2, z = 1 + 0.04 * clamp(k / D);
    ctx.globalAlpha = out * ease((k - 0.6) / 0.8);
    ctx.save(); caixa(ctx, ix, iy, iw, ih, h * 0.02); ctx.clip(); ctx.drawImage(im, ix - iw * (z - 1) / 2, iy - ih * (z - 1) / 2, iw * z, ih * z); ctx.restore();
    caixa(ctx, ix, iy, iw, ih, h * 0.02); ctx.strokeStyle = color; ctx.globalAlpha *= 0.35; ctx.lineWidth = Math.max(1, h * 0.003); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
