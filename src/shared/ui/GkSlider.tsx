import { GK_ATTR } from '../model';

/**
 * Habilidad como arquero (1-99), aparte de los seis atributos: no suma al OVR.
 * `value` null = sin calificar: el control queda en 50, atenuado, y se califica al moverlo. "Quitar" lo vuelve a null.
 */
export function GkSlider({ value, onChange, hint = true }: { value: number | null | undefined; onChange: (v: number | null) => void; hint?: boolean }) {
  const [, label, full] = GK_ATTR;
  const unset = value == null;
  return (
    <div class="gk-slider">
      <label class={`slider${unset ? ' unset' : ''}`} title={`${full} (no suma al OVR)`}>
        <b>{label}</b>
        <input type="range" min={1} max={99} value={value ?? 50} aria-label={`${full} (no suma al OVR)`}
          onInput={e => onChange(+(e.target as HTMLInputElement).value)} />
        <output>{unset ? '—' : value}</output>
      </label>
      {hint && (
        <p class="muted gk-hint">
          🧤 Atajando · no suma al OVR. {unset
            ? 'Movelo para calificar.'
            : <button type="button" class="linkish" onClick={() => onChange(null)}>Quitar</button>}
        </p>
      )}
    </div>
  );
}
