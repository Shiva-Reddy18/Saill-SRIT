import React from 'react';
import { Page, UserRole } from '../../types';
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  PenTool,
  FolderCheck,
  BarChart3,
  Megaphone,
  User,
  Settings,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  ClipboardList,
  Calculator,
  TrendingUp,
  FileSpreadsheet,
  ShieldCheck,
  GraduationCap,
  Award,
  CheckCircle2
} from 'lucide-react';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  activeRole: UserRole;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
  onMobileClose?: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  page?: Page;
  action?: () => void;
  isCustomAction?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  activeRole,
  isCollapsed,
  onToggleCollapse,
  onOpenHelp,
  onLogout,
  onMobileClose
}) => {
  const roleUpper = (activeRole || 'STUDENT').toString().toUpperCase();
  const isFacultyIncharge = roleUpper === 'FACULTY_INCHARGE' || roleUpper === 'FACULTY';
  const isAdmin = roleUpper === 'ADMINISTRATOR';

  // Role-tailored single navigation menu items
  const getMenuItems = (): MenuItem[] => {
    if (isAdmin) {
      return [
        {
          id: 'admin-control',
          label: 'Command Center',
          icon: ShieldCheck,
          page: 'admin-control'
        },
        {
          id: 'faculty-dashboard',
          label: 'Faculty Workbench',
          icon: LayoutDashboard,
          page: 'faculty-dashboard'
        },
        {
          id: 'modules',
          label: 'Lab Curriculum',
          icon: BookOpen,
          page: 'modules'
        },
        {
          id: 'system-health',
          label: 'System Health',
          icon: BarChart3,
          page: 'system-health'
        },
        {
          id: 'qef-framework',
          label: 'QEF Quality Framework',
          icon: Award,
          page: 'qef-framework'
        },
        {
          id: 'production-certification',
          label: 'V1.0 Certification',
          icon: CheckCircle2,
          page: 'production-certification'
        },
        {
          id: 'notices',
          label: 'Notices & Bulletins',
          icon: Megaphone,
          page: 'announcements'
        },
        {
          id: 'settings',
          label: 'Platform Settings',
          icon: Settings,
          page: 'settings'
        }
      ];
    }

    if (isFacultyIncharge) {
      return [
        {
          id: 'faculty-dashboard',
          label: 'Faculty Workbench',
          icon: LayoutDashboard,
          page: 'faculty-dashboard'
        },
        {
          id: 'attendance',
          label: 'Digital Attendance',
          icon: UserCheck,
          page: 'attendance'
        },
        {
          id: 'rubrics',
          label: 'Rubric Assessment',
          icon: ClipboardList,
          page: 'rubrics'
        },
        {
          id: 'internal-marks',
          label: 'CIA Internal Marks',
          icon: Calculator,
          page: 'internal-marks'
        },
        {
          id: 'analytics',
          label: 'Analytics & CO-PO',
          icon: TrendingUp,
          page: 'analytics'
        },
        {
          id: 'portfolio-review',
          label: 'Student Portfolios',
          icon: FolderCheck,
          page: 'portfolio-review'
        },
        {
          id: 'reports',
          label: 'Academic Reports',
          icon: FileSpreadsheet,
          page: 'reports'
        },
        {
          id: 'faculty-assistant',
          label: 'AI Faculty Assistant',
          icon: Sparkles,
          page: 'faculty-assistant'
        },
        {
          id: 'modules',
          label: 'Lab Curriculum',
          icon: BookOpen,
          page: 'modules'
        },
        {
          id: 'notices',
          label: 'Notices & Bulletins',
          icon: Megaphone,
          page: 'announcements'
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          page: 'settings'
        }
      ];
    }

    // Default: Student
    return [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        page: 'dashboard'
      },
      {
        id: 'modules',
        label: 'Lab Modules',
        icon: BookOpen,
        page: 'modules'
      },
      {
        id: 'ai-engine',
        label: 'AI Engine',
        icon: Sparkles,
        page: 'ai-engine'
      },
      {
        id: 'practice',
        label: 'Practice Centre',
        icon: PenTool,
        page: 'practice'
      },
      {
        id: 'portfolio',
        label: 'Portfolio',
        icon: FolderCheck,
        page: 'portfolio'
      },
      {
        id: 'progress',
        label: 'Progress',
        icon: BarChart3,
        page: 'progress'
      },
      {
        id: 'notices',
        label: 'Notices & Bulletins',
        icon: Megaphone,
        page: 'announcements'
      },
      {
        id: 'profile',
        label: 'Profile',
        icon: User,
        page: 'profile'
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        page: 'settings'
      }
    ];
  };

  const primaryMenuItems = getMenuItems();

  const handleItemClick = (item: MenuItem) => {
    if (onMobileClose) onMobileClose();
    if (item.isCustomAction && item.action) {
      item.action();
    } else if (item.page) {
      onNavigate(item.page);
    }
  };

  const roleDisplayLabel = isAdmin
    ? 'Administrator'
    : isFacultyIncharge
    ? 'Faculty Incharge'
    : 'Student';

  return (
    <aside
      aria-label="Portal Navigation Sidebar"
      className={`fixed top-16 left-0 bottom-0 z-30 bg-[#2C3E50] text-white border-r border-[#34495E] transition-all duration-300 flex flex-col justify-between select-none ${
        isCollapsed ? 'w-[72px]' : 'w-[280px]'
      }`}
    >
      {/* Sidebar Top / Brand Banner */}
      <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
        {/* Institutional Header inside Sidebar */}
        <div className="flex items-center justify-between pb-3 border-b border-[#34495E]">
          {!isCollapsed ? (
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-8 h-8 rounded-lg bg-[#D35400] text-white flex items-center justify-center font-black shadow-sm">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="font-serif font-extrabold text-sm text-[#FAD7A0] tracking-wide block">
                  SAILL Portal
                </span>
                <span className="text-[10px] text-gray-300 uppercase tracking-wider font-semibold block">
                  {roleDisplayLabel}
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-9 h-9 rounded-lg bg-[#D35400] text-white flex items-center justify-center font-black shadow-sm">
              <GraduationCap className="w-5 h-5" />
            </div>
          )}

          {/* Collapse Toggle Button */}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg bg-[#34495E] hover:bg-[#D35400] text-gray-200 hover:text-white transition shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FAD7A0]"
            title={isCollapsed ? 'Expand Sidebar (280px)' : 'Collapse Sidebar (72px)'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Unified Navigation Links (Single Panel) */}
        <nav className="space-y-1">
          {primaryMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.page && currentPage === item.page;

            return (
              <div key={item.id} className="relative group">
                <button
                  onClick={() => handleItemClick(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FAD7A0] ${
                    isActive
                      ? 'bg-[#D35400] text-white shadow-md font-bold'
                      : 'text-gray-200 hover:bg-[#34495E] hover:text-[#FAD7A0]'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition ${
                      isActive
                        ? 'text-white'
                        : 'text-[#FAD7A0] group-hover:scale-110'
                    }`}
                  />
                  {!isCollapsed && (
                    <span className="truncate tracking-wide">{item.label}</span>
                  )}
                </button>

                {/* Tooltip Mode in Collapsed Desktop Sidebar */}
                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#2C3E50] border-2 border-[#FAD7A0] text-[#FFF8F0] text-xs font-extrabold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Global Utility Actions (Help & Logout) */}
        <div className="pt-3 border-t border-[#34495E] space-y-1">
          {/* Help Action */}
          <div className="relative group">
            <button
              onClick={onOpenHelp}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-gray-300 hover:bg-[#34495E] hover:text-[#FAD7A0] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FAD7A0] ${
                isCollapsed ? 'justify-center px-0' : ''
              }`}
            >
              <HelpCircle className="w-4 h-4 shrink-0 text-[#FAD7A0] group-hover:scale-110" />
              {!isCollapsed && <span className="truncate">Help & Guide</span>}
            </button>
            {isCollapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#2C3E50] border-2 border-[#FAD7A0] text-[#FFF8F0] text-xs font-extrabold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                Help & Guide
              </div>
            )}
          </div>

          {/* Logout Action */}
          <div className="relative group">
            <button
              onClick={onLogout}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-red-300 hover:bg-red-900/30 hover:text-red-200 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                isCollapsed ? 'justify-center px-0' : ''
              }`}
            >
              <LogOut className="w-4 h-4 shrink-0 text-red-400 group-hover:scale-110" />
              {!isCollapsed && <span className="truncate">Logout</span>}
            </button>
            {isCollapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#2C3E50] border-2 border-[#FAD7A0] text-[#FFF8F0] text-xs font-extrabold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                Logout
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Footer info */}
      {!isCollapsed && (
        <div className="p-3 border-t border-[#34495E] bg-[#22313F] text-[10px] text-gray-400 text-center space-y-0.5">
          <p className="font-extrabold text-[#FAD7A0] font-serif">SAILL R26 System</p>
          <p>SRIT Autonomous • AP, India</p>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
