import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './styles.css';
import { loadMe, sb, type Profile } from './lib/supabase';
import { Login, NEXT_KEY } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { Home } from './pages/Home';
import { Join } from './pages/Join';
import { Community } from './pages/Community';
import { go, useRoute } from './lib/router';

function App() {
  const route = useRoute();
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  const [me, setMe] = useState<Profile | null>(null);
  const [err, setErr] = useState('');

  const refresh = async () => {
    try {
      const p = await loadMe();
      if (p) {
        try {
          const next = localStorage.getItem(NEXT_KEY);
          if (next) { localStorage.removeItem(NEXT_KEY); location.hash = next; }
        } catch { /* sin storage */ }
      }
      setErr(''); setMe(p); setState(p ? 'in' : 'out');
    } catch (e: any) { setErr(e.message); }
  };

  useEffect(() => {
    refresh();
    const { data } = sb.auth.onAuthStateChange(ev => {
      if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') refresh();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (err) return (
    <div class="center">
      <p class="err">{err}</p>
      <button class="btn" onClick={() => location.reload()}>Reintentar</button>
      <button class="btn" onClick={() => sb.auth.signOut()}>Salir</button>
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

render(<App />, document.getElementById('app')!);
