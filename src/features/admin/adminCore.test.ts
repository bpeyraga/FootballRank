import { describe, expect, it } from 'vitest';
import {
  dayLong, difficultyLabel, fmtDec, fmtInt, niceMax, normalizeStats, pct, platformLabel, platformOf, plural, routeKey, sectionLabel, seriesTotal, shortDate, timeAgo,
  type SeriesPoint,
} from './adminCore';

describe('platformOf', () => {
  it('reconoce las plataformas más comunes', () => {
    expect(platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36')).toBe('android');
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1')).toBe('ios');
    expect(platformOf('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36')).toBe('windows');
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15')).toBe('mac');
    expect(platformOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36')).toBe('linux');
  });
  it('Android gana sobre Linux', () => {
    expect(platformOf('Mozilla/5.0 (Linux; Android 10; K) Chrome/126 Mobile')).toBe('android');
  });
  it('un iPad que dice ser Mac (con pantalla táctil) es iOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15';
    expect(platformOf(ua, 5)).toBe('ios');
    expect(platformOf(ua, 0)).toBe('mac');
  });
  it('lo desconocido o vacío es "otro"', () => {
    expect(platformOf('')).toBe('otro');
    expect(platformOf('curl/8.4.0')).toBe('otro');
    expect(platformOf('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/126')).toBe('otro');
  });
});

describe('routeKey', () => {
  it('toma el primer tramo de la ruta', () => {
    expect(routeKey('#/c/foo/chat')).toBe('c');
    // vuelta del login con Google: el token no se registra como sección
    expect(routeKey('#access_token=eyJhbGciOi&expires_in=3600')).toBe('inicio');
    expect(routeKey('#error=access_denied')).toBe('inicio');
    expect(routeKey('#')).toBe('inicio');
    expect(routeKey('#/futbol')).toBe('futbol');
    expect(routeKey('#/join/abc123')).toBe('join');
    expect(routeKey('#/admin')).toBe('admin');
  });
  it('vacío o solo "#/" es inicio', () => {
    expect(routeKey('')).toBe('inicio');
    expect(routeKey('#')).toBe('inicio');
    expect(routeKey('#/')).toBe('inicio');
  });
  it('ignora el query y pasa a minúsculas', () => {
    expect(routeKey('#/Tema?x=1')).toBe('tema');
  });
  it('deja solo [a-z0-9-] y corta a 30', () => {
    expect(routeKey('#/a_b.c d-e')).toBe('abcd-e');
    expect(routeKey('#/' + 'x'.repeat(80))).toHaveLength(30);
    expect(routeKey('#/ñ')).toBe('otro');
  });
});

describe('labels', () => {
  it('plataformas y secciones, con valor por defecto', () => {
    expect(platformLabel('ios')).toBe('iPhone / iPad');
    expect(platformLabel(null)).toBe('Otro');
    expect(platformLabel('raro')).toBe('Otro');
    expect(sectionLabel('c')).toBe('Comunidad');
    expect(sectionLabel('xyz')).toBe('xyz');
    expect(sectionLabel(null)).toBe('—');
  });
});

describe('fmtInt', () => {
  it('separa miles con punto', () => {
    expect(fmtInt(0)).toBe('0');
    expect(fmtInt(999)).toBe('999');
    expect(fmtInt(1234)).toBe('1.234');
    expect(fmtInt(1234567)).toBe('1.234.567');
    expect(fmtInt(12.6)).toBe('13');
  });
  it('valores raros son 0', () => {
    expect(fmtInt(null)).toBe('0');
    expect(fmtInt(undefined)).toBe('0');
    expect(fmtInt(NaN)).toBe('0');
  });
});

describe('pct', () => {
  it('redondea y acota entre 0 y 100', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(5, 5)).toBe(100);
    expect(pct(7, 5)).toBe(100);
  });
  it('sin total o sin parte es 0', () => {
    expect(pct(3, 0)).toBe(0);
    expect(pct(0, 10)).toBe(0);
    expect(pct(-2, 10)).toBe(0);
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('escala de recién a años', () => {
    expect(timeAgo(ago(10_000), now)).toBe('recién');
    expect(timeAgo(ago(60_000), now)).toBe('hace 1 min');
    expect(timeAgo(ago(5 * 60_000), now)).toBe('hace 5 min');
    expect(timeAgo(ago(3 * 3600_000), now)).toBe('hace 3 h');
    expect(timeAgo(ago(86400_000), now)).toBe('hace 1 día');
    expect(timeAgo(ago(4 * 86400_000), now)).toBe('hace 4 días');
    expect(timeAgo(ago(21 * 86400_000), now)).toBe('hace 3 sem');
    expect(timeAgo(ago(90 * 86400_000), now)).toBe('hace 3 meses');
    expect(timeAgo(ago(400 * 86400_000), now)).toBe('hace 1 año');
    expect(timeAgo(ago(800 * 86400_000), now)).toBe('hace 2 años');
  });
  it('futuro es recién; inválido o vacío es guión', () => {
    expect(timeAgo(new Date(now + 5000), now)).toBe('recién');
    expect(timeAgo('no es fecha', now)).toBe('—');
    expect(timeAgo(null, now)).toBe('—');
    expect(timeAgo('', now)).toBe('—');
  });
  it('acepta Date y número', () => {
    expect(timeAgo(new Date(now - 120_000), now)).toBe('hace 2 min');
    expect(timeAgo(now - 120_000, now)).toBe('hace 2 min');
  });
});

describe('fechas cortas', () => {
  it('shortDate y dayLong', () => {
    expect(shortDate('2026-11-05')).toBe('5/11');
    expect(shortDate('raro')).toBe('raro');
    expect(dayLong('2026-11-12')).toBe('jue 12/11');
    expect(dayLong('2026-11-08')).toBe('dom 8/11');
  });
  it('plural', () => {
    expect(plural(1, 'persona', 'personas')).toBe('1 persona');
    expect(plural(1500, 'persona', 'personas')).toBe('1.500 personas');
    expect(plural(0, 'persona', 'personas')).toBe('0 personas');
  });
});

describe('series y eje', () => {
  const s: SeriesPoint[] = [
    { d: '2026-11-10', visitors: 3, users_new: 1, communities_new: 0, matches_played: 2, goals: 9, game_starts: 0 },
    { d: '2026-11-11', visitors: 4, users_new: 0, communities_new: 1, matches_played: 0, goals: 0, game_starts: 5 },
  ];
  it('seriesTotal suma una clave', () => {
    expect(seriesTotal(s, 'visitors')).toBe(7);
    expect(seriesTotal(s, 'goals')).toBe(9);
    expect(seriesTotal([], 'goals')).toBe(0);
  });
  it('niceMax da topes redondos', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(2)).toBe(2);
    expect(niceMax(3)).toBe(3);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(9)).toBe(10);
    expect(niceMax(31)).toBe(40);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(101)).toBe(200);
    expect(niceMax(480)).toBe(500);
    expect(niceMax(1000)).toBe(1000);
  });
});

describe('normalizeStats', () => {
  it('con basura devuelve todo en cero y listas vacías', () => {
    const n = normalizeStats(null);
    expect(n.online).toEqual({ total: 0, logged: 0, users: [] });
    expect(n.users.total).toBe(0);
    expect(n.events.goals).toBe(0);
    expect(n.visits.platforms).toEqual([]);
    expect(n.series).toEqual([]);
    expect(n.top_communities).toEqual([]);
    expect(n.recent_users).toEqual([]);
  });
  it('respeta lo que viene y completa lo que falta', () => {
    const n = normalizeStats({
      online: { total: 3, users: [{ name: 'Beto', platform: 'android', path: 'c', standalone: true }, {}] },
      users: { total: 10, active_7d: 4 },
      events: { goals: 22 },
      stat_votes: 5,
      visits: { unique_today: 7, platforms: [{ platform: 'ios', n: 2 }, { n: 1 }] },
      series: [{ d: '2026-11-12', visitors: 2 }],
      top_communities: [{ name: 'Amigos', slug: 'amigos', members: 12, last_activity: '2026-11-12T10:00:00Z' }],
      recent_users: [{ name: 'Lu', created_at: '2026-11-11T10:00:00Z', communities: 2 }],
    });
    expect(n.online.total).toBe(3);
    expect(n.online.users[0]).toEqual({ name: 'Beto', platform: 'android', path: 'c', standalone: true });
    expect(n.online.users[1]).toEqual({ name: 'Jugador', platform: null, path: null, standalone: false });
    expect(n.users.total).toBe(10);
    expect(n.users.active_7d).toBe(4);
    expect(n.users.active_30d).toBe(0);
    expect(n.events.goals).toBe(22);
    expect(n.events.red).toBe(0);
    expect(n.stat_votes).toBe(5);
    expect(n.visits.unique_today).toBe(7);
    expect(n.visits.platforms).toEqual([{ platform: 'ios', n: 2 }, { platform: 'otro', n: 1 }]);
    expect(n.series[0]).toEqual({ d: '2026-11-12', visitors: 2, users_new: 0, communities_new: 0, matches_played: 0, goals: 0, game_starts: 0 });
    expect(n.top_communities[0]).toMatchObject({ name: 'Amigos', slug: 'amigos', members: 12, goals: 0, created_at: null });
    expect(n.recent_users[0]).toMatchObject({ name: 'Lu', communities: 2, last_sign_in_at: null });
  });
});

describe('juegos en el panel', () => {
  it('sin datos queda en cero', () => {
    const g = normalizeStats({}).games;
    expect(g.starts_total).toBe(0);
    expect(g.difficulty).toEqual([]);
  });
  it('lee contadores y dificultades', () => {
    const g = normalizeStats({ games: { starts_total: 12, finishes_total: 4, avg_seasons: 14.5, difficulty: [{ difficulty: 'experto', n: 3 }, { n: 1 }] } }).games;
    expect(g).toMatchObject({ starts_total: 12, finishes_total: 4, avg_seasons: 14.5, players_total: 0 });
    expect(g.difficulty).toEqual([{ difficulty: 'experto', n: 3 }, { difficulty: 'otra', n: 1 }]);
  });
  it('etiquetas y decimales', () => {
    expect(difficultyLabel('intenso')).toBe('Intenso');
    expect(difficultyLabel('otra')).toBe('Sin dato');
    expect(difficultyLabel('leyenda')).toBe('Leyenda');
    expect(fmtDec(14.5)).toBe('14,5');
    expect(fmtDec(3)).toBe('3');
    expect(fmtDec(2.06)).toBe('2,1');
  });
});
