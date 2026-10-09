import type { Registration } from '@/entities/public-event';

// What the temporary "Reservamos tu inscripción" screen shows (D1, until #177). Pages pass it in
// router state and keep a copy in `sessionStorage` per slug, so a refresh still shows it. Only
// pass names, prices, the total and the email are kept: no registration id or other buyer data.
export type ReservedPurchase = {
  passes: { name: string; priceCents: number }[];
  totalCents: number;
  email: string;
};

const RESERVED_VERSION = 1;

export const reservedStorageKey = (slug: string) => `nb-purchase-reserved:${slug}`;

export function reservedPurchase(registration: Registration, email: string): ReservedPurchase {
  return {
    passes: registration.passes.map(({ name, priceCents }) => ({ name, priceCents })),
    totalCents: registration.totalCents,
    email: email.trim(),
  };
}

export function serializeReserved(reserved: ReservedPurchase): string {
  return JSON.stringify({ version: RESERVED_VERSION, ...reserved });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const isPassRow = (value: unknown) => {
  const row = record(value);
  return typeof row?.name === 'string' && typeof row.priceCents === 'number';
};

/** Router state or parsed storage as a reserved purchase; null when anything is malformed. */
export function readReserved(value: unknown): ReservedPurchase | null {
  const row = record(value);
  if (
    !row ||
    typeof row.email !== 'string' ||
    typeof row.totalCents !== 'number' ||
    !Array.isArray(row.passes) ||
    !row.passes.every(isPassRow)
  )
    return null;
  return {
    passes: (row.passes as Record<string, unknown>[]).map((pass) => ({
      name: pass.name as string,
      priceCents: pass.priceCents as number,
    })),
    totalCents: row.totalCents,
    email: row.email,
  };
}

export function parseReserved(raw: string | null): ReservedPurchase | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return record(value)?.version === RESERVED_VERSION ? readReserved(value) : null;
  } catch {
    return null;
  }
}
