import fs from 'fs';
import path from 'path';
import { ensureDatabaseReady, getAllAppData } from '../src/server/db';

interface SourceAccount {
  sourceStore: string;
  sourceId: string;
  email: string;
  username: string;
  fullName: string;
  role: string;
  employeeId?: string;
  mobile?: string;
  department?: string;
  designation?: string;
  passwordHash?: string;
  createdAt?: string;
  status?: string;
}

interface UserRecord {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: string;
  full_name: string;
  employee_id?: string | null;
  mobile?: string | null;
  department?: string | null;
  designation?: string | null;
  is_active?: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
  approved_at?: string | null;
  approved_by?: string | null;
}

type Classification =
  | 'ALREADY MATCHED'
  | 'SAFE TO INSERT'
  | 'CONFLICT'
  | 'DUPLICATE'
  | 'MANUAL REVIEW'
  | 'UNSAFE PASSWORD MIGRATION'
  | 'UNKNOWN ROLE';

function isBcryptHash(hash?: string): boolean {
  if (!hash) return false;
  // Standard bcrypt hash: $2a$, $2b$, or $2y$, 2-digit cost, 53 salt+hash chars
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

function normalizeRole(role: string): 'admin' | 'faculty' | 'student' | null {
  const r = role.toLowerCase().trim();
  if (r === 'admin' || r === 'administrator' || r === 'bootstrapp_admin') return 'admin';
  if (r === 'faculty' || r === 'faculty_incharge') return 'faculty';
  if (r === 'student') return 'student';
  return null;
}

async function runReconciliation() {
  // console.log('===============================================================');
  // console.log('PHASE 4 STEP 3: USER ACCOUNT RECONCILIATION & MIGRATION');
  // console.log('===============================================================\n');

  await ensureDatabaseReady();

  // --- STEP 1: PRE-MIGRATION VERIFICATION ---
  // console.log('--- 1. PRE-MIGRATION STATE VERIFICATION ---');
  const usersPath = path.join(process.cwd(), 'server_data', 'central_users.json');
  const studentsPath = path.join(process.cwd(), 'server_data', 'students.json');
  const progressPath = path.join(process.cwd(), 'server_data', 'student_module_progress.json');
  const evaluationsPath = path.join(process.cwd(), 'server_data', 'faculty_module_evaluations.json');

  const preUsers: UserRecord[] = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const preBatches = await getAllAppData('academic_batches');
  const preStudents = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
  const preProgress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const preEvaluations = JSON.parse(fs.readFileSync(evaluationsPath, 'utf8'));

  // console.log(`Pre-migration public.users count: ${preUsers.length}`);
  // console.log(`Pre-migration public.academic_batches count: ${preBatches.length} (Expected: 5)`);
  // console.log(`Pre-migration public.students count: ${preStudents.length} (Expected: 0)`);
  // console.log(`Pre-migration public.student_module_progress count: ${preProgress.length} (Expected: 0)`);
  // console.log(`Pre-migration public.faculty_module_evaluations count: ${preEvaluations.length} (Expected: 0)`);

  if (preBatches.length !== 5) {
    throw new Error(`ABORT: Expected 5 academic_batches, found ${preBatches.length}`);
  }
  if (preStudents.length !== 0 || preProgress.length !== 0 || preEvaluations.length !== 0) {
    throw new Error('ABORT: Expected empty student/progress/evaluation tables.');
  }

  // Snapshot original users to verify unchanged preservation
  const originalUsersSnapshot = JSON.stringify(preUsers);

  // --- STEP 2: GATHER SOURCE ACCOUNTS ---
  // console.log('\n--- 2. AUDITING SOURCE APPLICATION/INDEXEDDB ACCOUNTS ---');

  // Source accounts canonical representations from application stores:
  const sourceAccounts: SourceAccount[] = [
    {
      sourceStore: 'administrators',
      sourceId: 'SAILL_ADMIN',
      email: 'admin@srit.ac.in',
      username: 'SAILL_ADMIN',
      fullName: 'Dr Anil Kumar D',
      role: 'administrator',
      employeeId: 'SRIT-003',
      department: 'System Administration & Institutional Governance',
      designation: 'System Administrator & Lab In-Charge',
      passwordHash: '$2b$10$tJiyfaKnDdKin5e.0ega1e.9XOjGQ4m7cfESpbv0T74uD2KY3yqDi',
      createdAt: '2026-09-16T07:43:38.124Z',
      status: 'ACTIVE'
    },
    {
      sourceStore: 'faculty',
      sourceId: 'DEMO01',
      email: 'demo.faculty@srit.ac.in',
      username: 'DEMO01',
      fullName: 'Demo faculty',
      role: 'faculty_incharge',
      employeeId: 'DEMO01',
      mobile: '8778004869',
      department: 'Humanities & Sciences (English)',
      designation: 'Assistant Professor',
      passwordHash: '$2b$10$8KmVubucHaBrfXCbg48Q5O2cXWlex/P8NUNGdp4fzx7k9k5MNEuza',
      createdAt: '2026-09-12T07:37:19.158Z',
      status: 'active'
    },
    {
      sourceStore: 'userRegistrations (Faculty)',
      sourceId: 'DEMO01',
      email: 'demo.faculty@srit.ac.in',
      username: 'DEMO01',
      fullName: 'Demo faculty',
      role: 'FACULTY_INCHARGE',
      employeeId: 'DEMO01',
      passwordHash: '$2b$10$8KmVubucHaBrfXCbg48Q5O2cXWlex/P8NUNGdp4fzx7k9k5MNEuza',
      createdAt: '2026-09-12T07:37:19.158Z',
      status: 'ACTIVE'
    },
    {
      sourceStore: 'studentProfiles / studentCredentials',
      sourceId: '264G1A0501',
      email: 'anshul@srit.ac.in',
      username: '264G1A0501',
      fullName: 'Anshul',
      role: 'STUDENT',
      employeeId: '264G1A0501',
      mobile: '9876543210',
      department: 'Computer Science & Engineering',
      designation: 'Student',
      passwordHash: '$2b$10$8KmVubucHaBrfXCbg48Q5O2cXWlex/P8NUNGdp4fzx7k9k5MNEuza',
      createdAt: '2026-09-16T08:00:00.000Z',
      status: 'ACTIVE'
    },
    {
      sourceStore: 'userRegistrations (Student)',
      sourceId: '264G1A0501',
      email: 'anshul@srit.ac.in',
      username: '264G1A0501',
      fullName: 'Anshul',
      role: 'STUDENT',
      employeeId: '264G1A0501',
      passwordHash: '$2b$10$8KmVubucHaBrfXCbg48Q5O2cXWlex/P8NUNGdp4fzx7k9k5MNEuza',
      createdAt: '2026-09-16T08:00:00.000Z',
      status: 'ACTIVE'
    }
  ];

  // console.log(`Total source account entries audited: ${sourceAccounts.length}`);

  // --- STEP 3: MATCHING & CLASSIFICATION ---
  // console.log('\n--- 3. MATCHING & CLASSIFICATION ---');

  const reconciliationReport: {
    source: SourceAccount;
    classification: Classification;
    matchedUserId?: string;
    matchedBy?: string;
    details: string;
  }[] = [];

  const seenSourceKeys = new Set<string>();

  for (const src of sourceAccounts) {
    const dedupKey = `${src.email.toLowerCase()}:${src.username.toLowerCase()}`;
    const isDuplicateInSource = seenSourceKeys.has(dedupKey);
    seenSourceKeys.add(dedupKey);

    // Validate role
    const normalizedRole = normalizeRole(src.role);
    if (!normalizedRole) {
      reconciliationReport.push({
        source: src,
        classification: 'UNKNOWN ROLE',
        details: `Role '${src.role}' does not map to admin|faculty|student.`
      });
      continue;
    }

    // Validate password hash compatibility
    if (!isBcryptHash(src.passwordHash)) {
      reconciliationReport.push({
        source: src,
        classification: 'UNSAFE PASSWORD MIGRATION',
        details: 'Password hash is missing or not a compatible standard bcrypt hash.'
      });
      continue;
    }

    // Matching Priority:
    // 1. Exact user ID
    let matchedUser = preUsers.find(u => u.id === src.sourceId);
    let matchedBy = 'Exact user ID';

    // 2. Exact unique email
    if (!matchedUser) {
      matchedUser = preUsers.find(u => u.email.toLowerCase() === src.email.toLowerCase());
      matchedBy = 'Exact unique email';
    }

    // 3. Exact unique username
    if (!matchedUser) {
      matchedUser = preUsers.find(u => u.username.toLowerCase() === src.username.toLowerCase());
      matchedBy = 'Exact unique username';
    }

    // 4. Exact unique faculty employee_id
    if (!matchedUser && src.employeeId) {
      matchedUser = preUsers.find(u => u.employee_id && u.employee_id.toLowerCase() === src.employeeId!.toLowerCase());
      matchedBy = 'Exact unique employee_id';
    }

    if (matchedUser) {
      // Check for conflict (e.g. email matches but username points to someone else)
      const emailConflict = preUsers.some(
        u => u.id !== matchedUser!.id && u.email.toLowerCase() === src.email.toLowerCase()
      );
      const usernameConflict = preUsers.some(
        u => u.id !== matchedUser!.id && u.username.toLowerCase() === src.username.toLowerCase()
      );

      if (emailConflict || usernameConflict) {
        reconciliationReport.push({
          source: src,
          classification: 'CONFLICT',
          matchedUserId: matchedUser.id,
          matchedBy,
          details: `Conflict detected: Cross-matching email or username with another user.`
        });
        continue;
      }

      if (isDuplicateInSource) {
        reconciliationReport.push({
          source: src,
          classification: 'DUPLICATE',
          matchedUserId: matchedUser.id,
          matchedBy,
          details: `Duplicate representation of user across stores (${src.sourceStore}). Already mapped.`
        });
      } else {
        reconciliationReport.push({
          source: src,
          classification: 'ALREADY MATCHED',
          matchedUserId: matchedUser.id,
          matchedBy,
          details: `Matches existing public.users record ${matchedUser.id} via ${matchedBy}.`
        });
      }
    } else {
      // Not matched in public.users
      if (!src.email || !src.fullName) {
        reconciliationReport.push({
          source: src,
          classification: 'MANUAL REVIEW',
          details: 'Missing mandatory email or full name.'
        });
      } else {
        reconciliationReport.push({
          source: src,
          classification: 'SAFE TO INSERT',
          details: 'Valid, unrepresented user record ready for insertion.'
        });
      }
    }
  }

  // Print classifications
  reconciliationReport.forEach((r, idx) => {
    // console.log(`${idx + 1}. [${r.classification}] ${r.source.fullName} (${r.source.email})`);
    // console.log(`   Source Store: ${r.source.sourceStore} | Role: ${r.source.role}`);
    if (r.matchedUserId) {
      // console.log(`   Matched User ID: ${r.matchedUserId} via ${r.matchedBy}`);
    }
    // console.log(`   Details: ${r.details}\n`);
  });

  const matchedCount = reconciliationReport.filter(r => r.classification === 'ALREADY MATCHED').length;
  const duplicateCount = reconciliationReport.filter(r => r.classification === 'DUPLICATE').length;
  const safeToInsertCount = reconciliationReport.filter(r => r.classification === 'SAFE TO INSERT').length;
  const conflictCount = reconciliationReport.filter(r => r.classification === 'CONFLICT').length;
  const manualReviewCount = reconciliationReport.filter(r => r.classification === 'MANUAL REVIEW').length;

  // console.log('--- RECONCILIATION COUNTS ---');
  // console.log(`Already Matched: ${matchedCount}`);
  // console.log(`Duplicate (in source): ${duplicateCount}`);
  // console.log(`Safe to Insert: ${safeToInsertCount}`);
  // console.log(`Conflict: ${conflictCount}`);
  // console.log(`Manual Review: ${manualReviewCount}`);

  // --- STEP 4: EXECUTE MIGRATION FOR SAFE TO INSERT ---
  // console.log('\n--- 4. EXECUTION ---');
  let insertedCount = 0;
  const usersToInsert = reconciliationReport.filter(r => r.classification === 'SAFE TO INSERT');

  if (usersToInsert.length === 0) {
    // console.log('No new users qualify as "SAFE TO INSERT". All source accounts are already matched.');
  } else {
    // Parameterized idempotent insertion loop (if any existed)
    for (const item of usersToInsert) {
      const src = item.source;
      const newId = src.role.toLowerCase().includes('faculty')
        ? `fac_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        : src.role.toLowerCase().includes('student')
        ? `std_${src.username.toLowerCase()}`
        : crypto.randomUUID();

      const newUser: UserRecord = {
        id: newId,
        email: src.email.toLowerCase(),
        username: src.username,
        password_hash: src.passwordHash!,
        role: normalizeRole(src.role)!,
        full_name: src.fullName,
        employee_id: src.employeeId || null,
        mobile: src.mobile || null,
        department: src.department || null,
        designation: src.designation || null,
        is_active: true,
        status: src.status?.toLowerCase() || 'active',
        created_at: src.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      preUsers.push(newUser);
      insertedCount++;
      // console.log(`[INSERTED] User ${newUser.id} (${newUser.email})`);
    }

    // Atomic write
    fs.writeFileSync(usersPath, JSON.stringify(preUsers, null, 2), 'utf8');
  }

  // --- STEP 5: POST-MIGRATION VERIFICATION ---
  // console.log('\n--- 5. POST-MIGRATION VERIFICATION ---');
  const postUsers: UserRecord[] = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const postBatches = await getAllAppData('academic_batches');
  const postStudents = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
  const postProgress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const postEvaluations = JSON.parse(fs.readFileSync(evaluationsPath, 'utf8'));

  // console.log(`Final public.users count: ${postUsers.length}`);
  // console.log(`Inserted count: ${insertedCount}`);
  // console.log(`Matched count: ${matchedCount}`);
  // console.log(`Conflict / Manual Review count: ${conflictCount + manualReviewCount}`);

  // Verify no duplicate email or username
  const emailSet = new Set<string>();
  const usernameSet = new Set<string>();
  let duplicateFound = false;

  for (const u of postUsers) {
    if (emailSet.has(u.email.toLowerCase())) {
      console.error(`ERROR: Duplicate email detected in public.users: ${u.email}`);
      duplicateFound = true;
    }
    emailSet.add(u.email.toLowerCase());

    if (usernameSet.has(u.username.toLowerCase())) {
      console.error(`ERROR: Duplicate username detected in public.users: ${u.username}`);
      duplicateFound = true;
    }
    usernameSet.add(u.username.toLowerCase());
  }

  if (!duplicateFound) {
    // console.log('✓ No duplicate emails or usernames detected in public.users.');
  }

  // Verify existing users unchanged
  const postUsersBeforeLength = JSON.stringify(postUsers.slice(0, JSON.parse(originalUsersSnapshot).length));
  if (postUsersBeforeLength === originalUsersSnapshot) {
    // console.log('✓ All pre-existing public.users records are completely UNCHANGED.');
  } else {
    console.error('ERROR: Pre-existing public.users records were modified!');
  }

  // Verify other tables untouched
  if (
    postBatches.length === 5 &&
    postStudents.length === 0 &&
    postProgress.length === 0 &&
    postEvaluations.length === 0
  ) {
    // console.log('✓ No other database tables were modified (batches=5, students=0, progress=0, evaluations=0).');
  } else {
    console.error('ERROR: Other database tables were unexpectedly modified!');
  }

  // --- STEP 6: MAPPING READINESS AUDIT ---
  // console.log('\n--- 6. MAPPING READINESS AUDIT ---');

  // Student Roll 264G1A0501 -> public.users(id)
  const studentUser = postUsers.find(u => u.username === '264G1A0501' || u.employee_id === '264G1A0501');
  if (studentUser && studentUser.role === 'student') {
    // console.log(`✓ Student 264G1A0501 safely maps to public.users(id): '${studentUser.id}'`);
    // console.log(`  Full Name: ${studentUser.full_name} | Role: ${studentUser.role} | Status: ${studentUser.status}`);
  } else {
    console.error('✗ Student 264G1A0501 failed mapping to public.users!');
  }

  // Faculty DEMO01 -> public.users(id)
  const facultyUser = postUsers.find(u => u.employee_id === 'DEMO01' || u.username === 'DEMO01');
  if (facultyUser && facultyUser.role === 'faculty') {
    // console.log(`✓ Faculty DEMO01 safely maps to public.users(id): '${facultyUser.id}'`);
    // console.log(`  Full Name: ${facultyUser.full_name} | Role: ${facultyUser.role} | Status: ${facultyUser.status}`);
  } else {
    console.error('✗ Faculty DEMO01 failed mapping to public.users!');
  }

  // Administrator -> public.users(id)
  const adminUser = postUsers.find(u => u.username === 'SAILL_ADMIN');
  if (adminUser && adminUser.role === 'admin') {
    // console.log(`✓ Admin SAILL_ADMIN safely maps to public.users(id): '${adminUser.id}'`);
    // console.log(`  Full Name: ${adminUser.full_name} | Role: ${adminUser.role} | Status: ${adminUser.status}`);
  } else {
    console.error('✗ Admin SAILL_ADMIN failed mapping to public.users!');
  }
}

runReconciliation().catch(err => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
