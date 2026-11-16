import { dbStorage } from '../lib/db';

export type ObservationCategory =
  | 'Pedagogy'
  | 'UI/UX'
  | 'AI Evaluation'
  | 'Assessment'
  | 'Audio'
  | 'Faculty'
  | 'Student'
  | 'Administrator'
  | 'Performance'
  | 'Security'
  | 'Bug'
  | 'Enhancement'
  | 'Feature Request';

export type ObservationPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type ObservationStatus = 'Open' | 'In Progress' | 'Under Review' | 'Completed' | 'Closed';

export interface ObservationAttachment {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'pdf';
  size: string;
  url?: string;
}

export interface ReviewObservation {
  id: string;
  journey: string;
  phase: string;
  unit: string;
  activity: string;
  title: string;
  description: string;
  category: ObservationCategory;
  priority: ObservationPriority;
  status: ObservationStatus;
  assignedTo: string;
  dateCreated: string;
  updatedAt: string;
  softwareVersion: string;
  attachments: ObservationAttachment[];
}

export interface ReviewDashboardStats {
  totalIssues: number;
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
  pedagogical: number;
  ui: number;
  ai: number;
  featureRequests: number;
}

export interface VersionRelease {
  version: string;
  releaseName: string;
  releaseDate: string;
  status: 'released' | 'in_development' | 'planned';
  description: string;
  linkedObservationIds: string[];
}

const STORAGE_KEY = 'saill_development_observations';

// Real-time observations storage
const INITIAL_SEED_OBSERVATIONS: ReviewObservation[] = [];

export const VERSION_RELEASES: VersionRelease[] = [
  {
    version: 'v1.2.0-A',
    releaseName: 'Speech Sound Foundations Release',
    releaseDate: '2026-08-06',
    status: 'released',
    description: 'Major release featuring 5 comprehensive Units for Phase A Speech Sound Foundations with interactive IPA chart, Sagittal vocal tract visuals, Minimal pair matrix, and diagnostic assessments.',
    linkedObservationIds: ['OBS-2026-001', 'OBS-2026-002', 'OBS-2026-003', 'OBS-2026-005']
  },
  {
    version: 'v1.1.0',
    releaseName: 'Academic Governance & Batch Management',
    releaseDate: '2026-07-15',
    status: 'released',
    description: 'Introduced SRIT Section & Batch transfer, Faculty Incharge scoping, and automated student profile assignment.',
    linkedObservationIds: ['OBS-2026-004']
  },
  {
    version: 'v1.0.0',
    releaseName: 'SAILL Core Laboratory Launch',
    releaseDate: '2026-06-01',
    status: 'released',
    description: 'Initial release of SRIT AI Language Laboratory platform.',
    linkedObservationIds: ['OBS-2026-006']
  }
];

export class DevelopmentReviewService {
  /**
   * Fetch all review observations from storage or seed
   */
  static getAllObservations(): ReviewObservation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as ReviewObservation[];
      }
    } catch {
      // Fallback to seed
    }
    // Seed storage on first access
    this.saveObservations(INITIAL_SEED_OBSERVATIONS);
    return INITIAL_SEED_OBSERVATIONS;
  }

  /**
   * Save observations list to storage
   */
  static saveObservations(items: ReviewObservation[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to persist development observations:', e);
    }
  }

  /**
   * Get single observation
   */
  static getObservationById(id: string): ReviewObservation | null {
    const list = this.getAllObservations();
    return list.find((o) => o.id === id) || null;
  }

  /**
   * Create new observation
   */
  static createObservation(data: Omit<ReviewObservation, 'id' | 'dateCreated' | 'updatedAt'>): ReviewObservation {
    const list = this.getAllObservations();
    const count = list.length + 1;
    const newId = `OBS-2026-${String(count).padStart(3, '0')}`;
    const now = new Date().toISOString();

    const newObs: ReviewObservation = {
      ...data,
      id: newId,
      dateCreated: now,
      updatedAt: now,
      softwareVersion: data.softwareVersion || 'v1.2.0-A',
      attachments: data.attachments || []
    };

    const updatedList = [newObs, ...list];
    this.saveObservations(updatedList);
    return newObs;
  }

  /**
   * Update an existing observation
   */
  static updateObservation(id: string, updates: Partial<ReviewObservation>): ReviewObservation {
    const list = this.getAllObservations();
    const index = list.findIndex((o) => o.id === id);
    if (index === -1) {
      throw new Error(`Observation '${id}' not found.`);
    }

    const updatedObs: ReviewObservation = {
      ...list[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    list[index] = updatedObs;
    this.saveObservations(list);
    return updatedObs;
  }

  /**
   * Delete observation
   */
  static deleteObservation(id: string): void {
    const list = this.getAllObservations();
    const filtered = list.filter((o) => o.id !== id);
    this.saveObservations(filtered);
  }

  /**
   * Compute Dashboard Metrics
   */
  static getDashboardStats(): ReviewDashboardStats {
    const list = this.getAllObservations();

    return {
      totalIssues: list.length,
      open: list.filter((o) => o.status === 'Open').length,
      inProgress: list.filter((o) => o.status === 'In Progress' || o.status === 'Under Review').length,
      resolved: list.filter((o) => o.status === 'Completed' || o.status === 'Closed').length,
      critical: list.filter((o) => o.priority === 'Critical').length,
      pedagogical: list.filter((o) => o.category === 'Pedagogy').length,
      ui: list.filter((o) => o.category === 'UI/UX').length,
      ai: list.filter((o) => o.category === 'AI Evaluation').length,
      featureRequests: list.filter((o) => o.category === 'Feature Request').length
    };
  }

  /**
   * Filter and search observations
   */
  static filterObservations(params: {
    journey?: string;
    phase?: string;
    category?: string;
    priority?: string;
    status?: string;
    keyword?: string;
  }): ReviewObservation[] {
    let list = this.getAllObservations();

    if (params.journey && params.journey !== 'ALL') {
      list = list.filter((o) => o.journey.toLowerCase().includes(params.journey!.toLowerCase()));
    }

    if (params.phase && params.phase !== 'ALL') {
      list = list.filter((o) => o.phase.toLowerCase().includes(params.phase!.toLowerCase()));
    }

    if (params.category && params.category !== 'ALL') {
      list = list.filter((o) => o.category === params.category);
    }

    if (params.priority && params.priority !== 'ALL') {
      list = list.filter((o) => o.priority === params.priority);
    }

    if (params.status && params.status !== 'ALL') {
      list = list.filter((o) => o.status === params.status);
    }

    if (params.keyword && params.keyword.trim()) {
      const kw = params.keyword.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.title.toLowerCase().includes(kw) ||
          o.description.toLowerCase().includes(kw) ||
          o.id.toLowerCase().includes(kw) ||
          o.assignedTo.toLowerCase().includes(kw) ||
          o.activity.toLowerCase().includes(kw)
      );
    }

    return list;
  }
}
