import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Page, StudentProfile, ModuleProgress, RecordingItem, PortfolioItem, UserRole } from './types';
import { getModuleById } from './data/modulesData';
import { dbStorage } from './lib/db';
import { usePWA, registerServiceWorker } from './lib/pwa';
import { AuthService } from './services/AuthService';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { normalizeRole } from './types/auth';
import { hasPageAccess } from './utils/permissionMiddleware';
import { useAuth } from './context/AuthContext';

// Navigation & Layout Components
import { PublicNavbar } from './components/navigation/PublicNavbar';
import { Navbar } from './components/navigation/Navbar';
import { Sidebar } from './components/navigation/Sidebar';
import { MobileNav } from './components/navigation/MobileNav';
import { Breadcrumb, BreadcrumbItem } from './components/layout/Breadcrumb';
import { PWAInstallBanner } from './components/navigation/PWAInstallBanner';
import { OfflineIndicator } from './components/navigation/OfflineIndicator';
import { ApplicationSplashScreen } from './components/ApplicationSplashScreen';
import { HelpModal } from './components/HelpModal';
import { Footer } from './components/Footer';
import { SkeletonCard, SkeletonTable } from './components/ui/Skeleton';
import { NotificationProvider } from './context/NotificationContext';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';
import { QuickReviewButton } from './components/admin/QuickReviewButton';
import { PlatformInitializationService } from './services/PlatformInitializationService';
import { AcademicStructureService } from './services/AcademicStructureService';
import { ModuleReleaseService } from './services/ModuleReleaseService';
import { StudentProgressService } from './services/StudentProgressService';
import { AlertTriangle } from 'lucide-react';

const DEFAULT_GUEST_PROFILE: StudentProfile = {
  id: 'guest-student',
  name: 'Student',
  rollNo: '264G1A0501',
  branch: 'CSE',
  section: 'A',
  batch: 'B.Tech CSE A',
  programme: 'B.Tech',
  department: 'Computer Science and Engineering',
  academicYear: '2026-2027',
  semester: 'Semester I',
  year: 'I',
  email: 'student@srit.ac.in',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  xp: 0,
  level: 1,
  streakDays: 0,
  targetGoal: 'Master Technical Communication & Placement Readiness',
  joinedDate: new Date().toISOString().split('T')[0],
  status: 'ACTIVE'
};

// Lazy-loaded Pages - Phase 1 & 2 & 3
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const RegisterChoicePage = lazy(() => import('./pages/RegisterChoicePage').then(m => ({ default: m.RegisterChoicePage })));
const StudentRegisterPage = lazy(() => import('./pages/StudentRegisterPage').then(m => ({ default: m.StudentRegisterPage })));
const FacultyRegisterPage = lazy(() => import('./pages/FacultyRegisterPage').then(m => ({ default: m.FacultyRegisterPage })));
const AdminRegistrationPage = lazy(() => import('./pages/AdminRegistrationPage').then(m => ({ default: m.AdminRegistrationPage })));
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage').then(m => ({ default: m.PendingApprovalPage })));
const StudentDashboardPage = lazy(() => import('./pages/StudentDashboardPage').then(m => ({ default: m.StudentDashboardPage })));
const LaboratoryModulesPage = lazy(() => import('./pages/LaboratoryModulesPage').then(m => ({ default: m.LaboratoryModulesPage })));
const ModuleDetailPage = lazy(() => import('./pages/ModuleDetailPage').then(m => ({ default: m.ModuleDetailPage })));
const PracticeCenterPage = lazy(() => import('./pages/PracticeCenterPage').then(m => ({ default: m.PracticeCenterPage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const ProgressDashboardPage = lazy(() => import('./pages/ProgressDashboardPage').then(m => ({ default: m.ProgressDashboardPage })));
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage').then(m => ({ default: m.StudentProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AILearningEnginePage = lazy(() => import('./pages/AILearningEnginePage').then(m => ({ default: m.AILearningEnginePage })));

// Lazy-loaded Pages - Phase 4 Academic Management & Quality
const FacultyDashboardPage = lazy(() => import('./pages/FacultyDashboardPage').then(m => ({ default: m.FacultyDashboardPage })));
const DigitalAttendancePage = lazy(() => import('./pages/DigitalAttendancePage').then(m => ({ default: m.DigitalAttendancePage })));
const RubricAssessmentPage = lazy(() => import('./pages/RubricAssessmentPage').then(m => ({ default: m.RubricAssessmentPage })));
const InternalMarkCalculatorPage = lazy(() => import('./pages/InternalMarkCalculatorPage').then(m => ({ default: m.InternalMarkCalculatorPage })));
const AcademicAnalyticsPage = lazy(() => import('./pages/AcademicAnalyticsPage').then(m => ({ default: m.AcademicAnalyticsPage })));
const FacultyPortfolioReviewPage = lazy(() => import('./pages/FacultyPortfolioReviewPage').then(m => ({ default: m.FacultyPortfolioReviewPage })));
const AcademicReportsPage = lazy(() => import('./pages/AcademicReportsPage').then(m => ({ default: m.AcademicReportsPage })));
const AIFacultyAssistantPage = lazy(() => import('./pages/AIFacultyAssistantPage').then(m => ({ default: m.AIFacultyAssistantPage })));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage').then(m => ({ default: m.AnnouncementsPage })));
const AdminControlPage = lazy(() => import('./pages/AdminControlPage').then(m => ({ default: m.AdminControlPage })));
const SystemHealthPage = lazy(() => import('./pages/SystemHealthPage').then(m => ({ default: m.SystemHealthPage })));
const QEFFrameworkPage = lazy(() => import('./pages/QEFFrameworkPage').then(m => ({ default: m.QEFFrameworkPage })));
const ProductionCertificationPage = lazy(() => import('./pages/ProductionCertificationPage').then(m => ({ default: m.ProductionCertificationPage })));

const PageFallback = () => (
  <div className="space-y-6 animate-pulse p-4">
    <SkeletonCard />
    <SkeletonTable rows={4} />
  </div>
);

const CANONICAL_PAGE_PATHS: Partial<Record<Page, string>> = {
  landing: '/',
  login: '/login',
  'register-choice': '/register',
  'register-student': '/register/student',
  'register-faculty': '/register/faculty',
  'register-admin': '/register/admin',
  'forgot-password': '/forgot-password',
  'reset-password': '/reset-password',
  'pending-approval': '/pending-approval',
  dashboard: '/student',
  'faculty-dashboard': '/faculty',
  'admin-control': '/admin'
};

const pagePath = (page: Page): string => CANONICAL_PAGE_PATHS[page] || `/app/${page}`;

const pageFromPath = (pathname: string): Page => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const canonical = Object.entries(CANONICAL_PAGE_PATHS).find(([, path]) => path === normalizedPath);
  if (canonical) return canonical[0] as Page;
  if (normalizedPath.startsWith('/app/')) {
    const candidate = normalizedPath.slice('/app/'.length) as Page;
    const knownPages: Page[] = [
      'modules', 'module-detail', 'practice', 'portfolio', 'progress', 'profile',
      'settings', 'ai-engine', 'attendance', 'rubrics', 'internal-marks',
      'analytics', 'portfolio-review', 'reports', 'faculty-assistant',
      'announcements', 'system-health', 'qef-framework', 'production-certification'
    ];
    if (knownPages.includes(candidate)) return candidate;
  }
  return 'landing';
};

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('saill_splash_shown') !== 'true';
    } catch {
      return false;
    }
  });
  const { user: authUser, role: authenticatedRole, isLoading: authLoading } = useAuth();
  const [activeRole, setActiveRole] = useState<UserRole>('STUDENT');
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const tokenParam = searchParams.get('token');
      const pageParam = searchParams.get('page');
      if (pageParam === 'reset-password' || tokenParam) {
        return 'reset-password';
      }
      if (pageParam === 'forgot-password') {
        return 'forgot-password';
      }
    } catch {
      // ignore
    }
    return pageFromPath(window.location.pathname);
  });
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const [isAppLoading, setIsAppLoading] = useState<boolean>(true);
  const [profile, setProfile] = useState<StudentProfile>(DEFAULT_GUEST_PROFILE);
  const [isDatabaseConnected, setIsDatabaseConnected] = useState<boolean | null>(null);
  const [databaseErrorMessage, setDatabaseErrorMessage] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, ModuleProgress>>({});
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

  // Layout states for Collapsible Left Sidebar (with localStorage persistence) & Help Modal
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('saill_sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Central Database Admin Status
  const [hasCentralAdmin, setHasCentralAdmin] = useState<boolean | null>(null);

  const { isOffline, isInstallable, isInstalled, triggerInstall } = usePWA();

  useEffect(() => {
    setActiveRole(authenticatedRole || 'STUDENT');
  }, [authenticatedRole]);

  useEffect(() => {
    const handlePopState = () => {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('page') === 'reset-password' || searchParams.has('token')) {
        setResetToken(searchParams.get('token'));
        setCurrentPage('reset-password');
      } else if (searchParams.get('page') === 'forgot-password') {
        setCurrentPage('forgot-password');
      } else {
        setCurrentPage(pageFromPath(window.location.pathname));
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const expectedPath = pagePath(currentPage);
    if (window.location.pathname !== expectedPath) {
      window.history.replaceState(null, '', `${expectedPath}${window.location.search}`);
    }
  }, [currentPage]);

  // Track the last active workspace/feature page before refresh
  useEffect(() => {
    const isPublicPage =
      currentPage === 'landing' ||
      currentPage === 'login' ||
      currentPage === 'register-choice' ||
      currentPage === 'register-student' ||
      currentPage === 'register-faculty' ||
      currentPage === 'register-admin' ||
      currentPage === 'forgot-password' ||
      currentPage === 'reset-password';

    if (!isPublicPage) {
      try {
        localStorage.setItem('saill_last_refreshed_page', currentPage);
        if (currentPage === 'module-detail' && selectedModuleId) {
          localStorage.setItem('saill_last_refreshed_module_id', selectedModuleId);
        }
      } catch {
        // ignore
      }
    }
  }, [currentPage, selectedModuleId]);

  // Ensure last page is saved right before window unloads on refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      const isPublicPage =
        currentPage === 'landing' ||
        currentPage === 'login' ||
        currentPage === 'register-choice' ||
        currentPage === 'register-student' ||
        currentPage === 'register-faculty' ||
        currentPage === 'register-admin' ||
        currentPage === 'forgot-password' ||
        currentPage === 'reset-password';

      if (!isPublicPage) {
        try {
          localStorage.setItem('saill_last_refreshed_page', currentPage);
          if (currentPage === 'module-detail' && selectedModuleId) {
            localStorage.setItem('saill_last_refreshed_module_id', selectedModuleId);
          }
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentPage, selectedModuleId]);

  useEffect(() => {
    registerServiceWorker();

    const searchParams = new URLSearchParams(window.location.search);
    const pageParam = searchParams.get('page');
    const tokenParam = searchParams.get('token');

    if (pageParam === 'reset-password' || tokenParam) {
      if (tokenParam) {
        setResetToken(tokenParam);
      }
      setCurrentPage('reset-password');
    } else if (pageParam === 'forgot-password') {
      setCurrentPage('forgot-password');
    }

    return undefined;
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    const failSafeTimer = setTimeout(() => {
      if (active) setIsAppLoading(false);
    }, 2500);
    setIsAppLoading(true);
    void loadAppData().catch((error: unknown) => {
      console.warn('[App] Startup initialization caught notice:', error);
    }).finally(() => {
      clearTimeout(failSafeTimer);
      if (active) setIsAppLoading(false);
    });
    return () => {
      active = false;
      clearTimeout(failSafeTimer);
    };
  }, [authLoading, authUser?.id]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('saill_sidebar_collapsed', String(next));
      return next;
    });
  };

  const loadAppData = async () => {
    try {
      try {
        const adminStatus = await AuthService.checkAdminStatus();
        setHasCentralAdmin(adminStatus.hasAdmin);
        setIsDatabaseConnected(adminStatus.databaseConnected !== false);
        if (adminStatus.error) {
          setDatabaseErrorMessage(adminStatus.error);
        } else {
          setDatabaseErrorMessage('');
        }
      } catch (err: any) {
        console.warn('[SAILL] Central admin status check notice:', err);
        setIsDatabaseConnected(false);
        setDatabaseErrorMessage(err?.message || 'Central database unreachable');
      }

      await AcademicStructureService.syncWithIndexedDB().catch((err) => {
        console.warn('[SAILL] Academic structure sync notice:', err);
      });

      const sessionUser = authUser;

      let prof: StudentProfile | null = null;
      let prog: Record<string, ModuleProgress> = {};
      let recs: RecordingItem[] = [];
      let port: PortfolioItem[] = [];

      try {
        prof = await dbStorage.getProfile().catch(() => null);
      } catch {
        prof = null;
      }
      try {
        prog = await dbStorage.getProgressMap().catch(() => ({}));
      } catch {
        prog = {};
      }
      try {
        recs = await dbStorage.getRecordings().catch(() => []);
      } catch {
        recs = [];
      }
      try {
        port = await dbStorage.getPortfolio().catch(() => []);
      } catch {
        port = [];
      }

      if (sessionUser) {
        if (sessionUser.role === 'STUDENT') {
          const studentFromDB = sessionUser.rollNo ? await dbStorage.getProfileByRollNo(sessionUser.rollNo).catch(() => null) : null;
          if (studentFromDB) {
            prof = {
              ...DEFAULT_GUEST_PROFILE,
              ...studentFromDB,
              name: sessionUser.name || studentFromDB.name,
              rollNo: sessionUser.rollNo || studentFromDB.rollNo,
              email: sessionUser.email || studentFromDB.email || DEFAULT_GUEST_PROFILE.email
            };
          } else {
            prof = {
              ...DEFAULT_GUEST_PROFILE,
              name: sessionUser.name || 'Student',
              email: sessionUser.email || '',
              department: sessionUser.department || DEFAULT_GUEST_PROFILE.department,
              rollNo: sessionUser.rollNo || DEFAULT_GUEST_PROFILE.rollNo
            };
          }
        } else if (sessionUser.role === 'FACULTY_INCHARGE') {
          prof = {
            ...DEFAULT_GUEST_PROFILE,
            id: sessionUser.id || sessionUser.employeeId || 'faculty-user',
            name: sessionUser.name || 'Faculty Incharge',
            rollNo: '',
            department: sessionUser.department || 'Academic Affairs',
            email: sessionUser.email || '',
            targetGoal: 'Academic Instruction & Evaluation'
          };
        } else {
          prof = {
            ...DEFAULT_GUEST_PROFILE,
            id: sessionUser.id || 'admin-user',
            name: sessionUser.name || 'Institutional Administrator',
            rollNo: '',
            department: 'Institutional Administration',
            email: sessionUser.email || '',
            targetGoal: 'Institutional System Administration'
          };
        }
      } else {
        prof = prof || DEFAULT_GUEST_PROFILE;
      }

      let authoritativeProgress = prog;
      const isStudentSession = !sessionUser || sessionUser.role === 'STUDENT';
      const effectiveRoll = isStudentSession
        ? ((sessionUser && sessionUser.rollNo) || (prof && prof.rollNo) || localStorage.getItem('saill_active_roll_no') || '264G1A0501').toUpperCase()
        : null;

      if (effectiveRoll && isStudentSession) {
        try {
          const serverProgress = await StudentProgressService.getStudentProgressMap(effectiveRoll).catch(() => null);
          if (serverProgress && Object.keys(serverProgress).length > 0) {
            authoritativeProgress = { ...prog, ...serverProgress };
          }
        } catch (err) {
          console.warn('[App] Server progress fetch fallback:', err);
        }
      }

      setProfile(prof || DEFAULT_GUEST_PROFILE);
      setProgressMap(authoritativeProgress);
      setRecordings(recs);
      setPortfolioItems(port);
    } catch (globalErr) {
      console.error('[App] loadAppData global failure:', globalErr);
      setProfile(DEFAULT_GUEST_PROFILE);
    }
  };

  /**
   * Dedicated login handler:
   * "if i click on login without asking for credentials it should go to the last refreshed page"
   */
  const handleLoginClick = () => {
    const sessionUser = authUser;
    if (sessionUser) {
      const normRole = normalizeRole(sessionUser.role);
      const lastPage = localStorage.getItem('saill_last_refreshed_page') as Page | null;
      const lastModuleId = localStorage.getItem('saill_last_refreshed_module_id');

      let targetPage: Page = AuthService.getRedirectPage(normRole);
      if (lastPage && hasPageAccess(normRole, lastPage) && lastPage !== 'landing' && lastPage !== 'login') {
        targetPage = lastPage;
      }

      if (targetPage === 'module-detail' && lastModuleId) {
        setSelectedModuleId(lastModuleId);
      }

      window.history.pushState(null, '', pagePath(targetPage));
      setCurrentPage(targetPage);
      try {
        localStorage.setItem('saill_current_page', targetPage);
      } catch {
        // ignore
      }
      setIsMobileSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // If not authenticated, navigate to login page to enter credentials
    window.history.pushState(null, '', pagePath('login'));
    setCurrentPage('login');
    try {
      localStorage.removeItem('saill_current_page');
    } catch {
      // ignore
    }
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (page: Page) => {
    if (page === 'login') {
      handleLoginClick();
      return;
    }

    if (page === 'register-admin' && hasCentralAdmin === true) {
      handleLoginClick();
      return;
    }

    window.history.pushState(null, '', pagePath(page));
    setCurrentPage(page);
    try {
      if (page === 'landing' || page === 'register-admin') {
        localStorage.removeItem('saill_current_page');
      } else {
        localStorage.setItem('saill_current_page', page);
      }
    } catch {
      // ignore
    }
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenModule = (moduleId: string) => {
    if (activeRole === 'STUDENT' && profile) {
      const accessInfo = ModuleReleaseService.getModuleAccessInfo(
        profile,
        moduleId,
        progressMap[moduleId]
      );
      if (!accessInfo.isAccessible) {
        return;
      }
    }
    setSelectedModuleId(moduleId);
    window.history.pushState(null, '', pagePath('module-detail'));
    setCurrentPage('module-detail');
    try {
      localStorage.setItem('saill_last_refreshed_page', 'module-detail');
      localStorage.setItem('saill_last_refreshed_module_id', moduleId);
      localStorage.setItem('saill_current_page', 'module-detail');
    } catch {
      // ignore
    }
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Security Guard: Prevent direct navigation or refresh access to locked modules for students
  useEffect(() => {
    if (currentPage === 'module-detail' && selectedModuleId && activeRole === 'STUDENT' && profile) {
      const accessInfo = ModuleReleaseService.getModuleAccessInfo(
        profile,
        selectedModuleId,
        progressMap[selectedModuleId]
      );
      if (!accessInfo.isAccessible) {
        setCurrentPage('dashboard');
        setSelectedModuleId('pronunciation');
      }
    }
  }, [currentPage, selectedModuleId, activeRole, profile, progressMap]);

  const handleProfileUpdate = async (updatedProfile: StudentProfile) => {
    setProfile(updatedProfile);
    await loadAppData();
  };

  const handleLogout = async () => {
    await AuthService.logout();
    try {
      localStorage.removeItem('saill_last_refreshed_page');
      localStorage.removeItem('saill_last_refreshed_module_id');
      localStorage.removeItem('saill_current_page');
    } catch {
      // ignore
    }
    setActiveRole('STUDENT');
    window.history.pushState(null, '', pagePath('landing'));
    setCurrentPage('landing');
  };

  const handleProgressUpdate = async (updatedProgress: ModuleProgress) => {
    const newMap = { ...progressMap, [updatedProgress.moduleId]: updatedProgress };
    setProgressMap(newMap);

    // If active user is NOT a student (e.g., Administrator or Faculty in preview mode),
    // only save locally and do NOT attempt to sync to PostgreSQL student_module_progress.
    if (activeRole !== 'STUDENT') {
      await dbStorage.saveModuleProgress(updatedProgress).catch(() => {});
      return;
    }

    const studentRollNo = (profile && profile.rollNo) || authUser?.rollNo;
    if (!studentRollNo || studentRollNo.startsWith('ADMIN') || studentRollNo.startsWith('EMP-') || studentRollNo === 'FACULTY') {
      await dbStorage.saveModuleProgress(updatedProgress).catch(() => {});
      return;
    }

    try {
      await StudentProgressService.saveModuleProgress(studentRollNo, updatedProgress);
    } catch (err: any) {
      console.warn('[App] Failed to synchronize module progress with server:', err.message);
      await dbStorage.saveModuleProgress(updatedProgress).catch(() => {});
    }
  };

  // Scroll to section helper on Public Landing Page
  const scrollToPublicSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (isAppLoading) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] text-[#2C3E50] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#D35400] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-[#D35400]">Loading SAILL Academic System...</p>
        </div>
      </div>
    );
  }

  const selectedModule = selectedModuleId ? getModuleById(selectedModuleId) : null;
  const currentModuleProgress: ModuleProgress =
    selectedModuleId && progressMap[selectedModuleId]
      ? progressMap[selectedModuleId]
      : {
          moduleId: selectedModuleId || '',
          status: 'not_started',
          completedTabs: [],
          savedNotes: '',
          score: 0,
          reflectionNotes: '',
          lastAccessed: new Date().toISOString()
        };

  const isPublicWebsite =
    currentPage === 'landing' ||
    currentPage === 'login' ||
    currentPage === 'forgot-password' ||
    currentPage === 'reset-password' ||
    currentPage === 'register-choice' ||
    currentPage === 'register-student' ||
    currentPage === 'register-faculty' ||
    currentPage === 'register-admin' ||
    currentPage === 'pending-approval';

  // Dynamic Breadcrumb Generator
  const getBreadcrumbItems = (): BreadcrumbItem[] => {
    switch (currentPage) {
      case 'dashboard':
        return [{ label: 'Student Workspace' }];
      case 'faculty-dashboard':
        return [{ label: 'Faculty Workbench' }];
      case 'admin-control':
        return [{ label: 'Administrator Command Center' }];
      case 'modules':
        return [{ label: 'Lab Modules' }];
      case 'module-detail':
        return [
          { label: 'Lab Modules', page: 'modules' },
          { label: selectedModule ? selectedModule.title : 'Module Detail' }
        ];
      case 'ai-engine':
        return [{ label: 'AI Learning Engine' }];
      case 'practice':
        return [{ label: 'Practice Centre' }];
      case 'portfolio':
        return [{ label: 'Student Portfolio' }];
      case 'progress':
        return [{ label: 'Progress Dashboard' }];
      case 'profile':
        return [{ label: 'Student Profile' }];
      case 'settings':
        return [{ label: 'System Settings' }];
      case 'announcements':
        return [{ label: 'Notices & Announcements' }];
      case 'attendance':
        return [{ label: 'Faculty Workbench', page: 'faculty-dashboard' }, { label: 'Digital Attendance' }];
      case 'rubrics':
        return [{ label: 'Faculty Workbench', page: 'faculty-dashboard' }, { label: 'Rubric Assessment' }];
      case 'internal-marks':
        return [{ label: 'Faculty Workbench', page: 'faculty-dashboard' }, { label: 'CIA Internal Marks' }];
      case 'analytics':
        return [{ label: 'Faculty Workbench', page: 'faculty-dashboard' }, { label: 'Academic Analytics & CO-PO' }];
      case 'reports':
        return [{ label: 'Faculty Workbench', page: 'faculty-dashboard' }, { label: 'Academic Reports' }];
      case 'faculty-assistant':
        return [{ label: 'Faculty Workbench', page: 'faculty-dashboard' }, { label: 'AI Faculty Assistant' }];
      case 'system-health':
        return [{ label: 'Admin Command Center', page: 'admin-control' }, { label: 'System Health' }];
      case 'qef-framework':
        return [{ label: 'Admin Command Center', page: 'admin-control' }, { label: 'QEF Quality Framework' }];
      case 'production-certification':
        return [{ label: 'Admin Command Center', page: 'admin-control' }, { label: 'V1.0 Certification' }];
      case 'register-admin':
        return [{ label: 'Institutional Admin Registration' }];
      default:
        return [{ label: currentPage.replace('-', ' ').toUpperCase() }];
    }
  };

  return (
    <GlobalErrorBoundary onNavigateHome={() => handleNavigate('landing')}>
      <NotificationProvider activeRole={activeRole}>
        <div className="min-h-screen bg-[#FFF8F0]/40 text-[#2C3E50] flex flex-col font-sans selection:bg-[#D35400] selection:text-white">
          {/* Skip to Main Content Link for Keyboard Accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#D35400] focus:text-white focus:font-extrabold focus:rounded-xl focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
          >
            Skip to main content
          </a>

          {/* Splash Screen */}
          {showSplash && (
            <ApplicationSplashScreen
              onComplete={() => {
                try {
                  sessionStorage.setItem('saill_splash_shown', 'true');
                } catch {
                  // ignore
                }
                setShowSplash(false);
              }}
            />
          )}

          {/* Central Supabase Database Advisory Banner */}
          {isDatabaseConnected === false && (
            <div
              role="status"
              aria-live="polite"
              className="bg-amber-500 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between gap-3 shadow-xs select-none border-b border-amber-600 z-30"
            >
              <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-100 shrink-0" />
                  <span>
                    <strong>Supabase Sync:</strong> Central database sync in progress ({databaseErrorMessage || 'using client local state'}).
                  </span>
                </div>
                <div className="flex items-center gap-3 ml-auto shrink-0">
                  <button
                    onClick={() => {
                      setIsAppLoading(true);
                      loadAppData().finally(() => setIsAppLoading(false));
                    }}
                    className="underline hover:text-amber-100 whitespace-nowrap cursor-pointer text-xs font-bold"
                    title="Retry database status check"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* EXPERIENCE 1: PUBLIC WEBSITE LAYOUT                 */}
          {/* ==================================================== */}
          {isPublicWebsite ? (
            <>
              {/* Public Website Header Navbar */}
              <PublicNavbar
                onLoginClick={handleLoginClick}
                onRegisterClick={() => handleNavigate('register-choice')}
                onScrollToSection={(sectionId) => {
                  if (currentPage !== 'landing') {
                    handleNavigate('landing');
                    setTimeout(() => scrollToPublicSection(sectionId), 100);
                  } else {
                    scrollToPublicSection(sectionId);
                  }
                }}
              />

              {/* Public Main Canvas */}
              <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 focus:outline-none">
                <Suspense fallback={<PageFallback />}>
                  {currentPage === 'landing' && (
                    <LandingPage
                      profile={profile}
                      onNavigate={handleNavigate}
                      onOpenModule={handleOpenModule}
                    />
                  )}
                  {currentPage === 'login' && (
                    <LoginPage
                      onNavigate={handleNavigate}
                      onProfileUpdate={handleProfileUpdate}
                      onLoginSuccess={(role) => {
                        if (role) setActiveRole(normalizeRole(role));
                        loadAppData();
                      }}
                    />
                  )}
                  {currentPage === 'forgot-password' && (
                    <ForgotPasswordPage
                      onNavigate={handleNavigate}
                      onSelectTokenForReset={(tok) => {
                        setResetToken(tok);
                        handleNavigate('reset-password');
                      }}
                    />
                  )}
                  {currentPage === 'reset-password' && (
                    <ResetPasswordPage
                      token={resetToken}
                      onNavigate={handleNavigate}
                    />
                  )}
                  {currentPage === 'register-choice' && (
                    <RegisterChoicePage onNavigate={handleNavigate} />
                  )}
                  {currentPage === 'register-student' && (
                    <StudentRegisterPage
                      onNavigate={handleNavigate}
                      onProfileUpdate={handleProfileUpdate}
                    />
                  )}
                  {currentPage === 'register-faculty' && (
                    <FacultyRegisterPage onNavigate={handleNavigate} />
                  )}
                  {currentPage === 'register-admin' && (
                    hasCentralAdmin === true ? (
                      <LoginPage
                        onNavigate={handleNavigate}
                        onProfileUpdate={handleProfileUpdate}
                        onLoginSuccess={(role) => {
                          if (role) setActiveRole(normalizeRole(role));
                          loadAppData();
                        }}
                      />
                    ) : (
                      <AdminRegistrationPage onNavigate={handleNavigate} />
                    )
                  )}
                  {currentPage === 'pending-approval' && (
                    <PendingApprovalPage onNavigate={handleNavigate} onLogout={handleLogout} />
                  )}
                </Suspense>
              </main>

              {/* Institutional Public Footer */}
              <Footer onNavigate={handleNavigate} />
            </>
          ) : (
            /* ==================================================== */
            /* EXPERIENCE 2: AUTHENTICATED LEARNING PORTAL LAYOUT  */
            /* ==================================================== */
            <>
              {/* Internal Portal Top Navbar */}
              <Navbar
                currentPage={currentPage}
                onNavigate={handleNavigate}
                profile={profile}
                activeRole={activeRole}
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebar={toggleSidebar}
                onOpenHelp={() => setIsHelpOpen(true)}
                onLogout={handleLogout}
              />

              {/* Desktop Smart Sidebar */}
              <div className="hidden lg:block">
                <Sidebar
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                  activeRole={activeRole}
                  isCollapsed={isSidebarCollapsed}
                  onToggleCollapse={toggleSidebar}
                  onOpenHelp={() => setIsHelpOpen(true)}
                  onLogout={handleLogout}
                />
              </div>

              {/* Mobile Slide-Over Drawer Overlay */}
              {isMobileSidebarOpen && (
                <div className="lg:hidden fixed inset-0 z-50 flex">
                  <div
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                  />
                  <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#2C3E50]">
                    <Sidebar
                      currentPage={currentPage}
                      onNavigate={handleNavigate}
                      activeRole={activeRole}
                      isCollapsed={false}
                      onToggleCollapse={() => setIsMobileSidebarOpen(false)}
                      onOpenHelp={() => {
                        setIsMobileSidebarOpen(false);
                        setIsHelpOpen(true);
                      }}
                      onLogout={handleLogout}
                      onMobileClose={() => setIsMobileSidebarOpen(false)}
                    />
                  </div>
                </div>
              )}

              {/* Help & Support Modal */}
              <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

              {/* Portal Content Container with Margin Offset */}
              <div
                className={`flex-1 flex flex-col pt-16 transition-all duration-300 ${
                  isSidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[280px]'
                }`}
              >
                {/* Offline Indicator */}
                {isOffline && <OfflineIndicator />}

                {/* PWA Install Banner */}
                {isInstallable && !bannerDismissed && (
                  <PWAInstallBanner
                    onInstall={() => triggerInstall()}
                    onDismiss={() => setBannerDismissed(true)}
                  />
                )}

                {/* Top Breadcrumb Navigation */}
                <div className="no-print bg-white/80 border-b border-[#FAD7A0]/60 px-4 sm:px-6 lg:px-8 py-2.5 backdrop-blur-xs">
                  <Breadcrumb items={getBreadcrumbItems()} onNavigate={handleNavigate} />
                </div>

                {/* Portal Main Content Area Protected by RBAC */}
                <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-12 focus:outline-none">
                  <ProtectedRoute
                    page={currentPage}
                    onReturnToDashboard={handleNavigate}
                  >
                    <Suspense fallback={<PageFallback />}>
                      {currentPage === 'dashboard' && (
                        <StudentDashboardPage
                          profile={profile}
                          progressMap={progressMap}
                          recordings={recordings}
                          portfolioItems={portfolioItems}
                          onNavigate={handleNavigate}
                          onOpenModule={handleOpenModule}
                        />
                      )}

                      {currentPage === 'modules' && (
                        <LaboratoryModulesPage
                          profile={profile}
                          progressMap={progressMap}
                          onOpenModule={handleOpenModule}
                          activeRole={activeRole}
                        />
                      )}

                      {currentPage === 'ai-engine' && (
                        <AILearningEnginePage
                          profile={profile}
                          onNavigatePage={handleNavigate}
                          onPortfolioSaved={() => loadAppData()}
                        />
                      )}

                      {currentPage === 'module-detail' && selectedModule && (
                        <ModuleDetailPage
                          module={selectedModule}
                          progress={currentModuleProgress}
                          studentRollNo={activeRole === 'STUDENT' ? profile?.rollNo : undefined}
                          onBack={() => handleNavigate('modules')}
                          onProgressUpdate={handleProgressUpdate}
                        />
                      )}

                      {currentPage === 'practice' && <PracticeCenterPage />}

                      {currentPage === 'portfolio' && <PortfolioPage profile={profile} />}

                      {currentPage === 'progress' && (
                        <ProgressDashboardPage profile={profile} progressMap={progressMap} />
                      )}

                      {currentPage === 'profile' && (
                        <StudentProfilePage profile={profile} onProfileUpdate={setProfile} />
                      )}

                      {currentPage === 'settings' && (
                        <SettingsPage
                          isInstallable={isInstallable}
                          isInstalled={isInstalled}
                          onInstall={() => triggerInstall()}
                          onResetData={loadAppData}
                        />
                      )}

                      {/* Phase 4 Academic Management Views */}
                      {currentPage === 'faculty-dashboard' && (
                        <FacultyDashboardPage
                          profile={profile}
                          portfolioItems={portfolioItems}
                          onNavigatePage={handleNavigate}
                          activeRole={activeRole}
                          onOpenModule={handleOpenModule}
                        />
                      )}

                      {currentPage === 'attendance' && <DigitalAttendancePage />}

                      {currentPage === 'rubrics' && <RubricAssessmentPage />}

                      {currentPage === 'internal-marks' && <InternalMarkCalculatorPage />}

                      {currentPage === 'analytics' && <AcademicAnalyticsPage />}

                      {currentPage === 'portfolio-review' && <FacultyPortfolioReviewPage />}

                      {currentPage === 'reports' && <AcademicReportsPage />}

                      {currentPage === 'faculty-assistant' && <AIFacultyAssistantPage />}

                      {currentPage === 'announcements' && (
                        <AnnouncementsPage onNavigatePage={handleNavigate} activeRole={activeRole} />
                      )}

                      {currentPage === 'admin-control' && (
                        <AdminControlPage onOpenModule={handleOpenModule} />
                      )}

                      {currentPage === 'system-health' && <SystemHealthPage />}

                      {currentPage === 'qef-framework' && <QEFFrameworkPage />}

                      {currentPage === 'production-certification' && <ProductionCertificationPage />}
                    </Suspense>
                  </ProtectedRoute>
                </main>

                {/* Portal Footer */}
                <Footer onNavigate={handleNavigate} />
              </div>

              {/* Mobile Bottom Navigation Bar */}
              <div className="no-print">
                <MobileNav currentPage={currentPage} onNavigate={handleNavigate} activeRole={activeRole} />
              </div>

              {/* Administrator Quick Review Floating Button */}
              <QuickReviewButton />
            </>
          )}
        </div>
      </NotificationProvider>
    </GlobalErrorBoundary>
  );
}
