import { ensureDatabaseReady, saveAppData, getAllAppData } from '../src/server/db';
import fs from 'fs';
import path from 'path';

interface AcademicBatchRecord {
  id: string;
  batch_code: string;
  batch_name: string;
  branch: string;
  section: string;
  academic_year: string;
  semester: string;
  faculty_incharge_id: string | null;
  faculty_incharge_name: string | null;
  student_count: number;
  status: 'ACTIVE';
}

const AUTHORITATIVE_BATCHES: AcademicBatchRecord[] = [
  {
    id: 'BATCH-CSE-A',
    batch_code: 'CSE-A',
    batch_name: 'B.Tech Computer Science & Engineering - Section A',
    branch: 'Computer Science & Engineering',
    section: 'A',
    academic_year: '2026–2027',
    semester: 'Semester I',
    faculty_incharge_id: 'DEMO01',
    faculty_incharge_name: 'Demo faculty',
    student_count: 1,
    status: 'ACTIVE'
  },
  {
    id: 'BATCH-CSE-B',
    batch_code: 'CSE-B',
    batch_name: 'B.Tech Computer Science & Engineering - Section B',
    branch: 'Computer Science & Engineering',
    section: 'B',
    academic_year: '2026–2027',
    semester: 'Semester I',
    faculty_incharge_id: null,
    faculty_incharge_name: null,
    student_count: 0,
    status: 'ACTIVE'
  },
  {
    id: 'BATCH-CSM-A',
    batch_code: 'CSM-A',
    batch_name: 'B.Tech Computer Science & Engineering (Artificial Intelligence & Machine Learning) - Section A',
    branch: 'Computer Science & Engineering (Artificial Intelligence & Machine Learning)',
    section: 'A',
    academic_year: '2026–2027',
    semester: 'Semester I',
    faculty_incharge_id: null,
    faculty_incharge_name: null,
    student_count: 0,
    status: 'ACTIVE'
  },
  {
    id: 'BATCH-CSD-A',
    batch_code: 'CSD-A',
    batch_name: 'B.Tech Computer Science & Engineering (Data Science) - Section A',
    branch: 'Computer Science & Engineering (Data Science)',
    section: 'A',
    academic_year: '2026–2027',
    semester: 'Semester I',
    faculty_incharge_id: null,
    faculty_incharge_name: null,
    student_count: 0,
    status: 'ACTIVE'
  },
  {
    id: 'BATCH-CAD-A',
    batch_code: 'CAD-A',
    batch_name: 'B.Tech Computer Science & Engineering (Artificial Intelligence & Data Science) - Section A',
    branch: 'Computer Science & Engineering (Artificial Intelligence & Data Science)',
    section: 'A',
    academic_year: '2026–2027',
    semester: 'Semester I',
    faculty_incharge_id: null,
    faculty_incharge_name: null,
    student_count: 0,
    status: 'ACTIVE'
  }
];

async function runMigration() {
  // console.log('==================================================');
  // console.log('PHASE 4 STEP 2: ACADEMIC BATCH MIGRATION');
  // console.log('==================================================\n');

  await ensureDatabaseReady();

  // 1. PRE-MIGRATION VERIFICATION
  // console.log('--- PRE-MIGRATION STATE ---');
  const preBatches = await getAllAppData('batches');
  // console.log('Pre-migration "batches" collection row count:', preBatches.length);
  const preAcademicBatches = await getAllAppData('academic_batches');
  // console.log('Pre-migration "academic_batches" collection row count:', preAcademicBatches.length);

  // 2. EXECUTION
  // console.log('\n--- EXECUTING MIGRATION ---');
  let attempted = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const b of AUTHORITATIVE_BATCHES) {
    attempted++;
    try {
      const existing = preBatches.find((item: any) => item.id === b.id);
      const isUpdate = !!existing;

      // Save to both collections ('batches' and 'academic_batches') for full compatibility
      await saveAppData('batches', b.id, {
        id: b.id,
        batchId: b.id,
        batchCode: b.batch_code,
        batch_code: b.batch_code,
        batchName: b.batch_name,
        batch_name: b.batch_name,
        branch: b.branch,
        department: b.branch,
        section: b.section,
        academicYear: b.academic_year,
        academic_year: b.academic_year,
        semester: b.semester,
        programme: 'B.Tech',
        assignedFacultyInchargeId: b.faculty_incharge_id,
        assignedFacultyInchargeName: b.faculty_incharge_name,
        faculty_incharge_id: b.faculty_incharge_id,
        faculty_incharge_name: b.faculty_incharge_name,
        studentCount: b.student_count,
        student_count: b.student_count,
        status: b.status
      });

      await saveAppData('academic_batches', b.id, {
        id: b.id,
        batchId: b.id,
        batchCode: b.batch_code,
        batch_code: b.batch_code,
        batchName: b.batch_name,
        batch_name: b.batch_name,
        branch: b.branch,
        department: b.branch,
        section: b.section,
        academicYear: b.academic_year,
        academic_year: b.academic_year,
        semester: b.semester,
        programme: 'B.Tech',
        assignedFacultyInchargeId: b.faculty_incharge_id,
        assignedFacultyInchargeName: b.faculty_incharge_name,
        faculty_incharge_id: b.faculty_incharge_id,
        faculty_incharge_name: b.faculty_incharge_name,
        studentCount: b.student_count,
        student_count: b.student_count,
        status: b.status
      });

      if (isUpdate) {
        updated++;
        // console.log(`[UPDATE] Batch ${b.id} (${b.batch_code}) updated successfully.`);
      } else {
        inserted++;
        // console.log(`[INSERT] Batch ${b.id} (${b.batch_code}) inserted successfully.`);
      }
    } catch (err: any) {
      skipped++;
      console.error(`[ERROR] Failed to migrate batch ${b.id}:`, err.message);
    }
  }

  // console.log(`\nMigration Summary: Attempted: ${attempted}, Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);

  // 3. POST-MIGRATION VERIFICATION
  // console.log('\n--- POST-MIGRATION VERIFICATION ---');
  const postBatches = await getAllAppData('batches');
  // console.log('Post-migration "batches" collection row count:', postBatches.length);
  const postAcademicBatches = await getAllAppData('academic_batches');
  // console.log('Post-migration "academic_batches" collection row count:', postAcademicBatches.length);

  // console.log('\nMigrated Academic Batches:');
  postBatches.forEach((b: any, idx: number) => {
    // console.log(`${idx + 1}. ID: ${b.id} | Code: ${b.batch_code || b.batchCode} | Name: ${b.batch_name || b.batchName}`);
    // console.log(`   Branch: ${b.branch} | Section: ${b.section} | AY: ${b.academic_year || b.academicYear} | Sem: ${b.semester}`);
    // console.log(`   Incharge: ${b.faculty_incharge_name || 'Unassigned'} (${b.faculty_incharge_id || 'None'}) | Students: ${b.student_count} | Status: ${b.status}\n`);
  });

  // 4. FOREIGN KEY READINESS CHECK
  // console.log('--- FOREIGN KEY READINESS CHECK ---');
  const auditedStudentBatchRefs = ['BATCH-CSE-A'];
  for (const ref of auditedStudentBatchRefs) {
    const found = postBatches.find((b: any) => b.id === ref);
    if (found) {
      // console.log(`✓ Student batch reference '${ref}' successfully matches migrated batch ID '${found.id}' (${found.batch_name || found.batchName}).`);
    } else {
      console.error(`✗ Orphan detected: Student batch reference '${ref}' NOT found!`);
    }
  }

  // 5. SAFETY AUDIT CONFIRMATION
  // console.log('\n--- SAFETY AUDIT CONFIRMATION ---');
  const usersPath = path.join(process.cwd(), 'server_data', 'central_users.json');
  const usersCount = JSON.parse(fs.readFileSync(usersPath, 'utf8')).length;
  // console.log(`public.users records: ${usersCount} (Unmodified)`);

  const studentsPath = path.join(process.cwd(), 'server_data', 'students.json');
  const studentsCount = JSON.parse(fs.readFileSync(studentsPath, 'utf8')).length;
  // console.log(`public.students records: ${studentsCount} (Unmodified)`);

  const progressPath = path.join(process.cwd(), 'server_data', 'student_module_progress.json');
  const progressCount = JSON.parse(fs.readFileSync(progressPath, 'utf8')).length;
  // console.log(`public.student_module_progress records: ${progressCount} (Unmodified)`);

  const evalPath = path.join(process.cwd(), 'server_data', 'faculty_module_evaluations.json');
  const evalCount = JSON.parse(fs.readFileSync(evalPath, 'utf8')).length;
  // console.log(`public.faculty_module_evaluations records: ${evalCount} (Unmodified)`);
}

runMigration().catch(console.error);
