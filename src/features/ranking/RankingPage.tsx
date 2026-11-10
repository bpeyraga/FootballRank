import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Tip } from '../../shared/ui/Tip';
import { ATTRS, displayName, infoLine } from '../../shared/supabase';
import { tier, type Ranked } from './ranking';
import { Avatar } from '../../shared/ui/Avatar';
import { Crest } from '../../shared/ui/Crest';
import { disciplineBoard, emptyStats, fmtAvg, leaderboard, perMatch, statsInRange, type StatsData } from '../stats/statsCore';
import { loadAttendanceData, loadMvpWins, loadStatsData } from '../stats/api';
import { mvpBoard, mvpTimes, presenceBoard } from './boards';
import { ChampionsCard } from '../seasons/ChampionsCard';
import { SeasonPicker } from '../seasons/SeasonPicker';
import { useSeasons } from '../seasons/useSeasons';
import { ALL, rangeFor, resolveKey } from '../seasons/model';
import '../player/stats.css';

type View = 'ovr' | 'goals' | 'assists' | 'cards' | 'mvp' | 'presence';
const VIEWS: [View, string][] = [
  ['ovr', 'OVR'], ['goals', 'Goleadores'], ['assists', 'Asistencias'], ['cards', 'Tarjetas y faltas'], ['mvp', 'Figura'], ['presence', 'Presentismo'],
];
type StatView = 'goals' | 'assists' | 'cards';
const isStatView = (v: View): v is StatView => v === 'goals' || v === 'assists' || v === 'cards';
const EMPTY: Record<StatView, string> = {
  goals: 'Todavía no hay goles cargados.', assists: 'Todavía no hay asistencias cargadas.', cards: 'Nadie vio tarjetas ni hizo faltas todavía. 😇',
};
const EMPTY_SEASON: Record<StatView, string> = {
  goals: 'Todavía no hay goles en esta temporada.', assists: 'Todavía no hay asistencias en esta temporada.',
  cards: 'Nadie vio tarjetas ni hizo faltas en esta temporada. 😇',
};

/** Carga algo la primera vez que `on` es true (y reintenta a pedido). */
function useLazy<T>(on: boolean, load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [tries, setTries] = useState(0);
  useEffect(() => { setData(null); setErr(''); }, [key]);
  useEffect(() => {
    if (!on || data) return;
    let alive = true;
    setErr('');
    load().then(d => alive && setData(d)).catch(e => alive && setErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [on, key, tries, !!data]);
  return { data, err, retry: () => setTries(t => t + 1) };
}

/** Estados comunes de las tablas: error con reintento, cargando y vacía. */
function BoardState({ err, retry, loading, empty }: { err: string; retry: () => void; loading: boolean; empty: string | null }) {
  if (err) return (
    <div class="st-empty">
      <p class="err" style="margin:0 0 12px">No pudimos cargar los datos. {err}</p>
      <button class="btn" onClick={retry}>Reintentar</button>
    </div>
  );
  if (loading) return <p class="muted st-empty">Cargando…</p>;
  return empty ? <p class="muted st-empty">{empty}</p> : null;
}

/**
 * Tabla de la comunidad: por OVR (promedio de votos), goleadores, asistencias, tarjetas y faltas, figura o presentismo.
 * Todo lo que sale de partidos se puede ver por temporada (o en el histórico); el OVR sale de los votos y no cambia.
 */
export function Ranking({ rows, slug, meId, communityId }: { rows: Ranked[]; slug: string; meId: string; communityId: string }) {
  const [view, setView] = useState<View>('ovr');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsErr, setStatsErr] = useState('');
  const [tries, setTries] = useState(0);
  const pending = rows.filter(r => r.profile.id !== meId && !r.mine).length;

  // Las estadísticas se piden la primera vez que se abre Goleadores o Asistencias.
  useEffect(() => {
    if (!isStatView(view) || stats) return;
    let alive = true;
    setStatsErr('');
    loadStatsData(communityId)
      .then(s => alive && setStats(s))
      .catch(e => alive && setStatsErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [view, communityId, tries]);

  // Temporada: por defecto la actual (si hay una abierta) o el histórico. Los datos se bajan una vez y se filtran acá.
  const seasonsQ = useSeasons(communityId);
  const seasons = useMemo(() => seasonsQ.data?.seasons ?? [], [seasonsQ.data]);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { setPick(null); }, [communityId]);
  const key = resolveKey(pick, seasons);
  const range = useMemo(() => rangeFor(key, seasons), [key, seasons]);
  const inSeason = key !== ALL;
  // Hasta saber si hay temporada abierta no se dibujan tablas (para no mostrar el histórico un instante).
  const ready = !!seasonsQ.data || !!seasonsQ.err;

  const byId = useMemo(() => new Map(rows.map(r => [r.profile.id, r])), [rows]);
  const statMap = useMemo(() => stats ? statsInRange(stats, range) : null, [stats, range]);
  const s = (id: string) => statMap?.get(id) ?? emptyStats();
  const players = useMemo(() => rows.map(r => ({ id: r.profile.id, name: displayName(r.profile) })), [rows]);
  const board = useMemo(
    () => !statMap || !ready || !isStatView(view) ? [] : view === 'cards' ? disciplineBoard(players, statMap) : leaderboard(players, statMap, view),
    [players, statMap, view, ready]);
  const mvp = useLazy(view === 'mvp', () => loadMvpWins(communityId), communityId);
  const att = useLazy(view === 'presence', () => loadAttendanceData(communityId), communityId);
  const mvpRows = useMemo(() => mvp.data && ready ? mvpBoard(players, mvpTimes(mvp.data, range)) : [], [players, mvp.data, range, ready]);
  const presRows = useMemo(
    () => att.data && ready ? presenceBoard(players, att.data.matches, att.data.signups, att.data.joined, range) : [],
    [players, att.data, range, ready]);
  // En el celular las 6 solapas no entran: el selector se desliza y la elegida queda a la vista
  const segRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    segRef.current?.querySelector<HTMLElement>('button.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [view]);

  return (
    <>
      {seasonsQ.data && <ChampionsCard data={seasonsQ.data} rows={rows} slug={slug} />}
      {seasonsQ.err && !seasonsQ.data && (
        <p class="muted st-note" role="alert">
          No pudimos cargar las temporadas, así que ves el histórico. <button class="btn sm" onClick={seasonsQ.reload}>Reintentar</button>
        </p>
      )}
      <SeasonPicker seasons={seasons} value={key} onPick={setPick} />
      <div class="st-seg rk-seg sm" role="group" aria-label="Ordenar ranking por" ref={segRef}>
        {VIEWS.map(([k, label]) => (
          <button type="button" class={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>

      {view === 'ovr' && <>
        {inSeason && <p class="muted st-note sn-note">El OVR sale de los votos de siempre: no cambia con la temporada.</p>}
        {pending > 0 && (
          <a class="card row note" href={`#/c/${slug}/votar`}>
            <span style="flex:1">Te faltan votar <b>{pending}</b> {pending === 1 ? 'compañero' : 'compañeros'}</span>
            <b>Votar →</b>
          </a>
        )}
        <Tip kind="joke" />
        <div class="card rk-list" style="padding:4px 12px">
          {rows.map((r, i) => (
            <a class="row rank-row" href={`#/c/${slug}/p/${r.profile.id}`}>
              <span class="muted" style="width:1.4em;text-align:right">{r.ovr == null ? '' : i + 1}</span>
              <Avatar p={r.profile} />
              <div style="flex:1;min-width:0">
                <div class="row" style="gap:6px"><span class="ellipsis">{displayName(r.profile)}{r.profile.id === meId && <span class="muted"> (vos)</span>}</span><Crest team={r.profile.fav_team} size={11} /></div>
                <div class="muted ellipsis" style="font-size:.85rem">
                  {infoLine(r.profile)} · {r.nVotes ? `${r.nVotes} ${r.nVotes === 1 ? 'voto' : 'votos'}` : 'sin votos'}
                </div>
              </div>
              <span class="desk-only rk-attrs">
                {(r.votes ?? r.base) && ATTRS.map(([k, l]) => <i><b>{(r.votes ?? r.base)![k]}</b>{l}</i>)}
              </span>
              <span class={`ovr ${tier(r.ovr)}`}>{r.ovr ?? '—'}</span>
            </a>
          ))}
        </div>
      </>}

      {isStatView(view) && (
        <div class="card rk-board" style="padding:4px 12px">
          {statsErr && (
            <div class="st-empty">
              <p class="err" style="margin:0 0 12px">No pudimos cargar las estadísticas. {statsErr}</p>
              <button class="btn" onClick={() => setTries(tries + 1)}>Reintentar</button>
            </div>
          )}
          {(!stats || !ready) && !statsErr && <p class="muted st-empty">Cargando…</p>}
          {stats && ready && !board.length && (
            <p class="muted st-empty">
              {(inSeason ? EMPTY_SEASON : EMPTY)[view]}
              {' '}Se cargan desde cada partido jugado.
            </p>
          )}
          {board.map(b => {
            const r = byId.get(b.id)!;
            return (
              <a class="row rank-row" href={`#/c/${slug}/p/${b.id}`}>
                <span class="muted" style="width:1.4em;text-align:right">{b.pos}</span>
                <Avatar p={r.profile} />
                <div style="flex:1;min-width:0">
                  <div class="ellipsis">{b.name}{b.id === meId && <span class="muted"> (vos)</span>}</div>
                  <div class="muted" style="font-size:.85rem">
                    {b.pj} {b.pj === 1 ? 'partido' : 'partidos'}
                    {view !== 'cards' && b.pj > 0 && <> · {fmtAvg(perMatch(b.value, b.pj))} por partido</>}
                  </div>
                </div>
                {view === 'cards'
                  ? <span class="st-val rk-cards">
                      {s(b.id).yellow > 0 && <span title="Amarillas">🟨 {s(b.id).yellow}</span>}
                      {s(b.id).red > 0 && <span title="Rojas">🟥 {s(b.id).red}</span>}
                      {s(b.id).fouls > 0 && <span title="Faltas">🦵 {s(b.id).fouls}</span>}
                    </span>
                  : <span class="st-val">{b.value}</span>}
              </a>
            );
          })}
        </div>
      )}

      {view === 'mvp' && (
        <div class="card rk-board" style="padding:4px 12px">
          <BoardState err={mvp.err} retry={mvp.retry} loading={!mvp.data || !ready}
            empty={mvp.data && ready && !mvpRows.length
              ? (inSeason ? 'Todavía nadie fue figura en esta temporada. Se vota después de cada partido jugado.' : 'Todavía nadie fue figura del partido. Se vota después de cada partido jugado.')
              : null} />
          {mvpRows.map(b => {
            const r = byId.get(b.id)!;
            return (
              <a class="row rank-row" href={`#/c/${slug}/p/${b.id}`}>
                <span class="muted" style="width:1.4em;text-align:right">{b.pos}</span>
                <Avatar p={r.profile} />
                <div style="flex:1;min-width:0">
                  <div class="ellipsis">{b.name}{b.id === meId && <span class="muted"> (vos)</span>}</div>
                  <div class="muted" style="font-size:.85rem">Figura {b.value === 1 ? '1 vez' : `${b.value} veces`}</div>
                </div>
                <span class="st-val rk-trophy" title="Veces figura del partido"><span aria-hidden="true">🏆</span> {b.value}</span>
              </a>
            );
          })}
          {mvpRows.length > 0 && <p class="muted st-note rk-note">La figura se vota al final de cada partido. Si hay empate de votos, lo son todos los que empatan.</p>}
        </div>
      )}

      {view === 'presence' && (
        <div class="card rk-board" style="padding:4px 12px">
          <BoardState err={att.err} retry={att.retry} loading={!att.data || !ready}
            empty={att.data && ready && !presRows.length
              ? (inSeason ? 'Todavía no hay partidos jugados en esta temporada.' : 'Todavía no hay partidos jugados para medir la asistencia.')
              : null} />
          {presRows.map(b => {
            const r = byId.get(b.id)!;
            return (
              <a class="row rank-row" href={`#/c/${slug}/p/${b.id}`}>
                <span class="muted" style="width:1.4em;text-align:right">{b.pos}</span>
                <Avatar p={r.profile} />
                <div style="flex:1;min-width:0">
                  <div class="ellipsis">{b.name}{b.id === meId && <span class="muted"> (vos)</span>}</div>
                  <div class="muted" style="font-size:.85rem">
                    {b.played} de {b.total} {b.total === 1 ? 'partido' : 'partidos'}
                    {b.streak > 1 && <> · racha de {b.streak}</>}
                    {b.absences > 0 && <> · {b.absences} {b.absences === 1 ? 'falta' : 'faltas'}</>}
                  </div>
                </div>
                <span class="st-val">{b.pct}%</span>
              </a>
            );
          })}
          {presRows.length > 0 && <p class="muted st-note rk-note">Partidos jugados sobre los de la comunidad desde que cada uno se sumó. Anotarse y no ir cuenta como falta.</p>}
        </div>
      )}
    </>
  );
}
