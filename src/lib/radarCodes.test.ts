import { describe, expect, it } from 'vitest';
import { houseCodes } from './Radar';

describe('houseCodes', () => {
  it('3 letras, sin tildes, mantiene Ñ', () => {
    expect(houseCodes(['Morfón', 'Caño', 'Gambeteador'])).toEqual(['MOR', 'CAÑ', 'GAM']);
  });
  it('no repite entre sí ni con los base', () => {
    const c = houseCodes(['Morfón', 'Mortero', 'Tiro libre', 'Pasión']);
    expect(new Set(c).size).toBe(4);
    expect(c).not.toContain('TIR');
    expect(c).not.toContain('PAS');
    c.forEach(x => expect(x).toHaveLength(3));
  });
});

describe('houseCodes con código manual', () => {
  it('respeta el código elegido y no lo repite', () => {
    expect(houseCodes(['Morfón', 'Mortero'], ['FAN', null])).toEqual(['FAN', 'MOR']);
  });
  it('ignora un código manual que choca con los base', () => {
    expect(houseCodes(['Tiro libre'], ['TIR'])[0]).not.toBe('TIR');
  });
});
