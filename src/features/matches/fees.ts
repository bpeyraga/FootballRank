// Cuota de la cancha: cuánto le toca a cada uno y quién debe. Puro (sin Supabase), se puede testear.

/** Lo mínimo de una anotación para saber si paga y si ya pagó. */
export interface PaySignup { profile_id: string; status: string; absent: boolean; paid_at: string | null }

/** Paga la cancha quien está anotado ('in') y no figura ausente. */
export const isPayer = (s: Pick<PaySignup, 'status' | 'absent'>) => s.status === 'in' && !s.absent;

/** Costo total válido (> 0) o null si no hay cuota. Acepta el número o el string que devuelve la API para numeric. */
export function feeNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/** Lo que le toca a cada uno: el total dividido entre los que juegan, redondeado para arriba al peso. */
export function perPerson(total: number | null | undefined, players: number): number {
  const t = feeNum(total);
  if (t == null || players < 1) return 0;
  return Math.ceil(t / players - 1e-9); // el epsilon evita que 30000/3 = 10000.000000000002 pase a 10001
}

/** "$12.500": miles con punto, sin decimales (a mano: los separadores de Intl cambian según el navegador). */
export function money(n: number): string {
  const r = Math.round(Math.abs(n));
  return `${n < 0 ? '-' : ''}$${String(r).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export interface FeeSummary { players: number; paid: number; each: number; owed: number; collected: number }

/** Resumen de un partido: cuántos pagan, cuántos ya pagaron, cuánto es c/u y cuánto falta juntar. */
export function feeSummary(total: number | null | undefined, signups: PaySignup[]): FeeSummary {
  const payers = signups.filter(isPayer);
  const paid = payers.filter(s => s.paid_at).length;
  const each = perPerson(total, payers.length);
  return { players: payers.length, paid, each, owed: (payers.length - paid) * each, collected: paid * each };
}

/** Un aporte a la cancha: alguien puso plata (seña, el resto, etc.) y deja su alias para que le transfieran. */
export interface FeePayment { profile_id: string; amount: number | string; alias?: string | null }
export interface Transfer { to: string; amount: number }
export interface Settlement {
  each: number;
  /** Lo que pusieron entre todos y lo que todavía falta pagarle a la cancha. */
  contributed: number; courtDue: number;
  /** Cuánto tiene que recibir cada uno de los que pusieron plata (lo que puso menos su propia parte, si juega). */
  receive: Map<string, number>;
  /** Cuánto debe cada jugador (su parte menos lo que puso). */
  owes: Map<string, number>;
  /** A quién le transfiere cada uno y cuánto (puede ser a dos personas si le toca repartir). */
  plan: Map<string, Transfer[]>;
  /** La parte de cada uno que todavía no tiene a quién transferirse: falta que alguien cargue el pago del resto de la cancha. */
  unassigned: Map<string, number>;
}

const num = (v: number | string) => (typeof v === 'string' ? Number(v) : v) || 0;

/**
 * Repartija automática: con el costo total, los que juegan (`players`, en un orden fijo: así el reparto no cambia solo)
 * y los aportes, calcula cuánto debe cada uno y a quién le transfiere. Los que pusieron más que su parte reciben la
 * diferencia; a cada deudor se le asigna el que más tiene para recibir, y si no le alcanza, sigue con el próximo.
 * El reparto se arma con todos (hayan marcado "pagué" o no), para que marcar un pago no le cambie el destino a nadie.
 */
export function settle(total: number | null | undefined, players: string[], payments: FeePayment[]): Settlement {
  const t = feeNum(total) ?? 0;
  const each = perPerson(t, players.length);
  const put = new Map<string, number>();
  for (const p of payments) put.set(p.profile_id, (put.get(p.profile_id) ?? 0) + num(p.amount));
  const contributed = [...put.values()].reduce((s, x) => s + x, 0);
  const plays = new Set(players);

  const receive = new Map<string, number>();
  for (const [id, amount] of put) {
    const r = Math.round(amount - (plays.has(id) ? each : 0));
    if (r > 0) receive.set(id, r);
  }
  const owes = new Map<string, number>();
  for (const id of players) {
    const o = Math.max(0, Math.round(each - (put.get(id) ?? 0)));
    if (o > 0) owes.set(id, o);
  }

  const creditors = [...receive].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, r]) => ({ id, left: r }));
  const plan = new Map<string, Transfer[]>();
  const unassigned = new Map<string, number>();
  let c = 0;
  for (const id of players) {
    let left = owes.get(id) ?? 0;
    const tr: Transfer[] = [];
    while (left > 0 && c < creditors.length) {
      const cr = creditors[c];
      const give = Math.min(left, cr.left);
      tr.push({ to: cr.id, amount: give });
      left -= give; cr.left -= give;
      if (cr.left <= 0) c++;
    }
    if (tr.length) plan.set(id, tr);
    if (left > 0) unassigned.set(id, left);
  }
  return { each, contributed, courtDue: Math.max(0, Math.round(t - contributed)), receive, owes, plan, unassigned };
}

/** Un partido jugado con cuota, con sus anotaciones (lo que ya carga la lista de partidos) y los aportes, si los hay. */
export interface FeeMatch {
  id: string; title: string; starts_at: string; status: string; fee_total: number | string | null; signups: PaySignup[];
  payments?: FeePayment[];
}
export interface DebtItem { match_id: string; title: string; starts_at: string; amount: number }
export interface Debt { profile_id: string; total: number; items: DebtItem[] }

/**
 * Deudas pendientes por persona: en cada partido jugado con cuota, los anotados (no ausentes) que no marcaron "pagué"
 * deben total / (anotados no ausentes), redondeado para arriba. De mayor a menor deuda; adentro, del partido más viejo al más nuevo.
 */
export function debtsOf(matches: FeeMatch[]): Debt[] {
  const by = new Map<string, Debt>();
  for (const m of matches) {
    const total = feeNum(m.fee_total);
    if (m.status !== 'played' || total == null) continue;
    const payers = m.signups.filter(isPayer);
    const each = perPerson(total, payers.length);
    if (!each) continue;
    // Lo que cada uno puso para la cancha se le descuenta de su parte
    const put = new Map<string, number>();
    for (const p of m.payments ?? []) put.set(p.profile_id, (put.get(p.profile_id) ?? 0) + num(p.amount));
    for (const s of payers) {
      if (s.paid_at) continue;
      const due = Math.max(0, Math.round(each - (put.get(s.profile_id) ?? 0)));
      if (!due) continue;
      const d = by.get(s.profile_id) ?? { profile_id: s.profile_id, total: 0, items: [] };
      d.total += due;
      d.items.push({ match_id: m.id, title: m.title, starts_at: m.starts_at, amount: due });
      by.set(s.profile_id, d);
    }
  }
  const out = [...by.values()];
  for (const d of out) d.items.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  return out.sort((a, b) => b.total - a.total || a.profile_id.localeCompare(b.profile_id));
}

/** "Debés $7.500 en 3 partidos" */
export const owedText = (d: Pick<Debt, 'total' | 'items'>) =>
  `${money(d.total)} en ${d.items.length} ${d.items.length === 1 ? 'partido' : 'partidos'}`;

/** Mensaje en español para los errores de set_fee / set_paid. */
export function feeError(m: string): string {
  if (m.includes('bad_fee')) return 'El costo tiene que ser un número entre $0 y $10.000.000.';
  if (m.includes('not_player')) return 'Solo pagan los que están anotados.';
  if (m.includes('bad_alias')) return 'El alias puede tener hasta 60 caracteres.';
  if (m.includes('over_total')) return 'Entre todos los aportes no pueden pasar el costo de la cancha.';
  if (m.includes('no_fee')) return 'Primero cargá cuánto sale la cancha.';
  if (m.includes('bad_payment')) return 'El monto tiene que ser mayor a $0.';
  if (m.includes('not_member')) return 'Esa persona ya no es del grupo.';
  if (/set_fee_payment/.test(m) && /Could not find|schema cache/i.test(m)) return 'Esta función todavía no está activa en el servidor. Avisale a quien administra la app.';
  if (m.includes('forbidden') || m.includes('row-level security')) return 'No tenés permiso para hacer eso.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}
