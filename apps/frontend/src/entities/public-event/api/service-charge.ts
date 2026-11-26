import type { PublicServiceCharge } from './types';

/**
 * The online service charge for `priceCents` of passes (#239), the same calculation the backend
 * applies at checkout. Mercado Pago rounds the rate with VAT to a hundredth of a percent (#406),
 * so both fee parts are rounded up first:
 * `total = (price + ⌈fixed × (1 + VAT)⌉) / (1 − ⌈rate × (1 + VAT)⌉)`, rounded up to the cent,
 * minus the price. Nothing is charged when nothing is paid.
 */
export function serviceChargeCents(charge: PublicServiceCharge, priceCents: number): number {
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
