// Toca a lista do standby e da página Vídeos, em ordem aleatória: vídeos (até acabar),
// GIF/WebP animados e animações retrô (ficam um tempo fixo, pois não têm fim).
import { ANIMS } from './anims.js';

export class Player {
  // box: elemento onde as mídias entram; items(): [{ kind: 'video'|'image'|'anim', url?, anim?, weight? }] (weight: chance relativa, padrão 1)
  // opts: { clipMs(): tempo de GIF/animação, color(): cor das animações }
  constructor(box, items, opts) {
    Object.assign(this, { box, items, opts, on: false, cur: null, last: -1, timer: 0, raf: 0 });
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    this.img = document.createElement('img');
    this.img.alt = '';
    this.canvas = document.createElement('canvas');
    for (const el of [this.canvas, this.img, this.video]) { el.className = 'media'; el.hidden = true; box.prepend(el); }
    this.video.addEventListener('ended', () => this.next());
    this.video.addEventListener('error', () => { if (this.on && this.cur?.kind === 'video') setTimeout(() => this.next(), 500); });
  }

  get empty() { return !this.items().length; }

  start() { if (!this.on) { this.on = true; this.next(); } }

  // começa por um item escolhido (ex.: "ver" uma animação nas configurações)
  show(item) { this.on = true; this.next(item); }

  stop() {
    if (!this.on) return;
    this.on = false;
    this.clear();
    this.cur = null;
  }

  clear() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.img.removeAttribute('src');
    this.video.hidden = this.img.hidden = this.canvas.hidden = true;
  }

  pick(list, avoid) {                                                     // sorteio pelo peso, sem repetir o mesmo seguido
    const weights = list.map((it, k) => (list.length > 1 && k === avoid ? 0 : it.weight ?? 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
    while (i < list.length - 1 && (r -= weights[i]) >= 0) i++;
    return i;
  }

  next(chosen) {
    if (!this.on) return;
    this.clear();
    const list = this.items();
    if (!chosen && !list.length) { this.cur = null; return; }
    const same = (a, b) => !!a && !!b && a.kind === b.kind && a.anim === b.anim && a.url === b.url;
    let i = this.up ? list.findIndex(x => same(x, this.up)) : -1;           // o que já tinha sido sorteado como o próximo
    if (i < 0 || (i === this.last && list.length > 1)) i = this.pick(list, this.last);
    this.last = i;
    const it = this.cur = chosen || list[i];
    // já sorteia o seguinte e pede o que ele precisa da internet, para ele abrir pronto quando chegar a vez
    this.up = list.length > 1 ? list[this.pick(list, i)] : null;
    if (this.up?.kind === 'anim') { try { ANIMS[this.up.anim]?.prep?.(); } catch {} }
    if (it.kind === 'video') {
      this.video.hidden = false;
      this.video.muted = !this.opts.sound?.();                          // som dos vídeos: botão no standby
      this.video.volume = this.opts.volume?.() ?? 1;
      this.video.src = it.url;
      this.video.play().catch(() => {});
      return;
    }
    if (it.kind === 'image') { this.img.hidden = false; this.img.src = it.url; }
    else { this.canvas.hidden = false; this.animate(ANIMS[it.anim]); }
    const whole = it.kind === 'anim' && ANIMS[it.anim].untilDone;    // algumas animações vão até o fim (com limite)
    this.timer = setTimeout(() => this.next(), whole ? 4 * 60000 : this.opts.clipMs());
  }

  animate(draw) {
    const c = this.canvas, ctx = c.getContext('2d'), t0 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);                               // sem sobra da animação anterior
    let lastFrame = 0;
    const frame = now => {
      this.raf = requestAnimationFrame(frame);
      if (now - lastFrame < 30) return;                                   // ~30 quadros/s bastam
      lastFrame = now;
      const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (draw(ctx, w, h, (now - t0) / 1000, this.opts.color()) === true) this.next();   // a animação terminou
    };
    this.raf = requestAnimationFrame(frame);
  }
}
