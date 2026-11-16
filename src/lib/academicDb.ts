import {
  UserRole,
  AttendanceRecord,
  RubricEvaluation,
  StudentInternalMarks,
  Announcement,
  AppNotification,
  FacultyAISessionSummary
} from '../types';
import {
  INITIAL_ATTENDANCE_RECORDS,
  INITIAL_INTERNAL_MARKS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_NOTIFICATIONS,
  SAMPLE_AI_SESSION_SUMMARIES
} from '../data/academicData';
import { supabase } from './supabase';

class AcademicDBService {
  private activeRole: UserRole = 'student';
  private attendanceRecords: AttendanceRecord[] = INITIAL_ATTENDANCE_RECORDS || [];
  private rubricEvaluations: RubricEvaluation[] = [];
  private internalMarks: StudentInternalMarks[] = INITIAL_INTERNAL_MARKS || [];
  private announcements: Announcement[] = INITIAL_ANNOUNCEMENTS || [];
  private notifications: AppNotification[] = INITIAL_NOTIFICATIONS || [];
  private aiSessionSummaries: FacultyAISessionSummary[] = SAMPLE_AI_SESSION_SUMMARIES || [];
  private initialized: boolean = false;

  constructor() {
    this.syncFromSupabase();
  }

  /**
   * Sync all academic data collections from Supabase PostgreSQL
   */
  public async syncFromSupabase(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const [attRes, rubRes, marksRes, annRes, notifRes, aiRes] = await Promise.allSettled([
        supabase.from('app_data').select('data').eq('collection_name', 'attendanceRecords'),
        supabase.from('app_data').select('data').eq('collection_name', 'rubricEvaluations'),
        supabase.from('app_data').select('data').eq('collection_name', 'internalMarks'),
        supabase.from('app_data').select('data').eq('collection_name', 'announcements'),
        supabase.from('app_data').select('data').eq('collection_name', 'notifications'),
        supabase.from('app_data').select('data').eq('collection_name', 'aiSessionSummaries')
      ]);

      if (attRes.status === 'fulfilled' && attRes.value?.data && attRes.value.data.length > 0) {
        this.attendanceRecords = attRes.value.data.map((d: any) => d.data);
      }
      if (rubRes.status === 'fulfilled' && rubRes.value?.data && rubRes.value.data.length > 0) {
        this.rubricEvaluations = rubRes.value.data.map((d: any) => d.data);
      }
      if (marksRes.status === 'fulfilled' && marksRes.value?.data && marksRes.value.data.length > 0) {
        this.internalMarks = marksRes.value.data.map((d: any) => d.data);
      }
      if (annRes.status === 'fulfilled' && annRes.value?.data && annRes.value.data.length > 0) {
        this.announcements = annRes.value.data.map((d: any) => d.data);
      }
      if (notifRes.status === 'fulfilled' && notifRes.value?.data && notifRes.value.data.length > 0) {
        this.notifications = notifRes.value.data.map((d: any) => d.data);
      }
      if (aiRes.status === 'fulfilled' && aiRes.value?.data && aiRes.value.data.length > 0) {
        this.aiSessionSummaries = aiRes.value.data.map((d: any) => d.data);
      }
      this.initialized = true;
    } catch {
      // ignore network errors, in-memory defaults remain
    }
  }

  // Role
  getActiveRole(): UserRole {
    if (typeof sessionStorage !== 'undefined') {
      const saved = sessionStorage.getItem('SAILL_ACTIVE_ROLE');
      if (saved && ['administrator', 'faculty_incharge', 'faculty', 'student'].includes(saved)) {
        return saved as UserRole;
      }
    }
    return this.activeRole;
  }

  setActiveRole(role: UserRole): void {
    this.activeRole = role;
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('SAILL_ACTIVE_ROLE', role);
      } catch {}
    }
  }

  // Attendance Records
  getAttendanceRecords(): AttendanceRecord[] {
    return this.attendanceRecords;
  }

  saveAttendanceRecords(records: AttendanceRecord[]): void {
    this.attendanceRecords = records || [];
    const rows = (this.attendanceRecords || []).map((r) => ({
      collection_name: 'attendanceRecords',
      item_id: r.id,
      data: r,
      updated_at: new Date().toISOString()
    }));
    if (rows.length > 0) {
      Promise.resolve(supabase.from('app_data').upsert(rows)).catch(() => {});
    }
  }

  addAttendanceBatch(newRecords: AttendanceRecord[]): AttendanceRecord[] {
    const existing = this.getAttendanceRecords();
    const map = new Map<string, AttendanceRecord>();
    (existing || []).forEach((r) => map.set(r.id, r));
    (newRecords || []).forEach((r) => map.set(r.id, r));
    const updated = Array.from(map.values());
    this.saveAttendanceRecords(updated);
    return updated;
  }

  // Rubric Evaluations
  getRubricEvaluations(): RubricEvaluation[] {
    return this.rubricEvaluations;
  }

  saveRubricEvaluation(evalItem: RubricEvaluation): RubricEvaluation[] {
    const existing = [...this.rubricEvaluations];
    const index = existing.findIndex((e) => e.id === evalItem.id);
    if (index >= 0) {
      existing[index] = evalItem;
    } else {
      existing.unshift(evalItem);
    }
    this.rubricEvaluations = existing;
    Promise.resolve(
      supabase
        .from('app_data')
        .upsert({
          collection_name: 'rubricEvaluations',
          item_id: evalItem.id,
          data: evalItem,
          updated_at: new Date().toISOString()
        })
    ).catch(() => {});
    return existing;
  }

  // Student Internal Marks
  getInternalMarks(): StudentInternalMarks[] {
    return this.internalMarks;
  }

  saveInternalMarks(marks: StudentInternalMarks[]): void {
    this.internalMarks = marks || [];
    const rows = (this.internalMarks || []).map((m) => ({
      collection_name: 'internalMarks',
      item_id: m.studentId,
      data: m,
      updated_at: new Date().toISOString()
    }));
    if (rows.length > 0) {
      Promise.resolve(supabase.from('app_data').upsert(rows)).catch(() => {});
    }
  }

  updateSingleStudentMarks(marksItem: StudentInternalMarks): StudentInternalMarks[] {
    const all = [...this.getInternalMarks()];
    const idx = all.findIndex((m) => m.studentId === marksItem.studentId);
    if (idx >= 0) {
      all[idx] = marksItem;
    } else {
      all.push(marksItem);
    }
    this.saveInternalMarks(all);
    return all;
  }

  // Announcements
  getAnnouncements(): Announcement[] {
    return this.announcements;
  }

  saveAnnouncements(items: Announcement[]): void {
    this.announcements = items || [];
    const rows = (this.announcements || []).map((a) => ({
      collection_name: 'announcements',
      item_id: a.id,
      data: a,
      updated_at: new Date().toISOString()
    }));
    if (rows.length > 0) {
      Promise.resolve(supabase.from('app_data').upsert(rows)).catch(() => {});
    }
  }

  addAnnouncement(item: Announcement): Announcement[] {
    const items = [item, ...this.getAnnouncements()];
    this.saveAnnouncements(items);
    return items;
  }

  // Notifications
  getNotifications(): AppNotification[] {
    return this.notifications;
  }

  saveNotifications(notifs: AppNotification[]): void {
    this.notifications = notifs || [];
    const rows = (this.notifications || []).map((n) => ({
      collection_name: 'notifications',
      item_id: n.id,
      data: n,
      updated_at: new Date().toISOString()
    }));
    if (rows.length > 0) {
      Promise.resolve(supabase.from('app_data').upsert(rows)).catch(() => {});
    }
  }

  markNotificationAsRead(id: string): AppNotification[] {
    const notifs = this.notifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n
    );
    this.saveNotifications(notifs);
    return notifs;
  }

  addNotification(notif: AppNotification): AppNotification[] {
    const notifs = [notif, ...this.getNotifications()];
    this.saveNotifications(notifs);
    return notifs;
  }

  // AI Session Summaries
  getAISessionSummaries(): FacultyAISessionSummary[] {
    return this.aiSessionSummaries;
  }

  saveAISessionSummaries(summaries: FacultyAISessionSummary[]): void {
    this.aiSessionSummaries = summaries || [];
    const rows = (this.aiSessionSummaries || []).map((s) => ({
      collection_name: 'aiSessionSummaries',
      item_id: s.id,
      data: s,
      updated_at: new Date().toISOString()
    }));
    if (rows.length > 0) {
      Promise.resolve(supabase.from('app_data').upsert(rows)).catch(() => {});
    }
  }

  addAISessionSummary(summary: FacultyAISessionSummary): FacultyAISessionSummary[] {
    const list = [summary, ...this.getAISessionSummaries()];
    this.saveAISessionSummaries(list);
    return list;
  }
}

export const academicDb = new AcademicDBService();
