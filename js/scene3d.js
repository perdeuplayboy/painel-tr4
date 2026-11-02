// Cenas 3D em WebGL puro para as animações: malhas "low poly" com farol, neblina, luz de poste,
// asfalto molhado e um modo câmera térmica. Uma tela WebGL só, compartilhada pelas cenas;
// cada cena sorteia um mundo novo quando começa e é copiada para o canvas 2D do player.

const TAU = Math.PI * 2;
const FY = 1 / Math.tan(0.3);                                       // campo de visão vertical ~34°

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

const VS = `
attribute vec3 pos, nrm, col; attribute float emit, heat, mat; attribute vec2 uv;
uniform vec3 cam, off; uniform float yaw, pitch, roll, fy, aspect, wrapL, objYaw;
varying vec3 vCol, vN, vRel; varying float vEmit, vHeat, vMat; varying vec2 vUv;
void main() {
  float c0 = cos(objYaw), s0 = sin(objYaw), cy = cos(yaw), sy = sin(yaw);
  vec3 p = vec3(pos.x * c0 + pos.z * s0, pos.y, -pos.x * s0 + pos.z * c0);
  vec3 n = vec3(nrm.x * c0 + nrm.z * s0, nrm.y, -nrm.x * s0 + nrm.z * c0);
  vec3 r = p + off - cam;
  if (wrapL > 0.0) r.z = mod(r.z + 30.0, wrapL) - 30.0;             // o mundo se repete sem emenda
  float X = r.x * cy - r.z * sy, Z = r.x * sy + r.z * cy;
  float cp = cos(pitch), sp = sin(pitch);
  float zc = -r.y * sp + Z * cp, yc = r.y * cp + Z * sp;
  vec2 s = vec2(X * cos(roll) - yc * sin(roll), X * sin(roll) + yc * cos(roll));
  vCol = col; vN = n; vRel = r; vEmit = emit; vHeat = heat; vMat = mat; vUv = uv;
  gl_Position = vec4(s.x * fy / aspect, s.y * fy, zc * 1.000286 - 0.2000286, zc);
}`;

const FS = `
precision highp float;
varying vec3 vCol, vN, vRel; varying float vEmit, vHeat, vMat; varying vec2 vUv;
uniform vec3 cam, fwd, right, fogCol, amb, moonDir, moonCol, lampCol;
uniform float fogDen, head, mode, time, lampGap, lampX, lampY;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 iron(float x) {
  x = clamp(x, 0.0, 1.0);
  return vec3(smoothstep(0.05, 0.55, x), smoothstep(0.4, 0.85, x),
    smoothstep(0.8, 1.0, x) + 0.45 * smoothstep(0.0, 0.25, x) * (1.0 - smoothstep(0.3, 0.55, x)));
}
void main() {
  float d = length(vRel);
  vec3 V = vRel / d, n = normalize(vN);
  if (dot(n, V) > 0.0) n = -n;                                     // faces sempre viradas para a câmera
  vec3 W = vRel + cam, base = vCol;
  float e = vEmit;
  bool wet = vMat > 2.5 && vMat < 3.5;
  if (vMat > 0.5 && vMat < 1.5) {                                  // fachada: janelas acesas ao acaso
    vec2 g = vUv / vec2(1.8, 3.2), cell = floor(g), f = fract(g);
    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.32, f.y) * step(f.y, 0.76);
    float lit = step(0.72, hash(cell)) * step(0.25, hash(floor(cell / vec2(5.0, 3.0)) + 11.0));   // andares inteiros apagados
    vec3 wc = mix(vec3(1.0, 0.75, 0.42), vec3(0.6, 0.82, 1.0), step(0.78, hash(cell + 7.0)));
    base = mix(base, mix(vec3(0.03, 0.035, 0.05), wc, lit), win);
    e = max(e, win * lit * (0.25 + 0.5 * hash(cell + 3.0)));
  }
  vec3 L = amb * (0.5 + 0.5 * max(n.y, 0.0)) + moonCol * max(dot(n, moonDir), 0.0);
  float ax = dot(V, right), ay = V.y - fwd.y;                      // farol: largo e com corte em cima
  float cone = exp(-ax * ax / 0.3 - ay * ay / (ay > 0.0 ? 0.006 : 0.25)) * step(0.0, dot(V, fwd));
  float hl = head * cone * max(dot(n, -V), 0.0) * 140.0 / (d * d * 0.35 + 8.0);
  if (vMat > 1.5 && vMat < 2.5) hl *= 12.0;                        // olho-de-gato reflete o farol
  L += vec3(1.0, 0.95, 0.85) * hl;
  vec3 spec = vec3(0.0), R = reflect(V, n);
  if (lampGap > 0.0) {                                             // postes: sempre os mais próximos
    float lz = floor(W.z / lampGap + 0.5) * lampGap;
    for (int k = -1; k <= 1; k++) for (int sd = 0; sd < 2; sd++) {
      vec3 dl = vec3((float(sd) * 2.0 - 1.0) * lampX, lampY, lz + float(k) * lampGap) - W;
      float dd = dot(dl, dl); vec3 ld = dl * inversesqrt(dd);
      L += lampCol * max(dot(n, ld), 0.0) * 90.0 / (dd + 4.0);
      if (wet) {                                                   // reflexo esticado em faixa, como no asfalto molhado
        vec3 q = R - ld; float a = dot(q, right);
        spec += lampCol * exp(-a * a / 0.0005 - q.y * q.y / 0.04) * 0.9 * step(0.0, dot(R, ld));
      }
    }
  }
  if (wet) {
    spec += moonCol * 14.0 * pow(max(dot(R, moonDir), 0.0), 200.0);
    spec += fogCol * 0.6 * pow(1.0 - max(dot(n, -V), 0.0), 3.0);    // céu refletido
  }
  float fg = exp(-d * fogDen), fe = exp(-d * fogDen * 0.35);
  vec3 c = mix(fogCol, base * L + spec, fg) + base * e * 1.6 * fe;
  if (mode > 0.5) {                                                // câmera térmica
    float v = vHeat + 0.06 * max(n.y, 0.0) + 0.04 * (hash(gl_FragCoord.xy + fract(time) * 50.0) - 0.5);
    c = iron(mix(0.06, v, exp(-d * 0.007)));
  }
  gl_FragColor = vec4(c, 1.0);
}`;

let gl = null, glc = null, prog = null, failed = false;
const ATTR = [['pos', 3], ['nrm', 3], ['col', 3], ['emit', 1], ['heat', 1], ['mat', 1], ['uv', 2]];
const locs = {};
function set(name, ...v) {
  if (!(name in locs)) locs[name] = gl.getUniformLocation(prog, name);
  if (locs[name]) gl[`uniform${v.length}f`](locs[name], ...v);
}
function init() {
  glc = document.createElement('canvas');
  gl = glc.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('sem WebGL');
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  for (const a of ATTR) a[2] = gl.getAttribLocation(prog, a[0]);
}

// Malha: triângulos com normal, cor, brilho próprio (e), calor (h), material (m) e uv
class Mesh {
  constructor() { this.v = []; }
  tri(a, b, c, col, o = {}) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) {
      const uv = o.uv ? o.uv(p, nx) : [0, 0];
      this.v.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], o.e || 0, o.h || 0, o.m || 0, uv[0], uv[1]);
    }
  }
  quad(a, b, c, d, col, o) { this.tri(a, b, c, col, o); this.tri(a, c, d, col, o); }
  box(x, y, z, sx, sy, sz, col, o = {}) {                         // base em y, centro em x/z, sem fundo
    const X0 = x - sx / 2, X1 = x + sx / 2, Y0 = y, Y1 = y + sy, Z0 = z - sz / 2, Z1 = z + sz / 2;
    this.quad([X0, Y0, Z0], [X1, Y0, Z0], [X1, Y1, Z0], [X0, Y1, Z0], col, o);
    this.quad([X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1], col, o);
    this.quad([X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0], col, o);
    this.quad([X1, Y0, Z0], [X1, Y0, Z1], [X1, Y1, Z1], [X1, Y1, Z0], col, o);
    this.quad([X0, Y1, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X0, Y1, Z1], col, o.top || o);
  }
  cone(x, y, z, R, H, seg, col, o) {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      this.tri([x + Math.cos(a0) * R, y, z + Math.sin(a0) * R], [x + Math.cos(a1) * R, y, z + Math.sin(a1) * R], [x, y + H, z], col, o);
    }
  }
  blob(x, y, z, rx, ry, rz, col, o, r, seg = 6) {                  // esfera irregular de poucas faces
    const [A, B] = [[0.55, 0.85], [-0.35, 0.95]].map(([s, c], k) => Array.from({ length: seg }, (_, i) => {
      const a = (i + k * 0.5) / seg * TAU, q = 0.85 + r() * 0.3;
      return [x + Math.cos(a) * rx * c * q, y + s * ry * q, z + Math.sin(a) * rz * c * q];
    }));
    const top = [x, y + ry, z], bot = [x, y - ry * 0.8, z];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.tri(top, A[i], A[j], col, o); this.tri(A[i], B[i], A[j], col, o);
      this.tri(A[j], B[i], B[j], col, o); this.tri(B[i], bot, B[j], col, o);
    }
  }
}
function upload(m) {
  const b = gl.createBuffer(), data = new Float32Array(m.v);
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { b, n: data.length / 14 };
}
function draw(m, { off = [0, 0, 0], yaw = 0, wrap = 0 } = {}) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
  let o = 0;
  for (const [, n, l] of ATTR) {
    if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 56, o * 4); }
    o += n;
  }
  set('off', ...off); set('objYaw', yaw); set('wrapL', wrap);
  gl.drawArrays(gl.TRIANGLES, 0, m.n);
}

// Câmera: posição, rumo (yaw), olhar para baixo (pitch) e inclinação (roll)
const moonDir = yaw => [Math.sin(yaw + 0.22) * Math.cos(0.1), Math.sin(0.1), Math.cos(yaw + 0.22) * Math.cos(0.1)];
function begin(ctx, cam, t, look) {
  const CW = ctx.canvas.width, CH = ctx.canvas.height;
  if (glc.width !== CW || glc.height !== CH) { glc.width = CW; glc.height = CH; }
  gl.viewport(0, 0, CW, CH);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  set('cam', cam.x, cam.y, cam.z); set('yaw', cam.yaw); set('pitch', cam.pitch); set('roll', cam.roll || 0);
  set('fy', FY); set('aspect', CW / CH); set('time', t);
  set('fwd', Math.sin(cam.yaw) * Math.cos(0.06), -Math.sin(0.06), Math.cos(cam.yaw) * Math.cos(0.06));
  set('right', Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  set('moonDir', ...moonDir(cam.yaw));
  const L = { fogCol: [0.08, 0.12, 0.21], fogDen: 0.011, amb: [0.03, 0.04, 0.07], moonCol: [0.12, 0.13, 0.18],
    head: 1, mode: 0, lampGap: 0, lampX: 10, lampY: 8.8, lampCol: [1, 0.72, 0.42], ...look };
  for (const [k, v] of Object.entries(L)) Array.isArray(v) ? set(k, ...v) : set(k, v);
}
let glowC = null;
function finish(ctx, w, h, glow) {
  ctx.drawImage(glc, 0, 0, w, h);
  if (!glow) return;
  glowC ??= document.createElement('canvas');                     // brilho: cópia pequena e borrada, somada
  const gw = Math.max(1, Math.ceil(w / 7)), gh = Math.max(1, Math.ceil(h / 7));
  if (glowC.width !== gw || glowC.height !== gh) { glowC.width = gw; glowC.height = gh; }
  const g = glowC.getContext('2d');
  g.clearRect(0, 0, gw, gh); g.drawImage(glc, 0, 0, gw, gh);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = glow; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(glowC, 0, 0, w, h);
  ctx.restore();
}
// ponto do mundo → tela (mesma conta do shader); null se estiver atrás
function project(cam, p, w, h) {
  const rx = p[0] - cam.x, ry = p[1] - cam.y, rz = p[2] - cam.z, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const X = rx * cy - rz * sy, Z = rx * sy + rz * cy, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const zc = -ry * sp + Z * cp, yc = ry * cp + Z * sp;
  if (zc < 0.3) return null;
  const rl = cam.roll || 0, sx = X * Math.cos(rl) - yc * Math.sin(rl), syy = X * Math.sin(rl) + yc * Math.cos(rl);
  return [w / 2 + sx * FY / (w / h) / zc * w / 2, h / 2 - syy * FY / zc * h / 2, zc];
}

const STARS = Array.from({ length: 110 }, (_, i) => [(i * 0.618034) % 1, ((i * 0.381966 * 7) % 1) ** 1.4, 0.25 + (i * 0.37) % 0.6]);
function sky(ctx, w, h, cam, top, bottom, ridge) {
  const hy = h / 2 - Math.tan(cam.pitch) * FY * h / 2;
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  for (const [sx, sy, a] of STARS) {
    ctx.globalAlpha = a;
    ctx.fillRect((((sx - cam.yaw * 0.25) % 1) + 1) % 1 * w, sy * hy * 0.92, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  const md = moonDir(cam.yaw), mp = project(cam, [cam.x + md[0] * 1e3, cam.y + md[1] * 1e3, cam.z + md[2] * 1e3], w, h);
  if (mp) {                                                         // lua com halo
    const r = h * 0.045, halo = ctx.createRadialGradient(mp[0], mp[1], r, mp[0], mp[1], r * 6);
    halo.addColorStop(0, 'rgba(200, 215, 255, .25)'); halo.addColorStop(1, 'rgba(200, 215, 255, 0)');
    ctx.fillStyle = halo; ctx.fillRect(mp[0] - r * 6, mp[1] - r * 6, r * 12, r * 12);
    ctx.fillStyle = '#e9eef8'; ctx.beginPath(); ctx.arc(mp[0], mp[1], r, 0, TAU); ctx.fill();
  }
  if (ridge) {                                                      // serra bem ao longe
    ctx.fillStyle = ridge;
    ctx.beginPath(); ctx.moveTo(0, hy + 2);
    for (let x = 0; x <= w; x += 6) {
      const X = x / w * 5 + cam.yaw * 1.6;
      ctx.lineTo(x, hy - h * (0.03 + 0.05 * Math.abs(Math.sin(X * 1.3)) + 0.025 * Math.sin(X * 4.7) ** 2));
    }
    ctx.lineTo(w, hy + 2); ctx.fill();
  }
}

// cada cena guarda seu mundo e sorteia outro quando a animação recomeça
function scene(build, render) {
  const st = { last: Infinity, world: null };
  return (ctx, w, h, t, color) => {
    if (!gl && !failed) { try { init(); } catch (e) { console.warn('cena 3D', e); failed = true; } }
    if (failed) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); return; }
    if (t < st.last || !st.world) {
      for (const m of st.world?.meshes || []) gl.deleteBuffer(m.b);
      st.world = build(Math.floor(Math.random() * 1e9), color);
    }
    st.last = t;
    render(st.world, ctx, w, h, t, color);
  };
}

const css = c => `rgb(${c.map(v => Math.round(Math.min(1, v) * 255)).join(',')})`;
function rgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
  return m ? [1, 2, 3].map(i => parseInt(m[i], 16) / 255) : [1, 0.55, 0.1];
}

// ---------- mundos ----------

// 4x4 quadradão: frente para +z, rodas no chão (y = 0)
function jeep(col) {
  const m = new Mesh(), dark = [0.02, 0.02, 0.02];
  m.box(0, 0.45, 0, 1.8, 0.85, 4.2, col, { h: 0.45 });
  m.box(0, 1.3, -0.35, 1.66, 0.72, 2.5, col, { h: 0.38 });
  m.box(0, 1.36, -1.62, 1.4, 0.5, 0.04, [0.03, 0.04, 0.05], { h: 0.22 });
  m.box(0, 0.6, -2.25, 0.78, 0.78, 0.26, dark, { h: 0.3 });            // estepe
  m.box(0, 2.02, -0.35, 1.4, 0.06, 1.8, [0.05, 0.05, 0.05], { h: 0.3 }); // rack
  for (const sx of [-0.82, 0.82]) for (const sz of [-1.35, 1.35]) m.box(sx, 0, sz, 0.32, 0.78, 0.78, dark, { h: 0.72 });
  for (const sx of [-0.72, 0.72]) m.box(sx, 0.95, -2.11, 0.28, 0.18, 0.03, [1, 0.08, 0.05], { e: 1, h: 0.6 });
  m.box(0.55, 0.28, -2.18, 0.1, 0.1, 0.14, dark, { h: 1 });             // escapamento
  return m;
}
function sedan(col) {
  const m = new Mesh(), dark = [0.02, 0.02, 0.02];
  m.box(0, 0.32, 0, 1.8, 0.68, 4.5, col, { h: 0.4 });
  m.box(0, 1.0, -0.2, 1.6, 0.55, 2.2, [col[0] * 0.5, col[1] * 0.5, col[2] * 0.6], { h: 0.3 });
  for (const sx of [-0.8, 0.8]) for (const sz of [-1.45, 1.45]) m.box(sx, 0, sz, 0.26, 0.64, 0.64, dark);
  for (const sx of [-0.65, 0.65]) {
    m.box(sx, 0.75, -2.26, 0.42, 0.14, 0.03, [1, 0.06, 0.04], { e: 1.2 });   // lanternas
    m.box(sx, 0.68, 2.26, 0.4, 0.14, 0.03, [1, 0.95, 0.85], { e: 1.6 });     // faróis
  }
  return m;
}

function forestWorld(seed, kind) {
  const r = rng(seed), pick = (a, b) => a + r() * (b - a), ph = () => r() * TAU, int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const L = 480, F = TAU / L;
  const wv = (list, z, x = 0) => list.reduce((s, [a, f, p, k = 0]) => s + a * Math.sin(f * F * z + k * x + p), 0);
  const curvy = pick(0.5, 1.3);
  const road = [[pick(10, 24) * curvy, 1, ph()], [pick(3, 8) * curvy, int(2, 4), ph()], [pick(1, 3) * curvy, int(5, 8), ph()]];
  const swl = [[pick(1, 5), 2, ph()], [pick(0.4, 1.6), int(5, 9), ph()]];
  const hill = [[pick(1, 3.5), 2, ph(), pick(-0.06, 0.06)], [pick(0.6, 1.6), int(4, 6), ph(), pick(-0.12, 0.12)],
    [pick(0.3, 0.8), int(10, 16), ph(), pick(-0.25, 0.25)]];
  const lift = pick(0.3, 2), half = pick(3.4, 4.4);
  const roadX = z => wv(road, z), swell = z => wv(swl, z);
  function groundU(u, z) {                                          // altura a u metros do meio da estrada/rio
    const d = Math.abs(u), x = roadX(z) + u, s = Math.min(1, Math.max(0, (d - half) / 28));
    const hills = (wv(hill, z, x) + lift) * s * s;
    if (d < half) return swell(z) + 0.06 * (1 - (d / half) ** 2);
    return swell(z) - 0.35 * Math.exp(-((d - half - 0.9) ** 2) / 0.25) + hills;
  }

  const m = new Mesh();
  const inner = [0, 1.4, half - 0.5, half];
  const outer = [0.6, 1.2, 2.5, 4.5, 8, 13, 20, 29, 41, 56].map(v => half + v).filter(v => v < 70).concat(70);
  const side = [...inner, ...outer], us = [...side.slice(1).map(v => -v).reverse(), ...side];
  const P = (u, z) => [roadX(z) + u, groundU(u, z), z];
  for (let z = 0; z < L - 0.01; z += 3) {                           // chão em faixas, cor variando por face
    for (let i = 0; i < us.length - 1; i++) {
      const u0 = us[i], u1 = us[i + 1], um = Math.abs((u0 + u1) / 2), v = 0.75 + r() * 0.5;
      let col, h;
      if (um < half) { const q = 0.92 + v * 0.1; col = [0.3 * q, 0.23 * q, 0.16 * q]; h = 0.24; }
      else if (um < half + 1.2) { col = [0.16 * v, 0.14 * v, 0.1 * v]; h = 0.26; }
      else { col = r() < 0.15 ? [0.16 * v, 0.15 * v, 0.08 * v] : [0.07 * v, 0.1 * v, 0.055 * v]; h = 0.18 + r() * 0.04; }
      m.quad(P(u0, z), P(u1, z), P(u1, z + 3), P(u0, z + 3), col, { h });
    }
  }
  const patch = [[1, int(2, 5), ph(), pick(-0.05, 0.05)], [0.6, int(7, 12), ph(), pick(-0.1, 0.1)]];
  const nTrees = int(380, 700), pines = pick(0.5, 1);
  for (let i = 0, tries = 0; i < nTrees && tries < nTrees * 5; tries++) {
    const z = r() * L, u = (r() < 0.5 ? -1 : 1) * (half + 2.2 + r() ** 1.3 * 62);
    if (Math.abs(u) > 68) continue;
    const x = roadX(z) + u;
    if (wv(patch, z, x) < r() * 1.6 - 0.9) continue;                // mata em manchas, com clareiras
    i++;
    const y = groundU(u, z) - 0.2, H = 7 + r() * 9, g = 0.7 + r() * 0.6;
    m.box(x, y, z, 0.35, H * 0.35, 0.35, [0.09, 0.06, 0.04], { h: 0.14 });
    if (r() < pines) {
      const R = H * (0.2 + r() * 0.07), green = [0.04 * g, 0.1 * g, 0.05 * g];
      for (let k = 0; k < 3; k++) m.cone(x, y + H * (0.2 + k * 0.24), z, R * (1 - k * 0.27), H * (0.42 - k * 0.05), 7, green, { h: 0.1 });
    } else {
      const R = H * (0.28 + r() * 0.1);
      m.blob(x, y + H * 0.6, z, R, R * 0.85, R, [0.06 * g, 0.12 * g, 0.04 * g], { h: 0.11 }, r);
    }
  }
  for (let i = int(20, 80); i--;) {                                 // pedras
    const z = r() * L, u = (r() < 0.5 ? -1 : 1) * (half + 1.5 + r() * 30), R = 0.4 + r() * 1.4, g = 0.15 + r() * 0.1;
    m.blob(roadX(z) + u, groundU(u, z) + R * 0.2, z, R * 1.3, R * 0.7, R, [g, g, g * 1.05], { h: 0.22 }, r);
  }
  for (let z = 0; z < L; z += 24) for (const sd of [-1, 1]) {   // balizas com olho-de-gato
    const u = sd * (half + 0.7), x = roadX(z) + u, y = groundU(u, z);
    m.box(x, y, z, 0.12, 1.0, 0.12, [0.5, 0.5, 0.48], { h: 0.2 });
    m.box(x, y + 0.78, z, 0.13, 0.12, 0.13, sd > 0 ? [1, 0.5, 0.1] : [1, 0.15, 0.1], { m: 2, h: 0.2 });
  }
  const animals = [];
  if (kind === 'thermal') for (let i = 0; i < 9; i++) {             // bichos na beira do mato (quentes)
    const z = (i + r() * 0.6) * L / 9, u = (r() < 0.5 ? -1 : 1) * (half + 2 + r() * 10), x = roadX(z) + u, y = groundU(u, z);
    const c = [0.3, 0.2, 0.12];
    m.box(x, y + 0.75, z, 0.45, 0.5, 1.2, c, { h: 0.86 });
    for (const lx of [-0.15, 0.15]) for (const lz of [-0.45, 0.45]) m.box(x + lx, y, z + lz, 0.1, 0.78, 0.1, c, { h: 0.8 });
    m.box(x, y + 1.1, z + 0.62, 0.18, 0.45, 0.2, c, { h: 0.86 });
    m.box(x, y + 1.45, z + 0.78, 0.2, 0.22, 0.38, c, { h: 0.92 });
    animals.push([x, y + 1, z]);
  }
  const world = { L, roadX, groundU, half, animals, terrain: upload(m) };
  world.meshes = [world.terrain];
  world.car = upload(jeep([0.2, 0.21, 0.22]));
  world.meshes.push(world.car);
  return world;
}

function cityWorld(seed, tint) {
  const r = rng(seed), pick = (a, b) => a + r() * (b - a), L = 600, m = new Mesh();
  const neon = [tint, [1, 0.17, 0.84], [0.15, 0.9, 1], [1, 0.55, 0.1], [0.5, 1, 0.3]];
  for (let z = 0; z < L; z += 20) m.quad([-11, 0, z], [11, 0, z], [11, 0, z + 20], [-11, 0, z + 20], [0.03, 0.03, 0.035], { m: 3, h: 0.3 });
  m.box(0, 0, L / 2, 0.5, 0.85, L, [0.2, 0.2, 0.21]);                // mureta central
  for (const sd of [-1, 1]) {
    m.box(sd * 13.25, 0, L / 2, 4.5, 0.18, L, [0.07, 0.07, 0.08]);   // calçada
    const ex = sd * 10.6;
    m.quad([ex - 0.08, 0.015, 0], [ex + 0.08, 0.015, 0], [ex + 0.08, 0.015, L], [ex - 0.08, 0.015, L], [0.7, 0.7, 0.7], { e: 0.15 });
    for (let z = 0; z < L; z += 12) for (const lx of [3.7, 7.4]) {
      const x = sd * lx;
      m.quad([x - 0.08, 0.015, z], [x + 0.08, 0.015, z], [x + 0.08, 0.015, z + 4], [x - 0.08, 0.015, z + 4], [0.75, 0.75, 0.75], { e: 0.2 });
    }
    for (let z = 0; z < L; z += 30) {                                // postes (a luz vem do shader)
      m.box(sd * 11.6, 0, z, 0.2, 9, 0.2, [0.15, 0.15, 0.16]);
      m.box(sd * 10.9, 8.9, z, 1.6, 0.15, 0.2, [0.15, 0.15, 0.16]);
      m.box(sd * 10.2, 8.75, z, 0.6, 0.15, 0.35, [1, 0.8, 0.5], { e: 1.5 });
    }
    const facade = uo => (p, nx) => [Math.abs(nx) > 0.5 ? p[2] + uo : p[0] + uo, p[1]];
    for (let z = 2; z < L - 14;) {                                   // prédios da avenida
      const wz = Math.min(pick(12, 34), L - 2 - z), fx = 16 + r() * 4, dep = pick(12, 30), H = 10 + r() ** 2 * 110, g = 0.035 + r() * 0.04;
      m.box(sd * (fx + dep / 2), 0, z + wz / 2, dep, H, wz, [g, g * 1.02, g * 1.15], { m: 1, uv: facade(r() * 500), h: 0.3, top: { h: 0.25 } });
      const hs = pick(4, 12);
      if (r() < 0.45 && H > hs + 5) {                                // letreiro de neon
        const zc = z + pick(1.5, wz - 1.5), y0 = pick(3, Math.max(3.5, Math.min(H - hs - 1, 24))), xs = sd * (fx - 0.1);
        m.quad([xs, y0, zc - 0.5], [xs, y0, zc + 0.5], [xs, y0 + hs, zc + 0.5], [xs, y0 + hs, zc - 0.5], neon[Math.floor(r() * neon.length)], { e: 1.3 });
      }
      if (H > 60) m.box(sd * (fx + dep / 2), H, z + wz / 2, 0.5, 0.5, 0.5, [1, 0.1, 0.1], { e: 1.5 });
      z += wz + pick(3, 14);
    }
    for (let z = 0; z < L - 30;) {                                   // horizonte de arranha-céus
      const wz = pick(20, 50), fx = 55 + r() * 70, H = 40 + r() ** 1.5 * 170, g = 0.03 + r() * 0.03;
      m.box(sd * (fx + 15), 0, z + wz / 2, 30, H, wz, [g, g, g * 1.2], { m: 1, uv: facade(r() * 500), h: 0.28, top: { h: 0.25 } });
      z += wz + pick(5, 30);
    }
  }
  const cars = [[0.6, 0.05, 0.05], [0.8, 0.8, 0.82], [0.05, 0.05, 0.06], [0.1, 0.2, 0.5], [0.45, 0.45, 0.47]].map(c => upload(sedan(c)));
  const world = { L, city: upload(m), cars, ahead: Array.from({ length: 6 }, () => [r() * 260, pick(-4, 6)]),
    oncoming: Array.from({ length: 9 }, () => r() * 400) };
  world.meshes = [world.city, ...cars];
  return world;
}

// ---------- cenas ----------

// Rali na terra: estrada de chão no meio do pinheiral à noite, seguindo um 4x4 que levanta poeira
function dust(ctx, w, h, cam, W, t, carZ) {
  for (let i = 0; i < 34; i++) {
    const ph = t * 0.9 + i / 34, a = ph % 1, te = t - a * 2.2, cyc = Math.floor(ph);
    const cz = carZ(te) - 2.3 - a * 1.2, u = 0.8 + (hash(i + cyc * 37) - 0.5) * a * 3.5;
    const p = project(cam, [W.roadX(cz) + u, W.groundU(u, cz) + 0.3 + a * 1.7, cz], w, h);
    if (!p) continue;
    const rad = (0.4 + a * 1.8) * FY * h / 2 / p[2];
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
    g.addColorStop(0, `rgba(200, 180, 140, ${0.22 * (1 - a)})`); g.addColorStop(1, 'rgba(200, 180, 140, 0)');
    ctx.fillStyle = g; ctx.fillRect(p[0] - rad, p[1] - rad, 2 * rad, 2 * rad);
  }
}
export const rally = scene(seed => forestWorld(seed, 'road'), (W, ctx, w, h, t) => {
  const z = t * 15, u = 0.8;
  const cam = { x: W.roadX(z) + u, y: W.groundU(u, z) + 1.45 + 0.04 * Math.sin(t * 13) + 0.025 * Math.sin(t * 23), z,
    yaw: Math.atan2(W.roadX(z + 14) - W.roadX(z), 14), pitch: 0.05 + 0.01 * Math.sin(t * 7),
    roll: 0.012 * Math.sin(t * 1.7) + 0.006 * Math.sin(t * 11) };
  sky(ctx, w, h, cam, '#02040d', '#141f36', '#0b1220');
  begin(ctx, cam, t, {});
  draw(W.terrain, { wrap: W.L });
  const carZ = tt => tt * 15 + 17 + 4 * Math.sin(tt * 0.37), cz = carZ(t);
  draw(W.car, { off: [W.roadX(cz) + u, W.groundU(u, cz) + 0.03 * Math.sin(t * 17), cz],
    yaw: Math.atan2(W.roadX(cz + 3) - W.roadX(cz - 3), 6) });
  finish(ctx, w, h, 0.35);
  dust(ctx, w, h, cam, W, t, carZ);
});

// Visão térmica: mesma trilha vista por uma câmera térmica no teto; bichos e o carro da frente brilham
const ironCss = x => css([Math.min(1, Math.max(0, (x - 0.05) / 0.5)), Math.min(1, Math.max(0, (x - 0.4) / 0.45)),
  Math.max(0, (x - 0.8) / 0.2) + 0.45 * Math.min(1, x / 0.25) * (1 - Math.min(1, Math.max(0, (x - 0.3) / 0.25)))]);
let grain = null;
export const thermal = scene(seed => forestWorld(seed, 'thermal'), (W, ctx, w, h, t) => {
  const z = t * 11, u = 0.6;
  const cam = { x: W.roadX(z) + u, y: W.groundU(u, z) + 2.3 + 0.03 * Math.sin(t * 11), z,
    yaw: Math.atan2(W.roadX(z + 14) - W.roadX(z), 14) + 0.06 * Math.sin(t * 0.23), pitch: 0.07, roll: 0 };
  ctx.fillStyle = ironCss(0.04); ctx.fillRect(0, 0, w, h);
  begin(ctx, cam, t, { mode: 1 });
  draw(W.terrain, { wrap: W.L });
  const cz = z + 20 + 5 * Math.sin(t * 0.31);
  draw(W.car, { off: [W.roadX(cz) + u, W.groundU(u, cz), cz], yaw: Math.atan2(W.roadX(cz + 3) - W.roadX(cz - 3), 6) });
  finish(ctx, w, h, 0.25);

  grain ??= Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  if (!grain.done) {                                                // granulado do sensor
    const g = grain.getContext('2d'), img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data.set([v, v, v, 255], i); }
    g.putImageData(img, 0, 0); grain.done = true;
  }
  ctx.save();
  ctx.globalAlpha = 0.07; ctx.globalCompositeOperation = 'overlay';
  ctx.translate(-Math.random() * 128, -Math.random() * 128);
  ctx.fillStyle = ctx.createPattern(grain, 'repeat'); ctx.fillRect(0, 0, w + 128, h + 128);
  ctx.restore();
  ctx.fillStyle = '#000'; ctx.globalAlpha = 0.12;
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;

  const fs = Math.max(10, h * 0.055);
  ctx.font = `${fs}px monospace`; ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.2;
  const mark = (p, label, s) => {                                    // colchetes em volta do alvo quente
    const b = s * 0.3;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = p[0] + sx * s / 2, y = p[1] + sy * s / 2;
      ctx.moveTo(x, y - sy * b); ctx.lineTo(x, y); ctx.lineTo(x - sx * b, y);
    }
    ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillText(label, p[0] + s / 2 + 6, p[1] - s / 2 + fs * 0.5);
  };
  for (const [ax, ay, az] of W.animals) {
    const dz = ((az - z + 30) % W.L + W.L) % W.L - 30, p = project(cam, [ax, ay, z + dz], w, h);
    if (p && p[2] > 4 && p[2] < 90 && p[0] > w * 0.12 && p[0] < w * 0.7) mark(p, `ANIMAL ${(37.5 + hash(az) * 1.6).toFixed(1).replace('.', ',')}°C`, Math.max(14, 260 / p[2]));
  }
  const cp = project(cam, [W.roadX(cz) + u, W.groundU(u, cz) + 0.5, cz - 2.1], w, h);
  if (cp) mark(cp, `${(71 + 4 * Math.sin(t * 0.7)).toFixed(1).replace('.', ',')}°C`, Math.max(16, 360 / cp[2]));
  const cx = w / 2, cy = h / 2;                                     // mira
  ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 14, cy);
  ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 14); ctx.stroke();
  ctx.globalAlpha = 0.9; ctx.textAlign = 'left';
  ctx.fillText('TÉRMICA · BRANCO QUENTE', w * 0.12, h * 0.2);
  ctx.fillText(`${(14 + 2 * Math.sin(t * 0.1)).toFixed(1).replace('.', ',')}°C AMB`, w * 0.12, h * 0.2 + fs * 1.4);
  const bx = w * 0.86, bh = h * 0.5, by = h * 0.25, bw = Math.max(6, w * 0.01);
  const bar = ctx.createLinearGradient(0, by + bh, 0, by);
  for (let k = 0; k <= 10; k++) bar.addColorStop(k / 10, ironCss(k / 10));
  ctx.fillStyle = bar; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
  ctx.fillText('80°', bx - 6, by + fs * 0.4); ctx.fillText('0°', bx - 6, by + bh - fs * 0.4);
  ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
});

// Cidade à noite: avenida com asfalto molhado, prédios com janelas acesas, neon e trânsito
export const city = scene((seed, color) => cityWorld(seed, rgb(color)), (W, ctx, w, h, t) => {
  const v = 22, z = t * v;
  const cam = { x: 5.6 + 0.2 * Math.sin(t * 0.35), y: 1.2, z, yaw: 0.01 * Math.sin(t * 0.3), pitch: 0.025, roll: 0 };
  sky(ctx, w, h, cam, '#03020c', '#2a1430', null);
  begin(ctx, cam, t, { fogCol: [0.16, 0.08, 0.19], fogDen: 0.0055, amb: [0.03, 0.025, 0.05], moonCol: [0.03, 0.03, 0.05],
    head: 0.2, lampGap: 30 });
  draw(W.city, { wrap: W.L });
  W.ahead.forEach(([b, dv], i) => {                                  // mesmo sentido (o da nossa faixa fica a uns 25 m)
    const lane = [1.9, 5.6, 9.2][i % 3];
    const dz = lane === 5.6 ? 25 + 6 * Math.sin(t * 0.2 + i) : ((b + dv * t) % 260 + 260) % 260 - 30;
    draw(W.cars[i % W.cars.length], { off: [lane, 0, z + dz] });
  });
  W.oncoming.forEach((b, i) => {                                     // contramão
    const dz = ((b - (v + 20) * t) % 400 + 400) % 400 - 30;
    draw(W.cars[(i + 2) % W.cars.length], { off: [-[1.9, 5.6, 9.2][i % 3], 0, z + dz], yaw: Math.PI });
  });
  finish(ctx, w, h, 0.5);
});
