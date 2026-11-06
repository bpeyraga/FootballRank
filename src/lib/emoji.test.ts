import { describe, expect, it } from 'vitest';
import { isJumbo, REACTIONS } from './emoji';

describe('isJumbo', () => {
  it('de 1 a 3 emojis solos se ven grandes', () => {
    expect(isJumbo('⚽')).toBe(true);
    expect(isJumbo('⚽🔥')).toBe(true);
    expect(isJumbo(' 👏👏👏 ')).toBe(true);
    expect(isJumbo('❤️‍🔥')).toBe(true);
    expect(isJumbo('👍🏽')).toBe(true);
  });
  it('texto, números o muchos emojis no', () => {
    expect(isJumbo('hola ⚽')).toBe(false);
    expect(isJumbo('10')).toBe(false);
    expect(isJumbo('#')).toBe(false);
    expect(isJumbo('😂😂😂😂')).toBe(false);
    expect(isJumbo('')).toBe(false);
  });
  it('las reacciones coinciden con el CHECK de la base', () => {
    expect([...REACTIONS]).toEqual(['👍', '❤️', '😂', '😮', '😢', '🙏', '⚽', '🔥']);
  });
});
