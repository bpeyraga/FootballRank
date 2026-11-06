import { useEffect, useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { displayName, hue, infoLine, sb, teamTally, type Profile } from '../../shared/supabase';
import { go, inviteUrl } from '../../app/router';
import { loadRanking, type Ranked } from '../ranking/ranking';
import { Avatar } from '../../shared/ui/Avatar';
import { Crest } from '../../shared/ui/Crest';
import { CommunityPhoto } from './CommunityPhoto';
import { Matches } from '../matches/MatchesPage';
import { Loading, page } from '../../app/lazy';
import { ClaimsCard } from './ClaimsCard';
import { VenuesCard } from '../venues/VenuesManager';
import { nPlayers, stepFromRoute } from './players';
import './admin.css';
import { initials } from '../../shared/text';

// Clave del "último visto" del chat (misma que usa Chat.tsx), acá para no traer todo el chat al cargar la comunidad.
const seenKey = (communityId: string) => `futrank-seen-${communityId}`;
const Ranking = page(() => import('../ranking/RankingPage'), m => m.Ranking);
const Vote = page(() => import('../ranking/VotePage'), m => m.Vote);
const Player = page(() => import('../player/PlayerPage'), m => m.Player);
const Match = page(() => import('../matches/MatchPage'), m => m.Match);
const Chat = page(() => import('../chat/ChatPage'), m => m.Chat);
// Solo para admins: se bajan cuando se usan
const Setup = page(() => import('./SetupPage'), m => m.Setup);
const AddPlayersSheet = page(() => import('./AddPlayers'), m => m.AddPlayersSheet);
const EditPlayerSheet = page(() => import('./EditPlayerSheet'), m => m.EditPlayerSheet);

interface Community { id: string; name: string; slug: string; invite_code: string; owner_id: string; invite_expires_at?: string | null; photo_url?: string | null }
const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };
const ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };
/** Íconos de las pestañas (barra inferior en el celular, navegación arriba en escritorio). */
const TAB_ICONS: Record<string, any> = {
  partidos: <path d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5zM3 10h18M8 3v4M16 3v4" />,
  chat: <path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5" />,
  ranking: <path d="M4 20h16M6 20v-7h4v7M10 20V5h4v15M14 20v-10h4v10" />,
  votar: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />,
  miembros: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c2.5 0 4.2 1.7 4.2 4" /></>,
};

/** sub: [] (partidos) | ['m', id] | ['chat'] | ['ranking'] | ['votar', pid?] | ['miembros'] | ['p', pid] | ['setup', paso?] (asistente de armado, solo admins) */
export function Community({ slug, sub, me }: { slug: string; sub: string[]; me: Profile }) {
  const [c, setC] = useState<Community | null | undefined>(undefined);
  const [rows, setRows] = useState<Ranked[]>([]);
  const [msg, setMsg] = useState('');
  // Hojas de admin: agregar jugadores / editar uno sin cuenta
  const [sheet, setSheet] = useState<{ k: 'add'; mode: 'uno' | 'varios' } | { k: 'edit'; id: string } | null>(null);
  const [note, setNote] = useState('');
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
  useEffect(() => { setC(undefined); setActErr(''); setSheet(null); setNote(''); load(); }, [slug]);
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
  const kick = async (pid: string, name: string, noAccount = false) => {
    if (!confirm(noAccount
      ? `¿Sacar a ${name} del grupo? Se libera su lugar en los partidos abiertos.`
      : `¿Sacar a ${name} de la comunidad? Se libera su lugar en los partidos abiertos. Si no querés que vuelva a entrar, después regenerá el link de invitación.`)) return;
    // Sin cuenta: se borra también el perfil (si no está en otra comunidad), para no dejarlo huérfano.
    const { error } = noAccount
      ? await sb.rpc('remove_placeholder', { p_community: c.id, p_profile: pid })
      : await sb.from('memberships').delete().eq('community_id', c.id).eq('profile_id', pid);
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

  const inviteCard = (admin: boolean) => (
    <InviteCard link={link} expiresAt={c.invite_expires_at ?? null} isAdmin={admin} msg={msg}
      onShare={share} onCopy={copy} onRegen={regen} />
  );

  // Asistente de armado del grupo: pantalla propia, sin pestañas (Setup manda afuera a quien no es admin)
  if (tab === 'setup') {
    return (
      <div class="wrap comm-page setup-page">
        <Loading>
          <Setup slug={slug} communityId={c.id} communityName={c.name} step={stepFromRoute(sub[1])} rows={rows}
            meId={me.id} isAdmin={isAdmin} reload={() => loadRows(c.id)} invite={inviteCard(false)} />
        </Loading>
      </div>
    );
  }

  const Tab = ({ id, label, badge }: { id: string; label: string; badge?: number }) => {
    const on = tab === id || (id === 'partidos' && tab === 'm');
    return (
      <a href={`#/c/${slug}${id === 'partidos' ? '' : '/' + id}`} class={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
        <span class="tab-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">{TAB_ICONS[id]}</svg>
        </span>
        <span class="tab-label">{label}</span>
        {!!badge && tab !== id && <span class="tab-badge" aria-label={`${badge} sin leer`}>{badge > 99 ? '99+' : badge}</span>}
      </a>
    );
  };

  let body;
  let kind = 'partidos'; // qué pantalla se dibuja: solo sirve de clase (`tab-…`) para los estilos de escritorio
  if (tab === 'm' && sub[1]) {
    kind = 'm';
    body = <Match key={sub[1]} id={sub[1]} slug={slug} rows={rows} meId={me.id} isAdmin={isAdmin} />;
  } else if (tab === 'chat') {
    kind = 'chat';
    body = <Chat key={c.id} communityId={c.id} rows={rows} meId={me.id} isAdmin={isAdmin} onUnknown={() => loadRows(c.id)} />;
  } else if (tab === 'ranking') {
    kind = 'ranking';
    body = <Ranking rows={rows} slug={slug} meId={me.id} communityId={c.id} />;
  } else if (tab === 'p') {
    kind = 'p';
    const r = rows.find(x => x.profile.id === sub[1]);
    body = r ? <Player r={r} rows={rows} slug={slug} meId={me.id} communityId={c.id} communityName={c.name} isAdmin={isAdmin} /> : <p class="muted">Jugador no encontrado.</p>;
  } else if (tab === 'votar') {
    kind = 'votar';
    body = <Vote key={sub[1] ?? ''} rows={rows} communityId={c.id} slug={slug} meId={me.id}
      startId={sub[1]} saved={() => loadRows(c.id)} />;
  } else if (tab === 'miembros') {
    kind = 'miembros';
    const members = [...rows].sort((a, b) => ORDER[a.role] - ORDER[b.role] || displayName(a.profile).localeCompare(displayName(b.profile)));
    const fans = teamTally(rows.map(r => r.profile));
    const top = fans.teams[0]?.n ?? 1;
    const existingNames = rows.flatMap(r => [r.profile.name, r.profile.nickname ?? '']).filter(Boolean);
    const editing = sheet?.k === 'edit' ? rows.find(r => r.profile.id === sheet.id) : undefined;
    const nLoaded = rows.filter(r => !r.profile.user_id).length;
    body = <>
      {isOwner && <ClaimsCard communityId={c.id} onChanged={() => loadRows(c.id)} />}
      {isAdmin && (
        <div class="card pl-add">
          <h3 style="margin-bottom:4px">Jugadores</h3>
          <p class="muted adm-note">
            {rows.length <= 1
              ? 'Tu grupo recién arranca. Cargá a los que juegan con vos: no hace falta que tengan la app.'
              : nLoaded > 0
                ? `Cargaste ${nPlayers(nLoaded)} sin cuenta. Cuando entren con el link, reclaman su ficha.`
                : 'Sumá a los que todavía no tienen la app. Cuando entren con el link, reclaman su ficha.'}
          </p>
          <button class="btn primary block" onClick={() => { setNote(''); setSheet({ k: 'add', mode: 'uno' }); }}>➕ Agregar jugadores</button>
          <a class="pl-wiz" href={`#/c/${slug}/setup`}>Armar el grupo paso a paso</a>
          {note && <p class="pl-ok" role="status">{note}</p>}
        </div>
      )}
      {isAdmin && inviteCard(true)}
      <div class="card mem-list" style="padding:4px 12px">
        {members.map(m => {
          const noAccount = !m.profile.user_id;   // jugador cargado a mano, todavía sin cuenta
          const name = displayName(m.profile);
          const acts = (isOwner && !noAccount && (m.role === 'member' || m.role === 'admin'))
            || (isAdmin && noAccount) || (isAdmin && m.role === 'member' && m.profile.id !== me.id);
          return (
            <div class="row rank-row mem-row">
              <Avatar p={m.profile} />
              <a href={`#/c/${slug}/p/${m.profile.id}`} class="mem-who">
                <div class="row" style="gap:6px">
                  <span class="ellipsis">{name}</span><Crest team={m.profile.fav_team} size={11} />
                  {noAccount && <span class="nacc">sin cuenta</span>}
                </div>
                <div class="muted ellipsis" style="font-size:.85rem">{infoLine(m.profile)} · {ROLE[m.role]}</div>
              </a>
              {acts && (
                <div class="mem-acts">
                  {isOwner && !noAccount && m.role === 'member' && <button class="btn sm" onClick={() => setRole(m.profile.id, 'admin')}>Hacer admin</button>}
                  {isAdmin && noAccount && <button class="btn sm" aria-label={`Editar a ${name}`} onClick={() => setSheet({ k: 'edit', id: m.profile.id })}>Editar</button>}
                  {isAdmin && m.role === 'member' && m.profile.id !== me.id && <button class="btn sm danger" onClick={() => kick(m.profile.id, name, noAccount)}>Sacar</button>}
                  {isOwner && m.role === 'admin' && <button class="btn sm" onClick={() => setRole(m.profile.id, 'member')}>Quitar admin</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isAdmin && <VenuesCard communityId={c.id} meId={me.id} />}
      {sheet?.k === 'add' && (
        <Suspense fallback={null}>
          <AddPlayersSheet communityId={c.id} existing={existingNames} start={sheet.mode} onClose={() => setSheet(null)}
            onAdded={(n: number) => { setNote(n === 1 ? 'Jugador agregado.' : `Sumaste ${nPlayers(n)}.`); loadRows(c.id); }} />
        </Suspense>
      )}
      {editing && (
        <Suspense fallback={null}>
          <EditPlayerSheet key={editing.profile.id} communityId={c.id} profile={editing.profile} base={editing.base}
            onClose={() => setSheet(null)} onSaved={() => loadRows(c.id)} />
        </Suspense>
      )}
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
    body = <Matches communityId={c.id} slug={slug} meId={me.id} isAdmin={isAdmin} rows={rows} />;
  }

  return (
    <div class="wrap comm-page">
      {/* Portada: la foto del grupo a todo el ancho con el escudo y el nombre encima (más baja fuera de Partidos/Miembros). */}
      <CommunityPhoto id={c.id} name={c.name} url={c.photo_url ?? null} isAdmin={isAdmin} changed={load}
        compact={tab !== 'partidos' && tab !== 'miembros'}>
        <a href="#/" class="cover-back">← Comunidades</a>
        <h2 class="cover-title">
          <span class="cover-crest" aria-hidden="true" style={`--h:${hue(c.id)}`}>{initials(c.name)}</span>
          <span class="cover-name">{c.name}</span>
        </h2>
      </CommunityPhoto>
      <nav class="tabs">
        <Tab id="partidos" label="Partidos" />
        <Tab id="chat" label="Chat" badge={unread} />
        <Tab id="ranking" label="Ranking" />
        <Tab id="votar" label="Votar" />
        <Tab id="miembros" label="Miembros" />
      </nav>
      <div class={`tab-body tab-${kind}`}><Loading>{body}</Loading></div>
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
