/**
 * SAILL - SRIT AI Language Laboratory
 * Role-Based Access Control and Permissions
 */

import { UserRole } from '../types/auth';

export type Permission =
  | 'view_modules'
  | 'submit_activities'
  | 'view_own_progress'
  | 'evaluate_students'
  | 'manage_batches'
  | 'manage_academic_structure'
  | 'manage_users'
  | 'manage_system_settings';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  STUDENT: [
    'view_modules',
    'submit_activities',
    'view_own_progress'
  ],
  FACULTY_INCHARGE: [
    'view_modules',
    'evaluate_students',
    'manage_batches',
    'view_own_progress'
  ],
  ADMINISTRATOR: [
    'view_modules',
    'evaluate_students',
    'manage_batches',
    'manage_academic_structure',
    'manage_users',
    'manage_system_settings',
    'view_own_progress'
  ],
  BOOTSTRAP_ADMIN: [
    'view_modules',
    'evaluate_students',
    'manage_batches',
    'manage_academic_structure',
    'manage_users',
    'manage_system_settings',
    'view_own_progress'
  ]
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}
