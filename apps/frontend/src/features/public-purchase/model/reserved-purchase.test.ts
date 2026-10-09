import type { Registration } from '@/entities/public-event';
import { describe, expect, it } from 'vitest';
import {
  parseReserved,
  readReserved,
  reservedPurchase,
  reservedStorageKey,
  serializeReserved,
} from './reserved-purchase';

const registration: Registration = {
  registrationId: 'reg-1',
  status: 'pending_payment',
  passes: [
    {
      passTypeId: 'breaking',
      name: 'Breaking',
      passClass: 'full',
      priceCents: 200000,
      selectedActivityIds: ['bboy'],
    },
  ],
  totalCents: 200000,
};

const reserved = {
  passes: [{ name: 'Breaking', priceCents: 200000 }],
  totalCents: 200000,
  email: 'ana@ejemplo.com',
};

describe('reserved purchase', () => {
  it('keeps only what the reserved screen shows', () => {
    expect(reservedPurchase(registration, ' ana@ejemplo.com ')).toEqual(reserved);
  });

  it('round-trips through storage per slug', () => {
    expect(reservedStorageKey('nov')).toBe('nb-purchase-reserved:nov');
    expect(parseReserved(serializeReserved(reserved))).toEqual(reserved);
  });

  it('reads router state and rejects anything malformed', () => {
    expect(readReserved(reserved)).toEqual(reserved);
    for (const value of [
      null,
      'text',
      [],
      { ...reserved, email: 3 },
      { ...reserved, totalCents: '200000' },
      { ...reserved, passes: [{ name: 'Breaking' }] },
      { ...reserved, passes: 'Breaking' },
    ])
      expect(readReserved(value)).toBeNull();
  });

  it('ignores missing, unparsable and other-version storage', () => {
    expect(parseReserved(null)).toBeNull();
    expect(parseReserved('{')).toBeNull();
    expect(parseReserved(JSON.stringify({ version: 2, ...reserved }))).toBeNull();
  });
});
