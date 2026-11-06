import { Avatar } from '../../shared/ui/Avatar';
import { KIND_ICON, KIND_LABEL, type EventKind, type MatchEvent } from '../stats/statsCore';
import { MAX_COUNT, countsOf, eventCounts, type CountsMap } from './quickMatch';
import './quickmatch.css';

export interface EvPlayer {
  id: string; name: string; team: 'A' | 'B' | null;
  profile: { name: string; photo_url: string | null; nickname?: string | null };
}
export type OnStep = (id: string, kind: EventKind, dir: 1 | -1) => void;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

/** Cuadro numérico con − y +: goles y asistencias. */
function Step({ kind, n, who, onStep }: { kind: 'goal' | 'assist'; n: number; who: string; onStep: (dir: 1 | -1) => void }) {
  const label = KIND_LABEL[kind].toLowerCase();
  return (
    <div class="qm-step">
      <button type="button" class="qm-b" disabled={n <= 0} aria-label={`Quitar ${label} a ${who}`} onClick={() => onStep(-1)}>−</button>
      <span class={`qm-n ${n ? '' : 'z'}`} aria-label={`${KIND_LABEL[kind]}: ${n}`}>
        <i aria-hidden="true">{KIND_ICON[kind]}</i><b>{n}</b>
      </span>
      <button type="button" class="qm-b" disabled={n >= MAX_COUNT[kind]} aria-label={`Sumar ${label} a ${who}`} onClick={() => onStep(1)}>+</button>
    </div>
  );
}

/** Tarjeta: un toque suma; al llegar al tope, el siguiente la saca (amarilla 0 → 1 → 2 → 0). */
function Card({ kind, n, who, onStep }: { kind: 'yellow' | 'red'; n: number; who: string; onStep: (dir: 1 | -1) => void }) {
  const full = n >= MAX_COUNT[kind];
  const tap = () => { if (!full) onStep(1); else for (let i = 0; i < n; i++) onStep(-1); };
  return (
    <button type="button" class={`qm-card ${n ? 'on' : ''}`} aria-pressed={n > 0} onClick={tap}
      aria-label={`${KIND_LABEL[kind]} de ${who}: ${n ? n : 'no'}. ${full ? 'Tocá para sacarla' : 'Tocá para sumar'}`}>
      <span aria-hidden="true">{KIND_ICON[kind]}</span>
      {n > 1 && <sup aria-hidden="true">{n}</sup>}
    </button>
  );
}

/**
 * Una fila por jugador con − / + de goles y asistencias y toque para amarilla y roja.
 * Agrupa por equipo (A, B, sin equipo) cuando hay equipos.
 */
export function EventRows({ players, counts, onStep }: { players: EvPlayer[]; counts: CountsMap; onStep: OnStep }) {
  const hasTeams = players.some(p => p.team);
  const groups: { key: 'A' | 'B' | 'none'; ps: EvPlayer[] }[] = hasTeams
    ? [{ key: 'A', ps: players.filter(p => p.team === 'A') }, { key: 'B', ps: players.filter(p => p.team === 'B') },
       { key: 'none', ps: players.filter(p => !p.team) }]
    : [{ key: 'none', ps: players }];
  return (
    <div class="qm-evlist">
      {groups.filter(g => g.ps.length).map(g => {
        const goals = g.ps.reduce((t, p) => t + countsOf(counts, p.id).goal, 0);
        return (
          <div class={`qm-grp ${hasTeams ? g.key : ''}`}>
            {hasTeams && (
              <div class="qm-gh">
                <b class={g.key === 'A' ? 'ta' : g.key === 'B' ? 'tb' : 'muted'}>{g.key === 'none' ? 'Sin equipo' : `Equipo ${g.key}`}</b>
                <span class="muted">{KIND_ICON.goal} {goals}</span>
              </div>
            )}
            {[...g.ps].sort(byName).map(p => {
              const c = countsOf(counts, p.id), step = (kind: EventKind) => (dir: 1 | -1) => onStep(p.id, kind, dir);
              return (
                <div class="qm-ev">
                  <div class="qm-evwho"><Avatar p={p.profile} size={28} /><span class="ellipsis">{p.name}</span></div>
                  <div class="qm-evctl">
                    <Step kind="goal" n={c.goal} who={p.name} onStep={step('goal')} />
                    <Step kind="assist" n={c.assist} who={p.name} onStep={step('assist')} />
                    <Card kind="yellow" n={c.yellow} who={p.name} onStep={step('yellow')} />
                    <Card kind="red" n={c.red} who={p.name} onStep={step('red')} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Resumen de solo lectura: por equipo, quién hizo goles, asistencias y tarjetas. */
export function EventSummary({ events, nameOf, teamOf }:
  { events: Pick<MatchEvent, 'profile_id' | 'kind'>[]; nameOf: (id: string) => string; teamOf: (id: string) => 'A' | 'B' | null }) {
  const counts = eventCounts(events);
  const rows = Object.keys(counts).map(id => ({ id, name: nameOf(id), team: teamOf(id), c: counts[id] }));
  const hasTeams = rows.some(r => r.team);
  const groups: { key: 'A' | 'B' | 'none'; rs: typeof rows }[] = hasTeams
    ? [{ key: 'A', rs: rows.filter(r => r.team === 'A') }, { key: 'B', rs: rows.filter(r => r.team === 'B') }, { key: 'none', rs: rows.filter(r => !r.team) }]
    : [{ key: 'none', rs: rows }];
  const order = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b.c.goal - a.c.goal || b.c.assist - a.c.assist || byName(a, b);
  return (
    <div class="qm-evlist">
      {groups.filter(g => g.rs.length).map(g => (
        <div class={`qm-grp ${hasTeams ? g.key : ''}`}>
          {hasTeams && <div class="qm-gh"><b class={g.key === 'A' ? 'ta' : g.key === 'B' ? 'tb' : 'muted'}>{g.key === 'none' ? 'Sin equipo' : `Equipo ${g.key}`}</b></div>}
          {[...g.rs].sort(order).map(r => (
            <div class="qm-sum">
              <span class="ellipsis qm-sum-name">{r.name}</span>
              {r.c.goal > 0 && <span class="qm-chip" title={KIND_LABEL.goal}>{KIND_ICON.goal} {r.c.goal}</span>}
              {r.c.assist > 0 && <span class="qm-chip" title={KIND_LABEL.assist}>{KIND_ICON.assist} {r.c.assist}</span>}
              {r.c.yellow > 0 && <span class="qm-chip" title={KIND_LABEL.yellow}>{KIND_ICON.yellow}{r.c.yellow > 1 ? ` ${r.c.yellow}` : ''}</span>}
              {r.c.red > 0 && <span class="qm-chip" title={KIND_LABEL.red}>{KIND_ICON.red}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
