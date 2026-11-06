import { useEffect, useMemo, useState } from 'preact/hooks';
import { ATTRS, displayName, posLine } from '../../shared/supabase';
import { Radar } from '../../shared/ui/Radar';
import { Avatar } from '../../shared/ui/Avatar';
import { Crest } from '../../shared/ui/Crest';
import { tier, type Ranked } from '../ranking/ranking';
import { fmtAvg, perMatch } from '../stats/stats';
import { loadPlayData, playerAttendance, playerStatsFrom, type PlayData } from '../stats/playData';
import { computeAchievements } from '../stats/achievements';
import { computeDuos } from '../stats/duos';
import { summaryTiles } from './cardLayout';
import { ShareCardButton } from './ShareCard';
import { AchievementsCard, DuosCard, PresenceCard } from './PlayerAchievementsPage';
import { CustomStats, MatchHistory, SuspensionNotice } from './PlayerExtras';
import { aggregateCustom, loadCustom, radarHouse, type CustomRow } from '../stats/customStats';
import { fmtDay, loadOvrHistory, type OvrHistory } from '../stats/history';
import { OvrChart } from './OvrChart';
import { loadBeerTotal } from '../matches/Beers';
import { ClaimProfile } from '../community/ClaimProfile';
import './stats.css';
import './history.css';

const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };

/** Perfil de un jugador dentro de la comunidad. */
export function Player({ r, rows, slug, meId, communityId, isAdmin, communityName }:
  { r: Ranked; rows: Ranked[]; slug: string; meId: string; communityId: string; isAdmin: boolean; communityName?: string }) {
  const main = r.votes ?? r.base;
  // Una sola carga trae los partidos y anotados de la comunidad: de ahí salen estadísticas, presentismo, logros y duplas.
  const [pd, setPd] = useState<PlayData | null>(null);
  const [stErr, setStErr] = useState('');
  useEffect(() => {
    let alive = true;
    setPd(null); setStErr('');
    loadPlayData(communityId, r.profile.id)
      .then(d => alive && setPd(d))
      .catch(e => alive && setStErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [communityId, r.profile.id]);
  const pid = r.profile.id;
  const calc = useMemo(() => {
    if (!pd) return null;
    const mine = pd.signups.filter(s => s.profile_id === pid);
    return {
      st: playerStatsFrom(pid, pd.matches, mine, pd.events),
      att: playerAttendance(pd.matches, mine, pd.joinedAt),
      ach: computeAchievements({ matches: pd.matches, mine, events: pd.events, mvpTimes: pd.mvpTimes, joinedAt: pd.joinedAt }),
      duos: computeDuos(pid, pd.matches, pd.signups),
    };
  }, [pd, pid]);
  const st = calc?.st ?? null;
  const cardData = useMemo(() => ({
    name: displayName(r.profile), pos: r.profile.pos, ovr: r.ovr, stats: main, photoUrl: r.profile.photo_url,
    favTeam: r.profile.fav_team, shirt: r.profile.shirt_number,
    summary: calc ? summaryTiles({ pj: calc.st.pj, goals: calc.st.goals, assists: calc.st.assists, presence: calc.att.pct, mvps: pd?.mvpTimes }) : [],
  }), [r, main, calc, pd]);
  const [custom, setCustom] = useState<CustomRow[]>([]);
  const reloadCustom = () => loadCustom(communityId, r.profile.id).then(setCustom).catch(() => setCustom([]));
  useEffect(() => { setCustom([]); reloadCustom(); }, [communityId, r.profile.id]);
  const house = aggregateCustom(custom, r.profile.id, meId);
  const showMine = !!r.mine || house.some(h => h.mine != null);
  const [hist, setHist] = useState<OvrHistory | null>(null);
  const [histErr, setHistErr] = useState('');
  useEffect(() => {
    let alive = true;
    setHist(null); setHistErr('');
    loadOvrHistory(communityId, r.profile.id)
      .then(h => alive && setHist(h))
      .catch(e => alive && setHistErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [communityId, r.profile.id]);
  const [withHouse, setWithHouse] = useState(true);
  const inRadar = radarHouse(house);
  const extra = withHouse ? inRadar.map(h => ({ label: h.label, code: h.code, value: (h.avg ?? h.own)!, compare: h.own })) : [];
  const [beers, setBeers] = useState<number | null>(null);
  useEffect(() => { setBeers(null); loadBeerTotal(communityId, r.profile.id).then(setBeers).catch(() => setBeers(null)); }, [communityId, r.profile.id]);
  const decided = st ? st.won + st.drawn + st.lost : 0;
  return (
    <>
      <div class={`card fut ${tier(r.ovr)}`}>
        <div class="row">
          <Avatar p={r.profile} size={72} />
          <div style="flex:1">
            <h2>{displayName(r.profile)}</h2>
            {r.profile.nickname && <div style="font-size:.85rem;opacity:.8">{r.profile.name}</div>}
            <div>{posLine(r.profile)} · {ROLE[r.role]}{!r.profile.user_id && <span class="nacc">sin cuenta</span>}</div>
            {r.profile.fav_team && <div class="row" style="gap:6px;font-size:.85rem;margin-top:2px"><Crest team={r.profile.fav_team} size={12} /><span style="opacity:.8">Hincha de {r.profile.fav_team}</span></div>}
          </div>
          <div style="text-align:center">
            <div class="big">{r.ovr ?? '—'}</div>
            <div style="font-size:.8rem">OVR</div>
          </div>
        </div>
        <div class="fut-actions">
          <ShareCardButton card={cardData} communityId={communityId} communityName={communityName} />
        </div>
      </div>
      {/* Reclamar es para quien se sumó y ya estaba cargado; owner y admins cargan a los jugadores, no los reclaman */}
      {!r.profile.user_id && r.profile.id !== meId && !isAdmin && (
        <ClaimProfile placeholderId={r.profile.id} meId={meId} name={displayName(r.profile)} />
      )}
      <div class="pl-grid"><div class="pl-main">
      <div class="card">
        {main ? <>
          {inRadar.length > 0 && (
            <div class="seg" role="group" aria-label="Qué mostrar en el gráfico">
              <button class={withHouse ? 'on' : ''} aria-pressed={withHouse} onClick={() => setWithHouse(true)}>Con la casa</button>
              <button class={!withHouse ? 'on' : ''} aria-pressed={!withHouse} onClick={() => setWithHouse(false)}>Solo base</button>
            </div>
          )}
          <Radar stats={main} compare={r.votes ? r.base : null} extra={extra} />
          {withHouse && house.length > inRadar.length && (
            <p class="muted legend" style="margin:0">+{house.length - inRadar.length} de la casa en la tabla</p>
          )}
          <p class="muted legend">
            {r.votes
              ? <><i class="sw a" /> comunidad ({r.nVotes} {r.nVotes === 1 ? 'voto' : 'votos'}){r.base && <> <i class="sw b" /> autoevaluación</>}</>
              : 'Autoevaluación (todavía nadie lo votó)'}
          </p>
          <table class="stats">
            <thead><tr><th></th><th>Comunidad</th><th>Propia</th>{showMine && <th>Tu voto</th>}</tr></thead>
            <tbody>{ATTRS.map(([k, , full]) => (
              <tr><td>{full}</td><td>{r.votes?.[k] ?? '—'}</td><td>{r.base?.[k] ?? '—'}</td>{showMine && <td>{r.mine?.[k] ?? '—'}</td>}</tr>
            ))}</tbody>
            {house.length > 0 && <tbody class="house">
              <tr><th colSpan={showMine ? 4 : 3}>De la casa</th></tr>
              {house.map(h => (
                <tr><td>{h.label}</td>
                  <td title={h.n ? `${h.n} ${h.n === 1 ? 'voto' : 'votos'}` : undefined}>{h.avg ?? '—'}</td>
                  <td>{h.own ?? '—'}</td>{showMine && <td>{h.mine ?? '—'}</td>}</tr>
              ))}
            </tbody>}
          </table>
        </> : <p class="muted">Sin stats todavía.</p>}
      </div>
      <div class="card">
        <h3 style="margin-bottom:12px">Estadísticas</h3>
        {stErr && <p class="err" style="margin:0">No pudimos cargar las estadísticas. {stErr}</p>}
        {!st && !stErr && <p class="muted">Cargando…</p>}
        {st && <>
          <div class="st-grid c5">
            <div class="st-tile"><b>{st.pj}</b><span>PJ</span></div>
            <div class="st-tile"><b>{st.goals}</b><span>Goles</span></div>
            <div class="st-tile"><b>{st.assists}</b><span>Asist.</span></div>
            <div class="st-tile"><b>{st.yellow}</b><span class="em" aria-label="Amarillas">🟨</span></div>
            <div class="st-tile"><b>{st.red}</b><span class="em" aria-label="Rojas">🟥</span></div>
          </div>
          {st.pj > 0 && (
            <div class="st-grid c4">
              <div class="st-tile"><b>{decided ? st.won : '—'}</b><span>Ganados</span></div>
              <div class="st-tile"><b>{decided ? st.drawn : '—'}</b><span>Empat.</span></div>
              <div class="st-tile"><b>{decided ? st.lost : '—'}</b><span>Perdidos</span></div>
              <div class="st-tile"><b>{fmtAvg(perMatch(st.goals, st.pj))}</b><span>Goles/PJ</span></div>
            </div>
          )}
          {beers != null && beers > 0 && (
            <p class="beer-line">🍺 <b>{beers}</b> {beers === 1 ? 'cerveza' : 'cervezas'} en el tercer tiempo
              {st.pj > 0 && <span class="muted"> · {fmtAvg(perMatch(beers, st.pj))} por partido</span>}</p>
          )}
          {st.pj > 0 && decided < st.pj && (
            <p class="muted st-note">Ganados, empatados y perdidos cuentan solo los partidos con equipos y resultado cargados.</p>
          )}
          {st.pj === 0 && <p class="muted st-note">Todavía no jugó partidos en esta comunidad.</p>}
        </>}
      </div>
      <PresenceCard att={calc?.att ?? null} susp={pd?.suspensions ?? null} />
      <AchievementsCard list={calc?.ach ?? null} />
      </div><div class="pl-side">
      <SuspensionNotice pid={r.profile.id} communityId={communityId} isAdmin={isAdmin} />
      <CustomStats pid={r.profile.id} rows={rows} meId={meId} communityId={communityId} isAdmin={isAdmin} onChange={reloadCustom} />
      <MatchHistory pid={r.profile.id} slug={slug} communityId={communityId} />
      <DuosCard duos={calc?.duos ?? null} rows={rows} slug={slug} mine={r.profile.id === meId} />
      <div class="card">
        <h3 style="margin-bottom:12px">Evolución</h3>
        {histErr && <p class="err" style="margin:0">No pudimos cargar la evolución. {histErr}</p>}
        {!hist && !histErr && <p class="muted">Cargando…</p>}
        {hist && !hist.available && <p class="muted">El historial de OVR todavía no está disponible.</p>}
        {hist?.available && hist.points.length === 0 && (
          <p class="muted">Todavía no hay evolución para mostrar: se arma a medida que lo votan.</p>
        )}
        {hist?.available && hist.points.length === 1 && (
          <p class="muted">
            Arrancó con OVR <b>{hist.points[0].ovr}</b> el {fmtDay(hist.points[0].day)}. Con un solo día todavía no hay línea: aparece cuando cambie su OVR.
          </p>
        )}
        {hist?.available && hist.points.length > 1 && <OvrChart points={hist.points} />}
      </div>
      {r.profile.id !== meId && (
        <a class="btn primary block" href={`#/c/${slug}/votar/${r.profile.id}`}>{r.mine ? 'Cambiar mi voto' : 'Votarlo'}</a>
      )}
      </div></div>
    </>
  );
}
