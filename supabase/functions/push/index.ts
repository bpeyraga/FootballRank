// Edge Function `push`: manda los avisos al celular (Web Push).
// La llaman la base (triggers y el reloj de pg_cron, con el header x-push-secret) y la app (type 'test',
// con el token del usuario, para probar en su propio celular).
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

type Kind = 'match' | 'reminder' | 'teams' | 'chat';
interface Note { title: string; body: string; url: string; tag: string }

const when = (iso: string) => new Date(iso).toLocaleString('es-AR', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires',
});
const nameOf = (p: { name: string; nickname: string | null } | null) => p?.nickname || p?.name || 'Alguien';

/** Manda a las suscripciones de esos perfiles que tengan ese tipo de aviso. Borra las vencidas. */
async function send(profiles: string[], kind: Kind | null, n: Note) {
  if (!profiles.length) return 0;
  let q = db.from('push_subscriptions').select('endpoint,p256dh,auth').in('profile_id', profiles);
  if (kind) q = q.contains('kinds', [kind]);
  const { data: subs } = await q;
  let ok = 0;
  await Promise.all((subs ?? []).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(n), { TTL: kind === 'reminder' ? 3600 : 86400, urgency: kind === 'chat' ? 'normal' : 'high' });
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
/** Anotados + lista de espera (a los que les cambia algo si se mueve o cancela el partido). */
const involved = async (m: string) =>
  ((await db.from('match_signups').select('profile_id').eq('match_id', m).in('status', ['in', 'waitlist'])).data ?? [])
    .map(r => r.profile_id as string);
const hour = (iso: string) => new Date(iso).toLocaleTimeString('es-AR',
  { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

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
  if (p.type === 'mvp') {
    return json({ sent: await send(await playing(m.id), 'reminder', {
      title: `🏆 ¿Quién fue la figura?`, body: `${m.title} terminó. Votá a la figura y calificá a tu equipo.`, url, tag: `mvp-${m.id}`,
    }) });
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
