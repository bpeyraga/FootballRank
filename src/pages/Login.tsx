import { useEffect, useState } from 'preact/hooks';
import { sb } from '../lib/supabase';
import { FutCard } from '../lib/FutCard';

/** Ruta a la que volver después del login con Google (ver main.tsx). */
import { NEXT_KEY } from '../lib/router';

const DEMO = { rit: 86, tir: 84, pas: 79, reg: 88, def: 45, fis: 76 };

const GoogleG = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const Pitch = () => (
  <svg class="hero-lines" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="2">
      <rect x="12" y="12" width="376" height="236" rx="2" />
      <line x1="200" y1="12" x2="200" y2="248" />
      <circle cx="200" cy="130" r="38" />
      <rect x="12" y="72" width="54" height="116" /><rect x="12" y="106" width="20" height="48" />
      <rect x="334" y="72" width="54" height="116" /><rect x="368" y="106" width="20" height="48" />
      <path d="M66 110a22 22 0 0 1 0 40M334 110a22 22 0 0 0 0 40" />
    </g>
    <circle cx="200" cy="130" r="3" fill="currentColor" />
  </svg>
);

const FEATURES = [
  {
    t: 'Calificá estilo FIFA',
    d: 'Ritmo, tiro, pase, regate, defensa y físico. El promedio de los votos del grupo define el OVR de cada uno.',
    i: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />,
  },
  {
    t: 'Equipos parejos',
    d: 'Convocás el partido, se anotan y la app reparte los equipos según el nivel de cada jugador. Se terminó la discusión.',
    i: <path d="M8 4l-4 2v4h2v10h5V4zM16 4l4 2v4h-2v10h-5V4z" />,
  },
  {
    t: 'Toda la info del grupo',
    d: 'Ranking, resultados, goles y chat de la comunidad en un solo lugar, desde el celular.',
    i: <path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5" />,
  },
];

export function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const invited = location.hash.startsWith('#/join/');
  // Si vuelve atrás desde Google, el navegador restaura la página con el botón en "Abriendo…".
  useEffect(() => {
    const on = () => setBusy(false);
    addEventListener('pageshow', on);
    return () => removeEventListener('pageshow', on);
  }, []);

  const go = async () => {
    // El token vuelve en el hash (#access_token=…): si redirectTo ya tiene "#/join/…" queda
    // "#/join/…#access_token=…" y supabase-js no lo detecta. Guardamos la ruta y la restauramos en main.tsx.
    try { if (location.hash.startsWith('#/')) localStorage.setItem(NEXT_KEY, location.hash); } catch { /* sin storage */ }
    setBusy(true); setErr('');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) { setErr(error.message); setBusy(false); }
  };

  const cta = <>
    <button class="gbtn" onClick={go} disabled={busy}>
      <GoogleG /> {busy ? 'Abriendo Google…' : 'Continuar con Google'}
    </button>
    {err && <p class="err">{err}</p>}
  </>;

  return (
    <div class="landing">
      <header class="landing-top">
        <img src="/icon.svg" width={32} height={32} alt="" />
        <b>Ranking Fútbol</b>
      </header>

      <section class="hero">
        <Pitch />
        <div class="hero-copy">
          {invited
            ? <span class="kicker">Te invitaron a una comunidad</span>
            : <span class="kicker">Fútbol amateur · nivel pro</span>}
          <h1>Armá equipos parejos.<br />Sin discutir.</h1>
          <p>Tu grupo se califica estilo FIFA, convoca los partidos y la app arma los equipos más parejos posibles.</p>
          {cta}
          <small>{invited ? 'Entrá y te sumás al toque.' : 'Gratis y sin publicidad.'}</small>
        </div>
        <div class="hero-card"><FutCard p={{ name: 'Vos', pos: 'DEL', photo_url: null }} stats={DEMO} /></div>
      </section>

      <section class="features">
        {FEATURES.map(f => (
          <div class="feature">
            <span class="feature-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">{f.i}</svg>
            </span>
            <div><h3>{f.t}</h3><p class="muted">{f.d}</p></div>
          </div>
        ))}
      </section>

      <section class="steps">
        <h2>En tres pasos</h2>
        <ol>
          <li><b>Entrá con Google</b><span class="muted">Sin contraseñas ni formularios.</span></li>
          <li><b>Armá tu ficha</b><span class="muted">Posición, foto y cómo te ves en la cancha.</span></li>
          <li><b>Creá tu comunidad o sumate</b><span class="muted">Compartí el link por WhatsApp y a jugar.</span></li>
        </ol>
        {cta}
      </section>

      <footer class="landing-foot muted">
        <span><a href="/terminos.html">Términos</a> · <a href="/privacidad.html">Privacidad</a></span>
        <p>Al entrar aceptás los términos y la política de privacidad.</p>
      </footer>
    </div>
  );
}
