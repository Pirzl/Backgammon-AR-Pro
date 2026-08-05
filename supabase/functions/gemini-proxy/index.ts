import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

// Global daily counter (shared across all players). The free tier RPD quota is
// per API key, so the source of truth must live server-side, not in localStorage.
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function recordGeminiCall(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc("increment_gemini_calls", { day: todayUTC() });
  } catch (error) {
    console.error("Gemini usage counter error:", error);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Esquema para cuando necesitemos jugadas (MOVIMIENTOS)
const movesSchema = {
  type: "OBJECT",
  properties: {
    moves: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          from: { type: "NUMBER" },
          die: { type: "NUMBER" }
        },
        required: ["from", "die"]
      }
    }
  },
  required: ["moves"]
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { prompt, mode } = await req.json(); // Añadimos 'mode' para diferenciar

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not configured. Set it via: supabase secrets set GEMINI_API_KEY=<key>");
      return new Response(JSON.stringify({ error: "AI service not configured (missing GEMINI_API_KEY)" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Configuramos la petición según lo que necesitemos
    const isAnalysis = mode === "analysis" || mode === "chat";
    
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        // Si es análisis, queremos texto libre. Si es movimiento, queremos JSON estructurado.
        responseMimeType: isAnalysis ? "text/plain" : "application/json",
        ...(isAnalysis ? {} : { responseSchema: movesSchema })
      },
    };

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Every request to the Gemini API consumes daily RPD quota (even non-2xx),
    // so count it right after the request, regardless of the status.
    await recordGeminiCall();

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errText.slice(0, 500));

      // Daily free-tier quota (RPD) exhausted or rate-limited. Return a clean
      // 429 so clients can degrade gracefully instead of treating it as a 500.
      if (geminiResponse.status === 429 || geminiResponse.status === 403) {
        return new Response(JSON.stringify({ status: "quota_exhausted", error: "Daily Gemini quota exhausted" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`Gemini API returned ${geminiResponse.status}`);
    }

    const data = await geminiResponse.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("Empty AI response");

    // Si es JSON (movimientos), lo parseamos. Si no, devolvemos el texto puro.
    const finalResult = isAnalysis ? text : JSON.parse(text);

    return new Response(JSON.stringify(finalResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Proxy Error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500, headers: corsHeaders 
    });
  }
}); 
