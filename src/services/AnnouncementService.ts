import { Announcement, NotificationPriority } from '../types/notification';
import { UserRole } from '../types';
import { NotificationService } from './NotificationService';

const ANNOUNCEMENTS_STORAGE_KEY = 'saill_announcements_v1';

const getInitialSeedAnnouncements = (): Announcement[] => {
  return [];
};

export class AnnouncementService {
  private static getStored(): Announcement[] {
    try {
      const data = localStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
    const initial = getInitialSeedAnnouncements();
    localStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  private static save(announcements: Announcement[]): void {
    try {
      localStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(announcements));
    } catch {
      // ignore
    }
  }

  static getAnnouncementsForRole(role: UserRole): Announcement[] {
    const all = this.getStored();
    const roleUpper = (role || 'STUDENT').toString().toUpperCase();

    return all.filter((a) => {
      if (a.targetAudience === 'ALL') return true;
      if (roleUpper === 'ADMINISTRATOR') return true;
      if ((roleUpper === 'FACULTY_INCHARGE' || roleUpper === 'FACULTY') && a.targetAudience === 'FACULTY') return true;
      if (roleUpper === 'STUDENT' && a.targetAudience === 'STUDENT') return true;
      return false;
    });
  }

  static createAnnouncement(
    data: Omit<Announcement, 'id' | 'createdDate'>,
    authorRole: 'ADMINISTRATOR' | 'FACULTY_INCHARGE' = 'ADMINISTRATOR',
    authorName: string = 'SAILL Administrator'
  ): Announcement {
    const all = this.getStored();
    const nowStr = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const newAnnouncement: Announcement = {
      ...data,
      id: `ann-${Date.now()}`,
      createdDate: nowStr,
      authorRole,
      authorName
    };

    const updated = [newAnnouncement, ...all];
    this.save(updated);

    // Automatically trigger notification for all relevant users
    NotificationService.createNotification({
      title: `Announcement: ${newAnnouncement.title}`,
      message: newAnnouncement.description.slice(0, 100) + '...',
      timestamp: 'Just now',
      category: 'Announcement',
      priority: newAnnouncement.priority,
      targetRole: newAnnouncement.targetAudience === 'STUDENT' ? 'STUDENT' : newAnnouncement.targetAudience === 'FACULTY' ? 'FACULTY_INCHARGE' : 'ALL',
      linkPage: 'announcements'
    });

    return newAnnouncement;
  }

  static deleteAnnouncement(id: string): Announcement[] {
    const all = this.getStored();
    const updated = all.filter((a) => a.id !== id);
    this.save(updated);
    return updated;
  }
}
