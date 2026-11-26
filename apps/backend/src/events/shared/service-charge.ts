import type { Environment } from '@/http';

/**
 * The online service charge that passes the Mercado Pago fee on to the buyer (#239). Rates come
 * from the organizer's Mercado Pago account and are set per environment; all values are exact
 * integers so the charge has no floating-point drift.
 */
export interface ServiceCharge {
  /** Percentage fee before VAT, in hundredths of a percent (3.49% is 349). */
  rateBasisPoints: number;
  /** Fixed fee per payment before VAT, in cents. */
  fixedCents: number;
  /** VAT charged on the fee, in hundredths of a percent (16% is 1600). */
  vatBasisPoints: number;
}

/** Injection token for the charge, read once at startup by the modules that use it. */
export const SERVICE_CHARGE = Symbol('SERVICE_CHARGE');

// Hundredths of a value with at most two decimals: "3.49" is 349, "16" is 1600.
const TWO_DECIMALS = /^(\d+)(?:\.(\d{1,2}))?$/;

export function readServiceCharge(env: Environment): ServiceCharge {
  return {
    rateBasisPoints: readHundredths(
      env,
      'ONLINE_SERVICE_CHARGE_PERCENT',
      4_999,
      'a percentage from 0 to 49.99',
    ),
    fixedCents: readHundredths(
      env,
      'ONLINE_SERVICE_CHARGE_FIXED_MXN',
      100_000,
      'an amount in MXN from 0 to 1000',
    ),
    vatBasisPoints: readHundredths(
      env,
      'ONLINE_SERVICE_CHARGE_VAT_PERCENT',
      10_000,
      'a percentage from 0 to 100',
    ),
  };
}

/**
 * The charge added to an online purchase of `priceCents`, so that after Mercado Pago takes its
 * fee (percentage and fixed amount, each plus VAT) the organizer keeps the full price. Mercado
 * Pago rounds the rate with VAT to a hundredth of a percent before applying it (3.49% × 1.16 is
 * charged as 4.05%, #406), so both fee parts are rounded up first:
 * `total = (price + ⌈fixed × (1 + VAT)⌉) / (1 − ⌈rate × (1 + VAT)⌉)`, rounded up to the cent.
 * Nothing is charged when nothing is paid.
 */
export function serviceChargeCents(charge: ServiceCharge, priceCents: number): number {
  if (priceCents <= 0) return 0;
  const vatFactor = 10_000n + BigInt(charge.vatBasisPoints);
  // The fee as Mercado Pago applies it: the rate with VAT in hundredths of a percent and the
  // fixed fee with VAT in cents, each rounded up so the organizer is never short.
  const rateWithVat = divideUp(BigInt(charge.rateBasisPoints) * vatFactor, 10_000n);
  const fixedWithVat = divideUp(BigInt(charge.fixedCents) * vatFactor, 10_000n);
  const totalCents = divideUp((BigInt(priceCents) + fixedWithVat) * 10_000n, 10_000n - rateWithVat);
  return Number(totalCents) - priceCents;
}

function divideUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function readHundredths(env: Environment, name: string, max: number, rule: string): number {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  const match = TWO_DECIMALS.exec(value);
  const hundredths = match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : NaN;
  if (hundredths <= max) return hundredths;
  throw new Error(`${name} must be ${rule} with at most two decimals.`);
}
