import type { AdminCapableRole, UserRole } from './types';

export const adminCapableRoles: readonly AdminCapableRole[] = ['admin', 'judge'];

export function isAdminCapableRole(role: UserRole): role is AdminCapableRole {
  return adminCapableRoles.includes(role as AdminCapableRole);
}
