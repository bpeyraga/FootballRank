-- Eventos por partido: goles, asistencias y tarjetas (idempotente)
create table if not exists match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references matches on delete cascade,
  community_id uuid not null references communities on delete cascade, -- denormalizado para RLS y filtros
  profile_id uuid not null references profiles on delete cascade,
  kind text not null check (kind in ('goal','assist','yellow','red')),
  created_by uuid references profiles on delete set null, -- null si se borra la cuenta de quien lo cargó
  created_at timestamptz not null default now()
);
create index if not exists match_events_community_idx on match_events (community_id);
create index if not exists match_events_match_idx on match_events (match_id);

alter table match_events enable row level security;

drop policy if exists ev_read on match_events;
create policy ev_read on match_events for select using (is_member(community_id));

-- Carga: admin/owner, o alguien que jugó el partido (anotado 'in'). El evento tiene que ser de la
-- comunidad del partido, sobre un partido ya jugado, y el jugador del evento debe ser miembro y haber jugado.
drop policy if exists ev_ins on match_events;
create policy ev_ins on match_events for insert with check (
  created_by = me()
  and is_member(community_id)
  and exists (select 1 from matches m
              where m.id = match_events.match_id
                and m.community_id = match_events.community_id
                and m.status = 'played')
  and exists (select 1 from memberships mb
              where mb.community_id = match_events.community_id
                and mb.profile_id = match_events.profile_id)
  and exists (select 1 from match_signups js
              where js.match_id = match_events.match_id
                and js.profile_id = match_events.profile_id
                and js.status = 'in')
  and (is_admin(community_id)
       or exists (select 1 from match_signups s
                  where s.match_id = match_events.match_id
                    and s.profile_id = me()
                    and s.status = 'in'))
);

-- Borra: admin/owner de la comunidad o quien lo cargó
drop policy if exists ev_del on match_events;
create policy ev_del on match_events for delete using (is_admin(community_id) or created_by = me());
