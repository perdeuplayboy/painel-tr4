import {
  State, FUELS, emptyTrip, tripAvgKmL, tripAvgSpeed, deriveAndIntegrate, MockSource, ElmBleSource,
} from './obd.js';
import { loadSettings, loadUpkeep, load, save, addVideos, folderOf, listVideos, clearVideos, removeVideo, saveJohnnyFiles, johnnyReady, saveExtras, extrasHave, extrasReady, extraURL, EXTRAS } from './store.js';
import { MapView, Navigator, geocode, distM, fmtDist, arrowPath, arrowChar, packRoute, unpackRoute } from './nav.js';
import { Spotify } from './spotify.js';
import { Player } from './player.js';
import { ANIMS, ANIM_NAMES } from './anims.js';
import { TELA } from './cenas.js';

const $ = id => document.getElementById(id);
const S = loadSettings();
const saveSettings = () => save('settings', S);
const isNum = v => typeof v === 'number' && !Number.isNaN(v);
const fmt = (v, dec = 0) => isNum(v) ? v.toFixed(dec).replace('.', ',') : '--';
const fmtSigned = (v, dec = 1) => isNum(v) ? (v >= 0 ? '+' : '') + fmt(v, dec) : '--';
const rand = (a, b) => a + Math.random() * (b - a);
const fmtInt = v => Math.round(v).toLocaleString('pt-BR');
const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DAY = 864e5;

const PAGES = ['drive', 'engine', 'trip', 'fuel', 'trail', 'diag', 'nav', 'music', 'video'];
const STANDBY_ENGINE_OFF_MS = 10000;
const TRIP_RESET_MS = 15 * 60000;       // motor desligado por mais que isso = nova viagem

// ---------------------------------------------------------------------------
// Geometria: tela do G42 deitado (2400×1080) e furo do painel da TR4, em mm.
// Contorno do furo do LEIA-ME de car-metrics/3d: base reta de 100, pontas arredondadas
// a 22 mm da base, ombros a 42 mm (97,4 entre eles), topo em arco com 45 mm no centro.
function holePath(x, y) {
  const p = (a, b) => `${(a + x).toFixed(2)} ${(b + y).toFixed(2)}`;
  return `M${p(20, 45)} L${p(120, 45)} C${p(132, 45)} ${p(140, 37)} ${p(140, 23)} ` +
    `C${p(140, 12)} ${p(132, 5)} ${p(118.7, 3)} Q${p(70, -3)} ${p(21.3, 3)} ` +
    `C${p(8, 5)} ${p(0, 12)} ${p(0, 23)} C${p(0, 37)} ${p(8, 45)} ${p(20, 45)} Z`;
}

// Janela da moldura medida na foto da tela de medição (07/11/2026), em mm da tela: a largura inteira aparece, menos os
// dois cantos de cima (o da esquerda bem arredondado, o da direita pequeno); na altura, do banco do motorista, ~54–55 mm.
const JANELA = [[-2, 24.1], [0, 24.1], [1.9, 19.5], [4.9, 15.8], [7.5, 13.4], [10.2, 11.3], [14.7, 8.3], [20.8, 5.3], [26.3, 3.6], [32.1, 2.3],
  [37, 1], [41.9, 0], [41.9, -2], [122, -2], [122, 0], [127.6, 1], [132.6, 2.3], [137.4, 3.3], [141.6, 4.5], [145.4, 6.8], [147.7, 8.3],
  [151, 8.3], [151, 54], [-2, 55.5]];   // embaixo: foto da régua tirada do banco do motorista (07/11): ~55,5 mm à esquerda, ~54 à direita
// a área usada (STAGE) é o retângulo da janela dentro da tela; relógio, cenas e configurações ficam dentro dele
const STAGE = { x: 0, y: 0, w: 140, h: 45 };
function holeNow(W, H) {
  const pts = S.holeShape?.length > 10 ? S.holeShape : JANELA.map(([x, y]) => [x + S.offX, y + S.offY]);
  return pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}
function layout() {
  const W = S.screenW, H = W * 1080 / 2400;
  const vw = innerWidth, vh = innerHeight;
  const mm = Math.min(vw / W, vh / H);
  document.documentElement.style.fontSize = mm + 'px';
  Object.assign($('screen').style, {
    width: W * mm + 'px', height: H * mm + 'px', left: (vw - W * mm) / 2 + 'px', top: (vh - H * mm) / 2 + 'px',
  });
  if (S.janelaV !== 2) { delete S.holeShape; S.offX = 0; S.offY = 0; S.janelaV = 2; saveSettings(); }   // troca a janela antiga pela medida
  const pts = holeNow(W, H), hole = shapePath(pts);
  TELA.janela = pts;                                                 // as cenas desviam o texto dos cantos da moldura
  TELA.relogioBox = () => { const el = $('sbClock'); return el && !el.hidden && el.offsetParent ? el.getBoundingClientRect() : null; };
  TELA.tela = () => { const r = $('screen').getBoundingClientRect(); return { left: r.left, top: r.top, mm: r.width / W }; };
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
  Object.assign(STAGE, { x: x0, y: y0, w: Math.min(W, Math.max(...xs)) - x0, h: Math.min(H, Math.max(...ys)) - y0 });
  Object.assign($('stage').style, { left: x0 + 'rem', top: y0 + 'rem', width: STAGE.w + 'rem', height: STAGE.h + 'rem', transform: '' });
  $('mask').setAttribute('viewBox', `0 0 ${W} ${H}`);
  $('maskPath').setAttribute('d', `M0 0 H${W} V${H} H0 Z ` + hole);
  $('outlinePath').setAttribute('d', S.outline ? hole : '');
  $('btnFitReset').hidden = !S.holeShape;
  $('screen').classList.toggle('dim', S.mask === 'dim');
  // configurações: à direita do relógio, longe do canto arredondado
  const sl = (vw - W * mm) / 2, st = (vh - H * mm) / 2;
  Object.assign($('settings').style, {
    left: sl + (x0 + 24) * mm + 'px', top: st + (y0 + 5.5) * mm + 'px',
    width: (STAGE.w - 28) * mm + 'px', height: (STAGE.h - 9) * mm + 'px',
  });
}

// ---------------------------------------------------------------------------
// Ligação de valores: elementos com data-k recebem texto pelo nome da chave.
const binds = {};
document.querySelectorAll('[data-k]').forEach(el => (binds[el.dataset.k] ??= []).push(el));
function set(k, v) {
  for (const el of binds[k] || []) if (el.textContent !== v) el.textContent = v;
}

// ---------------------------------------------------------------------------
// Páginas e gestos
let page = Math.min(Math.max(load('page', 0), 0), PAGES.length - 1);

function showPage(i) {
  page = (i + PAGES.length) % PAGES.length;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('on', el.dataset.page === PAGES[page]));
  save('page', page);
}

let swipe = null;
$('stage').addEventListener('pointerdown', e => {
  swipe = { x: e.clientX, y: e.clientY };
});
$('stage').addEventListener('pointercancel', () => { swipe = null; });
$('stage').addEventListener('pointerup', e => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  const min = parseFloat(document.documentElement.style.fontSize) * 6;      // 6 mm
  if (Math.abs(dx) > min && Math.abs(dx) > Math.abs(dy)) showPage(page + (dx < 0 ? 1 : -1));
  else if (Math.hypot(dx, dy) < min && PAGES[page] === 'video' && $('videoPage').contains(e.target)) pgPlayer.next();
});

// segurar o relógio abre as configurações
let pressTimer = 0;
$('wing-left').addEventListener('pointerdown', () => { pressTimer = setTimeout(openSettings, 700); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
  $('wing-left').addEventListener(ev, () => clearTimeout(pressTimer)));

addEventListener('keydown', e => {
  if (!$('settings').hidden) { if (e.key === 'Escape') closeSettings(); return; }
  if (e.key === 'ArrowRight') showPage(page + 1);
  else if (e.key === 'ArrowLeft') showPage(page - 1);
  else if (e.key === 's' || e.key === 'Escape') openSettings();
});

// ---------------------------------------------------------------------------
// Fonte de dados
let src = null;
const logLines = [];
function log(msg) {
  logLines.push(`${new Date().toLocaleTimeString('pt-BR')} ${msg}`);
  if (logLines.length > 120) logLines.shift();
  if (!$('settings').hidden) { $('log').textContent = logLines.join('\n'); $('log').scrollTop = 1e9; }
}

function startSource() {
  src?.stop();
  src = S.source === 'sim' ? new MockSource() : new ElmBleSource(log);
  log(`fonte: ${src.name}`);
  if (S.source === 'obd') autoConnect(src);
}

// Reconecta ao adaptador já autorizado. Sem suporte do Chrome, espera um toque.
async function autoConnect(s) {
  if (s !== src) return;
  if (!ElmBleSource.available()) { s.state = State.ERROR; s.err = 'Bluetooth indisponível neste navegador'; return; }
  if (!S.deviceId) { s.err = 'adaptador não configurado'; return; }
  try {
    const dev = await ElmBleSource.remembered(S.deviceId);
    if (!dev) { s.err = 'toque para conectar'; return; }
    await s.connect(dev);
  } catch (e) {
    log('reconexão automática: ' + e.message);
    setTimeout(() => autoConnect(s), 10000);
  }
}

// Precisa vir de um toque (exigência do Chrome para escolher o adaptador)
async function pickAdapter() {
  if (S.source !== 'obd') { S.source = 'obd'; saveSettings(); $('sSource').value = 'obd'; startSource(); }
  if (!ElmBleSource.available()) { log('Web Bluetooth indisponível: use o Chrome no Android'); return; }
  const s = src;
  try {
    const dev = await s.pick();
    S.deviceId = dev.id; saveSettings();
    await s.connect(dev);
  } catch (e) { log('conexão: ' + e.message); }
}

$('status').addEventListener('pointerdown', e => {
  if ($('status').classList.contains('nav')) { e.stopPropagation(); showPage(PAGES.indexOf('nav')); return; }
  if (S.source === 'obd' && src.state !== State.CONNECTED && !src.device?.gatt.connected) {
    e.stopPropagation();
    pickAdapter();
  }
});

// ---------------------------------------------------------------------------
// Estado da viagem, consumo por combustível e saúde da bateria (persistidos)
let trip = load('trip', null) || emptyTrip();
if (!(trip.maxSpeed < 250)) trip = emptyTrip();      // descarta viagem corrompida pela simulação antiga
const fuelStats = load('fuelStats', { gasolina: { km: 0, l: 0 }, etanol: { km: 0, l: 0 } });
let lastRunningAt = load('lastRunningAt', 0);
let batt = load('batt', { restV: NaN, crankV: NaN, at: 0 });
let chargeV = NaN;

let odo = load('odo', null);               // hodômetro do carro; o app soma o que o OBD mede
const upkeep = loadUpkeep();
let trips = load('trips', []);

function persist() {
  save('trip', trip); save('fuelStats', fuelStats); save('lastRunningAt', lastRunningAt); save('batt', batt);
  save('odo', odo);
}
setInterval(persist, 5000);
addEventListener('pagehide', persist);

function battVerdict() {
  const { restV, crankV } = batt;
  if (!isNum(restV) && !isNum(crankV)) return ['aguardando partida', ''];
  if (crankV < 9.6 || restV < 12.2) return ['FRACA', 'bad'];
  if (crankV < 10.0 || restV < 12.4) return ['ATENÇÃO', 'warn'];
  return ['BOA', 'ok'];
}

// Manutenção: vence pelo que chegar primeiro, km ou meses desde a última vez
function upkeepStatus(it) {
  const kmLeft = it.everyKm && isNum(odo) && isNum(it.lastKm) ? it.lastKm + it.everyKm - odo : NaN;
  const daysLeft = it.everyMonths && it.lastAt ? (it.lastAt + it.everyMonths * 30.44 * DAY - Date.now()) / DAY : NaN;
  const due = kmLeft <= 0 || daysLeft <= 0;
  const soon = !due && (kmLeft <= Math.max(500, it.everyKm * 0.1) || daysLeft <= 15);
  return { kmLeft, daysLeft, due, soon, known: isNum(kmLeft) || isNum(daysLeft) };
}

function saveUpkeep() {
  save('upkeep', upkeep.map(({ id, everyKm, everyMonths, lastKm, lastAt }) => ({ id, everyKm, everyMonths, lastKm, lastAt })));
}

// Viagem encerrada vai para o histórico (as da simulação ficam marcadas)
function archiveTrip() {
  if (trip.distanceKm >= 0.3) {
    trips.unshift({
      start: trip.startAt, end: lastRunningAt || Date.now(), km: trip.distanceKm, l: trip.fuelL, max: trip.maxSpeed,
      movingMs: trip.movingMs, fuel: S.fuel, price: S.fuel === 'etanol' ? S.priceE : S.priceG, sim: S.source === 'sim',
    });
    trips.length = Math.min(trips.length, 200);
    save('trips', trips);
  }
  trip = emptyTrip();
}

// ---------------------------------------------------------------------------
// Sensores do celular: GPS (clima, altitude, rumo) e acelerômetro (inclinômetro)
const gps = { lat: NaN, lon: NaN, alt: NaN, heading: NaN, speed: NaN, at: 0, dir: NaN, dirAt: 0 };
let lastPos = load('lastPos', null);       // última posição conhecida (tema e busca sem GPS)
const DEMO = new URLSearchParams(location.search).has('demo');   // GPS falso para testar no PC
// alguns celulares (o G42 inclusive) às vezes não mandam velocidade nem rumo: calcula pelo caminho andado
let gpsRef = null;
navigator.geolocation?.watchPosition(p => {
  if (DEMO) return;
  const c = p.coords, now = Date.now();
  let speed = c.speed == null || Number.isNaN(c.speed) ? NaN : c.speed * 3.6, heading = c.heading == null || Number.isNaN(c.heading) ? NaN : c.heading;
  if (!gpsRef) gpsRef = { lat: c.latitude, lon: c.longitude, at: now };
  const d = distM(gpsRef, { lat: c.latitude, lon: c.longitude }), dt = (now - gpsRef.at) / 1000;
  if (d > Math.max(15, c.accuracy || 0) && dt > 0) {
    if (!isNum(speed)) speed = d / dt * 3.6;
    if (!isNum(heading) || !(speed > 3)) {
      const y = c.latitude - gpsRef.lat, x = (c.longitude - gpsRef.lon) * Math.cos(c.latitude * Math.PI / 180);
      heading = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
    }
    gpsRef = { lat: c.latitude, lon: c.longitude, at: now };
  } else if (dt > 12) { if (!isNum(speed)) speed = d / dt * 3.6; gpsRef = { lat: c.latitude, lon: c.longitude, at: now }; }
  else if (!isNum(speed)) speed = gps.speed;
  Object.assign(gps, { lat: c.latitude, lon: c.longitude, alt: c.altitude ?? NaN, heading, speed, at: now });
  if (speed > 6 && isNum(heading)) Object.assign(gps, { dir: heading, dirAt: now });   // último rumo andando (para a rota não mandar voltar)
  if (!lastPos || Date.now() - lastPos.at > 10 * 60000) {
    lastPos = { lat: c.latitude, lon: c.longitude, at: Date.now() };
    save('lastPos', lastPos);
    applyTheme();
  }
  maybeFetchWeather();
}, err => log('GPS: ' + err.message), { enableHighAccuracy: true, maximumAge: 5000 });

let weather = load('weather', null);
let weatherFetchAt = 0;
const WEATHER = [[0, 'céu limpo'], [3, 'nublado'], [48, 'neblina'], [67, 'chuva'], [77, 'neve'], [82, 'pancadas'], [99, 'tempestade']];
async function maybeFetchWeather() {
  if (Date.now() - weatherFetchAt < 15 * 60000 || !isNum(gps.lat)) return;
  weatherFetchAt = Date.now();
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${gps.lat.toFixed(3)}&longitude=${gps.lon.toFixed(3)}` +
      '&current=temperature_2m,weather_code&timezone=auto';
    const j = await (await fetch(url)).json();
    weather = { temp: j.current.temperature_2m, code: j.current.weather_code, at: Date.now() };
    save('weather', weather);
  } catch { weatherFetchAt = Date.now() - 13 * 60000; }   // tenta de novo em 2 min
}

const grav = { x: 0, y: 9.8, z: 0, ok: false };
addEventListener('devicemotion', e => {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x == null) return;
  const k = 0.08;                                            // filtro passa-baixa
  if (!grav.ok) Object.assign(grav, { x: g.x, y: g.y, z: g.z, ok: true });
  grav.x += (g.x - grav.x) * k; grav.y += (g.y - grav.y) * k; grav.z += (g.z - grav.z) * k;
});

// Ângulos brutos com o celular em pé no painel, tela virada para o motorista.
function rawTilt() {
  if (!grav.ok) return null;
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  let sx, sy;                                                // eixos da tela: direita e para cima
  if (angle === 90) { sx = -grav.y; sy = grav.x; }
  else if (angle === 270 || angle === -90) { sx = grav.y; sy = -grav.x; }
  else { sx = grav.x; sy = grav.y; }
  const deg = 180 / Math.PI;
  return { roll: Math.atan2(sx, sy) * deg, pitch: Math.atan2(-grav.z, sy) * deg };
}
// inclinômetro com a TR4 das Aventuras do Joni (de lado e de trás), em js/carro-tr4.js
import('./carro-tr4.js').then(m => { joniCar = m.carroIncl; }).catch(e => log('inclinômetro: ' + e.message));
let joniCar = null;
function joniIncl(id, graus, tras) {
  if (!joniCar) return;
  const box = $(id), svg = box.querySelector('svg');
  let cv = box.querySelector('canvas');
  if (!cv) { cv = document.createElement('canvas'); cv.className = 'car'; svg.before(cv); svg.style.display = 'none'; }
  const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1, W = Math.round(r.width * d), H = Math.round(r.height * d);
  if (!W || !H) return;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const lv = box.classList.contains('bad') ? '--bad' : box.classList.contains('warn') ? '--warn' : '--txt';
  joniCar(cv.getContext('2d'), W, H, graus, getComputedStyle(document.documentElement).getPropertyValue(lv).trim() || '#ddd', tras);
}
function tilt() {
  const r = rawTilt();
  if (!r) return { roll: NaN, pitch: NaN };
  const z = S.level || { roll: 0, pitch: 0 };
  return { roll: (r.roll - z.roll) * (S.invRoll ? -1 : 1), pitch: (r.pitch - z.pitch) * (S.invPitch ? -1 : 1) };
}

// ---------------------------------------------------------------------------
// Alertas em tela cheia
const ALERT_MS = 5000;
const alertState = { until: 0, last: {} };
function raise(key, level, title, sub, repeatMs = 60000) {
  const now = Date.now();
  if (alertState.last[key] && now - alertState.last[key] < repeatMs) return;
  alertState.last[key] = now;
  alertState.until = now + ALERT_MS;
  $('alert').className = level === 'warn' ? 'warn' : '';
  $('alertTitle').textContent = title;
  $('alertSub').textContent = sub;
  $('alert').hidden = false;
  exitStandby();
  speak(spoken(`${title}. ${sub}`));
}
$('alert').addEventListener('pointerdown', e => { e.stopPropagation(); alertState.until = 0; $('alert').hidden = true; });

// ---------------------------------------------------------------------------
// Voz. O Chrome só libera a fala depois do primeiro toque na tela.
function speak(text, kind = 'alert') {
  if (!('speechSynthesis' in window) || S.voice === 'off' || (kind === 'nav' && S.voice !== 'all')) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  u.voice = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-') === 'pt-BR') || null;
  if (kind === 'alert') speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
// texto da tela para fala: sem caixa alta (algumas vozes soletram) e com unidades por extenso
const spoken = s => s.toLowerCase().replace(/·/g, ',').replace(/\s*°c?/g, ' graus').replace(/(\d) v\b/g, '$1 volts');

// ---------------------------------------------------------------------------
// Tema noite: escurece a tela depois do pôr do sol (posição do GPS, ou a última conhecida)
function sunElevation(lat, lon, t = Date.now()) {
  const rad = Math.PI / 180;
  const d = t / DAY - 10957.5;                               // dias desde 01/01/2000 12h UTC
  const g = (357.529 + 0.98560028 * d) * rad;
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ha = ((18.697374558 + 24.06570982441908 * d) % 24) * 15 * rad + lon * rad - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
}

function isNight() {
  if (S.theme !== 'auto') return S.theme === 'night';
  const p = isNum(gps.lat) ? gps : lastPos;
  if (p) return sunElevation(p.lat, p.lon) < -3;
  const h = new Date().getHours();
  return h < 6 || h >= 18;
}
function applyTheme() { $('night').style.opacity = isNight() ? S.nightDim / 100 : 0; }
setInterval(applyTheme, 60000);

// ---------------------------------------------------------------------------
// Navegação: mapa, rota e destinos (falados, buscados ou enviados do celular)
const mapView = new MapView($('map'));
// a última rota calculada fica guardada 30 dias: "Retomar rota" e destino repetido sem internet
const ROUTE_KEEP = 30 * 86400000;
const storedRoute = () => { const o = load('navRoute', null); return o?.rt && Date.now() - o.at < ROUTE_KEEP ? o : null; };
const storedRouteFor = dest => { const o = storedRoute(); return o && distM(o.dest, dest) < 50 ? unpackRoute(o.rt) : null; };
const nav = new Navigator({
  speak: t => speak(t, 'nav'), log, saved: storedRouteFor,
  onRoute: (dest, rt) => save('navRoute', { dest, rt: packRoute(rt), at: Date.now() }),
  onArrive: () => { const o = storedRoute(); if (o) save('navRoute', { ...o, done: true }); },   // chegou: não oferece retomar
});
let navRecent = load('navRecent', []);
let navInfo = null;

const gpsFix = () => Date.now() - gps.at < 5000 && isNum(gps.lat)
  ? { lat: gps.lat, lon: gps.lon, heading: gps.heading, speed: gps.speed, dir: Date.now() - gps.dirAt < 180000 ? gps.dir : NaN } : null;

// posição para o mapa: anda entre as leituras do GPS (1 por segundo) para não dar trancos
function mapPos() {
  if (Date.now() - gps.at > 15000 || !isNum(gps.lat)) return null;
  let { lat, lon } = gps;
  if (gps.speed > 5 && isNum(gps.heading)) {
    const m = gps.speed / 3.6 * Math.min((Date.now() - gps.at) / 1000, 1.5), a = gps.heading * Math.PI / 180;
    lat += m * Math.cos(a) / 110574;
    lon += m * Math.sin(a) / (111320 * Math.cos(lat * Math.PI / 180));
  }
  return { lat, lon };
}

function goTo(dest) {
  navRecent = [dest, ...navRecent.filter(r => distM(r, dest) > 30)].slice(0, 8);
  save('navRecent', navRecent);
  $('navPick').hidden = true;
  save('navDest', { ...dest, at: Date.now() });
  nav.go(dest, gpsFix());
  showPage(PAGES.indexOf('nav'));
}

function stopNav() { nav.stop(); navInfo = null; save('navDest', null); }

// rota em andamento continua se o Chrome for fechado e reaberto (até 6 h), pela rota guardada: não precisa de internet
const savedDest = load('navDest', null);
if (savedDest && Date.now() - savedDest.at < 6 * 3600000) {
  const rt = storedRouteFor(savedDest);
  if (rt) nav.resume(savedDest, rt); else nav.go(savedDest, null);
}

// depois de encerrar (sem querer ou não), a última rota pode ser retomada do mesmo jeito
function resumeRoute() {
  const o = storedRoute(), rt = o && unpackRoute(o.rt);
  if (!rt) return;
  $('navPick').hidden = true;
  save('navDest', { ...o.dest, at: Date.now() });
  nav.resume(o.dest, rt);
  showPage(PAGES.indexOf('nav'));
}

// ?demo: parado na Av. Paulista; com rota, anda por ela na velocidade da simulação
if (DEMO) {
  let demoRoute = null, demoS = 0;
  Object.assign(gps, { lat: -23.5614, lon: -46.6559, alt: 820, heading: 0, speed: 0 });
  setInterval(() => {
    const rt = nav.route;
    const v = Date.now() - src.d.updatedAt < 5000 && isNum(src.d.speedKmh) ? src.d.speedKmh : 0;
    if (rt !== demoRoute) { demoRoute = rt; demoS = nav.along || 0; }
    if (rt) {
      demoS = Math.min(demoS + Math.max(v, 30) / 3.6, rt.total);
      let i = rt.cum.findIndex(c => c > demoS);
      if (i < 1) i = rt.cum.length - 1;
      const a = rt.pts[i - 1], b = rt.pts[i], t = (demoS - rt.cum[i - 1]) / ((rt.cum[i] - rt.cum[i - 1]) || 1);
      const [dx, dy] = [(b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat];
      Object.assign(gps, {
        lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t,
        heading: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, speed: Math.max(v, 30),
      });
    } else gps.speed = 0;
    gps.at = Date.now();
  }, 1000);
}

function destButton(it) {
  const b = document.createElement('button');
  b.className = 'dest';
  const here = gpsFix() || lastPos;
  const name = document.createElement('b'), sub = document.createElement('small');
  name.textContent = it.name;
  sub.textContent = [here ? fmtDist(distM(here, it)) : '', it.label].filter(Boolean).join(' · ');
  b.append(name, sub);
  b.addEventListener('click', () => goTo(it));
  return b;
}

function resumeButton(o) {
  const b = document.createElement('button');
  b.className = 'dest resume';
  const name = document.createElement('b'), sub = document.createElement('small');
  name.textContent = '↩ Retomar rota';
  sub.textContent = o.dest.name;
  b.append(name, sub);
  b.addEventListener('click', resumeRoute);
  return b;
}

// back = rota guardada que pode ser retomada (aparece primeiro)
function showPick(title, items, back = null) {
  set('navPickTitle', title);
  const list = items.slice(0, back ? 3 : 4).map(destButton);
  if (back) list.unshift(resumeButton(back));
  $('navPickList').replaceChildren(...list);
  $('navPick').hidden = false;
}

async function searchDest(q, show) {
  try {
    const list = await geocode(q, gpsFix() || lastPos);
    show(list.length ? `"${q}"` : `nada encontrado para "${q}"`, list);
  } catch (e) { show(e.name === 'TimeoutError' ? 'sem internet?' : e.message, []); }
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
function listenDest() {
  if (!Recognition) { set('navPickTitle', 'reconhecimento de voz indisponível'); return; }
  const r = new Recognition();
  r.lang = 'pt-BR';
  r.onresult = e => {
    const q = e.results[0][0].transcript;
    set('navPickTitle', `buscando "${q}"…`);
    searchDest(q, showPick);
  };
  r.onerror = e => set('navPickTitle', e.error === 'no-speech' ? 'não ouvi nada' : `voz: ${e.error}`);
  set('navPickTitle', 'fale o destino…');
  try { r.start(); } catch (e) { set('navPickTitle', e.message); }
}

$('btnNavDest').addEventListener('click', () => {
  const o = storedRoute();
  showPick(navRecent.length ? 'Para onde? (recentes)' : 'Para onde?', navRecent, o && !o.done ? o : null);
});
$('btnNavMic').addEventListener('click', listenDest);
$('btnNavPickClose').addEventListener('click', () => { $('navPick').hidden = true; });
armed($('btnNavCancel'), stopNav);

// ---------------------------------------------------------------------------
// Spotify: a música da sua conta, tocando no seu celular ou em outro aparelho
const spot = new Spotify({ load, save });
if (DEMO && !spot.connected) {                                  // música de mentira para testar a tela
  Object.defineProperty(spot, 'connected', { value: true });
  spot.now = { title: 'Highway Star', artist: 'Deep Purple', art: 'https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228', playing: true, progress: 62000, duration: 368000, device: 'Moto G (demo)', at: Date.now() };
  spot.poll = async () => {};
  spot.control = async cmd => {
    const m = spot.now;
    if (cmd === 'play' || cmd === 'pause') { m.progress = spot.position(); m.at = Date.now(); m.playing = cmd === 'play'; } else { m.progress = 0; m.at = Date.now(); }
  };
}
spot.finishLogin()
  .then(ok => { if (ok) { log('Spotify conectado'); showPage(PAGES.indexOf('music')); } })
  .catch(e => { spot.err = e.message; log('Spotify: ' + e.message); })
  .finally(() => spot.poll());
// mais frequente quando a música está na tela
let spotLast = 0;
setInterval(() => {
  const visible = document.visibilityState === 'visible' && (PAGES[page] === 'music' || sb.on);
  if (Date.now() - spotLast >= (visible ? 3000 : 15000)) { spotLast = Date.now(); spot.poll(); }
}, 1000);

const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// Cor mais marcante da capa: agrupa os pixels por tom, pesando os vivos e de brilho médio,
// e devolve o tom vencedor clareado para ler bem sobre o fundo escuro ('' = capa sem cor).
function coverColor(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve('');
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 24;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 24, 24);
      const px = g.getImageData(0, 0, 24, 24).data;
      const bins = Array.from({ length: 12 }, () => ({ w: 0, x: 0, y: 0, s: 0 }));
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
        const max = Math.max(r, gg, b), min = Math.min(r, gg, b), l = (max + min) / 2, d = max - min;
        if (d < 0.08) continue;                                  // cinzas não contam
        const s = d / (1 - Math.abs(2 * l - 1));
        const h = (max === r ? ((gg - b) / d + 6) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4) * 60;
        const w = s * (1 - Math.abs(l - 0.5) * 1.6);
        const bin = bins[Math.floor(h / 30) % 12];
        bin.w += w; bin.s += s * w;
        bin.x += Math.cos(h * Math.PI / 180) * w; bin.y += Math.sin(h * Math.PI / 180) * w;
      }
      const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
      if (best.w < 8) { resolve(''); return; }
      const hue = (Math.atan2(best.y, best.x) * 180 / Math.PI + 360) % 360;
      resolve(`hsl(${Math.round(hue)} ${Math.round(Math.min(Math.max(best.s / best.w, 0.45), 0.85) * 100)}% 62%)`);
    };
    img.src = url;
  });
}

function showCover(art) {
  $('mArt').dataset.src = art;
  $('mArt').src = art;
  $('mBg').style.backgroundImage = art ? `url("${art}")` : '';
  $('mBg').classList.toggle('on', !!art);
  const st = $('musicPage').style;
  if (!art) { st.removeProperty('--m-accent'); return; }
  coverColor(art).then(c => {
    if ($('mArt').dataset.src !== art) return;                   // a música já mudou
    if (c) st.setProperty('--m-accent', c); else st.removeProperty('--m-accent');
  });
}
$('mPrev').addEventListener('click', () => spot.control('prev'));
$('mNext').addEventListener('click', () => spot.control('next'));
$('mPlay').addEventListener('click', () => spot.control(spot.now?.playing ? 'pause' : 'play'));

// ---------------------------------------------------------------------------
// Destino enviado pelo seu celular (página "Enviar ao carro"), pelo ntfy.sh.
// O canal é um código aleatório gerado aqui; só quem sabe o código publica nele.
if (!S.channel) { S.channel = 'tr4-' + crypto.randomUUID().replace(/-/g, '').slice(0, 20); saveSettings(); }
let lastMsgId = load('lastMsgId', '');
function listenPhone() {
  const es = new EventSource(`https://ntfy.sh/${S.channel}/sse?since=${lastMsgId || '10m'}`);
  es.onmessage = e => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.event !== 'message' || m.id === lastMsgId) return;
    lastMsgId = m.id; save('lastMsgId', lastMsgId);
    let msg;
    try { msg = JSON.parse(m.message); } catch { return; }
    log(`do celular: ${msg.cmd || msg.name}`);
    if (msg.cmd === 'stop') stopNav();
    else if (isNum(msg.lat) && isNum(msg.lon)) goTo({ name: msg.name || 'Destino', label: msg.label || '', lat: msg.lat, lon: msg.lon });
  };
  es.onerror = () => {};                                  // o EventSource reconecta sozinho
}

// ---------------------------------------------------------------------------
// Standby: vídeos com o carro parado ou desligado
let videos = [];
let videoUrls = [];
async function reloadVideos() {
  videoUrls.forEach(u => URL.revokeObjectURL(u));
  videos = await listVideos();
  videoUrls = videos.map(v => URL.createObjectURL(v.blob));
  const gifs = videos.filter(v => v.blob.type.startsWith('image/')).length;
  $('videoInfo').textContent = videos.length ? `${videos.length - gifs} vídeo(s) e ${gifs} GIF(s) salvos` : 'nenhum vídeo ou GIF';
  renderMedia();
}

// lista para tocar: seus vídeos e GIFs, mais as animações retrô (se ligadas)
const mediaItems = () => [
  ...videos.map((v, i) => ({ kind: v.blob.type.startsWith('image/') ? 'image' : 'video', url: videoUrls[i], id: v.id }))
    .filter((it, i) => !S.folderOff.includes(folderOf(videos[i]))),
  ...(S.anims ? Object.keys(ANIMS).filter(a => !S.animOff.includes(a) && (a !== 'johnny' || johnnyReady()) && extrasReady(a)).map(anim => ({ kind: 'anim', anim, weight: anim === 'johnny' ? 0.25 : 1 })) : []),   // Johnny tem muitas cenas: aparece bem menos
];
const playerOpts = {
  sound: () => S.videoSound,
  volume: () => S.videoVolume,
  clipMs: () => Math.max(5, S.clipSec) * 1000,
  color: () => $('musicPage').style.getPropertyValue('--m-accent') || '#ffb020',
};

let asleep = false;                                                   // tela apagada (ver sleepScreen)
const sb = { on: false, forced: false, engineOffSince: null, stoppedSince: null, suppressUntil: 0, moveTimer: 0 };
const sbPlayer = new Player($('standby'), mediaItems, { ...playerOpts, relogio: () => S.cenaRelogio });

function moveStandbyClock() {
  const c = $('sbClock');
  if (!sbPlayer.empty) { c.style.left = c.style.top = ''; return; }
  c.style.left = rand(28, 75) + 'rem';                       // relógio passeando: evita marcar a tela
  c.style.top = rand(8, 20) + 'rem';
}

function enterStandby(forced = false, first = null) {
  if (sb.on || asleep) return;                                       // tela apagada: nada toca por baixo
  sb.on = true; sb.forced = forced;
  $('standby').hidden = false;
  $('standby').classList.toggle('novideo', sbPlayer.empty && !first);
  moveStandbyClock();
  sb.moveTimer = setInterval(moveStandbyClock, 20000);
  if (first) sbPlayer.show(first); else sbPlayer.start();
}

function exitStandby() {
  if (!sb.on) return;
  sb.on = false; sb.forced = false;
  clearInterval(sb.moveTimer);
  sbPlayer.stop();
  $('standby').hidden = true;
}

// No standby: toque no meio passa para o próximo vídeo/GIF/animação;
// toque nas laterais (fora da área central), no relógio ou arrastar sai
let sbTouch = null;
function inSbCenter(e) {
  const r = $('stage').getBoundingClientRect(), mm = r.width / STAGE.w;
  return e.clientX > r.left + 24 * mm && e.clientX < r.right - 24 * mm;
}
$('standby').addEventListener('pointerdown', e => { e.stopPropagation(); sbTouch = { x: e.clientX, y: e.clientY }; });
$('standby').addEventListener('pointerup', e => {
  e.stopPropagation();
  if (!sbTouch) return;
  const moved = Math.hypot(e.clientX - sbTouch.x, e.clientY - sbTouch.y) > parseFloat(document.documentElement.style.fontSize) * 6;
  sbTouch = null;
  if (moved || !inSbCenter(e) || $('sbClock').contains(e.target) || sbPlayer.empty) {
    const engineOff = sb.engineOffSince != null;
    sb.suppressUntil = performance.now() + (engineOff ? 60000 : S.standbyMin * 60000);
    exitStandby();
  } else sbPlayer.next();
});
$('standby').addEventListener('pointercancel', () => { sbTouch = null; });

// botão de som no standby e na página Vídeos: liga e desliga o som dos vídeos (vale para os dois)
// tocar no ícone abre a barra de volume (some sozinha em 4 s); tocar de novo no ícone com a barra aberta liga/desliga o som
let volTimer = 0;
function showSoundBtn() {
  $('sbSoundBox').hidden = !(sb.on && sbPlayer.cur?.kind === 'video');
  $('pgSoundBox').hidden = !(!sb.on && PAGES[page] === 'video' && pgPlayer.cur?.kind === 'video');
  for (const id of ['sbSound', 'pgSound']) { $(id).hidden = false; $(id).classList.toggle('on', !!S.videoSound); }
}
function applySound() {
  saveSettings();
  for (const p of [sbPlayer, pgPlayer]) { p.video.muted = !S.videoSound; p.video.volume = S.videoVolume; if (S.videoSound && p.on) p.video.play().catch(() => {}); }
  showSoundBtn();
}
function volBar(box, show) {
  const bar = box.querySelector('.vol');
  bar.hidden = !show; bar.value = S.videoSound ? Math.round(S.videoVolume * 100) : 0;
  clearTimeout(volTimer); if (show) volTimer = setTimeout(() => { bar.hidden = true; }, 4000);
}
for (const id of ['sbSound', 'pgSound']) {
  const box = $(id + 'Box'), bar = box.querySelector('.vol');
  box.addEventListener('pointerdown', e => e.stopPropagation());     // não troca de vídeo nem sai do standby
  box.addEventListener('pointerup', e => e.stopPropagation());
  $(id).addEventListener('pointerup', () => {
    if (bar.hidden) { if (!S.videoSound) { S.videoSound = true; applySound(); } volBar(box, true); }
    else { S.videoSound = !S.videoSound; applySound(); volBar(box, true); }
  });
  bar.addEventListener('input', () => {
    const v = bar.value / 100;
    S.videoSound = v > 0; if (v > 0) S.videoVolume = v;
    applySound(); volBar(box, true);
  });
}
setInterval(showSoundBtn, 500);

// Página Vídeos: a mesma lista do standby, no centro, com o carro andando
const pgPlayer = new Player($('videoPage'), mediaItems, playerOpts);
function pageVideo() {
  $('pgVideoEmpty').hidden = !pgPlayer.empty;
  $('screen').classList.toggle('semrelogio', !S.cenaRelogio && PAGES[page] === 'video');   // a cena ocupa o lugar do relógio
  $('sbClock').hidden = !S.cenaRelogio;
  if (PAGES[page] === 'video' && !sb.on && !asleep && $('settings').hidden) pgPlayer.start(); else pgPlayer.stop();
  if (pgPlayer.on && !pgPlayer.cur && !pgPlayer.empty) pgPlayer.next();     // lista era vazia e ganhou itens
}

// ---------------------------------------------------------------------------
// Laço principal: integra dados, avalia alertas e standby, atualiza a tela
let lastTick = performance.now();
let wasRunning = false;
let lowBattSince = null, tiltSince = null, milWasOn = false;
const volts = [];                       // [tempo, tensão] dos últimos 10 s com motor parado
let restV = NaN;

function tick() {
  const now = performance.now();
  const dt = Math.min(now - lastTick, 2000);
  lastTick = now;
  const d = src.d;
  const fresh = Date.now() - d.updatedAt < 5000;
  const fuel = FUELS[S.fuel] || FUELS.gasolina;

  // integração da viagem e do consumo por combustível
  if (fresh) {
    const { dKm, dL } = deriveAndIntegrate(d, trip, dt, fuel, S.displacement, S.ve);
    const fs = fuelStats[S.fuel] ||= { km: 0, l: 0 };
    fs.km += dKm; fs.l += dL;
    if (S.source === 'obd' && isNum(odo)) odo += dKm;
  }

  let speed = fresh ? d.speedKmh : NaN;
  if (!isNum(speed) && Date.now() - gps.at < 5000 && isNum(gps.speed)) speed = gps.speed;
  const running = fresh && d.rpm > 500;

  // bateria: tensão em repouso (motor parado) e mínima durante a partida
  if (fresh && isNum(d.batteryV) && !running) {
    volts.push([now, d.batteryV]);
    if (!(d.rpm > 50)) restV = d.batteryV;
  }
  while (volts.length && now - volts[0][0] > 10000) volts.shift();
  if (running && !wasRunning) {
    if (Date.now() - lastRunningAt > TRIP_RESET_MS) { archiveTrip(); log('nova viagem'); }
    const due = upkeep.filter(it => upkeepStatus(it).due);
    if (due.length) raise('upkeep', 'warn', 'MANUTENÇÃO VENCIDA', due.map(it => it.short).join(', '), 6 * 3600000);
    if (volts.length && isNum(restV)) {
      batt = { restV, crankV: Math.min(...volts.map(v => v[1])), at: Date.now() };
      log(`partida: repouso ${batt.restV.toFixed(2)} V, mínima ${batt.crankV.toFixed(2)} V`);
      if (batt.crankV < 9.6) raise('crank', 'warn', 'BATERIA FRACA', `caiu para ${fmt(batt.crankV, 1)} V na partida`, 0);
    }
    volts.length = 0;
    chargeV = NaN;
  }
  if (running) {
    lastRunningAt = Date.now();
    if (isNum(d.batteryV)) chargeV = isNum(chargeV) ? chargeV + (d.batteryV - chargeV) * 0.05 : d.batteryV;
  }
  wasRunning = running;
  if (!running && trip.distanceKm > 0 && Date.now() - lastRunningAt > TRIP_RESET_MS) archiveTrip();

  // navegação e mapa
  const hadRoute = nav.active;
  navInfo = nav.update(gpsFix());
  if (hadRoute && !nav.active) save('navDest', null);           // chegou
  const onMap = PAGES[page] === 'nav' && $('settings').hidden && !sb.on;
  if (onMap) {
    const v = isNum(gps.speed) ? gps.speed : 0;
    mapView.zoom = navInfo?.dist < 250 || v < 25 ? 17 : v < 70 ? 16 : 15;
    mapView.tilt = !!S.mapTilt; $('map').classList.toggle('tilt', mapView.tilt);
    mapView.draw(mapPos(), gps.speed > 5 ? gps.heading : NaN, nav.route, nav.seg || 0, navInfo ? 0.66 : 0.5);
  }

  // alertas
  if (fresh && d.coolantC >= S.coolLimit) raise('cool', 'bad', 'MOTOR SUPERAQUECENDO', `${fmt(d.coolantC)} °C · pare em local seguro`);
  if (running && d.batteryV < S.battLimit) {
    lowBattSince ??= now;
    if (now - lowBattSince > 10000) raise('batt', 'warn', 'BATERIA BAIXA', `${fmt(d.batteryV, 1)} V com motor ligado · alternador?`);
  } else lowBattSince = null;
  if (d.milOn && !milWasOn) raise('mil', 'warn', 'LUZ DE INJEÇÃO ACESA', `${d.dtcCount} falha(s) · veja Diagnóstico`, 0);
  milWasOn = d.milOn;
  const t = tilt();
  // só alerta depois de zerado com o celular montado; antes disso a posição é desconhecida
  if (S.level && (Math.abs(t.roll) > S.rollLimit || Math.abs(t.pitch) > S.pitchLimit)) {
    tiltSince ??= now;
    if (now - tiltSince > 1000) raise('tilt', 'bad', 'INCLINAÇÃO PERIGOSA', `lateral ${fmt(Math.abs(t.roll))}° · frontal ${fmt(Math.abs(t.pitch))}°`, 15000);
  } else tiltSince = null;
  if (!$('alert').hidden && Date.now() > alertState.until) $('alert').hidden = true;

  // standby
  const engineOff = !running;
  const moving = speed > 3;
  if (engineOff) sb.engineOffSince ??= now; else sb.engineOffSince = null;
  if (!moving) sb.stoppedSince ??= now; else sb.stoppedSince = null;
  if (moving && sb.on && !sb.forced) exitStandby();
  if (moving) sb.suppressUntil = 0;
  const wantStandby = $('alert').hidden && $('settings').hidden && now >= sb.suppressUntil &&
    !(nav.active && running) && (
    (sb.engineOffSince != null && now - sb.engineOffSince > STANDBY_ENGINE_OFF_MS) ||
    (sb.stoppedSince != null && now - sb.stoppedSince > S.standbyMin * 60000));
  if (wantStandby) enterStandby();

  pageVideo();
  render(d, fresh, speed, running, t);
}

function render(d, fresh, speed, running, t) {
  const v = fresh ? d : {};
  const date = new Date();
  set('time', date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  set('date', date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').replace(' de ', ' '));
  set('weekday', date.toLocaleDateString('pt-BR', { weekday: 'long' }).split('-')[0]);

  // temperaturas nas laterais
  const wOk = weather && Date.now() - weather.at < 3 * 3600000;
  set('outTemp', wOk ? `${fmt(weather.temp)}°` : '--°');
  set('outLabel', wOk ? (WEATHER.find(([c]) => weather.code <= c)?.[1] || 'fora') : 'fora');
  set('coolant', `${fmt(v.coolantC)}°`);
  $('engTemp').classList.toggle('cold', v.coolantC < 60);
  $('engTemp').classList.toggle('hot', v.coolantC >= S.coolLimit - 5);
  const song = spot.now;
  set('sbLine', song?.playing ? `♪ ${song.title} · ${song.artist}` :
    `${date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}` +
    (wOk ? ` · ${fmt(weather.temp)}°` : '') + (isNum(v.coolantC) ? ` · motor ${fmt(v.coolantC)}°` : ''));

  set('vSong', song?.playing ? `♪ ${song.title} · ${song.artist}` : '');

  // música
  set('mTitle', !spot.connected ? 'Spotify não conectado' : song ? song.title : 'nada tocando');
  set('mArtist', !spot.connected ? 'segure o relógio → Configurações → Spotify' : song ? song.artist : 'abra o Spotify no celular');
  set('mDevice', spot.err || (song?.device ? `tocando em ${song.device}` : ''));
  const pos = spot.position();
  set('mPos', song ? mmss(pos) : '');
  set('mDur', song ? mmss(song.duration) : '');
  $('mProg').style.width = song?.duration ? `${pos / song.duration * 100}%` : '0';
  const art = song?.art || '';
  if ($('mArt').dataset.src !== art) showCover(art);
  $('mArt').hidden = !art; $('mNoArt').hidden = !!art;
  $('mBg').classList.toggle('paused', !song?.playing || PAGES[page] !== 'music');
  const icon = song?.playing ? 'M7 4h4v16H7zM14 4h4v16h-4z' : 'M7 4l13 8-13 8z';
  if ($('mPlayIcon').getAttribute('d') !== icon) $('mPlayIcon').setAttribute('d', icon);

  // direção
  set('speed', fmt(speed));
  set('rpm', isNum(v.rpm) ? String(Math.round(v.rpm / 10) * 10) : '--');
  $('rpmfill').style.width = Math.min(100, (v.rpm || 0) / 6500 * 100) + '%';
  set('kmlInst', fmt(v.kmPerL, 1));
  set('kmlTrip', fmt(tripAvgKmL(trip), 1));
  set('battV', fmt(running && isNum(chargeV) ? chargeV : v.batteryV, 1));
  $('coldNotice').hidden = !(running && v.coolantC < 60);

  // motor
  set('load', fmt(v.loadPct)); set('throttle', fmt(v.throttlePct)); set('map', fmt(v.mapKpa));
  set('iat', fmt(v.intakeC)); set('timing', fmt(v.timingDeg, 1));
  set('stft', fmtSigned(v.stftPct)); set('ltft', fmtSigned(v.ltftPct));
  set('o2', `${fmt(v.o2s1V, 2)}/${fmt(v.o2s2V, 2)}`);

  // viagem
  const price = S.fuel === 'etanol' ? S.priceE : S.priceG;
  const elapsed = (Date.now() - trip.startAt) / 60000;
  set('fuelName', (FUELS[S.fuel] || FUELS.gasolina).name);
  set('tripKm', fmt(trip.distanceKm, 1));
  set('tripTime', `${Math.floor(elapsed / 60)}h${String(Math.floor(elapsed % 60)).padStart(2, '0')}`);
  set('tripL', fmt(trip.fuelL, 2));
  set('tripAvg', fmt(tripAvgKmL(trip), 1));
  set('tripCost', fmt(trip.fuelL * price, 2));
  set('tripCostKm', trip.distanceKm > 0.5 ? fmt(trip.fuelL * price / trip.distanceKm, 2) : '--');
  set('tripMax', fmt(trip.maxSpeed));
  set('tripAvgSpd', fmt(tripAvgSpeed(trip)));

  // álcool ou gasolina
  const kml = f => fuelStats[f]?.km >= 5 && fuelStats[f].l > 0 ? fuelStats[f].km / fuelStats[f].l : NaN;
  const kE = kml('etanol'), kG = kml('gasolina');
  set('kmlE', fmt(kE, 1)); set('kmlG', fmt(kG, 1));
  set('priceE', fmt(S.priceE, 2)); set('priceG', fmt(S.priceG, 2));
  set('rkmE', fmt(S.priceE / kE, 2)); set('rkmG', fmt(S.priceG / kG, 2));
  let best, sub;
  if (isNum(kE) && isNum(kG)) {
    const cE = S.priceE / kE, cG = S.priceG / kG;
    best = cE <= cG ? 'etanol' : 'gasolina';
    sub = `${fmt((1 - Math.min(cE, cG) / Math.max(cE, cG)) * 100)}% mais barato por km · ` +
      `etanol compensa até R$ ${fmt(S.priceG * kE / kG, 2)}`;
  } else {
    const ratio = S.priceE / S.priceG;
    best = ratio <= 0.7 ? 'etanol' : 'gasolina';
    sub = `etanol a ${fmt(ratio * 100)}% da gasolina · regra dos 70% até medir o seu consumo (5 km de cada)`;
  }
  set('verdict', best === 'etanol' ? 'ETANOL' : 'GASOLINA');
  set('verdictSub', sub);
  $('fcolE').classList.toggle('best', best === 'etanol');
  $('fcolG').classList.toggle('best', best === 'gasolina');

  // trilha
  const level = (val, lim) => Math.abs(val) >= lim ? 'bad' : Math.abs(val) >= lim * 0.7 ? 'warn' : '';
  set('roll', isNum(t.roll) ? `${fmt(Math.abs(t.roll))}°` : '--');
  set('pitch', isNum(t.pitch) ? `${fmt(Math.abs(t.pitch))}°` : '--');
  $('inclRoll').className = 'incl ' + level(t.roll, S.rollLimit);
  $('inclPitch').className = 'incl ' + level(t.pitch, S.pitchLimit);
  $('carRear').style.transform = `rotate(${isNum(t.roll) ? t.roll : 0}deg)`;
  $('carSide').style.transform = `rotate(${isNum(t.pitch) ? -t.pitch : 0}deg)`;
  joniIncl('inclPitch', isNum(t.pitch) ? -t.pitch : 0, false);
  joniIncl('inclRoll', isNum(t.roll) ? t.roll : 0, true);
  const gpsOk = Date.now() - gps.at < 10000;
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  set('heading', gpsOk && gps.speed > 5 && isNum(gps.heading)
    ? `${dirs[Math.round(gps.heading / 45) % 8]} ${fmt(gps.heading)}°` : '--');
  set('alt', gpsOk ? fmt(gps.alt) : '--');
  set('levelHint', S.level ? '' : 'zere nas configurações com o carro no plano');

  // diagnóstico
  set('connState', S.source === 'sim' ? 'simulação' : src.state);
  set('mil', d.milOn ? 'ACESA' : fresh ? 'apagada' : '--');
  binds.mil[0].className = d.milOn ? 'bad' : fresh ? 'ok' : '';
  set('dtcs', d.dtcs == null ? `${d.dtcCount} (toque em Ler)` : d.dtcs.length ? d.dtcs.join(' ') : 'nenhuma');
  const [bv, bc] = battVerdict();
  set('battHealth', bv);
  binds.battHealth[0].className = bc;
  set('battDetail', isNum(batt.restV) ? `${fmt(batt.restV, 1)} V → ${fmt(batt.crankV, 1)} V` : '--');
  set('protocol', src.protocol || '--');
  set('vin', d.vin || '--');
  const uk = upkeep.map(it => [it, upkeepStatus(it)]);
  const ukDue = uk.filter(([, s]) => s.due), ukSoon = uk.filter(([, s]) => s.soon);
  const more = list => list.length > 1 ? ` +${list.length - 1}` : '';
  set('upkeepState', ukDue.length ? `vencido: ${ukDue[0][0].short}${more(ukDue)}`
    : ukSoon.length ? `em breve: ${ukSoon[0][0].short}${more(ukSoon)}`
    : uk.some(([, s]) => s.known) ? 'em dia' : 'configurar');
  binds.upkeepState[0].className = ukDue.length ? 'bad' : ukSoon.length ? 'warn' : uk.some(([, s]) => s.known) ? 'ok' : '';
  set('odo', isNum(odo) ? `${fmtInt(odo)} km` : 'ajustar');

  // navegação
  const ni = navInfo;
  $('navTurn').hidden = !ni;
  $('navFoot').hidden = !ni;
  if (ni) {
    set('navDist', fmtDist(ni.dist));
    set('navText', ni.text);
    set('navStreet', ni.step.type === 'arrive' ? nav.dest?.name || '' : ni.step.name);
    const p = arrowPath(ni.step);
    if ($('navArrow').getAttribute('d') !== p) $('navArrow').setAttribute('d', p);
    set('navRemain', `${fmtDist(ni.remain)} · ${Math.round(ni.remainS / 60)} min · chega ${hhmm(ni.eta)}`);
  }
  set('navMsg', nav.msg || (ni?.off ? 'fora da rota' : '') || (gpsFix() ? '' : 'aguardando GPS…'));
  $('btnNavCancel').hidden = !nav.active;
  $('btnNavDest').hidden = nav.active;

  // linha de status (conexão)
  const st = $('status');
  let msg = '', err = false;
  const strip = ni && PAGES[page] !== 'nav';
  if (strip) msg = `${arrowChar(ni.step)} ${fmtDist(ni.dist)} · ${ni.step.name || ni.text}`;
  else if (S.source !== 'sim' && src.state !== State.CONNECTED) {
    err = true;
    msg = src.device?.gatt.connected ? `OBD: ${src.state}` : `OBD: ${src.err || src.state} · toque aqui para conectar`;
  }
  if (st.textContent !== msg) st.textContent = msg;
  st.classList.toggle('err', err);
  st.classList.toggle('nav', !!strip);
}

// ---------------------------------------------------------------------------
// Botões das páginas
$('btnFuelSwap').addEventListener('click', () => {
  S.fuel = S.fuel === 'etanol' ? 'gasolina' : 'etanol'; saveSettings();
});
$('btnReadDtc').addEventListener('click', () => src.requestDtcs());

// botões destrutivos pedem um segundo toque em até 4 s
function armed(btn, action) {
  let t = 0;
  btn.addEventListener('click', () => {
    if (btn.classList.contains('armed')) { clearTimeout(t); btn.classList.remove('armed'); btn.textContent = btn.dataset.label; action(); return; }
    btn.dataset.label ??= btn.textContent;
    btn.classList.add('armed'); btn.textContent = 'Toque de novo';
    t = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; }, 4000);
  });
}
armed($('btnClearDtc'), () => src.clearDtcs());

// ---------------------------------------------------------------------------
// Configurações
const FIELDS = {
  sSource: 'source', sFuel: 'fuel', sPriceG: 'priceG', sPriceE: 'priceE', sVe: 've',
  sStandbyMin: 'standbyMin', sCoolLimit: 'coolLimit', sBattLimit: 'battLimit',
  sRollLimit: 'rollLimit', sPitchLimit: 'pitchLimit', sInvRoll: 'invRoll', sInvPitch: 'invPitch',
  sScreenW: 'screenW', sOffX: 'offX', sOffY: 'offY', sMask: 'mask', sOutline: 'outline',
  sVoice: 'voice', sTheme: 'theme', sNightDim: 'nightDim', sSpotifyId: 'spotifyClient',
  sAnims: 'anims', sClipSec: 'clipSec', sSleepUnplug: 'sleepUnplug', sCenaRelogio: 'cenaRelogio', sMapTilt: 'mapTilt',
};

function renderAnims() {
  $('animList').replaceChildren(...Object.entries(ANIM_NAMES).map(([id, name]) => {
    const label = document.createElement('label');
    label.className = 'check';
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !S.animOff.includes(id) });
    box.addEventListener('change', () => {
      S.animOff = box.checked ? S.animOff.filter(a => a !== id) : [...S.animOff, id];
      saveSettings(); animCount();
    });
    const see = Object.assign(document.createElement('button'), { className: 'pill', textContent: 'ver' });
    see.addEventListener('click', e => {
      e.preventDefault();
      closeSettings();
      enterStandby(true, { kind: 'anim', anim: id });
    });
    label.append(box, ` ${name}`, see);
    return label;
  }));
  animCount();
}
function animCount() {                                                    // resumo na lista fechada
  const ids = Object.keys(ANIM_NAMES), on = ids.filter(id => !S.animOff.includes(id)).length;
  $('animCount').textContent = `· ${on} de ${ids.length} ligadas`;
}

// seus vídeos e GIFs por pasta: ligar/desligar a pasta inteira e apagar a pasta
function renderMedia() {
  const groups = new Map();
  videos.forEach((v, i) => { const f = folderOf(v); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(i); });
  $('mediaList').replaceChildren(...[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([folder, idx]) => {
    const label = document.createElement('label');
    label.className = 'check';
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !S.folderOff.includes(folder) });
    box.addEventListener('change', () => {
      S.folderOff = box.checked ? S.folderOff.filter(f => f !== folder) : [...S.folderOff, folder];
      saveSettings();
    });
    const mb = idx.reduce((t, i) => t + videos[i].blob.size, 0) / 1e6;
    const name = Object.assign(document.createElement('span'), { className: 'media-name', textContent: `📁 ${folder} · ${idx.length} arquivo(s) · ${mb.toFixed(0)} MB` });
    const del = Object.assign(document.createElement('button'), { className: 'pill warn', textContent: 'apagar pasta' });
    del.addEventListener('click', e => e.preventDefault());
    armed(del, async () => {
      for (const i of idx) await removeVideo(videos[i].id);
      S.folderOff = S.folderOff.filter(f => f !== folder); saveSettings();
      await reloadVideos();
    });
    label.append(box, name, del);
    return label;
  }));
}

function renderSpotifySettings() {
  $('spotifyRedirect').textContent = spot.redirect;
  $('btnSpotify').textContent = spot.connected ? 'Desconectar Spotify' : 'Conectar Spotify';
  $('spotifyInfo').textContent = spot.connected
    ? (spot.err || (spot.now ? `tocando: ${spot.now.title}` : 'conectado')) : spot.err;
}

const phoneLink = () => new URL(`enviar.html#${S.channel}`, location.href).href;
// correção de erro baixa = menos quadradinhos, cada um maior; margem branca de 4 (o que as câmeras pedem)
const qrSvg = txt => { const q = qrcode(0, 'L'); q.addData(txt); q.make(); return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); };

// código grande, do tamanho da parte visível da tela, branco: o celular lê de longe e através do vidro
function qrGrande() {
  if (!window.qrcode) return;
  const r = $('stage').getBoundingClientRect(), s = Math.min(r.height, r.width) * 0.96;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;touch-action:none';
  box.innerHTML = qrSvg(phoneLink());
  const svg = box.firstElementChild;
  svg.style.cssText = `position:absolute;width:${s}px;height:${s}px;left:${r.left + (r.width - s) / 2}px;top:${r.top + (r.height - s) / 2}px`;
  box.addEventListener('pointerdown', e => { e.stopPropagation(); box.remove(); });   // toque fecha
  setTimeout(() => box.remove(), 90000);
  document.body.append(box);
}
$('phoneQr').addEventListener('click', qrGrande);

function renderNavSettings() {
  if ($('phoneLink').textContent !== phoneLink()) {
    $('phoneLink').textContent = phoneLink();
    if (window.qrcode) $('phoneQr').innerHTML = qrSvg(phoneLink());
  }
  $('navState').textContent = nav.route
    ? `rota para ${nav.dest?.name} · faltam ${navInfo ? fmtDist(navInfo.remain) : '--'}` : nav.msg || 'sem rota';
  $('btnNavStop').hidden = !nav.active;
}

function showSettingsResults(title, items) {
  const box = $('navResults');
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = title;
  box.replaceChildren(p, ...items.map(it => {
    const b = destButton(it);
    b.addEventListener('click', closeSettings);
    return b;
  }));
}

function renderUpkeep() {
  const box = $('upkeepList');
  box.replaceChildren();
  for (const h of ['Item', 'a cada km', 'a cada meses', 'última (km)', 'última (data)', 'situação', ''])
    box.append(Object.assign(document.createElement('span'), { className: 'h', textContent: h }));
  const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  for (const it of upkeep) {
    const name = Object.assign(document.createElement('span'), { textContent: it.name });
    const inputs = ['everyKm', 'everyMonths', 'lastKm', 'lastAt'].map(f => {
      const el = document.createElement('input');
      el.type = f === 'lastAt' ? 'date' : 'number';
      el.inputMode = 'numeric';
      el.value = f === 'lastAt' ? (it.lastAt ? ymd(it.lastAt) : '') : (it[f] ?? '') || '';
      el.addEventListener('change', () => {
        if (f === 'lastAt') {
          const [y, m, dd] = el.value.split('-').map(Number);
          it.lastAt = el.value ? new Date(y, m - 1, dd).getTime() : 0;
        } else {
          const n = parseFloat(el.value);
          it[f] = Number.isNaN(n) ? (f === 'lastKm' ? null : 0) : n;
        }
        saveUpkeep(); status();
      });
      return el;
    });
    const st = document.createElement('span');
    const status = () => {
      const s = upkeepStatus(it), parts = [];
      if (isNum(s.kmLeft)) parts.push(s.kmLeft <= 0 ? `passou ${fmtInt(-s.kmLeft)} km` : `faltam ${fmtInt(s.kmLeft)} km`);
      if (isNum(s.daysLeft)) parts.push(s.daysLeft <= 0 ? `venceu há ${Math.round(-s.daysLeft)} dias` : `${Math.round(s.daysLeft)} dias`);
      st.textContent = parts.join(' · ') || (isNum(odo) ? 'informe a última' : 'acerte o hodômetro');
      st.className = s.due ? 'bad' : s.soon ? 'warn' : s.known ? 'ok' : '';
    };
    status();
    const done = Object.assign(document.createElement('button'), { className: 'pill', textContent: 'Feito hoje' });
    armed(done, () => {
      it.lastAt = Date.now();
      if (isNum(odo)) it.lastKm = Math.round(odo);
      saveUpkeep(); renderUpkeep();
    });
    box.append(name, ...inputs, st, done);
  }
}

function renderTrips() {
  const real = trips.filter(t => !t.sim);
  const m0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const month = real.filter(t => t.start >= m0);
  const sum = f => month.reduce((s, t) => s + f(t), 0);
  const km = sum(t => t.km), l = sum(t => t.l), cost = sum(t => t.l * t.price);
  $('tripsSummary').textContent = month.length
    ? `Este mês: ${month.length} viagens · ${fmt(km)} km · ${fmt(l, 1)} L · R$ ${fmt(cost, 2)}` + (l > 0.1 ? ` · média ${fmt(km / l, 1)} km/L` : '')
    : 'Nenhuma viagem registrada neste mês.';
  if (!trips.length) { $('tripsList').replaceChildren(); return; }
  const rows = trips.slice(0, 40).map(t => {
    const d = new Date(t.start), min = Math.round((t.end - t.start) / 60000);
    const when = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ' + hhmm(t.start);
    return `<tr><td>${when}${t.sim ? ' (simulação)' : ''}</td><td>${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}</td>` +
      `<td>${fmt(t.km, 1)}</td><td>${fmt(t.l > 0.01 ? t.km / t.l : NaN, 1)}</td><td>${fmt(t.l * t.price, 2)}</td>` +
      `<td>${fmt(t.max)}</td><td>${(FUELS[t.fuel] || FUELS.gasolina).name}</td></tr>`;
  });
  $('tripsList').innerHTML = '<table><tr><th>Início</th><th>Duração</th><th>km</th><th>km/L</th><th>R$</th><th>vel. máx</th><th>Combustível</th></tr>' +
    rows.join('') + '</table>';
}

function openSettings() {
  for (const [id, key] of Object.entries(FIELDS)) {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = S[key];
  }
  $('log').textContent = logLines.join('\n');
  $('sOdo').value = isNum(odo) ? Math.round(odo) : '';
  renderNavSettings(); renderUpkeep(); renderTrips(); renderSpotifySettings(); renderAnims();
  updateSettingsInfo();
  $('settings').hidden = false;
  $('screen').classList.add('cfg');
  exitStandby();
}
function closeSettings() { $('settings').hidden = true; $('screen').classList.remove('cfg'); }

// ---------------------------------------------------------------------------
// Encaixe na moldura pelo traçado: o dedo percorre a borda de dentro da janela e esse desenho vira a janela.
// O traçado é suavizado (raio médio por ângulo em volta do centro) e guardado em mm; o conteúdo encolhe para caber.
function shapeFromTrace(pts, mm) {
  const all = pts.flat().map(([x, y]) => [x / mm, y / mm]);
  if (all.length < 40) return null;
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, ax = (x2 - x1) / 2, ay = (y2 - y1) / 2;
  if (ax < 30 || ay < 10) return null;
  const N = 180, bins = Array.from({ length: N }, () => []);
  for (const [x, y] of all) {                                         // ângulo medido com a janela "achatada" num círculo
    const u = (x - cx) / ax, v = (y - cy) / ay, k = Math.floor(((Math.atan2(v, u) / (2 * Math.PI)) + 1) % 1 * N);
    bins[k].push(Math.hypot(u, v));
  }
  const r = bins.map(b => b.length ? b.sort((p, q) => p - q)[b.length >> 1] : null);
  if (r.filter(v => v != null).length < N * 0.7) return null;          // faltou contornar um pedaço grande
  for (let i = 0; i < N; i++) if (r[i] == null) {                     // buracos: liga os vizinhos
    let a = 1, b = 1; while (r[(i - a + N) % N] == null) a++; while (r[(i + b) % N] == null) b++;
    r[i] = (r[(i - a + N) % N] * b + r[(i + b) % N] * a) / (a + b);
  }
  const sm = r.map((_, i) => { let t = 0; for (let j = -3; j <= 3; j++) t += r[(i + j + N) % N]; return t / 7; });
  return sm.map((v, i) => { const a = (i + 0.5) / N * 2 * Math.PI; return [+(cx + Math.cos(a) * v * ax).toFixed(1), +(cy + Math.sin(a) * v * ay).toFixed(1)]; });
}
const shapePath = pts => 'M' + pts.map(p => p.join(' ')).join(' L') + ' Z';

function fitByTrace() {
  closeSettings();
  const box = document.createElement('div'); box.id = 'fitter';
  const cv = document.createElement('canvas'), ui = document.createElement('div'); ui.className = 'fit-ui';
  box.append(cv, ui); document.body.append(box);
  const ctx = cv.getContext('2d'), pts = [];
  let stroke = null, shape = null;
  const scr = () => { const r = $('screen').getBoundingClientRect(); return { r, mm: r.width / S.screenW }; };
  const size = () => { const d = devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; draw(); };
  const btn = (txt, fn) => { const b = Object.assign(document.createElement('button'), { textContent: txt }); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
  const msg = (text, ...btns) => { const p = document.createElement('p'); p.textContent = text; ui.replaceChildren(p, ...btns); };
  const close = () => { removeEventListener('resize', size); box.remove(); };
  function draw() {
    const d = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.strokeStyle = '#f28a1c'; ctx.lineWidth = 3; ctx.lineCap = ctx.lineJoin = 'round';
    for (const s of pts) { ctx.beginPath(); s.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    if (shape) {                                                     // janela que vai ficar, por cima do traçado
      const { r, mm } = scr();
      ctx.setTransform(d * mm, 0, 0, d * mm, d * r.left, d * r.top);
      ctx.strokeStyle = '#4ad0ff'; ctx.lineWidth = 0.6; ctx.stroke(new Path2D(shapePath(shape)));
    }
  }
  function ask() {
    shape = null; draw();
    msg('Passe o dedo por toda a borda de dentro da janela, encostando na moldura. Pode ser em vários pedaços.',
      btn('Pronto', done), btn('Refazer', () => { pts.length = 0; draw(); }), btn('Cancelar', close));
  }
  function done() {
    const { r, mm } = scr();
    shape = shapeFromTrace(pts.map(s => s.map(([x, y]) => [x - r.left, y - r.top])), mm);
    if (!shape) { msg('Não deu para calcular: contorne a janela inteira, de ponta a ponta, encostando na moldura.', btn('Tentar de novo', () => { pts.length = 0; ask(); }), btn('Cancelar', close)); draw(); return; }
    draw();
    msg('O contorno azul é a janela que vai ficar (o seu desenho, suavizado).',
      btn('Aplicar', () => { S.holeShape = shape; saveSettings(); layout(); close(); }),
      btn('Refazer', () => { pts.length = 0; ask(); }), btn('Cancelar', close));
  }
  box.addEventListener('pointerdown', e => { if (shape || e.target.closest('button,label')) return; stroke = [[e.clientX, e.clientY]]; pts.push(stroke); box.setPointerCapture(e.pointerId); draw(); });
  box.addEventListener('pointermove', e => {
    if (!stroke) return;
    const evs = e.getCoalescedEvents?.();                            // pontos entre os quadros (pode vir vazio)
    for (const ev of evs?.length ? evs : [e]) stroke.push([ev.clientX, ev.clientY]);
    draw();
  });
  box.addEventListener('pointerup', () => { stroke = null; });
  box.addEventListener('pointercancel', () => { stroke = null; });
  addEventListener('resize', size); size(); ask();
}
// tela de medição: régua em mm da tela inteira (coordenadas do #screen: 0,0 no canto de cima à esquerda da área acesa).
// Numa foto pela moldura dá para ler exatamente que pedaço da tela aparece: linhas a cada 1, 5 e 10 mm, cada quadrado
// de 10 mm com o seu "x,y" escrito, e o contorno da janela que o painel usa hoje em azul.
function medirTela() {
  closeSettings();
  const cv = document.createElement('canvas'); cv.id = 'medir';
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:9999;background:#000;touch-action:none';
  document.body.append(cv);
  const draw = () => {
    const d = devicePixelRatio || 1, r = $('screen').getBoundingClientRect(), mm = r.width / S.screenW, W = S.screenW, H = W * 1080 / 2400;
    cv.width = innerWidth * d; cv.height = innerHeight * d;
    const c = cv.getContext('2d');
    c.setTransform(d * mm, 0, 0, d * mm, d * r.left, d * r.top);
    c.fillStyle = '#000'; c.fillRect(-5, -5, W + 10, H + 10);
    for (let x = 0; x <= W; x++) { const m10 = x % 10 === 0, m5 = x % 5 === 0;
      c.strokeStyle = m10 ? '#ff5a3c' : m5 ? 'rgba(255,90,60,.6)' : 'rgba(255,90,60,.25)'; c.lineWidth = m10 ? 0.35 : m5 ? 0.2 : 0.1;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y <= H; y++) { const m10 = y % 10 === 0, m5 = y % 5 === 0;
      c.strokeStyle = m10 ? '#3cc8ff' : m5 ? 'rgba(60,200,255,.6)' : 'rgba(60,200,255,.25)'; c.lineWidth = m10 ? 0.35 : m5 ? 0.2 : 0.1;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.font = '600 2.2px system-ui, sans-serif'; c.textBaseline = 'top'; c.fillStyle = '#fff';
    for (let x = 0; x < W; x += 10) for (let y = 0; y < H; y += 10) c.fillText(`${x},${y}`, x + 0.6, y + 0.6);
    c.fillStyle = '#ffd23c'; c.font = '600 1.6px system-ui, sans-serif';   // meio de cada quadrado: o 5
    for (let x = 5; x < W; x += 10) for (let y = 5; y < H; y += 10) c.fillText(`${x},${y}`, x + 0.4, y + 0.4);
    c.strokeStyle = '#4aff7a'; c.lineWidth = 0.4; c.setLineDash([1.5, 1]);
    c.stroke(new Path2D(shapePath(holeNow(W, H))));
    c.setLineDash([]); c.strokeStyle = '#fff'; c.lineWidth = 0.5; c.strokeRect(0, 0, W, H);   // borda da área acesa
  };
  let last = 0;
  const close = () => { removeEventListener('resize', draw); cv.remove(); };
  cv.addEventListener('pointerdown', e => { e.stopPropagation(); const now = Date.now(); if (now - last < 450) close(); last = now; });
  addEventListener('resize', draw); draw();
}
$('btnMedir').addEventListener('click', medirTela);
$('btnFit').addEventListener('click', fitByTrace);
$('btnFitReset').addEventListener('click', () => { delete S.holeShape; saveSettings(); layout(); });   // volta para a janela medida na foto

function updateSettingsInfo() {
  document.querySelectorAll('.sim-only').forEach(el => { el.hidden = S.source !== 'sim'; });
  $('btnEngine').textContent = src.engineOn === false ? 'Ligar motor (simulação)' : 'Desligar motor (simulação)';
  $('connInfo').textContent = S.source === 'sim' ? '' : `${src.state}${src.err ? ' · ' + src.err : ''}`;
}
setInterval(() => { if (!$('settings').hidden) { updateSettingsInfo(); renderNavSettings(); renderSpotifySettings(); } }, 1000);

for (const [id, key] of Object.entries(FIELDS)) {
  $(id).addEventListener('change', e => {
    const el = e.target;
    const before = S[key];
    if (el.type === 'checkbox') S[key] = el.checked;
    else if (el.type === 'number') { const n = parseFloat(el.value); if (!Number.isNaN(n)) S[key] = n; }
    else S[key] = el.value;
    saveSettings();
    if (key === 'source' && before !== S[key]) startSource();
    layout();
    applyTheme();
    updateSettingsInfo();
  });
}

$('btnClose').addEventListener('click', closeSettings);
// botões do topo, para não precisar tirar a capa do painel
$('btnUpdate').addEventListener('click', async e => {             // baixa a versão nova do site e recarrega
  e.target.textContent = 'atualizando…';
  try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch {}
  location.reload();
});
$('btnSleep').addEventListener('click', () => { closeSettings(); sleepScreen(); });   // um toque na tela acende de novo
$('btnQuit').addEventListener('click', e => {
  window.close();                                                   // o Android deixa o app instalado se fechar
  setTimeout(() => { e.target.textContent = 'use o botão início'; }, 400);   // se não deixou
});
$('btnConnect').addEventListener('click', pickAdapter);
$('btnEngine').addEventListener('click', () => { src.setEngine?.(!src.engineOn); updateSettingsInfo(); });
$('sFolder').addEventListener('change', async e => {         // pasta inteira: só os vídeos e GIFs dela
  const files = [...e.target.files].filter(f => /^(video|image\/(gif|webp))/.test(f.type));
  e.target.value = '';
  if (!files.length) return;
  $('videoInfo').textContent = 'salvando…';
  try { await addVideos(files); } catch (err) { log('vídeos: ' + err.message); }
  await reloadVideos();
});
$('sVideos').addEventListener('change', async e => {
  const files = [...e.target.files];
  if (!files.length) return;
  $('videoInfo').textContent = 'salvando…';
  try { await addVideos(files); } catch (err) { log('vídeos: ' + err.message); }
  e.target.value = '';
  await reloadVideos();
});
armed($('btnClearVideos'), async () => { await clearVideos(); await reloadVideos(); });
// arquivos do painel (Johnny Castaway e imagens/vídeo de terceiros): ficam só neste aparelho
const filesInfo = () => {
  const extras = extrasHave().filter(n => EXTRAS.includes(n)).length;
  $('filesInfo').textContent = `Johnny: ${johnnyReady() ? 'ok' : 'faltam os arquivos'} · extras: ${extras} de ${EXTRAS.length}`;
};
$('sFiles').addEventListener('change', async e => {
  const files = [...e.target.files];
  if (!files.length) return;
  $('filesInfo').textContent = 'lendo…';
  try {
    await saveJohnnyFiles(files);
    await saveExtras(files);
    filesInfo();
    $('filesInfo').textContent += ' · recarregando…';
    setTimeout(() => location.reload(), 1500);                        // as imagens são lidas quando o painel abre
  } catch (err) { $('filesInfo').textContent = 'erro: ' + err.message; }
  e.target.value = '';
});
filesInfo();
$('sJohnnySom').checked = localStorage.getItem('johnnySom') === '1';
$('sJohnnySom').addEventListener('change', e => localStorage.setItem('johnnySom', e.target.checked ? '1' : ''));
armed($('btnResetFuel'), () => {
  fuelStats.gasolina = { km: 0, l: 0 }; fuelStats.etanol = { km: 0, l: 0 }; persist();
});
$('btnStandbyNow').addEventListener('click', () => { closeSettings(); enterStandby(true); });
$('btnZeroLevel').addEventListener('click', () => {
  const r = rawTilt();
  if (!r) { log('inclinômetro: sem leitura do acelerômetro'); return; }
  S.level = r; saveSettings(); log(`inclinômetro zerado (${r.roll.toFixed(1)}°, ${r.pitch.toFixed(1)}°)`);
});
$('btnFullscreen').addEventListener('click', goFullscreen);
$('btnVoiceTest').addEventListener('click', () => speak('Teste de voz do painel da Pajero. Em 300 metros, vire à direita.'));
$('sOdo').addEventListener('change', e => {
  const n = parseFloat(e.target.value);
  odo = Number.isNaN(n) ? null : n;
  persist(); renderUpkeep();
});
armed($('btnClearTrips'), () => { trips = []; save('trips', trips); renderTrips(); });
const navSearch = () => {
  const q = $('navQuery').value.trim();
  if (!q) return;
  showSettingsResults('buscando…', []);
  searchDest(q, showSettingsResults);
};
$('btnNavSearch').addEventListener('click', navSearch);
$('navQuery').addEventListener('keydown', e => { if (e.key === 'Enter') navSearch(); });
$('btnNavStop').addEventListener('click', () => { stopNav(); renderNavSettings(); });
$('btnSpotify').addEventListener('click', () => {
  if (spot.connected) { spot.logout(); renderSpotifySettings(); return; }
  const id = $('sSpotifyId').value.trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) { spot.err = 'cole o Client ID (32 letras e números)'; renderSpotifySettings(); return; }
  S.spotifyClient = id; saveSettings();
  spot.login(id);
});

// ---------------------------------------------------------------------------
// Tela cheia, tela sempre acesa, deslocamento anti-marcas e modo offline
async function goFullscreen() {
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {}
  try { await screen.orientation.lock('landscape'); } catch {}
}
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
addEventListener('pointerdown', () => { if (touch && !standalone && !document.fullscreenElement) goFullscreen(); }, { once: true });

// trava de tela acesa: uma só de cada vez (cada pedido cria uma trava nova, e todas precisam ser soltas para apagar)
const wakeLocks = new Set();
let wakePending = false;
async function keepAwake() {
  if (asleep || wakePending || [...wakeLocks].some(l => !l.released)) return;
  wakePending = true;
  try {
    const l = await navigator.wakeLock?.request('screen');
    if (l) { wakeLocks.add(l); l.addEventListener('release', () => wakeLocks.delete(l)); if (asleep) l.release(); }
  } catch {}
  wakePending = false;
}

// Apagar a tela: o painel cobre tudo de preto e solta a trava de tela acesa; o Android apaga a tela pelo
// tempo de desligar dele (5 s no G42). Acende de novo pelo botão de ligar ou quando a energia volta.
let holdTimer = 0, holdAt = null;
function sleepScreen() {
  if (asleep) return;
  asleep = true;
  exitStandby(); pgPlayer.stop();
  if (!$('sleep')) document.body.append(Object.assign(document.createElement('div'), { id: 'sleep' }));
  $('sleep').hidden = false;
  for (const l of wakeLocks) { try { l.release(); } catch {} }
}
function wakeScreen() {
  if (!asleep) return;
  asleep = false;
  $('sleep').hidden = true;
  keepAwake(); pageVideo(); checkUpdate();
}
// ao acender a tela procura versão nova; o sw.js novo assume na hora (skipWaiting) e a página recarrega
let updAt = 0;
function checkUpdate() {
  if (!navigator.onLine || Date.now() - updAt < 60000) return;
  updAt = Date.now();
  navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
}
if (navigator.serviceWorker?.controller) navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wakeScreen(); keepAwake(); checkUpdate(); } });
addEventListener('pointerdown', e => {
  if (asleep) { wakeScreen(); return; }
  if (e.target.closest('#wing-left, #settings, #fitter, #medir, .sound-box')) return;   // o relógio é para as configurações
  holdAt = [e.clientX, e.clientY];
  clearTimeout(holdTimer); holdTimer = setTimeout(sleepScreen, 1500);   // segurar 1,5 s apaga a tela
}, true);
addEventListener('pointermove', e => { if (holdAt && Math.hypot(e.clientX - holdAt[0], e.clientY - holdAt[1]) > 30) { clearTimeout(holdTimer); holdAt = null; } }, true);
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { clearTimeout(holdTimer); holdAt = null; }, true);
// energia do carro: parou de carregar (ignição desligada) por 1 minuto, apaga a tela; a energia voltou, acende
// (o Android acende a tela sozinho ao ligar o carregador). Só reage à mudança: abrir o app na bateria não apaga.
navigator.getBattery?.().then(b => {
  let timer = 0;
  b.addEventListener('chargingchange', () => {
    clearTimeout(timer);
    if (b.charging) { wakeScreen(); return; }
    if (S.sleepUnplug !== false) timer = setTimeout(() => { if (!b.charging) sleepScreen(); }, 60000);
  });
}).catch(() => {});

setInterval(() => {
  $('shift').style.transform = `translate(${rand(-0.8, 0.8).toFixed(2)}rem, ${rand(-0.6, 0.6).toFixed(2)}rem)`;
}, 120000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => log('offline: ' + e.message));

// ---------------------------------------------------------------------------
addEventListener('resize', layout);
layout();
showPage(page);
startSource();
reloadVideos();
applyTheme();
listenPhone();
keepAwake();
setInterval(tick, 100);
