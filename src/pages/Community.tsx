import { useEffect, useState } from 'preact/hooks';
import { displayName, infoLine, sb, teamTally, type Profile } from '../lib/supabase';
import { go, inviteUrl } from '../lib/router';
import { loadRanking, type Ranked } from '../lib/ranking';
import { Avatar } from '../lib/Avatar';
import { Crest } from '../lib/Crest';
import { Ranking } from './Ranking';
import { Vote } from './Vote';
import { Player } from './Player';
import { Matches } from './Matches';
import { Match } from './Match';
import { Chat } from './Chat';

interface Community { id: string; name: string; slug: string; invite_code: string; owner_id: string }
const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };
const ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/** sub: [] (partidos) | ['m', id] | ['chat'] | ['ranking'] | ['votar', pid?] | ['miembros'] | ['p', pid] */
export function Community({ slug, sub, me }: { slug: string; sub: string[]; me: Profile }) {
  const [c, setC] = useState<Community | null | undefined>(undefined);
  const [rows, setRows] = useState<Ranked[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');        // no se pudo cargar la comunidad (pantalla completa)
  const [actErr, setActErr] = useState('');  // falló una acción (se muestra en línea)

  const loadRows = async (id: string) => {
    try { setRows(await loadRanking(id, me.id)); } catch (e: any) { setActErr(e.message); }
  };
  const load = async () => {
    const r = await sb.from('communities').select('*').eq('slug', slug).maybeSingle();
    if (r.error) return setErr(r.error.message);
    if (r.data) {
      try { setRows(await loadRanking(r.data.id, me.id)); } catch (e: any) { return setErr(e.message); }
    }
    setC(r.data);
  };
  useEffect(() => { setC(undefined); setActErr(''); load(); }, [slug]);
  // En pantallas angostas, que la pestaña activa quede a la vista
  useEffect(() => {
    document.querySelector('.tabs a.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sub[0], c]);

  if (err) return <div class="wrap"><p class="err">{err}</p><a href="#/">Volver</a></div>;
  if (c === undefined) return <div class="center"><p class="muted">Cargando…</p></div>;
  if (c === null) return <div class="center"><p>No encontramos esa comunidad o no sos miembro.</p><a href="#/">Volver</a></div>;

  const myRole = rows.find(m => m.profile.id === me.id)?.role;
  const isOwner = myRole === 'owner', isAdmin = isOwner || myRole === 'admin';
  const link = inviteUrl(c.invite_code);
  const tab = sub[0] ?? 'partidos';

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setMsg('Link copiado'); } catch { setMsg(link); }
  };
  const share = () => {
    const text = `Sumate a "${c.name}" en Ranking Fútbol: ${link}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
  const regen = async () => {
    const { error } = await sb.rpc('regenerate_invite', { p_community: c.id });
    if (error) setActErr(error.message); else { setMsg('Link nuevo generado; el anterior ya no sirve'); load(); }
  };
  const setRole = async (pid: string, role: string) => {
    const { error } = await sb.rpc('set_role', { p_community: c.id, p_profile: pid, p_role: role });
    if (error) setActErr(error.message); else { setActErr(''); loadRows(c.id); }
  };
  const kick = async (pid: string, name: string) => {
    if (!confirm(`¿Sacar a ${name} de la comunidad? Se libera su lugar en los partidos abiertos. Si no querés que vuelva a entrar, después regenerá el link de invitación.`)) return;
    const { error } = await sb.from('memberships').delete().eq('community_id', c.id).eq('profile_id', pid);
    if (error) setActErr(error.message); else { setActErr(''); loadRows(c.id); }
  };

  const leave = async () => {
    if (!confirm(`¿Salir de "${c.name}"? Vas a dejar de ver sus partidos y el ranking. Para volver necesitás un link de invitación.`)) return;
    const { error } = await sb.from('memberships').delete().eq('community_id', c.id).eq('profile_id', me.id);
    if (error) setActErr(error.message); else go('');
  };

  const remove = async () => {
    const typed = prompt(`Esto borra "${c.name}" para todos: partidos, resultados, votos y miembros. No se puede deshacer.\n\nEscribí el nombre de la comunidad para confirmar:`);
    if (typed === null) return;
    if (typed.trim() !== c.name.trim()) return setActErr('El nombre no coincide; no se borró nada.');
    const { error } = await sb.from('communities').delete().eq('id', c.id);
    if (error) setActErr(error.message); else go('');
  };

  const Tab = ({ id, label }: { id: string; label: string }) =>
    <a href={`#/c/${slug}${id === 'partidos' ? '' : '/' + id}`} class={tab === id || (id === 'partidos' && tab === 'm') ? 'on' : ''}>{label}</a>;

  let body;
  if (tab === 'm' && sub[1]) {
    body = <Match key={sub[1]} id={sub[1]} rows={rows} meId={me.id} isAdmin={isAdmin} />;
  } else if (tab === 'chat') {
    body = <Chat key={c.id} communityId={c.id} rows={rows} meId={me.id} isAdmin={isAdmin} onUnknown={() => loadRows(c.id)} />;
  } else if (tab === 'ranking') {
    body = <Ranking rows={rows} slug={slug} meId={me.id} communityId={c.id} />;
  } else if (tab === 'p') {
    const r = rows.find(x => x.profile.id === sub[1]);
    body = r ? <Player r={r} slug={slug} meId={me.id} communityId={c.id} /> : <p class="muted">Jugador no encontrado.</p>;
  } else if (tab === 'votar') {
    body = <Vote key={sub[1] ?? ''} rows={rows} communityId={c.id} slug={slug} meId={me.id}
      startId={sub[1]} saved={() => loadRows(c.id)} />;
  } else if (tab === 'miembros') {
    const members = [...rows].sort((a, b) => ORDER[a.role] - ORDER[b.role] || displayName(a.profile).localeCompare(displayName(b.profile)));
    const fans = teamTally(rows.map(r => r.profile));
    const top = fans.teams[0]?.n ?? 1;
    body = <>
      <div class="card">
        <h3 style="margin-bottom:8px">Invitar</h3>
        <p class="muted" style="margin-bottom:12px;word-break:break-all">{link}</p>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn primary" onClick={share}>Compartir</button>
          <button class="btn" onClick={copy}>Copiar link</button>
          {isAdmin && <button class="btn" onClick={regen}>Regenerar</button>}
        </div>
        {msg && <p class="muted" style="margin-top:8px">{msg}</p>}
      </div>
      <div class="card" style="padding:4px 12px">
        {members.map(m => (
          <div class="row rank-row">
            <Avatar p={m.profile} />
            <a href={`#/c/${slug}/p/${m.profile.id}`} style="flex:1;min-width:0;color:inherit;text-decoration:none">
              <div class="row" style="gap:6px"><span class="ellipsis">{displayName(m.profile)}</span><Crest team={m.profile.fav_team} size={14} /></div>
              <div class="muted ellipsis" style="font-size:.85rem">{infoLine(m.profile)} · {ROLE[m.role]}</div>
            </a>
            {isOwner && m.role === 'member' && <button class="btn sm" onClick={() => setRole(m.profile.id, 'admin')}>Hacer admin</button>}
            {isAdmin && m.role === 'member' && m.profile.id !== me.id && <button class="btn sm danger" onClick={() => kick(m.profile.id, displayName(m.profile))}>Sacar</button>}
            {isOwner && m.role === 'admin' && <button class="btn sm" onClick={() => setRole(m.profile.id, 'member')}>Quitar admin</button>}
          </div>
        ))}
      </div>
      <div class="card">
        <h3 style="margin-bottom:10px">Hinchadas</h3>
        {fans.teams.length === 0
          ? <p class="muted">Nadie eligió equipo todavía. Se elige en "Editar perfil".</p>
          : fans.teams.map(t => (
            <div class="fan-row">
              <span class="row ellipsis" style="gap:6px"><Crest team={t.team} size={16} /><span class="ellipsis">{t.team}</span></span>
              <span class="fan-bar"><i style={`width:${(t.n / top) * 100}%`} /></span>
              <b>{t.n}</b>
            </div>
          ))}
        {fans.teams.length > 0 && fans.none > 0 && <p class="muted st-note">{fans.none} sin equipo elegido</p>}
      </div>
      {isOwner
        ? <button class="btn block danger" onClick={remove}>Eliminar comunidad</button>
        : <button class="btn block danger" onClick={leave}>Salir de la comunidad</button>}
      {actErr && <p class="err">{actErr}</p>}
    </>;
  } else {
    body = <Matches communityId={c.id} slug={slug} meId={me.id} isAdmin={isAdmin} />;
  }

  return (
    <div class="wrap">
      <a href="#/" class="muted">← Comunidades</a>
      <h2 style="margin:8px 0 12px">{c.name}</h2>
      <nav class="tabs">
        <Tab id="partidos" label="Partidos" />
        <Tab id="chat" label="Chat" />
        <Tab id="ranking" label="Ranking" />
        <Tab id="votar" label="Votar" />
        <Tab id="miembros" label="Miembros" />
      </nav>
      {body}
    </div>
  );
}
