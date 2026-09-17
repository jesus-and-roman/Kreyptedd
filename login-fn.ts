// Kreyptedd — Edge Function: login
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "./cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { username, password } = await req.json();
  if (!username || !password) {
    return jsonResponse({ error: "Identifiants manquants." }, 400);
  }

  const syntheticEmail = `${username.toLowerCase()}@kreyptedd.internal`;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password
  });

  if (error || !data?.session) {
    return jsonResponse({ error: "Nom d'utilisateur ou mot de passe incorrect." }, 401);
  }

  return jsonResponse({ token: data.session.access_token }, 200);
});
