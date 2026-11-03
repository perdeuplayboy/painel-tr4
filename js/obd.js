// Fontes de dados do carro: simulação e ELM327 via Bluetooth Low Energy (Web Bluetooth).
// Protocolo, PIDs, simulação e cálculo de consumo portados do firmware ESP32 de
// rodrigo-brito/car-metrics (obd_elm.h, obd_ble.h, obd_mock.h, obd_data.h).

export const State = {
  IDLE: 'desconectado', CONNECTING: 'conectando', INIT: 'inicializando',
  WAIT_ECU: 'sem ECU (ignição?)', CONNECTED: 'conectado', MOCK: 'simulação', ERROR: 'erro',
};

// Relação ar/combustível estequiométrica e densidade (g/L).
// Gasolina C (BR, ~27% etanol) 13.2 / 750 · Etanol hidratado 9.0 / 790
export const FUELS = {
  gasolina: { name: 'Gasolina', afr: 13.2, density: 750 },
  etanol:   { name: 'Etanol',   afr: 9.0,  density: 790 },
};

export function emptyData() {
  return {
    rpm: NaN, speedKmh: NaN, coolantC: NaN, intakeC: NaN, mafGs: NaN, loadPct: NaN,
    throttlePct: NaN, batteryV: NaN, mapKpa: NaN, timingDeg: NaN, stftPct: NaN, ltftPct: NaN,
    o2s1V: NaN, o2s2V: NaN, fuelSystem: -1, milOn: false, dtcCount: 0, distMilKm: NaN,
    obdStd: '', vin: '',
    dtcs: null,          // null = ainda não lidos
    fuelLph: NaN, kmPerL: NaN,
    updatedAt: 0,
  };
}

export function emptyTrip() {
  return { distanceKm: 0, fuelL: 0, maxSpeed: 0, movingMs: 0, startAt: Date.now() };
}

export const tripAvgKmL = t => t.fuelL > 0.01 ? t.distanceKm / t.fuelL : NaN;
export const tripAvgSpeed = t => t.movingMs > 1000 ? t.distanceKm / (t.movingMs / 3600000) : NaN;

// Deriva consumo e integra a viagem. A TR4 não informa MAF: estima o fluxo de ar por
// speed-density (MAP, rpm, temperatura de admissão, cilindrada e eficiência volumétrica).
export function deriveAndIntegrate(d, trip, dtMs, fuel, displacementL = 2.0, ve = 0.85) {
  let maf = d.mafGs;
  if (Number.isNaN(maf) && !Number.isNaN(d.mapKpa) && d.rpm > 0) {
    const iatK = (Number.isNaN(d.intakeC) ? 30 : d.intakeC) + 273.15;
    const airDensity = d.mapKpa * 1000 / (287 * iatK);                        // kg/m³
    maf = d.rpm / 60 / 2 * (displacementL / 1000) * airDensity * ve * 1000;   // g/s
  }
  if (!Number.isNaN(maf)) {
    d.fuelLph = maf * 3600 / (fuel.afr * fuel.density);
    d.kmPerL = d.speedKmh > 2 && d.fuelLph > 0.01 ? d.speedKmh / d.fuelLph : NaN;
  } else {
    d.fuelLph = NaN; d.kmPerL = NaN;
  }
  const dtH = dtMs / 3600000;
  let dKm = 0, dL = 0;
  if (!Number.isNaN(d.speedKmh) && d.speedKmh < 250) {          // ignora leitura absurda
    dKm = d.speedKmh * dtH;
    trip.distanceKm += dKm;
    if (d.speedKmh > trip.maxSpeed) trip.maxSpeed = d.speedKmh;
    if (d.speedKmh > 2) trip.movingMs += dtMs;
  }
  if (!Number.isNaN(d.fuelLph)) { dL = d.fuelLph * dtH; trip.fuelL += dL; }
  return { dKm, dL };
}

export function fuelSystemName(v) {
  return { 1: 'malha aberta', 2: 'malha fechada', 4: 'aberta (carga)', 8: 'aberta (falha)', 16: 'fechada (falha)' }[v] || '--';
}
function obdStdName(v) {
  return { 1: 'OBD-II (CARB)', 2: 'OBD (EPA)', 3: 'OBD e OBD-II', 4: 'OBD-I', 6: 'EOBD', 7: 'EOBD e OBD-II',
           9: 'EOBD, OBD, OBD-II', 13: 'JOBD' }[v] || 'outra';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// Simulação: ciclo urbano/rodoviário com física simplificada, partida com queda
// de tensão e motor esquentando (sem falhas: não dispara alertas).
export class MockSource {
  constructor() {
    this.d = emptyData();
    this.state = State.MOCK;
    this.protocol = 'simulação';
    this.err = '';
    this.engineOn = false;
    this.crankUntil = 0;
    this.speed = 0; this.target = 0; this.nextChange = 0;
    this.coolant = 32;
    this.last = performance.now();
    this.timer = setInterval(() => this.update(), 150);
    setTimeout(() => this.setEngine(true), 6000);   // dá partida sozinho depois de 6 s
  }
  get name() { return 'Simulação'; }
  stop() { clearInterval(this.timer); }

  setEngine(on) {
    if (on && !this.engineOn) { this.crankUntil = performance.now() + 1200; this.engineOn = true; }
    if (!on) { this.engineOn = false; this.target = 0; }
  }

  pickTarget() {
    const r = Math.random() * 100;
    this.target = r < 15 ? 0 : r < 55 ? rnd(25, 60) : r < 85 ? rnd(60, 95) : rnd(95, 125);
    this.nextChange = performance.now() + rnd(6000, 18000);
  }

  update() {
    const now = performance.now();
    // com a tela apagada o Chrome segura o timer; não deixa o salto de tempo virar física
    const dt = Math.min((now - this.last) / 1000, 0.5);
    this.last = now;
    const d = this.d;
    d.obdStd = 'OBD-II (CARB)'; d.vin = '9BRTR4SIMULACAO01';

    if (!this.engineOn || now < this.crankUntil) {
      const cranking = this.engineOn;
      this.speed = Math.max(0, this.speed - 15 * dt);
      this.coolant += (25 - this.coolant) * 0.0005 * dt;
      Object.assign(d, {
        rpm: cranking ? rnd(180, 280) : 0, speedKmh: this.speed, coolantC: this.coolant, intakeC: 28,
        loadPct: 0, throttlePct: 0, mapKpa: 98, mafGs: NaN, timingDeg: NaN,
        batteryV: cranking ? rnd(10.1, 10.6) : 12.55 + rnd(-0.02, 0.02),
        stftPct: NaN, ltftPct: NaN, o2s1V: NaN, o2s2V: NaN, fuelSystem: -1,
      });
      d.updatedAt = Date.now();
      return;
    }

    if (now > this.nextChange) this.pickTarget();
    const diff = this.target - this.speed;
    const accel = clamp(diff * 0.6, -4.5, 2.5);
    this.speed = Math.max(0, this.speed + accel * 3.6 * dt + rnd(-1, 1) * dt);

    const ratios = [0, 120, 70, 48, 36, 29];        // rpm por km/h, câmbio de 5 marchas
    const s = this.speed;
    const gear = s > 75 ? 5 : s > 50 ? 4 : s > 30 ? 3 : s > 12 ? 2 : 1;
    let rpm = s < 2 ? 800 + rnd(-30, 30) : s * ratios[gear] + rnd(-40, 40);
    if (accel > 0.5) rpm += accel * 600;
    rpm = clamp(rpm, 700, 6200);

    const load = s < 2 ? 0.18 : clamp(0.2 + accel * 0.2 + s / 250, 0.15, 0.95);
    this.coolant += (90 - this.coolant) * 0.04 * dt;
    const t = now / 1000;

    Object.assign(d, {
      rpm, speedKmh: s, coolantC: this.coolant, intakeC: 28 + (s > 40 ? -2 : 3) + rnd(-1, 1),
      mafGs: NaN,                                    // como na TR4: sem MAF, consumo por MAP
      loadPct: load * 100, throttlePct: clamp(load * 100 + 5, 0, 100), mapKpa: 30 + load * 70,
      batteryV: 14.1 + rnd(-0.08, 0.08) - (accel > 1.5 ? 0.2 : 0),
      timingDeg: 8 + load * 20 + (rpm - 800) / 400,
      stftPct: 2 * Math.sin(t / 1.5) + rnd(-1, 1), ltftPct: 3.5 + rnd(-0.3, 0.3),
      o2s1V: 0.45 + 0.4 * Math.sin(t / 0.35), o2s2V: 0.62 + rnd(-0.02, 0.02),
      fuelSystem: this.coolant < 60 ? 1 : accel > 1.8 ? 4 : 2,
      milOn: false, dtcCount: 0, distMilKm: 0,                     // simulação sem falhas (não dispara alerta)
    });
    d.updatedAt = Date.now();
  }

  async requestDtcs() { this.d.dtcs = []; }
  async clearDtcs() { Object.assign(this.d, { milOn: false, dtcCount: 0, dtcs: [] }); return true; }
}

// ---------------------------------------------------------------------------
// ELM327 via BLE. O KONNWEI KW902 usa o serviço FFF0 (FFF1 notify, FFF2 write);
// outros adaptadores comuns usam FFE0/FFE1 ou 18F0/2AF0+2AF1.
const PROFILES = [
  { service: 0xfff0, notify: 0xfff1, write: 0xfff2 },
  { service: 0xffe0, notify: 0xffe1, write: 0xffe1 },
  { service: 0x18f0, notify: 0x2af0, write: 0x2af1 },
];
const enc = new TextEncoder();
const dec = new TextDecoder();
const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');

export class ElmBleSource {
  constructor(log = () => {}) {
    this.log = log;
    this.d = emptyData();
    this.state = State.IDLE;
    this.err = '';
    this.protocol = '';
    this.supported = [0, 0, 0];
    this.device = null;
    this.tx = null;
    this.rxBuf = '';
    this.waiter = null;
    this.queue = Promise.resolve();
    this.running = false;
    this.wantConnected = false;
    this.staticDone = false;
    this.slowIdx = 0;
    this.fastFails = 0;
    this.onDisconnect = () => {
      this.log('conexão Bluetooth caiu');
      this.state = State.ERROR; this.err = 'conexão caiu';
      this.running = false;
      if (this.wantConnected) setTimeout(() => this.reconnect(), 3000);
    };
  }
  get name() { return 'ELM327 BLE'; }
  static available() { return !!navigator.bluetooth; }
  stop() { this.wantConnected = false; this.running = false; try { this.device?.gatt.disconnect(); } catch {} }

  // Precisa de um toque do usuário (exigência do Chrome).
  async pick() {
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        ...PROFILES.map(p => ({ services: [p.service] })),
        { namePrefix: 'KONNWEI' }, { namePrefix: 'OBD' }, { namePrefix: 'V-LINK' }, { namePrefix: 'vLinker' },
      ],
      optionalServices: PROFILES.map(p => p.service),
    });
    return device;
  }

  // Adaptador já autorizado antes: reconecta sem toque, se o Chrome permitir.
  static async remembered(id) {
    if (!navigator.bluetooth?.getDevices) return null;
    const list = await navigator.bluetooth.getDevices();
    return list.find(d => d.id === id) || null;
  }

  async connect(device) {
    if (this.device && this.device !== device) this.device.removeEventListener('gattserverdisconnected', this.onDisconnect);
    this.device = device;
    this.wantConnected = true;
    device.removeEventListener('gattserverdisconnected', this.onDisconnect);
    device.addEventListener('gattserverdisconnected', this.onDisconnect);
    await this.open();
  }

  async reconnect() {
    if (!this.wantConnected || !this.device || this.device.gatt.connected) return;
    try { await this.open(); } catch (e) {
      this.log('reconexão falhou: ' + e.message);
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  async open() {
    this.state = State.CONNECTING; this.err = '';
    this.log(`conectando em ${this.device.name || this.device.id}`);
    try {
      const server = await this.device.gatt.connect();
      let rx = null, tx = null;
      for (const p of PROFILES) {
        try {
          const svc = await server.getPrimaryService(p.service);
          rx = await svc.getCharacteristic(p.notify);
          tx = await svc.getCharacteristic(p.write);
          this.log(`serviço ${p.service.toString(16)} encontrado`);
          break;
        } catch { rx = tx = null; }
      }
      if (!rx || !tx) throw new Error('serviço do adaptador não encontrado');
      rx.addEventListener('characteristicvaluechanged', e => this.onData(dec.decode(e.target.value)));
      await rx.startNotifications();
      this.tx = tx;

      this.state = State.INIT;
      if (!await this.initAdapter()) throw new Error('adaptador não respondeu aos comandos AT');
      this.staticDone = false;
      this.state = await this.initEcu() ? State.CONNECTED : State.WAIT_ECU;
      this.loop();
    } catch (e) {
      this.state = State.ERROR; this.err = e.message;
      this.log('erro: ' + e.message);
      throw e;
    }
  }

  onData(text) {
    this.rxBuf += text;
    if (this.rxBuf.includes('>') && this.waiter) { const w = this.waiter; this.waiter = null; w(); }
  }

  async write(s) {
    const bytes = enc.encode(s);
    for (let off = 0; off < bytes.length; off += 20) {      // fragmenta no MTU mínimo do BLE
      const chunk = bytes.slice(off, off + 20);
      if (this.tx.properties.writeWithoutResponse) await this.tx.writeValueWithoutResponse(chunk);
      else await this.tx.writeValueWithResponse(chunk);
    }
  }

  // Envia um comando e espera o prompt '>'. Comandos são enfileirados.
  cmd(c, timeout = 1500) {
    const run = async () => {
      this.rxBuf = '';
      const done = new Promise(res => {
        this.waiter = res;
        setTimeout(() => { if (this.waiter === res) { this.waiter = null; res(); } }, timeout);
      });
      await this.write(c + '\r');
      await done;
      return this.rxBuf.replace(/[>\0]/g, '').trim();
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async initAdapter() {
    let alive = false;
    for (const c of ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', 'ATAT1']) {
      const r = await this.cmd(c, c === 'ATZ' ? 4000 : 1500);
      this.log(`${c} -> ${r.replace(/\s+/g, ' ')}`);
      if (r.includes('ELM') || r.includes('OK')) alive = true;
    }
    return alive;
  }

  async initEcu() {
    const r = await this.cmd('0100', 10000);                 // força busca de protocolo
    this.log(`0100 -> ${r.replace(/\s+/g, ' ')}`);
    if (!r.includes('41')) { this.err = 'ECU não respondeu (ignição ligada?)'; return false; }
    this.err = '';
    this.parseSupported(r, 0x00, 0);
    if (this.has(0x20)) this.parseSupported(await this.cmd('0120', 3000), 0x20, 1);
    if (this.has(0x40)) this.parseSupported(await this.cmd('0140', 3000), 0x40, 2);
    this.protocol = await this.cmd('ATDPN');
    const pids = [];
    for (let p = 1; p <= 0x60; p++) if (this.has(p)) pids.push(hex2(p));
    this.log(`protocolo=${this.protocol} pids=${pids.join(' ')}`);
    this.fastFails = 0;
    return true;
  }

  has(pid) { return pid >= 1 && pid <= 0x60 && ((this.supported[(pid - 1) >> 5] >>> (31 - ((pid - 1) & 31))) & 1) === 1; }

  parseSupported(r, pid, idx) {
    const b = parse(r, pid);
    if (b && b.length >= 4) this.supported[idx] = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  }

  async readPid(pid, key, conv, minBytes = 1) {
    const r = await this.cmd('01' + hex2(pid), 1000);
    const b = parse(r, pid);
    if (b && b.length >= minBytes) { this.d[key] = conv(b); return true; }
    if (/NO DATA|UNABLE|STOPPED|7F01|ERROR/.test(r)) this.d[key] = NaN;
    return false;
  }

  async readVoltage() {
    const r = await this.cmd('ATRV', 1000);                   // ex: "14.2V"
    const v = parseFloat(r.replace('V', ''));
    if (v > 5 && v < 40) this.d.batteryV = v;
  }

  async readMil() {
    const b = parse(await this.cmd('0101', 1000), 0x01);
    if (b && b.length >= 1) { this.d.milOn = (b[0] & 0x80) !== 0; this.d.dtcCount = b[0] & 0x7f; }
  }

  async readStatic() {
    if (this.has(0x1c)) {
      const b = parse(await this.cmd('011C', 1000), 0x1c);
      if (b) this.d.obdStd = obdStdName(b[0]);
    }
    const r = await this.cmd('0902', 4000);
    // multi-quadro CAN vem como "014\r0:490201xxxx\r1:xxxx..." : remove "N:" e quebras
    let h = r.replace(/[ \n]/g, ''), c = '';
    for (const ch of h) {
      if (ch === ':') { c = c.slice(0, -1); continue; }
      if (ch !== '\r') c += ch;
    }
    let i = c.indexOf('4902');
    if (i >= 0) {
      i += 4; if (c.substr(i, 2) === '01') i += 2;
      let vin = '';
      while (i + 1 < c.length && vin.length < 17) {
        const code = parseInt(c.substr(i, 2), 16); i += 2;
        if (code >= 0x30 && code <= 0x5a) vin += String.fromCharCode(code);
      }
      if (vin.length === 17) this.d.vin = vin;
    }
  }

  // modo 03: códigos de falha armazenados
  async requestDtcs() {
    if (this.state !== State.CONNECTED) return;
    const r = await this.cmd('03', 3000);
    this.log(`03 -> ${r.replace(/\s+/g, ' ')}`);
    const h = r.replace(/\s/g, '');
    let i = h.indexOf('43');
    const list = [];
    if (i >= 0) {
      i += 2;
      const p = this.protocol;
      if (p && (p[0] === 'A' || p[p.length - 1] >= '6')) i += 2;   // CAN: byte de contagem
      while (i + 3 < h.length && list.length < 8) {
        const code = decodeDtc(h.substr(i, 4)); i += 4;
        if (code !== 'P0000') list.push(code);
      }
    }
    this.d.dtcs = list;
  }

  async clearDtcs() {
    if (this.state !== State.CONNECTED) return false;
    const r = await this.cmd('04', 3000);
    const ok = r.includes('44') || r.includes('OK');
    if (ok) Object.assign(this.d, { milOn: false, dtcCount: 0, dtcs: [] });
    return ok;
  }

  async loop() {
    if (this.running) return;
    this.running = true;
    let lastSlow = 0, lastEcuTry = performance.now();
    const d = this.d;
    while (this.running && this.device?.gatt.connected) {
      try {
        const now = performance.now();
        if (this.state === State.WAIT_ECU) {
          await this.readVoltage();
          if (now - lastEcuTry > 5000) {
            lastEcuTry = now;
            if (await this.initEcu()) this.state = State.CONNECTED;
          }
          d.updatedAt = Date.now();
          await sleep(500);
          continue;
        }
        if (!this.staticDone) { this.staticDone = true; await this.readStatic(); }

        // rápidos: rpm, velocidade e fluxo de ar (MAF ou, na falta, MAP)
        const okRpm = await this.readPid(0x0c, 'rpm', b => (b[0] * 256 + b[1]) / 4, 2);
        if (this.has(0x0d)) await this.readPid(0x0d, 'speedKmh', b => b[0]);
        if (this.has(0x10)) await this.readPid(0x10, 'mafGs', b => (b[0] * 256 + b[1]) / 100, 2);
        else if (this.has(0x0b)) await this.readPid(0x0b, 'mapKpa', b => b[0]);

        // motor parado: lê tensão a cada ciclo para pegar a queda na partida
        if (!(d.rpm > 500)) await this.readVoltage();

        this.fastFails = okRpm ? 0 : this.fastFails + 1;
        if (this.fastFails >= 6) {                         // ECU dormiu (ignição desligada)
          this.state = State.WAIT_ECU; this.err = 'ECU parou de responder';
          Object.assign(d, { rpm: NaN, speedKmh: NaN });
          continue;
        }

        if (now - lastSlow >= 1000) { lastSlow = now; await this.slowStep(); }
        d.updatedAt = Date.now();
      } catch (e) {
        this.log('erro no ciclo: ' + e.message);
        await sleep(500);
      }
    }
    this.running = false;
  }

  async slowStep() {
    const d = this.d;
    switch (this.slowIdx++ % 13) {
      case 0: if (this.has(0x05)) await this.readPid(0x05, 'coolantC', b => b[0] - 40); break;
      case 1: await this.readVoltage(); break;
      case 2: if (this.has(0x01)) await this.readMil(); break;
      case 3: if (this.has(0x0f)) await this.readPid(0x0f, 'intakeC', b => b[0] - 40); break;
      case 4: if (this.has(0x04)) await this.readPid(0x04, 'loadPct', b => b[0] * 100 / 255); break;
      case 5: if (this.has(0x11)) await this.readPid(0x11, 'throttlePct', b => b[0] * 100 / 255); break;
      case 6: if (this.has(0x06)) await this.readPid(0x06, 'stftPct', b => (b[0] - 128) * 100 / 128); break;
      case 7: if (this.has(0x07)) await this.readPid(0x07, 'ltftPct', b => (b[0] - 128) * 100 / 128); break;
      case 8: if (this.has(0x0e)) await this.readPid(0x0e, 'timingDeg', b => b[0] / 2 - 64); break;
      case 9: if (this.has(0x14)) await this.readPid(0x14, 'o2s1V', b => b[0] / 200); break;
      case 10: if (this.has(0x15)) await this.readPid(0x15, 'o2s2V', b => b[0] / 200); break;
      case 11: if (this.has(0x03)) await this.readPid(0x03, 'fuelSystem', b => b[0]); break;
      case 12: if (this.has(0x21)) await this.readPid(0x21, 'distMilKm', b => b[0] * 256 + b[1], 2); break;
    }
  }
}

// procura "41 <pid>" na resposta e devolve os bytes de dados
function parse(r, pid) {
  const h = r.replace(/\s/g, '');
  const i = h.indexOf('41' + hex2(pid));
  if (i < 0) return null;
  const out = [];
  for (let j = i + 4; j + 1 < h.length && out.length < 8; j += 2) {
    const s = h.substr(j, 2);
    if (!/^[0-9A-Fa-f]{2}$/.test(s)) break;
    out.push(parseInt(s, 16));
  }
  return out;
}

function decodeDtc(hex4) {
  if (hex4.length < 4) return '';
  const a = parseInt(hex4[0], 16);
  return 'PCBU'[(a >> 2) & 3] + (a & 3) + hex4.slice(1);
}
