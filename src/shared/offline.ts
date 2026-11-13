// Modo sin conexión: la app guarda en el dispositivo una copia de las pantallas y de lo último que viste (public/sw.js).
// Esa copia tiene datos privados: se borra al cerrar sesión.

/** Nombre que usa el service worker para los cachés de datos (ver sw-core.js). */
const DATA_CACHE = /^fr-data-/;

/**
 * Borra lo guardado para uso sin conexión (las lecturas de datos; las pantallas no tienen datos personales y se quedan).
 * Se llama al cerrar sesión. Avisa al service worker (para que descarte lecturas que estaban en vuelo) y además borra directo
 * desde la página, sin depender de que el service worker esté despierto. Nunca tira.
 */
export async function clearOfflineData(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      (navigator.serviceWorker.controller ?? reg?.active)?.postMessage({ type: 'fr-clear-data' });
    }
  } catch { /* sin service worker */ }
  try {
    if (typeof caches !== 'undefined') for (const k of await caches.keys()) if (DATA_CACHE.test(k)) await caches.delete(k);
  } catch { /* sin Cache API */ }
}
