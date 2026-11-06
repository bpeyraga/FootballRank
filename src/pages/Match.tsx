import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Tip } from '../lib/Tip';
import { go } from '../lib/router';
import { displayName, ovr, posLine, sb, type Profile, type Stats } from '../lib/supabase';
import { balance, type BPlayer } from '../lib/balance';
import { Avatar } from '../lib/Avatar';
import { lineup } from '../lib/formation';
import { Pitch, type PitchPlayer } from '../lib/Pitch';
import type { Ranked } from '../lib/ranking';
import { fmtDate, statusLabel, type Match as M } from './Matches';
import { loadMatchEvents, type EventKind, type MatchEvent } from '../lib/stats';
import { EventRows, EventSummary, type EvPlayer } from '../lib/EventSteppers';
import { MemberChecklist } from '../lib/MemberChecklist';
import { eventCounts, lastEvent } from '../lib/quickMatch';
import { downloadIcs, gcalUrl, matchUrl, shareText, whatsappUrl } from '../lib/share';
import { directionsUrl, embedUrl, type Venue } from '../lib/maps';
import { NEW_VENUE, VENUE_COLS, draftValid, emptyDraft, loadVenues, pickVenue } from '../lib/venues';
import { VenueField } from '../lib/VenueField';
import { FeeCard } from '../lib/FeeCard';
import { WeatherChip } from '../lib/WeatherChip';
import { feeError, feeNum } from '../lib/fees';
import '../stats.css';
import '../admin.css';

interface Signup { profile_id: string; status: 'in' | 'waitlist' | 'out'; team: 'A' | 'B' | null; created_at: string; absent: boolean; captain: boolean; paid_at: string | null }
interface Susp { id: string; profile_id: string }
type BP = BPlayer & { r: Ranked };
const NEUTRAL: Stats = { rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 };

export function Match({ id, slug, rows, meId, isAdmin }: { id: string; slug: string; rows: Ranked[]; meId: string; isAdmin: boolean }) {
  const [m, setM] = useState<M | null | undefined>(undefined);
  const [su, setSu] = useState<Signup[]>([]);
  const [susp, setSusp] = useState<Susp[]>([]);
  const [scores, setScores] = useState<Map<string, { avg: number; n: number }>>(new Map());
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [mvp, setMvp] = useState<{ mine: string | null; tally: Map<string, number> }>({ mine: null, tally: new Map() });
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<string[]>([]); // quiénes tienen un "pagué" en camino
  const [feeErr, setFeeErr] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [splits, setSplits] = useState<ReturnType<typeof balance<BP>> | null>(null);
  const [opt, setOpt] = useState(0);
  const [picked, setPicked] = useState<string[]>([]); // miembros tildados para anotar de una
  const [res, setRes] = useState({ a: '', b: '' });
  const [events, setEvents] = useState<MatchEvent[] | null>(null);
  const [evErr, setEvErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [venues, setVenues] = useState<Venue[] | null>(null); // canchas de la comunidad: solo se cargan al editar (admins)
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

  const load = async () => {
    const [a, b, c, d, f] = await Promise.all([
      sb.from('matches').select(`*, venue:venues(${VENUE_COLS})`).eq('id', id).maybeSingle(),
      sb.from('match_signups').select('*').eq('match_id', id).order('created_at'),
      sb.from('match_scores').select('*').eq('match_id', id),
      sb.from('match_ratings').select('target_id,score').eq('match_id', id).eq('rater_id', meId),
      sb.from('suspensions').select('id,profile_id').eq('match_id', id),
    ]);
    const e = a.error || b.error || c.error || d.error || f.error;
    if (e) return setErr(e.message);
    setM(a.data); setSu(b.data ?? []); setSusp(f.data ?? []);
    setScores(new Map((c.data ?? []).map((x: any) => [x.profile_id, { avg: +x.avg_score, n: x.n }])));
    setMyRatings(Object.fromEntries((d.data ?? []).map((x: any) => [x.target_id, x.score])));
    if (a.data?.score_a != null) setRes({ a: String(a.data.score_a), b: String(a.data.score_b) });
    if (a.data?.status === 'played') { loadEvents(); loadMvp(); }
  };
  // MVP aparte: si la tabla todavía no existe, el resto sigue andando
  const loadMvp = async () => {
    const [mine, tally] = await Promise.all([
      sb.from('mvp_votes').select('target_id').eq('match_id', id).eq('voter_id', meId).maybeSingle(),
      sb.from('match_mvp').select('profile_id,votes').eq('match_id', id),
    ]);
    if (mine.error || tally.error) return;
    setMvp({ mine: mine.data?.target_id ?? null, tally: new Map((tally.data ?? []).map((x: any) => [x.profile_id, x.votes])) });
  };
  useEffect(() => { load(); }, [id]);

  const communityId = m?.community_id;
  useEffect(() => {
    if (!editing || !communityId) return;
    loadVenues(communityId).then(setVenues).catch((e: any) => {
      setErr('No pudimos cargar las canchas. ' + (e?.message ?? '')); setEditing(false);
    });
  }, [editing, communityId]);

  const byId = useMemo(() => new Map(rows.map(r => [r.profile.id, r])), [rows]);

  if (err && m === undefined) return <p class="err">{err}</p>;
  if (m === undefined) return <p class="muted">Cargando…</p>;
  if (m === null) return <p class="muted">Partido no encontrado.</p>;

  const inList = su.filter(s => s.status === 'in');
  const wait = su.filter(s => s.status === 'waitlist');
  const mine = su.find(s => s.profile_id === meId && s.status !== 'out');
  const started = new Date(m.starts_at) <= new Date();
  const editable = m.status === 'open' || m.status === 'closed';
  const canSignup = m.status === 'open' && !started; // pasada la hora, la lista queda cerrada sola
  const link = matchUrl(location.origin, slug, id);
  const hasTeams = inList.some(s => s.team);
  const myTeam = mine?.status === 'in' && !mine.absent ? mine.team : null;
  const suspended = (pid: string) => susp.some(x => x.profile_id === pid);
  const canMarkAbsent = started && m.status !== 'cancelled';
  const prof = (pid: string): Profile => byId.get(pid)?.profile ?? { id: pid, name: '?', pos: 'MED', photo_url: null, user_id: null, onboarded: true, nickname: null, shirt_number: null, fav_team: null };

  const run = async (f: () => PromiseLike<{ error: any }>, ok?: string) => {
    setBusy(true); setErr(''); setMsg('');
    const { error } = await f();
    setBusy(false);
    if (error) { setErr(friendly(error.message)); return false; }
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
    const { error } = await sb.rpc('set_paid', { p_match: id, p_profile: pid, p_paid: paid });
    setPaying(x => x.filter(y => y !== pid));
    if (error) { patch(before); setFeeErr(feeError(error.message)); return; }
    // Releer: si otra acción recargó la lista justo antes de que se guardara, no puede quedar como "Debe".
    const { data } = await sb.from('match_signups').select('paid_at').eq('match_id', id).eq('profile_id', pid).maybeSingle();
    if (data) patch(data.paid_at);
  };
  const setFee = async (total: number | null): Promise<string> => {
    const { error } = await sb.rpc('set_fee', { p_match: id, p_total: total });
    if (error) return feeError(error.message);
    setFeeErr('');
    setM(cur => cur ? { ...cur, fee_total: total } : cur);
    return '';
  };

  const enqueueEv = (job: () => Promise<boolean>) => {
    evPending.current++;
    evQueue.current = evQueue.current.then(async () => {
      let ok = false;
      try { ok = await job(); } catch (e: any) { setEvErr(friendly(e?.message ?? 'Error de red')); }
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
    if (!cur) return;
    setEvErr('');
    if (dir > 0) {
      const tmp = -(++evSeq.current);
      setEv([...cur, { id: tmp, match_id: id, community_id: m.community_id, profile_id: pid, kind, created_by: meId, created_at: new Date().toISOString() }]);
      enqueueEv(async () => {
        const r = await sb.from('match_events').insert({ match_id: id, community_id: m.community_id, profile_id: pid, kind, created_by: meId }).select('id').single();
        if (r.error || !r.data) {
          evReal.current.set(tmp, null);
          setEv((evRef.current ?? []).filter(e => e.id !== tmp));
          setEvErr(friendly(r.error?.message ?? 'No se pudo guardar.'));
          return false;
        }
        evReal.current.set(tmp, r.data.id);
        setEv((evRef.current ?? []).map(e => e.id === tmp ? { ...e, id: r.data.id } : e));
        return true;
      });
    } else {
      const ev = lastEvent(cur, pid, kind);
      if (!ev) return;
      setEv(cur.filter(e => e !== ev));
      enqueueEv(async () => {
        const eid = ev.id < 0 ? evReal.current.get(ev.id) : ev.id;
        if (eid == null) return true; // nunca llegó a guardarse: no hay nada que borrar
        const r = await sb.from('match_events').delete().eq('id', eid).select('id');
        if (r.error || !r.data?.length) {
          if (r.error) setEv([...(evRef.current ?? []), { ...ev, id: eid }]);
          setEvErr(friendly(r.error?.message ?? 'No se pudo borrar (puede que ya lo hayan sacado).'));
          return false;
        }
        return true;
      });
    }
  };

  const shareWhatsApp = () => {
    const text = shareText(m, inList.length, link, m.venue?.maps_url);
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else open(whatsappUrl(text), '_blank', 'noopener');
  };

  // Devuelve el error (en español) o '' si salió bien; el formulario lo muestra junto a los campos.
  const saveEdit = async (v: { title: string; startsAt: string; location: string; slots: number; venueId: string | null }): Promise<string> => {
    const over = inList.length - v.slots, free = v.slots - inList.length;
    if (over > 0 && !confirm(`Hay ${over} ${over === 1 ? 'anotado' : 'anotados'} de más: ${over === 1 ? 'el último en anotarse pasa' : `los últimos ${over} en anotarse pasan`} a la lista de espera. ¿Seguís?`)) return '';
    setBusy(true); setErr(''); setMsg('');
    const { error } = await sb.rpc('update_match', {
      p_match: id, p_title: v.title, p_starts_at: new Date(v.startsAt).toISOString(), p_location: v.location, p_slots: v.slots, p_venue: v.venueId,
    });
    setBusy(false);
    if (error) return friendly(error.message);
    const promoted = Math.min(wait.length, Math.max(free, 0));
    setMsg(over > 0 ? `Partido actualizado: ${over} pasaron a la lista de espera.`
      : promoted > 0 ? `Partido actualizado: ${promoted} ${promoted === 1 ? 'subió' : 'subieron'} de la lista de espera.`
      : 'Partido actualizado.');
    setEditing(false);
    await load();
    scrollTo({ top: 0, behavior: 'smooth' });
    return '';
  };

  const toBP = (pid: string): BP => {
    const r = byId.get(pid)!;
    const attrs = r?.votes ?? r?.base ?? NEUTRAL;
    return { id: pid, pos: r?.profile.pos ?? 'MED', ovr: ovr(attrs), attrs, r };
  };
  const doBalance = () => { setSplits(balance(inList.map(s => toBP(s.profile_id)))); setOpt(0); };
  const saveTeams = async () => {
    const s = splits![opt];
    const ups = [...s.A.map(p => [p.id, 'A']), ...s.B.map(p => [p.id, 'B'])] as const;
    setBusy(true); setErr('');
    const results = await Promise.all(ups.map(([pid, team]) =>
      sb.from('match_signups').update({ team, captain: false }).eq('match_id', id).eq('profile_id', pid)));
    setBusy(false);
    const e = results.find(r => r.error)?.error;
    if (e) return setErr(e.message);
    setSplits(null); setMsg('Equipos guardados'); load();
  };

  const avgOvr = (ps: BP[]) => ps.length ? Math.round(ps.reduce((t, p) => t + p.ovr, 0) / ps.length) : 0;
  const evHas = (pid: string) => (events ?? []).some(e => e.profile_id === pid); // un ausente con goles cargados sigue apareciendo
  const notIn = rows.filter(r => !su.some(s => s.profile_id === r.profile.id && s.status !== 'out'));
  // Tildados que siguen pudiéndose anotar (alguien pudo anotarse solo o ser suspendido mientras tanto).
  const pickedIds = picked.filter(pid => !suspended(pid) && notIn.some(r => r.profile.id === pid));
  const addPicked = async () => {
    if (!pickedIds.length) return;
    const waiting = Math.max(pickedIds.length - Math.max(m.slots - inList.length, 0), 0);
    const ok = await run(() => sb.rpc('add_many_to_match', { p_match: id, p_profiles: pickedIds }),
      `${pickedIds.length === 1 ? '1 jugador anotado' : `${pickedIds.length} jugadores anotados`}${waiting ? ` (${waiting} en lista de espera)` : ''}`);
    if (ok) setPicked([]);
  };

  const topVotes = Math.max(0, ...mvp.tally.values());
  const isMvp = (pid: string) => topVotes > 0 && mvp.tally.get(pid) === topVotes;
  const PlayerRow = ({ pid, right }: { pid: string; right?: any }) => {
    const p = prof(pid), sc = scores.get(pid);
    return (
      <div class="row rank-row">
        <Avatar p={p} size={32} />
        <span style="flex:1" class="ellipsis">{displayName(p)}{su.find(s => s.profile_id === pid && s.status === 'in' && s.team && s.captain) && <span class="cap" title="Capitán">C</span>} <span class="muted">· {posLine(p)}</span></span>
        {su.find(s => s.profile_id === pid && s.status === 'in')?.absent && <span class="pill bad">Ausente</span>}
        {m.status === 'played' && isMvp(pid) && <span class="pill mvp" title={`MVP · ${topVotes} ${topVotes === 1 ? 'voto' : 'votos'}`}>🏆 MVP</span>}
        {sc && <span class="pill" title={`${sc.n} ${sc.n === 1 ? 'calificación' : 'calificaciones'}`}>★ {sc.avg}</span>}
        {right}
      </div>
    );
  };
  const kick = (pid: string) => isAdmin && editable && pid !== meId && !canMarkAbsent &&
    <button class="btn sm" disabled={busy} onClick={() => run(() => sb.rpc('leave_match', { p_match: id, p_profile: pid }))}>Sacar</button>;
  // Una vez empezado: cualquiera marca ausente/presente; un admin puede suspender al ausente 1 partido.
  const absence = (pid: string) => {
    if (!canMarkAbsent) return null;
    const s = su.find(x => x.profile_id === pid && x.status === 'in');
    if (!s) return null;
    return <>
      <button class="btn sm" disabled={busy} onClick={() => run(() => sb.rpc('set_absent', { p_match: id, p_profile: pid, p_absent: !s.absent }),
        s.absent ? 'Marcado como presente' : 'Marcado como ausente')}>{s.absent ? 'Presente' : 'Ausente'}</button>
      {s.absent && isAdmin && <button class="btn sm danger" disabled={busy}
        onClick={() => run(() => sb.rpc('suspend', { p_community: m.community_id, p_profile: pid, p_reason: `Ausente en "${m.title}"` }),
          `${displayName(prof(pid))} queda suspendido para el próximo partido`)}>Suspender</button>}
    </>;
  };
  // Capitán: lo elige un admin o cualquiera del mismo equipo
  const captainBtn = (pid: string) => {
    const s = su.find(x => x.profile_id === pid && x.status === 'in');
    if (!s?.team || m.status === 'cancelled' || s.absent) return null;
    if (!isAdmin && myTeam !== s.team) return null;
    return <button class="btn sm" disabled={busy}
      onClick={() => run(() => sb.rpc('set_captain', { p_match: id, p_profile: pid, p_on: !s.captain }),
        s.captain ? 'Capitán quitado' : `${displayName(prof(pid))} es el capitán`)}>{s.captain ? 'Quitar C' : 'Capitán'}</button>;
  };
  const actions = (pid: string) => <>{kick(pid)}{absence(pid)}</>;

  const Team = ({ t, label }: { t: 'A' | 'B'; label: string }) => {
    const ps = inList.filter(s => s.team === t);
    const lu = lineup<PitchPlayer>(ps.map(s => { const b = toBP(s.profile_id); return { id: b.id, pos: b.pos, ovr: b.ovr, profile: prof(s.profile_id) }; }));
    return (
      <div class={`card team ${t}`}>
        <div class="row" style="justify-content:space-between">
          <h3>{label}</h3>
          <span class="muted">OVR {avgOvr(ps.map(s => toBP(s.profile_id)))}</span>
        </div>
        {ps.length > 0 && <div style="margin:10px 0 6px"><Pitch placed={lu.placed} captainId={ps.find(s => s.captain)?.profile_id} /></div>}
        {lu.bench.length > 0 && <p class="muted pitch-bench">Suplentes: {lu.bench.map(b => displayName(b.profile)).join(', ')}</p>}
        {ps.map(s => PlayerRow({ pid: s.profile_id, right: <>{captainBtn(s.profile_id)}{actions(s.profile_id)}</> }))}
      </div>
    );
  };

  return (
    <>
      <div class="card">
        <h2>{m.title}</h2>
        <p>{fmtDate(m.starts_at)}{!m.venue && m.location && <> · {m.location}</>}</p>
        {editable && <WeatherChip lat={m.venue?.lat} lng={m.venue?.lng} startsAt={m.starts_at} />}
        <div class="row" style="justify-content:space-between;margin-top:8px">
          <span class="muted">{statusLabel(m)}</span>
          {editable && <span class={`slots ${inList.length >= m.slots ? 'full' : ''}`}>{inList.length}/{m.slots}</span>}
        </div>
        {m.status === 'played' && m.score_a != null && (
          <div class="score"><span class="ta">Equipo A</span> <b>{m.score_a} – {m.score_b}</b> <span class="tb">Equipo B</span></div>
        )}
        {suspended(meId) && editable &&
          <p class="note" style="margin-top:12px;padding:10px 12px;border-radius:10px">Estás suspendido para este partido por ausencias.</p>}
        {canSignup && !mine && !suspended(meId) &&
          <button class="btn primary block" style="margin-top:12px" disabled={busy}
            onClick={() => run(() => sb.rpc('signup', { p_match: id }),
              inList.length >= m.slots ? 'Quedaste en lista de espera' : '¡Anotado!')}>
            {inList.length >= m.slots ? 'Anotarme en lista de espera' : 'Anotarme'}
          </button>}
        {editable && mine && !started &&
          <div class="row" style="margin-top:12px">
            <span style="flex:1">{mine.status === 'in' ? '✓ Estás anotado' : `En espera (#${wait.findIndex(w => w.profile_id === meId) + 1})`}</span>
            {!started
              ? <button class="btn" disabled={busy} onClick={() => run(() => sb.rpc('leave_match', { p_match: id }), 'Te bajaste')}>Bajarme</button>
              : <span class="muted">Ya empezó</span>}
          </div>}
        {editable && !started && (
          <div class="share-row">
            <button class="btn sm primary wide" onClick={shareWhatsApp}>Compartir por WhatsApp</button>
            <a class="btn sm" href={gcalUrl(m, link)} target="_blank" rel="noopener">Agendar (Google)</a>
            <button class="btn sm" onClick={() => downloadIcs(m, link)}>Agendar (.ics)</button>
          </div>
        )}
        {editable && !started && <p class="muted share-hint">El .ics te avisa 1 hora antes del partido.</p>}
        {msg && <p class="muted" style="margin-top:8px">{msg}</p>}
        {err && <p class="err">{err}</p>}
      </div>

      {/* Cancha: mapa embebido y cómo llegar */}
      {m.venue && (
        <div class="card venue-card">
          <h3>📍 {m.venue.name}</h3>
          {m.venue.address && <p class="muted">{m.venue.address}</p>}
          <div class="venue-map">
            <iframe src={embedUrl(m.venue)} title={`Mapa de ${m.venue.name}`} loading="lazy" referrerpolicy="no-referrer-when-downgrade" />
          </div>
          <div class="venue-actions">
            <a class="btn sm primary" href={directionsUrl(m.venue)} target="_blank" rel="noopener">Cómo llegar</a>
            {m.venue.maps_url && <a class="btn sm" href={m.venue.maps_url} target="_blank" rel="noopener">Abrir en Google Maps</a>}
          </div>
        </div>
      )}

      {/* Lista / equipos */}
      {hasTeams ? <>
        {Team({ t: 'A', label: 'Equipo A' })}
        {Team({ t: 'B', label: 'Equipo B' })}
        {inList.some(s => !s.team) && <div class="card"><h3>Sin equipo</h3>
          {inList.filter(s => !s.team).map(s => PlayerRow({ pid: s.profile_id, right: actions(s.profile_id) }))}</div>}
      </> : (
        <div class="card">
          <h3 style="margin-bottom:4px">Anotados ({inList.length})</h3>
          {!inList.length && <p class="muted">Nadie todavía.</p>}
          {inList.map((s, i) => PlayerRow({ pid: s.profile_id, right: <>{actions(s.profile_id)}<span class="muted">{i + 1}</span></> }))}
        </div>
      )}
      {susp.length > 0 && (
        <div class="card">
          <h3 style="margin-bottom:4px">Suspendidos ({susp.length})</h3>
          {susp.map(x => PlayerRow({ pid: x.profile_id, right: isAdmin && editable &&
            <button class="btn sm" disabled={busy} onClick={() => run(() => sb.from('suspensions').delete().eq('id', x.id), 'Suspensión levantada')}>Levantar</button> }))}
        </div>
      )}
      {wait.length > 0 && editable && (
        <div class="card">
          <h3 style="margin-bottom:4px">Lista de espera ({wait.length})</h3>
          {wait.map((s, i) => PlayerRow({ pid: s.profile_id, right: <>{kick(s.profile_id)}<span class="muted">#{i + 1}</span></> }))}
        </div>
      )}

      {/* Cuota de la cancha: el total, lo que le toca a cada uno y quién ya pagó */}
      {m.status !== 'cancelled' && (
        <FeeCard total={feeNum(m.fee_total)} meId={meId} isAdmin={isAdmin} busy={paying} error={feeErr}
          players={inList.filter(s => !s.absent).map(s => ({ profile: prof(s.profile_id), paid: !!s.paid_at }))}
          onPaid={setPaid} onSetFee={setFee} />
      )}

      {/* Goles y tarjetas: partido jugado; los cargan solo los admins con − / +, el resto lo ve de solo lectura */}
      {m.status === 'played' && (
        <MatchEvents events={events} err={evErr} isAdmin={isAdmin} onStep={stepEvent}
          players={inList.filter(s => !s.absent || evHas(s.profile_id)).map(s => ({
            id: s.profile_id, name: displayName(prof(s.profile_id)), profile: prof(s.profile_id), team: hasTeams ? s.team : null,
          }))}
          nameOf={pid => displayName(prof(pid))} teamOf={pid => (hasTeams ? inList.find(s => s.profile_id === pid)?.team ?? null : null)} />
      )}

      {/* Admin */}
      {isAdmin && editable && (
        <div class="card">
          <h3 style="margin-bottom:12px">Administrar</h3>
          {notIn.length > 0 && m.status === 'open' && (
            <MemberChecklist busy={busy} picked={pickedIds} onChange={setPicked} onSubmit={addPicked}
              members={notIn.map(r => ({
                id: r.profile.id, name: displayName(r.profile), profile: r.profile, sub: r.profile.pos,
                blocked: suspended(r.profile.id) ? 'suspendido' : undefined,
              }))} />
          )}
          <div class="row" style="flex-wrap:wrap">
            {inList.length >= 2 && <button class="btn primary" disabled={busy} onClick={doBalance}>{hasTeams ? 'Rearmar equipos' : 'Armar equipos'}</button>}
            <button class="btn" disabled={busy} onClick={() => setEditing(e => !e)}>{editing ? 'Cerrar edición' : 'Editar partido'}</button>
            {!started && (m.status === 'open'
              ? <button class="btn" disabled={busy} onClick={() => run(() => sb.from('matches').update({ status: 'closed' }).eq('id', id), 'Lista cerrada')}>Cerrar lista</button>
              : <button class="btn" disabled={busy} onClick={() => run(() => sb.from('matches').update({ status: 'open' }).eq('id', id), 'Lista reabierta')}>Reabrir lista</button>)}
            <button class="btn danger" disabled={busy} onClick={() => confirm('¿Cancelar el partido? No se puede deshacer.') && run(() => sb.from('matches').update({ status: 'cancelled' }).eq('id', id), 'Partido cancelado')}>Cancelar partido</button>
          </div>
        </div>
      )}
      {isAdmin && editable && editing && !venues && <p class="muted">Cargando…</p>}
      {isAdmin && editable && editing && venues &&
        <EditMatch m={m} meId={meId} venues={venues} addVenue={v => setVenues(x => [...(x ?? []).filter(y => y.id !== v.id), v])}
          busy={busy} onSave={saveEdit} onCancel={() => setEditing(false)} />}

      {splits && splits.length > 0 && (() => {
        const s = splits[opt];
        return (
          <div class="card">
            <div class="row" style="justify-content:space-between;margin-bottom:8px">
              <button class="btn sm" disabled={opt === 0} onClick={() => setOpt(opt - 1)}>‹</button>
              <b>Opción {opt + 1} de {splits.length}</b>
              <button class="btn sm" disabled={opt === splits.length - 1} onClick={() => setOpt(opt + 1)}>›</button>
            </div>
            <div class="split">
              {([['A', s.A], ['B', s.B]] as const).map(([t, ps]) => (
                <div class={`team ${t}`}>
                  <b>Equipo {t} · OVR {avgOvr(ps as BP[])}</b>
                  {(ps as BP[]).map(p => <div class="ellipsis">{p.r ? displayName(p.r.profile) : '?'} <span class="muted">{p.pos} {p.ovr}</span></div>)}
                </div>
              ))}
            </div>
            <div class="row" style="margin-top:12px">
              <button class="btn primary" style="flex:1" disabled={busy} onClick={saveTeams}>Usar estos equipos</button>
              <button class="btn" onClick={() => setSplits(null)}>Cerrar</button>
            </div>
          </div>
        );
      })()}

      {/* Resultado: solo admins (owner incluido), una vez empezado */}
      {isAdmin && started && m.status !== 'cancelled' && (
        <div class="card">
          <h3 style="margin-bottom:12px">{m.status === 'played' ? 'Corregir resultado' : 'Cargar resultado'}</h3>
          <div class="row">
            <label class="field" style="flex:1;margin:0"><span>Equipo A</span>
              <input type="number" min={0} inputMode="numeric" value={res.a} onInput={e => setRes({ ...res, a: (e.target as HTMLInputElement).value })} /></label>
            <label class="field" style="flex:1;margin:0"><span>Equipo B</span>
              <input type="number" min={0} inputMode="numeric" value={res.b} onInput={e => setRes({ ...res, b: (e.target as HTMLInputElement).value })} /></label>
          </div>
          <button class="btn primary block" style="margin-top:12px" disabled={busy || res.a === '' || res.b === ''}
            onClick={() => run(() => sb.rpc('set_result', { p_match: id, p_a: +res.a, p_b: +res.b }), 'Resultado guardado')}>Guardar resultado</button>
        </div>
      )}

      {/* Calificar compañeros */}
      {m.status === 'played' && myTeam && (
        <RateTeammates mates={inList.filter(s => s.team === myTeam && s.profile_id !== meId && !s.absent).map(s => prof(s.profile_id))}
          initial={myRatings} busy={busy}
          save={sc => run(() => sb.rpc('rate_teammates', { p_match: id, p_scores: sc }), '¡Gracias por calificar!')} />
      )}

      {/* MVP de todo el partido: se puede elegir a cualquiera de los dos equipos */}
      {m.status === 'played' && (
        <MvpVote canVote={!!myTeam} meId={meId} mine={mvp.mine} tally={mvp.tally} busy={busy}
          players={inList.filter(s => s.team && !s.absent).map(s => ({ p: prof(s.profile_id), team: s.team! }))}
          vote={pid => run(async () => { const r = await sb.rpc('vote_mvp', { p_match: id, p_target: pid }); if (!r.error) await loadMvp(); return r; }, '¡Voto de MVP guardado!')} />
      )}
      {started && <Tip />}

      {/* Eliminar: solo owner/admins (la base también lo exige). Borra anotados, goles, calificaciones y votos. */}
      {isAdmin && (
        <div class="card danger-zone">
          <h3 style="margin-bottom:6px">Eliminar partido</h3>
          <p class="muted" style="margin:0 0 10px;font-size:.88rem">
            {m.schedule_id && !started
              ? 'Es del partido fijo: si lo eliminás se vuelve a crear solo. Para no jugar esa fecha usá "Cancelar partido", o pausá el partido fijo.'
              : 'Se borran los anotados, goles, tarjetas, calificaciones y votos de este partido. No se puede deshacer.'}
          </p>
          <button class="btn danger" disabled={busy} onClick={async () => {
            if (!confirm(`¿Eliminar "${m.title}" para siempre? Se pierden sus anotados, goles y votos.`)) return;
            setBusy(true); setErr('');
            const r = await sb.from('matches').delete().eq('id', id).select('id');
            setBusy(false);
            if (r.error || !r.data?.length) return setErr(r.error ? friendly(r.error.message) : 'No tenés permiso para eliminar este partido.');
            go(`c/${slug}`);
          }}>Eliminar partido</button>
        </div>
      )}
    </>
  );
}

/** valor para <input type="datetime-local"> (hora local) a partir de un instante ISO */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
};

/** Edición de título, fecha, cancha/lugar y cupos (admins). Si bajan los cupos, el servidor manda a los últimos a la lista de espera. */
function EditMatch({ m, meId, venues, addVenue, busy, onSave, onCancel }: {
  m: M; meId: string; venues: Venue[]; addVenue: (v: Venue) => void; busy: boolean; onCancel: () => void;
  onSave: (v: { title: string; startsAt: string; location: string; slots: number; venueId: string | null }) => Promise<string>;
}) {
  const [f, setF] = useState({ title: m.title, when: toLocalInput(m.starts_at), location: m.location ?? '', slots: String(m.slots) });
  const [venue, setVenue] = useState(m.venue_id && venues.some(v => v.id === m.venue_id) ? m.venue_id : '');
  const [draft, setDraft] = useState(emptyDraft);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  const slots = Math.round(+f.slots);
  const valid = f.title.trim().length > 0 && !isNaN(+new Date(f.when)) && f.when !== '' && slots >= 2 && slots <= 40
    && (venue !== NEW_VENUE || draftValid(draft));
  const save = async () => {
    setErr(''); setPicking(true);
    // Cancha nueva: se guarda primero; si después falla el partido, queda elegida y un reintento no la duplica.
    const p = await pickVenue(venue, draft, venues, m.community_id, meId);
    setPicking(false);
    if ('error' in p) return setErr(p.error);
    if (p.created) { addVenue(p.created); setVenue(p.created.id); }
    // location lleva el nombre de la cancha: los avisos y el texto de compartir lo usan
    setErr(await onSave({ title: f.title.trim(), startsAt: f.when, location: p.name ?? f.location.trim(), slots, venueId: p.id }));
  };
  return (
    <div class="card adm-card">
      <h3 style="margin-bottom:12px">Editar partido</h3>
      <label class="field"><span>Título</span><input value={f.title} maxLength={80} onInput={set('title')} /></label>
      <label class="field"><span>Fecha y hora</span><input type="datetime-local" value={f.when} onInput={set('when')} /></label>
      <VenueField venues={venues} value={venue} onChange={setVenue} draft={draft} onDraft={setDraft} />
      {!venue && <label class="field"><span>Lugar</span><input value={f.location} maxLength={200} placeholder="Cancha, dirección…" onInput={set('location')} /></label>}
      <label class="field"><span>Cupos</span><input type="number" min={2} max={40} inputMode="numeric" value={f.slots} onInput={set('slots')} /></label>
      <p class="muted adm-note">Si subís los cupos, entran los primeros de la lista de espera. Si los bajás, los últimos en anotarse pasan a la lista de espera.</p>
      <div class="row">
        <button class="btn primary" disabled={busy || picking || !valid} onClick={save}>{busy || picking ? 'Guardando…' : 'Guardar cambios'}</button>
        <button class="btn" disabled={busy || picking} onClick={onCancel}>Cancelar</button>
      </div>
      {err && <p class="err">{err}</p>}
    </div>
  );
}

/** Goles, asistencias y tarjetas: los admins los cargan con − / + por jugador; los demás ven un resumen. */
function MatchEvents({ events, err, isAdmin, players, nameOf, teamOf, onStep }: {
  events: MatchEvent[] | null; err: string; isAdmin: boolean;
  players: EvPlayer[]; nameOf: (pid: string) => string; teamOf: (pid: string) => 'A' | 'B' | null;
  onStep: (pid: string, kind: EventKind, dir: 1 | -1) => void;
}) {
  const counts = eventCounts(events ?? []);
  return (
    <div class="card">
      <h3>Goles y tarjetas</h3>
      {events == null && !err && <p class="muted" style="margin-top:8px">Cargando…</p>}
      {err && <p class="err">{err}</p>}
      {events != null && isAdmin && (players.length
        ? <>
            <p class="muted" style="margin:6px 0 8px;font-size:.85rem">Tocá + o − para sumar o sacar. ⚽ goles · 👟 asistencias · 🟨 amarilla · 🟥 roja</p>
            <EventRows players={players} counts={counts} onStep={onStep} />
          </>
        : <p class="muted" style="margin-top:8px">No hay jugadores anotados.</p>)}
      {events != null && !isAdmin && (events.length
        ? <EventSummary events={events} nameOf={nameOf} teamOf={teamOf} />
        : <p class="muted" style="margin-top:8px">Todavía no hay goles ni tarjetas cargados.</p>)}
    </div>
  );
}

function RateTeammates({ mates, initial, busy, save }:
  { mates: Profile[]; initial: Record<string, number>; busy: boolean; save: (s: Record<string, number>) => void }) {
  const [sc, setSc] = useState<Record<string, number>>(initial);
  useEffect(() => setSc(initial), [initial]);
  if (!mates.length) return null;
  const done = Object.keys(initial).length > 0;
  const missing = mates.filter(p => initial[p.id] == null).length;
  return (
    <div class="card">
      <h3 style="margin-bottom:4px">Calificá a tu equipo</h3>
      <p class="muted" style="margin-bottom:8px">Todos califican a todos sus compañeros: del 1 al 10, ¿cómo jugó cada uno hoy?</p>
      {missing > 0 && <p class="note-inline">Te {missing === 1 ? 'falta' : 'faltan'} calificar <b>{missing}</b> {missing === 1 ? 'compañero' : 'compañeros'}.</p>}
      {mates.map(p => (
        <div class="rank-row">
          <div class="row"><Avatar p={p} size={32} /><span style="flex:1">{displayName(p)}</span><b>{sc[p.id] ?? '—'}</b></div>
          <div class="rate">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button class={sc[p.id] === n ? 'on' : ''} onClick={() => setSc({ ...sc, [p.id]: n })} aria-label={`${displayName(p)}: ${n}`}>{n}</button>
            ))}
          </div>
        </div>
      ))}
      <button class="btn primary block" style="margin-top:12px" disabled={busy || !Object.keys(sc).length} onClick={() => save(sc)}>
        {done ? 'Actualizar calificaciones' : 'Enviar calificaciones'}
      </button>
    </div>
  );
}

function MvpVote({ canVote, meId, mine, tally, players, busy, vote }: {
  canVote: boolean; meId: string; mine: string | null; tally: Map<string, number>; busy: boolean;
  players: { p: Profile; team: 'A' | 'B' }[]; vote: (pid: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(mine);
  useEffect(() => setSel(mine), [mine]);
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  const top = Math.max(0, ...tally.values());
  const winners = players.filter(x => top > 0 && tally.get(x.p.id) === top);
  const options = players.filter(x => x.p.id !== meId);
  return (
    <div class="card">
      <h3 style="margin-bottom:4px">🏆 MVP del partido</h3>
      {winners.length > 0
        ? <p style="margin-bottom:8px"><b>{winners.map(w => displayName(w.p)).join(' y ')}</b>
            <span class="muted"> · {top} de {total} {total === 1 ? 'voto' : 'votos'}{winners.length > 1 ? ' (empate)' : ''}</span></p>
        : <p class="muted" style="margin-bottom:8px">Todavía nadie votó.</p>}
      {canVote ? <>
        <p class="muted" style="margin-bottom:8px">
          {mine ? 'Ya votaste, podés cambiar tu voto.' : 'Elegí al mejor de la cancha. Acá sí vale votar a uno del equipo contrario.'}
        </p>
        {(['A', 'B'] as const).map(t => {
          const ps = options.filter(x => x.team === t);
          return ps.length > 0 && <div class={`team ${t}`} style="padding-left:8px;margin-bottom:8px">
            <b class={t === 'A' ? 'ta' : 'tb'} style="font-size:.85rem">Equipo {t}</b>
            {ps.map(({ p }) => (
              <button type="button" class={`row rank-row mvp-opt${sel === p.id ? ' on' : ''}`} onClick={() => setSel(p.id)} aria-pressed={sel === p.id}>
                <Avatar p={p} size={28} /><span class="ellipsis" style="flex:1;text-align:left">{displayName(p)}</span>
                {tally.get(p.id) ? <span class="muted">{tally.get(p.id)}</span> : null}
                <span aria-hidden="true">{sel === p.id ? '🏆' : ''}</span>
              </button>
            ))}
          </div>;
        })}
        <button class="btn primary block" disabled={busy || !sel || sel === mine} onClick={() => sel && vote(sel)}>
          {mine ? 'Cambiar mi voto' : 'Votar MVP'}
        </button>
      </> : <p class="muted">Votan los que jugaron el partido.</p>}
    </div>
  );
}

function friendly(m: string) {
  if (m.includes('self_vote')) return 'No te podés votar a vos mismo como MVP 😅';
  if (m.includes('not_in_match') || m.includes('bad_target')) return 'Ese jugador no jugó este partido.';
  if (m.includes('mvp_closed')) return 'La votación de la figura ya cerró.';
  if (m.includes('already_suspended')) return 'Ya está suspendido para el próximo partido.';
  if (m.includes('suspended')) return 'Está suspendido para este partido por ausencias.';
  if (m.includes('result_locked')) return 'El resultado ya está cargado: solo lo corrige quien lo cargó o un admin.';
  if (m.includes('bad_score')) return 'El resultado tiene que ser un número entre 0 y 99.';
  if (m.includes('not_played')) return 'Primero hay que cargar el resultado del partido.';
  if (m.includes('not_member')) return 'Esa persona ya no es miembro de la comunidad.';
  if (m.includes('already_started')) return 'El partido ya empezó: no podés bajarte. Avisale a un admin.';
  if (m.includes('not_editable')) return 'Solo se puede editar un partido con la lista abierta o cerrada.';
  if (m.includes('bad_title')) return 'El título tiene que tener entre 1 y 80 caracteres.';
  if (m.includes('bad_date')) return 'Elegí una fecha y hora válidas.';
  if (m.includes('bad_location')) return 'El lugar es demasiado largo (máximo 200 caracteres).';
  if (m.includes('bad_slots')) return 'Los cupos tienen que ser entre 2 y 40.';
  if (m.includes('bad_venue')) return 'Esa cancha no es de esta comunidad. Elegí otra.';
  if (m.includes('cancelled')) return 'El partido está cancelado.';
  if (m.includes('closed')) return 'La lista está cerrada.';
  if (m.includes('not_started')) return 'El partido todavía no empezó.';
  if (m.includes('not_teammate')) return 'Solo podés calificar a tu equipo.';
  if (m.includes('not_player')) return 'No jugaste este partido.';
  if (m.includes('forbidden') || m.includes('row-level security')) return 'No tenés permiso para hacer eso.';
  if (m.includes('violates check constraint') || m.includes('invalid input syntax')) return 'Revisá los datos: hay un valor inválido.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}
