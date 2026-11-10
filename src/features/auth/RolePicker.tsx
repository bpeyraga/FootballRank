import { ROLE_CARDS, type RoleChoice } from './roles';

const Ball = () => (
  <svg viewBox="0 0 48 48" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
    <circle cx="24" cy="24" r="18" /><path d="M24 14l8.5 6.2-3.2 10H18.7l-3.2-10zM24 6v8M32.5 20.2l9-2.8M29.3 30.2l5.4 7.4M18.7 30.2l-5.4 7.4M15.5 20.2l-9-2.8" />
  </svg>
);
const Stadium = () => (
  <svg viewBox="0 0 48 48" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
    <rect x="5" y="14" width="38" height="24" rx="3" /><path d="M24 14v24M5 26h6a4 4 0 0 0 0-8H5M43 26h-6a4 4 0 0 1 0-8h6" /><circle cx="24" cy="26" r="4.5" />
    <path d="M9 14V9M39 14V9M9 9h4M39 9h-4" />
  </svg>
);
const ICONS: Record<RoleChoice, any> = {
  player: <Ball />,
  owner: <Stadium />,
  both: <span class="rl-both"><Ball /><i aria-hidden="true">+</i><Stadium /></span>,
};

/** Las tres tarjetas de "¿cómo vas a usar la app?": una sola elección. Campo controlado. */
export function RolePicker({ value, onChange, disabled = false }: { value: RoleChoice; onChange: (c: RoleChoice) => void; disabled?: boolean }) {
  return (
    <div class="rl-cards" role="radiogroup" aria-label="¿Cómo vas a usar la app?">
      {ROLE_CARDS.map(c => (
        <button type="button" role="radio" aria-checked={value === c.id} disabled={disabled} class={`rl-card${value === c.id ? ' on' : ''}${c.id === 'both' ? ' both' : ''}`}
          onClick={() => onChange(c.id)}>
          <span class="rl-ico">{ICONS[c.id]}</span>
          <span class="rl-copy"><b>{c.title}</b><small>{c.desc}</small></span>
          <span class="rl-check" aria-hidden="true">{value === c.id ? '✓' : ''}</span>
        </button>
      ))}
    </div>
  );
}
