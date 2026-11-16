import crypto from 'crypto';

// Secret from runtime environment
const currentSecret = (process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim();
const oldSecret = 'saill_jwt_auth_secret_2026_srit_secure';

// console.log('====================================================');
// console.log('PHASE 5 — JWT SECRET ROTATION AUDIT & VERIFICATION');
// console.log('====================================================\n');

// 1. Secret loading check
// console.log('--- 1. RUNTIME JWT_SECRET LOADING ---');
// console.log('Runtime JWT_SECRET loaded:', Boolean(currentSecret));
// console.log('Runtime JWT_SECRET length:', currentSecret.length, 'characters');
// console.log('Differs from deprecated fallback:', currentSecret !== oldSecret);

if (!currentSecret || currentSecret.length < 32 || currentSecret === oldSecret) {
  console.error('FAIL: Runtime JWT_SECRET is not correctly loaded or is using the deprecated fallback.');
  process.exit(1);
}
// console.log('Status: PASS\n');

// Helper to create token with specified secret
function makeToken(payload, secret) {
  const data = { ...payload, exp: Date.now() + 3600000 };
  const jsonStr = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(jsonStr).digest('base64url');
  return `${jsonStr}.${sig}`;
}

// Helper to verify token with specified secret
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [jsonStr, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', secret).update(jsonStr).digest('base64url');
    if (signature !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(jsonStr, 'base64url').toString('utf-8'));
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// 2. Token generation & verification with current secret
// console.log('--- 2. TOKEN GENERATION & VERIFICATION (CURRENT SECRET) ---');
const testPayload = { userId: 'STU-AUDIT-01', role: 'STUDENT', rollNo: '244G1A0501', email: 'student01@srit.ac.in' };
const newToken = makeToken(testPayload, currentSecret);
const verifiedNew = verifyToken(newToken, currentSecret);

// console.log('Generated token with current secret:', Boolean(newToken));
// console.log('Verified token with current secret:', Boolean(verifiedNew && verifiedNew.userId === testPayload.userId));
// console.log('Status:', verifiedNew ? 'PASS' : 'FAIL', '\n');

// 3. Old secret / token rejection test
// console.log('--- 3. OLD SECRET & TOKEN REJECTION ---');
const oldToken = makeToken(testPayload, oldSecret);

const oldTokenTestedWithCurrentSecret = verifyToken(oldToken, currentSecret);
// console.log('Old token against current secret (expected null):', oldTokenTestedWithCurrentSecret);
const currentTokenTestedWithOldSecret = verifyToken(newToken, oldSecret);
// console.log('Current token against old secret (expected null):', currentTokenTestedWithOldSecret);

const oldTokenRejected = oldTokenTestedWithCurrentSecret === null && currentTokenTestedWithOldSecret === null;
// console.log('Cryptographic rejection of old secrets:', oldTokenRejected ? 'PASS' : 'FAIL', '\n');

// 4. Live API Authentication & Protected Route Tests
// console.log('--- 4. LIVE BACKEND AUTHENTICATION & RBAC ENDPOINT TESTS ---');

async function runLiveTests() {
  const baseUrl = 'http://localhost:3000';

  // Test A: GET /api/health
  const healthRes = await fetch(`${baseUrl}/api/health`);
  // console.log('Test A: GET /api/health status:', healthRes.status, '(expected 200)');

  // Test B: GET /api/admin/diagnostic
  const diagRes = await fetch(`${baseUrl}/api/admin/diagnostic`);
  const diagJson = await diagRes.json();
  // console.log('Test B: GET /api/admin/diagnostic status:', diagRes.status, 'DB connected:', diagJson.databaseConnected);

  // Test C: Protected Route: GET /api/students
  // With NO token -> 401
  const noTokenRes = await fetch(`${baseUrl}/api/students`);
  // console.log('Test C1: GET /api/students without token:', noTokenRes.status, '(expected 401)');

  // With OLD token -> 401
  const oldTokenStudentsRes = await fetch(`${baseUrl}/api/students`, {
    headers: { Authorization: `Bearer ${oldToken}` }
  });
  // console.log('Test C2: GET /api/students with OLD secret token:', oldTokenStudentsRes.status, '(expected 401)');

  // With CURRENT token (Admin role) -> 200
  const adminPayload = { userId: 'ADM-LIVE-01', role: 'ADMINISTRATOR', email: 'admin@srit.ac.in' };
  const currentAdminToken = makeToken(adminPayload, currentSecret);
  const currentAdminStudentsRes = await fetch(`${baseUrl}/api/students`, {
    headers: { Authorization: `Bearer ${currentAdminToken}` }
  });
  // console.log('Test C3: GET /api/students with CURRENT admin token:', currentAdminStudentsRes.status, '(expected 200)');

  // Test D: Protected Route: GET /api/student-progress/244G1A0501
  // With OLD token -> 401
  const oldTokenProgRes = await fetch(`${baseUrl}/api/student-progress/244G1A0501`, {
    headers: { Authorization: `Bearer ${oldToken}` }
  });
  // console.log('Test D1: GET /api/student-progress with OLD secret token:', oldTokenProgRes.status, '(expected 401)');

  // With CURRENT student token -> 200
  const currentStudentProgRes = await fetch(`${baseUrl}/api/student-progress/244G1A0501`, {
    headers: { Authorization: `Bearer ${newToken}` }
  });
  // console.log('Test D2: GET /api/student-progress with CURRENT student token:', currentStudentProgRes.status, '(expected 200)');

  // Test E: Protected Route: POST /api/academic/departments
  // With OLD token -> 401
  const oldTokenAcadRes = await fetch(`${baseUrl}/api/academic/departments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${oldToken}`
    },
    body: JSON.stringify({ id: 'dept-test-audit', name: 'Audit Department' })
  });
  // console.log('Test E1: POST /api/academic/:type with OLD secret token:', oldTokenAcadRes.status, '(expected 401)');

  // With CURRENT admin token -> 200
  const currentAdminAcadRes = await fetch(`${baseUrl}/api/academic/departments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentAdminToken}`
    },
    body: JSON.stringify({ id: 'dept-test-audit', name: 'Audit Department' })
  });
  // console.log('Test E2: POST /api/academic/:type with CURRENT admin token:', currentAdminAcadRes.status, '(expected 200)');

  // Clean up test department entity
  await fetch(`${baseUrl}/api/academic/departments/dept-test-audit`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${currentAdminToken}` }
  });

  // Test F: Protected Route: GET /api/evaluations/student/244G1A0501
  // With OLD token -> 401
  const oldTokenEvalRes = await fetch(`${baseUrl}/api/evaluations/student/244G1A0501`, {
    headers: { Authorization: `Bearer ${oldToken}` }
  });
  // console.log('Test F1: GET /api/evaluations/student with OLD secret token:', oldTokenEvalRes.status, '(expected 401)');

  // With CURRENT student token -> 200
  const currentStudentEvalRes = await fetch(`${baseUrl}/api/evaluations/student/244G1A0501`, {
    headers: { Authorization: `Bearer ${newToken}` }
  });
  // console.log('Test F2: GET /api/evaluations/student with CURRENT student token:', currentStudentEvalRes.status, '(expected 200)');

  // console.log('\nAll Live Backend Authentication & Rejection Tests: PASS');
}

runLiveTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
