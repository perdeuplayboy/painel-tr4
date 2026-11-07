// A TR4 do painel (a mesma das Aventuras do Joni), de lado e de trás, para o inclinômetro da página Trilha.
// Unidades: 100 de comprimento, frente para a direita, origem no chão no meio das rodas (y para cima é negativo).
const TAU = Math.PI * 2;
const OR = '#f28a1c', GLASS = '#7a3f0e', INK = '#05060a';
const hex = s => s.match(/\w\w/g).map(x => parseInt(x, 16));
function rgba(col, a) { const [r, g, b] = hex(col); return `rgba(${r},${g},${b},${a})`; }
function outline(c, lw) { c.fillStyle = INK; c.fill(); c.strokeStyle = OR; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }

const WR = -25.6, WF = 25.6, RAD = 10.4, SPX = -46.7, SPY = -30.5;
function bodyPath(c) {
  c.beginPath();
  c.moveTo(-36.7, -12); c.lineTo(-41.2, -12);                       // para-choque traseiro, com quinas
  c.lineTo(-43.7, -14.2); c.lineTo(-43.9, -20.6); c.lineTo(-42.1, -21.4);
  c.lineTo(-41.5, -24);                                               // traseira quase reta
  c.lineTo(-40.8, -40);                                               // quebra do porta-malas: o vidro de trás inclina
  c.arcTo(-36.2, -55.2, 18.3, -56.5, 4);                              // canto de trás do teto
  c.arcTo(18.3, -56.5, 26.9, -39.5, 3);                               // canto da frente do teto
  c.arcTo(26.9, -39.5, 43, -36.4, 2);                                 // base do para-brisa
  c.arcTo(43.8, -36.3, 46.6, -26.5, 2);                               // ponta do capô
  c.lineTo(46.6, -26.5);                                              // frente inclinada, acompanhando o farol
  c.arcTo(48, -25, 48, -20, 1.5);                                     // para-choque da frente: degrau curto,
  c.arcTo(48, -18.5, 41, -13.3, 1.5);                                 // lateral reta
  c.arcTo(41, -13.3, 37, -12.7, 2);                                   // e chanfro com as juntas arredondadas
  c.lineTo(36, -12.6);
  c.closePath();
}
const WINDOWS = [[-32.6, -51.9, -21.3, -52.3, -21.5, -38.9, -34.5, -38.9],
                 [-18.8, -52.5, -1.8, -52.8, -1.8, -39.5, -19.2, -38.9],
                 [0.9, -53.1, 16.7, -53.3, 23.1, -39.8, 0.9, -39.5]];
function wheel(c, x, y, rot, flat, lw) {
  c.save(); c.translate(x, y + flat * 3);
  c.scale(1 + flat * 0.12, 1 - flat * 0.3);
  c.beginPath(); c.arc(0, 0, RAD, 0, TAU); outline(c, lw);
  c.strokeStyle = rgba(OR, 0.3); c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, 7.4, 0, TAU); c.stroke();   // aro
  c.rotate(rot);
  c.beginPath();                                                     // estrela de 5 raios
  for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; c.moveTo(0, 0); c.lineTo(Math.cos(a) * 5.6, Math.sin(a) * 5.6); }
  c.strokeStyle = OR; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
  c.strokeStyle = rgba(OR, 0.4); c.lineWidth = 1;                    // cravos do pneu: mostram o giro
  c.beginPath(); for (let k = 0; k < 10; k++) { const a = k * TAU / 10; c.moveTo(Math.cos(a) * 8.4, Math.sin(a) * 8.4); c.lineTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5); } c.stroke();
  c.restore();
}


// a TR4 de lado, parada, sem farol, barro nem portas abertas (a versão completa fica nas Aventuras do Joni)
function car(c, x, y, s, angle = 0) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const lw = 1.8;
  c.beginPath(); c.roundRect(-51, -42, 8.6, 23, 4.3); outline(c, lw);   // estepe na tampa traseira
  c.strokeStyle = rgba(OR, 0.4); c.lineWidth = 0.8; c.beginPath(); c.moveTo(-48.6, -37); c.lineTo(-48.6, -24); c.stroke();
  bodyPath(c); outline(c, lw);
  c.save(); bodyPath(c); c.clip();                                   // portas, friso e caixas de roda
  c.strokeStyle = rgba(OR, 0.32); c.lineWidth = 0.75;
  c.beginPath();
  c.moveTo(-0.5, -39.3); c.lineTo(-0.5, -15.5); c.moveTo(-20.3, -38.9); c.lineTo(-20.3, -15.5); c.moveTo(23.4, -39.6); c.lineTo(24.4, -15.5);
  c.moveTo(-40.8, -25.5); c.lineTo(46, -27);
  c.moveTo(WR - 14, -12); c.arc(WR, -10.4, 14, Math.PI * 1.06, Math.PI * 1.94); c.moveTo(WF - 14, -12); c.arc(WF, -10.4, 14, Math.PI * 1.06, Math.PI * 1.94);
  c.stroke();
  c.strokeStyle = rgba(OR, 0.55); c.lineWidth = 1;                   // maçanetas e tampa do tanque
  c.beginPath(); c.moveTo(-18.6, -35.4); c.lineTo(-15.4, -35.4); c.moveTo(1.4, -35.6); c.lineTo(4.6, -35.6); c.stroke();
  c.beginPath(); c.arc(-33, -30, 1.6, 0, TAU); c.stroke();
  c.restore();
  bodyPath(c); c.strokeStyle = OR; c.lineWidth = lw; c.stroke();
  c.fillStyle = GLASS;                                               // três janelas, sem moldura
  for (const q of WINDOWS) { c.beginPath(); c.moveTo(q[0], q[1]); for (let i = 2; i < 8; i += 2) c.lineTo(q[i], q[i + 1]); c.closePath(); c.fill(); }
  c.fillStyle = INK; c.beginPath(); c.ellipse(9, -45.5, 3.3, 3.7, 0, 0, TAU); c.fill();   // motorista em silhueta
  c.beginPath(); c.arc(9, -46.6, 3.7, Math.PI, 0); c.lineTo(14.5, -46.8); c.fill(); c.fillRect(5.6, -42.5, 7.5, 3.2);
  c.strokeStyle = 'rgba(255,200,140,.22)'; c.lineWidth = 1.1;        // reflexo nos vidros
  c.beginPath(); c.moveTo(-30, -48); c.lineTo(-26, -51.5); c.moveTo(-15, -47); c.lineTo(-10, -52); c.moveTo(5, -47); c.lineTo(10, -52.5); c.stroke();
  c.beginPath(); c.moveTo(-30.6, -56.2); c.lineTo(-27.7, -59.6); c.lineTo(10.6, -60.3); c.lineTo(13.9, -56.8);   // rack
  c.strokeStyle = OR; c.lineWidth = lw; c.stroke();
  c.beginPath(); c.moveTo(23.5, -39.5); c.lineTo(26.8, -42.2); c.lineTo(28.5, -40.8); c.lineTo(26, -38.6); c.closePath(); outline(c, 1.1);   // retrovisor
  c.beginPath(); c.moveTo(37.3, -34); c.lineTo(44.3, -34.3); c.lineTo(46.4, -26.8); c.lineTo(44.8, -26.4); c.lineTo(38, -31.5); c.closePath();   // farol
  c.strokeStyle = OR; c.lineWidth = lw * 0.9; c.stroke();
  c.fillStyle = '#e8a030'; c.fillRect(45.6, -24.2, 1.6, 2.2);         // pisca
  c.fillStyle = '#7a1a0c';                                           // lanterna
  c.beginPath(); c.moveTo(-41.6, -34); c.lineTo(-40.5, -34); c.lineTo(-41, -27.5); c.lineTo(-42, -27.5); c.closePath(); c.fill();
  wheel(c, WF, -RAD, 0, 0, lw); wheel(c, WR, -RAD, 0, 0, lw);
  c.restore();
}

// a TR4 vista de trás, traçada da foto do usuário (traseira de frente, 500×458): 0,132 unidade por pixel,
// chão no pé dos pneus (y 450) e centro em x 250. Bate com o desenho de lado: teto em -56,5 e estepe em -30.
export function carTras(c, x, y, s, angle = 0) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const lw = 1.8;
  for (const sx of [-1, 1]) {                                        // pneus: só a parte de baixo aparece
    c.beginPath(); c.roundRect(sx > 0 ? 19.8 : -28.6, -14.5, 8.8, 14.5, 2.2); outline(c, lw);   // sobe até o para-choque (no alto é o para-barro preto)
    c.strokeStyle = rgba(OR, 0.35); c.lineWidth = 0.75; c.beginPath();
    for (const yy of [-8.5, -5.5, -2.5]) { c.moveTo(sx * 22, yy); c.lineTo(sx * 26.4, yy); } c.stroke();
  }
  c.beginPath(); c.rect(-20, -14, 40, 4.5); c.fillStyle = INK; c.fill();   // embaixo do carro, entre as rodas
  c.strokeStyle = rgba(OR, 0.4); c.lineWidth = 0.8; c.beginPath(); c.moveTo(-18, -10.5); c.lineTo(18, -10.5); c.stroke();
  // lataria: a coluna desce quase reta do teto até a lanterna; embaixo da lanterna a lateral alarga até o para-choque
  const lado = [[-17.4, -56.5], [-18.7, -55.4], [-19.8, -54.1], [-20.9, -51.5], [-21.8, -48.8], [-22.7, -46.2], [-23.8, -43.6], [-24.8, -40.3],
                [-25.2, -31], [-26.7, -30.4], [-27.7, -27.7], [-28.4, -25.1], [-28.6, -19.8], [-28.4, -13.9]];
  c.beginPath();
  for (const [px, py] of lado) c.lineTo(px, py);
  for (let k = lado.length - 1; k >= 0; k--) c.lineTo(-lado[k][0], lado[k][1]);
  c.closePath();
  outline(c, lw);
  c.fillStyle = GLASS;                                               // vidro de trás
  c.beginPath(); c.moveTo(-18.2, -53.5); c.quadraticCurveTo(-18, -53.9, -16.8, -53.9); c.lineTo(16.8, -53.9); c.quadraticCurveTo(18, -53.9, 18.2, -53.5);
  c.lineTo(19.3, -48.8); c.lineTo(20.8, -43.6); c.lineTo(21.6, -39.9); c.lineTo(-21.6, -39.9); c.lineTo(-20.8, -43.6); c.lineTo(-19.3, -48.8); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,200,140,.22)'; c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(-14, -42); c.lineTo(-10, -51.5); c.moveTo(-8, -42); c.lineTo(-5, -48.5); c.stroke();
  c.fillStyle = '#7a1a0c'; c.fillRect(-5.3, -56.3, 10.6, 1.2);       // brake light no alto
  c.strokeStyle = rgba(OR, 0.32); c.lineWidth = 0.75;                // tampa traseira
  c.beginPath(); c.moveTo(-21.8, -39.6); c.lineTo(-21.8, -19.8); c.lineTo(21.8, -19.8); c.lineTo(21.8, -39.6); c.stroke();
  c.fillStyle = '#7a1a0c';                                           // lanternas em pé e refletores redondos
  for (const sx of [-1, 1]) {
    c.beginPath(); c.roundRect(sx > 0 ? 22.2 : -26.6, -39.9, 4.4, 8.9, [sx > 0 ? 0.6 : 1.6, sx > 0 ? 1.6 : 0.6, 0.6, 0.6]); c.fill();
    c.strokeStyle = OR; c.lineWidth = lw * 0.6; c.stroke(); c.fillStyle = '#7a1a0c';
    c.beginPath(); c.arc(sx * 25, -23.3, 1.2, 0, TAU); c.fill();
  }
  c.fillStyle = '#e8e8e8'; c.globalAlpha = 0.45; c.beginPath(); c.roundRect(-21.4, -35.4, 13.2, 4.4, 0.6); c.fill(); c.globalAlpha = 1;   // placa
  c.beginPath(); c.moveTo(-28.6, -19.8); c.lineTo(28.6, -19.8); c.strokeStyle = OR; c.lineWidth = lw * 0.8; c.stroke();   // para-choque
  c.strokeStyle = rgba(OR, 0.4); c.lineWidth = 0.8; c.beginPath(); c.moveTo(-15, -15.8); c.lineTo(15, -15.8); c.stroke();
  c.beginPath(); c.arc(5.3, -30.2, 12.7, 0, TAU); outline(c, lw);   // estepe na tampa, um pouco à direita
  c.strokeStyle = rgba(OR, 0.45); c.lineWidth = 0.8; c.beginPath(); c.arc(5.3, -30.2, 8.2, 0, TAU); c.stroke();
  c.beginPath();                                                     // aro de 5 raios duplos
  for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; c.moveTo(5.3 + Math.cos(a) * 2, -30.2 + Math.sin(a) * 2); c.lineTo(5.3 + Math.cos(a) * 7.6, -30.2 + Math.sin(a) * 7.6); }
  c.stroke(); c.beginPath(); c.arc(5.3, -30.2, 2, 0, TAU); c.stroke();
  for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 15.2, -56.5); c.lineTo(sx * 15.6, -58.6); c.lineTo(sx * 17.4, -58.6); c.lineTo(sx * 17.6, -56.4); c.strokeStyle = OR; c.lineWidth = lw; c.stroke(); }   // pés do rack
  c.restore();
}

// inclinômetro do painel (página Trilha): a TR4 de lado ou de trás, girando no ponto de apoio, sobre a linha do chão
export function carroIncl(c, w, h, graus, cor = '#e8e8e8', tras = false) {
  c.clearRect(0, 0, w, h);
  const s = tras ? Math.min(w / 66, h / 78) : Math.min(w / 112, h / 78), gx = w / 2, gy = h * 0.8;
  c.save(); c.strokeStyle = cor; c.globalAlpha = 0.5; c.lineWidth = Math.max(1, s * 0.8); c.setLineDash([4 * s, 4 * s]);
  c.beginPath(); c.moveTo(w * 0.03, gy + 0.5); c.lineTo(w * 0.97, gy + 0.5); c.stroke(); c.restore();
  const a = graus * Math.PI / 180;
  if (tras) carTras(c, gx, gy, s, a); else car(c, gx, gy, s, a);
}
