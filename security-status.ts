// Kreyptedd — Edge Function: security-status
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "./cors.ts";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("authorization");
  const { data: userData } = await supabase.auth.getUser(auth ?? "");
  if (!userData?.user) return jsonResponse({ error: "Non authentifié." }, 401);

  const { data } = await supabase.from("security_score").select("score").eq("id", 1).single();
  return jsonResponse({ score: data?.score ?? 100 }, 200);
});
