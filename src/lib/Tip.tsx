import { useMemo } from 'preact/hooks';

// Consejos de fair play y chistes de fútbol de barrio. Aparece uno al azar en varias pantallas.
const FAIRPLAY = [
  'Si la pelota se fue afuera y la tocaste vos, decilo. El VAR del fútbol 5 es tu honestidad.',
  'Calificá con la mano en el corazón: el 10 es para el que la rompió, no para el que trajo la pelota.',
  'Saludá al rival cuando termina. La semana que viene capaz te toca en el mismo equipo.',
  'Llegá 10 minutos antes. El que llega tarde va al arco, es ley.',
  'Pasala. El fútbol es un deporte de equipo, aunque a veces no parezca.',
  'Elongá antes de jugar: tus isquiotibiales te lo van a agradecer el lunes.',
  'Si le pegaste sin querer, pedí perdón. Si fue queriendo… también.',
  'Votá al MVP por lo que pasó en la cancha, no por quién te debe plata.',
  'Hidratate. El agua no te hace gambetear mejor, pero evita el calambre del minuto 5.',
  'Bajarse a último momento duele más que un caño. Si no podés ir, avisá con tiempo.',
  'Al que se equivoca, aliento. Al que la mete, abrazo. Al que no paga la cancha, mirada fija.',
];

const JOKES = [
  '"Último gol gana" es la mentira más larga del fútbol amateur.',
  'Si nadie quiere ir al arco, el último en atarse los botines ya sabe lo que le toca.',
  'Ese pase al vacío no fue un error: fue una invitación al rival.',
  'El que dice "la próxima la meto" lleva tres temporadas diciéndolo.',
  'Si te sacaste un 4, mirá el lado bueno: el 3 era del arquero.',
  'Pedir la pelota y perderla al toque es un clásico. Como el Superclásico, pero todas las semanas.',
  'No hay jugador más peligroso que el que llegó tarde y quiere demostrar algo.',
  'La cancha de 5 es chica, pero alcanza para que te gambeteen dos veces en la misma jugada.',
  'Si discuten un lateral más de dos minutos, ya perdieron los dos equipos.',
  'El que no pasa la pelota después no se puede quejar de que no se la pasen.',
  'El tercer tiempo también se juega. Y ahí nadie califica.',
  'Patear al arco desde la mitad de la cancha no es valentía: es fe.',
  'Todos somos Riquelme en la previa y Palermo contra Colombia cuando hay que patear el penal.',
  'El que se queda colgado arriba "porque no hay offside" corre menos que el arquero.',
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
