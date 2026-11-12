import { useMemo, useRef, useState } from 'preact/hooks';
import {
  CREST_PALETTE, CREST_PATTERNS, CREST_SHAPES, CREST_SYMBOLS, MAX_INITIALS, MAX_RIBBON, MAX_STARS, PATTERN_LABEL, SHAPE_LABEL, SYMBOL_LABEL,
  cleanInitials, cleanRibbon, crestDataUrl, randomCrest, validateCrest, type CrestDesign,
} from './crestCore';
import './crest.css';

const MAX_UNDO = 40;
const same = (a: CrestDesign, b: CrestDesign) => JSON.stringify(a) === JSON.stringify(b);

/** Grupo de opciones con una miniatura del escudo para cada una. */
function Opts<T extends string>({ label, items, value, names, thumb, pick, cols }: {
  label: string; cols?: number; items: readonly T[]; value: T; names: Record<T, string>; thumb: (k: T) => string; pick: (k: T) => void;
}) {
  return (
    <div class="crest-sec">
      <span class="crest-h">{label}</span>
      <div class={`crest-opts${cols === 3 ? ' c3' : ''}`} role="group" aria-label={label}>
        {items.map(k => (
          <button type="button" key={k} class="crest-opt" aria-pressed={value === k} onClick={() => pick(k)}>
            <img src={thumb(k)} alt="" width="40" height="45" />
            <span>{names[k]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Una fila de color: paleta, "Auto" (si corresponde) y selector libre. `drag` avisa que es el selector (se juntan en un solo paso del Deshacer). */
function ColorRow({ label, value, auto, change }: {
  label: string; value: string | null; auto?: boolean; change: (hex: string | null, drag: boolean) => void;
}) {
  return (
    <div class="crest-sec">
      <div class="crest-hrow">
        <span class="crest-h">{label}</span>
        {auto && <button type="button" class="crest-auto" aria-pressed={value === null} onClick={() => change(null, false)}>Automático</button>}
      </div>
      <div class="crest-sw" role="group" aria-label={label}>
        {CREST_PALETTE.map(p => (
          <button type="button" key={p.hex} class="crest-chip" style={`background:${p.hex}`} aria-label={p.name} title={p.name}
            aria-pressed={value === p.hex} onClick={() => change(p.hex, false)} />
        ))}
        <label class="crest-custom" title="Otro color">
          <input type="color" value={value ?? '#ffffff'} aria-label={`${label}: otro color`}
            onInput={e => change((e.target as HTMLInputElement).value, true)} />
        </label>
      </div>
    </div>
  );
}

/**
 * Diseñador del escudo: vista previa en vivo, forma, colores, dibujo, símbolo, textos y estrellas. Nada se guarda hasta
 * "Guardar escudo"; "Cancelar" deja el escudo como estaba. "Deshacer" vuelve paso a paso.
 */
export function CrestDesigner({ initial, busy, error, onSave, onCancel }: {
  initial: CrestDesign; busy: boolean; error: string; onSave: (d: CrestDesign) => void; onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [past, setPast] = useState<CrestDesign[]>([]);
  const [ribbon, setRibbon] = useState(initial.ribbon);
  const [year, setYear] = useState(initial.year === null ? '' : String(initial.year));
  const last = useRef('');

  const sync = (x: CrestDesign) => { setRibbon(x.ribbon); setYear(x.year === null ? '' : String(x.year)); };
  /** Aplica un cambio y lo anota para Deshacer; los cambios seguidos con la misma `key` (escribir, arrastrar un color) cuentan como uno. */
  const apply = (next: CrestDesign, key = '') => {
    if (same(next, d)) return;
    if (!key || key !== last.current) setPast(p => [...p.slice(-(MAX_UNDO - 1)), d]);
    last.current = key;
    setD(next);
  };
  const patch = (p: Partial<CrestDesign>, key = '') => apply(validateCrest({ ...d, ...p }, d), key);

  const undo = () => {
    const p = past[past.length - 1];
    if (!p) return;
    setPast(past.slice(0, -1)); setD(p); sync(p); last.current = '';
  };
  const surprise = () => { const next = randomCrest(Math.random, d); apply(next); sync(next); };
  const pickSymbol = (symbol: CrestDesign['symbol']) => {
    // "Año" necesita un año: si no hay, arranca con el actual
    const next = validateCrest({ ...d, symbol, year: symbol === 'year' && d.year === null ? new Date().getFullYear() : d.year }, d);
    apply(next); sync(next);
  };

  const thumbs = useMemo(() => {
    const t = (p: Partial<CrestDesign>) => crestDataUrl({ ...d, ribbon: '', stars: 0, year: null, symbol: 'none', ...p }, 80);
    return {
      shape: (shape: CrestDesign['shape']) => t({ shape }),
      pattern: (pattern: CrestDesign['pattern']) => t({ pattern }),
      symbol: (symbol: CrestDesign['symbol']) => t({ symbol, pattern: 'solid', year: symbol === 'year' ? (d.year ?? new Date().getFullYear()) : null }),
    };
  }, [d.shape, d.pattern, d.c1, d.c2, d.c3, d.initials, d.year]);

  return (
    <div class="crest-ed">
      <div class="crest-top">
        <div class="crest-stage"><img class="crest-preview" src={crestDataUrl(d, 240)} alt="Vista previa del escudo" /></div>
        <div class="crest-acts">
          <button type="button" class="btn primary" disabled={busy} onClick={() => onSave(d)}>{busy ? 'Guardando…' : 'Guardar escudo'}</button>
          <div class="crest-acts-row">
            <button type="button" class="btn sm" disabled={busy} onClick={surprise}>🎲 Sorprendeme</button>
            <button type="button" class="btn sm" disabled={busy || !past.length} onClick={undo}>↶ Deshacer</button>
          </div>
        </div>
      </div>
      {error && <p class="err" role="alert">{error}</p>}

      <Opts label="Forma" cols={3} items={CREST_SHAPES} value={d.shape} names={SHAPE_LABEL} thumb={thumbs.shape} pick={shape => patch({ shape })} />
      <ColorRow label="Color principal" value={d.c1} change={(hex, drag) => hex && patch({ c1: hex }, drag ? 'c1' : '')} />
      <ColorRow label="Color secundario" value={d.c2} change={(hex, drag) => hex && patch({ c2: hex }, drag ? 'c2' : '')} />
      <ColorRow label="Color de detalle" value={d.c3} auto change={(hex, drag) => patch({ c3: hex }, drag ? 'c3' : '')} />
      <Opts label="Dibujo" items={CREST_PATTERNS} value={d.pattern} names={PATTERN_LABEL} thumb={thumbs.pattern} pick={pattern => patch({ pattern })} />
      <Opts label="Símbolo del centro" items={CREST_SYMBOLS} value={d.symbol} names={SYMBOL_LABEL} thumb={thumbs.symbol} pick={pickSymbol} />

      <div class="crest-sec">
        <span class="crest-h">Textos</span>
        <label class="field">
          <span>Iniciales (hasta {MAX_INITIALS})</span>
          <input type="text" value={d.initials} maxLength={MAX_INITIALS} autocapitalize="characters" autocomplete="off" spellcheck={false}
            onInput={e => { const el = e.target as HTMLInputElement, t = cleanInitials(el.value); el.value = t; patch({ initials: t }, 'ini'); }} />
        </label>
        <label class="field">
          <span>Texto de la cinta (hasta {MAX_RIBBON}, opcional)</span>
          <input type="text" value={ribbon} maxLength={MAX_RIBBON} autocomplete="off" spellcheck={false} placeholder="Ej.: LOS PIBES"
            onInput={e => { const el = e.target as HTMLInputElement, t = cleanRibbon(el.value, false); el.value = t; setRibbon(t); patch({ ribbon: t.trim() }, 'rib'); }} />
        </label>
        <label class="field">
          <span>Fundado en (opcional)</span>
          <input type="text" inputMode="numeric" value={year} maxLength={4} autocomplete="off" placeholder="Ej.: 2019"
            onInput={e => {
              const el = e.target as HTMLInputElement, t = el.value.replace(/\D/g, '').slice(0, 4);
              el.value = t; setYear(t); patch({ year: t.length === 4 ? Number(t) : null }, 'year');
            }}
            onBlur={() => setYear(d.year === null ? '' : String(d.year))} />
        </label>
      </div>

      <div class="crest-sec">
        <span class="crest-h">Estrellas arriba</span>
        <div class="crest-seg" role="group" aria-label="Estrellas arriba">
          {Array.from({ length: MAX_STARS + 1 }, (_, n) => (
            <button type="button" key={n} aria-pressed={d.stars === n} aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} onClick={() => patch({ stars: n })}>{n}</button>
          ))}
        </div>
      </div>
      <button type="button" class="btn" disabled={busy} onClick={onCancel}>Cancelar</button>
    </div>
  );
}
