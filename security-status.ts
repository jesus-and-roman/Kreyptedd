// Kreyptedd — Edge Function: security-status
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization");
  const { data: userData } = await supabase.auth.getUser(auth ?? "");
  if (!userData?.user) return new Response(JSON.stringify({ error: "Non authentifié." }), { status: 401 });

  const { data } = await supabase.from("security_score").select("score").eq("id", 1).single();
  return new Response(JSON.stringify({ score: data?.score ?? 100 }), { status: 200 });
});
