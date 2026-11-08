// Navegação: mapa em canvas que gira com o carro, busca de endereço e rota com voz.
// Mapa do OpenStreetMap (escurecido aqui), busca no Nominatim e rotas OSRM.
// Tudo gratuito e sem chave; precisa de internet para buscar e calcular a rota.
// (O mapa escuro da CARTO passou a exigir chave em 2026.)

const R = 6378137;
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
// cores invertidas mantendo o tom: ruas claras sobre fundo escuro
const DARK = 'invert(1) hue-rotate(180deg) brightness(.9) contrast(.85) saturate(.6)';
const ROUTERS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  'https://router.project-osrm.org/route/v1/driving/',
];
const isNum = v => typeof v === 'number' && !Number.isNaN(v);

// ---------------------------------------------------------------------------
// Geometria
function mercator(lat, lon) {
  return [lon * Math.PI / 180 * R, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R];
}

// metros num plano local; bom para distâncias de algumas dezenas de km
function localXY(lat0, lon0) {
  const kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110574;
  return (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
}

export function distM(a, b) {
  const [x, y] = localXY(a.lat, a.lon)(b.lat, b.lon);
  return Math.hypot(x, y);
}

// ponto mais próximo do trajeto entre os segmentos from..to
function nearest(rt, p, from, to) {
  let best = { d: Infinity, i: 0, s: 0 };
  from = Math.max(0, from); to = Math.min(rt.xy.length - 2, to);
  for (let i = from; i <= to; i++) {
    const [ax, ay] = rt.xy[i], [bx, by] = rt.xy[i + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
    const d = Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy);
    if (d < best.d) best = { d, i, s: rt.cum[i] + t * Math.sqrt(l2) };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Textos
const fmt1 = v => v.toFixed(1).replace('.', ',');
const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function fmtDist(m) {
  if (m >= 1000) return `${fmt1(m / 1000)} km`;
  const step = m > 200 ? 50 : 10;
  return `${Math.max(step, Math.round(m / step) * step)} m`;
}

function spokenDist(m) {
  if (m >= 1000) {
    const km = Math.round(m / 100) / 10;
    return km === 1 ? '1 quilômetro' : `${String(km).replace('.', ',')} quilômetros`;
  }
  return `${Math.max(50, Math.round(m / 50) * 50)} metros`;
}

const ANGLE = {
  straight: 0, 'slight right': 45, right: 90, 'sharp right': 135, 'slight left': -45, left: -90, 'sharp left': -135,
};
const PASSING = new Set(['new name', 'continue', 'notification', 'exit roundabout', 'exit rotary']);
const isRound = s => /roundabout|rotary/.test(s.type) && s.type !== 'roundabout turn';

// manobras que não pedem ação do motorista (a rua só muda de nome, segue reto)
function isTrivial(s) {
  return s.type === 'depart' ||
    (PASSING.has(s.type) && (!s.modifier || s.modifier === 'straight' || s.modifier.startsWith('slight')));
}

export function maneuverText(s) {
  const m = s.modifier || 'straight';
  const side = m.includes('left') ? 'à esquerda' : m.includes('right') ? 'à direita' : '';
  switch (s.type) {
    case 'arrive': return 'Chegada ao destino';
    case 'fork': return `Mantenha-se ${side || 'em frente'}`;
    case 'merge': return side ? `Entre ${side}` : 'Siga em frente';
    case 'on ramp': return `Pegue o acesso ${side}`.trim();
    case 'off ramp': return `Pegue a saída ${side}`.trim();
  }
  if (isRound(s)) return s.exit ? `Na rotatória, pegue a ${s.exit}ª saída` : 'Entre na rotatória';
  if (m === 'uturn') return 'Faça o retorno';
  if (m === 'straight') return 'Siga em frente';
  if (m.startsWith('slight')) return `Mantenha-se ${side}`;
  if (m.startsWith('sharp')) return `Vire acentuadamente ${side}`;
  return `Vire ${side}`;
}

// seta da manobra para um <path> com viewBox -12 -12 24 24 (traço, sem preenchimento)
export function arrowPath(s) {
  if (!s) return '';
  if (s.type === 'arrive') return 'M-3 10 V-9 L7 -5.5 L-3 -2';
  if (s.modifier === 'uturn') return 'M4 10 V-2 A4.5 4.5 0 0 0 -5 -2 V6 M-8.5 2.5 L-5 6 L-1.5 2.5';
  const a = (ANGLE[s.modifier] ?? 0) * Math.PI / 180;
  const pt = r => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
  const round = isRound(s);
  const tip = round ? 10 : 8;
  const tx = tip * Math.sin(a), ty = -tip * Math.cos(a);
  const wing = d => {
    const b = a + Math.PI + d;
    return ` M${pt(tip)} L${(tx + 4.5 * Math.sin(b)).toFixed(2)} ${(ty - 4.5 * Math.cos(b)).toFixed(2)}`;
  };
  const body = round
    ? `M0 10 V4 M4 0 A4 4 0 1 0 -4 0 A4 4 0 1 0 4 0 M${pt(4)} L${pt(tip)}`
    : `M0 10 V0 L${pt(tip)}`;
  return body + wing(0.6) + wing(-0.6);
}

// seta em texto, para a faixa de aviso nas outras páginas
export function arrowChar(s) {
  if (!s) return '';
  if (s.type === 'arrive') return '⚑';
  if (s.modifier === 'uturn') return '↶';
  return ['↙', '←', '↖', '↑', '↗', '→', '↘'][Math.round((ANGLE[s.modifier] ?? 0) / 45) + 3] || '↑';
}

// ---------------------------------------------------------------------------
// Busca de endereço e cálculo de rota
// Link do Google Maps (o "Compartilhar" do app manda https://maps.app.goo.gl/…). O link curto só diz para onde vai
// pedindo ao Google, que não deixa site ler (CORS): quem abre é o Worker do painel no Cloudflare (/link).
// O link longo traz as coordenadas (!3d…!4d…, @lat,lon ou q=lat,lon) ou o nome e endereço do lugar (/place/…).
const WORKER = 'https://tr4-avioes.perdeuplayboy.workers.dev';
const MAPS_LINK = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\S*/i;
export const isMapsLink = t => MAPS_LINK.test(t || '');

async function openMapsLink(link) {
  let url = link;
  if (/goo\.gl/i.test(new URL(link).hostname)) {
    const j = await (await fetch(`${WORKER}/link?u=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(12000) })).json();
    if (!j.url) throw new Error('não consegui abrir o link curto do Google Maps');
    url = j.url;
  }
  const u = new URL(url);
  if (/consent\./.test(u.hostname) && u.searchParams.get('continue')) return openMapsLink(u.searchParams.get('continue'));
  const path = decodeURIComponent(u.pathname.replace(/\+/g, ' '));
  const place = path.match(/\/place\/([^/]+)/)?.[1]?.trim() || '';
  const n = s => s && s.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  const c = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || n(u.searchParams.get('q')) || n(u.searchParams.get('query')) ||
    n(u.searchParams.get('destination')) || n(u.searchParams.get('daddr')) || n(u.searchParams.get('ll')) || (!place && url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/));
  const text = place || u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('destination') || u.searchParams.get('daddr') || '';
  return { lat: c ? +c[1] : NaN, lon: c ? +c[2] : NaN, text: n(text) ? '' : text };
}

// do mais completo ao mais simples: o OpenStreetMap nem sempre entende o endereço do Google
export function addressTries(t) {
  const parts = t.split(',').map(s => s.trim()).filter(Boolean);
  const noCep = parts.map(s => s.replace(/\b\d{5}-?\d{3}\b/, '').trim()).filter(Boolean);
  const city = noCep.find(s => / - [A-Z]{2}$/.test(s));
  return [...new Set([t, noCep.join(', '), city && [noCep[0], city].join(', '), noCep.slice(1).join(', '), noCep[0]].filter(Boolean))];
}

export async function geocode(q, near) {
  const link = q.match(MAPS_LINK)?.[0];
  if (link) {
    const L = await openMapsLink(link);
    const name = L.text.split(',')[0] || 'Local do link';
    if (isNum(L.lat)) return [{ name, label: L.text.split(',').slice(1, 3).join(',').trim() || `${L.lat.toFixed(5)}, ${L.lon.toFixed(5)}`, lat: L.lat, lon: L.lon }];
    for (const t of L.text ? addressTries(L.text) : []) {
      const list = await geocode(t, near);
      if (list.length) return list;
    }
    return [];
  }
  const c = q.match(/(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/);
  if (c) return [{ name: 'Coordenadas', label: `${c[1]}, ${c[2]}`, lat: +c[1], lon: +c[2] }];
  const p = new URLSearchParams({ q, format: 'jsonv2', limit: '6', countrycodes: 'br', 'accept-language': 'pt-BR' });
  if (near) p.set('viewbox', [near.lon - 0.7, near.lat + 0.7, near.lon + 0.7, near.lat - 0.7].map(v => v.toFixed(3)).join(','));
  const res = await fetch('https://nominatim.openstreetmap.org/search?' + p, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`busca falhou (${res.status})`);
  return (await res.json()).map(x => {
    const parts = x.display_name.split(', ');
    return { name: x.name || parts[0], label: parts.slice(1, 4).join(', '), lat: +x.lat, lon: +x.lon };
  });
}

// a rota e até 3 alternativas (rt.alts), que ficam guardadas para trocar na hora, sem internet, se o carro entrar numa delas
async function fetchRoute(from, to, heading) {
  const q = `${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}` +
    '?overview=full&geometries=geojson&steps=true&alternatives=3';
  // com o rumo do carro a rota sai para a frente (não manda dar meia-volta); se não achar assim, tenta sem
  const tries = isNum(heading) ? [q + `&bearings=${Math.round(heading) % 360},70;`, q] : [q];
  let err;
  for (const qq of tries) for (const base of ROUTERS) {
    try {
      const j = await (await fetch(base + qq, { signal: AbortSignal.timeout(15000) })).json();
      if (j.code !== 'Ok') throw new Error(j.message || j.code);
      const [rt, ...alts] = j.routes.map(buildRoute);
      return { ...rt, alts };
    } catch (e) { err = e; }
  }
  throw err;
}

// trajeto a partir dos pontos: plano local, distância acumulada e projeção do mapa
function geometry(pts) {
  const toXY = localXY(pts[0].lat, pts[0].lon);
  const xy = pts.map(p => toXY(p.lat, p.lon));
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  return { pts, xy, cum, total: cum[cum.length - 1], toXY, merc: pts.map(p => mercator(p.lat, p.lon)) };
}

function buildRoute(r) {
  const g = geometry(r.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })));
  const k = r.distance > 0 ? g.total / r.distance : 1;               // acerta a escala do OSRM com a nossa
  let at = 0;
  const steps = r.legs.flatMap(l => l.steps).map(s => {
    const st = { type: s.maneuver.type, modifier: s.maneuver.modifier, exit: s.maneuver.exit, name: s.name || s.ref || '', at };
    at += s.distance * k;
    return st;
  });
  return { ...g, duration: r.duration, steps };
}

// rota guardada no aparelho (para retomar sem internet): só os pontos e as manobras; o resto é refeito
export function packRoute(rt, alts = true) {
  const o = { p: rt.pts.flatMap(q => [+q.lat.toFixed(6), +q.lon.toFixed(6)]), duration: rt.duration, steps: rt.steps };
  if (alts && rt.alts?.length) o.alts = rt.alts.map(a => packRoute(a, false));
  return o;
}
export function unpackRoute(o) {
  const pts = [];
  for (let i = 0; i + 1 < o.p.length; i += 2) pts.push({ lat: o.p[i], lon: o.p[i + 1] });
  if (pts.length < 2) return null;
  return { ...geometry(pts), duration: o.duration, steps: o.steps, alts: (o.alts || []).map(unpackRoute).filter(Boolean) };
}

const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const segDir = (rt, i) => { const [ax, ay] = rt.xy[i], [bx, by] = rt.xy[i + 1] || rt.xy[i]; return bx === ax && by === ay ? NaN : (Math.atan2(bx - ax, by - ay) * 180 / Math.PI + 360) % 360; };

// ---------------------------------------------------------------------------
// Acompanhamento da rota: posição no trajeto, próxima manobra, avisos e recálculo
// onRoute(dest, rt) a cada rota calculada (para guardar); saved(dest) devolve a rota guardada
// para esse destino, usada quando não dá para calcular (sem internet); onArrive ao chegar
export class Navigator {
  constructor({ speak = () => {}, log = () => {}, onRoute = () => {}, saved = () => null, onArrive = () => {} } = {}) {
    Object.assign(this, { speak, log, onRoute, saved, onArrive, route: null, dest: null, pending: null, busy: false, msg: '', gen: 0 });
  }

  // volta a uma rota já calculada, sem precisar de internet
  resume(dest, rt) {
    this.gen++;
    Object.assign(this, { dest, route: rt, pending: null, busy: false, seg: 0, along: 0, offSince: null, ann: {}, msg: '', altsAt: Date.now() - 120000 });
    this.speak(`Retomando a rota para ${dest.name}`);
  }

  get active() { return !!(this.route || this.pending || this.busy); }

  stop() {
    Object.assign(this, { route: null, dest: null, pending: null, busy: false, msg: '' });
    this.gen++;
  }

  async go(dest, pos, reroute = false) {
    this.dest = dest;
    if (!pos) { this.pending = dest; this.msg = 'aguardando GPS…'; return; }
    this.pending = null; this.busy = true;
    this.msg = reroute ? 'recalculando…' : 'calculando rota…';
    const gen = ++this.gen;
    try {
      // rumo: o do GPS andando, ou o último rumo andando (até 3 min) se parou para pedir a rota
      const hd = pos.speed > 6 && isNum(pos.heading) ? pos.heading : pos.dir;
      const rt = await fetchRoute(pos, dest, hd);
      if (gen !== this.gen) return;
      Object.assign(this, { route: rt, seg: 0, along: 0, offSince: null, backSince: null, altSince: null, ann: {}, msg: '', altsAt: Date.now() });
      this.onRoute(dest, rt);
      if (!reroute) this.speak(`Rota para ${dest.name}. ${spokenDist(rt.total)}, chegada às ${hhmm(Date.now() + rt.duration * 1000)}`);
    } catch (e) {
      if (gen !== this.gen) return;
      this.log('rota: ' + e.message);
      const old = !reroute && this.saved(dest);                     // sem internet: usa a rota guardada para esse destino
      if (old) { this.resume(dest, old); return; }
      this.msg = 'sem rota: ' + (e.name === 'TimeoutError' ? 'sem internet?' : e.message);
    } finally {
      if (gen === this.gen) this.busy = false;
    }
  }

  // o carro entrou numa das alternativas já baixadas? (perto dela e no sentido dela)
  altHere(pos) {
    const hd = pos.speed > 6 && isNum(pos.heading) ? pos.heading : NaN;
    let pick = null;
    for (const a of this.route.alts || []) {
      const b = nearest(a, a.toXY(pos.lat, pos.lon), 0, a.xy.length);
      if (b.d > 20 || (isNum(hd) && angDiff(hd, segDir(a, b.i)) > 60)) continue;
      if (!pick || b.d < pick.b.d) pick = { a, b };
    }
    return pick;
  }

  // desvio já baixado para quando passar direto: para as próximas 2 manobras (até 2 km), pede a rota que sai
  // de 60 m depois do cruzamento seguindo reto. Se o carro não virar, troca para ela na hora.
  async prefetchMiss() {
    const rt = this.route;
    rt.missed ||= {};
    const ahead = rt.steps.map((s, i) => [s, i]).filter(([s]) => s.at > this.along + 40 && s.at < this.along + 2000 && !isTrivial(s) && s.type !== 'arrive').slice(0, 2);
    const todo = ahead.find(([, i]) => !rt.missed[i]);
    if (!todo) return;
    const [s, i] = todo;
    rt.missed[i] = true;
    const k = Math.max(1, rt.cum.findIndex(c => c >= s.at)), d = segDir(rt, k - 1);   // trecho que chega ao cruzamento
    if (!isNum(d)) return;
    const [x0, y0] = rt.xy[k], a = d * Math.PI / 180, x = x0 + 60 * Math.sin(a), y = y0 + 60 * Math.cos(a);
    const o = rt.pts[0], from = { lat: o.lat + y / 110574, lon: o.lon + x / (Math.cos(o.lat * Math.PI / 180) * 111320) };
    this.altBusy = true;
    try {
      const n = await fetchRoute(from, this.dest, d);
      if (this.route !== rt) return;
      const m = { ...n, alts: undefined }; rt.missed[i] = m;
      rt.alts = [...(rt.alts || []), m, ...n.alts.map(z => ({ ...z, alts: undefined }))].slice(-6);
      this.onRoute(this.dest, rt);
    } catch (e) { rt.missed[i] = false; this.log('desvio: ' + e.message); } finally { this.altBusy = false; }
  }

  update(pos) {
    if (this.pending && pos) this.go(this.pending, pos);
    let rt = this.route;
    if (!rt) return null;
    const now = Date.now();

    if (pos) {
      const p = rt.toXY(pos.lat, pos.lon);
      let best = nearest(rt, p, this.seg - 3, this.seg + 150);
      if (best.d > 40) {
        const all = nearest(rt, p, 0, rt.xy.length);
        if (all.d < best.d - 10) best = all;
      }
      const moving = pos.speed > 4, canRe = !this.busy && now - (this.lastReroute || 0) > 12000;
      const reroute = () => { this.lastReroute = now; this.offSince = this.backSince = null; this.speak('Recalculando'); this.go(this.dest, pos, true); };
      // saiu da rota para uma alternativa que já estava baixada: troca na hora, sem esperar a internet
      const alt = best.d > 30 && moving && this.altHere(pos);
      if (alt) {
        this.altSince ??= now;
        if (now - this.altSince > 1500) {
          const { a, b } = alt;
          a.alts = [{ ...rt, alts: undefined }, ...rt.alts.filter(x => x !== a)];   // a de antes vira alternativa
          Object.assign(this, { route: a, seg: b.i, along: b.s, offSince: null, backSince: null, altSince: null, ann: {}, msg: '' });
          rt = a; best = b;
          this.speak('Seguindo pela rota alternativa');
          this.onRoute(this.dest, a);
        }
      } else this.altSince = null;
      if (best.d > 40) {
        this.offSince ??= now; this.backSince = null;
        // parado ou manobrando (estacionamento) não recalcula; andando fora da rota por 5 s, recalcula
        if (!alt && (moving || best.d > 120) && now - this.offSince > 5000 && canRe) reroute();
      } else {
        this.offSince = null; this.seg = best.i; this.along = best.s;
        // em cima da rota mas andando no sentido contrário (não fez o retorno): recalcula para a frente
        const sd = segDir(rt, best.i);
        const back = moving && pos.speed > 6 && isNum(pos.heading) && isNum(sd) && angDiff(pos.heading, sd) > 135;
        if (!back) this.backSince = null;
        else if (now - (this.backSince ??= now) > 8000 && canRe) reroute();
        if (!back && !this.busy && !this.altBusy && now - (this.altsAt ?? 0) > 3000 && navigator.onLine !== false) { this.altsAt = now; this.prefetchMiss(); }
      }
    }

    const remain = Math.max(0, rt.total - this.along);
    if (remain < 30 && this.along > 0) {
      this.speak('Você chegou ao destino');
      this.onArrive(this.dest);
      this.stop();
      this.msg = 'chegou ao destino ✓';
      setTimeout(() => { if (!this.active) this.msg = ''; }, 20000);
      return null;
    }

    let idx = rt.steps.findIndex(s => s.at > this.along + 3 && !isTrivial(s));
    if (idx < 0) idx = rt.steps.length - 1;
    const step = rt.steps[idx];
    const dist = Math.max(0, step.at - this.along);
    const text = maneuverText(step);

    if (pos && !this.offSince) {
      const v = Math.max(pos.speed || 0, 30);
      const far = v > 80 ? 1000 : v > 50 ? 500 : 250;
      const near = v > 80 ? 200 : v > 50 ? 100 : 50;
      const said = this.ann[idx] ||= {};
      const full = text + (step.name && step.type !== 'arrive' ? `, ${step.name}` : '');
      if (dist <= near && !said.near && step.type !== 'arrive') {
        said.near = said.far = true;
        this.speak(full);
      } else if (dist <= far && dist > near * 1.8 && !said.far) {
        said.far = true;
        this.speak(`Em ${spokenDist(dist)}, ${full[0].toLowerCase()}${full.slice(1)}`);
      }
    }

    const frac = rt.total > 0 ? remain / rt.total : 0;
    return { step, dist, text, remain, remainS: rt.duration * frac, eta: now + rt.duration * 1000 * frac, off: !!this.offSince };
  }
}

// ---------------------------------------------------------------------------
// Mapa: tiles desenhados num canvas, girando para o rumo do carro (frente para cima)
export class MapView {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.tiles = new Map(); this.rot = 0; this.zoom = 16;
    this.mag = 1.15;                                                 // aproxima 15% além do nível do mapa
    this.tilt = false;                                               // mapa inclinado: o canvas é maior e deitado pelo CSS
  }

  tile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let t = this.tiles.get(key);
    if (t) { this.tiles.delete(key); this.tiles.set(key, t); return t; }   // mais recente no fim
    const img = new Image();
    img.crossOrigin = 'anonymous';
    t = { img, ok: false };
    img.onload = () => {                                                // escurece uma vez só
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const g = cv.getContext('2d');
      g.filter = DARK;
      g.drawImage(img, 0, 0);
      t.img = cv; t.ok = true;
    };
    img.onerror = () => setTimeout(() => this.tiles.delete(key), 15000);     // tenta de novo depois
    img.src = TILE_URL(z, x, y);
    this.tiles.set(key, t);
    if (this.tiles.size > 300) this.tiles.delete(this.tiles.keys().next().value);
    return t;
  }

  // pos {lat, lon}; heading em graus (NaN mantém o último); rt = rota; fromSeg = trecho já percorrido
  draw(pos, heading, rt, fromSeg = 0, anchorX = 0.5) {
    const c = this.c, ctx = this.ctx, dpr = Math.min(devicePixelRatio || 1, this.tilt ? 2 : 4);   // inclinado o canvas é bem maior
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0e1013';
    ctx.fillRect(0, 0, w, h);
    if (!pos) return;

    if (isNum(heading)) {
      const d = ((heading - this.rot + 540) % 360) - 180;
      this.rot = (this.rot + d * 0.25 + 360) % 360;
    }
    const z = this.zoom, n = 2 ** z, world = 2 * Math.PI * R, tileM = world / n;
    const scale = 256 * this.mag / tileM, ts = 256 * this.mag + 0.5;   // px por metro; tamanho do ladrilho na tela
    const [cx, cy] = mercator(pos.lat, pos.lon);
    // inclinado: o canvas vai de -35% a 135% na largura e o carro fica no quarto de baixo da janela
    const ox = w * (this.tilt ? (0.35 + anchorX) / 1.7 : anchorX), oy = h * (this.tilt ? 0.84 : 0.7);
    const reach = Math.hypot(Math.max(ox, w - ox), oy) * 1.05 / scale;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(-this.rot * Math.PI / 180);
    const tx0 = Math.floor((cx - reach + world / 2) / tileM), tx1 = Math.floor((cx + reach + world / 2) / tileM);
    const ty0 = Math.floor((world / 2 - cy - reach) / tileM), ty1 = Math.floor((world / 2 - cy + reach) / tileM);
    for (let ty = Math.max(0, ty0); ty <= Math.min(n - 1, ty1); ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const x = (tx * tileM - world / 2 - cx) * scale, y = (cy - (world / 2 - ty * tileM)) * scale;
        const t = this.tile(z, ((tx % n) + n) % n, ty);
        if (t.ok) { ctx.drawImage(t.img, x, y, ts, ts); continue; }
        const up = this.tiles.get(`${z - 1}/${(((tx % n) + n) % n) >> 1}/${ty >> 1}`);   // nível anterior ampliado
        if (up?.ok) {
          const s = up.img.width / 2;
          ctx.drawImage(up.img, (tx & 1) * s, (ty & 1) * s, s, s, x, y, ts, ts);
        }
      }
    }

    if (rt) {
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 176, 32, .9)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = fromSeg + 1; i < rt.merc.length; i++) {
        const [mx, my] = rt.merc[i];
        ctx.lineTo((mx - cx) * scale, (cy - my) * scale);
      }
      ctx.stroke();
      const [dx, dy] = rt.merc[rt.merc.length - 1];
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc((dx - cx) * scale, (cy - dy) * scale, 7, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();

    // carro: seta sempre para cima (o mapa é que gira)
    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4.5); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, .45)';
    ctx.fillText('© OpenStreetMap', w - 6, h - 5);
  }
}
