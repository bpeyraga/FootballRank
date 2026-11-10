import { statusLabel, whenLocal } from './model';
import { useNextBooking } from './useCourts';

const Chev = () => <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

/**
 * Entrada a "Canchas cerca" desde Inicio. Si ya tenés una reserva próxima, la tarjeta la muestra y lleva a "Mis reservas";
 * si no, invita a buscar cancha. Ante cualquier error al leer las reservas queda la invitación (sin ruido).
 */
export function CourtsEntry() {
  const next = useNextBooking();
  return (
    <>
      <a class="cn-entry" href="#/canchas">
        <span class="cn-entry-ico" aria-hidden="true">🏟️</span>
        <span class="cn-entry-copy">
          <b>Canchas cerca</b>
          <span class="muted">Buscá una cancha, mirá los horarios y reservá tu turno</span>
        </span>
        <Chev />
      </a>
      {next && (
        <a class="cn-entry cn-entry-next" href="#/mis-reservas">
          <span class="cn-entry-dot" aria-hidden="true" />
          <span class="cn-entry-copy">
            <b class="ellipsis">{next.complex_name}</b>
            <span class="muted ellipsis">{whenLocal(next.starts_at)} · {statusLabel(next.status)}</span>
          </span>
          <span class="cn-entry-link">Mis reservas</span>
          <Chev />
        </a>
      )}
    </>
  );
}
