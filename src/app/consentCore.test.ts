import { describe, expect, it } from 'vitest';
import { allowsStats, CONSENT_VERSION, cookieLine, parseConsent, readCookie, serializeConsent, type Consent } from './consentCore';

const c: Consent = { v: CONSENT_VERSION, choice: 'all', at: 1_731_400_000_000, id: '0f8fad5b-d9cb-469f-a165-70867728950e' };

describe('consentimiento de cookies', () => {
  it('ida y vuelta', () => {
    expect(parseConsent(serializeConsent(c))).toEqual(c);
    expect(parseConsent(serializeConsent({ ...c, choice: 'necessary' }))?.choice).toBe('necessary');
  });

  it('rechaza lo roto, lo vacío y las versiones viejas del aviso', () => {
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent('')).toBeNull();
    expect(parseConsent('1.todo.1731400000000.' + c.id)).toBeNull();
    expect(parseConsent('1.all.ayer.' + c.id)).toBeNull();
    expect(parseConsent(serializeConsent({ ...c, v: CONSENT_VERSION + 1 }))).toBeNull();
    expect(parseConsent('1.all.1731400000000.<script>')).toBeNull();
  });

  it('lee la cookie entre otras', () => {
    const all = `a=1; ep_consent=${encodeURIComponent(serializeConsent(c))}; b=2`;
    expect(parseConsent(readCookie(all, 'ep_consent'))).toEqual(c);
    expect(readCookie('a=1; b=2', 'ep_consent')).toBeNull();
    expect(readCookie('xep_consent=1', 'ep_consent')).toBeNull();
  });

  it('arma la cookie con vencimiento y Secure solo en https', () => {
    expect(cookieLine(c, true)).toMatch(/^ep_consent=.+; Max-Age=31536000; Path=\/; SameSite=Lax; Secure$/);
    expect(cookieLine(c, false)).not.toMatch(/Secure/);
  });

  it('las estadísticas solo con "Aceptar todo"', () => {
    expect(allowsStats(c)).toBe(true);
    expect(allowsStats({ ...c, choice: 'necessary' })).toBe(false);
    expect(allowsStats(null)).toBe(false);
  });
});
