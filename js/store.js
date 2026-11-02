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
};

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
