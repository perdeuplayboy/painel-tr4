import {
  State, FUELS, emptyTrip, tripAvgKmL, tripAvgSpeed, deriveAndIntegrate, MockSource, ElmBleSource,
} from './obd.js';
import { loadSettings, load, save, addVideos, listVideos, clearVideos } from './store.js';

const $ = id => document.getElementById(id);
const S = loadSettings();
const saveSettings = () => save('settings', S);
const isNum = v => typeof v === 'number' && !Number.isNaN(v);
const fmt = (v, dec = 0) => isNum(v) ? v.toFixed(dec).replace('.', ',') : '--';
const fmtSigned = (v, dec = 1) => isNum(v) ? (v >= 0 ? '+' : '') + fmt(v, dec) : '--';
const rand = (a, b) => a + Math.random() * (b - a);

const PAGES = ['drive', 'engine', 'trip', 'fuel', 'trail', 'diag', 'nav'];
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

function layout() {
  const W = S.screenW, H = W * 1080 / 2400;
  const vw = innerWidth, vh = innerHeight;
  const mm = Math.min(vw / W, vh / H);
  document.documentElement.style.fontSize = mm + 'px';
  Object.assign($('screen').style, {
    width: W * mm + 'px', height: H * mm + 'px', left: (vw - W * mm) / 2 + 'px', top: (vh - H * mm) / 2 + 'px',
  });
  const x0 = (W - 140) / 2 + S.offX, y0 = (H - 45) / 2 + S.offY;
  Object.assign($('stage').style, { left: x0 + 'rem', top: y0 + 'rem' });
  $('mask').setAttribute('viewBox', `0 0 ${W} ${H}`);
  $('maskPath').setAttribute('d', `M0 0 H${W} V${H} H0 Z ` + holePath(x0, y0));
  $('outlinePath').setAttribute('d', S.outline ? holePath(x0, y0) : '');
  $('screen').classList.toggle('dim', S.mask === 'dim');
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
const dots = $('dots');
PAGES.forEach((_, i) => {
  const dot = document.createElement('i');
  dot.addEventListener('click', () => showPage(i));
  dots.appendChild(dot);
});

function showPage(i) {
  page = (i + PAGES.length) % PAGES.length;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('on', el.dataset.page === PAGES[page]));
  [...dots.children].forEach((d, j) => d.classList.toggle('on', j === page));
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

function persist() {
  save('trip', trip); save('fuelStats', fuelStats); save('lastRunningAt', lastRunningAt); save('batt', batt);
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

// ---------------------------------------------------------------------------
// Sensores do celular: GPS (clima, altitude, rumo) e acelerômetro (inclinômetro)
const gps = { lat: NaN, lon: NaN, alt: NaN, heading: NaN, speed: NaN, at: 0 };
navigator.geolocation?.watchPosition(p => {
  const c = p.coords;
  Object.assign(gps, {
    lat: c.latitude, lon: c.longitude, alt: c.altitude ?? NaN, heading: c.heading ?? NaN,
    speed: c.speed == null ? NaN : c.speed * 3.6, at: Date.now(),
  });
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
function tilt() {
  const r = rawTilt();
  if (!r) return { roll: NaN, pitch: NaN };
  const z = S.level || { roll: 0, pitch: 0 };
  return { roll: r.roll - z.roll, pitch: r.pitch - z.pitch };
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
}
$('alert').addEventListener('pointerdown', e => { e.stopPropagation(); alertState.until = 0; $('alert').hidden = true; });

// ---------------------------------------------------------------------------
// Standby: vídeos com o carro parado ou desligado
let videos = [];
let videoUrls = [];
async function reloadVideos() {
  videoUrls.forEach(u => URL.revokeObjectURL(u));
  videos = await listVideos();
  videoUrls = videos.map(v => URL.createObjectURL(v.blob));
  $('videoInfo').textContent = videos.length ? `${videos.length} vídeo(s) salvos` : 'nenhum vídeo';
}

const sb = { on: false, forced: false, engineOffSince: null, stoppedSince: null, suppressUntil: 0, moveTimer: 0 };
const sbVideo = $('sbVideo');
sbVideo.addEventListener('ended', playNextVideo);
sbVideo.addEventListener('error', playNextVideo);

function playNextVideo() {
  if (!sb.on || !videoUrls.length) return;
  sbVideo.src = videoUrls[Math.floor(Math.random() * videoUrls.length)];
  sbVideo.play().catch(() => {});
}

function moveStandbyClock() {
  const c = $('sbClock');
  if (videoUrls.length) { c.style.left = c.style.top = ''; return; }
  c.style.left = rand(28, 75) + 'rem';                       // relógio passeando: evita marcar a tela
  c.style.top = rand(8, 20) + 'rem';
}

function enterStandby(forced = false) {
  if (sb.on) return;
  sb.on = true; sb.forced = forced;
  $('standby').hidden = false;
  $('standby').classList.toggle('novideo', !videoUrls.length);
  moveStandbyClock();
  sb.moveTimer = setInterval(moveStandbyClock, 20000);
  playNextVideo();
}

function exitStandby() {
  if (!sb.on) return;
  sb.on = false; sb.forced = false;
  clearInterval(sb.moveTimer);
  sbVideo.pause(); sbVideo.removeAttribute('src'); sbVideo.load();
  $('standby').hidden = true;
}

$('standby').addEventListener('pointerdown', e => {
  e.stopPropagation();
  const engineOff = sb.engineOffSince != null;
  sb.suppressUntil = performance.now() + (engineOff ? 60000 : S.standbyMin * 60000);
  exitStandby();
});

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
    if (Date.now() - lastRunningAt > TRIP_RESET_MS) { trip = emptyTrip(); log('nova viagem'); }
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

  // alertas
  if (fresh && d.coolantC >= S.coolLimit) raise('cool', 'bad', 'MOTOR SUPERAQUECENDO', `${fmt(d.coolantC)} °C · pare em local seguro`);
  if (running && d.batteryV < S.battLimit) {
    lowBattSince ??= now;
    if (now - lowBattSince > 10000) raise('batt', 'warn', 'BATERIA BAIXA', `${fmt(d.batteryV, 1)} V com motor ligado · alternador?`);
  } else lowBattSince = null;
  if (d.milOn && !milWasOn) raise('mil', 'warn', 'LUZ DE INJEÇÃO ACESA', `${d.dtcCount} falha(s) · veja Diagnóstico`, 0);
  milWasOn = d.milOn;
  const t = tilt();
  if (Math.abs(t.roll) > S.rollLimit || Math.abs(t.pitch) > S.pitchLimit) {
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
  const wantStandby = $('alert').hidden && $('settings').hidden && now >= sb.suppressUntil && (
    (sb.engineOffSince != null && now - sb.engineOffSince > STANDBY_ENGINE_OFF_MS) ||
    (sb.stoppedSince != null && now - sb.stoppedSince > S.standbyMin * 60000));
  if (wantStandby) enterStandby();

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
  set('sbLine', `${date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}` +
    (wOk ? ` · ${fmt(weather.temp)}°` : '') + (isNum(v.coolantC) ? ` · motor ${fmt(v.coolantC)}°` : ''));

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
  const gpsOk = Date.now() - gps.at < 10000;
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  set('heading', gpsOk && gps.speed > 5 && isNum(gps.heading)
    ? `${dirs[Math.round(gps.heading / 45) % 8]} ${fmt(gps.heading)}°` : '--');
  set('alt', gpsOk ? fmt(gps.alt) : '--');

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

  // linha de status (conexão)
  const st = $('status');
  let msg = '', err = false;
  if (S.source === 'sim') msg = 'SIMULAÇÃO';
  else if (src.state !== State.CONNECTED) {
    err = true;
    msg = src.device?.gatt.connected ? `OBD: ${src.state}` : `OBD: ${src.err || src.state} · toque aqui para conectar`;
  }
  if (st.textContent !== msg) st.textContent = msg;
  st.classList.toggle('err', err);
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
  sRollLimit: 'rollLimit', sPitchLimit: 'pitchLimit',
  sScreenW: 'screenW', sOffX: 'offX', sOffY: 'offY', sMask: 'mask', sOutline: 'outline',
};

function openSettings() {
  for (const [id, key] of Object.entries(FIELDS)) {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = S[key];
  }
  $('log').textContent = logLines.join('\n');
  updateSettingsInfo();
  $('settings').hidden = false;
  exitStandby();
}
function closeSettings() { $('settings').hidden = true; }

function updateSettingsInfo() {
  document.querySelectorAll('.sim-only').forEach(el => { el.hidden = S.source !== 'sim'; });
  $('btnEngine').textContent = src.engineOn === false ? 'Ligar motor (simulação)' : 'Desligar motor (simulação)';
  $('connInfo').textContent = S.source === 'sim' ? '' : `${src.state}${src.err ? ' · ' + src.err : ''}`;
}
setInterval(() => { if (!$('settings').hidden) updateSettingsInfo(); }, 1000);

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
    updateSettingsInfo();
  });
}

$('btnClose').addEventListener('click', closeSettings);
$('btnConnect').addEventListener('click', pickAdapter);
$('btnEngine').addEventListener('click', () => { src.setEngine?.(!src.engineOn); updateSettingsInfo(); });
$('sVideos').addEventListener('change', async e => {
  const files = [...e.target.files];
  if (!files.length) return;
  $('videoInfo').textContent = 'salvando…';
  try { await addVideos(files); } catch (err) { log('vídeos: ' + err.message); }
  e.target.value = '';
  await reloadVideos();
});
armed($('btnClearVideos'), async () => { await clearVideos(); await reloadVideos(); });
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

// ---------------------------------------------------------------------------
// Tela cheia, tela sempre acesa, deslocamento anti-marcas e modo offline
async function goFullscreen() {
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {}
  try { await screen.orientation.lock('landscape'); } catch {}
}
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
addEventListener('pointerdown', () => { if (touch && !standalone && !document.fullscreenElement) goFullscreen(); }, { once: true });

let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

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
keepAwake();
setInterval(tick, 100);
