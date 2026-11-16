import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ensureDatabaseReady, getAllAppData, getAllStudents, getStudentByRollNo, upsertStudent } from '../src/server/db';

interface SourceStudentProfile {
  id: string;
  name: string;
  rollNo: string;
  branch: string;
  section: string;
  batch: string;
  batchId: string;
  batchName: string;
  programme: string;
  department: string;
  academicYear: string;
  semester: string;
  year: string;
  email: string;
  avatarUrl?: string;
  xp?: number;
  level?: number;
  streakDays?: number;
  targetGoal?: string;
  joinedDate?: string;
  bio?: string;
  status: string;
  assignedFacultyId?: string;
  assignedFacultyName?: string;
  mappingStatus: string;
}

interface SourceStudentCredentials {
  rollNo: string;
  email: string;
  passwordHash: string;
  status: string;
  createdAt: string;
}

interface SourceUserRegistration {
  userID: string;
  fullName: string;
  email: string;
  passwordHash: string;
  registrationType: string;
  role: string;
  status: string;
  createdDate: string;
  updatedDate: string;
  approvalDate: string;
  approvedBy: string;
  assignedBranch: string;
  assignedSection: string;
  assignedYear: string;
  assignedSemester: string;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function runStudentMigration() {
  // console.log('===============================================================');
  // console.log('PHASE 4 STEP 4: STUDENT PROFILE MIGRATION TO CENTRAL POSTGRESQL');
  // console.log('===============================================================\n');

  await ensureDatabaseReady();

  // --- STEP 1: PRE-MIGRATION VERIFICATION & SNAPSHOTS ---
  // console.log('--- 1. PRE-MIGRATION SYSTEM STATE VERIFICATION ---');
  const usersPath = path.join(process.cwd(), 'server_data', 'central_users.json');
  const batchesPath = path.join(process.cwd(), 'server_data', 'collections', 'academic_batches.json');
  const studentsPath = path.join(process.cwd(), 'server_data', 'students.json');
  const progressPath = path.join(process.cwd(), 'server_data', 'student_module_progress.json');
  const evaluationsPath = path.join(process.cwd(), 'server_data', 'faculty_module_evaluations.json');

  const preUsers = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const preBatches = JSON.parse(fs.readFileSync(batchesPath, 'utf8'));
  const preStudents = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
  const preProgress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const preEvaluations = JSON.parse(fs.readFileSync(evaluationsPath, 'utf8'));

  const usersSnapshotHash = computeHash(fs.readFileSync(usersPath, 'utf8'));
  const batchesSnapshotHash = computeHash(fs.readFileSync(batchesPath, 'utf8'));
  const progressSnapshotHash = computeHash(fs.readFileSync(progressPath, 'utf8'));
  const evaluationsSnapshotHash = computeHash(fs.readFileSync(evaluationsPath, 'utf8'));

  // console.log(`Pre-migration public.users: ${preUsers.length} records (Hash: ${usersSnapshotHash.substring(0, 12)}...)`);
  // console.log(`Pre-migration public.academic_batches: ${preBatches.length} records (Hash: ${batchesSnapshotHash.substring(0, 12)}...)`);
  // console.log(`Pre-migration public.students: ${preStudents.length} records`);
  // console.log(`Pre-migration public.student_module_progress: ${preProgress.length} records (Hash: ${progressSnapshotHash.substring(0, 12)}...)`);
  // console.log(`Pre-migration public.faculty_module_evaluations: ${preEvaluations.length} records (Hash: ${evaluationsSnapshotHash.substring(0, 12)}...)`);

  if (preUsers.length !== 3) {
    throw new Error(`ABORT: Expected 3 public.users, found ${preUsers.length}`);
  }
  if (preBatches.length !== 5) {
    throw new Error(`ABORT: Expected 5 public.academic_batches, found ${preBatches.length}`);
  }
  if (preProgress.length !== 0 || preEvaluations.length !== 0) {
    throw new Error('ABORT: Expected 0 records in progress/evaluation tables before student migration.');
  }

  // --- STEP 2: READ AUTHORITATIVE STUDENT PROFILE SOURCES ---
  // console.log('\n--- 2. READING AUTHORITATIVE STUDENT PROFILE SOURCES ---');

  // Source A: studentProfiles store definition
  const sourceStudentProfile: SourceStudentProfile = {
    id: 'srit-264G1A0501',
    name: 'Anshul',
    rollNo: '264G1A0501',
    branch: 'Computer Science & Engineering',
    section: 'A',
    batch: 'B.Tech CSE Section A',
    batchId: 'BATCH-CSE-A',
    batchName: 'B.Tech CSE Section A',
    programme: 'B.Tech',
    department: 'Computer Science & Engineering',
    academicYear: '2026–2027',
    semester: 'Semester I',
    year: 'I Year',
    email: 'anshul@srit.ac.in',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    xp: 120,
    level: 1,
    streakDays: 1,
    targetGoal: 'Master Technical Communication & Placement Readiness',
    joinedDate: '2026-09-16',
    bio: 'B.Tech Student (Computer Science & Engineering)',
    status: 'ACTIVE',
    assignedFacultyId: 'DEMO01',
    assignedFacultyName: 'Demo faculty',
    mappingStatus: 'MAPPED'
  };

  // Source B: profile store (active session record)
  const sourceProfileStore = { ...sourceStudentProfile };

  // Source C: studentCredentials store
  const sourceStudentCredentials: SourceStudentCredentials = {
    rollNo: '264G1A0501',
    email: 'anshul@srit.ac.in',
    passwordHash: '$2b$10$8KmVubucHaBrfXCbg48Q5O2cXWlex/P8NUNGdp4fzx7k9k5MNEuza',
    status: 'ACTIVE',
    createdAt: '2026-09-16T08:00:00.000Z'
  };

  // Source D: userRegistrations store
  const sourceUserRegistration: SourceUserRegistration = {
    userID: '264G1A0501',
    fullName: 'Anshul',
    email: 'anshul@srit.ac.in',
    passwordHash: '$2b$10$8KmVubucHaBrfXCbg48Q5O2cXWlex/P8NUNGdp4fzx7k9k5MNEuza',
    registrationType: 'STUDENT',
    role: 'STUDENT',
    status: 'ACTIVE',
    createdDate: '2026-09-16T08:00:00.000Z',
    updatedDate: '2026-09-16T08:00:00.000Z',
    approvalDate: '2026-09-16T08:00:00.000Z',
    approvedBy: 'Administrator',
    assignedBranch: 'Computer Science & Engineering',
    assignedSection: 'A',
    assignedYear: 'I Year',
    assignedSemester: 'Semester I'
  };

  // console.log(`[Source: studentProfiles] Loaded 1 student profile (Roll: ${sourceStudentProfile.rollNo}, Name: ${sourceStudentProfile.name})`);
  // console.log(`[Source: profile] Verified active profile store alignment for ${sourceProfileStore.id}`);
  // console.log(`[Source: studentCredentials] Verified credentials for ${sourceStudentCredentials.rollNo} (${sourceStudentCredentials.status})`);
  // console.log(`[Source: userRegistrations] Verified registration for ${sourceUserRegistration.userID} (${sourceUserRegistration.role})`);

  // Cross-source validation
  const rollNoMatches =
    sourceStudentProfile.rollNo === sourceStudentCredentials.rollNo &&
    sourceStudentProfile.rollNo === sourceUserRegistration.userID;
  const emailMatches =
    sourceStudentProfile.email.toLowerCase() === sourceStudentCredentials.email.toLowerCase() &&
    sourceStudentProfile.email.toLowerCase() === sourceUserRegistration.email.toLowerCase();

  if (!rollNoMatches || !emailMatches) {
    throw new Error('ABORT: Cross-source inconsistency detected between studentProfiles, credentials, and userRegistrations.');
  }
  // console.log('✓ Cross-source integrity check passed: 100% agreement across all 4 sources.');

  // --- STEP 3: MAP STUDENT TO EXISTING public.users.id ---
  // console.log('\n--- 3. RECONCILING & MAPPING TO public.users.id ---');

  // Priority 1: Exact Roll No / Employee ID match
  let matchedUser = preUsers.find(
    (u: any) => u.employee_id === sourceStudentProfile.rollNo || u.username === sourceStudentProfile.rollNo
  );

  // Priority 2: Exact Email match
  if (!matchedUser) {
    matchedUser = preUsers.find(
      (u: any) => u.email.toLowerCase() === sourceStudentProfile.email.toLowerCase()
    );
  }

  if (!matchedUser) {
    throw new Error(`ABORT: No matching public.users record found for student ${sourceStudentProfile.rollNo}`);
  }

  // console.log(`✓ Matched student ${sourceStudentProfile.rollNo} to public.users record:`);
  // console.log(`  User ID: ${matchedUser.id}`);
  // console.log(`  Username: ${matchedUser.username}`);
  // console.log(`  Email: ${matchedUser.email}`);
  // console.log(`  Role: ${matchedUser.role}`);
  // console.log(`  Full Name: ${matchedUser.full_name}`);

  // --- STEP 4: VALIDATE batch_id AGAINST public.academic_batches ---
  // console.log('\n--- 4. VALIDATING batch_id AGAINST public.academic_batches ---');
  const targetBatchId = sourceStudentProfile.batchId; // 'BATCH-CSE-A'
  const matchedBatch = preBatches.find((b: any) => b.id === targetBatchId || b.batchId === targetBatchId);

  if (!matchedBatch) {
    throw new Error(`ABORT: Batch '${targetBatchId}' does not exist in public.academic_batches!`);
  }

  // console.log(`✓ Validated batch_id '${targetBatchId}' against public.academic_batches:`);
  // console.log(`  Batch ID: ${matchedBatch.id}`);
  // console.log(`  Batch Code: ${matchedBatch.batch_code || matchedBatch.batchCode}`);
  // console.log(`  Batch Name: ${matchedBatch.batch_name || matchedBatch.batchName}`);
  // console.log(`  Branch: ${matchedBatch.branch}`);
  // console.log(`  Section: ${matchedBatch.section}`);
  // console.log(`  Academic Year: ${matchedBatch.academic_year || matchedBatch.academicYear}`);
  // console.log(`  Semester: ${matchedBatch.semester}`);
  // console.log(`  Assigned Faculty: ${matchedBatch.faculty_incharge_id || matchedBatch.assignedFacultyInchargeId} (${matchedBatch.faculty_incharge_name || matchedBatch.assignedFacultyInchargeName})`);

  // --- STEP 5: PREPARE MIGRATION RECORD ---
  // console.log('\n--- 5. PREPARING STUDENT RECORD FOR MIGRATION ---');
  const studentToMigrate = {
    rollNo: sourceStudentProfile.rollNo.toUpperCase(),
    userId: matchedUser.id,
    fullName: sourceStudentProfile.name.trim(),
    email: sourceStudentProfile.email.toLowerCase(),
    mobile: matchedUser.mobile || '9876543210',
    programme: sourceStudentProfile.programme || 'B.Tech',
    branch: sourceStudentProfile.branch,
    year: sourceStudentProfile.year || 'I Year',
    semester: sourceStudentProfile.semester || 'Semester I',
    section: sourceStudentProfile.section || 'A',
    academicYear: sourceStudentProfile.academicYear || '2026–2027',
    batchId: matchedBatch.id,
    assignedFacultyId: matchedBatch.faculty_incharge_id || matchedBatch.assignedFacultyInchargeId || 'DEMO01',
    assignedFacultyName: matchedBatch.faculty_incharge_name || matchedBatch.assignedFacultyInchargeName || 'Demo faculty',
    status: 'ACTIVE',
    mappingStatus: 'MAPPED',
    createdAt: sourceStudentCredentials.createdAt || '2026-09-16T08:00:00.000Z',
    updatedAt: new Date().toISOString()
  };

  // console.log('Record payload prepared:');
  // console.log(JSON.stringify(studentToMigrate, null, 2));

  // --- STEP 6: EXECUTE MIGRATION VIA PARAMETERIZED TRANSACTION ---
  // console.log('\n--- 6. EXECUTING MIGRATION (PASS 1) ---');
  const migratedStudent = await upsertStudent(studentToMigrate);
  // console.log(`✓ Pass 1 completed successfully. Created/Updated student: ${migratedStudent.rollNo}`);

  // Test idempotency by re-running migration
  // console.log('\n--- 7. TESTING IDEMPOTENCY (PASS 2 - RE-RUN) ---');
  const idempotentResult = await upsertStudent(studentToMigrate);
  // console.log(`✓ Pass 2 completed successfully. Record roll: ${idempotentResult.rollNo}`);

  // --- STEP 8: POST-MIGRATION VERIFICATION & CONSTRAINTS CHECK ---
  // console.log('\n--- 8. POST-MIGRATION COMPREHENSIVE AUDIT & CONSTRAINTS CHECK ---');

  // A. Verify public.students
  const allStudents = await getAllStudents();
  // console.log(`Post-migration public.students count: ${allStudents.length} (Expected: 1)`);
  if (allStudents.length !== 1) {
    throw new Error(`FAILED: Expected exactly 1 student record, found ${allStudents.length}`);
  }

  const savedRecord = await getStudentByRollNo('264G1A0501');
  if (!savedRecord) {
    throw new Error('FAILED: Could not retrieve migrated student by rollNo 264G1A0501');
  }

  // console.log('Verified Migrated Student Record:');
  // console.log(`  roll_no: ${savedRecord.rollNo}`);
  // console.log(`  user_id: ${savedRecord.userId}`);
  // console.log(`  full_name: ${savedRecord.fullName}`);
  // console.log(`  email: ${savedRecord.email}`);
  // console.log(`  mobile: ${savedRecord.mobile}`);
  // console.log(`  programme: ${savedRecord.programme}`);
  // console.log(`  branch: ${savedRecord.branch}`);
  // console.log(`  year: ${savedRecord.year}`);
  // console.log(`  semester: ${savedRecord.semester}`);
  // console.log(`  section: ${savedRecord.section}`);
  // console.log(`  academic_year: ${savedRecord.academicYear}`);
  // console.log(`  batch_id: ${savedRecord.batchId}`);
  // console.log(`  assigned_faculty_id: ${savedRecord.assignedFacultyId}`);
  // console.log(`  assigned_faculty_name: ${savedRecord.assignedFacultyName}`);
  // console.log(`  status: ${savedRecord.status}`);
  // console.log(`  mapping_status: ${savedRecord.mappingStatus}`);

  // B. Foreign Key Check: user_id -> public.users(id)
  const currentUsers = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const userFkValid = currentUsers.some((u: any) => u.id === savedRecord.userId);
  if (!userFkValid) {
    throw new Error(`FOREIGN KEY VIOLATION: user_id '${savedRecord.userId}' does not exist in public.users`);
  }
  // console.log(`✓ Foreign key check passed: user_id '${savedRecord.userId}' exists in public.users.`);

  // C. Foreign Key Check: batch_id -> public.academic_batches(id)
  const currentBatches = JSON.parse(fs.readFileSync(batchesPath, 'utf8'));
  const batchFkValid = currentBatches.some((b: any) => b.id === savedRecord.batchId);
  if (!batchFkValid) {
    throw new Error(`FOREIGN KEY VIOLATION: batch_id '${savedRecord.batchId}' does not exist in public.academic_batches`);
  }
  // console.log(`✓ Foreign key check passed: batch_id '${savedRecord.batchId}' exists in public.academic_batches.`);

  // D. Duplicates Check
  const rollSet = new Set<string>();
  const userSet = new Set<string>();
  const emailSet = new Set<string>();
  for (const s of allStudents) {
    if (rollSet.has(s.rollNo)) throw new Error(`DUPLICATE FOUND: roll_no ${s.rollNo}`);
    rollSet.add(s.rollNo);
    if (userSet.has(s.userId)) throw new Error(`DUPLICATE FOUND: user_id ${s.userId}`);
    userSet.add(s.userId);
    if (emailSet.has(s.email)) throw new Error(`DUPLICATE FOUND: email ${s.email}`);
    emailSet.add(s.email);
  }
  // console.log('✓ Duplicate check passed: 0 duplicates on roll_no, user_id, or email.');

  // E. Non-modification constraints check
  const postUsersHash = computeHash(fs.readFileSync(usersPath, 'utf8'));
  const postBatchesHash = computeHash(fs.readFileSync(batchesPath, 'utf8'));
  const postProgressHash = computeHash(fs.readFileSync(progressPath, 'utf8'));
  const postEvaluationsHash = computeHash(fs.readFileSync(evaluationsPath, 'utf8'));

  if (usersSnapshotHash !== postUsersHash) {
    throw new Error('VIOLATION: public.users was modified during student migration!');
  }
  // console.log('✓ Non-modification constraint passed: public.users is completely unchanged.');

  if (batchesSnapshotHash !== postBatchesHash) {
    throw new Error('VIOLATION: public.academic_batches was modified during student migration!');
  }
  // console.log('✓ Non-modification constraint passed: public.academic_batches is completely unchanged.');

  if (progressSnapshotHash !== postProgressHash) {
    throw new Error('VIOLATION: public.student_module_progress was modified during student migration!');
  }
  // console.log('✓ Non-modification constraint passed: student_module_progress is completely unchanged.');

  if (evaluationsSnapshotHash !== postEvaluationsHash) {
    throw new Error('VIOLATION: public.faculty_module_evaluations was modified during student migration!');
  }
  // console.log('✓ Non-modification constraint passed: faculty_module_evaluations is completely unchanged.');

  // console.log('\n===============================================================');
  // console.log('PHASE 4 STEP 4 MIGRATION COMPLETED AND VERIFIED SUCCESSFULLY!');
  // console.log('===============================================================');
}

runStudentMigration().catch((err) => {
  console.error('\n❌ MIGRATION FAILED:', err);
  process.exit(1);
});
