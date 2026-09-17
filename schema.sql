-- =========================================================
-- Schéma Supabase — Messagerie privée — Phase 1
-- Comptes (username/mdp + IP anonyme), contacts, ToS
-- =========================================================

-- --- Comptes -------------------------------------------------
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,          -- hash côté serveur (bcrypt/argon2 via Edge Function, jamais en clair)
  email text unique,                     -- optionnel
  email_verified boolean not null default false,
  newsletter_opt_in boolean not null default false,
  contact_code text unique not null,     -- code public à donner aux autres pour être ajouté en contact
  is_ip_account boolean not null default false,
  ip_hash text unique,                   -- hash irréversible (sha256+sel serveur) de l'IP, seulement si is_ip_account
  tos_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_users_ip_hash on app_users (ip_hash) where is_ip_account;

-- --- Conditions d'utilisation (versionnées) -------------------
create table if not exists tos_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  content text not null,                 -- markdown/texte affiché sur la page ToS
  published_at timestamptz not null default now()
);

-- --- Contacts --------------------------------------------------
create table if not exists contact_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references app_users(id) on delete cascade,
  to_user uuid not null references app_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','refused')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (from_user, to_user)
);

create table if not exists contacts (
  user_id uuid not null references app_users(id) on delete cascade,
  contact_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id)
);

-- --- RLS de base -------------------------------------------------
alter table app_users enable row level security;
alter table contact_requests enable row level security;
alter table contacts enable row level security;
alter table tos_versions enable row level security;

create policy "lecture publique tos" on tos_versions
  for select using (true);

create policy "un user voit son propre profil" on app_users
  for select using (auth.uid() = id);

create policy "un user modifie son propre profil" on app_users
  for update using (auth.uid() = id);

create policy "voir ses demandes de contact" on contact_requests
  for select using (auth.uid() = from_user or auth.uid() = to_user);

create policy "creer une demande de contact" on contact_requests
  for insert with check (auth.uid() = from_user);

create policy "repondre a une demande de contact" on contact_requests
  for update using (auth.uid() = to_user);

create policy "voir ses contacts" on contacts
  for select using (auth.uid() = user_id);
