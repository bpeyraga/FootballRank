import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { POLL_MAX_OPTION, POLL_MAX_OPTIONS, POLL_MAX_QUESTION, POLL_MIN_OPTIONS, validatePoll } from './polls';

let seq = 0;
const blank = () => ({ k: ++seq, v: '' });

/** Hoja para armar una encuesta (de abajo en el celu, ventana centrada en la compu). */
export function PollSheet({ onClose, onCreate }: {
  onClose: () => void;
  /** Crea la encuesta; si falla tira un Error con el mensaje ya listo para mostrar. */
  onCreate: (question: string, options: string[], multi: boolean) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(() => [blank(), blank()]);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const root = useRef<HTMLFormElement>(null);
  const qIn = useRef<HTMLInputElement>(null);
  const form = validatePoll(q, opts.map(o => o.v));

  useEffect(() => { qIn.current?.focus(); }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [busy]);

  const inputs = () => [...(root.current?.querySelectorAll<HTMLInputElement>('.poll-edit input') ?? [])];
  const setOpt = (k: number, v: string) => setOpts(o => o.map(x => (x.k === k ? { ...x, v } : x)));
  const add = () => {
    if (opts.length >= POLL_MAX_OPTIONS) return;
    setOpts(o => [...o, blank()]);
    requestAnimationFrame(() => inputs().pop()?.focus());
  };
  const remove = (k: number) => setOpts(o => (o.length > POLL_MIN_OPTIONS ? o.filter(x => x.k !== k) : o));
  /** Enter en una opción pasa a la siguiente (o crea otra si era la última); Enter en la pregunta va a la primera opción. */
  const onEnter = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const next = inputs()[i + 1];
    if (next) next.focus(); else if (opts[i].v.trim()) add();
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!form.ok || busy) return;
    setBusy(true); setErr('');
    try {
      await onCreate(form.question, form.options, multi);
      onClose();
    } catch (x: any) {
      setErr(x?.message ?? 'No se pudo crear la encuesta.');
      setBusy(false);
    }
  };

  // En el <body>, como el visor de fotos: tapa también la barra de pestañas.
  return createPortal(
    <div class="sheet-bg" onClick={() => !busy && onClose()}>
      <form class="sheet" ref={root} role="dialog" aria-modal="true" aria-label="Nueva encuesta"
        onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div class="sheet-head">
          <h3>📊 Nueva encuesta</h3>
          <button type="button" class="icon-btn" aria-label="Cerrar" disabled={busy} onClick={onClose}>✕</button>
        </div>

        <label class="field">
          <span>Pregunta</span>
          <input ref={qIn} value={q} maxLength={POLL_MAX_QUESTION} placeholder="¿Quién se suma el jueves?" autocomplete="off"
            onInput={e => setQ((e.target as HTMLInputElement).value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); inputs()[0]?.focus(); } }} />
        </label>

        <div class="field">
          <span>Opciones</span>
          {opts.map((o, i) => (
            <div class="poll-edit" key={o.k}>
              <input value={o.v} maxLength={POLL_MAX_OPTION} placeholder={`Opción ${i + 1}`} aria-label={`Opción ${i + 1}`} autocomplete="off"
                onInput={e => setOpt(o.k, (e.target as HTMLInputElement).value)} onKeyDown={e => onEnter(e, i)} />
              {opts.length > POLL_MIN_OPTIONS && (
                <button type="button" class="icon-btn" aria-label={`Quitar la opción ${i + 1}`} onClick={() => remove(o.k)}>✕</button>
              )}
            </div>
          ))}
          {opts.length < POLL_MAX_OPTIONS && (
            <button type="button" class="linkbtn poll-add" onClick={add}>+ Agregar opción</button>
          )}
        </div>

        <label class="poll-multi-opt">
          <input type="checkbox" checked={multi} onChange={e => setMulti((e.target as HTMLInputElement).checked)} />
          <span>Permitir varias respuestas</span>
        </label>

        {(form.hint || err) && <p class="err" role="alert">{err || form.hint}</p>}
        <button class="btn primary block" type="submit" disabled={!form.ok || busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
      </form>
    </div>,
    document.body,
  );
}
