import { describe, expect, it } from 'vitest';
import { ANY_SHIRT, SHIRTS, shirtLabel, shirtsClash } from './shirts';

const SQL = Object.values(import.meta.glob('../../../supabase/migrations/*_team_shirts.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];

describe('camisetas', () => {
  it('blanco y negro van primero', () => {
    expect(SHIRTS.slice(0, 2).map(s => s.key)).toEqual(['blanco', 'negro']);
  });
  it('los colores de la app son los mismos que acepta la base (más "indistinto")', () => {
    const list = SQL.match(/ok text := '\((.*)\)';/)![1].replace(/''/g, "'").split(',').map(s => s.replace(/'/g, ''));
    expect(list).toEqual([...SHIRTS.map(s => s.key), ANY_SHIRT]);
  });
  it('etiquetas y choque de colores', () => {
    expect(shirtLabel('negro')).toBe('Camiseta negra');
    expect(shirtLabel(ANY_SHIRT)).toBe('Color indistinto');
    expect(shirtLabel(null)).toBe('Sin elegir');
    expect(shirtsClash('rojo', 'rojo')).toBe(true);
    expect(shirtsClash(ANY_SHIRT, ANY_SHIRT)).toBe(false);
    expect(shirtsClash('rojo', null)).toBe(false);
  });
});
