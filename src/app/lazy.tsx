import { lazy, Suspense } from 'preact/compat';
import { Component, type ComponentChildren } from 'preact';

const RELOAD_KEY = 'futrank-chunk-reload';

/**
 * Carga diferida de una pantalla: el código se baja recién cuando se abre.
 * Si falla (típico: la pestaña quedó abierta durante un deploy y ese archivo ya no existe),
 * recarga la página una vez para traer la versión nueva.
 */
export const page = <T,>(load: () => Promise<T>, pick: (m: T) => any) => lazy(() => load().then(
  m => { try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* sin storage */ } return { default: pick(m) }; },
  e => {
    let again = false;
    try { again = !sessionStorage.getItem(RELOAD_KEY); if (again) sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* sin storage */ }
    if (again) location.reload();
    throw e;
  },
));

/** Si una pantalla no se pudo bajar (sin conexión, deploy nuevo), un aviso con "Recargar" en vez de pantalla en blanco. */
class Boundary extends Component<{ children: ComponentChildren }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div class="center" style="padding:24px 0">
        <p class="muted">No se pudo cargar esta pantalla. Revisá la conexión.</p>
        <button class="btn" onClick={() => location.reload()}>Recargar</button>
      </div>
    );
  }
}

/** Mientras se baja la pantalla, un "Cargando…" discreto. */
export const Loading = ({ children }: { children: ComponentChildren }) => (
  <Boundary><Suspense fallback={<p class="muted" style="padding:16px 0">Cargando…</p>}>{children}</Suspense></Boundary>
);

/** Baja en segundo plano las pantallas más usadas, para que abrirlas sea instantáneo. */
export function prefetch(loaders: (() => Promise<unknown>)[]) {
  const run = () => loaders.forEach(l => l().catch(() => {}));
  if ('requestIdleCallback' in window) (window as any).requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
