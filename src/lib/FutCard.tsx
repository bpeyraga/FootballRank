import { ATTRS, displayName, ovr, type Profile, type Stats } from './model';
import { Avatar } from './Avatar';
import { Crest } from './Crest';

const tierOf = (o: number | null) => o == null ? 'none' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';

/** Carta de jugador estilo FIFA: OVR, posición, foto, nombre y las 6 stats. */
export function FutCard({ p, stats, size = 'md' }:
  { p: Pick<Profile, 'name' | 'photo_url' | 'pos'> & Partial<Pick<Profile, 'nickname' | 'shirt_number' | 'fav_team'>>; stats: Stats | null; size?: 'sm' | 'md' }) {
  const o = stats ? ovr(stats) : null;
  return (
    <div class={`futcard ${tierOf(o)} ${size}`} role="img"
      aria-label={`${displayName(p)}, ${p.pos}, OVR ${o ?? 'sin datos'}`}>
      <div class="fc-top"><b>{o ?? '—'}</b><span>{p.pos}</span>{p.shirt_number && <span>#{p.shirt_number}</span>}<Crest team={p.fav_team} size={size === 'sm' ? 14 : 20} /></div>
      <div class="fc-photo"><Avatar p={p} size={size === 'sm' ? 52 : 84} /></div>
      <div class="fc-name ellipsis">{displayName(p)}</div>
      <div class="fc-stats">
        {ATTRS.map(([k, l]) => <span><b>{stats ? stats[k] : '—'}</b> {l}</span>)}
      </div>
    </div>
  );
}
