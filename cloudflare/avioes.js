// Intermediário do Painel TR4 (Cloudflare Worker, plano grátis).
// Os sites de aviões não deixam outro site ler os dados direto (CORS); este Worker busca os aviões perto de um
// ponto na rede aberta adsb.lol (ou adsb.fi, se a primeira falhar) e devolve liberado só para o painel.
// Uso: https://SEU-WORKER.workers.dev/?lat=-23.55&lon=-46.63&r=80   (r = raio em milhas náuticas, até 100)
const ORIGENS = ['https://perdeuplayboy.github.io', 'http://localhost:8090'];

export default {
  async fetch(req) {
    const url = new URL(req.url), origem = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ORIGENS.includes(origem) ? origem : ORIGENS[0], 'Vary': 'Origin' };
    const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
    const r = Math.min(100, Math.max(5, Number(url.searchParams.get('r')) || 60));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return new Response('{"erro":"faltou lat e lon"}', { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const la = lat.toFixed(3), lo = lon.toFixed(3);
    const fontes = [`https://api.adsb.lol/v2/point/${la}/${lo}/${r}`, `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/${r}`];
    for (const f of fontes) {
      try {
        const res = await fetch(f, { headers: { 'User-Agent': 'painel-tr4' }, cf: { cacheTtl: 5 } });
        if (res.ok) return new Response(res.body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch {}
    }
    return new Response('{"erro":"sem dados agora"}', { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
  },
};
