import { useState } from 'preact/hooks';
import { Avatar } from '../../shared/ui/Avatar';
import { Sheet } from '../../shared/ui/Sheet';
import { cancelBooking, decideBooking } from './api';
import {
  STATUS_LABEL, cancelledLine, competingPending, durationMin, endMs, fmtDayLong, fmtDuration, fmtPrice, fmtRange, isBlock, localParts, ownerErrorText,
  pendingConflict, sizeLabel, startMs, type Booking, type Field,
} from './model';

/** Un turno o pedido en detalle, con lo que el dueño puede hacer: aceptar, rechazar, cancelar o liberar el horario. */
export function BookingSheet({ meId, b, all, fields, tz, now, onClose, onDone }: {
  meId: string; b: Booking; all: Booking[]; fields: Field[]; tz: string; now: number; onClose: () => void; onDone: () => void;
}) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const f = fields.find(x => x.id === b.field_id);
  const block = isBlock(b);
  const over = endMs(b) <= now;
  const conflict = pendingConflict(b, all);
  const rivals = competingPending(b, all);
  const cancelBy = cancelledLine(b, meId, now, tz);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await fn(); onDone(); } catch (e) { setErr(ownerErrorText(e)); setBusy(false); }
  };

  const title = block ? 'Horario bloqueado' : b.status === 'pending' ? 'Pedido de turno' : 'Turno';
  return (
    <Sheet title={title} onClose={onClose} busy={busy}>
      <div class="ow-bs ow-sheet">
        <div class="ow-bs-when">
          <b>{fmtDayLong(localParts(startMs(b), tz).date)}</b>
          <span>{fmtRange(startMs(b), endMs(b), tz)} · {fmtDuration(durationMin(b))}</span>
        </div>
        <span class={`ow-pill st-${block ? 'block' : b.status}`}>{block ? 'Bloqueo' : STATUS_LABEL[b.status]}</span>
        {cancelBy && <p class="ow-cancelby" role="status"><span aria-hidden="true">🚫 </span>{cancelBy}</p>}

        <dl class="ow-dl">
          <dt>Cancha</dt><dd>{f ? `${f.name} · ${sizeLabel(f.size)}` : 'Cancha'}</dd>
          {!block && b.price !== null && <><dt>Precio</dt><dd>{fmtPrice(b.price)}</dd></>}
        </dl>

        {!block && (
          <div class="ow-who">
            <Avatar p={{ name: b.requester_name ?? '?', photo_url: b.requester_photo }} size={42} />
            <div>
              <b>{b.requester_name ?? 'Jugador'}</b>
              {b.community_name && <small class="muted">Para el grupo {b.community_name}</small>}
            </div>
          </div>
        )}
        {b.note && <blockquote class="ow-quote">{b.note}</blockquote>}
        {b.owner_note && b.status !== 'pending' && <p class="muted ow-ownernote"><b>Tu mensaje:</b> {b.owner_note}</p>}

        {conflict && (
          <p class="ow-warn" role="alert">
            Este pedido se pisa con un turno ya confirmado ({fmtRange(startMs(conflict), endMs(conflict), tz)}). No se puede aceptar: rechazalo o cancelá el otro turno antes.
          </p>
        )}
        {!conflict && rivals.length > 0 && (
          <p class="ow-warn soft" role="status">
            {rivals.length === 1 ? 'Hay otro pedido' : `Hay otros ${rivals.length} pedidos`} para ese mismo horario. Si aceptás este, después tenés que rechazar {rivals.length === 1 ? 'el otro' : 'los otros'}.
          </p>
        )}

        {b.status === 'pending' && (
          <>
            <label class="field"><span>Mensaje para el jugador <span class="muted">(opcional)</span></span>
              <textarea rows={2} maxLength={300} value={msg} placeholder="Ej.: Te esperamos, traé pecheras / Ese horario ya está reservado"
                disabled={busy} onInput={e => setMsg((e.target as HTMLTextAreaElement).value)} /></label>
            <div class="ow-actions">
              {!over && <button class="btn primary" disabled={busy || !!conflict} onClick={() => run(() => decideBooking(b.id, true, msg))}>Aceptar turno</button>}
              <button class="btn danger" disabled={busy} onClick={() => run(() => decideBooking(b.id, false, msg))}>Rechazar</button>
            </div>
            {over && <p class="muted ow-hint">Este pedido ya pasó de fecha sin respuesta: solo se puede rechazar.</p>}
          </>
        )}

        {b.status === 'confirmed' && !over && (
          block ? (
            <div class="ow-actions">
              <button class="btn danger" disabled={busy} onClick={() => run(() => cancelBooking(b.id, ''))}>Liberar horario</button>
            </div>
          ) : (
            <>
              <label class="field"><span>Motivo de la cancelación <span class="muted">(se lo mostramos al jugador)</span></span>
                <textarea rows={2} maxLength={300} value={msg} placeholder="Ej.: Se rompió la iluminación"
                  disabled={busy} onInput={e => setMsg((e.target as HTMLTextAreaElement).value)} /></label>
              <div class="ow-actions">
                <button class="btn danger" disabled={busy}
                  onClick={() => { if (confirm('¿Cancelar este turno? Le vamos a avisar al jugador.')) void run(() => cancelBooking(b.id, msg)); }}>
                  Cancelar turno
                </button>
              </div>
            </>
          )
        )}
        {err && <p class="err" role="alert">{err}</p>}
      </div>
    </Sheet>
  );
}
