// Edge Function `push`: manda los avisos al celular (Web Push).
// La llaman la base (triggers y el reloj de pg_cron, con el header x-push-secret) y la app (type 'test',
// con el token del usuario, para probar en su propio celular).
// 'weekly' (resumen de la semana, lo dispara pg_cron los lunes) arma el texto con la lógica de weeklyCore.ts: el bloque
// SHARED de abajo es una copia exacta de src/features/matches/weeklyCore.ts (`npm test` verifica que sigan iguales).
// 'booking_request' / 'booking_status' (reservas de canchas; los dispara el trigger push_on_booking con { type, booking_id } y, en
// booking_status, { status, by: 'requester' | 'staff' }) van a perfiles puntuales (el dueño y sus encargados, o quien pidió el
// turno) y sin filtro de tipo de aviso: son sobre SU turno o SU complejo, igual que 'promoted' o 'suspended'.
// 'mvp' / 'vote' / 'vote_last' (votar la figura y calificar al equipo: al cargar el resultado, 2 h después del partido y "última
// llamada" al día siguiente; los dispara push_on_played / push_tick) van solo a los que jugaron y todavía no votaron la figura.
// Secretos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SECRET (SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ===== BEGIN SHARED (copia de src/features/matches/weeklyCore.ts) =====
// Resumen de la semana de una comunidad: lógica pura. SIN imports: la usan la app (tarjeta "Resumen de la semana" de
// Partidos) y la Edge Function `push` (el aviso del lunes), que lleva una copia EXACTA de este archivo entre los
// marcadores BEGIN/END SHARED (una Edge Function no puede importar de src; el deploy sube un solo archivo).
// `npm test` verifica que la copia siga igual: si editás esto, pegalo también en supabase/functions/push/index.ts.

/** Ventana del resumen: los partidos jugados en los últimos 7 días. */
export const WEEK_DAYS = 7;
/** Largo máximo del texto del aviso (los celulares cortan lo que sobra). */
export const WEEK_BODY_MAX = 120;

export interface WeekMatch { id: string; score_a: number | null; score_b: number | null }
export interface WeekEvent { match_id: string; profile_id: string; kind: string }
/** Votos de figura que recibió un jugador en un partido. */
export interface WeekVote { match_id: string; profile_id: string; votes: number }
/** El que lidera una cuenta; si hay empate, todos los empatados. */
export interface WeekTop { ids: string[]; n: number }
export interface WeekSummary {
  played: number;
  /** "3–2", en el orden en que vinieron los partidos; solo si todos tienen resultado. */
  results: string[];
  scorers: WeekTop | null;
  assisters: WeekTop | null;
  /** Figura de la semana: el que fue figura en más partidos (n); desempata por votos recibidos. */
  mvp: WeekTop | null;
}

/** Junta votos sueltos (uno por votante) en votos por partido y jugador. */
export function tallyVotes(votes: { match_id: string; target_id: string }[]): WeekVote[] {
  const m = new Map<string, WeekVote>();
  for (const v of votes) {
    const k = `${v.match_id}|${v.target_id}`;
    const x = m.get(k);
    if (x) x.votes++; else m.set(k, { match_id: v.match_id, profile_id: v.target_id, votes: 1 });
  }
  return [...m.values()];
}

/** Los que tienen el mayor valor (mayor que cero); todos si empatan. */
function leaders(counts: Map<string, [number, number]>): WeekTop | null {
  let best: [number, number] | null = null;
  for (const c of counts.values()) {
    if (c[0] <= 0) continue;
    if (!best || c[0] > best[0] || (c[0] === best[0] && c[1] > best[1])) best = c;
  }
  if (!best) return null;
  const b = best;
  return { ids: [...counts].filter(([, c]) => c[0] === b[0] && c[1] === b[1]).map(([id]) => id), n: b[0] };
}

/**
 * Goleador, asistidor y figura de los partidos dados. Cuenta solo eventos y votos de esos partidos.
 * Figura de un partido = el más votado (empate: los dos, igual que el ranking de figuras).
 */
export function weekSummary(matches: WeekMatch[], events: WeekEvent[], votes: WeekVote[]): WeekSummary {
  const ids = new Set(matches.map(m => m.id));
  const count = (kind: string) => {
    const c = new Map<string, [number, number]>();
    for (const e of events) if (e.kind === kind && ids.has(e.match_id)) c.set(e.profile_id, [(c.get(e.profile_id)?.[0] ?? 0) + 1, 0]);
    return leaders(c);
  };

  const perMatch = new Map<string, WeekVote[]>();
  for (const v of votes) if (ids.has(v.match_id) && v.votes > 0) perMatch.set(v.match_id, [...(perMatch.get(v.match_id) ?? []), v]);
  const wins = new Map<string, [number, number]>(); // [partidos en que fue figura, votos recibidos]
  for (const vs of perMatch.values()) {
    const max = Math.max(...vs.map(v => v.votes));
    for (const v of vs) {
      const w = wins.get(v.profile_id) ?? [0, 0];
      wins.set(v.profile_id, [w[0] + (v.votes === max ? 1 : 0), w[1] + v.votes]);
    }
  }

  const scored = matches.filter(m => m.score_a != null && m.score_b != null);
  return {
    played: matches.length,
    results: scored.length === matches.length ? scored.map(m => `${m.score_a}–${m.score_b}`) : [],
    scorers: count('goal'),
    assisters: count('assist'),
    mvp: leaders(wins),
  };
}

/** "A", "A y B", "A, B y 1 más". */
export function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' y ');
  return `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sorted = (ids: string[], nameOf: (id: string) => string) => ids.map(nameOf).sort((a, b) => a.localeCompare(b, 'es'));

/** Las partes del resumen, cada una con su emoji ("⚽ Goleador: Benja (4)"); lo que no hubo no aparece. */
export function weekParts(s: WeekSummary, nameOf: (id: string) => string, opts: { results?: boolean; assists?: boolean } = {}): string[] {
  const out = [plural(s.played, 'partido', 'partidos') + (opts.results !== false && s.results.length && s.results.length <= 3 ? ` (${s.results.join(', ')})` : '')];
  if (s.scorers) out.push(`⚽ ${s.scorers.ids.length > 1 ? 'Goleadores' : 'Goleador'}: ${listNames(sorted(s.scorers.ids, nameOf))} (${s.scorers.n})`);
  if (opts.assists !== false && s.assisters) out.push(`🎯 ${s.assisters.ids.length > 1 ? 'Asistidores' : 'Asistidor'}: ${listNames(sorted(s.assisters.ids, nameOf))} (${s.assisters.n})`);
  if (s.mvp) out.push(`⭐ Figura${s.mvp.ids.length > 1 ? 's' : ''}: ${listNames(sorted(s.mvp.ids, nameOf))}${s.mvp.n > 1 ? ` (${s.mvp.n} veces)` : ''}`);
  return out;
}

/** El aviso del lunes (título y texto de hasta WEEK_BODY_MAX); null si no se jugó nada. */
export function weekNote(s: WeekSummary, nameOf: (id: string) => string, community: string): { title: string; body: string } | null {
  if (s.played < 1) return null;
  // Si no entra, se van sacando primero las asistencias y después los resultados.
  const tries = [{}, { assists: false }, { assists: false, results: false }].map(o => weekParts(s, nameOf, o));
  let body = (tries.find(p => p.join(' · ').length <= WEEK_BODY_MAX) ?? tries[tries.length - 1]).join(' · ');
  if (tries[0].length === 1) body = `${tries[0][0]}. Mirá cómo quedó el ranking.`; // sin goles ni figura: que el aviso tenga un motivo para abrirse
  if (body.length > WEEK_BODY_MAX) body = `${body.slice(0, WEEK_BODY_MAX - 1).trimEnd()}…`;
  return { title: `📊 La semana en ${community}`.slice(0, 60), body };
}
// ===== END SHARED =====

type Kind = 'match' | 'reminder' | 'teams' | 'chat' | 'weekly';
interface Note { title: string; body: string; url: string; tag: string }

const when = (iso: string) => new Date(iso).toLocaleString('es-AR', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires',
});
const nameOf = (p: { name: string; nickname: string | null } | null) => p?.nickname || p?.name || 'Alguien';

/**
 * Manda a las suscripciones de esos perfiles que tengan ese tipo de aviso. Borra las vencidas.
 * `opts` pisa lo de siempre (un "recordatorio" vence a la hora, urgente salvo chat y resumen): los de votar la figura valen todo el día y no son urgentes.
 */
async function send(profiles: string[], kind: Kind | null, n: Note, opts: { ttl?: number; urgency?: 'normal' | 'high' } = {}) {
  if (!profiles.length) return 0;
  let q = db.from('push_subscriptions').select('endpoint,p256dh,auth').in('profile_id', profiles);
  if (kind) q = q.contains('kinds', [kind]);
  const { data: subs } = await q;
  let ok = 0;
  await Promise.all((subs ?? []).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(n), {
          TTL: opts.ttl ?? (kind === 'reminder' ? 3600 : 86400),
          urgency: opts.urgency ?? (kind === 'chat' || kind === 'weekly' ? 'normal' : 'high'),
        });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else console.error('push', code, (e as Error).message);
    }
  }));
  return ok;
}

async function matchInfo(id: string) {
  const { data: m, error } = await db.from('matches')
    .select('id,title,starts_at,location,created_by,fee_total,community:communities(id,name,slug)').eq('id', id).single();
  if (error) console.error('match lookup', error.message);
  return m as unknown as {
    id: string; title: string; starts_at: string; location: string | null; created_by: string | null; fee_total: number | null;
    community: { id: string; name: string; slug: string };
  } | null;
}
const members = async (c: string) =>
  ((await db.from('memberships').select('profile_id').eq('community_id', c)).data ?? []).map(r => r.profile_id as string);
const playing = async (m: string) =>
  ((await db.from('match_signups').select('profile_id').eq('match_id', m).eq('status', 'in')).data ?? [])
    .map(r => r.profile_id as string);
/** Los que jugaron (anotados, sin ausencia) y todavía no votaron la figura; `teams` = el partido tiene equipos armados (se puede calificar al equipo). */
const pendingVoters = async (m: string) => {
  const [{ data: ins }, { data: vt }] = await Promise.all([
    db.from('match_signups').select('profile_id,team').eq('match_id', m).eq('status', 'in').eq('absent', false),
    db.from('mvp_votes').select('voter_id').eq('match_id', m),
  ]);
  const voted = new Set((vt ?? []).map(v => v.voter_id as string));
  const rows = ins ?? [];
  return { to: rows.map(r => r.profile_id as string).filter(id => !voted.has(id)), teams: rows.some(r => r.team) };
};
/** Anotados + lista de espera (a los que les cambia algo si se mueve o cancela el partido). */
const involved = async (m: string) =>
  ((await db.from('match_signups').select('profile_id').eq('match_id', m).in('status', ['in', 'waitlist'])).data ?? [])
    .map(r => r.profile_id as string);
const hour = (iso: string) => new Date(iso).toLocaleTimeString('es-AR',
  { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

/** Una reserva de cancha con su cancha, su complejo (nombre y zona horaria) y quién la pidió. */
async function bookingInfo(id: string) {
  const { data: b, error } = await db.from('bookings')
    .select('id,starts_at,status,requested_by,owner_note,field:fields(name),complex:complexes(id,name,tz)').eq('id', id).maybeSingle();
  if (error) console.error('booking lookup', error.message);
  return b as unknown as {
    id: string; starts_at: string; status: string; requested_by: string | null; owner_note: string | null;
    field: { name: string } | null; complex: { id: string; name: string; tz: string | null } | null;
  } | null;
}
/** "jue 12 nov, 21:00" en la hora del complejo (si la zona no es válida, la de Argentina). */
const whenAt = (iso: string, tz: string | null) => {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      timeZone: tz || 'America/Argentina/Buenos_Aires',
    });
  } catch { return when(iso); }
};
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const p = await req.json().catch(() => ({})) as Record<string, string> & { time_changed?: boolean; place_changed?: boolean };

  // Prueba desde la app: solo a los celulares de quien la pide.
  if (p.type === 'test') {
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const { data: u } = await db.auth.getUser(token);
    if (!u.user) return json({ error: 'unauthorized' }, 401);
    const { data: me } = await db.from('profiles').select('id').eq('user_id', u.user.id).single();
    if (!me) return json({ error: 'no_profile' }, 400);
    const sent = await send([me.id], null,
      { title: '⚽ ¡Avisos activados!', body: 'Así te van a llegar los partidos, recordatorios y el chat.', url: '/', tag: 'test' });
    return json({ sent });
  }

  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return json({ error: 'forbidden' }, 403);

  if (p.type === 'chat') {
    const { data: msg, error: msgErr } = await db.from('messages')
      .select('community_id,author_id,body,image_url,author:profiles!messages_author_id_fkey(name,nickname),community:communities(name,slug)')
      .eq('id', p.message_id).single();
    if (!msg) { if (msgErr) console.error('chat lookup', msgErr.message); return json({ sent: 0 }); }
    const m = msg as unknown as {
      community_id: string; author_id: string; body: string | null; image_url: string | null;
      author: { name: string; nickname: string | null } | null; community: { name: string; slug: string };
    };
    const to = (await members(m.community_id)).filter(id => id !== m.author_id);
    const text = m.body?.trim() || (m.image_url ? '📷 Foto' : '');
    const sent = await send(to, 'chat', {
      title: `💬 ${m.community.name}`, body: `${nameOf(m.author)}: ${text}`.slice(0, 180),
      url: `/#/c/${m.community.slug}/chat`, tag: `chat-${m.community_id}`,
    });
    return json({ sent });
  }

  if (p.type === 'suspended') {
    const { data: su } = await db.from('suspensions').select('profile_id,match_id,reason,community:communities(name,slug)')
      .eq('id', p.suspension_id).maybeSingle();
    if (!su) return json({ sent: 0 });
    const x = su as unknown as { profile_id: string; match_id: string | null; reason: string | null; community: { name: string; slug: string } };
    const mm = x.match_id ? await matchInfo(x.match_id) : null;
    return json({ sent: await send([x.profile_id], null, {
      title: `🚫 Suspendido en ${x.community.name}`,
      body: `${mm ? `No podés jugar ${mm.title} (${when(mm.starts_at)})` : 'No podés jugar el próximo partido'}${x.reason ? `. Motivo: ${x.reason}` : ''}.`,
      url: mm ? `/#/c/${x.community.slug}/m/${mm.id}` : `/#/c/${x.community.slug}`, tag: `susp-${p.suspension_id}`,
    }) });
  }

  if (p.type === 'weekly') {
    // Resumen de la semana: partidos jugados en los últimos 7 días, goleador, asistidor y figura. Va a los miembros con el aviso 'weekly'.
    const { data: c } = await db.from('communities').select('id,name,slug').eq('id', p.community_id).maybeSingle();
    if (!c) return json({ sent: 0 });
    const now = Date.now();
    const { data: ms } = await db.from('matches').select('id,score_a,score_b').eq('community_id', c.id).eq('status', 'played')
      .gte('starts_at', new Date(now - WEEK_DAYS * 86_400_000).toISOString()).lte('starts_at', new Date(now).toISOString())
      .order('starts_at');
    const played = ms ?? [];
    if (!played.length) return json({ sent: 0 });
    const ids = played.map(x => x.id as string);
    // Con la clave de servicio se leen los votos sueltos (la vista match_mvp solo responde a un usuario logueado).
    const [{ data: ev }, { data: vt }] = await Promise.all([
      db.from('match_events').select('match_id,profile_id,kind').in('match_id', ids).in('kind', ['goal', 'assist']),
      db.from('mvp_votes').select('match_id,target_id').in('match_id', ids),
    ]);
    const s = weekSummary(played, ev ?? [], tallyVotes(vt ?? []));
    const who = [...new Set([...(s.scorers?.ids ?? []), ...(s.assisters?.ids ?? []), ...(s.mvp?.ids ?? [])])];
    const { data: ps } = who.length ? await db.from('profiles').select('id,name,nickname').in('id', who) : { data: [] };
    const names = new Map((ps ?? []).map(x => [x.id as string, nameOf(x)]));
    const note = weekNote(s, id => names.get(id) ?? 'Alguien', c.name);
    if (!note) return json({ sent: 0 });
    return json({ sent: await send(await members(c.id), 'weekly', { ...note, url: `/#/c/${c.slug}/ranking`, tag: `weekly-${c.id}` }) });
  }

  if (p.type === 'booking_request' || p.type === 'booking_status') {
    const b = await bookingInfo(p.booking_id);
    if (!b?.complex) return json({ sent: 0 });
    const cx = b.complex;
    const field = b.field?.name ?? 'Cancha';
    const at = whenAt(b.starts_at, cx.tz);
    // Dueño y encargados del complejo, menos quien pidió el turno (si es del equipo no hace falta avisarle).
    const staff = async () => ((await db.from('complex_staff').select('profile_id').eq('complex_id', cx.id)).data ?? [])
      .map(r => r.profile_id as string).filter(id => id !== b.requested_by);
    const requester = async () => b.requested_by
      ? (await db.from('profiles').select('name,nickname').eq('id', b.requested_by).maybeSingle()).data as { name: string; nickname: string | null } | null
      : null;

    if (p.type === 'booking_request') {
      // Pedido nuevo → al dueño y a los encargados.
      if (b.status !== 'pending') return json({ sent: 0 }); // lo cancelaron o decidieron antes de avisar
      return json({ sent: await send(await staff(), null, {
        title: short(`🏟️ Nueva reserva: ${field} · ${at}`, 80),
        body: short(`${nameOf(await requester())} pidió turno en ${cx.name}. Confirmala o rechazala.`, 160),
        url: '/#/duenio', tag: `booking-${b.id}`,
      }) });
    }
    if (b.status === 'cancelled' && p.by === 'requester') {
      // Lo canceló quien lo pidió → al dueño y a los encargados (el trigger manda by = 'requester' o 'staff').
      return json({ sent: await send(await staff(), null, {
        title: short(`🚫 Reserva cancelada: ${field} · ${at}`, 80),
        body: short(`${nameOf(await requester())} canceló su pedido en ${cx.name}. El horario queda libre.`, 160),
        url: '/#/duenio', tag: `booking-${b.id}`,
      }) });
    }
    // Confirmada, rechazada o cancelada por el complejo → a quien la pidió.
    const st = ({
      confirmed: { icon: '✅', verb: 'confirmada', tip: 'Ya podés armar el partido desde Mis reservas.' },
      rejected: { icon: '❌', verb: 'rechazada', tip: 'Probá con otro horario.' },
      cancelled: { icon: '🚫', verb: 'cancelada', tip: '' },
    } as Record<string, { icon: string; verb: string; tip: string }>)[b.status];
    if (!st || !b.requested_by) return json({ sent: 0 });
    const why = b.owner_note?.trim() && b.status !== 'confirmed' ? ` Motivo: ${b.owner_note.trim()}` : '';
    return json({ sent: await send([b.requested_by], null, {
      title: short(`${st.icon} Tu reserva en ${short(cx.name, 30)} fue ${st.verb}`, 80),
      body: short(`${field} · ${at}. ${st.tip}${why}`.trim(), 160),
      url: '/#/mis-reservas', tag: `booking-${b.id}`,
    }) });
  }

  const m = p.match_id ? await matchInfo(p.match_id) : null;
  if (!m) return json({ sent: 0 });
  const url = `/#/c/${m.community.slug}/m/${m.id}`;
  const where = m.location ? ` · ${m.location}` : '';

  if (p.type === 'match') {
    const to = (await members(m.community.id)).filter(id => id !== m.created_by);
    return json({ sent: await send(to, 'match', {
      title: `⚽ Nuevo partido en ${m.community.name}`, body: `${m.title} · ${when(m.starts_at)}${where}. ¡Anotate!`,
      url, tag: `match-${m.id}`,
    }) });
  }
  if (p.type === 'reminder') {
    return json({ sent: await send(await playing(m.id), 'reminder', {
      title: `⏰ Falta poco: ${m.title}`, body: `Arranca ${when(m.starts_at)}${where}.`, url, tag: `match-${m.id}`,
    }) });
  }
  if (p.type === 'teams') {
    return json({ sent: await send(await playing(m.id), 'teams', {
      title: `👕 Equipos armados: ${m.title}`, body: `Mirá en qué equipo te tocó (${m.community.name}).`, url, tag: `teams-${m.id}`,
    }) });
  }
  // Votar la figura (y calificar al equipo). Tres momentos, siempre solo a los que jugaron y todavía no votaron, con el tipo 'reminder':
  //   mvp        el admin cargó el resultado (trigger push_on_played)
  //   vote       2 h después de que empezó el partido, si nadie lo marcó como jugado (push_tick)
  //   vote_last  "última llamada" al día siguiente (push_tick)
  // Los tres comparten `tag`: el último reemplaza al anterior en el celular en vez de apilarse. Vencen al día y no son urgentes.
  if (p.type === 'mvp' || p.type === 'vote' || p.type === 'vote_last') {
    const { to, teams } = await pendingVoters(m.id);
    const rate = teams ? ' y calificá a tu equipo' : '';
    const note = p.type === 'mvp'
      ? { title: `🏆 ¿Quién fue la figura?`, body: `${short(m.title, 60)} terminó. Votá a la figura${rate}.` }
      : p.type === 'vote'
        ? { title: `🏆 ¿Quién fue la figura del partido?`, body: `¿Cómo salió ${short(m.title, 50)}? Votá a la figura${rate} antes de que se te olvide.` }
        : { title: `⏳ Última llamada: votá la figura`, body: `Todavía no votaste la figura de ${short(m.title, 50)}. Son 10 segundos.` };
    return json({ sent: await send(to, 'reminder', { ...note, url, tag: `vote-${m.id}` }, { ttl: 86400, urgency: 'normal' }) });
  }
  if (p.type === 'fee') {
    const { data: rows } = await db.from('match_signups').select('profile_id,paid_at')
      .eq('match_id', m.id).eq('status', 'in').eq('absent', false);
    const all = rows ?? [];
    const each = m.fee_total && all.length ? Math.ceil(m.fee_total / all.length) : 0;
    const unpaid = all.filter(r => !r.paid_at).map(r => r.profile_id as string);
    return json({ sent: await send(unpaid, 'reminder', {
      title: `💸 Te falta pagar la cancha`, body: `${m.title}: $${each.toLocaleString('es-AR')} c/u. Cuando pagues, marcalo en la app.`,
      url, tag: `fee-${m.id}`,
    }) });
  }
  if (p.type === 'today') {
    const { data: rows } = await db.from('match_signups').select('profile_id,status').eq('match_id', m.id);
    const all = rows ?? [];
    const ins = all.filter(r => r.status === 'in').map(r => r.profile_id as string);
    const { data: mm } = await db.from('matches').select('slots').eq('id', m.id).single();
    const missing = Math.max(0, (mm?.slots ?? 0) - ins.length);
    let sent = await send(ins, 'reminder', {
      title: `⚽ Hoy jugás: ${m.title}`,
      body: `A las ${hour(m.starts_at)}${where}.${missing ? ` Faltan ${missing} para completar.` : ''} Si no podés ir, bajate a tiempo.`,
      url, tag: `match-${m.id}`,
    });
    if (missing > 0) {
      // A los que no están anotados ni en espera ni suspendidos para este partido
      const busy = new Set(all.filter(r => r.status === 'in' || r.status === 'waitlist').map(r => r.profile_id as string));
      const { data: susp } = await db.from('suspensions').select('profile_id').eq('match_id', m.id);
      (susp ?? []).forEach(r => busy.add(r.profile_id as string));
      const to = (await members(m.community.id)).filter(id => !busy.has(id));
      sent += await send(to, 'match', {
        title: `🙋 Faltan ${missing === 1 ? '1 jugador' : `${missing} jugadores`} para hoy`,
        body: `${m.title} · ${hour(m.starts_at)}${where}. ¿Te sumás?`, url, tag: `match-${m.id}`,
      });
    }
    return json({ sent });
  }
  if (p.type === 'promoted') {
    // Siempre se manda (sin filtro de tipo): le cambia si tiene que ir o no.
    return json({ sent: await send([p.profile_id], null, {
      title: `✅ ¡Entraste! ${m.title}`,
      body: `Pasaste de la lista de espera a anotado. Vas a tener que jugar: ${when(m.starts_at)}${where}. Si no podés, bajate así entra otro.`,
      url, tag: `match-${m.id}`,
    }) });
  }
  if (p.type === 'cancelled') {
    return json({ sent: await send((await involved(m.id)).filter(id => id !== m.created_by), null, {
      title: `❌ Se canceló ${m.title}`, body: `El partido del ${when(m.starts_at)} no se juega.`, url, tag: `match-${m.id}`,
    }) });
  }
  if (p.type === 'changed') {
    const what = p.time_changed && p.place_changed ? 'Cambió el horario y el lugar'
      : p.time_changed ? 'Cambió el horario' : 'Cambió el lugar';
    return json({ sent: await send(await involved(m.id), 'match', {
      title: `🕒 ${what}: ${m.title}`, body: `Ahora es ${when(m.starts_at)}${where}.`, url, tag: `match-${m.id}`,
    }) });
  }
  return json({ error: 'bad_type' }, 400);
});
