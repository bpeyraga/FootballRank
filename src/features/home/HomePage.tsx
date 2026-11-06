import { useEffect, useRef, useState } from 'preact/hooks';
import { Tip } from '../../shared/ui/Tip';
import { displayName, hue, ovr, posLine, type Profile } from '../../shared/supabase';
import { go } from '../../app/router';
import { Avatar } from '../../shared/ui/Avatar';
import { FutCard } from '../../shared/ui/FutCard';
import { useInstall } from '../../app/install';
import { PushPanel } from '../push/PushPanel';
import { Crest } from '../../shared/ui/Crest';
import { countdown, slotsLine } from './nextMatch';
import { fmtDate as when, initials } from '../../shared/text';
import { signOut } from '../auth/api';
import { createCommunity } from './api';
import { ROLE, inviteCode, quickActions, tierOf } from './model';
import { useHome } from './useHome';

const Chev = () => <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
const QIco = ({ d }: { d: string }) => (
  <span class="qa-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d={d} /></svg></span>
);

export function Home({ me }: { me: Profile }) {
  const { comms: rows, counts, next, hero, su, nxLoaded, stats, staff, err, setErr } = useHome(me);
  const [now, setNow] = useState(() => new Date());
  const [mode, setMode] = useState<'' | 'create' | 'join'>('');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const install = useInstall();
  const [tip, setTip] = useState('');
  const [alerts, setAlerts] = useState(false);

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
    try { go(`c/${await createCommunity(name)}/setup`); }
    catch (x: any) { setErr(x?.message ?? 'Error de red'); }
    setBusy(false);
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
  const adminOf = heroComm && heroComm.role !== 'member' ? heroComm : rows?.find(r => r.role !== 'member');
  const heroHref = hero && heroComm ? `#/c/${heroComm.community.slug}/m/${hero.id}` : '';
  const quick = quickActions(hero, su, rows);

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
            <button onClick={signOut}>Cerrar sesión</button>
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
