-- Color de camiseta de cada equipo del partido. Idempotente; no borra datos.
--
-- matches.shirt_a / shirt_b: uno de los colores de la lista (la misma que SHIRTS en src/features/matches/shirts.ts)
-- o 'any' = color indistinto. null = todavía no se eligió. Lo cambian los admins con un update directo (policy mt_upd).

alter table matches add column if not exists shirt_a text;
alter table matches add column if not exists shirt_b text;

do $$
declare
  ok text := '(''blanco'',''negro'',''rojo'',''azul'',''celeste'',''verde'',''amarillo'',''naranja'',''violeta'',''bordo'',''gris'',''rosa'',''any'')';
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_shirt_a_check') then
    execute 'alter table matches add constraint matches_shirt_a_check check (shirt_a is null or shirt_a in ' || ok || ')';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_shirt_b_check') then
    execute 'alter table matches add constraint matches_shirt_b_check check (shirt_b is null or shirt_b in ' || ok || ')';
  end if;
end $$;

notify pgrst, 'reload schema';
