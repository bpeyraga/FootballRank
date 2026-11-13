import { useMemo, useState } from 'preact/hooks';
import { formationLabel, formationsFor, lineup, pickFormation, slotsFor, swapSlots, type Placed } from './formation';
import { Pitch, pitchOvr, type PitchPlayer } from './Pitch';
import { ShirtPicker } from './Shirt';

/**
 * La cancha de un equipo con todos sus jugadores. Un admin puede tocar "Cambiar formación": elige otra formación
 * y toca dos jugadores para cambiarlos de lugar. Al guardar queda para todos.
 */
export function TeamLineup({ title, players, saved, formation, captainId, canEdit, busy, onSave, shirt, otherShirt, onShirt }: {
  /** "Equipo A": va en el encabezado, con la camiseta y el OVR en cancha (el de cada uno en su puesto). */
  title: string;
  /** Color de camiseta de este equipo y del otro (para avisar si chocan). Con `onShirt` (admins) se puede cambiar. */
  shirt?: string | null; otherShirt?: string | null;
  onShirt?: (key: string | null) => Promise<boolean>;
  players: PitchPlayer[];
  /** Puesto guardado de cada jugador (id → puesto). */
  saved: ReadonlyMap<string, number | null>;
  /** Formación guardada (null = la de siempre). */
  formation: string | null | undefined;
  captainId?: string | null; canEdit: boolean; busy: boolean;
  onSave: (formation: string | null, slots: Record<string, number>) => Promise<boolean>;
}) {
  const n = players.length;
  const ids = players.map(p => p.id).sort().join(',');
  const [edit, setEdit] = useState<{ ids: string; f: string; order: (string | null)[] } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const byId = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);

  const f = pickFormation(formation, n);
  const shown = useMemo(() => lineup(players, slotsFor(f), saved), [players, f, saved]);
  // Si mientras se editaba cambió quién juega (alguien se bajó o lo cambiaron de equipo), la edición se descarta.
  const editing = edit && edit.ids === ids ? edit : null;

  const head = (o: number | null) => (
    <div class="team-head">
      <h3>{title}</h3>
      <ShirtPicker team={title} shirt={shirt} other={otherShirt} busy={busy} onSave={onShirt} />
      <span class="muted team-ovr" title="Promedio del OVR de cada uno en el puesto donde juega">OVR en cancha {o ?? '—'}</span>
    </div>
  );
  if (!n) return head(null);

  const start = () => { setEdit({ ids, f, order: shown.placed.map(s => s.p?.id ?? null) }); setSel(null); };
  const cancel = () => { setEdit(null); setSel(null); };
  const pick = (i: number) => {
    if (!editing) return;
    if (sel == null) return setSel(i);
    if (sel !== i) setEdit({ ...editing, order: swapSlots(editing.order, sel, i) });
    setSel(null);
  };
  const auto = () => {
    if (!editing) return;
    setEdit({ ...editing, order: lineup(players, slotsFor(editing.f)).placed.map(s => s.p?.id ?? null) });
    setSel(null);
  };
  const save = async () => {
    if (!editing) return;
    const slots: Record<string, number> = {};
    editing.order.forEach((id, i) => { if (id) slots[id] = i; });
    if (await onSave(editing.f || null, slots)) cancel();
  };

  const placed: Placed<PitchPlayer>[] = editing
    ? slotsFor(editing.f).map((slot, i) => ({ slot, p: byId.get(editing.order[i] ?? '') ?? null }))
    : shown.placed;
  const options = formationsFor(n);
  const selName = editing && sel != null ? placed[sel]?.p?.profile : null;

  return (
    <>
    {head(pitchOvr(placed))}
    <div style="margin:10px 0 6px">
      {editing && (
        <>
          {options.length > 1 && (
            <div class="fm-chips" role="group" aria-label="Formación (defensa – medio – ataque, sin el arquero)">
              {options.map(o => (
                <button type="button" class={editing.f === o ? 'on' : ''} aria-pressed={editing.f === o}
                  onClick={() => { setEdit({ ...editing, f: o }); setSel(null); }}>{formationLabel(o)}</button>
              ))}
            </div>
          )}
          <p class="muted fm-hint" aria-live="polite">
            {selName ? `Elegiste a ${selName.nickname?.trim() || selName.name}: tocá a otro para cambiarlos de lugar.`
              : 'Tocá un jugador y después otro para cambiarlos de lugar.'}
          </p>
        </>
      )}
      <Pitch placed={placed} captainId={captainId} onPick={editing ? pick : undefined} selected={editing ? sel : null} />
      {!editing && shown.bench.length > 0 && (
        <p class="muted pitch-bench">Sin lugar: {shown.bench.map(b => b.profile.nickname?.trim() || b.profile.name).join(', ')}</p>
      )}
      {canEdit && !editing && (
        <div class="row" style="margin-top:10px;justify-content:space-between;flex-wrap:wrap">
          <span class="muted" style="font-size:.85rem">Formación {formationLabel(f)}</span>
          <button type="button" class="btn sm" disabled={busy} onClick={start}>Cambiar formación</button>
        </div>
      )}
      {editing && (
        <div class="row" style="margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn primary" style="flex:1" disabled={busy} onClick={save}>Guardar formación</button>
          <button type="button" class="btn" disabled={busy} onClick={auto}>Ordenar solo</button>
          <button type="button" class="btn" disabled={busy} onClick={cancel}>Cancelar</button>
        </div>
      )}
    </div>
    </>
  );
}
