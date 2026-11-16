// Supabase Edge Function: ai-evaluate
// General evaluation for English language coaches (grammar, presentation, interview, debate, etc.)
// Secret required: GEMINI_API_KEY (configured in Supabase Dashboard -> Edge Functions -> Secrets)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COACH_PROMPTS: Record<string, string> = {
  grammar: `You are the SAILL Enterprise Grammar and Sentence Structure AI Coach. Evaluate student submission for grammatical accuracy, verb tense, subject-verb agreement, clarity, and precision.`,
  spokenEnglish: `You are the SAILL Spoken English Coach. Focus on fluency, idiomatic usage, sentence cohesion, and conversational naturalness.`,
  interview: `You are a Senior Corporate HR Interviewer and Campus Placement Panelist at SRIT. Evaluate answer structure (STAR method), professional tone, clarity, and conviction.`,
  debate: `You are a Parliamentary Debate Adjudicator. Evaluate argumentation logic, rebuttal strength, premise soundness, and persuasive rhetoric.`,
  presentation: `You are an Executive Presentation Coach. Evaluate narrative arc, slide readability, vocal variety, and audience engagement cues.`
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

    const { coachId = "grammar", studentInput, contextData } = await req.json();

    if (!studentInput) {
      return new Response(
        JSON.stringify({ error: "Missing studentInput" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemInstruction = COACH_PROMPTS[coachId] || COACH_PROMPTS.grammar;
    const promptText = `Evaluate the student submission:
CONTEXT: ${JSON.stringify(contextData || {})}
STUDENT SUBMISSION: "${studentInput}"

Return ONLY a valid JSON object matching this structure:
{
  "score": number,
  "overallFeedback": string,
  "strengths": [string],
  "suggestions": [string],
  "guidedImprovement": {
    "title": string,
    "exerciseText": string,
    "actionSteps": [string]
  },
  "metrics": {
    "accuracy": number,
    "clarity": number,
    "relevance": number,
    "structure": number
  },
  "correctedText": string
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
