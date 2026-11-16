import { FacultyAssignment, FacultyAssignmentPayload } from '../types/academic';
import { StudentProfile } from '../types';
import { dbStorage } from '../lib/db';

export class FacultyAssignmentService {
  private static assignmentsCache: FacultyAssignment[] = [];
  private static isInitialized: boolean = false;
  private static initialization: Promise<FacultyAssignment[]> | null = null;


static async initFromDB(): Promise<FacultyAssignment[]> {
  console.info('[FacultyAssignmentService] initFromDB', {
    alreadyInitialized: this.isInitialized,
    reloadInProgress: Boolean(this.initialization)
  });

  // Reuse an existing request if one is running.
  if (this.initialization) {
    return this.initialization;
  }

  // Don't unnecessarily fetch assignments again.
  if (this.isInitialized) {
    console.info(
      '[FacultyAssignmentService] Using cached assignments',
      { assignmentCount: this.assignmentsCache.length }
    );

    return this.assignmentsCache;
  }

  this.initialization = (async () => {
    try {
      const dbAssignments =
        await dbStorage.getAllFacultyAssignments();

      this.assignmentsCache = dbAssignments;
      this.isInitialized = true;

      console.info(
        '[FacultyAssignmentService] Assignments loaded',
        { assignmentCount: dbAssignments.length }
      );

      return dbAssignments;
    } catch (error) {
      console.error(
        '[FacultyAssignmentService] Assignment loading failed:',
        error
      );

      throw error;
    }
  })().finally(() => {
    this.initialization = null;
  });

  return this.initialization;
}


  static getAllAssignments(): FacultyAssignment[] {
    if (!this.isInitialized) {
      this.initFromDB().catch(() => {});
    }
    return this.assignmentsCache;
  }

  static getAssignmentsForFaculty(facultyId: string): FacultyAssignment[] {
    if (!facultyId) return [];
    const normId = String(facultyId).trim().toUpperCase();
    return this.getAllAssignments().filter(
      (a) => a && a.facultyId && String(a.facultyId).trim().toUpperCase() === normId && a.status === 'ACTIVE'
    );
  }

  static async syncScope(
    facultyId: string,
    facultyName: string,
    department: string,
    allBatches: any[],
    allStudents: StudentProfile[]
  ): Promise<FacultyAssignment[]> {
    if (!facultyId) return [];
    const normId = String(facultyId).trim().toUpperCase();

    // 1. Sync mapped students
    const myStudents = (allStudents || []).filter(
      (s) => s && s.assignedFacultyId && String(s.assignedFacultyId).trim().toUpperCase() === normId
    );

    // 2. Identify unique (branch, semester, section) combinations
    const sectionMap = new Map<string, { branch: string; semester: string; section: string; count: number }>();
    myStudents.forEach((st) => {
      const br = st.branch || department || 'CSE';
      const sem = st.semester || 'Semester I';
      const sec = st.section || 'A';
      const key = `${br}__${sem}__${sec}`;

      if (!sectionMap.has(key)) {
        sectionMap.set(key, { branch: br, semester: sem, section: sec, count: 1 });
      } else {
        sectionMap.get(key)!.count += 1;
      }
    });

    // 3. For each combination, ensure an ACTIVE FacultyAssignment exists
    const currentAssignments = this.getAssignmentsForFaculty(normId);
    const updatedAssignments: FacultyAssignment[] = [...currentAssignments];

    for (const item of Array.from(sectionMap.values())) {
      const exists = currentAssignments.some(
        (a) =>
          a.branch.toUpperCase() === item.branch.toUpperCase() &&
          a.semester.toUpperCase() === item.semester.toUpperCase() &&
          (a.section.toUpperCase() === item.section.toUpperCase() ||
            (a.sections && a.sections.map((s) => s.toUpperCase()).includes(item.section.toUpperCase())))
      );

      if (!exists) {
        // Find matching batch
        const matchingBatch = allBatches.find(
          (b) =>
            b.branch?.toUpperCase() === item.branch.toUpperCase() &&
            b.semester?.toUpperCase() === item.semester.toUpperCase() &&
            b.section?.toUpperCase() === item.section.toUpperCase()
        );

        const newAssignment = await this.createAssignment(
          {
            facultyId: normId,
            facultyName: facultyName,
            department: department,
            branch: item.branch,
            academicYear: matchingBatch?.academicYear || '2025-2026',
            semester: item.semester,
            section: item.section,
            sections: [item.section]
          },
          'AutoSync Engine'
        );

        // Update batch if found
        if (matchingBatch) {
          try {
            await dbStorage.updateBatch(matchingBatch.id, {
              assignedFacultyInchargeId: normId,
              assignedFacultyInchargeName: facultyName
            });
          } catch {
            // fallback
          }
        }

        updatedAssignments.push(newAssignment);
      }
    }

    return updatedAssignments;
  }

  static getAssignedSectionsForFaculty(facultyId: string): string[] {
    if (!facultyId) return [];
    const assignments = this.getAssignmentsForFaculty(facultyId);
    const sections = new Set<string>();
    assignments.forEach((a) => {
      if (a.sections && a.sections.length > 0) {
        a.sections.forEach((s) => sections.add(`${a.branch || 'CSE'} - ${s}`));
      } else if (a.section) {
        sections.add(`${a.branch || 'CSE'} - ${a.section}`);
      }
    });
    return Array.from(sections);
  }

  



static getAssignedStudentsForFaculty(
  facultyId: string,
  allStudents: StudentProfile[]
): StudentProfile[] {
  if (!facultyId) return [];

  const normalize = (value: unknown): string =>
    String(value || '')
      .trim()
      .toUpperCase()
      .replace(/^SECTION\s*/, '')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, '');

  const normalizeSemester = (value: unknown): string => {
    const v = normalize(value)
      .replace(/^SEMESTER/, '')
      .replace(/^SEM/, '');

    const roman: Record<string, string> = {
      I: '1',
      II: '2',
      III: '3',
      IV: '4',
      V: '5',
      VI: '6',
      VII: '7',
      VIII: '8'
    };

    return roman[v] || v;
  };

  const normalizeYear = (value: unknown): string => {
    const v = normalize(value).replace(/\//g, '-');
    const match = v.match(/^(\d{4})-(\d{2}|\d{4})$/);

    return match
      ? `${match[1]}-${match[2].slice(-2)}`
      : v;
  };

  const normFacultyId = normalize(facultyId);

  const activeAssignments =
    this.getAssignmentsForFaculty(facultyId)
      .filter(a => a.status === 'ACTIVE');

  if (!activeAssignments.length) return [];

  return (allStudents || []).filter(student => {
    if (!student) return false;

    const studentFaculty = normalize(
      student.assignedFacultyId ||
      (student as any).assigned_faculty_id
    );

    const studentBranch = normalize(
      student.branch || student.department
    );

    const studentSection = normalize(student.section);

    const studentYear = normalizeYear(
      student.academicYear ||
      (student as any).academic_year
    );
    console.log('[STUDENT RAW DATA]', {
  rollNo: student.rollNo,
  academicYear: student.academicYear,
  academic_year: (student as any).academic_year,
  batch: student.batch,
  batchId: student.batchId,
  semester: student.semester,
  branch: student.branch,
  section: student.section
});

    const studentSemester = normalizeSemester(
      student.semester
    );

    
const matchingAssignments = activeAssignments.filter(assignment => {
  if (normalize(assignment.facultyId) !== normFacultyId) {
    return false;
  }

  const normalizeBranch = (value: unknown): string => {
  const branch = normalize(value);

  if (
    branch === 'CSE' ||
    branch === 'COMPUTERSCIENCEENGINEERING'
  ) {
    return 'CSE';
  }

  return branch;
};

const branchMatch =
  normalizeBranch(assignment.branch) ===
  normalizeBranch(student.branch || student.department);

  const sections = [
    assignment.section,
    ...(assignment.sections || [])
  ].map(normalize);

  const sectionMatch = sections.includes(studentSection);

  const semesterMatch =
    normalizeSemester(assignment.semester) === studentSemester;

  return branchMatch && sectionMatch && semesterMatch;
});

// If academic year exists, require an exact match.
// If missing, accept only when there is exactly one
// matching active allocation for this academic scope.
const matched = studentYear
  ? matchingAssignments.some(
      assignment =>
        normalizeYear(assignment.academicYear) === studentYear
    )
  : matchingAssignments.length === 1;

const assignedToAnotherFaculty =
  studentFaculty !== '' &&
  studentFaculty !== normFacultyId;

const finalMatch = matched && !assignedToAnotherFaculty;


    console.log('[FACULTY MATCH DEBUG]', {
      facultyId,
      studentRollNo: student.rollNo,
      assignedFacultyId: studentFaculty,
      studentBranch,
      studentSection,
      studentYear,
      studentSemester,
      matched
    });

    return finalMatch;
  });
}



  static async createAssignment(
    payload: FacultyAssignmentPayload,
    assignedBy = 'Administrator'
  ): Promise<FacultyAssignment> {
    const list = this.getAllAssignments();
    const normFacultyId = payload.facultyId.trim().toUpperCase();

    // Prevent duplicate active assignment for the same faculty, branch, year, sem, section
    const isDuplicate = list.some(
      (a) =>
        a.status === 'ACTIVE' &&
        a.facultyId.trim().toUpperCase() === normFacultyId &&
        a.branch.toUpperCase() === payload.branch.toUpperCase() &&
        a.academicYear.toUpperCase() === payload.academicYear.toUpperCase() &&
        a.semester.toUpperCase() === payload.semester.toUpperCase() &&
        a.section.toUpperCase() === payload.section.toUpperCase()
    );

    if (isDuplicate) {
      throw new Error(
        `Faculty member ${payload.facultyName} is already assigned to ${payload.branch} Section ${payload.section} (${payload.academicYear}, ${payload.semester}).`
      );
    }

    // Check if another faculty is already assigned to this exact section
    const conflict = list.find(
      (a) =>
        a.status === 'ACTIVE' &&
        a.branch.toUpperCase() === payload.branch.toUpperCase() &&
        a.academicYear.toUpperCase() === payload.academicYear.toUpperCase() &&
        a.semester.toUpperCase() === payload.semester.toUpperCase() &&
        a.section.toUpperCase() === payload.section.toUpperCase() &&
        a.facultyId.trim().toUpperCase() !== normFacultyId
    );

    if (conflict && !payload.isOverride) {
      throw new Error(
        `Section ${payload.section} of ${payload.branch} is already assigned to faculty ${conflict.facultyName} (${conflict.facultyId}). Please toggle Override or unassign the existing faculty first.`
      );
    }

    if (conflict && payload.isOverride) {
      conflict.status = 'INACTIVE';
      conflict.lastUpdated = new Date().toISOString();
      await dbStorage.saveFacultyAssignment(conflict);
    }

    const nowIso = new Date().toISOString().split('T')[0];
    const timestampIso = new Date().toISOString();
    const allocId = `FAE-ALLOC-${Date.now()}`;

    const newRecord: FacultyAssignment = {
      id: `FA-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      allocationId: allocId,
      facultyId: normFacultyId,
      facultyName: payload.facultyName,
      department: payload.department,
      branch: payload.branch,
      academicYear: payload.academicYear,
      semester: payload.semester,
      section: payload.section,
      sections: payload.sections || [payload.section],
      assignedDate: nowIso,
      allocationTimestamp: timestampIso,
      lastUpdated: timestampIso,
      assignedBy: assignedBy,
      status: 'ACTIVE'
    };

    list.unshift(newRecord);
    this.assignmentsCache = list;

    // Persist permanently to Supabase via dbStorage
    try {
      await dbStorage.saveFacultyAssignment(newRecord);
    } catch (e) {
      console.warn('Failed to save faculty assignment to Supabase:', e);
    }

    // Log Audit Trail
    try {
      await dbStorage.logAuditTrail(
        'FACULTY_ALLOCATION_UPDATE',
        `Allocated Academic Scope [Alloc ID: ${allocId}] to ${payload.facultyName} (${normFacultyId}): ${payload.branch} - Section ${payload.section} (${payload.academicYear}, ${payload.semester}).${payload.isOverride ? ' (Overridden)' : ''}`,
        assignedBy,
        assignedBy,
        'ADMINISTRATOR'
      );
    } catch {
      // Audit log fallback
    }

    // Trigger auto-mapping for unmapped students
    try {
      await dbStorage.autoMapUnmappedStudents();
    } catch {
      // Ignore fallback
    }

    return newRecord;
  }

  static async saveMultiSectionAllocation(
    payload: {
      facultyId: string;
      facultyName: string;
      department: string;
      branch: string;
      academicYear: string;
      semester: string;
      sections: string[];
      isOverride?: boolean;
    },
    assignedBy = 'Administrator'
  ): Promise<FacultyAssignment[]> {
    const results: FacultyAssignment[] = [];
    const allocId = `FAE-ALLOC-${Date.now()}`;
    const timestampIso = new Date().toISOString();

    for (const sectionName of payload.sections) {
      const record = await this.createAssignment(
        {
          facultyId: payload.facultyId,
          facultyName: payload.facultyName,
          department: payload.department,
          branch: payload.branch,
          academicYear: payload.academicYear,
          semester: payload.semester,
          section: sectionName,
          sections: payload.sections,
          isOverride: payload.isOverride
        },
        assignedBy
      );
      record.allocationId = allocId;
      record.allocationTimestamp = timestampIso;
      results.push(record);
    }

    return results;
  }

  static getFacultyWorkload(facultyId: string, allStudents: StudentProfile[]) {
    const activeAssignments = this.getAssignmentsForFaculty(facultyId);
    const assignedStudents = this.getAssignedStudentsForFaculty(facultyId, allStudents);

    const uniqueSections = new Set(activeAssignments.map((a) => `${a.branch}-${a.section}`));
    const totalModules = 10;

    let totalScore = 0;
    let pendingReviews = 0;

    assignedStudents.forEach((student) => {
      const score = student.overallScore || student.averageScore || student.overallProgressPercentage || 0;
      totalScore += score;

      if (student.portfolioItems) {
        const unreviewed = student.portfolioItems.filter((item) => !item.facultyFeedback && !item.graded);
        pendingReviews += unreviewed.length;
      }
    });

    const averageProgress =
      assignedStudents.length > 0 ? Math.round(totalScore / assignedStudents.length) : 0;

    return {
      totalSections: uniqueSections.size,
      totalStudents: assignedStudents.length,
      totalModules,
      averageProgress,
      pendingReviews
    };
  }

  static async updateAssignment(id: string, updatedPayload: Partial<FacultyAssignmentPayload>): Promise<FacultyAssignment> {
    const list = this.getAllAssignments();
    const index = list.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error('Assignment record not found.');
    }

    list[index] = { ...list[index], ...updatedPayload, lastUpdated: new Date().toISOString() };
    this.assignmentsCache = list;
    try {
      await dbStorage.saveFacultyAssignment(list[index]);
    } catch {
      // fallback
    }
    return list[index];
  }

  static async deleteAssignment(id: string): Promise<void> {
    this.assignmentsCache = this.getAllAssignments().filter((a) => a.id !== id);
    try {
      await dbStorage.deleteFacultyAssignment(id);
    } catch {
      // fallback
    }
  }

  static async deactivateAssignment(id: string): Promise<FacultyAssignment> {
    console.info('[FacultyAssignmentService] Skipping initFromDB before targeted deactivation', {
      selectedId: id,
      alreadyInitialized: this.isInitialized,
      reloadInProgress: Boolean(this.initialization)
    });
    console.info('[FacultyAssignmentService] Before exact assignment lookup and update', { selectedId: id });
    const updatedAssignment = await dbStorage.deactivateFacultyAssignment(id);
    console.info('[FacultyAssignmentService] After exact assignment lookup and update', {
      selectedId: id,
      updatedId: updatedAssignment.id,
      status: updatedAssignment.status
    });
    if (updatedAssignment.id !== id || updatedAssignment.status !== 'INACTIVE') {
      throw new Error('Supabase did not confirm the selected assignment was deactivated.');
    }
    const existingIndex = this.assignmentsCache.findIndex((assignment) => assignment.id === id);
    if (existingIndex >= 0) {
      this.assignmentsCache[existingIndex] = updatedAssignment;
    } else {
      this.assignmentsCache.push(updatedAssignment);
    }
    return updatedAssignment;
  }

  static async toggleAssignmentStatus(id: string): Promise<FacultyAssignment> {
    const list = this.getAllAssignments();
    const item = list.find((a) => a.id === id);
    if (!item) throw new Error('Assignment record not found.');
    item.status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    item.lastUpdated = new Date().toISOString();
    this.assignmentsCache = list;
    try {
      await dbStorage.saveFacultyAssignment(item);
    } catch {
      // fallback
    }
    return item;
  }
}
