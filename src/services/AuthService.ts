import { AuthUser, LoginCredentials, UserRole, normalizeRole } from '../types/auth';
import { dbStorage } from '../lib/db';
import { Page } from '../types';
import { getRedirectPageForRole, hasPageAccess } from '../utils/permissionMiddleware';
import { supabase } from '../lib/supabase';
import { SupabaseAuthService } from '../lib/auth';

const AUTH_SESSION_KEY = 'saill_auth_session';
const PENDING_APPROVAL_MESSAGE =
  'Your account is pending admin approval. Please wait until the administrator approves your registration.';

interface AdminStatusResult {
  hasAdmin: boolean;
  registrationAllowed: boolean;
  institutionName?: string;
  institutionShortName?: string;
  databaseType?: string;
  adminUsername?: string;
  adminEmail?: string;
  databaseConnected?: boolean;
  error?: string;
}

export class AuthService {
  private static adminStatusRequest: Promise<AdminStatusResult> | null = null;

  private static async loadAuthenticatedUser(authUserId: string, expectedRole?: UserRole): Promise<AuthUser> {
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to verify your account approval and role: ${error.message}`);
    }
    if (!profile) {
      throw new Error('Your account profile was not found. Please contact the administrator.');
    }

    const roleValue = String(profile.role || '').toLowerCase();
    const isAdministrator = roleValue === 'admin' || roleValue === 'administrator';
    const storedStatus = String(profile.status || '').toLowerCase();
    if (!isAdministrator && (storedStatus === 'pending' || storedStatus === 'pending_approval')) {
      throw new Error(PENDING_APPROVAL_MESSAGE);
    }
    const statusIsAuthorized = storedStatus === 'approved' || storedStatus === 'active';
    if (!statusIsAuthorized || profile.is_active !== true) {
      throw new Error('Your account is rejected, disabled, or inactive. Please contact the administrator.');
    }

    const role: UserRole | null =
      roleValue === 'student' ? 'STUDENT' :
      roleValue === 'faculty' || roleValue === 'faculty_incharge' ? 'FACULTY_INCHARGE' :
      isAdministrator ? 'ADMINISTRATOR' :
      null;
    if (!role) {
      throw new Error('Your account has no valid application role. Please contact the administrator.');
    }
    if (expectedRole && role !== expectedRole) {
      throw new Error(`This account is registered as ${role.toLowerCase().replace('_', ' ')}, not the selected role.`);
    }
    if (role === 'STUDENT') {
      if (!profile.roll_no) {
        throw new Error('Your student account has no registration number. Please contact the administrator.');
      }
      const { data: studentProfile, error: studentError } = await supabase
        .from('students')
        .select('roll_no, email, status')
        .eq('roll_no', profile.roll_no)
        .maybeSingle();
      if (studentError) {
        throw new Error(`Unable to verify your student profile: ${studentError.message}`);
      }
      if (!studentProfile ||
          String(studentProfile.email || '').toLowerCase() !== String(profile.email || '').toLowerCase() ||
          !['approved', 'active'].includes(
  String(studentProfile.status || '').toLowerCase()
)) {
        throw new Error('Your student profile is missing or does not match your account. Please contact the administrator.');
      }
    }
    if (role === 'FACULTY_INCHARGE' && !profile.employee_id) {
      throw new Error('Your faculty account has no employee ID. Please contact the administrator.');
    }

    return {
      id: authUserId,
      email: profile.email,
      name: profile.full_name,
      role,
      status: 'approved',
      username: profile.username || undefined,
      employeeId: profile.employee_id || undefined,
      rollNo: profile.roll_no || undefined,
      department: profile.department || undefined,
      designation: profile.designation || undefined,
      mobile: profile.mobile || undefined
    };
  }

  private static clearCachedSession(): void {
    try {
      localStorage.removeItem(AUTH_SESSION_KEY);
      localStorage.removeItem('saill_active_role');
      localStorage.removeItem('saill_active_roll_no');
      localStorage.removeItem('saill_active_faculty_id');
      localStorage.removeItem('saill_auth_token');
    } catch (error) {
      console.warn('Failed to clear cached auth session:', error);
    }
  }

  private static async rejectCurrentSession(reason: string): Promise<never> {
    const { error } = await supabase.auth.signOut();
    this.clearCachedSession();
    if (error) {
      throw new Error(`${reason} Supabase sign-out failed: ${error.message}`);
    }
    throw new Error(reason);
  }

  static async loginWithRole(credentials: LoginCredentials, selectedRole: UserRole): Promise<AuthUser> {
    const emailOrId = credentials.emailOrId.trim();
    if (!emailOrId) throw new Error('Please enter your Email Address or User Identifier.');
    if (!credentials.password) throw new Error('Please enter your Password.');

    const email = await SupabaseAuthService.resolveEmailFromIdentifier(emailOrId);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: credentials.password
    });
    if (error) {
      const invalidCredentials =
        error.code === 'invalid_credentials' ||
        error.message.toLowerCase() === 'invalid login credentials';
      if (invalidCredentials) {
        throw new Error(
          'Email/username or password is incorrect. Supabase Auth rejected the credentials. If this is a legacy administrator account, verify that the username resolves to its Supabase Auth email; an administrators app-data record alone cannot authenticate.'
        );
      }
      throw new Error(`Supabase sign-in failed: ${error.message}`);
    }
    if (!data.user) {
      throw new Error('Supabase Auth did not return an authenticated user.');
    }

    let user: AuthUser;
    try {
      user = await this.loadAuthenticatedUser(data.user.id, selectedRole);
    } catch (authorizationError) {
      const message = authorizationError instanceof Error
        ? authorizationError.message
        : 'Account authorization failed.';
      return this.rejectCurrentSession(message);
    }

    user.token = data.session?.access_token;
    this.saveSession(user);
    return user;
  }

  /**
   * Fallback login method with explicit credentials
   */
  static async login(credentials: LoginCredentials, explicitRole?: UserRole): Promise<AuthUser> {
    if (explicitRole) {
      return this.loginWithRole(credentials, explicitRole);
    }
    return this.loginWithRole(credentials, 'STUDENT');
  }

  static async restoreCurrentUser(): Promise<AuthUser | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      this.clearCachedSession();
      throw new Error(`Unable to restore the Supabase session: ${error.message}`);
    }
    if (!data.session?.user) {
      this.clearCachedSession();
      return null;
    }

    try {
      const user = await this.loadAuthenticatedUser(data.session.user.id);
      user.token = data.session.access_token;
      this.saveSession(user);
      return user;
    } catch (authorizationError) {
      const message = authorizationError instanceof Error
        ? authorizationError.message
        : 'Account authorization failed.';
      return this.rejectCurrentSession(message);
    }
  }

  static async revalidateCurrentUser(): Promise<AuthUser | null> {
    return this.restoreCurrentUser();
  }

  /**
   * Save session state to localStorage
   */
  static saveSession(user: AuthUser): void {
    try {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
      // Sync legacy active role key for components reading raw localStorage
      localStorage.setItem('saill_active_role', user.role);
      if (user.role === 'STUDENT' && user.rollNo) {
        localStorage.setItem('saill_active_roll_no', user.rollNo);
      }
      if (user.role === 'FACULTY_INCHARGE' && user.employeeId) {
        localStorage.setItem('saill_active_faculty_id', user.employeeId);
      }
      if (user.token) {
        localStorage.setItem('saill_auth_token', user.token);
      }
    } catch (e) {
      console.warn('Failed to save auth session to storage:', e);
    }
  }

  /**
   * Get auth headers for API requests
   */
  static getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem('saill_auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const user = this.getCurrentUser();
    if (user) {
      if (user.role) {
        headers['X-User-Role'] = user.role;
      }
      if (user.rollNo) {
        headers['X-Student-Roll'] = user.rollNo;
      }
      if (user.employeeId) {
        headers['X-Faculty-Id'] = user.employeeId;
      }
    }
    return headers;
  }

  /**
   * Get current authenticated user session
   */
  static getCurrentUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthUser;
      const knownRoles = ['STUDENT', 'FACULTY_INCHARGE', 'ADMINISTRATOR', 'BOOTSTRAP_ADMIN'];
      if (!parsed ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id) ||
          parsed.status !== 'approved' ||
          !knownRoles.includes(String(parsed.role).toUpperCase())) return null;
      parsed.role = normalizeRole(parsed.role);
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Clear session on logout
   */
  static async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(`Supabase sign-out failed: ${error.message}`);
    }
    this.clearCachedSession();
    try {
      localStorage.removeItem('saill_active_admin');
      localStorage.removeItem('saill_current_page');
      localStorage.removeItem('saill_last_refreshed_page');
      localStorage.removeItem('saill_last_refreshed_module_id');

      // Purge all user-scoped module progress, draft and notebook cache keys to prevent session leakage on shared devices
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('saill_mod_') || key.startsWith('saill_user_') || key.startsWith('saill_student_'))) {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }

    } catch (e) {
      console.warn('Error during logout cleanup:', e);
    }
    await dbStorage.logoutStudent();
  }

  /**
   * Determine redirection target based on role
   */
  static getRedirectPage(role: UserRole): Page {
    return getRedirectPageForRole(role);
  }

  /**
   * Verify permissions for a target page
   */
  static hasAccess(user: AuthUser | null, page: Page): boolean {
    if (page === 'landing') return true;
    if (!user || user.status !== 'approved') return false;
    return hasPageAccess(user.role, page);
  }

  /**
   * Check central database for Admin registration status
   */
  static checkAdminStatus(): Promise<AdminStatusResult> {
    if (this.adminStatusRequest) return this.adminStatusRequest;

    const request = this.fetchAdminStatus().finally(() => {
      this.adminStatusRequest = null;
    });
    this.adminStatusRequest = request;
    return request;
  }

  private static async fetchAdminStatus(): Promise<AdminStatusResult> {
    try {
      // Query Supabase public.users for admin accounts
      const { data: adminRows, error } = await supabase
        .from('users')
        .select('username,email')
        .in('role', ['admin', 'administrator'])
        .limit(1)
        .abortSignal(AbortSignal.timeout(8000));

      if (error) throw error;

      let foundAdmin = adminRows && adminRows.length > 0 ? adminRows[0] : null;

      if (!foundAdmin) {
        // Also check app_data administrators
        const localAdmin = await dbStorage.getAdminByUsernameOrEmail('admin');
        if (localAdmin) {
          foundAdmin = {
            username: localAdmin.username,
            email: localAdmin.email
          };
        }
      }

      const hasAdmin = Boolean(foundAdmin);

      return {
        hasAdmin,
        registrationAllowed: !hasAdmin,
        institutionName: 'SRIT Autonomous Engineering College',
        institutionShortName: 'SRIT',
        databaseType: 'Supabase PostgreSQL (Cloud)',
        adminUsername: foundAdmin?.username || (hasAdmin ? 'admin' : undefined),
        adminEmail: foundAdmin?.email || (hasAdmin ? 'admin@srit.ac.in' : undefined),
        databaseConnected: true
      };
    } catch (err: any) {
      return {
        hasAdmin: false,
        registrationAllowed: false,
        institutionName: 'SRIT Autonomous Engineering College',
        institutionShortName: 'SRIT',
        databaseType: 'Supabase PostgreSQL',
        databaseConnected: false,
        error: err?.name === 'TimeoutError' || err?.name === 'AbortError'
          ? 'Supabase admin status check timed out.'
          : 'Unable to verify administrator status with Supabase.'
      };
    }
  }

  /**
   * Reset central database administrator password
   */
  static async resetAdminPassword(emailOrUsername: string, newPassword: string): Promise<boolean> {
    try {
      await supabase.auth.updateUser({ password: newPassword });
    } catch {}

    try {
      await supabase
        .from('users')
        .update({ updated_at: new Date().toISOString() })
        .or(`email.ilike.${emailOrUsername},username.ilike.${emailOrUsername}`);
    } catch {}

    await dbStorage.updateAdminPassword(emailOrUsername, newPassword);
    return true;
  }

  /**
   * Register the primary Admin account permanently in the central users table
   */
  static async registerAdmin(payload: {
    fullName: string;
    email: string;
    password: string;
    mobile?: string;
    employeeId?: string;
    username?: string;
    department?: string;
    designation?: string;
    institutionName?: string;
    institutionShortName?: string;
  }): Promise<AuthUser> {
    void payload;
    throw new Error(
      'Administrator accounts cannot be created through public registration. Provision the initial administrator through a trusted Supabase administrative process.'
    );
  }

  static async registerFaculty(payload: {
    fullName: string;
    employeeId: string;
    email: string;
    mobile: string;
    department: string;
    designation: string;
    role?: string;
    password: string;
  }) {
    return dbStorage.registerFaculty({
      fullName: payload.fullName,
      employeeId: payload.employeeId,
      email: payload.email,
      mobile: payload.mobile,
      department: payload.department,
      designation: payload.designation,
      role: (payload.role === 'faculty' ? 'faculty' : 'faculty_incharge'),
      password: payload.password
    });
  }
}
