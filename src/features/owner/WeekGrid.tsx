import {
  addDays, dayCounts, dayRevenue, fmtDayShort, fmtHHMM, fmtPrice, isActive, isBlock, placeBooking, WEEKDAY_SHORT, weekdayOf,
  type Booking, type Field, type HoursRow,
} from './model';

/** La semana (lunes a domingo) en siete columnas: para ver de un vistazo cómo viene la ocupación. Solo en pantallas anchas. */
export function WeekGrid({ weekStart, byDay, fields, hours, tz, today, selected, onPickDay, onOpen }: {
  weekStart: string; byDay: Map<string, Booking[]>; fields: Field[]; hours: HoursRow[]; tz: string; today: string; selected: string;
  onPickDay: (date: string) => void; onOpen: (b: Booking) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const fieldName = (id: string) => fields.find(f => f.id === id)?.name ?? 'Cancha';
  return (
    <div class="ow-week">
      {days.map(date => {
        const list = (byDay.get(date) ?? []).filter(isActive);
        const c = dayCounts(list), rev = dayRevenue(list);
        return (
          <section class={`ow-wk-day${date === today ? ' today' : ''}${date === selected ? ' sel' : ''}`} aria-label={fmtDayShort(date)}>
            <button type="button" class="ow-wk-head" onClick={() => onPickDay(date)}>
              <span>{WEEKDAY_SHORT[weekdayOf(date)]}</span>
              <b>{+date.slice(8)}</b>
              <small class="muted">{fmtDayShort(date).replace(/^\d+ /, '')}</small>
            </button>
            <div class="ow-wk-sum">
              {c.pending > 0 && <span class="ow-pill warn">{c.pending} por responder</span>}
              <span class="muted">{c.confirmed} turno{c.confirmed === 1 ? '' : 's'}{c.blocks ? ` · ${c.blocks} bloq.` : ''}</span>
              {rev > 0 && <span class="muted">{fmtPrice(rev)}</span>}
            </div>
            <div class="ow-wk-list">
              {list.length === 0 && <p class="ow-wk-free muted">Libre</p>}
              {list.map(b => {
                const pos = placeBooking(b, hours, tz);
                const kind = isBlock(b) ? 'block' : b.status;
                return (
                  <button type="button" class={`ow-wk-item st-${kind}`} onClick={() => onOpen(b)}>
                    <span class="ow-wk-time">{fmtHHMM(pos.start)}</span>
                    <span class="ellipsis">{fieldName(b.field_id)}</span>
                    <small class="ellipsis">{isBlock(b) ? (b.note || 'Bloqueado') : (b.requester_name ?? 'Jugador')}</small>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
