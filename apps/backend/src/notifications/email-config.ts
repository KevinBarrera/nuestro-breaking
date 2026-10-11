import type { Environment } from '@/http';

export interface EmailConfig {
  /** Brevo v3 API key; never log or echo it. */
  apiKey: string;
  /** From address; its domain must be verified in Brevo before real delivery works (ADR 0007). */
  senderAddress: string;
  /** From display name shown to buyers. */
  senderName: string;
  /** When true, Brevo accepts and validates the message but never delivers it (D5). */
  sandbox: boolean;
}

/** Injection token for the validated config, read once at startup by `NotificationsModule`. */
export const EMAIL_CONFIG = Symbol('EMAIL_CONFIG');

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reads the Brevo credential and sender for this deployment; throws on missing, blank or
 * malformed values. Error messages name the variable and the rule, never the value.
 * `EMAIL_SANDBOX` defaults to `true`, except when `NODE_ENV` is `production`.
 */
export function readEmailConfig(env: Environment): EmailConfig {
  const apiKey = readRequired(env, 'BREVO_API_KEY');
  const senderAddress = readRequired(env, 'EMAIL_SENDER_ADDRESS');
  const senderName = readRequired(env, 'EMAIL_SENDER_NAME');

  if (!EMAIL_SHAPE.test(senderAddress)) {
    throw new Error('EMAIL_SENDER_ADDRESS must be an email address.');
  }

  return { apiKey, senderAddress, senderName, sandbox: readSandbox(env) };
}

function readSandbox(env: Environment): boolean {
  const value = env.EMAIL_SANDBOX?.trim();
  if (!value) return env.NODE_ENV?.trim() !== 'production';
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('EMAIL_SANDBOX must be "true" or "false".');
}

function readRequired(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
