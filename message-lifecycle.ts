// Kreyptedd — Edge Function: message-lifecycle
// Deux actions :
//  - "ack_read"    : le client confirme avoir déchiffré et mis en cache
//                     un message -> suppression définitive côté serveur.
//  - "resolve_deletion" : exécute une deletion_request si tous les
//                     membres concernés l'ont demandée (history_both /
//                     full_chat), puis supprime la demande elle-même.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization");
  const { data: userData } = await supabase.auth.getUser(auth ?? "");
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "Non authentifié." }), { status: 401 });
  }
  const userId = userData.user.id;
  const { action, message_id, conversation_id, scope } = await req.json();

  if (action === "ack_read") {
    // Le message a été déchiffré et sauvegardé dans le cache du navigateur
    // du destinataire ; on le retire définitivement du serveur.
    await supabase.from("messages").delete().eq("id", message_id);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (action === "resolve_deletion") {
    await supabase.from("deletion_requests").insert({
      conversation_id, requested_by: userId, scope
    });

    if (scope === "history_mine") {
      // Ne touche que ce que ce user voit ; rien à faire côté serveur
      // au-delà de journaliser la demande (déjà fait ci-dessus).
      await supabase.from("deletion_requests")
        .delete().eq("conversation_id", conversation_id).eq("requested_by", userId).eq("scope", "history_mine");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // history_both / full_chat : attendre que TOUS les membres aient
    // demandé la même chose avant d'exécuter.
    const { data: members } = await supabase
      .from("conversation_members").select("user_id").eq("conversation_id", conversation_id);
    const { data: requests } = await supabase
      .from("deletion_requests").select("requested_by")
      .eq("conversation_id", conversation_id).eq("scope", scope);

    const requestedIds = new Set((requests ?? []).map(r => r.requested_by));
    const allRequested = (members ?? []).every(m => requestedIds.has(m.user_id));

    if (allRequested) {
      await supabase.from("messages").delete().eq("conversation_id", conversation_id);
      if (scope === "full_chat") {
        await supabase.from("conversation_members").delete().eq("conversation_id", conversation_id);
        await supabase.from("conversations").delete().eq("id", conversation_id);
      }
      await supabase.from("deletion_requests").delete().eq("conversation_id", conversation_id).eq("scope", scope);
    }

    return new Response(JSON.stringify({ ok: true, executed: allRequested }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: "Action inconnue." }), { status: 400 });
});
