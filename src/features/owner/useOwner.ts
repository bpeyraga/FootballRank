// Estado del panel del dueño (el "controlador"): carga de complejos, canchas, horarios y agenda, con actualización en vivo.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { loadAgenda, loadFields, loadMyComplex, loadHours, loadMyComplexes, loadOverview, watchBookings } from './api';
import { ownerErrorText, type Booking, type Complex, type ComplexData, type Overview } from './model';

/** Hora actual, refrescada cada tanto (para la línea "ahora" de la agenda y para saber qué turnos ya pasaron). */
export function useNow(everyMs = 30_000): number {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), everyMs); return () => clearInterval(t); }, [everyMs]);
  return n;
}

/** ¿Pantalla ancha (escritorio)? La vista de semana solo existe ahí. */
export function useIsDesktop(): boolean {
  const q = '(min-width: 900px)';
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(q);
    const h = () => setOn(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return on;
}

/** Mis complejos y, aparte, cuántos pedidos y turnos de hoy tiene cada uno (si eso falla, la lista igual se ve). */
export function useMyComplexes(meId: string) {
  const [state, setState] = useState<{ list: Complex[] | null; overview: Map<string, Overview>; err: string }>({ list: null, overview: new Map(), err: '' });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    loadMyComplexes(meId).then(
      async list => {
        const ov = await loadOverview().catch(() => [] as Overview[]);
        if (alive) setState({ list, overview: new Map(ov.map(o => [o.complex_id, o])), err: '' });
      },
      e => { if (alive) setState({ list: [], overview: new Map(), err: ownerErrorText(e) }); },
    );
    return () => { alive = false; };
  }, [meId, tries]);
  return { ...state, reload: () => setTries(t => t + 1) };
}

/**
 * Un complejo con sus canchas y horarios. `data` es `undefined` mientras carga y `null` si no existe o no es mío.
 * `patch` actualiza lo que ya tenemos sin volver a pedirlo (después de guardar).
 */
export function useComplexData(meId: string, id: string) {
  const [data, setData] = useState<ComplexData | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    // Primero se comprueba que sea mío: sin eso, un jugador que abra #/duenio/<id> de otro complejo vería su panel (la tabla la lee cualquiera)
    loadMyComplex(meId, id).then(async complex => {
      if (!complex) return null;
      const [fields, hours] = await Promise.all([loadFields(id), loadHours(id)]);
      return { complex, fields, hours };
    }).then(
      d => { if (alive) { setErr(''); setData(d); } },
      e => { if (alive) { setErr(ownerErrorText(e)); setData(null); } },
    );
    return () => { alive = false; };
  }, [meId, id, tries]);
  const patch = useCallback((p: Partial<ComplexData>) => setData(d => (d ? { ...d, ...p } : d)), []);
  return { data, err, reload: () => setTries(t => t + 1), patch };
}

/** Un número que sube cada vez que cambian las reservas del complejo (en vivo) o se vuelve a la pestaña: las pantallas lo usan para recargar. */
export function useBookingsFeed(complexId: string): number {
  const [tick, setTick] = useState(0);
  const timer = useRef<number>();
  useEffect(() => {
    const bump = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setTick(t => t + 1), 350); };
    const stop = watchBookings(complexId, bump);
    const vis = () => { if (document.visibilityState === 'visible') bump(); };
    document.addEventListener('visibilitychange', vis);
    return () => { stop(); document.removeEventListener('visibilitychange', vis); clearTimeout(timer.current); };
  }, [complexId]);
  return tick;
}

/** Turnos del complejo en un rango. Conserva lo anterior mientras recarga (la agenda no parpadea al cambiar de día). */
export function useAgenda(complexId: string, fromMs: number, toMs: number, tick: number) {
  const [s, setS] = useState<{ key: string; bookings: Booking[] | null; err: string }>({ key: '', bookings: null, err: '' });
  const [tries, setTries] = useState(0);
  const key = `${complexId}|${fromMs}|${toMs}`;
  useEffect(() => {
    let alive = true;
    loadAgenda(complexId, fromMs, toMs).then(
      bookings => { if (alive) setS({ key, bookings, err: '' }); },
      e => { if (alive) setS(x => ({ ...x, key, err: ownerErrorText(e) })); },
    );
    return () => { alive = false; };
  }, [key, tick, tries]);
  return { bookings: s.bookings, err: s.err, loading: s.key !== key && !s.err, reload: () => setTries(t => t + 1) };
}

/** Pedidos por responder de un complejo (para la insignia de la pestaña). Se actualiza con `tick` (en vivo) y con `bump` (después de responder). */
export function usePending(complexId: string, tick: number, bump: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    loadOverview().then(ov => { if (alive) setN(ov.find(o => o.complex_id === complexId)?.pending ?? 0); }, () => {});
    return () => { alive = false; };
  }, [complexId, tick, bump]);
  return n;
}
