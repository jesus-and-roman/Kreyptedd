-- Kreyptedd — Patch — il n'y avait AUCUNE policy INSERT sur conversation_members,
-- donc RLS bloquait tout ajout de membre, y compris le créateur lui-même.
create policy "ajouter des membres" on conversation_members
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1 from conversation_members m
      where m.conversation_id = conversation_members.conversation_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );
