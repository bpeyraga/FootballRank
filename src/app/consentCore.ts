// Consentimiento de cookies: lógica pura (sin DOM). La guarda consent.ts en una cookie propia y en localStorage.
// "all": funcionamiento + estadísticas de uso propias (track.ts). "necessary": solo lo necesario para que la app ande.

/** Subir el número si cambia el texto del aviso o lo que se guarda: se vuelve a preguntar. */
export const CONSENT_VERSION = 1;
export const CONSENT_COOKIE = 'ep_consent';
export const CONSENT_MAX_AGE_DAYS = 365;

export type ConsentChoice = 'all' | 'necessary';
export interface Consent { v: number; choice: ConsentChoice; at: number; id: string }

/** "1.all.1731400000000.<uuid>" (sin espacios ni ; para que viaje tal cual en la cookie). */
export const serializeConsent = (c: Consent) => `${c.v}.${c.choice}.${c.at}.${c.id}`;

/** Lo guardado, o null si falta, está roto o es de una versión vieja del aviso (hay que volver a preguntar). */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,3})\.(all|necessary)\.(\d{10,14})\.([0-9a-f-]{36})$/i);
  if (!m) return null;
  const c: Consent = { v: Number(m[1]), choice: m[2] as ConsentChoice, at: Number(m[3]), id: m[4].toLowerCase() };
  return c.v === CONSENT_VERSION ? c : null;
}

/** El valor de una cookie dentro de document.cookie, o null. */
export function readCookie(all: string, name: string): string | null {
  for (const part of all.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/** La línea para document.cookie (Secure solo en https: en http://localhost el navegador la rechazaría). */
export function cookieLine(c: Consent, https: boolean, days = CONSENT_MAX_AGE_DAYS): string {
  return `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(c))}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${https ? '; Secure' : ''}`;
}

/** ¿Se pueden contar las visitas? Solo con "Aceptar todo". */
export const allowsStats = (c: Consent | null) => c?.choice === 'all';
