import { describe, expect, it } from 'vitest';
import { allowsStats, CONSENT_VERSION, cookieLine, decideConsentSync, hasStoredSession, parseConsent, parseServerConsent, readCookie, serializeConsent, type Consent, type ServerConsent } from './consentCore';

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

describe('elección guardada en la cuenta', () => {
  const srv: ServerConsent = { consent_id: c.id, choice: 'all', version: CONSENT_VERSION, created_at: new Date(c.at).toISOString() };

  it('parsea la fila de my_consent y descarta lo roto o de otra versión', () => {
    expect(parseServerConsent([srv])).toEqual(srv);
    expect(parseServerConsent(srv)).toEqual(srv);
    expect(parseServerConsent([])).toBeNull();
    expect(parseServerConsent(null)).toBeNull();
    expect(parseServerConsent([{ ...srv, version: CONSENT_VERSION + 1 }])).toBeNull();
    expect(parseServerConsent([{ ...srv, choice: 'todo' }])).toBeNull();
    expect(parseServerConsent([{ ...srv, consent_id: 'x' }])).toBeNull();
    expect(parseServerConsent([{ ...srv, created_at: 'ayer' }])).toBeNull();
  });

  it('sin elección acá y con una en la cuenta: se aplica (sin registrar de nuevo)', () => {
    expect(decideConsentSync(null, srv)).toBe('apply');
  });
  it('sin nada en la cuenta: la de acá se registra con la cuenta; sin nada en ningún lado, nada', () => {
    expect(decideConsentSync(c, null)).toBe('record');
    expect(decideConsentSync(null, null)).toBe('keep');
  });
  it('si coinciden no se registra un duplicado', () => {
    expect(decideConsentSync(c, srv)).toBe('keep');
    expect(decideConsentSync({ ...c, id: '0f8fad5b-d9cb-469f-a165-70867728950f' }, srv)).toBe('keep');
  });
  it('si difieren gana la más nueva', () => {
    const newerHere: Consent = { ...c, choice: 'necessary', at: c.at + 5000 };
    const olderHere: Consent = { ...c, choice: 'necessary', at: c.at - 5000 };
    expect(decideConsentSync(newerHere, srv)).toBe('record');
    expect(decideConsentSync(olderHere, srv)).toBe('apply');
  });

  it('detecta sesión guardada o vuelta de login para esperar a la cuenta', () => {
    expect(hasStoredSession(['fr-vid', 'sb-abcd-auth-token'], { hash: '', search: '' })).toBe(true);
    expect(hasStoredSession(['fr-vid', 'fr-consent'], { hash: '', search: '' })).toBe(false);
    expect(hasStoredSession([], { hash: '#access_token=abc&x=1', search: '' })).toBe(true);
    expect(hasStoredSession([], { hash: '', search: '?code=abc' })).toBe(true);
    expect(hasStoredSession([], { hash: '#/c/mi-grupo', search: '' })).toBe(false);
  });
});
