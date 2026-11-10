// Canchas y reservas (lado del jugador): tipos y reglas puras (sin Supabase, sin Preact, sin red). Los horarios y turnos están en slots.ts.
import { fmtWhen, localParts, minutesBetween, safeTz } from './slots';

// ---------- Tipos (lo que devuelve la base) ----------

/** Una fila de search_complexes. */
export interface ComplexRow {
  id: string; name: string; address: string | null; city: string | null; lat: number; lng: number; photo_url: string | null;
  phone: string | null; /** Distancia real en km (1 decimal). */ km: number; sizes: number[]; min_price: number | null;
}

export interface Complex {
  id: string; name: string; description: string | null; address: string | null; city: string | null; lat: number | null; lng: number | null;
  maps_url: string | null; phone: string | null; /** Solo dígitos, con código de país (5491155551234). */ whatsapp: string | null;
  photo_url: string | null; amenities: string[]; slot_minutes: number; tz: string;
}

export type Surface = 'sintetico' | 'cesped' | 'cemento' | 'parquet';
export interface Field { id: string; complex_id: string; name: string; size: number; surface: Surface; roofed: boolean; price: number | null }

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
/** Una fila de my_bookings. `mine`: la pedí yo (si no, es de un grupo mío). */
export interface MyBooking {
  id: string; complex_id: string; complex_name: string; field_name: string; starts_at: string; ends_at: string;
  status: BookingStatus; price: number | null; community_id: string | null; match_id: string | null; mine: boolean;
  /** Mi nota al pedir, y la respuesta del complejo (motivo de un rechazo o una cancelación). */
  note?: string | null; owner_note?: string | null;
  /** Para contactar al complejo desde la reserva. */
  complex_address?: string | null; complex_phone?: string | null; complex_whatsapp?: string | null;
}

/** Desde dónde se busca. */
export interface Origin { label: string; lat: number; lng: number; source: 'zone' | 'search' | 'gps' }

// ---------- Constantes ----------

/** Radios del selector (km). La búsqueda se baja una vez con el máximo y se filtra acá. */
export const RADII = [2, 5, 10, 25] as const;
export const DEFAULT_RADIUS = 5;
export const MAX_RADIUS = RADII[RADII.length - 1];
/** Tamaños del filtro (jugadores por equipo). */
export const SIZES = [5, 7, 8, 11] as const;

export const ORIGIN_KEY = 'futrank-courts-origin';

// ---------- Textos ----------

/** "F5". */
export const sizeLabel = (n: number) => `F${n}`;
/** "F5 · F7 · F11". */
export const sizesLine = (sizes: number[]) => sizes.map(sizeLabel).join(' · ');

export const SURFACE: Record<Surface, string> = { sintetico: 'Sintético', cesped: 'Césped', cemento: 'Cemento', parquet: 'Parquet' };
export const surfaceLabel = (s: string) => SURFACE[s as Surface] ?? s;

/** Distancia legible: "600 m", "1,3 km", "12 km". */
export function fmtKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(50, Math.round(km * 10) * 100)} m`;
  return `${km < 10 ? String(Math.round(km * 10) / 10).replace('.', ',') : Math.round(km)} km`;
}

/** "$12.000" (con centavos solo si los hay). */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  // A mano (no toLocaleString): "es-AR" no agrupa los miles de 4 cifras ("1500") en todos los navegadores y acá siempre queremos "1.500".
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}$${grouped}${dec === '00' ? '' : `,${dec}`}`;
}

/** "Desde $12.000 / hora" (o "Consultá el precio" si el complejo no cargó ninguno). */
export const priceFrom = (min: number | null | undefined) => (min == null ? 'Consultá el precio' : `Desde ${fmtPrice(min)} / hora`);

/** Lo que cuesta reservar `minutes` de una cancha cuyo precio es por hora (igual que request_booking: redondeado a centavos). null si no tiene precio. */
export function bookingPrice(pricePerHour: number | null | undefined, minutes: number): number | null {
  if (pricePerHour == null || !Number.isFinite(pricePerHour)) return null;
  return Math.round(pricePerHour * minutes / 60 * 100) / 100;
}

/** Dirección corta para listas: "Av. Corrientes 1234, Palermo" (o lo que haya). */
export const placeLine = (c: Pick<Complex, 'address' | 'city'>) => [c.address, c.city].map(s => s?.trim()).filter(Boolean).join(', ');

export const STATUS_LABEL: Record<BookingStatus, string> = { pending: 'Pendiente', confirmed: 'Confirmada', rejected: 'Rechazada', cancelled: 'Cancelada' };
export const statusLabel = (s: string) => STATUS_LABEL[s as BookingStatus] ?? s;

// ---------- Teléfono ----------

/** "tel:" con solo los dígitos y el "+". */
export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/**
 * Link de WhatsApp (wa.me) a partir de un teléfono, SOLO si es seguro que es un celular argentino (un fijo no tiene WhatsApp):
 *   - internacional con el 9: "+54 9 11 5555 1234" o "5491155551234";
 *   - nacional con el 15: "011 15 5555-1234", "0221 15 555-1234" (un fijo tiene 10 cifras sin el 0; con el 15 son 12).
 * Todo lo demás ("011 4777-1234", "11 5555 1234", "+54 11 …", números de otro país) da null: no se puede saber si es celular.
 */
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  const raw = phone.replace(/\D/g, '');
  let mobile: string | null = null;
  if (/^549\d{10}$/.test(raw)) mobile = raw;
  else if (!phone.trim().startsWith('+')) {
    const d = raw.replace(/^0+/, '');
    if (/^\d{12}$/.test(d)) {
      // código de área de 2 cifras (11), 3 o 4, y después el 15 de los celulares
      const k = d.startsWith('11') ? 2 : d.slice(3, 5) === '15' ? 3 : 4;
      if (d.slice(k, k + 2) === '15') mobile = '549' + d.slice(0, k) + d.slice(k + 2);
    }
  }
  return mobile ? `https://wa.me/${mobile}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null;
}

/** WhatsApp de un complejo: el número que cargó como WhatsApp (solo dígitos, con código de país) o, si no, su teléfono cuando es claramente un celular. */
export function contactWhatsapp(c: { whatsapp?: string | null; phone?: string | null }, text?: string): string | null {
  const w = c.whatsapp?.replace(/\D/g, '') ?? '';
  if (w.length >= 8) return `https://wa.me/${w}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  return whatsappUrl(c.phone, text);
}

// ---------- Búsqueda ----------

export interface Filters { km: number; size: number | null }

/** Filtra por radio y tamaño (la lista ya viene ordenada por distancia). */
export function filterComplexes(rows: ComplexRow[], { km, size }: Filters): ComplexRow[] {
  return rows.filter(r => r.km <= km && (size == null || r.sizes.includes(size)));
}

/** Cuántas canchas hay dentro de cada radio (con el tamaño elegido), para los botones. */
export function countByRadius(rows: ComplexRow[], size: number | null): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of RADII) out[r] = filterComplexes(rows, { km: r, size }).length;
  return out;
}

/** Primer radio más grande que el actual donde aparecen más canchas que ahora ("probá ampliar el radio"). */
export function widerRadius(rows: ComplexRow[], km: number, size: number | null): number | null {
  const now = filterComplexes(rows, { km, size }).length;
  for (const r of RADII) if (r > km && filterComplexes(rows, { km: r, size }).length > now) return r;
  return null;
}

// ---------- Desde dónde busco (se recuerda en este dispositivo) ----------

/** Lee lo guardado: null si no hay o está dañado. */
export function parseOrigin(raw: string | null | undefined): Origin | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Origin>;
    const lat = Number(o.lat), lng = Number(o.lng);
    if (typeof o.label !== 'string' || !o.label.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { label: o.label.trim().slice(0, 60), lat, lng, source: o.source === 'zone' || o.source === 'gps' ? o.source : 'search' };
  } catch { return null; }
}

// ---------- Errores ----------

/** La función o la tabla todavía no existen (la migración no se aplicó). */
export const isMissingCourts = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === 'PGRST205' || x?.code === 'PGRST202' || x?.code === '42P01' || x?.code === '42883'
    || /could not find the (table|function)|relation .* does not exist|function .* does not exist/i.test(x?.message ?? '');
};

const ERRORS: [RegExp, string][] = [
  [/slot_taken|bookings_no_overlap|exclusion|conflicting key/i, 'Ese horario ya está reservado. Elegí otro.'],
  [/\bclosed\b/i, 'El complejo está cerrado en ese horario. Elegí uno dentro de sus horarios de apertura.'],
  [/\bpast\b/i, 'Ese horario ya pasó. Elegí uno más adelante.'],
  [/too_far/i, 'Solo se puede reservar hasta 60 días antes.'],
  [/bad_duration/i, 'Ese complejo no acepta esa duración. Elegí otra.'],
  [/bad_start/i, 'Ese horario no es válido: los turnos arrancan en punto o y media.'],
  [/^\s*duplicate\s*$/i, 'Ya pediste ese mismo horario en esa cancha. Lo ves en «Mis reservas».'],
  [/not_editable/i, 'Ese partido ya no se puede modificar (ya se jugó o se canceló).'],
  [/bad_coords/i, 'La ubicación no es válida. Elegí el lugar de nuevo.'],
  [/no_field/i, 'Esa cancha ya no está disponible.'],
  [/too_many_pending/i, 'Ya tenés 5 pedidos esperando respuesta. Esperá a que te contesten o cancelá alguno.'],
  [/not_member/i, 'Para reservar a nombre de un grupo tenés que ser miembro.'],
  [/not_active/i, 'Esa reserva ya no está activa.'],
  [/not_confirmed|not_confirm/i, 'La reserva todavía no está confirmada.'],
  [/already|linked|has_match/i, 'Esa reserva ya está vinculada a un partido.'],
  [/not_admin|forbidden/i, 'No tenés permiso para hacer eso.'],
  [/failed to fetch|network|load failed/i, 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.'],
];

/** Mensaje en español rioplatense para un error de las reservas (los códigos salen de las funciones de la base). */
export function bookingErrorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? String(e ?? '');
  if (isMissingCourts(e)) return 'Esta función todavía no está disponible. Probá de nuevo más tarde.';
  return ERRORS.find(([re]) => re.test(m))?.[1] ?? 'No se pudo completar. Probá de nuevo en un rato.';
}

// ---------- Mis reservas ----------

const isLive = (b: Pick<MyBooking, 'status' | 'ends_at'>, nowMs: number) =>
  (b.status === 'pending' || b.status === 'confirmed') && Date.parse(b.ends_at) > nowMs;

/** Próximas (pendientes o confirmadas que no terminaron, de la más cercana a la más lejana) e historial (el resto, de la más reciente). */
export function splitBookings(list: MyBooking[], nowMs: number): { upcoming: MyBooking[]; past: MyBooking[] } {
  const upcoming = list.filter(b => isLive(b, nowMs)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const past = list.filter(b => !isLive(b, nowMs)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return { upcoming, past };
}

/** Cancelar: solo quien la pidió, mientras está pendiente o confirmada y antes de que empiece. */
export const canCancel = (b: MyBooking, nowMs: number) =>
  b.mine && (b.status === 'pending' || b.status === 'confirmed') && Date.parse(b.starts_at) > nowMs;

/** Armar un partido (o vincularla a uno): solo quien la pidió, confirmada y sin terminar. */
export const canUseForMatch = (b: MyBooking, nowMs: number) => b.mine && b.status === 'confirmed' && Date.parse(b.ends_at) > nowMs;

/** La que sigue: la próxima confirmada y, si no hay, la próxima pendiente. null si no hay ninguna. */
export function nextBooking(list: MyBooking[], nowMs: number): MyBooking | null {
  const { upcoming } = splitBookings(list, nowMs);
  return upcoming.find(b => b.status === 'confirmed') ?? upcoming[0] ?? null;
}

const deviceTz = () => (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined);

/** "jue 12 nov, 21:00" (en la hora del celular, o en la zona dada). */
export const whenLocal = (iso: string, tz?: string): string => fmtWhen(Date.parse(iso), safeTz(tz ?? deviceTz()));

/** "jue 12 nov, 21:00 a 22:00" (en la hora del celular, o en la zona dada). */
export function bookingWhen(b: Pick<MyBooking, 'starts_at' | 'ends_at'>, tz?: string): string {
  const z = safeTz(tz ?? deviceTz());
  const a = localParts(Date.parse(b.ends_at), z);
  return `${fmtWhen(Date.parse(b.starts_at), z)} a ${String(a.h).padStart(2, '0')}:${String(a.mi).padStart(2, '0')}`;
}

/** Duración en minutos de una reserva. */
export const bookingMinutes = (b: Pick<MyBooking, 'starts_at' | 'ends_at'>) => minutesBetween(b.starts_at, b.ends_at);

// ---------- Partido a partir de una reserva ----------

/** ¿La hora del partido no coincide con la del turno? (vincular le pone la cancha al partido, pero no le cambia la hora). */
export const startsDiffer = (bookingIso: string, matchIso: string) => Math.abs(Date.parse(bookingIso) - Date.parse(matchIso)) >= 60_000;

/** Un partido que se puede vincular a una reserva. */
export interface LinkableMatch { id: string; title: string; starts_at: string; location: string | null; status: string }

