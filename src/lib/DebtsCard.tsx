import { displayName, type Profile } from './model';
import { Avatar } from './Avatar';
import { money, owedText, type Debt } from './fees';

type Who = Pick<Profile, 'id' | 'name' | 'nickname' | 'photo_url'>;
const day = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * "💸 Deudas": lo que falta pagar de la cancha en partidos jugados. Los admins ven lo de todos;
 * cada miembro ve solo lo suyo ("Debés $X en n partidos"), con link a cada partido para marcar "Ya pagué".
 */
export function DebtsCard({ debts, meId, isAdmin, slug, whoIs }: {
  debts: Debt[]; meId: string; isAdmin: boolean; slug: string; whoIs: (pid: string) => Who | undefined;
}) {
  const shown = isAdmin ? debts : debts.filter(d => d.profile_id === meId);
  if (!shown.length) return null;

  const items = (d: Debt) => d.items.map(i => (
    <a class="debt-item" href={`#/c/${slug}/m/${i.match_id}`}>
      <span class="ellipsis">{i.title} <span class="muted">· {day(i.starts_at)}</span></span>
      <b>{money(i.amount)}</b>
    </a>
  ));

  if (!isAdmin) {
    const d = shown[0];
    return (
      <details class="card debt-card" open={d.items.length <= 4}>
        <summary><span>💸 <b>Debés {owedText(d)}</b></span></summary>
        <p class="muted debt-help">De la cancha. Entrá a cada partido y tocá "Ya pagué" cuando lo transfieras.</p>
        <div class="debt-items">{items(d)}</div>
      </details>
    );
  }

  const total = shown.reduce((t, d) => t + d.total, 0);
  return (
    <details class="card debt-card">
      <summary><span>💸 <b>Deudas de la cancha</b> <span class="muted">· {money(total)} en {shown.length} {shown.length === 1 ? 'persona' : 'personas'}</span></span></summary>
      {shown.map(d => {
        const w = whoIs(d.profile_id), mine = d.profile_id === meId;
        return (
          <details class="debt-person">
            <summary>
              {w ? <Avatar p={w} size={30} /> : <span class="avatar" style="width:30px;height:30px;font-size:12px;flex:none">?</span>}
              <span class="ellipsis debt-who">{w ? displayName(w) : 'Jugador'}{mine && <span class="muted"> (vos)</span>}
                <small class="muted"> · {d.items.length} {d.items.length === 1 ? 'partido' : 'partidos'}</small></span>
              <b class="debt-amt">{money(d.total)}</b>
            </summary>
            <div class="debt-items">{items(d)}</div>
          </details>
        );
      })}
    </details>
  );
}
