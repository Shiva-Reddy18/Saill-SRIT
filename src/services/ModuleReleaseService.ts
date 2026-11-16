import { dbStorage } from '../lib/db';
import { FacultyAssignmentService } from './FacultyAssignmentService';

export type ModuleAccessState =
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'AVAILABLE'
  | 'LOCKED'
  | 'WAITING_FOR_FACULTY_RELEASE'
  | 'WAITING_FOR_ADMIN_RELEASE';

export interface ModuleAccessInfo {
  state: ModuleAccessState;
  isReleased: boolean;
  isAccessible: boolean;
  statusLabel: string;
  badgeClass: string;
  lockMessage?: string;
  adminReleased?: boolean;
}

export class ModuleReleaseService {
  private static adminReleasedSet = new Set<string>();
  private static classReleasedMap = new Map<string, Set<string>>();
  private static isInitialized = false;

  /**
   * Admin Release Operations (ADMIN -> FACULTY)
   * Faculty modules remain LOCKED by default until Admin explicitly releases them.
   */
  static getAdminReleasedModuleIdsSync(): string[] {
    if (!this.isInitialized) {
      this.syncWithIndexedDB().catch(() => {});
    }
    return Array.from(this.adminReleasedSet);
  }

  static async releaseModuleByAdmin(moduleId: string, adminName: string = 'Administrator'): Promise<string[]> {
    this.adminReleasedSet.add(moduleId);

    try {
      await dbStorage.saveAdminModuleRelease(moduleId, 'GLOBAL', adminName);
      await dbStorage.logAuditTrail(
        'ADMIN_MODULE_RELEASE',
        `Administrator released Module (${moduleId}) to Faculty Incharges.`,
        adminName,
        adminName,
        'ADMINISTRATOR'
      );
    } catch {
      // ignore
    }

    return Array.from(this.adminReleasedSet);
  }

  static async revokeModuleByAdmin(moduleId: string, adminName: string = 'Administrator'): Promise<string[]> {
    this.adminReleasedSet.delete(moduleId);

    try {
      await dbStorage.revokeAdminModuleRelease(moduleId, 'GLOBAL');
      await dbStorage.logAuditTrail(
        'ADMIN_MODULE_REVOCATION',
        `Administrator locked Module (${moduleId}) from Faculty Incharges.`,
        adminName,
        adminName,
        'ADMINISTRATOR'
      );
    } catch {
      // ignore
    }

    return Array.from(this.adminReleasedSet);
  }

  static isAdminModuleReleased(moduleId: string): boolean {
    const released = this.getAdminReleasedModuleIdsSync();
    return released.includes(moduleId);
  }

  /**
   * Normalizes branch name to canonical code (e.g. "Computer Science & Engineering" -> "CSE")
   */
  static normalizeBranch(branch?: string): string {
    if (!branch) return 'CSE';
    const b = branch.trim().toLowerCase();
    if (b.includes('computer science') || b.includes('cse')) return 'CSE';
    if (b.includes('humanities') || b.includes('h&s') || b.includes('hs') || b.includes('english')) return 'HS';
    if (b.includes('civil') || b.includes('civ') || b.includes('ce')) return 'CIV';
    if (b.includes('mechanical') || b.includes('mech') || b.includes('me')) return 'ME';
    if (b.includes('electrical') || b.includes('eee')) return 'EEE';
    if (b.includes('electronics') || b.includes('ece')) return 'ECE';
    if (b.includes('information technology') || b.includes('it')) return 'IT';

    const cleaned = branch.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return cleaned || 'CSE';
  }

  /**
   * Normalizes semester string to canonical representation (e.g. "Semester II" -> "SEM-2")
   */
  static normalizeSemester(semester?: string): string {
    if (!semester) return 'SEM-1';
    const s = semester.trim().toLowerCase();
    if (s.includes('viii') || s.includes('8')) return 'SEM-8';
    if (s.includes('vii') || s.includes('7')) return 'SEM-7';
    if (s.includes('vi') || s.includes('6')) return 'SEM-6';
    if (s.includes('v') || s.includes('5')) return 'SEM-5';
    if (s.includes('iv') || s.includes('4')) return 'SEM-4';
    if (s.includes('iii') || s.includes('3')) return 'SEM-3';
    if (s.includes('ii') || s.includes('2')) return 'SEM-2';
    if (s.includes('i') || s.includes('1')) return 'SEM-1';
    return 'SEM-1';
  }

  /**
   * Normalizes section string to canonical representation (e.g. "A", "B", "C")
   */
  static normalizeSection(section?: string): string {
    if (!section) return 'A';
    const sec = section.trim().toUpperCase().replace(/SECTION/g, '').replace(/SEC/g, '').trim();
    return sec || 'A';
  }

  /**
   * Generate a canonical class/batch key string from branch, semester, section, or object.
   */
  static getClassKey(branchOrObj?: any, semester?: string, section?: string): string {
    if (typeof branchOrObj === 'object' && branchOrObj !== null) {
      if (branchOrObj.batchId) return branchOrObj.batchId;
      if (branchOrObj.id && branchOrObj.batchCode) return branchOrObj.id;
      return this.getClassKey(
        branchOrObj.branch || branchOrObj.department,
        branchOrObj.semester,
        branchOrObj.section
      );
    }

    const normBranch = this.normalizeBranch(branchOrObj);
    const normSem = this.normalizeSemester(semester);
    const normSec = this.normalizeSection(section);
    return `${normBranch}__${normSem}__${normSec}`;
  }

  /**
   * Resolve all candidate keys for a class/batch
   */
  static async resolveAllClassKeys(
    branchOrObj?: any,
    semester?: string,
    section?: string
  ): Promise<string[]> {
    const keys = new Set<string>();

    let rawBranch = '';
    let rawSem = '';
    let rawSec = '';
    let explicitBatchId = '';
    let facultyId = '';

    if (typeof branchOrObj === 'object' && branchOrObj !== null) {
      explicitBatchId = branchOrObj.batchId || branchOrObj.academicBatchId || (branchOrObj.batchCode ? branchOrObj.id : '');
      rawBranch = branchOrObj.branch || branchOrObj.department || '';
      rawSem = branchOrObj.semester || '';
      rawSec = branchOrObj.section || '';
      facultyId = branchOrObj.facultyId || branchOrObj.assignedFacultyId || branchOrObj.facultyIncharge || '';
    } else if (typeof branchOrObj === 'string') {
      rawBranch = branchOrObj;
      rawSem = semester || '';
      rawSec = section || '';
    }

    if (explicitBatchId) keys.add(explicitBatchId);
    if (facultyId) keys.add(`FACULTY__${facultyId.trim().toUpperCase()}`);

    const normKey = this.getClassKey(rawBranch, rawSem, rawSec);
    keys.add(normKey);

    const normBranch = this.normalizeBranch(rawBranch);
    const normSec = this.normalizeSection(rawSec);
    keys.add(`${normBranch}__${normSec}`);

    if (rawBranch || rawSem || rawSec) {
      const rawKey = `${rawBranch.trim()}__${rawSem.trim()}__${rawSec.trim()}`;
      if (rawKey.length > 3) keys.add(rawKey);
    }

    // Match existing batches and faculty assignments from Supabase
    try {
      const allBatches = await dbStorage.getAllBatches();
      for (const b of allBatches) {
        const bNormKey = this.getClassKey(b.branch || b.department, b.semester, b.section);
        const bNormBranch = this.normalizeBranch(b.branch || b.department);
        const bNormSec = this.normalizeSection(b.section);
        if (
          bNormKey === normKey ||
          b.id === explicitBatchId ||
          (bNormBranch === normBranch && bNormSec === normSec) ||
          (facultyId && b.assignedFacultyInchargeId?.toUpperCase() === facultyId.toUpperCase())
        ) {
          keys.add(b.id);
          if (b.batchCode) keys.add(b.batchCode);
          keys.add(bNormKey);
        }
      }

      const allAssignments = await dbStorage.getAllFacultyAssignments();
      for (const a of allAssignments) {
        const aNormBranch = this.normalizeBranch(a.branch || a.department);
        const aNormSec = this.normalizeSection(a.section);
        if (
          (facultyId && a.facultyId.toUpperCase() === facultyId.toUpperCase()) ||
          (aNormBranch === normBranch && aNormSec === normSec)
        ) {
          keys.add(`FACULTY__${a.facultyId.trim().toUpperCase()}`);
          keys.add(this.getClassKey(a.branch || a.department, a.semester, a.section));
          if (a.id) keys.add(a.id);
        }
      }
    } catch {
      // ignore
    }

    return Array.from(keys);
  }

  /**
   * Synchronously compute candidate keys
   */
  static getSyncKeys(classKeyOrObj?: any): string[] {
    const keys = new Set<string>();
    if (!classKeyOrObj) return ['default'];

    if (typeof classKeyOrObj === 'string') {
      const value = classKeyOrObj.trim();
      if (value) keys.add(value);
      return Array.from(keys);
    }

    if (typeof classKeyOrObj === 'object') {
      // Keep explicit batch identifiers when a student or batch record provides them.
      if (classKeyOrObj.batchId) keys.add(String(classKeyOrObj.batchId));
      if (classKeyOrObj.academicBatchId) keys.add(String(classKeyOrObj.academicBatchId));
      if (classKeyOrObj.id && classKeyOrObj.batchCode) keys.add(String(classKeyOrObj.id));
      if (classKeyOrObj.batchCode) keys.add(String(classKeyOrObj.batchCode));

      const branch = classKeyOrObj.branch || classKeyOrObj.department;
      const semester = classKeyOrObj.semester;
      const section = classKeyOrObj.section;
      if (branch || semester || section) {
        keys.add(this.getClassKey(branch, semester, section));
      }
    }

    return Array.from(keys);
  }

  /**
   * Synchronously get list of released module IDs for a class/batch.
   */
  static getReleasedModuleIdsForClass(classKeyOrObj?: any): string[] {
    return this.getReleasedModuleIdsForClassSync(classKeyOrObj);
  }

  static getReleasedModuleIdsForClassSync(classKeyOrObj?: any): string[] {
    if (!this.isInitialized) {
      this.syncWithIndexedDB().catch(() => {});
    }
    const keys = this.getSyncKeys(classKeyOrObj);
    const releasedSet = new Set<string>();

    for (const key of keys) {
      const set = this.classReleasedMap.get(key);
      if (set) {
        set.forEach((m) => releasedSet.add(m));
      }
    }

    return Array.from(releasedSet);
  }

  /**
   * Release a module for a class/batch by Faculty.
   */
  static async releaseModuleForClass(
    targetKeyOrObj: any,
    moduleId: string,
    releasedBy: string = 'FACULTY'
  ): Promise<string[]> {
    if (!this.isAdminModuleReleased(moduleId)) {
      throw new Error(
        `Hierarchy Enforcement: Module "${moduleId}" has not been released by the Administrator yet. Faculty can only release Admin-approved modules.`
      );
    }

    const assignment =
      targetKeyOrObj && typeof targetKeyOrObj === 'object' ? targetKeyOrObj : null;
    if (!assignment?.id) {
      throw new Error('A saved faculty assignment is required to release a module.');
    }

    if (String(assignment.status || '').toUpperCase() !== 'ACTIVE') {
      throw new Error('This faculty assignment is no longer active. Refresh the faculty dashboard.');
    }

    const assignedFacultyId = String(assignment.facultyId || '').trim().toUpperCase();
    const releasingFacultyId = String(releasedBy || '').trim().toUpperCase();
    if (!assignedFacultyId || releasingFacultyId !== assignedFacultyId) {
      throw new Error('The releasing faculty ID does not match this assignment.');
    }

    if (!assignment.branch || !assignment.academicYear || !assignment.semester || !assignment.section) {
      throw new Error('The faculty assignment is missing branch, academic year, semester, or section.');
    }

    // Persist exactly one class-scoped record. The assignment metadata is used by RLS
    // to verify that the authenticated faculty member owns this active assignment.
    const classKey = this.getClassKey(
      assignment.branch,
      assignment.semester,
      assignment.section
    );

    // console.log('[RELEASE 1] Reached database save', {
  // moduleId,
  // assignmentId: assignment.id,
  // facultyId: assignedFacultyId
// });
    await dbStorage.saveModuleRelease(classKey, moduleId, assignedFacultyId, {
      assignmentId: String(assignment.id),
      facultyId: assignedFacultyId,
      branch: String(assignment.branch),
      academicYear: String(assignment.academicYear),
      semester: String(assignment.semester),
      section: String(assignment.section)
    });

    // Update memory only after Supabase confirms the write.
    if (!this.classReleasedMap.has(classKey)) {
      this.classReleasedMap.set(classKey, new Set<string>());
    }
    this.classReleasedMap.get(classKey)!.add(moduleId);
    this.isInitialized = true;

    return this.getReleasedModuleIdsForClassSync(assignment);
  }

  /**
   * Revoke/lock a module for the selected active faculty assignment.
   */
  static async revokeModuleForClass(
    targetKeyOrObj: any,
    moduleId: string
  ): Promise<string[]> {
    const assignment =
      targetKeyOrObj && typeof targetKeyOrObj === 'object' ? targetKeyOrObj : null;
    if (!assignment?.id || !assignment?.facultyId) {
      throw new Error('A saved faculty assignment is required to revoke a module.');
    }

    const facultyId = String(assignment.facultyId).trim().toUpperCase();
    const classKey = this.getClassKey(
      assignment.branch,
      assignment.semester,
      assignment.section
    );

    // The database delete is authoritative. Do not change the UI state if it fails.
    await dbStorage.revokeModuleRelease(classKey, moduleId, String(assignment.id));

    const set = this.classReleasedMap.get(classKey);
    if (set) set.delete(moduleId);

    return this.getReleasedModuleIdsForClassSync(assignment);
  }

  /**
   * Synchronize in-memory releases with Supabase PostgreSQL authoritative records.
   */
  static async syncWithIndexedDB(classKeyOrObj?: any): Promise<string[]> {
    try {
      // 1. Sync Admin Releases from Supabase
      const adminDbRecords = await dbStorage.getAllAdminModuleReleases();
      this.adminReleasedSet.clear();
      if (adminDbRecords) {
        adminDbRecords.forEach((r) => {
          if (r.released) this.adminReleasedSet.add(r.moduleId);
        });
      }

      // 2. Sync Faculty Class Releases from Supabase
      const allDbRecords = await dbStorage.getAllModuleReleases();
      this.classReleasedMap.clear();

      (allDbRecords || []).forEach((r) => {
        if (r.released && !r.id?.startsWith('ADMIN_RELEASE__') && !r.batchId?.startsWith('ADMIN__')) {
          if (!this.classReleasedMap.has(r.batchId)) {
            this.classReleasedMap.set(r.batchId, new Set<string>());
          }
          this.classReleasedMap.get(r.batchId)!.add(r.moduleId);

        }
      });

      this.isInitialized = true;
    } catch {
      // ignore
    }

    return this.getReleasedModuleIdsForClassSync(classKeyOrObj);
  }

  /**
   * Check if a module is released for a class/batch.
   */
  static isModuleReleased(classKeyOrObj: any, moduleId: string): boolean {
    if (!this.isAdminModuleReleased(moduleId)) return false;
    const released = this.getReleasedModuleIdsForClassSync(classKeyOrObj);
    return released.includes(moduleId);
  }

  /**
   * Single Authoritative Source of Truth for Module Access State
   */
  static getModuleAccessInfo(
    classKeyOrObj: any,
    moduleId: string,
    modProgress?: { status?: string; completedTabs?: string[]; score?: number },
    role?: string
  ): ModuleAccessInfo {
    const normRole = (role || '').toUpperCase();

    // 1. ADMIN ACCESS: The Admin must never see modules as locked. All 10 modules always accessible.
    if (
      normRole === 'ADMINISTRATOR' ||
      normRole === 'ADMIN' ||
      classKeyOrObj === 'ADMINISTRATOR' ||
      classKeyOrObj === 'ADMIN'
    ) {
      const status = modProgress?.status || 'not_started';
      if (status === 'completed') {
        return {
          state: 'COMPLETED',
          isReleased: true,
          isAccessible: true,
          statusLabel: 'COMPLETED',
          badgeClass: 'bg-green-100 text-green-800 border-green-300',
          adminReleased: true
        };
      }
      if (status === 'in_progress') {
        return {
          state: 'IN_PROGRESS',
          isReleased: true,
          isAccessible: true,
          statusLabel: 'IN PROGRESS',
          badgeClass: 'bg-orange-100 text-[#D35400] border-orange-300',
          adminReleased: true
        };
      }
      return {
        state: 'AVAILABLE',
        isReleased: true,
        isAccessible: true,
        statusLabel: 'AVAILABLE (ADMIN)',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        adminReleased: true
      };
    }

    // 2. Check Admin-to-Faculty Release Level
    const adminReleased = this.isAdminModuleReleased(moduleId);

    // If Faculty is checking their own access:
    if (normRole === 'FACULTY' || normRole === 'FACULTY_INCHARGE') {
      if (!adminReleased) {
        return {
          state: 'WAITING_FOR_ADMIN_RELEASE',
          isReleased: false,
          isAccessible: false,
          statusLabel: 'LOCKED (ADMIN)',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
          lockMessage: 'Module locked. Waiting for Administrator release to Faculty.',
          adminReleased: false
        };
      }
      return {
        state: 'AVAILABLE',
        isReleased: true,
        isAccessible: true,
        statusLabel: 'Released by Admin',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        adminReleased: true
      };
    }

    // 3. STUDENT ACCESS:
    if (!adminReleased) {
      return {
        state: 'WAITING_FOR_ADMIN_RELEASE',
        isReleased: false,
        isAccessible: false,
        statusLabel: 'LOCKED (ADMIN)',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        lockMessage: 'Module locked. Waiting for Administrator release.',
        adminReleased: false
      };
    }

    const isReleasedToClass = this.isModuleReleased(classKeyOrObj, moduleId);
    if (!isReleasedToClass) {
      return {
        state: 'LOCKED',
        isReleased: false,
        isAccessible: false,
        statusLabel: 'LOCKED (FACULTY)',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        lockMessage: 'Module locked. Waiting for assigned Faculty release.',
        adminReleased: true
      };
    }

    const status = modProgress?.status || 'not_started';
    if (status === 'completed') {
      return {
        state: 'COMPLETED',
        isReleased: true,
        isAccessible: true,
        statusLabel: 'COMPLETED',
        badgeClass: 'bg-green-100 text-green-800 border-green-300',
        adminReleased: true
      };
    }

    if (status === 'in_progress') {
      return {
        state: 'IN_PROGRESS',
        isReleased: true,
        isAccessible: true,
        statusLabel: 'IN PROGRESS',
        badgeClass: 'bg-orange-100 text-[#D35400] border-orange-300',
        adminReleased: true
      };
    }

    return {
      state: 'AVAILABLE',
      isReleased: true,
      isAccessible: true,
      statusLabel: 'Released by Faculty',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      adminReleased: true
    };
  }
}
