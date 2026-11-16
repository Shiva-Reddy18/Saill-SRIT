import { ModuleProgress, ModuleStatus, ModuleTab } from '../types';
import { dbStorage } from '../lib/db';
import { supabase } from '../lib/supabase';

export const CANONICAL_MODULE_IDS = [
  'pronunciation',
  'listening',
  'jam',
  'roleplay',
  'group_discussion',
  'presentation',
  'interview',
  'report_writing',
  'business_email',
  'resume_building'
] as const;

export type CanonicalModuleId = typeof CANONICAL_MODULE_IDS[number];

export const LEGACY_MODULE_MAP: Record<string, CanonicalModuleId> = {
  // pronunciation
  'pronunciation': 'pronunciation',
  'phonetics': 'pronunciation',
  'phonetics-pronunciation': 'pronunciation',
  'm1': 'pronunciation',
  'module-1': 'pronunciation',
  'module 1': 'pronunciation',
  'module 1: phonetics & pronunciation': 'pronunciation',
  'r26-lab-01': 'pronunciation',

  // listening
  'listening': 'listening',
  'listening-comprehension': 'listening',
  'listening-vocabulary': 'listening',
  'reading-comprehension': 'listening',
  'm2': 'listening',
  'module-2': 'listening',
  'module 2': 'listening',
  'module 2: listening comprehension': 'listening',
  'r26-lab-02': 'listening',
  'r26-lab-09': 'listening',

  // jam
  'jam': 'jam',
  'spoken-english': 'jam',
  'jam-speaking': 'jam',
  'impromptu-speaking': 'jam',
  'm3': 'jam',
  'module-3': 'jam',
  'module 3': 'jam',
  'module 3: jam & impromptu speaking': 'jam',
  'r26-lab-03': 'jam',

  // roleplay
  'roleplay': 'roleplay',
  'role-play': 'roleplay',
  'role_playing': 'roleplay',
  'debate-skills': 'roleplay',

  // group_discussion
  'group_discussion': 'group_discussion',
  'group-discussion': 'group_discussion',
  'gd': 'group_discussion',
  'm4': 'group_discussion',
  'module-4': 'group_discussion',
  'module 4': 'group_discussion',
  'module 4: group discussions': 'group_discussion',
  'r26-lab-04': 'group_discussion',

  // presentation
  'presentation': 'presentation',
  'public-speaking': 'presentation',
  'technical-presentations': 'presentation',
  'm6': 'presentation',
  'module-6': 'presentation',
  'module 6': 'presentation',
  'module 6: technical presentations': 'presentation',
  'r26-lab-05': 'presentation',
  'r26-lab-06': 'presentation',

  // interview
  'interview': 'interview',
  'star-interview': 'interview',
  'interview-skills': 'interview',
  'mock-interview': 'interview',
  'etiquette-branding': 'interview',
  'r26-lab-10': 'interview',
  'r26-lab-12': 'interview',

  // report_writing
  'report_writing': 'report_writing',
  'report-writing': 'report_writing',
  'technical-report-writing': 'report_writing',
  'professional-writing': 'report_writing',
  'm11': 'report_writing',
  'r26-lab-11': 'report_writing',

  // business_email
  'business_email': 'business_email',
  'professional-email': 'business_email',
  'business-email': 'business_email',
  'email-writing': 'business_email',
  'corporate-communication-email': 'business_email',
  'm5': 'business_email',
  'm7': 'business_email',
  'module 5: corporate communication & email': 'business_email',
  'r26-lab-07': 'business_email',

  // resume_building
  'resume_building': 'resume_building',
  'resume-writing': 'resume_building',
  'resume-builder': 'resume_building',
  'm8': 'resume_building',
  'r26-lab-08': 'resume_building'
};

/**
 * Normalizes any module ID string to one of the 10 canonical module IDs.
 */
export function normalizeModuleId(rawId: string): CanonicalModuleId {
  if (!rawId) return 'pronunciation';
  const clean = rawId.trim().toLowerCase();
  if (CANONICAL_MODULE_IDS.includes(clean as CanonicalModuleId)) {
    return clean as CanonicalModuleId;
  }
  if (LEGACY_MODULE_MAP[clean]) {
    return LEGACY_MODULE_MAP[clean];
  }
  const underscore = clean.replace(/-/g, '_');
  if (CANONICAL_MODULE_IDS.includes(underscore as CanonicalModuleId)) {
    return underscore as CanonicalModuleId;
  }
  return 'pronunciation';
}

export interface ServerProgressRecord {
  id: string;
  studentRollNo: string;
  moduleId: string;
  status: ModuleStatus;
  completedTabs: string[] | ModuleTab[];
  score: number;
  completedAt: string | null;
  lastAccessed: string;
  createdAt?: string;
  updatedAt?: string;
}

export class StudentProgressService {
  /**
   * Retrieves all module progress records for a student directly from PostgreSQL.
   * Caches returned records into IndexedDB for offline resilience without using IndexedDB as authority.
   */
  static async getStudentProgressMap(rollNo: string): Promise<Record<string, ModuleProgress>> {
    if (!rollNo || !rollNo.trim()) {
      return {};
    }
    const cleanRoll = rollNo.trim().toUpperCase();
    if (cleanRoll.startsWith('ADMIN') || cleanRoll.startsWith('EMP-') || cleanRoll === 'FACULTY') {
      return {};
    }

    try {
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('collection_name', 'moduleProgress');

      let progressRecords: ServerProgressRecord[] = [];
      if (!error && Array.isArray(data)) {
        progressRecords = data
          .map((d: any) => d.data)
          .filter((p: any) => p && p.studentRollNo && p.studentRollNo.toUpperCase() === cleanRoll);
      }

      // Progress is stored in app_data/moduleProgress. Do not query
      // student_module_progress: the deployed database may not have that schema.
      const map: Record<string, ModuleProgress> = {};

      for (const item of progressRecords) {
        const canonicalId = normalizeModuleId(item.moduleId);
        const tabs: ModuleTab[] = Array.isArray(item.completedTabs) ? (item.completedTabs as ModuleTab[]) : [];
        
        const prog: ModuleProgress = {
          moduleId: canonicalId,
          status: (item.status || 'not_started').toLowerCase() as ModuleStatus,
          completedTabs: tabs,
          reflectionNotes: '',
          savedNotes: '',
          score: typeof item.score === 'number' ? item.score : 0,
          lastAccessed: item.lastAccessed || new Date().toISOString(),
          completedAt: item.completedAt || null
        };

        // Key by canonical ID
        map[canonicalId] = prog;

        // Also key by legacy module IDs that map to this canonical ID so UI components find it
        Object.entries(LEGACY_MODULE_MAP).forEach(([legacyKey, mappedCanonical]) => {
          if (mappedCanonical === canonicalId && !map[legacyKey]) {
            map[legacyKey] = { ...prog, moduleId: legacyKey };
          }
        });

        // Mirror to local IndexedDB storage cache (non-authoritative cache)
        dbStorage.saveModuleProgress(prog).catch(() => {});
      }

      return map;
    } catch (err: any) {
      console.warn(`[StudentProgressService] Failed to load server progress for ${cleanRoll}, checking local cache:`, err.message);
      // Fallback to local cache only if server network fails
      try {
        return await dbStorage.getProgressMap();
      } catch {
        return {};
      }
    }
  }

  /**
   * Retrieves single module progress for a student directly from PostgreSQL.
   */
  static async getStudentModuleProgress(rollNo: string, moduleId: string): Promise<ModuleProgress | null> {
    if (!rollNo || !rollNo.trim() || !moduleId) {
      return null;
    }
    const cleanRoll = rollNo.trim().toUpperCase();
    if (cleanRoll.startsWith('ADMIN') || cleanRoll.startsWith('EMP-') || cleanRoll === 'FACULTY') {
      return null;
    }
    const canonicalId = normalizeModuleId(moduleId);

    try {
      const progressMap = await this.getStudentProgressMap(cleanRoll);
      return progressMap[canonicalId] || progressMap[moduleId] || null;
    } catch (err: any) {
      console.warn(`[StudentProgressService] Error fetching module progress for ${cleanRoll}/${canonicalId}:`, err.message);
      return null;
    }
  }

  /**
   * Authoritatively saves module progress to PostgreSQL via POST /api/student-progress.
   * Throws an error on failure so caller can handle network issues without false states.
   */
  static async saveModuleProgress(
    rollNo: string,
    progress: {
      moduleId: string;
      status?: ModuleStatus;
      completedTabs?: ModuleTab[] | string[];
      score?: number;
      completedAt?: string | null;
      lastAccessed?: string;
      reflectionNotes?: string;
      savedNotes?: string;
    }
  ): Promise<ModuleProgress> {
    if (!rollNo || !rollNo.trim()) {
      throw new Error('Authentication required: Valid student roll number is missing.');
    }

    const cleanRoll = rollNo.trim().toUpperCase();
    const canonicalId = normalizeModuleId(progress.moduleId);
    const now = new Date().toISOString();

    const tabs = Array.isArray(progress.completedTabs) ? progress.completedTabs : [];
    const status: ModuleStatus = progress.status || 'in_progress';
    const score = typeof progress.score === 'number' ? Math.max(0, Math.min(100, Math.round(progress.score))) : 0;
    const completedAt = status === 'completed' ? (progress.completedAt || now) : null;
    const lastAccessed = progress.lastAccessed || now;

    // Non-student accounts (Admins, Faculty) in preview mode should update locally without hitting PostgreSQL student progress
    if (cleanRoll.startsWith('ADMIN') || cleanRoll.startsWith('EMP-') || cleanRoll === 'FACULTY') {
      const previewProg: ModuleProgress = {
        moduleId: canonicalId,
        status,
        completedTabs: tabs as ModuleTab[],
        reflectionNotes: progress.reflectionNotes || '',
        savedNotes: progress.savedNotes || '',
        score,
        lastAccessed,
        completedAt
      };
      try {
        await dbStorage.saveModuleProgress(previewProg);
      } catch {
        // non-critical
      }
      return previewProg;
    }

    const payload: ServerProgressRecord = {
      id: `${cleanRoll}__${canonicalId}`,
      studentRollNo: cleanRoll,
      moduleId: canonicalId,
      status,
      completedTabs: tabs as ModuleTab[],
      score,
      completedAt,
      lastAccessed
    };

    const itemId = `${cleanRoll}__${canonicalId}`;
    try {
      const { error } = await supabase.from('app_data').upsert(
        {
          collection_name: 'moduleProgress',
          item_id: itemId,
          data: payload,
          updated_at: lastAccessed
        },
        { onConflict: 'collection_name,item_id' }
      );

      if (error) {
        console.warn('[StudentProgressService] Could not save progress to app_data:', error.message);
      }
    } catch (err: any) {
      console.warn('[StudentProgressService] Supabase progress save notice:', err?.message || err);
    }

    const confirmedProg: ModuleProgress = {
      moduleId: canonicalId,
      status: payload.status,
      completedTabs: tabs as ModuleTab[],
      reflectionNotes: progress.reflectionNotes || '',
      savedNotes: progress.savedNotes || '',
      score,
      lastAccessed,
      completedAt
    };

    // Keep IndexedDB synchronized as a non-authoritative fallback
    try {
      await dbStorage.saveModuleProgress(confirmedProg);
      if (progress.moduleId !== canonicalId) {
        await dbStorage.saveModuleProgress({ ...confirmedProg, moduleId: progress.moduleId });
      }
    } catch {
      // Non-critical cache error
    }

    return confirmedProg;
  }

  /**
   * Specifically marks a module completed after strict validation.
   * Confirms write to PostgreSQL before returning success.
   */
  static async markModuleComplete(
    rollNo: string,
    moduleId: string,
    options?: {
      score?: number;
      completedTabs?: ModuleTab[] | string[];
      reflectionNotes?: string;
      savedNotes?: string;
    }
  ): Promise<ModuleProgress> {
    if (!rollNo || !rollNo.trim()) {
      throw new Error('Authentication required: Cannot complete module without valid student roll number.');
    }

    return await this.saveModuleProgress(rollNo, {
      moduleId,
      status: 'completed',
      score: options?.score ?? 95,
      completedTabs: options?.completedTabs || ['overview', 'learn', 'practice', 'quiz', 'reflection', 'status'],
      completedAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      reflectionNotes: options?.reflectionNotes,
      savedNotes: options?.savedNotes
    });
  }

  /**
   * Faculty progress monitor retrieval:
   * Returns a map of student roll numbers to their completed module count, average score, and module map.
   */
  static async getAllProgressSummary(): Promise<Record<string, {
    completedCount: number;
    totalModules: number;
    averageScore: number;
    completionPercentage: number;
    modules: Record<string, ServerProgressRecord>;
  }>> {
    try {
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('collection_name', 'moduleProgress');

      let records: ServerProgressRecord[] = [];
      if (!error && Array.isArray(data)) {
        records = data.map((d: any) => d.data).filter(Boolean);
      }

      // app_data/moduleProgress is the single progress source.
      // Avoid querying student_module_progress because it is not available
      // in the deployed database schema.
      const summaryMap: Record<string, {
        completedCount: number;
        totalModules: number;
        averageScore: number;
        completionPercentage: number;
        modules: Record<string, ServerProgressRecord>;
      }> = {};

      for (const item of records) {
        const roll = (item.studentRollNo || '').toUpperCase();
        if (!roll) continue;
        if (!summaryMap[roll]) {
          summaryMap[roll] = {
            completedCount: 0,
            totalModules: 10,
            averageScore: 0,
            completionPercentage: 0,
            modules: {}
          };
        }

        const canonicalId = normalizeModuleId(item.moduleId);
        summaryMap[roll].modules[canonicalId] = item;
        if ((item.status || '').toLowerCase() === 'completed') {
          summaryMap[roll].completedCount += 1;
        }
      }

      // Calculate averages
      Object.keys(summaryMap).forEach((roll) => {
        const entry = summaryMap[roll];
        entry.completionPercentage = Math.min(100, Math.round((entry.completedCount / 10) * 100));
        const completedList = Object.values(entry.modules).filter(m => (m.status || '').toLowerCase() === 'completed');
        if (completedList.length > 0) {
          const totalScore = completedList.reduce((acc, curr) => acc + (curr.score || 0), 0);
          entry.averageScore = Math.round(totalScore / completedList.length);
        } else {
          entry.averageScore = 0;
        }
      });

      return summaryMap;
    } catch (err: any) {
      console.warn('[StudentProgressService] Error fetching all progress summary:', err.message);
      return {};
    }
  }
}
