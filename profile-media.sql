-- Kreyptedd — Patch additif — profils (avatar/bannière/verrouillage) + médias

alter table app_users add column if not exists avatar_url text;
alter table app_users add column if not exists avatar_expires_at timestamptz;
alter table app_users add column if not exists banner_url text;
alter table app_users add column if not exists banner_expires_at timestamptz;
alter table app_users add column if not exists profile_locked boolean not null default false;

alter table messages add column if not exists media_url text;
alter table messages add column if not exists media_expires_at timestamptz;
