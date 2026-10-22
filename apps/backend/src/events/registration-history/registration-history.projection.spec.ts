import {
  type AuditFact,
  decodeCursor,
  detailsOf,
  encodeCursor,
  reasonOf,
  referencedIds,
} from './registration-history.projection';

const names = { passTypes: new Map<string, string>(), activities: new Map<string, string>() };
const fact = (overrides: Partial<AuditFact>): AuditFact => ({
  operationType: 'manual_registration',
  amountCents: null,
  receipt: null,
  note: null,
  beforeState: {},
  afterState: {},
  facts: {},
  ...overrides,
});

describe('registration history projection', () => {
  it('projects unknown or future operation types as other, without their stored values', () => {
    expect(
      detailsOf(fact({ operationType: 'refund', facts: { secret: 'x' }, note: 'n' }), names),
    ).toEqual({ kind: 'other' });
    expect(reasonOf(fact({ operationType: 'refund', note: 'n' }))).toBeNull();
  });

  it('keeps only reasons stored as the administrator reason', () => {
    expect(reasonOf(fact({ operationType: 'cash_confirmation', note: 'Paid at door' }))).toBeNull();
    expect(reasonOf(fact({ operationType: 'registration_void', note: 'Duplicate' }))).toBe(
      'Duplicate',
    );
  });

  it('tolerates malformed stored shapes and unresolved ids', () => {
    const odd = fact({
      operationType: 'registration_discipline_swap',
      facts: { fromPassTypeId: 7, toPassTypeId: 'not-a-uuid', fromActivityIds: 'x' },
    });
    expect(referencedIds([odd])).toEqual({ passTypeIds: [], activityIds: [] });
    expect(detailsOf(odd, names)).toEqual({
      kind: 'registration_discipline_swap',
      fromPassTypeName: null,
      toPassTypeName: null,
      fromActivityNames: [],
      toActivityNames: [],
    });
    expect(
      detailsOf(
        fact({ operationType: 'cash_correction', beforeState: null, afterState: [] }),
        names,
      ),
    ).toEqual({
      kind: 'cash_correction',
      previous: { amountCents: null, receipt: null },
      current: { amountCents: null, receipt: null },
    });
  });

  it('round-trips the cursors it issues and rejects anything else', () => {
    const cursor = {
      createdAt: '2026-10-21T12:00:00.123456Z',
      id: '00000000-0000-4000-8000-000000000000',
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(
      decodeCursor(encodeCursor({ ...cursor, createdAt: '2026-02-30T12:00:00.000000Z' })),
    ).toBeNull();
    expect(decodeCursor(`${encodeCursor(cursor)}=`)).toBeNull();
    expect(
      decodeCursor(Buffer.from(`${cursor.createdAt}|${cursor.id}|x`).toString('base64url')),
    ).toBeNull();
  });
});
