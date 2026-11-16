// Supabase Edge Function: evaluate-pronunciation
// Evaluates student recorded speech against target text using Google Gemini 2.5 Flash / 3.6 Flash
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
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured in Supabase Edge Function secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let targetWord = "Communication";
    let activityType = "WORD";
    let moduleName = "Accent & Word Stress Studio";
    let activityName = "Guided Practice";
    let difficulty = "Intermediate";
    let language = "English";
    let base64Audio = "";
    let mimeType = "audio/webm";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      targetWord = String(formData.get("targetWord") || "Communication").trim();
      activityType = String(formData.get("activityType") || "WORD");
      moduleName = String(formData.get("moduleName") || "Accent & Word Stress Studio");
      activityName = String(formData.get("activityName") || "Guided Practice");
      difficulty = String(formData.get("difficulty") || "Intermediate");
      language = String(formData.get("language") || "English");

      const file = formData.get("studentAudio");
      if (file instanceof Blob) {
        mimeType = file.type || "audio/webm";
        const arrayBuffer = await file.arrayBuffer();
        base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      }
    } else {
      const body = await req.json();
      targetWord = body.targetWord || "Communication";
      activityType = body.activityType || "WORD";
      moduleName = body.moduleName || "Accent & Word Stress Studio";
      activityName = body.activityName || "Guided Practice";
      difficulty = body.difficulty || "Intermediate";
      language = body.language || "English";
      base64Audio = body.base64Audio || "";
      mimeType = body.mimeType || "audio/webm";
    }

    if (!base64Audio) {
      return new Response(
        JSON.stringify({ error: "Missing student audio recording." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemInstruction = `You are the SAILL (SRIT AI Language Laboratory) Senior AI Speech & Pronunciation Assessment Engine.
You serve as an expert English Pronunciation Expert, IELTS Speaking Examiner, Corporate Communication Trainer, Speech Coach, and Campus Placement Trainer for engineering students.

CRITICAL ASSESSMENT GUIDELINES:
1. Evaluate based primarily on INTELLIGIBILITY, CLARITY, CORRECT STRESS, and EFFECTIVE COMMUNICATION.
2. DO NOT penalize students merely for speaking Indian English or regional accent variations, provided the speech is clear, intelligible, and correctly stressed.
3. Assess the audio against the target text based on the following exact criteria weights (total score out of 100):
   - Pronunciation Accuracy: max 25
   - Word Stress: max 20
   - Syllable Accuracy: max 10
   - Vowel Accuracy: max 10
   - Consonant Accuracy: max 10
   - Fluency: max 10
   - Clarity: max 5
   - Speaking Pace: max 5
   - Confidence: max 3
   - Overall Naturalness: max 2

GRADE MAPPING:
- 95-100: "A+"
- 90-94: "A"
- 85-89: "B+"
- 80-84: "B"
- 70-79: "C"
- Below 70: "Needs Improvement"

RECOMMENDED PRACTICE WORDS:
Provide 3 to 5 phonetically or structurally similar words or phrases for further practice.

IMPORTANT RESPONSE FORMAT:
Return ONLY a valid JSON object matching the requested schema. No markdown wrapping.`;

    const promptText = `Evaluate the student's recorded audio against the target text below:
TARGET TEXT: "${targetWord}"
ACTIVITY TYPE: ${activityType}
MODULE: ${moduleName}
ACTIVITY: ${activityName}
DIFFICULTY: ${difficulty}
LANGUAGE: ${language}

Return ONLY a valid JSON object matching this structure:
{
  "overallScore": number,
  "grade": string,
  "scores": {
    "pronunciation": number,
    "wordStress": number,
    "syllables": number,
    "vowels": number,
    "consonants": number,
    "fluency": number,
    "clarity": number,
    "pace": number,
    "confidence": number,
    "naturalness": number
  },
  "strengths": [string],
  "improvements": [string],
  "practiceWords": [string],
  "practiceTime": string,
  "motivation": string
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Audio } },
              { text: promptText }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return new Response(
        JSON.stringify({ error: "Gemini API error: " + errText }),
        { status: geminiResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
