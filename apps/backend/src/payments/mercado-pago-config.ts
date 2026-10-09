import type { Environment } from '@/http';

export type MercadoPagoMode = 'sandbox' | 'production';

export interface MercadoPagoConfig {
  /** `sandbox` uses Mercado Pago test-account credentials; `production` uses the organizer's. */
  mode: MercadoPagoMode;
  /** Server-side access token; never log or echo it. */
  accessToken: string;
  /** Secret that verifies webhook `x-signature` headers; never log or echo it. */
  webhookSecret: string;
}

const MODES: readonly MercadoPagoMode[] = ['sandbox', 'production'];
const TEST_TOKEN_PREFIX = 'TEST-';

/**
 * Reads the single Mercado Pago credential set for this deployment; throws on missing,
 * blank or mismatched values. Error messages name the variable and the rule, never the value.
 */
export function readMercadoPagoConfig(env: Environment): MercadoPagoConfig {
  const mode = readRequired(env, 'MERCADO_PAGO_MODE');
  const accessToken = readRequired(env, 'MERCADO_PAGO_ACCESS_TOKEN');
  const webhookSecret = readRequired(env, 'MERCADO_PAGO_WEBHOOK_SECRET');

  if (!isMode(mode)) {
    throw new Error('MERCADO_PAGO_MODE must be "sandbox" or "production".');
  }
  if (mode === 'production' && accessToken.startsWith(TEST_TOKEN_PREFIX)) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN must not be a TEST- credential in production mode.');
  }

  return { mode, accessToken, webhookSecret };
}

function isMode(value: string): value is MercadoPagoMode {
  return (MODES as readonly string[]).includes(value);
}

function readRequired(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
