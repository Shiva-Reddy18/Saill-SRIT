import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Page, StudentProfile } from '../types';
import { AcademicStructureService } from '../services/AcademicStructureService';
import { RegistrationService } from '../services/RegistrationService';
import {
  GraduationCap,
  User,
  Hash,
  Mail,
  Phone,
  Building2,
  BookOpen,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  UserPlus
} from 'lucide-react';

interface StudentRegisterPageProps {
  onNavigate: (page: Page) => void;
  onProfileUpdate?: (profile: StudentProfile) => void;
}

export const StudentRegisterPage: React.FC<StudentRegisterPageProps> = ({
  onNavigate,
  onProfileUpdate
}) => {
  const [formData, setFormData] = useState({
    name: '',
    rollNo: '',
    email: '',
    mobile: '',
    college: 'Srinivasa Ramanujan Institute of Technology (Autonomous)',
    programme: '',
    department: '',
    year: '',
    semester: 'Semester II',
    section: 'A',
    academicYear: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  });

  const [activeProgrammes, setActiveProgrammes] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [activeBranches, setActiveBranches] = useState<Array<{
    id: string;
    name: string;
    code: string;
    aliasIds: string[];
    aliasCodes: string[];
    aliasNames: string[];
  }>>([]);
  const [activeSections, setActiveSections] = useState<Array<{
    id: string;
    branchId: string;
    branchCode: string;
    branchName: string;
    branch: string;
    semester: string;
    sectionName: string;
  }>>([]);
  const [activeYears, setActiveYears] = useState<Array<{ yearName: string; isCurrent: boolean }>>([]);
  const [activeSemesters, setActiveSemesters] = useState<string[]>([]);
  const [hasAcademicOptions, setHasAcademicOptions] = useState<boolean>(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState<boolean>(true);
  const [academicLoadError, setAcademicLoadError] = useState<string>('');
  const [canRetryAcademicLoad, setCanRetryAcademicLoad] = useState<boolean>(false);

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const normalizeBranchLabel = (value: string): string => {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return ['CSE', 'COMPUTERSCIENCEENGINEERING', 'COMPUTERSCIENCEANDENGINEERING'].includes(normalized)
      ? 'CSE'
      : normalized;
  };

  const loadAcademicOptions = async (
    retryFailedOnly: boolean = false,
    isMounted: () => boolean = () => true
  ) => {
    setIsLoadingOptions(true);
    setAcademicLoadError('');
    setCanRetryAcademicLoad(false);

    try {
      const apiData = await AcademicStructureService.getAllAcademicStructure(retryFailedOnly);
      const loaded = new Set(AcademicStructureService.getLoadedCollections());
      const loadErrors = AcademicStructureService.getLoadErrors();

      const programmeList = apiData.programmes
        .filter((programme) => String(programme.status).toUpperCase() === 'ACTIVE')
        .filter((programme, index, list) => list.findIndex((item) => item.id === programme.id) === index)
        .map((programme) => ({
          id: programme.id,
          name: programme.name?.trim() || '',
          code: String(programme.code || '').trim()
        }))
        .filter((programme) => programme.name);

      const branchList = apiData.branches
        .filter((branch) => String(branch.status).toUpperCase() === 'ACTIVE')
        .filter((branch) => branch.name?.trim())
        .reduce<Array<{
          id: string;
          name: string;
          code: string;
          aliasIds: string[];
          aliasCodes: string[];
          aliasNames: string[];
        }>>((uniqueBranches, branch) => {
          const name = branch.name.trim();
          const code = String(branch.code || '').trim();
          const normalizedName = normalizeBranchLabel(name);
          const normalizedCode = normalizeBranchLabel(code);
          const existing = uniqueBranches.find((candidate) => {
            const candidateName = normalizeBranchLabel(candidate.name);
            const candidateCode = normalizeBranchLabel(candidate.code);
            return normalizedName === candidateName ||
              normalizedName === candidateCode ||
              normalizedCode === candidateName;
          });

          if (existing) {
            existing.aliasIds.push(branch.id);
            existing.aliasCodes.push(code);
            existing.aliasNames.push(name);
            if (name.length > existing.name.length) {
              existing.id = branch.id;
              existing.name = name;
              existing.code = code;
            }
          } else {
            uniqueBranches.push({
              id: branch.id,
              name,
              code,
              aliasIds: [branch.id],
              aliasCodes: [code],
              aliasNames: [name]
            });
          }
          return uniqueBranches;
        }, [])
        .sort((a, b) => a.code.localeCompare(b.code));

      const semesterList = apiData.semesters
        .filter((semester) => String(semester.status).toUpperCase() === 'ACTIVE')
        .map((semester) => semester.semesterName?.trim() || '')
        .filter((semester, index, list) =>
          semester && list.findIndex((item) => item.toLowerCase() === semester.toLowerCase()) === index
        );

      const sectionList = apiData.sections
        .filter((section) => String(section.status).toUpperCase() === 'ACTIVE')
        .map((section) => {
          const sectionData = section as typeof section & { branchId?: string; branchCode?: string };
          const sectionBranchNames = [section.branch, section.branchName].filter(Boolean);
          const linkedBranch =
            branchList.find((branch) =>
              Boolean(sectionData.branchCode) &&
              branch.aliasCodes.some((code) => normalizeBranchLabel(code) === normalizeBranchLabel(sectionData.branchCode || ''))
            ) ||
            branchList.find((branch) =>
              sectionBranchNames.some((sectionBranchName) =>
                branch.aliasNames.some((name) => normalizeBranchLabel(name) === normalizeBranchLabel(sectionBranchName))
              )
            ) ||
            branchList.find((branch) => branch.aliasIds.includes(sectionData.branchId || ''));
          const branchName = linkedBranch?.name || section.branchName || section.branch || '';
          return {
            id: section.id,
            branchId: linkedBranch?.id || sectionData.branchId || '',
            branchCode: linkedBranch?.code || String(sectionData.branchCode || '').trim(),
            branchName,
            branch: branchName,
            semester: section.semester?.trim() || '',
            sectionName: section.sectionName || ''
          };
        })
        .filter((section) => section.sectionName);

      const yearList = apiData.years
        .filter((year) => String(year.status).toUpperCase() === 'ACTIVE')
        .map((year) => ({
          yearName: (year.yearName || '').replace(/[\u2010-\u2015\u2212]/g, '-').trim(),
          isCurrent: year.isCurrent
        }))
        .filter((year, index, list) =>
          year.yearName && list.findIndex((item) => item.yearName === year.yearName) === index
        );

      if (!isMounted()) return;

      setActiveProgrammes(programmeList);
      setActiveBranches(branchList);
      setActiveSections(sectionList);
      setActiveYears(yearList);
      setActiveSemesters(semesterList);

      const requiredCollections = [
        'academicProgrammes',
        'academicBranches',
        'academicYears',
        'academicSemesters',
        'academicSections'
      ];
      const requiredCollectionsLoaded = requiredCollections.every((name) => loaded.has(name));
      const optionsAvailable =
        requiredCollectionsLoaded &&
        programmeList.length > 0 &&
        branchList.length > 0 &&
        yearList.length > 0;
      setHasAcademicOptions(optionsAvailable);

      const defaultProgramme =
        programmeList.find((programme) => programme.name === formData.programme) || programmeList[0];
      const defaultBranch =
        branchList.find((branch) => branch.name === formData.department || branch.code === formData.department) ||
        branchList[0];
      const defaultYear =
        yearList.find((year) => year.yearName === formData.academicYear) ||
        yearList.find((year) => year.isCurrent) ||
        yearList[0];
      const branchSections = sectionList.filter((section) => section.branchId === defaultBranch?.id);
      const branchSemesterOptions = Array.from(new Set([
        ...semesterList,
        ...branchSections.map((section) => section.semester).filter(Boolean)
      ]));
      const defaultSemester =
        branchSemesterOptions.find((semester) => semester === formData.semester) ||
        branchSemesterOptions[0] ||
        '';
      const defaultSection =
        branchSections.find(
          (section) => (!section.semester || section.semester === defaultSemester) &&
            section.sectionName === formData.section
        )?.sectionName ||
        branchSections.find((section) => !section.semester || section.semester === defaultSemester)?.sectionName ||
        '';

      setFormData((prev) => ({
        ...prev,
        programme: defaultProgramme?.name || '',
        department: defaultBranch?.name || '',
        semester: defaultSemester,
        section: defaultSection,
        academicYear: defaultYear?.yearName || '',
        year: defaultProgramme && defaultBranch ? `${defaultProgramme.name} (${defaultBranch.name})` : ''
      }));

      if (loadErrors.length > 0) {
        setAcademicLoadError(`Some academic data could not be loaded. ${loadErrors.join('; ')}. Please retry.`);
        setCanRetryAcademicLoad(true);
      } else if (!optionsAvailable) {
        setAcademicLoadError('No active programme, branch, academic year, semester, or section is configured.');
      } else {
        setAcademicLoadError('');
      }
    } catch (err) {
      if (isMounted()) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[StudentRegisterPage] Academic options load failed:', err);
        setAcademicLoadError(`Unable to load academic options: ${message}. Please retry.`);
        setCanRetryAcademicLoad(true);
        setHasAcademicOptions(false);
      }
    } finally {
      if (isMounted()) setIsLoadingOptions(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    void loadAcademicOptions(false, () => isMounted);
    return () => {
      isMounted = false;
    };
  }, []);

  const findBranchOption = (value: string) => {
    const normalizedValue = value.trim().toUpperCase();
    return activeBranches.find((branch) =>
      [branch.name, branch.code, ...branch.aliasNames, ...branch.aliasCodes]
        .some((alias) => alias.trim().toUpperCase() === normalizedValue)
    );
  };

  const getSectionsForBranch = (branch: (typeof activeBranches)[number] | undefined) =>
    branch ? activeSections.filter((section) => section.branchId === branch.id) : [];

  // Cascading Branch Selection (STEP 1)
  const handleBranchChange = (newBranchName: string) => {
    const branchObj = findBranchOption(newBranchName);
    const branchSecs = getSectionsForBranch(branchObj);

    const sems = Array.from(new Set([
      ...activeSemesters,
      ...branchSecs.map((section) => section.semester).filter(Boolean)
    ]));
    const newSem = sems[0] || '';

    const secs = branchSecs
      .filter((section) => !section.semester || section.semester === newSem)
      .map((section) => section.sectionName);
    const newSec = secs[0] || 'A';

    setFormData((prev) => ({
      ...prev,
      department: newBranchName,
      semester: newSem,
      section: newSec,
      year: prev.programme ? `${prev.programme} (${newBranchName})` : ''
    }));
  };

  const handleProgrammeChange = (programme: string) => {
    setFormData((prev) => ({
      ...prev,
      programme,
      year: prev.department ? `${programme} (${prev.department})` : programme
    }));
  };

  // Cascading Semester Selection (STEP 2)
  const handleSemesterChange = (newSem: string) => {
    const branchObj = findBranchOption(formData.department);
    const branchSecs = getSectionsForBranch(branchObj);

    const secs = branchSecs
      .filter((section) => !section.semester || section.semester === newSem)
      .map((section) => section.sectionName);
    const newSec = secs.includes(formData.section) ? formData.section : (secs[0] || 'A');

    setFormData((prev) => ({
      ...prev,
      semester: newSem,
      section: newSec
    }));
  };

  // Authoritatively derive available semesters for current selected branch
  const currentBranchObj = findBranchOption(formData.department);
  const currentBranchSections = getSectionsForBranch(currentBranchObj);

  const resolvedSemesters = Array.from(new Set([
    ...activeSemesters,
    ...currentBranchSections.map((section) => section.semester).filter(Boolean)
  ]));

  // Authoritatively derive available sections for current selected branch + semester
  const availableSections = currentBranchSections
    .filter((section) => !section.semester || section.semester === formData.semester)
    .map((s) => s.sectionName)
    .filter((sectionName, index, list) => sectionName && list.indexOf(sectionName) === index);

  const resolvedSections =
    availableSections.length > 0
      ? availableSections
      : currentBranchObj?.aliasCodes.includes('05') || currentBranchObj?.aliasNames.some((name) => normalizeBranchLabel(name) === 'CSE')
      ? ['A', 'B', 'C', 'D', 'E', 'F']
      : ['A'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      if (!formData.name.trim()) throw new Error('Please enter your Full Name.');
      if (!formData.rollNo.trim()) throw new Error('Please enter your Roll Number (e.g., 264G1A0501).');
      if (!formData.email.trim() || !formData.email.includes('@')) throw new Error('Please enter a valid Email Address.');
      if (!formData.mobile.trim() || formData.mobile.length < 10) throw new Error('Please enter a valid 10-digit Mobile Number.');
      if (!formData.programme) throw new Error('Please select a Programme.');
      if (!formData.department) throw new Error('Please select a Branch.');
      if (!formData.academicYear) throw new Error('Please select an Academic Year.');
      if (!formData.password || formData.password.length < 6) throw new Error('Password must be at least 6 characters long.');
      if (formData.password !== formData.confirmPassword) throw new Error('Password and Confirm Password do not match.');
      if (!formData.acceptTerms) throw new Error('You must accept the enrollment terms.');

      // Validation: Verify valid branch + semester + section combination
      if (!resolvedSemesters.includes(formData.semester)) {
        throw new Error(`Invalid semester '${formData.semester}' for branch '${formData.department}'.`);
      }
      if (!resolvedSections.includes(formData.section)) {
        throw new Error(`Invalid section '${formData.section}' for ${formData.department} (${formData.semester}).`);
      }

      await RegistrationService.registerStudent({
        fullName: formData.name,
        rollNo: formData.rollNo,
        email: formData.email,
        mobile: formData.mobile,
        programme: formData.programme,
        branch: formData.department,
        academicYear: formData.academicYear,
        year: formData.year,
        semester: formData.semester,
        section: formData.section,
        password: formData.password,
        confirmPassword: formData.confirmPassword
      });

      setIsSubmitted(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Registration failed. Please check your inputs and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#FFF8F0] via-white to-[#FFF8F0]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#FAD7A0] shadow-xl text-center space-y-6"
        >
          <div className="w-16 h-16 bg-amber-100 text-[#D35400] rounded-full flex items-center justify-center mx-auto shadow-sm">
            <ShieldCheck className="w-9 h-9" />
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-black text-[#2C3E50] font-heading">
              Registration submitted successfully.
            </h2>
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[#2C3E50] text-sm space-y-2 text-left leading-relaxed">
              <p className="font-semibold text-amber-900">
                Registration successful. Your account is waiting for admin approval.
              </p>
              <p className="text-xs text-amber-800 pt-1 border-t border-amber-200/60">
                After approval, please log in using your registered Email Address and Password.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onNavigate('login')}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#D35400] to-[#E67E22] hover:from-[#E67E22] hover:to-[#D35400] text-white font-extrabold text-xs rounded-xl shadow-md transition transform active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Login</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#FFF8F0] via-white to-[#FFF8F0]">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white p-6 sm:p-8 rounded-3xl border-2 border-[#FAD7A0] shadow-xl space-y-6"
      >
        {/* Header Actions */}
        <div className="flex items-center justify-between border-b border-[#FAD7A0] pb-4">
          <button
            onClick={() => onNavigate('register-choice')}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#5D6D7E] hover:text-[#D35400] transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Category Choice</span>
          </button>
          <span className="text-[10px] font-extrabold uppercase bg-[#FFF8F0] text-[#D35400] px-2.5 py-1 rounded-md border border-[#FAD7A0]">
            B.Tech Student Registration
          </span>
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 bg-[#D35400] text-white rounded-2xl flex items-center justify-center mx-auto shadow-md font-black">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-black text-[#2C3E50] font-heading">
            Student Enrollment Form
          </h2>
          <p className="text-xs text-[#5D6D7E]">
            SAILL R26 Communicative English Laboratory — Autonomous Academic Batch Enrollment
          </p>
        </div>

        {/* Error / Success Alerts */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {isLoadingOptions && (
          <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold" role="status">
            Loading active programmes, branches, academic years, semesters, and sections…
          </div>
        )}

        {academicLoadError && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="font-semibold leading-relaxed">{academicLoadError}</span>
            {canRetryAcademicLoad && (
              <button
                type="button"
                onClick={() => void loadAcademicOptions(true)}
                disabled={isLoadingOptions}
                className="shrink-0 px-3 py-2 bg-white border border-amber-300 rounded-lg font-bold disabled:opacity-50"
              >
                {isLoadingOptions ? 'Retrying…' : 'Retry'}
              </button>
            )}
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">{successMsg}</span>
          </div>
        )}

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#D35400] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Anil Kumar D"
                  className="w-full pl-9 pr-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400]"
                />
              </div>
            </div>

            {/* Roll Number */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Roll Number (HT No) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-[#D35400] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={formData.rollNo || ''}
                  onChange={(e) => setFormData({ ...formData, rollNo: e.target.value.toUpperCase() })}
                  placeholder="e.g. 264G1A0501"
                  className="w-full pl-9 pr-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#D35400]"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Student Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#D35400] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. student.cse26@srit.ac.in"
                  className="w-full pl-9 pr-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400]"
                />
              </div>
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#D35400] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  value={formData.mobile || ''}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  placeholder="10-digit Mobile Number"
                  className="w-full pl-9 pr-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400]"
                />
              </div>
            </div>

            {/* Programme */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Programme <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.programme}
                onChange={(e) => handleProgrammeChange(e.target.value)}
                disabled={!hasAcademicOptions || isLoadingOptions}
                className="w-full px-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400] disabled:opacity-50"
              >
                <option value="" disabled>Select a programme</option>
                {activeProgrammes.map((programme) => (
                  <option key={programme.id} value={programme.name}>{programme.name}</option>
                ))}
              </select>
            </div>

            {/* Branch */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Branch <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.department}
                onChange={(e) => handleBranchChange(e.target.value)}
                disabled={!hasAcademicOptions || isLoadingOptions}
                className="w-full px-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400] disabled:opacity-50"
              >
                <option value="" disabled>Select a branch</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </div>

            {/* Academic Year */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Academic Year <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.academicYear}
                onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                disabled={!hasAcademicOptions || isLoadingOptions}
                className="w-full px-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400] disabled:opacity-50"
              >
                <option value="" disabled>Select an academic year</option>
                {activeYears.map((y) => (
                  <option key={y.yearName} value={y.yearName}>{y.yearName}</option>
                ))}
              </select>
            </div>

            {/* Semester */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Semester <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.semester || ''}
                onChange={(e) => handleSemesterChange(e.target.value)}
                disabled={!hasAcademicOptions || isLoadingOptions}
                className="w-full px-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400] disabled:opacity-50"
              >
                {resolvedSemesters.map((sem) => (
                  <option key={sem} value={sem}>{sem}</option>
                ))}
              </select>
            </div>

            {/* Section */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Section <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.section || ''}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                disabled={!hasAcademicOptions || isLoadingOptions}
                className="w-full px-3 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400] disabled:opacity-50"
              >
                {resolvedSections.map((sec) => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#D35400] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-9 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-[#D35400]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-extrabold text-[#2C3E50] mb-1">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#D35400] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword || ''}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Re-enter password"
                  className="w-full pl-9 pr-9 py-2 bg-[#FFF8F0]/50 border border-[#FAD7A0] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D35400]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-[#D35400]"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Terms Checkbox */}
          <div className="flex items-start gap-2 pt-2">
            <input
              type="checkbox"
              id="student-terms"
              required
              checked={formData.acceptTerms}
              onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })}
              className="mt-0.5 rounded text-[#D35400] focus:ring-[#D35400]"
            />
            <label htmlFor="student-terms" className="text-[11px] text-[#5D6D7E] leading-tight cursor-pointer">
              I certify that I am a registered First-Year B.Tech student at SRIT and agree to adhere to the SAILL Laboratory Code of Conduct and Autonomous Evaluation Regulations.
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !hasAcademicOptions || isLoadingOptions}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#D35400] to-[#E67E22] hover:from-[#E67E22] hover:to-[#D35400] text-white font-extrabold text-xs rounded-xl shadow-md transition transform active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Submit Enrollment & Open Dashboard</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Existing Account Footer */}
        <div className="pt-3 border-t border-[#FAD7A0] text-center text-xs">
          <p className="text-gray-600">
            Already enrolled?{' '}
            <button
              onClick={() => onNavigate('login')}
              className="font-extrabold text-[#D35400] hover:underline cursor-pointer"
            >
              Sign in to your account
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default StudentRegisterPage;
