-- Arquero y formación editable de cada equipo. Idempotente; no borra datos.
--
-- 1) Atributo "arq" (habilidad como arquero, 1 a 99) en la autoevaluación y en los votos. Es opcional (null = sin
--    calificar) y NO entra en el OVR: es aparte, para que un buen jugador de campo que no ataja no baje su nivel.
--    Lo usa el armado de equipos (repartir a los mejores arqueros) y la formación (quién va al arco).
-- 2) Formación de cada equipo en el partido (matches.formation_a / formation_b, p. ej. "2-1-1": defensa → ataque,
--    sin contar al arquero) y el puesto de cada jugador (match_signups.slot: 0 = arco, después de atrás hacia
--    adelante y de izquierda a derecha). Se guardan juntos con la RPC set_lineup (solo admins).
-- 3) Si a un jugador le cambian el equipo, pierde el puesto que tenía (trigger): se vuelve a ubicar solo.

-- ---------- 1) Arquero ----------
alter table base_stats add column if not exists arq int check (arq between 1 and 99);
alter table stat_votes add column if not exists arq int check (arq between 1 and 99);

-- Columnas nuevas al final (create or replace view solo deja agregar al final). avg ignora los null: el promedio
-- de arquero es de los que lo calificaron; n_arq cuenta cuántos.
create or replace view community_ranking with (security_invoker = true) as
  select community_id, target_id as profile_id, count(*) as n_votes,
    round(avg(rit))::int rit, round(avg(tir))::int tir, round(avg(pas))::int pas,
    round(avg(reg))::int reg, round(avg(def))::int def, round(avg(fis))::int fis,
    round((avg(rit)+avg(tir)+avg(pas)+avg(reg)+avg(def)+avg(fis))/6)::int ovr,
    round(avg(arq))::int arq, count(arq) as n_arq
  from stat_votes group by community_id, target_id;

-- Stats de un placeholder: igual que antes, más "arq" opcional. Si p_stats trae la clave "arq" (aunque sea null)
-- se guarda tal cual; si no la trae, queda el valor que tenía.
create or replace function set_player_stats(p_profile uuid, p_community uuid, p_stats jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rit int; v_tir int; v_pas int; v_reg int; v_def int; v_fis int; v_arq int; v_has_arq boolean;
begin
  if not coalesce(is_admin(p_community), false) then raise exception 'forbidden'; end if;
  if not exists (select 1 from memberships where community_id = p_community and profile_id = p_profile)
    then raise exception 'not_member'; end if;
  if not exists (select 1 from profiles where id = p_profile and user_id is null)
    then raise exception 'not_placeholder'; end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then raise exception 'bad_stats'; end if;
  v_has_arq := p_stats ? 'arq';
  begin
    v_rit := round((p_stats->>'rit')::numeric)::int; v_tir := round((p_stats->>'tir')::numeric)::int;
    v_pas := round((p_stats->>'pas')::numeric)::int; v_reg := round((p_stats->>'reg')::numeric)::int;
    v_def := round((p_stats->>'def')::numeric)::int; v_fis := round((p_stats->>'fis')::numeric)::int;
    v_arq := round((p_stats->>'arq')::numeric)::int;
  exception when others then raise exception 'bad_stats';
  end;
  -- least/greatest ignoran los null: si falta alguno de los seis se rechaza aparte
  if v_rit is null or v_tir is null or v_pas is null or v_reg is null or v_def is null or v_fis is null
     or least(v_rit, v_tir, v_pas, v_reg, v_def, v_fis) < 1
     or greatest(v_rit, v_tir, v_pas, v_reg, v_def, v_fis) > 99
     or v_arq < 1 or v_arq > 99 then
    raise exception 'bad_stats';
  end if;

  insert into base_stats (profile_id, rit, tir, pas, reg, def, fis, arq, updated_at)
    values (p_profile, v_rit, v_tir, v_pas, v_reg, v_def, v_fis, v_arq, now())
    on conflict (profile_id) do update set
      rit = excluded.rit, tir = excluded.tir, pas = excluded.pas,
      reg = excluded.reg, def = excluded.def, fis = excluded.fis,
      arq = case when v_has_arq then excluded.arq else base_stats.arq end,
      updated_at = now();
end $$;
revoke execute on function set_player_stats(uuid, uuid, jsonb) from public, anon;
grant execute on function set_player_stats(uuid, uuid, jsonb) to authenticated, service_role;

-- ---------- 2) Formación y puestos ----------
alter table matches add column if not exists formation_a text check (formation_a ~ '^[1-9](-[1-9]){0,5}$');
alter table matches add column if not exists formation_b text check (formation_b ~ '^[1-9](-[1-9]){0,5}$');
alter table match_signups add column if not exists slot smallint check (slot between 0 and 39);

-- p_formation: "2-1-1" o null (null = la de siempre para esa cantidad). p_slots: {"<profile_id>": 0, ...}.
-- Los jugadores del equipo que no vienen en p_slots quedan sin puesto (la app los ubica sola).
create or replace function set_lineup(p_match uuid, p_team text, p_formation text, p_slots jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_comm uuid; v_status text; r record;
begin
  select community_id, status into v_comm, v_status from matches where id = p_match;
  if v_comm is null then raise exception 'not_found'; end if;
  if not coalesce(is_admin(v_comm), false) then raise exception 'forbidden'; end if;
  if v_status = 'cancelled' then raise exception 'cancelled'; end if;
  if p_team is null or p_team not in ('A', 'B') then raise exception 'bad_lineup'; end if;
  if p_formation is not null and p_formation !~ '^[1-9](-[1-9]){0,5}$' then raise exception 'bad_formation'; end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'object' then raise exception 'bad_lineup'; end if;

  if p_team = 'A' then update matches set formation_a = p_formation where id = p_match;
  else update matches set formation_b = p_formation where id = p_match; end if;

  update match_signups set slot = null where match_id = p_match and team = p_team;
  for r in select key, value from jsonb_each(p_slots) loop
    begin
      update match_signups set slot = (r.value #>> '{}')::smallint
        where match_id = p_match and profile_id = r.key::uuid and team = p_team and status = 'in';
    exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
      raise exception 'bad_lineup';
    end;
  end loop;
end $$;
revoke execute on function set_lineup(uuid, text, text, jsonb) from public, anon;
grant execute on function set_lineup(uuid, text, text, jsonb) to authenticated, service_role;

-- ---------- 3) Cambio de equipo: se pierde el puesto ----------
create or replace function signup_clear_slot() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.team is distinct from old.team then new.slot := null; end if;
  return new;
end $$;
drop trigger if exists signup_clear_slot on match_signups;
create trigger signup_clear_slot before update of team on match_signups for each row execute function signup_clear_slot();
revoke execute on function signup_clear_slot() from public, anon, authenticated;

notify pgrst, 'reload schema';
