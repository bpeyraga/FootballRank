import { useEffect, useState } from 'preact/hooks';
import { displayName, sb, type Profile } from '../../shared/supabase';
import { Avatar } from '../../shared/ui/Avatar';

/** Total de cervezas de un jugador en la comunidad (para el perfil). */
export async function loadBeerTotal(communityId: string, pid: string): Promise<number> {
  const { data, error } = await sb.from('match_beers').select('beers').eq('community_id', communityId).eq('profile_id', pid);
  if (error) throw error;
  return (data ?? []).reduce((t, r) => t + r.beers, 0);
}

/** Tercer tiempo: cuántas cervezas tomó cada uno. Cualquier miembro carga las de cualquiera. */
export function Beers({ matchId, players, meId }: { matchId: string; players: Profile[]; meId: string }) {
  const [count, setCount] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [order, setOrder] = useState<string[] | null>(null);

  const load = async () => {
    const { data, error } = await sb.from('match_beers').select('profile_id,beers').eq('match_id', matchId);
    if (error) return setErr(error.message);
    const c = Object.fromEntries((data ?? []).map(r => [r.profile_id, r.beers as number]));
    setCount(c);
    // El orden se fija una sola vez (vos primero, después los que más tomaron) para que las filas no salten al tocar.
    setOrder(o => o ?? [...players].sort((a, b) =>
      Number(b.id === meId) - Number(a.id === meId) || (c[b.id] ?? 0) - (c[a.id] ?? 0) || displayName(a).localeCompare(displayName(b)))
      .map(p => p.id));
  };
  useEffect(() => { load(); }, [matchId]);

  if (!players.length) return null;
  const c = count ?? {};
  const total = Object.values(c).reduce((t, n) => t + n, 0);
  const top = Math.max(0, ...Object.values(c));

  const step = async (pid: string, d: number) => {
    const next = Math.max(0, Math.min(99, (c[pid] ?? 0) + d));
    if (next === (c[pid] ?? 0)) return;
    setBusy(pid); setErr('');
    setCount({ ...c, [pid]: next }); // optimista
    const { error } = await sb.rpc('set_beers', { p_match: matchId, p_profile: pid, p_beers: next });
    setBusy(null);
    if (error) { setErr('No se pudo guardar. Probá de nuevo.'); load(); }
  };

  const sorted = [
    ...(order ?? []).map(id => players.find(p => p.id === id)).filter((p): p is Profile => !!p),
    ...players.filter(p => !(order ?? []).includes(p.id)),
  ];

  return (
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:4px">
        <h3>Tercer tiempo 🍺</h3>
        <span class="beer-total" aria-label={`${total} cervezas en total`}>{total} 🍺</span>
      </div>
      <p class="muted" style="margin-bottom:6px;font-size:.85rem">¿Cuántas se tomó cada uno? Cualquiera puede cargarlas.</p>
      {sorted.map(p => {
        const n = c[p.id] ?? 0;
        return (
          <div class="row rank-row">
            <Avatar p={p} size={32} />
            <span class="ellipsis" style="flex:1">
              {displayName(p)}{p.id === meId && <span class="muted"> (vos)</span>}
              {n > 0 && n === top && total > 0 && <span class="pill" title="El que más tomó">🏆 Barril</span>}
            </span>
            <button class="btn sm" disabled={busy === p.id || n === 0} onClick={() => step(p.id, -1)} aria-label={`Una menos para ${displayName(p)}`}>−</button>
            <b class="beer-n">{n}</b>
            <button class="btn sm" disabled={busy === p.id || n >= 99} onClick={() => step(p.id, 1)} aria-label={`Una más para ${displayName(p)}`}>+</button>
          </div>
        );
      })}
      {err && <p class="err">{err}</p>}
    </div>
  );
}
