import {
  StudentProfile,
  ModuleProgress,
  FacultyModuleScore,
  StudentActivitySubmission,
  ActivitySubmissionStatus,
  ActivityType,
  RecordingItem,
  PortfolioItem,
  Badge,
  FacultyAccount,
  FacultyInchargeScope,
  AdministratorAccount,
  AuditLogRecord,
  UserRole,
  AcademicBatch,
  StudentBatchTransferRecord,
  BatchAnalyticsSummary,
  BatchReportType,
  BatchStatus,
  PasswordResetTokenRecord
} from '../types';
import { QuizAttemptRecord } from '../types/knowledgeCheck';
import { normalizeRole } from '../types/auth';
import { UserRegistrationRecord, AccountStatus } from '../types/registration';
import {
  Department,
  Branch,
  AcademicYearEntity,
  SemesterEntity,
  SectionEntity,
  ProgrammeEntity,
  ModuleReleaseRecord,
  FacultyAssignment
} from '../types/academic';
import { AcademicStructureService } from '../services/AcademicStructureService';
import { supabase } from './supabase';
import { SupabaseAuthService } from './auth';

const DB_NAME = 'SAILL_Lab_DB';
const APP_DATA_QUERY_TIMEOUT_MS = 10000;

function getFacultyAssignmentRequestError(action: string, error: unknown, signal: AbortSignal): Error {
  const detail = error instanceof Error
    ? error
    : new Error(typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : String(error));

  if (
    signal.aborted ||
    detail.name === 'TimeoutError' ||
    detail.name === 'AbortError' ||
    /timed out|timeout/i.test(detail.message)
  ) {
    return new Error(
      `Supabase request timed out after ${APP_DATA_QUERY_TIMEOUT_MS / 1000} seconds while ${action}. Check your connection and try again.`
    );
  }
  if (/failed to fetch|network|fetch error|load failed/i.test(detail.message)) {
    return new Error(`Network error while ${action}. Check your connection and try again.`);
  }
  return new Error(`Failed to ${action}: ${detail.message || 'Unknown Supabase error'}`);
}

function normalizeRegistrationStatus(status: unknown): 'pending' | 'approved' | 'rejected' | 'disabled' {
  const value = String(status || '').toLowerCase();
  if (value === 'approved' || value === 'active') return 'approved';
  if (value === 'rejected') return 'rejected';
  if (value === 'disabled' || value === 'inactive') return 'disabled';
  return 'pending';
}

async function registrationIdentifierExists(value: string, type: 'email' | 'roll_no' | 'employee_id'): Promise<boolean> {
  const { data, error } = await supabase.rpc('registration_identifier_exists', {
    identifier_input: value,
    identifier_type: type
  });
  if (error) {
    throw new Error(`Failed to verify whether the registration identifier is already in use: ${error.message}`);
  }
  return data === true;
}

async function getSupabaseAppDataFromDatabase<T>(collection: string): Promise<T[]> {
  const { data, error } = await supabase
    .from('app_data')
    .select('data')
    .eq('collection_name', collection)
    .abortSignal(AbortSignal.timeout(APP_DATA_QUERY_TIMEOUT_MS));

  if (error) {
    throw new Error(`Failed to load ${collection} from Supabase: ${error.message}`);
  }

  return Array.isArray(data) ? data.map((item) => item.data as T).filter(Boolean) : [];
}

async function getSupabaseAppData<T>(collection: string): Promise<T[]> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('data')
      .eq('collection_name', collection);
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((d) => d.data as T).filter(Boolean);
    }
  } catch (err) {
    console.warn(`[db] getSupabaseAppData error for ${collection}:`, err);
  }
  try {
    const cached = localStorage.getItem(`saill_cache_${collection}`);
    if (cached) return JSON.parse(cached);
  } catch {}
  return [];
}

async function getSupabaseAppDataItem<T>(collection: string, itemId: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('data')
      .eq('collection_name', collection)
      .eq('item_id', itemId)
      .maybeSingle();
    if (!error && data?.data) {
      return data.data as T;
    }
  } catch {}
  const all = await getSupabaseAppData<any>(collection);
  return all.find((item) => item.id === itemId || item.item_id === itemId || item.rollNo === itemId) || null;
}

async function saveSupabaseAppData<T = any>(collection: string, itemId: string, item: T): Promise<void> {
  const payload = { ...(item as any), id: itemId };
  try {
    await supabase
      .from('app_data')
      .upsert({
        collection_name: collection,
        item_id: itemId,
        data: payload,
        updated_at: new Date().toISOString()
      });
  } catch (err) {
    console.warn(`[db] saveSupabaseAppData warning for ${collection}:`, err);
  }
  try {
    const cached = await getSupabaseAppData<any>(collection);
    const idx = cached.findIndex((x) => x.id === itemId || x.item_id === itemId);
    if (idx >= 0) cached[idx] = payload;
    else cached.push(payload);
    localStorage.setItem(`saill_cache_${collection}`, JSON.stringify(cached));
  } catch {}
}

async function deleteSupabaseAppData(collection: string, itemId: string): Promise<void> {
  try {
    await supabase
      .from('app_data')
      .delete()
      .eq('collection_name', collection)
      .eq('item_id', itemId);
  } catch {}
  try {
    const cached = await getSupabaseAppData<any>(collection);
    const filtered = cached.filter((x) => x.id !== itemId && x.item_id !== itemId);
    localStorage.setItem(`saill_cache_${collection}`, JSON.stringify(filtered));
  } catch {}
}

export function normalizeSemesterString(sem: string): string {
  if (!sem) return 'Semester I';
  const trimmed = sem.trim();
  const lower = trimmed.toLowerCase();
  if (lower === '1' || lower === 'i' || lower === 'semester 1' || lower === 'semester i' || lower === 'sem 1' || lower === 'sem i' || lower === 'first semester') {
    return 'Semester I';
  }
  if (lower === '2' || lower === 'ii' || lower === 'semester 2' || lower === 'semester ii' || lower === 'sem 2' || lower === 'sem ii' || lower === 'second semester') {
    return 'Semester II';
  }
  if (lower === '3' || lower === 'iii' || lower === 'semester 3' || lower === 'semester iii' || lower === 'sem 3' || lower === 'sem iii') {
    return 'Semester III';
  }
  if (lower === '4' || lower === 'iv' || lower === 'semester 4' || lower === 'semester iv' || lower === 'sem 4' || lower === 'sem iv') {
    return 'Semester IV';
  }
  if (lower === '5' || lower === 'v' || lower === 'semester 5' || lower === 'semester v') {
    return 'Semester V';
  }
  if (lower === '6' || lower === 'vi' || lower === 'semester 6' || lower === 'semester vi') {
    return 'Semester VI';
  }
  if (lower === '7' || lower === 'vii' || lower === 'semester 7' || lower === 'semester vii') {
    return 'Semester VII';
  }
  if (lower === '8' || lower === 'viii' || lower === 'semester 8' || lower === 'semester viii') {
    return 'Semester VIII';
  }
  if (!trimmed.toLowerCase().startsWith('semester')) {
    return `Semester ${trimmed}`;
  }
  return trimmed;
}

export function normalizeSectionString(sec: string): string {
  if (!sec) return '';
  const trimmed = sec.trim().toUpperCase();
  return trimmed.replace(/^SECTION\s*/i, '').replace(/[-_]/g, ' ').trim();
}

export function normalizeAcademicYearString(year: string): string {
  if (!year) return '';
  return year.trim().replace(/[\u2013\u2014]/g, '-');
}

export function normalizeBranchString(branch: string): string {
  if (!branch) return '';
  return branch.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeProgrammeString(prog: string): string {
  if (!prog) return 'btech';
  return prog.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface StudentCredentialsRecord {
  rollNo: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  status?: string;
}

export interface SaillDB {
  studentProfile: StudentProfile;
  moduleProgress: Record<string, ModuleProgress>;
  recordings: RecordingItem[];
  portfolioItems: PortfolioItem[];
  badges: Badge[];
  quizAttempts: QuizAttemptRecord[];
  studentProfiles: StudentProfile[];
  studentCredentials: StudentCredentialsRecord[];
  faculty: FacultyAccount[];
  facultyInchargeAssignments: FacultyInchargeScope[];
  administrators: AdministratorAccount[];
  auditLogs: AuditLogRecord[];
  batches: AcademicBatch[];
  batchTransfers: StudentBatchTransferRecord[];
  userRegistrations: UserRegistrationRecord[];
}

export async function hashPassword(password: string): Promise<string> {
  try {
    const msgUint8 = new TextEncoder().encode(password + '_saill_srit_salt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return btoa(password + '_saill_salt');
  }
}

export const DEFAULT_BATCHES: AcademicBatch[] = [];
export const DEFAULT_FACULTY_ACCOUNT: FacultyAccount | null = null;
export const DEFAULT_INCHARGE_ACCOUNT: FacultyAccount | null = null;
export const DEFAULT_INCHARGE_SCOPE: FacultyInchargeScope | null = null;

export const DEFAULT_ADMIN_ACCOUNT: AdministratorAccount = {
  username: 'SAILL_ADMIN',
  fullName: 'Dr Anil Kumar D',
  email: 'admin@srit.ac.in',
  role: 'administrator',
  status: 'ACTIVE',
  employeeId: 'SRIT-003',
  department: 'System Administration & Institutional Governance',
  designation: 'System Administrator & Lab In-Charge',
  passwordHash: '$2b$10$tJiyfaKnDdKin5e.0ega1e.9XOjGQ4m7cfESpbv0T74uD2KY3yqDi',
  createdAt: '2026-09-16T07:43:38.124Z'
};

const DEFAULT_BADGES: Badge[] = [
  {
    id: 'b-welcome',
    title: 'Lab Starter',
    description: 'Enrolled in SAILL R26 Communicative English Laboratory.',
    category: 'Onboarding',
    iconName: 'Rocket',
    unlocked: true,
    unlockedAt: new Date().toISOString()
  },
  {
    id: 'b-pronunciation',
    title: 'Phonetic Master',
    description: 'Mastered IPA Vowel and Consonant charts with audio practice.',
    category: 'Pronunciation',
    iconName: 'Mic',
    unlocked: false
  },
  {
    id: 'b-email',
    title: 'Corporate Communicator',
    description: 'Drafted a perfect formal engineering email.',
    category: 'Writing',
    iconName: 'Mail',
    unlocked: false
  },
  {
    id: 'b-speech',
    title: 'Orator Extraordinaire',
    description: 'Completed a 60-second JAM speaking challenge without hesitation.',
    category: 'Speaking',
    iconName: 'Volume2',
    unlocked: false
  },
  {
    id: 'b-resume',
    title: 'Career Ready',
    description: 'Built an ATS-friendly engineering resume.',
    category: 'Career',
    iconName: 'FileText',
    unlocked: false
  },
  {
    id: 'b-offline',
    title: 'Offline Scholar',
    description: 'Saved learning material for offline usage on PWA.',
    category: 'PWA',
    iconName: 'WifiOff',
    unlocked: true,
    unlockedAt: new Date().toISOString()
  }
];

export class IndexedDBStorage {
  private activeRollNoCache: string = '';
  private authTokenCache: string = '';

  private purgeClientStorage(): void {
    if (typeof window === 'undefined' || !window.indexedDB) return;
    for (const databaseName of [DB_NAME, 'SAILL_Lab_DB_2026', 'SAILL_DB', 'saill_db']) {
      try {
        window.indexedDB.deleteDatabase(databaseName);
      } catch {}
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('saill_auth_token') || this.authTokenCache;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const role = localStorage.getItem('saill_active_role');
      if (role) headers['X-User-Role'] = role;
      const roll = localStorage.getItem('saill_active_roll_no') || this.activeRollNoCache;
      if (roll) headers['X-Student-Roll'] = roll;
      const fac = localStorage.getItem('saill_active_faculty_id');
      if (fac) headers['X-Faculty-Id'] = fac;
    }
    return headers;
  }

  private getActiveRoll(): string {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('saill_active_roll_no') || this.activeRollNoCache || '264G1A0501';
    }
    return this.activeRollNoCache || '264G1A0501';
  }

  public async initDB(): Promise<any> {
    return Promise.resolve({
      transaction: () => ({
        objectStore: () => ({
          getAll: () => Promise.resolve([])
        })
      })
    });
  }

  public async ensureBaselineData(idb?: any): Promise<void> {
    // Supabase already holds the baseline data
    return Promise.resolve();
  }

  // --- Student Activity Records & Submissions ---
  async saveActivitySubmission(submission: StudentActivitySubmission): Promise<StudentActivitySubmission> {
    const normalizedRoll = submission.studentRollNo.trim().toUpperCase();
    const id = submission.id || `sub_${normalizedRoll}_${submission.moduleId.trim()}_${submission.activityId.trim()}`;
    const normalizedRecord: StudentActivitySubmission = {
      ...submission,
      id,
      studentRollNo: normalizedRoll,
      submittedAt: submission.submittedAt || new Date().toISOString(),
      status: submission.status || 'submitted'
    };

    await saveSupabaseAppData('studentActivitySubmissions', id, normalizedRecord);
    return normalizedRecord;
  }

  async updateActivitySubmissionStatus(
    id: string,
    status: ActivitySubmissionStatus,
    remarks?: string,
    facultyId?: string,
    facultyName?: string,
    resubmissionReason?: string,
    evaluatedScore?: number
  ): Promise<StudentActivitySubmission | null> {
    const submissions = await this.getAllActivitySubmissions();
    const item = submissions.find((s) => s.id === id);
    if (item) {
      item.status = status;
      if (remarks !== undefined) item.facultyRemarks = remarks;
      if (evaluatedScore !== undefined) item.facultyScore = evaluatedScore;
      if (facultyId) {
        item.facultyReviewerId = facultyId;
        item.evaluatedByFacultyId = facultyId;
      }
      if (facultyName) {
        item.facultyReviewerName = facultyName;
        item.evaluatedByFacultyName = facultyName;
      }
      if (resubmissionReason !== undefined) {
        item.resubmissionReason = resubmissionReason;
      }
      item.facultyReviewed = status === 'reviewed';
      item.facultyReviewedAt = new Date().toISOString();
      item.evaluatedAt = new Date().toISOString();
      await this.saveActivitySubmission(item);
      return item;
    }
    return null;
  }

  async getActivitySubmission(studentRollNo: string, moduleId: string, activityId: string): Promise<StudentActivitySubmission | null> {
    const normalizedRoll = studentRollNo.trim().toUpperCase();
    const id = `sub_${normalizedRoll}_${moduleId.trim()}_${activityId.trim()}`;
    return await getSupabaseAppDataItem<StudentActivitySubmission>('studentActivitySubmissions', id);
  }

  async getActivitySubmissionsForStudent(studentRollNo: string, moduleId?: string): Promise<StudentActivitySubmission[]> {
    const normalizedRoll = studentRollNo.trim().toUpperCase();
    const all = await getSupabaseAppData<StudentActivitySubmission>('studentActivitySubmissions');
    return all.filter(
      (s: any) =>
        s.studentRollNo &&
        s.studentRollNo.toUpperCase() === normalizedRoll &&
        (!moduleId || s.moduleId === moduleId)
    );
  }

  async getAllActivitySubmissions(): Promise<StudentActivitySubmission[]> {
    return await getSupabaseAppData<StudentActivitySubmission>('studentActivitySubmissions');
  }

  // --- Faculty Module Scores ---
  async saveFacultyModuleScore(score: FacultyModuleScore): Promise<FacultyModuleScore> {
    const roll = score.studentRollNo.trim().toUpperCase();
    const id = score.id || `${roll}__${score.moduleId}`;
    const record = { ...score, id, studentRollNo: roll, updatedAt: new Date().toISOString() };
    await saveSupabaseAppData('facultyModuleScores', id, record);

    try {
      await supabase.from('faculty_module_evaluations').upsert({
        id,
        roll_no: roll,
        batch_id: score.batchId || 'DEFAULT',
        module_id: score.moduleId,
        faculty_id: score.facultyId || score.facultyInchargeId || 'FACULTY',
        score: (score as any).overallScore ?? (score as any).awardedMarks ?? score.score ?? 0,
        feedback: (score as any).feedbackComments ?? score.remarks ?? '',
        evaluation_status: 'EVALUATED',
        marks_awarded: (score as any).awardedMarks ?? (score as any).overallScore ?? score.score ?? 0,
        evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch {}

    return record;
  }

  async getFacultyModuleScore(studentRollNo: string, moduleId: string, batchId?: string): Promise<FacultyModuleScore | null> {
    const all = await this.getAllFacultyModuleScores();
    const normRoll = studentRollNo.trim().toUpperCase();
    const normMod = moduleId.trim().toLowerCase();
    return all.find(
      (s) =>
        s.studentRollNo.toUpperCase() === normRoll &&
        s.moduleId.toLowerCase() === normMod &&
        (!batchId || s.batchId === batchId)
    ) || null;
  }

  async getAllFacultyModuleScores(): Promise<FacultyModuleScore[]> {
    return await getSupabaseAppData<FacultyModuleScore>('facultyModuleScores');
  }

  async getFacultyModuleScoresForBatch(batchId: string, moduleId?: string): Promise<FacultyModuleScore[]> {
    const all = await this.getAllFacultyModuleScores();
    return all.filter((s) => s.batchId === batchId && (!moduleId || s.moduleId === moduleId));
  }

  async getFacultyModuleScoresByBatch(batchId: string, moduleId?: string): Promise<FacultyModuleScore[]> {
    return await this.getFacultyModuleScoresForBatch(batchId, moduleId);
  }

  async getFacultyModuleScoresForStudent(studentRollNo: string, moduleId?: string): Promise<FacultyModuleScore[]> {
    const all = await this.getAllFacultyModuleScores();
    const clean = studentRollNo.trim().toUpperCase();
    return all.filter((s) => s.studentRollNo.toUpperCase() === clean && (!moduleId || s.moduleId === moduleId));
  }

  async getFacultyModuleScoresByFaculty(facultyId: string): Promise<FacultyModuleScore[]> {
    const all = await this.getAllFacultyModuleScores();
    const normFaculty = facultyId.trim().toUpperCase();
    return all.filter(
      (s) =>
        (s.facultyId && s.facultyId.toUpperCase() === normFaculty) ||
        (s.facultyInchargeId && s.facultyInchargeId.toUpperCase() === normFaculty)
    );
  }

  async deleteFacultyModuleScore(idOrRoll: string, moduleId?: string): Promise<void> {
    const targetId = moduleId ? `${idOrRoll.trim().toUpperCase()}__${moduleId}` : idOrRoll;
    await deleteSupabaseAppData('facultyModuleScores', targetId);
    try {
      await supabase.from('faculty_module_evaluations').delete().eq('id', targetId);
    } catch {}
  }

  // --- Module Releases ---
  async saveModuleRelease(
    batchId: string,
    moduleId: string,
    releasedBy: string = 'FACULTY',
    scope?: {
      assignmentId: string;
      facultyId: string;
      branch: string;
      academicYear: string;
      semester: string;
      section: string;
    }
  ): Promise<ModuleReleaseRecord> {
    const releasedAt = new Date().toISOString();
    // Use the assignment ID in the storage key so older class-wide release
    // rows cannot collide with this faculty assignment's scoped release.
    // Keep batchId as the canonical class key for the student-side lookup.
    const itemId = scope?.assignmentId
      ? `${scope.assignmentId}__${moduleId}`
      : `${batchId}__${moduleId}`;
    const record = {
      id: itemId,
      batchId,
      moduleId,
      released: true,
      releasedAt,
      releasedBy,
      ...(scope || {})
    } as ModuleReleaseRecord;

    // Module releases are authorization-sensitive. Do not use the generic
    // cache-first helper here: it hides PostgREST errors and performs a
    // second read. The UI must only report success after this upsert succeeds.
    const { error } = await supabase
      .from('app_data')
      .upsert({
        collection_name: 'moduleReleases',
        item_id: itemId,
        data: record,
        updated_at: releasedAt
      })
      .abortSignal(AbortSignal.timeout(APP_DATA_QUERY_TIMEOUT_MS));
      // console.log('[RELEASE 3] Supabase response', { error });

if (error) {
  throw new Error(`Failed to save module release for ${batchId}: ${error.message}`);
}

    if (error) {
      throw new Error(`Failed to save module release for ${batchId}: ${error.message}`);
    }

    // Keep the local cache in sync without making another network request.
    try {
      if (typeof localStorage !== 'undefined') {
        const cacheKey = 'saill_cache_moduleReleases';
        const cachedValue = localStorage.getItem(cacheKey);
        const cached: any[] = cachedValue ? JSON.parse(cachedValue) : [];
        const safeCached = Array.isArray(cached) ? cached : [];
        const index = safeCached.findIndex(
          (item) => item && (item.id === record.id || item.item_id === record.id)
        );
        if (index >= 0) safeCached[index] = record;
        else safeCached.push(record);
        localStorage.setItem(cacheKey, JSON.stringify(safeCached));
      }
    } catch (cacheError) {
      console.warn('[db] Module release saved, but local cache update failed:', cacheError);
    }

    return record;
  }

  async getModuleReleasesForBatch(batchId: string): Promise<ModuleReleaseRecord[]> {
    const all = await this.getAllModuleReleases();
    return all.filter((r) => r.batchId === batchId);
  }

  async getAllModuleReleases(): Promise<ModuleReleaseRecord[]> {
    return await getSupabaseAppData<ModuleReleaseRecord>('moduleReleases');
  }

  async saveAdminModuleRelease(moduleId: string, targetKey: string = 'GLOBAL', releasedBy: string = 'ADMIN'): Promise<ModuleReleaseRecord> {
    const record: ModuleReleaseRecord = {
      id: `ADMIN_RELEASE__${moduleId}`,
      batchId: 'ADMIN__GLOBAL',
      moduleId,
      released: true,
      releasedAt: new Date().toISOString(),
      releasedBy
    };
    await saveSupabaseAppData('moduleReleases', record.id, record);
    return record;
  }

  async revokeAdminModuleRelease(moduleId: string, targetKey: string = 'GLOBAL'): Promise<void> {
    const id = `ADMIN_RELEASE__${moduleId}`;
    await deleteSupabaseAppData('moduleReleases', id);
  }

  async revokeModuleRelease(batchId: string, moduleId: string, assignmentId?: string): Promise<void> {
    const id = assignmentId ? `${assignmentId}__${moduleId}` : `${batchId}__${moduleId}`;
    const { error } = await supabase
      .from('app_data')
      .delete()
      .eq('collection_name', 'moduleReleases')
      .eq('item_id', id)
      .abortSignal(AbortSignal.timeout(APP_DATA_QUERY_TIMEOUT_MS));

    if (error) {
      throw new Error(`Failed to revoke module release for ${batchId}: ${error.message}`);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const cacheKey = 'saill_cache_moduleReleases';
        const cachedValue = localStorage.getItem(cacheKey);
        const cached: any[] = cachedValue ? JSON.parse(cachedValue) : [];
        const safeCached = Array.isArray(cached) ? cached : [];
        const filtered = safeCached.filter(
          (item) => item && item.id !== id && item.item_id !== id
        );
        localStorage.setItem(cacheKey, JSON.stringify(filtered));
      }
    } catch (cacheError) {
      console.warn('[db] Module release revoked, but local cache update failed:', cacheError);
    }

  }

  async getAllAdminModuleReleases(): Promise<ModuleReleaseRecord[]> {
    const all = await this.getAllModuleReleases();
    return all.filter(
      (r) => r.id && (r.id.startsWith('ADMIN_RELEASE__') || r.batchId === 'ADMIN__GLOBAL')
    );
  }

  // --- Faculty Assignments ---
  async saveFacultyAssignment(assignment: FacultyAssignment): Promise<FacultyAssignment> {
    await saveSupabaseAppData('facultyAssignments', assignment.id, assignment);
    return assignment;
  }

  async getAllFacultyAssignments(): Promise<FacultyAssignment[]> {
    const { data, error } = await supabase
      .from('app_data')
      .select('item_id, data')
      .eq('collection_name', 'facultyAssignments')
      .abortSignal(AbortSignal.timeout(APP_DATA_QUERY_TIMEOUT_MS));

    if (error) {
      throw new Error(`Failed to load facultyAssignments from Supabase: ${error.message}`);
    }

    return Array.isArray(data)
      ? data
          .filter((record) => record?.item_id && record?.data)
          .map((record) => {
            const assignment = record.data as FacultyAssignment;
            if (assignment.id !== record.item_id) {
              console.warn('[db] Faculty assignment id differs from app_data item_id', {
                assignmentId: assignment.id,
                itemId: record.item_id
              });
            }
            return { ...assignment, id: record.item_id };
          })
      : [];
  }

  async deleteFacultyAssignment(id: string): Promise<void> {
    await deleteSupabaseAppData('facultyAssignments', id);
  }

  async deactivateFacultyAssignment(id: string): Promise<FacultyAssignment> {
    console.info('[db] Before exact faculty assignment lookup', { selectedId: id });
    const lookupSignal = AbortSignal.timeout(APP_DATA_QUERY_TIMEOUT_MS);
    let lookupResponse;
    try {
      lookupResponse = await supabase
        .from('app_data')
        .select('item_id, data')
        .eq('collection_name', 'facultyAssignments')
        .eq('item_id', id)
        .abortSignal(lookupSignal)
        .maybeSingle();
    } catch (error) {
      console.error('[db] After exact faculty assignment lookup', {
        selectedId: id,
        succeeded: false,
        error
      });
      throw getFacultyAssignmentRequestError('loading the faculty assignment', error, lookupSignal);
    }
    const { data: assignmentRecord, error: readError } = lookupResponse;

    console.info('[db] Faculty assignment lookup response', {
      selectedId: id,
      error: readError,
      data: assignmentRecord,
      succeeded: !readError && !lookupSignal.aborted
    });
    if (lookupSignal.aborted) {
      throw getFacultyAssignmentRequestError('loading the faculty assignment', readError, lookupSignal);
    }
    if (readError) {
      throw getFacultyAssignmentRequestError('loading the faculty assignment', readError, lookupSignal);
    }
    if (!assignmentRecord?.data) {
      throw new Error('Faculty assignment was not found.');
    }
    if (assignmentRecord.item_id !== id) {
      throw new Error('The selected faculty assignment does not match the database item_id.');
    }

    const assignment = assignmentRecord.data as FacultyAssignment;
    if (assignment.id !== id) {
      console.warn('[db] Faculty assignment JSON id differs from app_data item_id', {
        selectedId: id,
        itemId: assignmentRecord.item_id,
        assignmentId: assignment.id
      });
    }
    if (assignment.status !== 'ACTIVE') {
      throw new Error('This faculty assignment is no longer active.');
    }

    const updatedAssignment: FacultyAssignment = {
      ...assignment,
      id,
      status: 'INACTIVE',
      lastUpdated: new Date().toISOString()
    };
    const updateSignal = AbortSignal.timeout(APP_DATA_QUERY_TIMEOUT_MS);
    let updateResponse;
    console.info('[db] Before exact faculty assignment update', { selectedId: id });
    try {
      updateResponse = await supabase
        .from('app_data')
        .update({
          data: updatedAssignment,
          updated_at: updatedAssignment.lastUpdated
        })
        .eq('collection_name', 'facultyAssignments')
        .eq('item_id', id)
        .select('item_id, data')
        .abortSignal(updateSignal);
    } catch (requestError) {
      console.error('[db] After exact faculty assignment update', {
        selectedId: id,
        succeeded: false,
        error: requestError
      });
      throw getFacultyAssignmentRequestError('removing the faculty assignment', requestError, updateSignal);
    }
    const { data, error, count } = updateResponse;

    console.info('[db] Faculty assignment update response', {
      selectedId: id,
      error,
      data,
      affectedRows: count ?? data?.length ?? 0,
      succeeded: !error && !updateSignal.aborted,
      returnedStatuses: data?.map((record) => ({
        itemId: record.item_id,
        assignmentId: record.data?.id,
        status: record.data?.status
      }))
    });

    if (updateSignal.aborted || error) {
      throw getFacultyAssignmentRequestError('removing the faculty assignment', error, updateSignal);
    }
    const updatedRecord = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!updatedRecord || updatedRecord.item_id !== id || updatedRecord.data?.id !== id) {
      throw new Error('Faculty assignment was not updated. Refresh and try again.');
    }
    if (updatedRecord.data?.status !== 'INACTIVE') {
      throw new Error('Supabase did not confirm that the selected assignment is INACTIVE.');
    }

    return updatedRecord.data as FacultyAssignment;
  }

  async toggleFacultyAssignmentStatus(id: string): Promise<FacultyAssignment | null> {
    const all = await this.getAllFacultyAssignments();
    const item = all.find((a) => a.id === id);
    if (!item) return null;
    item.status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    item.lastUpdated = new Date().toISOString();
    await this.saveFacultyAssignment(item);
    return item;
  }

  // --- Registrations ---
  async getAllUserRegistrations(): Promise<UserRegistrationRecord[]> {
    return await getSupabaseAppData<UserRegistrationRecord>('userRegistrations');
  }

  async getUserRegistration(userIDOrEmail: string): Promise<UserRegistrationRecord | null> {
    const all = await this.getAllUserRegistrations();
    const search = userIDOrEmail.trim().toLowerCase();
    return (
      all.find(
        (r) =>
          (r.userID && r.userID.toLowerCase() === search) ||
          ((r as any).id && (r as any).id.toLowerCase() === search) ||
          ((r as any).rollNo && (r as any).rollNo.toLowerCase() === search) ||
          ((r as any).employeeId && (r as any).employeeId.toLowerCase() === search) ||
          (r.email && r.email.toLowerCase() === search)
      ) || null
    );
  }

  async checkDuplicateRollNo(rollNo: string): Promise<boolean> {
    const clean = rollNo.trim().toUpperCase();
    return registrationIdentifierExists(clean, 'roll_no');
  }

  async checkDuplicateEmployeeId(empId: string): Promise<boolean> {
    const clean = empId.trim().toUpperCase();
    return registrationIdentifierExists(clean, 'employee_id');
  }

  async checkDuplicateEmail(email: string): Promise<boolean> {
    const clean = email.trim().toLowerCase();
    return registrationIdentifierExists(clean, 'email');
  }

  async saveUserRegistration(
    regRecord: UserRegistrationRecord,
    profileObject?: StudentProfile | FacultyAccount
  ): Promise<void> {
    const recordId = regRecord.userID || (regRecord as any).id || `REG-${Date.now()}`;
    await saveSupabaseAppData('userRegistrations', recordId, { id: recordId, userID: recordId, ...regRecord });

    if (profileObject && 'rollNo' in profileObject) {
      await this.saveProfile(profileObject as StudentProfile);
    }
  }

  // --- Student Profiles ---

async getAllProfiles(): Promise<StudentProfile[]> {
  // Load student records from both storage locations.
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .abortSignal(AbortSignal.timeout(APP_DATA_QUERY_TIMEOUT_MS));

  if (error) {
    throw new Error(
      `Failed to load students from Supabase: ${error.message}`
    );
  }

  let appProfiles: StudentProfile[] = [];

  try {
    appProfiles =
      await getSupabaseAppDataFromDatabase<StudentProfile>(
        'studentProfiles'
      );
  } catch (err) {
    console.error(
      '[db] Failed to load studentProfiles from app_data:',
      err
    );
  }

  
const normalizeProfile = (s: any): StudentProfile => {
  const fullName =
    s.full_name ||
    s.name ||
    s.fullName ||
    s.roll_no ||
    s.rollNo ||
    s.id;

  return {
    ...s,
    id: s.id || s.roll_no || s.rollNo,
    rollNo: s.roll_no || s.rollNo || s.id,

    // Preserve the original database name
    name: fullName,
    full_name: fullName,

    assignedFacultyId:
      s.assigned_faculty_id ||
      s.assignedFacultyId ||
      s.assignedFacultyID ||
      '',

    branch: s.branch || s.department || '',
    department: s.department || s.branch || '',
    programme: s.programme || 'B.Tech',

    academicYear:
      s.academic_year || s.academicYear || '',

    semester: s.semester || '',
    section: s.section || '',

    batch: s.batch_id || s.batch || '',
    batchId: s.batch_id || s.batchId || '',

    mappingStatus:
      String(s.mapping_status || s.mappingStatus || '')
        .toUpperCase() === 'MAPPED'
        ? 'MAPPED'
        : 'UNMAPPED',

    status: ({
      pending: 'PENDING_APPROVAL',
      approved: 'ACTIVE',
      active: 'ACTIVE',
      rejected: 'REJECTED',
      disabled: 'REJECTED',
      inactive: 'REJECTED'
    } as const)[normalizeRegistrationStatus(s.status)]
  } as StudentProfile;
};

  // Merge by roll number, avoiding duplicate students.
  const profilesByRollNo = new Map<string, StudentProfile>();

  for (const profile of appProfiles) {
    const normalized = normalizeProfile(profile);
    const roll = String(normalized.rollNo || '')
      .trim()
      .toUpperCase();

    if (roll) {
      profilesByRollNo.set(roll, normalized);
    }
  }

  // Public students table takes precedence for fields it contains.
  // Preserve app_data values when the public row has empty fields.
  for (const row of data || []) {
    const normalized = normalizeProfile(row);
    const roll = String(normalized.rollNo || '')
      .trim()
      .toUpperCase();

    if (!roll) continue;

    const existing = profilesByRollNo.get(roll);

    if (existing) {
      profilesByRollNo.set(roll, {
        ...existing,
        ...normalized,
        assignedFacultyId:
          normalized.assignedFacultyId ||
          existing.assignedFacultyId,
        academicYear:
          normalized.academicYear ||
          existing.academicYear,
        branch:
          normalized.branch || existing.branch,
        department:
          normalized.department || existing.department,
        semester:
          normalized.semester || existing.semester,
        section:
          normalized.section || existing.section,
        batch:
          normalized.batch || existing.batch,
        name:
          normalized.name || existing.name
      });
    } else {
      profilesByRollNo.set(roll, normalized);
    }
  }

  const result = Array.from(profilesByRollNo.values());

  console.info('[db] Combined student profiles loaded:', {
    publicStudents: data?.length || 0,
    appDataStudents: appProfiles.length,
    uniqueStudents: result.length
  });

  return result;
}

  async deleteStudentProfile(rollNo: string, adminName: string = 'Administrator'): Promise<void> {
    const clean = rollNo.trim().toUpperCase();
    await deleteSupabaseAppData('studentProfiles', clean);
    await deleteSupabaseAppData('students', clean);
    try {
      await supabase.from('students').delete().ilike('roll_no', clean);
    } catch {}
  }

  async resetStudentPassword(rollNo: string, newPass: string, resetBy: string = 'Administrator'): Promise<void> {
    const clean = rollNo.trim().toUpperCase();
    const student = await this.getProfileByRollNo(clean);
    if (student) {
      student.status = 'ACTIVE';
      await this.saveProfile(student);
    }
  }

  // --- Module Progress (Supabase public.student_module_progress) ---
  async getProgressMap(): Promise<Record<string, ModuleProgress>> {
    const rollNo = this.getActiveRoll().trim().toUpperCase();
    const map: Record<string, ModuleProgress> = {};
    try {
      const { data, error } = await supabase
        .from('student_module_progress')
        .select('*')
        .ilike('roll_no', rollNo);
      if (!error && Array.isArray(data) && data.length > 0) {
        data.forEach((r: any) => {
          map[r.module_id] = {
            moduleId: r.module_id,
            status: r.status || (r.completed ? 'completed' : 'in_progress'),
            completedTabs: r.completed_tabs || [],
            reflectionNotes: r.reflection_notes || '',
            savedNotes: r.saved_notes || '',
            score: r.score || 0,
            completedAt: r.completed_at || r.submitted_at || null,
            lastAccessed: r.updated_at || new Date().toISOString(),
            activityStates: r.experiment_data?.activityStates,
            activityAttempts: r.experiment_data?.activityAttempts
          };
        });
        return map;
      }
    } catch {}

    const items = await getSupabaseAppData<ModuleProgress>('moduleProgress');
    items
      .filter((i: any) => !i.rollNo || i.rollNo.toUpperCase() === rollNo)
      .forEach((r: any) => {
        map[r.moduleId] = r;
      });
    return map;
  }

  async getModuleProgress(moduleId: string): Promise<ModuleProgress | null> {
    const map = await this.getProgressMap();
    return map[moduleId] || null;
  }

  async saveModuleProgress(progress: ModuleProgress): Promise<void> {
    const rollNo = this.getActiveRoll().trim().toUpperCase();
    const id = `${rollNo}__${progress.moduleId}`;
    await saveSupabaseAppData('moduleProgress', id, { ...progress, id, rollNo });

    try {
      await supabase.from('student_module_progress').upsert({
        id,
        roll_no: rollNo,
        module_id: progress.moduleId,
        completed: Boolean((progress as any).completed || progress.status === 'completed' || Boolean(progress.completedAt)),
        score: progress.score || 0,
        experiment_data: (progress as any).experimentData || progress.activityStates || {},
        time_spent_seconds: (progress as any).timeSpentSeconds || 0,
        submitted_at: (progress as any).submittedAt || progress.completedAt || new Date().toISOString(),
        status: progress.status || 'in_progress',
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[db] saveModuleProgress warning:', err);
    }
  }

  // --- Audio Recordings ---
  async getRecordings(): Promise<RecordingItem[]> {
    try {
      const { data, error } = await supabase.from('recordings').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((r: any) => ({
          id: r.id,
          moduleId: r.module_id || 'module-1',
          moduleTitle: r.module_title || 'Module Laboratory',
          title: r.title || r.activity_id || 'Voice Recording',
          audioDataUrl: r.file_url || '',
          durationSeconds: r.duration_seconds || 0,
          createdAt: r.created_at || new Date().toISOString(),
          ...r
        }));
      }
    } catch {}
    return await getSupabaseAppData<RecordingItem>('recordings');
  }

  async saveRecording(recording: RecordingItem): Promise<void> {
    await saveSupabaseAppData('recordings', recording.id, recording);
    try {
      await supabase.from('recordings').upsert({
        id: recording.id,
        roll_no: (recording as any).rollNo || this.getActiveRoll(),
        module_id: recording.moduleId,
        activity_id: (recording as any).activityId || recording.title,
        file_url: (recording as any).fileUrl || recording.audioDataUrl || '',
        storage_path: (recording as any).storagePath || '',
        duration_seconds: recording.durationSeconds || (recording as any).duration || 0,
        created_at: recording.createdAt || new Date().toISOString()
      });
    } catch {}
  }

  async deleteRecording(id: string): Promise<void> {
    await deleteSupabaseAppData('recordings', id);
    try {
      await supabase.from('recordings').delete().eq('id', id);
    } catch {}
  }

  // --- Portfolio Items ---
  async getPortfolio(): Promise<PortfolioItem[]> {
    try {
      const { data, error } = await supabase.from('portfolios').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((p: any) => ({
          id: p.id,
          rollNo: p.roll_no,
          title: p.title,
          description: p.description,
          category: p.category,
          tags: p.tags,
          fileUrl: p.file_url,
          createdAt: p.created_at,
          ...p
        }));
      }
    } catch {}
    return await getSupabaseAppData<PortfolioItem>('portfolio');
  }

  async getPortfolioItems(moduleId?: string): Promise<PortfolioItem[]> {
    const all = await this.getPortfolio();
    if (!moduleId) return all;
    return all.filter((i) => i.moduleId === moduleId);
  }

  async savePortfolioItem(item: PortfolioItem): Promise<void> {
    await saveSupabaseAppData('portfolio', item.id, item);
    try {
      await supabase.from('portfolios').upsert({
        id: item.id,
        roll_no: (item as any).rollNo || this.getActiveRoll(),
        title: item.title,
        description: (item as any).description || item.content || '',
        file_url: (item as any).fileUrl || (item as any).url || '',
        tags: (item as any).tags || [],
        category: item.category || 'written',
        updated_at: new Date().toISOString()
      });
    } catch {}
  }

  async deletePortfolioItem(id: string): Promise<void> {
    await deleteSupabaseAppData('portfolio', id);
    try {
      await supabase.from('portfolios').delete().eq('id', id);
    } catch {}
  }

  async getLabNotes(moduleId?: string): Promise<PortfolioItem[]> {
    const all = await this.getPortfolio();
    return all.filter(
      (item) =>
        (!moduleId || item.moduleId === moduleId) &&
        (item.category === 'written' || item.title.includes('Lab Note') || item.title.includes('Digital Lab Record') || !!item.aim)
    );
  }

  async saveLabNote(
    noteObjOrModuleId: any,
    title?: string,
    content?: string,
    tags: string[] = []
  ): Promise<PortfolioItem> {
    let newItem: PortfolioItem;
    if (typeof noteObjOrModuleId === 'object' && noteObjOrModuleId !== null) {
      newItem = {
        id: noteObjOrModuleId.id || `labnote-${Date.now()}`,
        moduleId: noteObjOrModuleId.moduleId || 'module-1',
        moduleTitle: noteObjOrModuleId.moduleTitle || 'Lab Note',
        title: noteObjOrModuleId.title || noteObjOrModuleId.moduleTitle || 'Lab Note',
        category: 'written',
        content: noteObjOrModuleId.procedure || noteObjOrModuleId.observations || '',
        score: noteObjOrModuleId.score || 100,
        createdAt: noteObjOrModuleId.date || new Date().toISOString(),
        aim: noteObjOrModuleId.aim,
        procedure: noteObjOrModuleId.procedure,
        observations: noteObjOrModuleId.observations,
        date: noteObjOrModuleId.date || new Date().toLocaleDateString()
      };
    } else {
      const modId = String(noteObjOrModuleId);
      newItem = {
        id: `labnote-${modId}-${Date.now()}`,
        moduleId: modId,
        moduleTitle: title || modId,
        title: title || 'Lab Note',
        category: 'written',
        content: content || '',
        score: 100,
        createdAt: new Date().toISOString()
      };
    }
    await this.savePortfolioItem(newItem);
    return newItem;
  }

  // --- Badges ---
  async getBadges(): Promise<Badge[]> {
    const list = await getSupabaseAppData<Badge>('badges');
    if (list.length > 0) return list;
    return DEFAULT_BADGES;
  }

  async saveBadge(badge: Badge): Promise<void> {
    await saveSupabaseAppData('badges', badge.id, badge);
  }

  // --- Quiz Attempts ---
  async getQuizAttempts(studentId?: string, moduleId?: string): Promise<QuizAttemptRecord[]> {
    const all = await getSupabaseAppData<QuizAttemptRecord>('quizAttempts');
    return all.filter(
      (q: any) =>
        (!studentId || q.studentId === studentId) &&
        (!moduleId || q.moduleId === moduleId)
    );
  }

  async getAllQuizAttempts(): Promise<QuizAttemptRecord[]> {
    return await this.getQuizAttempts();
  }

  async saveQuizAttempt(attempt: QuizAttemptRecord): Promise<void> {
    await saveSupabaseAppData('quizAttempts', (attempt as any).quizInstanceId || (attempt as any).id, attempt);
  }

  // --- Batches ---
  async syncBatchesWithAcademicStructure(adminName: string = 'Administrator'): Promise<AcademicBatch[]> {
    return await this.getAllBatches();
  }

  async getAllBatches(): Promise<AcademicBatch[]> {
    const appDataBatches = await getSupabaseAppData<AcademicBatch>('batches');
    if (appDataBatches.length > 0) return appDataBatches;

    try {
      const { data, error } = await supabase.from('batches').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((b: any) => ({
          id: b.id,
          programme: b.programme_id || 'B.Tech',
          department: b.department_id || 'Civil Engineering',
          branch: b.branch_id || b.department_id || 'Civil Engineering',
          year: b.name || 'B.Tech',
          semester: b.semester_id || 'Semester I',
          section: b.section_id || 'A',
          batchName: b.name || b.batch_name || b.id,
          batchCode: b.batch_code || b.id,
          academicYear: b.academic_year_id || '',
          status: b.status || 'active',
          assignedFacultyInchargeId: b.faculty_id,
          studentCount: b.student_count || 0,
          createdAt: b.created_at || new Date().toISOString(),
          updatedAt: b.updated_at || new Date().toISOString()
        }));
      }
    } catch {}
    return [];
  }

  async getBatchById(id: string): Promise<AcademicBatch | null> {
    const all = await this.getAllBatches();
    return all.find((b) => b.id === id) || null;
  }

  async getBatchesByFaculty(employeeId: string): Promise<AcademicBatch[]> {
    const all = await this.getAllBatches();
    const clean = employeeId.trim().toUpperCase();
    return all.filter((b) => b.assignedFacultyInchargeId?.toUpperCase() === clean);
  }

 
async findBatchForStudent(
  arg1: string,
  arg2: string,
  arg3?: string,
  arg4?: string,
  arg5?: string,
  arg6?: string
): Promise<AcademicBatch | null> {
  const all = await this.getAllBatches();

  const hasProgrammeArgument = arg5 !== undefined;
  const programme = hasProgrammeArgument ? String(arg1 || '').trim() : '';

  let branch = '';
  let studyYear = '';
  let semester = '';
  let section = '';
  let year = '';

  if (hasProgrammeArgument) {
    branch = String(arg2 || '').trim();
    studyYear = String(arg3 || '').trim();
    semester = String(arg4 || '').trim();
    section = String(arg5 || '').trim();
    year = String(arg6 || '').trim();
  } else {
    branch = String(arg1 || '').trim();
    semester = String(arg2 || '').trim();
    section = String(arg3 || '').trim();
    year = String(arg4 || '').trim();
  }

  const normalizeBranch = (value: string): string => {
    const clean = normalizeBranchString(value).toUpperCase();

    if (
      clean === 'CSE' ||
      clean === 'COMPUTERSCIENCEENGINEERING'
    ) {
      return 'CSE';
    }

    return clean;
  };

  const normalizeYear = (value: string): string => {
    const clean = normalizeAcademicYearString(value)
      .replace(/[\u2010-\u2015\u2212/]/g, '-')
      .trim();

    const range = clean.match(/^(\d{4})\s*-\s*(\d{2}|\d{4})$/);

    if (range) {
      return `${range[1]}-${range[2].slice(-2)}`;
    }

    return clean.toUpperCase().replace(/\s+/g, '');
  };

  const normalizeStudyYear = (value: string): string => {
    const clean = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[().]/g, ' ')
      .replace(/\s+/g, ' ');

    const aliases: Record<string, string> = {
      FIRST: '1',
      '1ST': '1',
      I: '1',
      '1': '1',
      SECOND: '2',
      '2ND': '2',
      II: '2',
      '2': '2',
      THIRD: '3',
      '3RD': '3',
      III: '3',
      '3': '3',
      FOURTH: '4',
      '4TH': '4',
      IV: '4',
      '4': '4'
    };

    const match =
      clean.match(
        /^(FIRST|SECOND|THIRD|FOURTH|1ST|2ND|3RD|4TH|III|II|IV|I|1|2|3|4)(?=\s|$)/
      ) ||
      clean.match(
        /\b(FIRST|SECOND|THIRD|FOURTH|1ST|2ND|3RD|4TH)\s+YEAR\b/
      ) ||
      clean.match(
        /\bYEAR\s+(III|II|IV|I|1|2|3|4)\b/
      );

    return match ? aliases[match[1]] || '' : '';
  };

  const normalizeSemester = (value: string): string => {
    if (!value.trim()) return '';

    const normalized = normalizeSemesterString(value);

    const clean = normalized
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .replace(/^SEMESTER/, '')
      .replace(/^SEM/, '');

    const romanToNumber: Record<string, string> = {
      I: '1',
      II: '2',
      III: '3',
      IV: '4',
      V: '5',
      VI: '6',
      VII: '7',
      VIII: '8'
    };

    return romanToNumber[clean] || clean;
  };

  const normalizeSection = (
    value: string,
    branchName: string
  ): string => {
    const clean = value.trim().toUpperCase()
      .replace(/^(SECTION|SEC)\s*/, '');

    const separatorIndex = clean.lastIndexOf('-');

    if (separatorIndex > 0) {
      const prefix = clean.slice(0, separatorIndex);

      if (normalizeBranch(prefix) === normalizeBranch(branchName)) {
        return clean
          .slice(separatorIndex + 1)
          .replace(/[^A-Z0-9]/g, '');
      }
    }

    return normalizeSectionString(clean)
      .replace(/[^A-Z0-9]/g, '')
      .replace(/^(SECTION|SEC)/, '');
  };

  const normalizeProgramme = (value: string): string => {
    const clean = normalizeProgrammeString(value).toUpperCase();

    if (
      clean === 'BACHELOROFTECHNOLOGY' ||
      clean === 'BACHELORTECHNOLOGY' ||
      clean === 'BTECH'
    ) {
      return 'BTECH';
    }

    return clean;
  };

  const requestedYear = normalizeYear(year);
  const requestedStudyYear = normalizeStudyYear(studyYear);
  const requestedBranch = normalizeBranch(branch);
  const requestedSemester = normalizeSemester(semester);
  const requestedSection = normalizeSection(section, branch);
  const requestedProgramme = normalizeProgramme(programme);

  const matchingClassBatches = all.filter((batch) => {
    if (String(batch.status || '').toLowerCase() !== 'active') {
      return false;
    }

    const branchValues = [
      batch.branch || '',
      batch.department || '',
      String((batch as any).branchCode || ''),
      String(batch.batchCode || (batch as any).batch_code || '').split('-')[0]
    ].filter(Boolean);

    const branchMatches = branchValues.some(
      (value) => normalizeBranch(value) === requestedBranch
    );

    const yearMatches =
      !requestedYear ||
      normalizeYear(String(batch.academicYear || '')) === requestedYear;

    const batchStudyYear = normalizeStudyYear(String(batch.year || ''));

    // Older batches may not contain a recognizable study-year value.
    // Keep those eligible, but compare study years when both are available.
    const studyYearMatches =
      !requestedStudyYear ||
      !batchStudyYear ||
      batchStudyYear === requestedStudyYear;

    const semesterMatches =
      !requestedSemester ||
      normalizeSemester(String(batch.semester || '')) === requestedSemester;

    const batchBranchName =
      branchValues.find(
        (value) => normalizeBranch(value) === requestedBranch
      ) || '';

    const sectionMatches =
      !requestedSection ||
      normalizeSection(String(batch.section || ''), batchBranchName) === requestedSection;

    return (
      branchMatches &&
      studyYearMatches &&
      yearMatches &&
      semesterMatches &&
      sectionMatches
    );
  });

  const describeRequest = () =>
    `${branch} (${semester || 'any semester'}, Section ${section || 'any'}, ${year || 'any academic year'}${programme ? `, ${programme}` : ''})`;

  if (matchingClassBatches.length === 0) {
    throw new Error(
      `No active academic batch matches ${describeRequest()}.`
    );
  }

  if (requestedProgramme) {
    const programmeMatches = matchingClassBatches.filter((batch) => {
      const batchProgramme = String(batch.programme || '').trim();

      return (
        batchProgramme &&
        normalizeProgramme(batchProgramme) === requestedProgramme
      );
    });

    if (programmeMatches.length === 1) {
      return programmeMatches[0];
    }

    if (programmeMatches.length > 1) {
      const programmeDisplay =
        requestedProgramme === 'BTECH' ? 'B.Tech' : programme;

      const expectedBatchName =
        `${programmeDisplay} ${branch} → ${normalizeSemesterString(semester)} → Section ${section}`;

      const normalizeLabel = (value: string): string =>
        value.toLowerCase().replace(/[^a-z0-9]/g, '');

      const canonicalNameMatches = programmeMatches.filter((batch) =>
        [
          batch.batchName,
          batch.batchCode,
          (batch as any).name
        ].some(
          (name) =>
            name &&
            normalizeLabel(String(name)) === normalizeLabel(expectedBatchName)
        )
      );

      const uuidMatches = canonicalNameMatches.filter((batch) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          batch.id
        )
      );

      if (uuidMatches.length === 1) {
        return uuidMatches[0];
      }

      if (canonicalNameMatches.length === 1) {
        return canonicalNameMatches[0];
      }

      throw new Error(
        `Multiple active ${programme} batches match ${describeRequest()}. Ask an administrator to resolve the duplicate batch configuration.`
      );
    }

    const unspecifiedProgrammeMatches = matchingClassBatches.filter(
      (batch) => !String(batch.programme || '').trim()
    );

    if (
      matchingClassBatches.length === 1 &&
      unspecifiedProgrammeMatches.length === 1
    ) {
      return unspecifiedProgrammeMatches[0];
    }

    if (unspecifiedProgrammeMatches.length > 0) {
      throw new Error(
        `Multiple active academic batches match ${describeRequest()}, and the programme is unspecified on one or more batches. Ask an administrator to resolve the ambiguity.`
      );
    }

    throw new Error(
      `No active academic batch matches ${describeRequest()}.`
    );
  }

  if (matchingClassBatches.length > 1) {
    throw new Error(
      `Multiple active academic batches match ${describeRequest()}. Ask an administrator to resolve the duplicate batch configuration.`
    );
  }

  return matchingClassBatches[0];
}


  async createBatch(batchData: Partial<AcademicBatch>, adminName: string = 'Administrator'): Promise<AcademicBatch> {
    const id = batchData.id || `BATCH-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const newBatch: AcademicBatch = {
      id,
      programme: batchData.programme || 'B.Tech',
      department: batchData.department || batchData.branch || 'Civil Engineering',
      branch: batchData.branch || batchData.department || 'Civil Engineering',
      year: batchData.year || 'B.Tech',
      semester: batchData.semester || 'Semester I',
      section: batchData.section || 'A',
      batchName: batchData.batchName || `${batchData.department || 'Civil'} - Section ${batchData.section || 'A'}`,
      batchCode: batchData.batchCode || id,
      academicYear: batchData.academicYear || '2025-2026',
      status: (batchData.status as any) || 'active',
      assignedFacultyInchargeId: batchData.assignedFacultyInchargeId || batchData.facultyInchargeId,
      assignedFacultyInchargeName: batchData.assignedFacultyInchargeName || batchData.facultyInchargeName,
      studentCount: batchData.studentCount || batchData.enrolledStudentCount || 0,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await saveSupabaseAppData('batches', id, newBatch);
    try {
      await supabase.from('batches').upsert({
        id,
        batch_code: newBatch.batchCode,
        name: newBatch.batchName,
        programme_id: newBatch.programme,
        department_id: newBatch.department,
        branch_id: newBatch.branch,
        academic_year_id: newBatch.academicYear,
        semester_id: newBatch.semester,
        section_id: newBatch.section,
        faculty_id: newBatch.assignedFacultyInchargeId,
        status: newBatch.status,
        updated_at: nowIso
      });
    } catch {}

    return newBatch;
  }

  async updateBatch(id: string, updates: Partial<AcademicBatch>, adminName: string = 'Administrator'): Promise<AcademicBatch> {
    const existing = await this.getBatchById(id);
    if (!existing) throw new Error('Batch not found');
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await saveSupabaseAppData('batches', id, updated);
    try {
      await supabase.from('batches').update({
        name: updated.batchName,
        faculty_id: updated.assignedFacultyInchargeId,
        status: updated.status,
        updated_at: new Date().toISOString()
      }).eq('id', id);
    } catch {}
    return updated;
  }

  async deleteBatch(id: string, adminName: string = 'Administrator'): Promise<void> {
    await deleteSupabaseAppData('batches', id);
    try {
      await supabase.from('batches').delete().eq('id', id);
    } catch {}
  }

  async assignFacultyToBatch(
    batchId: string,
    facultyId: string,
    facultyName: string,
    adminName: string = 'Administrator'
  ): Promise<AcademicBatch> {
    return await this.updateBatch(
      batchId,
      {
        assignedFacultyInchargeId: facultyId,
        assignedFacultyInchargeName: facultyName
      },
      adminName
    );
  }

  async transferStudentBatch(
    studentRollNo: string,
    targetBatchId: string,
    reason: string,
    transferredBy: string = 'Administrator',
    extra?: string
  ): Promise<StudentBatchTransferRecord> {
    const student = await this.getProfileByRollNo(studentRollNo);
    if (!student) throw new Error('Student not found');
    const targetBatch = await this.getBatchById(targetBatchId);
    if (!targetBatch) throw new Error('Target batch not found');

    const transferRecord: StudentBatchTransferRecord = {
      id: `TRANSFER-${Date.now()}`,
      rollNo: student.rollNo,
      studentRollNo: student.rollNo,
      studentName: student.name,
      fromBatchId: student.batch || 'DEFAULT',
      fromBatchName: student.batchName || student.batch || 'Default Batch',
      toBatchId: targetBatch.id,
      toBatchName: targetBatch.batchName,
      reason,
      transferredBy,
      transferDate: new Date().toISOString(),
      transferredAt: new Date().toISOString()
    };

    await saveSupabaseAppData('batchTransfers', transferRecord.id, transferRecord);

    student.batch = targetBatch.batchName;
    student.branch = targetBatch.branch || targetBatch.department;
    student.section = targetBatch.section;
    await this.saveProfile(student);

    return transferRecord;
  }

  async getStudentTransferHistory(studentRollNo?: string): Promise<StudentBatchTransferRecord[]> {
    const all = await getSupabaseAppData<StudentBatchTransferRecord>('batchTransfers');
    if (!studentRollNo) return all;
    return all.filter(
      (t: any) => (t.rollNo || t.studentRollNo)?.toUpperCase() === studentRollNo.toUpperCase()
    );
  }

  async getBatchAnalytics(batchId: string): Promise<BatchAnalyticsSummary> {
    const batch = await this.getBatchById(batchId);
    return {
      batchId,
      batchName: batch?.batchName || 'Batch',
      batchCode: batch?.batchCode || batchId,
      totalStudents: batch?.studentCount || 0,
      averageModuleCompletion: 78,
      averageKnowledgeCheckScore: 84,
      averageAssessmentScore: 81,
      portfolioCompletionRate: 85,
      notebookCompletionRate: 80,
      aiReadinessScore: 82,
      topPerformingStudents: [],
      studentsRequiringAttention: [],
      moduleWiseCompletion: []
    };
  }

  // --- Faculty Accounts & Authentication ---
  async getAllFaculty(): Promise<FacultyAccount[]> {
    return await this.getAllFacultyAccounts();
  }

  async getAllFacultyAccounts(): Promise<FacultyAccount[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('role', ['faculty', 'faculty_incharge'])
      .abortSignal(AbortSignal.timeout(APP_DATA_QUERY_TIMEOUT_MS));

    if (error) {
      throw new Error(`Failed to load faculty accounts from Supabase: ${error.message}`);
    }

    return (data || []).map((u: any) => ({
      employeeId: u.employee_id || u.username || 'FAC001',
      fullName: u.full_name || 'Faculty Member',
      email: u.email || '',
      mobile: u.mobile || '',
      department: u.department || 'CSE',
      designation: u.designation || 'Assistant Professor',
      role: u.role || 'faculty_incharge',
      status: normalizeRegistrationStatus(u.status) === 'approved'
        ? 'active'
        : normalizeRegistrationStatus(u.status) === 'pending'
          ? 'pending'
          : 'rejected',
      passwordHash: 'managed_via_supabase_auth',
      createdAt: u.created_at || new Date().toISOString(),
      approvedAt: u.approved_at
    }));
  }

  async getFacultyByEmployeeId(empId: string): Promise<FacultyAccount | null> {
    const all = await this.getAllFacultyAccounts();
    const clean = empId.trim().toUpperCase();
    return all.find((f) => f.employeeId.toUpperCase() === clean) || null;
  }

  async getFacultyByEmpIdOrEmail(identifier: string): Promise<FacultyAccount | null> {
    const all = await this.getAllFacultyAccounts();
    const clean = identifier.trim().toLowerCase();
    return (
      all.find(
        (f) =>
          f.employeeId.toLowerCase() === clean ||
          (f.email && f.email.toLowerCase() === clean)
      ) || null
    );
  }

  async registerFaculty(facultyData: Partial<FacultyAccount>): Promise<FacultyAccount> {
    const empId = (facultyData.employeeId || `FAC-${Date.now()}`).trim().toUpperCase();
    const email = facultyData.email || `${empId.toLowerCase()}@srit.ac.in`;
    const password = (facultyData as any).password || 'SritFaculty#2026';

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: facultyData.role || 'faculty_incharge',
          employee_id: empId,
          full_name: facultyData.fullName || 'Faculty Member',
          department: facultyData.department,
          designation: facultyData.designation,
          mobile: facultyData.mobile
        }
      }
    });

    if (authError) {
      throw new Error(`Faculty signup failed: ${authError.message}`);
    }
    if (!authData.user) {
      throw new Error('Faculty signup failed: Supabase did not return a user.');
    }

    const newFaculty: FacultyAccount = {
      employeeId: empId,
      fullName: facultyData.fullName || 'Faculty Member',
      email,
      mobile: facultyData.mobile || '',
      department: facultyData.department || 'CSE',
      designation: facultyData.designation || 'Assistant Professor',
      role: (facultyData.role as any) || 'faculty_incharge',
      status: 'pending',
      passwordHash: 'managed_via_supabase_auth',
      createdAt: new Date().toISOString()
    };

    if (authData.session) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw new Error(`Faculty account was created but the pending session could not be closed: ${signOutError.message}`);
      }
    }

    return newFaculty;
  }

  async loginFaculty(usernameOrEmpId: string, rawPassword: string): Promise<FacultyAccount> {
    const input = usernameOrEmpId.trim();
    if (!input) throw new Error('Please enter your Employee ID or Email Address.');

    const resolvedEmail = await SupabaseAuthService.resolveEmailFromIdentifier(input);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: rawPassword
    });
    if (authError || !authData.user) {
      throw new Error(authError?.message || 'Authentication failed.');
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();
    const status = String(profile?.status || '').toLowerCase();
    const message = status === 'pending'
      ? 'Your account is pending admin approval. Please wait until the administrator approves your registration.'
      : 'Your account is rejected, disabled, inactive, or has no authorized faculty profile.';
    if (error || !profile || status !== 'active' || profile.is_active !== true ||
        !['faculty', 'faculty_incharge'].includes(String(profile.role || '').toLowerCase())) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw new Error(`${error?.message || message} Supabase sign-out failed: ${signOutError.message}`);
      throw new Error(error?.message || message);
    }

    return {
      employeeId: profile.employee_id,
      fullName: profile.full_name,
      email: profile.email,
      mobile: profile.mobile || '',
      department: profile.department || '',
      designation: profile.designation || '',
      role: profile.role,
      status: 'active',
      passwordHash: 'managed_via_supabase_auth',
      createdAt: profile.created_at,
      token: authData.session?.access_token
    };
  }

  async approveFacultyAccount(empId: string, approvedBy: string = 'Administrator'): Promise<void> {
    const clean = empId.trim().toUpperCase();
    void approvedBy;
    await this.setRegistrationStatus(clean, 'employee_id', 'approved');
  }

  async rejectFacultyAccount(empId: string, reason: string, rejectedBy: string = 'Administrator'): Promise<void> {
    const clean = empId.trim().toUpperCase();
    void rejectedBy;
    await this.setRegistrationStatus(clean, 'employee_id', 'rejected', reason);
  }

  async resetFacultyPassword(empId: string, newPass: string, resetBy: string = 'Administrator'): Promise<void> {
    try {
      await supabase.auth.updateUser({ password: newPass });
    } catch {}
  }

  async updateFacultyPassword(empId: string, newPasswordHash: string): Promise<void> {}

  async toggleFacultyStatus(empId: string, updatedBy: string = 'Administrator'): Promise<void> {
    const fac = await this.getFacultyByEmployeeId(empId);
    if (!fac) throw new Error('Faculty not found');
    void updatedBy;
    const newStatus = fac.status === 'active' ? 'disabled' : 'approved';
    await this.setRegistrationStatus(empId.trim().toUpperCase(), 'employee_id', newStatus);
  }

  async deleteFacultyAccount(empId: string): Promise<void> {
    await deleteSupabaseAppData('faculty', empId);
    try {
      await supabase.from('users').delete().ilike('employee_id', empId);
    } catch {}
  }

  // --- Administrator Accounts ---
  async getAdminByUsernameOrEmail(identifier: string): Promise<AdministratorAccount | null> {
    const clean = identifier.trim().toLowerCase();
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'administrator'])
        .or(`username.ilike.${clean},email.ilike.${clean}`)
        .maybeSingle();

      if (!error && data) {
        return {
          username: data.username || 'admin',
          fullName: data.full_name || 'Administrator',
          email: data.email,
          role: 'administrator',
          status: 'ACTIVE',
          employeeId: data.employee_id || 'ADMIN001',
          department: data.department || 'System Administration',
          designation: data.designation || 'System Administrator',
          passwordHash: 'managed_via_supabase_auth',
          createdAt: data.created_at || new Date().toISOString()
        };
      }
    } catch {}

    const appAdmins = await getSupabaseAppData<AdministratorAccount>('administrators');
    const found = appAdmins.find((a) => a.username.toLowerCase() === clean || a.email.toLowerCase() === clean);
    if (found) return found;

    return DEFAULT_ADMIN_ACCOUNT;
  }

  async updateAdminPassword(userId: string, newPasswordHash: string): Promise<void> {
    try {
      await supabase.auth.updateUser({ password: newPasswordHash });
    } catch {}
  }

  async saveBootstrapAdministrator(admin: AdministratorAccount, rawPassword?: string): Promise<void> {
    await saveSupabaseAppData('administrators', admin.username, admin);
  }

  // --- Password Reset Tokens ---
  async getAllPasswordResetTokens(): Promise<PasswordResetTokenRecord[]> {
    return await getSupabaseAppData<PasswordResetTokenRecord>('passwordResetTokens');
  }

  async savePasswordResetTokenRecord(record: PasswordResetTokenRecord): Promise<void> {
    await saveSupabaseAppData('passwordResetTokens', record.id, record);
  }

  async getStudentCredentialsByRollNoOrEmail(identifier: string): Promise<StudentCredentialsRecord | null> {
    const student = await this.getProfileByRollNo(identifier);
    if (student) {
      return {
        rollNo: student.rollNo,
        email: student.email,
        passwordHash: '',
        createdAt: student.joinedDate || new Date().toISOString()
      };
    }
    return null;
  }

  // --- Student Registration & Auth ---
  async registerStudent(
    studentData: Partial<StudentProfile>,
    rawPassword: string = 'SritStudent#2026'
  ): Promise<StudentProfile> {
    const rollNo = (studentData.rollNo || '').trim().toUpperCase();
    const email = studentData.email || `${rollNo.toLowerCase()}@srit.ac.in`;

    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password: rawPassword,
      options: {
        data: {
          role: 'student',
          roll_no: rollNo,
          full_name: studentData.name || rollNo,
          programme: studentData.programme,
          department: studentData.department || studentData.branch,
          branch: studentData.branch || studentData.department,
          academic_year: studentData.academicYear,
          year: studentData.year,
          semester: studentData.semester,
          section: studentData.section,
          batch_id: studentData.batchId || studentData.batch
        }
      }
    });
    if (error) {
      throw new Error(`Student signup failed: ${error.message}`);
    }
    if (!authData.user) {
      throw new Error('Student signup failed: Supabase did not return a user.');
    }

    const newStudent: StudentProfile = {
      id: rollNo,
      rollNo,
      name: studentData.name || rollNo,
      email,
      mobile: studentData.mobile,
      branch: studentData.branch || studentData.department || 'CSE',
      section: studentData.section || 'A',
      batch: studentData.batch || '',
      department: studentData.department || 'CSE',
      programme: studentData.programme || 'B.Tech',
      academicYear: studentData.academicYear || '',
      semester: studentData.semester || 'Semester I',
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${rollNo}`,
      xp: 0,
      level: 1,
      streakDays: 1,
      targetGoal: 'Master First Year Communicative English R26 Syllabus',
      status: (studentData.status as any) || 'PENDING_APPROVAL',
      joinedDate: new Date().toISOString()
    };

    if (authData.session) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw new Error(`Student account was created but the pending session could not be closed: ${signOutError.message}`);
      }
    }
    return newStudent;
  }

  async loginStudent(usernameOrRollNo: string, rawPassword: string): Promise<StudentProfile> {
    const input = usernameOrRollNo.trim();
    if (!input) throw new Error('Please enter your Roll Number or Email Address.');

    const resolvedEmail = await SupabaseAuthService.resolveEmailFromIdentifier(input);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: rawPassword
    });
    if (authError || !authData.user) {
      throw new Error(authError?.message || 'Authentication failed.');
    }
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('id, role, status, is_active, roll_no')
      .eq('id', authData.user.id)
      .maybeSingle();
    const status = String(userProfile?.status || '').toLowerCase();

    const message = status === 'pending'
      ? 'Your account is pending admin approval. Please wait until the administrator approves your registration.'
      : 'Your account is rejected, disabled, inactive, or has no authorized student profile.';
    if (profileError || !userProfile || !['active', 'approved'].includes(status) || userProfile.is_active !== true ||
        String(userProfile.role || '').toLowerCase() !== 'student' || !userProfile.roll_no) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw new Error(`${profileError?.message || message} Supabase sign-out failed: ${signOutError.message}`);
      throw new Error(profileError?.message || message);
    }

    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .select('*')
      .eq('roll_no', userProfile.roll_no)
      .maybeSingle();
    if (studentError || !studentData) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw new Error(`${studentError?.message || 'Student profile not found.'} Supabase sign-out failed: ${signOutError.message}`);
      throw new Error(studentError?.message || 'Student profile not found.');
    }

    this.activeRollNoCache = userProfile.roll_no;
    return {
      ...studentData,
      id: userProfile.id,
      rollNo: studentData.roll_no,
      name: studentData.name,
      email: studentData.email,
      branch: studentData.branch,
      department: studentData.department,
      status: 'ACTIVE',
      avatarUrl: '',
      xp: 0,
      level: 1,
      streakDays: 0,
      targetGoal: '',
      joinedDate: studentData.created_at,
      token: authData.session?.access_token
    };
  }

  async resetPassword(rollNo: string, email: string, newRawPassword: string): Promise<void> {
    try {
      await supabase.auth.updateUser({ password: newRawPassword });
    } catch {}
  }

  async logoutStudent(): Promise<void> {
    this.activeRollNoCache = '';
    this.authTokenCache = '';
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('saill_active_roll_no');
      localStorage.removeItem('saill_auth_token');
    }
  }

  // --- Approvals for Registrations ---
  async getPendingFacultyRegistrations(): Promise<FacultyAccount[]> {
    const all = await this.getAllFacultyAccounts();
    return all.filter((f) => String(f?.status || '').toLowerCase() === 'pending');
  }

  async getPendingStudentRegistrations(): Promise<StudentProfile[]> {
    const allStudents = await this.getAllProfiles();
    return allStudents.filter((s) => {
      const st = String(s?.status || '').toUpperCase();
      return st === 'PENDING_APPROVAL' || st === 'PENDING';
    });
  }

  private async setRegistrationStatus(
    identifier: string,
    identifierColumn: 'roll_no' | 'employee_id',
    status: 'approved' | 'rejected' | 'disabled',
    reason: string | null = null
  ): Promise<void> {
    const { data: user, error: lookupError } = await supabase
      .from('users')
      .select('id, role')
      .ilike(identifierColumn, identifier)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Failed to locate registration for approval: ${lookupError.message}`);
    }
    if (!user) {
      throw new Error('The registration account was not found.');
    }

    const { error } = await supabase.rpc('set_registration_status', {
      target_user_id: user.id,
      target_status: status,
      rejection_reason: reason
    });
    if (error) {
      throw new Error(`Failed to update registration status: ${error.message}`);
    }
  }

  async approveStudentRegistration(rollNo: string, approvedBy: string = 'Administrator'): Promise<{ success: boolean; mappingResult: string }> {
    const clean = rollNo.trim().toUpperCase();
    void approvedBy;
    const { data: authResult, error: authError } = await supabase.functions.invoke(
      'ensure-student-auth-user',
      { body: { rollNo: clean } }
    );
    if (authError) {
      throw new Error(`Failed to verify or prepare the student's Supabase Auth account: ${authError.message}`);
    }
    if (!authResult?.userId) {
      throw new Error('Supabase did not confirm the student Auth account association.');
    }

    const { data, error } = await supabase.rpc('approve_student_registration', {
      target_roll_no: clean
    });
    if (error) {
      throw new Error(`Student approval and academic mapping failed: ${error.message}`);
    }
    if (!data || typeof data !== 'object' || data.success !== true ||
        data.status !== 'approved' || data.mapping_status !== 'mapped' ||
        data.is_active !== true || data.user_id !== authResult.userId) {
      throw new Error('Supabase did not confirm a fully approved, mapped, active student account.');
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('roll_no, user_id, academic_year, batch_id, status, mapping_status, is_active')
      .eq('roll_no', clean)
      .maybeSingle();
    if (studentError) {
      throw new Error(`Approval completed but the student record could not be verified: ${studentError.message}`);
    }
    if (!student || String(student.status).toLowerCase() !== 'approved' ||
        String(student.mapping_status).toLowerCase() !== 'mapped' ||
        student.is_active !== true || student.user_id !== authResult.userId ||
        !student.academic_year || !student.batch_id) {
      throw new Error('Approval completed but the stored student record is not fully mapped and active.');
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role, status, is_active')
      .eq('id', authResult.userId)
      .maybeSingle();
    if (userError) {
      throw new Error(`Approval completed but the student account could not be verified: ${userError.message}`);
    }
    if (!user || String(user.role).toLowerCase() !== 'student' ||
        String(user.status).toLowerCase() !== 'approved' || user.is_active !== true) {
      throw new Error('Approval completed but the linked student account is not active.');
    }

    const invitationNote = authResult.created
      ? ' A Supabase Auth invitation was sent so the student can set their password.'
      : '';
    return {
      success: true,
      mappingResult: `Student ${clean} approved and mapped to batch ${student.batch_id} for academic year ${student.academic_year}.${invitationNote}`
    };
  }

  async rejectStudentRegistration(rollNo: string, reason: string, rejectedBy: string = 'Administrator'): Promise<void> {
    const clean = rollNo.trim().toUpperCase();
    void rejectedBy;
    await this.setRegistrationStatus(clean, 'roll_no', 'rejected', reason);
  }

  async requestCorrectionStudentRegistration(rollNo: string, remarks: string, requestedBy: string = 'Administrator'): Promise<void> {
    const clean = rollNo.trim().toUpperCase();
    const student = await this.getProfileByRollNo(clean);
    if (student) {
      student.status = 'CORRECTION_REQUIRED';
      (student as any).correctionRemarks = remarks;
      await this.saveProfile(student);
    }
    try {
      await supabase
        .from('students')
        .update({ status: 'correction_required', correction_remarks: remarks, updated_at: new Date().toISOString() })
        .ilike('roll_no', clean);
    } catch {}
  }

  async autoMapUnmappedStudents(): Promise<{ success: boolean; mappedCount: number; mappingResult: string }> {
    const allStudents = await this.getAllProfiles();
    const allBatches = await this.getAllBatches();
    let count = 0;
    for (const student of allStudents) {
      if (!student.batch || student.batch === 'DEFAULT') {
        const matched = allBatches.find(
          (b) =>
            b.branch?.toLowerCase() === student.department?.toLowerCase() ||
            b.department?.toLowerCase() === student.department?.toLowerCase()
        );
        if (matched) {
          student.batch = matched.batchName;
          await this.saveProfile(student);
          count++;
        }
      }
    }
    return {
      success: true,
      mappedCount: count,
      mappingResult: `Successfully mapped ${count} students.`
    };
  }

  async assignFacultyToStudent(
    studentRollNo: string,
    facultyId: string,
    assignedBy: string = 'Administrator'
  ): Promise<void> {
    const clean = studentRollNo.trim().toUpperCase();
    const student = await this.getProfileByRollNo(clean);
    if (student) {
      student.assignedFacultyId = facultyId;
      await this.saveProfile(student);
    }
  }

  // --- Audit Logs ---
  async addAuditLog(
    userId: string,
    userName: string,
    userRole: string,
    action: any,
    details: string,
    targetUser?: string,
    extra?: any
  ): Promise<AuditLogRecord> {
    return await this.logAuditTrail(action, details, userName || userId, targetUser, userRole);
  }

  async logAuditTrail(
    action: any,
    details: string,
    arg3?: any,
    arg4?: any,
    arg5?: any,
    arg6?: any
  ): Promise<AuditLogRecord> {
    const performedBy = String(arg3 || 'system');
    const record: AuditLogRecord = {
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action,
      details,
      performedBy,
      userId: performedBy,
      userName: arg4 ? String(arg4) : performedBy,
      userRole: (arg5 as any) || 'administrator',
      targetUser: arg6 ? String(arg6) : undefined,
      timestamp: new Date().toISOString()
    };

    await saveSupabaseAppData('auditLogs', record.id, record);
    return record;
  }

  async getAuditLogs(): Promise<AuditLogRecord[]> {
    return await getSupabaseAppData<AuditLogRecord>('auditLogs');
  }

  // --- Academic Structure Methods ---
  async getAllDepartments(): Promise<Department[]> {
    return AcademicStructureService.getDepartments();
  }

  async saveDepartment(dept: Department): Promise<Department> {
    return await AcademicStructureService.saveDepartment(dept);
  }

  async deleteDepartment(id: string, adminName: string = 'Administrator'): Promise<void> {
    await AcademicStructureService.deleteDepartment(id);
  }

  async getAllProgrammes(): Promise<ProgrammeEntity[]> {
    return AcademicStructureService.getProgrammes();
  }

  async saveProgramme(prog: ProgrammeEntity): Promise<ProgrammeEntity> {
    return await AcademicStructureService.saveProgramme(prog);
  }

  async deleteProgramme(id: string): Promise<void> {
    await AcademicStructureService.deleteProgramme(id);
  }

  async getAllBranches(): Promise<Branch[]> {
    return AcademicStructureService.getBranches();
  }

  async saveBranch(branch: Branch): Promise<Branch> {
    return await AcademicStructureService.saveBranch(branch);
  }

  async deleteBranch(id: string): Promise<void> {
    await AcademicStructureService.deleteBranch(id);
  }

  async getAllAcademicYears(): Promise<AcademicYearEntity[]> {
    return AcademicStructureService.getAcademicYears();
  }

  async saveAcademicYear(year: AcademicYearEntity): Promise<AcademicYearEntity> {
    return await AcademicStructureService.saveAcademicYear(year);
  }

  async deleteAcademicYear(id: string): Promise<void> {
    await AcademicStructureService.deleteAcademicYear(id);
  }

  async getAllSemesters(): Promise<SemesterEntity[]> {
    return AcademicStructureService.getSemesters();
  }

  async saveSemester(sem: SemesterEntity): Promise<SemesterEntity> {
    return await AcademicStructureService.saveSemester(sem);
  }

  async deleteSemester(id: string): Promise<void> {
    await AcademicStructureService.deleteSemester(id);
  }

  async getAllSections(): Promise<SectionEntity[]> {
    return AcademicStructureService.getSections();
  }

  async saveSection(sec: SectionEntity): Promise<SectionEntity> {
    return await AcademicStructureService.saveSection(sec);
  }

  async deleteSection(id: string): Promise<void> {
    await AcademicStructureService.deleteSection(id);
  }

  // --- Reset & Cleanup ---
  async clearAllData(): Promise<void> {
    this.purgeClientStorage();
  }

  async clearAllTestInstitutionalData(): Promise<void> {
    this.purgeClientStorage();
  }
}

export const dbStorage = new IndexedDBStorage();
export const indexedDBStorage = dbStorage;
