-- Kreyptedd — Patch additif — système d'appel par mini-photos
-- Chats publics (non chiffrés) et 1-à-1 seulement. Chaque photo/légende est
-- supprimée dès qu'elle a été reçue et affichée côté destinataire.

create table if not exists call_frames (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references app_users(id) on delete cascade,
  image_data text not null, -- JPEG basse résolution encodé en base64
  created_at timestamptz not null default now()
);

create table if not exists call_captions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references app_users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table call_frames enable row level security;
alter table call_captions enable row level security;

create policy "membre voit les frames de sa conversation" on call_frames
  for select using (exists (select 1 from conversation_members m where m.conversation_id = call_frames.conversation_id and m.user_id = auth.uid()));
create policy "membre envoie une frame" on call_frames
  for insert with check (auth.uid() = sender_id and exists (select 1 from conversation_members m where m.conversation_id = call_frames.conversation_id and m.user_id = auth.uid()));
create policy "membre supprime une frame de sa conversation" on call_frames
  for delete using (exists (select 1 from conversation_members m where m.conversation_id = call_frames.conversation_id and m.user_id = auth.uid()));

create policy "membre voit les legendes de sa conversation" on call_captions
  for select using (exists (select 1 from conversation_members m where m.conversation_id = call_captions.conversation_id and m.user_id = auth.uid()));
create policy "membre envoie une legende" on call_captions
  for insert with check (auth.uid() = sender_id and exists (select 1 from conversation_members m where m.conversation_id = call_captions.conversation_id and m.user_id = auth.uid()));
create policy "membre supprime une legende de sa conversation" on call_captions
  for delete using (exists (select 1 from conversation_members m where m.conversation_id = call_captions.conversation_id and m.user_id = auth.uid()));

-- Indispensable : active le Realtime sur ces deux tables (sinon les frames
-- et légendes n'arrivent jamais en direct à l'autre personne).
alter publication supabase_realtime add table call_frames;
alter publication supabase_realtime add table call_captions;
