import { useEffect, useState } from 'preact/hooks';
import { sb } from '../lib/supabase';
import { go } from '../lib/router';

export function Join({ code }: { code: string }) {
  const [info, setInfo] = useState<{ name: string; members: number } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    sb.rpc('invite_info', { p_code: code }).then(({ data, error }) => {
      if (error) setErr(error.message); else setInfo(data?.[0] ?? null);
    });
  }, [code]);

  const join = async () => {
    setBusy(true);
    const { data, error } = await sb.rpc('join_community', { p_code: code });
    setBusy(false);
    if (error) setErr(error.message); else go(`c/${data.slug}`);
  };

  return (
    <div class="center">
      {info === undefined && !err && <p class="muted">Cargando…</p>}
      {info === null && <p>El link de invitación no es válido o fue regenerado.</p>}
      {info && <>
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
