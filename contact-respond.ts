// Kreyptedd — Edge Function: contact-respond
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization");
  const { data: userData } = await supabase.auth.getUser(auth ?? "");
  if (!userData?.user) return new Response(JSON.stringify({ error: "Non authentifié." }), { status: 401 });
  const userId = userData.user.id;

  const { request_id, accept } = await req.json();
  const { data: reqRow } = await supabase.from("contact_requests").select("*").eq("id", request_id).eq("to_user", userId).maybeSingle();
  if (!reqRow) return new Response(JSON.stringify({ error: "Demande introuvable." }), { status: 404 });

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

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
