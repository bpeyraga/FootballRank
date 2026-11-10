// Temporadas y campeones: tipos y reglas puras (sin Supabase ni Preact). La carga está en seasons/api.ts.
import { argDay, fmtAvg, type DateRange } from '../stats/statsCore';
import { fmtDay } from '../stats/historyCore';

export interface Season {
  id: string; community_id: string; name: string;
  /** Días de Argentina ('AAAA-MM-DD'). Abierta: ends_on y closed_at son null. */
  starts_on: string; ends_on: string | null; closed_at: string | null;
}

export type AwardKind = 'goleador' | 'asistidor' | 'figura' | 'presente' | 'fair_play';
export interface SeasonAward { season_id: string; kind: AwardKind; profile_id: string; value: number }
export interface SeasonsData { seasons: Season[]; awards: SeasonAward[] }

/** Orden de los premios en pantallas. */
export const AWARD_KINDS: readonly AwardKind[] = ['goleador', 'asistidor', 'figura', 'presente', 'fair_play'];
export const AWARD_ICON: Record<AwardKind, string> = { goleador: '🥇', asistidor: '🎯', figura: '⭐', presente: '📅', fair_play: '🤝' };
export const AWARD_LABEL: Record<AwardKind, string> = {
  goleador: 'Goleador', asistidor: 'Asistidor', figura: 'Figura', presente: 'Más presente', fair_play: 'Fair play',
};

const plural = (n: number, one: string, many: string) => `${fmtAvg(n)} ${n === 1 ? one : many}`;

/** Lo que se muestra al lado del campeón: "12 goles", "3 veces figura", "Sin tarjetas ni faltas"... */
export function awardValueText(kind: AwardKind, value: number): string {
  switch (kind) {
    case 'goleador': return plural(value, 'gol', 'goles');
    case 'asistidor': return plural(value, 'asistencia', 'asistencias');
    case 'figura': return value === 1 ? '1 vez figura' : `${fmtAvg(value)} veces figura`;
    case 'presente': return plural(value, 'partido', 'partidos');
    case 'fair_play': return value === 0 ? 'Sin tarjetas ni faltas' : `${fmtAvg(value)} pts de sanción`;
  }
}

// ---------- Temporadas ----------

/** Clave del selector para "todo el historial". */
export const ALL = 'all';

export const openSeason = (seasons: Season[]): Season | null => seasons.find(s => !s.closed_at) ?? null;

/** Cerradas, la más nueva primero. */
export const closedSeasons = (seasons: Season[]): Season[] =>
  seasons.filter(s => s.closed_at)
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on) || (b.ends_on ?? '').localeCompare(a.ends_on ?? ''));

/** Qué se ve si todavía no se eligió nada: la temporada actual si hay una abierta; si no, todo el historial. */
export const defaultKey = (seasons: Season[]): string => openSeason(seasons)?.id ?? ALL;

/** La clave elegida si todavía existe (ALL o una temporada); si no, la de por defecto. */
export function resolveKey(picked: string | null, seasons: Season[]): string {
  return picked && (picked === ALL || seasons.some(s => s.id === picked)) ? picked : defaultKey(seasons);
}

/** Rango de días de una temporada (abierta: sin tope al final). */
export const seasonRange = (s: Season): DateRange => ({ from: s.starts_on, to: s.ends_on });

/** Rango de la clave elegida; null = todo el historial. */
export function rangeFor(key: string, seasons: Season[]): DateRange | null {
  const s = key === ALL ? null : seasons.find(x => x.id === key);
  return s ? seasonRange(s) : null;
}

export interface SeasonOption { key: string; label: string }

/** Opciones del selector: "Temporada actual" (si hay una abierta), "Histórico" y las cerradas por nombre. */
export function seasonOptions(seasons: Season[]): SeasonOption[] {
  const open = openSeason(seasons);
  return [
    ...(open ? [{ key: open.id, label: 'Temporada actual' }] : []),
    { key: ALL, label: 'Histórico' },
    ...closedSeasons(seasons).map(s => ({ key: s.id, label: s.name })),
  ];
}

/** "3 mar" (con el año si no es el de `thisYear`). */
function dayText(day: string, thisYear: string): string {
  return day.slice(0, 4) === thisYear ? fmtDay(day) : `${fmtDay(day)} ${day.slice(0, 4)}`;
}

/** "3 mar → 20 jun" (cerrada) o "Desde el 3 mar · en curso" (abierta). `today` = día de Argentina de hoy. */
export function seasonSpan(s: Season, today = argDay(Date.now())): string {
  const y = today.slice(0, 4);
  if (!s.ends_on) return s.starts_on > today ? `Empieza el ${dayText(s.starts_on, y)}` : `Desde el ${dayText(s.starts_on, y)} · en curso`;
  return `${dayText(s.starts_on, y)} → ${dayText(s.ends_on, y)}`;
}

/** Día siguiente ('AAAA-MM-DD'). */
export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Fecha de inicio sugerida para una temporada nueva: hoy, o el día después del cierre de la última si es más tarde. */
export function defaultStart(seasons: Season[], today = argDay(Date.now())): string {
  const last = closedSeasons(seasons).reduce<string>((mx, s) => (s.ends_on && s.ends_on > mx ? s.ends_on : mx), '');
  return last && nextDay(last) > today ? nextDay(last) : today;
}

export const NAME_MAX = 40;

/** Por qué no se puede empezar (null = se puede). Misma regla que start_season. */
export function startError(name: string, startsOn: string, seasons: Season[]): string | null {
  const n = name.trim();
  if (!n) return 'Ponele un nombre a la temporada.';
  if (n.length > NAME_MAX) return `El nombre puede tener hasta ${NAME_MAX} letras.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return 'Elegí desde qué día empieza.';
  if (openSeason(seasons)) return 'Ya hay una temporada abierta: cerrala antes de empezar otra.';
  const last = closedSeasons(seasons).reduce<string>((mx, s) => (s.ends_on && s.ends_on > mx ? s.ends_on : mx), '');
  if (last && startsOn <= last) return `Tiene que empezar después del ${fmtDay(last)}, cuando terminó la anterior.`;
  return null;
}

/** Traduce los errores de las RPCs de temporadas. */
export function seasonError(m: string): string {
  if (m.includes('forbidden')) return 'Solo los admins pueden manejar las temporadas.';
  if (m.includes('season_open')) return 'Ya hay una temporada abierta: cerrala antes de empezar otra.';
  if (m.includes('overlap')) return 'La temporada nueva tiene que empezar después de que terminó la anterior.';
  if (m.includes('bad_name')) return `El nombre tiene que tener entre 1 y ${NAME_MAX} letras.`;
  if (m.includes('bad_dates')) return 'Las fechas no son válidas.';
  if (m.includes('future_end')) return 'No se puede cerrar con una fecha futura.';
  if (m.includes('season_closed')) return 'Esa temporada ya estaba cerrada.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}

// ---------- Campeones y trofeos ----------

export interface Champion { kind: AwardKind; value: number; winners: string[] }
export interface SeasonChampions { season: Season; champions: Champion[] }

/**
 * Campeones de cada temporada cerrada (la más nueva primero). Los premios salen en el orden de AWARD_KINDS y los
 * que nadie ganó se omiten; en empate, `winners` tiene a todos. Una temporada sin premios queda con la lista vacía.
 */
export function championsBySeason(seasons: Season[], awards: SeasonAward[]): SeasonChampions[] {
  return closedSeasons(seasons).map(season => ({
    season,
    champions: AWARD_KINDS.flatMap(kind => {
      const won = awards.filter(a => a.season_id === season.id && a.kind === kind);
      return won.length ? [{ kind, value: won[0].value, winners: won.map(a => a.profile_id) }] : [];
    }),
  }));
}

export interface Trophy { season: Season; kind: AwardKind; value: number }

/** Premios de un jugador: la temporada más nueva primero y, dentro de cada una, en el orden de AWARD_KINDS. */
export function trophiesOf(profileId: string, seasons: Season[], awards: SeasonAward[]): Trophy[] {
  const bySeason = new Map(seasons.map(s => [s.id, s]));
  return awards
    .filter(a => a.profile_id === profileId && bySeason.has(a.season_id))
    .map(a => ({ season: bySeason.get(a.season_id)!, kind: a.kind, value: a.value }))
    .sort((a, b) => b.season.starts_on.localeCompare(a.season.starts_on) || AWARD_KINDS.indexOf(a.kind) - AWARD_KINDS.indexOf(b.kind));
}
