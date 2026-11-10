import { useMemo, useState } from 'preact/hooks';
import { BlockSheet } from './BlockSheet';
import { BookingSheet } from './BookingSheet';
import { DayGrid } from './DayGrid';
import { Skeleton } from './ui';
import { useAgenda, useIsDesktop, useNow } from './useOwner';
import { WeekGrid } from './WeekGrid';
import {
  addDays, bookingsOfDay, dayCounts, dayHours, dayRevenue, dayWindow, fmtDayLong, fmtDayChip, fmtPrice, groupByDay, isActive, localParts, startOfWeek,
  today as todayOf, weekdayOf, zonedToUtc, STATUS_LABEL, fmtRange, startMs, endMs, type Booking, type ComplexData,
} from './model';

/** La agenda del complejo: el día con una columna por cancha (y la semana entera en pantallas anchas), con los pedidos por responder. */
export function AgendaView({ data, tick, pending, reloadAll }: { data: ComplexData; tick: number; pending: number; reloadAll: () => void }) {
  const { complex, fields, hours } = data;
  const tz = complex.tz;
  const now = useNow();
  const desktop = useIsDesktop();
  const todayStr = todayOf(tz, now);
  const [date, setDate] = useState(() => todayOf(tz));
  const [mode, setMode] = useState<'dia' | 'semana'>('dia');
  const [sel, setSel] = useState<Booking | null>(null);
  const [block, setBlock] = useState<{ fieldId?: string; startMin?: number } | null>(null);
  const view = desktop ? mode : 'dia';

  const weekStart = startOfWeek(date);
  // Se pide la semana entera (más un día antes y uno después por los turnos de madrugada): moverse por la semana no recarga.
  const fromMs = useMemo(() => zonedToUtc(addDays(weekStart, -1), 0, tz), [weekStart, tz]);
  const toMs = useMemo(() => zonedToUtc(addDays(weekStart, 8), 0, tz), [weekStart, tz]);
  const { bookings, err, loading, reload } = useAgenda(complex.id, fromMs, toMs, tick);
  const all = bookings ?? [];

  const done = () => { setSel(null); setBlock(null); reload(); reloadAll(); };
  /** "Bloquear horario" del encabezado: arranca en el próximo turno libre de hoy, o a la hora que abre ese día. */
  const openBlock = () => {
    const h = dayHours(hours, weekdayOf(date));
    let start = h ? h.open : 20 * 60;
    if (date === todayStr) {
      const step = complex.slot_minutes;
      const next = Math.ceil((localParts(now, tz).minutes + 1) / step) * step;
      if (!h || next >= h.open) start = next;
    }
    setBlock({ startMin: start });
  };

  const dayItems = useMemo(() => bookingsOfDay(date, all, hours, tz), [date, all, hours, tz]);
  const live = dayItems.filter(x => isActive(x.b));
  const dead = dayItems.filter(x => !isActive(x.b));
  const win = dayWindow(date, hours, live.map(x => x.pos));
  const cols = fields.filter(f => f.active || live.some(x => x.b.field_id === f.id));
  const counts = dayCounts(live.map(x => x.b));
  const revenue = dayRevenue(live.map(x => x.b));
  const byDay = useMemo(() => groupByDay(all, hours, tz), [all, hours, tz]);

  const move = (n: number) => setDate(d => addDays(d, view === 'semana' ? n * 7 : n));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const pendingOn = (d: string) => (byDay.get(d) ?? []).filter(b => b.status === 'pending' && b.kind === 'request').length;

  const title = view === 'semana'
    ? `${fmtDayChip(weekStart)} – ${fmtDayChip(addDays(weekStart, 6))}`
    : fmtDayLong(date);

  return (
    <div class="ow-agenda">
      {pending > 0 && (
        <a class="card note ow-alert" href={`#/duenio/${complex.id}/pedidos`}>
          <b>{pending === 1 ? 'Tenés 1 pedido de turno por responder' : `Tenés ${pending} pedidos de turno por responder`}</b>
          <span>Verlos →</span>
        </a>
      )}

      <div class="ow-bar">
        <div class="ow-nav">
          <button class="btn sm" aria-label={view === 'semana' ? 'Semana anterior' : 'Día anterior'} onClick={() => move(-1)}>‹</button>
          <button class="btn sm" disabled={date === todayStr} onClick={() => setDate(todayStr)}>Hoy</button>
          <button class="btn sm" aria-label={view === 'semana' ? 'Semana siguiente' : 'Día siguiente'} onClick={() => move(1)}>›</button>
        </div>
        <h3 class="ow-date" aria-live="polite">{title}</h3>
        {desktop && (
          <div class="ow-seg" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={mode === 'dia'} class={mode === 'dia' ? 'on' : ''} onClick={() => setMode('dia')}>Día</button>
            <button role="tab" aria-selected={mode === 'semana'} class={mode === 'semana' ? 'on' : ''} onClick={() => setMode('semana')}>Semana</button>
          </div>
        )}
        <button class="btn sm primary ow-blockbtn" disabled={!fields.some(f => f.active)} onClick={openBlock}>🔒 Bloquear horario</button>
      </div>

      {view === 'dia' && (
        <div class="ow-days" role="tablist" aria-label="Días de la semana">
          {week.map(d => {
            const p = pendingOn(d);
            return (
              <button role="tab" aria-selected={d === date} class={`ow-daychip${d === date ? ' on' : ''}${d === todayStr ? ' today' : ''}`} onClick={() => setDate(d)}>
                <span>{fmtDayChip(d).split(' ')[0]}</span><b>{+d.slice(8)}</b>
                {p > 0 && <i class="ow-dot" aria-label={`${p} por responder`} />}
              </button>
            );
          })}
        </div>
      )}

      {err && <p class="err" role="alert">{err} <button class="linkbtn" onClick={reload}>Reintentar</button></p>}
      {bookings === null && !err && <Skeleton rows={4} />}

      {bookings !== null && !fields.some(f => f.active) && (
        <div class="card ow-empty">
          <span class="ow-empty-ico" aria-hidden="true">⚽</span>
          <h3>Todavía no cargaste canchas</h3>
          <p class="muted">Para tener agenda, primero cargá tus canchas.</p>
          <a class="btn primary" href={`#/duenio/${complex.id}/canchas`}>Cargar canchas</a>
        </div>
      )}

      {bookings !== null && fields.some(f => f.active) && view === 'dia' && (
        <>
          <div class="ow-sum">
            <span><b>{counts.confirmed}</b> turno{counts.confirmed === 1 ? '' : 's'}</span>
            {counts.pending > 0 && <span class="ow-pill warn">{counts.pending} por responder</span>}
            {counts.blocks > 0 && <span class="muted">{counts.blocks} bloqueo{counts.blocks === 1 ? '' : 's'}</span>}
            {revenue > 0 && <span class="muted">{fmtPrice(revenue)} en turnos</span>}
            {loading && <span class="muted ow-sync">Actualizando…</span>}
          </div>
          {win.closed ? (
            <div class="card ow-empty">
              <span class="ow-empty-ico" aria-hidden="true">🔒</span>
              <h3>Cerrado este día</h3>
              <p class="muted">El complejo no abre los {fmtDayLong(date).split(' ')[0]}. Si querés abrir, cambialo en <a href={`#/duenio/${complex.id}/horarios`}>Horarios</a>.</p>
            </div>
          ) : (
            <DayGrid win={win} fields={cols} items={live} tz={tz} now={now} step={complex.slot_minutes}
              onOpen={setSel} onFree={(fieldId, startMin) => setBlock({ fieldId, startMin })} />
          )}
          {!win.closed && !live.length && <p class="muted ow-hint ow-tapfree">Sin turnos este día. Tocá un horario libre para bloquearlo.</p>}
          {dead.length > 0 && (
            <details class="ow-dead card">
              <summary>Cancelados y rechazados ({dead.length})</summary>
              <ul>
                {dead.map(({ b }) => (
                  <li><button class="linkbtn" onClick={() => setSel(b)}>{fmtRange(startMs(b), endMs(b), tz)}</button>
                    <span class="muted"> · {b.requester_name ?? 'Jugador'} · {STATUS_LABEL[b.status]}</span></li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {bookings !== null && fields.some(f => f.active) && view === 'semana' && (
        <WeekGrid weekStart={weekStart} byDay={byDay} fields={fields} hours={hours} tz={tz} today={todayStr} selected={date}
          onPickDay={d => { setDate(d); setMode('dia'); }} onOpen={setSel} />
      )}

      {sel && <BookingSheet b={sel} all={all} fields={fields} tz={tz} now={now} onClose={() => setSel(null)} onDone={done} />}
      {block && <BlockSheet complex={complex} fields={fields} date={date} init={block} onClose={() => setBlock(null)} onDone={done} />}
    </div>
  );
}
