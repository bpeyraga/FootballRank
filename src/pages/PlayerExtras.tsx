import { useEffect, useState } from 'preact/hooks';
import { displayName, sb } from '../lib/supabase';
import { outcome, type Team } from '../lib/stats';
import type { Ranked } from '../lib/ranking';
import { fmtDate } from './Matches';
import { houseCodes } from '../lib/Radar';

interface Custom { id: string; label: string; value: number; created_by: string; hidden: boolean; code: string | null }

/**
 * Stats inventadas ("Morfón 90"). Las ve toda la comunidad.
 * El autor edita o borra; el jugador y los admins pueden ocultar las que le pusieron otros.
 */
export function CustomStats({ pid, rows, meId, communityId, isAdmin, onChange }:
  { pid: string; rows: Ranked[]; meId: string; communityId: string; isAdmin: boolean; onChange?: () => void }) {
  const [list, setList] = useState<Custom[] | null>(null);
  const [form, setForm] = useState<{ label: string; value: number; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canModerate = pid === meId || isAdmin;
  const nameOf = (id: string) => {
    const p = rows.find(x => x.profile.id === id)?.profile;
    return id === meId ? 'vos' : p ? displayName(p) : '?';
  };

  const load = async () => {
    const { data, error } = await sb.from('custom_stats').select('id,label,value,created_by,hidden,code')
      .eq('community_id', communityId).eq('target_id', pid).order('value', { ascending: false });
    if (error) setErr(error.message); else setList(data);
  };
  useEffect(() => { setList(null); setForm(null); load(); }, [pid, communityId]);

  const run = async (q: PromiseLike<{ error: any }>) => {
    setBusy(true); setErr('');
    const { error } = await q;
    setBusy(false);
    if (error) { setErr(error.message); return false; }
    await load();
    onChange?.();
    return true;
  };
  const save = async () => {
    const ok = await run(sb.from('custom_stats').upsert(
      { community_id: communityId, target_id: pid, created_by: meId, label: form!.label.trim(), value: form!.value, hidden: false,
        code: cleanCode(form!.code) || null },
      { onConflict: 'community_id,target_id,created_by,label' }));
    if (ok) setForm(null);
  };

  // Las ocultas solo las ven el jugador, los admins y quien las creó.
  const visible = (list ?? []).filter(c => !c.hidden || canModerate || c.created_by === meId);
  const target = rows.find(x => x.profile.id === pid)?.profile;

  return (
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3>Stats de la casa</h3>
        {!form && <button class="btn sm" onClick={() => setForm({ label: '', value: 80, code: '' })}>+ Agregar</button>}
      </div>
      {list && !visible.length && !form && (
        <p class="muted">{pid === meId
          ? 'Inventá tus propias stats o esperá a que te pongan alguna.'
          : `Ponele una stat a ${target ? displayName(target) : 'este jugador'}: "Morfón 90", "Caño 85"…`}</p>
      )}
      <div class="chips">
        {visible.map(c => (
          <div class={`chip ${c.hidden ? 'off' : ''}`}>
            <b>{c.value}</b>
            <span class="chip-label">{c.label}</span>
            <small class="muted">por {nameOf(c.created_by)}{c.hidden && ' · oculta'}</small>
            <span class="chip-actions">
              {c.created_by === meId &&
                <button disabled={busy} onClick={() => setForm({ label: c.label, value: c.value, code: c.code ?? '' })}>Editar</button>}
              {(c.created_by === meId || isAdmin) &&
                <button disabled={busy} onClick={() => run(sb.from('custom_stats').delete().eq('id', c.id))}>Borrar</button>}
              {canModerate && c.created_by !== meId &&
                <button disabled={busy} onClick={() => run(sb.from('custom_stats').update({ hidden: !c.hidden }).eq('id', c.id))}>
                  {c.hidden ? 'Mostrar' : 'Ocultar'}</button>}
            </span>
          </div>
        ))}
      </div>
      {form && (
        <div style="margin-top:12px">
          <label class="field"><span>Nombre de la stat</span>
            <input value={form.label} maxLength={24} placeholder="Morfón"
              onInput={e => setForm({ ...form, label: (e.target as HTMLInputElement).value })} /></label>
          <label class="field"><span>Código para el gráfico (opcional, 2-3 letras)</span>
            <input value={form.code} maxLength={3} autoCapitalize="characters" style="text-transform:uppercase;max-width:8em"
              placeholder={form.label.trim() ? houseCodes([form.label])[0] : 'MOR'}
              onInput={e => setForm({ ...form, code: cleanCode((e.target as HTMLInputElement).value) })} /></label>
          {form.code.length === 1 && <p class="err" style="margin-top:-8px">Usá 2 o 3 letras, o dejalo vacío.</p>}
          <label class="slider"><b>Valor</b>
            <input type="range" min={1} max={99} value={form.value}
              onInput={e => setForm({ ...form, value: +(e.target as HTMLInputElement).value })} />
            <output>{form.value}</output></label>
          <div class="row">
            <button class="btn primary" disabled={busy || !form.label.trim() || form.code.length === 1} onClick={save}>Guardar</button>
            <button class="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {err && <p class="err">{err}</p>}
    </div>
  );
}

interface Played {
  id: string; title: string; starts_at: string; team: Team | null;
  score_a: number | null; score_b: number | null; rating: number | null; n: number; absent: boolean;
}

/** Partidos jugados en la comunidad, con resultado y nota promedio que le pusieron sus compañeros. */
export function MatchHistory({ pid, slug, communityId }: { pid: string; slug: string; communityId: string }) {
  const [list, setList] = useState<Played[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setList(null); setErr('');
    (async () => {
      const s = await sb.from('match_signups')
        .select('team, absent, match:matches!inner(id,title,starts_at,status,score_a,score_b,community_id)')
        .eq('profile_id', pid).eq('status', 'in')
        .eq('match.community_id', communityId).eq('match.status', 'played');
      if (s.error) throw s.error;
      const ms = (s.data ?? []) as any[];
      const ids = ms.map(x => x.match.id);
      const sc = ids.length
        ? await sb.from('match_scores').select('match_id,avg_score,n').eq('profile_id', pid).in('match_id', ids)
        : { data: [] as any[], error: null };
      if (sc.error) throw sc.error;
      const S = new Map((sc.data ?? []).map((x: any) => [x.match_id, x]));
      const out: Played[] = ms.map(x => ({
        id: x.match.id, title: x.match.title, starts_at: x.match.starts_at, team: x.team, absent: !!x.absent,
        score_a: x.match.score_a, score_b: x.match.score_b,
        rating: S.has(x.match.id) ? +S.get(x.match.id).avg_score : null,
        n: S.get(x.match.id)?.n ?? 0,
      })).sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
      if (alive) setList(out);
    })().catch(e => alive && setErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [pid, communityId]);

  if (err) return <div class="card"><p class="err" style="margin:0">No pudimos cargar los partidos. {err}</p></div>;
  if (!list || !list.length) return null; // "todavía no jugó" ya lo dice la tarjeta de estadísticas

  const rated = list.filter(m => m.rating != null && !m.absent);
  const absences = list.filter(m => m.absent).length;
  const avg = rated.length ? (rated.reduce((t, m) => t + m.rating!, 0) / rated.length).toFixed(1).replace('.', ',') : null;
  const RES = { won: ['G', 'won'], drawn: ['E', 'drawn'], lost: ['P', 'lost'] } as const;

  return (
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3>Partidos{absences > 0 && <span class="pill bad">{absences} {absences === 1 ? 'falta' : 'faltas'}</span>}</h3>
        <span class="muted" title={`Promedio de ${rated.length} ${rated.length === 1 ? 'partido calificado' : 'partidos calificados'}`}>
          Nota promedio <b class="avg-score">{avg ? `★ ${avg}` : '—'}</b>
        </span>
      </div>
      {list.map(m => {
        const o = m.absent ? null : outcome(m.team, m.score_a, m.score_b);
        return (
          <a class="row rank-row" href={`#/c/${slug}/m/${m.id}`}>
            <span class={`res ${m.absent ? 'absent' : o ? RES[o][1] : ''}`} title={m.absent ? 'Ausente' : undefined}>{m.absent ? 'A' : o ? RES[o][0] : '·'}</span>
            <div style="flex:1;min-width:0">
              <div class="ellipsis">{m.title}</div>
              <div class="muted" style="font-size:.85rem">
                {fmtDate(m.starts_at)}{m.score_a != null && ` · ${m.score_a}–${m.score_b}`}{m.team && ` · Equipo ${m.team}`}
              </div>
            </div>
            {m.rating != null && !m.absent &&
              <span class="pill" title={`${m.n} ${m.n === 1 ? 'calificación' : 'calificaciones'}`}>★ {String(m.rating).replace('.', ',')}</span>}
          </a>
        );
      })}
    </div>
  );
}

/** Aviso de suspensión activa (próximo partido o pendiente) con opción de levantarla para admins. */
export function SuspensionNotice({ pid, communityId, isAdmin }: { pid: string; communityId: string; isAdmin: boolean }) {
  const [list, setList] = useState<{ id: string; reason: string | null; match: { title: string; starts_at: string; status: string } | null }[]>([]);
  const [err, setErr] = useState('');
  const load = async () => {
    const { data, error } = await sb.from('suspensions').select('id, reason, match:matches(title,starts_at,status)')
      .eq('community_id', communityId).eq('profile_id', pid);
    if (error) return setErr(error.message);
    // Activa = pendiente (sin partido) o con un partido que todavía no se jugó
    setList(((data ?? []) as any[]).filter(x => !x.match || ((x.match.status === 'open' || x.match.status === 'closed')
      && +new Date(x.match.starts_at) > Date.now() - 3 * 3600e3)));
  };
  useEffect(() => { load(); }, [pid, communityId]);
  if (!list.length && !err) return null;
  return (
    <div class="card note">
      {err && <p class="err">{err}</p>}
      {list.map(x => (
        <div class="row">
          <div style="flex:1">
            <b>Suspendido</b> {x.match ? <>para «{x.match.title}» ({fmtDate(x.match.starts_at)})</> : 'para el próximo partido'}
            {x.reason && <div style="font-size:.85rem">{x.reason}</div>}
          </div>
          {isAdmin && <button class="btn sm" onClick={async () => {
            const { error } = await sb.from('suspensions').delete().eq('id', x.id);
            if (error) setErr(error.message); else load();
          }}>Levantar</button>}
        </div>
      ))}
    </div>
  );
}

/** Código: mayúsculas, solo letras (con Ñ) y números, máx. 3. */
const cleanCode = (s: string) => s.toLocaleUpperCase('es').replace(/Ñ/g, ' ').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/ /g, 'Ñ').replace(/[^A-Z0-9Ñ]/g, '').slice(0, 3);
