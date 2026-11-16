import React, { useState, useEffect } from 'react';
import { StudentProfile } from '../../types';
import { FacultyModuleService } from '../../services/FacultyModuleService';
import { ModuleReleaseService } from '../../services/ModuleReleaseService';
import {
  BookOpen,
  Award,
  Users,
  AlertCircle,
  Eye,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';

interface FacultyModulesTabProps {
  assignedStudents: StudentProfile[];
  onOpenModule: (moduleId: string) => void;
}

export const FacultyModulesTab: React.FC<FacultyModulesTabProps> = ({
  assignedStudents,
  onOpenModule
}) => {
  const modules = FacultyModuleService.getPublishedModules();
  const [adminReleasedIds, setAdminReleasedIds] = useState<string[]>(() =>
    ModuleReleaseService.getAdminReleasedModuleIdsSync()
  );

  useEffect(() => {
    let isMounted = true;
    ModuleReleaseService.syncWithIndexedDB().then(() => {
      if (isMounted) {
        setAdminReleasedIds(ModuleReleaseService.getAdminReleasedModuleIdsSync());
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6 text-[#2C3E50]">
      {/* Title Header */}
      <div className="bg-white p-5 rounded-2xl border border-[#FAD7A0]/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-[11px] font-bold mb-1">
            <BookOpen className="w-3.5 h-3.5" />
            <span>SAILL R26 Curriculum Matrix</span>
          </div>
          <h2 className="text-xl font-extrabold font-serif text-[#2C3E50]">Published Laboratory Modules</h2>
          <p className="text-xs text-gray-500">
            Analytics & Student Completion Rates across {assignedStudents.length} Assigned Students
          </p>
        </div>
        <div className="px-3.5 py-1.5 bg-[#FFF8F0] border border-[#FAD7A0] rounded-xl text-xs font-bold text-[#D35400] flex items-center gap-1.5">
          <Lock className="w-4 h-4 text-[#D35400]" />
          <span>Admin-Controlled Release Pipeline</span>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {modules.map((mod, idx) => {
          const stats = FacultyModuleService.getModuleStatsForFaculty(mod, assignedStudents, idx + 1);
          const isAdminReleased = adminReleasedIds.includes(mod.id);

          return (
            <div
              key={mod.id}
              className={`bg-white p-6 rounded-2xl border shadow-xs transition-all space-y-4 flex flex-col justify-between ${
                isAdminReleased
                  ? 'border-[#FAD7A0]/70 hover:border-[#D35400] hover:shadow-md'
                  : 'border-gray-200 bg-gray-50/40 opacity-90'
              }`}
            >
              <div className="space-y-3">
                {/* Module Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-[#2C3E50] text-[#FAD7A0] font-mono text-[10px] font-bold rounded-md">
                        Module {idx + 1} ({mod.code})
                      </span>
                      {isAdminReleased ? (
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md text-[10px] font-bold flex items-center gap-1">
                          <Unlock className="w-3 h-3 text-emerald-600" />
                          <span>Released by Admin</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[10px] font-bold flex items-center gap-1">
                          <Lock className="w-3 h-3 text-amber-700" />
                          <span>Locked by Admin</span>
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-base text-[#2C3E50] font-serif">{mod.title}</h3>
                  </div>

                  {isAdminReleased ? (
                    <button
                      onClick={() => onOpenModule(mod.id)}
                      className="px-3.5 py-2 bg-[#D35400] hover:bg-[#E67E22] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Module</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="px-3.5 py-2 bg-gray-100 text-gray-400 font-bold text-xs rounded-xl border border-gray-200 flex items-center gap-1.5 cursor-not-allowed shrink-0"
                      title="Waiting for Administrator release"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Locked by Admin</span>
                    </button>
                  )}
                </div>

                <p className="text-xs text-gray-600 line-clamp-2">{mod.shortDesc}</p>

                {/* Performance Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="p-2.5 bg-[#FFF8F0] border border-[#FAD7A0]/60 rounded-xl text-center">
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Completion</p>
                    <p className="text-base font-extrabold text-[#D35400]">{stats.completionPercentage}%</p>
                  </div>
                  <div className="p-2.5 bg-[#FFF8F0] border border-[#FAD7A0]/60 rounded-xl text-center">
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Avg Score</p>
                    <p className="text-base font-extrabold text-[#2C3E50]">{stats.averageScore}%</p>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase">Completed</p>
                    <p className="text-base font-extrabold text-emerald-800">{stats.studentsCompletedCount}</p>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-center">
                    <p className="text-[10px] font-bold text-amber-700 uppercase">Pending</p>
                    <p className="text-base font-extrabold text-amber-800">{stats.studentsPendingCount}</p>
                  </div>
                </div>

                {/* Common Weak Areas (Placeholder) */}
                <div className="p-3 bg-rose-50/60 border border-rose-200/80 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>Most Common Student Weak Areas</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-gray-700 space-y-0.5">
                    {stats.commonWeakAreas.map((area, idx) => (
                      <li key={idx}>{area}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Read Only Footer Badge */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                <span>R26 Curriculum Standard</span>
                <span className="font-semibold text-gray-500 italic">Content Locked for Editing</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
