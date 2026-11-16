// Supabase Edge Function: ai-coach
// Generates personalized learning coach guidance using Google Gemini
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

    const body = await req.json();
    const { latestResult, history, activityType = "WORD", targetText = "Communication" } = body;

    if (!latestResult) {
      return new Response(
        JSON.stringify({ error: "Missing latestResult data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemInstruction = `You are the SAILL (SRIT AI Language Laboratory) Senior AI Speech & Communication Coach and Adaptive Practice Director.
Your role is to analyze student pronunciation assessment data and generate constructive, encouraging, personalized learning guidance.

GUIDELINES:
1. ALWAYS maintain a supportive, constructive, and highly encouraging tone.
2. Formulate Today's Learning Plan targeting their specific weak areas.
3. Provide 3 to 5 smart practice recommendations.
4. Return ONLY a valid JSON object matching the requested schema. No markdown wrapping.`;

    const scoreData = latestResult.scores || {};
    const promptText = `Analyze the student assessment data and generate personalized AI Coach Guidance:
TARGET TEXT: "${targetText}"
ACTIVITY TYPE: ${activityType}
OVERALL SCORE: ${latestResult.overallScore}/100 (Grade: ${latestResult.grade})
SCORES: ${JSON.stringify(scoreData)}

Return JSON matching this exact structure:
{
  "learningProfile": {
    "pronunciation": "Excellent" | "Very Good" | "Good" | "Needs Improvement",
    "wordStress": "Excellent" | "Very Good" | "Good" | "Needs Improvement",
    "syllableAccuracy": "Excellent" | "Very Good" | "Good" | "Needs Improvement",
    "vowelAccuracy": "Excellent" | "Very Good" | "Good" | "Needs Improvement",
    "consonantAccuracy": "Excellent" | "Very Good" | "Good" | "Needs Improvement",
    "fluency": "Excellent" | "Very Good" | "Good" | "Needs Improvement",
    "clarity": "Excellent" | "Very Good" | "Good" | "Needs Improvement",
    "speakingPace": "Excellent" | "Very Good" | "Good" | "Needs Improvement",
    "confidence": "Excellent" | "Very Good" | "Good" | "Needs Improvement"
  },
  "coachMessage": string,
  "strengths": [string],
  "weakAreas": [string],
  "todayLearningPlan": {
    "practiceFocus": string,
    "recommendedRule": string,
    "suggestedPracticeWords": [string],
    "estimatedPracticeTime": string,
    "expectedLearningOutcome": string
  },
  "smartRecommendations": [string],
  "estimatedPracticeTime": string,
  "motivationalMessage": string,
  "suggestedNextActivity": string
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { response_mime_type: "application/json" }
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
