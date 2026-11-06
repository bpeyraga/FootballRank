import { useEffect, useRef, useState } from 'preact/hooks';
import { Tip } from '../lib/Tip';
import { displayName, hue, ovr, posLine, sb, type Profile, type Stats } from '../lib/supabase';
import { go, slugify } from '../lib/router';
import { Avatar } from '../lib/Avatar';
import { FutCard } from '../lib/FutCard';
import { useInstall } from '../lib/install';
import { pushOff } from '../lib/push';
import { PushPanel } from '../lib/PushPanel';
import { Crest } from '../lib/Crest';
import { countdown, slotsLine } from '../lib/nextMatch';

interface Comm { id: string; name: string; slug: string; photo_url?: string | null }
interface Row { role: string; community: Comm }
interface Next { id: string; community_id: string; title: string; starts_at: string; location: string | null; slots: number; status: string }
/** Anotados del próximo partido y si estoy adentro. */
interface Su { taken: number; waiting: number; mine: 'in' | 'waitlist' | null }

/** ¿Es del equipo de la app? Se pregunta una sola vez por sesión (por usuario); ante cualquier error, no (el link queda oculto). */
let appAdmin: { uid: string; ok: Promise<boolean> } | null = null;
const isAppAdmin = (uid: string) => {
  if (appAdmin?.uid !== uid) {
    const entry: { uid: string; ok: Promise<boolean> } = { uid, ok: Promise.resolve(sb.rpc('is_app_admin')).then(({ data, error }) => {
      if (error) throw error;
      return data === true;
    }).catch(() => {
      // un error pasajero no se cachea: la próxima vez se vuelve a preguntar
      if (appAdmin === entry) appAdmin = null;
      return false;
    }) };
    appAdmin = entry;
  }
  return appAdmin.ok;
};

const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };
const tierOf = (o: number | null) => o == null ? 'none' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';
const initials = (s: string) => s.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const when = (iso: string) => new Date(iso).toLocaleString('es-AR',
  { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** Acepta el link completo (…/#/join/abc123) o solo el código. */
const inviteCode = (s: string) => s.trim().match(/join\/([a-z0-9]+)/i)?.[1] ?? (/^[a-z0-9]{6,}$/i.test(s.trim()) ? s.trim() : null);

const Chev = () => <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
const QIco = ({ d }: { d: string }) => (
  <span class="qa-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d={d} /></svg></span>
);

export function Home({ me }: { me: Profile }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [next, setNext] = useState<Record<string, Next>>({});
  const [hero, setHero] = useState<Next | null>(null); // el partido más cercano de todas mis comunidades
  const [su, setSu] = useState<Su | null>(null);
  const [nxLoaded, setNxLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [stats, setStats] = useState<Stats | null>(null);
  const [mode, setMode] = useState<'' | 'create' | 'join'>('');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  const install = useInstall();
  const [tip, setTip] = useState('');
  const [alerts, setAlerts] = useState(false);
  const [staff, setStaff] = useState(false);

  useEffect(() => {
    sb.from('base_stats').select('rit,tir,pas,reg,def,fis').eq('profile_id', me.id).maybeSingle()
      .then(({ data }) => setStats((data as Stats) ?? null));

    sb.from('memberships').select('role, community:communities(id,name,slug,photo_url)').eq('profile_id', me.id)
      .then(async ({ data, error }) => {
        if (error) return setErr(error.message);
        const list = ((data ?? []) as any[]).filter(r => r.community) as Row[];
        list.sort((a, b) => a.community.name.localeCompare(b.community.name));
        setRows(list);
        const ids = list.map(r => r.community.id);
        if (!ids.length) return;
        const [m, x] = await Promise.all([
          sb.from('memberships').select('community_id').in('community_id', ids),
          sb.from('matches').select('id,community_id,title,starts_at,location,slots,status').in('community_id', ids)
            .in('status', ['open', 'closed']).gte('starts_at', new Date().toISOString()).order('starts_at'),
        ]);
        const c: Record<string, number> = {};
        for (const r of m.data ?? []) c[r.community_id] = (c[r.community_id] ?? 0) + 1;
        setCounts(c);
        const upcoming = (x.data ?? []) as Next[];
        const n: Record<string, Next> = {};
        for (const r of upcoming) n[r.community_id] ??= r;
        setNext(n);
        const first = upcoming[0] ?? null; // viene ordenado: el más próximo de todas las comunidades
        setHero(first);
        setNxLoaded(true);
        if (first) {
          // Una sola consulta más, solo del partido destacado (sin N+1).
          const s = await sb.from('match_signups').select('profile_id,status').eq('match_id', first.id);
          const l = (s.data ?? []) as { profile_id: string; status: string }[];
          const mine = l.find(r => r.profile_id === me.id)?.status;
          setSu({
            taken: l.filter(r => r.status === 'in').length,
            waiting: l.filter(r => r.status === 'waitlist').length,
            mine: mine === 'in' || mine === 'waitlist' ? mine : null,
          });
        }
      });
  }, [me.id]);

  useEffect(() => {
    let live = true;
    if (me.user_id) isAppAdmin(me.user_id).then(ok => { if (live) setStaff(ok); });
    return () => { live = false; };
  }, [me.user_id]);

  // La cuenta regresiva se actualiza sola
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Cerrar el menú al tocar afuera
  useEffect(() => {
    const on = (e: Event) => { const d = menu.current; if (d?.open && !d.contains(e.target as Node)) d.open = false; };
    addEventListener('pointerdown', on);
    return () => removeEventListener('pointerdown', on);
  }, []);

  const create = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    const base = slugify(name) || 'comunidad';
    let slug = base.length >= 3 ? base : base + '-fc';
    let res = await sb.rpc('create_community', { p_name: name.trim(), p_slug: slug });
    if (res.error?.code === '23505') { // slug ocupado
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      res = await sb.rpc('create_community', { p_name: name.trim(), p_slug: slug });
    }
    setBusy(false);
    if (res.error) setErr(res.error.message); else go(`c/${slug}/setup`);
  };

  const join = (e: Event) => {
    e.preventDefault();
    const code = inviteCode(link);
    if (code) go(`join/${code}`); else setErr('Ese link no parece una invitación. Pedile al admin que te lo reenvíe.');
  };

  const pick = (m: typeof mode) => { setErr(''); setMode(mode === m ? '' : m); };

  const o = stats ? ovr(stats) : null;
  const heroComm = hero ? rows?.find(r => r.community.id === hero.community_id) : undefined;
  const cd = hero ? countdown(hero.starts_at, now) : null;
  // Accesos rápidos: apuntan a la comunidad del próximo partido (o a la primera) y solo a pantallas que existen.
  const target = heroComm ?? rows?.[0];
  const adminOf = heroComm && heroComm.role !== 'member' ? heroComm : rows?.find(r => r.role !== 'member');
  const heroHref = hero && heroComm ? `#/c/${heroComm.community.slug}/m/${hero.id}` : '';
  const quick: { href: string; label: string; sub: string; d: string; main?: boolean }[] = [];
  if (hero && heroComm) quick.push({
    href: heroHref, label: su?.mine ? 'Ver lista' : 'Anotarme', sub: heroComm.community.name, main: !su?.mine,
    d: 'M5 12.5l4.5 4.5L19 7.5',
  });
  if (adminOf) quick.push({ href: `#/c/${adminOf.community.slug}`, label: 'Crear partido', sub: adminOf.community.name, d: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 13v5M9.5 15.5h5' });
  if (target) quick.push({ href: `#/c/${target.community.slug}/ranking`, label: 'Ranking', sub: target.community.name, d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3' });

  return (
    <div class="wrap home">
      <header class="home-top">
        <div class="brand"><img src="/icon.png" width={28} height={28} alt="" /><b>Ranking Fútbol</b></div>
        <details class="menu" ref={menu}>
          <summary aria-label="Menú de la cuenta"><Avatar p={me} size={36} /></summary>
          <div class="menu-pop">
            <div class="menu-who"><b class="ellipsis">{displayName(me)}</b><span class="muted">{posLine(me)}</span></div>
            <a href="#/perfil">Editar perfil</a>
            <a href="#/tema">🎨 Tema y colores</a>
            {install.kind !== 'installed' && (
              <a href="#" onClick={e => {
                e.preventDefault();
                if (install.kind === 'prompt') install.run(); else setTip(install.text);
                menu.current && (menu.current.open = false);
              }}>📲 Instalar app</a>
            )}
            <a href="#" onClick={e => { e.preventDefault(); setAlerts(a => !a); menu.current && (menu.current.open = false); }}>🔔 Avisos</a>
            {staff && <a href="#/admin">📊 Panel de la app</a>}
            <a href="/terminos.html">Términos</a>
            <a href="/privacidad.html">Privacidad</a>
            <button onClick={async () => { await pushOff().catch(() => {}); sb.auth.signOut(); }}>Cerrar sesión</button>
          </div>
        </details>
      </header>
      {tip && (
        <div class="card note install-tip" role="status">
          <span>📲 {tip}</span>
          <button class="btn sm" onClick={() => setTip('')} aria-label="Cerrar">✕</button>
        </div>
      )}
      {alerts && <PushPanel onClose={() => setAlerts(false)} onInstall={() => {
        setAlerts(false);
        if (install.kind === 'prompt') install.run(); else if (install.kind === 'help') setTip(install.text);
      }} />}

      {/* Tu próximo partido: el más cercano de todas tus comunidades */}
      {hero && heroComm && cd && (
        <a class={`nx${cd.soon ? ' soon' : ''}`} href={heroHref}>
          <span class="nx-grass" aria-hidden="true" />
          <svg class="nx-pitch" viewBox="0 0 200 200" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="3"><circle cx="100" cy="100" r="62" /><circle cx="100" cy="100" r="5" fill="currentColor" /><path d="M-10 100h220" /></g>
          </svg>
          <div class="nx-top">
            <span class="nx-kicker">Tu próximo partido</span>
            {cd.soon && <span class="nx-live"><i />Ya casi</span>}
          </div>
          <div class="nx-when">
            <b>{cd.big}</b>
            <span>{cd.date} · {cd.time} hs</span>
          </div>
          <b class="nx-title ellipsis">{hero.title}</b>
          <div class="nx-meta">
            <span class="nx-comm">
              <span class={`comm-crest${heroComm.community.photo_url ? ' photo' : ''}`} style={`--h:${hue(heroComm.community.id)}${heroComm.community.photo_url ? `;background-image:url("${heroComm.community.photo_url}")` : ''}`}>{initials(heroComm.community.name)}</span>
              <span class="ellipsis">{heroComm.community.name}</span>
            </span>
            {hero.location && <span class="nx-place ellipsis">📍 {hero.location}</span>}
          </div>
          <div class="nx-foot">
            <span class="nx-slots">
              <span class="nx-bar"><i style={`width:${su ? Math.min(100, Math.round(su.taken / Math.max(1, hero.slots) * 100)) : 0}%`} /></span>
              <small>{su ? slotsLine(su.taken, hero.slots, su.waiting) : `${hero.slots} lugares`}{hero.status === 'closed' ? ' · lista cerrada' : ''}</small>
            </span>
            <span class={`nx-state${su?.mine ? ' in' : ''}`}>
              {su?.mine === 'in' ? '✓ Estás anotado' : su?.mine === 'waitlist' ? 'En lista de espera' : hero.status === 'closed' ? 'Ver partido' : 'Anotarme'}
              <Chev />
            </span>
          </div>
        </a>
      )}
      {!hero && (rows === null || (rows.length > 0 && !nxLoaded)) && !err && <div class="nx skeleton" aria-hidden="true" />}
      {!hero && nxLoaded && rows && rows.length > 0 && (
        <div class="nx none">
          <b>Sin partidos a la vista</b>
          <span class="muted">Cuando tu grupo convoque uno, lo ves acá con la cuenta regresiva.</span>
          {adminOf && <a class="btn sm primary" href={`#/c/${adminOf.community.slug}`}>Convocar un partido</a>}
        </div>
      )}

      <div class="home-grid">
      <section class="me-card">
        <FutCard p={me} stats={stats} size="sm" />
        <div class="me-copy">
          <span class="kicker">Tu carta</span>
          <h2 class="ellipsis">Hola, {me.nickname?.trim() || me.name.split(' ')[0]}</h2>
          <div class="me-chips">
            <span class={`ovr ${tierOf(o)}`}>OVR {o ?? '—'}</span>
            <span>{me.pos}</span>
            {me.shirt_number ? <span>#{me.shirt_number}</span> : null}
            {me.fav_team && <span class="me-club"><Crest team={me.fav_team} size={14} /></span>}
          </div>
          <p class="muted">Tu autoevaluación. En cada comunidad el OVR sale de los votos de tus compañeros.</p>
          <a class="btn sm" href="#/perfil">Editar ficha</a>
        </div>
      </section>

      <div class="home-main">
      {quick.length > 0 && (
        <nav class="qa" style={`--n:${quick.length}`} aria-label="Accesos rápidos">
          {quick.map(q => (
            <a href={q.href} class={q.main ? 'main' : ''}>
              <QIco d={q.d} />
              <b>{q.label}</b>
              <small>{q.sub}</small>
            </a>
          ))}
        </nav>
      )}
      <a class="fut-entry" href="#/futbol">
        <span class="fut-entry-ico" aria-hidden="true">⚽</span>
        <span class="fut-entry-copy"><b>Fútbol argentino</b><span class="muted">Tabla, partidos y noticias de la Liga</span></span>
        {me.fav_team && <Crest team={me.fav_team} size={30} />}
        <Chev />
      </a>
      <div class="section-head">
        <h3>Tus comunidades</h3>
        {rows && rows.length > 0 && <span class="muted">{rows.length}</span>}
      </div>

      <div class="comm-grid">
      {rows === null && !err && [0, 1].map(() => <div class="comm skeleton" />)}

      {rows?.length === 0 && (
        <div class="card empty">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3v4.5M15.8 10.3l4.4-1.5M14.3 14.7l2.7 3.8M9.7 14.7L7 18.5M8.2 10.3L3.8 8.8" />
          </svg>
          <b>Todavía no estás en ninguna comunidad</b>
          <p class="muted">Creá la de tu grupo o, si te pasaron un link de invitación, pegalo abajo.</p>
        </div>
      )}

      {rows?.map(r => {
        const c = r.community, n = next[c.id], h = hue(c.id);
        return (
          <a class="comm" href={`#/c/${c.slug}`}>
            <span class={`comm-crest${c.photo_url ? ' photo' : ''}`} style={`--h:${h}${c.photo_url ? `;background-image:url("${c.photo_url}")` : ''}`}>{initials(c.name)}</span>
            <div class="comm-body">
              <b class="ellipsis">{c.name}</b>
              <span class="muted comm-meta">
                {counts[c.id] ? `${counts[c.id]} ${counts[c.id] === 1 ? 'jugador' : 'jugadores'} · ` : ''}{ROLE[r.role] ?? r.role}
              </span>
              {n
                ? <span class="comm-next">⚽ {when(n.starts_at)} · <span class="ellipsis">{n.title}</span></span>
                : <span class="muted comm-meta">Sin partidos programados</span>}
            </div>
            <Chev />
          </a>
        );
      })}
      </div>

      <div class="home-actions">
        <button class={`btn${mode === 'create' ? ' primary' : ''}`} onClick={() => pick('create')}>+ Crear comunidad</button>
        <button class={`btn${mode === 'join' ? ' primary' : ''}`} onClick={() => pick('join')}>Unirme con un link</button>
      </div>

      {mode === 'create' && (
        <form class="card" onSubmit={create}>
          <label class="field"><span>Nombre de la comunidad</span>
            <input value={name} maxLength={60} placeholder="Fútbol de los jueves" autoFocus
              onInput={e => setName((e.target as HTMLInputElement).value)} /></label>
          <button class="btn primary block" disabled={busy || !name.trim()}>{busy ? 'Creando…' : 'Crear'}</button>
        </form>
      )}
      {mode === 'join' && (
        <form class="card" onSubmit={join}>
          <label class="field"><span>Link de invitación</span>
            <input value={link} placeholder="https://futbol-rank.vercel.app/#/join/…" autoFocus inputMode="url"
              onInput={e => setLink((e.target as HTMLInputElement).value)} /></label>
          <button class="btn primary block" disabled={!link.trim()}>Ver invitación</button>
        </form>
      )}
      {err && <p class="err">{err}</p>}
      <Tip />
      </div>
      </div>
    </div>
  );
}
