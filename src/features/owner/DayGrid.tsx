import { addDays, fmtHHMM, fmtPrice, isBlock, layoutLanes, localParts, sizeLabel, snapMinute, type Booking, type DayWindow, type Field } from './model';

export interface PlacedBooking { b: Booking; pos: { date: string; start: number; end: number } }

/**
 * La agenda de un día: una columna por cancha y las horas en vertical. Los turnos son bloques con su hora; los pendientes
 * (rayados en ámbar) piden respuesta; lo que está libre se toca para bloquearlo. Lo que se pisa se reparte lado a lado.
 */
export function DayGrid({ win, fields, items, tz, now, step, onOpen, onFree }: {
  win: DayWindow; fields: Field[]; items: PlacedBooking[]; tz: string; now: number; step: number;
  onOpen: (b: Booking) => void; onFree: (fieldId: string, startMin: number) => void;
}) {
  const span = win.end - win.start;
  const hoursN = span / 60;
  const marks: number[] = [];
  for (let t = win.start; t < win.end; t += 60) marks.push(t);

  // Línea "ahora": si hoy es este día de agenda, o es la madrugada que todavía pertenece a él.
  const nowLocal = localParts(now, tz);
  const nowMin = nowLocal.date === win.date ? nowLocal.minutes : addDays(nowLocal.date, -1) === win.date ? nowLocal.minutes + 1440 : null;
  const showNow = nowMin !== null && nowMin >= win.start && nowMin <= win.end;

  const top = (min: number) => `calc(var(--ow-hpx) * ${(min - win.start) / 60})`;
  const colClick = (f: Field) => (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ow-bk')) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onFree(f.id, snapMinute(e.clientY - r.top, r.height / span, win.start, step));
  };

  return (
    <div class="ow-grid-scroll">
      <div class="ow-grid" style={`--cols:${fields.length}`}>
        <div class="ow-grid-head">
          <div class="ow-gutter" />
          {fields.map(f => (
            <div class={`ow-colhead${f.active ? '' : ' off'}`}>
              <b class="ellipsis">{f.name}</b>
              <small class="muted">{sizeLabel(f.size)}{f.active ? '' : ' · inactiva'}</small>
            </div>
          ))}
        </div>
        <div class="ow-grid-body" style={`height:calc(var(--ow-hpx) * ${hoursN})`}>
          <div class="ow-gutter">
            {marks.map(t => <span class="ow-hour" style={`top:${top(t)}`}>{fmtHHMM(t)}</span>)}
          </div>
          {fields.map(f => {
            const col = items.filter(x => x.b.field_id === f.id);
            return (
              <div class="ow-col" role="group" aria-label={f.name} onClick={colClick(f)}>
                {layoutLanes(col, x => [x.pos.start, x.pos.end]).map(({ item: { b, pos }, lane, lanes }) => {
                  const block = isBlock(b);
                  const past = new Date(b.ends_at).getTime() <= now;
                  const kind = block ? 'block' : b.status;
                  const who = block ? (b.note || 'Bloqueado') : (b.requester_name ?? 'Jugador');
                  const short = pos.end - pos.start <= 30;
                  return (
                    <button type="button" class={`ow-bk st-${kind}${past ? ' past' : ''}${short ? ' short' : ''}${lanes > 1 ? ' narrow' : ''}`}
                      style={`top:${top(pos.start)};height:calc(var(--ow-hpx) * ${(pos.end - pos.start) / 60} - 3px);left:calc(${(lane / lanes) * 100}% + 2px);width:calc(${100 / lanes}% - 4px)`}
                      aria-label={`${who}, ${fmtHHMM(pos.start)} a ${fmtHHMM(pos.end)}, ${block ? 'bloqueado' : b.status === 'pending' ? 'pendiente' : 'confirmado'}`}
                      onClick={() => onOpen(b)}>
                      <span class="ow-bk-time">{fmtHHMM(pos.start)}–{fmtHHMM(pos.end)}</span>
                      <span class="ow-bk-who ellipsis">{b.status === 'pending' ? '⏳ ' : block ? '🔒 ' : ''}{who}</span>
                      {!short && !block && b.status === 'confirmed' && b.price !== null && <span class="ow-bk-price">{fmtPrice(b.price)}</span>}
                      {!short && b.status === 'pending' && <span class="ow-bk-cta">Responder</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {showNow && <div class="ow-now" style={`top:${top(nowMin!)}`} aria-hidden="true"><i /></div>}
        </div>
      </div>
    </div>
  );
}

