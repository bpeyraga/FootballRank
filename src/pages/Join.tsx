import { useEffect, useState } from 'preact/hooks';
import { sb } from '../lib/supabase';
import { go } from '../lib/router';

/** Errores de invite_info / join_community en castellano; 'expired' y 'invalid_code' vienen del servidor. */
function friendly(m: string) {
  if (m.includes('expired')) return 'Este link venció, pedile uno nuevo al admin.';
  if (m.includes('invalid_code')) return 'El link de invitación no es válido o fue regenerado.';
  if (m.includes('no_profile')) return 'Todavía no tenés perfil. Volvé a iniciar sesión e intentá de nuevo.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}

export function Join({ code }: { code: string }) {
  const [info, setInfo] = useState<{ name: string; members: number } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    sb.rpc('invite_info', { p_code: code }).then(({ data, error }) => {
      if (error) {
        if (error.message.includes('expired')) setExpired(true); else setErr(friendly(error.message));
      } else setInfo(data?.[0] ?? null);
    });
  }, [code]);

  const join = async () => {
    setBusy(true); setErr('');
    const { data, error } = await sb.rpc('join_community', { p_code: code });
    setBusy(false);
    if (!error) return go(`c/${data.slug}`);
    if (error.message.includes('expired')) { setExpired(true); setInfo(null); } else setErr(friendly(error.message));
  };

  return (
    <div class="center">
      {info === undefined && !err && !expired && <p class="muted">Cargando…</p>}
      {expired && <p>Este link venció, pedile uno nuevo al admin.</p>}
      {info === null && !expired && <p>El link de invitación no es válido o fue regenerado.</p>}
      {info && !expired && <>
        <p class="muted">Te invitaron a</p>
        <h2>{info.name}</h2>
        <p class="muted">{info.members} {info.members === 1 ? 'miembro' : 'miembros'}</p>
        <button class="btn primary" disabled={busy} onClick={join}>{busy ? 'Uniéndote…' : 'Unirme'}</button>
      </>}
      <a href="#/" class="muted">Volver al inicio</a>
      {err && <p class="err">{err}</p>}
    </div>
  );
}
