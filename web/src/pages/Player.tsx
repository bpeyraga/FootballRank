import { ATTRS } from '../lib/supabase';
import { Radar } from '../lib/Radar';
import { Avatar } from '../lib/Avatar';
import { tier, type Ranked } from '../lib/ranking';

const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };

/** Perfil de un jugador dentro de la comunidad. */
export function Player({ r, slug, meId }: { r: Ranked; slug: string; meId: string }) {
  const main = r.votes ?? r.base;
  return (
    <>
      <div class={`card fut ${tier(r.ovr)}`}>
        <div class="row">
          <Avatar p={r.profile} size={72} />
          <div style="flex:1">
            <h2>{r.profile.name}</h2>
            <div>{r.profile.pos} · {ROLE[r.role]}</div>
          </div>
          <div style="text-align:center">
            <div class="big">{r.ovr ?? '—'}</div>
            <div style="font-size:.8rem">OVR</div>
          </div>
        </div>
      </div>
      <div class="card">
        {main ? <>
          <Radar stats={main} compare={r.votes ? r.base : null} />
          <p class="muted legend">
            {r.votes
              ? <><i class="sw a" /> comunidad ({r.nVotes} {r.nVotes === 1 ? 'voto' : 'votos'}){r.base && <> <i class="sw b" /> autoevaluación</>}</>
              : 'Autoevaluación (todavía nadie lo votó)'}
          </p>
          <table class="stats">
            <thead><tr><th></th><th>Comunidad</th><th>Propia</th>{r.mine && <th>Tu voto</th>}</tr></thead>
            <tbody>{ATTRS.map(([k, , full]) => (
              <tr><td>{full}</td><td>{r.votes?.[k] ?? '—'}</td><td>{r.base?.[k] ?? '—'}</td>{r.mine && <td>{r.mine[k]}</td>}</tr>
            ))}</tbody>
          </table>
        </> : <p class="muted">Sin stats todavía.</p>}
      </div>
      {r.profile.id !== meId && (
        <a class="btn primary block" href={`#/c/${slug}/votar/${r.profile.id}`}>{r.mine ? 'Cambiar mi voto' : 'Votarlo'}</a>
      )}
    </>
  );
}
