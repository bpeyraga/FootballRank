import { normalizeWhatsapp, whatsappLink, type ComplexDraft } from './model';

/** Teléfono, WhatsApp (con vista previa del número que se va a guardar) y descripción. Campo controlado. */
export function ContactFields({ draft, onChange, disabled = false }: {
  draft: ComplexDraft; onChange: (patch: Partial<ComplexDraft>) => void; disabled?: boolean;
}) {
  const wa = draft.whatsapp.trim() ? normalizeWhatsapp(draft.whatsapp) : null;
  return (
    <>
      <label class="field"><span>Teléfono</span>
        <input type="tel" inputMode="tel" value={draft.phone} maxLength={25} placeholder="11 5555-1234" autoComplete="tel" disabled={disabled}
          onInput={e => onChange({ phone: (e.target as HTMLInputElement).value })} /></label>
      <label class="field"><span>WhatsApp <span class="muted">(los jugadores te escriben con un toque)</span></span>
        <input type="tel" inputMode="tel" value={draft.whatsapp} maxLength={25} placeholder="11 5555-1234" disabled={disabled}
          onInput={e => onChange({ whatsapp: (e.target as HTMLInputElement).value })} /></label>
      {draft.whatsapp.trim() && (wa
        ? <p class="ow-hint muted">Guardamos el número <b>+{wa}</b>. <a href={whatsappLink(wa)} target="_blank" rel="noopener">Probalo</a></p>
        : <p class="err">No parece un número válido. Escribilo con el código de área, por ejemplo 11 5555 1234.</p>)}
      <label class="field"><span>Descripción <span class="muted">(opcional)</span></span>
        <textarea rows={3} maxLength={600} value={draft.description} disabled={disabled}
          placeholder="Canchas de césped sintético, vestuarios, buffet. Alquilamos pecheras."
          onInput={e => onChange({ description: (e.target as HTMLTextAreaElement).value })} /></label>
    </>
  );
}
