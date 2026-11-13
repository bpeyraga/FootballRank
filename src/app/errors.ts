import { logClientError } from '../features/admin/api';
import { createReporter, describe, shortSource } from './errorsCore';

/**
 * Avisa a la consola de errores del panel (solo el equipo la ve) cuando algo se rompe en el navegador de alguien. No depende del aviso de
 * cookies: sirve para que el servicio funcione, y manda lo mínimo (mensaje, archivo, pantalla, versión, navegador y el id de la cuenta).
 * Con ruido filtrado y tope de 10 por sesión. Nunca rompe la app. En localhost no hace nada.
 * Se importa en main.tsx antes que el resto, para agarrar también lo que falle al arrancar.
 */
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const LOCAL = /^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(typeof location !== 'undefined' ? location.hostname : '');

/** El id anónimo de las estadísticas, solo si ya existe (no se crea uno para esto). */
function knownVid(): string | null {
  try {
    const v = localStorage.getItem('fr-vid');
    return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  } catch { return null; }
}

const reporter = createReporter({
  context: () => ({ hash: location.hash, online: navigator.onLine !== false, origin: location.origin }),
  send: r => logClientError({ message: r.message, stack: r.stack, source: r.source, path: r.path, fp: r.fp, version: VERSION, vid: knownVid(), ua: navigator.userAgent }),
});

/** Para quien atrapa errores por su cuenta (el cartel de "No se pudo cargar esta pantalla"). */
export function reportError(reason: unknown, source = ''): void {
  if (LOCAL) return;
  try {
    const d = describe(reason);
    reporter.report({ message: d.message, stack: d.stack, source });
  } catch { /* nunca rompe */ }
}

if (typeof window !== 'undefined' && !LOCAL) {
  addEventListener('error', e => {
    try {
      const d = describe(e.error ?? e.message);
      reporter.report({ message: d.message || e.message, stack: d.stack, source: shortSource(e.filename, e.lineno, e.colno) });
    } catch { /* nunca rompe */ }
  });
  addEventListener('unhandledrejection', e => {
    try {
      const d = describe(e.reason);
      reporter.report({ message: d.message, stack: d.stack });
    } catch { /* nunca rompe */ }
  });
}
