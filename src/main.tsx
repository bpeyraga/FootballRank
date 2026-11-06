import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import './styles.css';
import './lib/install'; // registra el service worker y escucha "instalar app" desde el arranque
import { loadMe, sb, type Profile } from './lib/supabase';
import { pushForget, pushOff, pushSync } from './lib/push';
import { Loading, page, prefetch } from './lib/lazy';
const Login = page(() => import('./pages/Login'), m => m.Login);
const Onboarding = page(() => import('./pages/Onboarding'), m => m.Onboarding);
import { Home } from './pages/Home';
const Join = page(() => import('./pages/Join'), m => m.Join);
const Community = page(() => import('./pages/Community'), m => m.Community);
import { go, NEXT_KEY, useRoute } from './lib/router';
// Todos los estilos en la carga inicial (son chicos) y desktop.css al final: las pantallas se bajan aparte
// y, si sus CSS llegaran después, le ganarían a las reglas de PC.
import './stats.css';
import './pitch.css';
import './admin.css';
import './history.css';
import './quickmatch.css';
import './batch2.css';
import './desktop.css';

function App() {
  const route = useRoute();
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  const [me, setMe] = useState<Profile | null>(null);
  const [err, setErr] = useState('');
  const userId = useRef<string | null>(null);

  const refresh = async () => {
    try {
      const p = await loadMe();
      if (p) {
        try {
          const next = localStorage.getItem(NEXT_KEY);
          if (next) { localStorage.removeItem(NEXT_KEY); location.hash = next; }
        } catch { /* sin storage */ }
      }
      if (p) {
        pushSync();
        prefetch([() => import('./pages/Community'), () => import('./pages/Match'), () => import('./pages/Chat'), () => import('./pages/Ranking')]);
      }
      userId.current = p?.user_id ?? null;
      setErr(''); setMe(p); setState(p ? 'in' : 'out');
    } catch (e: any) { setErr(e.message); }
  };

  useEffect(() => {
    refresh();
    // supabase-js emite SIGNED_IN también al volver a la pestaña: solo recargamos si cambió el usuario.
    const { data } = sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_OUT') { pushForget(); setMe(null); setState('out'); }
      else if (ev === 'SIGNED_IN' && session?.user.id !== userId.current) refresh();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (err) return (
    <div class="center">
      <p class="err">{err}</p>
      <button class="btn" onClick={() => location.reload()}>Reintentar</button>
      <button class="btn" onClick={async () => { await pushOff().catch(() => {}); sb.auth.signOut(); }}>Salir</button>
    </div>
  );
  if (state === 'loading') return <div class="center"><p class="muted">Cargando…</p></div>;
  if (state === 'out' || !me) return <Login />;
  if (!me.onboarded) return <Onboarding me={me} done={refresh} />;
  if (route[0] === 'perfil') return <Onboarding me={me} done={async () => { await refresh(); go(''); }} cancel={() => go('')} />;
  if (route[0] === 'join' && route[1]) return <Join code={route[1]} />;
  if (route[0] === 'c' && route[1]) return <Community slug={route[1]} sub={route.slice(2)} me={me} />;
  return <Home me={me} />;
}

render(<Loading><App /></Loading>, document.getElementById('app')!);
