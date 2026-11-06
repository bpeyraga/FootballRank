import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { sb } from '../../shared/supabase';
import {
  dayLong, fmtInt, niceMax, normalizeStats, pct, platformLabel, plural, sectionLabel, seriesTotal, shortDate, timeAgo,
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
];

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
    <Section title="Comunidades" meta={list.length ? `las ${list.length} más activas de ${fmtInt(s.communities.total)}` : ''}>
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
      const { data, error } = await sb.rpc('admin_stats');
      if (id !== seq.current) return; // llegó una respuesta más nueva
      if (error) {
        if (error.code === '42501' || /forbidden/i.test(error.message)) { blocked.current = true; setStats(null); setFail('forbidden'); }
        else setFail('error');
      } else {
        lastOk.current = Date.now();
        setStats(normalizeStats(data)); setAt(lastOk.current); setFail('');
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
        <b>Esta sección es solo para el equipo de Fútbol Rank.</b>
        <a class="btn" href="#/">Volver al inicio</a>
      </div>
    </div>
  );

  const m = stats?.matches, u = stats?.users, c = stats?.communities, e = stats?.events;
  const tiles: Tile[] = stats && m && u && c && e ? [
    { l: 'Cuentas', v: u.total, sub: `+${fmtInt(u.new_7d)} esta semana` },
    { l: 'Activos hoy', v: u.active_24h, sub: 'últimas 24 horas' },
    { l: 'Activos 7 días', v: u.active_7d, sub: `${pct(u.active_7d, u.total)}% de las cuentas` },
    { l: 'Activos 30 días', v: u.active_30d, sub: `${pct(u.active_30d, u.total)}% de las cuentas` },
    { l: 'Comunidades', v: c.total, sub: `+${fmtInt(c.new_7d)} esta semana` },
    { l: 'Jugadores', v: u.players_total, sub: `${fmtInt(u.players_no_account)} sin cuenta` },
    { l: 'Partidos jugados', v: m.played, sub: `${fmtInt(m.cancelled)} cancelados` },
    { l: 'Partidos por jugarse', v: m.open, sub: `+${fmtInt(m.new_7d)} creados esta semana` },
    { l: 'Goles', v: e.goals },
    { l: 'Asistencias', v: e.assists },
    { l: 'Amarillas', v: e.yellow, mark: 'y' },
    { l: 'Rojas', v: e.red, mark: 'r' },
    { l: 'Mensajes', v: stats.messages },
    { l: 'Votos', v: stats.stat_votes + stats.mvp_votes, sub: `${fmtInt(stats.stat_votes)} de nivel · ${fmtInt(stats.mvp_votes)} MVP` },
    { l: 'Encuestas', v: stats.polls },
    { l: 'Dispositivos con avisos', v: stats.push_devices },
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
          <Live s={stats} />
          <div class="sa-tiles">{tiles.map(t => <TileView t={t} />)}</div>
          <div class="sa-cols">
            <Visits s={stats} />
            <Trend series={stats.series} />
          </div>
          <div class="sa-cols wide">
            <Communities s={stats} now={now} />
            <Recents s={stats} now={now} />
          </div>
        </>
      )}
    </div>
  );
}
