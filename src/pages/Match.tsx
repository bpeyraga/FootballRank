import { useEffect, useMemo, useState } from 'preact/hooks';
import { displayName, ovr, posLine, sb, type Profile, type Stats } from '../lib/supabase';
import { balance, type BPlayer } from '../lib/balance';
import { Avatar } from '../lib/Avatar';
import { lineup } from '../lib/formation';
import { Pitch, type PitchPlayer } from '../lib/Pitch';
import type { Ranked } from '../lib/ranking';
import { fmtDate, STATUS, type Match as M } from './Matches';
import {
  EVENT_KINDS, KIND_ICON, KIND_LABEL, groupMatchEvents, loadMatchEvents,
  type EventKind, type MatchEvent, type Team,
} from '../lib/stats';
import '../stats.css';

interface Signup { profile_id: string; status: 'in' | 'waitlist' | 'out'; team: 'A' | 'B' | null; created_at: string }
type BP = BPlayer & { r: Ranked };
const NEUTRAL: Stats = { rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 };

export function Match({ id, rows, meId, isAdmin }: { id: string; rows: Ranked[]; meId: string; isAdmin: boolean }) {
  const [m, setM] = useState<M | null | undefined>(undefined);
  const [su, setSu] = useState<Signup[]>([]);
  const [scores, setScores] = useState<Map<string, { avg: number; n: number }>>(new Map());
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [splits, setSplits] = useState<ReturnType<typeof balance<BP>> | null>(null);
  const [opt, setOpt] = useState(0);
  const [adding, setAdding] = useState('');
  const [res, setRes] = useState({ a: '', b: '' });
  const [events, setEvents] = useState<MatchEvent[] | null>(null);
  const [evErr, setEvErr] = useState('');
  const [evBusy, setEvBusy] = useState(false);

  // Goles y tarjetas se cargan aparte: si la tabla no existe todavía, el resto de la pantalla sigue andando.
  const loadEvents = async () => {
    try { setEvents(await loadMatchEvents(id)); setEvErr(''); }
    catch (e: any) { setEvErr('No pudimos cargar los goles y tarjetas. ' + (e?.message ?? '')); }
  };

  const load = async () => {
    const [a, b, c, d] = await Promise.all([
      sb.from('matches').select('*').eq('id', id).maybeSingle(),
      sb.from('match_signups').select('*').eq('match_id', id).order('created_at'),
      sb.from('match_scores').select('*').eq('match_id', id),
      sb.from('match_ratings').select('target_id,score').eq('match_id', id).eq('rater_id', meId),
    ]);
    const e = a.error || b.error || c.error || d.error;
    if (e) return setErr(e.message);
    setM(a.data); setSu(b.data ?? []);
    setScores(new Map((c.data ?? []).map((x: any) => [x.profile_id, { avg: +x.avg_score, n: x.n }])));
    setMyRatings(Object.fromEntries((d.data ?? []).map((x: any) => [x.target_id, x.score])));
    if (a.data?.score_a != null) setRes({ a: String(a.data.score_a), b: String(a.data.score_b) });
    if (a.data?.status === 'played') loadEvents();
  };
  useEffect(() => { load(); }, [id]);

  const byId = useMemo(() => new Map(rows.map(r => [r.profile.id, r])), [rows]);

  if (err && m === undefined) return <p class="err">{err}</p>;
  if (m === undefined) return <p class="muted">Cargando…</p>;
  if (m === null) return <p class="muted">Partido no encontrado.</p>;

  const inList = su.filter(s => s.status === 'in');
  const wait = su.filter(s => s.status === 'waitlist');
  const mine = su.find(s => s.profile_id === meId && s.status !== 'out');
  const started = new Date(m.starts_at) <= new Date();
  const editable = m.status === 'open' || m.status === 'closed';
  const hasTeams = inList.some(s => s.team);
  const myTeam = mine?.status === 'in' ? mine.team : null;
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

  const evRun = async (f: () => PromiseLike<{ error: any }>) => {
    setEvBusy(true); setEvErr('');
    try {
      const { error } = await f();
      if (error) { setEvErr(friendly(error.message)); return false; }
      await loadEvents();
      return true;
    } catch (e: any) {
      setEvErr(friendly(e?.message ?? 'Error de red'));
      return false;
    } finally { setEvBusy(false); }
  };
  const addEvent = (pid: string, kind: EventKind) => evRun(() =>
    sb.from('match_events').insert({ match_id: id, community_id: m.community_id, profile_id: pid, kind, created_by: meId }));
  const delEvent = (eid: number) => evRun(async () => {
    const r = await sb.from('match_events').delete().eq('id', eid).select('id');
    return { error: r.error ?? (r.data?.length ? null : { message: 'No se pudo borrar (puede que ya lo hayan sacado).' }) };
  });

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
      sb.from('match_signups').update({ team }).eq('match_id', id).eq('profile_id', pid)));
    setBusy(false);
    const e = results.find(r => r.error)?.error;
    if (e) return setErr(e.message);
    setSplits(null); setMsg('Equipos guardados'); load();
  };

  const avgOvr = (ps: BP[]) => ps.length ? Math.round(ps.reduce((t, p) => t + p.ovr, 0) / ps.length) : 0;
  const notIn = rows.filter(r => !su.some(s => s.profile_id === r.profile.id && s.status !== 'out'));

  const PlayerRow = ({ pid, right }: { pid: string; right?: any }) => {
    const p = prof(pid), sc = scores.get(pid);
    return (
      <div class="row rank-row">
        <Avatar p={p} size={32} />
        <span style="flex:1" class="ellipsis">{displayName(p)} <span class="muted">· {posLine(p)}</span></span>
        {sc && <span class="pill" title={`${sc.n} ${sc.n === 1 ? 'calificación' : 'calificaciones'}`}>★ {sc.avg}</span>}
        {right}
      </div>
    );
  };
  const kick = (pid: string) => isAdmin && editable && pid !== meId &&
    <button class="btn sm" disabled={busy} onClick={() => run(() => sb.rpc('leave_match', { p_match: id, p_profile: pid }))}>Sacar</button>;

  const Team = ({ t, label }: { t: 'A' | 'B'; label: string }) => {
    const ps = inList.filter(s => s.team === t);
    const lu = lineup<PitchPlayer>(ps.map(s => { const b = toBP(s.profile_id); return { id: b.id, pos: b.pos, ovr: b.ovr, profile: prof(s.profile_id) }; }));
    return (
      <div class={`card team ${t}`}>
        <div class="row" style="justify-content:space-between">
          <h3>{label}</h3>
          <span class="muted">OVR {avgOvr(ps.map(s => toBP(s.profile_id)))}</span>
        </div>
        {ps.length > 0 && <div style="margin:10px 0 6px"><Pitch placed={lu.placed} /></div>}
        {lu.bench.length > 0 && <p class="muted pitch-bench">Suplentes: {lu.bench.map(b => displayName(b.profile)).join(', ')}</p>}
        {ps.map(s => <PlayerRow pid={s.profile_id} right={kick(s.profile_id)} />)}
      </div>
    );
  };

  return (
    <>
      <div class="card">
        <h2>{m.title}</h2>
        <p>{fmtDate(m.starts_at)}{m.location && <> · {m.location}</>}</p>
        <div class="row" style="justify-content:space-between;margin-top:8px">
          <span class="muted">{STATUS[m.status]}</span>
          {editable && <span class={`slots ${inList.length >= m.slots ? 'full' : ''}`}>{inList.length}/{m.slots}</span>}
        </div>
        {m.status === 'played' && m.score_a != null && (
          <div class="score"><span class="ta">Equipo A</span> <b>{m.score_a} – {m.score_b}</b> <span class="tb">Equipo B</span></div>
        )}
        {m.status === 'open' && !mine &&
          <button class="btn primary block" style="margin-top:12px" disabled={busy}
            onClick={() => run(() => sb.rpc('signup', { p_match: id }),
              inList.length >= m.slots ? 'Quedaste en lista de espera' : '¡Anotado!')}>
            {inList.length >= m.slots ? 'Anotarme en lista de espera' : 'Anotarme'}
          </button>}
        {editable && mine &&
          <div class="row" style="margin-top:12px">
            <span style="flex:1">{mine.status === 'in' ? '✓ Estás anotado' : `En espera (#${wait.findIndex(w => w.profile_id === meId) + 1})`}</span>
            <button class="btn" disabled={busy} onClick={() => run(() => sb.rpc('leave_match', { p_match: id }), 'Te bajaste')}>Bajarme</button>
          </div>}
        {msg && <p class="muted" style="margin-top:8px">{msg}</p>}
        {err && <p class="err">{err}</p>}
      </div>

      {/* Lista / equipos */}
      {hasTeams ? <>
        <Team t="A" label="Equipo A" />
        <Team t="B" label="Equipo B" />
        {inList.some(s => !s.team) && <div class="card"><h3>Sin equipo</h3>
          {inList.filter(s => !s.team).map(s => <PlayerRow pid={s.profile_id} right={kick(s.profile_id)} />)}</div>}
      </> : (
        <div class="card">
          <h3 style="margin-bottom:4px">Anotados ({inList.length})</h3>
          {!inList.length && <p class="muted">Nadie todavía.</p>}
          {inList.map((s, i) => <PlayerRow pid={s.profile_id} right={<>{kick(s.profile_id)}<span class="muted">{i + 1}</span></>} />)}
        </div>
      )}
      {wait.length > 0 && editable && (
        <div class="card">
          <h3 style="margin-bottom:4px">Lista de espera ({wait.length})</h3>
          {wait.map((s, i) => <PlayerRow pid={s.profile_id} right={<>{kick(s.profile_id)}<span class="muted">#{i + 1}</span></>} />)}
        </div>
      )}

      {/* Goles y tarjetas: partido jugado; cargan admins y quienes jugaron */}
      {m.status === 'played' && (
        <MatchEvents events={events} err={evErr} busy={evBusy} meId={meId} isAdmin={isAdmin}
          canAdd={isAdmin || mine?.status === 'in'} hasTeams={hasTeams}
          players={inList.map(s => ({ id: s.profile_id, name: displayName(prof(s.profile_id)), team: s.team }))}
          nameOf={pid => displayName(prof(pid))} teamOf={pid => (hasTeams ? inList.find(s => s.profile_id === pid)?.team ?? null : null)}
          onAdd={addEvent} onDel={delEvent} />
      )}

      {/* Admin */}
      {isAdmin && editable && (
        <div class="card">
          <h3 style="margin-bottom:12px">Administrar</h3>
          {notIn.length > 0 && m.status === 'open' && (
            <div class="row" style="margin-bottom:12px">
              <select style="flex:1;min-height:44px;border-radius:10px;padding:0 8px;background:var(--bg);border:1px solid var(--line)"
                value={adding} onChange={e => setAdding((e.target as HTMLSelectElement).value)}>
                <option value="">Anotar a un miembro…</option>
                {notIn.map(r => <option value={r.profile.id}>{displayName(r.profile)}</option>)}
              </select>
              <button class="btn" disabled={!adding || busy}
                onClick={() => run(() => sb.rpc('add_to_match', { p_match: id, p_profile: adding })).then(ok => ok && setAdding(''))}>Anotar</button>
            </div>
          )}
          <div class="row" style="flex-wrap:wrap">
            {inList.length >= 2 && <button class="btn primary" disabled={busy} onClick={doBalance}>{hasTeams ? 'Rearmar equipos' : 'Armar equipos'}</button>}
            {m.status === 'open'
              ? <button class="btn" disabled={busy} onClick={() => run(() => sb.from('matches').update({ status: 'closed' }).eq('id', id), 'Lista cerrada')}>Cerrar lista</button>
              : <button class="btn" disabled={busy} onClick={() => run(() => sb.from('matches').update({ status: 'open' }).eq('id', id), 'Lista reabierta')}>Reabrir lista</button>}
            <button class="btn danger" disabled={busy} onClick={() => confirm('¿Cancelar el partido? No se puede deshacer.') && run(() => sb.from('matches').update({ status: 'cancelled' }).eq('id', id), 'Partido cancelado')}>Cancelar partido</button>
          </div>
        </div>
      )}

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

      {/* Resultado: cualquier miembro, una vez empezado */}
      {started && m.status !== 'cancelled' && (
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
        <RateTeammates mates={inList.filter(s => s.team === myTeam && s.profile_id !== meId).map(s => prof(s.profile_id))}
          initial={myRatings} busy={busy}
          save={sc => run(() => sb.rpc('rate_teammates', { p_match: id, p_scores: sc }), '¡Gracias por calificar!')} />
      )}
    </>
  );
}

const SHORT: Record<EventKind, string> = { goal: 'Gol', assist: 'Asist.', yellow: 'Amarilla', red: 'Roja' };

/** Goles, asistencias y tarjetas del partido, agrupados por equipo, con alta y baja para quienes pueden. */
function MatchEvents({ events, err, busy, meId, isAdmin, canAdd, hasTeams, players, nameOf, teamOf, onAdd, onDel }: {
  events: MatchEvent[] | null; err: string; busy: boolean; meId: string; isAdmin: boolean; canAdd: boolean; hasTeams: boolean;
  players: { id: string; name: string; team: Team | null }[];
  nameOf: (pid: string) => string; teamOf: (pid: string) => Team | null;
  onAdd: (pid: string, kind: EventKind) => Promise<boolean>; onDel: (id: number) => void;
}) {
  const [pid, setPid] = useState('');
  const [kind, setKind] = useState<EventKind>('goal');
  const groups = groupMatchEvents(events ?? [], teamOf);
  const canDel = (e: MatchEvent) => isAdmin || e.created_by === meId;
  const opt = (ps: typeof players) => ps.map(p => <option value={p.id}>{p.name}</option>);
  const sin = players.filter(p => !p.team);

  return (
    <div class="card">
      <h3>Goles y tarjetas</h3>
      {events == null && !err && <p class="muted" style="margin-top:8px">Cargando…</p>}
      {err && <p class="err">{err}</p>}
      {events != null && !events.length && <p class="muted" style="margin-top:8px">Todavía no hay goles ni tarjetas cargados.</p>}
      {groups.map(t => (
        <div class={`ev-team ${t.team === 'none' ? '' : `team ${t.team}`}`}>
          {hasTeams && (
            <div class="ev-head">
              <b class={t.team === 'A' ? 'ta' : t.team === 'B' ? 'tb' : 'muted'}>{t.team === 'none' ? 'Sin equipo' : `Equipo ${t.team}`}</b>
              {t.goals > 0 && <span class="muted">{KIND_ICON.goal} {t.goals}</span>}
            </div>
          )}
          {t.groups.map(g => {
            const del = [...g.events].reverse().find(canDel);
            const n = g.events.length, who = nameOf(g.profile_id);
            return (
              <div class="ev-row">
                <span class="ev-ico" title={KIND_LABEL[g.kind]}>{KIND_ICON[g.kind]}</span>
                <span class="ev-name ellipsis">{who}</span>
                {n > 1 && <b class="ev-n">×{n}</b>}
                {del && (
                  <button class="btn sm ev-del" disabled={busy} onClick={() => onDel(del.id)}
                    aria-label={`Quitar ${n > 1 ? 'una ' : 'la '}${KIND_LABEL[g.kind].toLowerCase()} de ${who}`}>{n > 1 ? '−' : '✕'}</button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {canAdd && (
        <div class="ev-add">
          {!players.length ? <p class="muted">No hay jugadores anotados.</p> : <>
            <select class="ev-select" aria-label="Jugador" value={pid} onChange={e => setPid((e.target as HTMLSelectElement).value)}>
              <option value="">¿Quién?</option>
              {hasTeams
                ? <>
                    <optgroup label="Equipo A">{opt(players.filter(p => p.team === 'A'))}</optgroup>
                    <optgroup label="Equipo B">{opt(players.filter(p => p.team === 'B'))}</optgroup>
                    {sin.length > 0 && <optgroup label="Sin equipo">{opt(sin)}</optgroup>}
                  </>
                : opt(players)}
            </select>
            <div class="st-seg c4" role="group" aria-label="Tipo de evento" style="margin-bottom:8px">
              {EVENT_KINDS.map(k => (
                <button type="button" class={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  <span aria-hidden="true">{KIND_ICON[k]}</span><small>{SHORT[k]}</small>
                </button>
              ))}
            </div>
            <button class="btn primary block" disabled={busy || !pid} onClick={() => onAdd(pid, kind)}>
              {busy ? 'Guardando…' : `Agregar ${KIND_LABEL[kind].toLowerCase()}`}
            </button>
          </>}
        </div>
      )}
    </div>
  );
}

function RateTeammates({ mates, initial, busy, save }:
  { mates: Profile[]; initial: Record<string, number>; busy: boolean; save: (s: Record<string, number>) => void }) {
  const [sc, setSc] = useState<Record<string, number>>(initial);
  useEffect(() => setSc(initial), [initial]);
  if (!mates.length) return null;
  const done = Object.keys(initial).length > 0;
  return (
    <div class="card">
      <h3 style="margin-bottom:4px">Calificá a tu equipo</h3>
      <p class="muted" style="margin-bottom:8px">Del 1 al 10, ¿cómo jugó cada uno hoy?</p>
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

function friendly(m: string) {
  if (m.includes('result_locked')) return 'El resultado ya está cargado: solo lo corrige quien lo cargó o un admin.';
  if (m.includes('bad_score')) return 'El resultado tiene que ser un número entre 0 y 99.';
  if (m.includes('not_played')) return 'Primero hay que cargar el resultado del partido.';
  if (m.includes('not_member')) return 'Esa persona ya no es miembro de la comunidad.';
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
