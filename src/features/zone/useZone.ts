// Datos de la zona (el "controlador"): mi zona, el ranking y la búsqueda de lugares.
import { useCallback, useEffect, useState } from 'preact/hooks';
import { clearMyZone, isMissingZone, loadMyZone, loadZoneRanking, saveMyZone } from './api';
import { searchPlaces } from './geo';
import { normalizeZone, type Place, type ZoneDraft, type ZoneRow } from './model';

/** Mi zona: `undefined` mientras carga, `null` si no cargué ninguna. Si falla la carga, `err` (y queda como "sin zona"). */
export function useMyZone() {
  const [zone, setZone] = useState<ZoneDraft | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    setErr('');
    loadMyZone().then(setZone, (e: any) => { setErr(e?.message ?? 'Error de red'); setZone(null); });
  }, []);
  useEffect(load, [load]);
  /** Guarda (o, con null, quita) la zona y la deja actualizada acá. Tira Error si falla. */
  const save = useCallback(async (z: ZoneDraft | null) => {
    if (z) await saveMyZone(z); else await clearMyZone();
    setZone(z ? normalizeZone(z) : null);
  }, []);
  return { zone, err, reload: load, save };
}

/**
 * El ranking de la zona (una sola consulta con el radio máximo). Solo carga con `enabled` (cuando hay zona propia).
 * `key` identifica mi zona guardada: si cambia (otro lugar, o dejé de aparecer), se vuelve a pedir porque las distancias salen de ahí.
 */
export function useZoneRanking(enabled: boolean, key: string) {
  const [s, setS] = useState<{ rows: ZoneRow[] | null; err: string }>({ rows: null, err: '' });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setS({ rows: null, err: '' });
    loadZoneRanking().then(
      rows => alive && setS({ rows, err: '' }),
      (e: any) => alive && setS({
        rows: null,
        err: isMissingZone(e) ? 'Esta función todavía no está disponible. Probá de nuevo más tarde.' : `No pudimos cargar el ranking. ${e?.message ?? 'Revisá la conexión.'}`,
      }),
    );
    return () => { alive = false; };
  }, [enabled, key, tries]);
  return { rows: s.rows, err: s.err, reload: () => setTries(t => t + 1) };
}

/** Búsqueda de barrios mientras se escribe (con pausa de 350 ms y cancelando la anterior). */
export function usePlaceSearch(q: string) {
  const term = q.trim();
  const [s, setS] = useState<{ term: string; items: Place[]; loading: boolean; err: boolean }>({ term: '', items: [], loading: false, err: false });
  useEffect(() => {
    if (term.length < 2) { setS({ term, items: [], loading: false, err: false }); return; }
    const ctl = new AbortController();
    setS(x => ({ ...x, loading: true, err: false }));
    const t = setTimeout(() => {
      searchPlaces(term, { signal: ctl.signal }).then(
        items => { if (!ctl.signal.aborted) setS({ term, items, loading: false, err: false }); },
        () => { if (!ctl.signal.aborted) setS({ term, items: [], loading: false, err: true }); },
      );
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term]);
  /** `done`: ya terminó de buscar exactamente lo escrito (para poder decir "sin resultados"). */
  return { items: s.items, loading: s.loading, err: s.err, done: !s.loading && !s.err && s.term === term && term.length >= 2 };
}
