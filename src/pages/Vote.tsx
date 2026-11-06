import { useState } from 'preact/hooks';
import { ATTRS, displayName, ovr, posLine, sb, type Stats } from '../lib/supabase';
import { Radar } from '../lib/Radar';
import { Avatar } from '../lib/Avatar';
import type { Ranked } from '../lib/ranking';
import { go } from '../lib/router';

/** Votar a los compañeros de a uno. Arranca por el primero sin votar (o por `startId`). */
export function Vote({ rows, communityId, slug, meId, startId, saved }:
  { rows: Ranked[]; communityId: string; slug: string; meId: string; startId?: string; saved: () => Promise<void> }) {
  // Orden fijo al entrar (sin votar primero); no se reordena al recargar después de guardar.
  const [order] = useState(() => rows.filter(r => r.profile.id !== meId)
    .sort((a, b) => Number(!!a.mine) - Number(!!b.mine) || displayName(a.profile).localeCompare(displayName(b.profile)))
    .map(r => r.profile.id));
  const others = order.map(id => rows.find(r => r.profile.id === id)).filter((r): r is Ranked => !!r);
  const [idx, setIdx] = useState(() => Math.max(0, others.findIndex(r => r.profile.id === startId)));
  const cur = others[idx];
  const init = (r?: Ranked): Stats => r?.mine ?? r?.votes ?? r?.base ?? { rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 };
  const [stats, setStats] = useState<Stats>(() => init(cur));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!cur) return <div class="card"><p class="muted">Todavía no hay compañeros para votar. ¡Compartí el link!</p></div>;

  const move = (i: number) => { setIdx(i); setStats(init(others[i])); setErr(''); };
  const save = async (next: boolean) => {
    setBusy(true); setErr('');
    const { error } = await sb.from('stat_votes').upsert({
      community_id: communityId, voter_id: meId, target_id: cur.profile.id, ...stats,
      updated_at: new Date().toISOString(),
    });
    if (!error) await saved();
    setBusy(false);
    if (error) return setErr(error.message);
    if (next && idx < others.length - 1) move(idx + 1); else go(`c/${slug}/ranking`);
  };

  return (
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <Avatar p={cur.profile} size={56} />
        <div style="flex:1">
          <h3>{displayName(cur.profile)}</h3>
          <div class="muted">{posLine(cur.profile)} · {cur.mine ? 'ya lo votaste, podés cambiarlo' : 'sin tu voto'}</div>
        </div>
        <h3>OVR {ovr(stats)}</h3>
      </div>
      <Radar stats={stats} compare={cur.base} />
      {cur.base && <p class="muted legend"><i class="sw a" /> tu voto <i class="sw b" /> su autoevaluación</p>}
      {ATTRS.map(([k, l, full]) => (
        <label class="slider" title={full}>
          <b>{l}</b>
          <input type="range" min={1} max={99} value={stats[k]}
            onInput={e => setStats({ ...stats, [k]: +(e.target as HTMLInputElement).value })} />
          <output>{stats[k]}</output>
        </label>
      ))}
      <div class="row" style="margin-top:12px">
        <button class="btn" disabled={idx === 0} onClick={() => move(idx - 1)} aria-label="Anterior">‹</button>
        <span class="muted" style="flex:1;text-align:center">{idx + 1} / {others.length}</span>
        <button class="btn" disabled={idx === others.length - 1} onClick={() => move(idx + 1)} aria-label="Siguiente">›</button>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn" style="flex:1" disabled={busy} onClick={() => save(false)}>Guardar</button>
        <button class="btn primary" style="flex:1" disabled={busy} onClick={() => save(true)}>
          {idx < others.length - 1 ? 'Guardar y seguir' : 'Guardar y terminar'}
        </button>
      </div>
      {err && <p class="err">{err}</p>}
    </div>
  );
}
