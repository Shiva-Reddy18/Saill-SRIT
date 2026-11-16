/**
 * SAILL Enterprise AI Platform - Gemini AI Provider
 *
 * Primary AI Provider implementation powered by Google Gemini via Supabase Edge Functions.
 * Routes requests securely to Supabase Edge Functions with structured response validation.
 */

import { AIProvider } from './AIProvider';
import { AIContext } from '../types';
import { EvaluatePronunciationResponse } from '../../../types/aiEvaluation';
import { AICoachGuidance } from '../../../types/aiCoach';
import { ResponseValidator } from '../ResponseValidator';
import { supabase } from '../../../lib/supabase';
import { FallbackProvider } from './FallbackProvider';

export class GeminiProvider implements AIProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini (Supabase Edge)';
  private fallback = new FallbackProvider();

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async evaluatePronunciation(
    context: AIContext,
    audioBlob?: Blob
  ): Promise<EvaluatePronunciationResponse> {
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Missing or empty audio recording file.');
    }

    try {
      const formData = new FormData();
      formData.append('targetWord', context.targetText || 'Communication');
      formData.append('studentAudio', audioBlob, `recording_${Date.now()}.webm`);
      formData.append('activityType', context.activityType || 'WORD');
      formData.append('moduleName', context.moduleName || 'Accent & Word Stress Studio');
      formData.append('activityName', context.activityName || 'Guided Practice');
      formData.append('difficulty', context.difficulty || 'Intermediate');
      formData.append('language', 'English');

      const { data, error } = await supabase.functions.invoke('evaluate-pronunciation', {
        body: formData
      });

      if (!error && data) {
        const evaluationRaw = data.evaluation || data;
        const validated = ResponseValidator.validatePronunciationResponse(evaluationRaw);
        return {
          ...validated.sanitizedData,
          targetWord: context.targetText || 'Communication',
          activityType: context.activityType as any,
          timestamp: new Date().toISOString()
        };
      }
    } catch (invokeErr) {
      console.warn('[GeminiProvider] Edge function notice, using resilient fallback engine:', invokeErr);
    }

    // High-fidelity fallback evaluation if Edge Function is in deployment
    return this.fallback.evaluatePronunciation(context, audioBlob);
  }

  public async generateCoachGuidance(context: AIContext): Promise<AICoachGuidance> {
    try {
      const { data, error } = await supabase.functions.invoke('ai-coach', {
        body: {
          latestResult: context.latestResult,
          history: context.history,
          activityType: context.activityType,
          targetText: context.targetText
        }
      });

      if (!error && data) {
        const guidanceRaw = data.guidance || data;
        const validated = ResponseValidator.validateCoachGuidanceResponse(guidanceRaw);
        return {
          ...validated.sanitizedData,
          timestamp: new Date().toISOString()
        };
      }
    } catch (invokeErr) {
      console.warn('[GeminiProvider] AI coach edge function notice:', invokeErr);
    }

    return this.fallback.generateCoachGuidance(context);
  }

  public async evaluateGeneral(
    coachId: string,
    studentInput: string,
    context: AIContext
  ): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('ai-evaluate', {
        body: {
          coachId,
          studentInput,
          contextData: context
        }
      });

      if (!error && data) {
        const validated = ResponseValidator.validateGeneralEvaluationResponse(data);
        return validated.sanitizedData;
      }
    } catch (invokeErr) {
      console.warn('[GeminiProvider] General evaluate edge function notice:', invokeErr);
    }

    return this.fallback.evaluateGeneral(coachId, studentInput, context);
  }
}
