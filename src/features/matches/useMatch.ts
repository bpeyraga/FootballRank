// Estado y acciones de la pantalla de un partido (el "controlador"): MatchPage solo dibuja lo que esto expone.
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadMatchEvents, type EventKind, type MatchEvent } from '../stats/stats';
import { lastEvent } from './quickMatch';
import { feeError } from './fees';
import * as api from './api';
import { errText, type Match, type Mvp, type Score, type Signup, type Suspension } from './model';

export function useMatch(id: string, meId: string) {
  const [m, setM] = useState<Match | null | undefined>(undefined);
  const [su, setSu] = useState<Signup[]>([]);
  const [susp, setSusp] = useState<Suspension[]>([]);
  const [scores, setScores] = useState<Map<string, Score>>(new Map());
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [mvp, setMvp] = useState<Mvp>({ mine: null, tally: new Map() });
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<string[]>([]); // quiénes tienen un "pagué" en camino
  const [feeErr, setFeeErr] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [events, setEvents] = useState<MatchEvent[] | null>(null);
  const [evErr, setEvErr] = useState('');
  const [, tick] = useState(0);
  // Goles y tarjetas: se actualizan al toque y se guardan en orden, uno detrás de otro.
  const evRef = useRef<MatchEvent[] | null>(null);          // siempre la lista más nueva (el estado llega con un render de atraso)
  const evQueue = useRef<Promise<void>>(Promise.resolve());
  const evPending = useRef(0), evFailed = useRef(false), evSeq = useRef(0);
  const evReal = useRef(new Map<number, number | null>());  // id provisorio -> id real (null: no se pudo guardar)

  // La lista se cierra sola a la hora del partido: re-render justo cuando arranca.
  useEffect(() => {
    if (!m) return;
    const ms = +new Date(m.starts_at) - Date.now();
    if (ms <= 0 || ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => tick(n => n + 1), ms + 500);
    return () => clearTimeout(t);
  }, [m?.starts_at]);

  // Goles y tarjetas se cargan aparte: si la tabla no existe todavía, el resto de la pantalla sigue andando.
  const setEv = (es: MatchEvent[] | null) => { evRef.current = es; setEvents(es); };
  const loadEvents = async () => {
    try { setEv(await loadMatchEvents(id)); setEvErr(''); }
    catch (e: any) { setEvErr('No pudimos cargar los goles y tarjetas. ' + (e?.message ?? '')); }
  };
  // MVP aparte, por lo mismo: si falla, el resto sigue andando
  const loadMvp = async () => { try { setMvp(await api.loadMvp(id, meId)); } catch { /* sin MVP */ } };

  const load = async () => {
    let b: api.MatchBundle;
    try { b = await api.loadMatch(id, meId); } catch (e: any) { setErr(e?.message ?? 'Error de red'); return; }
    setM(b.match); setSu(b.signups); setSusp(b.suspensions); setScores(b.scores); setMyRatings(b.myRatings);
    if (b.match?.status === 'played') { loadEvents(); loadMvp(); }
  };
  useEffect(() => { load(); }, [id]);

  /** Corre una acción con "ocupado", traduce el error y recarga el partido si salió bien. */
  const run = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setErr(''); setMsg('');
    try { await f(); }
    catch (e) { setBusy(false); setErr(errText(e)); return false; }
    setBusy(false);
    if (ok) setMsg(ok);
    await load();
    return true;
  };

  // Cuota de la cancha. "Pagué" se ve al instante en la fila de ese jugador; si falla, vuelve a como estaba.
  const setPaid = async (pid: string, paid: boolean) => {
    if (paying.includes(pid)) return;
    const before = su.find(s => s.profile_id === pid)?.paid_at ?? null;
    const patch = (at: string | null) => setSu(cur => cur.map(s => s.profile_id === pid ? { ...s, paid_at: at } : s));
    setPaying(x => [...x, pid]); setFeeErr('');
    patch(paid ? new Date().toISOString() : null);
    try { await api.setPaid(id, pid, paid); }
    catch (e: any) { setPaying(x => x.filter(y => y !== pid)); patch(before); setFeeErr(feeError(e?.message ?? '')); return; }
    setPaying(x => x.filter(y => y !== pid));
    // Releer: si otra acción recargó la lista justo antes de que se guardara, no puede quedar como "Debe".
    const at = await api.loadPaidAt(id, pid).catch(() => undefined);
    if (at !== undefined) patch(at);
  };
  /** Devuelve el error (en español) o '' si salió bien. */
  const setFee = async (total: number | null): Promise<string> => {
    try { await api.setFee(id, total); } catch (e: any) { return feeError(e?.message ?? ''); }
    setFeeErr('');
    setM(cur => cur ? { ...cur, fee_total: total } : cur);
    return '';
  };

  const enqueueEv = (job: () => Promise<boolean>) => {
    evPending.current++;
    evQueue.current = evQueue.current.then(async () => {
      let ok = false;
      try { ok = await job(); } catch (e) { setEvErr(errText(e)); }
      if (!ok) evFailed.current = true;
      // Al terminar todo lo pendiente, si algo falló se vuelve a leer del servidor (sin borrar el aviso de error).
      if (--evPending.current === 0 && evFailed.current) {
        evFailed.current = false;
        try {
          const fresh = await loadMatchEvents(id);
          // Si mientras se leía tocaron "+", esas filas temporales (id < 0) siguen en cola: no perderlas.
          setEv([...fresh, ...(evRef.current ?? []).filter(e => e.id < 0)]);
        } catch { /* queda lo que se ve */ }
      }
    });
  };
  // "+" agrega un evento y "−" borra el más reciente de ese jugador y tipo. Se ve al instante; si falla, se deshace.
  const stepEvent = (pid: string, kind: EventKind, dir: 1 | -1) => {
    const cur = evRef.current;
    if (!cur || !m) return;
    setEvErr('');
    if (dir > 0) {
      const tmp = -(++evSeq.current);
      const row = { match_id: id, community_id: m.community_id, profile_id: pid, kind, created_by: meId };
      setEv([...cur, { ...row, id: tmp, created_at: new Date().toISOString() }]);
      enqueueEv(async () => {
        let real: number;
        try { real = await api.insertEvent(row); }
        catch (e) {
          evReal.current.set(tmp, null);
          setEv((evRef.current ?? []).filter(e => e.id !== tmp));
          setEvErr(errText(e, 'No se pudo guardar.'));
          return false;
        }
        evReal.current.set(tmp, real);
        setEv((evRef.current ?? []).map(e => e.id === tmp ? { ...e, id: real } : e));
        return true;
      });
    } else {
      const ev = lastEvent(cur, pid, kind);
      if (!ev) return;
      setEv(cur.filter(e => e !== ev));
      enqueueEv(async () => {
        const eid = ev.id < 0 ? evReal.current.get(ev.id) : ev.id;
        if (eid == null) return true; // nunca llegó a guardarse: no hay nada que borrar
        let gone: boolean;
        try { gone = await api.deleteEvent(eid); }
        catch (e) { setEv([...(evRef.current ?? []), { ...ev, id: eid }]); setEvErr(errText(e)); return false; }
        if (!gone) { setEvErr('No se pudo borrar (puede que ya lo hayan sacado).'); return false; }
        return true;
      });
    }
  };

  /** Edita el partido. Devuelve el error (en español) o '' si salió bien. */
  const saveEdit = async (v: api.MatchEdit, notice: string): Promise<string> => {
    setBusy(true); setErr(''); setMsg('');
    try { await api.updateMatch(id, v); }
    catch (e) { setBusy(false); return errText(e); }
    setBusy(false);
    setMsg(notice);
    await load();
    return '';
  };

  /** Borra el partido. Devuelve true si se borró. */
  const remove = async () => {
    setBusy(true); setErr('');
    let gone = false;
    try { gone = await api.deleteMatch(id); } catch (e) { setBusy(false); setErr(errText(e)); return false; }
    setBusy(false);
    if (!gone) setErr('No tenés permiso para eliminar este partido.');
    return gone;
  };

  return {
    m, su, susp, scores, myRatings, mvp, events, busy, paying, err, msg, feeErr, evErr,
    setErr, setMsg, reload: load, run,
    setPaid, setFee, stepEvent, saveEdit, remove,
    // Acciones que recargan el partido al terminar; `ok` es el aviso a mostrar si salen bien.
    signup: (ok: string) => run(() => api.signup(id), ok),
    leave: () => run(() => api.leaveMatch(id), 'Te bajaste'),
    kick: (pid: string) => run(() => api.leaveMatch(id, pid)),
    addMany: (pids: string[], ok: string) => run(() => api.addManyToMatch(id, pids), ok),
    setAbsent: (pid: string, absent: boolean) => run(() => api.setAbsent(id, pid, absent), absent ? 'Marcado como ausente' : 'Marcado como presente'),
    suspend: (pid: string, ok: string) => run(() => api.suspend(m!.community_id, pid, `Ausente en "${m!.title}"`), ok),
    liftSuspension: (suspId: string) => run(() => api.liftSuspension(suspId), 'Suspensión levantada'),
    setCaptain: (pid: string, on: boolean, ok: string) => run(() => api.setCaptain(id, pid, on), ok),
    setStatus: (status: 'open' | 'closed' | 'cancelled') => run(() => api.setMatchStatus(id, status),
      status === 'closed' ? 'Lista cerrada' : status === 'open' ? 'Lista reabierta' : 'Partido cancelado'),
    setResult: (a: number, b: number) => run(() => api.setResult(id, a, b), 'Resultado guardado'),
    rate: (sc: Record<string, number>) => run(() => api.rateTeammates(id, sc), '¡Gracias por calificar!'),
    voteMvp: (pid: string) => run(async () => { await api.voteMvp(id, pid); await loadMvp(); }, '¡Voto de MVP guardado!'),
    saveTeams: (a: string[], b: string[]) => run(() => api.saveTeams(id, a, b), 'Equipos guardados'),
  };
}
