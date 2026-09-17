// Kreyptedd — Edge Function: crypto-relay
// Calcule le nombre de hasardisations à partir de la formule secrète.
// La formule elle-même vit UNIQUEMENT dans les secrets Supabase
// (Project Settings > Edge Functions > Secrets), jamais dans le
// code client. Le client envoie la date/heure du message, jamais
// la formule ni le résultat brut de calcul.
//
// Secret à créer : KREYPTEDD_FORMULA_A, KREYPTEDD_FORMULA_B
// (exemple : la formule reste 3 + FORMULA_B / x, où FORMULA_A/B
// sont des constantes que TOI seul choisis et changes de temps
// en temps sans toucher au code déployé).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function computeHasardisations(dateStamp: number): number {
  const a = Number(Deno.env.get("KREYPTEDD_FORMULA_A"));
  const b = Number(Deno.env.get("KREYPTEDD_FORMULA_B"));
  const raw = Math.floor(a + b / dateStamp);
  // Règle donnée : si le résultat dépasse 3 chiffres, on garde les
  // derniers chiffres et on préfixe par 2.
  const asStr = String(Math.abs(raw));
  return asStr.length > 3
    ? Number("2" + asStr.slice(-2))
    : raw;
}

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const { data: userData, error: userErr } = await supabase.auth.getUser(auth ?? "");
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Non authentifié." }), { status: 401 });
  }
  const userId = userData.user.id;

  const { conversation_id, date_stamp, mode } = await req.json();
  // mode: "encode" | "decode"

  // Hash de l'IP avec le même sel que app_users, pour lier le
  // verrou de craquage à l'IP en plus du compte.
  const ipHash = await sha256Hex(ip + Deno.env.get("KREYPTEDD_IP_SALT"));

  const { data: locked } = await supabase.rpc("is_locked_out", {
    p_user_id: userId,
    p_ip_hash: ipHash
  });
  if (locked) {
    return new Response(JSON.stringify({ error: "Trop de tentatives, réessaie plus tard." }), { status: 429 });
  }

  let success = true;
  let result;
  try {
    const rounds = computeHasardisations(date_stamp);
    result = { rounds }; // le résultat repart au client, jamais la formule
  } catch {
    success = false;
  }

  if (success) {
    // Une réussite qui suit une rafale d'échecs récents = signe qu'un
    // pattern de brute force a fini par retomber juste. On journalise
    // et on fait baisser le score de sécurité système en conséquence.
    const { count: recentFailures } = await supabase
      .from("crack_attempts")
      .select("id", { count: "exact", head: true })
      .or(`user_id.eq.${userId},ip_hash.eq.${ipHash}`)
      .eq("success", false)
      .gt("attempted_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

    if ((recentFailures ?? 0) >= 8) {
      await supabase.rpc("apply_crack_penalty", {
        p_user_id: userId, p_ip_hash: ipHash, p_rounds: result.rounds
      });
    }
  }

  await supabase.from("crack_attempts").insert({
    user_id: userId,
    ip_hash: ipHash,
    conversation_id: conversation_id ?? null,
    success
  });

  if (!success) {
    return new Response(JSON.stringify({ error: "Calcul impossible." }), { status: 400 });
  }
  return new Response(JSON.stringify(result), { status: 200 });
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
