-- =========================================================
-- Kreyptedd — Patch additif — score de sécurité système
-- =========================================================

create table if not exists security_score (
  id int primary key default 1,
  score int not null default 100 check (score between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into security_score (id, score) values (1, 100) on conflict (id) do nothing;

-- Journal des cracks confirmés (pas juste des échecs individuels, mais
-- des reprises réussies après un verrouillage -> signe qu'un pattern de
-- brute force a fini par retomber juste). On ne log jamais la formule
-- secrète, seulement le nombre de rounds obtenu et le contexte.
create table if not exists crack_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  ip_hash text,
  rounds_result int,
  repeat_offense boolean not null default false,
  created_at timestamptz not null default now()
);

alter table security_score enable row level security;
alter table crack_log enable row level security;
-- Lecture du score autorisée à tout utilisateur connecté (badge dans l'app).
create policy "lecture du score par tous les connectes" on security_score
  for select using (auth.role() = 'authenticated');

-- Diminue le score : -10 pour une première détection, -25 si le même
-- user/IP réussit de nouveau après un premier crack_log (comportement
-- confirmé/reproductible = grosse baisse).
create or replace function apply_crack_penalty(p_user_id uuid, p_ip_hash text, p_rounds int)
returns int
language plpgsql
as $$
declare
  v_repeat boolean;
  v_penalty int;
  v_new_score int;
begin
  select exists(
    select 1 from crack_log
    where (user_id = p_user_id or ip_hash = p_ip_hash)
      and created_at > now() - interval '7 days'
  ) into v_repeat;

  v_penalty := case when v_repeat then 25 else 10 end;

  insert into crack_log (user_id, ip_hash, rounds_result, repeat_offense)
  values (p_user_id, p_ip_hash, p_rounds, v_repeat);

  update security_score
    set score = greatest(score - v_penalty, 0), updated_at = now()
    where id = 1
    returning score into v_new_score;

  return v_new_score;
end;
$$;

-- Remontée lente du score dans le temps (1 point / jour sans nouveau
-- crack), à appeler périodiquement (cron Supabase) si tu veux ce comportement.
create or replace function recover_security_score()
returns void
language sql
as $$
  update security_score set score = least(score + 1, 100), updated_at = now()
  where id = 1 and updated_at < now() - interval '1 day';
$$;
