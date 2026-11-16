import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Bell,
  LayoutDashboard,
  Users,
  Building2,
  BookOpen,
  UserCheck,
  GraduationCap,
  Award,
  BarChart3,
  Bot,
  Clock,
  Terminal,
  Settings
} from 'lucide-react';
import { FacultyAccount, StudentProfile } from '../types';
import { FacultyAssignment } from '../types/academic';
import { dbStorage } from '../lib/db';
import { FacultyAssignmentService } from '../services/FacultyAssignmentService';

// Views & Tab Key Type
import { AdminTabKey } from '../components/admin/AdminSidebar';
import { AdminDashboardTab } from '../components/admin/AdminDashboardTab';
import { AdminEvaluationMonitoringTab } from '../components/admin/AdminEvaluationMonitoringTab';
import { UserManagementTab } from '../components/admin/UserManagementTab';
import { AcademicManagerTab } from '../components/admin/AcademicManagerTab';
import { ModuleManagementTab } from '../components/admin/ModuleManagementTab';
import { FacultyCardsTab } from '../components/admin/FacultyCardsTab';
import { StudentCardsTab } from '../components/admin/StudentCardsTab';
import { AIMonitoringTab } from '../components/admin/AIMonitoringTab';
import { ReportsAnalyticsTab } from '../components/admin/ReportsAnalyticsTab';
import { AdminSettingsTab } from '../components/admin/AdminSettingsTab';
import { ActivityLogsTab } from '../components/admin/ActivityLogsTab';
import { DeveloperConsoleTab } from '../components/admin/DeveloperConsoleTab';

interface AdminControlPageProps {
  onOpenModule?: (moduleId: string) => void;
}

export const AdminControlPage: React.FC<AdminControlPageProps> = ({ onOpenModule }) => {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('dashboard');

  const [pendingRegistrations, setPendingRegistrations] = useState<FacultyAccount[]>([]);
  const [pendingStudents, setPendingStudents] = useState<StudentProfile[]>([]);
  const [allFaculty, setAllFaculty] = useState<FacultyAccount[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [assignments, setAssignments] = useState<FacultyAssignment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    if (loadPromiseRef.current) return loadPromiseRef.current;

    setIsLoading(true);
    setLoadError(null);

    const request = Promise.all([
      dbStorage.getAllFaculty(),
      dbStorage.getAllProfiles(),
      FacultyAssignmentService.initFromDB()
    ])
      .then(([facs, stus, asgs]) => {
        setPendingRegistrations(
          facs.filter((faculty) => String(faculty?.status || '').toLowerCase() === 'pending')
        );
        setPendingStudents(
          stus.filter((student) => {
            const status = String(student?.status || '').toUpperCase();
            return status === 'PENDING_APPROVAL' || status === 'PENDING';
          })
        );
        setAllFaculty(facs);
        setStudents(stus);
        setAssignments(asgs);
      })
      .catch((error: unknown) => {
        const detail = error as { code?: string; name?: string; message?: string };
        console.error('[SYNC] Administrator dashboard data load failed', {
          name: detail?.name || 'UnknownError',
          code: detail?.code
        });
        const message = String(detail?.message || '').toLowerCase();
        if (detail?.name === 'TimeoutError' || detail?.name === 'AbortError' || message.includes('timeout')) {
          setLoadError('A Supabase request timed out. Check connectivity and retry.');
        } else if (detail?.code === '42501' || message.includes('permission') || message.includes('row-level security')) {
          setLoadError('Supabase denied access to administrator data. Check the role-aware RLS policies and retry.');
        } else {
          setLoadError('Administrator data could not be loaded. Check Supabase connectivity and permissions, then retry.');
        }
      })
      .finally(() => {
        setIsLoading(false);
        loadPromiseRef.current = null;
      });

    loadPromiseRef.current = request;
    return request;
  };

  const handleApproveFacultyFromDash = async (empId: string) => {
    try {
      await dbStorage.approveFacultyAccount(empId, 'Administrator');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to approve account.');
    }
  };

  const handleRejectFacultyFromDash = async (empId: string) => {
    const reason = prompt(
      `Enter rejection reason for employee ID ${empId}:`,
      'Registration details could not be verified'
    );
    if (!reason) return;
    try {
      await dbStorage.rejectFacultyAccount(empId, reason, 'Administrator');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reject account.');
    }
  };

  const handleResetFacultyPassword = async (empId: string, name: string) => {
    const newPass = prompt(`Enter new password for Faculty ${name} (${empId}):`, 'SritFaculty#2026');
    if (!newPass) return;
    try {
      await dbStorage.resetFacultyPassword(empId, newPass, 'Administrator');
      alert(`Password for ${name} successfully reset.`);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reset password.');
    }
  };

  const handleToggleFacultyStatus = async (empId: string) => {
    try {
      await dbStorage.toggleFacultyStatus(empId, 'Administrator');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle status.');
    }
  };

  const handleResetStudentPassword = async (rollNo: string, name: string) => {
    const newPass = prompt(`Enter new password for Student ${name} (${rollNo}):`, 'SritStudent#2026');
    if (!newPass) return;
    try {
      await dbStorage.resetStudentPassword(rollNo, newPass, 'Administrator');
      alert(`Password for student ${name} (${rollNo}) reset successfully.`);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reset student password.');
    }
  };

  const handleDeleteStudent = async (rollNo: string, name: string) => {
    if (!confirm(`Are you sure you want to delete student profile ${name} (${rollNo})?`)) return;
    try {
      await dbStorage.deleteStudentProfile(rollNo);
      alert(`Student profile ${name} deleted.`);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete student profile.');
    }
  };

  const adminTabs: { key: AdminTabKey; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { key: 'users', label: 'Approvals', icon: Users, badge: pendingRegistrations.length + pendingStudents.length },
    { key: 'academic', label: 'Programs & Setup', icon: Building2 },
    { key: 'faculty', label: 'Faculty & Scope', icon: UserCheck },
    { key: 'students', label: 'Student Roster', icon: GraduationCap },
    { key: 'modules', label: 'Lab Modules', icon: BookOpen },
    { key: 'monitoring', label: 'Evaluation Monitoring', icon: Award },
    { key: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { key: 'ai-monitoring', label: 'AI Voice Logs', icon: Bot },
    { key: 'activity-logs', label: 'Audit Logs', icon: Clock },
    { key: 'developer-console', label: 'Dev Console', icon: Terminal },
    { key: 'settings', label: 'Platform Settings', icon: Settings }
  ];

  return (
    <div className="space-y-6 text-[#2C3E50]">
      {/* Command Center Top Header Banner */}
      <div className="p-6 bg-gradient-to-r from-[#2C3E50] via-[#34495E] to-[#1F2C38] text-white rounded-2xl border-2 border-[#FAD7A0]/30 shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#D35400] text-white rounded-full text-[10px] font-black uppercase tracking-wider shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-[#FAD7A0]" />
              <span>SRIT Administrator Command Center</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight font-serif text-[#FAD7A0]">
              Academic Governance & Lab Operations Portal
            </h1>
            <p className="text-xs text-gray-200">
              SRIT Department of English & Humanities • R26 Communicative English Laboratory
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 border border-white/20 cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FAD7A0] ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Tab Navigation Bar (Single Panel Layout) */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-2 border border-[#FAD7A0] shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          {adminTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#D35400] text-white shadow-md'
                    : 'text-[#2C3E50] hover:bg-[#FFF8F0] hover:text-[#D35400]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#D35400]'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      isActive ? 'bg-white text-[#D35400]' : 'bg-red-500 text-white'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ACTIVE TAB VIEW RENDERER */}
        <div className="transition-all duration-300">
          {activeTab === 'dashboard' && (
            <AdminDashboardTab
              studentsCount={students.length}
              facultyCount={allFaculty.length}
              assignmentsCount={assignments.length}
              isLoading={isLoading}
              loadError={loadError}
              pendingRegistrations={pendingRegistrations}
              pendingStudentsCount={pendingStudents.length}
              pendingStudents={pendingStudents}
              students={students}
              allFaculty={allFaculty}
              assignments={assignments}
              onNavigateTab={setActiveTab}
              onApproveFaculty={handleApproveFacultyFromDash}
              onRejectFaculty={handleRejectFacultyFromDash}
              onRefreshData={loadData}
            />
          )}

          {activeTab === 'monitoring' && (
            <AdminEvaluationMonitoringTab
              students={students}
              allFaculty={allFaculty}
              assignments={assignments}
              onRefreshData={loadData}
            />
          )}

          {activeTab === 'users' && (
            <UserManagementTab
              pendingRegistrations={pendingRegistrations}
              allFaculty={allFaculty}
              students={students}
              pendingStudents={pendingStudents}
              onRefreshData={loadData}
            />
          )}

          {activeTab === 'academic' && <AcademicManagerTab />}

          {activeTab === 'modules' && <ModuleManagementTab onOpenModule={onOpenModule} />}

          {activeTab === 'faculty' && (
            <FacultyCardsTab
              facultyList={allFaculty}
              studentsList={students}
              assignmentsList={assignments}
              onOpenAssignModal={() => setActiveTab('academic')}
              onResetPassword={handleResetFacultyPassword}
              onToggleStatus={handleToggleFacultyStatus}
              onRefreshData={loadData}
            />
          )}

          {activeTab === 'students' && (
            <StudentCardsTab
              studentsList={students}
              facultyList={allFaculty}
              assignmentsList={assignments}
              onResetPassword={handleResetStudentPassword}
              onDeleteStudent={handleDeleteStudent}
              onRefreshData={loadData}
            />
          )}

          {activeTab === 'ai-monitoring' && <AIMonitoringTab />}

          {activeTab === 'reports' && <ReportsAnalyticsTab />}

          {activeTab === 'settings' && <AdminSettingsTab />}

          {activeTab === 'activity-logs' && <ActivityLogsTab />}

          {activeTab === 'developer-console' && <DeveloperConsoleTab />}
        </div>
    </div>
  );
};
