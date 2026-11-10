import type { Profile } from '../../shared/supabase';
import { Skeleton } from './ui';
import { useMyComplexes } from './useOwner';
import type { Complex, Overview } from './model';

const Badge = ({ c }: { c: Complex }) =>
  c.active ? <span class="ow-pill ok">Activo</span> : <span class="ow-pill off">Pausado</span>;

function Card({ c, ov }: { c: Complex; ov?: Overview }) {
  const pending = ov?.pending ?? 0, today = ov?.today ?? 0;
  return (
    <a class="ow-cx" href={`#/duenio/${c.id}`}>
      <div class="ow-cx-img">
        {c.photo_url ? <img src={c.photo_url} alt="" loading="lazy" /> : <span aria-hidden="true">🏟️</span>}
      </div>
      <div class="ow-cx-body">
        <div class="ow-cx-top"><b class="ellipsis">{c.name}</b><Badge c={c} /></div>
        <p class="muted ellipsis">{[c.address, c.city].filter(Boolean).join(' · ') || 'Sin dirección cargada'}</p>
        <div class="ow-cx-stats">
          {pending > 0
            ? <span class="ow-pill warn">{pending === 1 ? '1 pedido por responder' : `${pending} pedidos por responder`}</span>
            : <span class="muted">Sin pedidos pendientes</span>}
          <span class="muted">· {today === 0 ? 'Hoy sin turnos' : today === 1 ? '1 turno hoy' : `${today} turnos hoy`}</span>
        </div>
      </div>
      <span class="chev" aria-hidden="true">›</span>
    </a>
  );
}

/** Mis complejos: pedidos por responder y turnos de hoy de cada uno, y el alta de uno nuevo. */
export function ComplexList({ me }: { me: Profile }) {
  const { list, overview, err } = useMyComplexes(me.id);
  const totalPending = [...overview.values()].reduce((s, o) => s + o.pending, 0);

  return (
    <div class="ow-list">
      <div class="ow-title">
        <div>
          <span class="ow-kicker">Panel de dueño</span>
          <h2>Mis canchas</h2>
          <p class="muted">Tus turnos y reservas, en un solo lugar.</p>
        </div>
        {!!list?.length && <a class="btn primary ow-new" href="#/duenio/nuevo">＋ Nuevo complejo</a>}
      </div>

      {err && <p class="err" role="alert">{err}</p>}
      {list === null && <Skeleton rows={2} />}

      {totalPending > 0 && (
        <div class="card note ow-alert" role="status">
          <b>{totalPending === 1 ? 'Tenés 1 pedido de turno por responder.' : `Tenés ${totalPending} pedidos de turno por responder.`}</b>
          <span>Los jugadores esperan tu confirmación.</span>
        </div>
      )}

      {list && list.length > 0 && <div class="ow-cx-list">{list.map(c => <Card c={c} ov={overview.get(c.id)} />)}</div>}

      {list && list.length === 0 && !err && (
        <div class="card ow-empty">
          <span class="ow-empty-ico" aria-hidden="true">🏟️</span>
          <h3>Cargá tu primer complejo</h3>
          <p class="muted">En unos minutos tenés tus canchas, tus horarios y una agenda online. Los jugadores te encuentran en el buscador y te piden turnos desde la app.</p>
          <ul class="ow-bullets">
            <li><b>Agenda online</b> con los turnos de cada cancha, por día y por semana.</li>
            <li><b>Pedidos de reserva</b>: aceptás o rechazás con un toque y el jugador recibe el aviso.</li>
            <li><b>Horarios bloqueados</b> para lo que se reserva por teléfono o el mantenimiento.</li>
          </ul>
          <a class="btn primary" href="#/duenio/nuevo">Crear mi complejo</a>
        </div>
      )}

      {me.is_player !== false && <a class="ow-back ow-foot" href="#/">← Volver a mis grupos</a>}
    </div>
  );
}

