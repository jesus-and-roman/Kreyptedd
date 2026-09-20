// Kreyptedd — Edge Function: contact-request
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function jsonResponse(body, status) {
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
  const fromUser = userData.user.id;

  const { code } = await req.json();
  const { data: target } = await supabase.from("app_users").select("id, username").eq("contact_code", code).maybeSingle();
  if (!target) return jsonResponse({ error: "Code introuvable." }, 404);
  if (target.id === fromUser) return jsonResponse({ error: "Tu ne peux pas t'ajouter toi-même." }, 400);

  const { data: blockRows } = await supabase
    .from("blocked_users")
    .select("user_id, blocked_id")
    .or(`and(user_id.eq.${fromUser},blocked_id.eq.${target.id}),and(user_id.eq.${target.id},blocked_id.eq.${fromUser})`);
  if (blockRows && blockRows.length > 0) {
    return jsonResponse({ error: "Impossible d'envoyer cette demande." }, 403);
  }

  const { error } = await supabase.from("contact_requests").insert({ from_user: fromUser, to_user: target.id });
  if (error) return jsonResponse({ error: "Demande déjà envoyée ou existante." }, 409);

  return jsonResponse({ ok: true }, 201);
});
