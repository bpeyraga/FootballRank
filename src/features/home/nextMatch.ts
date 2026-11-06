// Cuenta regresiva del "Tu próximo partido" del inicio. Lógica pura (sin Supabase) para poder probarla.

export interface Countdown {
  /** Texto grande: "Hoy", "Mañana", "En 3 días", "En 45 min". */
  big: string;
  /** "21:00" (hora local del partido). */
  time: string;
  /** "jue 12 nov". */
  date: string;
  /** Compacto para una línea: "hoy 21:00", "mañana 21:00", "en 3 días". */
  short: string;
  /** Falta menos de 3 horas (para resaltarlo). */
  soon: boolean;
}

const DAY = 86_400_000;
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const p2 = (n: number) => String(n).padStart(2, '0');

export function countdown(iso: string, now: Date = new Date()): Countdown {
  const at = new Date(iso);
  const time = `${p2(at.getHours())}:${p2(at.getMinutes())}`;
  const date = at.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const ms = at.getTime() - now.getTime();
  const days = Math.round((day0(at) - day0(now)) / DAY);

  if (ms <= 0) return { big: 'Ahora', time, date, short: 'ya empezó', soon: true };
  if (ms < 3_600_000) {
    const m = Math.max(1, Math.ceil(ms / 60_000));
    return { big: `En ${m} min`, time, date, short: `en ${m} min`, soon: true };
  }
  if (ms < 3 * 3_600_000) {
    const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
    const t = m ? `${h} h ${m} min` : `${h} h`;
    return { big: `En ${t}`, time, date, short: `en ${t}`, soon: true };
  }
  if (days <= 0) return { big: 'Hoy', time, date, short: `hoy ${time}`, soon: false };
  if (days === 1) return { big: 'Mañana', time, date, short: `mañana ${time}`, soon: false };
  return { big: `En ${days} días`, time, date, short: `en ${days} días`, soon: false };
}

/** "7/10 anotados", con la lista de espera aparte si hay. */
export function slotsLine(taken: number, slots: number, waiting = 0): string {
  const base = `${taken}/${slots} anotados`;
  return waiting > 0 ? `${base} · ${waiting} en espera` : base;
}
