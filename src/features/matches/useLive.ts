// Partido en vivo (el "controlador" del reloj): hora del servidor, acciones del reloj, tiempo real y respaldo por consulta.
// Lo usa useMatch, que es el dueño del partido y de la lista de eventos: acá se recibe lo que hace falta de ellos.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Dispatch, StateUpdater } from 'preact/hooks';
import type { MatchEvent } from '../stats/statsCore';
import * as api from './api';
import { applyDelete, applyInsert, clockOffset, inLiveWindow, liveError, mayBeMyPending, type LiveAction } from './live';
import { errText, type Match } from './model';

/** La lista de eventos de useMatch (con sus refs: Realtime y los timers siempre necesitan la más nueva). */
export interface LiveEventsHost {
  ref: { current: MatchEvent[] | null };
  pending: { current: number };                    // cargas mías en camino
  echo: { current: Map<number, MatchEvent> };      // filas de Realtime que pueden ser el eco de un insert mío todavía sin respuesta
  set: (es: MatchEvent[] | null) => void;
  refresh: () => Promise<boolean>;
  load: () => Promise<void>;
}

export interface LiveHost {
  id: string; meId: string;
  m: Match | null | undefined;
  setM: Dispatch<StateUpdater<Match | null | undefined>>;
  load: () => Promise<void>;                       // relee todo el partido
  setMsg: (s: string) => void; setErr: (s: string) => void;
  ev: LiveEventsHost;
}

export function useLive({ id, meId, m, setM, load, setMsg, setErr, ev }: LiveHost) {
  // La diferencia con la hora del servidor y las acciones del reloj.
  const [skew, setSkew] = useState(0);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveErr, setLiveErr] = useState('');
  const mRef = useRef<Match | null | undefined>(undefined);
  mRef.current = m;

  const liveState = m?.live_state ?? null;
  // Se escucha el partido si la base tiene el reloj y el partido es de hoy (2 h antes hasta 24 h después) o ya está en vivo.
  const watching = !!m && (m.status === 'open' || m.status === 'closed') && m.live_state !== undefined
    && (m.live_state !== null || inLiveWindow(m.starts_at, Date.now()));

  // Respaldo del tiempo real: relee el reloj y los eventos (al volver la señal, al volver a la pestaña y cada 30 s).
  const syncLive = async () => {
    if (ev.pending.current > 0) return;
    let r: api.LiveRow | null;
    try { r = await api.loadLiveClock(id); } catch { return; }
    if (!r) return;
    if (mRef.current && r.status !== mRef.current.status) { load(); return; }
    const row = r;
    setM(cur => cur ? { ...cur, ...row } : cur);
    try { await ev.refresh(); } catch { /* sigue con lo que se ve */ }
  };

  useEffect(() => {
    if (!watching) return;
    const ch = api.openLiveChannel(id, {
      match: row => {
        if (row.status && mRef.current && row.status !== mRef.current.status) { load(); return; } // p. ej. otro admin cargó el resultado
        setM(cur => cur ? { ...cur, ...row } : cur);
      },
      eventAdded: row => {
        const cur = ev.ref.current;
        if (!cur) return;
        // Si puede ser el eco de un insert mío que todavía no respondió, espera: cuando responda se sabe si era mío.
        if (mayBeMyPending(cur, row, meId)) ev.echo.current.set(row.id, row);
        else ev.set(applyInsert(cur, row));
      },
      // Los ids que no están en la lista se ignoran.
      eventGone: eid => {
        ev.echo.current.delete(eid);
        const cur = ev.ref.current;
        if (cur) ev.set(applyDelete(cur, eid));
      },
      connected: again => { if (again) syncLive(); }, // reconexión: lo que pasó mientras no había señal
    });
    return () => ch.close();
  }, [id, watching]);

  useEffect(() => {
    if (!liveState || !watching) return;
    const sync = () => { if (document.visibilityState === 'visible') syncLive().catch(() => {}); };
    const t = setInterval(sync, 30_000);
    document.addEventListener('visibilitychange', sync);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', sync); };
  }, [id, !!liveState, watching]);

  // Si el reloj arrancó mientras mirabas la pantalla (lo inició otro admin), se leen los eventos.
  useEffect(() => { if (liveState && watching && ev.ref.current == null) ev.load(); }, [!!liveState, watching]);

  // Hora del servidor: así todos ven el mismo cronómetro aunque el reloj del celular esté corrido.
  useEffect(() => {
    if (!liveState) return;
    let alive = true;
    (async () => {
      const t0 = Date.now();
      const now = await api.liveNow();
      if (!alive || !now) return;
      const ms = Date.parse(now);
      if (!isNaN(ms)) setSkew(clockOffset(ms, t0, Date.now()));
    })().catch(() => {});
    return () => { alive = false; };
  }, [!!liveState]);

  // Reloj del partido en vivo: lo maneja un admin (live_clock); los demás lo ven por Realtime.
  const liveClock = async (action: LiveAction) => {
    if (liveBusy) return;
    setLiveBusy(true); setLiveErr('');
    try {
      const t0 = Date.now();
      const r = await api.liveClock(id, action);
      setM(cur => cur ? { ...cur, live_state: r.live_state, live_half: r.live_half, live_since: r.live_since, live_elapsed: r.live_elapsed } : cur);
      const ms = Date.parse(r.now);
      if (!isNaN(ms)) setSkew(clockOffset(ms, t0, Date.now()));
      if (r.live_state && ev.ref.current == null) ev.load();
    } catch (e: any) {
      setLiveErr(liveError(e?.message ?? 'Error de red'));
      syncLive().catch(() => {}); // puede que otro admin ya haya cambiado el reloj: mostrar cómo quedó
    }
    setLiveBusy(false);
  };

  // Al terminar el reloj, el admin confirma el marcador (los goles cargados): recién ahí el partido pasa a "jugado".
  const saveLiveResult = async (a: number, b: number) => {
    setLiveBusy(true); setLiveErr('');
    try { await api.setResult(id, a, b); }
    catch (e) { setLiveBusy(false); setLiveErr(errText(e)); return; }
    setLiveBusy(false);
    setMsg('Resultado guardado'); setErr('');
    await load();
  };

  return { skew, liveBusy, liveErr, liveClock, saveLiveResult };
}
