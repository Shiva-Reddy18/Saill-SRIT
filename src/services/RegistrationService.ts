import {
  StudentRegistrationPayload,
  FacultyInchargeRegistrationPayload,
  UserRegistrationRecord
} from '../types/registration';
import { ValidationService } from './ValidationService';
import { dbStorage } from '../lib/db';

export class RegistrationService {
  /**
   * Universal Student Registration Processor
   * Enforces validation, duplicate checks, password hashing, and PENDING_APPROVAL status.
   */
  static async registerStudent(payload: StudentRegistrationPayload): Promise<UserRegistrationRecord> {
    // 1. Client-Side Field Validation
    const validation = ValidationService.validateStudent(payload);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(' '));
    }

    const rollNo = payload.rollNo.trim().toUpperCase();
    const email = payload.email.trim().toLowerCase();

    // 2. Duplicate Checks
    const isDuplicateRoll = await dbStorage.checkDuplicateRollNo(rollNo);
    if (isDuplicateRoll) {
      throw new Error(`Roll Number '${rollNo}' is already registered. Please login with your credentials.`);
    }

    const isDuplicateEmail = await dbStorage.checkDuplicateEmail(email);
    if (isDuplicateEmail) {
      throw new Error(`Email address '${email}' is already registered in the system.`);
    }

    // 3. Find matching academic batch
    const matchedBatch = await dbStorage.findBatchForStudent(
      payload.programme || 'B.Tech',
      payload.branch,
      payload.year,
      payload.semester,
      payload.section,
      payload.academicYear || ''
    );

    if (!matchedBatch) {
      throw new Error(
        `Invalid academic combination: No active batch found for ${payload.branch} (${payload.semester}, Section ${payload.section}). Registration cannot proceed without an official batch assignment.`
      );
    }
    if (!matchedBatch.id || !matchedBatch.academicYear?.trim()) {
      throw new Error(
        'The matched academic batch is missing its official batch ID or academic year. Ask an administrator to correct the batch configuration before registering.'
      );
    }

    const nowIso = new Date().toISOString();
    await dbStorage.registerStudent({
      name: payload.fullName.trim(),
      rollNo,
      email,
      mobile: payload.mobile,
      programme: payload.programme || 'B.Tech',
      branch: payload.branch,
      department: payload.branch,
      academicYear: matchedBatch.academicYear,
      year: payload.year,
      semester: payload.semester,
      section: payload.section,
      batch: matchedBatch.id
    }, payload.password);

    const registrationRecord: UserRegistrationRecord = {
      userID: rollNo,
      fullName: payload.fullName.trim(),
      email: email,
      passwordHash: 'managed_via_supabase_auth',
      registrationType: 'STUDENT',
      role: 'STUDENT',
      status: 'PENDING_APPROVAL',
      createdDate: nowIso,
      updatedDate: nowIso,
      approvalDate: null,
      approvedBy: null,
      assignedBranch: payload.branch,
      assignedSection: payload.section,
      assignedYear: payload.year,
      assignedSemester: payload.semester
    };

    return registrationRecord;
  }

  /**
   * Universal Faculty Incharge Registration Processor
   * Enforces validation, duplicate checks, password hashing, and PENDING_APPROVAL status.
   */
  static async registerFacultyIncharge(
    payload: FacultyInchargeRegistrationPayload
  ): Promise<UserRegistrationRecord> {
    // 1. Client-Side Field Validation
    const validation = ValidationService.validateFacultyIncharge(payload);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(' '));
    }

    const employeeId = payload.employeeId.trim().toUpperCase();
    const email = payload.email.trim().toLowerCase();

    // 2. Duplicate Checks
    const isDuplicateEmp = await dbStorage.checkDuplicateEmployeeId(employeeId);
    if (isDuplicateEmp) {
      throw new Error(`Employee ID '${employeeId}' is already registered in the system.`);
    }

    const isDuplicateEmail = await dbStorage.checkDuplicateEmail(email);
    if (isDuplicateEmail) {
      throw new Error(`Email address '${email}' is already registered in the system.`);
    }

    const nowIso = new Date().toISOString();

    await dbStorage.registerFaculty({
      fullName: payload.fullName.trim(),
      employeeId,
      email,
      mobile: payload.mobile || '',
      department: payload.department,
      designation: payload.designation,
      role: 'faculty_incharge',
      password: payload.password
    });

    // 4. Construct Database Model
    const registrationRecord: UserRegistrationRecord = {
      userID: employeeId,
      fullName: payload.fullName.trim(),
      email: email,
      passwordHash: 'managed_via_supabase_auth',
      registrationType: 'FACULTY_INCHARGE',
      role: 'FACULTY_INCHARGE',
      status: 'PENDING_APPROVAL',
      createdDate: nowIso,
      updatedDate: nowIso,
      approvalDate: null,
      approvedBy: null,
      assignedBranch: payload.department,
      assignedSection: null,
      assignedYear: null,
      assignedSemester: null
    };

    return registrationRecord;
  }
}
