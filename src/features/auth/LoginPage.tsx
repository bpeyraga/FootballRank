import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { signInWithGoogle, signInWithPassword, signUp } from './api';
import { CardFan, ArtChat, ArtFixed, ArtFut, ArtMatch, ArtNotifs, ArtRank, ArtStats, ArtTeams } from './LandingArt';
import { clearIntent, writeIntent } from './roles';

/** Ruta a la que volver después del login con Google (ver main.tsx). */
import { NEXT_KEY } from '../../app/router';

const GoogleG = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

/** Cancha vista desde arriba, de fondo del hero y del cierre. */
const PitchLines = () => (
  <svg class="ld-lines" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="3">
      <rect x="30" y="30" width="1140" height="540" rx="6" />
      <line x1="600" y1="30" x2="600" y2="570" />
      <circle cx="600" cy="300" r="92" />
      <rect x="30" y="170" width="170" height="260" /><rect x="30" y="236" width="62" height="128" />
      <rect x="1000" y="170" width="170" height="260" /><rect x="1108" y="236" width="62" height="128" />
      <path d="M200 252a66 66 0 0 1 0 96M1000 252a66 66 0 0 0 0 96" />
    </g>
    <circle cx="600" cy="300" r="6" fill="currentColor" />
  </svg>
);

const Ico = ({ children }: { children: ComponentChildren }) => (
  <span class="ld-ico">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">{children}</svg>
  </span>
);

const TILES: { k: string; t: string; d: string; i: ComponentChildren; art: ComponentChildren }[] = [
  {
    k: 'card', t: 'Tu carta FIFA, votada por el grupo',
    d: 'Ritmo, tiro, pase, regate, defensa y físico. Tus compañeros te votan y el promedio arma tu OVR. Según tu nivel, la carta sale de bronce, plata u oro.',
    i: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />, art: <ArtStats />,
  },
  {
    k: 'teams', t: 'Equipos parejos, automáticos',
    d: 'Se anotan, tocás un botón y la app reparte los equipos según el nivel de cada uno. Se terminó la discusión.',
    i: <path d="M8 4l-4 2v4h2v10h5V4zM16 4l4 2v4h-2v10h-5V4z" />, art: <ArtTeams />,
  },
  {
    k: 'push', t: 'Convocatorias y avisos al celular',
    d: 'Convocás el partido y la lista se arma sola. Te avisan "hoy jugás", "falta 1 hora" y cuando entrás de la lista de espera.',
    i: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />, art: <ArtNotifs />,
  },
  {
    k: 'match', t: 'Cargá el partido en 1 minuto',
    d: 'Resultado, goles, asistencias, tarjetas y figura del partido. Todo suma a las estadísticas de cada uno.',
    i: <path d="M13 3L5 13h6l-1 8 8-10h-6z" />, art: <ArtMatch />,
  },
  {
    k: 'rank', t: 'Ranking, logros e insignias',
    d: 'Ranking por OVR, goleadores, asistencias, figuras y presentismo. Desbloqueá logros y compartí tu carta en historias.',
    i: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />, art: <ArtRank />,
  },
  {
    k: 'chat', t: 'Chat del grupo con encuestas',
    d: 'Hablá con tu comunidad sin salir de la app y armá encuestas para definir día, hora o quién se anota.',
    i: <path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5" />, art: <ArtChat />,
  },
  {
    k: 'fixed', t: 'Partido fijo semanal y cuotas',
    d: 'Programá el partido de todas las semanas y llevá la cuenta de quién pagó la cancha y quién debe.',
    i: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />, art: <ArtFixed />,
  },
  {
    k: 'ar', t: 'Fútbol argentino',
    d: 'Tabla, partidos y noticias de la liga, y las de tu club con su escudito en tu carta.',
    i: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3v4.5M15.8 10.3l4.4-1.5M14.3 14.7l2.7 3.8M9.7 14.7L7 18.5M8.2 10.3L3.8 8.8" /></>, art: <ArtFut />,
  },
];

const STEPS = [
  ['Entrá con Google o tu correo', 'Con Google es un toque; si no, registrás tu correo y una contraseña.'],
  ['Armá tu carta', 'Elegí tu posición, tu foto y tu club. Después tus compañeros te califican.'],
  ['Sumá a tu grupo', 'Creá la comunidad, compartí el link por WhatsApp y a jugar.'],
] as const;

const FAQ = [
  ['¿Es gratis?', 'Sí. Entrás con Google o con tu correo y usás la app completa sin pagar nada.'],
  ['¿Tiene publicidad?', 'No. Sin banners, sin anuncios: la app es para organizar el partido, no para venderte cosas.'],
  ['¿Se instala como app?', 'Sí. No hace falta ir a la tienda: desde el menú del navegador elegís "Instalar app" o "Agregar a inicio" y queda con su ícono en el celular.'],
  ['¿Funciona en iPhone y Android?', 'Sí, en los dos y también desde la compu. En iPhone, para recibir los avisos primero tenés que instalarla en la pantalla de inicio desde Safari.'],
  ['¿Cómo hago para que mis amigos entren?', 'Creás tu comunidad y compartís el link de invitación por WhatsApp. Cada uno entra con Google o su correo, arma su carta y ya puede votar y anotarse a los partidos.'],
  ['¿Quién califica a quién?', 'Los integrantes del grupo se califican entre sí en los seis atributos. El promedio de los votos define el OVR de cada uno.'],
] as const;

const scrollTo = (id: string) => {
  // Sin <a href="#…">: el hash lo usa el router (y guarda la invitación #/join/…).
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
};

/** Guarda la ruta actual (ej. "#/join/…") para volver a ella después de un redirect (ver main.tsx). */
const saveNext = () => {
  try { if (location.hash.startsWith('#/')) localStorage.setItem(NEXT_KEY, location.hash); } catch { /* sin storage */ }
};

/**
 * Entró por "¿Tenés una cancha?": se recuerda (para preseleccionar "Dueño de cancha" en el primer ingreso) y, como el login con Google
 * sale de la página, también a dónde volver (main.tsx lo lee de NEXT_KEY). Si entra por cualquier otro botón, se olvida.
 */
const rememberOwner = (owner: boolean) => {
  if (!owner) {
    clearIntent();
    try { if (localStorage.getItem(NEXT_KEY) === '#/duenio') localStorage.removeItem(NEXT_KEY); } catch { /* sin storage */ }
    return;
  }
  writeIntent('owner');
  try { localStorage.setItem(NEXT_KEY, '#/duenio'); } catch { /* sin storage */ }
};

const AUTH_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'User already registered': 'Ya hay una cuenta con ese correo. Entrá con tu contraseña.',
  'Email not confirmed': 'Todavía no confirmaste el correo. Revisá tu bandeja de entrada.',
  'Password should be at least 8 characters.': 'La contraseña tiene que tener al menos 8 caracteres.',
};

/** Alta y entrada con correo y contraseña. Con la sesión iniciada, main.tsx se entera por onAuthStateChange. */
function EmailAuth({ id = 'ld-email', owner = false }: { id?: string; owner?: boolean }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const submit = async (e: Event) => {
    e.preventDefault();
    setErr(''); setMsg('');
    rememberOwner(owner);
    if (mode === 'up' && pass.length < 8) { setErr('La contraseña tiene que tener al menos 8 caracteres.'); return; }
    setBusy(true);
    if (mode === 'in') {
      try { await signInWithPassword(email.trim(), pass); }
      catch (e: any) { setErr(AUTH_ERRORS[e.message] ?? e.message); }
    } else {
      if (!owner) saveNext(); // si hay que confirmar el correo, el link vuelve a la app y retomamos la invitación
      try {
        const r = await signUp(email.trim(), pass, name.trim());
        if (r.existed) setErr(AUTH_ERRORS['User already registered']);
        else if (r.confirm) setMsg(`Te mandamos un correo a ${email.trim()}. Abrí el link para confirmar la cuenta.`);
      } catch (e: any) { setErr(AUTH_ERRORS[e.message] ?? e.message); }
    }
    setBusy(false);
  };

  const flip = () => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); setMsg(''); };

  return (
    <form class="ld-email" id={id} onSubmit={submit}>
      {mode === 'up' && (
        <input type="text" placeholder="Tu nombre" autocomplete="name" maxLength={40} required
          value={name} onInput={e => setName(e.currentTarget.value)} />
      )}
      <input type="email" placeholder="Correo" autocomplete="email" required
        value={email} onInput={e => setEmail(e.currentTarget.value)} />
      <input type="password" placeholder={mode === 'up' ? 'Contraseña (mínimo 8)' : 'Contraseña'} autocomplete={mode === 'in' ? 'current-password' : 'new-password'} required
        value={pass} onInput={e => setPass(e.currentTarget.value)} />
      <button class="ld-email-go" disabled={busy}>
        {busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
      </button>
      {err && <p class="ld-email-err" role="alert">{err}</p>}
      {msg && <p class="ld-email-ok">{msg}</p>}
      <button type="button" class="ld-link" onClick={flip}>
        {mode === 'in' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Entrá'}
      </button>
    </form>
  );
}

export function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [withEmail, setWithEmail] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState(false);
  const openEmail = () => {
    setWithEmail(true);
    setTimeout(() => scrollTo('ld-email'));
  };
  const openOwnerEmail = () => {
    setOwnerEmail(true);
    setTimeout(() => scrollTo('ld-email-owner'));
  };
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
    rememberOwner(false);
    saveNext();
    setBusy(true); setErr('');
    try { await signInWithGoogle(); } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  /** Igual que `go`, pero por la puerta de dueños de cancha. */
  const goOwner = async () => {
    rememberOwner(true);
    setBusy(true); setErr('');
    try { await signInWithGoogle(); } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  const cta = (label = 'Entrar con Google — es gratis') => (
    <button class="gbtn ld-gbtn" onClick={go} disabled={busy}>
      <GoogleG /> {busy ? 'Abriendo Google…' : label}
    </button>
  );

  return (
    <div class="landing">
      <header class="ld-bar">
        <div class="ld-in ld-bar-in">
          <span class="ld-brand"><img src="/icon.png" width={34} height={34} alt="" /><b>Ranking Fútbol</b></span>
          <button class="ld-enter" onClick={go} disabled={busy}>{busy ? 'Abriendo…' : 'Entrar'}</button>
        </div>
        {err && <div class="ld-alert" role="alert">{err}</div>}
      </header>

      <main>
        <section class="ld-hero">
          <div class="ld-grass" aria-hidden="true" />
          <PitchLines />
          <div class="ld-in ld-hero-in">
            <div class="ld-copy">
              <span class="ld-kicker">{invited ? '💌 Te invitaron a una comunidad' : 'Fútbol amateur · nivel pro'}</span>
              <h1>Tu picado,<br /><span class="ld-gold">nivel FIFA.</span></h1>
              <p class="ld-sub">
                Tus amigos te votan, la app arma tu carta y los equipos salen parejos. Convocá, jugá y
                fijate quién es el crack del grupo.
              </p>
              <div class="ld-cta">
                {cta()}
                <button class="ld-ghost" onClick={() => scrollTo('ld-como')}>Ver cómo funciona</button>
              </div>
              {withEmail
                ? <EmailAuth />
                : <button class="ld-link" onClick={openEmail}>O entrá con tu correo y contraseña</button>}
              <ul class="ld-checks">
                <li>Gratis</li><li>Sin publicidad</li><li>Se instala como app</li>
              </ul>
              <p class="ld-proof">
                <span aria-hidden="true">⚽</span>
                {invited ? 'Entrá y te sumás a la comunidad al toque.' : 'Pensada para el grupo que arma el picado todas las semanas.'}
              </p>
            </div>
            <CardFan />
          </div>
        </section>

        <section class="ld-sec" aria-labelledby="ld-h-feat">
          <div class="ld-in">
            <div class="ld-head ld-rv">
              <span class="kicker">Todo en un solo lugar</span>
              <h2 id="ld-h-feat">Lo que necesita tu picado</h2>
              <p class="muted">De la convocatoria al tercer tiempo, sin planillas ni mil mensajes de WhatsApp.</p>
            </div>
            <div class="ld-bento">
              {TILES.map(t => (
                <article class={`ld-tile t-${t.k} ld-rv`}>
                  <div class="ld-tile-copy">
                    <Ico>{t.i}</Ico>
                    <h3>{t.t}</h3>
                    <p>{t.d}</p>
                  </div>
                  <div class="ld-art">{t.art}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section class="ld-sec ld-how" id="ld-como" aria-labelledby="ld-h-how">
          <div class="ld-in">
            <div class="ld-head ld-rv">
              <span class="kicker">En 3 pasos</span>
              <h2 id="ld-h-how">Cómo funciona</h2>
            </div>
            <ol class="ld-steps">
              {STEPS.map(([t, d]) => (
                <li class="ld-rv"><div><h3>{t}</h3><p class="muted">{d}</p></div></li>
              ))}
            </ol>
          </div>
        </section>

        <section class="ld-sec" aria-labelledby="ld-h-faq">
          <div class="ld-in ld-faq-in">
            <div class="ld-head ld-rv">
              <span class="kicker">Dudas</span>
              <h2 id="ld-h-faq">Preguntas frecuentes</h2>
            </div>
            <div class="ld-faq">
              {FAQ.map(([q, a]) => (
                <details class="ld-rv">
                  <summary>{q}</summary>
                  <p class="muted">{a}</p>
                </details>
              ))}
              <a class="ld-faq-more ld-rv" href="/como-se-usa.html" target="_blank" rel="noopener">
                <span aria-hidden="true">📖</span>
                <span><b>Guía "Cómo se usa"</b><small class="muted">Todo paso a paso, para jugadores y admins. Se puede guardar en PDF.</small></span>
              </a>
            </div>
          </div>
        </section>

        <section class="ld-final">
          <div class="ld-grass" aria-hidden="true" />
          <PitchLines />
          <div class="ld-in ld-final-in">
            <img class="ld-final-logo" src="/icon.png" width={84} height={84} alt="" loading="lazy" />
            <h2>Armá tu carta y convocá al grupo</h2>
            <p>En un minuto tenés tu ficha lista y el link para invitar a tus amigos.</p>
            {cta()}
            <button class="ld-link" onClick={openEmail}>O entrá con tu correo y contraseña</button>
            <small>{invited ? 'Entrá y te sumás al toque.' : 'Gratis y sin publicidad.'}</small>
          </div>
        </section>

        <section class="ld-owner" id="ld-duenios" aria-labelledby="ld-h-owner">
          <div class="ld-in">
            <div class="ld-owner-card ld-rv">
              <div class="ld-owner-copy">
                <span class="ld-kicker">Para dueños de cancha</span>
                <h2 id="ld-h-owner">¿Tenés una cancha o un complejo?</h2>
                <p>Dejá el cuaderno y el teléfono: tu agenda online, los pedidos de turno y tus canchas en el buscador de la app.</p>
                <ul class="ld-perks">
                  <li>
                    <Ico><path d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5zM3 10h18M8 3v4M16 3v4" /></Ico>
                    <span><b>Agenda online</b><small>Todos los turnos de cada cancha, por día y por semana, y los horarios bloqueados.</small></span>
                  </li>
                  <li>
                    <Ico><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" /></Ico>
                    <span><b>Reservas desde la app</b><small>Los jugadores te piden turno; aceptás o rechazás con un toque y les llega el aviso.</small></span>
                  </li>
                  <li>
                    <Ico><><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5M11 8v6M8 11h6" /></></Ico>
                    <span><b>Aparecés en el buscador de canchas</b><small>Quien juega cerca tuyo te encuentra, con tus fotos, precios y horarios.</small></span>
                  </li>
                </ul>
                <div class="ld-owner-cta">
                  <button class="gbtn ld-gbtn" onClick={goOwner} disabled={busy}>
                    <GoogleG /> {busy ? 'Abriendo Google…' : 'Entrar con Google'}
                  </button>
                  {ownerEmail
                    ? <EmailAuth id="ld-email-owner" owner />
                    : <button class="ld-link" onClick={openOwnerEmail}>O entrá con tu correo y contraseña</button>}
                  <small>Es gratis. Si además jugás al fútbol, usás la misma cuenta para las dos cosas.</small>
                </div>
              </div>
              <div class="ld-owner-art" aria-hidden="true">
                <div class="ld-ag">
                  <div class="ld-ag-head"><b>Hoy · Cancha 1</b><span>F5</span></div>
                  <div class="ld-ag-row ok"><i>20:00</i><span>Los Pibes</span><em>Confirmado</em></div>
                  <div class="ld-ag-row pend"><i>21:00</i><span>Beto M.</span><em>Pide turno</em></div>
                  <div class="ld-ag-row blk"><i>22:00</i><span>Mantenimiento</span><em>Bloqueado</em></div>
                  <div class="ld-ag-row free"><i>23:00</i><span>Libre</span><em /></div>
                </div>
                <div class="ld-ag-toast"><b>Nuevo pedido de turno</b><span>Beto M. · Cancha 1 · 21:00</span></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer class="ld-foot">
        <div class="ld-in">
          <span><a href="/como-se-usa.html">Cómo se usa</a> · <button class="ld-foot-link" onClick={() => scrollTo('ld-duenios')}>Para dueños de cancha</button> · <a href="/terminos.html">Términos</a> · <a href="/privacidad.html">Privacidad</a></span>
          <p>Al entrar aceptás los términos y la política de privacidad.</p>
          <p>Ranking Fútbol no está afiliada a FIFA, EA Sports, la AFA ni a ningún club.</p>
        </div>
      </footer>
    </div>
  );
}
