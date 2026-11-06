import { describe, expect, it } from 'vitest';
import { debtsOf, feeError, feeNum, feeSummary, isPayer, money, owedText, perPerson, type FeeMatch, type PaySignup } from './fees';

const su = (id: string, o: Partial<PaySignup> = {}): PaySignup => ({ profile_id: id, status: 'in', absent: false, paid_at: null, ...o });
const PAID = '2026-11-07T01:00:00Z';

describe('perPerson', () => {
  it('divide y redondea para arriba al peso', () => {
    expect(perPerson(30000, 10)).toBe(3000);
    expect(perPerson(10000, 3)).toBe(3334);
    expect(perPerson(1, 10)).toBe(1);
  });
  it('división exacta que da ruido de coma flotante no suma un peso', () => {
    expect(perPerson(30000, 3)).toBe(10000);
    expect(perPerson(0.3, 3)).toBe(1); // 0.1 → 1 peso
  });
  it('sin cuota o sin jugadores es 0', () => {
    expect(perPerson(null, 10)).toBe(0);
    expect(perPerson(undefined, 10)).toBe(0);
    expect(perPerson(0, 10)).toBe(0);
    expect(perPerson(5000, 0)).toBe(0);
    expect(perPerson(-5, 3)).toBe(0);
  });
  it('acepta el string que devuelve la API para numeric', () => {
    expect(perPerson('24000.00' as any, 8)).toBe(3000);
  });
});

describe('feeNum', () => {
  it('número positivo o null', () => {
    expect(feeNum(5000)).toBe(5000);
    expect(feeNum('5000.50')).toBe(5000.5);
    expect(feeNum(0)).toBeNull();
    expect(feeNum(null)).toBeNull();
    expect(feeNum('abc')).toBeNull();
    expect(feeNum(NaN)).toBeNull();
  });
});

describe('money', () => {
  it('miles con punto, sin decimales', () => {
    expect(money(0)).toBe('$0');
    expect(money(999)).toBe('$999');
    expect(money(1000)).toBe('$1.000');
    expect(money(12500)).toBe('$12.500');
    expect(money(1234567)).toBe('$1.234.567');
    expect(money(3333.2)).toBe('$3.333');
  });
});

describe('isPayer / feeSummary', () => {
  it('solo cuentan los anotados no ausentes', () => {
    expect(isPayer({ status: 'in', absent: false })).toBe(true);
    expect(isPayer({ status: 'in', absent: true })).toBe(false);
    expect(isPayer({ status: 'waitlist', absent: false })).toBe(false);
    expect(isPayer({ status: 'out', absent: false })).toBe(false);
  });
  it('resumen: cuántos, cuántos pagaron, c/u y lo que falta', () => {
    const s = feeSummary(10000, [su('a', { paid_at: PAID }), su('b'), su('c'), su('d', { absent: true }), su('e', { status: 'waitlist' })]);
    expect(s).toEqual({ players: 3, paid: 1, each: 3334, owed: 6668, collected: 3334 });
  });
  it('sin cuota o sin jugadores', () => {
    expect(feeSummary(null, [su('a')]).each).toBe(0);
    expect(feeSummary(5000, [])).toEqual({ players: 0, paid: 0, each: 0, owed: 0, collected: 0 });
  });
});

describe('debtsOf', () => {
  const m = (id: string, o: Partial<FeeMatch> = {}): FeeMatch => ({
    id, title: `P${id}`, starts_at: `2026-11-0${id}T21:00:00Z`, status: 'played', fee_total: 4000,
    signups: [su('a'), su('b', { paid_at: PAID }), su('c'), su('d', { absent: true })], ...o,
  });
  it('cada deudor debe la cuota dividida entre los que jugaron (sin ausentes), redondeada para arriba', () => {
    const d = debtsOf([m('1')]); // 4000 / 3 jugadores = 1334; b ya pagó, d estuvo ausente
    expect(d.map(x => [x.profile_id, x.total])).toEqual([['a', 1334], ['c', 1334]]);
  });
  it('acumula varios partidos y ordena de mayor a menor deuda', () => {
    const d = debtsOf([
      m('1', { fee_total: 3000, signups: [su('a'), su('b'), su('c', { paid_at: PAID })] }),
      m('2', { fee_total: 3000, signups: [su('a'), su('b', { paid_at: PAID }), su('c', { paid_at: PAID })] }),
    ]);
    expect(d.map(x => [x.profile_id, x.total, x.items.length])).toEqual([['a', 2000, 2], ['b', 1000, 1]]);
    expect(d[0].items.map(i => i.match_id)).toEqual(['1', '2']); // del más viejo al más nuevo
  });
  it('ignora partidos no jugados, cancelados, sin cuota o con cuota 0', () => {
    expect(debtsOf([
      m('1', { status: 'open' }), m('2', { status: 'cancelled' }), m('3', { fee_total: null }), m('4', { fee_total: 0 }),
    ])).toEqual([]);
  });
  it('nadie debe si todos pagaron o si no hubo jugadores', () => {
    expect(debtsOf([m('1', { signups: [su('a', { paid_at: PAID })] }), m('2', { signups: [] })])).toEqual([]);
  });
  it('los anotados en lista de espera no deben', () => {
    expect(debtsOf([m('1', { signups: [su('a'), su('w', { status: 'waitlist' })] })]).map(x => x.profile_id)).toEqual(['a']);
  });
  it('acepta fee_total como string', () => {
    expect(debtsOf([m('1', { fee_total: '6000.00', signups: [su('a'), su('b')] })]).map(x => x.total)).toEqual([3000, 3000]);
  });
});

describe('owedText / feeError', () => {
  it('singular y plural', () => {
    expect(owedText({ total: 3000, items: [{} as any] })).toBe('$3.000 en 1 partido');
    expect(owedText({ total: 7500, items: [{} as any, {} as any, {} as any] })).toBe('$7.500 en 3 partidos');
  });
  it('mensajes en español', () => {
    expect(feeError('bad_fee')).toContain('entre $0');
    expect(feeError('not_player')).toContain('anotados');
    expect(feeError('forbidden')).toContain('permiso');
    expect(feeError('algo raro')).toBe('algo raro');
  });
});
