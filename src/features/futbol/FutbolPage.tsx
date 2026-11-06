import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Profile } from '../../shared/supabase';
import { fetchFutbol, type FutKind, type Reply } from './api';
import { Crest } from '../../shared/ui/Crest';
import { KITS } from '../../shared/teams';
import { initials } from '../../shared/text';
import {
  clubForTeam, clubNews, clubOf, crestUrl, dayLabel, groupByDay, newsSources, prettyName, qualifies, relTime, resultFor, sameClub,
  shortDay, SOURCES, teamMatches, timeAR,
  type Club, type Fixtures, type Match, type News, type NewsItem, type Row, type Table, type TeamData,
} from './futbol';

// ---------- Datos: se piden a la Edge Function `futbol` (ver api.ts) ----------
interface Slot<T> { r: Reply<T> | null; loading: boolean; err: boolean; reload: () => void }

/** Lo último que trajo cada pedido: al volver a la pantalla se muestra al instante y se renueva si ya pasaron 2 min. */
const mem = new Map<string, { at: number; r: Reply<any> }>();
const FRESH_MS = 2 * 60_000;

function useFut<T>(kind: FutKind, team: string | null = null, on = true): Slot<T> {
  const key = `${kind}|${team ?? ''}`;
  const [st, setSt] = useState(() => ({ r: (mem.get(key)?.r ?? null) as Reply<T> | null, loading: on && !mem.has(key), err: false }));
  const run = useCallback(async (force: boolean) => {
    setSt(s => ({ ...s, loading: true }));
    try {
      const r = await fetchFutbol<T>(kind, team, force);
      mem.set(key, { at: Date.now(), r });
      setSt({ r, loading: false, err: false });
    } catch {
      setSt(s => ({ ...s, loading: false, err: true }));
    }
  }, [key]);
  useEffect(() => {
    if (!on) return;
    const c = mem.get(key);
    if (!c || Date.now() - c.at > FRESH_MS) run(false);
  }, [key, on, run]);
  return { ...st, reload: () => run(true) };
}

// ---------- Piezas chicas ----------

/** Modo oscuro efectivo: el elegido en la app (Tema) o, en automático, el del sistema. */
const appIsDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

/** Escudo oficial (ESPN); si no carga, el escudito propio del club o las iniciales. */
function Badge({ id, name, size = 24 }: { id: string; name: string; size?: number }) {
  const [bad, setBad] = useState(false);
  const light = crestUrl(id), dark = crestUrl(id, true);
  if (!light || bad) {
    const c = clubForTeam(name);
    return c && KITS[c.name]
      ? <span class="fut-badge fut-badge-own" style={`width:${size}px;height:${size}px`}><Crest team={c.name} size={size * 0.85} /></span>
      : <span class="fut-badge fut-ph" style={`width:${size}px;height:${size}px`} aria-hidden="true">{initials(name)}</span>;
  }
  // Escudo claro u oscuro según el tema de la app (data-theme), no solo el del celular
  return (
    <img class="fut-badge" src={dark && appIsDark() ? dark : light} width={size} height={size} alt="" loading="lazy" decoding="async"
      referrerpolicy="no-referrer" style={`width:${size}px;height:${size}px`} onError={() => setBad(true)} />
  );
}

function Thumb({ src }: { src: string }) {
  const [bad, setBad] = useState(false);
  return bad ? null : <img class="fut-new-img" src={src} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setBad(true)} />;
}

const Skeleton = ({ rows = 6, h = 44 }: { rows?: number; h?: number }) => (
  <div class="fut-sk-list" aria-hidden="true">{Array.from({ length: rows }, () => <div class="fut-sk" style={`height:${h}px`} />)}</div>
);

function Problem({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div class="card empty">
      <b>No pudimos traer {what}</b>
      <p>Puede ser la conexión o que la fuente esté caída. Probá de nuevo en un rato.</p>
      <button class="btn sm" onClick={onRetry}>Reintentar</button>
    </div>
  );
}

const Note = ({ children }: { children: ComponentChildren }) => <p class="fut-note muted" role="status">{children}</p>;

/** Aviso chico cuando se muestran datos guardados porque la fuente no respondió, o no se pudo actualizar. */
const staleNote = (s: Slot<any>) => (s.r?.stale || (s.err && s.r)) ? <Note>Mostramos lo último que guardamos: no pudimos actualizar ahora.</Note> : null;

// ---------- Tabla ----------
function TableView({ t, club }: { t: Table; club: Club | null }) {
  const zones = t.groups.length;
  return (
    <>
      {t.groups.map(g => (
        <div class="card fut-group">
          {g.name && <h4>{g.name}</h4>}
          <table class="fut-table">
            <thead>
              <tr>
                <th class="c-pos">#</th><th class="c-team">Equipo</th><th class="c-n">PJ</th>
                <th class="c-s opt">PG</th><th class="c-s opt">PE</th><th class="c-s opt">PP</th><th class="c-g opt">GF</th><th class="c-g opt">GC</th>
                <th class="c-dg">DG</th><th class="c-pts">PTS</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r: Row) => (
                <tr class={`${qualifies(r.pos, zones) ? 'q' : ''} ${club && sameClub(club, r.team) ? 'mine' : ''}`.trim()}>
                  <td class="c-pos">{r.pos}</td>
                  <td class="tm"><div class="tm-in"><Badge id={r.id} name={r.team} /><span class="ellipsis">{prettyName(r.team)}</span></div></td>
                  <td>{r.pj}</td>
                  <td class="opt">{r.pg}</td><td class="opt">{r.pe}</td><td class="opt">{r.pp}</td><td class="opt">{r.gf}</td><td class="opt">{r.gc}</td>
                  <td>{r.dg > 0 ? `+${r.dg}` : r.dg}</td>
                  <td class="pts">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {zones > 1 && <p class="fut-legend muted"><i class="fut-q" aria-hidden="true" /> Clasifican a los playoffs (los 8 primeros de cada zona)</p>}
    </>
  );
}

// ---------- Partidos ----------
/** "Final (penales 4-3)" → ["Final", "pen. 4-3"]; "34'" → ["34'", ""]. */
function splitLabel(label: string): [string, string] {
  const m = label.match(/^(.*?)(?: \((.+)\))?$/);
  return [m?.[1] ?? label, (m?.[2] ?? '').replace('penales', 'pen.')];
}

function MatchRow({ m, club }: { m: Match; club: Club | null }) {
  const mine = !!club && (sameClub(club, m.h.name) || sameClub(club, m.a.name));
  const hs = m.h.score, as = m.a.score;
  const win = m.st !== 'pre' && hs !== null && as !== null && hs !== as ? (hs > as ? 'h' : 'a') : '';
  const [main, sub] = splitLabel(m.label);
  const flag = m.st === 'pre' ? m.label : sub;
  const status = m.st === 'pre'
    ? <b>{timeAR(m.date)}</b>
    : <span class={m.st === 'in' ? 'live' : ''}>{m.st === 'in' && <i class="live-dot" aria-hidden="true" />}{main}</span>;
  return (
    <li class={`fut-m ${m.st}${mine ? ' mine' : ''}`}>
      <div class="fut-m-st">{status}{flag && <span class="fut-m-flag">{flag}</span>}</div>
      <div class="fut-m-teams">
        <div class={`fut-m-t${win === 'h' ? ' w' : ''}`}><Badge id={m.h.id} name={m.h.name} /><span class="ellipsis">{prettyName(m.h.name)}</span></div>
        <div class={`fut-m-t${win === 'a' ? ' w' : ''}`}><Badge id={m.a.id} name={m.a.name} /><span class="ellipsis">{prettyName(m.a.name)}</span></div>
      </div>
      {m.st !== 'pre' && <div class="fut-m-sc" aria-label={`${hs ?? '-'} a ${as ?? '-'}`}><b>{hs ?? '-'}</b><b>{as ?? '-'}</b></div>}
      {(m.phase || (m.venue && m.st !== 'post')) && (
        <div class="fut-m-v ellipsis">{m.phase && <b class="fut-phase">{m.phase}</b>}{m.phase && m.venue && m.st !== 'post' ? ' · ' : ''}{m.st !== 'post' ? m.venue : ''}</div>
      )}
    </li>
  );
}

function DayList({ ms, now, club }: { ms: Match[]; now: number; club: Club | null }) {
  return (
    <>
      {groupByDay(ms, now).map(g => (
        <section>
          <h4 class="fut-day">{g.label}</h4>
          <ul class="fut-list">{g.matches.map(m => <MatchRow m={m} club={club} />)}</ul>
        </section>
      ))}
    </>
  );
}

/** Los que se están jugando, todos juntos y arriba de todo. */
function LiveList({ ms, club }: { ms: Match[]; club: Club | null }) {
  return (
    <section>
      <h4 class="fut-day live"><i class="live-dot" aria-hidden="true" />En vivo</h4>
      <ul class="fut-list">{ms.map(m => <MatchRow m={m} club={club} />)}</ul>
    </section>
  );
}

function FixturesView({ f, now, club }: { f: Fixtures; now: number; club: Club | null }) {
  const live = f.matches.filter(m => m.st === 'in');
  const next = f.matches.filter(m => m.st === 'pre');
  const past = f.matches.filter(m => m.st === 'post').reverse();
  const [tab, setTab] = useState<'next' | 'past'>(next.length || live.length || !past.length ? 'next' : 'past');
  return (
    <>
      <div class="fut-pills" role="group" aria-label="Qué partidos ver">
        <button class="fut-pill" aria-pressed={tab === 'next'} onClick={() => setTab('next')}>
          {live.length > 0 && <i class="live-dot" aria-hidden="true" />}Próximos
        </button>
        <button class="fut-pill" aria-pressed={tab === 'past'} onClick={() => setTab('past')}>Resultados</button>
      </div>
      {tab === 'next' && (
        <>
          {live.length > 0 && <LiveList ms={live} club={club} />}
          {live.length > 0 && next.length > 0 && <div class="fut-gap" />}
          {next.length > 0 && <DayList ms={next} now={now} club={club} />}
          {!live.length && !next.length && <div class="card empty"><b>No hay partidos programados</b><p>Cuando se sepa la próxima fecha aparece acá.</p></div>}
        </>
      )}
      {tab === 'past' && (past.length
        ? <DayList ms={past} now={now} club={club} />
        : <div class="card empty"><b>Todavía no hay resultados</b><p>Los partidos terminados de las últimas semanas aparecen acá.</p></div>)}
    </>
  );
}

// ---------- Noticias ----------
function NewsCard({ n, now }: { n: NewsItem; now: number }) {
  return (
    <a class="fut-new" href={n.url} target="_blank" rel="noopener noreferrer">
      <div class="fut-new-body">
        <div class="fut-new-meta">
          <span class="fut-src">{SOURCES[n.source] ?? n.source}</span><span>{relTime(n.date, now)}</span>
          <svg class="fut-ext" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" role="img" aria-label="Se abre en el sitio original">
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </div>
        <b class="fut-new-t">{n.title}</b>
        {n.summary && <p class="fut-new-s">{n.summary}</p>}
      </div>
      {n.image && <Thumb src={n.image} />}
    </a>
  );
}

function NewsView({ items, mine, club, now }: { items: NewsItem[]; mine: NewsItem[]; club: Club | null; now: number }) {
  const [chip, setChip] = useState('all');
  const sources = newsSources(items);
  const shown = chip === 'all' ? items : chip === 'club' ? mine : items.filter(n => n.source === chip);
  const chipBtn = (id: string, label: string, n: number) => (
    <button class="fut-chip" aria-pressed={chip === id} onClick={() => setChip(id)}>{label}<span>{n}</span></button>
  );
  return (
    <>
      <div class="fut-chips" role="group" aria-label="Filtrar noticias">
        {chipBtn('all', 'Todas', items.length)}
        {club && chipBtn('club', 'Mi club', mine.length)}
        {sources.map(s => chipBtn(s.id, s.name, s.n))}
      </div>
      {shown.length
        ? <div class="fut-news">{shown.map(n => <NewsCard n={n} now={now} />)}</div>
        : <div class="card empty">
          <b>{chip === 'club' ? `Hoy no hay notas de ${club?.name ?? 'tu club'}` : 'No hay notas con este filtro'}</b>
          <p>{chip === 'club' ? 'Se renuevan solas: volvé en un rato o mirá todas las noticias.' : 'Probá con otra fuente.'}</p>
          <button class="btn sm" onClick={() => setChip('all')}>Ver todas</button>
        </div>}
    </>
  );
}

// ---------- Tu club ----------
/** Color del club para teñir la tarjeta: el primero de su camiseta que no sea blanco. */
const clubColor = (name: string) => (KITS[name]?.c ?? []).find(c => c.toLowerCase() !== '#ffffff') ?? '#1f8a4c';

function MyClub({ me, club, table, fx, mine, news, now }: {
  me: Profile; club: Club | null; table: Slot<Table>; fx: Slot<Fixtures>; mine: Slot<TeamData>; news: NewsItem[]; now: number;
}) {
  if (!me.fav_team || !club) {
    return (
      <a class="fut-club fut-club-empty" href="#/perfil">
        <span class="fut-club-ico" aria-hidden="true">🛡️</span>
        <span><b>Elegí tu club</b><span class="muted"> y mirá acá su próximo partido, su último resultado y sus noticias.</span></span>
        <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </a>
    );
  }
  const tm = fx.r ? teamMatches(fx.r.data.matches, club) : mine.r ? mine.r.data : null;
  const id = tm?.id ?? null;
  const next = tm?.next[0] ?? null, last = tm?.last[0] ?? null;
  const row = table.r?.data.groups.flatMap(g => g.rows.map(r => ({ r, zone: g.name }))).find(x => sameClub(club, x.r.team));
  const top = news.slice(0, 3);
  // Si la lista general de partidos no llegó pero sí los del club (endpoint 'team'), se usan esos.
  // Falló solo si fallaron las dos fuentes; mientras alguna siga cargando, se espera.
  const failed = !tm && !!fx.err && !!mine.err;
  const waiting = !tm && !failed;
  const notInLeague = !!fx.r && !!table.r && !row && !id;

  const sideOf = (m: Match) => (m.h.id === id ? m.a : m.h);
  const nextBox = () => {
    if (waiting) return <div class="fut-sk" style="height:44px" />;
    if (failed) return <p class="muted fut-club-none">No pudimos traer los partidos.</p>;
    if (!next) return <p class="muted fut-club-none">{notInLeague ? 'No juega en Primera este torneo.' : 'Todavía no hay próximo partido programado.'}</p>;
    const rival = sideOf(next), home = next.h.id === id;
    return (
      <>
        <div class="fut-club-row">
          <Badge id={rival.id} name={rival.name} size={30} />
          <div class="fut-club-rival"><b class="ellipsis">{prettyName(rival.name)}</b>
            <span class="muted">{home ? 'Local' : 'Visitante'}{next.phase ? ` · ${next.phase}` : ''}</span></div>
        </div>
        <div class="fut-club-when">
          {next.st === 'in'
            ? <span class="live"><i class="live-dot" aria-hidden="true" />En vivo {next.label} · {next.h.score ?? 0}-{next.a.score ?? 0}</span>
            : <>{dayLabel(next.date, now) === shortDay(next.date) ? shortDay(next.date) : `${dayLabel(next.date, now)} · ${shortDay(next.date)}`} · <b>{timeAR(next.date)}</b></>}
        </div>
      </>
    );
  };
  const lastBox = () => {
    if (waiting) return <div class="fut-sk" style="height:44px" />;
    if (failed) return <p class="muted fut-club-none">No pudimos traer los partidos.</p>;
    if (!last || !id) return <p class="muted fut-club-none">{notInLeague ? 'Sin resultados en Primera.' : 'Todavía no hay resultados recientes.'}</p>;
    const res = resultFor(last, id), rival = sideOf(last), mineSide = last.h.id === id ? last.h : last.a;
    return (
      <>
        <div class="fut-club-row">
          <span class={`fut-res ${res ?? ''}`} aria-label={res === 'G' ? 'Ganó' : res === 'P' ? 'Perdió' : 'Empató'}>{res ?? '-'}</span>
          <div class="fut-club-rival"><b class="ellipsis">{mineSide.score ?? '-'}–{rival.score ?? '-'} vs {prettyName(rival.name)}</b>
            <span class="muted">{shortDay(last.date)}{last.label.includes('penales') ? ` · ${last.label.replace('Final ', '')}` : ''}</span></div>
        </div>
      </>
    );
  };

  return (
    <section class="fut-club" style={`--club:${clubColor(club.name)}`}>
      <div class="fut-club-top">
        <span class="fut-club-crest"><Crest team={club.name} size={54} /></span>
        <div class="fut-club-id">
          <span class="kicker">Tu club</span>
          <h2 class="ellipsis">{club.name}</h2>
          {row && <span class="fut-club-pos"><b>{row.r.pos}°</b>{row.zone ? ` ${row.zone}` : ''} · {row.r.pts} pts · {row.r.pj} PJ</span>}
        </div>
      </div>
      <div class="fut-club-box"><span class="fut-club-lbl">Próximo partido</span>{nextBox()}</div>
      <div class="fut-club-box"><span class="fut-club-lbl">Último resultado</span>{lastBox()}</div>
      {top.length > 0 && (
        <ul class="fut-club-news">
          {top.map(n => (
            <li><a href={n.url} target="_blank" rel="noopener noreferrer">
              <span class="fut-club-nt">{n.title}</span>
              <span class="muted">{SOURCES[n.source] ?? n.source} · {relTime(n.date, now)}</span>
            </a></li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Pantalla ----------
type Tab = 'tabla' | 'partidos' | 'noticias';
const TABS: [Tab, string][] = [['tabla', 'Tabla'], ['partidos', 'Partidos'], ['noticias', 'Noticias']];

export function Futbol({ me }: { me: Profile }) {
  const [tab, setTab] = useState<Tab>('tabla');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const club = clubOf(me.fav_team);
  const table = useFut<Table>('table');
  const fx = useFut<Fixtures>('fixtures');
  const news = useFut<News>('news');
  const mine = useFut<TeamData>('team', club?.name ?? null, !!club);

  const busy = table.loading || fx.loading || news.loading || mine.loading;
  const reload = () => { table.reload(); fx.reload(); news.reload(); if (club) mine.reload(); };
  const fetched = [table.r, fx.r, news.r].filter(Boolean).map(r => r!.fetched_at).sort().pop();

  const items = news.r?.data.items ?? [];
  const clubItems = club ? clubNews(club, mine.r?.data.news ?? [], items) : [];

  return (
    <div class="wrap fut-page">
      <header class="fut-head">
        <a class="muted fut-back" href="#/">← Inicio</a>
        <div class="fut-title">
          <h2>Fútbol argentino</h2>
          <span class="muted fut-sub">
            Liga Profesional{table.r?.data.torneo ? ` · ${table.r.data.torneo}` : ''}{table.r?.data.season ? ` ${table.r.data.season}` : ''}
            {fetched ? ` · actualizado ${relTime(fetched, now)}` : ''}
          </span>
        </div>
        <button class="btn sm fut-refresh" onClick={reload} disabled={busy} aria-label="Actualizar">
          <svg class={busy ? 'spin' : ''} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
          </svg>
          {busy ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      <MyClub me={me} club={club} table={table} fx={fx} mine={mine} news={clubItems} now={now} />

      <div class="fut-seg" role="tablist" aria-label="Sección">
        {TABS.map(([id, label]) => (
          <button role="tab" id={`fut-tab-${id}`} aria-selected={tab === id} aria-controls={`fut-sec-${id}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div class="fut-cols">
        <section class={`fut-sec fut-sec-tabla${tab === 'tabla' ? ' on' : ''}`} id="fut-sec-tabla" role="tabpanel" aria-labelledby="fut-tab-tabla">
          <h3>Tabla</h3>
          {staleNote(table)}
          {table.r
            ? <TableView t={table.r.data} club={club} />
            : table.err ? <Problem what="la tabla" onRetry={table.reload} /> : <Skeleton rows={10} h={40} />}
        </section>

        <section class={`fut-sec fut-sec-partidos${tab === 'partidos' ? ' on' : ''}`} id="fut-sec-partidos" role="tabpanel" aria-labelledby="fut-tab-partidos">
          <h3>Partidos</h3>
          {staleNote(fx)}
          {fx.r
            ? <FixturesView f={fx.r.data} now={now} club={club} />
            : fx.err ? <Problem what="los partidos" onRetry={fx.reload} /> : <Skeleton rows={6} h={64} />}
        </section>

        <section class={`fut-sec fut-sec-noticias${tab === 'noticias' ? ' on' : ''}`} id="fut-sec-noticias" role="tabpanel" aria-labelledby="fut-tab-noticias">
          <h3>Noticias</h3>
          {staleNote(news)}
          {news.r
            ? (items.length
              ? <NewsView items={items} mine={clubItems} club={club} now={now} />
              : <div class="card empty"><b>No hay noticias por ahora</b><p>Volvé a probar en un rato.</p></div>)
            : news.err ? <Problem what="las noticias" onRetry={news.reload} /> : <Skeleton rows={5} h={110} />}
        </section>
      </div>

      <p class="fut-foot muted">
        Tabla y partidos: ESPN. Noticias: Olé, Clarín, Infobae y La Nación; cada nota se abre en el sitio original.
        Los datos pueden tardar unos minutos en actualizarse.
      </p>
    </div>
  );
}
