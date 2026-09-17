// Kreyptedd — Edge Function: contacts-list
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "./cors.ts";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("authorization");
  const { data: userData } = await supabase.auth.getUser(auth ?? "");
  if (!userData?.user) return jsonResponse({ error: "Non authentifié." }, 401);
  const userId = userData.user.id;

  const { data: me } = await supabase.from("app_users").select("contact_code").eq("id", userId).single();

  const { data: incomingRaw } = await supabase
    .from("contact_requests")
    .select("id, from_user, app_users!contact_requests_from_user_fkey(username)")
    .eq("to_user", userId).eq("status", "pending");

  const incoming = (incomingRaw ?? []).map(r => ({ id: r.id, from_username: r.app_users?.username }));

  const { data: contactsRaw } = await supabase
    .from("contacts")
    .select("contact_id, app_users!contacts_contact_id_fkey(username)")
    .eq("user_id", userId);

  const contacts = (contactsRaw ?? []).map(c => ({ username: c.app_users?.username }));

  return jsonResponse({
    my_code: me?.contact_code,
    incoming,
    contacts
  }, 200);
});
