import type { Environment } from '@/http';

export type MercadoPagoMode = 'sandbox' | 'production';

export interface MercadoPagoConfig {
  /** `sandbox` uses Mercado Pago test-account credentials; `production` uses the organizer's. */
  mode: MercadoPagoMode;
  /** Server-side access token; never log or echo it. */
  accessToken: string;
  /** Secret that verifies webhook `x-signature` headers; never log or echo it. */
  webhookSecret: string;
  /** Buyer-facing frontend origin (no path); Checkout Pro returns the buyer here. */
  publicAppUrl: string;
  /** Public URL Mercado Pago posts payment notifications to; https in production. */
  notificationUrl: string;
}

/** Injection token for the validated config, read once at startup by `PaymentsModule`. */
export const MERCADO_PAGO_CONFIG = Symbol('MERCADO_PAGO_CONFIG');

const MODES: readonly MercadoPagoMode[] = ['sandbox', 'production'];
const TEST_TOKEN_PREFIX = 'TEST-';

/**
 * Reads the single Mercado Pago credential set and its public URLs for this deployment; throws on
 * missing, blank, malformed or mismatched values. Error messages name the variable and the rule, never the value.
 */
export function readMercadoPagoConfig(env: Environment): MercadoPagoConfig {
  const mode = readRequired(env, 'MERCADO_PAGO_MODE');
  const accessToken = readRequired(env, 'MERCADO_PAGO_ACCESS_TOKEN');
  const webhookSecret = readRequired(env, 'MERCADO_PAGO_WEBHOOK_SECRET');
  const publicAppUrl = readRequired(env, 'PUBLIC_APP_URL');
  const notificationUrl = readRequired(env, 'MERCADO_PAGO_NOTIFICATION_URL');

  if (!isMode(mode)) {
    throw new Error('MERCADO_PAGO_MODE must be "sandbox" or "production".');
  }
  if (mode === 'production' && accessToken.startsWith(TEST_TOKEN_PREFIX)) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN must not be a TEST- credential in production mode.');
  }

  if (!isExactOrigin(publicAppUrl)) {
    throw new Error('PUBLIC_APP_URL must be an exact http(s) origin with no path.');
  }
  const notification = parseHttpUrl(notificationUrl);
  if (!notification) {
    throw new Error('MERCADO_PAGO_NOTIFICATION_URL must be an absolute http(s) URL.');
  }
  if (mode === 'production' && notification.protocol !== 'https:') {
    throw new Error('MERCADO_PAGO_NOTIFICATION_URL must use https in production mode.');
  }

  return { mode, accessToken, webhookSecret, publicAppUrl, notificationUrl };
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function isExactOrigin(value: string): boolean {
  return !value.includes('*') && parseHttpUrl(value)?.origin === value;
}

function isMode(value: string): value is MercadoPagoMode {
  return (MODES as readonly string[]).includes(value);
}

function readRequired(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
