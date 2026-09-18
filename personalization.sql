-- Kreyptedd — Patch additif — personnalisation
alter table app_users add column if not exists display_name text;
alter table app_users add column if not exists bio text;
alter table app_users add column if not exists accent_color text not null default '#a9c9e8';
