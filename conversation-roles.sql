-- Kreyptedd — Patch — rôle par membre pour les conversations/groupes
alter table conversation_members add column if not exists role text not null default 'member' check (role in ('admin','member'));
