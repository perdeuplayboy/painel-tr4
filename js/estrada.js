// Distância por estrada (de carro) até um ponto, pelos mesmos roteadores do OpenStreetMap que a navegação usa.
// porEstrada(p, q) responde na hora com o que já sabe ({ km, min, ape } ou null) e, se ainda não souber, pede a rota
// uma vez em segundo plano; a resposta fica guardada (a cena mostra em linha reta até ela chegar ou se não houver rota).
// ape: quanto falta a pé do fim da estrada até o ponto (cachoeira, pico...), em km.
import { load, keep } from './cenas.js';

const ROUTERS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  'https://router.project-osrm.org/route/v1/driving/',
];
const MEM = load('estrada', {}), PEND = new Set();
const chave = (p, q) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}>${q.lat.toFixed(4)},${q.lon.toFixed(4)}`;   // ~100 m de onde o carro está

export function porEstrada(p, q) {
  const k = chave(p, q), r = MEM[k];
  if (r) return r.km != null ? r : null;                             // {} = já perguntou e não tem rota
  if (!PEND.has(k) && navigator.onLine !== false) { PEND.add(k); pedir(p, q, k); }
  return null;
}

async function pedir(p, q, k) {
  for (const base of ROUTERS) {
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`${base}${p.lon},${p.lat};${q.lon},${q.lat}?overview=false&alternatives=false`, { signal: ctl.signal });
      clearTimeout(tm);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.code === 'NoRoute') { guardar(k, {}); return; }
      const ro = j.routes?.[0]; if (!ro) continue;
      guardar(k, { km: ro.distance / 1000, min: ro.duration / 60, ape: (j.waypoints?.[1]?.distance || 0) / 1000 });
      return;
    } catch {}
  }
  PEND.delete(k);                                                    // sem resposta: tenta de novo na próxima vez
}

function guardar(k, v) {
  MEM[k] = { ...v, at: Date.now() };
  const ks = Object.keys(MEM);
  if (ks.length > 300) ks.sort((a, b) => MEM[a].at - MEM[b].at).slice(0, ks.length - 300).forEach(x => delete MEM[x]);
  keep('estrada', MEM);
}

// "12 km · 18 min", por estrada
export function textoEstrada(r) {
  const km = r.km < 10 ? r.km.toFixed(1).replace('.', ',') : String(Math.round(r.km));
  const min = r.min < 60 ? `${Math.max(1, Math.round(r.min))} min` : `${Math.floor(r.min / 60)} h ${String(Math.round(r.min % 60)).padStart(2, '0')}`;
  return `${km} km · ${min}`;
}
