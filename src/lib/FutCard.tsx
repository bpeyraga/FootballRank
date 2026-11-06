import { ATTRS, ovr, type Profile, type Stats } from './model';
import { Avatar } from './Avatar';

const tierOf = (o: number | null) => o == null ? 'none' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';

/** Carta de jugador estilo FIFA: OVR, posición, foto, nombre y las 6 stats. */
export function FutCard({ p, stats, size = 'md' }:
  { p: Pick<Profile, 'name' | 'photo_url' | 'pos'>; stats: Stats | null; size?: 'sm' | 'md' }) {
  const o = stats ? ovr(stats) : null;
  return (
    <div class={`futcard ${tierOf(o)} ${size}`} role="img"
      aria-label={`${p.name}, ${p.pos}, OVR ${o ?? 'sin datos'}`}>
      <div class="fc-top"><b>{o ?? '—'}</b><span>{p.pos}</span></div>
      <div class="fc-photo"><Avatar p={p} size={size === 'sm' ? 52 : 84} /></div>
      <div class="fc-name ellipsis">{p.name}</div>
      <div class="fc-stats">
        {ATTRS.map(([k, l]) => <span><b>{stats ? stats[k] : '—'}</b> {l}</span>)}
      </div>
    </div>
  );
}
