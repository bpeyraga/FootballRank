// Piezas chicas del panel del dueño: íconos, interruptor, selector de opciones.
import type { ComponentChildren } from 'preact';

export const Icon = ({ children, size = 22 }: { children: ComponentChildren; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
    {children}
  </svg>
);

export const TAB_ICONS: Record<string, ComponentChildren> = {
  agenda: <path d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5zM3 10h18M8 3v4M16 3v4" />,
  pedidos: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />,
  canchas: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14" /><circle cx="12" cy="12" r="2.6" /></>,
  horarios: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  datos: <path d="M3 20V9l9-5 9 5v11M3 20h18M7 20v-6h10v6M12 4v5" />,
};

/** Interruptor con título y ayuda (mismo aspecto que el de la zona). */
export function Switch({ checked, onChange, title, hint, disabled = false }: {
  checked: boolean; onChange: (v: boolean) => void; title: string; hint?: string; disabled?: boolean;
}) {
  return (
    <label class="zn-switch ow-switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange((e.target as HTMLInputElement).checked)} />
      <span class="zn-track" aria-hidden="true"><i /></span>
      <span class="zn-switch-copy"><b>{title}</b>{hint && <small class="muted">{hint}</small>}</span>
    </label>
  );
}

/** Botones de una sola opción (tamaño de cancha, duración del turno…). */
export function Choice<T extends string | number>({ options, value, onChange, label, disabled = false }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; disabled?: boolean;
}) {
  return (
    <div class="ow-choice" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button type="button" role="radio" aria-checked={o.value === value} class={o.value === value ? 'on' : ''} disabled={disabled}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export const Skeleton = ({ rows = 3 }: { rows?: number }) => (
  <div class="ow-skel" aria-hidden="true">{Array.from({ length: rows }, () => <div />)}</div>
);
