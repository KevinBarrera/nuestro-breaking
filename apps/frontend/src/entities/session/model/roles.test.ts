import { describe, expect, it } from 'vitest';
import { adminCapableRoles, isAdminCapableRole } from './roles';
import { userRoles } from './types';

describe('isAdminCapableRole', () => {
  it('lets admins and judges into the admin area', () => {
    expect(isAdminCapableRole('admin')).toBe(true);
    expect(isAdminCapableRole('judge')).toBe(true);
  });

  it('keeps dancers out of the admin area', () => {
    expect(isAdminCapableRole('dancer')).toBe(false);
  });

  it('agrees with the admin-capable role list for every known role', () => {
    expect(userRoles.filter(isAdminCapableRole)).toEqual([...adminCapableRoles]);
  });
});
