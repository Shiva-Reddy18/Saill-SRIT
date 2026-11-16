import { StudentProfile } from '../types';
import { supabase } from '../lib/supabase';

export interface FacultyNote {
  id: string;
  studentRollNo: string;
  facultyId: string;
  noteText: string;
  createdAt: string;
}

export class FacultyStudentService {
  private static notesCache: FacultyNote[] = [];
  private static initialized: boolean = false;

  static async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('collection_name', 'facultyStudentNotes');

      if (!error && Array.isArray(data)) {
        this.notesCache = data.map((d: any) => d.data);
      }
      this.initialized = true;
    } catch {
      // network fallback
    }
  }

  /**
   * Filter students by search term and specific academic criteria
   */
  static filterStudents(
    students: StudentProfile[],
    queryOrOptions: any,
    branchFilter: string = '',
    yearFilter: string = '',
    semFilter: string = '',
    secFilter: string = ''
  ): StudentProfile[] {
    let q = '';
    let bFilter = branchFilter;
    let yFilter = yearFilter;
    let smFilter = semFilter;
    let scFilter = secFilter;

    if (typeof queryOrOptions === 'object' && queryOrOptions !== null) {
      q = (queryOrOptions.searchQuery || '').trim().toLowerCase();
      bFilter = queryOrOptions.branch || '';
      yFilter = queryOrOptions.academicYear || queryOrOptions.year || '';
      smFilter = queryOrOptions.semester || '';
      scFilter = queryOrOptions.section || '';
    } else if (typeof queryOrOptions === 'string') {
      q = queryOrOptions.trim().toLowerCase();
    }

    return students.filter((s) => {
      // Search text query
      const matchesQuery =
        !q ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.rollNo && s.rollNo.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q));

      // Branch match
      const sBranch = (s.branch || '').toLowerCase();
      const matchesBranch = !bFilter || sBranch.includes(bFilter.toLowerCase());

      // Year match
      const sYear = (s.year || s.academicYear || '').toLowerCase();
      const matchesYear = !yFilter || sYear.includes(yFilter.toLowerCase());

      // Semester match
      const sSem = (s.semester || '').toLowerCase();
      const matchesSem = !smFilter || sSem.includes(smFilter.toLowerCase());

      // Section match
      const sSec = (s.section || '').toUpperCase();
      const matchesSec = !scFilter || sSec.includes(scFilter.toUpperCase());

      return matchesQuery && matchesBranch && matchesYear && matchesSem && matchesSec;
    });
  }

  /**
   * Get Faculty Notes for a given student from Supabase
   */
  static getNotesForStudent(studentRollNo: string): FacultyNote[] {
    if (!this.initialized) {
      this.init();
    }
    return this.notesCache.filter(
      (n) => n.studentRollNo && n.studentRollNo.toUpperCase() === studentRollNo.toUpperCase()
    );
  }

  /**
   * Add a new faculty note for a student in Supabase
   */
  static addStudentNote(studentRollNo: string, facultyId: string, text: string): FacultyNote {
    const newNote: FacultyNote = {
      id: `NOTE-${Date.now()}`,
      studentRollNo: studentRollNo.toUpperCase(),
      facultyId,
      noteText: text.trim(),
      createdAt: new Date().toISOString()
    };

    this.notesCache.unshift(newNote);

    Promise.resolve(
      supabase
        .from('app_data')
        .upsert({
          collection_name: 'facultyStudentNotes',
          item_id: newNote.id,
          data: newNote,
          updated_at: new Date().toISOString()
        })
    ).catch(() => {});

    return newNote;
  }
}
