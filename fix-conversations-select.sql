-- Kreyptedd — Patch — le créateur doit pouvoir relire la conversation
-- qu'il vient de créer, AVANT que sa ligne dans conversation_members
-- n'existe (insert().select() les évalue dans le même aller-retour).
create policy "createur voit sa conversation" on conversations
  for select using (auth.uid() = created_by);
