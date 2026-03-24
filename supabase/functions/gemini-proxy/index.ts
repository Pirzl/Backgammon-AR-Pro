import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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
