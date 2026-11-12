// Panel de la app (solo equipo): lógica pura y testeable, sin env ni red.

// ---------- Tracking: plataforma y sección ----------
export type Platform = 'android' | 'ios' | 'windows' | 'mac' | 'linux' | 'otro';

/** Plataforma a partir del user agent. `touchPoints` distingue el iPad que se hace pasar por Mac. */
export function platformOf(ua: string, touchPoints = 0): Platform {
  const s = ua || '';
  if (/android/i.test(s)) return 'android'; // antes que linux: el UA de Android también dice "Linux"
  if (/iphone|ipad|ipod/i.test(s)) return 'ios';
  if (/windows/i.test(s)) return 'windows';
  if (/macintosh|mac os x/i.test(s)) return touchPoints > 1 ? 'ios' : 'mac';
  if (/cros/i.test(s)) return 'otro';
  if (/linux|x11/i.test(s)) return 'linux';
  return 'otro';
}

/** Primer tramo de la ruta (sin "#/"): "#/c/foo/chat" → "c"; vacío → "inicio". Solo [a-z0-9-], hasta 30. */
export function routeKey(hash: string): string {
  // Solo rutas de la app ("#/algo"); el hash de vuelta del login (#access_token=…, #error=…) cuenta como inicio
  if (hash && hash !== '#' && !hash.startsWith('#/')) return 'inicio';
  const seg =(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
  if (!seg) return 'inicio';
  return seg.replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'otro';
}

const PLATFORM_LABEL: Record<string, string> = {
  android: 'Android', ios: 'iPhone / iPad', windows: 'Windows', mac: 'Mac', linux: 'Linux', otro: 'Otro',
};
export const platformLabel = (p: string | null | undefined) => PLATFORM_LABEL[p ?? 'otro'] ?? 'Otro';

const SECTION_LABEL: Record<string, string> = {
  inicio: 'Inicio', c: 'Comunidad', futbol: 'Fútbol argentino', tema: 'Tema', perfil: 'Perfil', join: 'Invitación', admin: 'Panel de la app',
  juegos: 'Juegos',
};
export const sectionLabel = (k: string | null | undefined) => (k ? SECTION_LABEL[k] ?? k : '—');

// ---------- Formato (español rioplatense) ----------
/** Entero con puntos de miles, siempre igual (sin depender del ICU del navegador): 12345 → "12.345". */
export function fmtInt(n: number | null | undefined): string {
  if (typeof n !== 'number' || !isFinite(n)) return '0';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Porcentaje entero de `part` sobre `total`, entre 0 y 100 (total 0 → 0). */
export function pct(part: number, total: number): number {
  if (!(total > 0) || !(part > 0)) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

/** "hace 5 min", "hace 3 h", "hace 2 días"… Fechas inválidas → "—"; futuras o de hace segundos → "recién". */
export function timeAgo(when: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (when == null || when === '') return '—';
  const t = when instanceof Date ? when.getTime() : typeof when === 'number' ? when : Date.parse(when);
  if (!isFinite(t)) return '—';
  const s = Math.floor((now - t) / 1000);
  if (s < 45) return 'recién';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(s / 3600);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(s / 86400);
  if (d < 14) return d === 1 ? 'hace 1 día' : `hace ${d} días`;
  if (d < 60) return `hace ${Math.round(d / 7)} sem`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `hace ${mo} ${mo === 1 ? 'mes' : 'meses'}`;
  const y = Math.round(d / 365);
  return `hace ${y} ${y === 1 ? 'año' : 'años'}`;
}

/** "2026-11-12" → "12/11". */
export function shortDate(d: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d);
  return m ? `${Number(m[2])}/${Number(m[1])}` : d;
}

/** "2026-11-12" → "jue 12/11" (día de la semana calculado en UTC: la fecha ya viene como día de Argentina). */
export function dayLong(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const wd = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${wd} ${Number(m[3])}/${Number(m[2])}`;
}

export const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`;

// ---------- Datos de admin_stats() ----------
export type SeriesKey = 'visitors' | 'users_new' | 'communities_new' | 'matches_played' | 'goals' | 'game_starts';
export interface SeriesPoint { d: string; visitors: number; users_new: number; communities_new: number; matches_played: number; goals: number; game_starts: number }
export interface GameStats {
  starts_total: number; finishes_total: number; starts_today: number; starts_7d: number; starts_30d: number;
  players_total: number; players_7d: number; avg_seasons: number; best_ovr: number;
  difficulty: { difficulty: string; n: number }[];
}
export interface OnlineUser { name: string; platform: string | null; path: string | null; standalone: boolean }
export interface TopCommunity {
  name: string; slug: string; members: number; players_no_account: number; matches_played: number; goals: number; messages: number;
  created_at: string | null; last_activity: string | null;
}
export interface RecentUser { name: string; created_at: string | null; last_sign_in_at: string | null; last_seen: string | null; communities: number }
export interface AdminStats {
  generated_at: string | null;
  online: { total: number; logged: number; users: OnlineUser[] };
  users: { total: number; active_24h: number; active_7d: number; active_30d: number; new_7d: number; new_30d: number; players_total: number; players_no_account: number; onboarded: number };
  communities: { total: number; new_7d: number; new_30d: number; memberships: number };
  matches: { total: number; played: number; open: number; cancelled: number; new_7d: number };
  events: { goals: number; assists: number; yellow: number; red: number };
  mvp_votes: number; stat_votes: number; messages: number; polls: number; push_devices: number;
  visits: {
    unique_today: number; unique_7d: number; unique_30d: number; logged_today: number; hits_today: number;
    standalone_30d: number; installs_total: number; installs_30d: number; platforms: { platform: string; n: number }[];
  };
  series: SeriesPoint[];
  top_communities: TopCommunity[];
  recent_users: RecentUser[];
  games: GameStats;
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : Number(v) > 0 ? Number(v) : 0);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const nums = <K extends string>(o: unknown, keys: readonly K[]) => {
  const r = obj(o);
  return Object.fromEntries(keys.map(k => [k, num(r[k])])) as Record<K, number>;
};

/** Completa con ceros lo que falte: la pantalla nunca se rompe si el servidor cambia o devuelve algo parcial. */
export function normalizeStats(raw: unknown): AdminStats {
  const r = obj(raw), on = obj(r.online), v = obj(r.visits);
  return {
    generated_at: str(r.generated_at),
    online: {
      total: num(on.total), logged: num(on.logged),
      users: arr(on.users).map(u => ({ name: str(obj(u).name) ?? 'Jugador', platform: str(obj(u).platform), path: str(obj(u).path), standalone: obj(u).standalone === true })),
    },
    users: nums(r.users, ['total', 'active_24h', 'active_7d', 'active_30d', 'new_7d', 'new_30d', 'players_total', 'players_no_account', 'onboarded'] as const),
    communities: nums(r.communities, ['total', 'new_7d', 'new_30d', 'memberships'] as const),
    matches: nums(r.matches, ['total', 'played', 'open', 'cancelled', 'new_7d'] as const),
    events: nums(r.events, ['goals', 'assists', 'yellow', 'red'] as const),
    mvp_votes: num(r.mvp_votes), stat_votes: num(r.stat_votes), messages: num(r.messages), polls: num(r.polls), push_devices: num(r.push_devices),
    visits: {
      ...nums(v, ['unique_today', 'unique_7d', 'unique_30d', 'logged_today', 'hits_today', 'standalone_30d', 'installs_total', 'installs_30d'] as const),
      platforms: arr(v.platforms).map(p => ({ platform: str(obj(p).platform) ?? 'otro', n: num(obj(p).n) })),
    },
    series: arr(r.series).map(p => ({ d: str(obj(p).d) ?? '', ...nums(p, ['visitors', 'users_new', 'communities_new', 'matches_played', 'goals', 'game_starts'] as const) })),
    top_communities: arr(r.top_communities).map(c => ({
      name: str(obj(c).name) ?? 'Sin nombre', slug: str(obj(c).slug) ?? '',
      ...nums(c, ['members', 'players_no_account', 'matches_played', 'goals', 'messages'] as const),
      created_at: str(obj(c).created_at), last_activity: str(obj(c).last_activity),
    })),
    recent_users: arr(r.recent_users).map(u => ({
      name: str(obj(u).name) ?? 'Sin perfil', created_at: str(obj(u).created_at), last_sign_in_at: str(obj(u).last_sign_in_at),
      last_seen: str(obj(u).last_seen), communities: num(obj(u).communities),
    })),
    games: {
      ...nums(r.games, ['starts_total', 'finishes_total', 'starts_today', 'starts_7d', 'starts_30d', 'players_total', 'players_7d', 'avg_seasons', 'best_ovr'] as const),
      difficulty: arr(obj(r.games).difficulty).map(d => ({ difficulty: str(obj(d).difficulty) ?? 'otra', n: num(obj(d).n) })),
    },
  };
}

const DIFF_LABEL: Record<string, string> = { normal: 'Normal', intenso: 'Intenso', experto: 'Experto', otra: 'Sin dato' };
export const difficultyLabel = (d: string) => DIFF_LABEL[d] ?? d.charAt(0).toUpperCase() + d.slice(1);

/** Un decimal con coma (3.5 → "3,5"; 4 → "4"). */
export const fmtDec = (n: number) => (Number.isInteger(n) ? fmtInt(n) : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','));

/** Suma de una serie en el período. */
export const seriesTotal = (s: SeriesPoint[], k: SeriesKey) => s.reduce((a, p) => a + (p[k] || 0), 0);


const NICE = [1, 2, 3, 4, 5, 6, 8, 10];
/** Tope "lindo" del eje: el primer 1, 2, 3, 4, 5, 6, 8 o 10 por una potencia de 10 que alcanza (7 → 8, 31 → 40, 1 → 1). Mínimo 1. */
export function niceMax(max: number): number {
  if (!(max > 1)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const f = max / p;
  return (NICE.find(n => f <= n + 1e-9) ?? 10) * p;
}
