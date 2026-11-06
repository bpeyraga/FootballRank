-- Chat: responder mensajes, fotos y reacciones (idempotente)

-- 1) Respuestas y fotos en messages
alter table messages add column if not exists reply_to bigint references messages on delete set null;
alter table messages add column if not exists image_url text;

-- El texto puede ir vacío si hay foto; la foto tiene que ser del bucket "chat" de este proyecto.
alter table messages drop constraint if exists messages_body_check;
do $$ begin
  alter table messages add constraint messages_content_check check (
    length(btrim(body)) <= 500 and (length(btrim(body)) >= 1 or image_url is not null)
  );
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table messages add constraint messages_image_check check (
    image_url is null or image_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/chat/'
  );
exception when duplicate_object then null;
end $$;

-- Solo se puede responder a un mensaje de la misma comunidad
drop policy if exists msg_ins on messages;
create policy msg_ins on messages for insert with check (
  author_id = me() and is_member(community_id)
  and (reply_to is null or exists (select 1 from messages r where r.id = reply_to and r.community_id = messages.community_id))
);

-- 2) Reacciones: una por persona y mensaje (como WhatsApp)
create table if not exists message_reactions (
  message_id bigint not null references messages on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  community_id uuid not null references communities on delete cascade, -- para RLS y filtrar en tiempo real
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🙏','⚽','🔥')),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);
create index if not exists message_reactions_community_idx on message_reactions (community_id);

alter table message_reactions enable row level security;
drop policy if exists mr_read on message_reactions;
create policy mr_read on message_reactions for select using (is_member(community_id));
drop policy if exists mr_ins on message_reactions;
create policy mr_ins on message_reactions for insert with check (
  profile_id = me() and is_member(community_id)
  and exists (select 1 from messages m where m.id = message_id and m.community_id = message_reactions.community_id)
);
drop policy if exists mr_upd on message_reactions;
create policy mr_upd on message_reactions for update using (profile_id = me()) with check (
  profile_id = me() and is_member(community_id)
  and exists (select 1 from messages m where m.id = message_id and m.community_id = message_reactions.community_id)
);
drop policy if exists mr_del on message_reactions;
create policy mr_del on message_reactions for delete using (profile_id = me());

do $$ begin
  alter publication supabase_realtime add table message_reactions;
exception when duplicate_object then null;
end $$;

-- 3) Fotos del chat: bucket público con nombres imposibles de adivinar (como las fotos de perfil).
--    Ruta: <comunidad>/<perfil>/<uuid>.jpg — solo miembros suben, cada uno en su carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_up on storage.objects;
create policy chat_up on storage.objects for insert to authenticated with check (
  bucket_id = 'chat'
  and (storage.foldername(name))[2] = public.me()::text
  and public.is_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists chat_del on storage.objects;
create policy chat_del on storage.objects for delete to authenticated using (
  bucket_id = 'chat' and (storage.foldername(name))[2] = public.me()::text
);
