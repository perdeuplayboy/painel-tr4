// Protetores de tela 3D dos anos 90, refeitos do zero em WebGL (homenagem nostálgica, com desenho próprio):
// canos coloridos crescendo numa grade e um labirinto de tijolos visto em primeira pessoa.

const TAU = Math.PI * 2;

// ---------- matrizes 4x4 (coluna por coluna, como o WebGL espera) ----------
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz);
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
}
function mul(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    o[i * 4 + j] = s;
  }
  return o;
}

// cada protetor tem sua própria tela WebGL escondida, copiada para o canvas do player
function makeGL(vs, fs, attrs) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const stride = attrs.reduce((s, [, n]) => s + n, 0) * 4;
  const bind = () => {
    let off = 0;
    for (const [name, n] of attrs) {
      const l = gl.getAttribLocation(prog, name);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, stride, off); }
      off += n * 4;
    }
  };
  const u = name => gl.getUniformLocation(prog, name);
  return { canvas, gl, prog, bind, u };
}
function fit(G, ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (G.canvas.width !== W || G.canvas.height !== H) { G.canvas.width = W; G.canvas.height = H; }
  G.gl.viewport(0, 0, W, H);
  return W / H;
}

// ---------- Canos 3D ----------
const PIPE_VS = `
attribute vec3 pos, nrm, col;
uniform mat4 mvp;
varying vec3 vN, vC, vP;
void main() { vN = nrm; vC = col; vP = pos; gl_Position = mvp * vec4(pos, 1.0); }`;
const PIPE_FS = `
precision mediump float;
uniform vec3 eye;
varying vec3 vN, vC, vP;
void main() {
  vec3 n = normalize(vN), L = normalize(vec3(-0.4, 0.6, 0.7)), V = normalize(eye - vP);
  float dif = max(dot(n, L), 0.0), spec = pow(max(dot(reflect(-L, n), V), 0.0), 40.0);
  gl_FragColor = vec4(vC * (0.22 + 0.85 * dif) + vec3(0.9) * spec, 1.0);
}`;
const PIPE_COLORS = [[0.9, 0.1, 0.1], [0.1, 0.75, 0.15], [0.15, 0.3, 0.95], [0.95, 0.85, 0.1], [0.9, 0.2, 0.9],
  [0.1, 0.85, 0.85], [0.95, 0.5, 0.1], [0.85, 0.85, 0.85]];
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const MAXV = 260000;                                                 // vértices que cabem até a tela encher
let P = null;
function pipeReset(aspect) {
  const R = Math.random, NY = 6 + Math.floor(R() * 3), NZ = 5 + Math.floor(R() * 4), NX = Math.max(8, Math.round(NY * aspect * 1.05));
  Object.assign(P, { NX, NY, NZ, used: new Uint8Array(NX * NY * NZ), n: 0, pipes: [], acc: 0, started: 0, aspect,
    rad: 0.15 + R() * 0.1, many: 1 + Math.floor(R() * 3), turn: 0.15 + R() * 0.3, speed: 0.03 + R() * 0.04 });   // cada tela sai diferente
}
function pipeAdd(v) {
  if (P.n + v.length / 9 > MAXV) return false;
  P.gl.bufferSubData(P.gl.ARRAY_BUFFER, P.n * 36, new Float32Array(v));
  P.n += v.length / 9;
  return true;
}
const cellPos = (c) => [c[0] - (P.NX - 1) / 2, c[1] - (P.NY - 1) / 2, c[2] - (P.NZ - 1) / 2];
function cylinder(a, b, r, col) {                                    // tubo reto entre dois centros de célula
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const u = Math.abs(d[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0];
  const p = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const q = [d[1] * p[2] - d[2] * p[1], d[2] * p[0] - d[0] * p[2], d[0] * p[1] - d[1] * p[0]];
  const v = [], seg = 14;
  for (let i = 0; i < seg; i++) {
    const ring = [i, i + 1].map(k => { const t = k / seg * TAU, c = Math.cos(t), s = Math.sin(t); return [p[0] * c + q[0] * s, p[1] * c + q[1] * s, p[2] * c + q[2] * s]; });
    const [n0, n1] = ring, P0 = [a, n0], P1 = [b, n0], P2 = [b, n1], P3 = [a, n1];
    for (const [o, n] of [P0, P1, P2, P0, P2, P3]) v.push(o[0] + n[0] * r, o[1] + n[1] * r, o[2] + n[2] * r, ...n, ...col);
  }
  return v;
}
function sphere(o, r, col) {                                         // bola da junta
  const v = [], la = 9, lo = 14, pt = (i, j) => {
    const th = i / la * Math.PI, ph = j / lo * TAU;
    return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
  };
  for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) {
    for (const n of [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j), pt(i + 1, j + 1), pt(i, j + 1)]) v.push(o[0] + n[0] * r, o[1] + n[1] * r, o[2] + n[2] * r, ...n, ...col);
  }
  return v;
}
function pipeStart() {
  const free = [];
  for (let i = 0; i < P.used.length; i++) if (!P.used[i]) free.push(i);
  if (free.length < P.used.length * 0.45) return null;              // cheio: hora de limpar
  const id = free[Math.floor(Math.random() * free.length)];
  const c = [id % P.NX, Math.floor(id / P.NX) % P.NY, Math.floor(id / (P.NX * P.NY))];
  P.used[id] = 1;
  const pipe = { c, dir: -1, col: PIPE_COLORS[Math.floor(Math.random() * PIPE_COLORS.length)], left: 25 + Math.floor(Math.random() * 70) };
  pipeAdd(sphere(cellPos(c), P.rad * 1.5, pipe.col));
  P.started++;
  return pipe;
}
function pipeStep(pipe) {
  if (--pipe.left < 0) return false;                                 // cano termina e outro começa
  const idx = c => c[0] + P.NX * (c[1] + P.NY * c[2]);
  const ok = d => {
    const n = [pipe.c[0] + DIRS[d][0], pipe.c[1] + DIRS[d][1], pipe.c[2] + DIRS[d][2]];
    return n[0] >= 0 && n[1] >= 0 && n[2] >= 0 && n[0] < P.NX && n[1] < P.NY && n[2] < P.NZ && !P.used[idx(n)];
  };
  let d = pipe.dir;
  if (d < 0 || !ok(d) || Math.random() < P.turn) {                    // vira de vez em quando ou quando bate
    const opts = [0, 1, 2, 3, 4, 5].filter(k => ok(k) && k !== d);
    if (!opts.length) { if (d >= 0 && ok(d)) opts.push(d); else return false; }
    const nd = opts[Math.floor(Math.random() * opts.length)];
    if (d >= 0 && nd !== d) pipeAdd(sphere(cellPos(pipe.c), P.rad * 1.5, pipe.col));
    d = nd;
  }
  const next = [pipe.c[0] + DIRS[d][0], pipe.c[1] + DIRS[d][1], pipe.c[2] + DIRS[d][2]];
  if (!pipeAdd(cylinder(cellPos(pipe.c), cellPos(next), P.rad, pipe.col))) return false;
  P.used[idx(next)] = 1;
  pipe.c = next; pipe.dir = d;
  return true;
}
export function pipes(ctx, w, h, t) {
  if (!P) {
    try {
      const G = makeGL(PIPE_VS, PIPE_FS, [['pos', 3], ['nrm', 3], ['col', 3]]);
      if (!G) { P = { failed: true }; } else {
        P = { ...G, last: Infinity };
        P.buf = G.gl.createBuffer();
        G.gl.bindBuffer(G.gl.ARRAY_BUFFER, P.buf);
        G.gl.bufferData(G.gl.ARRAY_BUFFER, MAXV * 36, G.gl.DYNAMIC_DRAW);
        G.bind();
      }
    } catch (e) { console.warn('canos', e); P = { failed: true }; }
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (P.failed) return;
  const gl = P.gl, aspect = fit(P, ctx);
  if (t < P.last || Math.abs(aspect - P.aspect) > 0.05) pipeReset(aspect);
  const dt = Math.min(0.2, Math.max(0, t - P.last));
  P.last = t;
  P.acc += dt;
  while (P.acc > P.speed) {                                          // cresce um pedaço por vez
    P.acc -= P.speed;
    while (P.pipes.length < P.many) {
      const np = pipeStart();
      if (!np) { pipeReset(aspect); break; }
      P.pipes.push(np);
    }
    P.pipes = P.pipes.filter(pp => pipeStep(pp));
  }
  const D = (P.NX / 2) / (Math.tan(0.36) * aspect) + P.NZ / 2 + 0.5;
  const eye = [0, 0, D];
  gl.uniformMatrix4fv(P.u('mvp'), false, mul(perspective(0.72, aspect, 0.5, 100), lookAt(eye, [0, 0, 0], [0, 1, 0])));
  gl.uniform3f(P.u('eye'), ...eye);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.buf); P.bind();
  gl.drawArrays(gl.TRIANGLES, 0, P.n);
  ctx.drawImage(P.canvas, 0, 0, w, h);
}

// ---------- Labirinto de tijolos ----------
// materiais (atributo tex): 0 tijolo, 1 chão, 2 teto, 3 placa Start, 4 pedra (cinza, brilho em uv.x), 5 rosto, 6 quadro, 7 rato, 8 logo OpenGL
const MAZE_VS = `
attribute vec3 pos; attribute vec2 uv; attribute float tex;
uniform mat4 mvp; uniform float rise;
varying vec2 vUv; varying float vTex;
void main() {
  vec3 p = pos;
  if (tex < 0.5 || (tex > 2.5 && tex < 3.5) || (tex > 5.5 && tex < 6.5)) p.y *= rise;   // paredes sobem do chão no começo
  vUv = uv; vTex = tex; gl_Position = mvp * vec4(p, 1.0);
}`;
const MAZE_FS = `
precision mediump float;
uniform sampler2D wall, floor, ceil, sign, smile, pic, rat, logo;
varying vec2 vUv; varying float vTex;
void main() {
  if (vTex < 0.5) gl_FragColor = texture2D(wall, vUv);
  else if (vTex < 1.5) gl_FragColor = texture2D(floor, vUv);
  else if (vTex < 2.5) gl_FragColor = texture2D(ceil, vUv);
  else if (vTex < 3.5) gl_FragColor = texture2D(sign, vUv);
  else if (vTex < 4.5) gl_FragColor = vec4(vec3(vUv.x), 1.0);
  else if (vTex < 5.5) gl_FragColor = texture2D(smile, vUv);
  else if (vTex < 6.5) gl_FragColor = texture2D(pic, vUv);
  else if (vTex < 7.5) { gl_FragColor = texture2D(rat, vUv); if (gl_FragColor.a < 0.5) discard; }
  else { gl_FragColor = texture2D(logo, vUv); if (gl_FragColor.a < 0.1) discard; }
}`;
function texture(gl, unit, draw, size = [128, 128]) {
  const c = Object.assign(document.createElement('canvas'), { width: size[0], height: size[1] });
  draw(c.getContext('2d'), size[0], size[1]);
  const tx = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tx;
}
const speckle = (g, x, y, w, h, base, amt, n = w * h / 3) => {    // granulado de textura antiga
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * amt;
    g.fillStyle = `rgb(${base.map(b => Math.round(Math.max(0, Math.min(255, b + v)))).join(',')})`;
    g.fillRect(x + Math.random() * w, y + Math.random() * h, 2, 2);
  }
};
function brickTex(g) {                                               // 4 fileiras de tijolo por parede
  g.fillStyle = '#d4d4d0'; g.fillRect(0, 0, 256, 256);               // argamassa clara
  speckle(g, 0, 0, 256, 256, [212, 212, 208], 30, 4000);
  for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) {
    const x = k * 128 + (r % 2) * 64 + 7, y = r * 64 + 7, bw = 114, bh = 50;
    g.fillStyle = 'rgba(70, 70, 70, .55)'; g.fillRect(x + 3, y + 4, bw, bh);   // sombra do tijolo na argamassa
    const base = [128 + Math.random() * 20, 8 + Math.random() * 8, 12 + Math.random() * 8];
    g.fillStyle = `rgb(${base.map(Math.round).join(',')})`; g.fillRect(x, y, bw, bh);
    speckle(g, x, y, bw, bh, base, 45, 900);
    for (let m = 0; m < 6; m++) {                                     // manchas escuras e claras
      g.fillStyle = Math.random() < 0.5 ? 'rgba(60,0,0,.25)' : 'rgba(190,40,40,.18)';
      g.beginPath(); g.ellipse(x + Math.random() * bw, y + Math.random() * bh, 8 + Math.random() * 16, 4 + Math.random() * 8, 0, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(255,170,170,.18)'; g.fillRect(x, y, bw, 3);     // quina de cima iluminada
  }
}
function floorTex(g) {                                               // chão bege granulado
  g.fillStyle = '#b8823e'; g.fillRect(0, 0, 128, 128);
  speckle(g, 0, 0, 128, 128, [184, 130, 62], 70, 5000);
}
function ceilTex(g) {                                                // forro de placas cinza
  g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 128, 128);
  speckle(g, 0, 0, 128, 128, [200, 200, 200], 110, 6000);
  for (const o of [0, 64]) {
    g.fillStyle = '#8c8c8c'; g.fillRect(o, 0, 3, 128); g.fillRect(0, o, 128, 3);
    g.fillStyle = '#ececec'; g.fillRect(o + 3, 0, 2, 128); g.fillRect(0, o + 3, 128, 2);
  }
}
function signTex(g, w, h) {                                          // placa translúcida "Start"
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(205, 205, 205, .5)'; g.fillRect(6, 6, w - 12, h - 12);
  g.strokeStyle = 'rgba(25, 25, 25, .85)'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
  g.strokeStyle = 'rgba(255, 255, 255, .6)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = 'rgba(20, 20, 20, .9)'; g.font = `bold ${h * 0.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Start', w / 2, h / 2 + 4);
}
function smileTex(g, w, h) {                                         // rosto amarelo translúcido da saída
  g.clearRect(0, 0, w, h);
  const r = w * 0.47, cx = w / 2, cy = h / 2, grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, 'rgba(255, 250, 150, .85)'); grad.addColorStop(1, 'rgba(235, 190, 20, .75)');
  g.fillStyle = grad; g.beginPath(); g.ellipse(cx, cy, r, r * 0.8, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(40, 40, 210, .9)';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * r * 0.42, cy - r * 0.2, r * 0.13, r * 0.08, 0, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(40, 40, 210, .9)'; g.lineWidth = r * 0.12; g.lineCap = 'round';
  g.beginPath(); g.ellipse(cx, cy + r * 0.05, r * 0.6, r * 0.38, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
}
function ratTex(g, w, h) {                                           // ratinho cinza de perfil, olhando para a direita
  g.clearRect(0, 0, w, h);
  g.setTransform(w / 192, 0, 0, h / 108, 0, -6 * h / 108);           // desenho ocupa a imagem toda
  g.strokeStyle = '#8a7f86'; g.lineWidth = 5; g.lineCap = 'round';   // rabo
  g.beginPath(); g.moveTo(40, 78); g.bezierCurveTo(18, 86, 14, 60, 4, 70); g.stroke();
  g.fillStyle = '#5c5c62';
  for (const x of [58, 78, 118, 134]) { g.beginPath(); g.ellipse(x, 98, 7, 4, 0, 0, TAU); g.fill(); }   // patinhas
  const body = g.createRadialGradient(95, 62, 6, 92, 74, 58);
  body.addColorStop(0, '#b9b9c0'); body.addColorStop(1, '#6e6e76');
  g.fillStyle = body;
  g.beginPath(); g.ellipse(88, 76, 52, 26, 0, 0, TAU); g.fill();       // corpo
  g.beginPath(); g.moveTo(126, 58); g.quadraticCurveTo(168, 70, 172, 82); g.quadraticCurveTo(150, 96, 124, 92); g.fill();   // focinho
  g.fillStyle = '#f2a0b4'; g.beginPath(); g.arc(172, 82, 5, 0, TAU); g.fill();            // nariz
  g.fillStyle = '#9b9ba3'; g.beginPath(); g.ellipse(124, 50, 13, 16, -0.3, 0, TAU); g.fill();   // orelha
  g.fillStyle = '#e9b3c2'; g.beginPath(); g.ellipse(124, 51, 7, 10, -0.3, 0, TAU); g.fill();
  g.fillStyle = '#101010'; g.beginPath(); g.arc(146, 70, 4, 0, TAU); g.fill();            // olho
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(147.5, 68.5, 1.3, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(40,40,40,.7)'; g.lineWidth = 1;               // bigodes
  for (const dy of [-4, 0, 4]) { g.beginPath(); g.moveTo(164, 84); g.lineTo(188, 80 + dy * 2); g.stroke(); }
}
function logoTex(g, w, h) {                                          // a palavra OpenGL, em relevo
  g.clearRect(0, 0, w, h);
  g.font = `bold italic ${h * 0.62}px Georgia, 'Times New Roman', serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = h * 0.08; g.strokeStyle = 'rgba(20, 20, 30, .9)';
  g.strokeText('OpenGL', w / 2, h / 2);
  const grad = g.createLinearGradient(0, h * 0.2, 0, h * 0.8);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, '#b8c4d8'); grad.addColorStop(1, '#6d7b96');
  g.fillStyle = grad; g.fillText('OpenGL', w / 2, h / 2);
}
const ratImg = Object.assign(new Image(), { src: 'img/rato.png' });     // rato enviado pelo usuário
const picImg = Object.assign(new Image(), { src: 'img/quadro.webp' });   // imagem que aparece em paredes sorteadas
const startImg = Object.assign(new Image(), { src: 'img/start.png' });   // placa Start enviada pelo usuário
const mazeImgs = ['img/maze-tijolo.png', 'img/maze-chao.png', 'img/maze-teto.png']   // texturas tiradas do original
  .map(src => Object.assign(new Image(), { src }));
function imageTex(gl, unit, img, draw, size) {                       // usa a imagem quando carregar; até lá, a desenhada
  const put = () => texture(gl, unit, g => g.drawImage(img, 0, 0), [img.naturalWidth, img.naturalHeight]);   // tamanho original
  texture(gl, unit, draw, size);
  if (img.complete && img.naturalWidth) put(); else img.addEventListener('load', put, { once: true });
}
const STEP = [[1, 0], [0, 1], [-1, 0], [0, -1]];                      // direções: x+, z+, x-, z-
let M = null;
function mazeBuild() {                                               // labirinto perfeito sorteado (busca em profundidade)
  const R = Math.random, N = 5 + Math.floor(R() * 4), open = Array.from({ length: N * N }, () => [false, false, false, false]);
  const seen = new Uint8Array(N * N), stack = [Math.floor(R() * N * N)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const c = stack.at(-1), x = c % N, z = Math.floor(c / N);
    const opts = [0, 1, 2, 3].filter(d => { const nx = x + STEP[d][0], nz = z + STEP[d][1]; return nx >= 0 && nz >= 0 && nx < N && nz < N && !seen[nz * N + nx]; });
    if (!opts.length) { stack.pop(); continue; }
    const d = opts[Math.floor(R() * opts.length)], n = (z + STEP[d][1]) * N + x + STEP[d][0];
    open[c][d] = true; open[n][(d + 2) % 4] = true; seen[n] = 1; stack.push(n);
  }
  const v = [], q = (a, b, c, d, tex) => {
    for (const [p, uv] of [[a, [0, 1]], [b, [1, 1]], [c, [1, 0]], [a, [0, 1]], [c, [1, 0]], [d, [0, 0]]]) v.push(...p, ...uv, tex);
  };
  const wallAt = [];                                                 // início de cada parede no buffer
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    q([x, 0, z], [x + 1, 0, z], [x + 1, 0, z + 1], [x, 0, z + 1], 1);
    q([x, 1, z], [x + 1, 1, z], [x + 1, 1, z + 1], [x, 1, z + 1], 2);
    const o = open[z * N + x], wt = () => (wallAt.push(v.length / 6), 0);
    // cada parede com os cantos na ordem esquerda→direita de quem olha de dentro da casa (para o quadro não sair espelhado)
    if (!o[0]) q([x + 1, 0, z], [x + 1, 0, z + 1], [x + 1, 1, z + 1], [x + 1, 1, z], wt());
    if (!o[1]) q([x + 1, 0, z + 1], [x, 0, z + 1], [x, 1, z + 1], [x + 1, 1, z + 1], wt());
    if (!o[2]) q([x, 0, z + 1], [x, 0, z], [x, 1, z], [x, 1, z + 1], wt());
    if (!o[3]) q([x, 0, z], [x + 1, 0, z], [x + 1, 1, z], [x, 1, z], wt());
  }
  for (let k = N >= 7 ? 2 : 1; k--;) {                              // o quadro aparece em uma ou duas paredes só
    const at = wallAt.splice(Math.floor(R() * wallAt.length), 1)[0];
    for (let i = 0; i < 6; i++) v[(at + i) * 6 + 5] = 6;
  }
  const walls = v.length / 6;
  // começa num beco olhando para a parede com a placa Start
  const ends = [];
  for (let i = 0; i < N * N; i++) if (open[i].filter(Boolean).length === 1) ends.push(i);
  const sc = ends.length ? ends[Math.floor(R() * ends.length)] : 0, sx = sc % N, sz = Math.floor(sc / N);
  const dir = [0, 1, 2, 3].find(d => !open[sc][d]) ?? 0, D = STEP[dir], L = [-D[1], D[0]];
  const cx = sx + 0.5 + D[0] * 0.49, cz = sz + 0.5 + D[1] * 0.49;
  q([cx - L[0] * 0.32, 0.34, cz - L[1] * 0.32], [cx + L[0] * 0.32, 0.34, cz + L[1] * 0.32],
    [cx + L[0] * 0.32, 0.66, cz + L[1] * 0.32], [cx - L[0] * 0.32, 0.66, cz - L[1] * 0.32], 3);
  const gl = M.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, M.buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  let far = sc, best = -1;                                           // a saída (o rosto) é a casa mais longe do começo
  const dist = new Int16Array(N * N).fill(-1), queue = [sc];
  dist[sc] = 0;
  while (queue.length) {
    const c = queue.shift();
    if (dist[c] > best) { best = dist[c]; far = c; }
    for (let d = 0; d < 4; d++) if (open[c][d]) {
      const n = c + STEP[d][0] + STEP[d][1] * N;
      if (dist[n] < 0) { dist[n] = dist[c] + 1; queue.push(n); }
    }
  }
  const rocks = new Set();                                           // pedras que viram o mundo de ponta-cabeça
  for (let i = 0, k = 1 + Math.floor(R() * 3); i < k; i++) {
    const c = Math.floor(R() * N * N);
    if (c !== sc && c !== far) rocks.add(c);
  }
  Object.assign(M, { N, open, walls, n: v.length / 6, x: sx, z: sz, dir, move: null, steps: 0, walkNext: false,
    ex: far % N, ez: Math.floor(far / N), intro: 0, rocks, roll: 0, rollTo: 0 });
  M.logos = Array.from({ length: 1 + Math.floor(R() * 2) }, () => Math.floor(R() * N * N)).filter(c => c !== sc && c !== far);
  const rc = Math.floor(R() * N * N);                                // o rato começa numa casa qualquer
  M.rat = { x: rc % N, z: Math.floor(rc / N), dir: [0, 1, 2, 3].find(d => open[rc][d]) ?? 0, t: 0 };
}
function mazeNext() {                                                // sempre com a mão direita na parede
  if (M.walkNext) { M.walkNext = false; return { kind: 'walk', dur: 0.55, t: 0 }; }   // acabou de virar: anda
  const o = M.open[M.z * M.N + M.x];
  for (const turn of [1, 0, -1, 2]) {                               // direita, frente, esquerda, volta (+1 = direita)
    if (!o[(M.dir + turn + 4) % 4]) continue;
    if (!turn) return { kind: 'walk', dur: 0.55, t: 0 };
    M.walkNext = true;
    return { kind: 'turn', from: M.dir, to: M.dir + turn, dur: turn === 2 ? 0.8 : 0.4, t: 0 };
  }
}
const ICO = (() => {                                                 // icosaedro (a pedra)
  const p = (1 + Math.sqrt(5)) / 2, V = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]]
    .map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
  return [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].map(f => f.map(i => V[i]));
})();
function ratStep(dt) {                                               // o rato anda sozinho: segue em frente e vira ao acaso
  const r = M.rat;
  r.t += dt * 0.9;
  while (r.t >= 1) {
    r.t -= 1; r.x += STEP[r.dir][0]; r.z += STEP[r.dir][1];
    const o = M.open[r.z * M.N + r.x], back = (r.dir + 2) % 4;
    const opts = [0, 1, 2, 3].filter(d => o[d] && d !== back);
    r.dir = opts.length ? opts[Math.floor(Math.random() * opts.length)] : back;   // beco: dá meia-volta
  }
}
function dynamic(t, eyeAng) {                                        // pedras girando e o rosto, montados a cada quadro
  const v = [], rot = (p, a, b) => {
    const x = p[0] * Math.cos(a) - p[2] * Math.sin(a), z = p[0] * Math.sin(a) + p[2] * Math.cos(a);
    return [x, p[1] * Math.cos(b) - z * Math.sin(b), p[1] * Math.sin(b) + z * Math.cos(b)];
  };
  for (const c of M.rocks) {
    const ox = c % M.N + 0.5, oz = Math.floor(c / M.N) + 0.5, a = t * 1.7 + c, b = t * 1.1 + c * 0.3;
    for (const f of ICO) {
      const pts = f.map(p => rot(p, a, b));
      const n = (() => { const u = pts[1].map((x, i) => x - pts[0][i]), w = pts[2].map((x, i) => x - pts[0][i]);
        const c3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...c3); return c3.map(x => x / l); })();
      const shade = 0.35 + 0.55 * Math.max(0, n[0] * -0.4 + n[1] * 0.7 + n[2] * 0.6);   // faces chapadas, como antigamente
      for (const p of pts) v.push(ox + p[0] * 0.16, 0.5 + p[1] * 0.16, oz + p[2] * 0.16, shade, 0, 4);
    }
  }
  const rocksEnd = v.length / 6;
  const fx = M.ex + 0.5, fz = M.ez + 0.5, a = t * 1.3, s = 0.36;     // rosto girando devagar na saída
  const dx = Math.cos(a) * s, dz = Math.sin(a) * s;
  const P = [[fx - dx, 0.14, fz - dz], [fx + dx, 0.14, fz + dz], [fx + dx, 0.86, fz + dz], [fx - dx, 0.86, fz - dz]];
  for (const [i, uv] of [[0, [0, 1]], [1, [1, 1]], [2, [1, 0]], [0, [0, 1]], [2, [1, 0]], [3, [0, 0]]]) v.push(...P[i], ...uv, 5);
  M.logos.forEach((c, k) => {                                        // logos OpenGL girando no ar
    const lx = c % M.N + 0.5, lz = Math.floor(c / M.N) + 0.5, la = t * 1.1 + k * 2, y0 = 0.5 + Math.sin(t * 1.6 + k) * 0.04;
    const ldx = Math.cos(la) * 0.34, ldz = Math.sin(la) * 0.34;
    const LP = [[lx - ldx, y0 - 0.085, lz - ldz], [lx + ldx, y0 - 0.085, lz + ldz], [lx + ldx, y0 + 0.085, lz + ldz], [lx - ldx, y0 + 0.085, lz - ldz]];
    for (const [i, uv] of [[0, [0, 1]], [1, [1, 1]], [2, [1, 0]], [0, [0, 1]], [2, [1, 0]], [3, [0, 0]]]) v.push(...LP[i], ...uv, 8);
  });
  const r = M.rat, rx = r.x + 0.5 + STEP[r.dir][0] * r.t, rz = r.z + 0.5 + STEP[r.dir][1] * r.t;   // rato sempre de frente para a câmera
  const right = [-Math.sin(eyeAng), Math.cos(eyeAng)], flip = STEP[r.dir][0] * right[0] + STEP[r.dir][1] * right[1] < 0;
  const hw = 0.3, bob = Math.abs(Math.sin(t * 14)) * 0.015;
  const RP = [[rx - right[0] * hw, bob, rz - right[1] * hw], [rx + right[0] * hw, bob, rz + right[1] * hw],
    [rx + right[0] * hw, 0.3 + bob, rz + right[1] * hw], [rx - right[0] * hw, 0.3 + bob, rz - right[1] * hw]];
  const u0 = flip ? 1 : 0, u1 = flip ? 0 : 1;
  for (const [i, uv] of [[0, [u0, 1]], [1, [u1, 1]], [2, [u1, 0]], [0, [u0, 1]], [2, [u1, 0]], [3, [u0, 0]]]) v.push(...RP[i], ...uv, 7);
  const gl = M.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, M.dyn);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
  return [rocksEnd, v.length / 6];
}
export function maze(ctx, w, h, t) {
  if (!M) {
    try {
      const G = makeGL(MAZE_VS, MAZE_FS, [['pos', 3], ['uv', 2], ['tex', 1]]);
      if (!G) M = { failed: true }; else {
        M = { ...G, last: Infinity, buf: G.gl.createBuffer(), dyn: G.gl.createBuffer() };
        imageTex(G.gl, 0, mazeImgs[0], brickTex, [256, 256]); imageTex(G.gl, 1, mazeImgs[1], floorTex, [128, 128]);
        imageTex(G.gl, 2, mazeImgs[2], ceilTex, [128, 128]);
        texture(G.gl, 3, signTex, [256, 128]); texture(G.gl, 4, smileTex, [256, 256]);
        const start = () => texture(G.gl, 3, g => g.drawImage(startImg, 0, 0, 512, 256), [512, 256]);   // já vem translúcida
        if (startImg.complete && startImg.naturalWidth) start(); else startImg.addEventListener('load', start, { once: true });
        const pic = () => texture(G.gl, 5, g => g.drawImage(picImg, 0, 0, 512, 512), [512, 512]);
        if (picImg.complete && picImg.naturalWidth) pic(); else { texture(G.gl, 5, ceilTex); picImg.addEventListener('load', pic, { once: true }); }
        imageTex(G.gl, 6, ratImg, ratTex, [256, 128]); texture(G.gl, 7, logoTex, [512, 128]);
        ['wall', 'floor', 'ceil', 'sign', 'smile', 'pic', 'rat', 'logo'].forEach((n, i) => G.gl.uniform1i(G.u(n), i));
      }
    } catch (e) { console.warn('labirinto', e); M = { failed: true }; }
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (M.failed) return;
  const gl = M.gl, aspect = fit(M, ctx);
  if (t < M.last) mazeBuild();
  const dt = Math.min(0.2, Math.max(0, t - M.last));
  M.last = t;
  M.intro += dt;
  if (M.intro > 4.2) {                                               // paredes subiram e mostrou a placa: anda sem parar
    M.move ??= mazeNext();
    M.move.t += dt / M.move.dur;
    while (M.move.t >= 1) {
      const rest = (M.move.t - 1) * M.move.dur;                      // sobra de tempo passa para o próximo passo
      if (M.move.kind === 'walk') { M.x += STEP[M.dir][0]; M.z += STEP[M.dir][1]; M.steps++; }
      else M.dir = ((M.move.to % 4) + 4) % 4;
      if (M.x === M.ex && M.z === M.ez || M.steps > 260) { mazeBuild(); break; }   // chegou no rosto: outro labirinto
      M.move = mazeNext();
      M.move.t = rest / M.move.dur;
    }
  }
  if (M.intro > 3) ratStep(dt);
  const mv = M.move, e = mv ? Math.min(1, mv.t) : 0;
  let ang = M.dir * Math.PI / 2, px = M.x + 0.5, pz = M.z + 0.5;
  if (mv?.kind === 'turn') ang = (mv.from + (mv.to - mv.from) * e) * Math.PI / 2;
  else if (mv) { px += STEP[M.dir][0] * e; pz += STEP[M.dir][1] * e; }
  const cell = Math.floor(pz) * M.N + Math.floor(px);               // passou pela pedra: o mundo vira
  if (M.rocks.has(cell) && Math.hypot(px - Math.floor(px) - 0.5, pz - Math.floor(pz) - 0.5) < 0.2) { M.rocks.delete(cell); M.rollTo += Math.PI; }
  M.roll += Math.sign(M.rollTo - M.roll) * Math.min(Math.abs(M.rollTo - M.roll), dt * Math.PI / 1.2);
  const fx = Math.cos(ang), fz = Math.sin(ang), cr = Math.cos(M.roll), sr = Math.sin(M.roll);
  const ex = px - fx * 0.3, ez = pz - fz * 0.3;                      // olho no fundo da casa: vê a parede inteira
  gl.uniformMatrix4fv(M.u('mvp'), false, mul(perspective(1.0, aspect, 0.02, 40),
    lookAt([ex, 0.5, ez], [ex + fx, 0.5, ez + fz], [-fz * sr, cr, fx * sr])));
  gl.uniform1f(M.u('rise'), Math.min(1, Math.max(0.001, (M.intro - 0.6) / 2.2)));
  const [rocksEnd, dynN] = dynamic(t, ang);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, M.buf); M.bind();
  gl.drawArrays(gl.TRIANGLES, 0, M.walls);
  gl.bindBuffer(gl.ARRAY_BUFFER, M.dyn); M.bind();
  gl.drawArrays(gl.TRIANGLES, 0, rocksEnd);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);   // translúcidos por cima: rosto e placa
  gl.drawArrays(gl.TRIANGLES, rocksEnd, dynN - rocksEnd);
  gl.bindBuffer(gl.ARRAY_BUFFER, M.buf); M.bind();
  gl.drawArrays(gl.TRIANGLES, M.walls, M.n - M.walls);
  ctx.drawImage(M.canvas, 0, 0, w, h);
}

// ---------- Caixa de flores 3D ----------
// cubo liso que "floresce": cada face cresce numa pétala arredondada e pontuda, e depois volta a ser cubo.
// Uma cor por lado (às vezes em xadrez), mudando devagar; gira e flutua pela tela.
let F = null;
const hsl = (h, s, l) => {                                           // matiz 0..1 → rgb 0..1
  const k = n => (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
};
function flowerReset() {
  const R = Math.random;
  Object.assign(F, {
    hue: R(), cycle: 0.02 + R() * 0.05, checker: R() < 0.35, point: 1.5 + R() * 2.5, amp: 0.7 + R() * 0.6, speed: 0.5 + R() * 0.5,
    spin: [0.35 + R() * 0.5, 0.25 + R() * 0.5], pos: [0, 0], vel: [(R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), (R() < 0.5 ? -1 : 1) * (0.25 + R() * 0.3)],
  });
}
export function flowerbox(ctx, w, h, t) {
  if (!F) {
    try {
      const G = makeGL(PIPE_VS, PIPE_FS, [['pos', 3], ['nrm', 3], ['col', 3]]);
      F = G ? { ...G, last: Infinity, buf: G.gl.createBuffer() } : { failed: true };
    } catch (e) { console.warn('caixa de flores', e); F = { failed: true }; }
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (F.failed) return;
  const gl = F.gl, aspect = fit(F, ctx);
  if (t < F.last) flowerReset();
  const dt = Math.min(0.2, Math.max(0, t - F.last));
  F.last = t;
  const D = 6, half = Math.tan(0.36) * D, lim = [Math.max(0.1, half * aspect - 2.2), Math.max(0.05, half - 1.9)];
  for (const i of [0, 1]) {                                          // flutua e quica nas bordas
    F.pos[i] += F.vel[i] * dt;
    if (Math.abs(F.pos[i]) > lim[i]) { F.pos[i] = Math.sign(F.pos[i]) * lim[i]; F.vel[i] *= -1; }
  }
  const bloom = F.amp * (0.5 - 0.5 * Math.cos(t * F.speed));       // 0 = cubo, máximo = flor aberta
  const [ax, ay] = F.spin.map(v => v * t);
  const ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
  const rot = ([x, y, z]) => { const y1 = y * ca - z * sa, z1 = y * sa + z * ca; return [x * cb + z1 * sb, y1, -x * sb + z1 * cb]; };
  const N = 18, axes = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
  const v = [];
  axes.forEach(([iu, iv, iw, sg], f) => {
    const grid = [];                                                  // pontos da face já com a pétala
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const u = i / N * 2 - 1, w2 = j / N * 2 - 1, p = [0, 0, 0];
      p[iu] = u * sg; p[iv] = w2; p[iw] = sg;
      const l = Math.hypot(...p), petal = (Math.cos(u * Math.PI / 2) * Math.cos(w2 * Math.PI / 2)) ** F.point - 0.2;
      const r = 1 + bloom * petal * 1.4, k = bloom / F.amp;            // arredonda e estica conforme floresce
      grid.push(rot(p.map(c => c * (1 - k) + c / l * 1.25 * r * k)));
    }
    const at = (i, j) => grid[Math.max(0, Math.min(N, i)) * (N + 1) + Math.max(0, Math.min(N, j))];
    const nrm = (i, j) => {                                          // normal lisa a partir dos vizinhos
      const a = at(i + 1, j), b = at(i - 1, j), c = at(i, j + 1), d = at(i, j - 1);
      const du = a.map((x, k) => x - b[k]), dv = c.map((x, k) => x - d[k]);
      let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const p = at(i, j), l = Math.hypot(...n) || 1;
      n = n.map(x => x / l);
      return n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0 ? n.map(x => -x) : n;
    };
    const base = hsl((F.hue + f / 6 + t * F.cycle) % 1, 0.85, 0.55), alt = hsl((F.hue + f / 6 + 0.5 + t * F.cycle) % 1, 0.85, 0.55);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const col = F.checker && ((i >> 2) + (j >> 2)) % 2 ? alt : base;
      for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) {
        const p = at(a, b);
        v.push(p[0] + F.pos[0], p[1] + F.pos[1], p[2], ...nrm(a, b), ...col);
      }
    }
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, F.buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
  F.bind();
  const eye = [0, 0, D];
  gl.uniformMatrix4fv(F.u('mvp'), false, mul(perspective(0.72, aspect, 0.5, 50), lookAt(eye, [0, 0, 0], [0, 1, 0])));
  gl.uniform3f(F.u('eye'), ...eye);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.drawArrays(gl.TRIANGLES, 0, v.length / 9);
  ctx.drawImage(F.canvas, 0, 0, w, h);
}
