import { apiUrl } from '@/shared/api';
import { userRoles, type User, type UserSession } from './types';

// Select only identity fields; neither the sign-in CSRF response nor other credentials
// belong in frontend session state.
function readSession(value: unknown): UserSession {
  if (!value || typeof value !== 'object' || !('user' in value)) throw new Error('Invalid session');
  const user = value.user;
  if (!user || typeof user !== 'object') throw new Error('Invalid user');
  const details = user as Record<string, unknown>;
  if (
    typeof details.id !== 'string' ||
    !Array.isArray(details.roles) ||
    !details.roles.every((role) => userRoles.some((known) => known === role))
  )
    throw new Error('Invalid user');
  const safeUser: User = {
    id: details.id,
    displayName: typeof details.displayName === 'string' ? details.displayName : '',
    roles: details.roles as User['roles'],
  };
  const expiresAt =
    'expiresAt' in value && typeof value.expiresAt === 'string' ? value.expiresAt : undefined;
  return { user: safeUser, ...(expiresAt ? { expiresAt } : {}) };
}

export async function getSession(signal: AbortSignal): Promise<UserSession> {
  const response = await fetch(apiUrl('/auth/session'), { credentials: 'include', signal });
  if (!response.ok) throw new Error('Session unavailable');
  return readSession(await response.json());
}

export async function signOut(): Promise<void> {
  const sessionResponse = await fetch(apiUrl('/auth/session'), { credentials: 'include' });
  if (!sessionResponse.ok) throw new Error('Session unavailable');
  const csrf = sessionResponse.headers.get('X-CSRF-Token');
  if (!csrf) throw new Error('CSRF token unavailable');

  const response = await fetch(apiUrl('/auth/sign-out'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  });
  if (!response.ok) throw new Error('Sign-out failed');
}

export async function signIn(email: string, password: string): Promise<UserSession> {
  const response = await fetch(apiUrl('/auth/admin/sign-in'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error('Sign-in failed');
  return readSession(await response.json());
}
