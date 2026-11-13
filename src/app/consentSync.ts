// Sincroniza el aviso de cookies con la cuenta: quien ya eligió en otro dispositivo (u otro dominio, o con el almacenamiento
// borrado) no vuelve a ver el aviso. La decisión pura está en consentCore.ts (decideConsentSync).
import { loadMyConsent, sessionUserId } from '../features/auth/api';
import { finishConsentSync, getConsent, restoreConsent } from './consent';
import { CONSENT_VERSION, decideConsentSync, parseServerConsent } from './consentCore';
import { logConsent } from './track';

let doneFor: string | null = null;

/**
 * Con sesión: trae la última elección de la cuenta (my_consent) y la aplica acá sin registrarla de nuevo; si la de este
 * navegador es la vigente, la registra con la cuenta (la que se hizo antes de entrar). Siempre libera al aviso al terminar.
 * Nunca rompe nada: si falla (sin conexión, sin la migración) queda lo local y el aviso sale como siempre.
 */
export async function syncConsentWithAccount(userId?: string): Promise<void> {
  let release = true; // el que llega mientras otro está en curso no libera al aviso: lo libera el que corre
  try {
    const uid = userId ?? (await sessionUserId());
    if (!uid) return; // sin sesión (landing): el aviso sale como siempre
    if (doneFor === uid) { release = false; return; } // ya hecho o en curso (el arranque y SIGNED_IN llegan casi juntos)
    doneFor = uid;
    let data: unknown;
    try { data = await loadMyConsent(CONSENT_VERSION); } catch { doneFor = null; return; }
    const local = getConsent();
    const server = parseServerConsent(data);
    const act = decideConsentSync(local, server);
    if (act === 'apply' && server) restoreConsent(server.choice, server.consent_id, Date.parse(server.created_at));
    else if (act === 'record' && local) await logConsent(local);
  } catch { doneFor = null; /* silencioso */ } finally {
    if (release) finishConsentSync();
  }
}
