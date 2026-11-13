import { useEffect, useState } from 'preact/hooks';
import type { Profile } from '../../shared/supabase';
import { LATER_KEY, SKIP_KEY, addId, promptQueue, readIds, type PendingVote, type Store } from './votingCore';

type Sheet = typeof import('./VoteSheet').VoteSheet;

/** Espera antes de preguntar: que la pantalla de inicio ya haya dibujado lo suyo. */
const DELAY_MS = 1200;
/** Si la última consulta no trajo nada, no se vuelve a consultar al volver a la pantalla de inicio hasta pasado este rato. */
const RECHECK_MS = 5 * 60_000;
let lastEmpty = { id: '', at: 0 };

// sessionStorage / localStorage pueden tirar al leer la propiedad (navegación privada, datos bloqueados): sin storage no se recuerda nada.
const session = (): Store | null => { try { return sessionStorage; } catch { return null; } };
const local = (): Store | null => { try { return localStorage; } catch { return null; } };

/**
 * Al abrir la app: si jugaste un partido en los últimos 3 días y todavía no votaste la figura, un cartel "¿Cómo salió el partido?" para
 * votarla en un toque (y de ahí ir a calificar a tu equipo). Es una sola consulta chica (la RPC my_pending_votes); la hoja se baja
 * recién cuando hay algo para pedir. "Después" lo posterga hasta cerrar la pestaña; "No jugué este partido" no lo vuelve a pedir.
 * `hold`: no mostrarlo por ahora (por ejemplo, con el tutorial abierto); en cuanto vuelve a false aparece.
 */
export function VotePrompt({ me, hold = false }: { me: Profile; hold?: boolean }) {
  const [queue, setQueue] = useState<PendingVote[]>([]);
  const [View, setView] = useState<Sheet | null>(null);

  useEffect(() => {
    let alive = true;
    if (lastEmpty.id === me.id && Date.now() - lastEmpty.at < RECHECK_MS) return;
    const t = setTimeout(() => {
      // La capa de datos tampoco entra en la carga inicial: se baja recién ahora (y se reusa al abrir la hoja).
      import('./api').then(api => api.loadPendingVotes()).then(rows => {
        if (!rows.length) lastEmpty = { id: me.id, at: Date.now() };
        const skip = new Set([...readIds(session(), LATER_KEY), ...readIds(local(), SKIP_KEY)]);
        const q = promptQueue(rows, skip);
        if (!alive || !q.length) return;
        import('./VoteSheet').then(m => { if (alive) { setQueue(q); setView(() => m.VoteSheet); } }).catch(() => { /* sin red: otra vez será */ });
      }).catch(() => { /* sin migración, sin sesión o sin red: no se pide nada */ });
    }, DELAY_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [me.id]);

  if (!View || !queue.length || hold) return null;
  return (
    <View queue={queue} meId={me.id}
      onLater={ids => { ids.forEach(id => addId(session(), LATER_KEY, id)); setQueue([]); }}
      onSkip={id => addId(local(), SKIP_KEY, id)}
      onDone={() => setQueue([])} />
  );
}
