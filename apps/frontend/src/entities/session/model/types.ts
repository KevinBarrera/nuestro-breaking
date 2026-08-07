export const userRoles = ['admin', 'judge', 'dancer'] as const;

export type UserRole = (typeof userRoles)[number];
export type AdminCapableRole = Extract<UserRole, 'admin' | 'judge'>;

export type User = {
  id: string;
  displayName: string;
  role: UserRole;
};

export type UserSession = {
  user: User | null;
};
