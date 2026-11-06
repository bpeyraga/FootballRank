// Canchas: tipos y reglas puras del formulario. La carga, el alta y el borrado están en venues/api.ts.
import type { Venue } from './maps';

/** Valor del <select> de cancha para "➕ Nueva cancha…" ('' = sin cancha guardada; otro valor = id de una cancha). */
export const NEW_VENUE = 'new';

/** Lo que el admin escribe al dar de alta una cancha. */
export interface VenueDraft { url: string; name: string; address: string; lat: number | null; lng: number | null }
export const emptyDraft = (): VenueDraft => ({ url: '', name: '', address: '', lat: null, lng: null });

/** Datos válidos para dar de alta? (el nombre es lo único obligatorio) */
export const draftValid = (d: VenueDraft) => d.name.trim().length > 0 && d.name.trim().length <= 80 && d.address.trim().length <= 160;

export type Picked = { error: string } | { id: string | null; name: string | null; created: Venue | null };
