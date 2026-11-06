import { useEffect, useMemo, useState } from 'preact/hooks';
import { displayName, infoLine } from '../lib/supabase';
import { ovr, tier, type Ranked } from '../lib/ranking';
import { lineup } from '../lib/formation';
import { Pitch, type PitchPlayer } from '../lib/Pitch';
import { Avatar } from '../lib/Avatar';
import { Crest } from '../lib/Crest';
import { fmtAvg, leaderboard, loadCommunityStats, perMatch, type PlayerStats } from '../lib/stats';
import '../stats.css';

type View = 'ovr' | 'goals' | 'assists';
const VIEWS: [View, string][] = [['ovr', 'OVR'], ['goals', 'Goleadores'], ['assists', 'Asistencias']];

/** Tabla de la comunidad: por OVR (promedio de votos), goleadores o asistencias. */
export function Ranking({ rows, slug, meId, communityId }: { rows: Ranked[]; slug: string; meId: string; communityId: string }) {
  const [view, setView] = useState<View>('ovr');
  const [stats, setStats] = useState<Map<string, PlayerStats> | null>(null);
  const [statsErr, setStatsErr] = useState('');
  const [tries, setTries] = useState(0);
  const pending = rows.filter(r => r.profile.id !== meId && !r.mine).length;

  // Las estadísticas se piden la primera vez que se abre Goleadores o Asistencias.
  useEffect(() => {
    if (view === 'ovr' || stats) return;
    let alive = true;
    setStatsErr('');
    loadCommunityStats(communityId)
      .then(s => alive && setStats(s))
      .catch(e => alive && setStatsErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [view, communityId, tries]);

  const byId = useMemo(() => new Map(rows.map(r => [r.profile.id, r])), [rows]);
  const board = useMemo(
    () => stats && view !== 'ovr' ? leaderboard(rows.map(r => ({ id: r.profile.id, name: displayName(r.profile) })), stats, view) : [],
    [rows, stats, view]);

  // Formación ideal: OVR de la comunidad, o la autoevaluación si todavía no lo votaron
  const ideal = useMemo(() => lineup<PitchPlayer>(rows.map(r => ({
    id: r.profile.id, pos: r.profile.pos, profile: r.profile, ovr: r.ovr ?? (r.base ? ovr(r.base) : null),
  }))), [rows]);

  return (
    <>
      <div class="st-seg c3 sm" role="group" aria-label="Ordenar ranking por">
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
        <div class="card">
          <div class="row" style="justify-content:space-between;margin-bottom:10px">
            <h3>Formación ideal · Fútbol 5</h3><span class="muted">1-2-1</span>
          </div>
          <Pitch placed={ideal.placed} href={id => `#/c/${slug}/p/${id}`} showAlts />
          <p class="muted st-note">El mejor OVR de cada puesto según la posición de su ficha. Debajo, otros que juegan de eso.</p>
        </div>
        <div class="card" style="padding:4px 12px">
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
              <span class={`ovr ${tier(r.ovr)}`}>{r.ovr ?? '—'}</span>
            </a>
          ))}
        </div>
      </>}

      {view !== 'ovr' && (
        <div class="card" style="padding:4px 12px">
          {statsErr && (
            <div class="st-empty">
              <p class="err" style="margin:0 0 12px">No pudimos cargar las estadísticas. {statsErr}</p>
              <button class="btn" onClick={() => setTries(tries + 1)}>Reintentar</button>
            </div>
          )}
          {!stats && !statsErr && <p class="muted st-empty">Cargando…</p>}
          {stats && !board.length && (
            <p class="muted st-empty">
              {view === 'goals' ? 'Todavía no hay goles cargados.' : 'Todavía no hay asistencias cargadas.'}
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
                    {b.pj} {b.pj === 1 ? 'partido' : 'partidos'}{b.pj > 0 && <> · {fmtAvg(perMatch(b.value, b.pj))} por partido</>}
                  </div>
                </div>
                <span class="st-val">{b.value}</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
