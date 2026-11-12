import { useState } from 'preact/hooks';
import { displayName, type Profile } from '../../shared/model';
import { Avatar } from '../../shared/ui/Avatar';
import type { Team } from './model';

export interface MTPlayer { id: string; profile: Profile; pos: Profile['pos']; ovr: number; gk: number | null }

/** Armar los equipos a mano: a cada anotado se le toca A o B (tocar el mismo otra vez lo deja sin equipo). */
export function ManualTeams({ players, initial, busy, onSave, onCancel }: {
  players: MTPlayer[]; initial: Record<string, Team | null>; busy: boolean;
  onSave: (a: string[], b: string[]) => void; onCancel: () => void;
}) {
  const [team, setTeam] = useState<Record<string, Team | null>>(initial);
  const of = (t: Team) => players.filter(p => team[p.id] === t);
  const avg = (ps: MTPlayer[]) => (ps.length ? Math.round(ps.reduce((s, p) => s + p.ovr, 0) / ps.length) : 0);
  const bestGk = (ps: MTPlayer[]) => Math.max(-1, ...ps.map(p => p.gk ?? -1));
  const A = of('A'), B = of('B');
  const missing = players.length - A.length - B.length;
  const ready = missing === 0 && A.length > 0 && B.length > 0;
  const set = (id: string, t: Team) => setTeam({ ...team, [id]: team[id] === t ? null : t });

  return (
    <div class="card">
      <h3>Armar equipos a mano</h3>
      <div class="mt-head">
        {([['A', A], ['B', B]] as const).map(([t, ps]) => (
          <div class={t}>
            <b>Equipo {t}</b>
            {ps.length} {ps.length === 1 ? 'jugador' : 'jugadores'} · OVR {avg(ps)}
            {bestGk(ps) >= 0 && <> · 🧤 {bestGk(ps)}</>}
          </div>
        ))}
      </div>
      {players.map(p => (
        <div class="mt-row">
          <Avatar p={p.profile} size={32} />
          <span class="mt-name ellipsis">{displayName(p.profile)} <span class="muted">· {p.pos} {p.ovr}{p.gk != null && ` · 🧤 ${p.gk}`}</span></span>
          <span class="mt-seg" role="group" aria-label={`Equipo de ${displayName(p.profile)}`}>
            {(['A', 'B'] as const).map(t => (
              <button type="button" class={`${t}${team[p.id] === t ? ' on' : ''}`} aria-pressed={team[p.id] === t} onClick={() => set(p.id, t)}>{t}</button>
            ))}
          </span>
        </div>
      ))}
      {missing > 0 && <p class="muted" style="margin-top:10px">Faltan {missing} {missing === 1 ? 'jugador' : 'jugadores'} por ubicar.</p>}
      {missing === 0 && (!A.length || !B.length) && <p class="muted" style="margin-top:10px">Los dos equipos tienen que tener al menos un jugador.</p>}
      <div class="row" style="margin-top:12px">
        <button type="button" class="btn primary" style="flex:1" disabled={busy || !ready} onClick={() => onSave(A.map(p => p.id), B.map(p => p.id))}>Guardar equipos</button>
        <button type="button" class="btn" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
