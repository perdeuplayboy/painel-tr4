// Visão do drone: nuvem de pontos tipo LiDAR (terreno, estrada, mata, cidade, fazenda, a TR4 andando) em WebGL puro.
// Desenha numa tela WebGL escondida e copia para o canvas 2D do player, com o HUD por cima.

import { livre } from './cenas.js';

const L = 320;                                   // o mundo se repete a cada L metros (sem emenda)
const F = Math.PI * 2 / L;
// Cada vez que a animação começa sorteia um mundo novo: o tipo de cenário (serra, cidade, deserto, litoral,
// mata fechada, a TR4 na trilha, fazenda, cânion) e, dentro dele, curvas da estrada, morros e o que tem em volta.
// As frequências são inteiras para o mundo continuar fechando sem emenda a cada L metros.
let W = null;
const wave = (list, z, x = 0) => list.reduce((s, [a, f, p, k]) => s + a * Math.sin(f * F * z + k * x + p), 0);
const roadX = z => wave(W.road, z);
const swell = z => wave(W.swell, z);                              // sobe e desce da estrada
const TYPES = ['serra', 'cidade', 'deserto', 'litoral', 'mata', 'tr4', 'fazenda', 'canion'];
const TYPE_NAME = { serra: 'SERRA', cidade: 'CIDADE', deserto: 'DESERTO', litoral: 'LITORAL', mata: 'MATA FECHADA', tr4: 'SEGUINDO A TR4', fazenda: 'FAZENDA', canion: 'CÂNION' };
let lastType = null;
function ground(x, z) {
  const d = Math.abs(x - roadX(z)), dx = (x - roadX(z)) * (W.seaSide || 1);
  const hills = wave(W.hills, z, x) + 0.6 * Math.sin(x * 0.7 + z * 0.4);
  const side = Math.min(1, Math.max(0, (d - W.rw - 1.5) / W.valley));   // estrada plana, morros fora dela
  const wall = Math.max(0, d - W.wallAt) ** 1.5 * W.wall;          // serra nas pontas
  let y = swell(z) + (hills + W.lift) * side * side + wall;
  if (W.type === 'deserto') {                                      // dunas: cristas afiadas com o vento de lado
    const s = Math.sin(x * 0.09 + z * F * 3 + W.dph) * 0.5 + 0.5, s2 = Math.sin(x * 0.21 - z * F * 7 + W.dph * 2) * 0.5 + 0.5;
    y += (W.dune * s ** 3 + W.dune * 0.35 * s2 ** 4) * side;
  }
  if (W.type === 'litoral') {                                      // de um lado a serra, do outro a praia descendo para o mar
    if (dx > W.shore) y = Math.min(y, swell(z) - Math.min(W.seaY0 + 4, (dx - W.shore) * 0.35));
    else if (dx < -6) y += Math.max(0, -dx - 6) ** 1.3 * 0.35;
  }
  if (W.type === 'canion') {                                       // paredões em degraus (3 m de parede, 1 m de patamar) e o rio no fundo
    const out = Math.max(0, d - W.floorW), hh = W.cH * Math.min(1, out / W.run) ** 0.8;
    y = swell(z) + Math.floor(hh / 4) * 4 + Math.max(0, (hh % 4) - 3) * 4 + 1.2 * Math.sin(x * 0.3 + z * 0.2) * Math.min(1, out / 3);
    const rv = (x - roadX(z)) * W.rSide - W.rw - 3;
    if (rv > 0 && rv < W.rWidth) y -= 2.6 * Math.sin(rv / W.rWidth * Math.PI) ** 0.5;
  }
  return y;
}

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function newWorld(seed) {
  const r = rng(seed), pick = (a, b) => a + r() * (b - a), ph = () => r() * Math.PI * 2;
  const pool = TYPES.filter(t => t !== lastType), type = pool[Math.floor(r() * pool.length)];
  lastType = type;
  const curvy = type === 'cidade' ? pick(0.1, 0.35) : type === 'mata' ? pick(0.9, 1.6) : pick(0.4, 1.4);
  W = {
    type, rw: type === 'mata' ? 2.2 : type === 'cidade' ? 4.5 : 3.5, marks: type !== 'mata' && type !== 'deserto',
    road: [[pick(6, 20) * curvy, 1, ph(), 0], [pick(2, 8) * curvy, 2 + Math.floor(r() * 3), ph(), 0],
      [pick(1, 4) * curvy, 5 + Math.floor(r() * 4), ph(), 0]],
    swell: [[pick(1, 6), 2, ph(), 0], [pick(0.5, 2.5), 5 + Math.floor(r() * 5), ph(), 0]],
    hills: [[pick(2, 9), 2, ph(), pick(-0.08, 0.08)], [pick(1.5, 5), 4 + Math.floor(r() * 3), ph(), pick(-0.14, 0.14)],
      [pick(0.8, 2.5), 9 + Math.floor(r() * 6), ph(), pick(-0.25, 0.25)]],
    lift: pick(1, 7), valley: pick(8, 22), wallAt: pick(28, 55), wall: pick(0, 0.09),
    trees: Math.floor(pick(140, 460)), pines: pick(0.45, 1),       // quantidade e mistura de árvores
    patch: [[1, 2 + Math.floor(r() * 4), ph(), pick(-0.06, 0.06)], [0.6, 7 + Math.floor(r() * 5), ph(), pick(-0.1, 0.1)]],
    rocks: Math.floor(pick(0, 90)), near: 6.5,
  };
  if (type === 'cidade') Object.assign(W, { hills: [], lift: 0, wall: 0, trees: 60, pines: 0, rocks: 0, swell: W.swell.map(s => [s[0] * 0.25, s[1], s[2], 0]) });
  if (type === 'deserto') Object.assign(W, { trees: 0, rocks: Math.floor(pick(30, 120)), dune: pick(5, 11), dph: ph(), lift: pick(0, 2), wall: 0, cacti: Math.floor(pick(30, 90)) });
  if (type === 'litoral') Object.assign(W, { seaSide: r() < 0.5 ? -1 : 1, shore: pick(9, 16), wall: 0, trees: Math.floor(pick(60, 160)), pines: 0.15,
    swell: W.swell.map(s => [s[0] * 0.3, s[1], s[2], 0]) });
  if (type === 'mata') Object.assign(W, { trees: Math.floor(pick(600, 850)), pines: pick(0.2, 0.7), near: 3.6, patch: [[0.2, 3, 0, 0]], rocks: Math.floor(pick(20, 70)) });
  if (type === 'litoral') W.seaY0 = W.swell.reduce((s, [a]) => s + Math.abs(a), 0) + 1.5;   // o mar fica abaixo de qualquer ponto da estrada
  if (type === 'tr4') Object.assign(W, { rw: 3, marks: false, trees: Math.floor(pick(120, 300)) });   // trilha de terra com a TR4 andando
  if (type === 'fazenda') Object.assign(W, { hills: W.hills.map(([a, f, q, k]) => [a * 0.35, f, q, k]), lift: pick(0, 1.5), wall: 0, trees: 0, rocks: 0 });
  if (type === 'canion') Object.assign(W, { floorW: pick(18, 25), cH: pick(40, 70), run: pick(10, 22), rSide: r() < 0.5 ? -1 : 1, rWidth: pick(5, 8), wall: 0, hills: [], lift: 0,
    trees: Math.floor(pick(20, 60)), pines: 0.2, rocks: Math.floor(pick(80, 160)), near: 5, road: W.road.map(([a, f, q, k]) => [a * 0.6, f, q, k]) });
  return r;
}

// tipos de ponto: 0 chão, 1 estrada, 2 faixa/borda/poste aceso, 3 árvore, 4 água, 5 janela acesa, 11 plantação (6 a 10: a TR4)
// cada ponto leva uma sombra (0..1) pela direção da superfície em relação ao sol: é o que dá relevo à nuvem
const SUN = (() => { const v = [-0.45, 0.8, 0.4], n = Math.hypot(...v); return v.map(c => c / n); })();
const lit = (nx, ny, nz) => { const n = Math.hypot(nx, ny, nz) || 1; return 0.28 + 0.72 * Math.max(0, (nx * SUN[0] + ny * SUN[1] + nz * SUN[2]) / n); };
const slope = (x, z) => lit(ground(x - 0.6, z) - ground(x + 0.6, z), 1.2, ground(x, z - 0.6) - ground(x, z + 0.6));
function buildCloud(seed) {
  const r = newWorld(seed), P = [];
  const add = (x, y, z, k, s = 1) => P.push(x, y, z, k, r(), s);
  const sea = W.type === 'litoral' ? -W.seaY0 : null;
  const water = z => sea != null ? sea : W.type === 'canion' ? swell(z) - 1.1 : null;   // nível do mar ou do rio
  const city = W.type === 'cidade' ? planCity(r) : [];
  const inside = (x, z) => city.some(b => x > b.xa - 0.3 && x < b.xb + 0.3 && z > b.za - 0.3 && z < b.zb + 0.3);   // embaixo da laje o laser não chega
  for (let z = 0; z < L; z += 0.8) {
    for (let x = -75; x <= 75; x += 0.8) {
      const px = x + (r() - 0.5) * 0.7, pz = z + (r() - 0.5) * 0.7;
      if (Math.abs(px - roadX(pz)) < W.rw + 0.1 || (city.length && inside(px, pz))) continue;
      const g = ground(px, pz), wl = water(pz);
      if (wl != null && g < wl + 0.3) { if (r() < 0.85) add(px, wl + 0.3, pz, 4); continue; }   // mar ou rio
      add(px, g + (r() - 0.5) * 0.12, pz, 0, slope(px, pz));
      const g2 = ground(px + 0.8, pz);                                // paredão: preenche a altura entre um ponto e o vizinho
      if (Math.abs(g2 - g) > 1.2) for (let yy = Math.min(g, g2) + 0.6; yy < Math.max(g, g2); yy += 0.6) add(px + 0.4 + (r() - 0.5) * 0.3, yy, pz, 0, lit(g - g2, 0.4, 0));
    }
  }
  for (let z = 0; z < L; z += 0.4) {
    const c = roadX(z);
    for (let d = -W.rw; d <= W.rw; d += 0.4) {
      const x = c + d + (r() - 0.5) * 0.18, edge = W.marks && Math.abs(Math.abs(d) - (W.rw - 0.3)) < 0.22;
      const dash = W.marks && Math.abs(d) < 0.2 && z % 9 < 4.5;
      add(x, ground(x, z) + 0.05, z, edge || dash ? 2 : W.type === 'mata' || W.type === 'deserto' ? 0 : 1, slope(x, z));   // trilha de terra não tem faixa
    }
  }
  if (city.length) drawCity(r, add, city);
  if (W.type === 'fazenda') buildFarm(r, add);
  for (let i = 0, tries = 0; i < W.trees && tries < W.trees * 6; tries++) {
    const z = r() * L, sd = r() < 0.5 ? -1 : 1, x = roadX(z) + sd * (W.near + r() ** 1.6 * (W.type === 'cidade' ? 1.5 : 60));
    if (Math.abs(x) > 75 || wave(W.patch, z, x) < r() * 1.6 - 0.8) continue;   // mata em manchas, com clareiras
    if (water(z) != null && ground(x, z) < water(z) + 1) continue;
    i++;
    const base = ground(x, z), H = 6 + r() * 8;
    for (let k = 0; k < 18; k++) add(x + (r() - 0.5) * 0.3, base + r() * H * 0.25, z + (r() - 0.5) * 0.3, 3, 0.45);
    if (r() < W.pines) {                                             // pinheiro em camadas
      const R = H * (0.24 + r() * 0.08), n = 100 + H * 11;
      for (let k = 0; k < n; k++) {
        const v = r(), tier = 0.62 + 0.38 * ((v * 5) % 1);
        const rad = R * (1 - v) * tier * (0.75 + r() * 0.25), a = r() * Math.PI * 2;
        add(x + Math.cos(a) * rad, base + H * (0.18 + v * 0.82), z + Math.sin(a) * rad, 3, lit(Math.cos(a), 0.7, Math.sin(a)));
      }
    } else {                                                         // árvore de copa redonda
      const R = H * (0.3 + r() * 0.12), cy = base + H * 0.7, n = 120 + H * 10;
      for (let k = 0; k < n; k++) {
        const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u), rr = R * (0.8 + r() * 0.25);
        add(x + Math.cos(a) * q * rr, cy + u * rr * 0.8, z + Math.sin(a) * q * rr, 3, lit(Math.cos(a) * q, u, Math.sin(a) * q));
      }
    }
  }
  for (let i = 0; i < (W.cacti || 0); i++) {                         // cactos: tronco e dois braços
    const z = r() * L, x = roadX(z) + (r() < 0.5 ? -1 : 1) * (5 + r() * 50), base = ground(x, z), H = 2.5 + r() * 3;
    for (let k = 0; k < 60 * H; k++) { const a = r() * Math.PI * 2, y = r() * H; add(x + Math.cos(a) * 0.3, base + y, z + Math.sin(a) * 0.3, 3, lit(Math.cos(a), 0.2, Math.sin(a))); }
    for (const s of [-1, 1]) {
      const ay = base + H * (0.35 + r() * 0.3), ah = H * (0.25 + r() * 0.25);
      for (let k = 0; k < 40; k++) { const u = r(); add(x + s * (0.3 + Math.min(u * 2, 1) * 0.7), ay + Math.max(0, u * 2 - 1) * ah, z + (r() - 0.5) * 0.4, 3, lit(s, 0.4, 0)); }
    }
  }
  for (let i = 0; i < W.rocks; i++) {                                // pedras soltas
    const z = r() * L, x = roadX(z) + (r() < 0.5 ? -1 : 1) * (5 + r() * 40), R = 0.6 + r() * 1.8, base = ground(x, z);
    if (water(z) != null && base < water(z) + 0.5) continue;
    if (city.length && inside(x, z)) continue;
    for (let k = 0; k < 45 * R; k++) {
      const u = r(), a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      add(x + Math.cos(a) * q * R * 1.3, base + u * R * 0.7, z + Math.sin(a) * q * R, 0, lit(Math.cos(a) * q, u, Math.sin(a) * q));
    }
  }
  return new Float32Array(P);
}

// cidade: quarteirões dos dois lados da avenida, prédios de alturas variadas com janelas acesas e postes.
// Primeiro sorteia onde ficam os prédios (para o chão não ter pontos embaixo deles), depois desenha.
function planCity(r) {
  const list = [];
  for (const sd of [-1, 1]) {
    for (let z = 2; z < L - 12; ) {
      const fw = 8 + r() * 10, fd = 8 + r() * 12, H = r() < 0.15 ? 35 + r() * 30 : 6 + r() * 26;
      const zc = z + fw / 2, off = W.rw + 5 + r() * 4, x0 = roadX(zc) + sd * off, x1 = x0 + sd * fd;
      list.push({ xa: Math.min(x0, x1), xb: Math.max(x0, x1), za: z, zb: z + fw, H, base: ground(x0, zc), sd });
      z += fw + 3 + r() * 8;
    }
  }
  return list;
}
function drawCity(r, add, list) {
  for (const { xa, xb, za, zb, H, base } of list) {
    const mx = (xa + xb) / 2, mz = (za + zb) / 2;
    const wall = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 0.8);
      let nx = bz - az, nz = -(bx - ax);                              // normal da parede, virada para fora do prédio
      if (nx * ((ax + bx) / 2 - mx) + nz * ((az + bz) / 2 - mz) < 0) { nx = -nx; nz = -nz; }
      const s = lit(nx, 0, nz);
      for (let i = 0; i <= n; i++) for (let y = 0; y <= H; y += 0.8) {
        const u = i / n, on = i % 3 === 1 && y % 3 > 1.2 && r() < 0.35;
        if (r() < (on ? 1 : 0.6)) add(ax + (bx - ax) * u, base + y, az + (bz - az) * u, on ? 5 : 0, s);
      }
    };
    wall(xa, za, xb, za); wall(xb, za, xb, zb); wall(xb, zb, xa, zb); wall(xa, zb, xa, za);
    for (let x = xa; x <= xb; x += 0.9) for (let zz = za; zz <= zb; zz += 0.9) add(x, base + H, zz, 0, lit(0, 1, 0));   // laje
  }
  for (const sd of [-1, 1]) for (let z = 5; z < L; z += 22) {          // postes com a luz acesa
    const x = roadX(z) + sd * (W.rw + 1.2), base = ground(x, z);
    for (let y = 0; y < 7; y += 0.3) add(x, base + y, z, 1, 0.6);
    for (let k = 0; k < 14; k++) add(x - sd * (r() * 1.2), base + 7 + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.4, 2);
  }
}
// fazenda: cerca na beira da estrada, talhões de milho em fileiras, terra arada, pivôs centrais e a sede com silos
function buildFarm(r, add) {
  const yardSide = r() < 0.5 ? -1 : 1;
  let yardDone = false, pivots = 0;
  for (const sd of [-1, 1]) {
    for (let z = 0; z < L; z += 3) { const x = roadX(z) + sd * (W.rw + 2.5), b = ground(x, z); for (let y = 0; y < 1.3; y += 0.16) add(x, b + y, z, 0, 0.55); }   // mourões
    for (let z = 0; z < L; z += 0.3) for (const hy of [0.6, 1.1]) { const x = roadX(z) + sd * (W.rw + 2.5); add(x, ground(x, z) + hy, z, 0, 0.75); }   // arame
    for (let z0 = 2; z0 < L - 30; ) {
      const len = Math.min(L - 4 - z0, 55 + r() * 45), x0 = W.rw + 6, pick = r();
      if (sd === yardSide && !yardDone && z0 > 40) { farmYard(r, add, sd, z0 + len / 2); yardDone = true; }
      else if ((pick < 0.4 || !pivots) && len > 56) { pivot(r, add, sd, z0, len, x0); pivots++; }   // pelo menos um pivô por fazenda
      else if (pick < 0.8) {                                       // milho em fileiras
        const hC = 1.4 + r() * 1.2;
        for (let off = x0; off < 72; off += 1.5) for (let z = z0; z < z0 + len; z += 0.5) {
          const x = roadX(z) + sd * off, b = ground(x, z), hh = hC * (0.85 + 0.3 * r());
          add(x + (r() - 0.5) * 0.25, b + hh, z, 11, lit(sd * 0.25, 1, (r() - 0.5) * 0.4));
          if (r() < 0.35) add(x, b + hh * 0.5, z, 11, 0.45);
        }
      }                                                            // senão: terra arada (só o chão)
      z0 += len + 4;
    }
  }
}
// pivô central: círculo de plantação em anéis, o braço de irrigação com torres e a torre do centro
function pivot(r, add, sd, z0, len, x0) {
  const R = Math.min(len / 2 - 2, 30), zc = z0 + len / 2, xc = roadX(zc) + sd * (x0 + R + 2);
  for (let rr = 2; rr < R; rr += 1.3) for (let a = 0; a < Math.PI * 2; a += 0.6 / rr) {
    const x = xc + Math.cos(a) * rr, z = zc + Math.sin(a) * rr;
    add(x, ground(x, z) + 0.55 + r() * 0.2, z, 11, lit(0, 1, 0) * (0.85 + 0.15 * Math.sin(rr * 1.7)));
  }
  const th = r() * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th);
  for (let s = 0; s <= R; s += 0.22) {                             // braço em treliça
    const x = xc + ca * s, z = zc + sa * s, b = ground(x, z), sag = 0.35 * Math.sin((s % 7) / 7 * Math.PI);
    add(x, b + 3.6 - sag, z, 2); add(x, b + 3.0 - sag * 0.6, z, 2);
    if (s % 1.1 < 0.22) for (let y = 3.0; y < 3.6; y += 0.15) add(x, b + y - sag * 0.8, z, 2);
  }
  for (let s = 7; s <= R; s += 7) {                                // torres com rodas
    const x = xc + ca * s, z = zc + sa * s, b = ground(x, z);
    for (let y = 0; y < 3.6; y += 0.2) { add(x - sa * 0.5 * (1 - y / 3.6), b + y, z + ca * 0.5 * (1 - y / 3.6), 0, 0.8); add(x + sa * 0.5 * (1 - y / 3.6), b + y, z - ca * 0.5 * (1 - y / 3.6), 0, 0.8); }
  }
  for (let y = 0; y < 4.6; y += 0.15) for (let a = 0; a < 6.28; a += 1.05) add(xc + Math.cos(a) * 0.4, ground(xc, zc) + y, zc + Math.sin(a) * 0.4, 0, lit(Math.cos(a), 0.3, Math.sin(a)));
}
// sede: galpão com telhado de duas águas, três silos e algumas árvores
function farmYard(r, add, sd, zc) {
  const xc = roadX(zc) + sd * (W.rw + 16), b = ground(xc, zc), hw = 6, hl = 9, H = 5, R = 3.4;
  for (let z = -hl; z <= hl; z += 0.45) for (let y = 0; y <= H; y += 0.45) for (const s of [-1, 1]) add(xc + s * hw, b + y, zc + z, 0, lit(s, 0, 0));
  for (let x = -hw; x <= hw; x += 0.45) for (const s of [-1, 1]) {
    const top = H + R * (1 - Math.abs(x) / hw);                    // oitão: a parede sobe até a cumeeira
    for (let y = 0; y <= top; y += 0.45) add(xc + x, b + y, zc + s * hl, 0, lit(0, 0, s));
  }
  for (let x = -hw - 0.5; x <= hw + 0.5; x += 0.4) for (let z = -hl - 0.5; z <= hl + 0.5; z += 0.4)
    add(xc + x, b + H + R * (1 - Math.abs(x) / hw), zc + z, 0, lit(-Math.sign(x) * 0.6, 1, 0));
  for (let k = 0; k < 3; k++) {                                    // silos
    const sx = xc + sd * 13, sz = zc - 8 + k * 6.5, sb = ground(sx, sz), sr = 2.3, sh = 9 + k;
    for (let a = 0; a < Math.PI * 2; a += 0.14) for (let y = 0; y <= sh; y += 0.45) add(sx + Math.cos(a) * sr, sb + y, sz + Math.sin(a) * sr, 0, lit(Math.cos(a), 0, Math.sin(a)));
    for (let u = 0; u < 1; u += 0.08) for (let a = 0; a < Math.PI * 2; a += 0.25 / Math.max(0.2, Math.cos(u * 1.4))) {
      const rr = sr * Math.cos(u * Math.PI / 2), y = sh + sr * 0.8 * Math.sin(u * Math.PI / 2);
      add(sx + Math.cos(a) * rr, sb + y, sz + Math.sin(a) * rr, 0, lit(Math.cos(a) * (1 - u), u + 0.2, Math.sin(a) * (1 - u)));
    }
  }
  for (let k = 0; k < 6; k++) {                                    // árvores da sede
    const tz = zc - 14 + k * 5.5, tx = xc - sd * 9 + (r() - 0.5) * 3, tb = ground(tx, tz), Rr = 2.8 + r() * 1.5, cy = tb + 6 + r() * 2;
    for (let i = 0; i < 260; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u); add(tx + Math.cos(a) * q * Rr, cy + u * Rr * 0.8, tz + Math.sin(a) * q * Rr, 3, lit(Math.cos(a) * q, u, Math.sin(a) * q)); }
    for (let y = 0; y < cy - tb; y += 0.25) add(tx, tb + y, tz, 3, 0.45);
  }
}

// a TR4 em pontos, no sistema do carro (x para o lado, y para cima, z para a frente; origem no chão entre as rodas).
// Perfil tirado do desenho das Aventuras (mesmo contorno), com a altura acertada para 1,76 m.
// tipos: 6 roda (gira), 7 lataria, 8 vidro, 9 lanterna, 10 pneu parado (estepe, rack), 2 farol
function buildCar() {
  const P = [], add = (x, y, z, k, s) => P.push(x, y, z, k, Math.random(), s);
  const SZ = 0.0435, SY = 0.031, HW = 0.86;                        // unidades do desenho → metros
  const prof = [[-36.7, -12], [-41.2, -12], [-43.7, -14.2], [-43.9, -20.6], [-42.1, -21.4], [-41.5, -24], [-40.8, -40], [-37.5, -52], [-33, -55.4],
    [14, -56.5], [18.3, -56.3], [26.9, -39.5], [43, -36.4], [46.6, -26.5], [48, -25], [48, -18.5], [41, -13.3], [37, -12.7], [36, -12.6]].map(([u, v]) => [u * SZ, -v * SY]);
  const inPoly = (z, y) => { let c = false; for (let i = 0, j = prof.length - 1; i < prof.length; j = i++) { const [zi, yi] = prof[i], [zj, yj] = prof[j]; if ((yi > y) !== (yj > y) && z < (zj - zi) * (y - yi) / (yj - yi) + zi) c = !c; } return c; };
  const glassAt = (z, y) => y > 39.5 * SY && y < 52 * SY && z > -34 * SZ && z < 22 * SZ - (y - 39.5 * SY) * 0.6 && !(Math.abs(z + 20.4 * SZ) < 0.06) && !(Math.abs(z - 0.6 * SZ) < 0.05);
  for (let z = -2; z <= 2.15; z += 0.075) for (let y = 0.3; y <= 1.8; y += 0.075) if (inPoly(z, y)) for (const s of [-1, 1]) add(s * HW, y, z, glassAt(z, y) ? 8 : 7, lit(s, 0.25, 0));
  for (let i = 0; i < prof.length; i++) {                          // teto, capô, frente e traseira: o contorno estendido na largura
    const [z0, y0] = prof[i], [z1, y1] = prof[(i + 1) % prof.length], len = Math.hypot(z1 - z0, y1 - y0);
    if (y0 < 0.6 && y1 < 0.6) continue;                            // o assoalho não aparece
    const nz = y1 - y0, ny = -(z1 - z0), glass = (i === 6 || i === 7 || i === 10);   // vidro traseiro e para-brisa
    for (let u = 0; u < len; u += 0.07) for (let x = -HW + 0.04; x <= HW - 0.04; x += 0.08) {
      const t = u / len; add(x, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, glass ? 8 : 7, lit(0, -ny, -nz));
    }
  }
  for (const zw of [-1.11, 1.11]) for (const xs of [-1, 1]) {      // rodas: banda do pneu e o aro com raios
    for (let a = 0; a < Math.PI * 2; a += 0.07) for (let w = 0; w <= 0.24; w += 0.06) add(xs * (0.72 + w), 0.36 + Math.sin(a) * 0.36, zw + Math.cos(a) * 0.36, 6, lit(0, Math.sin(a), Math.cos(a)));
    for (let a = 0; a < Math.PI * 2; a += 0.12) add(xs * 0.97, 0.36 + Math.sin(a) * 0.22, zw + Math.cos(a) * 0.22, 6, lit(xs, 0.3, 0));
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; for (let rr = 0.04; rr < 0.22; rr += 0.035) add(xs * 0.97, 0.36 + Math.sin(a) * rr, zw + Math.cos(a) * rr, 6, 0.9); }
  }
  for (let a = 0; a < Math.PI * 2; a += 0.08) for (let rr = 0.2; rr <= 0.36; rr += 0.08) add(Math.cos(a) * rr, 0.93 + Math.sin(a) * rr, -1.97, 10, 0.7);   // estepe na tampa
  for (let z = -1.45; z <= 0.75; z += 0.06) for (const xs of [-0.62, 0.62]) add(xs, 1.8, z, 10, 0.8);   // rack do teto
  for (const xs of [-0.62, 0.62]) for (let k = 0; k < 30; k++) add(xs + (Math.random() - 0.5) * 0.22, 1.0 + (Math.random() - 0.5) * 0.12, 2.06, 2, 1);   // faróis
  for (const xs of [-0.8, 0.8]) for (let k = 0; k < 24; k++) add(xs, 0.72 + Math.random() * 0.22, -1.9 + (Math.random() - 0.5) * 0.08, 9, 1);           // lanternas
  return new Float32Array(P);
}

const VS = `
attribute vec3 pos; attribute float kind; attribute float seed; attribute float shade;
uniform vec3 cam; uniform vec2 rot; uniform float pitch, fy, aspect, px, time, front, beam, back, mode;
uniform vec4 model; uniform vec3 wheel;                         // carro: posição e rumo; giro das rodas, balanço e arfagem
varying vec3 vCol; varying float vA;
vec3 turbo(float x) {
  x = clamp(x, 0.0, 1.0);
  vec4 v4 = vec4(1.0, x, x * x, x * x * x); vec2 v2 = v4.zw * v4.z;
  return vec3(
    dot(v4, vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234)) + dot(v2, vec2(-152.94239396, 59.28637943)),
    dot(v4, vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333)) + dot(v2, vec2(4.27729857, 2.82956604)),
    dot(v4, vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771)) + dot(v2, vec2(-89.90310912, 27.34824973)));
}
void main() {
  vec3 wp = pos;
  if (mode > 0.5) {                                                // ponto da TR4: sistema do carro → mundo
    vec3 q = pos;
    if (kind == 6.0) {                                             // roda girando em volta do eixo
      float az = q.z > 0.0 ? 1.11 : -1.11, cr = cos(wheel.x), sr = sin(wheel.x);
      vec2 v = vec2(q.z - az, q.y - 0.36);
      q.z = az + v.x * cr + v.y * sr; q.y = 0.36 - v.x * sr + v.y * cr;
    } else {                                                       // lataria na suspensão: sobe, desce e arfa
      float cq = cos(wheel.z), sq = sin(wheel.z), yy = q.y - 0.6;
      q.y = 0.6 + yy * cq + q.z * sq + wheel.y; q.z = q.z * cq - yy * sq;
    }
    float cy = cos(model.w), sy = sin(model.w);
    wp = vec3(model.x + q.x * cy + q.z * sy, model.y + q.y, model.z - q.x * sy + q.z * cy);
  }
  float wy = kind == 4.0 ? 0.25 * sin(wp.x * 0.35 + wp.z * 0.25 + time * 1.6) : 0.0;   // ondas do mar
  vec3 p = vec3(wp.x - cam.x, wp.y + wy - cam.y, mod(wp.z - cam.z + back, ${L}.0) - back);
  vec3 c = vec3(p.x * rot.x - p.z * rot.y, p.y, p.x * rot.y + p.z * rot.x);
  float cp = cos(pitch), sp = sin(pitch);
  float zc = -c.y * sp + c.z * cp, yc = c.y * cp + c.z * sp;
  // profundidade de verdade (perto 0,5 m, longe 200 m): o que está na frente esconde o que está atrás
  gl_Position = vec4(c.x * fy / aspect, yc * fy, (zc * 200.5 - 200.0) / 199.5, zc);
  float fog = 1.0 - smoothstep(60.0, 150.0, zc);
  float near = smoothstep(1.5, 8.0, zc);
  float h = (wp.y + 2.0) / 26.0;
  vec3 col = turbo(0.08 + h * 0.85);
  if (kind == 1.0) col = vec3(0.32, 0.36, 0.42);
  if (kind == 2.0) col = vec3(1.0, 0.95, 0.8);
  if (kind == 4.0) col = mix(vec3(0.0, 0.3, 0.8), vec3(0.55, 0.95, 1.0), pow(0.5 + 0.5 * sin(pos.x * 0.5 + pos.z * 0.35 - time * 2.0), 6.0));   // mar: azul com a crista das ondas brilhando
  if (kind == 5.0) col = vec3(1.0, 0.78, 0.35);
  if (kind == 6.0 || kind == 10.0) col = vec3(0.24, 0.26, 0.3);   // pneus
  if (kind == 7.0) col = vec3(1.0, 0.55, 0.12);                   // lataria laranja do painel
  if (kind == 8.0) col = vec3(0.28, 0.6, 0.8);                    // vidros
  if (kind == 9.0) col = vec3(1.0, 0.12, 0.08);                   // lanternas
  if (kind == 11.0) col = mix(vec3(0.2, 0.6, 0.15), vec3(0.75, 0.85, 0.28), fract(seed * 7.0));   // plantação
  float built = front - p.z;                                       // só existe o que o laser já varreu
  float fresh = exp(-built / 1.2);                                 // recém-escaneado brilha e assenta
  float laser = exp(-pow((p.z - beam) / 0.7, 2.0));                // a faixa do laser agora
  float flick = 0.94 + 0.06 * sin(seed * 91.0 + time * 4.0);
  float lightK = kind == 2.0 || kind == 4.0 || kind == 5.0 || kind == 9.0 ? 1.0 : shade;   // relevo: face virada para o sol mais clara
  vCol = mix(col * lightK * flick, vec3(0.8, 1.0, 1.0), fresh * 0.25) + vec3(1.0, 0.15, 0.2) * laser * 1.6;
  vA = fog * near;                                                // some na neblina ao longe e perto da câmera
  gl_PointSize = zc > 0.5 && built > 0.0 ? clamp(px * 0.46 / zc * (1.0 + fresh * 0.5), 1.5, 5.0) : 0.0;
}`;
const FS = `
precision mediump float;
varying vec3 vCol; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5 || vA < 0.02) discard;
  gl_FragColor = vec4(mix(vec3(0.004, 0.012, 0.028), vCol * (1.0 - d * 0.6), vA), 1.0);   // ponto sólido, borda um pouco mais escura
}`;

let gl = null, glCanvas = null, prog = null, count = 0, U = {}, failed = false, worldBuf = null, carBuf = null, carCount = 0, locs = [];
let built = 0, lastT = Infinity, lastSeg = -1;                     // até onde a nuvem já foi construída
const SCAN = 24;                                                   // segundos de cada mundo escaneado
function init() {
  glCanvas = document.createElement('canvas');
  gl = glCanvas.getContext('webgl', { antialias: false, alpha: false, depth: true, preserveDrawingBuffer: true });
  if (!gl) { failed = true; return; }
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  locs = [['pos', 3, 0], ['kind', 1, 3], ['seed', 1, 4], ['shade', 1, 5]].map(([name, n, off]) => {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    return [loc, n, off];
  });
  worldBuf = gl.createBuffer(); carBuf = gl.createBuffer();
  const car = buildCar(); carCount = car.length / 6;
  gl.bindBuffer(gl.ARRAY_BUFFER, carBuf); gl.bufferData(gl.ARRAY_BUFFER, car, gl.STATIC_DRAW);
  for (const u of ['cam', 'rot', 'pitch', 'fy', 'aspect', 'px', 'time', 'front', 'beam', 'back', 'mode', 'model', 'wheel']) U[u] = gl.getUniformLocation(prog, u);
  gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);   // pontos sólidos com profundidade: dá forma aos objetos
}

export function drone(ctx, w, h, tt, color) {
  if (!gl && !failed) { try { init(); } catch (e) { console.warn('lidar', e); failed = true; } }
  ctx.fillStyle = '#010307'; ctx.fillRect(0, 0, w, h);
  if (failed) return;
  const CW = ctx.canvas.width, CH = ctx.canvas.height;
  if (glCanvas.width !== CW || glCanvas.height !== CH) { glCanvas.width = CW; glCanvas.height = CH; }
  gl.viewport(0, 0, CW, CH);
  gl.clearColor(0.004, 0.012, 0.028, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (tt >= SCAN && tt >= lastT) return true;                      // um mundo inteiro por vez: avisa o player que acabou
  const seg = Math.floor(tt / SCAN), t = tt - seg * SCAN;
  if (tt < lastT || seg !== lastSeg) {                              // começou ou passou o tempo: mundo novo, nuvem vazia
    lastSeg = seg;
    const data = buildCloud(Math.floor(Math.random() * 1e9));
    count = data.length / 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, worldBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    built = 0;
  }
  lastT = tt;
  const z = t * 11, look = z + 25;
  let cx = roadX(z) * 0.85 + Math.sin(t * 0.13) * 4;                 // segue a estrada, meio de lado
  let yaw = Math.atan2(roadX(look) - cx, look - z) * 0.8;
  let alt = 21 + Math.sin(t * 0.21) * 3;
  let cy = Math.max(ground(cx, z), swell(z)) + alt, cz = z;
  let pitch = 0.3 + Math.sin(t * 0.17) * 0.04, orbit = 0, car = null;
  if (W.type === 'tr4') {                                          // a TR4 vai 18 m à frente; no meio da varredura o drone dá a volta nela
    const kz = z + 18, kx = roadX(kz), ky = ground(kx, kz), kyaw = Math.atan2(roadX(kz + 2) - roadX(kz - 2), 4);
    car = { kx, ky, kz, kyaw };
    alt = 11 + Math.sin(t * 0.21) * 1.5; cx = roadX(z) * 0.9; cy = Math.max(ground(cx, z), swell(z)) + alt;
    orbit = Math.min(1, Math.max(0, (t - 10.5) / 2)) * (1 - Math.min(1, Math.max(0, (t - 17.5) / 2)));
    orbit = orbit * orbit * (3 - 2 * orbit);
    const a = (t - 10.5) / 9 * Math.PI * 2, ox = kx - 10 * Math.sin(kyaw + a), oz = kz - 10 * Math.cos(kyaw + a), oy = ky + 4.5;
    cx += (ox - cx) * orbit; cz += (oz - cz) * orbit; cy += (oy - cy) * orbit;
    yaw = Math.atan2(kx - cx, kz - cz);
    pitch = Math.atan2(cy - ky - 0.8, Math.hypot(kx - cx, kz - cz)) - 0.1;
  }
  gl.uniform3f(U.cam, cx, cy, cz);
  gl.uniform2f(U.rot, Math.cos(yaw), Math.sin(yaw));
  gl.uniform1f(U.pitch, pitch);
  gl.uniform1f(U.fy, 1 / Math.tan(0.36));
  gl.uniform1f(U.aspect, CW / CH);
  gl.uniform1f(U.px, CH);
  gl.uniform1f(U.time, t);
  gl.uniform1f(U.back, 30 + 110 * orbit);                          // dando a volta o drone olha para trás: mostra o que já passou
  // o laser vai e volta à frente do drone; quando passa além do já varrido, constrói mais nuvem
  const reach = 4 + 116 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 9));
  built = Math.max(built, z + reach);
  gl.uniform1f(U.front, built - cz);
  gl.uniform1f(U.beam, reach + z - cz);
  const draw = (buf, n) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (const [loc, k, off] of locs) gl.vertexAttribPointer(loc, k, gl.FLOAT, false, 24, off * 4);
    gl.drawArrays(gl.POINTS, 0, n);
  };
  gl.uniform1f(U.mode, 0);
  draw(worldBuf, count);
  if (car) {
    gl.uniform1f(U.mode, 1);
    gl.uniform4f(U.model, car.kx, car.ky, car.kz, car.kyaw);
    gl.uniform3f(U.wheel, car.kz / 0.36, Math.sin(t * 7.3) * 0.025 + Math.sin(t * 2.1) * 0.02, Math.sin(t * 3.1) * 0.012);
    draw(carBuf, carCount);
  }
  ctx.drawImage(glCanvas, 0, 0, w, h);
  laserLine(ctx, w, h, { cx, cy, z: cz, yaw, pitch }, z + reach);
  hud(ctx, w, h, t, color, alt, yaw);
}

drone.untilDone = true;                                            // no standby vai até o fim do mundo escaneado, não por tempo

// mesma projeção do shader, para desenhar a linha do laser no chão
function laserLine(ctx, w, h, cam, zz) {
  const cr = Math.cos(cam.yaw), sr = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const fy = 1 / Math.tan(0.36), fx = fy * h / w;
  const pts = [];
  for (let x = -75; x <= 75; x += 1.5) {
    const px = x - cam.cx, py = ground(x, zz) - cam.cy, pz = zz - cam.z;
    const X = px * cr - pz * sr, Z = px * sr + pz * cr;
    const zc = -py * sp + Z * cp, yc = py * cp + Z * sp;
    if (zc > 0.5) pts.push([w / 2 + X * fx / zc * w / 2, h / 2 - yc * fy / zc * h / 2]);
  }
  if (pts.length < 2) return;
  const fade = 1 - Math.min(1, Math.max(0, (zz - cam.z - 60) / 90));
  const top = [w / 2, -h * 0.15];                                     // o drone fica logo acima da tela
  ctx.fillStyle = '#ff2a3a'; ctx.globalAlpha = 0.03 * fade;           // leque do laser
  ctx.beginPath(); ctx.moveTo(...top); pts.forEach(p => ctx.lineTo(...p)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ff3b48'; ctx.lineWidth = 2; ctx.globalAlpha = 0.9 * fade;
  ctx.shadowColor = '#ff2a3a'; ctx.shadowBlur = 10;
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke();
  ctx.strokeStyle = '#ffd6da'; ctx.lineWidth = 0.8; ctx.shadowBlur = 0; ctx.stroke();
  ctx.globalAlpha = 1;
}

function hud(ctx, w, h, t, color, alt, yaw) {
  // moldura e informações nas bordas da tela; em cima, cada lado desce só o que o canto arredondado da moldura pede
  const mx = w * 0.02, b = h * 0.12, fs = Math.max(10, h * 0.075), pad = h * 0.03, tw = fs * 9;
  const myL = Math.max(h * 0.03, livre(mx, mx + tw)[0]), myR = Math.max(h * 0.03, livre(w - mx - tw, w - mx)[0]);
  const myB = h - Math.min(h * 0.97, livre(mx, w - mx)[1]), relR = livre(w - mx - tw, w - mx)[2], myBR = relR ? h - relR.t : myB;   // no standby, o REC fica acima do relógio
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
  for (const [x, y, sx, sy] of [[mx, myL, 1, 1], [w - mx, myR, -1, 1], [mx, h - myB, 1, -1], [w - mx, h - myBR, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * b); ctx.lineTo(x, y); ctx.lineTo(x + sx * b, y); ctx.stroke();
  }
  const cx = w / 2, cy = h / 2, r = h * 0.06;                        // mira
  ctx.strokeStyle = '#d8f6ff'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r * 2, cy); ctx.lineTo(cx - r * 0.6, cy); ctx.moveTo(cx + r * 0.6, cy); ctx.lineTo(cx + r * 2, cy);
  ctx.moveTo(cx, cy - r * 1.4); ctx.lineTo(cx, cy - r * 0.6); ctx.moveTo(cx, cy + r * 0.6); ctx.lineTo(cx, cy + r * 1.4);
  ctx.stroke();
  ctx.globalAlpha = 0.9; ctx.fillStyle = '#d8f6ff';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 6;                       // texto legível sobre os pontos
  ctx.font = `${fs}px monospace`; ctx.textBaseline = 'top';
  const hdg = ((Math.round(yaw * 57.3 + 312) % 360) + 360) % 360;
  ctx.textAlign = 'left';
  ctx.fillText(`ALT ${alt.toFixed(1).replace('.', ',')} m`, mx + pad, myL + pad);
  ctx.fillText(`VEL 40 km/h`, mx + pad, myL + pad + fs * 1.3);
  ctx.fillText(`RUMO ${String(hdg).padStart(3, '0')}°`, mx + pad, myL + pad + fs * 2.6);
  ctx.textAlign = 'right';
  ctx.fillText(`LIDAR · ${TYPE_NAME[W.type]}`, w - mx - pad, myR + pad);
  ctx.fillText(`${(1.2 + t * 0.047).toFixed(2).replace('.', ',')} M pts`, w - mx - pad, myR + pad + fs * 1.3);
  if (Math.sin(t * 5) > 0) {
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(w - mx - pad - fs * 3.2, h - myBR - pad - fs * 0.45, fs * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#d8f6ff'; ctx.textBaseline = 'bottom';
  ctx.fillText('REC', w - mx - pad, h - myBR - pad);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic';
}
