-- Registrar jugadores sin cuenta (placeholders) y gestionar los pedidos de "soy yo".
-- Idempotente (create or replace) y sin borrar datos: se puede pegar en el SQL editor y correr más de una vez.
--   1) add_player / add_players      alta de uno o varios jugadores (admins)
--   2) update_player                 editar datos de un placeholder (admins)
--   3) set_player_stats              stats iniciales de un placeholder (admins)
--   4) reject_claim                  rechazar (owner) o cancelar (quien reclama) un pedido
--   5) pending_claims                pedidos pendientes de la comunidad (owner)
-- No toca request_claim ni approve_claim. Los límites son los mismos de los constraints de profiles / base_stats:
--   name 1-40, pos ARQ/DEF/MED/DEL, nickname 1-20, shirt_number 1-99, fav_team 1-40, stats 1-99.
-- Un perfil "placeholder" es el que tiene user_id null: la persona todavía no entró con una cuenta.
-- Quien edita a un placeholder es un admin; los usuarios con cuenta se editan a sí mismos (policy p_upd).

-- ---------- 1) Alta de jugadores ----------
create or replace function add_player(
  p_community uuid, p_name text, p_pos text,
  p_nickname text default null, p_shirt int default null, p_fav_team text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nm text := btrim(coalesce(p_name, ''));
  ps text := coalesce(nullif(btrim(coalesce(p_pos, '')), ''), 'MED');
  nk text := nullif(btrim(coalesce(p_nickname, '')), '');
  ft text := nullif(btrim(coalesce(p_fav_team, '')), '');
  pid uuid;
begin
  if not coalesce(is_admin(p_community), false) then raise exception 'forbidden'; end if;
  if length(nm) not between 1 and 40 then raise exception 'bad_name'; end if;
  if ps not in ('ARQ', 'DEF', 'MED', 'DEL') then raise exception 'bad_pos'; end if;
  if nk is not null and length(nk) > 20 then raise exception 'bad_nickname'; end if;
  if p_shirt is not null and p_shirt not between 1 and 99 then raise exception 'bad_shirt'; end if;
  if ft is not null and length(ft) > 40 then raise exception 'bad_team'; end if;

  insert into profiles (user_id, name, pos, nickname, shirt_number, fav_team, onboarded)
    values (null, nm, ps, nk, p_shirt, ft, true)
    returning id into pid;
  insert into memberships (community_id, profile_id, role) values (p_community, pid, 'member');
  return pid;
end $$;
revoke execute on function add_player(uuid, text, text, text, int, text) from public, anon;
grant execute on function add_player(uuid, text, text, text, int, text) to authenticated;

-- Versión en lote para cargar el plantel de una vez: p_players = [{"name":"Juan","pos":"DEL"}, ...]
-- (opcionales por jugador: nickname, shirt, fav_team). Hasta 60 por llamada; si uno falla no se crea ninguno.
create or replace function add_players(p_community uuid, p_players jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  nm text; ps text; nk text; ft text; sh int;
  pid uuid;
  n int := 0;
begin
  if not coalesce(is_admin(p_community), false) then raise exception 'forbidden'; end if;
  if p_players is null or jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) = 0 then
    raise exception 'bad_players';
  end if;
  if jsonb_array_length(p_players) > 60 then raise exception 'too_many'; end if;

  for it in select value from jsonb_array_elements(p_players) loop
    if jsonb_typeof(it) <> 'object' then raise exception 'bad_players'; end if;
    nm := btrim(coalesce(it->>'name', ''));
    ps := coalesce(nullif(btrim(coalesce(it->>'pos', '')), ''), 'MED');
    nk := nullif(btrim(coalesce(it->>'nickname', '')), '');
    ft := nullif(btrim(coalesce(it->>'fav_team', '')), '');
    begin
      sh := nullif(it->>'shirt', '')::int;
    exception when others then raise exception 'bad_shirt';
    end;
    if length(nm) not between 1 and 40 then raise exception 'bad_name'; end if;
    if ps not in ('ARQ', 'DEF', 'MED', 'DEL') then raise exception 'bad_pos'; end if;
    if nk is not null and length(nk) > 20 then raise exception 'bad_nickname'; end if;
    if sh is not null and sh not between 1 and 99 then raise exception 'bad_shirt'; end if;
    if ft is not null and length(ft) > 40 then raise exception 'bad_team'; end if;

    insert into profiles (user_id, name, pos, nickname, shirt_number, fav_team, onboarded)
      values (null, nm, ps, nk, sh, ft, true)
      returning id into pid;
    insert into memberships (community_id, profile_id, role) values (p_community, pid, 'member');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function add_players(uuid, jsonb) from public, anon;
grant execute on function add_players(uuid, jsonb) to authenticated;

-- ---------- 2) Editar un placeholder ----------
-- Solo admins de una comunidad a la que pertenece el jugador, y solo si no tiene cuenta (user_id null).
create or replace function update_player(
  p_profile uuid, p_community uuid, p_name text, p_pos text,
  p_nickname text default null, p_shirt int default null, p_fav_team text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  nm text := btrim(coalesce(p_name, ''));
  ps text := btrim(coalesce(p_pos, ''));
  nk text := nullif(btrim(coalesce(p_nickname, '')), '');
  ft text := nullif(btrim(coalesce(p_fav_team, '')), '');
begin
  if not coalesce(is_admin(p_community), false) then raise exception 'forbidden'; end if;
  if not exists (select 1 from memberships where community_id = p_community and profile_id = p_profile)
    then raise exception 'not_member'; end if;
  if not exists (select 1 from profiles where id = p_profile and user_id is null)
    then raise exception 'not_placeholder'; end if;
  if length(nm) not between 1 and 40 then raise exception 'bad_name'; end if;
  if ps not in ('ARQ', 'DEF', 'MED', 'DEL') then raise exception 'bad_pos'; end if;
  if nk is not null and length(nk) > 20 then raise exception 'bad_nickname'; end if;
  if p_shirt is not null and p_shirt not between 1 and 99 then raise exception 'bad_shirt'; end if;
  if ft is not null and length(ft) > 40 then raise exception 'bad_team'; end if;

  update profiles set name = nm, pos = ps, nickname = nk, shirt_number = p_shirt, fav_team = ft
    where id = p_profile and user_id is null;
end $$;
revoke execute on function update_player(uuid, uuid, text, text, text, int, text) from public, anon;
grant execute on function update_player(uuid, uuid, text, text, text, int, text) to authenticated;

-- ---------- 3) Stats de un placeholder ----------
-- p_stats = {"rit":70,"tir":60,"pas":65,"reg":60,"def":50,"fis":55}; los seis son obligatorios y van de 1 a 99.
create or replace function set_player_stats(p_profile uuid, p_community uuid, p_stats jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rit int; v_tir int; v_pas int; v_reg int; v_def int; v_fis int;
begin
  if not coalesce(is_admin(p_community), false) then raise exception 'forbidden'; end if;
  if not exists (select 1 from memberships where community_id = p_community and profile_id = p_profile)
    then raise exception 'not_member'; end if;
  if not exists (select 1 from profiles where id = p_profile and user_id is null)
    then raise exception 'not_placeholder'; end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then raise exception 'bad_stats'; end if;
  begin
    v_rit := round((p_stats->>'rit')::numeric)::int; v_tir := round((p_stats->>'tir')::numeric)::int;
    v_pas := round((p_stats->>'pas')::numeric)::int; v_reg := round((p_stats->>'reg')::numeric)::int;
    v_def := round((p_stats->>'def')::numeric)::int; v_fis := round((p_stats->>'fis')::numeric)::int;
  exception when others then raise exception 'bad_stats';
  end;
  -- least/greatest ignoran los null: si falta alguno de los seis se rechaza aparte
  if v_rit is null or v_tir is null or v_pas is null or v_reg is null or v_def is null or v_fis is null
     or least(v_rit, v_tir, v_pas, v_reg, v_def, v_fis) < 1
     or greatest(v_rit, v_tir, v_pas, v_reg, v_def, v_fis) > 99 then
    raise exception 'bad_stats';
  end if;

  insert into base_stats (profile_id, rit, tir, pas, reg, def, fis, updated_at)
    values (p_profile, v_rit, v_tir, v_pas, v_reg, v_def, v_fis, now())
    on conflict (profile_id) do update set
      rit = excluded.rit, tir = excluded.tir, pas = excluded.pas,
      reg = excluded.reg, def = excluded.def, fis = excluded.fis, updated_at = now();
end $$;
revoke execute on function set_player_stats(uuid, uuid, jsonb) from public, anon;
grant execute on function set_player_stats(uuid, uuid, jsonb) to authenticated;

-- ---------- 4) Rechazar o cancelar un pedido de "soy yo" ----------
-- El owner de una comunidad a la que pertenece el placeholder (misma regla que approve_claim) rechaza;
-- quien reclama puede cancelar su propio pedido.
create or replace function reject_claim(p_placeholder uuid, p_claimant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if me() is null then raise exception 'forbidden'; end if;
  if p_claimant is distinct from me()
     and not exists (select 1 from memberships m where m.profile_id = p_placeholder and role_in(m.community_id) = 'owner')
  then raise exception 'forbidden'; end if;
  delete from claims where placeholder_id = p_placeholder and claimant_id = p_claimant;
  if not found then raise exception 'no_claim'; end if;
end $$;
revoke execute on function reject_claim(uuid, uuid) from public, anon;
grant execute on function reject_claim(uuid, uuid) to authenticated;

-- ---------- 5) Pedidos pendientes de una comunidad (solo el owner) ----------
-- Trae también el nombre y la foto de quien reclama (no comparte comunidad necesariamente con el owner, por eso es security definer).
create or replace function pending_claims(p_community uuid)
returns table (placeholder_id uuid, placeholder_name text, claimant_id uuid, claimant_name text, claimant_photo text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if role_in(p_community) is distinct from 'owner' then raise exception 'forbidden'; end if;
  return query
    select c.placeholder_id,
           coalesce(nullif(btrim(pp.nickname), ''), pp.name),
           c.claimant_id,
           coalesce(nullif(btrim(cp.nickname), ''), cp.name),
           cp.photo_url,
           c.created_at
    from claims c
    join profiles pp on pp.id = c.placeholder_id
    join profiles cp on cp.id = c.claimant_id
    where pp.user_id is null
      and exists (select 1 from memberships m where m.community_id = p_community and m.profile_id = c.placeholder_id)
    order by c.created_at;
end $$;
revoke execute on function pending_claims(uuid) from public, anon;
grant execute on function pending_claims(uuid) to authenticated;
