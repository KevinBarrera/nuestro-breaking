export const userRoles = ['admin', 'judge', 'dancer'] as const;

export type UserRole = (typeof userRoles)[number];
export type AdminCapableRole = Extract<UserRole, 'admin' | 'judge'>;

export type User = {
  id: string;
  displayName: string;
  roles: UserRole[];
  // An active `admin` role in `global` scope: only these users manage the team (#214).
  globalAdmin: boolean;
};

export type UserSession = {
  user: User | null;
  expiresAt?: string;
};
