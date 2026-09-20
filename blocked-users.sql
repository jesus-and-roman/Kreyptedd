-- Kreyptedd — Patch additif — blocage d'utilisateurs
create table if not exists blocked_users (
  user_id uuid not null references app_users(id) on delete cascade,
  blocked_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);

alter table blocked_users enable row level security;

create policy "voir sa propre liste de blocage" on blocked_users
  for select using (auth.uid() = user_id);

create policy "bloquer quelqu'un" on blocked_users
  for insert with check (auth.uid() = user_id);

create policy "debloquer quelqu'un" on blocked_users
  for delete using (auth.uid() = user_id);
