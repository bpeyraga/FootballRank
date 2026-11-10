import { useEffect, useState } from 'preact/hooks';

/**
 * Foto del complejo (16:9): vista previa y botones para elegir, cambiar o quitar.
 * No sube nada: `onFile` recibe el archivo y quien lo usa decide cuándo guardarlo (al crear, o en el momento).
 * `url` es la foto ya guardada; `file`, una recién elegida que todavía no se subió (se muestra primero).
 */
export function CoverField({ url, file, busy = false, onFile, onRemove, hint }: {
  url: string | null; file?: File | null; busy?: boolean; onFile: (f: File) => void; onRemove?: () => void; hint?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const src = preview ?? url;
  const pick = (e: Event) => {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    input.value = '';
    if (f) onFile(f);
  };
  return (
    <div class={`ow-cover${src ? ' has' : ''}${busy ? ' busy' : ''}`}>
      <div class="ow-cover-img">
        {src
          ? <img src={src} alt="Foto del complejo" />
          : <div class="ow-cover-empty"><span aria-hidden="true">📷</span><b>Sumá una foto</b><small class="muted">{hint ?? 'Los jugadores eligen más rápido las canchas que tienen foto.'}</small></div>}
      </div>
      <div class="ow-cover-actions">
        <label class="btn sm">
          {busy ? 'Subiendo…' : src ? 'Cambiar foto' : 'Elegir foto'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={pick} />
        </label>
        {src && onRemove && <button type="button" class="btn sm danger" disabled={busy} onClick={onRemove}>Quitar</button>}
      </div>
    </div>
  );
}
