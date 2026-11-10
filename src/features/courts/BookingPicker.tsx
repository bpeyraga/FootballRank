import { useEffect, useMemo, useState } from 'preact/hooks';
import { requestBooking } from './api';
import { bookingErrorText, bookingPrice, fmtPrice, sizeLabel, surfaceLabel, type Complex, type Field } from './model';
import {
  buildSlots, dayIsOpen, dayLong, durationOptions, dayName, firstBookableDay, fmtDuration, fmtRange, localParts, MONTH_SHORT, nextDays, safeTz, stepOf, todayKey,
  type HoursRow, type Slot,
} from './slots';
import { useBusy } from './useCourts';

/** "Reservá tu turno": día, cancha, duración y horario; "Pedir reserva" manda el pedido al dueño (request_booking). */
export function BookingPicker({ complex, fields, hours }: { complex: Complex; fields: Field[]; hours: HoursRow[] }) {
  const tz = safeTz(complex.tz);
  const step = stepOf(complex.slot_minutes);
  // "Ahora": se actualiza cada minuto y al volver a la pestaña, así una pantalla que quedó abierta pasada la medianoche
  // (o un rato largo) no muestra el día de ayer ni turnos que ya empezaron.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const t = setInterval(tick, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    addEventListener('focus', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); removeEventListener('focus', tick); };
  }, []);
  const today = todayKey(nowMs, tz);
  const days = useMemo(() => nextDays(nowMs, tz), [tz, today]); // se recalcula solo cuando cambia la fecha del complejo
  const durations = useMemo(() => durationOptions(complex.slot_minutes), [complex.slot_minutes]);
  const initialMinutes = durations[0];
  const [minutes, setMinutes] = useState<number>(initialMinutes);
  const [dayPick, setDayPick] = useState<string>(() => days[Math.max(0, firstBookableDay(days, { hours, tz, minutes: initialMinutes, step, nowMs }))]?.key ?? '');
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [pick, setPick] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ text: string } | null>(null);

  const day = days.find(d => d.key === dayPick) ?? days[0]; // si el día elegido ya pasó (cruzó la medianoche), vuelve a hoy
  const field = fields.find(f => f.id === fieldId) ?? fields[0];
  const { busy, err: busyErr, refresh } = useBusy(complex.id, day, tz);

  const slots = useMemo<Slot[]>(
    () => (busy && day && field ? buildSlots({ day, hours, tz, fieldId: field.id, busy, minutes, step, nowMs }) : []),
    [busy, day, field?.id, hours, tz, minutes, step, nowMs],
  );
  const chosen = slots.find(s => s.startMs === pick && s.state !== 'busy') ?? null;
  const price = field ? bookingPrice(field.price, minutes) : null;
  const dayOpen = !!day && dayIsOpen(hours, day, nowMs, tz);
  const free = slots.filter(s => s.state !== 'busy').length;

  if (!fields.length || !hours.length) return (
    <div class="cn-note"><span aria-hidden="true">🛠️</span>
      <p>{!fields.length ? 'Este complejo todavía no cargó sus canchas.' : 'Este complejo todavía no cargó sus horarios.'} Escribile o llamalo para reservar.</p></div>
  );

  const send = async () => {
    if (!chosen || !field) return;
    setSending(true); setErr('');
    try {
      await requestBooking({ fieldId: field.id, startsAt: new Date(chosen.startMs).toISOString(), minutes, note });
      setDone({ text: `${field.name} · ${dayLong(localParts(chosen.startMs, tz))}, ${fmtRange(chosen.startMs, chosen.endMs, tz)}` });
      setPick(null); setNote('');
    } catch (e) { setErr(bookingErrorText(e)); }
    refresh(); // sea que salió bien o que el horario se ocupó: la grilla se actualiza
    setSending(false);
  };

  if (done) return (
    <div class="cn-done" role="status">
      <span class="cn-done-ico" aria-hidden="true">✅</span>
      <b>¡Pedido enviado!</b>
      <p>{done.text}</p>
      <p class="muted">{complex.name} lo va a confirmar o rechazar y te avisamos. Lo ves en «Mis reservas».</p>
      <div class="cn-done-btns">
        <a class="btn primary" href="#/mis-reservas">Ver mis reservas</a>
        <button type="button" class="btn" onClick={() => setDone(null)}>Pedir otro horario</button>
      </div>
    </div>
  );

  return (
    <div class="cn-picker">
      <div class="cn-step"><b>1</b><span>Día</span></div>
      <div class="cn-days" role="group" aria-label="Día">
        {days.map(d => {
          const open = dayIsOpen(hours, d, nowMs, tz);
          return (
            <button type="button" class={`cn-day${d.key === day?.key ? ' on' : ''}`} disabled={!open} aria-pressed={d.key === day?.key}
              aria-label={`${dayLong(d)}${open ? '' : ', cerrado'}`} onClick={() => { setDayPick(d.key); setErr(''); }}>
              <span>{dayName(d, true)}</span><b>{d.d}</b><small>{open ? MONTH_SHORT[d.m - 1] : 'cerrado'}</small>
            </button>
          );
        })}
      </div>

      {fields.length > 1 && <>
        <div class="cn-step"><b>2</b><span>Cancha</span></div>
        <div class="cn-chips" role="group" aria-label="Cancha">
          {fields.map(f => (
            <button type="button" class={`cn-fchip${f.id === field?.id ? ' on' : ''}`} aria-pressed={f.id === field?.id} onClick={() => { setFieldId(f.id); setErr(''); }}>
              <b>{f.name}</b><small>{sizeLabel(f.size)} · {surfaceLabel(f.surface)}{f.roofed ? ' · techada' : ''}</small>
            </button>
          ))}
        </div>
      </>}

      {durations.length > 1 && <>
        <div class="cn-step"><b>{fields.length > 1 ? 3 : 2}</b><span>Duración</span></div>
        <div class="cn-chips" role="group" aria-label="Duración">
          {durations.map(m => {
            const p = field ? bookingPrice(field.price, m) : null;
            return (
              <button type="button" class={`cn-dchip${m === minutes ? ' on' : ''}`} aria-pressed={m === minutes} onClick={() => { setMinutes(m); setErr(''); }}>
                <b>{fmtDuration(m)}</b>{p != null && <small>{fmtPrice(p)}</small>}
              </button>
            );
          })}
        </div>
      </>}

      <div class="cn-step">
        <b>{1 + (fields.length > 1 ? 1 : 0) + (durations.length > 1 ? 1 : 0) + 1}</b>
        <span>Horario{day ? ` · ${dayLong(day)}` : ''}{durations.length === 1 ? ` · turnos de ${fmtDuration(minutes)}` : ''}</span>
      </div>
      {!dayOpen && <p class="muted cn-empty-slots">Ese día el complejo está cerrado. Elegí otro.</p>}
      {dayOpen && busy === null && !busyErr && <div class="cn-slots" aria-hidden="true">{Array.from({ length: 8 }, () => <i class="cn-slot sk" />)}</div>}
      {busyErr && (
        <div class="cn-note"><span aria-hidden="true">⚠️</span><p>{busyErr}</p><button type="button" class="btn sm" onClick={refresh}>Reintentar</button></div>
      )}
      {dayOpen && busy && !slots.length && (
        <p class="muted cn-empty-slots">{day.offset === 0 ? 'Ya no quedan turnos para hoy con esa duración.' : 'No hay turnos con esa duración ese día.'} Probá otro día o una duración más corta.</p>
      )}
      {dayOpen && busy && slots.length > 0 && <>
        <div class="cn-slots" role="group" aria-label="Horarios">
          {slots.map(s => (
            <button type="button" class={`cn-slot ${s.state}${chosen?.startMs === s.startMs ? ' on' : ''}`} disabled={s.state === 'busy'} aria-pressed={chosen?.startMs === s.startMs}
              aria-label={`${s.label}${s.nextDay ? ' (pasada la medianoche)' : ''}${s.state === 'busy' ? ', ocupado' : s.state === 'pending' ? ', con un pedido pendiente' : ''}`}
              onClick={() => { setPick(s.startMs); setErr(''); }}>
              {s.label}{s.nextDay && <small>+1 día</small>}
            </button>
          ))}
        </div>
        <ul class="cn-legend" aria-hidden="true">
          <li><i class="free" />Libre</li><li><i class="pending" />Con pedido pendiente</li><li><i class="busy" />Ocupado</li>
        </ul>
        {free === 0 && <p class="muted cn-empty-slots">Todo ocupado ese día. Probá otro día.</p>}
      </>}

      {chosen && field && (
        <div class="cn-sum">
          <div class="cn-sum-main">
            <b>{field.name} <span class="muted">· {sizeLabel(field.size)}</span></b>
            <span>{dayLong(localParts(chosen.startMs, tz))}</span>
            <span><b>{fmtRange(chosen.startMs, chosen.endMs, tz)}</b> · {fmtDuration(minutes)}</span>
          </div>
          <b class="cn-sum-price">{price != null ? fmtPrice(price) : 'Precio a consultar'}</b>
        </div>
      )}
      {chosen?.state === 'pending' && (
        <p class="cn-warn" role="status">⏳ Ya hay un pedido esperando en este horario. Si el complejo lo confirma primero, el tuyo no se puede aceptar. Podés pedirlo igual.</p>
      )}
      {chosen && (
        <label class="field cn-note-field"><span>Mensaje para el complejo (opcional)</span>
          <textarea rows={2} maxLength={300} value={note} placeholder="Somos 10, llevamos pelota…" onInput={e => setNote((e.target as HTMLTextAreaElement).value)} /></label>
      )}
      {err && <p class="err" role="alert">{err}</p>}
      <button type="button" class="btn primary block cn-send" disabled={!chosen || sending} onClick={send}>
        {sending ? 'Enviando…' : chosen ? 'Pedir reserva' : 'Elegí un horario'}
      </button>
      <p class="muted cn-fine">Es un pedido: el complejo lo confirma o lo rechaza y te avisamos. El pago lo arreglás directamente con el complejo.</p>
    </div>
  );
}
