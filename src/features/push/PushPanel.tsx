import { useEffect, useRef, useState } from 'preact/hooks';
import { PUSH_KINDS, pushKinds, pushOff, pushOn, pushStatus, setPushKinds, type PushKind, type PushStatus } from './push';

/** Activar/desactivar los avisos en este celular y elegir cuáles. */
export function PushPanel({ onClose, onInstall }: { onClose: () => void; onInstall: () => void }) {
  const [st, setSt] = useState<PushStatus | null>(null);
  const [kinds, setKinds] = useState<PushKind[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const s = await pushStatus().catch(() => 'unsupported' as const);
    setSt(s);
    if (s === 'on') setKinds(await pushKinds().catch(() => []));
  };
  useEffect(() => { load(); }, []);

  const on = async () => {
    setBusy(true); setMsg('');
    const err = await pushOn();
    setBusy(false);
    setMsg(err || '¡Listo! Te mandamos un aviso de prueba.');
    load();
  };
  const off = async () => { setBusy(true); await pushOff().catch(() => {}); setBusy(false); setMsg(''); load(); };
  // Los cambios se guardan en orden (dos toques rápidos no pueden pisarse al revés).
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const toggle = (k: PushKind) => {
    const next = kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k];
    setKinds(next);
    saving.current = saving.current.then(() => setPushKinds(next)).catch(() => setMsg('No se pudo guardar.'));
  };

  return (
    <div class="card push-panel">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3>🔔 Avisos en este celular</h3>
        <button class="btn sm" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      {st === null && <p class="muted">Cargando…</p>}
      {st === 'ios-install' && <>
        <p class="muted">En iPhone los avisos funcionan solo con la app instalada. Instalala y abrila desde el ícono.</p>
        <button class="btn primary block" onClick={onInstall}>📲 Cómo instalarla</button>
      </>}
      {st === 'unsupported' && <p class="muted">Este navegador no soporta avisos. Probá con Chrome (Android) o con la app instalada (iPhone).</p>}
      {st === 'denied' && <p class="muted">Bloqueaste los avisos para esta página. Habilitalos en los ajustes del navegador (candadito al lado de la dirección → Notificaciones) y volvé a entrar.</p>}
      {st === 'off' && <>
        <p class="muted">Enterate de los partidos nuevos, el día que jugás, cuando entrás desde la lista de espera, cuando se arman los equipos, del chat y el resumen de la semana.</p>
        <button class="btn primary block" disabled={busy} onClick={on}>{busy ? 'Activando…' : 'Activar avisos'}</button>
      </>}
      {st === 'on' && <>
        {PUSH_KINDS.map(([k, label]) => (
          <label class="push-kind">
            <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggle(k)} />
            <span>{label}</span>
          </label>
        ))}
        <p class="muted" style="font-size:.8rem;margin-top:6px">Siempre te avisamos si entrás desde la lista de espera, si se cancela un partido al que estás anotado o si te suspenden.</p>
        <button class="btn block" style="margin-top:10px" disabled={busy} onClick={off}>Desactivar avisos</button>
      </>}
      {msg && <p class="muted" style="margin-top:8px" role="status">{msg}</p>}
    </div>
  );
}
