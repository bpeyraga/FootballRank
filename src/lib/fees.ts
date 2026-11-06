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

/** Un partido jugado con cuota, con sus anotaciones (lo que ya carga la lista de partidos). */
export interface FeeMatch {
  id: string; title: string; starts_at: string; status: string; fee_total: number | string | null; signups: PaySignup[];
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
    for (const s of payers) {
      if (s.paid_at) continue;
      const d = by.get(s.profile_id) ?? { profile_id: s.profile_id, total: 0, items: [] };
      d.total += each;
      d.items.push({ match_id: m.id, title: m.title, starts_at: m.starts_at, amount: each });
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
  if (m.includes('forbidden') || m.includes('row-level security')) return 'No tenés permiso para hacer eso.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}
