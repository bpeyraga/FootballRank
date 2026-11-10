// Canchas y reservas (lado del jugador): la única puerta a la base de esta funcionalidad. Tiran Error con el mensaje del servidor
// (los códigos de las funciones: slot_taken, closed, past…; model.ts los traduce).
import { must, sb } from '../../shared/supabase';
import { createMatch } from '../matches/api';
import { MAX_RADIUS, isMissingCourts, type Complex, type ComplexRow, type Field, type LinkableMatch, type MyBooking } from './model';
import type { Busy, HoursRow } from './slots';

const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Complejos activos cerca de un punto, por distancia (hasta 100). Una sola consulta con el radio máximo: los radios chicos se arman filtrando. */
export async function searchComplexes(lat: number, lng: number, km: number = MAX_RADIUS): Promise<ComplexRow[]> {
  const data = must(await sb.rpc('search_complexes', { p_lat: lat, p_lng: lng, p_km: km, p_limit: 100 })) as any[] | null;
  return (data ?? []).map(r => ({
    ...r, km: Number(r.km), lat: Number(r.lat), lng: Number(r.lng),
    sizes: ((r.sizes ?? []) as unknown[]).map(Number), min_price: num(r.min_price),
  })) as ComplexRow[];
}

/** Zona horaria y horarios de varios complejos (para el cartel "Abierto ahora" de la lista). */
export async function loadOpenMeta(ids: string[]): Promise<Map<string, { tz: string; hours: HoursRow[] }>> {
  const out = new Map<string, { tz: string; hours: HoursRow[] }>();
  if (!ids.length) return out;
  const [h, c] = await Promise.all([
    sb.from('complex_hours').select('complex_id,weekday,opens,closes').in('complex_id', ids),
    sb.from('complexes').select('id,tz').in('id', ids),
  ]);
  for (const x of must(c) ?? []) out.set(x.id, { tz: x.tz, hours: [] });
  for (const x of (must(h) ?? []) as (HoursRow & { complex_id: string })[]) out.get(x.complex_id)?.hours.push({ weekday: x.weekday, opens: x.opens, closes: x.closes });
  return out;
}

export interface ComplexBundle { complex: Complex; fields: Field[]; hours: HoursRow[] }

const COMPLEX_COLS = 'id,name,description,address,city,lat,lng,maps_url,phone,whatsapp,photo_url,amenities,slot_minutes,tz';

/** Un complejo con sus canchas activas y sus horarios. null si no existe (o ya no está activo). */
export async function loadComplex(id: string): Promise<ComplexBundle | null> {
  const [c, f, h] = await Promise.all([
    sb.from('complexes').select(COMPLEX_COLS).eq('id', id).maybeSingle(),
    sb.from('fields').select('id,complex_id,name,size,surface,roofed,price').eq('complex_id', id).eq('active', true).order('name'),
    sb.from('complex_hours').select('weekday,opens,closes').eq('complex_id', id),
  ]);
  const complex = must(c) as any;
  if (!complex) return null;
  return {
    complex: { ...complex, lat: num(complex.lat), lng: num(complex.lng), amenities: complex.amenities ?? [], slot_minutes: Number(complex.slot_minutes) || 60 },
    fields: ((must(f) ?? []) as any[]).map(x => ({ ...x, size: Number(x.size), price: num(x.price) })),
    hours: ((must(h) ?? []) as any[]).map(x => ({ weekday: Number(x.weekday), opens: x.opens, closes: x.closes })),
  };
}

/** Lo ocupado (confirmado o pendiente, sin datos de nadie) en un rango de hasta 14 días. */
export async function loadBusy(complexId: string, fromIso: string, toIso: string): Promise<Busy[]> {
  return (must(await sb.rpc('complex_busy', { p_complex: complexId, p_from: fromIso, p_to: toIso })) ?? []) as Busy[];
}

export interface BookingRequest { fieldId: string; startsAt: string; minutes: number; note: string }
/** Pide un turno (para mí). Devuelve el id de la reserva. */
export async function requestBooking(r: BookingRequest): Promise<string> {
  return must(await sb.rpc('request_booking', {
    p_field: r.fieldId, p_starts: r.startsAt, p_minutes: r.minutes, p_note: r.note.trim() || null,
  })) as string;
}

const normBooking = (r: any): MyBooking => ({ ...r, price: num(r.price) });

/** Mis reservas y las de mis grupos: las que terminaron en los últimos `days` días y las que vienen. */
export async function loadMyBookings(days = 90): Promise<MyBooking[]> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString();
  return ((must(await sb.rpc('my_bookings', { p_from: from })) ?? []) as any[]).map(normBooking);
}

/** Las de hoy en adelante (liviana: para la tarjeta de Inicio). */
export async function loadUpcomingBookings(): Promise<MyBooking[]> {
  return ((must(await sb.rpc('my_bookings')) ?? []) as any[]).map(normBooking);
}

export async function cancelBooking(id: string): Promise<void> {
  must(await sb.rpc('cancel_booking', { p_booking: id }));
}

// ---------- Reserva ↔ partido ----------

export async function linkBookingMatch(bookingId: string, matchId: string): Promise<void> {
  must(await sb.rpc('link_booking_match', { p_booking: bookingId, p_match: matchId }));
}
export async function unlinkBookingMatch(bookingId: string): Promise<void> {
  must(await sb.rpc('unlink_booking_match', { p_booking: bookingId }));
}

/** De cada partido vinculado: el título y el slug de su comunidad (para armar el link). Los que no se puedan leer no aparecen. */
export async function loadMatchLinks(matchIds: string[]): Promise<Map<string, { slug: string; title: string }>> {
  const out = new Map<string, { slug: string; title: string }>();
  if (!matchIds.length) return out;
  const data = must(await sb.from('matches').select('id,title,community:communities(slug)').in('id', matchIds)) as any[] | null;
  for (const m of data ?? []) if (m.community?.slug) out.set(m.id, { slug: m.community.slug, title: m.title });
  return out;
}

/** Partidos de la comunidad que todavía se pueden vincular (convocados, desde hace 3 h en adelante). */
export async function loadLinkableMatches(communityId: string): Promise<LinkableMatch[]> {
  const since = new Date(Date.now() - 3 * 3_600_000).toISOString();
  return (must(await sb.from('matches').select('id,title,starts_at,location,status').eq('community_id', communityId)
    .in('status', ['open', 'closed']).gte('starts_at', since).order('starts_at').limit(30)) ?? []) as LinkableMatch[];
}

/**
 * La cancha del grupo para el complejo de una reserva (la crea si falta) y el texto de lugar que va a llevar el partido:
 * `ensure_complex_venue` (quien pidió el turno y admin del grupo). null si esa función todavía no existe en la base.
 */
async function ensureComplexVenue(bookingId: string, communityId: string): Promise<{ venueId: string; location: string } | null> {
  const { data, error } = await sb.rpc('ensure_complex_venue', { p_booking: bookingId, p_community: communityId });
  if (error) {
    if (isMissingCourts(error)) return null; // la función no está: se sigue como antes (el vínculo pone la cancha)
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { venue_id?: string; location?: string } | null;
  return row?.venue_id ? { venueId: row.venue_id, location: row.location ?? '' } : null;
}

export interface MatchFromBooking { booking: MyBooking; communityId: string; meId: string; title: string; slots: number }
/**
 * "Crear partido con esta reserva": primero asegura la cancha del grupo, crea la convocatoria ya con esa cancha y ese lugar (así sale un
 * solo aviso, el de "Nuevo partido") y después la vincula: link_booking_match no cambia nada porque cancha y lugar ya coinciden.
 * Sin `ensure_complex_venue` en la base, crea el partido con el nombre del complejo y deja que el vínculo ponga la cancha.
 * Devuelve el id del partido. Si la vinculación falla, el partido queda creado: `matchId` viaja en el error para poder avisarlo.
 */
export async function createMatchFromBooking(v: MatchFromBooking): Promise<string> {
  const venue = await ensureComplexVenue(v.booking.id, v.communityId);
  const matchId = await createMatch({
    communityId: v.communityId, meId: v.meId, title: v.title, startsAt: v.booking.starts_at, slots: v.slots,
    venueId: venue?.venueId ?? null, location: (venue?.location || v.booking.complex_name).slice(0, 200),
  });
  try { await linkBookingMatch(v.booking.id, matchId); }
  catch (e) { throw Object.assign(e instanceof Error ? e : new Error(String(e)), { matchId }); }
  return matchId;
}
