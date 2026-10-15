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
  /** How often pending confirmation emails are retried, in ms; `0` turns the periodic retry off. */
  dispatchIntervalMs: number;
}

/** Injection token for the validated config, read once at startup by `NotificationsModule`. */
export const EMAIL_CONFIG = Symbol('EMAIL_CONFIG');

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reads the Brevo credential and sender for this deployment; throws on missing, blank or
 * malformed values. Error messages name the variable and the rule, never the value.
 * `EMAIL_SANDBOX` defaults to `true`, except when `NODE_ENV` is `production`.
 * `EMAIL_DISPATCH_INTERVAL_MS` defaults to one minute.
 */
export function readEmailConfig(env: Environment): EmailConfig {
  const apiKey = readRequired(env, 'BREVO_API_KEY');
  const senderAddress = readRequired(env, 'EMAIL_SENDER_ADDRESS');
  const senderName = readRequired(env, 'EMAIL_SENDER_NAME');

  if (!EMAIL_SHAPE.test(senderAddress)) {
    throw new Error('EMAIL_SENDER_ADDRESS must be an email address.');
  }

  return {
    apiKey,
    senderAddress,
    senderName,
    sandbox: readSandbox(env),
    dispatchIntervalMs: readDispatchInterval(env),
  };
}

const DEFAULT_DISPATCH_INTERVAL_MS = 60_000;
const MIN_DISPATCH_INTERVAL_MS = 1_000;
const MAX_DISPATCH_INTERVAL_MS = 86_400_000;

function readDispatchInterval(env: Environment): number {
  const value = env.EMAIL_DISPATCH_INTERVAL_MS?.trim();
  if (!value) return DEFAULT_DISPATCH_INTERVAL_MS;
  const interval = /^\d+$/.test(value) ? Number(value) : NaN;
  if (
    interval === 0 ||
    (interval >= MIN_DISPATCH_INTERVAL_MS && interval <= MAX_DISPATCH_INTERVAL_MS)
  )
    return interval;
  throw new Error(
    `EMAIL_DISPATCH_INTERVAL_MS must be 0 or a whole number of milliseconds from ${MIN_DISPATCH_INTERVAL_MS} to ${MAX_DISPATCH_INTERVAL_MS}.`,
  );
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
