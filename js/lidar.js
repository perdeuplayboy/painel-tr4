// Visão do drone: nuvem de pontos tipo LiDAR (terreno, estrada, pinheiros) em WebGL puro.
// Desenha numa tela WebGL escondida e copia para o canvas 2D do player, com o HUD por cima.

const L = 320;                                   // o mundo se repete a cada L metros (sem emenda)
const F = Math.PI * 2 / L;
const roadX = z => 14 * Math.sin(F * z) + 6 * Math.sin(3 * F * z + 1) + 3 * Math.sin(5 * F * z + 2);
const swell = z => 3 * Math.sin(2 * F * z) + 1.5 * Math.sin(7 * F * z + 0.5);   // sobe e desce da estrada
function ground(x, z) {
  const d = Math.abs(x - roadX(z));
  const hills = 5 * Math.sin(2 * F * z + x * 0.05) + 3.5 * Math.sin(5 * F * z - x * 0.09 + 1) +
    1.8 * Math.sin(11 * F * z + x * 0.21 + 2) + 0.6 * Math.sin(x * 0.7 + z * 0.4);
  const side = Math.min(1, Math.max(0, (d - 5) / 14));             // estrada plana, morros fora dela
  const wall = Math.max(0, d - 38) ** 1.5 * 0.12;                   // serra nas pontas
  return swell(z) + (hills + 4) * side * side + wall;
}

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// tipos de ponto: 0 chão, 1 estrada, 2 faixa/borda, 3 árvore
function buildCloud() {
  const r = rng(7), P = [];
  const add = (x, y, z, k) => P.push(x, y, z, k, r());
  for (let z = 0; z < L; z += 0.95) {
    for (let x = -75; x <= 75; x += 0.95) {
      const px = x + (r() - 0.5) * 0.8, pz = z + (r() - 0.5) * 0.8;
      if (Math.abs(px - roadX(pz)) < 3.6) continue;
      add(px, ground(px, pz) + (r() - 0.5) * 0.15, pz, 0);
    }
  }
  for (let z = 0; z < L; z += 0.45) {
    const c = roadX(z);
    for (let d = -3.5; d <= 3.5; d += 0.45) {
      const x = c + d + (r() - 0.5) * 0.2, edge = Math.abs(Math.abs(d) - 3.2) < 0.25;
      const dash = Math.abs(d) < 0.2 && z % 9 < 4.5;
      add(x, ground(x, z) + 0.05, z, edge || dash ? 2 : 1);
    }
  }
  for (let i = 0; i < 320; i++) {                                    // pinheiros em camadas
    const z = r() * L, sd = r() < 0.5 ? -1 : 1, x = roadX(z) + sd * (6.5 + r() ** 1.6 * 55);
    const base = ground(x, z), H = 6 + r() * 8, R = H * (0.24 + r() * 0.08);
    for (let k = 0; k < 18; k++) add(x + (r() - 0.5) * 0.3, base + r() * H * 0.25, z + (r() - 0.5) * 0.3, 3);
    const n = 90 + H * 10;
    for (let k = 0; k < n; k++) {
      const v = r(), tier = 0.62 + 0.38 * ((v * 5) % 1);
      const rad = R * (1 - v) * tier * (0.75 + r() * 0.25), a = r() * Math.PI * 2;
      add(x + Math.cos(a) * rad, base + H * (0.18 + v * 0.82), z + Math.sin(a) * rad, 3);
    }
  }
  return new Float32Array(P);
}

const VS = `
attribute vec3 pos; attribute float kind; attribute float seed;
uniform vec3 cam; uniform vec2 rot; uniform float pitch, fy, aspect, px, time;
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
  vec3 p = vec3(pos.x - cam.x, pos.y - cam.y, mod(pos.z - cam.z + 30.0, ${L}.0) - 30.0);
  float horiz = length(p.xz);
  vec3 c = vec3(p.x * rot.x - p.z * rot.y, p.y, p.x * rot.y + p.z * rot.x);
  float cp = cos(pitch), sp = sin(pitch);
  float zc = -c.y * sp + c.z * cp, yc = c.y * cp + c.z * sp;
  gl_Position = vec4(c.x * fy / aspect, yc * fy, 0.0, zc);
  float fog = 1.0 - smoothstep(70.0, 215.0, zc);
  float near = smoothstep(1.5, 8.0, zc);
  float h = (pos.y + 2.0) / 26.0;
  vec3 col = turbo(0.08 + h * 0.85);
  if (kind == 1.0) col = vec3(0.32, 0.36, 0.42);
  if (kind == 2.0) col = vec3(1.0, 0.95, 0.8);
  float ring = mod(time * 55.0, 240.0);                           // pulso do escaneamento
  float band = exp(-pow((horiz - ring) / 2.5, 2.0)) * (1.0 - ring / 240.0);
  float flick = 0.85 + 0.15 * sin(seed * 91.0 + time * 4.0);
  vCol = col * flick + vec3(0.7, 0.95, 1.0) * band * 1.4;
  vA = fog * near * (kind == 3.0 ? 0.95 : 0.75);
  gl_PointSize = zc > 0.5 ? clamp(px * 0.42 / zc, 1.0, 5.0) : 0.0;
}`;
const FS = `
precision mediump float;
varying vec3 vCol; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vCol, vA * (1.0 - d * 1.4));
}`;

let gl = null, glCanvas = null, prog = null, count = 0, U = {}, failed = false;
function init() {
  glCanvas = document.createElement('canvas');
  gl = glCanvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) { failed = true; return; }
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  const data = buildCloud();
  count = data.length / 5;
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  [['pos', 3, 0], ['kind', 1, 3], ['seed', 1, 4]].forEach(([name, n, off]) => {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 20, off * 4);
  });
  for (const u of ['cam', 'rot', 'pitch', 'fy', 'aspect', 'px', 'time']) U[u] = gl.getUniformLocation(prog, u);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);         // pontos somam brilho
  gl.disable(gl.DEPTH_TEST);
}

export function drone(ctx, w, h, t, color) {
  if (!gl && !failed) { try { init(); } catch (e) { console.warn('lidar', e); failed = true; } }
  ctx.fillStyle = '#010307'; ctx.fillRect(0, 0, w, h);
  if (failed) return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (glCanvas.width !== W || glCanvas.height !== H) { glCanvas.width = W; glCanvas.height = H; }
  gl.viewport(0, 0, W, H);
  gl.clearColor(0.004, 0.012, 0.028, 1); gl.clear(gl.COLOR_BUFFER_BIT);

  const z = t * 11, look = z + 25;
  const cx = roadX(z) * 0.85 + Math.sin(t * 0.13) * 4;               // segue a estrada, meio de lado
  const yaw = Math.atan2(roadX(look) - cx, look - z) * 0.8;
  const alt = 21 + Math.sin(t * 0.21) * 3;
  const cy = Math.max(ground(cx, z), swell(z)) + alt;
  gl.uniform3f(U.cam, cx, cy, z);
  gl.uniform2f(U.rot, Math.cos(yaw), Math.sin(yaw));
  gl.uniform1f(U.pitch, 0.3 + Math.sin(t * 0.17) * 0.04);
  gl.uniform1f(U.fy, 1 / Math.tan(0.36));
  gl.uniform1f(U.aspect, W / H);
  gl.uniform1f(U.px, H);
  gl.uniform1f(U.time, t);
  gl.drawArrays(gl.POINTS, 0, count);
  ctx.drawImage(glCanvas, 0, 0, w, h);
  hud(ctx, w, h, t, color, alt, yaw);
}

function hud(ctx, w, h, t, color, alt, yaw) {
  const mx = w * 0.11, my = h * 0.2, b = h * 0.12, fs = Math.max(10, h * 0.055);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
  for (const [x, y, sx, sy] of [[mx, my, 1, 1], [w - mx, my, -1, 1], [mx, h - my, 1, -1], [w - mx, h - my, -1, -1]]) {
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
  ctx.fillText(`ALT ${alt.toFixed(1).replace('.', ',')} m`, mx + h * 0.04, my + h * 0.04);
  ctx.fillText(`VEL 40 km/h`, mx + h * 0.04, my + h * 0.04 + fs * 1.3);
  ctx.fillText(`RUMO ${String(hdg).padStart(3, '0')}°`, mx + h * 0.04, my + h * 0.04 + fs * 2.6);
  ctx.textAlign = 'right';
  ctx.fillText('LIDAR · VARREDURA', w - mx - h * 0.04, my + h * 0.04);
  ctx.fillText(`${(1.2 + t * 0.047).toFixed(2).replace('.', ',')} M pts`, w - mx - h * 0.04, my + h * 0.04 + fs * 1.3);
  if (Math.sin(t * 5) > 0) {
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(w - mx - h * 0.04 - fs * 3.2, h - my - h * 0.04 - fs * 0.45, fs * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#d8f6ff'; ctx.textBaseline = 'bottom';
  ctx.fillText('REC', w - mx - h * 0.04, h - my - h * 0.04);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic';
}
