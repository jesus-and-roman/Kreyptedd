// Kreyptedd — Edge Function: contact-respond
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
  const userId = userData.user.id;

  const { request_id, accept } = await req.json();
  const { data: reqRow } = await supabase.from("contact_requests").select("*").eq("id", request_id).eq("to_user", userId).maybeSingle();
  if (!reqRow) return jsonResponse({ error: "Demande introuvable." }, 404);

  await supabase.from("contact_requests").update({
    status: accept ? "accepted" : "refused",
    resolved_at: new Date().toISOString()
  }).eq("id", request_id);

  if (accept) {
    await supabase.from("contacts").insert([
      { user_id: reqRow.from_user, contact_id: reqRow.to_user },
      { user_id: reqRow.to_user, contact_id: reqRow.from_user }
    ]);
  }

  return jsonResponse({ ok: true }, 200);
});
