// Alta de jugadores sin cuenta y asistente de armado del grupo. Funciones puras: no tocan Supabase.
import { POS, type Pos, type Stats } from './model';

export const NAME_MAX = 40;
export const NICK_MAX = 20;
export const BULK_MAX = 60; // tope de add_players por llamada

/** Minúsculas, sin acentos y con espacios normalizados: para comparar nombres ("José  Pérez" = "jose perez"). */
import { norm } from './futbolCore';
export { norm };

// ---------- Posición ----------
const POS_ALIAS: Record<string, Pos> = {
  arq: 'ARQ', arquero: 'ARQ', golero: 'ARQ', portero: 'ARQ', gk: 'ARQ',
  def: 'DEF', defensor: 'DEF', defensa: 'DEF', zaguero: 'DEF', lateral: 'DEF',
  med: 'MED', medio: 'MED', volante: 'MED', mediocampista: 'MED', mc: 'MED',
  del: 'DEL', delantero: 'DEL', atacante: 'DEL', ariete: 'DEL', punta: 'DEL',
};
/** "del", "Delantero", "ARQ"… → posición, o null si no es ninguna. */
export const parsePos = (s: string): Pos | null => POS_ALIAS[norm(s)] ?? null;

/** Siguiente posición al tocar el chip de una fila: ARQ → DEF → MED → DEL → ARQ. */
export const nextPos = (p: Pos): Pos => POS[(POS.indexOf(p) + 1) % POS.length];

// ---------- Lista pegada ("Varios") ----------
export interface ParsedLine { name: string; pos: Pos | null }

/**
 * Una línea de la lista: "Juan Pérez - DEL", "2) Marcos (arq)", "• El Chino". Saca viñetas y numeración.
 * La posición solo se reconoce al final y con un separador (guion, coma, barra, paréntesis): así
 * "Juan del Potro" sigue siendo un nombre y no "Juan" + delantero.
 */
export function parseLine(raw: string): ParsedLine | null {
  let s = raw.replace(/\s+/g, ' ').trim().replace(/^(?:[-*•·]+|\d{1,2}\s*[.):-])\s*/, '');
  let pos: Pos | null = null;
  const paren = s.match(/^(.*?)\s*[(\[]\s*([^()\[\]]{1,15}?)\s*[)\]]$/);
  const sep = s.match(/^(.*?)\s*[-–—,;:|/]\s*([^-–—,;:|/]{1,15}?)$/);
  for (const m of [paren, sep]) {
    const p = m && parsePos(m[2]);
    if (m && p && m[1].trim()) { s = m[1]; pos = p; break; }
  }
  const name = s.trim().replace(/^[.,;:\s]+|[.,;:\s]+$/g, '');
  return name ? { name, pos } : null;
}

/** ok = se agrega; dup_list = repetido en la lista; dup_member = ya está en el grupo; long = nombre de más de 40 letras. */
export type BulkStatus = 'ok' | 'dup_list' | 'dup_member' | 'long';
export interface BulkRow { line: number; name: string; pos: Pos; explicit: boolean; status: BulkStatus }

/**
 * Lee el texto pegado (un nombre por línea). `defaultPos` es la posición de las líneas que no dicen cuál;
 * `overrides` (por nombre normalizado) son las posiciones que el admin cambió tocando el chip de la fila;
 * `existing` son los nombres que ya están en el grupo.
 */
export function parseBulk(text: string, defaultPos: Pos, existing: string[] = [], overrides: ReadonlyMap<string, Pos> = new Map()): BulkRow[] {
  const have = new Set(existing.map(norm));
  const seen = new Set<string>();
  const out: BulkRow[] = [];
  text.split(/\r?\n/).forEach((raw, line) => {
    const p = parseLine(raw);
    if (!p) return;
    const key = norm(p.name);
    const status: BulkStatus = p.name.length > NAME_MAX ? 'long' : have.has(key) ? 'dup_member' : seen.has(key) ? 'dup_list' : 'ok';
    seen.add(key);
    const forced = overrides.get(key);
    out.push({ line, name: p.name, pos: forced ?? p.pos ?? defaultPos, explicit: forced != null || p.pos != null, status });
  });
  return out;
}

/** Qué se manda a add_players: lo que está ok, más los repetidos que el admin decidió agregar igual (por nombre normalizado). */
export function selectToSave(rows: BulkRow[], forced: ReadonlySet<string> = new Set()) {
  const picked = rows.filter(r => r.status === 'ok' || ((r.status === 'dup_list' || r.status === 'dup_member') && forced.has(norm(r.name))));
  return {
    players: picked.slice(0, BULK_MAX).map(({ name, pos }) => ({ name, pos })),
    skipped: rows.length - picked.length,           // repetidos o muy largos que quedan afuera
    over: Math.max(0, picked.length - BULK_MAX),    // los que sobran del tope
  };
}

/** Saca del texto la línea `line` (la ✕ de la vista previa). */
export const dropLine = (text: string, line: number) => text.split(/\r?\n/).filter((_, i) => i !== line).join('\n');

// ---------- Un jugador ----------
export interface PlayerDraft { name: string; pos: Pos; nickname: string; shirt: string; team: string }
export const emptyPlayer = (pos: Pos = 'MED'): PlayerDraft => ({ name: '', pos, nickname: '', shirt: '', team: '' });

export interface PlayerValue { name: string; pos: Pos; nickname: string | null; shirt: number | null; fav_team: string | null }
export type PlayerCheck = { ok: true; value: PlayerValue } | { ok: false; hint: string; value?: undefined };

/** Valida el formulario con los mismos límites que la base (nombre 1-40, apodo hasta 20, número 1-99). */
export function validatePlayer(d: PlayerDraft): PlayerCheck {
  const name = d.name.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, hint: '' };
  if (name.length > NAME_MAX) return { ok: false, hint: `El nombre puede tener hasta ${NAME_MAX} letras.` };
  const nickname = d.nickname.trim();
  if (nickname.length > NICK_MAX) return { ok: false, hint: `El apodo puede tener hasta ${NICK_MAX} letras.` };
  const raw = d.shirt.trim();
  const shirt = raw === '' ? null : +raw;
  if (shirt !== null && !(Number.isInteger(shirt) && shirt >= 1 && shirt <= 99)) return { ok: false, hint: 'El número tiene que ser entre 1 y 99.' };
  return { ok: true, value: { name, pos: d.pos, nickname: nickname || null, shirt, fav_team: d.team.trim() || null } };
}

export const draftOf = (p: { name: string; pos: Pos; nickname: string | null; shirt_number: number | null; fav_team: string | null }): PlayerDraft => ({
  name: p.name, pos: p.pos, nickname: p.nickname ?? '', shirt: p.shirt_number ? String(p.shirt_number) : '', team: p.fav_team ?? '',
});

/** Parámetros de los RPC (los nombres son los de la migración 20261111150000_players.sql). */
export const addPlayerParams = (community: string, v: PlayerValue) =>
  ({ p_community: community, p_name: v.name, p_pos: v.pos, p_nickname: v.nickname, p_shirt: v.shirt, p_fav_team: v.fav_team });
export const updatePlayerParams = (profile: string, community: string, v: PlayerValue) =>
  ({ p_profile: profile, p_community: community, p_name: v.name, p_pos: v.pos, p_nickname: v.nickname, p_shirt: v.shirt, p_fav_team: v.fav_team });
export const statsParams = (profile: string, community: string, s: Stats) => ({ p_profile: profile, p_community: community, p_stats: s });

/** Errores del servidor en castellano. Si la migración todavía no se aplicó, lo dice (en vez de mostrar el error crudo). */
export function playerError(m: string): string {
  if (/Could not find the function|schema cache|does not exist/i.test(m)) return 'Esta función todavía no está activa en el servidor. Avisale a quien administra la app.';
  if (m.includes('forbidden')) return 'No tenés permiso para hacer eso.';
  if (m.includes('bad_name')) return `El nombre tiene que tener entre 1 y ${NAME_MAX} letras.`;
  if (m.includes('bad_pos')) return 'La posición no es válida.';
  if (m.includes('bad_nickname')) return `El apodo puede tener hasta ${NICK_MAX} letras.`;
  if (m.includes('bad_shirt')) return 'El número tiene que ser entre 1 y 99.';
  if (m.includes('bad_team')) return 'El nombre del equipo es muy largo.';
  if (m.includes('bad_stats')) return 'Las stats tienen que ir de 1 a 99.';
  if (m.includes('too_many')) return `Podés cargar hasta ${BULK_MAX} jugadores por vez.`;
  if (m.includes('bad_players')) return 'La lista no se pudo leer.';
  if (m.includes('not_placeholder')) return 'Ese jugador ya tiene cuenta: solo él puede editar su perfil.';
  if (m.includes('not_member')) return 'Ese jugador ya no está en la comunidad.';
  if (m.includes('no_claim')) return 'Ese pedido ya no existe (puede que ya lo hayan resuelto).';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}

/** "1 jugador" / "12 jugadores". */
export const nPlayers = (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`;

// ---------- Asistente de armado (#/c/<slug>/setup/<paso>) ----------
export const SETUP_STEPS = [
  { key: 'jugadores', label: 'Jugadores', title: 'Sumá a tus jugadores' },
  { key: 'canchas', label: 'Canchas', title: 'Tus canchas' },
  { key: 'invitar', label: 'Invitar', title: 'Invitá al grupo' },
] as const;
export const LAST_STEP = SETUP_STEPS.length - 1;

/** Paso (0 a 2) a partir del segmento de la ruta: "2" → 1. Cualquier otra cosa → el primero. */
export function stepFromRoute(seg: string | undefined): number {
  const n = Number(seg);
  return Number.isInteger(n) && n >= 1 && n <= SETUP_STEPS.length ? n - 1 : 0;
}
export const setupPath = (slug: string, step: number) => (step <= 0 ? `c/${slug}/setup` : `c/${slug}/setup/${Math.min(step, LAST_STEP) + 1}`);
/** Adónde va "Listo": la pestaña Partidos de la comunidad. */
export const setupDonePath = (slug: string) => `c/${slug}`;

export type DotState = 'done' | 'now' | 'todo';
export const stepDots = (step: number): DotState[] => SETUP_STEPS.map((_, i) => (i < step ? 'done' : i === step ? 'now' : 'todo'));

/** Botón principal del asistente: "Después" mientras el paso está vacío (se puede saltear), "Siguiente" cuando ya hay algo, "Listo" al final. */
export function nextAction(step: number, added: number): { label: string; last: boolean } {
  if (step >= LAST_STEP) return { label: 'Listo', last: true };
  return { label: added > 0 ? 'Siguiente' : 'Después', last: false };
}
