// Anti-bots del registro con correo: prueba de trabajo propia (ver supabase/migrations/20261114200000_signup_pow.sql).
// La base manda un desafío firmado (challenge = sha256(salt + n), con n secreto ≤ maxnumber); el navegador prueba números
// hasta encontrar n y la solución viaja en signUp (options.data.pow). Lógica pura: el hash se inyecta para poder testear.

export interface PowChallenge { algorithm: string; salt: string; challenge: string; maxnumber: number; signature: string }
export interface PowSolution { salt: string; challenge: string; signature: string; number: string }

/** Desafío bien formado o null (si la base no lo tiene activo devuelve null y el registro sigue sin él). */
export function parseChallenge(x: unknown): PowChallenge | null {
  const c = x as Partial<PowChallenge> | null;
  if (!c || typeof c !== 'object') return null;
  const hex64 = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
  if (c.algorithm !== 'SHA-256' || typeof c.salt !== 'string' || !c.salt || c.salt.length > 100) return null;
  if (!hex64(c.challenge) || !hex64(c.signature)) return null;
  if (typeof c.maxnumber !== 'number' || !Number.isInteger(c.maxnumber) || c.maxnumber < 1 || c.maxnumber > 1_000_000) return null;
  return c as PowChallenge;
}

/** Vencimiento del desafío (ms) según el salt ("…?expires=<segundos>"); null si no lo trae. */
export function challengeExpiry(salt: string): number | null {
  const m = salt.match(/\?expires=(\d{1,12})$/);
  return m ? Number(m[1]) * 1000 : null;
}

export type Sha256Hex = (s: string) => Promise<string>;

/** SHA-256 en hexadecimal con la API del navegador. */
export const sha256Hex: Sha256Hex = async s => {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  let out = '';
  for (const b of d) out += b.toString(16).padStart(2, '0');
  return out;
};

/**
 * Busca n tal que sha256(salt + n) = challenge, de 0 a maxnumber. null si no está (desafío inválido) o si se cancela.
 * Cede el hilo cada `batch` intentos para no congelar la pantalla mientras se escribe.
 */
export async function solve(c: PowChallenge, hash: Sha256Hex = sha256Hex, cancelled: () => boolean = () => false, batch = 500): Promise<PowSolution | null> {
  for (let n = 0; n <= c.maxnumber; n++) {
    if (n % batch === 0) {
      if (cancelled()) return null;
      if (n) await new Promise(r => setTimeout(r, 0));
    }
    if ((await hash(c.salt + n)) === c.challenge) return { salt: c.salt, challenge: c.challenge, signature: c.signature, number: String(n) };
  }
  return null;
}

/** El alta la frenó la base (pow_guard): GoTrue lo devuelve como error genérico de base de datos. */
export const powErrorText = (msg: string): string | null =>
  /database error saving new user|pow_failed/i.test(msg)
    ? 'No pudimos verificar el registro. Recargá la página y probá de nuevo; si sigue pasando, entrá con Google.'
    : null;
