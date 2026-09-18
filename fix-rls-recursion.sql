-- Kreyptedd — Patch — corrige la récursion infinie RLS
-- La policy se référençait elle-même (conversation_members -> conversation_members),
-- ce que Postgres détecte comme une boucle infinie et refuse (erreur 500 en cascade
-- sur conversations aussi, car sa policy dépend de conversation_members).

drop policy if exists "voir sa propre appartenance" on conversation_members;

create policy "voir sa propre appartenance" on conversation_members
  for select using (auth.uid() = user_id);
