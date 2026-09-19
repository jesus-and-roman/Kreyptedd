// Kreyptedd — Edge Function: signup
//
// Approche : on laisse Supabase Auth gérer le hash du mot de passe
// (il le fait déjà correctement, pas la peine de réinventer). On crée
// un compte auth avec un email synthétique username@kreyptedd.internal,
// et app_users.id = l'id de ce compte auth, pour que auth.uid() marche
// directement dans les policies RLS déjà écrites.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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

function generateContactCode(): string {
  return Array.from({ length: 8 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
  ).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { username, password, email, newsletter } = await req.json();

  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return jsonResponse({ error: "Nom d'utilisateur invalide (3-20 caractères, lettres/chiffres/_)." }, 400);
  }
  if (!password || password.length < 8) {
    return jsonResponse({ error: "Mot de passe trop court (8 caractères minimum)." }, 400);
  }

  const { data: existing } = await supabase
    .from("app_users").select("id").eq("username", username).maybeSingle();
  if (existing) {
    return jsonResponse({ error: "Ce nom d'utilisateur est déjà pris." }, 409);
  }

  const syntheticEmail = `${username.toLowerCase()}@kreyptedd.internal`;
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true
  });
  if (authErr || !authUser?.user) {
    return jsonResponse({ error: "Inscription impossible." }, 500);
  }

  let contactCode = generateContactCode();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase.from("app_users").select("id").eq("contact_code", contactCode).maybeSingle();
    if (!clash) break;
    contactCode = generateContactCode();
  }

  const { error: insertErr } = await supabase.from("app_users").insert({
    id: authUser.user.id,
    username,
    password_hash: "managed_by_supabase_auth",
    email: email || null,
    newsletter_opt_in: !!newsletter,
    contact_code: contactCode,
    tos_accepted_at: new Date().toISOString()
  });
  if (insertErr) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return jsonResponse({ error: "Inscription impossible." }, 500);
  }

  const { data: session, error: signInErr } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password
  });
  if (signInErr || !session?.session) {
    return jsonResponse({ error: "Compte créé, connecte-toi." }, 201);
  }

  return jsonResponse({
    token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    contact_code: contactCode
  }, 201);
});
