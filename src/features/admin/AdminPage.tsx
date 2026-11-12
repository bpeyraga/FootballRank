import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { loadAdminStats } from './api';
import {
  dayLong, difficultyLabel, fmtDec, fmtInt, niceMax, normalizeStats, pct, platformLabel, plural, sectionLabel, seriesTotal, shortDate, timeAgo,
  type AdminStats, type SeriesKey, type SeriesPoint,
} from './adminCore';

const REFRESH_MS = 30_000;

// ---------- Piezas chicas ----------
interface Tile { l: string; v: number; sub?: string; mark?: 'y' | 'r' }

const TileView = ({ t }: { t: Tile }) => (
  <div class="sa-tile">
    <span>{t.mark && <i class={`sa-mark ${t.mark}`} aria-hidden="true" />}{t.l}</span>
    <b>{fmtInt(t.v)}</b>
    {t.sub && <small>{t.sub}</small>}
  </div>
);

const Section = ({ title, meta, children, class: cls = '' }: { title: string; meta?: string; children: ComponentChildren; class?: string }) => (
  <section class={`card sa-card ${cls}`.trim()}>
    <div class="sa-h"><h3>{title}</h3>{meta && <span class="muted">{meta}</span>}</div>
    {children}
  </section>
);

const Skeleton = () => (
  <div aria-hidden="true">
    <div class="sa-sk" style="height:168px;margin-bottom:12px" />
    <div class="sa-tiles">{Array.from({ length: 8 }, () => <div class="sa-sk" style="height:84px" />)}</div>
    <div class="sa-cols"><div class="sa-sk" style="height:260px" /><div class="sa-sk" style="height:260px" /></div>
  </div>
);

// ---------- Grupos del panel ----------
const GROUPS = [
  { id: 'vivo', label: 'En vivo' }, { id: 'personas', label: 'Personas' }, { id: 'comunidades', label: 'Comunidades' },
  { id: 'partidos', label: 'Partidos' }, { id: 'uso', label: 'Uso de la app' }, { id: 'juegos', label: 'Juegos' },
] as const;

const Group = ({ id, icon, title, desc, children }: { id: string; icon: string; title: string; desc?: string; children: ComponentChildren }) => (
  <section class="sa-group" id={`sa-${id}`} aria-labelledby={`sa-${id}-h`}>
    <header class="sa-gh">
      <span class="sa-gi" aria-hidden="true">{icon}</span>
      <div><h3 id={`sa-${id}-h`}>{title}</h3>{desc && <span class="muted">{desc}</span>}</div>
    </header>
    {children}
  </section>
);

/** Índice fijo arriba: salta a cada grupo (sin tocar el hash, que es la ruta) y marca el que se está viendo. */
function GroupNav() {
  const [cur, setCur] = useState<string>('vivo');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // El observer solo avisa de los que cambiaron: se lleva la cuenta de cuáles están en la franja y gana el primero
    // en orden de página. Al fondo del todo (el último grupo puede no llegar nunca a la franja) gana el último.
    const seen = new Set<string>();
    const last = GROUPS[GROUPS.length - 1].id;
    const atBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    const io = new IntersectionObserver(es => {
      es.forEach(x => { const id = x.target.id.replace(/^sa-/, ''); if (x.isIntersecting) seen.add(id); else seen.delete(id); });
      const first = atBottom() ? last : GROUPS.find(g => seen.has(g.id))?.id;
      if (first) setCur(first);
    }, { rootMargin: '-80px 0px -55% 0px' });
    GROUPS.forEach(g => { const el = document.getElementById(`sa-${g.id}`); if (el) io.observe(el); });
    const onScroll = () => { if (atBottom()) setCur(last); };
    addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); removeEventListener('scroll', onScroll); };
  }, []);
  const go = (id: string) => {
    setCur(id);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`sa-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <nav class="sa-nav" aria-label="Secciones del panel">
      {GROUPS.map(g => <button type="button" class={cur === g.id ? 'on' : ''} aria-current={cur === g.id ? 'true' : undefined} onClick={() => go(g.id)}>{g.label}</button>)}
    </nav>
  );
}

// ---------- En vivo ----------
function Live({ s }: { s: AdminStats }) {
  const o = s.online;
  const anon = Math.max(0, o.total - o.logged);
  return (
    <section class="card sa-live" aria-label="En vivo">
      <div class="sa-live-top">
        <div class="sa-live-n"><span class="sa-dot" aria-hidden="true" /><b>{fmtInt(o.total)}</b></div>
        <div class="sa-live-txt">
          <h3>En vivo</h3>
          <span class="muted">{o.total === 1 ? 'persona usando la app ahora' : 'personas usando la app ahora'}</span>
          <small class="muted">{anon > 0 ? `${plural(anon, 'visitante', 'visitantes')} sin iniciar sesión · ` : ''}últimos 2 minutos</small>
        </div>
      </div>
      {o.users.length > 0
        ? (
          <ul class="sa-online" aria-label="Usuarios en línea">
            {o.users.map(u => (
              <li>
                <span class="sa-who ellipsis">{u.name}</span>
                <span class="sa-where ellipsis">{platformLabel(u.platform)} · {sectionLabel(u.path)}</span>
                {u.standalone && <span class="sa-app" role="img" aria-label="App instalada" title="App instalada">📱</span>}
              </li>
            ))}
          </ul>
        )
        : <p class="muted sa-none">Nadie con sesión iniciada en este momento.</p>}
    </section>
  );
}

// ---------- Visitas e instalaciones ----------
function Visits({ s }: { s: AdminStats }) {
  const v = s.visits;
  const totalPf = v.platforms.reduce((a, p) => a + p.n, 0);
  return (
    <Section title="Visitas e instalaciones" meta="navegadores distintos">
      <div class="sa-mini">
        <div class="sa-m"><span>Hoy</span><b>{fmtInt(v.unique_today)}</b></div>
        <div class="sa-m"><span>7 días</span><b>{fmtInt(v.unique_7d)}</b></div>
        <div class="sa-m"><span>30 días</span><b>{fmtInt(v.unique_30d)}</b></div>
        <div class="sa-m"><span>Con sesión hoy</span><b>{fmtInt(v.logged_today)}</b></div>
        <div class="sa-m"><span>Usando la app instalada</span><b>{fmtInt(v.standalone_30d)}</b><small>{pct(v.standalone_30d, v.unique_30d)}% de los visitantes (30 d)</small></div>
        <div class="sa-m"><span>Instalaciones</span><b>{fmtInt(v.installs_total)}</b><small>{fmtInt(v.installs_30d)} en 30 días</small></div>
        <div class="sa-m"><span>Con avisos activados</span><b>{fmtInt(s.push_devices)}</b><small>dispositivos</small></div>
      </div>
      <h4 class="sa-h4">Plataformas (30 días)</h4>
      {v.platforms.length > 0
        ? (
          <div class="sa-hbars">
            {v.platforms.map(p => (
              <div class="sa-hb">
                <span class="sa-hb-l">{platformLabel(p.platform)}</span>
                <span class="sa-hb-t" aria-hidden="true"><i style={`width:${Math.max(2, pct(p.n, totalPf))}%`} /></span>
                <span class="sa-hb-n">{fmtInt(p.n)} <small class="muted">({pct(p.n, totalPf)}%)</small></span>
              </div>
            ))}
          </div>
        )
        : <p class="muted">Todavía no hay visitas registradas.</p>}
      <p class="muted sa-foot">
        Una visita es un navegador, no una persona. Las instalaciones solo cuentan las que avisa el navegador (Chrome, Edge, Android):
        en iPhone no se detectan, ahí mirá "usando la app instalada".
      </p>
    </Section>
  );
}

// ---------- Gráfico de 30 días ----------
const SERIES: { key: SeriesKey; label: string; unit: string }[] = [
  { key: 'visitors', label: 'Visitas', unit: 'visitas (visitantes por día, sumados)' },
  { key: 'users_new', label: 'Cuentas nuevas', unit: 'cuentas nuevas' },
  { key: 'communities_new', label: 'Comunidades nuevas', unit: 'comunidades nuevas' },
  { key: 'matches_played', label: 'Partidos', unit: 'partidos jugados' },
  { key: 'goals', label: 'Goles', unit: 'goles' },
  { key: 'game_starts', label: 'Carreras', unit: 'carreras empezadas en el juego' },
];

// ---------- Juegos ----------
function Games({ s }: { s: AdminStats }) {
  const g = s.games;
  const totalDiff = g.difficulty.reduce((a, d) => a + d.n, 0);
  return (
    <Section title="De potrero a leyenda" meta="simulador de carrera">
      <div class="sa-mini">
        <div class="sa-m"><span>Carreras empezadas</span><b>{fmtInt(g.starts_total)}</b><small>{fmtInt(g.starts_today)} hoy · {fmtInt(g.starts_7d)} en 7 días</small></div>
        <div class="sa-m"><span>Carreras terminadas</span><b>{fmtInt(g.finishes_total)}</b><small>{pct(g.finishes_total, g.starts_total)}% de las empezadas</small></div>
        <div class="sa-m"><span>Jugadores</span><b>{fmtInt(g.players_total)}</b><small>{fmtInt(g.players_7d)} en 7 días</small></div>
        <div class="sa-m"><span>Carreras por jugador</span><b>{g.players_total ? fmtDec(g.starts_total / g.players_total) : '0'}</b><small>en promedio</small></div>
        <div class="sa-m"><span>Temporadas por carrera</span><b>{fmtDec(g.avg_seasons)}</b><small>de las terminadas</small></div>
        <div class="sa-m"><span>Mejor OVR final</span><b>{fmtInt(g.best_ovr)}</b></div>
      </div>
      <h4 class="sa-h4">Dificultad elegida</h4>
      {g.difficulty.length > 0
        ? (
          <div class="sa-hbars">
            {g.difficulty.map(d => (
              <div class="sa-hb">
                <span class="sa-hb-l">{difficultyLabel(d.difficulty)}</span>
                <span class="sa-hb-t" aria-hidden="true"><i style={`width:${Math.max(2, pct(d.n, totalDiff))}%`} /></span>
                <span class="sa-hb-n">{fmtInt(d.n)} <small class="muted">({pct(d.n, totalDiff)}%)</small></span>
              </div>
            ))}
          </div>
        )
        : <p class="muted">Todavía nadie jugó.</p>}
      <p class="muted sa-foot">Solo cuenta a quienes aceptaron estadísticas en el aviso de cookies. Jugador = cuenta o, sin sesión, navegador.</p>
    </Section>
  );
}

function Trend({ series }: { series: SeriesPoint[] }) {
  const [key, setKey] = useState<SeriesKey>('visitors');
  const [sel, setSel] = useState<number | null>(null);
  const cfg = SERIES.find(x => x.key === key)!;
  const vals = series.map(p => p[key]);
  const peak = Math.max(0, ...vals);
  const max = niceMax(peak);
  const total = seriesTotal(series, key);
  const cur = Math.min(sel ?? series.length - 1, series.length - 1);
  const p = series[cur];
  const mid = series[Math.floor(series.length / 2)];

  return (
    <Section title="Últimos 30 días">
      <div class="sa-seg" role="radiogroup" aria-label="Qué mostrar en el gráfico">
        {SERIES.map(x => (
          <button role="radio" aria-checked={key === x.key} onClick={() => setKey(x.key)}>{x.label}</button>
        ))}
      </div>
      <div class="sa-total">
        <span><b>{fmtInt(total)}</b> <span class="muted">{cfg.unit} en 30 días</span></span>
        {p && <span class="sa-sel" aria-hidden="true">{dayLong(p.d)} · <b>{fmtInt(p[key])}</b></span>}
      </div>
      {series.length > 0
        ? (
          <>
            <div class="sa-chart">
              <div class="sa-y" aria-hidden="true"><span>{fmtInt(max)}</span><span>0</span></div>
              <div class="sa-plot" role="img" aria-label={`${cfg.label}, últimos 30 días: ${fmtInt(total)} en total, máximo diario ${fmtInt(peak)}.`}>
                <span class="sa-gl" style="top:0" />
                <span class="sa-gl" style="top:50%" />
                <div class="sa-bars" onPointerLeave={(e: PointerEvent) => { if (e.pointerType === 'mouse') setSel(null); }}>
                  {series.map((q, i) => (
                    <div class={`sa-col${i === cur ? ' on' : ''}`} title={`${dayLong(q.d)}: ${fmtInt(q[key])}`}
                      onPointerEnter={() => setSel(i)} onClick={() => setSel(i)}>
                      <i style={`height:${q[key] > 0 ? Math.max(3, (q[key] / max) * 100) : 0}%`} />
                    </div>
                  ))}
                </div>
              </div>
              <div class="sa-x" aria-hidden="true">
                <span>{shortDate(series[0].d)}</span><span>{shortDate(mid.d)}</span><span>{shortDate(series[series.length - 1].d)}</span>
              </div>
            </div>
            <table class="sa-sr">
              <caption>{cfg.label} por día, últimos 30 días</caption>
              <thead><tr><th>Día</th><th>{cfg.label}</th></tr></thead>
              <tbody>{series.map(q => <tr><td>{dayLong(q.d)}</td><td>{fmtInt(q[key])}</td></tr>)}</tbody>
            </table>
          </>
        )
        : <p class="muted">Sin datos todavía.</p>}
    </Section>
  );
}

// ---------- Comunidades y registros ----------
function Communities({ s, now }: { s: AdminStats; now: number }) {
  const list = s.top_communities;
  return (
    <Section title="Las más activas" meta={list.length ? `${list.length} de ${fmtInt(s.communities.total)}` : ''}>
      {list.length === 0 ? <p class="muted">Todavía no hay comunidades.</p> : (
        <table class="sa-table">
          <thead>
            <tr>
              <th>Comunidad</th><th class="n">Jugadores</th><th class="n">Sin cuenta</th><th class="n">Partidos</th><th class="n">Goles</th>
              <th class="n">Mensajes</th><th class="n">Actividad</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr>
                <td class="sa-name">{c.slug ? <a href={`#/c/${encodeURIComponent(c.slug)}`}>{c.name}</a> : c.name}</td>
                <td class="n" data-l="Jugadores">{fmtInt(c.members)}</td>
                <td class="n" data-l="Sin cuenta">{fmtInt(c.players_no_account)}</td>
                <td class="n" data-l="Partidos">{fmtInt(c.matches_played)}</td>
                <td class="n" data-l="Goles">{fmtInt(c.goals)}</td>
                <td class="n" data-l="Mensajes">{fmtInt(c.messages)}</td>
                <td class="n sa-when" data-l="Actividad">{timeAgo(c.last_activity, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function Recents({ s, now }: { s: AdminStats; now: number }) {
  return (
    <Section title="Últimos registros">
      {s.recent_users.length === 0 ? <p class="muted">Todavía no hay registros.</p> : (
        <ul class="sa-list">
          {s.recent_users.map(u => (
            <li>
              <b class="ellipsis">{u.name}</b>
              <span class="muted">Se unió {timeAgo(u.created_at, now)} · Última vez: {timeAgo(u.last_seen ?? u.last_sign_in_at, now)}</span>
              <span class="muted">{plural(u.communities, 'comunidad', 'comunidades')}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- Pantalla ----------
export function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [fail, setFail] = useState<'' | 'forbidden' | 'error'>('');
  const [busy, setBusy] = useState(true);
  const [at, setAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const seq = useRef(0);
  const lastOk = useRef(0);
  const blocked = useRef(false);

  const load = useCallback(async () => {
    if (blocked.current) return;
    const id = ++seq.current;
    setBusy(true);
    try {
      const r = await loadAdminStats();
      if (id !== seq.current) return; // llegó una respuesta más nueva
      if ('forbidden' in r) { blocked.current = true; setStats(null); setFail('forbidden'); }
      else {
        lastOk.current = Date.now();
        setStats(normalizeStats(r.data)); setAt(lastOk.current); setFail('');
      }
    } catch {
      if (id === seq.current) setFail('error');
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') { setNow(Date.now()); if (Date.now() - lastOk.current > REFRESH_MS) load(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(poll); clearInterval(tick); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  if (fail === 'forbidden') return (
    <div class="wrap sa-page">
      <a class="muted sa-back" href="#/">← Inicio</a>
      <div class="card empty">
        <b>Esta sección es solo para el equipo de El Partidito.</b>
        <a class="btn" href="#/">Volver al inicio</a>
      </div>
    </div>
  );

  const m = stats?.matches, u = stats?.users, c = stats?.communities, e = stats?.events;
  const people: Tile[] = stats && u ? [
    { l: 'Cuentas', v: u.total, sub: `+${fmtInt(u.new_7d)} esta semana · +${fmtInt(u.new_30d)} en 30 días` },
    { l: 'Activos hoy', v: u.active_24h, sub: 'últimas 24 horas' },
    { l: 'Activos 7 días', v: u.active_7d, sub: `${pct(u.active_7d, u.total)}% de las cuentas` },
    { l: 'Activos 30 días', v: u.active_30d, sub: `${pct(u.active_30d, u.total)}% de las cuentas` },
    { l: 'Jugadores', v: u.players_total, sub: `${fmtInt(u.players_no_account)} sin cuenta (cargados a mano)` },
    { l: 'Perfil completo', v: u.onboarded, sub: `${pct(u.onboarded, u.players_total)}% de los jugadores` },
  ] : [];
  const comms: Tile[] = stats && c ? [
    { l: 'Comunidades', v: c.total, sub: `+${fmtInt(c.new_7d)} esta semana · +${fmtInt(c.new_30d)} en 30 días` },
    { l: 'Membresías', v: c.memberships, sub: c.total ? `${fmtDec(c.memberships / c.total)} por comunidad` : undefined },
    { l: 'Mensajes', v: stats.messages, sub: 'en los chats' },
    { l: 'Encuestas', v: stats.polls },
  ] : [];
  const played: Tile[] = stats && m && e ? [
    { l: 'Partidos jugados', v: m.played, sub: `${fmtInt(m.cancelled)} cancelados` },
    { l: 'Por jugarse', v: m.open, sub: `+${fmtInt(m.new_7d)} creados esta semana` },
    { l: 'Goles', v: e.goals, sub: m.played ? `${fmtDec(e.goals / m.played)} por partido` : undefined },
    { l: 'Asistencias', v: e.assists },
    { l: 'Amarillas', v: e.yellow, mark: 'y' },
    { l: 'Rojas', v: e.red, mark: 'r' },
    { l: 'Votos de nivel', v: stats.stat_votes },
    { l: 'Votos de figura', v: stats.mvp_votes },
  ] : [];

  return (
    <div class="wrap sa-page">
      <header class="sa-head">
        <a class="muted sa-back" href="#/">← Inicio</a>
        <div class="sa-title">
          <h2>Panel de la app</h2>
          <span class="muted sa-sub" role="status">{at ? `Actualizado ${timeAgo(at, now)}` : 'Cargando…'}</span>
        </div>
        <button class="btn sm sa-refresh" onClick={load} disabled={busy} aria-label="Actualizar">
          <svg class={busy ? 'sa-spin' : ''} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
          </svg>
          {busy ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {!stats && fail === 'error' && (
        <div class="card empty">
          <b>No pudimos traer las métricas</b>
          <p>Revisá la conexión o que la migración del panel esté aplicada. Probá de nuevo en un rato.</p>
          <button class="btn sm" onClick={load}>Reintentar</button>
        </div>
      )}
      {!stats && !fail && <Skeleton />}

      {stats && (
        <>
          {fail === 'error' && <p class="note-inline" role="status">No pudimos actualizar ahora: mostramos lo último que trajimos.</p>}
          <GroupNav />
          <section class="sa-group" id="sa-vivo"><Live s={stats} /></section>
          <Group id="personas" icon="👥" title="Personas" desc="Cuentas, actividad y últimos registros">
            <div class="sa-tiles">{people.map(t => <TileView t={t} />)}</div>
            <Recents s={stats} now={now} />
          </Group>
          <Group id="comunidades" icon="🏟️" title="Comunidades" desc="Grupos, miembros y charla">
            <div class="sa-tiles">{comms.map(t => <TileView t={t} />)}</div>
            <Communities s={stats} now={now} />
          </Group>
          <Group id="partidos" icon="⚽" title="Partidos" desc="Lo que se juega y se vota">
            <div class="sa-tiles">{played.map(t => <TileView t={t} />)}</div>
          </Group>
          <Group id="uso" icon="📱" title="Uso de la app" desc="Visitas, instalaciones, avisos y tendencia">
            <div class="sa-cols">
              <Visits s={stats} />
              <Trend series={stats.series} />
            </div>
          </Group>
          <Group id="juegos" icon="🎮" title="Juegos">
            <Games s={stats} />
          </Group>
        </>
      )}
    </div>
  );
}
