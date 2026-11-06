import { useId } from 'preact/hooks';
import { KITS } from './teams';

const SHIELD = 'M2 2H22V13C22 20 17.5 24.5 12 27C6.5 24.5 2 20 2 13Z';

/** Escudito con los colores y el diseño de la camiseta del club. Nada si el equipo no está en la lista. */
export function Crest({ team, size = 18 }: { team: string | null | undefined; size?: number }) {
  const id = useId();
  const k = team ? KITS[team] : undefined;
  if (!k) return null;
  const [c0, c1 = c0, c2] = k.c;
  const fill = () => {
    switch (k.p) {
      case 'stripes': {
        const cols = c2 ? [c0, c1, c2] : [c0, c1];
        return [0, 1, 2, 3, 4, 5].map(i => <rect x={i * 4} y="0" width="4" height="28" fill={cols[i % cols.length]} />);
      }
      case 'hband': return <><rect width="24" height="28" fill={c0} /><rect y="10" width="24" height="6" fill={c1} /></>;
      case 'sash': return <><rect width="24" height="28" fill={c0} /><path d="M0 4L4 0L26 22L22 26Z" fill={c1} /></>;
      case 'halves': return <><rect width="12" height="28" fill={c0} /><rect x="12" width="12" height="28" fill={c1} /></>;
      case 'vee': return <><rect width="24" height="28" fill={c0} /><path d="M2 2H6.5L12 12L17.5 2H22L12 19Z" fill={c1} /></>;
      default: return <rect width="24" height="28" fill={c0} />;
    }
  };
  return (
    <svg class="crest" width={size} height={size * 28 / 24} viewBox="0 0 24 28" role="img" aria-label={team!}>
      <title>{team}</title>
      <clipPath id={id}><path d={SHIELD} /></clipPath>
      <g clip-path={`url(#${id})`}>{fill()}</g>
      {size >= 30 && (
        <text x="12" y={k.p === 'hband' ? 9 : 22} text-anchor="middle" font-size="6" font-weight="700"
          font-family="var(--f-display)" fill={k.t} stroke={k.p === 'stripes' || k.p === 'halves' || k.p === 'sash' ? '#0007' : 'none'}
          stroke-width=".4" paint-order="stroke">{k.s}</text>
      )}
      <path d={SHIELD} fill="none" stroke="#0006" stroke-width="1" />
    </svg>
  );
}
