import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Profile } from '../../shared/supabase';
import { go } from '../../app/router';
import { directionsUrl } from '../venues/maps';
import { loadMatchLinks } from './api';
import { BookingMatchSheet } from './BookingMatchSheet';
import {
  bookingErrorText, bookingMinutes, bookingWhen, canCancel, canUseForMatch, contactWhatsapp, fmtPrice, splitBookings, statusLabel, telUrl, type MyBooking,
} from './model';
import { DOW_SHORT, MONTH_SHORT, fmtDuration } from './slots';
import { useMyBookings } from './useCourts';

type SheetState = { booking: MyBooking; mode: 'create' | 'link' } | null;
const PAST_SHOWN = 8;

/** "Mis reservas" (#/mis-reservas): las que pedí y las de mis grupos, con su estado; cancelar y armar el partido con una confirmada. */
export function MyBookings({ me }: { me: Profile }) {
  const { list, err, reload, cancel, unlink } = useMyBookings();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [allPast, setAllPast] = useState(false);
  const [links, setLinks] = useState<Map<string, { slug: string; title: string }>>(new Map());

  const { upcoming, past } = useMemo(() => splitBookings(list ?? [], Date.now()), [list]);
  const matchIds = useMemo(() => [...new Set((list ?? []).map(b => b.match_id).filter((x): x is string => !!x))].sort(), [list]);
  const idsKey = matchIds.join(',');
  useEffect(() => {
    if (!matchIds.length) { setLinks(new Map()); return; }
    let alive = true;
    loadMatchLinks(matchIds).then(m => alive && setLinks(m), () => {});
    return () => { alive = false; };
  }, [idsKey]);

  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id); setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); }
    catch (e) { setMsg({ tone: 'err', text: bookingErrorText(e) }); }
    setBusy('');
  };
  const doCancel = (b: MyBooking) => {
    if (!confirm(`¿Cancelar tu reserva en ${b.complex_name} (${bookingWhen(b)})?`)) return;
    run(b.id, () => cancel(b.id), 'Reserva cancelada.');
  };
  const doUnlink = (b: MyBooking) => {
    if (!confirm('¿Desvincular la reserva del partido? El partido no se borra.')) return;
    run(b.id, () => unlink(b.id), 'Reserva desvinculada del partido.');
  };
  const sheetDone = (href?: string, warn?: string) => {
    setSheet(null);
    if (href) { go(href); return; }
    setMsg(warn ? { tone: 'warn', text: warn } : { tone: 'ok', text: 'Listo: la reserva quedó vinculada al partido.' });
    reload();
  };

  const card = (b: MyBooking) => (
    <Card b={b} busy={busy === b.id} link={b.match_id ? links.get(b.match_id) : undefined}
      onCancel={() => doCancel(b)} onUnlink={() => doUnlink(b)}
      onMatch={mode => { setMsg(null); setSheet({ booking: b, mode }); }} />
  );
  const shownPast = allPast ? past : past.slice(0, PAST_SHOWN);

  return (
    <div class="wrap cn-page cn-bk-page">
      <a class="muted cn-back" style="display:inline-block" href="#/">← Inicio</a>
      <header class="cn-bk-head">
        <div>
          <span class="cn-kicker cn-kicker-dark">Canchas</span>
          <h2>Mis reservas</h2>
        </div>
        <a class="btn primary" href="#/canchas">🏟️ Buscar cancha</a>
      </header>

      {msg && <p class={msg.tone === 'ok' ? 'cn-ok' : msg.tone === 'warn' ? 'cn-warn' : 'err'} role={msg.tone === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
      {err && (
        <div class="card cn-empty" role="alert"><p class="err" style="margin:0 0 12px">{err}</p><button type="button" class="btn" onClick={reload}>Reintentar</button></div>
      )}
      {list === null && !err && <div class="cn-skeleton" aria-hidden="true">{[0, 1].map(() => <div class="cn-sk cn-sk-bk" />)}</div>}

      {list && !upcoming.length && !past.length && !err && (
        <div class="card cn-empty">
          <span class="cn-empty-ico" aria-hidden="true">📅</span>
          <b>Todavía no pediste ninguna reserva</b>
          <p class="muted">Buscá una cancha cerca tuyo, elegí el horario y pedí el turno. Cuando el complejo lo confirme, armás el partido con tu grupo.</p>
          <a class="btn primary" href="#/canchas">Buscar cancha</a>
        </div>
      )}

      {upcoming.length > 0 && <>
        <div class="section-head"><h3>Próximas</h3><span class="muted">{upcoming.length}</span></div>
        <div class="cn-bk-list">{upcoming.map(card)}</div>
      </>}
      {list && upcoming.length === 0 && past.length > 0 && <p class="muted" style="margin-bottom:16px">No tenés reservas próximas.</p>}

      {past.length > 0 && <>
        <div class="section-head"><h3>Historial</h3><span class="muted">{past.length}</span></div>
        <div class="cn-bk-list">{shownPast.map(card)}</div>
        {past.length > PAST_SHOWN && !allPast && <button type="button" class="btn block" onClick={() => setAllPast(true)}>Ver las {past.length - PAST_SHOWN} anteriores</button>}
      </>}

      {sheet && <BookingMatchSheet booking={sheet.booking} mode={sheet.mode} me={me} onClose={() => setSheet(null)} onDone={sheetDone} />}
    </div>
  );
}

function Card({ b, busy, link, onCancel, onUnlink, onMatch }: {
  b: MyBooking; busy: boolean; link?: { slug: string; title: string };
  onCancel: () => void; onUnlink: () => void; onMatch: (mode: 'create' | 'link') => void;
}) {
  const now = Date.now();
  const s = new Date(b.starts_at);
  const useForMatch = canUseForMatch(b, now) && !b.match_id;
  const live = (b.status === 'pending' || b.status === 'confirmed') && Date.parse(b.ends_at) > now;
  const wa = contactWhatsapp({ whatsapp: b.complex_whatsapp, phone: b.complex_phone });
  const place = b.complex_address?.trim();
  return (
    <article class={`cn-bk st-${b.status}`}>
      <div class="cn-bk-date" aria-hidden="true"><span>{DOW_SHORT[s.getDay()]}</span><b>{s.getDate()}</b><span>{MONTH_SHORT[s.getMonth()]}</span></div>
      <div class="cn-bk-main">
        <div class="cn-bk-top">
          <a class="cn-bk-name ellipsis" href={`#/cancha/${b.complex_id}`}>{b.complex_name}</a>
          <span class={`cn-st ${b.status}`}>{statusLabel(b.status)}</span>
        </div>
        <span class="cn-bk-when">{b.field_name} · {bookingWhen(b)}</span>
        <span class="muted cn-bk-sub">
          {fmtDuration(bookingMinutes(b))}{b.price != null ? ` · ${fmtPrice(b.price)}` : ''}{!b.mine ? ' · Pedida por alguien de tu grupo' : ''}
        </span>
        {b.status === 'pending' && b.mine && <span class="muted cn-bk-hint">Esperando que el complejo la confirme.</span>}
        {b.status === 'rejected' && <span class="muted cn-bk-hint">El complejo no pudo darte ese horario. Probá con otro.</span>}
        {b.owner_note && (b.status === 'rejected' || b.status === 'cancelled') && <span class="cn-bk-reason"><b>Mensaje del complejo:</b> {b.owner_note}</span>}
        {b.note && b.mine && live && <span class="muted cn-bk-hint">Tu mensaje: {b.note}</span>}
        {b.match_id && link && <a class="cn-bk-match" href={`#/c/${link.slug}/m/${b.match_id}`}>⚽ {link.title} <span aria-hidden="true">›</span></a>}
        {b.match_id && !link && <span class="muted cn-bk-hint">⚽ Vinculada a un partido</span>}

        {live && (b.complex_phone || wa || place) && (
          <div class="cn-bk-contact">
            {place && <a href={directionsUrl({ name: b.complex_name, address: place, lat: null, lng: null })} target="_blank" rel="noopener">🧭 Cómo llegar</a>}
            {b.complex_phone && <a href={telUrl(b.complex_phone)}>📞 Llamar</a>}
            {wa && <a href={wa} target="_blank" rel="noopener">💬 WhatsApp</a>}
          </div>
        )}

        {(useForMatch || (b.match_id && b.mine && b.status === 'confirmed') || canCancel(b, now)) && (
          <div class="cn-bk-actions">
            {useForMatch && <button type="button" class="btn sm primary" disabled={busy} onClick={() => onMatch('create')}>⚽ Crear partido con esta reserva</button>}
            {useForMatch && <button type="button" class="btn sm" disabled={busy} onClick={() => onMatch('link')}>Vincular a un partido existente</button>}
            {b.match_id && b.mine && b.status === 'confirmed' && <button type="button" class="btn sm" disabled={busy} onClick={onUnlink}>Desvincular</button>}
            {canCancel(b, now) && <button type="button" class="btn sm danger" disabled={busy} onClick={onCancel}>{b.status === 'pending' ? 'Cancelar pedido' : 'Cancelar reserva'}</button>}
          </div>
        )}
      </div>
    </article>
  );
}
