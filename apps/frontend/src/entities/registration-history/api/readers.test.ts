import { describe, expect, it } from 'vitest';
import { readHistoryPage } from './readers';

const item = {
  id: 'h1b2c3d4-1234-4567-89ab-123456789abc',
  occurredAt: '2026-11-14T18:04:00.000Z',
  operationType: 'cash_correction',
  actor: { kind: 'admin', name: 'Coordinación' },
  registration: {
    id: 'c1b2c3d4-1234-4567-89ab-123456789abc',
    folio: 'EB-0042',
    participantName: 'Ana López',
  },
  reason: 'Recibo equivocado',
  details: {
    kind: 'cash_correction',
    previous: { amountCents: 150000, receipt: 'A-1' },
    current: { amountCents: 120000, receipt: null },
  },
};
const counts = { all: 3, corrections: 1, on_site: 1, complimentary: 0 };
const page = (items: unknown[], nextCursor: unknown = null) => ({ items, nextCursor, counts });
const withDetails = (details: unknown) => ({ ...item, details });

describe('readHistoryPage', () => {
  it('reads a page of every known operation type', () => {
    const details = [
      { kind: 'manual_registration' },
      { kind: 'online_registration' },
      { kind: 'complimentary_confirmation' },
      { kind: 'pass_assignment', passTypeName: 'Pase completo' },
      { kind: 'pass_removal', passTypeName: null },
      {
        kind: 'pass_selection_change',
        passTypeName: 'Pase completo',
        fromActivityNames: ['Batalla 1vs1'],
        toActivityNames: [],
      },
      { kind: 'cash_confirmation', amountCents: 150000, receipt: null },
      item.details,
      { kind: 'payment_approval', amountCents: null, lateApproval: true },
      { kind: 'registration_void', fromStatus: 'confirmed', toStatus: 'voided' },
      { kind: 'registration_expiry', fromStatus: null, toStatus: null },
      { kind: 'registration_correction', changedFields: ['firstName'] },
      {
        kind: 'registration_discipline_swap',
        fromPassTypeName: 'Batalla 1vs1',
        toPassTypeName: null,
        fromActivityNames: [],
        toActivityNames: ['Batalla 2vs2'],
      },
      { kind: 'other' },
    ];
    const read = readHistoryPage(page(details.map(withDetails), 'next-page'));
    expect(read?.nextCursor).toBe('next-page');
    expect(read?.items.map((entry) => entry.details)).toEqual(details);
    expect(readHistoryPage(page([]))).toEqual({ items: [], nextCursor: null, counts });
  });

  it('reads unknown or future operation kinds as other', () => {
    const read = readHistoryPage(page([withDetails({ kind: 'refund', amountCents: 5 })]));
    expect(read?.items[0].details).toEqual({ kind: 'other' });
  });

  it('keeps only the whitelisted fields', () => {
    const read = readHistoryPage(
      page([{ ...withDetails({ kind: 'manual_registration', email: 'x' }), sessionId: 's' }]),
    );
    expect(read?.items[0]).not.toHaveProperty('sessionId');
    expect(read?.items[0].details).toEqual({ kind: 'manual_registration' });
  });

  it('rejects malformed pages and items', () => {
    expect(readHistoryPage(null)).toBeNull();
    expect(readHistoryPage({ items: [] })).toBeNull();
    expect(readHistoryPage({ items: [], nextCursor: null })).toBeNull();
    for (const bad of [{ ...counts, on_site: -1 }, { ...counts, all: 1.5 }, { all: 1 }, null])
      expect(readHistoryPage({ items: [], nextCursor: null, counts: bad })).toBeNull();
    expect(readHistoryPage(page([], 7))).toBeNull();
    expect(readHistoryPage(page([{ ...item, occurredAt: 'yesterday' }]))).toBeNull();
    expect(readHistoryPage(page([{ ...item, actor: { kind: 'judge', name: null } }]))).toBeNull();
    expect(readHistoryPage(page([{ ...item, reason: 3 }]))).toBeNull();
    expect(
      readHistoryPage(page([{ ...item, registration: { ...item.registration, folio: 1 } }])),
    ).toBeNull();
    expect(readHistoryPage(page([withDetails(null)]))).toBeNull();
    expect(
      readHistoryPage(page([withDetails({ kind: 'cash_confirmation', amountCents: '1500' })])),
    ).toBeNull();
    expect(
      readHistoryPage(page([withDetails({ kind: 'registration_correction', changedFields: [1] })])),
    ).toBeNull();
  });
});
