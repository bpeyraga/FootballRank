import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { go } from '../lib/router';
import type { Ranked } from '../lib/ranking';
import { displayName } from '../lib/model';
import { BulkAdd } from '../lib/AddPlayers';
import { VenuesManager } from '../lib/VenuesManager';
import {
  LAST_STEP, SETUP_STEPS, nPlayers, nextAction, setupDonePath, setupPath, stepDots,
} from '../lib/players';

const COPY = [
  'Pegá la lista del grupo de WhatsApp: un nombre por línea. Todavía no necesitan tener la app: cuando entren, reclaman su ficha.',
  'Guardá dónde jugan para elegirla con un toque al armar cada partido. Pegá el link de Google Maps y se completa solo.',
  'Mandales el link por WhatsApp. Al entrar ven los partidos, votan y pueden reclamar el jugador que cargaste con su nombre.',
];

/**
 * Asistente de armado del grupo (#/c/<slug>/setup/<paso>), pensado para recién creada la comunidad:
 * 1) jugadores en lote, 2) canchas, 3) link de invitación. Cada paso se puede saltear. Solo para admins.
 * `invite` es la tarjeta de invitar de la comunidad (la arma Community para compartir la misma lógica).
 */
export function Setup({ slug, communityId, communityName, step, rows, meId, isAdmin, reload, invite }: {
  slug: string; communityId: string; communityName: string; step: number; rows: Ranked[]; meId: string; isAdmin: boolean;
  reload: () => void | Promise<void>; invite: ComponentChildren;
}) {
  const [pending, setPending] = useState(0);        // nombres escritos y sin agregar (paso 1)
  const [venueCount, setVenueCount] = useState(0);
  useEffect(() => { if (!isAdmin) go(`c/${slug}`); }, [isAdmin, slug]);
  useEffect(() => { scrollTo({ top: 0 }); }, [step]);
  if (!isAdmin) return null;

  const loaded = rows.filter(r => !r.profile.user_id);   // jugadores cargados a mano
  const existing = rows.flatMap(r => [r.profile.name, r.profile.nickname ?? '']).filter(Boolean);
  const added = step === 0 ? loaded.length : step === 1 ? venueCount : 0;
  const act = nextAction(step, added);
  const dots = stepDots(step);

  const next = () => {
    if (step === 0 && pending > 0 && !confirm(`Escribiste ${pending} ${pending === 1 ? 'nombre' : 'nombres'} que todavía no agregaste. ¿Seguir sin agregarlos?`)) return;
    go(act.last ? setupDonePath(slug) : setupPath(slug, step + 1));
  };

  return (
    <div class="setup">
      <div class="setup-top">
        <span class="kicker ellipsis">{communityName}</span>
        <a class="muted setup-exit" href={`#/c/${slug}`}>Salir</a>
      </div>
      <h2>Armá tu grupo</h2>
      <ol class="setup-dots" aria-label="Progreso">
        {SETUP_STEPS.map((s, i) => (
          <li class={dots[i]}>
            <a href={`#/${setupPath(slug, i)}`} aria-current={i === step ? 'step' : undefined}>
              <i aria-hidden="true">{dots[i] === 'done' ? '✓' : i + 1}</i>
              <span>{s.label}</span>
            </a>
          </li>
        ))}
      </ol>

      <div class="card setup-card">
        <p class="setup-count muted">Paso {step + 1} de {SETUP_STEPS.length}</p>
        <h3>{SETUP_STEPS[step].title}</h3>
        <p class="muted setup-copy">{COPY[step]}</p>

        {step === 0 && <>
          <BulkAdd key="bulk" communityId={communityId} existing={existing} autoFocus onPending={setPending} onAdded={() => reload()} />
          {loaded.length > 0 && (
            <div class="setup-have">
              <p><b>Ya cargaste {nPlayers(loaded.length)}</b></p>
              <div class="setup-chips">
                {loaded.slice(0, 24).map(r => <span class="setup-chip"><b>{r.profile.pos}</b>{displayName(r.profile)}</span>)}
                {loaded.length > 24 && <span class="setup-chip more">+{loaded.length - 24} más</span>}
              </div>
            </div>
          )}
        </>}
        {step === 1 && <VenuesManager communityId={communityId} meId={meId} openIfEmpty onCount={setVenueCount} />}
        {step === 2 && <div class="setup-invite">{invite}</div>}
      </div>

      <div class="setup-bar">
        {step > 0 && <a class="btn" href={`#/${setupPath(slug, step - 1)}`}>Atrás</a>}
        <button class={`btn ${(act.last || added > 0) && !(step === 0 && pending > 0) ? 'primary' : ''}`} onClick={next}>{act.label}</button>
      </div>
      {step < LAST_STEP && <p class="muted setup-skip">Podés saltear los pasos y completarlos después desde Miembros.</p>}
    </div>
  );
}
