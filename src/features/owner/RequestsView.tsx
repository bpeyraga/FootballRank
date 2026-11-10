import { useMemo, useState } from 'preact/hooks';
import { Avatar } from '../../shared/ui/Avatar';
import { decideBooking } from './api';
import { BookingSheet } from './BookingSheet';
import { Skeleton } from './ui';
import { useAgenda, useNow } from './useOwner';
import {
  addDays, competingPending, durationMin, endMs, fmtDayLong, fmtDuration, fmtPrice, fmtRange, groupByDay, openRequests, ownerErrorText,
  pendingConflict, sizeLabel, startMs, today as todayOf, zonedToUtc, type Booking, type ComplexData,
} from './model';

/** Pedidos de turno por responder, del más próximo al más lejano. Aceptar es un toque; rechazar permite explicar el motivo. */
export function RequestsView({ data, tick, reloadAll }: { data: ComplexData; tick: number; reloadAll: () => void }) {
  const { complex, fields, hours } = data;
  const tz = complex.tz;
  const now = useNow(60_000);
  // Rango fijo (ayer a +62 días): si dependiera de "ahora" se volvería a pedir en cada repintado.
  const fromMs = useMemo(() => zonedToUtc(addDays(todayOf(tz), -1), 0, tz), [tz]);
  const toMs = fromMs + 63 * 86_400_000;
  const { bookings, err, reload } = useAgenda(complex.id, fromMs, toMs, tick);
  const [sel, setSel] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState('');
  const [cardErr, setCardErr] = useState<Record<string, string>>({});

  const all = bookings ?? [];
  const open = useMemo(() => openRequests(all, now), [all, now]);
  const byDay = useMemo(() => groupByDay(open, hours, tz), [open, hours, tz]);
  const fieldOf = (id: string) => fields.find(f => f.id === id);

  const done = () => { setSel(null); reload(); reloadAll(); };
  const accept = async (b: Booking) => {
    setBusyId(b.id); setCardErr(e => ({ ...e, [b.id]: '' }));
    try { await decideBooking(b.id, true, ''); done(); }
    catch (e) { setCardErr(x => ({ ...x, [b.id]: ownerErrorText(e) })); }
    setBusyId('');
  };

  return (
    <div class="ow-req">
      <div class="ow-title sm">
        <div><h3>Pedidos por responder</h3><p class="muted">Los jugadores reciben un aviso cuando respondés.</p></div>
      </div>
      {err && <p class="err" role="alert">{err} <button class="linkbtn" onClick={reload}>Reintentar</button></p>}
      {bookings === null && !err && <Skeleton rows={3} />}
      {bookings !== null && open.length === 0 && (
        <div class="card ow-empty">
          <span class="ow-empty-ico" aria-hidden="true">✅</span>
          <h3>No tenés pedidos pendientes</h3>
          <p class="muted">Cuando un jugador pida un turno, lo vas a ver acá y te llega un aviso al celular.</p>
          <a class="btn" href={`#/duenio/${complex.id}`}>Ver la agenda</a>
        </div>
      )}
      {[...byDay.entries()].map(([date, list]) => (
        <section class="ow-req-day">
          <h4>{fmtDayLong(date)}</h4>
          <div class="ow-req-grid">
            {list.map(b => {
              const f = fieldOf(b.field_id);
              const conflict = pendingConflict(b, all);
              const rivals = competingPending(b, all).length;
              return (
                <article class="card ow-req-card">
                  <button class="ow-req-main" onClick={() => setSel(b)} aria-label="Ver el pedido completo">
                    <div class="ow-req-when">
                      <b>{fmtRange(startMs(b), endMs(b), tz)}</b>
                      <span class="muted">{fmtDuration(durationMin(b))}{b.price !== null ? ` · ${fmtPrice(b.price)}` : ''}</span>
                    </div>
                    <div class="ow-who">
                      <Avatar p={{ name: b.requester_name ?? '?', photo_url: b.requester_photo }} size={38} zoom={false} />
                      <div class="ow-who-copy">
                        <b class="ellipsis">{b.requester_name ?? 'Jugador'}</b>
                        <small class="muted ellipsis">{f ? `${f.name} · ${sizeLabel(f.size)}` : 'Cancha'}{b.community_name ? ` · ${b.community_name}` : ''}</small>
                      </div>
                    </div>
                    {b.note && <p class="ow-req-note">“{b.note}”</p>}
                  </button>
                  {conflict && <p class="ow-warn" role="alert">Se pisa con un turno confirmado: no se puede aceptar.</p>}
                  {!conflict && rivals > 0 && <p class="ow-warn soft">{rivals === 1 ? 'Hay otro pedido' : `Hay otros ${rivals} pedidos`} para el mismo horario.</p>}
                  {cardErr[b.id] && <p class="err" role="alert">{cardErr[b.id]}</p>}
                  <div class="ow-actions">
                    <button class="btn primary" disabled={busyId === b.id || !!conflict} onClick={() => accept(b)}>{busyId === b.id ? 'Aceptando…' : 'Aceptar'}</button>
                    <button class="btn danger" disabled={busyId === b.id} onClick={() => setSel(b)}>Rechazar</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {sel && <BookingSheet b={sel} all={all} fields={fields} tz={tz} now={now} onClose={() => setSel(null)} onDone={done} />}
    </div>
  );
}
