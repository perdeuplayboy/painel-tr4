// Spotify: mostra o que está tocando na sua conta (em qualquer aparelho, ex.: seu celular)
// e controla com ⏮ ⏯ ⏭ (controle exige Premium). Login PKCE direto no navegador, sem
// servidor; o "app" é criado uma vez em developer.spotify.com e só o Client ID vem para cá.

const AUTH = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomStr = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

export class Spotify {
  constructor({ load, save }) {
    Object.assign(this, { load, save, tok: load('spotify', null), now: null, err: '', busy: false });
  }

  // endereço de retorno do login: a própria página do painel, sem parâmetros
  get redirect() { return new URL('./', location.href).href; }
  get connected() { return !!this.tok?.refresh; }

  async login(clientId) {
    const verifier = randomStr(48), state = randomStr(12);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    this.save('spotifyAuth', { verifier, state, clientId });
    location.href = `${AUTH}/authorize?` + new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: this.redirect,
      code_challenge_method: 'S256', code_challenge: challenge, state, scope: SCOPES,
    });
  }

  // volta do login com ?code=…&state=… (ou ?error=…)
  async finishLogin() {
    const p = new URLSearchParams(location.search);
    if (!p.has('code') && !p.has('error')) return false;
    history.replaceState(null, '', location.pathname);
    const a = this.load('spotifyAuth', null);
    this.save('spotifyAuth', null);
    if (p.has('error') || !a || p.get('state') !== a.state) { this.err = 'login cancelado'; return false; }
    await this.token({
      grant_type: 'authorization_code', code: p.get('code'), redirect_uri: this.redirect,
      client_id: a.clientId, code_verifier: a.verifier,
    }, a.clientId);
    return true;
  }

  async token(body, clientId) {
    const r = await fetch(`${AUTH}/api/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.error === 'invalid_grant') this.logout();        // acesso revogado: precisa entrar de novo
      throw new Error(j.error_description || j.error || `erro ${r.status}`);
    }
    this.tok = {
      access: j.access_token, refresh: j.refresh_token || this.tok?.refresh,
      exp: Date.now() + (j.expires_in - 60) * 1000, clientId,
    };
    this.save('spotify', this.tok);
  }

  logout() { this.tok = null; this.now = null; this.save('spotify', null); }

  async api(method, path, retry = true) {
    if (!this.connected) throw new Error('não conectado');
    if (Date.now() > this.tok.exp) {
      await this.token({ grant_type: 'refresh_token', refresh_token: this.tok.refresh, client_id: this.tok.clientId }, this.tok.clientId);
    }
    const r = await fetch(API + path, {
      method, headers: { Authorization: `Bearer ${this.tok.access}` }, signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401 && retry) { this.tok.exp = 0; return this.api(method, path, false); }
    let j = null;
    try { j = await r.json(); } catch {}                       // 204 e alguns 200 vêm sem corpo
    if (!r.ok) throw new Error(j?.error?.reason || j?.error?.message || `erro ${r.status}`);
    return j;
  }

  async poll() {
    if (!this.connected || this.busy) return;
    this.busy = true;
    try {
      const j = await this.api('GET', '/me/player?additional_types=episode');
      const it = j?.item;
      const imgs = it?.album?.images || it?.images || [];
      this.now = it ? {
        id: it.id, title: it.name,
        artist: (it.artists || (it.show ? [it.show] : [])).map(a => a.name).join(', '),
        art: (imgs[1] || imgs[0])?.url || '',
        playing: j.is_playing, progress: j.progress_ms || 0, duration: it.duration_ms || 0,
        device: j.device?.name || '', at: Date.now(),
      } : null;
      this.err = '';
    } catch (e) {
      this.err = e.name === 'TimeoutError' ? 'sem internet?' : e.message;
    } finally {
      this.busy = false;
    }
  }

  position() {
    const m = this.now;
    if (!m) return 0;
    return Math.min(m.duration, m.progress + (m.playing ? Date.now() - m.at : 0));
  }

  async control(cmd) {
    const call = {
      next: ['POST', '/me/player/next'], prev: ['POST', '/me/player/previous'],
      play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'],
    }[cmd];
    try {
      await this.api(...call);
      if (this.now && (cmd === 'play' || cmd === 'pause')) {
        this.now.progress = this.position(); this.now.at = Date.now(); this.now.playing = cmd === 'play';
      }
      this.err = '';
      setTimeout(() => this.poll(), 500);
    } catch (e) {
      this.err = /NO_ACTIVE_DEVICE/i.test(e.message) ? 'abra o Spotify no celular'
        : /PREMIUM/i.test(e.message) ? 'controle exige Premium' : e.message;
    }
  }
}
