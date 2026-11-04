// Guarda o app no celular para funcionar sem internet (trilha, garagem).
// Ao mudar qualquer arquivo do app, suba a versão para o celular baixar de novo.
const VERSION = 'painel-tr4-v41';
const TILES = 'painel-tr4-mapa';          // pedaços do mapa já vistos (sobrevive às versões)
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/obd.js', 'js/store.js', 'js/nav.js', 'js/spotify.js', 'js/player.js', 'js/anims.js', 'js/lidar.js', 'js/cenas.js', 'js/retro3d.js', 'js/vendor/qrcode.js',
  'enviar.html', 'enviar.webmanifest', 'js/enviar.js',
  'img/cad360.webp', 'johnny/index.html', 'johnny/jc_reborn.js', 'johnny/jc_reborn.wasm', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro (pega atualizações quando há internet), cache quando não há.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && url.hostname === 'tile.openstreetmap.org') { e.respondWith(tile(e.request)); return; }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })                          // confere com o site (não usa a cópia velha de 10 min)
      .then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Mapa: usa o que já baixou (funciona sem sinal onde você já passou) e guarda até ~4000 pedaços
let puts = 0;
async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) {
    await cache.put(req, r.clone());
    if (++puts % 200 === 0) {
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - 4000))) await cache.delete(k);
    }
  }
  return r;
}
