// Kreyptedd — Edge Function: contact-request
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization");
  const { data: userData } = await supabase.auth.getUser(auth ?? "");
  if (!userData?.user) return new Response(JSON.stringify({ error: "Non authentifié." }), { status: 401 });
  const fromUser = userData.user.id;

  const { code } = await req.json();
  const { data: target } = await supabase.from("app_users").select("id, username").eq("contact_code", code).maybeSingle();
  if (!target) return new Response(JSON.stringify({ error: "Code introuvable." }), { status: 404 });
  if (target.id === fromUser) return new Response(JSON.stringify({ error: "Tu ne peux pas t'ajouter toi-même." }), { status: 400 });

  const { error } = await supabase.from("contact_requests").insert({ from_user: fromUser, to_user: target.id });
  if (error) return new Response(JSON.stringify({ error: "Demande déjà envoyée ou existante." }), { status: 409 });

  return new Response(JSON.stringify({ ok: true }), { status: 201 });
});
