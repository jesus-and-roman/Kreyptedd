-- =========================================================
-- Kreyptedd — Patch additif — anti-craquage de la couche
-- de hasardisation. Rien ici ne remplace schema.sql.
-- =========================================================

-- Journal des tentatives de calcul/déchiffrement à chaque
-- connexion à une conversation chiffrée. Sert à détecter un
-- pattern d'essais répétés (brute force du NIP ou de la formule).
create table if not exists crack_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  ip_hash text,                          -- même hash irréversible que app_users.ip_hash
  conversation_id uuid,                  -- référence conversations.id (phase 2)
  success boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_crack_attempts_user_time
  on crack_attempts (user_id, attempted_at desc);

create index if not exists idx_crack_attempts_ip_time
  on crack_attempts (ip_hash, attempted_at desc);

-- Verrouillage : au-delà de 8 échecs en 10 minutes pour un même
-- user OU une même IP, on bloque temporairement les nouvelles
-- tentatives (vérifié par l'Edge Function avant tout calcul).
create or replace function is_locked_out(p_user_id uuid, p_ip_hash text)
returns boolean
language sql
stable
as $$
  select (
    (select count(*) from crack_attempts
       where user_id = p_user_id
         and success = false
         and attempted_at > now() - interval '10 minutes') >= 8
    or
    (select count(*) from crack_attempts
       where ip_hash = p_ip_hash
         and success = false
         and attempted_at > now() - interval '10 minutes') >= 8
  );
$$;

alter table crack_attempts enable row level security;

create policy "un user voit ses propres tentatives" on crack_attempts
  for select using (auth.uid() = user_id);
