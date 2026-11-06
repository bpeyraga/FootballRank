import { displayName, type Profile } from './model';

export function Avatar({ p, size = 40 }: { p: Pick<Profile, 'name' | 'photo_url'> & { nickname?: string | null }; size?: number }) {
  const style = `width:${size}px;height:${size}px;font-size:${size * 0.4}px;flex:none`;
  return p.photo_url
    ? <img class="avatar" style={style} src={p.photo_url} alt="" loading="lazy" referrerpolicy="no-referrer" />
    : <span class="avatar" style={style}>{displayName(p).trim().charAt(0).toUpperCase() || '?'}</span>;
}
