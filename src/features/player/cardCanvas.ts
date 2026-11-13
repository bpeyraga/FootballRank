// Dibuja la ficha del jugador (formato historia 1080×1920) con Canvas 2D. Es el código pesado de "Compartir ficha":
// se carga con import() recién cuando hace falta (ver ShareCardBase.tsx) y no entra al chunk principal. Sin librerías
// de dibujo; el QR sale de qr.ts (qrcode-generator, también diferido).
import { ATTRS } from '../../shared/model';
import { CREST, KITS } from '../../shared/teams';
import { SHAPES } from '../../shared/ui/Crest';
import {
  SHARE_URL, SITE, STORY_H, STORY_W, TIER_COLORS, cardFileName, cardInner, cardTier, ctaLayout, ellipsize, fitFontPx, initialOf,
  qrGeometry, shieldPoints, splitRow, storyLayout, wrapLines, type CardData, type Measure, type Rect,
} from './cardLayout';
import { qrMatrix } from './qr';

export { SITE, cardFileName };
export type { CardData };
export { downloadBlob, shareBlob, type ShareResult } from './shareFile';

const DISPLAY = '"Barlow Condensed","Arial Narrow",Impact,sans-serif';
const BODY = '"Barlow",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const GOLD_1 = '#f8e394', GOLD_2 = '#d9aa2e', GREEN = '#5fd08a', INK_DARK = '#0a1510';

type Ctx = CanvasRenderingContext2D;
const font = (px: number, weight = 700, family = DISPLAY) => `${weight} ${px}px ${family}`;

/** Espera a que estén las fuentes de la app (con tope: si no llegan se usa la alternativa). */
async function loadFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(font(100, 700)), document.fonts.load(font(100, 600)),
        document.fonts.load(font(100, 600, BODY)), document.fonts.load(font(100, 500, BODY)),
      ]),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch { /* sin fuentes propias: sigue con las del sistema */ }
}

/** Foto con CORS (Supabase Storage lo permite). Devuelve null si falla o tarda: se usa la inicial. */
export function loadImage(url: string | null, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const end = (v: HTMLImageElement | null) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => end(null), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.onload = () => end(img.naturalWidth ? img : null);
    img.onerror = () => end(null);
    // Parámetro propio: evita que el navegador reuse la copia cacheada del <img> sin CORS (taint del canvas).
    img.src = /^https?:/i.test(url) ? url + (url.includes('?') ? '&' : '?') + 'cors=1' : url;
  });
}

function shieldPath(ctx: Ctx, c: Rect) {
  const [first, ...rest] = shieldPoints(c);
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [x, y] of rest) ctx.lineTo(x, y);
  ctx.closePath();
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spaced(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${px}px`;
}

/** Números al azar repetibles (la imagen sale igual cada vez). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Destello de cuatro puntas. */
function sparkle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.06, y - r * 0.06, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.06, y + r * 0.06, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.06, y + r * 0.06, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.06, y - r * 0.06, x, y - r);
  ctx.fill();
}

function background(ctx: Ctx, card: Rect, glow: string) {
  const cx = card.x + card.w / 2, cy = card.y + card.h * 0.46;
  const g = ctx.createLinearGradient(0, 0, 0, STORY_H);
  g.addColorStop(0, '#050d09'); g.addColorStop(0.4, '#0f2c1c'); g.addColorStop(0.78, '#0a1d13'); g.addColorStop(1, '#040a07');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  // Franjas de pasto y líneas de la cancha
  ctx.fillStyle = 'rgba(255,255,255,.03)';
  for (let y = 0; y < STORY_H; y += 220) ctx.fillRect(0, y, STORY_W, 110);
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, 360, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(STORY_W, cy); ctx.stroke();

  // Resplandor del color de la carta
  const r = ctx.createRadialGradient(cx, cy, 60, cx, cy, 820);
  r.addColorStop(0, `rgba(${glow},.34)`); r.addColorStop(0.55, `rgba(${glow},.10)`); r.addColorStop(1, `rgba(${glow},0)`);
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  // Rayos de luz que salen de detrás de la carta
  ctx.save();
  ctx.translate(cx, cy);
  const R = 1500, N = 16;
  const rays = ctx.createRadialGradient(0, 0, 200, 0, 0, 1250);
  rays.addColorStop(0, `rgba(${glow},.20)`); rays.addColorStop(1, `rgba(${glow},0)`);
  ctx.fillStyle = rays;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 + 0.1, a1 = a0 + (Math.PI / N) * 0.8;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // Destellos
  const rand = rng(20260);
  for (let i = 0; i < 44; i++) {
    const x = rand() * STORY_W, y = rand() * STORY_H, s = 5 + rand() * rand() * 22;
    ctx.fillStyle = `rgba(255,244,205,${(0.25 + rand() * 0.6).toFixed(2)})`;
    if (s > 11) sparkle(ctx, x, y, s); else { ctx.beginPath(); ctx.arc(x, y, s / 3.2, 0, Math.PI * 2); ctx.fill(); }
  }

  // Viñeta
  const v = ctx.createRadialGradient(STORY_W / 2, STORY_H / 2, 520, STORY_W / 2, STORY_H / 2, 1280);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
}

function ball(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#12241a';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const x = cx + Math.cos(a) * r * 0.42, y = cy + Math.sin(a) * r * 0.42;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#12241a'; ctx.lineWidth = r * 0.1;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

const light = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
};

/** Escudito del club (mismo dibujo que <Crest>) en un lienzo de 24×28 escalado a `w` de ancho. */
export function drawCrest(ctx: Ctx, team: string | null, left: number, top: number, w: number) {
  const k = team ? KITS[team] : undefined;
  if (!k) return;
  const d = CREST[team!] ?? {};
  const outline = new Path2D(SHAPES[d.f ?? 'shield']);
  const [c0, c1 = c0, c2] = k.c;
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(w / 24, w / 24);
  ctx.save();
  ctx.clip(outline);
  const rect = (x: number, y: number, rw: number, rh: number, fill: string | CanvasGradient) => { ctx.fillStyle = fill; ctx.fillRect(x, y, rw, rh); };
  const poly = (pts: [number, number][], fill: string) => {
    ctx.fillStyle = fill; ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill();
  };
  switch (k.p) {
    case 'stripes': { const cols = c2 ? [c0, c1, c2] : [c0, c1]; for (let i = 0; i < 6; i++) rect(i * 4, 0, 4, 28, cols[i % cols.length]); break; }
    case 'hband': rect(0, 0, 24, 28, c0); rect(0, 10.5, 24, 6.5, c1); break;
    case 'sash': rect(0, 0, 24, 28, c0); poly([[-1, 5], [5, -1], [27, 21], [21, 27]], c1); break;
    case 'halves': rect(0, 0, 12, 28, c0); rect(12, 0, 12, 28, c1); break;
    case 'vee': rect(0, 0, 24, 28, c0); poly([[2, 2], [6.5, 2], [12, 12], [17.5, 2], [22, 2], [12, 19]], c1); break;
    default: rect(0, 0, 24, 28, c0);
  }
  const gloss = ctx.createLinearGradient(0, 0, 0, 28);
  gloss.addColorStop(0, 'rgba(255,255,255,.28)'); gloss.addColorStop(0.45, 'rgba(255,255,255,0)'); gloss.addColorStop(1, 'rgba(0,0,0,.18)');
  rect(0, 0, 24, 28, gloss);
  const letters = d.l ?? k.s;
  const ty = k.p === 'hband' ? 15.6 : 18.5;
  const fs = letters.length >= 5 ? 4.2 : letters.length === 4 ? 5 : 6;
  const busy = k.p === 'stripes' || k.p === 'halves' || k.p === 'sash' || k.p === 'vee';
  if (busy) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    roundRectPath(ctx, 3.5, ty - fs * 0.86, 17, fs + 1.1, 1.2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = k.p === 'hband' ? (light(c1) ? '#1d1d1d' : '#ffffff') : busy ? '#ffffff' : k.t;
  ctx.font = `700 ${fs}px ${DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(letters, 12, ty);
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = d.b ? 2.4 : 1; ctx.stroke(outline);
  if (d.b) { ctx.strokeStyle = d.b; ctx.lineWidth = 1.3; ctx.stroke(outline); }
  ctx.restore();
}

function drawPhoto(ctx: Ctx, img: HTMLImageElement | null, name: string, p: { cx: number; cy: number; r: number }, col: typeof TIER_COLORS.gold) {
  // Sombra apoyada debajo y aro doble
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14;
  ctx.fillStyle = col.deep;
  ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2); ctx.clip();
  if (img) {
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, p.cx - p.r, p.cy - p.r, p.r * 2, p.r * 2);
  } else {
    const bg = ctx.createRadialGradient(p.cx - p.r * 0.3, p.cy - p.r * 0.4, p.r * 0.1, p.cx, p.cy, p.r * 1.1);
    bg.addColorStop(0, 'rgba(255,255,255,.95)'); bg.addColorStop(1, col.to);
    ctx.fillStyle = bg; ctx.fillRect(p.cx - p.r, p.cy - p.r, p.r * 2, p.r * 2);
    ctx.fillStyle = col.ink; ctx.font = font(Math.round(p.r * 1.1)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initialOf(name), p.cx, p.cy + p.r * 0.06);
    ctx.textBaseline = 'alphabetic';
  }
  // Borde interior suave para que la foto no se vea "pegada"
  const edge = ctx.createRadialGradient(p.cx, p.cy, p.r * 0.72, p.cx, p.cy, p.r);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = edge; ctx.fillRect(p.cx - p.r, p.cy - p.r, p.r * 2, p.r * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r + 4, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = col.deep; ctx.globalAlpha = 0.45; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r + 13, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Carta con forma de escudo: brillo, textura, doble borde y resplandor del color de su nivel. */
function drawCardBody(ctx: Ctx, c: Rect, col: typeof TIER_COLORS.gold, photo: { cx: number; cy: number; r: number }) {
  // Resplandor y sombra
  ctx.save();
  ctx.shadowColor = `rgba(${col.glow},.5)`; ctx.shadowBlur = 130;
  shieldPath(ctx, c); ctx.fillStyle = col.to; ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
  shieldPath(ctx, c);
  const g = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
  g.addColorStop(0, col.from); g.addColorStop(1, col.to);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();

  ctx.save();
  shieldPath(ctx, c); ctx.clip();
  // Textura de rayas en diagonal
  ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 9;
  for (let i = -c.h; i < c.w + c.h; i += 38) {
    ctx.beginPath(); ctx.moveTo(c.x + i, c.y + c.h); ctx.lineTo(c.x + i + c.h * 0.62, c.y); ctx.stroke();
  }
  // Aros detrás de la foto
  ctx.strokeStyle = col.ink; ctx.globalAlpha = 0.08; ctx.lineWidth = 7;
  for (const k of [1.42, 1.78]) { ctx.beginPath(); ctx.arc(photo.cx, photo.cy, photo.r * k, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // Brillo en diagonal
  const shine = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h * 0.75);
  shine.addColorStop(0, 'rgba(255,255,255,.55)'); shine.addColorStop(0.3, 'rgba(255,255,255,.04)');
  shine.addColorStop(0.62, 'rgba(255,255,255,0)'); shine.addColorStop(0.78, 'rgba(255,255,255,.2)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine; ctx.fillRect(c.x, c.y, c.w, c.h);
  // Sombra suave hacia la punta
  const bottom = ctx.createLinearGradient(0, c.y + c.h * 0.55, 0, c.y + c.h);
  bottom.addColorStop(0, 'rgba(0,0,0,0)'); bottom.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.fillStyle = bottom; ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.restore();

  // Borde interior fino y borde exterior luminoso
  ctx.lineJoin = 'round';
  shieldPath(ctx, { x: c.x + 22, y: c.y + 24, w: c.w - 44, h: c.h - 52 });
  ctx.strokeStyle = col.ink; ctx.globalAlpha = 0.32; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
  shieldPath(ctx, c);
  const rim = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
  rim.addColorStop(0, 'rgba(255,255,255,.95)'); rim.addColorStop(0.5, 'rgba(255,255,255,.5)'); rim.addColorStop(1, 'rgba(255,255,255,.85)');
  ctx.strokeStyle = rim; ctx.lineWidth = 9; ctx.stroke();
  ctx.lineJoin = 'miter';
}

/** Dibuja el QR con su zona de silencio blanca y módulos oscuros de tamaño entero (nítido y con buen contraste). */
function drawQr(ctx: Ctx, matrix: boolean[][], box: Rect, cell: number, quiet: number) {
  roundRectPath(ctx, box.x, box.y, box.w, box.h, 20);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.fillStyle = INK_DARK;
  const x0 = box.x + quiet * cell, y0 = box.y + quiet * cell;
  matrix.forEach((row, r) => row.forEach((dark, c) => { if (dark) ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell); }));
}

/** Arma la imagen y la devuelve como PNG. */
export async function renderCardPng(d: CardData): Promise<Blob> {
  const [img, logo, matrix] = await Promise.all([loadImage(d.photoUrl), loadImage('/icon.png', 5000), qrMatrix(SHARE_URL), loadFonts()]);
  const canvas = document.createElement('canvas');
  canvas.width = STORY_W; canvas.height = STORY_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const L = storyLayout(d.summary.length > 0);
  const tier = cardTier(d.ovr);
  const col = TIER_COLORS[tier];
  const measureWith = (family: string, weight = 700): Measure => (t, px) => { ctx.font = font(px, weight, family); return ctx.measureText(t).width; };
  const measure = measureWith(DISPLAY);

  background(ctx, L.card, col.glow);
  ctx.textBaseline = 'alphabetic';

  // Marca (sello chico con líneas a los costados) y comunidad
  const brand = 'EL PARTIDITO';
  ctx.font = font(44, 600); spaced(ctx, 9);
  const bw = ctx.measureText(brand).width - 9, ballD = 44, gap = 20;
  const bx = (STORY_W - (ballD + gap + bw)) / 2;
  const lineY = L.brandY - 16;
  const lg = (x0: number, x1: number) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(236,200,100,0)'); g.addColorStop(1, 'rgba(236,200,100,.7)'); return g; };
  ctx.fillStyle = lg(70, bx - 30); ctx.fillRect(70, lineY, bx - 100, 3);
  const g2 = ctx.createLinearGradient(STORY_W - 70, 0, bx + ballD + gap + bw + 30, 0);
  g2.addColorStop(0, 'rgba(236,200,100,0)'); g2.addColorStop(1, 'rgba(236,200,100,.7)');
  ctx.fillStyle = g2; ctx.fillRect(bx + ballD + gap + bw + 30, lineY, STORY_W - 70 - (bx + ballD + gap + bw + 30), 3);
  ball(ctx, bx + ballD / 2, L.brandY - 16, ballD / 2);
  ctx.textAlign = 'left'; ctx.fillStyle = '#d9e8de';
  ctx.fillText(brand, bx + ballD + gap, L.brandY);
  spaced(ctx, 0);
  ctx.textAlign = 'center';
  if (d.community) {
    ctx.fillStyle = GREEN;
    const cpx = fitFontPx(measureWith(BODY, 600), d.community, 860, 48, 28);
    ctx.font = font(cpx, 600, BODY);
    ctx.fillText(ellipsize(measureWith(BODY, 600), d.community, cpx, 860), STORY_W / 2, L.communityY);
  }

  // Carta
  const c = L.card;
  const I = cardInner(c);
  drawCardBody(ctx, c, col, I.photo);
  ctx.fillStyle = col.ink; ctx.textAlign = 'center';
  // OVR con relieve
  const ovrText = d.ovr == null ? '—' : String(d.ovr);
  ctx.font = font(I.ovr.px);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(ovrText, I.ovr.cx, I.ovr.baseline + 4);
  ctx.fillStyle = col.ink; ctx.fillText(ovrText, I.ovr.cx, I.ovr.baseline);
  ctx.font = font(I.pos.px, 600); spaced(ctx, 3); ctx.fillText(d.pos, I.pos.cx, I.pos.baseline); spaced(ctx, 0);
  // Regla corta entre la posición y el escudo, como en las cartas de verdad
  ctx.globalAlpha = 0.4; ctx.fillRect(I.pos.cx - I.crest.w * 0.7, I.pos.baseline + 14, I.crest.w * 1.4, 3); ctx.globalAlpha = 1;
  drawCrest(ctx, d.favTeam, I.crest.cx - I.crest.w / 2, I.crest.top + 8, I.crest.w);
  if (d.shirt) {
    const crestH = KITS[d.favTeam ?? ''] ? I.crest.w * 28 / 24 + 22 : 0;
    ctx.font = font(I.shirt.px);
    const label = String(d.shirt);
    const tw = ctx.measureText(label).width, pad = 12;
    const sx = I.shirt.cx - tw / 2 - pad, sy = I.crest.top + 8 + crestH, sh = I.shirt.px + pad;
    roundRectPath(ctx, sx, sy, tw + pad * 2, sh, 8);
    ctx.strokeStyle = col.ink; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = col.ink; ctx.fillText(label, I.shirt.cx, sy + I.shirt.px * 0.88 + pad / 2 - 2);
  }
  drawPhoto(ctx, img, d.name, I.photo, col);

  // Nombre
  const name = d.name.toUpperCase();
  const npx = fitFontPx(measure, name, I.name.maxW, I.name.startPx, I.name.minPx);
  const shown = ellipsize(measure, name, npx, I.name.maxW);
  ctx.fillStyle = col.ink; ctx.font = font(npx); spaced(ctx, 2);
  ctx.fillText(shown, I.name.cx, I.name.baseline);
  const nw = ctx.measureText(shown).width;
  spaced(ctx, 0);
  const ruleW = Math.min(I.name.maxW + 40, Math.max(nw, I.name.maxW * 0.5) + 60);
  const rule = ctx.createLinearGradient(I.name.cx - ruleW / 2, 0, I.name.cx + ruleW / 2, 0);
  rule.addColorStop(0, 'rgba(0,0,0,0)'); rule.addColorStop(0.2, col.ink); rule.addColorStop(0.8, col.ink); rule.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rule; ctx.fillRect(I.name.cx - ruleW / 2, I.name.baseline + 16, ruleW, 4);

  // Las 6 stats, con una línea entre las dos columnas
  ctx.fillStyle = col.ink;
  ctx.globalAlpha = 0.3; ctx.fillRect(I.divider.x - 1.5, I.divider.y1, 3, I.divider.y2 - I.divider.y1); ctx.globalAlpha = 1;
  ATTRS.forEach(([k, label], i) => {
    const s = I.stats[i];
    ctx.textAlign = 'right'; ctx.font = font(I.statPx, 700);
    ctx.fillText(d.stats ? String(d.stats[k]) : '—', s.valueRight, s.baseline);
    ctx.textAlign = 'left'; ctx.font = font(I.statPx, 600);
    ctx.fillText(label, s.labelLeft, s.baseline);
  });

  // Casillas de resumen
  if (d.summary.length) {
    const cells = splitRow(c.x, c.w, d.summary.length, 18);
    // Misma letra en todas las etiquetas: la que necesite la más larga
    spaced(ctx, 1.5);
    const labelPx = Math.min(...d.summary.map((t, i) => fitFontPx(measureWith(BODY, 600), t.label, cells[i].w - 24, 22, 13)));
    spaced(ctx, 0);
    d.summary.forEach((t, i) => {
      const x = cells[i].x, w = cells[i].w, y = L.summary.y, h = L.summary.h;
      roundRectPath(ctx, x, y, w, h, 26);
      const tg = ctx.createLinearGradient(x, y, x, y + h);
      tg.addColorStop(0, 'rgba(255,255,255,.14)'); tg.addColorStop(1, 'rgba(255,255,255,.05)');
      ctx.fillStyle = tg; ctx.fill();
      ctx.strokeStyle = `rgba(${col.glow},.45)`; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff'; ctx.font = font(62); ctx.fillText(t.value, x + w / 2, y + 62);
      ctx.fillStyle = '#a9bfb0';
      spaced(ctx, 1.5);
      ctx.font = font(labelPx, 600, BODY);
      ctx.fillText(t.label, x + w / 2 + 0.75, y + 90);
      spaced(ctx, 0);
    });
  }

  // Invitación: logo, textos, link y QR
  const qr = qrGeometry(matrix.length, 262);
  const K = ctaLayout(L.cta, qr.size);
  const p = L.cta;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  roundRectPath(ctx, p.x, p.y, p.w, p.h, 44);
  ctx.fillStyle = 'rgba(5,14,9,.82)'; ctx.fill();
  ctx.restore();
  roundRectPath(ctx, p.x, p.y, p.w, p.h, 44);
  const glass = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
  glass.addColorStop(0, 'rgba(255,255,255,.14)'); glass.addColorStop(1, 'rgba(255,255,255,.04)');
  ctx.fillStyle = glass; ctx.fill();
  const edge = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y);
  edge.addColorStop(0, GOLD_1); edge.addColorStop(0.55, 'rgba(248,227,148,.35)'); edge.addColorStop(1, GREEN);
  ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.stroke();

  // Etiqueta sobre el borde
  const tag = 'GRATIS Y SIN PUBLICIDAD';
  ctx.font = font(24, 600, BODY); spaced(ctx, 3);
  const tagW = ctx.measureText(tag).width + 48;
  roundRectPath(ctx, K.text.x, p.y - 21, tagW, 42, 21);
  const tg = ctx.createLinearGradient(K.text.x, 0, K.text.x + tagW, 0);
  tg.addColorStop(0, GOLD_1); tg.addColorStop(1, GOLD_2);
  ctx.fillStyle = tg; ctx.fill();
  ctx.fillStyle = '#2a1f00'; ctx.textAlign = 'left';
  ctx.fillText(tag, K.text.x + 24, p.y + 8);
  spaced(ctx, 0);

  // Logo y nombre
  if (logo) ctx.drawImage(logo, K.logo.x, K.logo.y, K.logo.size, K.logo.size);
  else ball(ctx, K.logo.x + K.logo.size / 2, K.logo.y + K.logo.size / 2, K.logo.size / 2 - 4);
  ctx.fillStyle = '#ffffff'; ctx.font = font(54); spaced(ctx, 3); ctx.textAlign = 'left';
  ctx.fillText('EL PARTIDITO', K.logo.x + K.logo.size + 20, K.wordmarkBaseline);
  spaced(ctx, 0);
  // Gancho
  const hook = '¿CUÁNTO TE DARÍAN A VOS?';
  const hpx = fitFontPx(measure, hook, K.text.maxW, 64, 36);
  ctx.font = font(hpx);
  const hg = ctx.createLinearGradient(K.text.x, 0, K.text.x + K.text.maxW, 0);
  hg.addColorStop(0, GOLD_1); hg.addColorStop(1, '#f1c43f');
  ctx.fillStyle = hg; ctx.fillText(hook, K.text.x, K.headlineY);
  const subMeasure = measureWith(BODY, 500);
  const subPx = fitFontPx(subMeasure, 'Armá tu carta y votá a tus compañeros', K.text.maxW, 30, 22);
  ctx.font = font(subPx, 500, BODY); ctx.fillStyle = '#d3e3d9';
  ctx.fillText(wrapLines(subMeasure, 'Armá tu carta y votá a tus compañeros', subPx, K.text.maxW, 1)[0], K.text.x, K.subY);
  // Link
  const urlPx = 32;
  ctx.font = font(urlPx, 600, BODY);
  const uw = Math.min(K.text.maxW, ctx.measureText(SITE).width + 56);
  roundRectPath(ctx, K.pill.x, K.pill.y, uw, K.pill.h, K.pill.h / 2);
  const pg = ctx.createLinearGradient(K.pill.x, 0, K.pill.x + uw, 0);
  pg.addColorStop(0, GOLD_1); pg.addColorStop(1, GOLD_2);
  ctx.fillStyle = pg; ctx.fill();
  ctx.fillStyle = '#2a1f00'; ctx.textAlign = 'center';
  ctx.fillText(SITE, K.pill.x + uw / 2, K.pill.y + K.pill.h / 2 + urlPx * 0.34);

  // QR y leyenda
  drawQr(ctx, matrix, K.qr, qr.cell, qr.quiet);
  const cap = 'ESCANEÁ Y ARMÁ LA TUYA';
  const capPx = fitFontPx(measureWith(BODY, 600), cap, K.qr.w, 24, 16);
  ctx.font = font(capPx, 600, BODY); ctx.fillStyle = GOLD_1; ctx.textAlign = 'center';
  ctx.fillText(cap, K.qr.x + K.qr.w / 2, K.captionY);

  return new Promise((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('png'))), 'image/png'));
}
