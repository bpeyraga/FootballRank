// Dueños de cancha: la única puerta a Supabase de esta funcionalidad. Tiran Error con el mensaje del servidor
// (las pantallas lo traducen con ownerErrorText de model.ts).
import { must, sb } from '../../shared/supabase';
import {
  normalizeWhatsapp, parsePrice, type Booking, type Complex, type ComplexDraft, type Field, type FieldDraft, type HoursRow, type Overview,
} from './model';

export { resolvePlace } from '../venues/api';

const rpc = async (fn: string, args: Record<string, unknown> = {}) => must(await sb.rpc(fn, args));
const nz = (s: string) => s.trim() || null;

// ---------- Mis complejos ----------

/** Complejos que manejo (dueño o encargado), por nombre. */
export async function loadMyComplexes(meId: string): Promise<Complex[]> {
  const rows = must(await sb.from('complex_staff').select('complex:complexes(*)').eq('profile_id', meId)) as unknown as { complex: Complex | null }[] | null;
  return (rows ?? []).map(r => r.complex).filter((c): c is Complex => !!c).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
/** Pedidos por responder y turnos de hoy de cada complejo mío. */
export async function loadOverview(): Promise<Overview[]> {
  return ((await rpc('owner_overview')) ?? []) as Overview[];
}
/** Un complejo MÍO (null si no existe o no soy dueño ni encargado: la tabla de complejos la lee cualquiera, por eso se mira complex_staff). */
export async function loadMyComplex(meId: string, id: string): Promise<Complex | null> {
  const row = must(await sb.from('complex_staff').select('complex:complexes(*)').eq('profile_id', meId).eq('complex_id', id).maybeSingle()) as unknown as { complex: Complex | null } | null;
  return row?.complex ?? null;
}
/** Un complejo por id, sin mirar de quién es (para refrescar uno que ya sabemos que es mío). */
export async function loadComplex(id: string): Promise<Complex | null> {
  return must(await sb.from('complexes').select('*').eq('id', id).maybeSingle()) as Complex | null;
}

const args = (d: ComplexDraft) => ({
  p_name: d.name.trim(), p_address: nz(d.address), p_city: nz(d.city), p_lat: d.lat, p_lng: d.lng,
  p_maps_url: nz(d.maps_url), p_phone: nz(d.phone), p_whatsapp: d.whatsapp.trim() ? normalizeWhatsapp(d.whatsapp) : null, p_description: nz(d.description),
});
/** Crea el complejo (el que lo crea queda como dueño). Devuelve su id. */
export async function createComplex(d: ComplexDraft): Promise<string> {
  return (await rpc('create_complex', args(d))) as string;
}
/** Guarda los datos del complejo. `slot` y `amenities` en null = no cambiar. */
export async function updateComplex(id: string, d: ComplexDraft, slot: number | null, amenities: string[] | null) {
  await rpc('update_complex', { p_complex: id, ...args(d), p_slot_minutes: slot, p_amenities: amenities });
}
export const setComplexActive = (id: string, active: boolean) => rpc('set_complex_active', { p_complex: id, p_active: active });
/** Cambia solo la duración del turno (no reenvía el resto de los datos del complejo). */
export const setComplexSlot = (id: string, minutes: number) => rpc('set_complex_slot', { p_complex: id, p_minutes: minutes });

// ---------- Foto ----------

/** Achica a 1600 px del lado más largo (sin recortar) y la sube como JPEG. Devuelve el link público. */
export async function uploadComplexPhoto(complexId: string, file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.85));
  const path = `${complexId}/${crypto.randomUUID()}.jpg`;
  must(await sb.storage.from('complexes').upload(path, blob, { contentType: 'image/jpeg' }));
  return sb.storage.from('complexes').getPublicUrl(path).data.publicUrl;
}
/** Cambia (o con null quita) la foto y borra la anterior del almacenamiento (si eso falla, no importa). */
export async function setComplexPhoto(complexId: string, next: string | null, previous: string | null) {
  await rpc('set_complex_photo', { p_complex: complexId, p_url: next });
  const old = previous?.split('/complexes/')[1]?.split('?')[0];
  if (old) await sb.storage.from('complexes').remove([old]);
}

// ---------- Canchas ----------

export async function loadFields(complexId: string): Promise<Field[]> {
  return (must(await sb.from('fields').select('*').eq('complex_id', complexId).order('created_at').order('name')) ?? []) as Field[];
}
const fieldRow = (d: FieldDraft) => ({
  name: d.name.trim(), size: d.size, surface: d.surface, roofed: d.roofed, price: parsePrice(d.price) ?? null, active: d.active,
});
export async function addField(complexId: string, d: FieldDraft): Promise<Field> {
  return must(await sb.from('fields').insert({ complex_id: complexId, ...fieldRow(d) }).select('*').single()) as Field;
}
export async function updateField(id: string, d: FieldDraft): Promise<Field> {
  return must(await sb.from('fields').update(fieldRow(d)).eq('id', id).select('*').single()) as Field;
}
/** Borra la cancha si nunca tuvo reservas; si tuvo, la desactiva (el historial se conserva). */
export async function removeField(id: string): Promise<'deleted' | 'deactivated'> {
  const gone = must(await sb.from('fields').delete().eq('id', id).select('id'));
  if (gone?.length) return 'deleted';
  must(await sb.from('fields').update({ active: false }).eq('id', id));
  return 'deactivated';
}

// ---------- Horarios ----------

export async function loadHours(complexId: string): Promise<HoursRow[]> {
  return (must(await sb.from('complex_hours').select('weekday,opens,closes').eq('complex_id', complexId).order('weekday')) ?? []) as HoursRow[];
}
export const saveHours = (complexId: string, rows: HoursRow[]) => rpc('set_complex_hours', { p_complex: complexId, p_hours: rows });

// ---------- Agenda ----------

/** Turnos del complejo entre dos instantes (máx. 62 días). */
export async function loadAgenda(complexId: string, fromMs: number, toMs: number): Promise<Booking[]> {
  const rows = (await rpc('complex_agenda', { p_complex: complexId, p_from: new Date(fromMs).toISOString(), p_to: new Date(toMs).toISOString() })) as Booking[] | null;
  return (rows ?? []).map(b => ({ ...b, price: b.price === null || b.price === undefined ? null : +b.price }));
}
export const decideBooking = (id: string, accept: boolean, note: string) => rpc('decide_booking', { p_booking: id, p_accept: accept, p_note: nz(note) });
export const blockSlot = (fieldId: string, startsAt: string, minutes: number, note: string) =>
  rpc('block_slot', { p_field: fieldId, p_starts: startsAt, p_minutes: minutes, p_note: nz(note) });
export const cancelBooking = (id: string, reason: string) => rpc('cancel_booking', { p_booking: id, p_reason: nz(reason) });

/** Avisa cuando cambia algo en las reservas de este complejo (pedido nuevo, cancelación…). Devuelve la función para dejar de escuchar. */
export function watchBookings(complexId: string, onChange: () => void): () => void {
  const ch = sb.channel(`owner-bookings-${complexId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `complex_id=eq.${complexId}` }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
