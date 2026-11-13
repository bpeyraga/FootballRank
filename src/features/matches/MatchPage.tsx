import { useEffect, useMemo, useState } from 'preact/hooks';
import { Tip } from '../../shared/ui/Tip';
import { go } from '../../app/router';
import { displayName, ovr, posLine, type Profile, type Stats } from '../../shared/supabase';
import { balance, type BPlayer } from './balance';
import { Avatar } from '../../shared/ui/Avatar';
import type { PitchPlayer } from './Pitch';
import { TeamLineup } from './TeamLineup';
import { ManualTeams } from './ManualTeams';
import { gkOf, type Ranked } from '../ranking/ranking';
import { addedNotice, editNotice, fmtDate, roster, statusLabel } from './model';
import { useMatch } from './useMatch';
import { LivePanel } from './LivePanel';
import { canStartLive } from './live';
import { Beers } from './Beers';
import { MemberChecklist } from './MemberChecklist';
import { EditMatch, MatchEvents, MvpVote, RateTeammates } from './MatchSections';
import { downloadIcs, gcalUrl, matchUrl, shareText, whatsappUrl } from './share';
import { directionsUrl, embedUrl, type Venue } from '../venues/maps';
import { loadVenues } from '../venues/api';
import { FeeCard } from './FeeCard';
import { WeatherChip } from './WeatherChip';
import { feeNum } from './fees';
import '../player/stats.css';
import '../community/admin.css';

type BP = BPlayer & { r: Ranked };
const NEUTRAL: Stats = { rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 };

export function Match({ id, slug, rows, meId, isAdmin }: { id: string; slug: string; rows: Ranked[]; meId: string; isAdmin: boolean }) {
  const x = useMatch(id, meId);
  const { m, su, susp, scores, myRatings, mvp, events, busy } = x;
  const [splits, setSplits] = useState<ReturnType<typeof balance<BP>> | null>(null);
  const [opt, setOpt] = useState(0);
  const [manual, setManual] = useState<Record<string, 'A' | 'B' | null> | null>(null); // armado a mano abierto (con el punto de partida)
  const [picked, setPicked] = useState<string[]>([]); // miembros tildados para anotar de una
  const [res, setRes] = useState({ a: '', b: '' });
  const [editing, setEditing] = useState(false);
  const [venues, setVenues] = useState<Venue[] | null>(null); // canchas de la comunidad: solo se cargan al editar (admins)

  // El resultado guardado precarga el formulario (y lo actualiza si alguien lo corrige).
  useEffect(() => {
    if (m?.score_a != null) setRes({ a: String(m.score_a), b: String(m.score_b) });
  }, [m?.score_a, m?.score_b]);

  const communityId = m?.community_id;
  useEffect(() => {
    if (!editing || !communityId) return;
    loadVenues(communityId).then(setVenues).catch((e: any) => {
      x.setErr('No pudimos cargar las canchas. ' + (e?.message ?? '')); setEditing(false);
    });
  }, [editing, communityId]);

  const byId = useMemo(() => new Map(rows.map(r => [r.profile.id, r])), [rows]);

  if (x.err && m === undefined) return <p class="err">{x.err}</p>;
  if (m === undefined) return <p class="muted">Cargando…</p>;
  if (m === null) return <p class="muted">Partido no encontrado.</p>;

  const { inList, wait, mine, myTeam, hasTeams } = roster(su, meId);
  const started = new Date(m.starts_at) <= new Date();
  const editable = m.status === 'open' || m.status === 'closed';
  const canSignup = m.status === 'open' && !started; // pasada la hora, la lista queda cerrada sola
  const link = matchUrl(location.origin, slug, id);
  const suspended = (pid: string) => susp.some(s => s.profile_id === pid);
  const canMarkAbsent = started && m.status !== 'cancelled';
  const prof = (pid: string): Profile => byId.get(pid)?.profile ?? { id: pid, name: '?', pos: 'MED', photo_url: null, user_id: null, onboarded: true, nickname: null, shirt_number: null, fav_team: null };
  // Partido en vivo (reloj andando o terminado pero sin resultado cargado todavía)
  const liveOn = editable && !!m.live_state;
  const nameOf = (pid: string) => displayName(prof(pid));
  const teamOfIn = (pid: string) => su.find(s => s.profile_id === pid && s.status === 'in')?.team ?? null;

  const shareWhatsApp = () => {
    const text = shareText(m, inList.length, link, m.venue?.maps_url);
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else open(whatsappUrl(text), '_blank', 'noopener');
  };

  // Devuelve el error (en español) o '' si salió bien; el formulario lo muestra junto a los campos.
  const saveEdit = async (v: { title: string; startsAt: string; location: string; slots: number; venueId: string | null }): Promise<string> => {
    const over = inList.length - v.slots;
    if (over > 0 && !confirm(`Hay ${over} ${over === 1 ? 'anotado' : 'anotados'} de más: ${over === 1 ? 'el último en anotarse pasa' : `los últimos ${over} en anotarse pasan`} a la lista de espera. ¿Seguís?`)) return '';
    const e = await x.saveEdit({ ...v, startsAt: new Date(v.startsAt).toISOString() }, editNotice(inList.length, wait.length, v.slots));
    if (e) return e;
    setEditing(false);
    scrollTo({ top: 0, behavior: 'smooth' });
    return '';
  };

  const toBP = (pid: string): BP => {
    const r = byId.get(pid)!;
    const attrs = r?.votes ?? r?.base ?? NEUTRAL;
    const pos = r?.profile.pos ?? 'MED', gk = gkOf(r);
    // OVR ponderado por su posición (para ARQ cuenta el 🧤, que puede venir de votos o de la autoevaluación)
    return { id: pid, pos, ovr: ovr({ ...attrs, arq: gk }, pos), attrs: { ...attrs, arq: gk }, gk, r };
  };
  const doBalance = () => { setSplits(balance(inList.map(s => toBP(s.profile_id)))); setOpt(0); setManual(null); };
  const saveTeams = async () => {
    const s = splits![opt];
    if (await x.saveTeams(s.A.map(p => p.id), s.B.map(p => p.id))) setSplits(null);
  };
  // Armar a mano: arranca con los equipos de una opción automática, o con los que ya están guardados.
  const openManual = (from?: { A: BP[]; B: BP[] }) => {
    const init: Record<string, 'A' | 'B' | null> = {};
    for (const s of inList) init[s.profile_id] = from ? null : s.team;
    from?.A.forEach(p => { init[p.id] = 'A'; });
    from?.B.forEach(p => { init[p.id] = 'B'; });
    setManual(init); setSplits(null);
  };
  const saveManual = async (a: string[], b: string[]) => { if (await x.saveTeams(a, b)) setManual(null); };

  const avgOvr = (ps: BP[]) => ps.length ? Math.round(ps.reduce((t, p) => t + p.ovr, 0) / ps.length) : 0;
  const evHas = (pid: string) => (events ?? []).some(e => e.profile_id === pid); // un ausente con goles cargados sigue apareciendo
  const notIn = rows.filter(r => !su.some(s => s.profile_id === r.profile.id && s.status !== 'out'));
  // Tildados que siguen pudiéndose anotar (alguien pudo anotarse solo o ser suspendido mientras tanto).
  const pickedIds = picked.filter(pid => !suspended(pid) && notIn.some(r => r.profile.id === pid));
  const addPicked = async () => {
    if (!pickedIds.length) return;
    if (await x.addMany(pickedIds, addedNotice(pickedIds.length, m.slots - inList.length))) setPicked([]);
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
    <button class="btn sm" disabled={busy} onClick={() => x.kick(pid)}>Sacar</button>;
  // Una vez empezado: un admin marca ausente/presente y puede suspender al ausente 1 partido.
  const absence = (pid: string) => {
    if (!canMarkAbsent || !isAdmin) return null;
    const s = su.find(x => x.profile_id === pid && x.status === 'in');
    if (!s) return null;
    return <>
      <button class="btn sm" disabled={busy} onClick={() => x.setAbsent(pid, !s.absent)}>{s.absent ? 'Presente' : 'Ausente'}</button>
      {s.absent && <button class="btn sm danger" disabled={busy}
        onClick={() => x.suspend(pid, `${displayName(prof(pid))} queda suspendido para el próximo partido`)}>Suspender</button>}
    </>;
  };
  // Capitán: lo elige un admin o cualquiera del mismo equipo
  const captainBtn = (pid: string) => {
    const s = su.find(x => x.profile_id === pid && x.status === 'in');
    if (!s?.team || m.status === 'cancelled' || s.absent) return null;
    if (!isAdmin && myTeam !== s.team) return null;
    return <button class="btn sm" disabled={busy}
      onClick={() => x.setCaptain(pid, !s.captain, s.captain ? 'Capitán quitado' : `${displayName(prof(pid))} es el capitán`)}>{s.captain ? 'Quitar C' : 'Capitán'}</button>;
  };
  const actions = (pid: string) => <>{kick(pid)}{absence(pid)}</>;

  const Team = ({ t, label }: { t: 'A' | 'B'; label: string }) => {
    const ps = inList.filter(s => s.team === t);
    const pitch: PitchPlayer[] = ps.map(s => { const b = toBP(s.profile_id); return { id: b.id, pos: b.pos, ovr: b.ovr, gk: b.gk, stats: b.attrs, profile: prof(s.profile_id) }; });
    return (
      <div class={`card team ${t}`}>
        <TeamLineup key={t} title={label} players={pitch} saved={new Map(ps.map(s => [s.profile_id, s.slot ?? null]))}
          formation={t === 'A' ? m.formation_a : m.formation_b} captainId={ps.find(s => s.captain)?.profile_id}
          canEdit={isAdmin && m.status !== 'cancelled'} busy={busy} onSave={(f, slots) => x.setLineup(t, f, slots)}
          shirt={t === 'A' ? m.shirt_a : m.shirt_b} otherShirt={t === 'A' ? m.shirt_b : m.shirt_a}
          onShirt={isAdmin && m.status !== 'cancelled' ? key => x.setShirt(t, key) : undefined} />
        {ps.map(s => PlayerRow({ pid: s.profile_id, right: <>{captainBtn(s.profile_id)}{actions(s.profile_id)}</> }))}
      </div>
    );
  };

  return (
    <>
      <div class="card m-info">
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
            onClick={() => x.signup(inList.length >= m.slots ? 'Quedaste en lista de espera' : '¡Anotado!')}>
            {inList.length >= m.slots ? 'Anotarme en lista de espera' : 'Anotarme'}
          </button>}
        {editable && mine && !started &&
          <div class="row" style="margin-top:12px">
            <span style="flex:1">{mine.status === 'in' ? '✓ Estás anotado' : `En espera (#${wait.findIndex(w => w.profile_id === meId) + 1})`}</span>
            {!started
              ? <button class="btn danger soft" disabled={busy} onClick={x.leave}>Bajarme</button>
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
        {x.msg && <p class="muted" style="margin-top:8px">{x.msg}</p>}
        {x.err && <p class="err">{x.err}</p>}
      </div>

      {/* Partido en vivo: cronómetro, marcador y línea de tiempo para todos; el reloj y los botones, para los admins */}
      {isAdmin && !liveOn && canStartLive(m, Date.now()) && (
        <div class="card live-start">
          <h3>📡 Partido en vivo</h3>
          <p class="muted">
            Cronómetro y goles, asistencias, faltas y tarjetas con un toque por jugador mientras se juega. Todos los del grupo lo ven al instante.
            {!hasTeams && ' Armá los equipos antes de empezar para que el marcador sume solo.'}
          </p>
          <button type="button" class="btn primary block" disabled={x.liveBusy} onClick={() => x.liveClock('start')}>Iniciar partido en vivo</button>
          {x.liveErr && <p class="err" role="alert">{x.liveErr}</p>}
        </div>
      )}
      {liveOn && (
        <LivePanel clock={m} skew={x.skew} events={events ?? []} ready={events != null}
          players={inList.filter(s => !s.absent).map(s => ({ id: s.profile_id, name: nameOf(s.profile_id), profile: prof(s.profile_id), team: s.team }))}
          nameOf={nameOf} teamOf={teamOfIn} canEdit={isAdmin} busy={x.liveBusy} err={x.liveErr || x.evErr}
          onClock={a => { if (a !== 'reset' || confirm('¿Reiniciar el reloj? El partido vuelve a "sin empezar"; los goles y tarjetas cargados se conservan.')) x.liveClock(a); }}
          onRetry={x.loadEvents} onRemove={x.removeEv} onSaveResult={x.saveLiveResult}
          onEvent={(pid, kind, minute) => x.stepEvent(pid, kind, 1, minute)} onUndo={x.undoLast} meId={meId} />
      )}

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
        {inList.some(s => !s.team) && (() => {
          // Se anotaron después de armar los equipos: un admin los manda a uno (el que tiene menos aparece primero en la ayuda).
          const free = inList.filter(s => !s.team);
          const nA = inList.filter(s => s.team === 'A').length, nB = inList.filter(s => s.team === 'B').length;
          const canAssign = isAdmin && m.status !== 'cancelled';
          const assign = (pid: string, t: 'A' | 'B') => x.setTeam(pid, t, `${displayName(prof(pid))} pasó al equipo ${t}`);
          return (
            <div class="card m-unassigned">
              <h3>Sin equipo ({free.length})</h3>
              <p class="muted" style="margin:2px 0 6px;font-size:.88rem">
                {canAssign ? 'Se anotaron después de armar los equipos. Mandalos a uno: ' : 'Se anotaron después de armar los equipos. '}
                Equipo A: {nA} · Equipo B: {nB}
              </p>
              {free.map(s => PlayerRow({ pid: s.profile_id, right: <>
                {actions(s.profile_id)}
                {canAssign && (
                  <span class="mt-seg" role="group" aria-label={`Equipo para ${displayName(prof(s.profile_id))}`}>
                    {(['A', 'B'] as const).map(t => (
                      <button type="button" class={t} disabled={busy} onClick={() => assign(s.profile_id, t)}
                        aria-label={`Mandar a ${displayName(prof(s.profile_id))} al equipo ${t}`}>{t}</button>
                    ))}
                  </span>
                )}
              </> }))}
            </div>
          );
        })()}
      </> : (
        <div class="card m-list">
          <h3 style="margin-bottom:4px">Anotados ({inList.length})</h3>
          {!inList.length && <p class="muted">Nadie todavía.</p>}
          {inList.map((s, i) => PlayerRow({ pid: s.profile_id, right: <>{actions(s.profile_id)}<span class="muted">{i + 1}</span></> }))}
        </div>
      )}
      {susp.length > 0 && (
        <div class="card m-near">
          <h3 style="margin-bottom:4px">Suspendidos ({susp.length})</h3>
          {susp.map(sp => PlayerRow({ pid: sp.profile_id, right: isAdmin && editable &&
            <button class="btn sm" disabled={busy} onClick={() => x.liftSuspension(sp.id)}>Levantar</button> }))}
        </div>
      )}
      {wait.length > 0 && editable && (
        <div class="card m-near">
          <h3 style="margin-bottom:4px">Lista de espera ({wait.length})</h3>
          {wait.map((s, i) => PlayerRow({ pid: s.profile_id, right: <>{kick(s.profile_id)}<span class="muted">#{i + 1}</span></> }))}
        </div>
      )}

      {/* Cuota de la cancha: el total, lo que le toca a cada uno y quién ya pagó */}
      {m.status !== 'cancelled' && (
        <FeeCard total={feeNum(m.fee_total)} meId={meId} isAdmin={isAdmin} busy={x.paying} error={x.feeErr}
          players={inList.filter(s => !s.absent).map(s => ({ profile: prof(s.profile_id), paid: !!s.paid_at }))}
          onPaid={x.setPaid} onSetFee={x.setFee}
          payments={x.payments} profileOf={prof} onSetPayment={x.setFeePayment} />
      )}

      {/* Goles, faltas y tarjetas: partido jugado; los cargan solo los admins con − / +, el resto lo ve de solo lectura */}
      {m.status === 'played' && (
        <MatchEvents events={events} err={x.evErr} isAdmin={isAdmin} onStep={(pid, kind, dir) => x.stepEvent(pid, kind, dir)}
          players={inList.filter(s => !s.absent || evHas(s.profile_id)).map(s => ({
            id: s.profile_id, name: displayName(prof(s.profile_id)), profile: prof(s.profile_id), team: hasTeams ? s.team : null,
          }))}
          nameOf={nameOf} teamOf={pid => (hasTeams ? inList.find(s => s.profile_id === pid)?.team ?? null : null)} />
      )}

      {/* Tercer tiempo: cervezas de los que jugaron */}
      {m.status === 'played' && (
        <Beers matchId={id} meId={meId} players={inList.filter(s => !s.absent).map(s => prof(s.profile_id))} />
      )}

      {/* Admin */}
      {isAdmin && editable && (
        <div class="card m-admin">
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
            {inList.length >= 2 && <button class="btn" disabled={busy} onClick={() => (manual ? setManual(null) : openManual())}>{manual ? 'Cerrar armado a mano' : 'Armar a mano'}</button>}
            <button class="btn" disabled={busy} onClick={() => setEditing(e => !e)}>{editing ? 'Cerrar edición' : 'Editar partido'}</button>
            {!started && (m.status === 'open'
              ? <button class="btn" disabled={busy} onClick={() => x.setStatus('closed')}>Cerrar lista</button>
              : <button class="btn" disabled={busy} onClick={() => x.setStatus('open')}>Reabrir lista</button>)}
            <button class="btn danger" disabled={busy} onClick={() => confirm('¿Cancelar el partido? No se puede deshacer.') && x.setStatus('cancelled')}>Cancelar partido</button>
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
          <div class="card m-teamtools">
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
              <button class="btn" disabled={busy} onClick={() => openManual(s)}>Ajustar a mano</button>
              <button class="btn" onClick={() => setSplits(null)}>Cerrar</button>
            </div>
          </div>
        );
      })()}

      {isAdmin && editable && manual && (
        <ManualTeams key={Object.entries(manual).map(e => e.join(':')).join(',')} initial={manual} busy={busy}
          players={inList.map(s => { const b = toBP(s.profile_id); return { id: b.id, profile: prof(s.profile_id), pos: b.pos, ovr: b.ovr, gk: b.gk ?? null }; })}
          onSave={saveManual} onCancel={() => setManual(null)} />
      )}

      {/* Resultado: solo admins (owner incluido), una vez empezado (o en vivo: el servidor deja cerrarlo aunque lo hayan arrancado antes de la hora).
          Mientras el panel en vivo está, el resultado se guarda desde ahí. */}
      {isAdmin && (started || !!m.live_state) && m.status !== 'cancelled' && !liveOn && (
        <div class="card">
          <h3 style="margin-bottom:12px">{m.status === 'played' ? 'Corregir resultado' : 'Cargar resultado'}</h3>
          <div class="row">
            <label class="field" style="flex:1;margin:0"><span>Equipo A</span>
              <input type="number" min={0} inputMode="numeric" value={res.a} onInput={e => setRes({ ...res, a: (e.target as HTMLInputElement).value })} /></label>
            <label class="field" style="flex:1;margin:0"><span>Equipo B</span>
              <input type="number" min={0} inputMode="numeric" value={res.b} onInput={e => setRes({ ...res, b: (e.target as HTMLInputElement).value })} /></label>
          </div>
          <button class="btn primary block" style="margin-top:12px" disabled={busy || res.a === '' || res.b === ''}
            onClick={() => x.setResult(+res.a, +res.b)}>Guardar resultado</button>
        </div>
      )}

      {/* Calificar compañeros */}
      {m.status === 'played' && myTeam && (
        <RateTeammates mates={inList.filter(s => s.team === myTeam && s.profile_id !== meId && !s.absent).map(s => prof(s.profile_id))}
          initial={myRatings} busy={busy}
          save={x.rate} />
      )}

      {/* MVP de todo el partido: se puede elegir a cualquiera de los dos equipos */}
      {m.status === 'played' && (
        <MvpVote canVote={!!myTeam} meId={meId} mine={mvp.mine} tally={mvp.tally} busy={busy}
          players={inList.filter(s => s.team && !s.absent).map(s => ({ p: prof(s.profile_id), team: s.team! }))}
          vote={x.voteMvp} />
      )}
      {started && <Tip />}

      {/* Eliminar: solo owner/admins (la base también lo exige). Borra anotados, goles, calificaciones y votos. */}
      {isAdmin && (
        <div class="card danger-zone">
          <h3 style="margin-bottom:6px">Eliminar partido</h3>
          <p class="muted" style="margin:0 0 10px;font-size:.88rem">
            {m.schedule_id && !started
              ? 'Es del partido fijo: si lo eliminás se vuelve a crear solo. Para no jugar esa fecha usá "Cancelar partido", o pausá el partido fijo.'
              : 'Se borran los anotados, goles, faltas, tarjetas, calificaciones y votos de este partido. No se puede deshacer.'}
          </p>
          <button class="btn danger" disabled={busy} onClick={async () => {
            if (!confirm(`¿Eliminar "${m.title}" para siempre? Se pierden sus anotados, goles y votos.`)) return;
            if (await x.remove()) go(`c/${slug}`);
          }}>Eliminar partido</button>
        </div>
      )}
    </>
  );
}
