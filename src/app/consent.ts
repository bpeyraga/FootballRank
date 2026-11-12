// Consentimiento de cookies en el navegador: cookie propia (ep_consent) + copia en localStorage, y aviso a quien escuche.
// La lógica pura está en consentCore.ts; el registro en la base lo hace track.ts (logConsent).
import { cookieLine, CONSENT_COOKIE, CONSENT_VERSION, parseConsent, readCookie, serializeConsent, type Consent, type ConsentChoice } from './consentCore';

const LS_KEY = 'fr-consent';
const listeners = new Set<(c: Consent | null) => void>(); // elecciones hechas en esta pestaña (para registrarlas una sola vez)
const syncListeners = new Set<(c: Consent | null) => void>(); // cualquier cambio, también el de otra pestaña (frenar/arrancar las estadísticas)
const openers = new Set<() => void>();

function newId(): string {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* contexto no seguro */ }
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Lo que eligió en este navegador (cookie; si no está, la copia de localStorage), o null si nunca eligió. */
export function getConsent(): Consent | null {
  try {
    const c = parseConsent(readCookie(document.cookie, CONSENT_COOKIE));
    if (c) return c;
  } catch { /* sin cookies */ }
  try { return parseConsent(localStorage.getItem(LS_KEY)); } catch { return null; }
}

/** Guarda la elección (cookie de 1 año + localStorage) y avisa. Conserva el id si ya había elegido antes. */
export function setConsent(choice: ConsentChoice): Consent {
  const c: Consent = { v: CONSENT_VERSION, choice, at: Date.now(), id: getConsent()?.id ?? newId() };
  try { document.cookie = cookieLine(c, location.protocol === 'https:'); } catch { /* sin cookies */ }
  try { localStorage.setItem(LS_KEY, serializeConsent(c)); } catch { /* sin storage */ }
  listeners.forEach(f => { try { f(c); } catch { /* que no corte a los demás */ } });
  syncListeners.forEach(f => { try { f(c); } catch { /* ídem */ } });
  return c;
}

/** Se llama una vez por cada elección hecha en esta pestaña. */
export function onConsent(f: (c: Consent | null) => void): () => void { listeners.add(f); return () => listeners.delete(f); }
/** Se llama con la elección vigente cada vez que cambia, venga de esta pestaña o de otra del mismo navegador. */
export function onConsentChange(f: (c: Consent | null) => void): () => void { syncListeners.add(f); return () => syncListeners.delete(f); }

// Si se elige (o se borra el almacenamiento) en otra pestaña, esta se entera: "Solo necesarias" frena las visitas en todas.
try {
  addEventListener('storage', e => {
    if (e.key !== LS_KEY && e.key !== null) return;
    const c = getConsent();
    syncListeners.forEach(f => { try { f(c); } catch { /* ídem */ } });
  });
} catch { /* sin window */ }

/** Para el link "Preferencias de cookies": vuelve a mostrar el aviso. */
export function openConsent() { openers.forEach(f => f()); }
export function onOpenConsent(f: () => void): () => void { openers.add(f); return () => openers.delete(f); }
