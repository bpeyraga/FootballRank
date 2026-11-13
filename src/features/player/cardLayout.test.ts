import { describe, expect, it } from 'vitest';
import {
  SHARE_URL, SITE, STORY_H, STORY_W, cardFileName, cardInner, cardTier, ctaLayout, ellipsize, fitFontPx, initialOf, qrGeometry,
  shareMessage, shieldPoints, splitRow, storyLayout, summaryTiles, wrapLines,
  type Measure,
} from './cardLayout';

/** Medidor falso: cada carácter ocupa 0,5 × el tamaño. */
const measure: Measure = (t, px) => t.length * px * 0.5;

describe('storyLayout', () => {
  for (const hasSummary of [false, true]) {
    const L = storyLayout(hasSummary);
    const name = hasSummary ? 'con casillas de resumen' : 'sin casillas de resumen';
    it(`${name}: todo entra en 1080×1920 y la carta queda centrada`, () => {
      expect(L.card.x + L.card.w / 2).toBe(STORY_W / 2);
      expect(L.card.x).toBe(Math.round(L.card.x));
      expect(L.brandY).toBeLessThan(L.communityY);
      expect(L.communityY).toBeLessThan(L.card.y);
      expect(L.card.y + L.card.h).toBeLessThan(L.cta.y);
      expect(L.cta.y + L.cta.h).toBeLessThan(STORY_H);
      expect(L.cta.x).toBeGreaterThanOrEqual(0);
      expect(L.cta.x + L.cta.w).toBeLessThanOrEqual(STORY_W);
    });
    it(`${name}: la carta mantiene la proporción de la app (196×280)`, () => {
      expect(L.card.h / L.card.w).toBeCloseTo(280 / 196, 1);
    });
  }
  it('las casillas de resumen van entre la carta y la invitación, y sin ellas la carta es más grande', () => {
    const a = storyLayout(false), b = storyLayout(true);
    expect(a.summary.h).toBe(0);
    expect(b.summary.y).toBeGreaterThan(b.card.y + b.card.h);
    expect(b.summary.y + b.summary.h).toBeLessThan(b.cta.y);
    expect(a.card.w).toBeGreaterThan(b.card.w);
  });
  it('deja el margen de abajo libre para la barra de respuesta de las historias', () => {
    const { cta } = storyLayout();
    expect(STORY_H - (cta.y + cta.h)).toBeGreaterThanOrEqual(150);
  });
});

describe('cardInner', () => {
  const card = storyLayout().card;
  const I = cardInner(card);
  it('foto, nombre y stats caen dentro de la carta y arriba de la punta del escudo', () => {
    expect(I.photo.cx + I.photo.r).toBeLessThan(card.x + card.w);
    expect(I.photo.cx - I.photo.r).toBeGreaterThan(card.x);
    expect(I.photo.cy - I.photo.r).toBeGreaterThan(card.y);
    expect(I.name.baseline).toBeGreaterThan(I.photo.cy + I.photo.r);
    for (const s of I.stats) {
      expect(s.baseline).toBeGreaterThan(I.name.baseline);
      expect(s.baseline).toBeLessThan(card.y + card.h * 0.85);
      expect(s.valueRight).toBeLessThan(s.labelLeft);
      expect(s.labelLeft).toBeGreaterThan(card.x);
    }
  });
  it('seis stats en dos columnas de a pares', () => {
    expect(I.stats.map(s => s.key)).toEqual(['rit', 'tir', 'pas', 'reg', 'def', 'fis']);
    expect(I.stats[0].baseline).toBe(I.stats[1].baseline);
    expect(I.stats[2].baseline).toBeGreaterThan(I.stats[0].baseline);
    expect(I.stats[1].labelLeft).toBeGreaterThan(I.stats[0].labelLeft);
  });
  it('la columna OVR/posición/escudo no pisa la foto', () => {
    expect(I.crest.cx + I.crest.w / 2).toBeLessThan(I.photo.cx - I.photo.r);
    expect(I.ovr.baseline).toBeLessThan(I.pos.baseline);
    expect(I.pos.baseline).toBeLessThan(I.crest.top);
  });
  it('la línea entre columnas de stats cae entre las dos columnas y dentro de la carta', () => {
    expect(I.divider.x).toBeGreaterThan(I.stats[0].labelLeft);
    expect(I.divider.x).toBeLessThan(I.stats[1].valueRight - I.statPx * 1.2);
    expect(I.divider.y1).toBeGreaterThan(I.name.baseline);
    expect(I.divider.y2).toBeLessThan(card.y + card.h * 0.85);
  });
  it('los puntos del escudo siguen el clip-path de la carta', () => {
    const pts = shieldPoints(card);
    expect(pts[0]).toEqual([card.x + card.w / 2, card.y]);
    expect(pts[3]).toEqual([card.x + card.w / 2, card.y + card.h]);
    expect(pts).toHaveLength(6);
  });
});

describe('texto', () => {
  it('fitFontPx achica hasta que entra, sin pasar el mínimo', () => {
    expect(fitFontPx(measure, 'ABCD', 100, 80, 20)).toBe(50); // 4*50*.5 = 100
    expect(fitFontPx(measure, 'AB', 100, 80, 20)).toBe(80);
    expect(fitFontPx(measure, 'A'.repeat(100), 100, 80, 20)).toBe(20);
  });
  it('ellipsize recorta con "…" solo si hace falta', () => {
    expect(ellipsize(measure, 'Hola', 20, 100)).toBe('Hola');
    const out = ellipsize(measure, 'Juan Sebastián Pérez', 20, 100);
    expect(out.endsWith('…')).toBe(true);
    expect(measure(out, 20)).toBeLessThanOrEqual(100);
  });
  it('initialOf y cardFileName', () => {
    expect(initialOf('  lucía')).toBe('L');
    expect(initialOf('')).toBe('?');
    expect(cardFileName('Lucía Peña')).toBe('ficha-lucia-pena.png');
    expect(cardFileName('¡¡¡')).toBe('ficha-jugador.png');
  });
  it('cardTier usa los mismos cortes que la app', () => {
    expect([null, 64, 65, 74, 75].map(cardTier)).toEqual(['none', 'bronze', 'silver', 'silver', 'gold']);
  });
});

describe('wrapLines', () => {
  it('parte por palabras y respeta el máximo de líneas', () => {
    expect(wrapLines(measure, 'uno dos tres', 10, 1000, 2)).toEqual(['uno dos tres']);
    expect(wrapLines(measure, 'uno dos tres', 10, 30, 3)).toEqual(['uno', 'dos', 'tres']); // 'uno dos' = 7*5 = 35 > 30
    const out = wrapLines(measure, 'uno dos tres cuatro cinco', 10, 40, 2);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith('…')).toBe(true);
    expect(out.every(l => measure(l, 10) <= 40)).toBe(true);
  });
  it('una palabra más larga que el ancho no se pierde (se recorta con …) y el texto vacío no da líneas', () => {
    expect(wrapLines(measure, 'supercalifragilistico', 10, 50, 1)).toEqual([ellipsize(measure, 'supercalifragilistico', 10, 50)]);
    expect(wrapLines(measure, '   ', 10, 50, 2)).toEqual([]);
  });
});

describe('QR e invitación', () => {
  it('el link del QR lleva el ref de la carta y es el del sitio', () => {
    expect(SHARE_URL).toBe('https://elpartidito.vercel.app/?ref=card');
    expect(SHARE_URL).toContain(SITE);
  });
  it('qrGeometry: módulos enteros, zona de silencio de 4 módulos y no pasa del máximo', () => {
    const g = qrGeometry(29, 262);
    expect(g.quiet).toBe(4);
    expect(Number.isInteger(g.cell)).toBe(true);
    expect(g.size).toBe(g.cell * (29 + 8));
    expect(g.size).toBeLessThanOrEqual(262);
    expect(g.inner).toBe(g.cell * 29);
    // más módulos (QR más denso) → módulos más chicos, nunca menos de 1 px
    expect(qrGeometry(57, 262).cell).toBeLessThan(g.cell);
    expect(qrGeometry(200, 100).cell).toBe(1);
  });
  it('ctaLayout: QR y leyenda dentro del bloque, y el texto no pisa al QR', () => {
    const { cta } = storyLayout();
    const g = qrGeometry(29, 262);
    const K = ctaLayout(cta, g.size);
    expect(K.qr.w).toBe(g.size);
    expect(K.qr.x).toBeGreaterThan(cta.x);
    expect(K.qr.x + K.qr.w).toBeLessThan(cta.x + cta.w);
    expect(K.qr.y).toBeGreaterThan(cta.y);
    expect(K.captionY).toBeLessThan(cta.y + cta.h);
    expect(K.text.x + K.text.maxW).toBeLessThan(K.qr.x);
    expect(K.text.maxW).toBeGreaterThan(400);
    expect(K.logo.y).toBeGreaterThan(cta.y);
    expect(K.logo.y + K.logo.size).toBeLessThan(K.headlineY);
    expect(K.headlineY).toBeLessThan(K.subY);
    expect(K.subY).toBeLessThan(K.pill.y);
    expect(K.pill.y + K.pill.h).toBeLessThan(cta.y + cta.h);
  });
});

describe('shareMessage', () => {
  it('invita a armar la propia carta y trae el link con ?ref=card', () => {
    const m = shareMessage('Juan', 74, true);
    expect(m.text).toBe('Mirá mi carta en El Partidito: OVR 74. Armá la tuya: https://elpartidito.vercel.app/?ref=card');
    expect(m.title).toBe('Mi carta en El Partidito');
  });
  it('de otro jugador nombra a quien es; sin OVR no inventa el número', () => {
    const m = shareMessage('Juan', 74, false);
    expect(m.text).toContain('la carta de Juan');
    expect(m.title).toBe('Juan en El Partidito');
    expect(shareMessage('Juan', null, true).text).toBe('Mirá mi carta en El Partidito. Armá la tuya: ' + SHARE_URL);
  });
});

describe('splitRow / summaryTiles', () => {
  it('reparte casilleros iguales con separación', () => {
    const r = splitRow(100, 800, 4, 20);
    expect(r).toHaveLength(4);
    expect(r[0].x).toBe(100);
    expect(r[3].x + r[3].w).toBeCloseTo(900);
    expect(new Set(r.map(c => c.w)).size).toBe(1);
    expect(splitRow(0, 100, 0, 10)).toEqual([]);
  });
  it('resumen: PJ, goles, asistencias y figura o presentismo', () => {
    expect(summaryTiles({ pj: 12, goals: 5, assists: 3, presence: 80, mvps: 0 }).map(t => t.label))
      .toEqual(['PARTIDOS', 'GOLES', 'ASISTENCIAS', 'PRESENTISMO']);
    const t = summaryTiles({ pj: 12, goals: 5, assists: 3, presence: 80, mvps: 2 });
    expect(t.map(x => x.label)).toEqual(['PARTIDOS', 'GOLES', 'ASISTENCIAS', 'FIGURA']);
    expect(summaryTiles({ presence: 100 })).toEqual([{ label: 'PRESENTISMO', value: '100%' }]);
    expect(summaryTiles({})).toEqual([]);
  });
});
