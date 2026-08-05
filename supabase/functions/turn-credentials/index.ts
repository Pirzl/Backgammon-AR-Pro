import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// MIRRORS #beam-mesh, same pattern as gemini-proxy.
// Mints ephemeral TURN credentials from Metered (TURN-as-a-service) so WebRTC
// video works over mobile/cellular networks (CGNAT) where STUN-only fails.
//
// The Metered API key lives ONLY server-side via `supabase secrets set
// TURN_API_KEY=<key>`. The browser gets short-lived username/password + URLs.
//
// We return the exact shape the frontend (useVideoChat) needs:
//   { iceServers: [{ urls: string[], username: string, credential: string }] }
// If TURN_API_KEY is missing or the upstream call fails, we fall back to a
// fresh set of public STUN servers so PC/Wi-Fi (already working) is unchanged.

const METERED_API_KEY = Deno.env.get("TURN_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STUN_FALLBACK: string[] = [
  "stun:stun.l.google.com:19302",
  "stun:global.stun.twilio.com:3478",
];

function fallbackResponse(): Response {
  return new Response(
    JSON.stringify({ iceServers: STUN_FALLBACK.map((urls) => ({ urls })) }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!METERED_API_KEY) {
      console.error("TURN_API_KEY not configured. Set it via: supabase secrets set TURN_API_KEY=<key>");
      // Graceful degrade: STUN still works on same-LAN / PC play.
      return fallbackResponse();
    }

    // Metered REST API: GET https://<api-key>.metered.ca/v0/turncredentials
    const res = await fetch(`https://${METERED_API_KEY}.metered.ca/v0/turncredentials`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error("Metered TURN error:", res.status, (await res.text()).slice(0, 300));
      return fallbackResponse();
    }

    const data = await res.json();

    // Metered returns { username, password, uris } directly; parse defensively
    // in case the payload shape changes (also accept a turn_credentials array).
    const raw = Array.isArray(data?.turn_credentials)
      ? data.turn_credentials[0]
      : data;
    const uris: string[] = Array.isArray(raw?.uris) ? raw.uris : [];
    const username = typeof raw?.username === "string" ? raw.username : "";
    const credential = typeof raw?.password === "string"
      ? raw.password
      : typeof raw?.credential === "string"
        ? raw.credential
        : "";

    if (uris.length === 0) {
      console.error("Metered returned no uris", JSON.stringify(data).slice(0, 200));
      return fallbackResponse();
    }

    const iceServer = username && credential
      ? { urls: uris, username, credential }
      : { urls: uris };

    return new Response(JSON.stringify({ iceServers: [iceServer] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("TURN credentials error:", error);
    return fallbackResponse();
  }
});