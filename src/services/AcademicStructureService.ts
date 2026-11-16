import {
  Department,
  Branch,
  AcademicYearEntity,
  SemesterEntity,
  SectionEntity,
  ProgrammeEntity
} from '../types/academic';
import { dbStorage } from '../lib/db';
import { supabase } from '../lib/supabase';

const DEFAULT_DEPARTMENTS: Department[] = [];
const DEFAULT_PROGRAMMES: ProgrammeEntity[] = [];
const DEFAULT_BRANCHES: Branch[] = [];
const DEFAULT_YEARS: AcademicYearEntity[] = [];
const DEFAULT_SEMESTERS: SemesterEntity[] = [];
const DEFAULT_SECTIONS: SectionEntity[] = [];

export const normalizeAcademicYearDash = (val?: string): string => {
  return String(val || '').replace(/[\u2010-\u2015\u2212]/g, '-').trim();
};

export class AcademicStructureService {
  private static cache = {
    departments: DEFAULT_DEPARTMENTS as Department[],
    programmes: DEFAULT_PROGRAMMES as ProgrammeEntity[],
    branches: DEFAULT_BRANCHES as Branch[],
    years: DEFAULT_YEARS as AcademicYearEntity[],
    semesters: DEFAULT_SEMESTERS as SemesterEntity[],
    sections: DEFAULT_SECTIONS as SectionEntity[]
  };
  private static isInitialized = false;
  private static syncPromise: Promise<void> | null = null;
  private static hasAttemptedInitialLoad = false;
  private static loadedCollections = new Set<string>();
  private static loadErrors = new Map<string, string>();

  private static async persistToSupabase(collection: string, item: any): Promise<void> {
    try {
      await supabase.from('app_data').upsert({
        collection_name: collection,
        item_id: item.id,
        data: item,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn(`[AcademicStructureService] Supabase write notice for ${collection}:`, err);
    }
  }

  private static async deleteFromSupabase(collection: string, id: string): Promise<void> {
    try {
      await supabase.from('app_data').delete().eq('collection_name', collection).eq('item_id', id);
    } catch (err) {
      console.warn(`[AcademicStructureService] Supabase delete notice for ${collection}:`, err);
    }
  }

  private static getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('saill_auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  /**
   * Synchronize academic structure with Supabase PostgreSQL central database.
   */
  static syncWithIndexedDB(retryFailedOnly: boolean = false): Promise<void> {
    if (this.syncPromise) return this.syncPromise;

    this.hasAttemptedInitialLoad = true;
    const syncPromise = (async () => {
      const collections = [
        {
          name: 'academicDepartments',
          update: (data: any[]) => { this.cache.departments = data as Department[]; }
        },
        {
          name: 'academicProgrammes',
          update: (data: any[]) => { this.cache.programmes = data as ProgrammeEntity[]; }
        },
        {
          name: 'academicBranches',
          update: (data: any[]) => { this.cache.branches = data as Branch[]; }
        },
        {
          name: 'academicYears',
          update: (data: any[]) => { this.cache.years = data as AcademicYearEntity[]; }
        },
        {
          name: 'academicSemesters',
          update: (data: any[]) => { this.cache.semesters = data as SemesterEntity[]; }
        },
        {
          name: 'academicSections',
          update: (data: any[]) => { this.cache.sections = data as SectionEntity[]; }
        }
      ].filter((item) => !retryFailedOnly || !this.loadedCollections.has(item.name));

      const results = await Promise.allSettled(
        collections.map((item) =>
          supabase
            .from('app_data')
            .select('data')
            .eq('collection_name', item.name)
            .abortSignal(AbortSignal.timeout(10000))
        )
      );

      results.forEach((result, index) => {
        const collection = collections[index];
        if (result.status === 'rejected') {
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
          this.loadErrors.set(collection.name, message);
          console.error(`[AcademicStructureService] Failed to load ${collection.name}:`, result.reason);
          return;
        }

        if (result.value.error) {
          this.loadErrors.set(collection.name, result.value.error.message);
          console.error(
            `[AcademicStructureService] Failed to load ${collection.name}:`,
            result.value.error
          );
          return;
        }

        collection.update((result.value.data || []).map((row: any) => row.data).filter(Boolean));
        this.loadedCollections.add(collection.name);
        this.loadErrors.delete(collection.name);
      });

      this.isInitialized = this.loadedCollections.size === 6 && this.loadErrors.size === 0;
    })()
      .finally(() => {
        this.syncPromise = null;
      });

    this.syncPromise = syncPromise;
    return syncPromise;
  }

  static getLoadedCollections(): string[] {
    return Array.from(this.loadedCollections);
  }

  static getLoadErrors(): string[] {
    return Array.from(this.loadErrors, ([collection, message]) => `${collection}: ${message}`);
  }

  static async getAllAcademicStructure(retryFailedOnly: boolean = false): Promise<{
    departments: Department[];
    programmes: ProgrammeEntity[];
    branches: Branch[];
    years: AcademicYearEntity[];
    semesters: SemesterEntity[];
    sections: SectionEntity[];
  }> {
    await this.syncWithIndexedDB(retryFailedOnly);
    return {
      departments: this.getDepartments(),
      programmes: this.getProgrammes(),
      branches: this.getBranches(),
      years: this.getAcademicYears(),
      semesters: this.getSemesters(),
      sections: this.getSections()
    };
  }

  // --- DEPARTMENTS ---
  static getDepartments(): Department[] {
    if (!this.hasAttemptedInitialLoad) {
      this.syncWithIndexedDB().catch((error) => {
        console.warn('[AcademicStructureService] Background sync failed:', error);
      });
    }
    return this.cache.departments;
  }

  static async saveDepartment(dept: Omit<Department, 'id' | 'createdAt'> & { id?: string }): Promise<Department> {
    const list = [...this.getDepartments()];
    const nowIso = new Date().toISOString().split('T')[0];

    let savedRecord: Department;

    if (dept.id) {
      const index = list.findIndex((d) => d.id === dept.id);
      if (index !== -1) {
        list[index] = { ...list[index], ...dept };
        savedRecord = list[index];
      } else {
        savedRecord = {
          id: dept.id,
          code: dept.code.toUpperCase(),
          name: dept.name,
          headOfDepartment: dept.headOfDepartment || 'To be assigned',
          status: dept.status || 'ACTIVE',
          createdAt: nowIso
        };
        list.unshift(savedRecord);
      }
    } else {
      const duplicate = list.find(
        (d) => d.code.toUpperCase() === dept.code.toUpperCase() || d.name.toLowerCase() === dept.name.toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Department '${dept.name}' (${dept.code}) already exists.`);
      }

      savedRecord = {
        id: `DEPT-${Date.now()}`,
        code: dept.code.toUpperCase(),
        name: dept.name,
        headOfDepartment: dept.headOfDepartment || 'To be assigned',
        status: dept.status || 'ACTIVE',
        createdAt: nowIso
      };
      list.unshift(savedRecord);
    }

    this.cache.departments = list;

    // Persist directly to Supabase
    await this.persistToSupabase('academicDepartments', savedRecord);

    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}

    return savedRecord;
  }

  static async deleteDepartment(id: string): Promise<void> {
    this.cache.departments = this.getDepartments().filter((d) => d.id !== id);
    await this.deleteFromSupabase('academicDepartments', id);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
  }

  static async toggleDepartmentStatus(id: string): Promise<Department> {
    const list = this.getDepartments();
    const item = list.find((d) => d.id === id);
    if (!item) throw new Error('Department not found.');
    item.status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await this.persistToSupabase('academicDepartments', item);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
    return item;
  }

  // --- BRANCHES ---
  static getBranches(): Branch[] {
    if (!this.hasAttemptedInitialLoad) {
      this.syncWithIndexedDB().catch((error) => {
        console.warn('[AcademicStructureService] Background sync failed:', error);
      });
    }
    return this.cache.branches;
  }

  static async saveBranch(branch: Omit<Branch, 'id' | 'createdAt'> & { id?: string }): Promise<Branch> {
    const list = [...this.getBranches()];
    const nowIso = new Date().toISOString().split('T')[0];

    let savedRecord: Branch;

    if (branch.id) {
      const index = list.findIndex((b) => b.id === branch.id);
      if (index !== -1) {
        list[index] = { ...list[index], ...branch };
        savedRecord = list[index];
      } else {
        savedRecord = {
          id: branch.id,
          code: branch.code.toUpperCase(),
          name: branch.name,
          departmentName: branch.departmentName,
          status: branch.status || 'ACTIVE',
          createdAt: nowIso
        };
        list.unshift(savedRecord);
      }
    } else {
      const duplicate = list.find(
        (b) => b.code.toUpperCase() === branch.code.toUpperCase() || b.name.toLowerCase() === branch.name.toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Branch '${branch.name}' (${branch.code}) already exists.`);
      }

      savedRecord = {
        id: `BR-${Date.now()}`,
        code: branch.code.toUpperCase(),
        name: branch.name,
        departmentName: branch.departmentName,
        status: branch.status || 'ACTIVE',
        createdAt: nowIso
      };
      list.unshift(savedRecord);
    }

    this.cache.branches = list;

    await this.persistToSupabase('academicBranches', savedRecord);

    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}

    return savedRecord;
  }

  static async deleteBranch(id: string): Promise<void> {
    this.cache.branches = this.getBranches().filter((b) => b.id !== id);
    await this.deleteFromSupabase('academicBranches', id);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
  }

  static async toggleBranchStatus(id: string): Promise<Branch> {
    const list = this.getBranches();
    const item = list.find((b) => b.id === id);
    if (!item) throw new Error('Branch not found.');
    item.status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await this.persistToSupabase('academicBranches', item);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
    return item;
  }

  // --- ACADEMIC YEARS ---
  static getAcademicYears(): AcademicYearEntity[] {
    if (!this.hasAttemptedInitialLoad) {
      this.syncWithIndexedDB().catch((error) => {
        console.warn('[AcademicStructureService] Background sync failed:', error);
      });
    }
    return this.cache.years;
  }

  static async saveAcademicYear(year: Omit<AcademicYearEntity, 'id' | 'createdAt'> & { id?: string }): Promise<AcademicYearEntity> {
    const list = [...this.getAcademicYears()];
    const nowIso = new Date().toISOString().split('T')[0];
    const normalizedYearName = normalizeAcademicYearDash(year.yearName);

    let savedRecord: AcademicYearEntity;

    if (year.id) {
      const index = list.findIndex((y) => y.id === year.id || normalizeAcademicYearDash(y.yearName) === normalizedYearName);
      if (index !== -1) {
        list[index] = { ...list[index], ...year, yearName: normalizedYearName };
        savedRecord = list[index];
      } else {
        savedRecord = {
          id: year.id,
          yearName: normalizedYearName,
          isCurrent: year.isCurrent ?? false,
          status: year.status || 'ACTIVE',
          createdAt: nowIso
        };
        list.unshift(savedRecord);
      }
    } else {
      const duplicate = list.find((y) => normalizeAcademicYearDash(y.yearName) === normalizedYearName);
      if (duplicate) {
        throw new Error(`Academic Year '${normalizedYearName}' already exists.`);
      }

      savedRecord = {
        id: `AY-${Date.now()}`,
        yearName: normalizedYearName,
        isCurrent: year.isCurrent ?? false,
        status: year.status || 'ACTIVE',
        createdAt: nowIso
      };
      list.unshift(savedRecord);
    }

    this.cache.years = list;

    await this.persistToSupabase('academicYears', savedRecord);

    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}

    return savedRecord;
  }

  static async deleteAcademicYear(id: string): Promise<void> {
    this.cache.years = this.getAcademicYears().filter((y) => y.id !== id);
    await this.deleteFromSupabase('academicYears', id);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
  }

  static async toggleAcademicYearStatus(id: string): Promise<AcademicYearEntity> {
    const list = this.getAcademicYears();
    const item = list.find((y) => y.id === id);
    if (!item) throw new Error('Academic Year not found.');
    item.status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await this.persistToSupabase('academicYears', item);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
    return item;
  }

  // --- SEMESTERS ---
  static getSemesters(): SemesterEntity[] {
    if (!this.hasAttemptedInitialLoad) {
      this.syncWithIndexedDB().catch((error) => {
        console.warn('[AcademicStructureService] Background sync failed:', error);
      });
    }
    return this.cache.semesters;
  }

  static async saveSemester(sem: Omit<SemesterEntity, 'id' | 'createdAt'> & { id?: string }): Promise<SemesterEntity> {
    const list = [...this.getSemesters()];
    const nowIso = new Date().toISOString().split('T')[0];
    const normSemAcademicYear = normalizeAcademicYearDash(sem.academicYear);

    let savedRecord: SemesterEntity;

    if (sem.id) {
      const index = list.findIndex((s) => s.id === sem.id);
      if (index !== -1) {
        list[index] = { ...list[index], ...sem, academicYear: normSemAcademicYear };
        savedRecord = list[index];
      } else {
        savedRecord = {
          id: sem.id,
          semesterName: sem.semesterName,
          academicYear: normSemAcademicYear,
          status: sem.status || 'ACTIVE',
          createdAt: nowIso
        };
        list.unshift(savedRecord);
      }
    } else {
      const duplicate = list.find(
        (s) => s.semesterName.toLowerCase() === sem.semesterName.toLowerCase() && normalizeAcademicYearDash(s.academicYear) === normSemAcademicYear
      );
      if (duplicate) {
        throw new Error(`Semester '${sem.semesterName}' already exists for ${normSemAcademicYear}.`);
      }

      savedRecord = {
        id: `SEM-${Date.now()}`,
        semesterName: sem.semesterName,
        academicYear: normSemAcademicYear,
        status: sem.status || 'ACTIVE',
        createdAt: nowIso
      };
      list.unshift(savedRecord);
    }

    this.cache.semesters = list;

    await this.persistToSupabase('academicSemesters', savedRecord);

    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}

    return savedRecord;
  }

  static async deleteSemester(id: string): Promise<void> {
    this.cache.semesters = this.getSemesters().filter((s) => s.id !== id);
    await this.deleteFromSupabase('academicSemesters', id);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
  }

  static async toggleSemesterStatus(id: string): Promise<SemesterEntity> {
    const list = this.getSemesters();
    const item = list.find((s) => s.id === id);
    if (!item) throw new Error('Semester not found.');
    item.status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await this.persistToSupabase('academicSemesters', item);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
    return item;
  }

  // --- SECTIONS ---
  static getSections(): SectionEntity[] {
    if (!this.hasAttemptedInitialLoad) {
      this.syncWithIndexedDB().catch((error) => {
        console.warn('[AcademicStructureService] Background sync failed:', error);
      });
    }
    return this.cache.sections;
  }

  static async saveSection(sec: Omit<SectionEntity, 'id' | 'createdAt'> & { id?: string }): Promise<SectionEntity> {
    const list = [...this.getSections()];
    const nowIso = new Date().toISOString().split('T')[0];

    let savedRecord: SectionEntity;

    if (sec.id) {
      const index = list.findIndex((s) => s.id === sec.id);
      if (index !== -1) {
        list[index] = { ...list[index], ...sec };
        savedRecord = list[index];
      } else {
        savedRecord = {
          id: sec.id,
          sectionName: sec.sectionName.toUpperCase(),
          branch: sec.branch,
          status: sec.status || 'ACTIVE',
          createdAt: nowIso
        };
        list.unshift(savedRecord);
      }
    } else {
      const duplicate = list.find(
        (s) => s.sectionName.toUpperCase() === sec.sectionName.toUpperCase() && s.branch === sec.branch
      );
      if (duplicate) {
        throw new Error(`Section '${sec.sectionName}' already exists for ${sec.branch}.`);
      }

      savedRecord = {
        id: `SEC-${Date.now()}`,
        sectionName: sec.sectionName.toUpperCase(),
        branch: sec.branch,
        status: sec.status || 'ACTIVE',
        createdAt: nowIso
      };
      list.unshift(savedRecord);
    }

    this.cache.sections = list;

    await this.persistToSupabase('academicSections', savedRecord);

    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}

    return savedRecord;
  }

  static async deleteSection(id: string): Promise<void> {
    this.cache.sections = this.getSections().filter((s) => s.id !== id);
    await this.deleteFromSupabase('academicSections', id);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
  }

  static async toggleSectionStatus(id: string): Promise<SectionEntity> {
    const list = this.getSections();
    const item = list.find((s) => s.id === id);
    if (!item) throw new Error('Section not found.');
    item.status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await this.persistToSupabase('academicSections', item);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
    return item;
  }

  // --- PROGRAMMES ---
  static getProgrammes(): ProgrammeEntity[] {
    if (!this.hasAttemptedInitialLoad) {
      this.syncWithIndexedDB().catch((error) => {
        console.warn('[AcademicStructureService] Background sync failed:', error);
      });
    }
    return this.cache.programmes;
  }

  static async saveProgramme(prog: Omit<ProgrammeEntity, 'id' | 'createdAt'> & { id?: string }): Promise<ProgrammeEntity> {
    const list = [...this.getProgrammes()];
    const nowIso = new Date().toISOString().split('T')[0];

    let savedRecord: ProgrammeEntity;

    if (prog.id) {
      const index = list.findIndex((p) => p.id === prog.id);
      if (index !== -1) {
        list[index] = { ...list[index], ...prog };
        savedRecord = list[index];
      } else {
        savedRecord = {
          id: prog.id,
          code: prog.code.toUpperCase(),
          name: prog.name,
          status: prog.status || 'ACTIVE',
          createdAt: nowIso
        };
        list.unshift(savedRecord);
      }
    } else {
      const duplicate = list.find(
        (p) => p.code.toUpperCase() === prog.code.toUpperCase() || p.name.toLowerCase() === prog.name.toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Programme '${prog.name}' (${prog.code}) already exists.`);
      }

      savedRecord = {
        id: `PROG-${Date.now()}`,
        code: prog.code.toUpperCase(),
        name: prog.name,
        status: prog.status || 'ACTIVE',
        createdAt: nowIso
      };
      list.unshift(savedRecord);
    }

    this.cache.programmes = list;

    await this.persistToSupabase('academicProgrammes', savedRecord);

    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}

    return savedRecord;
  }

  static async deleteProgramme(id: string): Promise<void> {
    this.cache.programmes = this.getProgrammes().filter((p) => p.id !== id);
    await this.deleteFromSupabase('academicProgrammes', id);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
  }

  static async toggleProgrammeStatus(id: string): Promise<ProgrammeEntity> {
    const list = this.getProgrammes();
    const item = list.find((p) => p.id === id);
    if (!item) throw new Error('Programme not found.');
    item.status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await this.persistToSupabase('academicProgrammes', item);
    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
    return item;
  }

  /**
   * Helper to ensure complete parent academic structure exists before class creation.
   */
  static async ensureParentStructureExists(params: {
    saillDept: string;
    programme: string;
    branch: string;
    academicYear: string;
    semester: string;
    section: string;
  }): Promise<void> {
    const { saillDept, programme, branch, academicYear, semester, section } = params;

    // 1. Department
    const existingDepts = this.getDepartments();
    const deptMatch = existingDepts.find(
      (d) => d.name.toLowerCase() === saillDept.toLowerCase() || d.code.toUpperCase() === 'ENGL'
    );
    if (!deptMatch) {
      const code = 'ENGL';
      await this.saveDepartment({
        code,
        name: saillDept,
        headOfDepartment: 'To be assigned',
        status: 'ACTIVE'
      });
    }

    // 2. Programme
    const existingProgs = this.getProgrammes();
    const progMatch = existingProgs.find(
      (p) => p.name.toLowerCase() === programme.toLowerCase() || p.code.toUpperCase() === programme.replace(/[^a-zA-Z]/g, '').toUpperCase()
    );
    if (!progMatch) {
      const code = programme.replace(/[^a-zA-Z]/g, '').substring(0, 6).toUpperCase() || 'BTECH';
      await this.saveProgramme({
        code,
        name: programme,
        status: 'ACTIVE'
      });
    }

    // 3. Branch
    const existingBranches = this.getBranches();
    const branchMatch = existingBranches.find(
      (b) => b.name.toLowerCase() === branch.toLowerCase()
    );
    if (!branchMatch) {
      const code = branch.split(' ').map((w) => w[0]).join('').toUpperCase() || 'CIVIL';
      await this.saveBranch({
        code,
        name: branch,
        departmentName: saillDept,
        status: 'ACTIVE'
      });
    }

    // 4. Academic Year
    const normAcademicYear = normalizeAcademicYearDash(academicYear);
    const existingYears = this.getAcademicYears();
    const yearMatch = existingYears.find(
      (y) => normalizeAcademicYearDash(y.yearName) === normAcademicYear
    );
    if (!yearMatch) {
      await this.saveAcademicYear({
        yearName: normAcademicYear,
        isCurrent: true,
        status: 'ACTIVE'
      });
    }

    // 5. Semester
    const semLabel = semester.startsWith('Semester') ? semester : `Semester ${semester}`;
    const existingSems = this.getSemesters();
    const semMatch = existingSems.find(
      (s) => s.semesterName === semLabel && normalizeAcademicYearDash(s.academicYear) === normAcademicYear
    );
    if (!semMatch) {
      await this.saveSemester({
        semesterName: semLabel,
        academicYear: normAcademicYear,
        status: 'ACTIVE'
      });
    }

    // 6. Section
    const secLabel = section.toUpperCase();
    const existingSecs = this.getSections();
    const secMatch = existingSecs.find(
      (s) => s.sectionName.toUpperCase() === secLabel && s.branch === branch
    );
    if (!secMatch) {
      await this.saveSection({
        sectionName: secLabel,
        branch: branch,
        status: 'ACTIVE'
      });
    }

    try {
      await dbStorage.syncBatchesWithAcademicStructure();
    } catch {}
  }

  // --- SAILL PROGRAM-CENTRIC ACADEMIC MODEL HELPERS ---
  static getAcademicOwner(): { department: string; subject: string; lab: string } {
    return {
      department: 'Humanities & Sciences',
      subject: 'English / Communicative English',
      lab: 'SAILL — SRIT AI Language Laboratory'
    };
  }

  static getPrograms(): Branch[] {
    return this.getBranches();
  }
}
