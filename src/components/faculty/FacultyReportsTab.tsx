import React, { useState, useEffect } from 'react';
import { StudentProfile, FacultyModuleScore } from '../../types';
import { FacultyEvaluationService } from '../../services/FacultyEvaluationService';
import { EvaluationPdfService } from '../../services/EvaluationPdfService';
import { R26_MODULES } from '../../data/modulesData';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Layers,
  Users,
  BookOpen,
  RefreshCw,
  Award,
  Calendar
} from 'lucide-react';

interface FacultyReportsTabProps {
  assignedStudents?: StudentProfile[];
  facultyName?: string;
  department?: string;
}

export const FacultyReportsTab: React.FC<FacultyReportsTabProps> = ({
  assignedStudents = [],
  facultyName = 'Dr. Sarah Jenkins',
  department = 'Humanities & Sciences (English)'
}) => {
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [selectedStudentRoll, setSelectedStudentRoll] = useState<string>('');
  const [generating, setGenerating] = useState<boolean>(false);
  const [batchScores, setBatchScores] = useState<FacultyModuleScore[]>([]);
  const [loadingScores, setLoadingScores] = useState<boolean>(false);

  useEffect(() => {
    if (assignedStudents.length > 0 && (!selectedStudentRoll || !assignedStudents.some((s) => s.rollNo === selectedStudentRoll))) {
      setSelectedStudentRoll(assignedStudents[0].rollNo);
    }
  }, [assignedStudents, selectedStudentRoll]);

  const tenModules = R26_MODULES.slice(0, 10);
  const batchId = assignedStudents[0]?.batchId || assignedStudents[0]?.batch || 'BATCH-CSE-A';

  useEffect(() => {
    loadPostgresScores();
  }, [assignedStudents, batchId]);

  const loadPostgresScores = async () => {
    setLoadingScores(true);
    try {
      let scores = await FacultyEvaluationService.getScoresByBatch(batchId);
      if (!scores || scores.length === 0) {
        scores = await FacultyEvaluationService.getAllScores();
      }
      setBatchScores(scores || []);
    } catch (err) {
      console.warn('[FacultyReportsTab] Error loading batch scores from PostgreSQL:', err);
    } finally {
      setLoadingScores(false);
    }
  };

  // Build lookup map: `${rollNo}__${moduleId}`
  const scoreLookup = new Map<string, FacultyModuleScore>();
  batchScores.forEach((s) => {
    const roll = s.studentRollNo.trim().toUpperCase();
    scoreLookup.set(`${roll}__${s.moduleId.trim()}`, s);
    scoreLookup.set(`${roll}__${s.moduleId.trim().toLowerCase()}`, s);
  });

  const handleDownloadSectionReport = async () => {
    setGenerating(true);
    try {
      let allScores = await FacultyEvaluationService.getScoresByBatch(batchId);
      if (!allScores || allScores.length === 0) {
        allScores = batchScores;
      }
      const branch = assignedStudents[0]?.branch || assignedStudents[0]?.department || 'CSE';
      const semester = assignedStudents[0]?.semester || 'Semester I';
      const section = assignedStudents[0]?.section || 'Section A';

      EvaluationPdfService.generateClassEvaluationPdf(assignedStudents, allScores, {
        branch,
        semester,
        section,
        facultyIncharge: facultyName
      });

      setDownloadToast(`Section ${section} Day-to-Day Evaluation PDF generated successfully!`);
      setTimeout(() => setDownloadToast(null), 3500);
    } catch (err) {
      console.error('Error generating section report:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadStudentReport = async (rollNoToDownload?: string) => {
    const targetRoll = rollNoToDownload || selectedStudentRoll;
    const student = assignedStudents.find((s) => s.rollNo.toUpperCase() === targetRoll.toUpperCase()) || assignedStudents[0];
    if (!student) {
      alert('No student selected');
      return;
    }
    setGenerating(true);
    try {
      const studentScores = await FacultyEvaluationService.getScoresForStudent(student.rollNo);

      EvaluationPdfService.generateStudentEvaluationPdf(student, studentScores, facultyName);

      setDownloadToast(`Student Evaluation Record for ${student.name} (${student.rollNo}) generated successfully!`);
      setTimeout(() => setDownloadToast(null), 3500);
    } catch (err) {
      console.error('Error generating student report:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadModuleCsv = async () => {
    try {
      let allScores = await FacultyEvaluationService.getScoresByBatch(batchId);
      if (!allScores || allScores.length === 0) {
        allScores = batchScores;
      }
      const headers = ['Student Roll No', 'Student Name', 'Module ID', 'Score /10', 'Remarks', 'Faculty Name', 'Evaluated At'];
      const rows = allScores.map((s) => [
        `"${s.studentRollNo}"`,
        `"${s.studentName || ''}"`,
        `"${s.moduleId}"`,
        s.score,
        `"${(s.remarks || '').replace(/"/g, '""')}"`,
        `"${s.facultyName}"`,
        `"${new Date(s.evaluatedAt).toLocaleDateString()}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Module_Evaluation_Report_${batchId}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadToast(`Module Performance CSV exported successfully!`);
      setTimeout(() => setDownloadToast(null), 3500);
    } catch (err) {
      console.error('Error exporting module CSV:', err);
    }
  };

  return (
    <div className="space-y-6 text-[#2C3E50]">
      {/* Title Header */}
      <div className="bg-white p-5 rounded-2xl border border-[#FAD7A0]/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-[11px] font-bold mb-1">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Academic Reporting Suite</span>
          </div>
          <h2 className="text-xl font-extrabold font-serif text-[#2C3E50]">Institutional Reports Generator</h2>
          <p className="text-xs text-gray-500">
            Export structured Day-to-Day Module Evaluation records and performance reports for assigned sections and student cohorts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadPostgresScores}
            disabled={loadingScores}
            className="px-3 py-1.5 bg-[#FFF8F0] hover:bg-[#FAD7A0]/40 text-[#D35400] border border-[#FAD7A0] rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingScores ? 'animate-spin' : ''}`} />
            <span>Sync PostgreSQL</span>
          </button>
        </div>
      </div>

      {downloadToast && (
        <div className="p-4 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span>{downloadToast}</span>
        </div>
      )}

      {/* 3 Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Report 1: Section Report */}
        <div className="bg-white p-6 rounded-2xl border border-[#FAD7A0]/70 shadow-xs space-y-4 hover:border-[#D35400] transition-all flex flex-col justify-between">
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 text-blue-700 rounded-xl w-fit">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#2C3E50]">Section Master Sheet (PDF)</h3>
            <p className="text-xs text-gray-600">
              Official institutional Day-to-Day Module Evaluation record sheet containing Roll No, Name, Branch, Semester, Section, all 10 Module Faculty Scores (1–10), Total (/100), and Average (/10).
            </p>
          </div>
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={handleDownloadSectionReport}
              disabled={generating}
              className="w-full py-2.5 bg-[#D35400] hover:bg-[#E67E22] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>{generating ? 'Generating PDF...' : 'Download Section Master PDF'}</span>
            </button>
          </div>
        </div>

        {/* Report 2: Student Report */}
        <div className="bg-white p-6 rounded-2xl border border-[#FAD7A0]/70 shadow-xs space-y-4 hover:border-[#D35400] transition-all flex flex-col justify-between">
          <div className="space-y-3">
            <div className="p-3 bg-purple-50 text-purple-700 rounded-xl w-fit">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#2C3E50]">Individual Student Record (PDF)</h3>
            <p className="text-xs text-gray-600">
              Single-student Day-to-Day Module Performance Card with complete 10-module breakdown, faculty remarks, score descriptors, signature blocks, and verification seal.
            </p>

            {assignedStudents.length > 0 && (
              <div className="pt-2">
                <label className="text-[11px] font-bold text-gray-500 block mb-1">Select Student:</label>
                <select
                  value={selectedStudentRoll}
                  onChange={(e) => setSelectedStudentRoll(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#FFF8F0]/60 border border-[#FAD7A0] rounded-lg text-xs text-[#2C3E50] focus:outline-hidden"
                >
                  <option value="">Select a student...</option>
                  {assignedStudents.map((s) => (
                    <option key={s.rollNo} value={s.rollNo}>
                      {s.name} ({s.rollNo})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={() => handleDownloadStudentReport()}
              disabled={generating}
              className="w-full py-2.5 bg-[#D35400] hover:bg-[#E67E22] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>{generating ? 'Generating PDF...' : 'Download Student Record PDF'}</span>
            </button>
          </div>
        </div>

        {/* Report 3: Module Report */}
        <div className="bg-white p-6 rounded-2xl border border-[#FAD7A0]/70 shadow-xs space-y-4 hover:border-[#D35400] transition-all flex flex-col justify-between">
          <div className="space-y-3">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-xl w-fit">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#2C3E50]">Module Performance Audit (CSV)</h3>
            <p className="text-xs text-gray-600">
              Raw evaluation data matrix with timestamps, evaluator remarks, individual student score histories, and lab performance audit trails for accreditation reporting.
            </p>
          </div>
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={handleDownloadModuleCsv}
              className="w-full py-2.5 bg-[#D35400] hover:bg-[#E67E22] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Export Audit CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Batch Consolidated Module-Wise Score Table & Averages out of 10 */}
      <div className="bg-white rounded-2xl border border-[#FAD7A0]/70 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-[#FAD7A0]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-[#FFF8F0] to-white">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-100 text-[#D35400] rounded-full text-[10px] font-black uppercase tracking-wider mb-1">
              <Award className="w-3 h-3" />
              <span>Authoritative PostgreSQL Data</span>
            </div>
            <h3 className="font-bold text-base text-[#2C3E50] font-heading">
              Batch Consolidated Day-to-Day Evaluation Summary
            </h3>
            <p className="text-xs text-gray-500">
              Module-wise faculty marks (1–10) and overall averages calculated strictly from completed & evaluated modules
            </p>
          </div>
          <div className="text-xs font-bold text-[#5D6D7E]">
            Cohort Size: <span className="text-[#D35400]">{assignedStudents.length}</span> students
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#2C3E50] text-white font-bold border-b border-[#34495E]">
                <th className="p-3 text-center w-10">#</th>
                <th className="p-3 min-w-[110px]">Roll No</th>
                <th className="p-3 min-w-[140px]">Student Name</th>
                {tenModules.map((m, idx) => (
                  <th key={m.id} className="p-2 text-center w-12" title={m.title}>
                    M{idx + 1}
                  </th>
                ))}
                <th className="p-3 text-center min-w-[70px]">Evaluated</th>
                <th className="p-3 text-center min-w-[75px]">Total</th>
                <th className="p-3 text-center min-w-[85px] bg-[#233140] text-[#FAD7A0]">
                  Avg (/10)
                </th>
                <th className="p-3 text-center min-w-[90px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignedStudents.length === 0 ? (
                <tr>
                  <td colSpan={16} className="p-8 text-center text-gray-400">
                    No students currently assigned to this batch.
                  </td>
                </tr>
              ) : (
                assignedStudents.map((student, idx) => {
                  let totalScore = 0;
                  let evaluatedCount = 0;

                  const scoresPerModule = tenModules.map((m) => {
                    const sc =
                      scoreLookup.get(`${student.rollNo.trim().toUpperCase()}__${m.id.trim()}`) ||
                      scoreLookup.get(`${student.rollNo.trim().toUpperCase()}__${m.id.trim().toLowerCase()}`);
                    if (sc && typeof sc.score === 'number') {
                      totalScore += sc.score;
                      evaluatedCount++;
                      return sc.score;
                    }
                    return null;
                  });

                  // Calculate average only from completed/evaluated modules
                  const averageOutOf10 =
                    evaluatedCount > 0 ? Number((totalScore / evaluatedCount).toFixed(1)) : null;

                  return (
                    <tr
                      key={student.rollNo}
                      className={`hover:bg-[#FFF8F0]/50 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                      }`}
                    >
                      <td className="p-3 text-center text-gray-400 font-mono">{idx + 1}</td>
                      <td className="p-3 font-mono font-bold text-[#2C3E50]">{student.rollNo}</td>
                      <td className="p-3 font-semibold text-[#2C3E50]">{student.name}</td>
                      {scoresPerModule.map((score, mIdx) => (
                        <td key={mIdx} className="p-2 text-center font-mono">
                          {score !== null ? (
                            <span className="inline-block px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-md border border-emerald-200 text-[11px]">
                              {score}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            evaluatedCount === 10
                              ? 'bg-emerald-100 text-emerald-800'
                              : evaluatedCount > 0
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {evaluatedCount}/10
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-[#D35400]">
                        {totalScore}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-emerald-700 bg-emerald-50/40">
                        {averageOutOf10 !== null ? `${averageOutOf10} / 10` : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDownloadStudentReport(student.rollNo)}
                          title={`Download Evaluation PDF for ${student.name}`}
                          className="px-2 py-1 bg-white hover:bg-gray-100 text-[#2C3E50] border border-gray-300 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3 text-[#D35400]" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
