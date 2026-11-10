// Datos de canchas y reservas (el "controlador"): desde dónde busco, la búsqueda, un complejo, lo ocupado de un día y mis reservas.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { loadMyZone } from '../zone/api';
import { isUnnamed } from '../zone/model';
import {
  cancelBooking, loadBusy, loadComplex, loadMyBookings, loadOpenMeta, loadUpcomingBookings, searchComplexes, unlinkBookingMatch,
  type ComplexBundle,
} from './api';
import {
  ORIGIN_KEY, bookingErrorText, isMissingCourts, nextBooking, parseOrigin, type ComplexRow, type MyBooking, type Origin,
} from './model';
import { busyRange, type Busy, type Day, type HoursRow } from './slots';

// ---------- Desde dónde busco ----------

const readOrigin = (): Origin | null => { try { return parseOrigin(localStorage.getItem(ORIGIN_KEY)); } catch { return null; } };
const writeOrigin = (o: Origin) => { try { localStorage.setItem(ORIGIN_KEY, JSON.stringify(o)); } catch { /* sin storage */ } };

/**
 * El punto desde el que se buscan canchas: lo último que elegí en este dispositivo o, si no hay, mi zona guardada.
 * `loading` mientras se lee la zona; `zone` es mi zona (para ofrecer "Mi zona" al cambiar de lugar).
 */
export function useOrigin() {
  const saved = useRef(readOrigin()).current;
  const [origin, setOrigin] = useState<Origin | null>(saved);
  const [zone, setZone] = useState<Origin | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    loadMyZone().then(z => {
      if (!alive) return;
      const o: Origin | null = z ? { label: isUnnamed(z.label) ? 'Tu zona' : z.label, lat: z.lat, lng: z.lng, source: 'zone' } : null;
      setZone(o);
      setOrigin(cur => cur ?? o); // si ya elegí un lugar a mano mientras tanto, gana ese
    }, () => { /* sin zona: se elige a mano */ }).then(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  const choose = useCallback((o: Origin) => { writeOrigin(o); setOrigin(o); }, []);
  return { origin, zone, loading: loading && !origin, choose };
}

// ---------- Búsqueda ----------

export interface OpenMeta { tz: string; hours: HoursRow[] }
interface Search { rows: ComplexRow[] | null; meta: Map<string, OpenMeta>; err: string; loading: boolean }

/** Complejos cerca del punto (una sola consulta hasta 25 km; el radio y el tamaño se filtran en pantalla) y sus horarios para "Abierto ahora". */
export function useComplexSearch(origin: Origin | null) {
  const [s, setS] = useState<Search>({ rows: null, meta: new Map(), err: '', loading: false });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!origin) { setS({ rows: null, meta: new Map(), err: '', loading: false }); return; }
    let alive = true;
    setS(x => ({ ...x, rows: null, err: '', loading: true }));
    searchComplexes(origin.lat, origin.lng).then(async rows => {
      if (!alive) return;
      setS({ rows, meta: new Map(), err: '', loading: false }); // la lista se ve ya; "Abierto ahora" llega después
      const meta = await loadOpenMeta(rows.map(r => r.id)).catch(() => null);
      if (alive && meta) setS(x => ({ ...x, meta }));
    }, (e: any) => alive && setS({
      rows: null, meta: new Map(), loading: false,
      err: isMissingCourts(e) ? 'Esta función todavía no está disponible. Probá de nuevo más tarde.' : `No pudimos cargar las canchas. ${bookingErrorText(e)}`,
    }));
    return () => { alive = false; };
  }, [origin?.lat, origin?.lng, tries]);
  return { ...s, reload: () => setTries(t => t + 1) };
}

// ---------- Un complejo ----------

/** `undefined` mientras carga, `null` si no existe. */
export function useComplex(id: string) {
  const [data, setData] = useState<ComplexBundle | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(undefined); setErr('');
    loadComplex(id).then(d => alive && setData(d), (e: any) => { if (alive) { setErr(bookingErrorText(e)); setData(null); } });
    return () => { alive = false; };
  }, [id, tries]);
  return { data, err, reload: () => setTries(t => t + 1) };
}

/**
 * Lo ocupado del complejo en el día elegido (se guarda por día; `refresh` vuelve a pedirlo, p. ej. después de pedir un turno).
 * `busy` es null mientras carga.
 */
export function useBusy(complexId: string, day: Day | undefined, tz: string) {
  const cache = useRef(new Map<string, Busy[]>());
  const [, bump] = useState(0);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const key = day ? `${complexId}|${day.key}` : '';
  useEffect(() => {
    if (!day || cache.current.has(key)) { setErr(''); return; }
    let alive = true;
    const r = busyRange(day, tz);
    setErr('');
    loadBusy(complexId, r.from, r.to).then(b => { cache.current.set(key, b); alive && bump(n => n + 1); }, (e: any) => alive && setErr(bookingErrorText(e)));
    return () => { alive = false; };
  }, [key, tz, tick]);
  const refresh = useCallback(() => { cache.current.clear(); setTick(n => n + 1); }, []);
  return { busy: key ? cache.current.get(key) ?? null : [], err, refresh };
}

// ---------- Mis reservas ----------

/** Mis reservas (`null` mientras carga). */
export function useMyBookings() {
  const [list, setList] = useState<MyBooking[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    loadMyBookings().then(l => { setList(l); setErr(''); }, (e: any) => { setErr(bookingErrorText(e)); setList(l => l ?? []); });
  }, []);
  useEffect(load, [load]);
  const cancel = useCallback(async (id: string) => { await cancelBooking(id); load(); }, [load]);
  const unlink = useCallback(async (id: string) => { await unlinkBookingMatch(id); load(); }, [load]);
  return { list, err, reload: load, cancel, unlink };
}

/** La próxima reserva (para la tarjeta de Inicio). Si no se puede leer (p. ej. la función todavía no existe), `null` y sin ruido. */
export function useNextBooking() {
  const [b, setB] = useState<MyBooking | null>(null);
  useEffect(() => {
    let alive = true;
    loadUpcomingBookings().then(l => alive && setB(nextBooking(l, Date.now())), () => {});
    return () => { alive = false; };
  }, []);
  return b;
}
