// Kreyptedd — Edge Function: login
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const { username, password } = await req.json();
  if (!username || !password) {
    return new Response(JSON.stringify({ error: "Identifiants manquants." }), { status: 400 });
  }

  const syntheticEmail = `${username.toLowerCase()}@kreyptedd.internal`;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password
  });

  if (error || !data?.session) {
    return new Response(JSON.stringify({ error: "Nom d'utilisateur ou mot de passe incorrect." }), { status: 401 });
  }

  return new Response(JSON.stringify({ token: data.session.access_token }), { status: 200 });
});
