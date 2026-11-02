// Toca a lista do standby e da página Vídeos, em ordem aleatória: vídeos (até acabar),
// GIF/WebP animados e animações retrô (ficam um tempo fixo, pois não têm fim).
import { ANIMS } from './anims.js';

export class Player {
  // box: elemento onde as mídias entram; items(): [{ kind: 'video'|'image'|'anim', url?, anim? }]
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

  next() {
    if (!this.on) return;
    this.clear();
    const list = this.items();
    if (!list.length) { this.cur = null; return; }
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.last) i = (i + 1) % list.length;   // não repete o mesmo seguido
    this.last = i;
    const it = this.cur = list[i];
    if (it.kind === 'video') {
      this.video.hidden = false;
      this.video.src = it.url;
      this.video.play().catch(() => {});
      return;
    }
    if (it.kind === 'image') { this.img.hidden = false; this.img.src = it.url; }
    else { this.canvas.hidden = false; this.animate(ANIMS[it.anim]); }
    this.timer = setTimeout(() => this.next(), this.opts.clipMs());
  }

  animate(draw) {
    const c = this.canvas, ctx = c.getContext('2d'), t0 = performance.now();
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
      draw(ctx, w, h, (now - t0) / 1000, this.opts.color());
    };
    this.raf = requestAnimationFrame(frame);
  }
}
