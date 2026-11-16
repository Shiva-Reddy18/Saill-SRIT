/**
 * SAILL - SRIT AI Language Laboratory
 * Supabase Auth Service
 */

import { supabase } from './supabase';
import { UserRole } from '../types/auth';

export interface SupabaseAuthProfile {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  username?: string;
  employeeId?: string;
  rollNo?: string;
  department?: string;
  designation?: string;
  mobile?: string;
  status?: string;
}

export class SupabaseAuthService {
  /**
   * Resolves non-email identifiers (username, roll number, or employee ID) to the registered email
   * uses secure SECURITY DEFINER RPC to prevent exposing email lists.
   */
  static async resolveEmailFromIdentifier(identifier: string): Promise<string> {
    const clean = identifier.trim();
    if (clean.includes('@')) {
      return clean.toLowerCase();
    }

    const { data, error } = await supabase.rpc('resolve_login_identifier', {
      identifier_input: clean
    });
    if (error) {
      throw new Error(`Unable to resolve the account identifier: ${error.message}`);
    }
    if (data?.found && data.email) {
      return String(data.email).toLowerCase();
    }

    return `${clean.toLowerCase()}@srit.ac.in`;
  }

  /**
   * Sign in using Supabase Auth
   */
  static async signIn(identifier: string, password: string) {
    const email = await this.resolveEmailFromIdentifier(identifier);
    const result = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { ...result, resolvedEmail: email };
  }

  /**
   * Sign up using Supabase Auth
   */
  static async signUp(email: string, password: string, metadata: Record<string, any> = {}) {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
  }

  /**
   * Reset password via Supabase Auth
   */
  static async resetPasswordForEmail(email: string) {
    return supabase.auth.resetPasswordForEmail(email);
  }

  /**
   * Update user password
   */
  static async updatePassword(newPassword: string) {
    return supabase.auth.updateUser({ password: newPassword });
  }

  /**
   * Sign out
   */
  static async signOut() {
    return supabase.auth.signOut();
  }

  /**
   * Get current Supabase auth session
   */
  static async getSession() {
    return supabase.auth.getSession();
  }

  /**
   * Listen for Supabase Auth state changes
   */
  static onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  }
}
