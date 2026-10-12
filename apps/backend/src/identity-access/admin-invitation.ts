import { randomBytes } from 'node:crypto';
import { hasControlCharacters } from './password-policy';
import { digest } from './session-access.service';

/** Activation links expire 72 hours after they are issued (#214 D4). */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

/** A fresh one-time token and the digest stored in `admin_invitations` (never the token itself). */
export function newInvitationToken(): { token: string; tokenDigest: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenDigest: digest(token) };
}

/** The token travels in the fragment, which browsers never send to servers or proxies (#214 D7). */
export function activationLink(origin: string, token: string): string {
  return `${origin}/activar-cuenta#${token}`;
}

/** Trimmed and lowercased like sign-in expects, or `null` when it is not a usable address. */
export function normalizeAdminEmail(raw: unknown): string | null {
  if (typeof raw !== 'string' || hasControlCharacters(raw)) return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

/** A trimmed, non-empty name of up to 200 characters, or `null`. */
export function normalizeAdminDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string' || hasControlCharacters(raw)) return null;
  const name = raw.trim();
  return name && name.length <= 200 ? name : null;
}
