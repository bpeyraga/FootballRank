import { useEffect, useState } from 'preact/hooks';
import { displayName, infoLine, sb, teamTally, type Profile } from '../lib/supabase';
import { go, inviteUrl } from '../lib/router';
import { loadRanking, type Ranked } from '../lib/ranking';
import { Avatar } from '../lib/Avatar';
import { Crest } from '../lib/Crest';
import { CommunityPhoto } from '../lib/CommunityPhoto';
import { Ranking } from './Ranking';
import { Vote } from './Vote';
import { Player } from './Player';
import { Matches } from './Matches';
import { Match } from './Match';
import { Chat, seenKey } from './Chat';

import '../admin.css';

interface Community { id: string; name: string; slug: string; invite_code: string; owner_id: string; invite_expires_at?: string | null; photo_url?: string | null }
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
  // Mensajes nuevos de otros desde la última vez que abriste el chat (badge en la pestaña)
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!c) return;
    if (sub[0] === 'chat') return setUnread(0);
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(seenKey(c.id));
      // Sin marca (otro dispositivo, recién llegado): arranca desde ahora en vez de contar todo el historial
      if (!seen) localStorage.setItem(seenKey(c.id), new Date().toISOString());
    } catch { /* sin storage */ }
    if (!seen) return setUnread(0);
    sb.from('messages').select('id', { count: 'exact', head: true }).eq('community_id', c.id).neq('author_id', me.id)
      .gt('created_at', seen)
      .then(({ count }) => setUnread(count ?? 0));
  }, [c?.id, sub[0]]);
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
  const regen = async (hours: number | null) => {
    // Sin vencimiento se manda solo p_community (igual que antes de existir p_hours)
    const { error } = await sb.rpc('regenerate_invite', hours ? { p_community: c.id, p_hours: hours } : { p_community: c.id });
    if (error) setActErr(adminError(error.message));
    else {
      setActErr('');
      setMsg(`Link nuevo generado${hours ? ` (vence en ${hours === 24 ? '24 horas' : `${hours / 24} días`})` : ''}; el anterior ya no sirve`);
      load();
    }
  };
  const setRole = async (pid: string, role: string) => {
    const { error } = await sb.rpc('set_role', { p_community: c.id, p_profile: pid, p_role: role });
    if (error) setActErr(error.message); else { setActErr(''); loadRows(c.id); }
  };
  const transfer = async (pid: string, name: string) => {
    if (!confirm(`¿Pasarle la comunidad "${c.name}" a ${name}? Va a ser el nuevo owner y vos quedás como admin. Solo ${name} podría devolvértela.`)) return false;
    const { error } = await sb.rpc('transfer_ownership', { p_community: c.id, p_profile: pid });
    if (error) { setActErr(adminError(error.message)); return false; }
    setActErr(''); setMsg(`Ahora ${name} es el owner. Vos quedaste como admin.`);
    await load();
    scrollTo({ top: 0, behavior: 'smooth' });
    return true;
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

  const Tab = ({ id, label, badge }: { id: string; label: string; badge?: number }) =>
    <a href={`#/c/${slug}${id === 'partidos' ? '' : '/' + id}`} class={tab === id || (id === 'partidos' && tab === 'm') ? 'on' : ''}>
      {label}{!!badge && tab !== id && <span class="tab-badge" aria-label={`${badge} sin leer`}>{badge > 99 ? '99+' : badge}</span>}
    </a>;

  let body;
  if (tab === 'm' && sub[1]) {
    body = <Match key={sub[1]} id={sub[1]} slug={slug} rows={rows} meId={me.id} isAdmin={isAdmin} />;
  } else if (tab === 'chat') {
    body = <Chat key={c.id} communityId={c.id} rows={rows} meId={me.id} isAdmin={isAdmin} onUnknown={() => loadRows(c.id)} />;
  } else if (tab === 'ranking') {
    body = <Ranking rows={rows} slug={slug} meId={me.id} communityId={c.id} />;
  } else if (tab === 'p') {
    const r = rows.find(x => x.profile.id === sub[1]);
    body = r ? <Player r={r} rows={rows} slug={slug} meId={me.id} communityId={c.id} isAdmin={isAdmin} /> : <p class="muted">Jugador no encontrado.</p>;
  } else if (tab === 'votar') {
    body = <Vote key={sub[1] ?? ''} rows={rows} communityId={c.id} slug={slug} meId={me.id}
      startId={sub[1]} saved={() => loadRows(c.id)} />;
  } else if (tab === 'miembros') {
    const members = [...rows].sort((a, b) => ORDER[a.role] - ORDER[b.role] || displayName(a.profile).localeCompare(displayName(b.profile)));
    const fans = teamTally(rows.map(r => r.profile));
    const top = fans.teams[0]?.n ?? 1;
    body = <>
      <InviteCard link={link} expiresAt={c.invite_expires_at ?? null} isAdmin={isAdmin} msg={msg}
        onShare={share} onCopy={copy} onRegen={regen} />
      <div class="card" style="padding:4px 12px">
        {members.map(m => (
          <div class="row rank-row">
            <Avatar p={m.profile} />
            <a href={`#/c/${slug}/p/${m.profile.id}`} style="flex:1;min-width:0;color:inherit;text-decoration:none">
              <div class="row" style="gap:6px"><span class="ellipsis">{displayName(m.profile)}</span><Crest team={m.profile.fav_team} size={11} /></div>
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
              <span class="row ellipsis" style="gap:6px"><Crest team={t.team} size={12} /><span class="ellipsis">{t.team}</span></span>
              <span class="fan-bar"><i style={`width:${(t.n / top) * 100}%`} /></span>
              <b>{t.n}</b>
            </div>
          ))}
        {fans.teams.length > 0 && fans.none > 0 && <p class="muted st-note">{fans.none} sin equipo elegido</p>}
      </div>
      {isOwner && <TransferOwner
        candidates={members.filter(m => m.profile.id !== me.id && m.profile.user_id)
          .map(m => ({ id: m.profile.id, name: displayName(m.profile), role: m.role }))}
        onTransfer={transfer} />}
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
      {(tab === 'partidos' || tab === 'miembros') &&
        <CommunityPhoto id={c.id} name={c.name} url={c.photo_url ?? null} isAdmin={isAdmin} changed={load} />}
      <nav class="tabs">
        <Tab id="partidos" label="Partidos" />
        <Tab id="chat" label="Chat" badge={unread} />
        <Tab id="ranking" label="Ranking" />
        <Tab id="votar" label="Votar" />
        <Tab id="miembros" label="Miembros" />
      </nav>
      {body}
    </div>
  );
}

const EXPIRY: { label: string; hours: number | null }[] = [
  { label: 'Nunca', hours: null }, { label: '24 horas', hours: 24 }, { label: '7 días', hours: 168 },
];
const fmtExpiry = (iso: string) => new Date(iso).toLocaleString('es-AR',
  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Link de invitación: compartir/copiar, cuándo vence y (admins) regenerarlo eligiendo el vencimiento. */
function InviteCard({ link, expiresAt, isAdmin, msg, onShare, onCopy, onRegen }: {
  link: string; expiresAt: string | null; isAdmin: boolean; msg: string;
  onShare: () => void; onCopy: () => void; onRegen: (hours: number | null) => Promise<void>;
}) {
  const [hours, setHours] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const expired = !!expiresAt && new Date(expiresAt) <= new Date();
  const regen = async () => { setBusy(true); try { await onRegen(hours); } finally { setBusy(false); } };
  return (
    <div class="card">
      <h3 style="margin-bottom:8px">Invitar</h3>
      <p class="muted" style="margin-bottom:8px;word-break:break-all">{link}</p>
      <p class={`muted invite-exp ${expired ? 'off' : ''}`}>
        {!expiresAt ? 'No vence' : expired ? `Venció el ${fmtExpiry(expiresAt)}. Regenerá el link para invitar.` : `Vence el ${fmtExpiry(expiresAt)}`}
      </p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn primary" disabled={expired} onClick={onShare}>Compartir</button>
        <button class="btn" disabled={expired} onClick={onCopy}>Copiar link</button>
      </div>
      {isAdmin && <>
        <span class="adm-label" style="margin-top:16px" id="exp-label">Link nuevo: ¿cuándo vence?</span>
        <div class="adm-seg" role="group" aria-labelledby="exp-label">
          {EXPIRY.map(o => (
            <button type="button" class={hours === o.hours ? 'on' : ''} aria-pressed={hours === o.hours} onClick={() => setHours(o.hours)}>{o.label}</button>
          ))}
        </div>
        <button class="btn block" disabled={busy} onClick={regen}>{busy ? 'Generando…' : 'Regenerar link'}</button>
      </>}
      {msg && <p class="muted" style="margin-top:8px">{msg}</p>}
    </div>
  );
}

/** Solo el owner: elige a otro miembro (con cuenta) y le pasa la comunidad; él queda como admin. */
function TransferOwner({ candidates, onTransfer }: {
  candidates: { id: string; name: string; role: string }[];
  onTransfer: (pid: string, name: string) => Promise<boolean>;
}) {
  const [pid, setPid] = useState('');
  const [busy, setBusy] = useState(false);
  if (!candidates.length) return null;
  const submit = async () => {
    const p = candidates.find(x => x.id === pid);
    if (!p) return;
    setBusy(true);
    try { await onTransfer(p.id, p.name); } finally { setBusy(false); }
  };
  return (
    <div class="card adm-card">
      <h3 style="margin-bottom:4px">Transferir la comunidad</h3>
      <p class="muted adm-note">Elegí a quién le pasás el rol de owner. Vos quedás como admin.</p>
      <select class="adm-select" aria-label="Nuevo owner" value={pid} onChange={e => setPid((e.target as HTMLSelectElement).value)}>
        <option value="">Elegí un miembro…</option>
        {candidates.map(p => <option value={p.id}>{p.name} · {ROLE[p.role]}</option>)}
      </select>
      <button class="btn block" disabled={!pid || busy} onClick={submit}>{busy ? 'Transfiriendo…' : 'Transferir ownership'}</button>
    </div>
  );
}

function adminError(m: string) {
  if (m.includes('forbidden')) return 'No tenés permiso para hacer eso.';
  if (m.includes('not_member')) return 'Esa persona ya no es miembro de la comunidad.';
  if (m.includes('bad_target')) return 'No se le puede transferir a esa persona: tiene que ser otro miembro con cuenta.';
  if (m.includes('bad_hours')) return 'El vencimiento elegido no es válido.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}
