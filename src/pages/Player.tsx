import { useEffect, useState } from 'preact/hooks';
import { ATTRS, displayName, posLine } from '../lib/supabase';
import { Radar } from '../lib/Radar';
import { Avatar } from '../lib/Avatar';
import { Crest } from '../lib/Crest';
import { tier, type Ranked } from '../lib/ranking';
import { fmtAvg, loadPlayerStats, perMatch, type PlayerStats } from '../lib/stats';
import { CustomStats, MatchHistory, SuspensionNotice } from './PlayerExtras';
import { aggregateCustom, loadCustom, radarHouse, type CustomRow } from '../lib/customStats';
import { fmtDay, loadOvrHistory, type OvrHistory } from '../lib/history';
import { OvrChart } from '../lib/OvrChart';
import '../stats.css';
import '../history.css';

const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };

/** Perfil de un jugador dentro de la comunidad. */
export function Player({ r, rows, slug, meId, communityId, isAdmin }:
  { r: Ranked; rows: Ranked[]; slug: string; meId: string; communityId: string; isAdmin: boolean }) {
  const main = r.votes ?? r.base;
  const [st, setSt] = useState<PlayerStats | null>(null);
  const [stErr, setStErr] = useState('');
  useEffect(() => {
    let alive = true;
    setSt(null); setStErr('');
    loadPlayerStats(communityId, r.profile.id)
      .then(s => alive && setSt(s))
      .catch(e => alive && setStErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [communityId, r.profile.id]);
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
  const decided = st ? st.won + st.drawn + st.lost : 0;
  return (
    <>
      <div class={`card fut ${tier(r.ovr)}`}>
        <div class="row">
          <Avatar p={r.profile} size={72} />
          <div style="flex:1">
            <h2>{displayName(r.profile)}</h2>
            {r.profile.nickname && <div style="font-size:.85rem;opacity:.8">{r.profile.name}</div>}
            <div>{posLine(r.profile)} · {ROLE[r.role]}</div>
            {r.profile.fav_team && <div class="row" style="gap:6px;font-size:.85rem;margin-top:2px"><Crest team={r.profile.fav_team} size={12} /><span style="opacity:.8">Hincha de {r.profile.fav_team}</span></div>}
          </div>
          <div style="text-align:center">
            <div class="big">{r.ovr ?? '—'}</div>
            <div style="font-size:.8rem">OVR</div>
          </div>
        </div>
      </div>
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
          {st.pj > 0 && decided < st.pj && (
            <p class="muted st-note">Ganados, empatados y perdidos cuentan solo los partidos con equipos y resultado cargados.</p>
          )}
          {st.pj === 0 && <p class="muted st-note">Todavía no jugó partidos en esta comunidad.</p>}
        </>}
      </div>
      </div><div class="pl-side">
      <SuspensionNotice pid={r.profile.id} communityId={communityId} isAdmin={isAdmin} />
      <CustomStats pid={r.profile.id} rows={rows} meId={meId} communityId={communityId} isAdmin={isAdmin} onChange={reloadCustom} />
      <MatchHistory pid={r.profile.id} slug={slug} communityId={communityId} />
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
