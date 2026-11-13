// "De potrero a leyenda": las piezas visuales. Logos de clubes y competencias (los oficiales de ESPN, con un respaldo propio si no cargan o no existen),
// banderas, la camiseta y los trofeos (dibujos propios en SVG). Todo con tamaño fijo para que nada se mueva al cargar.
import { useId, useState } from 'preact/hooks';
import { NATIONS } from './careerNations';
import { hue } from '../../shared/model';
import { KITS, espnCrestUrl } from '../../shared/teams';
import { Crest } from '../../shared/ui/Crest';
import { TONES, type Tone, type TrophyShape } from './careerTrophies';
import type { Chip } from './careerFx';
import { CLUB_ESPN, COMP_LOGO, SIN_ESCUDO_COLOR } from './careerLogos';
import { flagUrl, nationOf } from './careerNations';
import type { NatId } from './careerTypes';

/** Tema de la app (data-theme) o, si no eligió, el del celular: para el logo claro u oscuro de ESPN (igual que <Crest>). */
const appIsDark = () => {
  const t = typeof document === 'undefined' ? undefined : document.documentElement.dataset.theme;
  return t ? t === 'dark' : typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
};

const initials = (name: string) => {
  const w = name.replace(/[()]/g, '').split(/\s+/).filter(x => x.length > 2 || /^[A-Z]/.test(x));
  const s = w.length > 1 ? w.slice(0, 3).map(x => x[0]).join('') : name.slice(0, 3);
  return s.toUpperCase();
};

/** Distintivo con las iniciales y el color del club, para los que no tienen escudo. */
function Badge({ name, size, color }: { name: string; size: number; color?: string }) {
  const bg = color ? `#${color}` : `hsl(${hue(name)} 45% 36%)`;
  return (
    <span class="cr-badge" role="img" aria-label={name} title={name} style={`width:${size}px;height:${size}px;background:${bg};font-size:${Math.max(8, Math.round(size * 0.36))}px`}>
      {initials(name)}
    </span>
  );
}

/** Escudo de un club: el oficial de ESPN; si no carga, el escudito propio de la app (clubes argentinos) o un distintivo con iniciales. */
export function ClubLogo({ name, size = 22 }: { name: string; size?: number }) {
  const [bad, setBad] = useState<string | null>(null);
  const e = CLUB_ESPN[name];
  const url = e && bad !== name ? espnCrestUrl(e[0], appIsDark()) : null;
  if (url) {
    return (
      <img class="cr-logo" src={url} width={size} height={size} alt={name} title={name} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setBad(name)} />
    );
  }
  if (KITS[name]) return <span class="cr-logo-box" style={`width:${size}px;height:${size}px`}><Crest team={name} size={Math.round(size * 24 / 28)} /></span>;
  return <Badge name={name} size={size} color={e?.[1] || SIN_ESCUDO_COLOR[name] || undefined} />;
}

/** El color principal de un club (para teñir las tarjetas), o '' si no se conoce. */
export const clubColor = (name: string): string => (CLUB_ESPN[name]?.[1] ? `#${CLUB_ESPN[name][1]}` : '');

const compUrl = (id: string, dark: boolean) => `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/${dark ? '500-dark' : '500'}/${id}.png&w=72&h=72`;

/** Logo de una liga, copa o torneo (ESPN). Los que no tienen logo oficial llevan un ícono propio. */
export function CompLogo({ name, size = 18 }: { name: string; size?: number }) {
  // Se anota cuál logo falló (no un "sí/no"): si este lugar pasa a mostrar otra competencia (el club cambia de liga, entra una temporada nueva arriba de la lista), la nueva se intenta cargar
  const [bad, setBad] = useState<string | null>(null);
  const id = COMP_LOGO[name];
  if (id && bad !== name) {
    return <img class="cr-logo" src={compUrl(id, appIsDark())} width={size} height={size} alt={name} title={name} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setBad(name)} />;
  }
  return (
    <span class="cr-compfb" role="img" aria-label={name} title={name} style={`width:${size}px;height:${size}px`}>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} fill="currentColor" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-4 4.9V16h3v2H8v-2h3v-3.1A5 5 0 0 1 7 8zM5 5h2v3a3 3 0 0 1-2-2.8zm14 0v.2A3 3 0 0 1 17 8V5zM9 20h6v1.5H9z" /></svg>
    </span>
  );
}

/** Bandera de un país: la imagen del CDN de ESPN (se ve igual en todos lados) y, si no carga, el emoji. */
export function Flag({ nat, size = 18 }: { nat: NatId; size?: number }) {
  const [bad, setBad] = useState<string | null>(null);
  const n = nationOf(nat), url = flagUrl(n.id);
  if (url && bad !== n.id) {
    return <img class="cr-flag-img" src={url} width={size} height={size} alt={n.name} title={n.name} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setBad(n.id)} />;
  }
  return <span class="cr-flag" role="img" aria-label={n.name} title={n.name} style={`font-size:${size}px`}>{n.flag}</span>;
}
/** La bandera del país de una liga ("Brasil"), o nada si el juego no lo conoce. */
export function CountryFlag({ country, size = 14 }: { country: string; size?: number }) {
  const n = NATIONS.find(x => x.name === country);
  return n ? <Flag nat={n.id} size={size} /> : null;
}

/** La camiseta (por detrás) con tu apellido y número, con los colores de tu Selección. Dibujo propio. */
export function Shirt({ nat, surname, num, size = 96, trim = null }: { nat: NatId; surname: string; num: number; size?: number; trim?: string | null }) {
  const id = useId();
  const [main, kitAcc, ink] = nationOf(nat).kit, stripes = nationOf(nat).stripes;
  const acc = trim ?? kitAcc; // los vivos de colores se desbloquean con logros
  const name = (surname || 'CRACK').toUpperCase().slice(0, 14);
  const fs = Math.min(13, 54 / (name.length * 0.66));
  const body = 'M38 8 L22 16 L4 40 L20 52 L30 44 L30 122 Q30 126 34 126 L86 126 Q90 126 90 122 L90 44 L100 52 L116 40 L98 16 L82 8 Q60 26 38 8 Z';
  return (
    <svg class="cr-shirt" viewBox="0 0 120 134" width={size} height={Math.round(size * 134 / 120)} role="img" aria-label={`Camiseta de ${name}, número ${num}`}>
      <defs>
        <clipPath id={id}><path d={body} /></clipPath>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18" /><stop offset="1" stop-color="#000" stop-opacity=".22" /></linearGradient>
      </defs>
      <g clip-path={`url(#${id})`}>
        <rect width="120" height="134" fill={main} />
        {stripes && [0, 1, 2, 3, 4, 5].map(i => <rect x={4 + i * 20} y="0" width="10" height="134" fill={acc} />)}
        <rect width="120" height="134" fill={`url(#${id}s)`} />
      </g>
      <path d={body} fill="none" stroke="#0007" stroke-width="2" stroke-linejoin="round" />
      <path d="M38 8 Q60 26 82 8" fill="none" stroke={acc} stroke-width="4" stroke-linecap="round" />
      <path d="M4 40 L20 52 M116 40 L100 52" stroke={acc} stroke-width="4" stroke-linecap="round" />
      <text x="60" y="52" text-anchor="middle" font-size={fs} font-weight="700" letter-spacing=".6" font-family="var(--f-display)" fill={ink}>{name}</text>
      <text x="60" y="104" text-anchor="middle" font-size="48" font-weight="700" font-family="var(--f-display)" fill={ink}>{num}</text>
    </svg>
  );
}

/** Un par de botines (dibujo propio) del color que tengas desbloqueado. */
export function Boots({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <svg class="cr-boots" viewBox="0 0 48 32" width={size} height={Math.round(size * 32 / 48)} role="img" aria-label="Tus botines">
      <path d="M4 6h14v10c0 2 1.6 3.2 4 3.8l15 3.4c3.4.8 7 2.8 7 6.8v1H4z" fill={color} stroke="rgba(0,0,0,.4)" stroke-linejoin="round" />
      <path d="M4 26h40v4H4z" fill="rgba(0,0,0,.45)" />
      <path d="M8 29v2M16 29v2M24 29v2M32 29v2M40 29v2" stroke="rgba(0,0,0,.6)" stroke-width="2" stroke-linecap="round" />
      <path d="M9 10h6M9 14h6" stroke="rgba(0,0,0,.35)" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

/** Un trofeo o premio, dibujo propio en SVG: la forma según lo que es y el color según su importancia (oro, plata o bronce). */
export function TrophyIcon({ shape, tone, size = 44, label }: { shape: TrophyShape; tone: Tone; size?: number; label?: string }) {
  const id = useId();
  const [a, b, c] = TONES[tone];
  const fill = `url(#${id})`, edge = 'rgba(0,0,0,.28)';
  const parts = {
    cup: <>
      <path d="M13 8h22v11c0 6-5 10-11 10s-11-4-11-10z" fill={fill} stroke={edge} />
      <path d="M13 11H8c0 6 3 10 7.5 10.5M35 11h5c0 6-3 10-7.5 10.5" fill="none" stroke={b} stroke-width="3" stroke-linecap="round" />
      <rect x="21.5" y="29" width="5" height="7" fill={fill} stroke={edge} />
      <path d="M14 42c0-3.5 3.5-6 10-6s10 2.5 10 6v1H14z" fill={fill} stroke={edge} />
    </>,
    plate: <>
      <path d="M24 4l16 5.5v12c0 10-7 17.5-16 21.5-9-4-16-11.5-16-21.5v-12z" fill={fill} stroke={edge} />
      <path d="M24 13l2.9 6 6.6.8-4.8 4.5 1.2 6.5L24 27.6l-5.9 3.2 1.2-6.5-4.8-4.5 6.6-.8z" fill={a} stroke={c} stroke-width=".8" />
    </>,
    small: <>
      <path d="M15 8h18l-1.8 11c-.6 3.6-3.4 6-7.2 6s-6.6-2.4-7.2-6z" fill={fill} stroke={edge} />
      <rect x="22" y="25" width="4" height="9" fill={fill} stroke={edge} />
      <rect x="15" y="34" width="18" height="6" rx="2" fill={fill} stroke={edge} />
    </>,
    medal: <>
      <path d="M15 3h8l3 13h-8zM33 3h-8l-3 13h8z" fill={c} opacity=".85" />
      <circle cx="24" cy="29" r="13" fill={fill} stroke={edge} />
      <circle cx="24" cy="29" r="8.5" fill="none" stroke={c} stroke-width="1.4" opacity=".7" />
      <path d="M24 23l1.9 4 4.3.5-3.2 3 .9 4.3L24 32.6l-3.9 2.2.9-4.3-3.2-3 4.3-.5z" fill={a} />
    </>,
    ball: <>
      <circle cx="24" cy="24" r="18" fill={fill} stroke={edge} />
      <path d="M24 14.5l6.8 4.9-2.6 8H19.8l-2.6-8z" fill="none" stroke={c} stroke-width="1.6" stroke-linejoin="round" />
      <path d="M24 14.5V7M30.8 19.4l6.6-2.4M28.2 27.4l4 5.6M19.8 27.4l-4 5.6M17.2 19.4L10.6 17" stroke={c} stroke-width="1.4" stroke-linecap="round" fill="none" />
    </>,
    boot: <>
      <path d="M10 8h12v13c0 2 1.6 3.4 4 4l10.5 2.6c3.4.8 5.5 3.2 5.5 6.6V38H10z" fill={fill} stroke={edge} stroke-linejoin="round" />
      <rect x="10" y="36" width="32" height="5" rx="1.5" fill={c} opacity=".8" />
      <path d="M14 41v2.5M22 41v2.5M30 41v2.5M38 41v2.5" stroke={c} stroke-width="2.4" stroke-linecap="round" />
      <path d="M13 12h6M13 16h6" stroke={c} stroke-width="1.6" stroke-linecap="round" opacity=".7" />
    </>,
    star: <path d="M24 4l6.2 13.2 14.4 1.8-10.6 10 2.8 14.3L24 36.2 11.2 43.3 14 29 3.4 19l14.4-1.8z" fill={fill} stroke={edge} stroke-linejoin="round" />,
  } satisfies Record<TrophyShape, preact.JSX.Element>;
  return (
    <svg class="cr-trophy-svg" viewBox="0 0 48 48" width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color={a} /><stop offset=".5" stop-color={b} /><stop offset="1" stop-color={c} /></linearGradient></defs>
      {parts[shape]}
    </svg>
  );
}

/** Las etiquetas de una opción (seguro o con riesgo, lo que ganás y lo que puede salir mal). */
export function Chips({ chips, class: cls = '' }: { chips: readonly Chip[]; class?: string }) {
  if (!chips.length) return null;
  return <span class={`cr-chips-row ${cls}`}>{chips.map(c => <span class={`cr-chip ${c.tone}`}>{c.text}</span>)}</span>;
}

/** Una pelota (dibujo propio) para los goles que saltan en el resultado. */
export function BallIcon({ size = 20 }: { size?: number }) {
  return (
    <svg class="cr-ballsvg" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#1d2b22" stroke-width="1.4" />
      <path d="M12 6.6l4.2 3-1.6 4.9H9.4L7.8 9.6z" fill="#1d2b22" />
      <path d="M12 6.6V1.8M16.2 9.6l4.4-1.5M14.6 14.5l2.8 3.8M9.4 14.5l-2.8 3.8M7.8 9.6L3.4 8.1" stroke="#1d2b22" stroke-width="1.2" stroke-linecap="round" fill="none" />
    </svg>
  );
}
