// Página do seu celular: recebe o "Compartilhar" do Google Maps e manda o destino ao painel
// pelo ntfy.sh, no canal secreto que o painel gerou.
import { geocode, isMapsLink } from './nav.js';

const $ = id => document.getElementById(id);
const KEY = 'tr4.phoneChannel';
const getChannel = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const setChannel = c => { try { localStorage.setItem(KEY, c); } catch {} };

if (/^#tr4-\w+$/.test(location.hash)) { setChannel(location.hash.slice(1)); history.replaceState(null, '', location.pathname); }

function msg(text, cls = '') { $('msg').textContent = text; $('msg').className = cls; }

async function send(payload) {
  msg('enviando…');
  try {
    const r = await fetch(`https://ntfy.sh/${getChannel()}`, { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(`erro ${r.status}`);
    msg(payload.cmd === 'stop' ? 'Rota encerrada no carro ✓' : `Enviado ao carro: ${payload.name} ✓`, 'ok');
  } catch (e) { msg('não foi possível enviar: ' + e.message, 'bad'); }
}

function showResults(list) {
  $('results').replaceChildren(...list.slice(0, 6).map(it => {
    const b = document.createElement('button');
    b.className = 'dest';
    const name = document.createElement('b'), sub = document.createElement('small');
    name.textContent = it.name; sub.textContent = it.label;
    b.append(name, sub);
    b.addEventListener('click', () => send({ name: it.name, label: it.label, lat: it.lat, lon: it.lon }));
    return b;
  }));
}

let here = null;
navigator.geolocation?.getCurrentPosition(p => { here = { lat: p.coords.latitude, lon: p.coords.longitude }; }, () => {}, { maximumAge: 600000 });

// tenta do mais completo ao mais simples: o Nominatim nem sempre entende o endereço do Google
async function search(queries) {
  msg('buscando…');
  for (const q of queries.filter(Boolean)) {
    try {
      const list = await geocode(q, here);
      if (list.length) { msg(list.length > 1 ? 'Escolha o destino:' : 'Toque para enviar:'); showResults(list); return; }
    } catch (e) { msg(e.name === 'TimeoutError' ? 'sem internet?' : e.message, 'bad'); return; }
  }
  msg('nada encontrado; tente digitar o endereço', 'bad');
  showResults([]);
}

// Texto que o Google Maps compartilha: "Nome\nEndereço\nhttps://maps.app.goo.gl/…"
function fromShare() {
  const p = new URLSearchParams(location.search);
  const raw = [p.get('title'), p.get('text'), p.get('url')].filter(Boolean).join('\n');
  if (!raw) return;
  history.replaceState(null, '', location.pathname);
  $('shared').textContent = raw;
  const coords = raw.match(/[@=](-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  const lines = raw.split('\n').map(s => s.trim()).filter(s => s && !/^https?:\/\//.test(s) && s !== p.get('title'));
  const title = p.get('title') && !/^https?:/.test(p.get('title')) ? p.get('title') : '';
  const name = title || lines[0] || '';
  if (coords) {
    showResults([{ name: name || 'Local compartilhado', label: `${coords[1]}, ${coords[2]}`, lat: +coords[1], lon: +coords[2] }]);
    msg('Toque para enviar:');
    return;
  }
  const link = raw.match(/https?:\/\/\S+/)?.[0];
  if (!name && link && isMapsLink(link)) { $('q').value = link; search([link]); return; }   // só o link: abre ele
  const rest = title ? lines : lines.slice(1);
  $('q').value = [name, rest[0]].filter(Boolean).join(', ');
  search([[name, ...rest].join(', '), rest.join(', '), rest[0], name, isMapsLink(link) && link]);
}

function start() {
  const ch = getChannel();
  $('setup').hidden = !!ch;
  $('main').hidden = !ch;
  if (!ch) return;
  $('chan').textContent = ch;
  fromShare();
}

$('btnCode').addEventListener('click', () => {
  const c = $('code').value.trim();
  if (!/^tr4-\w+$/.test(c)) { $('code').setCustomValidity('código inválido'); $('code').reportValidity(); return; }
  setChannel(c); start();
});
$('code').addEventListener('input', () => $('code').setCustomValidity(''));
const doSearch = () => { const q = $('q').value.trim(); if (q) search([q]); };
$('btnSearch').addEventListener('click', doSearch);
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
$('btnStop').addEventListener('click', () => send({ cmd: 'stop' }));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
start();
