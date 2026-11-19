import type { PublicServiceCharge } from './types';

/**
 * The online service charge for `priceCents` of passes (#239), the same calculation the backend
 * applies at checkout: `total = (price + fixed × (1 + VAT)) / (1 − rate × (1 + VAT))`, rounded
 * up to the cent, minus the price. Nothing is charged when nothing is paid.
 */
export function serviceChargeCents(charge: PublicServiceCharge, priceCents: number): number {
  if (priceCents <= 0) return 0;
  const vatFactor = 10_000n + BigInt(charge.vatBasisPoints);
  // Both sides scaled by 10^8 so the division is the only rounding step.
  const numerator =
    (BigInt(priceCents) * 10_000n + BigInt(charge.fixedCents) * vatFactor) * 10_000n;
  const denominator = 100_000_000n - BigInt(charge.rateBasisPoints) * vatFactor;
  const totalCents = (numerator + denominator - 1n) / denominator;
  return Number(totalCents) - priceCents;
}
