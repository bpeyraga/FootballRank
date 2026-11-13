// "De potrero a leyenda": las decisiones de cada temporada. Una sola por año, con dos caminos: el seguro y el que se la juega.
// Puro: reciben el estado y el generador, devuelven datos. Las ofertas salen de los clubes reales de careerWorld, siempre cerca del nivel que tenés.
import { SWITCH_TO } from './careerData';
import { careerOvr, clamp, expectedRole, seasonYear } from './careerBase';
import { natTournament } from './careerComps';
import { nationOf } from './careerNations';
import type { Rng } from './careerRng';
import { DIFFS, DPOS_LABEL, FOOT_OFFER, dposFor } from './careerSetup';
import type { Career, Club, EventInst, Fx, Kind, LeagueId, Opt, Stage, Tension } from './careerTypes';
import { fmtEuro, marketValue } from './careerValue';
import { CLUBS, CLUB_BY_NAME, LEAGUES, asClub, clubNamed, isOlympicYear, type ClubDef } from './careerWorld';

/**
 * Chance de que tu Selección te convoque esta temporada: sube con el OVR, el club (más en los de élite) y la vidriera de su liga,
 * y es más difícil cuanto más profunda es la Selección (Argentina, Brasil o Francia convocan a menos gente que Paraguay o Arabia).
 */
export function selecChance(c: Career, ovr: number): number {
  const pw = nationOf(c.nat).pw;
  if (c.age < 19 || ovr < pw - 18.5 || c.loan) return 0;
  const bonus = [-8, -5, -1, 2, 4, 6][c.club.tier] + LEAGUES[c.club.lg].vis + DIFFS[c.diff].call;
  return 1 / (1 + Math.exp(-(ovr + bonus - (pw - 4.5)) / 3.2));
}

/** Chance de que te convoquen a la Sub-23 para los Juegos Olímpicos (solo hasta los 23 y en año olímpico). */
export function olyChance(c: Career, ovr: number): number {
  const pw = nationOf(c.nat).pw;
  if (c.age < 18 || c.age > 23 || c.loan || !isOlympicYear(seasonYear(c)) || ovr < pw - 26.5) return 0;
  const bonus = [-4, -3, -1, 1, 2, 3][c.club.tier] + DIFFS[c.diff].call * 0.5;
  return 1 / (1 + Math.exp(-(ovr + bonus - (pw - 20.5)) / 4));
}

/** La etapa de la carrera en la que estás. */
export function stageOf(c: Pick<Career, 'age' | 'club' | 'stint' | 'history'>): Stage {
  if (c.club.tier === 0 && c.age < 19) return 'inferiores';
  if (c.club.tier === 0 || !c.history.some(h => h.lg !== 'inf')) return 'debut';
  if (c.age <= 24) return 'consolidacion';
  if (c.age <= 29) return 'pico';
  if (c.age <= 33) return 'veteranía';
  return 'retiro';
}
export const STAGE_LABEL: Record<Stage, string> = { inferiores: 'Inferiores', debut: 'Debut', consolidacion: 'Consolidación', pico: 'Pico', veteranía: 'Veteranía', retiro: 'Retiro' };

// ---------- Ayudas ----------

/** La dificultad hace más probable que las apuestas salgan mal. */
const RISK_ADJ = { normal: 0, intenso: -0.04, experto: -0.08 } as const;
const P = (c: Career, p: number) => clamp(p + RISK_ADJ[c.diff], 0.15, 0.92);

const safe = (icon: string, label: string, up: string, fx: Fx, club?: string): Opt => ({ id: 'safe', kind: 'safe', icon, label, up, fx, ...(club ? { club } : {}) });
const risky = (icon: string, label: string, up: string, down: string, fx: Fx, club?: string): Opt => ({ id: 'risky', kind: 'risky', icon, label, up, down, fx, ...(club ? { club } : {}) });
const ev = (id: string, icon: string, title: string, text: string, a: Opt, b: Opt): EventInst => ({ id, icon, title, text, options: [a, b] });

const used = (c: Career) => [c.club.name, c.home, ...(c.loan ? [c.loan.name] : []), ...c.history.map(h => h.club)];
const homeClub = (c: Career): Club => clubNamed(c.home) ?? { name: c.home, tier: 2, pw: 66, lg: 'ar1' };
/** El país donde jugás en un club: el de su liga (y, en las inferiores, el de la liga del club de origen). */
export const clubCountry = (c: Club): string => (c.lg === 'inf' ? LEAGUES[CLUB_BY_NAME.get(c.name)?.lg ?? 'ar1'].country : LEAGUES[c.lg].country);
/** Ligas de tu país donde podés probarte al debutar (las del club donde te criaste). */
const homeLeagues = (c: Career): LeagueId[] => {
  const lg = CLUB_BY_NAME.get(c.home)?.lg ?? 'ar1';
  return lg === 'ar1' || lg === 'ar2' ? ['ar1', 'ar2'] : [lg];
};
/** Ligas donde podés dar el salto desde tus inferiores: las de tu región. */
const UP_LEAGUES: Record<string, readonly LeagueId[]> = {
  conmebol: ['ar1', 'br', 'uy', 'cl', 'co', 'py', 'ec'], uefa: ['en', 'es', 'it', 'de', 'fr', 'pt', 'nl', 'tr'], concacaf: ['mx', 'us'], afc: ['sa'], caf: ['fr', 'es', 'pt'],
};

/** Los clásicos: cada club con su eterno rival (el que, si te ficha, te hace pasar de héroe a traidor). */
export const RIVALS: Readonly<Record<string, string>> = {
  'Boca Juniors': 'River Plate', 'River Plate': 'Boca Juniors', 'Racing Club': 'Independiente', 'Independiente': 'Racing Club',
  'San Lorenzo': 'Huracán', 'Huracán': 'San Lorenzo', "Newell's Old Boys": 'Rosario Central', 'Rosario Central': "Newell's Old Boys",
  'Estudiantes de La Plata': 'Gimnasia de La Plata', 'Gimnasia de La Plata': 'Estudiantes de La Plata', 'Talleres': 'Belgrano', 'Belgrano': 'Talleres',
  'Banfield': 'Lanús', 'Lanús': 'Banfield', 'Peñarol': 'Nacional de Montevideo', 'Nacional de Montevideo': 'Peñarol',
  'Flamengo': 'Fluminense', 'Fluminense': 'Flamengo', 'Palmeiras': 'Corinthians', 'Corinthians': 'Palmeiras', 'Grêmio': 'Internacional', 'Internacional': 'Grêmio',
  'Colo-Colo': 'Universidad de Chile', 'Universidad de Chile': 'Colo-Colo', 'Olimpia': 'Cerro Porteño', 'Cerro Porteño': 'Olimpia',
  'Real Madrid': 'Barcelona', 'Barcelona': 'Real Madrid', 'Inter': 'Milan', 'Milan': 'Inter', 'Arsenal': 'Tottenham', 'Tottenham': 'Arsenal',
  'Manchester City': 'Manchester United', 'Manchester United': 'Manchester City', 'Benfica': 'Sporting Lisboa', 'Sporting Lisboa': 'Benfica',
};

// ---------- Elegir clubes ----------

const gauss = (x: number, mu: number, sd: number) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));
/** Cuánto aparece cada liga en las ofertas (cerca de casa y las grandes ligas, más; Arabia, MLS y México, menos). */
const BIAS: Record<LeagueId, number> = {
  inf: 0, ar1: 1.5, ar2: 1, br: 1.1, uy: 0.6, cl: 0.5, co: 0.5, py: 0.4, ec: 0.4, mx: 0.55, us: 0.45, sa: 0.35,
  en: 1.1, es: 1.1, it: 1, de: 1, fr: 0.9, pt: 0.8, nl: 0.7, tr: 0.6,
};
/** Los sudamericanos suelen hacer su primera escala en Portugal, Italia o España (o en Brasil), y menos en Inglaterra y Alemania. */
const SA_BIAS: Partial<Record<LeagueId, number>> = { pt: 2.2, it: 1.4, es: 1.3, fr: 1.1, br: 1.2, mx: 0.9, en: 0.7, de: 0.7, nl: 0.9, us: 0.7, tr: 0.8 };
const bias = (lg: LeagueId, age: number, conf?: string) =>
  BIAS[lg] * ((lg === 'sa' || lg === 'us' || lg === 'mx') && age >= 29 ? 2.5 : 1) * (conf === 'conmebol' ? SA_BIAS[lg] ?? 1 : 1);

interface Want { target: number; sd?: number; leagues?: readonly LeagueId[]; avoid: readonly string[]; age: number; min?: number; max?: number; conf?: string }

/** Un club real con la fuerza más cercana a `target` (con algo de azar), que no sea de los que se evitan. */
export function pickClub(r: Rng, w: Want): Club {
  const ok = (c: ClubDef) => (!w.leagues || w.leagues.includes(c.lg)) && (w.min === undefined || c.pw >= w.min) && (w.max === undefined || c.pw <= w.max);
  let list = CLUBS.filter(c => ok(c) && !w.avoid.includes(c.name));
  if (!list.length) list = CLUBS.filter(c => ok(c));
  // Sin candidatos: se afloja todo menos el techo (una cesión nunca va a un club más fuerte que el tuyo) y se queda con los de fuerza más cercana
  if (!list.length) list = CLUBS.filter(c => (w.max === undefined || c.pw <= w.max) && !w.avoid.includes(c.name));
  if (!list.length) list = [...CLUBS].filter(c => w.max === undefined || c.pw <= w.max).sort((a, b) => Math.abs(a.pw - w.target) - Math.abs(b.pw - w.target)).slice(0, 6);
  if (!list.length) list = [...CLUBS].sort((a, b) => Math.abs(a.pw - w.target) - Math.abs(b.pw - w.target)).slice(0, 6);
  const sd = w.sd ?? 3.5;
  const d = r.weighted(list.map(c => [c, Math.max(1e-3, gauss(c.pw, w.target, sd)) * bias(c.lg, w.age, w.conf)] as const)) ?? list[0];
  return asClub(d);
}

/** Cómo es el club en una palabra o dos: la categoría que ganás o perdés. */
function clubUp(c: Career, club: Club, ovr: number): string {
  const L = LEAGUES[club.lg];
  if (L.conf === 'uefa' && clubCountry(c.club) !== L.country && LEAGUES[c.club.lg].conf !== 'uefa') return 'Salto a Europa';
  if (club.pw >= c.club.pw + 4) return 'Mucho más nivel';
  if (club.pw >= c.club.pw + 1) return 'Más categoría';
  return expectedRole(ovr - club.pw);
}

/** Lo que cambia mudarte a un club: más fuerza = más crecimiento (el riesgo de adaptación va en la chance de la apuesta). */
const moveTo = (c: Club, from: Career, extra: Fx = {}): Fx => ({ move: { club: c, kind: 'transfer' }, growth: c.pw > from.club.pw + 1 ? 0.15 : c.pw < from.club.pw - 1 ? -0.1 : 0, ...extra });
/** Irse a vivir a otro país (que no sea el tuyo) cuesta adaptarse: baja un poco la chance de que salga bien. */
export const adapt = (c: Career, to: Club): number => {
  const place = clubCountry(to);
  return place !== clubCountry(c.club) && place !== nationOf(c.nat).name ? -0.07 : 0;
};

// ---------- Las decisiones ----------

interface Ev {
  id: string;
  /** 0 = no aplica; 50 o más = obligatorio esa temporada. */
  weight: (c: Career, ovr: number) => number;
  build: (c: Career, r: Rng, ovr: number) => EventInst;
}

const EVENTS: Ev[] = [
  {
    // La base de cada temporada: cuánto le ponés al entrenamiento.
    id: 'plan', weight: () => 3,
    build: c => {
      const a = c.age;
      if (a <= 28) {
        const g = a <= 23 ? 0.75 : a <= 26 ? 0.55 : 0.35;
        return ev('plan', '🏋️', 'Pretemporada', a <= 20 ? 'Sos un pibe: el cuerpo aguanta todo.' : 'Cada detalle cuenta este año.',
          safe('📋', 'Seguir el plan del club', 'Sin sobresaltos', { growth: 0.1 }),
          risky('💪', 'Doble turno de entrenamiento', 'Crecés más', 'Te pasás de rosca', {
            growth: g * 1.4, injury: 0.05,
            gamble: { p: P(c, 0.64), okText: 'Doble turno: llegás volando.', badText: 'Te pasaste de rosca: llegás cansado.', ok: { growth: 0.25 }, bad: { growth: -1, form: -0.2, injury: 0.08 } },
          }));
      }
      return ev('plan', '🏋️', 'Pretemporada', 'El cuerpo ya no responde como antes.',
        safe('🧘', 'Cuidar el cuerpo', 'Menos lesiones', { injury: -0.07, growth: 0.15 }),
        risky('🔥', 'Entrenar como un pibe', 'Sumás nivel', 'Te rompés', {
          growth: 0.5, injury: 0.05,
          gamble: { p: P(c, 0.6), okText: 'Arrancaste como a los veinte.', badText: 'Arrancaste fundido: el cuerpo avisó.', ok: { growth: 0.3 }, bad: { growth: -0.9, injury: 0.1 } },
        }));
    },
  },
  {
    id: 'night', weight: c => (c.age >= 19 && c.age <= 28 && c.club.tier >= 1 ? 1.2 : 0),
    build: c => ev('night', '🎉', 'Cena con el plantel', 'Los pibes arman una salida. Después, boliche.',
      safe('🏠', 'Quedarte descansando', 'Cuerpo fresco', { injury: -0.02, growth: 0.1 }),
      risky('🥂', 'Salir con el plantel', 'Vestuario unido', 'Te pescan', {
        team: 0.05, form: 0.1,
        gamble: { p: P(c, 0.65), okText: 'Se armó un grupo bárbaro.', badText: 'Salieron las fotos y el DT te borró.', ok: { team: 0.04 }, bad: { minutes: -1.8, trust: -1, form: -0.1 } },
      })),
  },
  {
    id: 'hype', weight: (c, ovr) => (c.age <= 24 && ovr >= 58 && c.club.tier >= 1 ? 1.1 : 0),
    build: c => ev('hype', '📣', 'La prensa habla de vos', 'Te comparan con un crack. ¿Cómo lo llevás?',
      safe('🧊', 'Bajar el perfil', 'Cabeza fría', { growth: 0.2, form: 0.03 }),
      risky('📢', 'Subirte al personaje', 'Pura confianza', 'Se te sube', {
        form: 0.12,
        gamble: { p: P(c, 0.55), okText: 'Jugás con una confianza enorme.', badText: 'Se te subió a la cabeza.', ok: { form: 0.2, growth: 0.4 }, bad: { form: -0.3, minutes: -0.6, trust: -1 } },
      })),
  },
  {
    id: 'derby', weight: c => (c.club.tier >= 1 ? 1.3 : 0),
    build: c => ev('derby', '🔥', 'Se viene el clásico', 'Te molesta el tobillo. Elegís vos.',
      safe('🪑', 'Mirarlo desde el banco', 'Cuidás el cuerpo', { injury: -0.03, team: -0.03 }),
      risky('💉', 'Jugarlo infiltrado', 'Gloria eterna', 'Te lesionás', {
        form: 0.1, team: 0.05, injury: 0.06,
        gamble: { p: P(c, 0.5), okText: 'Fuiste el héroe del clásico.', badText: 'Se te hinchó el tobillo en el clásico.', ok: { form: 0.25, team: 0.08 }, bad: { form: -0.1, injury: 0.1 } },
      })),
  },
  {
    // Fin de las inferiores: obligatorio a los 19 (o antes, si ya sos de los mejores).
    id: 'debut', weight: (c, ovr) => (c.club.tier !== 0 ? 0 : c.age >= 19 ? 100 : c.age >= 18 && ovr >= 57 ? 4 : ovr >= 59 ? 3 : 0),
    build: (c, r, ovr) => {
      const avoid = used(c), home = homeClub(c);
      const up = pickClub(r, {
        target: Math.max(home.pw + 3, ovr + 6), sd: 4, leagues: ovr >= 60 ? UP_LEAGUES[LEAGUES[home.lg].conf] ?? homeLeagues(c) : homeLeagues(c), avoid, age: c.age,
      });
      return ev('debut', '🌟', c.age >= 19 ? 'Se acabaron las inferiores' : '¡Te quieren en Primera!', 'Hora de debutar como profesional.',
        safe('🏠', `Debutar en ${home.name}`, 'Tu casa, tus minutos', { move: { club: home, kind: 'transfer' }, growth: 0.1 }, home.name),
        risky('🚀', `Dar el salto a ${up.name}`, clubUp(c, up, ovr), 'Se cae el pase', {
          gamble: {
            p: P(c, 0.62 + adapt(c, up)), okText: `Te firmaron en ${up.name}.`, badText: `Se cayó el pase: volvés a ${home.name}.`,
            ok: moveTo(up, c, { growth: 0.3 }), bad: { move: { club: home, kind: 'transfer' }, minutes: -0.9, growth: -0.1 },
          },
        }, up.name));
    },
  },
  {
    id: 'transfer',
    weight: (c, ovr) => {
      if (c.club.tier === 0 || c.age < 19 || c.stint < 1 || c.loan) return 0;
      const gap = ovr + 2 - c.club.pw, deals = DIFFS[c.diff].deals;
      if (gap >= 4) return (5.5 + Math.min(6, (gap - 4) * 0.7)) * deals;
      if (ovr < c.club.pw - 7) return 3.5 * deals;
      return 1.5 * deals;
    },
    build: (c, r, ovr) => {
      const lift = DIFFS[c.diff].offers + FOOT_OFFER[c.foot]; // la dificultad y el pie mueven el nivel de los clubes que te quieren
      const reach = r.chance(0.55) ? 6 : 3;
      const club = pickClub(r, { target: ovr + reach + lift, avoid: used(c), age: c.age, conf: nationOf(c.nat).conf });
      const fee = marketValue({ ovr, age: c.age, potential: c.potential, lg: c.club.lg, tier: c.club.tier, rating: c.history[c.history.length - 1]?.rating });
      const far = clubCountry(club) !== clubCountry(c.club);
      // Si el pase se cae, o no se concreta (seguís donde estás) o llegás y no jugás
      const falls = r.chance(0.4);
      const p = P(c, clamp(0.8 - Math.max(0, club.pw - ovr - 2) * 0.035 + adapt(c, club), 0.35, 0.82));
      return ev('transfer', '📞', `Te quiere ${club.name}`, `Ofrecen ${fmtEuro(Math.round(fee * clamp(0.9 + (club.pw - c.club.pw) * 0.02, 0.7, 1.6) / 10_000) * 10_000)} por vos.`,
        safe('🛡️', `Quedarte en ${c.club.name}`, 'Más minutos', { minutes: 0.3, trust: 1 }),
        risky(far ? '✈️' : '🔁', `Fichar por ${club.name}`, clubUp(c, club, ovr), falls ? 'Se cae el pase' : 'Terminás en el banco', {
          gamble: falls
            ? { p, okText: `Firmaste con ${club.name}.`, badText: `Se cayó el pase: seguís en ${c.club.name}.`, ok: moveTo(club, c, { form: 0.05 }), bad: { trust: -1, minutes: -0.4 } }
            : { p, okText: `Firmaste con ${club.name}.`, badText: `Llegaste a ${club.name} y no jugás.`, ok: moveTo(club, c, { form: 0.05 }), bad: moveTo(club, c, { minutes: -1.4, form: -0.1 }) },
        }, club.name));
    },
  },
  {
    id: 'loan', weight: (c, ovr) => (c.club.tier >= 1 && c.club.pw >= 58 && c.age <= 24 && c.stint >= 1 && !c.loan && ovr < c.club.pw - 2 ? 6 : 0),
    build: (c, r, ovr) => {
      const avoid = used(c);
      // un club de menos categoría pero a tu altura: así la cesión es para jugar (y de tu región: una cesión no te manda al otro lado del mundo)
      const lend = pickClub(r, { target: ovr + 1, sd: 2.5, avoid, age: c.age, max: Math.min(c.club.pw - 1, ovr + 3), min: 50, leagues: UP_LEAGUES[LEAGUES[c.club.lg].conf] });
      return ev('loan', '🪑', 'Casi no jugás', `Hay mucha gente delante tuyo en ${c.club.name}.`,
        safe('🔄', `Ir cedido a ${lend.name}`, 'Jugás seguro', { move: { club: lend, kind: 'loan' }, growth: 0.2 }, lend.name),
        risky('⚔️', 'Pelear el puesto acá', 'Pasar a titular', 'Seguís en el banco', {
          growth: 0.2, minutes: -0.2,
          gamble: { p: P(c, 0.4), okText: 'El DT terminó dándote bola.', badText: 'Seguís mirando desde el banco.', ok: { minutes: 1.8, trust: 1 }, bad: { minutes: -0.3 } },
        }));
    },
  },
  {
    id: 'coach', weight: (c, ovr) => (c.club.tier >= 1 && c.age >= 20 && !c.loan && c.trust <= 0 && ovr >= c.club.pw - 4 ? 2.2 : 0),
    build: (c, r) => {
      const press = r.chance(0.4);
      return ev('coach', '😤', 'El DT no te pone', 'Entrenás bien, pero te deja afuera.',
        safe('🤐', 'Callarte y entrenar el doble', 'Ganás nivel', { growth: 0.3, minutes: -0.1 }),
        press
          ? risky('🎤', 'Hablar en la prensa', 'La hinchada te banca', 'Te mandan a la tribuna', {
            gamble: { p: P(c, 0.4), okText: 'La hinchada te bancó y el DT cedió.', badText: 'El DT se ofendió: a la tribuna.', ok: { trust: 2, minutes: 0.8, form: 0.1 }, bad: { trust: -2, minutes: -0.6 } },
          })
          : risky('🗣️', 'Hablar con el DT', 'Ganás su confianza', 'Quedás peor parado', {
            gamble: { p: P(c, 0.52), okText: 'El DT te escuchó y te dio la chance.', badText: 'La charla salió mal.', ok: { trust: 2, minutes: 0.5 }, bad: { trust: -1 } },
          }));
    },
  },
  {
    id: 'captain', weight: c => (c.age >= 24 && c.stint >= 3 && !c.captain && c.club.tier >= 1 && !c.loan ? 2 : 0),
    build: c => ev('captain', '🎖️', '¡La cinta de capitán!', `El plantel de ${c.club.name} te quiere de capitán.`,
      safe('🙅', 'Dejársela a otro', 'Solo jugar', { growth: 0.15, form: 0.05 }),
      risky('©️', 'Aceptar la cinta', 'Líder del vestuario', 'Pesa la presión', {
        captain: true, team: 0.06, trust: 1,
        gamble: { p: P(c, 0.72), okText: 'La cinta te sienta de maravillas.', badText: 'La presión de ser capitán se hizo sentir.', ok: { form: 0.1 }, bad: { form: -0.3 } },
      })),
  },
  {
    id: 'abroad', weight: (c, ovr) => (c.age >= 18 && c.age <= 24 && c.club.tier >= 1 && LEAGUES[c.club.lg].conf !== 'uefa' && ovr >= 60 && c.potential >= 76 && !c.loan ? 4.5 * DIFFS[c.diff].deals : 0),
    build: (c, r, ovr) => {
      const club = pickClub(r, { target: ovr + 6 + DIFFS[c.diff].offers + FOOT_OFFER[c.foot], sd: 4, leagues: EUROPE, avoid: used(c), age: c.age, conf: nationOf(c.nat).conf });
      return ev('abroad', '🌍', `${club.name} te quiere`, `${LEAGUES[club.lg].name}: Europa te llama de pibe.`,
        safe('🏡', 'Seguir creciendo en casa', 'Más minutos', { growth: 0.15, minutes: 0.3 }),
        risky('✈️', `Irte a ${club.name}`, 'Salto a Europa', 'Te cuesta adaptarte', {
          gamble: {
            p: P(c, 0.5), okText: 'Te adaptaste de maravillas a Europa.', badText: 'Extrañás todo y te cuesta adaptarte.',
            ok: moveTo(club, c, { growth: 0.7, form: 0.05 }), bad: moveTo(club, c, { minutes: -1.4, form: -0.15 }),
          },
        }, club.name));
    },
  },
  {
    // Plata de sobra a cambio de menos vidriera: Arabia Saudita, la MLS o México.
    id: 'cash', weight: c => (c.age >= 28 && c.club.tier >= 2 && !c.loan && !['sa', 'us', 'mx'].includes(c.club.lg) ? (c.age >= 31 ? 3 : 1.6) : 0),
    build: (c, r, ovr) => {
      const lg = r.weighted<LeagueId>([['sa', 0.4], ['us', 0.3], ['mx', 0.3]])!;
      const club = pickClub(r, { target: ovr + 2, leagues: [lg], avoid: used(c), age: c.age });
      return ev('cash', '💰', 'Una oferta que no se rechaza', `${club.name} (${LEAGUES[lg].name}) abre la billetera.`,
        safe('🏟️', `Seguir en ${c.club.name}`, 'Todavía hay cuerda', {}),
        risky('💰', `Irte a ${club.name}`, 'Plata y minutos', 'Perdés vidriera', {
          gamble: { p: P(c, 0.65), okText: 'Plata de sobra y minutos de más.', badText: 'La liga es floja y te oxidás.', ok: moveTo(club, c, { minutes: 0.8 }), bad: moveTo(club, c, { growth: -0.6, form: -0.1 }) },
        }, club.name));
    },
  },
  {
    id: 'comeback', weight: c => (c.lastInjury === 'grave' ? 100 : 0),
    build: c => ev('comeback', '🩹', 'La vuelta tras la lesión', 'Fue grave. ¿Cómo volvés?',
      safe('🩺', 'Rehabilitación a fondo', 'Volvés al 100 %', { growth: 0.5, injury: -0.05, minutes: -0.3 }),
      risky('⚡', 'Apurar la vuelta', 'Minutos ya', 'Una recaída', {
        injury: 0.05, minutes: 0.4,
        gamble: { p: P(c, 0.5), okText: 'Volviste antes y jugaste a pleno.', badText: 'Recaíste: la lesión se complicó.', ok: { growth: 0.5, form: 0.15 }, bad: { injury: 0.15, growth: -0.4 } },
      })),
  },
  {
    id: 'switch', weight: c => (c.age >= 20 && c.age <= 30 && c.club.tier >= 1 && SWITCH_TO[c.pos].length ? 0.8 : 0),
    build: (c, r) => {
      const to = r.pick(SWITCH_TO[c.pos]);
      const nd = dposFor(c.dpos, to);
      const was = DPOS_LABEL[c.dpos].toLowerCase(), now = DPOS_LABEL[nd].toLowerCase();
      return ev('switch', '🔀', `Te quieren de ${now}`, `El DT dice que de ${now} rendís más.`,
        safe('✋', `Seguir de ${was}`, 'Lo que sabés', { form: 0.05 }),
        risky('🔀', `Probarte de ${now}`, 'Más rendimiento', 'Te cuesta el cambio', {
          pos: to, dpos: nd,
          gamble: { p: P(c, 0.55), okText: 'Le encontraste la vuelta al puesto.', badText: 'Te cuesta el cambio de puesto.', ok: { growth: 0.3, form: 0.05 }, bad: { growth: -0.2, form: -0.1 } },
        }));
    },
  },
  {
    id: 'home', weight: c => (c.age >= 30 && !c.returned && !c.returning && c.club.name !== c.home && c.club.tier >= 1 && !c.loan ? (c.age >= 34 ? 9 : c.age >= 32 ? 6.5 : 4.5) : 0),
    build: c => {
      const home = homeClub(c);
      return ev('home', '❤️', `Te llama ${c.home}`, 'El club de tus inferiores. El barrio te espera.',
        safe('🏟️', `Seguir en ${c.club.name}`, 'Todavía hay cuerda', {}),
        risky('❤️', `Volver a ${c.home}`, 'Cumplir el sueño', 'El club está en crisis', {
          move: { club: home, kind: 'return' }, form: 0.1,
          gamble: { p: P(c, 0.65), okText: 'El barrio te llevó en andas.', badText: 'El club está en crisis y no levanta.', ok: { team: 0.05, form: 0.1 }, bad: { team: -0.12 } },
        }, home.name));
    },
  },
  {
    id: 'rival', weight: c => {
      const r = RIVALS[c.club.name];
      return r && CLUB_BY_NAME.has(r) && c.club.tier >= 2 && c.age >= 21 && c.age <= 33 && c.stint >= 2 && !c.loan && c.club.lg !== 'inf' ? 1.6 : 0;
    },
    build: c => {
      const rival = clubNamed(RIVALS[c.club.name])!;
      return ev('rival', '😈', `Te quiere ${rival.name}`, `El rival de siempre. La hinchada mira.`,
        safe('💚', 'Honrar la camiseta', 'Ídolo del club', { trust: 1, form: 0.05, team: 0.02 }),
        risky('🔥', `Pasarte a ${rival.name}`, 'Un desafío nuevo', 'La hinchada te escracha', {
          gamble: { p: P(c, 0.5), okText: `Brillás en ${rival.name} y nadie habla.`, badText: 'Te escrachan en cada cancha.', ok: moveTo(rival, c, { growth: 0.3, form: 0.1 }), bad: moveTo(rival, c, { form: -0.25, minutes: -0.5 }) },
        }, rival.name));
    },
  },
  {
    id: 'renewal', weight: c => (c.stint >= 3 && c.club.tier >= 1 && c.age >= 22 && c.age <= 31 && !c.loan ? 1.5 : 0),
    build: (c, r, ovr) => {
      const avoid = used(c);
      const better = pickClub(r, { target: ovr + 4, avoid, age: c.age, conf: nationOf(c.nat).conf });
      const worse = pickClub(r, { target: Math.min(c.club.pw - 3, ovr - 3), avoid: [...avoid, better.name], age: c.age, max: c.club.pw, conf: nationOf(c.nat).conf });
      return ev('renewal', '✍️', 'Se vence tu contrato', `${c.club.name} te ofrece renovar.`,
        safe('✍️', 'Renovar con el club', 'Seguridad y minutos', { trust: 1, minutes: 0.2 }),
        risky('🕵️', 'Esperar mejores ofertas', 'Un club más grande', 'Te quedás sin ofertas', {
          gamble: { p: P(c, 0.55), okText: `Se abrió la puerta de ${better.name}.`, badText: `Solo te queda ${worse.name}.`, ok: moveTo(better, c, { growth: 0.2 }), bad: moveTo(worse, c, { form: -0.05 }) },
        }, better.name));
    },
  },
  {
    id: 'sunset', weight: c => (c.age >= 34 && c.club.tier >= 1 ? 4 : 0),
    build: c => ev('sunset', '🌇', 'Ya no sos el de antes', 'El cuerpo pasa factura. ¿Cómo cerrás?',
      safe('🧊', 'Jugar más tranquilo', 'Menos lesiones', { injury: -0.06, growth: 0.1, minutes: -0.2 }),
      risky('🔥', 'Una última gran temporada', 'Volver a brillar', 'Se rompe el físico', {
        growth: 0.2, injury: 0.05,
        gamble: { p: P(c, 0.45), okText: 'Volviste a brillar como en los viejos tiempos.', badText: 'El físico dijo basta.', ok: { growth: 1.2, form: 0.25 }, bad: { growth: -0.5, injury: 0.12 } },
      })),
  },
  {
    id: 'youth', weight: (c, ovr) => (c.club.tier === 0 && c.age >= 18 && ovr >= 54 ? 3 : 0),
    build: c => ev('youth', '⚡', 'El DT de Primera te llama', 'Te invitan a entrenar con los grandes.',
      safe('🌱', 'Seguir en juveniles', 'Crecés tranquilo', { growth: 0.25, injury: -0.01 }),
      risky('⚡', 'Entrenar con los grandes', 'Salto de nivel', 'Te pasan por arriba', {
        growth: 0.3,
        gamble: { p: P(c, 0.5), okText: 'El plantel grande te adoptó.', badText: 'Los grandes te pasaron por arriba.', ok: { growth: 0.7, form: 0.1 }, bad: { growth: -0.4 } },
      })),
  },
];

const EUROPE: readonly LeagueId[] = ['en', 'es', 'it', 'de', 'fr', 'pt', 'nl'];
const BY_ID = new Map(EVENTS.map(e => [e.id, e]));

/** La convocatoria a la Selección: ir (con riesgo de lesión) o pedir descanso. Si no sale en el sorteo, vas igual (con un poco de desgaste). */
function buildSelec(c: Career): EventInst {
  const tour = natTournament(seasonYear(c), nationOf(c.nat));
  return ev('selec', '👕', '¡Te llamó la Selección!', tour ? `${nationOf(c.nat).team.replace(/^la /, 'La ')}: este año se juega ${tour.name}.` : `${nationOf(c.nat).team.replace(/^la /, 'La ')} te quiere.`,
    safe('🛌', 'Pedir descanso', 'Cuerpo al 100 %', { cap: false, injury: -0.03, growth: 0.1 }),
    risky('👕', 'Ir con la Selección', 'Gloria con la celeste', 'Volvés lesionado', {
      cap: true, injury: 0.035,
      gamble: { p: P(c, 0.78), okText: 'Volviste de la Selección en llamas.', badText: 'Volviste de la Selección con una molestia.', ok: { form: 0.1 }, bad: { injury: 0.18 } },
    }));
}

/** La convocatoria a la Sub-23 para los Juegos Olímpicos (solo hasta los 23 años). */
function buildOly(c: Career): EventInst {
  return ev('oly', '🥇', '¡Te llamó la Sub-23!', 'Se vienen los Juegos Olímpicos.',
    safe('🛌', 'Pedir descanso', 'Cuidás el cuerpo', { oly: false, injury: -0.02, growth: 0.05 }),
    risky('🥇', 'Ir a los Juegos', 'Medalla de oro', 'Volvés lesionado', {
      oly: true, injury: 0.03,
      gamble: { p: P(c, 0.8), okText: 'Volviste de los Juegos más fuerte.', badText: 'Volviste de los Juegos golpeado.', ok: { growth: 0.1 }, bad: { injury: 0.15 } },
    }));
}

/** El momento clave de una final: tu equipo llegó y vos inclinás la balanza. Las opciones llevan en `fx.fin` cuánto suman (o restan) a la fuerza del equipo en el partido. */
export function buildFinal(t: Tension, c: Career): EventInst {
  return ev('final', '⚡', `Final: ${t.name}`, 'Último minuto. La pelota te llega a vos.',
    safe('🧘', 'Jugarla con calma', 'Llegás como venís', {}),
    risky('🎯', 'Pedir el penal decisivo', 'Héroe de la final', 'Villano si lo errás', {
      gamble: { p: P(c, 0.55), okText: 'Hiciste explotar el estadio con tu penal.', badText: 'Se te fue el penal y la tribuna enmudeció.', ok: { fin: 5 }, bad: { fin: -4 } },
    }));
}

/** Peso desde el cual un evento es obligatorio esa temporada (el debut a los 19, la vuelta de una lesión grave). */
const MUST = 50;
/** Si te convocan y no sale esa decisión, vas igual: el desgaste de la Selección ya cuenta. */
export const CALL_WEAR = 0.02;

export interface Draw { ev: EventInst; cap: boolean; oly: boolean }

/**
 * La decisión de la temporada: una sola, con dos caminos. Los obligatorios (peso de 50 o más) salen siempre; si te convoca la Selección
 * (o la Sub-23 en año olímpico) esa decisión pesa más, y si no sale igual vas a la convocatoria. No se repite la de la temporada anterior.
 */
export function drawDecision(c: Career, r: Rng): Draw {
  const ovr = careerOvr(c.stats, c.pos, c.dpos); // el mismo OVR que se ve en pantalla y que usa la temporada (con la posición en la cancha)
  const called = r.chance(selecChance(c, ovr));
  const oly = !called && r.chance(olyChance(c, ovr));
  const base = EVENTS.map(e => [e.id, e.weight(c, ovr) * (e.id === c.last ? 0.2 : 1)] as const).filter(([, w]) => w > 0);
  const pool: (readonly [string, number])[] = [...base, ...(called ? [['selec', 3.5] as const] : oly ? [['oly', 3] as const] : [])];
  const must = pool.filter(([, w]) => w >= MUST);
  const id = r.weighted(must.length ? must : pool) ?? 'plan';
  const inst = id === 'selec' ? buildSelec(c) : id === 'oly' ? buildOly(c) : (BY_ID.get(id) ?? BY_ID.get('plan')!).build(c, r, ovr);
  return { ev: inst, cap: called && id !== 'selec', oly: oly && id !== 'oly' };
}

