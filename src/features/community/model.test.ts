import { describe, expect, it } from 'vitest';
import { ORDER, adminError, regenNotice } from './model';

describe('comunidad', () => {
  it('aviso del link nuevo', () => {
    expect(regenNotice(null)).toBe('Link nuevo generado; el anterior ya no sirve');
    expect(regenNotice(24)).toBe('Link nuevo generado (vence en 24 horas); el anterior ya no sirve');
    expect(regenNotice(168)).toBe('Link nuevo generado (vence en 7 días); el anterior ya no sirve');
  });
  it('errores de admin', () => {
    expect(adminError('P0001: forbidden')).toBe('No tenés permiso para hacer eso.');
    expect(adminError('bad_target')).toMatch(/transferir/);
    expect(adminError('TypeError: Failed to fetch')).toBe('Sin conexión. Probá de nuevo.');
    expect(adminError('otra')).toBe('otra');
  });
  it('owner, admins y después el resto', () => {
    expect(['member', 'owner', 'admin'].sort((a, b) => ORDER[a] - ORDER[b])).toEqual(['owner', 'admin', 'member']);
  });
});
