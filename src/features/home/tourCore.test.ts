import { describe, expect, it } from 'vitest';
import { TOUR_KEY, TOUR_STEPS, clampStep, keyAction, makeTourGate, makeTourRequest, swipeDir, tourSyncAction } from './tourCore';

const fakeStore = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };

describe('pasos del tutorial', () => {
  it('son entre 4 y 6, con texto y sin títulos repetidos', () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(4);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(6);
    for (const s of TOUR_STEPS) { expect(s.emoji).toBeTruthy(); expect(s.title.trim()).toBeTruthy(); expect(s.text.trim()).toBeTruthy(); }
    expect(new Set(TOUR_STEPS.map(s => s.title)).size).toBe(TOUR_STEPS.length);
  });
});

describe('teclado y deslizar', () => {
  it('flechas y Escape', () => {
    expect(keyAction('ArrowRight')).toBe('next');
    expect(keyAction('ArrowLeft')).toBe('prev');
    expect(keyAction('Escape')).toBe('close');
    expect(keyAction('Enter')).toBeNull();
    expect(keyAction('a')).toBeNull();
  });
  it('clampStep no se sale de los pasos', () => {
    expect(clampStep(0, -1, 5)).toBe(0);
    expect(clampStep(4, 1, 5)).toBe(4);
    expect(clampStep(2, 1, 5)).toBe(3);
    expect(clampStep(2, -1, 5)).toBe(1);
  });
  it('swipeDir: izquierda = siguiente, derecha = anterior, toques y scroll vertical no cuentan', () => {
    expect(swipeDir(-80, 5)).toBe(-1);
    expect(swipeDir(80, -5)).toBe(1);
    expect(swipeDir(-20, 0)).toBe(0);
    expect(swipeDir(-60, 70)).toBe(0);
    expect(swipeDir(0, 0)).toBe(0);
  });
});

describe('tourGate', () => {
  it('se muestra una vez y queda guardado en el dispositivo', () => {
    const st = fakeStore();
    const g = makeTourGate(() => st);
    expect(g.due()).toBe(true);
    g.mark();
    expect(st.m.get(TOUR_KEY)).toBe('1');
    expect(g.due()).toBe(false);
    // otra sesión (módulo nuevo) con el mismo storage: ya lo vio
    expect(makeTourGate(() => st).due()).toBe(false);
  });
  it('si el storage falla, a lo sumo una vez por sesión', () => {
    const g = makeTourGate(() => broken);
    expect(g.due()).toBe(true);
    g.mark();
    expect(g.due()).toBe(false);
  });
  it('sin storage (null) también', () => {
    const g = makeTourGate(() => null);
    expect(g.due()).toBe(true);
    g.mark();
    expect(g.due()).toBe(false);
  });
  it('el que lo pidió a mano no lo marca: solo mark() lo marca', () => {
    const st = fakeStore();
    const g = makeTourGate(() => st);
    g.due(); g.due();
    expect(st.m.size).toBe(0);
  });
});

describe('tutorial en la cuenta', () => {
  it('si la cuenta ya lo vio, no se muestra aunque este dispositivo no lo tenga', () => {
    const g = makeTourGate(() => fakeStore());
    expect(g.due(true)).toBe(false);
    expect(g.due(false)).toBe(true);
  });
  it('local() refleja la marca del dispositivo', () => {
    const st = fakeStore();
    const g = makeTourGate(() => st);
    expect(g.local()).toBe(false);
    g.mark();
    expect(g.local()).toBe(true);
    expect(makeTourGate(() => broken).local()).toBe(false);
  });
  it('sincronización local vs cuenta', () => {
    expect(tourSyncAction(false, true)).toBe('setLocal');
    expect(tourSyncAction(true, false)).toBe('backfill');
    expect(tourSyncAction(true, true)).toBe('none');
    expect(tourSyncAction(false, false)).toBe('none');
    // base sin la migración: no se sabe, no se toca la cuenta
    expect(tourSyncAction(true, undefined)).toBe('none');
    expect(tourSyncAction(false, undefined)).toBe('none');
  });
});

describe('tourRequest (ver el tutorial desde Ajustes)', () => {
  it('sin pedido no hay tutorial', () => {
    expect(makeTourRequest().take()).toBe(false);
  });
  it('se recoge una sola vez', () => {
    const r = makeTourRequest();
    r.ask(1000);
    expect(r.take(1500)).toBe(true);
    expect(r.take(1600)).toBe(false);
  });
  it('un pedido viejo caduca y no abre el tutorial de sorpresa', () => {
    const r = makeTourRequest(5000);
    r.ask(0);
    expect(r.take(5001)).toBe(false);
    r.ask(10_000);
    expect(r.take(15_000)).toBe(true);
  });
});
