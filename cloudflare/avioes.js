// Intermediário do Painel TR4 (Cloudflare Worker "tr4-avioes", plano grátis).
// Alguns sites não deixam outro site ler os dados direto (CORS). Este Worker busca e devolve liberado só para o painel:
//   /?lat=-23.55&lon=-46.63&r=80   aviões perto de um ponto (adsb.lol, ou adsb.fi se a primeira falhar; r em milhas náuticas, até 100)
//   /lua?t=2026-11-04T05:00          a Lua daquela hora, foto e dados (Dial-a-Moon da NASA)
//   /link?u=https://maps.app.goo.gl/… para onde vai o link curto do Google Maps ({"url": "…"})
// No editor do Cloudflare o código foi digitado com a parte principal numa linha só (o editor de lá não aceita colar).
const ORIGENS = ['https://perdeuplayboy.github.io', 'http://localhost:8090'];

export default {
  async fetch(req) {
    const url = new URL(req.url), origem = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ORIGENS.includes(origem) ? origem : ORIGENS[0], 'Vary': 'Origin' };
    const json = { ...cors, 'Content-Type': 'application/json' };
    if (url.pathname === '/link') {                                   // para onde vai um link curto do Google Maps (só desses)
      const u = url.searchParams.get('u') || '';
      let h = ''; try { h = new URL(u).hostname; } catch {}
      if (h !== 'maps.app.goo.gl' && h !== 'goo.gl') return new Response('{"erro":"só link do Google Maps"}', { status: 400, headers: json });
      let dest = u;
      for (let i = 0; i < 4 && /goo\.gl$/.test(new URL(dest).hostname); i++) {
        const res = await fetch(dest, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
        const loc = res.headers.get('Location');
        if (!loc) break;
        dest = new URL(loc, dest).href;
      }
      return new Response(JSON.stringify({ url: dest }), { headers: { ...json, 'Cache-Control': 'max-age=86400' } });
    }
    if (url.pathname === '/lua') {
      const t = url.searchParams.get('t') || '';
      if (t.length !== 16 || t[10] !== 'T') return new Response('{"erro":"faltou t"}', { status: 400, headers: json });
      const res = await fetch('https://svs.gsfc.nasa.gov/api/dialamoon/' + t, { cf: { cacheTtl: 3600 } });
      return new Response(res.body, { status: res.status, headers: { ...json, 'Cache-Control': 'max-age=3600' } });
    }
    const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
    const r = Math.min(100, Math.max(5, Number(url.searchParams.get('r')) || 60));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return new Response('{"erro":"faltou lat e lon"}', { status: 400, headers: json });
    }
    const la = lat.toFixed(3), lo = lon.toFixed(3);
    const fontes = [`https://api.adsb.lol/v2/point/${la}/${lo}/${r}`, `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/${r}`];
    for (const f of fontes) {
      try {
        const res = await fetch(f, { headers: { 'User-Agent': 'painel-tr4' }, cf: { cacheTtl: 5 } });
        if (res.ok) return new Response(res.body, { headers: { ...json, 'Cache-Control': 'no-store' } });
      } catch {}
    }
    return new Response('{"erro":"sem dados agora"}', { status: 502, headers: json });
  },
};
