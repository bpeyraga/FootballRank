import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sb } from './supabase';
import type { Pos } from './model';
import { Sheet } from './Sheet';
import { PlayerFields, PosChips } from './PlayerForm';
import {
  addPlayerParams, dropLine, emptyPlayer, nextPos, nPlayers, norm, parseBulk, playerError, selectToSave, validatePlayer,
  BULK_MAX, type BulkRow, type PlayerDraft,
} from './players';

const SKIP_LABEL: Record<string, string> = { dup_list: 'Repetido', dup_member: 'Ya está', long: 'Muy largo' };
const SKIP_TITLE: Record<string, string> = {
  dup_list: 'Ya está más arriba en la lista', dup_member: 'Ya hay alguien con ese nombre en el grupo', long: 'El nombre puede tener hasta 40 letras',
};
const PLACEHOLDER = 'Juan Pérez - DEL\nMarcos\nEl Chino (ARQ)\n…';

/**
 * "Varios": una lista pegada (un nombre por línea, con " - DEL" opcional) con vista previa antes de guardar.
 * Sirve en la hoja de "Agregar jugadores" y en el primer paso del asistente.
 */
export function BulkAdd({ communityId, existing, onAdded, onPending, autoFocus }: {
  communityId: string;
  /** Nombres que ya están en el grupo (para avisar de repetidos). */
  existing: string[];
  onAdded: (n: number) => void;
  /** Cuántos nombres válidos hay escritos y sin guardar (el asistente avisa si se va sin agregarlos). */
  onPending?: (n: number) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [defPos, setDefPos] = useState<Pos>('MED');
  const [overrides, setOverrides] = useState<Map<string, Pos>>(new Map());
  const [forced, setForced] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);

  const rows = useMemo(() => parseBulk(text, defPos, existing, overrides), [text, defPos, existing, overrides]);
  const pick = selectToSave(rows, forced);
  const n = pick.players.length;
  useEffect(() => { onPending?.(n); }, [n]);
  useEffect(() => { if (autoFocus) ta.current?.focus(); }, []);

  const cyclePos = (r: BulkRow) => setOverrides(new Map(overrides).set(norm(r.name), nextPos(r.pos)));
  const toggleForce = (r: BulkRow) => {
    const k = norm(r.name), f = new Set(forced);
    if (!f.delete(k)) f.add(k);
    setForced(f);
  };

  const save = async () => {
    if (!n || pick.over || busy) return;
    setBusy(true); setErr(''); setOk('');
    const { data, error } = await sb.rpc('add_players', { p_community: communityId, p_players: pick.players });
    setBusy(false);
    if (error) return setErr(playerError(error.message));
    const added = typeof data === 'number' ? data : n;
    setText(''); setOverrides(new Map()); setForced(new Set());
    setOk(`Listo: sumaste ${nPlayers(added)}.`);
    onAdded(added);
  };

  return (
    <>
      <label class="field"><span>Lista de jugadores</span>
        <textarea ref={ta} class="pl-ta" rows={6} value={text} placeholder={PLACEHOLDER} spellcheck={false} autocapitalize="words" disabled={busy}
          onInput={e => { setText((e.target as HTMLTextAreaElement).value); setOk(''); }} />
      </label>
      <p class="muted pl-hint">Un nombre por línea (podés pegar la lista del grupo). Para marcar la posición escribí «Juan - DEL»; si no, usan la de abajo.</p>
      <PosChips label="Posición por defecto" value={defPos} onChange={setDefPos} disabled={busy} />

      {rows.length > 0 && (
        <div class="bulk-prev" aria-live="polite">
          <p class="bulk-head"><b>{nPlayers(n)}</b> para agregar{pick.skipped > 0 && <span class="muted"> · {pick.skipped} sin agregar</span>}</p>
          <div class="bulk-list">
            {rows.map(r => {
              const skip = r.status !== 'ok';
              const on = skip && forced.has(norm(r.name));
              return (
                <div class={`bulk-row ${skip && !on ? 'skip' : ''}`}>
                  <button type="button" class="bulk-pos" disabled={busy} onClick={() => cyclePos(r)}
                    aria-label={`Posición de ${r.name}: ${r.pos}. Tocá para cambiarla`}>{r.pos}</button>
                  <span class="bulk-name ellipsis">{r.name}</span>
                  <button type="button" class="icon-btn" aria-label={`Sacar a ${r.name} de la lista`} disabled={busy}
                    onClick={() => setText(dropLine(text, r.line))}>✕</button>
                  {skip && (
                    <div class="bulk-sub">
                      <span class="pill warn" title={SKIP_TITLE[r.status]}>{SKIP_LABEL[r.status]}</span>
                      {r.status !== 'long' && (
                        <button type="button" class="linkbtn" disabled={busy} onClick={() => toggleForce(r)}>{on ? 'No agregar' : 'Agregar igual'}</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p class="muted pl-hint">Tocá la posición de una fila para cambiarla.</p>
        </div>
      )}

      {/* En la hoja, el botón queda fijo abajo mientras se recorre una lista larga */}
      <div class="pl-foot">
        {pick.over > 0 && <p class="err" role="alert">Podés cargar hasta {BULK_MAX} por vez: sobran {pick.over}. Agregá estos y después seguí con el resto.</p>}
        {err && <p class="err" role="alert">{err}</p>}
        {ok && <p class="pl-ok" role="status">{ok}</p>}
        <button type="button" class="btn primary block" disabled={!n || pick.over > 0 || busy} onClick={save}>
          {busy ? 'Agregando…' : n ? `Agregar ${nPlayers(n)}` : 'Agregar jugadores'}
        </button>
      </div>
    </>
  );
}

/** Hoja "➕ Agregar jugadores": un jugador con todos sus datos ("Uno") o la lista del grupo ("Varios"). */
export function AddPlayersSheet({ communityId, existing, start = 'uno', onClose, onAdded }: {
  communityId: string; existing: string[]; start?: 'uno' | 'varios';
  onClose: () => void; onAdded: (n: number) => void;
}) {
  const [mode, setMode] = useState<'uno' | 'varios'>(start);
  const [draft, setDraft] = useState<PlayerDraft>(emptyPlayer());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const nameIn = useRef<HTMLInputElement>(null);
  const check = validatePlayer(draft);
  useEffect(() => { if (mode === 'uno') nameIn.current?.focus(); }, [mode]);

  const add = async (e: Event) => {
    e.preventDefault();
    if (!check.ok || busy) return;
    const v = check.value;
    if (existing.some(x => norm(x) === norm(v.name)) && !confirm(`Ya hay alguien que se llama "${v.name}" en el grupo. ¿Agregar otro igual?`)) return;
    setBusy(true); setErr(''); setOk('');
    const { error } = await sb.rpc('add_player', addPlayerParams(communityId, v));
    setBusy(false);
    if (error) return setErr(playerError(error.message));
    setOk(`✓ ${v.name} agregado. Podés cargar otro.`);
    setDraft(emptyPlayer(draft.pos));   // misma posición: suele cargarse de a varios del mismo puesto
    onAdded(1);
    nameIn.current?.focus();
  };

  return (
    <Sheet title="➕ Agregar jugadores" onClose={onClose} busy={busy}>
      <div class="pl-chips two" role="group" aria-label="Cómo cargar" style="margin-bottom:14px">
        <button type="button" class={mode === 'uno' ? 'on' : ''} aria-pressed={mode === 'uno'} onClick={() => setMode('uno')}>Uno</button>
        <button type="button" class={mode === 'varios' ? 'on' : ''} aria-pressed={mode === 'varios'} onClick={() => setMode('varios')}>Varios</button>
      </div>
      {mode === 'uno'
        ? (
          <form onSubmit={add}>
            <PlayerFields draft={draft} onChange={d => { setDraft(d); setOk(''); }} nameRef={nameIn} disabled={busy} />
            {!check.ok && check.hint && <p class="err" role="alert">{check.hint}</p>}
            {err && <p class="err" role="alert">{err}</p>}
            {ok && <p class="pl-ok" role="status">{ok}</p>}
            <button class="btn primary block" type="submit" disabled={!check.ok || busy}>{busy ? 'Agregando…' : 'Agregar'}</button>
            <button class="btn block" type="button" style="margin-top:8px" disabled={busy} onClick={onClose}>Listo</button>
          </form>
        )
        : <>
            <BulkAdd communityId={communityId} existing={existing} autoFocus onAdded={onAdded} />
            <button class="btn block" type="button" style="margin-top:8px" onClick={onClose}>Cerrar</button>
          </>}
    </Sheet>
  );
}
