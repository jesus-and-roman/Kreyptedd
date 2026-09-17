// Kreyptedd — cors.ts
// Importé par chaque Edge Function pour autoriser les appels depuis
// GitHub Pages (jesus-and-roman.github.io) et gérer le preflight OPTIONS.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
