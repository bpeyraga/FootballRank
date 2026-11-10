import { Avatar } from '../../shared/ui/Avatar';
import './quickmatch.css';

export interface PickMember {
  id: string; name: string; sub?: string;
  profile: { name: string; photo_url: string | null; nickname?: string | null };
  blocked?: string; // motivo por el que no se puede elegir (p. ej. "suspendido")
}

/** Lista de miembros con casillas para anotar a varios de una: "Seleccionar todos" y un solo botón "Anotar (n)". */
export function MemberChecklist({ members, picked, onChange, busy, onSubmit }: {
  members: PickMember[]; picked: string[]; onChange: (ids: string[]) => void; busy: boolean; onSubmit: () => void;
}) {
  const open = members.filter(m => !m.blocked);
  const all = open.length > 0 && open.every(m => picked.includes(m.id));
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]);
  return (
    <div class="qm-picklist">
      <div class="qm-pick-head">
        <b>Anotar jugadores</b>
        {open.length > 0 && (
          <button type="button" class="linkbtn" onClick={() => onChange(all ? [] : open.map(m => m.id))}>
            {all ? 'Quitar selección' : 'Seleccionar todos'}
          </button>
        )}
      </div>
      {members.map(m => (
        <label class={`qm-pick ${m.blocked ? 'off' : ''}`}>
          <input type="checkbox" checked={picked.includes(m.id)} disabled={!!m.blocked || busy} onChange={() => toggle(m.id)} />
          <Avatar p={m.profile} size={32} />
          <span class="ellipsis qm-pick-name">{m.name}{m.blocked && <span class="muted"> ({m.blocked})</span>}</span>
          {m.sub && <span class="muted qm-pick-sub">{m.sub}</span>}
        </label>
      ))}
      <button type="button" class="btn primary block" style="margin-top:10px" disabled={busy || !picked.length} onClick={onSubmit}>
        {busy ? 'Anotando…' : `Anotar (${picked.length})`}
      </button>
    </div>
  );
}
