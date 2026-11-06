import { useState } from 'preact/hooks';
import { sb } from '../lib/supabase';

export function Login() {
  const [err, setErr] = useState('');
  const go = async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname + location.hash },
    });
    if (error) setErr(error.message);
  };
  return (
    <div class="center">
      <img src="/icon.svg" width={72} height={72} alt="" style="margin:0 auto" />
      <h2>Ranking Fútbol</h2>
      <p class="muted">Armá tu comunidad, convocá partidos y calificá a tus compañeros.</p>
      <button class="btn primary" onClick={go}>Entrar con Google</button>
      {err && <p class="err">{err}</p>}
    </div>
  );
}
