import { useState } from 'preact/hooks';
import { ANY_SHIRT, SHIRTS, shirtLabel, shirtOf, shirtsClash } from './shirts';

/** Remera dibujada con el color del equipo ("indistinto": rayada en gris; sin elegir: solo el contorno). */
export function ShirtIcon({ shirt, size = 22 }: { shirt: string | null | undefined; size?: number }) {
  const s = shirtOf(shirt);
  const any = shirt === ANY_SHIRT;
  return (
    <svg class="shirt-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {any && (
        <defs>
          <pattern id="shirt-any" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#d9dce1" /><rect width="2" height="4" fill="#9aa0a8" />
          </pattern>
        </defs>
      )}
      <path d="M8 2.5 4 4.5 1.5 9l3.2 1.8L6 9.3V21.5h12V9.3l1.3 1.5L22.5 9 20 4.5l-4-2c-.6 1.6-2.1 2.6-4 2.6S8.6 4.1 8 2.5Z"
        fill={s ? s.color : any ? 'url(#shirt-any)' : 'none'} stroke={s && s.key !== 'blanco' ? 'rgba(0,0,0,.35)' : 'currentColor'}
        stroke-width="1.2" stroke-linejoin="round" stroke-dasharray={!s && !any ? '2 2' : undefined} />
    </svg>
  );
}

/**
 * Camiseta del equipo: se muestra al lado del nombre. Con `onSave` (admins) es un botón que abre la lista de colores
 * (blanco y negro primero) y "Color indistinto". Avisa si el otro equipo ya eligió el mismo.
 */
export function ShirtPicker({ team, shirt, other, busy, onSave }: {
  team: string; shirt: string | null | undefined; other: string | null | undefined; busy: boolean;
  onSave?: (key: string | null) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const pick = async (key: string | null) => { if (!onSave || await onSave(key)) setOpen(false); };
  const label = shirtLabel(shirt);

  if (!onSave) {
    if (!shirt) return null;
    return <span class="shirt-chip" title={label}><ShirtIcon shirt={shirt} /><span>{label}</span></span>;
  }
  return (
    <div class="shirt-wrap">
      <button type="button" class="shirt-chip btn-like" aria-expanded={open} disabled={busy} onClick={() => setOpen(o => !o)}
        title={`Camiseta del equipo ${team}`}>
        <ShirtIcon shirt={shirt} /><span>{shirt ? label : 'Elegir camiseta'}</span>
      </button>
      {open && (
        <div class="shirt-pop" role="group" aria-label={`Camiseta del equipo ${team}`}>
          <div class="shirt-grid">
            {SHIRTS.map(s => (
              <button type="button" class={`shirt-opt${shirt === s.key ? ' on' : ''}`} aria-pressed={shirt === s.key} disabled={busy}
                onClick={() => pick(s.key)} title={s.label}>
                <ShirtIcon shirt={s.key} size={28} /><span>{s.label}</span>
              </button>
            ))}
            <button type="button" class={`shirt-opt any${shirt === ANY_SHIRT ? ' on' : ''}`} aria-pressed={shirt === ANY_SHIRT} disabled={busy}
              onClick={() => pick(ANY_SHIRT)} title="No importa el color">
              <ShirtIcon shirt={ANY_SHIRT} size={28} /><span>Indistinto</span>
            </button>
          </div>
          {shirt && <button type="button" class="linkbtn" disabled={busy} onClick={() => pick(null)}>Sacar color</button>}
        </div>
      )}
      {shirtsClash(shirt, other) && <p class="shirt-warn">⚠️ El otro equipo tiene el mismo color.</p>}
    </div>
  );
}
