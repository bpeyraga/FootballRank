import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Avatar } from '../../shared/ui/Avatar';
import { displayName } from '../../shared/model';
import { tally, votesLabel, type Poll } from './polls';

type Who = { name: string; photo_url: string | null; nickname?: string | null };

const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

/** Encuesta dentro de la burbuja del chat: opciones tocables con barra, avatares de quienes votaron y "Ver votos". */
export function PollCard({ poll, byProfile, meId, who, onVote, meta }: {
  poll: Poll;
  /** perfil → opciones elegidas */
  byProfile: Record<string, number[]> | undefined;
  meId: string;
  who: (id: string) => Who;
  onVote: (poll: Poll, option: number) => void;
  /** Hora (y tilde) del mensaje: va en el pie de la tarjeta. */
  meta?: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const t = tally(poll, byProfile);
  const mine = byProfile?.[meId] ?? [];
  const stop = (e: Event) => e.stopPropagation();

  return (
    <div class={`poll${poll.multi ? ' multi' : ''}`}>
      <p class="poll-q">{poll.question}</p>
      <p class="poll-hint">{poll.multi ? 'Podés elegir varias respuestas' : 'Elegí una respuesta'}</p>
      <div class="poll-opts" role={poll.multi ? 'group' : 'radiogroup'} aria-label={poll.question}>
        {poll.options.map((label, i) => {
          const on = mine.includes(i);
          const voters = t.by[i];
          return (
            <button type="button" class={`poll-opt${on ? ' on' : ''}`} role={poll.multi ? 'checkbox' : 'radio'} aria-checked={on}
              aria-label={`${label}: ${votesLabel(t.counts[i])}${on ? ', tu voto' : ''}`}
              onClick={e => { stop(e); onVote(poll, i); }}>
              <span class="poll-mark" aria-hidden="true"><Tick /></span>
              <span class="poll-label">{label}</span>
              <span class="poll-side" aria-hidden="true">
                {voters.length > 0 && (
                  <span class="poll-av">{voters.slice(0, 3).map(id => <Avatar p={who(id)} size={20} zoom={false} />)}</span>
                )}
                <span class="poll-n">{t.counts[i]}</span>
              </span>
              <span class="poll-bar" aria-hidden="true"><i style={`width:${t.pct[i]}%`} /></span>
            </button>
          );
        })}
      </div>

      <div class="poll-foot">
        <span class="poll-foot-l">
          <span class="poll-total">{t.voters ? votesLabel(t.voters) : 'Sin votos todavía'}</span>
          {t.voters > 0 && (
            <button type="button" class="linkbtn" aria-expanded={open} onClick={e => { stop(e); setOpen(o => !o); }}>
              {open ? 'Ocultar votos' : 'Ver votos'}
            </button>
          )}
        </span>
        {meta}
      </div>

      {open && t.voters > 0 && (
        <div class="poll-voters" onClick={stop}>
          {poll.options.map((label, i) => t.by[i].length > 0 && (
            <div class="pv-group">
              <p class="pv-h"><span>{label}</span><span>{t.counts[i]}</span></p>
              <ul class="pv-list">
                {t.by[i].map(id => (
                  <li>
                    <Avatar p={who(id)} size={20} />
                    <span class="ellipsis">{id === meId ? 'Vos' : displayName(who(id))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
