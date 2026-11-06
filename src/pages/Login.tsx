import { useState } from 'preact/hooks';
import { sb } from '../lib/supabase';

/** Ruta a la que volver después del login con Google (ver main.tsx). */
export const NEXT_KEY = 'futrank-next';

export function Login() {
  const [err, setErr] = useState('');
  const go = async () => {
    // El token vuelve en el hash (#access_token=…): si redirectTo ya tiene "#/join/…" queda
    // "#/join/…#access_token=…" y supabase-js no lo detecta. Guardamos la ruta y la restauramos en main.tsx.
    try { if (location.hash.startsWith('#/')) localStorage.setItem(NEXT_KEY, location.hash); } catch { /* sin storage */ }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
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
      <p class="muted" style="font-size:.85rem;margin-top:16px">
        Al entrar aceptás los <a href="/terminos.html">términos</a> y la <a href="/privacidad.html">política de privacidad</a>.
      </p>
    </div>
  );
}
