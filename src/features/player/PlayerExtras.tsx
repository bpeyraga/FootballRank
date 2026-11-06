import { useEffect, useState } from 'preact/hooks';
import { displayName } from '../../shared/supabase';
import { outcome } from '../stats/stats';
import type { Ranked } from '../ranking/ranking';
import { fmtDate } from '../../shared/text';
import { houseCodes } from '../../shared/ui/Radar';
import type { CustomRow } from '../stats/customStats';
import { addCustom, deleteCustom, loadCustom, updateCustom } from '../stats/api';
import { liftSuspension } from '../matches/api';
import { loadPlayed, loadSuspensions } from './api';
import { activeSuspensions, byValue, cleanCode, customTarget, historySummary, type Played, type SuspensionRow } from './model';

const msgOf = (e: unknown) => (e as { message?: string })?.message || 'Error de red';

/**
 * Stats inventadas ("Morfón 90"). Las ve toda la comunidad.
 * El autor edita o borra; el jugador y los admins pueden ocultar las que le pusieron otros.
 */
export function CustomStats({ pid, rows, meId, communityId, isAdmin, onChange }:
  { pid: string; rows: Ranked[]; meId: string; communityId: string; isAdmin: boolean; onChange?: () => void }) {
  const [list, setList] = useState<CustomRow[] | null>(null);
  const [form, setForm] = useState<{ id?: string; label: string; value: number; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canModerate = pid === meId || isAdmin;
  const nameOf = (id: string) => {
    const p = rows.find(x => x.profile.id === id)?.profile;
    return id === meId ? 'vos' : p ? displayName(p) : '?';
  };

  const load = async () => {
    try { setList(byValue(await loadCustom(communityId, pid))); } catch (e) { setErr(msgOf(e)); }
  };
  useEffect(() => { setList(null); setForm(null); load(); }, [pid, communityId]);

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await f(); } catch (e) { setBusy(false); setErr(msgOf(e)); return false; }
    setBusy(false);
    await load();
    onChange?.();
    return true;
  };
  const save = async () => {
    const f = form!, label = f.label.trim(), code = cleanCode(f.code) || null;
    const { existing, dup } = customTarget(list ?? [], meId, label, f.id);
    if (dup) { setErr(`Ya le pusiste "${dup.label}". Editá esa.`); return; }
    const ok = await run(() => existing
      ? updateCustom(existing, { label, value: f.value, code, hidden: false })
      : addCustom({ communityId, targetId: pid, meId, label, value: f.value, code }));
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
                <button disabled={busy} onClick={() => setForm({ id: c.id, label: c.label, value: c.value, code: c.code ?? '' })}>Editar</button>}
              {(c.created_by === meId || isAdmin) &&
                <button disabled={busy} onClick={() => run(() => deleteCustom(c.id))}>Borrar</button>}
              {canModerate && c.created_by !== meId &&
                <button disabled={busy} onClick={() => run(() => updateCustom(c.id, { hidden: !c.hidden }))}>
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

/** Partidos jugados en la comunidad, con resultado y nota promedio que le pusieron sus compañeros. */
export function MatchHistory({ pid, slug, communityId }: { pid: string; slug: string; communityId: string }) {
  const [list, setList] = useState<Played[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setList(null); setErr('');
    loadPlayed(pid, communityId).then(l => alive && setList(l), e => alive && setErr(e?.message ?? 'Error desconocido'));
    return () => { alive = false; };
  }, [pid, communityId]);

  if (err) return <div class="card"><p class="err" style="margin:0">No pudimos cargar los partidos. {err}</p></div>;
  if (!list || !list.length) return null; // "todavía no jugó" ya lo dice la tarjeta de estadísticas

  const { rated, absences, avg } = historySummary(list);
  const RES = { won: ['G', 'won'], drawn: ['E', 'drawn'], lost: ['P', 'lost'] } as const;

  return (
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3>Partidos{absences > 0 && <span class="pill bad">{absences} {absences === 1 ? 'falta' : 'faltas'}</span>}</h3>
        <span class="muted" title={`Promedio de ${rated} ${rated === 1 ? 'partido calificado' : 'partidos calificados'}`}>
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
  const [list, setList] = useState<SuspensionRow[]>([]);
  const [err, setErr] = useState('');
  const load = async () => {
    try { setList(activeSuspensions(await loadSuspensions(pid, communityId))); } catch (e) { setErr(msgOf(e)); }
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
          {isAdmin && <button class="btn sm" onClick={() => liftSuspension(x.id).then(load, e => setErr(msgOf(e)))}>Levantar</button>}
        </div>
      ))}
    </div>
  );
}
