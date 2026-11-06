// Datos del inicio (el "controlador"): mi carta, mis comunidades, el próximo partido y si soy del equipo de la app.
import { useEffect, useState } from 'preact/hooks';
import type { Profile, Stats } from '../../shared/supabase';
import { loadBaseStats } from '../auth/api';
import { isAppAdmin, loadMyCommunities, loadOverview, loadSignupSummary } from './api';
import { nextByCommunity, type MyComm, type Next, type SignupSummary } from './model';

export function useHome(me: Profile) {
  const [comms, setComms] = useState<MyComm[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [next, setNext] = useState<Record<string, Next>>({});
  const [hero, setHero] = useState<Next | null>(null); // el partido más cercano de todas mis comunidades
  const [su, setSu] = useState<SignupSummary | null>(null);
  const [nxLoaded, setNxLoaded] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [staff, setStaff] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    loadBaseStats(me.id).then(setStats, () => setStats(null));
    (async () => {
      let list: MyComm[];
      try { list = await loadMyCommunities(me.id); } catch (e: any) { return setErr(e?.message ?? 'Error de red'); }
      setComms(list);
      const ids = list.map(r => r.community.id);
      if (!ids.length) return;
      const { counts, upcoming } = await loadOverview(ids);
      setCounts(counts);
      setNext(nextByCommunity(upcoming));
      const first = upcoming[0] ?? null; // viene ordenado: el más próximo de todas las comunidades
      setHero(first);
      setNxLoaded(true);
      // Una sola consulta más, solo del partido destacado (sin N+1).
      if (first) setSu(await loadSignupSummary(first.id, me.id));
    })();
  }, [me.id]);

  useEffect(() => {
    let live = true;
    if (me.user_id) isAppAdmin(me.user_id).then(ok => { if (live) setStaff(ok); });
    return () => { live = false; };
  }, [me.user_id]);

  return { comms, counts, next, hero, su, nxLoaded, stats, staff, err, setErr };
}
