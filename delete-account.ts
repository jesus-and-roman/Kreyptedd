// Kreyptedd — Edge Function: delete-account
//
// Supprime la ligne app_users (les FK "on delete cascade" nettoient déjà
// messages, contacts, contact_requests, conversation_members, blocked_users,
// crack_attempts), puis supprime le compte Supabase Auth associé.
// Les conversations chiffrées dont ce compte était le seul membre restant
// ne sont pas explicitement supprimées ici (elles perdent juste ce membre) ;
// exécute deletion_requests séparément si besoin d'un ménage plus complet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("authorization");
  const jwt = (auth ?? "").replace("Bearer ", "").trim();
  const { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData?.user) return jsonResponse({ error: "Non authentifié." }, 401);
  const userId = userData.user.id;

  const { confirm } = await req.json();
  if (confirm !== "SUPPRIMER") {
    return jsonResponse({ error: "Confirmation manquante." }, 400);
  }

  const { error: deleteRowError } = await supabase.from("app_users").delete().eq("id", userId);
  if (deleteRowError) {
    return jsonResponse({ error: "Suppression des données impossible." }, 500);
  }

  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    // Les données applicatives sont déjà supprimées ; le compte auth restant
    // est orphelin et inutilisable (plus de ligne app_users associée).
    return jsonResponse({ ok: true, warning: "Compte de connexion non entièrement nettoyé." }, 200);
  }

  return jsonResponse({ ok: true }, 200);
});
