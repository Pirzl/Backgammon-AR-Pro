import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const GEMINI_MODEL = "gemini-2.0-flash-lite"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { prompt } = await req.json()

    if (!prompt) {
      return new Response(JSON.stringify({ error: "No prompt provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not configured")
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Call Gemini API without ANY JSON schema enforcements to guarantee raw text
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
    
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 100,
        }
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Gemini API error:", errorText)
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const data = await response.json()
    // The response is expected to be a valid JSON from the prompt.
    // If it's wrapped in Markdown ```json ... ``` we strip it out.
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
    
    // Strip markdown JSON wrapping if present
    if (rawText.startsWith('```json')) {
       rawText = rawText.replace(/```json\n?/, '').replace(/```$/, '').trim();
    }

    let parsedTaunt = "";
    try {
      const parsedJson = JSON.parse(rawText);
      parsedTaunt = parsedJson.taunt || rawText;
    } catch {
      // If NOT JSON for some reason, just return the raw text
      parsedTaunt = rawText;
    }

    return new Response(JSON.stringify({ taunt: parsedTaunt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Edge function error:", error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
