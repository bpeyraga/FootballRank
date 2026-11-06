import { describe, expect, it } from 'vitest';
import {
  arParts, clip, clubForTeam, clubNews, clubOf, CLUBS, crestUrl, dayKey, dayLabel, finishNews, fixturesTtl, groupByDay,
  isFootball, mentionsClub, monthsAround, newsSources, normalizeEvent, normalizeFixtures, normalizeTable, parseRss,
  pickFeed, prettyName, qualifies, relTime, resultFor, sameClub, shortDay, teamMatches, timeAR, type Match, type NewsItem,
} from './futbol';
import { KITS } from '../../shared/teams';
import coreSrc from './futbolCore.ts?raw';
import fnSrc from '../../../supabase/functions/futbol/index.ts?raw';

// ---------- fixtures chicos (con la forma real de ESPN) ----------
const team = (id: string, displayName: string) => ({ id, displayName, shortDisplayName: displayName });
const ev = (id: string, date: string, state: 'pre' | 'in' | 'post', name: string, home: [string, string, string | number | null], away: [string, string, string | number | null],
  extra: Record<string, unknown> = {}) => ({
  id, date, season: { slug: 'torneo-clausura' },
  competitions: [{
    status: { displayClock: "34'", type: { name, state, shortDetail: state === 'in' ? "34'" : 'FT' } },
    venue: { fullName: 'Estadio Claudio Chiqui Tapia' },
    competitors: [
      { homeAway: 'home', score: home[2], team: team(home[0], home[1]), ...(extra.hp !== undefined ? { shootoutScore: extra.hp } : {}) },
      { homeAway: 'away', score: away[2], team: team(away[0], away[1]), ...(extra.ap !== undefined ? { shootoutScore: extra.ap } : {}) },
    ],
  }],
});

const NOW = Date.parse('2026-11-06T18:34:00Z'); // viernes 6/11, 15:34 en Argentina

describe('normalizeEvent', () => {
  it('partido en juego: estado, minuto, goles y cancha', () => {
    const m = normalizeEvent(ev('1', '2026-11-06T18:00Z', 'in', 'STATUS_FIRST_HALF', ['10060', 'Barracas Central', '1'], ['15', 'Racing Club', '0']))!;
    expect(m).toMatchObject({ id: '1', st: 'in', label: "34'", phase: null, venue: 'Estadio Claudio Chiqui Tapia' });
    expect(m.date).toBe('2026-11-06T18:00:00.000Z');
    expect(m.h).toEqual({ id: '10060', name: 'Barracas Central', score: 1 });
    expect(m.a.score).toBe(0);
  });
  it('por jugar: sin goles ni etiqueta; terminado: Final; el score puede venir como objeto', () => {
    const pre = normalizeEvent(ev('2', '2026-11-07T20:30Z', 'pre', 'STATUS_SCHEDULED', ['5', 'Boca Juniors', null], ['8950', 'Defensa y Justicia', null]))!;
    expect(pre).toMatchObject({ st: 'pre', label: '' });
    expect(pre.h.score).toBeNull();
    const post = normalizeEvent(ev('3', '2026-11-01T18:00Z', 'post', 'STATUS_FULL_TIME', ['5', 'Boca Juniors', { value: 1, displayValue: '1' } as any], ['16', 'River Plate', '0']))!;
    expect(post).toMatchObject({ st: 'post', label: 'Final' });
    expect(post.h.score).toBe(1);
  });
  it('entretiempo, penales y fases de eliminación', () => {
    expect(normalizeEvent(ev('4', '2026-11-06T18:00Z', 'in', 'STATUS_HALFTIME', ['1', 'A', '0'], ['2', 'B', '0']))!.label).toBe('Entretiempo');
    const pen = normalizeEvent({ ...ev('5', '2026-11-22T18:00Z', 'post', 'STATUS_FINAL_PEN', ['1', 'A', '1'], ['2', 'B', '1'], { hp: 4, ap: 3 }), season: { slug: 'clausura---quarterfinals' } })!;
    expect(pen.label).toBe('Final (penales 4-3)');
    expect(pen.phase).toBe('Cuartos de final');
    expect(normalizeEvent({ ...ev('6', '2026-11-22T18:00Z', 'pre', 'STATUS_SCHEDULED', ['1', 'A', null], ['2', 'B', null]), season: { slug: 'clausura---round-of-16' } })!.phase).toBe('Octavos de final');
    expect(normalizeEvent({ ...ev('7', '2026-11-22T18:00Z', 'pre', 'STATUS_POSTPONED', ['1', 'A', null], ['2', 'B', null]) })!.label).toBe('Postergado');
  });
  it('devuelve null si falta algo esencial', () => {
    expect(normalizeEvent(null)).toBeNull();
    expect(normalizeEvent({ id: '1', date: 'mañana', competitions: [] })).toBeNull();
    expect(normalizeEvent({ ...ev('8', 'no es fecha', 'pre', 'STATUS_SCHEDULED', ['1', 'A', null], ['2', 'B', null]) })).toBeNull();
  });
});

describe('normalizeFixtures', () => {
  const a = ev('1', '2026-11-06T18:00Z', 'in', 'STATUS_FIRST_HALF', ['10060', 'Barracas Central', '1'], ['15', 'Racing Club', '0']);
  const b = ev('2', '2026-11-01T18:00Z', 'post', 'STATUS_FULL_TIME', ['5', 'Boca Juniors', '1'], ['16', 'River Plate', '0']);
  const c = ev('3', '2026-11-07T20:30Z', 'pre', 'STATUS_SCHEDULED', ['5', 'Boca Juniors', null], ['8950', 'Defensa y Justicia', null]);
  const old = ev('4', '2026-05-01T18:00Z', 'post', 'STATUS_FULL_TIME', ['5', 'Boca Juniors', '2'], ['16', 'River Plate', '2']);
  const far = ev('5', '2027-03-01T18:00Z', 'pre', 'STATUS_SCHEDULED', ['5', 'Boca Juniors', null], ['16', 'River Plate', null]);

  it('une los meses, saca repetidos y partidos fuera de la ventana, y ordena por fecha', () => {
    const f = normalizeFixtures([{ events: [a, c, old] }, { events: [b, a, far] }, null, {}], NOW);
    expect(f.matches.map(m => m.id)).toEqual(['2', '1', '3']);
  });
});

describe('fixturesTtl', () => {
  const mk = (st: Match['st'], date: string): Match => ({ id: date, date, st, label: '', phase: null, venue: null, h: { id: '1', name: 'A', score: null }, a: { id: '2', name: 'B', score: null } });
  it('2 min con un partido en juego o recién arrancado; 12 min si no', () => {
    expect(fixturesTtl({ matches: [mk('in', '2026-11-06T18:00:00Z')] }, NOW)).toBe(2 * 60_000);
    expect(fixturesTtl({ matches: [mk('pre', '2026-11-06T18:30:00Z')] }, NOW)).toBe(2 * 60_000); // ya debería haber arrancado
    expect(fixturesTtl({ matches: [mk('pre', '2026-11-07T20:30:00Z'), mk('post', '2026-11-05T20:00:00Z')] }, NOW)).toBe(12 * 60_000);
    expect(fixturesTtl(null, NOW)).toBe(12 * 60_000);
  });
});

describe('monthsAround', () => {
  it('mes anterior, actual y siguiente (hora argentina), cruzando años', () => {
    expect(monthsAround(NOW)).toEqual(['202610', '202611', '202612']);
    expect(monthsAround(Date.parse('2026-01-15T12:00:00Z'))).toEqual(['202512', '202601', '202602']);
    expect(monthsAround(Date.parse('2026-12-20T12:00:00Z'))).toEqual(['202611', '202612', '202701']);
    // 1° de enero 01:00 UTC todavía es 31 de diciembre en Argentina
    expect(monthsAround(Date.parse('2027-01-01T01:00:00Z'))).toEqual(['202611', '202612', '202701']);
  });
});

describe('normalizeTable', () => {
  const entry = (id: string, name: string, rank: number, pts: number, gp: number, gf: number, ga: number) => ({
    team: team(id, name),
    stats: [
      { name: 'rank', value: rank }, { name: 'points', value: pts }, { name: 'gamesPlayed', value: gp }, { name: 'wins', value: 5 },
      { name: 'ties', value: 2 }, { name: 'losses', value: 1 }, { name: 'pointsFor', value: gf }, { name: 'pointsAgainst', value: ga },
      { name: 'pointDifferential', value: gf - ga },
    ],
  });
  const standings = {
    children: [
      { name: 'Group A', standings: { season: 2026, entries: [entry('5', 'Boca Juniors', 2, 30, 15, 23, 14), entry('2975', 'Instituto (Córdoba)', 1, 33, 15, 24, 13)] } },
      { name: 'Group B', standings: { season: 2026, entries: [entry('16', 'River Plate', 1, 26, 16, 20, 10)] } },
      { name: 'Group C', standings: { entries: [] } },
    ],
    seasons: [{ types: [
      { name: 'Torneo Apertura', startDate: '2026-01-01T05:00Z', endDate: '2026-05-07T03:59Z', hasStandings: true },
      { name: 'Apertura - Final', startDate: '2026-05-12T04:00Z', endDate: '2026-07-01T03:59Z', hasStandings: false },
      { name: 'Torneo Clausura', startDate: '2026-07-01T04:00Z', endDate: '2026-11-09T04:59Z', hasStandings: true },
    ] }],
  };
  it('zonas con sus filas ordenadas por posición, torneo vigente y temporada', () => {
    const t = normalizeTable(standings, NOW);
    expect(t.season).toBe(2026);
    expect(t.torneo).toBe('Torneo Clausura');
    expect(t.groups.map(g => g.name)).toEqual(['Zona A', 'Zona B']); // la zona vacía no aparece
    expect(t.groups[0].rows.map(r => r.team)).toEqual(['Instituto (Córdoba)', 'Boca Juniors']);
    expect(t.groups[0].rows[0]).toEqual({ pos: 1, id: '2975', team: 'Instituto (Córdoba)', pj: 15, pg: 5, pe: 2, pp: 1, gf: 24, gc: 13, dg: 11, pts: 33 });
  });
  it('después de terminado el torneo sigue siendo el último con tabla; tabla única sin zonas', () => {
    expect(normalizeTable(standings, Date.parse('2026-12-01T12:00:00Z')).torneo).toBe('Torneo Clausura');
    const single = normalizeTable({ standings: { entries: [entry('1', 'A', 1, 3, 1, 1, 0)] } }, NOW);
    expect(single.groups).toHaveLength(1);
    expect(single.groups[0].name).toBe('');
    expect(normalizeTable({}, NOW).groups).toEqual([]);
  });
});

// ---------- RSS ----------
const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Feed</title><link>https://x.com</link>
<item><title><![CDATA["Todavía no caigo": la emoción de Espíndola en River]]></title>
<description><![CDATA[<p>El volante de 18 años cumplió el sueño en el Minella &amp; sus sensaciones.</p>]]></description>
<link>https://www.ole.com.ar/river-plate/espindola_0_abc.html</link><pubDate>Fri, 06 Nov 2026 17:20:07 +0000</pubDate>
<enclosure url="https://www.ole.com.ar/images/2026/11/06/a_1200x630__1.jpg" length="0" type="image/jpg"/></item>
<item><title>Racing &amp; Barracas: formaciones</title><link>https://www.infobae.com/deportes/2026/11/06/racing/</link>
<description>La Academia y el Guapo se ven las caras. &lt;b&gt;Hora&lt;/b&gt;: 15 &#39;hs&#39;</description><pubDate>Fri, 06 Nov 2026 18:11:07 +0000</pubDate>
<content:encoded><![CDATA[<img src="https://x.com/body.png"/><p>CUERPO COMPLETO DE LA NOTA que nunca se debe copiar ${'palabra '.repeat(80)}</p>]]></content:encoded>
<media:content url="https://www.infobae.com/resizer/v2/X.jpg?auth=abc&amp;smart=true&amp;width=1920" type="image/jpeg" height="1080" width="1920"><media:description type="plain"><![CDATA[Pie de foto]]></media:description></media:content></item>
<item><title>Solo con imagen en el cuerpo</title><link>https://www.clarin.com/deportes/solo-body/</link>
<description><![CDATA[<ul><li>Primer punto.</li><li>Segundo punto.</li></ul>]]></description><pubDate>Fri, 06 Nov 2026 16:00:00 +0000</pubDate>
<content:encoded><![CDATA[<p><img src="http://x.com/img/foto.png" alt="f"/>texto</p>]]></content:encoded></item>
<item><title>Sin link</title><pubDate>Fri, 06 Nov 2026 16:00:00 +0000</pubDate></item>
<item><title>Link raro</title><link>javascript:alert(1)</link><pubDate>Fri, 06 Nov 2026 16:00:00 +0000</pubDate></item>
<item><title>Sin fecha</title><link>https://x.com/a</link></item>
<item><title>Igual al resumen</title><link>https://x.com/b</link><description>Igual al resumen</description><pubDate>Fri, 06 Nov 2026 15:00:00 +0000</pubDate></item>
</channel></rss>`;

describe('parseRss', () => {
  const items = parseRss(RSS, 'ole');
  it('toma título, resumen sin HTML ni entidades, link, fuente y fecha ISO; descarta las notas inválidas', () => {
    expect(items.map(i => i.url)).toEqual([
      'https://www.ole.com.ar/river-plate/espindola_0_abc.html',
      'https://www.infobae.com/deportes/2026/11/06/racing/',
      'https://www.clarin.com/deportes/solo-body/',
      'https://x.com/b',
    ]);
    expect(items[0]).toMatchObject({
      title: '"Todavía no caigo": la emoción de Espíndola en River',
      summary: 'El volante de 18 años cumplió el sueño en el Minella & sus sensaciones.',
      source: 'ole', date: '2026-11-06T17:20:07.000Z',
    });
    expect(items[1].title).toBe('Racing & Barracas: formaciones');
    expect(items[1].summary).toBe("La Academia y el Guapo se ven las caras. Hora: 15 'hs'");
    expect(items[2].summary).toBe('Primer punto. Segundo punto.');
  });
  it('la imagen sale de enclosure, media:content (con &amp; decodificado) o del primer <img>, siempre https', () => {
    expect(items[0].image).toBe('https://www.ole.com.ar/images/2026/11/06/a_1200x630__1.jpg');
    expect(items[1].image).toBe('https://www.infobae.com/resizer/v2/X.jpg?auth=abc&smart=true&width=1920');
    expect(items[2].image).toBe('https://x.com/img/foto.png');
  });
  it('nunca copia el cuerpo de la nota y el resumen que es igual al título queda vacío', () => {
    expect(JSON.stringify(items)).not.toContain('CUERPO COMPLETO');
    expect(items[3].summary).toBe('');
  });
  it('clip: hasta 200 caracteres, cortando en una palabra y con puntos suspensivos', () => {
    const long = 'palabra '.repeat(60).trim();
    const c = clip(long);
    expect(c.length).toBeLessThanOrEqual(201);
    expect(c.endsWith('palabra…')).toBe(true);
    expect(clip('corto')).toBe('corto');
    for (const i of parseRss(RSS.replace('El volante de 18 años', 'x '.repeat(200)), 'ole')) expect(i.summary.length).toBeLessThanOrEqual(201);
  });
  it('un feed vacío o roto no explota', () => {
    expect(parseRss('', 'ole')).toEqual([]);
    expect(parseRss('<html>no es rss</html>', 'ole')).toEqual([]);
    expect(parseRss(RSS, 'ole', 1)).toHaveLength(1);
  });
});

const item = (title: string, url: string, date: string, extra: Partial<NewsItem> = {}): NewsItem => ({ title, summary: '', url, image: null, source: 'ole', date, ...extra });

describe('finishNews', () => {
  it('saca repetidas (mismo link o mismo título), deja la más nueva, la completa con la imagen y ordena', () => {
    const out = finishNews([
      item('Boca gana', 'https://www.ole.com.ar/boca/a.html?utm=1', '2026-11-06T10:00:00Z', { source: 'ole' }),
      item('Boca gana', 'https://www.clarin.com/deportes/boca-gana/', '2026-11-06T12:00:00Z', { source: 'clarin', image: 'https://x.com/i.jpg', summary: 'Resumen' }),
      item('Otra nota', 'https://www.ole.com.ar/boca/a.html', '2026-11-06T09:00:00Z'),
      item('Última', 'https://x.com/z', '2026-11-06T13:00:00Z'),
      item('ÚLTIMA!', 'https://x.com/y', '2026-11-06T08:00:00Z'),
    ]);
    expect(out.map(n => n.title)).toEqual(['Última', 'Boca gana']);
    expect(out[1]).toMatchObject({ source: 'clarin', image: 'https://x.com/i.jpg' });
  });
  it('corta en el máximo', () => {
    const many = Array.from({ length: 10 }, (_, i) => item(`n${i}`, `https://x.com/${i}`, `2026-11-06T1${i}:00:00Z`));
    expect(finishNews(many, 3).map(n => n.title)).toEqual(['n9', 'n8', 'n7']);
  });
});

describe('pickFeed', () => {
  const list = [
    item('Racing visita a Barracas por el Clausura', 'https://infobae.com/deportes/2026/11/06/racing/', '2026-11-06T10:00:00Z'),
    item('Los Pumas vs. Irlanda por el Nations Championship', 'https://ole.com.ar/rugby/pumas/', '2026-11-06T11:00:00Z'),
    item('Colapinto y la multa en San Pablo', 'https://ole.com.ar/autos/francocolapinto-formula1-interlagos/', '2026-11-06T12:00:00Z', { summary: 'El piloto de fútbol…' }),
    item('El Mercedes Maybach de LeBron James', 'https://infobae.com/america/mundo/lebron/', '2026-11-06T13:00:00Z'),
    item('Messi va por otro récord en la MLS', 'https://clarin.com/deportes/messi/', '2026-11-06T14:00:00Z'),
    item('Boca se prepara', 'https://clarin.com/deportes/boca/', '2026-11-06T09:00:00Z'),
  ];
  it('en los feeds generales deja solo fútbol (palabras de fútbol o un club) y descarta otros deportes', () => {
    expect(pickFeed(list, true, 10).map(n => n.title)).toEqual(['Messi va por otro récord en la MLS', 'Racing visita a Barracas por el Clausura', 'Boca se prepara']);
  });
  it('en los feeds de fútbol no filtra; ordena por fecha y respeta el tope', () => {
    expect(pickFeed(list, false, 2).map(n => n.title)).toEqual(['Messi va por otro récord en la MLS', 'El Mercedes Maybach de LeBron James']);
  });
  it('isFootball', () => {
    expect(isFootball(item('Goleada', 'https://x.com/a', '2026-11-06T10:00:00Z'))).toBe(false);
    expect(isFootball(item('Los goles de la fecha', 'https://x.com/a', '2026-11-06T10:00:00Z'))).toBe(true);
  });
});

// ---------- Clubes ----------
describe('clubes', () => {
  it('todos los equipos de teams.ts tienen su club (con alias) y no hay nombres repetidos', () => {
    const names = CLUBS.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(Object.keys(KITS).sort());
    for (const c of CLUBS) expect(c.alias.length).toBeGreaterThan(0);
    expect(clubOf('Boca Juniors')?.ole).toBe('boca-juniors');
    expect(clubOf("newell's old boys")?.name).toBe("Newell's Old Boys");
    expect(clubOf('Boca')).toBeNull();
    expect(clubOf(null)).toBeNull();
  });
  it('equipos de ESPN ↔ club de la app', () => {
    const pairs: [string, string][] = [
      ['Belgrano (Córdoba)', 'Belgrano'], ['Central Córdoba (Santiago del Estero)', 'Central Córdoba (SdE)'], ['Gimnasia La Plata', 'Gimnasia de La Plata'],
      ['Gimnasia (Mendoza)', 'Gimnasia de Mendoza'], ['Instituto (Córdoba)', 'Instituto'], ['Unión (Santa Fe)', 'Unión'], ['Sarmiento (Junín)', 'Sarmiento'],
      ['Talleres (Córdoba)', 'Talleres'], ["Newell's Old Boys", "Newell's Old Boys"], ['Vélez Sarsfield', 'Vélez Sarsfield'], ['Racing Club', 'Racing Club'],
      ['Independiente Rivadavia', 'Independiente Rivadavia'], ['Independiente', 'Independiente'], ['Estudiantes de Río Cuarto', 'Estudiantes de Río Cuarto'],
    ];
    for (const [espn, app] of pairs) expect(clubForTeam(espn)?.name, espn).toBe(app);
    expect(sameClub(clubOf('Independiente')!, 'Independiente Rivadavia')).toBe(false);
    expect(clubForTeam('Real Madrid')).toBeNull();
    expect(prettyName('Gimnasia La Plata')).toBe('Gimnasia de La Plata');
    expect(prettyName('Real Madrid (España)')).toBe('Real Madrid');
  });
  it('mentionsClub: palabra entera, mayúscula del alias, sin tildes, y desambigua', () => {
    const boca = clubOf('Boca Juniors')!, ind = clubOf('Independiente')!, est = clubOf('Estudiantes de La Plata')!, lanus = clubOf('Lanús')!;
    expect(mentionsClub('Boca recibe a Defensa en la Bombonera', boca)).toBe(true);
    expect(mentionsClub('El Xeneize busca su lugar', boca)).toBe(true);
    expect(mentionsClub('Habló de boca en boca y de Bocanegra', boca)).toBe(false);
    expect(mentionsClub('Independiente recibe a Riestra', ind)).toBe(true);
    expect(mentionsClub('Independiente Rivadavia lidera la zona', ind)).toBe(false);
    expect(mentionsClub('Independiente Rivadavia y Independiente empatan', ind)).toBe(true);
    expect(mentionsClub('Estudiantes de Río Cuarto sorprende', est)).toBe(false);
    expect(mentionsClub('Gran noche del Pincha', est)).toBe(true);
    expect(mentionsClub('Lanus visita a Central', lanus)).toBe(true);
    expect(mentionsClub("Newell’s y la Lepra", clubOf("Newell's Old Boys")!)).toBe(true);
    expect(mentionsClub('Gimnasia de Mendoza ganó', clubOf('Gimnasia de La Plata')!)).toBe(false);
    expect(mentionsClub('Gimnasia de Mendoza ganó', clubOf('Gimnasia de Mendoza')!)).toBe(true);
  });
  it('clubNews: junta las del feed propio con las generales que nombran al club, sin repetir', () => {
    const boca = clubOf('Boca Juniors')!;
    const own = [item('Boca: lista de concentrados', 'https://ole.com.ar/boca/lista', '2026-11-06T10:00:00Z')];
    const general = [
      item('Boca: lista de concentrados', 'https://clarin.com/lista', '2026-11-06T11:00:00Z', { source: 'clarin' }),
      item('River gana', 'https://clarin.com/river', '2026-11-06T12:00:00Z', { source: 'clarin' }),
      item('Messi y Boca', 'https://clarin.com/messi', '2026-11-06T09:00:00Z', { source: 'clarin' }),
    ];
    expect(clubNews(boca, own, general).map(n => n.url)).toEqual(['https://clarin.com/lista', 'https://clarin.com/messi']);
  });
});

describe('teamMatches', () => {
  const m = (id: string, date: string, st: Match['st'], h: [string, string, number | null], a: [string, string, number | null]): Match => ({
    id, date, st, label: '', phase: null, venue: null, h: { id: h[0], name: h[1], score: h[2] }, a: { id: a[0], name: a[1], score: a[2] },
  });
  const ms = [
    m('1', '2026-10-17T20:00:00Z', 'post', ['5', 'Boca Juniors', 2], ['19', 'Talleres (Córdoba)', 1]),
    m('2', '2026-10-25T20:00:00Z', 'post', ['11', 'Independiente', 0], ['5', 'Boca Juniors', 1]),
    m('3', '2026-11-01T20:00:00Z', 'post', ['5', 'Boca Juniors', 1], ['16', 'River Plate', 0]),
    m('4', '2026-11-07T20:30:00Z', 'pre', ['5', 'Boca Juniors', null], ['8950', 'Defensa y Justicia', null]),
    m('5', '2026-11-14T20:30:00Z', 'pre', ['9744', 'Independiente Rivadavia', null], ['5', 'Boca Juniors', null]),
    m('6', '2026-11-07T20:30:00Z', 'pre', ['17', 'Rosario Central', null], ['11', 'Independiente', null]),
  ];
  it('últimos (el más nuevo primero) y próximos (el más cercano primero) de un club, y su id', () => {
    const t = teamMatches(ms, clubOf('Boca Juniors')!);
    expect(t.id).toBe('5');
    expect(t.last.map(x => x.id)).toEqual(['3', '2', '1']);
    expect(t.next.map(x => x.id)).toEqual(['4', '5']);
    expect(teamMatches(ms, clubOf('Independiente')!).next.map(x => x.id)).toEqual(['6']);
    expect(teamMatches(ms, clubOf('Quilmes')!)).toEqual({ id: null, next: [], last: [] });
  });
  it('resultFor: G, E o P según el id del equipo', () => {
    expect(resultFor(ms[0], '5')).toBe('G');
    expect(resultFor(ms[0], '19')).toBe('P');
    expect(resultFor(ms[1], '11')).toBe('P');
    expect(resultFor({ ...ms[0], a: { ...ms[0].a, score: 2 } }, '5')).toBe('E');
    expect(resultFor(ms[3], '5')).toBeNull();
    expect(resultFor(ms[0], '99')).toBeNull();
  });
});

// ---------- Fechas en hora argentina ----------
describe('fechas (America/Argentina/Buenos_Aires)', () => {
  it('arParts / dayKey / timeAR / shortDay', () => {
    expect(arParts(Date.parse('2026-11-06T21:00:00Z'))).toEqual({ y: 2026, m: 11, d: 6, h: 18, mi: 0, wd: 5 });
    expect(dayKey(Date.parse('2026-11-07T02:30:00Z'))).toBe('2026-11-06'); // sigue siendo viernes a la noche
    expect(timeAR('2026-11-07T02:30:00Z')).toBe('23:30');
    expect(timeAR('2026-11-06T03:00:00Z')).toBe('00:00'); // medianoche: nunca "24:00"
    expect(shortDay('2026-11-08T22:30:00Z')).toBe('Dom 8 nov');
  });
  it('dayLabel: Hoy, Mañana, Ayer o el día', () => {
    expect(dayLabel('2026-11-06T22:00:00Z', NOW)).toBe('Hoy');
    expect(dayLabel('2026-11-07T20:30:00Z', NOW)).toBe('Mañana');
    expect(dayLabel('2026-11-05T23:15:00Z', NOW)).toBe('Ayer');
    expect(dayLabel('2026-11-14T20:30:00Z', NOW)).toBe('Sáb 14 nov');
  });
  it('relTime', () => {
    const at = (min: number) => new Date(NOW - min * 60_000).toISOString();
    expect(relTime(at(0), NOW)).toBe('ahora');
    expect(relTime(at(5), NOW)).toBe('hace 5 min');
    expect(relTime(at(180), NOW)).toBe('hace 3 h');
    expect(relTime(at(60 * 30), NOW)).toBe('ayer');
    expect(relTime(at(60 * 24 * 3), NOW)).toBe('hace 3 d');
    expect(relTime(at(60 * 24 * 20), NOW)).toBe('17 oct');
    expect(relTime('basura', NOW)).toBe('');
  });
  it('groupByDay: un grupo por día argentino, con el rótulo relativo', () => {
    const mk = (id: string, date: string): Match => ({ id, date, st: 'pre', label: '', phase: null, venue: null, h: { id: '1', name: 'A', score: null }, a: { id: '2', name: 'B', score: null } });
    const g = groupByDay([
      mk('1', '2026-11-06T22:00:00Z'), mk('2', '2026-11-07T02:30:00Z'), // viernes 19:00 y 23:30
      mk('3', '2026-11-07T20:30:00Z'), mk('4', '2026-11-14T20:30:00Z'),
    ], NOW);
    expect(g.map(x => [x.label, x.matches.map(m => m.id)])).toEqual([
      ['Hoy · Vie 6 nov', ['1', '2']], ['Mañana · Sáb 7 nov', ['3']], ['Sáb 14 nov', ['4']],
    ]);
  });
});

describe('varios', () => {
  it('crestUrl solo con ids numéricos; qualifies solo si hay zonas; newsSources cuenta por fuente', () => {
    expect(crestUrl('5')).toContain('/soccer/500/5.png');
    expect(crestUrl('5', true)).toContain('/soccer/500-dark/5.png');
    expect(crestUrl('5/../x')).toBeNull();
    expect(qualifies(8, 2)).toBe(true);
    expect(qualifies(9, 2)).toBe(false);
    expect(qualifies(1, 1)).toBe(false);
    expect(newsSources([item('a', 'https://a', '2026-11-06T10:00:00Z'), item('b', 'https://b', '2026-11-06T10:00:00Z', { source: 'clarin' }), item('c', 'https://c', '2026-11-06T10:00:00Z')]))
      .toEqual([{ id: 'ole', name: 'Olé', n: 2 }, { id: 'clarin', name: 'Clarín', n: 1 }]);
  });
});

describe('Edge Function futbol', () => {
  it('lleva una copia exacta de src/lib/futbolCore.ts entre los marcadores SHARED', () => {
    const nl = (s: string) => s.replace(/\r\n/g, '\n').trim();
    const open = '// ===== BEGIN SHARED (copia de src/lib/futbolCore.ts) =====';
    const close = '// ===== END SHARED =====';
    const a = fnSrc.indexOf(open), b = fnSrc.indexOf(close);
    expect(a, 'falta el marcador BEGIN SHARED').toBeGreaterThan(-1);
    expect(b, 'falta el marcador END SHARED').toBeGreaterThan(a);
    // Si falla: pegá todo src/lib/futbolCore.ts entre los marcadores de supabase/functions/futbol/index.ts
    expect(nl(fnSrc.slice(a + open.length, b))).toBe(nl(coreSrc));
  });
});
