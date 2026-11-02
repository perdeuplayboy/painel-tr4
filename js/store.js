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

export async function clearVideos() {
  try { await tx('readwrite', s => s.clear()); } catch {}
}
