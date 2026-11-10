import { useEffect, useState } from 'preact/hooks';
import type { Profile } from '../../shared/supabase';
import { Sheet } from '../../shared/ui/Sheet';
import { fmtDate } from '../../shared/text';
import { loadMyCommunities } from '../home/api';
import type { MyComm } from '../home/model';
import { createMatchFromBooking, linkBookingMatch, loadLinkableMatches } from './api';
import { bookingErrorText, bookingWhen, startsDiffer, whenLocal, type LinkableMatch, type MyBooking } from './model';

/**
 * Reserva confirmada → partido. `create`: crea la convocatoria con el horario de la reserva y la cancha del complejo en uno de mis grupos.
 * `link`: la vincula a un partido que ya existe. Solo se ofrecen los grupos donde soy admin.
 * `onDone(href?, warn?)`: terminó bien; con `href` (hash del partido nuevo) la pantalla navega ahí; `warn` es un aviso para mostrar (p. ej. la hora no coincide).
 */
export function BookingMatchSheet({ booking, mode, me, onClose, onDone }: {
  booking: MyBooking; mode: 'create' | 'link'; me: Profile; onClose: () => void; onDone: (href?: string, warn?: string) => void;
}) {
  const [comms, setComms] = useState<MyComm[] | null>(null);
  const [cid, setCid] = useState('');
  const [title, setTitle] = useState('Partido');
  const [slots, setSlots] = useState(10);
  const [matches, setMatches] = useState<LinkableMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [partial, setPartial] = useState<{ href: string; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    loadMyCommunities(me.id).then(l => {
      if (!alive) return;
      const admin = l.filter(r => r.role !== 'member');
      setComms(admin);
      if (admin.length === 1) setCid(admin[0].community.id);
    }, (e: unknown) => { if (alive) { setComms([]); setErr(bookingErrorText(e)); } });
    return () => { alive = false; };
  }, [me.id]);

  useEffect(() => {
    if (mode !== 'link' || !cid) return;
    let alive = true;
    setMatches(null);
    loadLinkableMatches(cid).then(m => alive && setMatches(m), (e: unknown) => { if (alive) { setMatches([]); setErr(bookingErrorText(e)); } });
    return () => { alive = false; };
  }, [mode, cid]);

  const comm = comms?.find(r => r.community.id === cid)?.community;

  const create = async () => {
    if (!comm) return;
    setBusy(true); setErr('');
    try {
      const matchId = await createMatchFromBooking({ booking, communityId: comm.id, meId: me.id, title: title.trim(), slots });
      onDone(`c/${comm.slug}/m/${matchId}`);
    } catch (e) {
      const matchId = (e as { matchId?: string } | null)?.matchId;
      if (matchId) setPartial({ href: `#/c/${comm.slug}/m/${matchId}`, msg: `El partido se creó, pero no pudimos vincularlo a la reserva. ${bookingErrorText(e)}` });
      else setErr(bookingErrorText(e));
    }
    setBusy(false);
  };

  const link = async (m: LinkableMatch) => {
    setBusy(true); setErr('');
    try {
      await linkBookingMatch(booking.id, m.id);
      // Vincular le pone al partido la cancha del complejo, pero no le cambia la hora: si no coincide, se avisa.
      onDone(undefined, startsDiffer(booking.starts_at, m.starts_at)
        ? `Ojo: el partido es ${whenLocal(m.starts_at)} y la reserva ${bookingWhen(booking)}. Editá la hora del partido para que coincidan.`
        : undefined);
    }
    catch (e) { setErr(bookingErrorText(e)); }
    setBusy(false);
  };

  return (
    <Sheet title={mode === 'create' ? 'Crear partido con esta reserva' : 'Vincular a un partido'} onClose={onClose} busy={busy}>
      <div class="cn-sheet">
        <p class="cn-sheet-bk"><b>{booking.complex_name}</b><span class="muted"> · {booking.field_name} · {bookingWhen(booking)}</span></p>

        {partial ? (
          <div class="cn-note" role="alert"><span aria-hidden="true">⚠️</span><p>{partial.msg}</p>
            <a class="btn sm primary" href={partial.href} onClick={() => onDone()}>Ver partido</a></div>
        ) : comms === null ? <p class="muted">Cargando tus grupos…</p> : comms.length === 0 ? (
          <div class="cn-note"><span aria-hidden="true">👥</span>
            <p>Para armar un partido tenés que ser admin de un grupo. Creá uno desde Inicio o pedile a un admin que lo arme.</p></div>
        ) : <>
          {comms.length > 1 ? (
            <fieldset class="cn-comms">
              <legend>¿Para qué grupo?</legend>
              {comms.map(r => (
                <button type="button" class={`cn-comm${r.community.id === cid ? ' on' : ''}`} aria-pressed={r.community.id === cid} onClick={() => { setCid(r.community.id); setErr(''); }}>
                  <span class="ellipsis">{r.community.name}</span><span aria-hidden="true">{r.community.id === cid ? '✓' : ''}</span>
                </button>
              ))}
            </fieldset>
          ) : <p class="cn-one-comm">Grupo: <b>{comms[0].community.name}</b></p>}

          {mode === 'create' && cid && <>
            <label class="field"><span>Título</span><input value={title} maxLength={80} onInput={e => setTitle((e.target as HTMLInputElement).value)} /></label>
            <label class="field"><span>Cupos</span><input type="number" min={2} max={40} value={slots} onInput={e => setSlots(+(e.target as HTMLInputElement).value)} /></label>
            <p class="muted cn-fine">Lo armamos con la fecha y la hora de la reserva, y {booking.complex_name} queda como la cancha del partido.</p>
            <button type="button" class="btn primary block" disabled={busy || !title.trim() || slots < 2 || slots > 40} onClick={create}>
              {busy ? 'Creando…' : 'Crear partido'}
            </button>
          </>}

          {mode === 'link' && cid && <>
            {matches === null && <p class="muted">Buscando partidos…</p>}
            {matches && !matches.length && <p class="muted">No hay partidos convocados en este grupo. Podés crear uno nuevo con esta reserva.</p>}
            {matches && matches.length > 0 && (
              <ul class="cn-matches">
                {matches.map(m => (
                  <li><button type="button" disabled={busy} onClick={() => link(m)}>
                    <span class="cn-match-main"><b class="ellipsis">{m.title}</b><small class="muted ellipsis">{fmtDate(m.starts_at)}{m.location ? ` · ${m.location}` : ''}</small></span>
                    <span class="cn-match-go">Vincular</span>
                  </button></li>
                ))}
              </ul>
            )}
          </>}
        </>}
        {err && <p class="err" role="alert">{err}</p>}
      </div>
    </Sheet>
  );
}
