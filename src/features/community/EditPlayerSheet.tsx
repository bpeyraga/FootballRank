import { useState } from 'preact/hooks';
import type { Profile, Stats } from '../../shared/model';
import { Sheet } from '../../shared/ui/Sheet';
import { PlayerFields, StatsSliders } from './PlayerForm';
import { draftOf, playerError, validatePlayer, type PlayerDraft } from './players';
import { setPlayerStats, updatePlayer } from './api';

const NEUTRAL: Stats = { rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 };

/** Hoja para editar a un jugador sin cuenta (nombre, posición, apodo, número, club y stats). Los que tienen cuenta se editan solos. */
export function EditPlayerSheet({ communityId, profile, base, onClose, onSaved }: {
  communityId: string; profile: Profile; base: Stats | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<PlayerDraft>(() => draftOf(profile));
  const [withStats, setWithStats] = useState(!!base);
  const [stats, setStats] = useState<Stats>(base ?? NEUTRAL);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const check = validatePlayer(draft);

  const save = async (e: Event) => {
    e.preventDefault();
    if (!check.ok || busy) return;
    setBusy(true); setErr('');
    let step: 'datos' | 'stats' = 'datos';
    try {
      await updatePlayer(profile.id, communityId, check.value);
      step = 'stats';
      if (withStats) await setPlayerStats(profile.id, communityId, stats);
    } catch (e: any) {
      setBusy(false);
      // Si los datos se guardaron pero las stats no, igual refrescamos la lista (el nombre ya cambió)
      if (step === 'stats') onSaved();
      return setErr(playerError(e?.message ?? ''));
    }
    setBusy(false);
    onSaved();
    onClose();
  };

  return (
    <Sheet title="Editar jugador" onClose={onClose} busy={busy}>
      <p class="muted" style="margin:-4px 0 12px;font-size:.9rem">Todavía no tiene cuenta: lo editás vos. Cuando entre y reclame su perfil, lo maneja él.</p>
      <form onSubmit={save}>
        <PlayerFields draft={draft} onChange={setDraft} disabled={busy} />
        {withStats
          ? <div class="pl-stats"><StatsSliders stats={stats} pos={draft.pos} onChange={setStats} /></div>
          : <button type="button" class="btn block" style="margin-bottom:12px" onClick={() => setWithStats(true)}>Cargar stats iniciales</button>}
        {!check.ok && check.hint && <p class="err" role="alert">{check.hint}</p>}
        {err && <p class="err" role="alert">{err}</p>}
        <button class="btn primary block" type="submit" disabled={!check.ok || busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button class="btn block" type="button" style="margin-top:8px" disabled={busy} onClick={onClose}>Cancelar</button>
      </form>
    </Sheet>
  );
}
