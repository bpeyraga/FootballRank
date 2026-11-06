import { useId } from 'preact/hooks';
import { ATTRS, POS, ovr, type Pos, type Stats } from './model';
import { TEAMS_ASCENSO, TEAMS_PRIMERA } from './teams';
import { Crest } from './Crest';
import { NAME_MAX, NICK_MAX, type PlayerDraft } from './players';

/** Posición: cuatro botones grandes (ARQ / DEF / MED / DEL). */
export function PosChips({ value, onChange, label = 'Posición', disabled }: {
  value: Pos; onChange: (p: Pos) => void; label?: string; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div class="field">
      <span id={id}>{label}</span>
      <div class="pl-chips" role="group" aria-labelledby={id}>
        {POS.map(p => (
          <button type="button" class={value === p ? 'on' : ''} aria-pressed={value === p} disabled={disabled} onClick={() => onChange(p)}>{p}</button>
        ))}
      </div>
    </div>
  );
}

/** Equipo del que es hincha (la misma lista y el mismo selector que "Editar perfil"). */
export function TeamSelect({ value, onChange, label = 'Club (opcional)' }: { value: string; onChange: (t: string) => void; label?: string }) {
  return (
    <label class="field"><span>{label}</span>
      <div class="row" style="gap:10px">
        {value && <Crest team={value} size={20} />}
        <select style="flex:1;min-width:0" value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
          <option value="">— Ninguno —</option>
          {value && !TEAMS_PRIMERA.includes(value) && !TEAMS_ASCENSO.includes(value) && <option value={value}>{value}</option>}
          <optgroup label="Primera División">{TEAMS_PRIMERA.map(t => <option value={t}>{t}</option>)}</optgroup>
          <optgroup label="Ascenso">{TEAMS_ASCENSO.map(t => <option value={t}>{t}</option>)}</optgroup>
        </select>
      </div>
    </label>
  );
}

/** Nombre, posición, apodo, número y club de un jugador. */
export function PlayerFields({ draft, onChange, nameRef, disabled }: {
  draft: PlayerDraft; onChange: (d: PlayerDraft) => void; nameRef?: { current: HTMLInputElement | null }; disabled?: boolean;
}) {
  const set = (k: keyof PlayerDraft) => (e: Event) => onChange({ ...draft, [k]: (e.target as HTMLInputElement).value });
  return (
    <>
      <label class="field"><span>Nombre</span>
        <input ref={nameRef} value={draft.name} maxLength={NAME_MAX} placeholder="Juan Pérez" autocomplete="off" disabled={disabled} onInput={set('name')} />
      </label>
      <PosChips value={draft.pos} onChange={pos => onChange({ ...draft, pos })} disabled={disabled} />
      <div class="pl-two">
        <label class="field"><span>Apodo (opcional)</span>
          <input value={draft.nickname} maxLength={NICK_MAX} placeholder="El Chino" autocomplete="off" disabled={disabled} onInput={set('nickname')} />
        </label>
        <label class="field"><span>Número</span>
          <input type="number" inputMode="numeric" min={1} max={99} value={draft.shirt} placeholder="10" disabled={disabled} onInput={set('shirt')} />
        </label>
      </div>
      <TeamSelect value={draft.team} onChange={team => onChange({ ...draft, team })} />
    </>
  );
}

/** Los seis atributos de 1 a 99 (como en "Tus stats" del perfil). */
export function StatsSliders({ stats, onChange }: { stats: Stats; onChange: (s: Stats) => void }) {
  return (
    <div>
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3>Stats iniciales</h3><h3>OVR {ovr(stats)}</h3>
      </div>
      {ATTRS.map(([k, l, full]) => (
        <label class="slider" title={full}>
          <b>{l}</b>
          <input type="range" min={1} max={99} value={stats[k]} aria-label={full}
            onInput={e => onChange({ ...stats, [k]: +(e.target as HTMLInputElement).value })} />
          <output>{stats[k]}</output>
        </label>
      ))}
    </div>
  );
}
