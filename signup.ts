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

function generateContactCode(): string {
  return Array.from({ length: 8 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
  ).join("");
}

Deno.serve(async (req) => {
  const { username, password, email, newsletter } = await req.json();

  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return new Response(JSON.stringify({ error: "Nom d'utilisateur invalide (3-20 caractères, lettres/chiffres/_)." }), { status: 400 });
  }
  if (!password || password.length < 8) {
    return new Response(JSON.stringify({ error: "Mot de passe trop court (8 caractères minimum)." }), { status: 400 });
  }

  const { data: existing } = await supabase
    .from("app_users").select("id").eq("username", username).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ error: "Ce nom d'utilisateur est déjà pris." }), { status: 409 });
  }

  const syntheticEmail = `${username.toLowerCase()}@kreyptedd.internal`;
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true
  });
  if (authErr || !authUser?.user) {
    return new Response(JSON.stringify({ error: "Inscription impossible." }), { status: 500 });
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
    return new Response(JSON.stringify({ error: "Inscription impossible." }), { status: 500 });
  }

  const { data: session, error: signInErr } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password
  });
  if (signInErr || !session?.session) {
    return new Response(JSON.stringify({ error: "Compte créé, connecte-toi." }), { status: 201 });
  }

  return new Response(JSON.stringify({
    token: session.session.access_token,
    contact_code: contactCode
  }), { status: 201 });
});
