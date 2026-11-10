import { useEffect, useRef } from 'preact/hooks';
import { ALL, seasonOptions, seasonSpan, type Season } from './model';

/**
 * Selector de temporada del ranking: "Temporada actual" (si hay una abierta), "Histórico" y las cerradas por nombre.
 * Debajo, el nombre y las fechas de la elegida. No dibuja nada si la comunidad todavía no tiene temporadas.
 */
export function SeasonPicker({ seasons, value, onPick }: { seasons: Season[]; value: string; onPick: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // En el celular las opciones se deslizan: la elegida queda a la vista
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [value]);
  if (!seasons.length) return null;
  const cur = value === ALL ? null : seasons.find(s => s.id === value) ?? null;
  return (
    <div class="sn-pick">
      <div class="sn-chips" role="group" aria-label="Temporada" ref={ref}>
        {seasonOptions(seasons).map(o => (
          <button type="button" class={value === o.key ? 'on' : ''} aria-pressed={value === o.key} onClick={() => onPick(o.key)}>{o.label}</button>
        ))}
      </div>
      {cur && <p class="sn-info"><b>{cur.name}</b> · {seasonSpan(cur)}</p>}
    </div>
  );
}
