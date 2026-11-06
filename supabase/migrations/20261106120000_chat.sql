-- Chat por comunidad (idempotente)
create table if not exists messages (
  id bigint generated always as identity primary key,
  community_id uuid not null references communities on delete cascade,
  author_id uuid not null references profiles on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists messages_community_created_idx on messages (community_id, created_at desc);

alter table messages enable row level security;

drop policy if exists msg_read on messages;
create policy msg_read on messages for select using (is_member(community_id));

drop policy if exists msg_ins on messages;
create policy msg_ins on messages for insert with check (author_id = me() and is_member(community_id));

-- Cada uno borra lo suyo; owner/admin pueden borrar cualquiera de su comunidad
drop policy if exists msg_del on messages;
create policy msg_del on messages for delete using (author_id = me() or is_admin(community_id));

-- Mensajes en vivo (Supabase Realtime respeta RLS)
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;
