// Kreyptedd — Edge Function: get-profile
//
// Renvoie uniquement les champs publics d'un profil (jamais email, ip_hash,
// password_hash, etc.) même via l'accès direct à la table par un tiers.
// Le verrouillage bloque la vue pour tout le monde SAUF le propriétaire.

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

  const { profile_id } = await req.json();
  if (!profile_id) return jsonResponse({ error: "profile_id manquant." }, 400);

  const { data: profile } = await supabase
    .from("app_users")
    .select("id, username, display_name, bio, accent_color, avatar_url, avatar_expires_at, banner_url, banner_expires_at, profile_locked")
    .eq("id", profile_id)
    .maybeSingle();

  if (!profile) return jsonResponse({ error: "Profil introuvable." }, 404);

  const isOwner = profile.id === userData.user.id;
  if (profile.profile_locked && !isOwner) {
    return jsonResponse({ locked: true, username: profile.username }, 200);
  }

  return jsonResponse({ locked: false, is_owner: isOwner, ...profile }, 200);
});
