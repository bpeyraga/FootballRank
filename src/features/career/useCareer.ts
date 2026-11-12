// "De potrero a leyenda": el "controlador" de la pantalla. Mantiene la carrera en curso, la guarda en el dispositivo, cuenta los logros y los récords
// (una sola vez por carrera), arma el Desafío del día y carga mi carta (si hay).
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Profile, Stats } from '../../shared/model';
import { trackGame } from '../../app/track';
import { loadBaseStats } from '../auth/api';
import { attemptKey, recordFinish, recordStart, type AchStats } from './careerAchievements';
import { careerOvr } from './careerBase';
import { dailySetup, type DailySetup } from './careerChallenge';
import { advance, choose, newCareer, retireNow, startOptsOf, type Best, type Career } from './careerCore';
import { argDay } from './careerDaily';
import type { Difficulty, StartOpts } from './careerTypes';
import { loadAch, loadBests, loadRun, recordIfBest, saveAch, saveRun } from './careerStore';

export type { StartOpts };

const newSeed = () => ((Math.random() * 4294967296) ^ Date.now()) >>> 0;

/** Lo guardado es de cada perfil (el id va en las claves del storage); sin perfil, un cajón común. */
export function useCareer(me?: Profile | null) {
  const uid = me?.id;
  const [run, setRun] = useState<Career | null>(() => loadRun(uid));
  const [bests, setBests] = useState<Record<Difficulty, Best | null>>(() => loadBests(uid));
  const bestsRef = useRef(bests);
  const [ach, setAch] = useState<AchStats>(() => loadAch(uid));
  const achRef = useRef(ach);
  /** Logros recién desbloqueados que todavía no se mostraron. */
  const [toast, setToast] = useState<string[]>([]);
  /** Mi carta real (autoevaluación): undefined mientras carga, null si no tengo. */
  const [card, setCard] = useState<Stats | null | undefined>(undefined);
  /** El día del Desafío (de la Argentina). Se vuelve a calcular al abrir la pantalla. */
  const [today] = useState(() => argDay());

  useEffect(() => {
    if (!uid) { setCard(null); return; }
    let live = true;
    loadBaseStats(uid).then(s => { if (live) setCard(s); }, () => { if (live) setCard(null); });
    return () => { live = false; };
  }, [uid]);

  const setAchs = useCallback((next: AchStats, newly: string[]) => {
    achRef.current = next; saveAch(next, uid); setAch(next);
    if (newly.length) setToast(t => [...t, ...newly]);
  }, [uid]);

  /** Cuenta la carrera terminada (solo una vez por carrera, ver recordFinish). */
  const countFinish = useCallback((c: Career) => {
    const r = recordFinish(achRef.current, c);
    if (r.stats === achRef.current) return;
    setAchs(r.stats, r.newly);
    trackGame('carrera', 'finish', { seasons: c.history.length, ovr: careerOvr(c.stats, c.pos, c.dpos), difficulty: c.diff });
  }, [setAchs]);

  /** Cada paso se guarda; al terminar la carrera se actualiza la mejor de su dificultad y se cuentan los logros y los récords. */
  const commit = useCallback((c: Career | null) => {
    setRun(c);
    saveRun(c, uid);
    if (!c) return;
    const cur = bestsRef.current[c.diff], b = recordIfBest(c, cur, uid);
    if (b !== cur) { bestsRef.current = { ...bestsRef.current, [c.diff]: b }; setBests(bestsRef.current); }
    if (c.phase === 'over') countFinish(c);
  }, [uid, countFinish]);

  // Si se abre el juego con una carrera ya terminada, se asegura que esté contada (no suma dos veces)
  useEffect(() => { if (run?.phase === 'over') countFinish(run); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = useCallback((c: Career) => {
    const r = recordStart(achRef.current, attemptKey(c), today);
    if (r.stats !== achRef.current) { setAchs(r.stats, r.newly); trackGame('carrera', 'start', { difficulty: c.diff }); }
    commit(c);
  }, [commit, setAchs, today]);

  const start = useCallback((o: StartOpts) => {
    begin(newCareer({
      seed: newSeed(), name: o.name, surname: o.surname, num: o.num, dpos: o.dpos, pos: 'MED', nat: o.nat, foot: o.foot, diff: o.diff, style: o.style,
      card: o.useCard ? card ?? null : null, year: new Date().getFullYear(),
    }));
  }, [card, begin]);

  /** El Desafío del día: la misma semilla y el mismo arranque para todos; tu nombre, apellido y número no cambian nada del juego. */
  const startDaily = useCallback((who: { name: string; surname: string; num: number }) => {
    const S = dailySetup(today);
    begin(newCareer({
      seed: S.seed, name: who.name, surname: who.surname, num: who.num, dpos: S.dpos, pos: 'MED', nat: S.nat, foot: S.foot, diff: S.diff, style: S.style,
      year: S.year, daily: today, aid: newSeed(),
    }));
  }, [begin, today]);

  const daily: DailySetup = dailySetup(today);
  return {
    run, bests, card, ach, toast, today, daily,
    dismissToast: () => setToast(t => t.slice(1)),
    start, startDaily,
    /** "Jugar otra carrera": el mismo jugador, otra semilla, sin pasar por la pantalla de arranque. */
    again: () => { if (run) start(startOptsOf(run)); },
    pick: (optionId: string) => run && commit(choose(run, optionId)),
    next: () => run && commit(advance(run)),
    retire: () => run && commit(retireNow(run)),
    reset: () => commit(null),
  };
}
