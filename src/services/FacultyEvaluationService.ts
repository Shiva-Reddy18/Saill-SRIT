import { FacultyModuleScore, StudentProfile } from '../types';
import { dbStorage } from '../lib/db';
import { supabase } from '../lib/supabase';

export interface EvaluationItemSummary {
  studentRollNo: string;
  studentName: string;
  batchId: string;
  batchName: string;
  moduleId: string;
  moduleTitle: string;
  moduleCompletionPercent: number;
  isCompleted: boolean;
  aiPracticeScore: number;
  knowledgeCheckScore: number;
  facultyScore: number | null; // 1-10 scale
  facultyRemarks: string;
  evaluatedAt: string | null;
  facultyName: string | null;
  facultyId: string | null;
}

export class FacultyEvaluationService {
  /**
   * Save or update a Faculty Module Performance Score (1-10 scale) via Supabase PostgreSQL.
   */
  static async recordScore(
    studentRollNo: string,
    studentName: string,
    moduleId: string,
    moduleTitle: string,
    batchId: string,
    batchName: string,
    facultyId: string,
    facultyName: string,
    score: number,
    remarks?: string,
    facultyDepartment?: string
  ): Promise<FacultyModuleScore> {
    const sanitizedScore = Math.min(10, Math.max(1, Math.round(score)));
    const normRoll = studentRollNo.trim().toUpperCase();
    const normMod = moduleId.trim().toLowerCase();
    const nowIso = new Date().toISOString();

    let savedRecord: FacultyModuleScore | null = null;

    try {
      const evalId = `${normRoll}__${normMod}`;
      await supabase.from('faculty_module_evaluations').upsert({
        id: evalId,
        student_roll_no: normRoll,
        student_name: studentName.trim(),
        module_id: normMod,
        module_title: moduleTitle.trim(),
        batch_id: batchId ? batchId.trim() : null,
        batch_name: batchName ? batchName.trim() : null,
        faculty_id: facultyId.trim(),
        faculty_name: facultyName.trim(),
        faculty_department: facultyDepartment || 'Humanities & Sciences (English)',
        score: sanitizedScore,
        remarks: remarks?.trim() || '',
        evaluated_at: nowIso,
        updated_at: nowIso
      });

      savedRecord = {
        id: evalId,
        studentRollNo: normRoll,
        studentName: studentName.trim(),
        moduleId: normMod,
        moduleTitle: moduleTitle.trim(),
        batchId: batchId ? batchId.trim() : undefined,
        batchName: batchName ? batchName.trim() : undefined,
        facultyId: facultyId.trim(),
        facultyName: facultyName.trim(),
        facultyDepartment: facultyDepartment || 'Humanities & Sciences (English)',
        score: sanitizedScore,
        remarks: remarks?.trim() || '',
        evaluatedAt: nowIso,
        updatedAt: nowIso
      };
    } catch (err: any) {
      console.warn('[FacultyEvaluationService] Supabase evaluation save notice:', err.message);
    }

    if (!savedRecord) {
      const existing = await dbStorage.getFacultyModuleScore(normRoll, normMod);
      savedRecord = {
        id: `${normRoll}__${normMod}`,
        studentRollNo: normRoll,
        studentName: studentName.trim(),
        moduleId: normMod,
        moduleTitle: moduleTitle.trim(),
        batchId: batchId.trim(),
        batchName: batchName.trim(),
        facultyId: facultyId.trim(),
        facultyName: facultyName.trim(),
        facultyDepartment: facultyDepartment || 'Humanities & Sciences (English)',
        score: sanitizedScore,
        remarks: remarks?.trim() || '',
        evaluatedAt: existing?.evaluatedAt || nowIso,
        updatedAt: nowIso
      };
    }

    // Mirror to local storage for offline responsiveness
    const saved = await dbStorage.saveFacultyModuleScore(savedRecord);

    // Audit log
    try {
      await dbStorage.addAuditLog(
        facultyId,
        facultyName,
        'faculty_incharge',
        'SUBMISSION_EVALUATED',
        `Assigned Faculty Module Performance Score of ${sanitizedScore}/10 to ${studentName} (${normRoll}) for ${moduleTitle}.`
      );
    } catch {
      // ignore
    }

    return saved;
  }

  /**
   * Delete score from PostgreSQL and local storage.
   */
  static async deleteScore(studentRollNo: string, moduleId: string): Promise<boolean> {
    const normRoll = studentRollNo.trim().toUpperCase();
    const normMod = moduleId.trim().toLowerCase();
    try {
      await supabase
        .from('faculty_module_evaluations')
        .delete()
        .eq('student_roll_no', normRoll)
        .eq('module_id', normMod);
    } catch (err: any) {
      console.warn('[FacultyEvaluationService] Delete score notice:', err.message);
    }
    await dbStorage.deleteFacultyModuleScore(`${normRoll}__${normMod}`);
    return true;
  }

  /**
   * Get single score for a student and module.
   */
  static async getScore(studentRollNo: string, moduleId: string): Promise<FacultyModuleScore | null> {
    const scores = await this.getScoresForStudent(studentRollNo);
    return scores.find(s => s.moduleId.toLowerCase() === moduleId.trim().toLowerCase()) || null;
  }

  /**
   * Get all faculty module scores.
   */
  static async getAllScores(): Promise<FacultyModuleScore[]> {
    try {
      const { data, error } = await supabase.from('faculty_module_evaluations').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        const evaluations: FacultyModuleScore[] = data.map((ev: any) => ({
          id: ev.id,
          studentRollNo: ev.student_roll_no,
          studentName: ev.student_name,
          moduleId: ev.module_id,
          moduleTitle: ev.module_title,
          batchId: ev.batch_id,
          batchName: ev.batch_name,
          facultyId: ev.faculty_id,
          facultyName: ev.faculty_name,
          facultyDepartment: ev.faculty_department,
          score: Number(ev.score),
          remarks: ev.remarks || '',
          evaluatedAt: ev.evaluated_at,
          updatedAt: ev.updated_at
        }));
        for (const ev of evaluations) {
          await dbStorage.saveFacultyModuleScore(ev);
        }
        return evaluations;
      }
    } catch (err: any) {
      console.warn('[FacultyEvaluationService] Fetching all scores from Supabase notice:', err.message);
    }
    return await dbStorage.getAllFacultyModuleScores();
  }

  /**
   * Get scores for a specific batch from PostgreSQL.
   */
  static async getScoresByBatch(batchId: string): Promise<FacultyModuleScore[]> {
    const normBatch = batchId.trim();
    try {
      const { data, error } = await supabase
        .from('faculty_module_evaluations')
        .select('*')
        .eq('batch_id', normBatch);

      if (!error && Array.isArray(data) && data.length > 0) {
        const evaluations: FacultyModuleScore[] = data.map((ev: any) => ({
          id: ev.id,
          studentRollNo: ev.student_roll_no,
          studentName: ev.student_name,
          moduleId: ev.module_id,
          moduleTitle: ev.module_title,
          batchId: ev.batch_id,
          batchName: ev.batch_name,
          facultyId: ev.faculty_id,
          facultyName: ev.faculty_name,
          facultyDepartment: ev.faculty_department,
          score: Number(ev.score),
          remarks: ev.remarks || '',
          evaluatedAt: ev.evaluated_at,
          updatedAt: ev.updated_at
        }));
        for (const ev of evaluations) {
          await dbStorage.saveFacultyModuleScore(ev);
        }
        return evaluations;
      }
    } catch (err: any) {
      console.warn('[FacultyEvaluationService] Fetching batch scores notice:', err.message);
    }
    return await dbStorage.getFacultyModuleScoresByBatch(normBatch);
  }

  /**
   * Get scores for a specific student across all modules from PostgreSQL.
   */
  static async getScoresForStudent(studentRollNo: string): Promise<FacultyModuleScore[]> {
    const normRoll = studentRollNo.trim().toUpperCase();
    try {
      const { data, error } = await supabase
        .from('faculty_module_evaluations')
        .select('*')
        .eq('student_roll_no', normRoll);

      if (!error && Array.isArray(data) && data.length > 0) {
        const evaluations: FacultyModuleScore[] = data.map((ev: any) => ({
          id: ev.id,
          studentRollNo: ev.student_roll_no,
          studentName: ev.student_name,
          moduleId: ev.module_id,
          moduleTitle: ev.module_title,
          batchId: ev.batch_id,
          batchName: ev.batch_name,
          facultyId: ev.faculty_id,
          facultyName: ev.faculty_name,
          facultyDepartment: ev.faculty_department,
          score: Number(ev.score),
          remarks: ev.remarks || '',
          evaluatedAt: ev.evaluated_at,
          updatedAt: ev.updated_at
        }));
        for (const ev of evaluations) {
          await dbStorage.saveFacultyModuleScore(ev);
        }
        return evaluations;
      }
    } catch (err: any) {
      console.warn('[FacultyEvaluationService] Fetching student scores notice:', err.message);
    }
    return await dbStorage.getFacultyModuleScoresForStudent(normRoll);
  }

  /**
   * Get scores evaluated by a specific faculty member from PostgreSQL.
   */
  static async getScoresByFaculty(facultyId: string): Promise<FacultyModuleScore[]> {
    const normId = facultyId.trim();
    try {
      const { data, error } = await supabase
        .from('faculty_module_evaluations')
        .select('*')
        .eq('faculty_id', normId);

      if (!error && Array.isArray(data) && data.length > 0) {
        const evaluations: FacultyModuleScore[] = data.map((ev: any) => ({
          id: ev.id,
          studentRollNo: ev.student_roll_no,
          studentName: ev.student_name,
          moduleId: ev.module_id,
          moduleTitle: ev.module_title,
          batchId: ev.batch_id,
          batchName: ev.batch_name,
          facultyId: ev.faculty_id,
          facultyName: ev.faculty_name,
          facultyDepartment: ev.faculty_department,
          score: Number(ev.score),
          remarks: ev.remarks || '',
          evaluatedAt: ev.evaluated_at,
          updatedAt: ev.updated_at
        }));
        for (const ev of evaluations) {
          await dbStorage.saveFacultyModuleScore(ev);
        }
        return evaluations;
      }
    } catch (err: any) {
      console.warn('[FacultyEvaluationService] Fetching faculty scores notice:', err.message);
    }
    return await dbStorage.getFacultyModuleScoresByFaculty(normId);
  }

  /**
   * Score performance descriptors for 1-10 display
   */
  static getScoreDescriptor(score: number): { label: string; color: string; badgeBg: string } {
    if (score >= 9) return { label: 'Outstanding', color: 'text-emerald-700', badgeBg: 'bg-emerald-100 border-emerald-300' };
    if (score >= 8) return { label: 'Very Good', color: 'text-teal-700', badgeBg: 'bg-teal-100 border-teal-300' };
    if (score >= 7) return { label: 'Good', color: 'text-blue-700', badgeBg: 'bg-blue-100 border-blue-300' };
    if (score >= 6) return { label: 'Competent', color: 'text-amber-700', badgeBg: 'bg-amber-100 border-amber-300' };
    if (score >= 5) return { label: 'Satisfactory', color: 'text-orange-700', badgeBg: 'bg-orange-100 border-orange-300' };
    return { label: 'Needs Remediation', color: 'text-rose-700', badgeBg: 'bg-rose-100 border-rose-300' };
  }
}
