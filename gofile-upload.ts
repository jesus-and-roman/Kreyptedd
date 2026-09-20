// Kreyptedd — Edge Function: gofile-upload
//
// Reçoit un fichier (multipart/form-data, champ "file") depuis le client,
// le renvoie vers gofile.io avec le token de compte gardé en secret
// Supabase (KREYPTEDD_GOFILE_TOKEN), jamais exposé au navigateur.
//
// À CONFIGURER : supabase secrets set KREYPTEDD_GOFILE_TOKEN=ta_cle
//
// Note pour Roko : l'API de gofile.io a changé plusieurs fois dans le
// passé. Si la réponse ne correspond pas à ce que le code attend
// (data.downloadPage / data.file.link selon la version), regarde les
// logs de cette fonction (elle logue la réponse brute de gofile) et
// dis-moi ce qu'elle contient — je corrige le mapping en 2 minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

const GOFILE_TOKEN = Deno.env.get("KREYPTEDD_GOFILE_TOKEN")!;
// Durée par défaut si gofile ne renvoie pas de date d'expiration explicite
// (palier gratuit : ~10 jours d'inactivité). Ajustable ici sans redéployer
// le reste du système.
const DEFAULT_TTL_DAYS = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("authorization");
  const jwt = (auth ?? "").replace("Bearer ", "").trim();
  const { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData?.user) return jsonResponse({ error: "Non authentifié." }, 401);

  const formData = await req.formData();
  const file = formData.get("file");
  const kind = String(formData.get("kind") ?? "message"); // "avatar" | "banner" | "message"

  if (!(file instanceof File)) {
    return jsonResponse({ error: "Fichier manquant." }, 400);
  }
  // Limite raisonnable côté relais pour éviter l'abus du quota gofile.
  const MAX_BYTES = 50 * 1024 * 1024; // 50 Mo
  if (file.size > MAX_BYTES) {
    return jsonResponse({ error: "Fichier trop volumineux (50 Mo max)." }, 400);
  }

  try {
    // 1. Obtenir un serveur d'upload disponible.
    const serverRes = await fetch("https://api.gofile.io/servers");
    const serverJson = await serverRes.json();
    console.log("gofile /servers ->", JSON.stringify(serverJson));
    const server = serverJson?.data?.servers?.[0]?.name;
    if (!server) return jsonResponse({ error: "gofile indisponible." }, 502);

    // 2. Upload du fichier sur ce serveur, authentifié avec le token compte.
    const uploadForm = new FormData();
    uploadForm.append("file", file, file.name);
    uploadForm.append("token", GOFILE_TOKEN);

    const uploadRes = await fetch(`https://${server}.gofile.io/uploadFile`, {
      method: "POST",
      body: uploadForm
    });
    const uploadJson = await uploadRes.json();
    console.log("gofile /uploadFile ->", JSON.stringify(uploadJson));

    if (uploadJson?.status !== "ok") {
      return jsonResponse({ error: "Échec de l'upload gofile." }, 502);
    }

    const directLink = uploadJson.data?.directLink;
    const downloadPage = uploadJson.data?.downloadPage;
    // directLink n'est fourni que pour les comptes gofile payants ("donor") ;
    // sur un compte standard, seul downloadPage existe (une page web, pas
    // intégrable en <img>). On renvoie le meilleur des deux + un indicateur.
    const url = directLink || downloadPage;
    const isDirect = !!directLink;
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    return jsonResponse({ url, is_direct: isDirect, expires_at: expiresAt, kind }, 200);
  } catch (e) {
    console.log("gofile-upload erreur ->", String(e));
    return jsonResponse({ error: "Erreur pendant l'upload." }, 500);
  }
});
