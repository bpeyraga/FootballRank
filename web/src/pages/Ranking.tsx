import { tier, type Ranked } from '../lib/ranking';
import { Avatar } from '../lib/Avatar';

/** Tabla de la comunidad ordenada por OVR (promedio de votos). */
export function Ranking({ rows, slug, meId }: { rows: Ranked[]; slug: string; meId: string }) {
  const pending = rows.filter(r => r.profile.id !== meId && !r.mine).length;
  return (
    <>
      {pending > 0 && (
        <a class="card row note" href={`#/c/${slug}/votar`}>
          <span style="flex:1">Te faltan votar <b>{pending}</b> {pending === 1 ? 'compañero' : 'compañeros'}</span>
          <b>Votar →</b>
        </a>
      )}
      <div class="card" style="padding:4px 12px">
        {rows.map((r, i) => (
          <a class="row rank-row" href={`#/c/${slug}/p/${r.profile.id}`}>
            <span class="muted" style="width:1.4em;text-align:right">{r.ovr == null ? '' : i + 1}</span>
            <Avatar p={r.profile} />
            <div style="flex:1;min-width:0">
              <div class="ellipsis">{r.profile.name}{r.profile.id === meId && <span class="muted"> (vos)</span>}</div>
              <div class="muted" style="font-size:.85rem">
                {r.profile.pos} · {r.nVotes ? `${r.nVotes} ${r.nVotes === 1 ? 'voto' : 'votos'}` : 'sin votos'}
              </div>
            </div>
            <span class={`ovr ${tier(r.ovr)}`}>{r.ovr ?? '—'}</span>
          </a>
        ))}
      </div>
    </>
  );
}
