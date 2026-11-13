-- Aportes a la cancha: quién puso plata (la seña, el resto el día del partido, etc.), cuánto y su alias para que le
-- transfieran. Idempotente; no borra datos.
--
-- 1) match_fee_payments: un aporte por persona y partido (monto > 0 y alias opcional). Se lee como miembro del grupo;
--    se escribe solo con set_fee_payment.
-- 2) set_fee_payment(p_match, p_profile, p_amount, p_alias): crea, cambia o (con p_amount null) saca un aporte.
--      - Un admin carga el de cualquier miembro; un jugador, solo el suyo.
--      - Tiene que haber costo de la cancha cargado y la suma de los aportes no puede pasarlo.
--      - Sin alias, usa el último que esa persona dejó en este grupo.
--      - Si con lo que puso cubre su parte, su anotación queda como pagada.
--    La app calcula a quién le transfiere cada uno (repartija automática): ver settle() en src/features/matches/fees.ts.
-- 3) set_paid: además de cada uno (el suyo) y los admins (cualquiera), quien puso plata marca a quién le transfirió.

-- ---------- 1) Tabla ----------
create table if not exists match_fee_payments (
  match_id uuid not null references matches on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  amount numeric(10,2) not null check (amount > 0 and amount <= 10000000),
  alias text check (alias is null or length(alias) between 1 and 60),
  created_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);
create index if not exists match_fee_payments_profile_idx on match_fee_payments (profile_id);
create index if not exists match_fee_payments_created_by_idx on match_fee_payments (created_by);

alter table match_fee_payments enable row level security;
drop policy if exists mfp_read on match_fee_payments;
create policy mfp_read on match_fee_payments for select
  using (exists (select 1 from matches m where m.id = match_id and is_member(m.community_id)));
-- sin policies de escritura: solo por la RPC
revoke insert, update, delete, truncate, references, trigger on match_fee_payments from anon, authenticated;
grant select on match_fee_payments to authenticated;

-- ---------- 2) Cargar / cambiar / sacar un aporte ----------
create or replace function set_fee_payment(p_match uuid, p_profile uuid, p_amount numeric, p_alias text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; v_alias text; v_others numeric; v_n int; v_each numeric;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if p_profile is null then raise exception 'bad_payment'; end if;
  if p_profile <> me() and not coalesce(is_admin(m.community_id), false) then raise exception 'forbidden'; end if;

  if p_amount is null then
    delete from match_fee_payments where match_id = p_match and profile_id = p_profile;
    return;
  end if;

  if not exists (select 1 from memberships where community_id = m.community_id and profile_id = p_profile)
    then raise exception 'not_member'; end if;
  if m.fee_total is null or m.fee_total <= 0 then raise exception 'no_fee'; end if;
  if p_amount <= 0 or p_amount > 10000000 then raise exception 'bad_payment'; end if;
  select coalesce(sum(amount), 0) into v_others from match_fee_payments where match_id = p_match and profile_id <> p_profile;
  if v_others + p_amount > m.fee_total then raise exception 'over_total'; end if;

  v_alias := nullif(trim(p_alias), '');
  if v_alias is not null and length(v_alias) > 60 then raise exception 'bad_alias'; end if;
  if v_alias is null then
    select x.alias into v_alias from match_fee_payments x join matches mm on mm.id = x.match_id
      where x.profile_id = p_profile and mm.community_id = m.community_id and x.alias is not null and x.match_id <> p_match
      order by x.updated_at desc limit 1;
  end if;

  insert into match_fee_payments (match_id, profile_id, amount, alias, created_by, updated_at)
    values (p_match, p_profile, p_amount, v_alias, me(), now())
    on conflict (match_id, profile_id) do update set amount = excluded.amount, alias = excluded.alias, updated_at = now();

  -- Si lo que puso cubre su parte (la misma cuenta que la app: total / anotados presentes, para arriba), queda pagado.
  select count(*) into v_n from match_signups where match_id = p_match and status = 'in' and not absent;
  if v_n > 0 then
    v_each := ceil(m.fee_total / v_n);
    if p_amount >= v_each then
      update match_signups set paid_at = coalesce(paid_at, now())
        where match_id = p_match and profile_id = p_profile and status = 'in';
    end if;
  end if;
end $$;
revoke execute on function set_fee_payment(uuid, uuid, numeric, text) from public, anon;
grant execute on function set_fee_payment(uuid, uuid, numeric, text) to authenticated, service_role;

-- ---------- 3) Marcar pagos: también los que pusieron plata ----------
create or replace function set_paid(p_match uuid, p_profile uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if p_profile <> me() and not is_admin(m.community_id)
     and not exists (select 1 from match_fee_payments where match_id = p_match and profile_id = me()) then
    raise exception 'forbidden';
  end if;
  update match_signups set paid_at = case when p_paid then coalesce(paid_at, now()) end
    where match_id = p_match and profile_id = p_profile and status = 'in';
  if not found then raise exception 'not_player'; end if;
end $$;
revoke execute on function set_paid(uuid, uuid, boolean) from public, anon;
grant execute on function set_paid(uuid, uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
