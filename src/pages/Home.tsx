import { useEffect, useRef, useState } from 'preact/hooks';
import { displayName, hue, posLine, sb, type Profile, type Stats } from '../lib/supabase';
import { go, slugify } from '../lib/router';
import { Avatar } from '../lib/Avatar';
import { FutCard } from '../lib/FutCard';
import { useInstall } from '../lib/install';

interface Comm { id: string; name: string; slug: string }
interface Row { role: string; community: Comm }
interface Next { title: string; starts_at: string }

const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };
const initials = (s: string) => s.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const when = (iso: string) => new Date(iso).toLocaleString('es-AR',
  { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** Acepta el link completo (…/#/join/abc123) o solo el código. */
const inviteCode = (s: string) => s.trim().match(/join\/([a-z0-9]+)/i)?.[1] ?? (/^[a-z0-9]{6,}$/i.test(s.trim()) ? s.trim() : null);

export function Home({ me }: { me: Profile }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [next, setNext] = useState<Record<string, Next>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [mode, setMode] = useState<'' | 'create' | 'join'>('');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  const install = useInstall();
  const [tip, setTip] = useState('');

  useEffect(() => {
    sb.from('base_stats').select('rit,tir,pas,reg,def,fis').eq('profile_id', me.id).maybeSingle()
      .then(({ data }) => setStats((data as Stats) ?? null));

    sb.from('memberships').select('role, community:communities(id,name,slug)').eq('profile_id', me.id)
      .then(async ({ data, error }) => {
        if (error) return setErr(error.message);
        const list = ((data ?? []) as any[]).filter(r => r.community) as Row[];
        list.sort((a, b) => a.community.name.localeCompare(b.community.name));
        setRows(list);
        const ids = list.map(r => r.community.id);
        if (!ids.length) return;
        const [m, x] = await Promise.all([
          sb.from('memberships').select('community_id').in('community_id', ids),
          sb.from('matches').select('community_id,title,starts_at').in('community_id', ids)
            .in('status', ['open', 'closed']).gte('starts_at', new Date().toISOString()).order('starts_at'),
        ]);
        const c: Record<string, number> = {};
        for (const r of m.data ?? []) c[r.community_id] = (c[r.community_id] ?? 0) + 1;
        setCounts(c);
        const n: Record<string, Next> = {};
        for (const r of x.data ?? []) n[r.community_id] ??= r;
        setNext(n);
      });
  }, [me.id]);

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
    if (res.error) setErr(res.error.message); else go(`c/${slug}`);
  };

  const join = (e: Event) => {
    e.preventDefault();
    const code = inviteCode(link);
    if (code) go(`join/${code}`); else setErr('Ese link no parece una invitación. Pedile al admin que te lo reenvíe.');
  };

  const pick = (m: typeof mode) => { setErr(''); setMode(mode === m ? '' : m); };

  return (
    <div class="wrap home">
      <header class="home-top">
        <div class="brand"><img src="/icon.svg" width={28} height={28} alt="" /><b>Ranking Fútbol</b></div>
        <details class="menu" ref={menu}>
          <summary aria-label="Menú de la cuenta"><Avatar p={me} size={36} /></summary>
          <div class="menu-pop">
            <div class="menu-who"><b class="ellipsis">{displayName(me)}</b><span class="muted">{posLine(me)}</span></div>
            <a href="#/perfil">Editar perfil</a>
            {install.kind !== 'installed' && (
              <a href="#" onClick={e => {
                e.preventDefault();
                if (install.kind === 'prompt') install.run(); else setTip(install.text);
                menu.current && (menu.current.open = false);
              }}>📲 Instalar app</a>
            )}
            <a href="/terminos.html">Términos</a>
            <a href="/privacidad.html">Privacidad</a>
            <button onClick={() => sb.auth.signOut()}>Cerrar sesión</button>
          </div>
        </details>
      </header>
      {tip && (
        <div class="card note install-tip" role="status">
          <span>📲 {tip}</span>
          <button class="btn sm" onClick={() => setTip('')} aria-label="Cerrar">✕</button>
        </div>
      )}

      <section class="me-card">
        <FutCard p={me} stats={stats} size="sm" />
        <div class="me-copy">
          <span class="kicker">Tu ficha</span>
          <h2 class="ellipsis">Hola, {me.nickname?.trim() || me.name.split(' ')[0]}</h2>
          <p class="muted">Esta es tu autoevaluación. En cada comunidad tu OVR sale de los votos de tus compañeros.</p>
          <a class="btn sm" href="#/perfil">Editar ficha</a>
        </div>
      </section>

      <div class="section-head">
        <h3>Tus comunidades</h3>
        {rows && rows.length > 0 && <span class="muted">{rows.length}</span>}
      </div>

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
            <span class="comm-crest" style={`--h:${h}`}>{initials(c.name)}</span>
            <div class="comm-body">
              <b class="ellipsis">{c.name}</b>
              <span class="muted comm-meta">
                {counts[c.id] ? `${counts[c.id]} ${counts[c.id] === 1 ? 'jugador' : 'jugadores'} · ` : ''}{ROLE[r.role] ?? r.role}
              </span>
              {n
                ? <span class="comm-next">⚽ {when(n.starts_at)} · <span class="ellipsis">{n.title}</span></span>
                : <span class="muted comm-meta">Sin partidos programados</span>}
            </div>
            <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </a>
        );
      })}

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
    </div>
  );
}
