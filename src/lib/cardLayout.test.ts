import { describe, expect, it } from 'vitest';
import {
  STORY_H, STORY_W, cardFileName, cardInner, cardTier, ellipsize, fitFontPx, initialOf, shieldPoints, splitRow, storyLayout, summaryTiles,
  type Measure,
} from './cardLayout';

/** Medidor falso: cada carácter ocupa 0,5 × el tamaño. */
const measure: Measure = (t, px) => t.length * px * 0.5;

describe('storyLayout', () => {
  const L = storyLayout();
  it('todo entra en 1080×1920 y la carta queda centrada', () => {
    expect(L.card.x + L.card.w / 2).toBe(STORY_W / 2);
    expect(L.card.y + L.card.h).toBeLessThan(L.summary.y);
    expect(L.summary.y + L.summary.h).toBeLessThan(L.footerY);
    expect(L.footerY).toBeLessThan(STORY_H);
    expect(L.brandY).toBeLessThan(L.communityY);
    expect(L.communityY).toBeLessThan(L.card.y);
  });
  it('la carta mantiene la proporción de la app (196×280)', () => {
    expect(L.card.h / L.card.w).toBeCloseTo(280 / 196, 2);
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
