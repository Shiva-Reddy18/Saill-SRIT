// Supabase Edge Function: phonemic-transcription
// Generates IPA phonetic transcriptions for English words using Google Gemini
// Secret required: GEMINI_API_KEY (configured in Supabase Dashboard -> Edge Functions -> Secrets)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const { word } = await req.json();

    if (!word || typeof word !== "string") {
      return new Response(
        JSON.stringify({ isValidWord: false, errorMessage: "Please enter a valid English word." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedWord = word.trim().toLowerCase();

    if (!apiKey) {
      // Fallback response if API key is not yet set
      return new Response(
        JSON.stringify({
          isValidWord: true,
          word: trimmedWord,
          phonemicTranscriptionRP: `/${trimmedWord}/`,
          phonemicTranscriptionGA: `/${trimmedWord}/`
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const promptText = `Analyze the English word: "${trimmedWord}".
Provide its IPA phonemic transcription for Received Pronunciation (RP) as phonemicTranscriptionRP and General American (GA) as phonemicTranscriptionGA enclosed in slashes /.../.
If it is not a genuine English word, set isValidWord: false.
Return JSON:
{
  "isValidWord": boolean,
  "word": string,
  "phonemicTranscriptionRP": string,
  "phonemicTranscriptionGA": string,
  "errorMessage": string
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    if (!geminiResponse.ok) {
      return new Response(
        JSON.stringify({
          isValidWord: true,
          word: trimmedWord,
          phonemicTranscriptionRP: `/${trimmedWord}/`,
          phonemicTranscriptionGA: `/${trimmedWord}/`
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(candidateText);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ isValidWord: false, errorMessage: error.message || "Failed to transcribe word" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
