// Temporadas de una comunidad (el "controlador"): carga una vez y se puede recargar. Lo usan el ranking, el panel de
// admin, la tarjeta de campeones y el perfil del jugador.
import { useEffect, useState } from 'preact/hooks';
import { loadSeasons } from './api';
import type { SeasonsData } from './model';

export function useSeasons(communityId: string) {
  const [data, setData] = useState<SeasonsData | null>(null);
  const [err, setErr] = useState('');
  const [tries, setTries] = useState(0);
  useEffect(() => { setData(null); }, [communityId]);
  useEffect(() => {
    let alive = true;
    setErr('');
    loadSeasons(communityId)
      .then(d => alive && setData(d))
      .catch(e => alive && setErr(e?.message ?? 'Error de red'));
    return () => { alive = false; };
  }, [communityId, tries]);
  return { data, err, reload: () => setTries(t => t + 1) };
}
