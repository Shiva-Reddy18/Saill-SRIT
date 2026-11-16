import React, { useState, useEffect } from 'react';
import { StudentProfile, PortfolioItem, UserRole } from '../../types';
import { FacultyAssignment } from '../../types/academic';
import { FacultyWorkbenchTabKey } from '../../types/faculty';
import { dbStorage } from '../../lib/db';
import { AuthService } from '../../services/AuthService';
import { FacultyAssignmentService } from '../../services/FacultyAssignmentService';
import { FacultyPermissionGuard } from '../../services/FacultyPermissionGuard';

import { FacultyHomeTab } from './FacultyHomeTab';
import { FacultyClassesTab } from './FacultyClassesTab';
import { FacultyStudentsTab } from './FacultyStudentsTab';
import { FacultyStudentProfileModal } from './FacultyStudentProfileModal';
import { FacultyModulesTab } from './FacultyModulesTab';
import { FacultyReleaseModulesTab } from './FacultyReleaseModulesTab';
import { FacultyAssignmentsTab } from './FacultyAssignmentsTab';
import { FacultyProgressMonitorTab } from './FacultyProgressMonitorTab';
import { FacultyAIInsightsTab } from './FacultyAIInsightsTab';
import { FacultyAssessmentsTab } from './FacultyAssessmentsTab';
import { FacultyStudentPortfolioTab } from './FacultyStudentPortfolioTab';
import { FacultyReportsTab } from './FacultyReportsTab';
import { FacultySettingsTab } from './FacultySettingsTab';
import { FacultyModuleEvaluationTab } from './FacultyModuleEvaluationTab';
import {
  ShieldAlert,
  Home,
  GraduationCap,
  Users,
  BarChart3,
  Award,
  BookOpen,
  FileCheck,
  FileSpreadsheet,
  Settings
} from 'lucide-react';
// import { error } from 'console';

interface FacultyWorkbenchProps {
  portfolioItems: PortfolioItem[];
  onOpenModule: (moduleId: string) => void;
  activeRole?: UserRole;
}

export const FacultyWorkbench: React.FC<FacultyWorkbenchProps> = ({
  portfolioItems,
  onOpenModule,
  activeRole = 'FACULTY_INCHARGE'
}) => {
  const currentUser = AuthService.getCurrentUser();
  const currentEmpId = currentUser?.employeeId || currentUser?.username || 'EMP-ENG-101';
  const facultyName = currentUser?.name || 'Dr. V. Lakshmi';
  const department = currentUser?.department || 'Humanities & Sciences (English)';

  const [activeTab, setActiveTab] = useState<FacultyWorkbenchTabKey>('home');
  const [assignedStudents, setAssignedStudents] = useState<StudentProfile[]>([]);
  const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
  const [activeAssignments, setActiveAssignments] = useState<FacultyAssignment[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [accountStatus, setAccountStatus] = useState<
    'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'SUSPENDED'
  >('APPROVED');

  useEffect(() => {
    loadFacultyScopeData();
  }, [currentEmpId, activeRole]);

  const loadFacultyScopeData = async () => {
    try {
      // Check status from registered users / faculty account table
      const registeredUser = await dbStorage.getUserRegistration(currentEmpId);
      const facultyAccount = await dbStorage.getFacultyByEmployeeId(currentEmpId);

      if (registeredUser) {
        if (registeredUser.status === 'PENDING_APPROVAL') {
          setAccountStatus('PENDING_APPROVAL');
        } else if (registeredUser.status === 'REJECTED') {
          setAccountStatus('REJECTED');
        } else {
          setAccountStatus('APPROVED');
        }
      } else if (facultyAccount) {
        if (facultyAccount.status === 'pending') {
          setAccountStatus('PENDING_APPROVAL');
        } else if (facultyAccount.status === 'rejected') {
          setAccountStatus('REJECTED');
        } else {
          setAccountStatus('APPROVED');
        }
      } else {
        setAccountStatus('APPROVED');
      }

      const fetchedStudents = await dbStorage.getAllProfiles();
      setAllStudents(fetchedStudents);

      const allBatches = await dbStorage.getAllBatches();

      // Load persisted faculty assignments before using the synchronous cache getters.
      await FacultyAssignmentService.initFromDB();

      const isAdministrator =
        activeRole.toString().toUpperCase() === 'ADMINISTRATOR' ||
        currentUser?.role?.toUpperCase() === 'ADMINISTRATOR';

      if (isAdministrator) {
        const allAssigns = FacultyAssignmentService.getAllAssignments();
        setActiveAssignments(allAssigns);
        setAssignedStudents(fetchedStudents);
      } else {
        await FacultyAssignmentService.syncScope(
          currentEmpId,
          facultyName,
          department,
          allBatches,
          fetchedStudents
        );

        const myAssigns = FacultyAssignmentService.getAssignmentsForFaculty(currentEmpId);
        setActiveAssignments(myAssigns);

        const mapped = FacultyAssignmentService.getAssignedStudentsForFaculty(
          currentEmpId,
          fetchedStudents
        );
        setAssignedStudents(mapped);
      }
    } catch {
      
  console.error('[FacultyWorkbench] Failed to load faculty scope:');
    }
  };

  const handleSelectStudent = (student: StudentProfile) => {
    setSelectedStudent(student);
  };

  // Permission Verification Guard
  if (!FacultyPermissionGuard.isFacultyOrAdmin(activeRole)) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-rose-300 shadow-lg text-center space-y-4 max-w-lg mx-auto my-12">
        <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto" />
        <h2 className="text-xl font-bold text-[#2C3E50]">Access Restricted</h2>
        <p className="text-xs text-gray-600">
          Faculty Workspace is accessible exclusively to Faculty Incharges and Administrators.
        </p>
      </div>
    );
  }

  const facultyTabs: { key: FacultyWorkbenchTabKey; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'home', label: 'Overview', icon: Home },
    { key: 'classes', label: 'My Classes', icon: GraduationCap },
    { key: 'students', label: 'My Students', icon: Users, badge: assignedStudents.length },
    { key: 'progress-monitor', label: 'Module Progress', icon: BarChart3 },
    { key: 'module-scoring', label: 'Module Scoring', icon: Award },
    { key: 'release-modules', label: 'Release Modules', icon: BookOpen },
    { key: 'assessments', label: 'AI Audio Reviews', icon: FileCheck },
    { key: 'reports', label: 'Reports', icon: FileSpreadsheet },
    { key: 'settings', label: 'Profile & Settings', icon: Settings }
  ];

  return (
    <div className="space-y-6 pb-12 text-[#2C3E50]">
      {/* Faculty Identity & Operational Header Banner */}
      <div className="bg-gradient-to-r from-[#2C3E50] via-[#34495E] to-[#1F2C38] text-white p-6 rounded-2xl border-2 border-[#FAD7A0]/30 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#D35400] text-white flex items-center justify-center font-bold text-xl font-serif shadow-md shrink-0 border border-[#FAD7A0]/40">
            {facultyName.charAt(0)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold font-serif text-[#FAD7A0] tracking-wide">{facultyName}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                {accountStatus}
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-0.5">
              Emp ID: <span className="font-mono text-white font-semibold">{currentEmpId}</span> • Dept:{' '}
              <span className="text-white font-medium">{department}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white/10 rounded-xl border border-white/10 text-center">
            <span className="block text-[10px] text-gray-300 uppercase tracking-wider font-semibold">Assigned Students</span>
            <span className="text-lg font-black text-[#FAD7A0]">{assignedStudents.length}</span>
          </div>
          <div className="px-4 py-2 bg-white/10 rounded-xl border border-white/10 text-center">
            <span className="block text-[10px] text-gray-300 uppercase tracking-wider font-semibold">Class Batches</span>
            <span className="text-lg font-black text-[#FAD7A0]">{activeAssignments.length}</span>
          </div>
        </div>
      </div>

      {/* Horizontal Tab Navigation Bar (Single Panel Layout) */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-2 border border-[#FAD7A0] shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          {facultyTabs.map((tab) => {
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
                      isActive ? 'bg-white text-[#D35400]' : 'bg-[#D35400]/20 text-[#D35400]'
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

      {/* Main Tab Content Area */}
      <div className="w-full min-w-0">
        {activeTab === 'home' && (
          <FacultyHomeTab
            assignments={activeAssignments}
            assignedStudents={assignedStudents}
            facultyName={facultyName}
            accountStatus={accountStatus}
            onSelectTab={setActiveTab}
            onSelectStudent={handleSelectStudent}
          />
        )}

        {activeTab === 'classes' && (
          <FacultyClassesTab
            assignments={activeAssignments}
            assignedStudents={assignedStudents}
            facultyName={facultyName}
            onSelectStudent={handleSelectStudent}
            onSelectTab={setActiveTab}
          />
        )}

        {activeTab === 'students' && (
          <FacultyStudentsTab
            assignedStudents={assignedStudents}
            onSelectStudent={handleSelectStudent}
          />
        )}

        {activeTab === 'release-modules' && (
          <FacultyReleaseModulesTab
            assignments={activeAssignments}
            assignedStudents={assignedStudents}
            onOpenModule={onOpenModule}
          />
        )}

        {activeTab === 'modules' && (
          <FacultyModulesTab
            assignedStudents={assignedStudents}
            onOpenModule={onOpenModule}
          />
        )}

        {activeTab === 'assignments' && (
          <FacultyAssignmentsTab
            assignments={activeAssignments}
            allStudents={allStudents}
          />
        )}

        {activeTab === 'progress-monitor' && (
          <FacultyProgressMonitorTab
            assignedStudents={assignedStudents}
            onSelectStudent={handleSelectStudent}
          />
        )}

        {activeTab === 'module-scoring' && (
          <FacultyModuleEvaluationTab
            assignedStudents={assignedStudents}
            facultyId={currentEmpId}
            facultyName={facultyName}
            facultyDepartment={department}
            onSelectStudent={handleSelectStudent}
          />
        )}

        {activeTab === 'ai-insights' && <FacultyAIInsightsTab />}

        {activeTab === 'assessments' && (
          <FacultyAssessmentsTab
            assignedStudents={assignedStudents}
            onSelectStudent={handleSelectStudent}
          />
        )}

        {activeTab === 'portfolio' && (
          <FacultyStudentPortfolioTab assignedStudents={assignedStudents} />
        )}

        {activeTab === 'reports' && (
          <FacultyReportsTab
            assignedStudents={assignedStudents}
            facultyName={facultyName}
            department={department}
          />
        )}

        {activeTab === 'settings' && (
          <FacultySettingsTab
            facultyName={facultyName}
            employeeId={currentEmpId}
            department={department}
          />
        )}
      </div>

      {/* Student Profile Modal */}
      {selectedStudent && (
        <FacultyStudentProfileModal
          student={selectedStudent}
          facultyId={currentEmpId}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
};
