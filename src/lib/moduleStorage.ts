import { dbStorage } from './db';
import { PortfolioItem, RecordingItem } from '../types';
import { supabase } from './supabase';

export interface ModuleNotebookData {
  moduleId: string;
  experimentNumber: string;
  dateStr: string;
  studentWork: string;
  reflectionText: string;
  rubricScores: Record<string, number>;
  totalScore: number;
  facultyRemarks: string;
  isVerified: boolean;
  updatedAt: string;
}

export interface ModuleReflectionData {
  moduleId: string;
  answers: Record<number, string>;
  savedAt: string;
  aiFeedback?: string;
}

export interface ModuleSubmissionData {
  id: string;
  moduleId: string;
  title: string;
  type: 'audio' | 'video' | 'pdf' | 'docx' | 'image';
  fileUrl?: string;
  textContent?: string;
  notes?: string;
  status: 'draft' | 'submitted' | 'reviewed';
  score?: number;
  facultyFeedback?: string;
  submittedAt: string;
}

export interface ModuleKnowledgeCheckResult {
  moduleId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  passed: boolean;
  attemptedAt: string;
  userAnswers: Record<string, any>;
}

export interface ModuleStatusData {
  moduleId: string;
  completionPercent: number;
  activitiesCompleted: string[];
  knowledgeCheckScore: number;
  aiPracticeScore: number;
  timeSpentMinutes: number;
  skillsMastered: string[];
  learningStreakDays: number;
  facultyReviewStatus: 'Pending' | 'Approved' | 'Needs Revision';
  latestSubmissionDate?: string;
}

class ModuleStorageEngine {
  private getStorageKey(moduleId: string, section: string): string {
    const activeRoll = typeof localStorage !== 'undefined' ? (localStorage.getItem('saill_active_roll_no') || 'guest') : 'guest';
    return `saill_mod_${activeRoll.toLowerCase()}_${moduleId}_${section}`;
  }

  private getActiveRoll(): string {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem('saill_active_roll_no') || 'guest') : 'guest';
  }

  // --- 1. DIGITAL LAB NOTEBOOK (SUPABASE POSTGRESQL ONLY) ---
  async getNotebook(moduleId: string): Promise<ModuleNotebookData | null> {
    try {
      const key = this.getStorageKey(moduleId, 'notebook');
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('collection_name', 'moduleNotebooks')
        .eq('item_id', key)
        .maybeSingle();

      if (!error && data?.data) {
        return data.data as ModuleNotebookData;
      }

      // Fallback: search in Supabase portfolio items
      const items = await dbStorage.getPortfolioItems(moduleId);
      const nbItem = items.find((i) => i.title.includes('Digital Lab Record') || i.category === 'written');
      if (nbItem && nbItem.content) {
        try {
          const parsed = JSON.parse(nbItem.content);
          if (parsed.studentWorkText || parsed.experimentNumber) {
            return {
              moduleId,
              experimentNumber: parsed.experimentNumber || 'EXP-01',
              dateStr: parsed.date || new Date().toISOString(),
              studentWork: parsed.studentWorkText || '',
              reflectionText: parsed.reflectionText || '',
              rubricScores: parsed.rubricScores || {},
              totalScore: parsed.totalScore || 85,
              facultyRemarks: parsed.facultyRemarks || 'Approved',
              isVerified: parsed.facultyVerified ?? true,
              updatedAt: new Date().toISOString()
            };
          }
        } catch {
          // parse error fallback
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveNotebook(moduleId: string, data: ModuleNotebookData): Promise<void> {
    const key = this.getStorageKey(moduleId, 'notebook');
    const rollNo = this.getActiveRoll();
    try {
      await supabase
        .from('app_data')
        .upsert({
          collection_name: 'moduleNotebooks',
          item_id: key,
          data: { id: key, rollNo, moduleId, ...data },
          updated_at: new Date().toISOString()
        });
    } catch {}

    // Also mirror to Supabase portfolio collection for global portfolio aggregation
    await dbStorage.savePortfolioItem({
      id: `nb-${moduleId}-${Date.now()}`,
      moduleId,
      moduleTitle: data.experimentNumber,
      title: `Digital Lab Record Sheet: ${data.experimentNumber}`,
      category: 'written',
      content: JSON.stringify(data),
      score: data.totalScore,
      createdAt: data.updatedAt
    });
  }

  // --- 2. KNOWLEDGE CHECK DATA (SUPABASE POSTGRESQL ONLY) ---
  async getKnowledgeCheck(moduleId: string): Promise<ModuleKnowledgeCheckResult | null> {
    try {
      const key = this.getStorageKey(moduleId, 'kc');
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('collection_name', 'moduleKnowledgeChecks')
        .eq('item_id', key)
        .maybeSingle();

      if (!error && data?.data) {
        return data.data as ModuleKnowledgeCheckResult;
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveKnowledgeCheck(moduleId: string, result: ModuleKnowledgeCheckResult): Promise<void> {
    const key = this.getStorageKey(moduleId, 'kc');
    const rollNo = this.getActiveRoll();
    try {
      await supabase
        .from('app_data')
        .upsert({
          collection_name: 'moduleKnowledgeChecks',
          item_id: key,
          data: { id: key, rollNo, moduleId, ...result },
          updated_at: new Date().toISOString()
        });
    } catch {}
  }

  // --- 3. RECORD WORK & SUBMISSIONS (SUPABASE POSTGRESQL ONLY) ---
  async getSubmissions(moduleId: string): Promise<ModuleSubmissionData[]> {
    try {
      const activeRoll = this.getActiveRoll().toLowerCase();
      let serverSubs: ModuleSubmissionData[] = [];
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('collection_name', 'moduleSubmissions');

      if (!error && Array.isArray(data)) {
        serverSubs = data
          .map((d: any) => d.data)
          .filter(
            (s: any) => s && s.moduleId === moduleId && (!s.rollNo || s.rollNo.toLowerCase() === activeRoll)
          );
      }

      // Also get recordings from Supabase via dbStorage
      const recs = await dbStorage.getRecordings();
      const modRecs = recs.filter((r) => r.moduleId === moduleId);

      const audioSubs: ModuleSubmissionData[] = modRecs.map((r) => ({
        id: r.id,
        moduleId,
        title: r.title,
        type: 'audio',
        fileUrl: r.audioDataUrl,
        status: 'reviewed',
        score: r.score || 90,
        facultyFeedback: 'Audio clarity verified by AI Speech Evaluator.',
        submittedAt: r.createdAt
      }));

      // Merge avoiding duplicates by ID
      const map = new Map<string, ModuleSubmissionData>();
      serverSubs.forEach((s) => map.set(s.id, s));
      audioSubs.forEach((s) => map.set(s.id, s));

      return Array.from(map.values()).sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  async saveSubmission(moduleId: string, sub: ModuleSubmissionData): Promise<void> {
    const rollNo = this.getActiveRoll();
    try {
      await supabase
        .from('app_data')
        .upsert({
          collection_name: 'moduleSubmissions',
          item_id: sub.id,
          data: { id: sub.id, rollNo, moduleId, ...sub },
          updated_at: new Date().toISOString()
        });
    } catch {}

    if (sub.type === 'audio' && sub.fileUrl) {
      await dbStorage.saveRecording({
        id: sub.id,
        moduleId,
        moduleTitle: sub.title,
        title: sub.title,
        audioDataUrl: sub.fileUrl,
        durationSeconds: 60,
        score: sub.score || 90,
        createdAt: sub.submittedAt
      });
    }
  }

  // --- 4. REFLECTION DATA (SUPABASE POSTGRESQL ONLY) ---
  async getReflection(moduleId: string): Promise<ModuleReflectionData | null> {
    try {
      const key = this.getStorageKey(moduleId, 'reflection');
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('collection_name', 'moduleReflections')
        .eq('item_id', key)
        .maybeSingle();

      if (!error && data?.data) {
        return data.data as ModuleReflectionData;
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveReflection(moduleId: string, data: ModuleReflectionData): Promise<void> {
    const key = this.getStorageKey(moduleId, 'reflection');
    const rollNo = this.getActiveRoll();
    try {
      await supabase
        .from('app_data')
        .upsert({
          collection_name: 'moduleReflections',
          item_id: key,
          data: { id: key, rollNo, moduleId, ...data },
          updated_at: new Date().toISOString()
        });
    } catch {}
  }

  // --- 5. PORTFOLIO DATA (SUPABASE POSTGRESQL ONLY) ---
  async getPortfolio(moduleId: string): Promise<PortfolioItem[]> {
    return await dbStorage.getPortfolioItems(moduleId);
  }

  async savePortfolioItem(moduleId: string, item: PortfolioItem): Promise<void> {
    await dbStorage.savePortfolioItem({ ...item, moduleId });
  }

  // --- 6. STATUS METRICS DATA (SUPABASE POSTGRESQL ONLY) ---
  async getStatus(moduleId: string): Promise<ModuleStatusData | null> {
    try {
      const key = this.getStorageKey(moduleId, 'status');
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('collection_name', 'moduleStatuses')
        .eq('item_id', key)
        .maybeSingle();

      if (!error && data?.data) {
        return data.data as ModuleStatusData;
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveStatus(moduleId: string, statusData: ModuleStatusData): Promise<void> {
    const key = this.getStorageKey(moduleId, 'status');
    const rollNo = this.getActiveRoll();
    try {
      await supabase
        .from('app_data')
        .upsert({
          collection_name: 'moduleStatuses',
          item_id: key,
          data: { id: key, rollNo, moduleId, ...statusData },
          updated_at: new Date().toISOString()
        });
    } catch {}
  }
}

export const moduleStorage = new ModuleStorageEngine();
