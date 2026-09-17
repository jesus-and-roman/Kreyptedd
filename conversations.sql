-- =========================================================
-- Kreyptedd — Patch additif — conversations & messages
-- =========================================================

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,                              -- nom du groupe (ou null pour 1-à-1)
  encrypted boolean not null default false, -- false = discussion quotidienne, true = couche NIP
  created_by uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references app_users(id) on delete cascade,
  -- Discussion non chiffrée : contenu en clair.
  -- Discussion chiffrée : payload = résultat final (hasardisation + AES-GCM),
  -- rien n'est lisible sans le NIP de l'utilisateur qui a servi à l'encoder.
  content text,
  encrypted_payload text,
  iv text,                                -- vecteur d'initialisation AES-GCM (base64)
  sent_at timestamptz not null default now()
);

-- Une fois qu'un destinataire a déchiffré et rapatrié le message dans son
-- cache navigateur, on supprime la ligne définitivement de Supabase.
-- Ça se fait via une Edge Function (pas ici) qui delete after read.

create table if not exists deletion_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  requested_by uuid not null references app_users(id) on delete cascade,
  scope text not null check (scope in ('history_mine','history_both','full_chat')),
  created_at timestamptz not null default now(),
  fulfilled boolean not null default false
);

alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table deletion_requests enable row level security;

create policy "membre voit sa conversation" on conversations
  for select using (
    exists (select 1 from conversation_members m where m.conversation_id = id and m.user_id = auth.uid())
  );

create policy "creer une conversation" on conversations
  for insert with check (auth.uid() = created_by);

create policy "voir sa propre appartenance" on conversation_members
  for select using (
    exists (select 1 from conversation_members m2 where m2.conversation_id = conversation_id and m2.user_id = auth.uid())
  );

create policy "membre voit les messages de sa conversation" on messages
  for select using (
    exists (select 1 from conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid())
  );

create policy "membre envoie un message" on messages
  for insert with check (
    auth.uid() = sender_id and
    exists (select 1 from conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid())
  );

create policy "membre demande une suppression" on deletion_requests
  for insert with check (auth.uid() = requested_by);

create policy "membre voit les demandes de sa conversation" on deletion_requests
  for select using (
    exists (select 1 from conversation_members m where m.conversation_id = deletion_requests.conversation_id and m.user_id = auth.uid())
  );
