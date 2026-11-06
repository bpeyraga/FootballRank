import { useEffect, useState } from 'preact/hooks';
import { Tip } from '../lib/Tip';
import { ATTRS, displayName, ovr, posLine, sb, type Stats } from '../lib/supabase';
import { Radar } from '../lib/Radar';
import { Avatar } from '../lib/Avatar';
import type { Ranked } from '../lib/ranking';
import { go } from '../lib/router';
import { aggregateCustom, loadCustom, radarHouse, type HouseStat } from '../lib/customStats';

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
  // Stats de la casa del jugador actual; solo se guardan las que tocaste.
  const [house, setHouse] = useState<HouseStat[]>([]);
  const [hv, setHv] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!cur) return;
    let alive = true;
    setHouse([]); setHv({}); setTouched(new Set());
    loadCustom(communityId, cur.profile.id).then(list => {
      if (!alive) return;
      const h = aggregateCustom(list, cur.profile.id, meId);
      setHouse(h);
      setHv(Object.fromEntries(h.map(x => [x.key, x.mine ?? x.avg ?? x.own ?? 50])));
    }).catch(() => {});
    return () => { alive = false; };
  }, [cur?.profile.id]);

  if (!cur) return <div class="card"><p class="muted">Todavía no hay compañeros para votar. ¡Compartí el link!</p></div>;

  const move = (i: number) => { setIdx(i); setStats(init(others[i])); setErr(''); };
  const save = async (next: boolean) => {
    setBusy(true); setErr('');
    let { error } = await sb.from('stat_votes').upsert({
      community_id: communityId, voter_id: meId, target_id: cur.profile.id, ...stats,
      updated_at: new Date().toISOString(),
    });
    const changed = house.filter(h => touched.has(h.key));
    if (!error && changed.length) {
      ({ error } = await sb.from('custom_stats').upsert(
        changed.map(h => ({ community_id: communityId, target_id: cur.profile.id, created_by: meId, label: h.label, value: hv[h.key], hidden: false })),
        { onConflict: 'community_id,target_id,created_by,label' }));
    }
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
      <Radar stats={stats} compare={cur.base} extra={radarHouse(house).map(h => ({ label: h.label, code: h.code, value: hv[h.key] ?? 50, compare: h.own }))} />
      {cur.base && <p class="muted legend"><i class="sw a" /> tu voto <i class="sw b" /> su autoevaluación</p>}
      {ATTRS.map(([k, l, full]) => (
        <label class="slider" title={full}>
          <b>{l}</b>
          <input type="range" min={1} max={99} value={stats[k]}
            onInput={e => setStats({ ...stats, [k]: +(e.target as HTMLInputElement).value })} />
          <output>{stats[k]}</output>
        </label>
      ))}
      {house.length > 0 && <>
        <p class="muted house-title">De la casa</p>
        {house.map(h => (
          <label class="slider wide" title={h.avg != null ? `Promedio ${h.avg} (${h.n} ${h.n === 1 ? 'voto' : 'votos'})` : undefined}>
            <b class="ellipsis house-label">{h.label}</b>
            <input type="range" min={1} max={99} value={hv[h.key] ?? 50}
              onInput={e => { setHv({ ...hv, [h.key]: +(e.target as HTMLInputElement).value }); setTouched(new Set(touched).add(h.key)); }} />
            <output class={touched.has(h.key) || h.mine != null ? '' : 'muted'}>{hv[h.key] ?? 50}</output>
          </label>
        ))}
        <p class="muted" style="font-size:.8rem">Solo se guardan las que muevas.</p>
      </>}
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
      <Tip kind="fairplay" />
    </div>
  );
}
