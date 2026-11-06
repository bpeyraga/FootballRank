import { useMemo } from 'preact/hooks';

// Consejos de fair play y cargadas de fútbol de barrio (picantes pero sin ofender). Aparece uno al azar en varias pantallas.
const FAIRPLAY = [
  'Si la pelota se fue afuera y la tocaste vos, decilo. Nadie te va a creer igual, pero queda lindo.',
  'Calificá con honestidad: si le ponés 10 a tu amigo que no tocó una, el ranking se ríe de los dos.',
  'Saludá al rival cuando termina. Total, la semana que viene te vuelve a gambetear igual.',
  'Llegá 10 minutos antes. El que llega tarde va al arco, y con tu cintura, mejor que no.',
  'Pasala. Ya sabemos que te creés Messi, pero la última vez que encaraste perdiste la pelota y la dignidad.',
  'Elongá antes de jugar. A tu edad, un pique corto es una lesión larga.',
  'Si le pegaste sin querer, pedí perdón. Si fue queriendo, pedí perdón y cambiá de equipo.',
  'Votá al MVP por lo que pasó en la cancha, no por quién paga la cerveza del tercer tiempo.',
  'Hidratate. El agua no te hace mejor jugador, pero al menos vas a tener una excusa menos.',
  'Bajarse a último momento es peor que un caño. Si no podés ir, avisá, no seas cagón.',
  'No le grites al compañero que erró un pase. Vos erraste seis y nadie te dijo nada… todavía.',
  'Pedí la pelota solo si la vas a hacer algo con ella. Pedirla para perderla ya lo tenemos cubierto.',
  'El que no paga la cancha no opina sobre cómo se armaron los equipos.',
];

const JOKES = [
  '"Último gol gana" es la mentira más larga del fútbol amateur. Después de River campeón del Nacional B.',
  'Si nadie quiere ir al arco, que vaya el que se ató los cordones tres veces para no correr.',
  'Ese pase al vacío no fue un error: fue una donación al equipo contrario.',
  'El que dice "la próxima la meto" lleva más sequía que Independiente en la Libertadores.',
  'Si te sacaste un 4, no te quejes: hay arqueros que se sacaron un 2 y siguen viniendo.',
  'Hay jugadores que piden la pelota como Riquelme y la pierden como en la final de Madrid.',
  'No hay nadie más peligroso que el que llegó tarde y quiere demostrar algo. Peligroso para sus propios tobillos.',
  'La cancha de 5 es chica, pero a vos te alcanza para que te tiren dos caños en la misma jugada.',
  'Si discuten un lateral más de dos minutos, ya perdieron los dos equipos. Y el que lo discute, la dignidad.',
  'El que no pasa la pelota después llora porque no se la pasan. Hay un nombre para eso: delantero.',
  'El tercer tiempo es el único partido donde algunos ganan seguido.',
  'Patear desde la mitad de la cancha no es valentía: es no saber pasarla.',
  'En la previa todos somos Riquelme; en el penal, todos somos Palermo contra Colombia.',
  'El que se queda colgado arriba "porque no hay offside" corre menos que el arquero. Y el arquero no sale del área ni para ir al baño.',
  'Hincha de Racing: sabe sufrir. Por eso aguanta jugar de defensor con vos.',
  'Hincha de Boca: dice "la 7" cada vez que mete un gol en fútbol 5.',
  'Hincha de River: te explica la jugada con pizarrón aunque hayas perdido 8 a 2.',
  'Hincha de San Lorenzo: festeja un caño como si hubieran devuelto el Gasómetro.',
  'Hincha de Independiente: "Rey de Copas"… pero en este grupo todavía no ganó ni un partido.',
  'Si gambeteás a tres y la perdés con el cuarto, no fue jugada: fue un tutorial de qué no hacer.',
  'Tu promedio de goles es como el colectivo a la madrugada: dicen que existe, pero nadie lo vio.',
];

const ALL = [...FAIRPLAY.map(t => ['🤝', t]), ...JOKES.map(t => ['😂', t])] as const;

/** Un consejo o chiste al azar (cambia cada vez que se entra a la pantalla). */
export function Tip({ kind }: { kind?: 'fairplay' | 'joke' }) {
  const [icon, text] = useMemo(() => {
    const pool = kind === 'fairplay' ? ALL.filter(x => x[0] === '🤝') : kind === 'joke' ? ALL.filter(x => x[0] === '😂') : ALL;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [kind]);
  return (
    <p class="tip"><span aria-hidden="true">{icon}</span><span>{text}</span></p>
  );
}
