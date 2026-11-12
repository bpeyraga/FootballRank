// "De potrero a leyenda": el "controlador" de la pantalla. Mantiene la carrera en curso, la guarda en el dispositivo y carga mi carta (si hay).
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Pos, Profile, Stats } from '../../shared/model';
import { loadBaseStats } from '../auth/api';
import { advance, choose, newCareer, retireNow, type Best, type Career, type StyleId } from './careerCore';
import { loadBest, loadRun, recordIfBest, saveRun } from './careerStore';

export interface StartOpts { name: string; pos: Pos; style: StyleId; useCard: boolean }

const newSeed = () => ((Math.random() * 4294967296) ^ Date.now()) >>> 0;

/** Lo guardado es de cada perfil (el id va en las claves del storage); sin perfil, un cajón común. */
export function useCareer(me?: Profile | null) {
  const uid = me?.id;
  const [run, setRun] = useState<Career | null>(() => loadRun(uid));
  const [best, setBest] = useState<Best | null>(() => loadBest(uid));
  const bestRef = useRef(best);
  /** Mi carta real (autoevaluación): undefined mientras carga, null si no tengo. */
  const [card, setCard] = useState<Stats | null | undefined>(undefined);

  useEffect(() => {
    if (!uid) { setCard(null); return; }
    let live = true;
    loadBaseStats(uid).then(s => { if (live) setCard(s); }, () => { if (live) setCard(null); });
    return () => { live = false; };
  }, [uid]);

  /** Cada paso se guarda; al terminar la carrera se actualiza la mejor. */
  const commit = useCallback((c: Career | null) => {
    setRun(c);
    saveRun(c, uid);
    if (c) { const b = recordIfBest(c, bestRef.current, uid); bestRef.current = b; setBest(b); }
  }, [uid]);

  const start = useCallback((o: StartOpts) => {
    commit(newCareer({ seed: newSeed(), name: o.name, pos: o.pos, style: o.style, card: o.useCard ? card ?? null : null, year: new Date().getFullYear() }));
  }, [card, commit]);

  return {
    run, best, card,
    start,
    pick: (optionId: string) => run && commit(choose(run, optionId)),
    next: () => run && commit(advance(run)),
    retire: () => run && commit(retireNow(run)),
    reset: () => commit(null),
  };
}
