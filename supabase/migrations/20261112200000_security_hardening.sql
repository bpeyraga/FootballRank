-- Endurecimiento de seguridad (lo que marcó el asesor de Supabase). Idempotente; no borra datos.
--
-- 1) Sin sesión (rol anon) solo se pueden llamar las funciones que hacen falta antes de entrar: invite_info (la
--    vista previa de una invitación), track_visit / track_install (contador de visitas) y los helpers que usan las
--    policies (me, is_member, is_admin, role_in, shares_community). Al resto se le saca EXECUTE a anon y a PUBLIC
--    (que anon hereda) y se le deja explícito a authenticated y service_role. Las RPCs ya chequeaban quién llama:
--    esto es una capa más, para que una cuenta sin sesión ni siquiera pueda intentarlo.
-- 2) Las funciones de trigger no se llaman como RPC: se les saca EXECUTE a todos los roles de la API. Postgres
--    solo chequea ese permiso al CREAR el trigger, no cuando se dispara, así que los triggers siguen andando.
-- 3) search_path fijo en is_member / is_admin / live_now.
-- 4) La vista match_mvp (security definer a propósito: cuenta votos secretos, y filtra por is_member) queda solo de
--    lectura y solo para usuarios con sesión.
-- 5) Índices para las claves foráneas que no tenían (las consultas por comunidad, autor, etc. no recorren la tabla
--    entera cuando crezca) y se saca un índice duplicado de mvp_votes (hay otro idéntico: no se pierde nada).

do $$
declare
  v_rpc text[] := array[
    'add_many_to_match','add_to_match','approve_claim','community_mvps','create_community','create_poll',
    'join_community','leave_match','load_played_match','match_mvp','next_match','rate_teammates','request_claim',
    'save_push','set_absent','set_captain','set_community_logo','set_community_photo','set_fee','set_paid',
    'set_result','set_role','signup','suspend','vote_mvp','vote_poll'];
  r record;
begin
  -- RPCs: fuera anon / PUBLIC, explícito para authenticated y service_role
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = any (v_rpc)
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;

  -- funciones de trigger del esquema public: nadie las llama por la API
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prorettype = 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- 3) search_path fijo
alter function is_member(uuid) set search_path = public;
alter function is_admin(uuid) set search_path = public;
alter function live_now() set search_path = public;

-- 4) vista match_mvp: solo lectura, solo con sesión
revoke all on match_mvp from anon;
revoke insert, update, delete, truncate, references, trigger on match_mvp from authenticated;
grant select on match_mvp to authenticated;

-- 5) índices de claves foráneas
create index if not exists claims_claimant_idx            on claims (claimant_id);
create index if not exists communities_owner_idx          on communities (owner_id);
create index if not exists complexes_created_by_idx       on complexes (created_by);
create index if not exists custom_stats_target_idx        on custom_stats (target_id);
create index if not exists custom_stats_created_by_idx    on custom_stats (created_by);
create index if not exists match_beers_profile_idx        on match_beers (profile_id);
create index if not exists match_beers_updated_by_idx     on match_beers (updated_by);
create index if not exists match_events_created_by_idx    on match_events (created_by);
create index if not exists match_ratings_target_idx       on match_ratings (target_id);
create index if not exists match_ratings_rater_idx        on match_ratings (rater_id);
create index if not exists match_schedules_created_by_idx on match_schedules (created_by);
create index if not exists match_schedules_venue_idx      on match_schedules (venue_id);
create index if not exists matches_community_idx          on matches (community_id, starts_at desc);
create index if not exists matches_result_by_idx          on matches (result_by);
create index if not exists matches_created_by_idx         on matches (created_by);
create index if not exists matches_venue_idx              on matches (venue_id);
create index if not exists message_reactions_profile_idx  on message_reactions (profile_id);
create index if not exists messages_author_idx            on messages (author_id);
create index if not exists messages_reply_to_idx          on messages (reply_to);
create index if not exists mvp_votes_voter_idx            on mvp_votes (voter_id);
create index if not exists ovr_history_profile_idx        on ovr_history (profile_id);
create index if not exists poll_votes_profile_idx         on poll_votes (profile_id);
create index if not exists poll_votes_community_idx       on poll_votes (community_id);
create index if not exists polls_community_idx            on polls (community_id);
create index if not exists polls_created_by_idx           on polls (created_by);
create index if not exists seasons_created_by_idx         on seasons (created_by);
create index if not exists stat_votes_voter_idx           on stat_votes (voter_id);
create index if not exists suspensions_profile_idx        on suspensions (profile_id);
create index if not exists suspensions_created_by_idx     on suspensions (created_by);
create index if not exists venues_created_by_idx          on venues (created_by);
create index if not exists venues_complex_idx             on venues (complex_id);

-- índice duplicado (mvp_votes_target es idéntico y se queda)
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'mvp_votes_target')
     and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'mvp_votes_target_idx') then
    drop index public.mvp_votes_target_idx;
  end if;
end $$;

notify pgrst, 'reload schema';
