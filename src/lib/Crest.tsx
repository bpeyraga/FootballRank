import { useId } from 'preact/hooks';
import { CREST, KITS, type Shape } from './teams';

/** Contornos en un lienzo de 24×28 (el diseño de la camiseta se recorta adentro). */
export const SHAPES: Record<Shape, string> = {
  shield: 'M2 2H22V13C22 20 17.5 24.5 12 27C6.5 24.5 2 20 2 13Z',
  pointed: 'M2 4Q7 4 12 1Q17 4 22 4V14C22 20.5 17.5 24.5 12 27C6.5 24.5 2 20.5 2 14Z',
  french: 'M2 2H22V17Q22 25.5 12 27Q2 25.5 2 17Z',
  oval: 'M12 1.5C18 1.5 22 7 22 14S18 26.5 12 26.5S2 21 2 14S6 1.5 12 1.5Z',
  round: 'M12 3.5A10.5 10.5 0 1 1 11.99 3.5Z',
};

/** ¿Color claro? (luminancia relativa aproximada de un #rrggbb) */
const light = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
};

/**
 * Escudito propio con la forma, los colores y el diseño de la camiseta del club (no es el escudo oficial).
 * Las iniciales aparecen desde 24 px, donde se pueden leer. Nada si el equipo no está en la lista.
 */
export function Crest({ team, size = 18 }: { team: string | null | undefined; size?: number }) {
  const id = useId();
  const k = team ? KITS[team] : undefined;
  if (!k) return null;
  const d = CREST[team!] ?? {};
  const outline = SHAPES[d.f ?? 'shield'];
  const [c0, c1 = c0, c2] = k.c;
  const fill = () => {
    switch (k.p) {
      case 'stripes': {
        const cols = c2 ? [c0, c1, c2] : [c0, c1];
        return [0, 1, 2, 3, 4, 5].map(i => <rect x={i * 4} y="0" width="4" height="28" fill={cols[i % cols.length]} />);
      }
      case 'hband': return <><rect width="24" height="28" fill={c0} /><rect y="10.5" width="24" height="6.5" fill={c1} /></>;
      case 'sash': return <><rect width="24" height="28" fill={c0} /><path d="M-1 5L5 -1L27 21L21 27Z" fill={c1} /></>;
      case 'halves': return <><rect width="12" height="28" fill={c0} /><rect x="12" width="12" height="28" fill={c1} /></>;
      case 'vee': return <><rect width="24" height="28" fill={c0} /><path d="M2 2H6.5L12 12L17.5 2H22L12 19Z" fill={c1} /></>;
      default: return <rect width="24" height="28" fill={c0} />;
    }
  };
  const letters = d.l ?? k.s;
  // Iniciales: sobre la franja si hay franja (color por contraste con la franja); si no, abajo del centro.
  // Sobre rayas, mitades, banda o V van con una plaquita oscura para que se lean.
  const ty = k.p === 'hband' ? 15.6 : 18.5;
  const fs = letters.length >= 5 ? 4.2 : letters.length === 4 ? 5 : 6;
  const busy = k.p === 'stripes' || k.p === 'halves' || k.p === 'sash' || k.p === 'vee';
  const ink = k.p === 'hband' ? (light(c1) ? '#1d1d1d' : '#ffffff') : busy ? '#ffffff' : k.t;
  const glossId = `${id}g`;
  return (
    <svg class="crest" width={size} height={size * 28 / 24} viewBox="0 0 24 28" role="img" aria-label={team!}>
      <title>{team}</title>
      <defs>
        <clipPath id={id}><path d={outline} /></clipPath>
        <linearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".28" />
          <stop offset=".45" stop-color="#fff" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity=".18" />
        </linearGradient>
      </defs>
      <g clip-path={`url(#${id})`}>
        {fill()}
        <rect width="24" height="28" fill={`url(#${glossId})`} />
      </g>
      {size >= 24 && <>
        {busy && <rect x="3.5" y={ty - fs * 0.86} width="17" height={fs + 1.1} rx="1.2" fill="#000" fill-opacity=".55" clip-path={`url(#${id})`} />}
        <text x="12" y={ty} text-anchor="middle" font-size={fs} font-weight="700" letter-spacing=".2"
          font-family="var(--f-display)" fill={ink}>{letters}</text>
      </>}
      {/* Borde del color del club + un filo oscuro afuera para que se vea sobre cualquier fondo */}
      <path d={outline} fill="none" stroke="#0007" stroke-width={d.b ? 2.4 : 1} />
      {d.b && <path d={outline} fill="none" stroke={d.b} stroke-width="1.3" />}
    </svg>
  );
}
