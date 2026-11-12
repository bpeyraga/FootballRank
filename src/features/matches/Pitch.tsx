import { displayName, ovr, type Profile, type Stats } from '../../shared/model';
import { Avatar } from '../../shared/ui/Avatar';
import { Crest } from '../../shared/ui/Crest';
import { tier } from '../ranking/ranking';
import type { Placed } from './formation';
import './pitch.css';

/** `stats` (con el 🧤 en `arq`) sirve para mostrar el OVR del puesto donde juega; sin stats, se muestra `ovr`. */
export interface PitchPlayer { id: string; pos: Profile['pos']; ovr: number | null; gk?: number | null; stats?: Stats | null; profile: Profile }

/** El OVR de un jugador en el puesto donde está (ponderado por esa posición). */
export const ovrAt = (p: PitchPlayer, slot: Placed<PitchPlayer>['slot']) => (p.stats ? ovr(p.stats, slot.pos) : p.ovr);

/** El promedio del OVR de cada uno en su puesto (null si no hay nadie con OVR). */
export function pitchOvr(placed: Placed<PitchPlayer>[]): number | null {
  const os = placed.map(s => (s.p ? ovrAt(s.p, s.slot) : null)).filter((o): o is number => o != null);
  return os.length ? Math.round(os.reduce((t, o) => t + o, 0) / os.length) : null;
}

/** Tamaño de las cartas según cuántas líneas y cuántos por línea haya (si no, se pisan). */
function density(placed: Placed<unknown>[]): '' | 'sm' | 'xs' {
  const rows = new Map<number, number>();
  for (const s of placed) rows.set(s.slot.y, (rows.get(s.slot.y) ?? 0) + 1);
  const widest = Math.max(0, ...rows.values());
  if (rows.size >= 6 || widest >= 5) return 'xs';
  if (rows.size >= 5 || widest >= 4) return 'sm';
  return '';
}

/**
 * Cancha con los jugadores ubicados como cartas de formación estilo FIFA (tantos puestos como `placed`).
 * Con `onPick` cada puesto es un botón (para elegir dos e intercambiarlos); `selected` es el puesto elegido.
 */
export function Pitch({ placed, href, captainId, onPick, selected = null }: {
  placed: Placed<PitchPlayer>[]; href?: (id: string) => string; captainId?: string | null;
  onPick?: (slot: number) => void; selected?: number | null;
}) {
  const dens = density(placed);
  const avatar = dens === 'xs' ? 22 : dens === 'sm' ? 28 : 34;
  return (
    <div class={`pitch ${dens}${onPick ? ' editing' : ''}`} role={onPick ? 'group' : 'img'}
      aria-label={'Formación: ' + placed.map(s => `${s.slot.pos} ${s.p ? displayName(s.p.profile) : 'vacío'}`).join(', ')}>
      <svg class="pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
        <rect x="3" y="3" width="94" height="134" rx="1" />
        <line x1="3" y1="70" x2="97" y2="70" />
        <circle cx="50" cy="70" r="12" />
        <circle cx="50" cy="70" r="0.9" class="dot" />
        <path d="M28 3 V19 A22 10 0 0 0 72 19 V3" />
        <path d="M28 137 V121 A22 10 0 0 1 72 121 V137" />
        <circle cx="50" cy="15" r="0.9" class="dot" />
        <circle cx="50" cy="125" r="0.9" class="dot" />
      </svg>
      {placed.map((s, i) => {
        const p = s.p;
        // El OVR del puesto donde juega: si no es su posición, se marca (y suele bajar).
        const o = p ? ovrAt(p, s.slot) : null;
        const off = !!p && p.pos !== s.slot.pos;
        const card = p ? (
          <>
            <span class={`pc-card ${tier(o)}`}>
              <span class="pc-top"><b>{o ?? '—'}</b><i class={off ? 'off' : ''} title={off ? `Juega fuera de su posición (${p.pos})` : undefined}>{s.slot.pos}</i></span>
              <Avatar p={p.profile} size={avatar} zoom={false} />
              {p.profile.shirt_number && <span class="pc-num">#{p.profile.shirt_number}</span>}
              {p.id === captainId && <span class="pc-cap" title="Capitán">C</span>}
            </span>
            <span class="pc-name"><Crest team={p.profile.fav_team} size={8} /><span class="ellipsis">{displayName(p.profile)}</span></span>
          </>
        ) : (
          <>
            <span class="pc-card empty"><span class="pc-top"><i>{s.slot.pos}</i></span><span class="pc-q">?</span></span>
            <span class="pc-name">Vacante</span>
          </>
        );
        const style = `left:${s.slot.x}%;top:${s.slot.y}%`;
        if (onPick) {
          const name = p ? displayName(p.profile) : 'puesto vacío';
          return (
            <button type="button" class={`pc pc-btn${selected === i ? ' sel' : ''}`} style={style} aria-pressed={selected === i}
              aria-label={`${s.slot.pos}: ${name}${selected === i ? ' (elegido)' : ''}`} onClick={() => onPick(i)}>{card}</button>
          );
        }
        return <div class="pc" style={style}>{p && href ? <a href={href(p.id)} class="pc-link">{card}</a> : card}</div>;
      })}
    </div>
  );
}
