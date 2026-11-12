// "De potrero a leyenda": las situaciones que se te plantean cada temporada. Puro: reciben el estado y el generador, devuelven datos.
// Las ofertas salen de los clubes reales de careerWorld, siempre cerca del nivel que tenés.
import { POS_LABEL, SWITCH_TO } from './careerData';
import { careerOvr, expectedRole, seasonYear } from './careerBase';
import { natTournament } from './careerComps';
import type { Rng } from './careerRng';
import type { Career, Club, EventInst, Fx, LeagueId, Opt } from './careerTypes';
import { CLUBS, LEAGUES, asClub, clubNamed, isOlympicYear, strLabel, type ClubDef } from './careerWorld';

/** Chance de que la Selección te convoque esta temporada: sube con el OVR, el club (más en los de élite) y la vidriera de su liga. */
export function selecChance(c: Career, ovr: number): number {
  if (c.age < 19 || ovr < 66 || c.loan) return 0;
  const bonus = [-8, -5, -1, 2, 4, 6][c.club.tier] + LEAGUES[c.club.lg].vis;
  return 1 / (1 + Math.exp(-(ovr + bonus - 80) / 3.2));
}

/** Chance de que te convoquen a la Sub-23 para los Juegos Olímpicos (solo hasta los 23 y en año olímpico). */
export function olyChance(c: Career, ovr: number): number {
  if (c.age < 18 || c.age > 23 || c.loan || !isOlympicYear(seasonYear(c)) || ovr < 58) return 0;
  const bonus = [-4, -3, -1, 1, 2, 3][c.club.tier];
  return 1 / (1 + Math.exp(-(ovr + bonus - 64) / 4));
}

type Group = 'club' | 'train' | 'career';
interface Ev {
  id: string; group: Group;
  /** 0 = no aplica; 50 o más = obligatorio esa temporada. */
  weight: (c: Career, ovr: number) => number;
  build: (c: Career, r: Rng, ovr: number) => EventInst;
}

const used = (c: Career) => [c.club.name, c.home, ...(c.loan ? [c.loan.name] : []), ...c.history.map(h => h.club)];
const homeClub = (c: Career): Club => clubNamed(c.home) ?? { name: c.home, tier: 2, pw: 66, lg: 'ar1' };
const country = (c: Club) => LEAGUES[c.lg].country;

// ---------- Elegir clubes ----------

const gauss = (x: number, mu: number, sd: number) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));
/** Cuánto aparece cada liga en las ofertas (cerca de casa y las grandes ligas, más; Arabia, MLS y México, menos). */
const BIAS: Record<LeagueId, number> = {
  inf: 0, ar1: 1.5, ar2: 1, br: 1.1, uy: 0.6, cl: 0.5, co: 0.5, py: 0.4, ec: 0.4, mx: 0.55, us: 0.45, sa: 0.35,
  en: 1.1, es: 1.1, it: 1, de: 1, fr: 0.9, pt: 0.8, nl: 0.7, tr: 0.6,
};
const bias = (lg: LeagueId, age: number) => BIAS[lg] * ((lg === 'sa' || lg === 'us' || lg === 'mx') && age >= 29 ? 2.5 : 1);

interface Want { target: number; sd?: number; leagues?: readonly LeagueId[]; avoid: readonly string[]; age: number; min?: number; max?: number }

/** Un club real con la fuerza más cercana a `target` (con algo de azar), que no sea de los que se evitan. */
export function pickClub(r: Rng, w: Want): Club {
  const ok = (c: ClubDef) => (!w.leagues || w.leagues.includes(c.lg)) && (w.min === undefined || c.pw >= w.min) && (w.max === undefined || c.pw <= w.max);
  let list = CLUBS.filter(c => ok(c) && !w.avoid.includes(c.name));
  if (!list.length) list = CLUBS.filter(c => ok(c));
  if (!list.length) list = CLUBS.filter(c => !w.avoid.includes(c.name));
  const sd = w.sd ?? 3.5;
  const d = r.weighted(list.map(c => [c, Math.max(1e-3, gauss(c.pw, w.target, sd)) * bias(c.lg, w.age)] as const)) ?? list[0];
  return asClub(d);
}

/** "Premier League · Mitad de tabla · Serías titular" y, si es otra liga, cómo es. */
function offerHint(c: Career, club: Club, ovr: number): string {
  const L = LEAGUES[club.lg];
  const base = `${L.name} · ${strLabel(club)} · ${expectedRole(ovr - club.pw)}`;
  return club.lg !== c.club.lg && L.flavor ? `${base}. ${L.flavor}` : base;
}

/** Lo que cambia mudarte a un club: más fuerza = más crecimiento; si cambiás de continente, te tenés que adaptar. */
function moveFx(c: Career, club: Club, extra: Fx = {}): Fx {
  const fx: Fx = { move: { club, kind: 'transfer' }, growth: club.pw > c.club.pw + 1 ? 0.15 : club.pw < c.club.pw - 1 ? -0.1 : 0, ...extra };
  if (LEAGUES[club.lg].conf !== LEAGUES[c.club.lg].conf) {
    fx.gamble = { p: 0.6, okText: 'Te adaptaste rápido a la nueva vida.', badText: `Te costó adaptarte a ${LEAGUES[club.lg].country}.`, ok: { form: 0.05 }, bad: { minutes: -0.9, form: -0.12 } };
  }
  return fx;
}

const EUROPE: readonly LeagueId[] = ['en', 'es', 'it', 'de', 'fr', 'pt', 'nl'];

const EVENTS: Ev[] = [
  {
    // La decisión de base de cada temporada: cuánto le ponés al entrenamiento.
    id: 'plan', group: 'train', weight: () => 3.5,
    build: c => {
      const a = c.age;
      const text = a <= 20 ? 'Sos un pibe y el cuerpo te da para todo. ¿Cómo encarás la temporada?'
        : a <= 28 ? 'Estás en plena carrera y cada detalle cuenta. ¿Cómo encarás la temporada?'
          : 'El cuerpo ya no responde como antes. ¿Cómo encarás la temporada?';
      if (a <= 28) {
        const g = a <= 23 ? 0.75 : a <= 26 ? 0.55 : 0.35;
        return {
          id: 'plan', title: 'Preparación de la temporada', text,
          options: [
            { id: 'train', label: 'Doble turno: entrenar de más', hint: 'Crecés más, pero el cuerpo se resiente.',
              fx: { growth: g, injury: 0.05, gamble: { p: 0.88, okText: '', badText: 'Te pasaste de rosca y llegaste cansado a los partidos.', bad: { growth: -0.8, form: -0.15 } } } },
            { id: 'club', label: 'Seguir el plan del club', hint: 'Sin sobresaltos.', fx: {} },
            { id: 'party', label: 'Salir de joda con los pibes', hint: 'Armás vestuario… mientras nadie te vea.',
              fx: { growth: -0.5, form: 0.1, team: 0.04, gamble: { p: 0.72, okText: '', badText: 'Te sacaron fotos saliendo del boliche y el DT se enojó.', bad: { minutes: -1.5, trust: -1 } } } },
          ],
        };
      }
      return {
        id: 'plan', title: 'Preparación de la temporada', text,
        options: [
          { id: 'care', label: 'Cuidar el cuerpo: fisio, dieta y descanso', hint: 'Menos riesgo de lesión; el físico lo agradece.', fx: { injury: -0.07, growth: 0.15 } },
          { id: 'club', label: 'Seguir el plan del club', hint: 'Sin sobresaltos.', fx: {} },
          { id: 'train', label: 'Entrenar como un pibe', hint: 'Podés sumar un poco, pero te la jugás.',
            fx: { growth: 0.4, injury: 0.07, gamble: { p: 0.85, okText: '', badText: 'Te pasó factura: arrancaste la temporada fundido.', bad: { growth: -0.6 } } } },
        ],
      };
    },
  },
  {
    id: 'mentor', group: 'train', weight: c => (c.age <= 23 ? 1.5 : 0),
    build: () => ({
      id: 'mentor', title: 'Un veterano te tiende una mano',
      text: 'El capitán del plantel, un veterano de mil batallas, se ofrece a entrenarte aparte después de la práctica.',
      options: [
        { id: 'yes', label: 'Dejarte aconsejar', hint: 'Aprendés rápido, si el consejo es bueno.',
          fx: { growth: 0.55, form: 0.05, gamble: { p: 0.8, okText: 'Aprendiste un montón de sus mañas.', badText: 'Te llenó la cabeza con mañas que no te sirvieron.', bad: { growth: -0.3, form: -0.1 } } } },
        { id: 'no', label: 'Ir por tu cuenta', hint: 'Tu camino, tus reglas.', fx: { growth: 0.1 } },
      ],
    }),
  },
  {
    id: 'derby', group: 'train', weight: c => (c.club.tier >= 1 ? 1.1 : 0),
    build: () => ({
      id: 'derby', title: 'Se viene el clásico',
      text: 'El tobillo te molesta justo antes del clásico. El DT te deja la decisión a vos.',
      options: [
        { id: 'play', label: 'Jugarlo infiltrado', hint: 'Si sale bien, sos el héroe. Si no, te cuesta.',
          fx: { form: 0.2, team: 0.07, injury: 0.08, gamble: { p: 0.45, okText: 'Fuiste el héroe del clásico.', badText: '', ok: { form: 0.25, team: 0.05 }, bad: {} } } },
        { id: 'rest', label: 'Cuidarte y mirarlo desde el banco', hint: 'Menos riesgo; el equipo te extraña.', fx: { injury: -0.03, team: -0.03 } },
      ],
    }),
  },
  {
    // Fin de las inferiores: obligatorio a los 19 (o antes, si ya sos de los mejores).
    id: 'debut', group: 'club', weight: (c, ovr) => (c.club.tier !== 0 ? 0 : c.age >= 19 ? 100 : c.age >= 18 && ovr >= 57 ? 4 : 0),
    build: (c, r, ovr) => {
      const avoid = used(c);
      const home = homeClub(c);
      const other = pickClub(r, { target: Math.max(home.pw, ovr + 4), sd: 4, leagues: ['ar1', 'ar2'], avoid, age: c.age });
      const opts: Opt[] = [
        { id: 'home', label: `Debutar en ${home.name}`, hint: offerHint(c, home, ovr), fx: { move: { club: home, kind: 'transfer' }, growth: 0.1 } },
        { id: 'other', label: `Probarte en ${other.name}`, hint: offerHint(c, other, ovr), fx: moveFx(c, other) },
      ];
      if (ovr >= 60) {
        const up = pickClub(r, { target: ovr + 7, sd: 4, leagues: ['ar1', 'br', 'uy', 'cl', 'co', 'py', 'ec'], avoid: [...avoid, other.name], age: c.age });
        opts.push({ id: 'up', label: `Dar el salto a ${up.name}`, hint: offerHint(c, up, ovr), fx: moveFx(c, up, { growth: 0.2 }) });
      }
      return {
        id: 'debut', title: c.age >= 19 ? 'Se terminaron las inferiores' : '¡Te quieren en el plantel profesional!',
        text: `Es hora de dar el salto al fútbol de verdad. ¿Dónde querés debutar, ${c.name}?`, options: opts,
      };
    },
  },
  {
    id: 'transfer', group: 'club',
    weight: (c, ovr) => {
      if (c.club.tier === 0 || c.age < 19 || c.stint < 1 || c.loan) return 0;
      const gap = ovr + 2 - c.club.pw;
      if (gap >= 4) return 5 + Math.min(6, (gap - 4) * 0.7);
      if (ovr < c.club.pw - 7) return 3.5;
      return 1.2;
    },
    build: (c, r, ovr) => {
      // Hasta tres tipos de oferta: una más arriba de lo que das, una justa y una más cómoda.
      const slots: [number, number][] = [[ovr + 5, 0.6], [ovr, 0.85], [ovr - 5, 0.5]];
      const k = r.int(1, 3);
      const targets: number[] = [];
      for (let i = 0; i < k; i++) {
        const t = r.weighted(slots.filter(([x]) => !targets.includes(x)).map(([x, w]) => [x, w] as const));
        if (t !== undefined) targets.push(t);
      }
      const avoid = used(c);
      const clubs = targets.map(t => { const club = pickClub(r, { target: t, avoid, age: c.age }); avoid.push(club.name); return club; }).sort((a, b) => b.pw - a.pw);
      const opts: Opt[] = clubs.map((club, i) => ({ id: `o${i}`, label: `Fichar por ${club.name}`, hint: offerHint(c, club, ovr), fx: moveFx(c, club) }));
      opts.push({ id: 'stay', label: `Quedarte en ${c.club.name}`, hint: 'Seguís donde estás, con lo bueno y lo malo.', fx: {} });
      return {
        id: 'transfer', title: clubs.length > 1 ? 'Te llegan ofertas' : 'Te llega una oferta',
        text: 'Se corrió la voz de lo que hacés en la cancha y el teléfono no para de sonar. ¿Te quedás o te vas?', options: opts,
      };
    },
  },
  {
    id: 'loan', group: 'club',
    weight: (c, ovr) => (c.club.tier >= 1 && c.age <= 24 && c.stint >= 1 && !c.loan && ovr < c.club.pw - 2 ? 6 : 0),
    build: (c, r, ovr) => {
      const avoid = used(c);
      const w = { target: c.club.pw - 6, sd: 3, avoid, age: c.age, max: c.club.pw - 1, min: 54 };
      const lend = pickClub(r, w);
      const sell = pickClub(r, { ...w, avoid: [...avoid, lend.name] });
      return {
        id: 'loan', title: 'Casi no jugás',
        text: `En ${c.club.name} hay mucha gente delante tuyo y los minutos no aparecen. ¿Qué hacés?`,
        options: [
          { id: 'loan', label: `Ir cedido a ${lend.name}`, hint: `${LEAGUES[lend.lg].name} · ${expectedRole(ovr - lend.pw)}. Después volvés a ${c.club.name}.`, fx: { move: { club: lend, kind: 'loan' }, growth: 0.2 } },
          { id: 'stay', label: 'Quedarte y pelear el puesto', hint: 'Entrenás con los mejores, pero podés no jugar nunca.',
            fx: { growth: 0.2, minutes: -0.2, gamble: { p: 0.3, okText: 'El DT terminó dándote bola.', badText: '', ok: { minutes: 1.8, trust: 1 }, bad: {} } } },
          { id: 'sell', label: `Pedir la salida a ${sell.name}`, hint: `${LEAGUES[sell.lg].name} · te vas para siempre a un club que te dé lugar.`, fx: { move: { club: sell, kind: 'transfer' } } },
        ],
      };
    },
  },
  {
    id: 'coach', group: 'club',
    weight: (c, ovr) => (c.club.tier >= 1 && c.age >= 20 && !c.loan && c.trust <= 0 && ovr >= c.club.pw - 4 ? 2.2 : 0),
    build: c => ({
      id: 'coach', title: 'El DT no confía en vos',
      text: `Entrenás bien, pero el DT de ${c.club.name} te deja afuera una y otra vez. Dicen que no le gusta tu estilo.`,
      options: [
        { id: 'talk', label: 'Hablar con el DT cara a cara', hint: 'Puede aclarar todo… o empeorarlo.',
          fx: { gamble: { p: 0.55, okText: 'El DT te escuchó y te dio la chance.', badText: 'La charla no sirvió y quedaste peor parado.', ok: { trust: 2, minutes: 0.5 }, bad: { trust: -1 } } } },
        { id: 'work', label: 'Callarte y entrenar el doble', hint: 'Dejás que hablen tus piernas.', fx: { growth: 0.35, minutes: -0.2 } },
        { id: 'press', label: 'Hacerte oír en la prensa', hint: 'Apuesta fuerte: la hinchada o el DT.',
          fx: { gamble: { p: 0.35, okText: 'La hinchada se puso de tu lado y el DT tuvo que ceder.', badText: 'El DT se ofendió y te mandó a la tribuna.', ok: { trust: 2, minutes: 0.8, form: 0.1 }, bad: { trust: -2, minutes: -0.6 } } } },
      ],
    }),
  },
  {
    id: 'captain', group: 'club', weight: c => (c.age >= 24 && c.stint >= 3 && !c.captain && c.club.tier >= 1 && !c.loan ? 2 : 0),
    build: c => ({
      id: 'captain', title: '¡Te ofrecen la cinta de capitán!',
      text: `Después de tantas temporadas en ${c.club.name}, el plantel te quiere de capitán.`,
      options: [
        { id: 'yes', label: 'Aceptar la cinta', hint: 'Más peso en el vestuario y más presión.',
          fx: { captain: true, team: 0.06, trust: 1, gamble: { p: 0.8, okText: '', badText: 'La presión de ser capitán se hizo sentir.', bad: { form: -0.2 } } } },
        { id: 'no', label: 'Dejársela a otro compañero', hint: 'Enfocado solo en jugar.', fx: { growth: 0.15, form: 0.05 } },
      ],
    }),
  },
  {
    id: 'abroad', group: 'club',
    weight: (c, ovr) => (c.age >= 18 && c.age <= 23 && c.club.tier >= 1 && LEAGUES[c.club.lg].conf !== 'uefa' && ovr >= 62 && c.potential >= 78 && !c.loan ? 3.5 : 0),
    build: (c, r, ovr) => {
      const club = pickClub(r, { target: ovr + 6, sd: 4, leagues: EUROPE, avoid: used(c), age: c.age });
      return {
        id: 'abroad', title: 'Una oferta desde Europa',
        text: `${club.name} (${LEAGUES[club.lg].name}) quiere llevarte de pibe. Es la gran chance, pero lejos de todo lo que conocés.`,
        options: [
          { id: 'go', label: `Irte a ${club.name}`, hint: `${offerHint(c, club, ovr)} Riesgo de adaptación.`,
            fx: moveFx(c, club, { growth: 0.4, gamble: { p: 0.5, okText: 'Te adaptaste de maravillas a Europa.', badText: 'Extrañás todo y te cuesta adaptarte.', ok: { growth: 0.5, form: 0.05 }, bad: { minutes: -1.2, form: -0.15 } } }) },
          { id: 'stay', label: `Quedarte en ${c.club.name}`, hint: 'Seguís creciendo en casa.', fx: { growth: 0.15, minutes: 0.3 } },
        ],
      };
    },
  },
  {
    // Plata de sobra a cambio de menos vidriera: Arabia Saudita, la MLS o México.
    id: 'cash', group: 'club',
    weight: c => (c.age >= 28 && c.club.tier >= 2 && !c.loan && !['sa', 'us', 'mx'].includes(c.club.lg) ? (c.age >= 31 ? 3 : 1.6) : 0),
    build: (c, r, ovr) => {
      const lg = r.weighted<LeagueId>([['sa', 0.4], ['us', 0.3], ['mx', 0.3]])!;
      const club = pickClub(r, { target: ovr + 2, leagues: [lg], avoid: used(c), age: c.age });
      const L = LEAGUES[lg];
      return {
        id: 'cash', title: 'Una oferta que no se rechaza',
        text: `${club.name} (${L.name}) te ofrece un contrato gigante. ${L.flavor}`,
        options: [
          { id: 'go', label: `Irte a ${club.name}`, hint: `${L.name} · ${expectedRole(ovr - club.pw)}. Plata de sobra, pero menos exigencia y menos vidriera.`, fx: moveFx(c, club, { minutes: 0.6, growth: -0.1 }) },
          { id: 'stay', label: `Seguir en ${c.club.name}`, hint: 'Todavía tenés cosas que ganar acá.', fx: {} },
        ],
      };
    },
  },
  {
    id: 'comeback', group: 'career', weight: c => (c.lastInjury === 'grave' ? 100 : 0),
    build: () => ({
      id: 'comeback', title: 'Volvés de una lesión grave',
      text: 'Te perdiste buena parte del año pasado. Ahora hay que decidir cómo volvés.',
      options: [
        { id: 'slow', label: 'Rehabilitación a fondo', hint: 'No volvés hasta estar al 100 %.', fx: { growth: 0.5, injury: -0.05, minutes: -0.3 } },
        { id: 'fast', label: 'Apurar la vuelta', hint: 'El equipo te necesita ya.', fx: { injury: 0.07, minutes: 0.4 } },
        { id: 'doc', label: 'Operarte con un especialista famoso', hint: 'Puede salir muy bien… o no.',
          fx: { gamble: { p: 0.5, okText: 'El especialista hizo magia.', badText: 'La recuperación se complicó.', ok: { growth: 1 }, bad: { growth: -0.3, minutes: -0.4 } } } },
      ],
    }),
  },
  {
    id: 'switch', group: 'career', weight: c => (c.age >= 20 && c.age <= 30 && c.club.tier >= 1 && SWITCH_TO[c.pos].length ? 0.8 : 0),
    build: (c, r) => {
      const to = r.pick(SWITCH_TO[c.pos]);
      return {
        id: 'switch', title: `Te quieren de ${POS_LABEL[to].toLowerCase()}`,
        text: `El DT te quiere probar de ${POS_LABEL[to].toLowerCase()} en vez de ${POS_LABEL[c.pos].toLowerCase()}. Dice que le vas a rendir más.`,
        options: [
          { id: 'yes', label: `Aceptar el cambio a ${POS_LABEL[to].toLowerCase()}`, hint: 'Cambia cómo se mide tu juego. Puede salir bien o mal.',
            fx: { pos: to, gamble: { p: 0.55, okText: 'Le encontraste la vuelta al puesto nuevo.', badText: 'Te cuesta el cambio de puesto.', ok: { growth: 0.3, form: 0.05 }, bad: { growth: -0.2, form: -0.1 } } } },
          { id: 'no', label: `Seguir de ${POS_LABEL[c.pos].toLowerCase()}`, hint: 'Lo que sabés hacer.', fx: { form: 0.05 } },
        ],
      };
    },
  },
  {
    id: 'home', group: 'club', weight: c => (c.age >= 31 && !c.returned && !c.returning && c.club.name !== c.home && c.club.tier >= 1 && !c.loan ? 3 : 0),
    build: c => ({
      id: 'home', title: 'Te llaman del club de tus inferiores',
      text: `${c.home} te quiere de vuelta. El barrio entero te espera en la puerta del club.`,
      options: [
        { id: 'back', label: `Volver a ${c.home}`, hint: 'Cumplir el sueño del pibe del barrio. Un clásico final de carrera.', fx: { move: { club: homeClub(c), kind: 'return' }, form: 0.1 } },
        { id: 'stay', label: `Seguir en ${c.club.name}`, hint: 'Todavía tenés cuerda.', fx: {} },
      ],
    }),
  },
];

const BY_ID = new Map(EVENTS.map(e => [e.id, e]));

/** La convocatoria a la Selección (no sale del sorteo: depende de tu OVR). */
function buildSelec(c: Career): EventInst {
  const tour = natTournament(seasonYear(c));
  return {
    id: 'selec', title: '¡Te convocó la Selección!',
    text: `Llegó el llamado para vestir la camiseta de la Selección Argentina.${tour ? ` Y este año se juega ${tour.name}.` : ''} ¿Qué hacés?`,
    options: [
      { id: 'go', label: 'Ir a la Selección', hint: 'Sumás partidos y goles, pero más desgaste.',
        fx: { cap: true, injury: 0.035, gamble: { p: 0.9, okText: '', badText: 'Volviste de la Selección con una molestia.', bad: { injury: 0.15 } } } },
      { id: 'rest', label: 'Pedir descanso', hint: 'Cuidás el cuerpo; la Selección sigue sin vos.', fx: { cap: false, injury: -0.03, growth: 0.1 } },
    ],
  };
}

/** La convocatoria a la Sub-23 para los Juegos Olímpicos (solo hasta los 23 años). */
function buildOly(): EventInst {
  return {
    id: 'oly', title: '¡Te convocó la Sub-23!',
    text: 'Se vienen los Juegos Olímpicos y el DT de la Sub-23 te quiere en la lista. ¿Qué hacés?',
    options: [
      { id: 'go', label: 'Ir a los Juegos Olímpicos', hint: 'Una medalla de oro es para siempre, pero hay desgaste.', fx: { oly: true, injury: 0.03 } },
      { id: 'rest', label: 'Pedir descanso', hint: 'Cuidás el cuerpo para el club.', fx: { oly: false, injury: -0.02, growth: 0.05 } },
    ],
  };
}

/** Peso desde el cual un evento es obligatorio esa temporada (el debut a los 19, la vuelta de una lesión grave). */
const MUST = 50;

/**
 * Las decisiones de la temporada: una (a veces dos). Si te convoca la Selección (o la Sub-23 en año olímpico), esa va última.
 * Dos eventos nunca son del mismo grupo (por ejemplo, dos de club que se pisarían).
 * Los obligatorios (peso de 50 o más) salen siempre: el primero se elige entre ellos y, si hay otro de un grupo distinto,
 * ocupa el segundo lugar (antes que la Selección o una decisión extra al azar).
 */
export function drawEvents(c: Career, r: Rng): EventInst[] {
  const ovr = careerOvr(c.stats, c.pos);
  const called = r.chance(selecChance(c, ovr));
  const oly = !called && r.chance(olyChance(c, ovr));
  const pool = EVENTS.map(e => [e, e.weight(c, ovr)] as const).filter(([, w]) => w > 0);
  const must = pool.filter(([, w]) => w >= MUST);
  const first = r.weighted(must.length ? must : pool) ?? BY_ID.get('plan')!;
  const out = [first.build(c, r, ovr)];
  const mustSecond = must.filter(([e]) => e.group !== first.group);
  const forced = mustSecond.length ? r.weighted(mustSecond) : undefined;
  if (forced) out.push(forced.build(c, r, ovr));
  else if (called) out.push(buildSelec(c));
  else if (oly) out.push(buildOly());
  else if (c.age >= 19 && r.chance(0.3)) {
    const rest = pool.filter(([e, w]) => e.group !== first.group && e.id !== first.id && w < MUST);
    const second = r.weighted(rest);
    if (second) out.push(second.build(c, r, ovr));
  }
  return out;
}

/** Etiquetas cortas de lo que hace una opción, para mostrar sin números. */
export function fxTags(fx: Fx): { t: string; good: boolean | null }[] {
  const out: { t: string; good: boolean | null }[] = [];
  if ((fx.growth ?? 0) >= 0.3) out.push({ t: 'Crecés más', good: true });
  if ((fx.growth ?? 0) <= -0.3) out.push({ t: 'Crecés menos', good: false });
  if ((fx.injury ?? 0) >= 0.03) out.push({ t: 'Más riesgo de lesión', good: false });
  if ((fx.injury ?? 0) <= -0.03) out.push({ t: 'Menos riesgo de lesión', good: true });
  if ((fx.minutes ?? 0) >= 0.3) out.push({ t: 'Más minutos', good: true });
  if ((fx.minutes ?? 0) <= -0.3) out.push({ t: 'Menos minutos', good: false });
  if ((fx.form ?? 0) >= 0.1) out.push({ t: 'Mejor rendimiento', good: true });
  if ((fx.form ?? 0) <= -0.1) out.push({ t: 'Peor rendimiento', good: false });
  if ((fx.team ?? 0) >= 0.05) out.push({ t: 'Más chances de títulos', good: true });
  if ((fx.team ?? 0) <= -0.03) out.push({ t: 'Menos chances de títulos', good: false });
  if ((fx.trust ?? 0) > 0) out.push({ t: 'Confianza del DT', good: true });
  if (fx.cap === true) out.push({ t: 'Suma partidos en la Selección', good: true });
  if (fx.oly === true) out.push({ t: 'Juegos Olímpicos', good: true });
  if (fx.captain) out.push({ t: 'Capitán', good: true });
  if (fx.move) out.push({ t: fx.move.kind === 'loan' ? 'Préstamo' : fx.move.kind === 'return' ? 'Volvés a casa' : country(fx.move.club) === 'Argentina' ? 'Cambio de club' : `Te vas a ${country(fx.move.club)}`, good: null });
  if (fx.pos) out.push({ t: 'Cambio de puesto', good: null });
  if (fx.gamble) out.push({ t: 'Con riesgo', good: null });
  return out;
}

