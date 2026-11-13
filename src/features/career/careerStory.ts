// "De potrero a leyenda": la historia que se cuenta de tu carrera. Titulares de diario (una línea), hitos (tu primer gol, el debut, la Selección…)
// y lo que te quedó cerca. Puro y sin entorno: todo sale de lo que pasó en la temporada.
import { AWARD, LEGACY_STEPS } from './careerData';
import { NAT_CUP_LIST, nationOf } from './careerNations';
import type { Career, SeasonLog } from './careerTypes';
import { CONTS, INTL, LEAGUES } from './careerWorld';

/** "PEYRAGA" → "Peyraga", "DE PAUL" → "De Paul". */
export const nice = (s: string): string => s.toLowerCase().replace(/(^|[\s'-])(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());

// ---------- Hitos ----------

export interface Mile { id: string; icon: string; title: string; sub: string; /** Prioridad: desde 4 sale a pantalla completa. */ big: number }

/** Cuántos goles son un hito. */
export const GOAL_MILES = [50, 100, 200, 300, 500] as const;
const PJ_MILES = [100, 300, 500] as const;

const sum = (xs: readonly SeasonLog[], f: (h: SeasonLog) => number) => xs.reduce((t, h) => t + f(h), 0);

/** Los ids de los hitos que se cumplieron en la última temporada del historial. */
export function milesOf(c: Career): string[] {
  const h = c.history[c.history.length - 1];
  if (!h) return [];
  const prev = c.history.slice(0, -1);
  const out: string[] = [];
  const pro = (x: SeasonLog) => x.lg !== 'inf';
  const g0 = sum(prev, x => x.goals), g1 = g0 + h.goals;
  const pj0 = sum(prev.filter(pro), x => x.pj), pj1 = pj0 + (pro(h) ? h.pj : 0);
  if (pro(h) && h.pj > 0 && !prev.some(x => pro(x) && x.pj > 0)) out.push('debut');
  if (g0 === 0 && h.goals > 0 && pro(h)) out.push('goal1');
  for (const m of GOAL_MILES) if (g0 < m && g1 >= m) out.push(`goals${m}`);
  for (const m of PJ_MILES) if (pj0 < m && pj1 >= m) out.push(`pj${m}`);
  if (h.caps > 0 && !prev.some(x => x.caps > 0)) out.push('caps1');
  else if (h.capGoals > 0 && !prev.some(x => x.capGoals > 0)) out.push('capg1');
  if (h.trophies.length && !prev.some(x => x.trophies.length)) out.push('title1');
  if (LEAGUES[h.lg].conf === 'uefa' && h.pj > 0 && !prev.some(x => LEAGUES[x.lg].conf === 'uefa' && x.pj > 0)) out.push('europe');
  if (h.captain && !prev.some(x => x.captain)) out.push('captain');
  if (h.awards.includes(AWARD.ballon)) out.push('ballon');
  if (h.trophies.includes(INTL.worldCup.name)) out.push('wc');
  const p = prev[prev.length - 1];
  if (p && p.club !== c.home && h.club === c.home && pro(h) && prev.some(pro)) out.push('home');
  let k = 0;
  for (let i = c.history.length - 1; i >= 0 && c.history[i].club === h.club && pro(c.history[i]); i--) k++;
  if (k === 6) out.push('idol');
  const peak0 = prev.reduce((t, x) => Math.max(t, x.ovr0, x.ovr), 0);
  if (peak0 < 90 && h.ovr >= 90) out.push('ovr90');
  else if (peak0 < 80 && h.ovr >= 80) out.push('ovr80');
  return out;
}

const BIG: Record<string, number> = { ballon: 10, wc: 10, debut: 8, caps1: 7, goal1: 6, europe: 6, title1: 5, home: 5, captain: 4, goals100: 4, goals200: 4, goals300: 4, goals500: 4, ovr90: 4 };

/** El hito listo para mostrar: ícono, título corto y subtítulo. */
export function mileInfo(id: string, c: Career, h: SeasonLog): Mile {
  const big = BIG[id] ?? (id.startsWith('goals') ? 3 : 2);
  const m = (icon: string, title: string, sub = ''): Mile => ({ id, icon, title, sub, big });
  const team = nationOf(c.nat).team.replace(/^la /, 'La ');
  if (id === 'debut') return m('🏟️', h.tier >= 2 ? '¡Debutaste en Primera!' : '¡Debutaste como profesional!', h.club);
  if (id === 'goal1') return m('⚽', '¡Tu primer gol!', h.club);
  if (id.startsWith('goals')) return m('⚽', `¡${id.slice(5)} goles en tu carrera!`, h.club);
  if (id.startsWith('pj')) return m('📅', `¡${id.slice(2)} partidos como profesional!`);
  if (id === 'caps1') return m('👕', '¡Te llamó la Selección!', team);
  if (id === 'capg1') return m('🎯', 'Tu primer gol con la Selección', team);
  if (id === 'title1') return m('🏆', '¡Tu primer título!', h.trophies[0]);
  if (id === 'europe') return m('🌍', '¡Llegaste a Europa!', h.club);
  if (id === 'captain') return m('🎖️', '¡Sos el capitán!', h.club);
  if (id === 'ballon') return m('🥇', '¡Balón de Oro!');
  if (id === 'wc') return m('🏆', '¡Campeón del mundo!', team);
  if (id === 'home') return m('❤️', '¡Volviste a casa!', h.club);
  if (id === 'idol') return m('🙌', `¡Ídolo de ${h.club}!`, '6 temporadas en el club');
  if (id === 'ovr90') return m('💎', '¡Entraste a los 90 de OVR!');
  return m('⭐', '¡Llegaste a los 80 de OVR!');
}

/** Los hitos de la última temporada que salen a pantalla completa (hasta dos, los más grandes primero) y los chicos que van en la tarjeta. */
export function milesShown(c: Career, h: SeasonLog): { big: Mile[]; small: Mile[] } {
  const all = h.miles.map(id => mileInfo(id, c, h)).sort((a, b) => b.big - a.big);
  const big = all.filter(x => x.big >= 4).slice(0, 2);
  return { big, small: all.filter(x => !big.includes(x)) };
}

// ---------- Titular ----------

const pickV = <T,>(seed: number, xs: readonly T[]): T => xs[Math.abs(Math.floor(seed)) % xs.length];

const NATIONAL_TROPHIES: ReadonlySet<string> = new Set([...NAT_CUP_LIST.map(t => t.name), INTL.worldCup.name, INTL.olympics.name, INTL.finalissima.name, INTL.u20.name]);

/** El titular de la temporada: una línea de diario, de ocho palabras o menos. */
export function headlineOf(c: Career): string {
  const h = c.history[c.history.length - 1];
  if (!h) return '';
  const S = nice(c.surname), v = c.seed + h.n * 7;
  const prev = c.history[c.history.length - 2];
  const moved = !!prev && prev.club !== h.club;
  const d = h.ovr - h.ovr0;
  const won = (n: string) => h.trophies.includes(n);
  // Los títulos de la Selección (Mundial Sub-20, Finalissima…) no son del club: el titular no puede decir que el club salió campeón
  const clubTrophies = h.trophies.filter(t => !NATIONAL_TROPHIES.has(t));
  if (h.awards.includes(AWARD.ballon)) return `¡Balón de Oro para ${S}!`;
  if (won(INTL.worldCup.name)) return pickV(v, [`¡${S} campeón del mundo!`, `¡Campeones del mundo, y vos de figura!`]);
  if (won(CONTS.cl.name)) return pickV(v, [`¡Gloria eterna en Europa, ${S}!`, `¡${S} levanta la Champions!`]);
  if (won(CONTS.lib.name)) return pickV(v, [`¡${S} levantó la Libertadores!`, `¡Campeón de América!`]);
  if (NAT_CUP_LIST.some(t => won(t.name)) || won(INTL.olympics.name)) return `¡Campeón con la Selección!`;
  if (won(INTL.finalissima.name)) return `¡${S} gana la Finalissima con la Selección!`;
  if (won(INTL.u20.name)) return `¡Campeón del Mundial Sub-20 con ${nationOf(c.nat).name}!`;
  if (h.injury === 'grave') return pickV(v, ['Lesión grave: se frena todo', 'La rodilla dijo basta']);
  if (h.promo === 'down') return `Descenso: ${h.club} se cae`;
  if (h.promo === 'up') return `¡${h.club} asciende con vos!`;
  if (h.ev === 'derby' && h.risk === 'ok' && h.goals > 0) return 'Golazo en el clásico: ya sos ídolo';
  if (h.ev === 'derby' && h.risk === 'bad') return 'El clásico te salió carísimo';
  if (h.risk === 'bad' && (h.ev === 'debut' || h.ev === 'transfer') && !moved) return `Se cayó el pase: seguís en ${h.club}`;
  if (h.risk === 'bad' && moved && (h.ev === 'transfer' || h.ev === 'abroad')) return `Llegaste a ${h.club} y no jugás`;
  if (h.risk === 'ok' && moved && (h.ev === 'transfer' || h.ev === 'abroad' || h.ev === 'debut' || h.ev === 'renewal')) return `¡${S} llega a ${h.club} y la rompe!`;
  if (h.ev === 'home') return h.risk === 'ok' ? 'El barrio te lleva en andas' : 'Volviste y el club no levanta';
  if (h.ev === 'rival') return h.risk === 'ok' ? 'Pasarte al rival: salió perfecto' : 'La hinchada rival te escracha';
  if (h.ev === 'sunset' && h.risk === 'ok') return 'Última gran temporada: vuelve el crack';
  if (h.ev === 'hype' && h.risk === 'bad') return 'Se te subió a la cabeza';
  if (h.ev === 'night' && h.risk === 'bad') return 'Salieron las fotos del boliche';
  if (h.trophies.length >= 2) return `Temporada de ensueño: ${h.trophies.length} títulos`;
  if (clubTrophies.length === 1) return pickV(v, [`¡${h.club} campeón con ${S}!`, `Salís campeón y la gente te canta`]);
  if (h.goals >= 20) return `${h.goals} goles: temporada goleadora`;
  if (h.awards.length) return pickV(v, ['Te llevás un premio individual', `La prensa te elige entre los mejores`]);
  if (d >= 4) return `¡Pegaste el estirón: +${d} de OVR!`;
  if (h.injury) return 'Una lesión te frena';
  if (h.pj < 6) return 'Casi no jugaste: a esperar tu momento';
  if (d <= -3) return 'Se nota el paso del tiempo';
  if (h.rating >= 8) return 'Temporada brillante: la rompés';
  if (h.rating >= 7.3) return 'Gran año: te agrandás';
  if (h.rating < 6.4) return 'Año flojo: la gente pide cambios';
  return pickV(v, [`Temporada pareja en ${h.club}`, 'Un año de laburo y piques']);
}

// ---------- Lo que te quedó cerca ----------

/** Una línea de "casi", o '' si no hubo nada cerca. */
export function nearOf(c: Career): string {
  const h = c.history[c.history.length - 1];
  if (!h) return '';
  if (h.lines.some(l => /perdió la final|Perdiste la final/.test(l))) return 'Perdiste la final: a nada de la gloria';
  if (h.lg !== 'inf' && h.fin === 2 && !h.trophies.length) return 'Subcampeón: a un paso del título';
  if (h.tours.some(t => /^Mundial · No clasificó/.test(t))) return 'Tu Selección se quedó afuera del Mundial';
  const g = c.history.reduce((t, x) => t + x.goals, 0);
  if (h.goals > 0 && c.pos !== 'ARQ') for (const m of GOAL_MILES) if (g < m && m - g <= 8) return `Te quedaste a ${m - g} ${m - g === 1 ? 'gol' : 'goles'} de los ${m}`;
  for (const t of [75, 80, 85, 90]) if (h.ovr === t - 1 && h.ovr > h.ovr0) return `A 1 punto de los ${t} de OVR`;
  return '';
}

/** Para la pantalla final: lo más cercano que quedó (el escalón siguiente del Legado, un OVR redondo o tu mejor carrera), o ''. */
export function endNear(score: number, index: number, peak: number, bestScore?: number | null): string {
  const next = LEGACY_STEPS[index + 1];
  if (next && next.min - score <= Math.max(12, (next.min - LEGACY_STEPS[index].min) * 0.2)) return `A ${next.min - score} pts de ${next.label}`;
  for (const t of [90, 85, 80]) if (peak < t && t - peak <= 3) return `Te faltaron ${t - peak} de OVR para los ${t}`;
  if (bestScore && score < bestScore && bestScore - score <= Math.max(10, bestScore * 0.15)) return `A ${bestScore - score} pts de tu mejor carrera`;
  return '';
}
