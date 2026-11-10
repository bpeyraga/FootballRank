// Red de seguridad de privacidad sobre la migración de la zona: si alguien la cambia y rompe una de estas reglas, el test avisa.
// (El comportamiento se probó contra un Postgres real con datos de ejemplo; esto solo cuida lo que no debe cambiar sin querer.)
import { describe, expect, it } from 'vitest';

const FILES = import.meta.glob('../../../supabase/migrations/*_zone_ranking.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const SQL = Object.values(FILES)[0] ?? '';
// sin comentarios, para no confundir una explicación con código
const CODE = SQL.replace(/--.*$/gm, '');

/** Cuerpo entre paréntesis que sigue a `marker` (con paréntesis anidados). */
const parens = (marker: string): string => {
  const i = CODE.indexOf(marker);
  if (i < 0) return '';
  const start = CODE.indexOf('(', i + marker.length - 1);
  let depth = 0;
  for (let j = start; j < CODE.length; j++) {
    if (CODE[j] === '(') depth++;
    else if (CODE[j] === ')' && --depth === 0) return CODE.slice(start + 1, j);
  }
  return '';
};

describe('migración de la zona', () => {
  it('existe', () => { expect(Object.keys(FILES)).toHaveLength(1); expect(SQL).toContain('create table if not exists player_zones'); });

  it('la participación es opt-in: public arranca en false', () => {
    expect(CODE).toMatch(/public boolean not null default false/);
  });

  it('la zona vive aparte de profiles (esa tabla se lee entera por quien comparte comunidad)', () => {
    expect(CODE).not.toMatch(/alter table profiles\s+add/i);
  });

  it('solo el dueño lee su fila y no hay policies de escritura (se escribe con las RPCs)', () => {
    expect(CODE).toMatch(/create policy pz_read on player_zones for select using \(profile_id = me\(\)\)/);
    expect(CODE).not.toMatch(/create policy \w+ on player_zones for (insert|update|delete|all)/i);
    expect(CODE).toMatch(/revoke all on player_zones from anon, authenticated/);
    expect(CODE).toMatch(/grant select on player_zones to authenticated/);
  });

  it('la ubicación es gruesa por construcción: 2 decimales en la RPC y en un CHECK', () => {
    expect(CODE).toMatch(/constraint player_zones_coarse check/);
    expect((CODE.match(/round\(p_(lat|lng)::numeric, 2\)/g) ?? []).length).toBe(2);
  });

  it('zone_ranking no recibe coordenadas (evita ubicar a alguien por trilateración) y no devuelve ninguna', () => {
    const args = parens('create or replace function zone_ranking(');
    expect(args).toBeTruthy();
    expect(args).not.toMatch(/\bp_lat\b|\bp_lng\b|\blat\b|\blng\b/);
    const cols = parens('returns table (');
    expect(cols).not.toMatch(/\b(lat|lng|latitude|longitude)\b/);
  });

  it('la distancia sale en bandas, no en kilómetros exactos', () => {
    const cols = parens('returns table (');
    expect(cols).toContain('distance_band');
    expect(cols).not.toMatch(/distance_km|\bkm\b/);
    expect(CODE).toMatch(/case when l\.km < 2 then 2 when l\.km <= 5 then 5 when l\.km <= 10 then 10 when l\.km <= 25 then 25 else 50 end/);
  });

  it('zone_ranking solo acepta los radios 5, 10, 25 y 50', () => {
    expect(CODE).toMatch(/if v_km not in \(5, 10, 25, 50\) then raise exception 'bad_radius'/);
  });

  it('mover la ubicación está limitado (3 cada 24 h) y quitar la zona no borra el registro', () => {
    expect(CODE).toMatch(/v_max_moves constant int := 3/);
    expect(CODE).toMatch(/interval '24 hours'/);
    expect(CODE).toMatch(/raise exception 'too_many_moves'/);
    expect(CODE).toMatch(/create table if not exists player_zone_moves/);
    expect(CODE).toMatch(/revoke all on player_zone_moves from anon, authenticated/);
    expect(CODE).not.toMatch(/create policy \w+ on player_zone_moves/i);
    // clear_my_zone solo borra la zona
    const clear = CODE.slice(CODE.indexOf('create or replace function clear_my_zone'), CODE.indexOf('revoke execute on function clear_my_zone'));
    expect(clear).toMatch(/delete from player_zones/);
    expect(clear).not.toMatch(/player_zone_moves/);
  });

  it('el tope de filas prioriza votados, después promedio (sin desempatar por cercanía), y descarta sin stats antes de cortar', () => {
    expect(CODE).toMatch(/order by \(s\.vn > 0\) desc, \(s\.rit \+ s\.tir \+ s\.pas \+ s\.reg \+ s\.def \+ s\.fis\) desc, s\.pid\s+limit/);
    // desempatar por distancia revelaría quién está más cerca dentro de una banda
    expect(CODE).not.toMatch(/order by[^;\n]*\b[sl]\.km\b/);
    expect(CODE).toMatch(/where vt\.target_id is not null or b\.profile_id is not null\s+\),\s+lim as/);
  });

  it('approve_claim: la zona viaja al perfil que queda, justo antes de soltar la cuenta, sobre la definición viva', () => {
    expect(CODE).toMatch(/v_marker constant text := 'update profiles set user_id = null where id = p_claimant;'/);
    expect(CODE).toMatch(/insert into player_zones \(profile_id, label, lat, lng, public, updated_at\)/);
    expect(CODE).toMatch(/on conflict \(profile_id\) do nothing/);
    expect(CODE).toMatch(/pg_get_functiondef\(v_oid\)/);
    expect(CODE).toMatch(/raise exception 'approve_claim: no encontre un unico/);
  });

  it('solo usuarios con sesión pueden ejecutar las RPCs', () => {
    for (const fn of ['zone_ranking(int, text, int)', 'set_my_zone(text, double precision, double precision, boolean)', 'clear_my_zone()']) {
      expect(CODE).toContain(`revoke execute on function ${fn} from public, anon`);
      expect(CODE).toContain(`grant execute on function ${fn} to authenticated`);
    }
  });

  it('las RPCs son security definer con search_path fijo y termina recargando el esquema', () => {
    expect((CODE.match(/security definer set search_path = public/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(CODE.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
