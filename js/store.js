// Persistência local do aparelho: configurações e estatísticas no localStorage,
// vídeos do standby no IndexedDB. Tudo tolera armazenamento indisponível.

export const DEFAULTS = {
  source: 'sim',            // 'sim' | 'obd'
  deviceId: '',             // adaptador BLE autorizado
  fuel: 'gasolina',
  priceG: 6.29,
  priceE: 4.29,
  standbyMin: 3,            // minutos parado (motor ligado) até o standby
  coolLimit: 105,
  battLimit: 12.0,
  rollLimit: 30,
  pitchLimit: 35,
  displacement: 2.0,
  ve: 0.85,
  screenW: 148.2,           // largura da área acesa da tela do G42, em mm (deitado, 2400×1080)
  offX: 0,                  // deslocamento da janela da moldura, em mm
  offY: 0,
  mask: 'black',            // 'black' | 'dim' (para ajustar o encaixe)
  outline: false,
  level: null,              // calibração do inclinômetro { roll, pitch }
  voice: 'all',             // 'all' | 'alerts' | 'off'
  theme: 'auto',            // 'auto' (pelo pôr do sol) | 'day' | 'night'
  nightDim: 45,             // % de escurecimento à noite
  spotifyClient: '',        // Client ID do app criado em developer.spotify.com
  anims: true,              // animações retrô entram na lista do standby/página Vídeos
  clipSec: 25,              // segundos de cada GIF ou animação
  animOff: [],              // animações desligadas uma a uma
  mediaOff: [],             // vídeos/GIFs desligados (ids do IndexedDB)
};

// Intervalos de partida para a TR4 2.0 flex em uso misto; confira no manual e ajuste.
// everyKm/everyMonths = 0 desliga aquele critério.
export const UPKEEP = [
  { id: 'oleo', name: 'Óleo e filtro do motor', short: 'Óleo', everyKm: 5000, everyMonths: 6 },
  { id: 'ar', name: 'Filtro de ar', short: 'Filtro de ar', everyKm: 10000, everyMonths: 12 },
  { id: 'cabine', name: 'Filtro de cabine', short: 'Filtro de cabine', everyKm: 10000, everyMonths: 12 },
  { id: 'comb', name: 'Filtro de combustível', short: 'Filtro de comb.', everyKm: 20000, everyMonths: 24 },
  { id: 'velas', name: 'Velas', short: 'Velas', everyKm: 30000, everyMonths: 36 },
  { id: 'freio', name: 'Fluido de freio', short: 'Fluido de freio', everyKm: 0, everyMonths: 24 },
  { id: 'pastilha', name: 'Pastilhas de freio (revisar)', short: 'Pastilhas', everyKm: 20000, everyMonths: 0 },
  { id: 'arref', name: 'Líquido de arrefecimento', short: 'Arrefecimento', everyKm: 40000, everyMonths: 24 },
  { id: 'cambio', name: 'Óleo câmbio, diferenciais e reduzida', short: 'Óleo câmbio', everyKm: 40000, everyMonths: 36 },
  { id: 'correia', name: 'Correia dentada', short: 'Correia dentada', everyKm: 60000, everyMonths: 48 },
  { id: 'pneus', name: 'Rodízio e alinhamento', short: 'Rodízio', everyKm: 10000, everyMonths: 0 },
].map(it => ({ ...it, lastKm: null, lastAt: 0 }));

export function loadUpkeep() {
  const saved = load('upkeep', []);
  return UPKEEP.map(d => ({ ...d, ...saved.find(s => s.id === d.id) }));
}

export function load(key, fallback) {
  try {
    const v = localStorage.getItem('tr4.' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem('tr4.' + key, JSON.stringify(value)); } catch {}
}

export function loadSettings() {
  return { ...DEFAULTS, ...load('settings', {}) };
}

// ---- vídeos ----
const DB = 'painel-tr4', STORE = 'videos';

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function addVideos(files) {
  try { await navigator.storage?.persist?.(); } catch {}
  for (const f of files) await tx('readwrite', s => s.add({ name: f.name, blob: f }));
}

export async function listVideos() {
  try { return (await tx('readonly', s => s.getAll())) || []; } catch { return []; }
}

export async function removeVideo(id) {
  try { await tx('readwrite', s => s.delete(id)); } catch {}
}

export async function clearVideos() {
  try { await tx('readwrite', s => s.clear()); } catch {}
}

// ---- Johnny Castaway: arquivos de dados do original, guardados só neste aparelho ----
const JDB = 'painel-tr4-johnny', JNAMES = ['RESOURCE.MAP', 'RESOURCE.001', 'SCRANTIC.SCR'];
const isSound = n => /^SOUND\d{1,2}\.WAV$/.test(n);                 // efeitos sonoros (opcionais)

function openJohnny() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(JDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// lê um zip sem biblioteca (arquivos guardados ou comprimidos com deflate)
async function unzip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
  let end = buf.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('zip inválido');
  const out = [];
  for (let i = 0, p = dv.getUint32(end + 16, true); i < dv.getUint16(end + 10, true); i++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen)), local = dv.getUint32(p + 42, true);
    const data = buf.subarray(local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)).subarray(0, size);
    out.push({ name, get: async () => method === 0 ? data.slice().buffer
      : new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer() });
    p += 46 + nlen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return out;
}

// aceita o zip do protetor ou os arquivos soltos (os três de dados e os sons); devolve quais nomes encontrou
export async function saveJohnnyFiles(files) {
  const found = {};
  for (const f of files) {
    const items = /\.zip$/i.test(f.name) ? await unzip(f) : [{ name: f.name, get: () => f.arrayBuffer() }];
    for (const it of items) {
      const base = it.name.split(/[\/]/).pop().toUpperCase();
      if (JNAMES.includes(base) || isSound(base)) found[base] = await it.get();
    }
  }
  const db = await openJohnny();
  await new Promise((resolve, reject) => {
    const t = db.transaction('files', 'readwrite');
    for (const [k, v] of Object.entries(found)) t.objectStore('files').put(v, k);
    t.oncomplete = resolve; t.onerror = () => reject(t.error);
  });
  const all = await loadJohnnyFiles();
  localStorage.setItem('johnnyOk', JNAMES.every(n => all[n]) ? '1' : '');
  return Object.keys(found);
}

export async function loadJohnnyFiles() {
  try {
    const db = await openJohnny();
    return await new Promise((resolve, reject) => {
      const t = db.transaction('files'), res = {};
      t.objectStore('files').openCursor().onsuccess = e => {
        const c = e.target.result;
        if (c) { res[c.key] = c.value; c.continue(); }
      };
      t.oncomplete = () => resolve(res); t.onerror = () => reject(t.error);
    });
  } catch { return {}; }
}

export const johnnyReady = () => localStorage.getItem('johnnyOk') === '1';

// ---- Arquivos extras: imagens e vídeo de terceiros usados nas animações, guardados só neste aparelho ----
// (não ficam no repositório público; sem eles o labirinto e o Brilho ciano saem do sorteio)
export const EXTRAS = ['maze-tijolo.png', 'maze-chao.png', 'maze-teto.png', 'start.png', 'quadro.webp', 'rato.png', 'brilho-ciano.webm'];
const XDB = 'painel-tr4-extras';

function openExtras() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(XDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function saveExtras(files) {
  const found = {};
  for (const f of files) {
    const items = /\.zip$/i.test(f.name) ? await unzip(f) : [{ name: f.name, get: () => f.arrayBuffer() }];
    for (const it of items) {
      const base = it.name.split(/[\/]/).pop().toLowerCase();
      if (EXTRAS.includes(base)) found[base] = new Blob([await it.get()], { type: extraType(base) });
    }
  }
  const db = await openExtras();
  await new Promise((resolve, reject) => {
    const t = db.transaction('files', 'readwrite');
    for (const [k, v] of Object.entries(found)) t.objectStore('files').put(v, k);
    t.oncomplete = resolve; t.onerror = () => reject(t.error);
  });
  const have = new Set([...extrasHave(), ...Object.keys(found)]);
  localStorage.setItem('extrasOk', JSON.stringify([...have]));
  return Object.keys(found);
}

const extraType = n => n.endsWith('.png') ? 'image/png' : n.endsWith('.webp') ? 'image/webp' : n.endsWith('.webm') ? 'video/webm' : '';
export const extrasHave = () => { try { return JSON.parse(localStorage.getItem('extrasOk') || '[]'); } catch { return []; } };
const NEEDS = { maze: ['maze-tijolo.png', 'maze-chao.png', 'maze-teto.png', 'start.png', 'quadro.webp', 'rato.png'], glow: ['brilho-ciano.webm'] };
export const extrasReady = anim => (NEEDS[anim] || []).every(n => extrasHave().includes(n));   // a animação tem o que precisa?

// devolve um endereço blob: do arquivo extra, ou null se ele não foi carregado
export async function extraURL(name) {
  if (!extrasHave().includes(name)) return null;
  try {
    const db = await openExtras();
    const blob = await new Promise((resolve, reject) => {
      const r = db.transaction('files').objectStore('files').get(name);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    return blob ? URL.createObjectURL(blob) : null;
  } catch { return null; }
}
