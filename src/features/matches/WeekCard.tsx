import { useEffect, useMemo, useState } from 'preact/hooks';
import { displayName, type Profile } from '../../shared/model';
import { loadWeekExtras } from './api';
import type { MatchListItem } from './model';
import { weekParts, weekSummary, WEEK_DAYS, type WeekEvent, type WeekVote } from './weeklyCore';

type Who = Pick<Profile, 'id' | 'name' | 'nickname' | 'photo_url'>;

/** "📊 Resumen de la semana": partidos jugados en los últimos 7 días, goleador, asistidor y figura (lo mismo que el aviso del lunes). */
export function WeekCard({ list, whoIs }: { list: MatchListItem[]; whoIs: (pid: string) => Who | undefined }) {
  const week = useMemo(() => {
    const from = Date.now() - WEEK_DAYS * 86_400_000;
    return list.filter(m => m.status === 'played' && Date.parse(m.starts_at) >= from && Date.parse(m.starts_at) <= Date.now())
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [list]);
  const key = week.map(m => m.id).join();
  const [extra, setExtra] = useState<{ key: string; events: WeekEvent[]; votes: WeekVote[] } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    // Los goles y la figura son un extra: si falla la consulta, queda el resumen con partidos y resultados.
    loadWeekExtras(key.split(',')).then(x => { if (live) setExtra({ key, ...x }); }, () => { if (live) setExtra({ key, events: [], votes: [] }); });
    return () => { live = false; };
  }, [key]);

  if (!week.length) return null;
  const s = extra?.key === key ? weekSummary(week, extra.events, extra.votes) : weekSummary(week, [], []);
  const parts = weekParts(s, id => { const w = whoIs(id); return w ? displayName(w) : 'Alguien'; });
  return (
    <div class="card week-card">
      <h3>📊 Resumen de la semana</h3>
      {parts.map(p => <div class="week-line">{p}</div>)}
      <p class="muted week-help">Los lunes a la mañana te lo mandamos al celular (si tenés los avisos activados).</p>
    </div>
  );
}
