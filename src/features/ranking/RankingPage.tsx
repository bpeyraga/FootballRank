import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Tip } from '../../shared/ui/Tip';
import { ATTRS, displayName, infoLine } from '../../shared/supabase';
import { tier, type Ranked } from './ranking';
import { Avatar } from '../../shared/ui/Avatar';
import { Crest } from '../../shared/ui/Crest';
import { disciplineBoard, emptyStats, fmtAvg, leaderboard, perMatch, type PlayerStats } from '../stats/statsCore';
import { loadAttendanceData, loadCommunityStats, loadMvps } from '../stats/api';
import { mvpBoard, presenceBoard } from './boards';
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

/** Tabla de la comunidad: por OVR (promedio de votos), goleadores, asistencias, tarjetas y faltas, figura o presentismo. */
export function Ranking({ rows, slug, meId, communityId }: { rows: Ranked[]; slug: string; meId: string; communityId: string }) {
  const [view, setView] = useState<View>('ovr');
  const [stats, setStats] = useState<Map<string, PlayerStats> | null>(null);
  const [statsErr, setStatsErr] = useState('');
  const [tries, setTries] = useState(0);
  const pending = rows.filter(r => r.profile.id !== meId && !r.mine).length;

  // Las estadísticas se piden la primera vez que se abre Goleadores o Asistencias.
  useEffect(() => {
    if (!isStatView(view) || stats) return;
    let alive = true;
    setStatsErr('');
    loadCommunityStats(communityId)
      .then(s => alive && setStats(s))
      .catch(e => alive && setStatsErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [view, communityId, tries]);

  const byId = useMemo(() => new Map(rows.map(r => [r.profile.id, r])), [rows]);
  const s = (id: string) => stats?.get(id) ?? emptyStats();
  const players = useMemo(() => rows.map(r => ({ id: r.profile.id, name: displayName(r.profile) })), [rows]);
  const board = useMemo(
    () => !stats || !isStatView(view) ? [] : view === 'cards' ? disciplineBoard(players, stats) : leaderboard(players, stats, view),
    [players, stats, view]);
  const mvp = useLazy(view === 'mvp', () => loadMvps(communityId), communityId);
  const att = useLazy(view === 'presence', () => loadAttendanceData(communityId), communityId);
  const mvpRows = useMemo(() => mvp.data ? mvpBoard(players, mvp.data) : [], [players, mvp.data]);
  const presRows = useMemo(
    () => att.data ? presenceBoard(players, att.data.matches, att.data.signups, att.data.joined) : [],
    [players, att.data]);
  // En el celular las 6 solapas no entran: el selector se desliza y la elegida queda a la vista
  const segRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    segRef.current?.querySelector<HTMLElement>('button.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [view]);

  return (
    <>
      <div class="st-seg rk-seg sm" role="group" aria-label="Ordenar ranking por" ref={segRef}>
        {VIEWS.map(([k, label]) => (
          <button type="button" class={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>

      {view === 'ovr' && <>
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
          {!stats && !statsErr && <p class="muted st-empty">Cargando…</p>}
          {stats && !board.length && (
            <p class="muted st-empty">
              {EMPTY[view]}
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
          <BoardState err={mvp.err} retry={mvp.retry} loading={!mvp.data}
            empty={mvp.data && !mvpRows.length ? 'Todavía nadie fue figura del partido. Se vota después de cada partido jugado.' : null} />
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
          <BoardState err={att.err} retry={att.retry} loading={!att.data}
            empty={att.data && !presRows.length ? 'Todavía no hay partidos jugados para medir la asistencia.' : null} />
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
