// Kreyptedd — Edge Function: ip-login
//
// Hash irréversible de l'IP (sha256 + sel serveur, jamais exposé).
// Le mot de passe du compte auth associé est dérivé de ce hash +
// un pepper serveur distinct — jamais transmis au client, sert
// uniquement en interne pour obtenir un JWT via Supabase Auth.

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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomUsername(): string {
  return "anon_" + Array.from({ length: 8 }, () =>
    "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]
  ).join("");
}

function generateContactCode(): string {
  return Array.from({ length: 8 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
  ).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (!ip) {
    return jsonResponse({ error: "IP introuvable." }, 400);
  }

  const ipHash = await sha256Hex(ip + Deno.env.get("KREYPTEDD_IP_SALT"));
  const internalPassword = await sha256Hex(ipHash + Deno.env.get("KREYPTEDD_IP_PEPPER"));

  const { data: existingUser } = await supabase
    .from("app_users").select("id, username, contact_code")
    .eq("ip_hash", ipHash).maybeSingle();

  const syntheticEmail = `ip_${ipHash.slice(0, 24)}@kreyptedd.internal`;

  if (existingUser) {
    const { data: session, error } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: internalPassword
    });
    if (error || !session?.session) {
      return jsonResponse({ error: "Connexion anonyme impossible." }, 500);
    }
    return jsonResponse({
      token: session.session.access_token,
      is_new: false,
      contact_code: existingUser.contact_code
    }, 200);
  }

  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: syntheticEmail,
    password: internalPassword,
    email_confirm: true
  });
  if (authErr || !authUser?.user) {
    return jsonResponse({ error: "Connexion anonyme impossible." }, 500);
  }

  let contactCode = generateContactCode();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase.from("app_users").select("id").eq("contact_code", contactCode).maybeSingle();
    if (!clash) break;
    contactCode = generateContactCode();
  }

  const { error: insertErr } = await supabase.from("app_users").insert({
    id: authUser.user.id,
    username: randomUsername(),
    password_hash: "ip_account_no_password",
    is_ip_account: true,
    ip_hash: ipHash,
    contact_code: contactCode,
    tos_accepted_at: new Date().toISOString()
  });
  if (insertErr) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return jsonResponse({ error: "Connexion anonyme impossible." }, 500);
  }

  const { data: session } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password: internalPassword
  });

  return jsonResponse({
    token: session?.session?.access_token,
    is_new: true,
    contact_code: contactCode
  }, 201);
});
