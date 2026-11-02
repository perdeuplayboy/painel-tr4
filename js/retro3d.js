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
const MAZE_VS = `
attribute vec3 pos; attribute vec2 uv; attribute float tex;
uniform mat4 mvp; uniform vec3 eye;
varying vec2 vUv; varying float vTex, vD;
void main() { vUv = uv; vTex = tex; vD = distance(pos, eye); gl_Position = mvp * vec4(pos, 1.0); }`;
const MAZE_FS = `
precision mediump float;
uniform sampler2D wall, floor, ceil;
varying vec2 vUv; varying float vTex, vD;
void main() {
  vec3 c = vTex < 0.5 ? texture2D(wall, vUv).rgb : vTex < 1.5 ? texture2D(floor, vUv).rgb : texture2D(ceil, vUv).rgb;
  gl_FragColor = vec4(c * (1.0 / (1.0 + vD * vD * 0.035)), 1.0);
}`;
function texture(gl, unit, draw, tx = gl.createTexture()) {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  draw(c.getContext('2d'));
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tx;
}
const noisy = (g, x, y, w, h, base, amt) => {                        // manchinhas para não ficar chapado
  for (let i = 0; i < w * h / 6; i++) {
    const v = (Math.random() - 0.5) * amt;
    g.fillStyle = `rgb(${base.map(b => Math.max(0, Math.min(255, b + v))).join(',')})`;
    g.fillRect(x + Math.random() * w, y + Math.random() * h, 1.5, 1.5);
  }
};
let tint = [1, 1, 1];                                                // tom do tijolo sorteado a cada labirinto
function brickTex(g) {
  g.fillStyle = '#b9b3a6'; g.fillRect(0, 0, 128, 128);                 // argamassa
  for (let r = 0; r < 8; r++) for (let k = -1; k < 4; k++) {
    const x = k * 32 + (r % 2) * 16 + 2, y = r * 16 + 2;
    const base = [(150 + Math.random() * 30) * tint[0], (45 + Math.random() * 20) * tint[1], (30 + Math.random() * 12) * tint[2]].map(Math.round);
    g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(x, y, 28, 12);
    noisy(g, x, y, 28, 12, base, 40);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + 10, 28, 2);   // sombra embaixo do tijolo
  }
}
function floorTex(g) {
  const f = [90, 86, 80].map(v => Math.round(v * (0.6 + tint[2] * 0.5)));
  g.fillStyle = `rgb(${f.join(',')})`; g.fillRect(0, 0, 128, 128);
  noisy(g, 0, 0, 128, 128, f, 50);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
}
function ceilTex(g) {
  g.fillStyle = '#d8d6cf'; g.fillRect(0, 0, 128, 128);
  noisy(g, 0, 0, 128, 128, [216, 214, 207], 40);
  g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
}
let M = null;
function mazeBuild() {                                               // labirinto perfeito sorteado (busca em profundidade)
  const R = Math.random, N = 7 + Math.floor(R() * 6), open = Array.from({ length: N * N }, () => [false, false, false, false]);   // L, N, O, S (x+, z+, x-, z-)
  const seen = new Uint8Array(N * N), stack = [0];
  seen[0] = 1;
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  while (stack.length) {
    const c = stack.at(-1), x = c % N, z = Math.floor(c / N);
    const opts = [0, 1, 2, 3].filter(d => { const nx = x + D[d][0], nz = z + D[d][1]; return nx >= 0 && nz >= 0 && nx < N && nz < N && !seen[nz * N + nx]; });
    if (!opts.length) { stack.pop(); continue; }
    const d = opts[Math.floor(Math.random() * opts.length)], n = (z + D[d][1]) * N + x + D[d][0];
    open[c][d] = true; open[n][(d + 2) % 4] = true; seen[n] = 1; stack.push(n);
  }
  const v = [], q = (a, b, c, d, tex, uw, uh) => {
    for (const [p, uv] of [[a, [0, uh]], [b, [uw, uh]], [c, [uw, 0]], [a, [0, uh]], [c, [uw, 0]], [d, [0, 0]]]) v.push(...p, ...uv, tex);
  };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    q([x, 0, z], [x + 1, 0, z], [x + 1, 0, z + 1], [x, 0, z + 1], 1, 1, 1);
    q([x, 1, z], [x + 1, 1, z], [x + 1, 1, z + 1], [x, 1, z + 1], 2, 1, 1);
    const o = open[z * N + x];
    if (!o[0]) q([x + 1, 0, z], [x + 1, 0, z + 1], [x + 1, 1, z + 1], [x + 1, 1, z], 0, 1, 1);
    if (!o[1]) q([x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 1, z + 1], [x, 1, z + 1], 0, 1, 1);
    if (!o[2]) q([x, 0, z], [x, 0, z + 1], [x, 1, z + 1], [x, 1, z], 0, 1, 1);
    if (!o[3]) q([x, 0, z], [x + 1, 0, z], [x + 1, 1, z], [x, 1, z], 0, 1, 1);
  }
  const gl = M.gl;
  tint = [[1, 1, 1], [1.12, 1.25, 1.3], [0.8, 0.9, 1], [1.15, 1.6, 1.9], [0.95, 0.75, 0.7]][Math.floor(R() * 5)];
  texture(gl, 0, brickTex, M.tex[0]); texture(gl, 1, floorTex, M.tex[1]); texture(gl, 2, ceilTex, M.tex[2]);
  gl.bindBuffer(gl.ARRAY_BUFFER, M.buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  const sx = Math.floor(R() * N), sz = Math.floor(R() * N), o = open[sz * N + sx];
  Object.assign(M, { N, open, n: v.length / 6, x: sx, z: sz, dir: [0, 1, 2, 3].find(d => o[d]) ?? 0, move: null, steps: 0,
    ex: N - 1 - sx, ez: N - 1 - sz });                               // começa num canto qualquer, sai do lado oposto
}
function mazeNext() {                                                // sempre com a mão direita na parede
  const o = M.open[M.z * M.N + M.x];
  for (const turn of [-1, 0, 1, 2]) {
    const d = (M.dir + turn + 4) % 4;
    if (!o[d]) continue;
    if (turn) return { kind: 'turn', from: M.dir, to: M.dir + (turn === 2 ? 2 : turn), dur: turn === 2 ? 1 : 0.55, t: 0 };
    return { kind: 'walk', dur: 0.85, t: 0 };
  }
}
export function maze(ctx, w, h, t) {
  if (!M) {
    try {
      const G = makeGL(MAZE_VS, MAZE_FS, [['pos', 3], ['uv', 2], ['tex', 1]]);
      if (!G) M = { failed: true }; else {
        M = { ...G, last: Infinity, buf: G.gl.createBuffer(), tex: [0, 1, 2].map(() => G.gl.createTexture()) };
        G.gl.uniform1i(G.u('wall'), 0); G.gl.uniform1i(G.u('floor'), 1); G.gl.uniform1i(G.u('ceil'), 2);
      }
    } catch (e) { console.warn('labirinto', e); M = { failed: true }; }
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (M.failed) return;
  const gl = M.gl, aspect = fit(M, ctx);
  if (t < M.last) mazeBuild();
  const dt = Math.min(0.2, Math.max(0, t - M.last));
  M.last = t;
    M.move ??= mazeNext();
  M.move.t += dt / M.move.dur;
  if (M.move.t >= 1) {
    if (M.move.kind === 'walk') { const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][M.dir]; M.x += D[0]; M.z += D[1]; M.steps++; }
    else M.dir = ((M.move.to % 4) + 4) % 4;
    M.move = null;
    if (M.x === M.ex && M.z === M.ez || M.steps > 160) mazeBuild();   // achou a saída: outro labirinto
    M.move = mazeNext();
  }
  const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, M.move.t));   // começa e termina devagar
  let ang = M.dir * Math.PI / 2, px = M.x + 0.5, pz = M.z + 0.5;
  if (M.move.kind === 'turn') ang = (M.move.from + (M.move.to - M.move.from) * e) * Math.PI / 2;
  else { const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][M.dir]; px += D[0] * e; pz += D[1] * e; }
  const eye = [px - Math.cos(ang) * 0.25, 0.5, pz - Math.sin(ang) * 0.25];
  gl.uniformMatrix4fv(M.u('mvp'), false, mul(perspective(0.62, aspect, 0.02, 30),
    lookAt(eye, [eye[0] + Math.cos(ang), 0.5, eye[2] + Math.sin(ang)], [0, 1, 0])));
  gl.uniform3f(M.u('eye'), ...eye);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.bindBuffer(gl.ARRAY_BUFFER, M.buf); M.bind();
  gl.drawArrays(gl.TRIANGLES, 0, M.n);
  ctx.drawImage(M.canvas, 0, 0, w, h);
}
