import { describe, expect, it } from 'vitest';
import { clubVars } from './theme';

describe('clubVars ("Mi club")', () => {
  it('usa el color fuerte del club, no el blanco', () => {
    expect(clubVars('River Plate')?.c).toBe('#d71920');   // blanco con banda roja → rojo
    expect(clubVars('Boca Juniors')?.c).toBe('#0b3b8c');  // azul
    expect(clubVars('Huracán')?.c).toBe('#d71920');       // camiseta blanca → color de la sigla
  });
  it('elige texto legible y aclara el acento para modo oscuro', () => {
    const b = clubVars('Boca Juniors')!;
    expect(b.fg).toBe('#ffffff');
    expect(b.d).not.toBe(b.c);
    expect(b.dfg).toBe('#111111');
  });
  it('sin equipo o equipo desconocido: null', () => {
    expect(clubVars(null)).toBeNull();
    expect(clubVars('Club Inventado')).toBeNull();
  });
});
