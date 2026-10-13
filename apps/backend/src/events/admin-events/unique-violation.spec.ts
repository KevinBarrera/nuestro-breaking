import { isUniqueViolation } from './unique-violation';

// Shaped like the `postgres` driver's PostgresError for a duplicate slug.
const driverError = () =>
  Object.assign(new Error('duplicate key value violates unique constraint "events_slug_uq"'), {
    name: 'PostgresError',
    severity: 'ERROR',
    code: '23505',
    constraint_name: 'events_slug_uq',
    table_name: 'events',
  });

describe('isUniqueViolation', () => {
  it('recognises the driver error directly', () => {
    expect(isUniqueViolation(driverError(), 'events_slug_uq')).toBe(true);
  });

  it('recognises the driver error wrapped in cause, as Drizzle throws it', () => {
    const wrapped = new Error('Failed query: insert into "events"', { cause: driverError() });
    expect(isUniqueViolation(wrapped, 'events_slug_uq')).toBe(true);
    expect(isUniqueViolation(new Error('outer', { cause: wrapped }), 'events_slug_uq')).toBe(true);
  });

  it('ignores another constraint, another error code and non-errors', () => {
    expect(isUniqueViolation(driverError(), 'events_folio_prefix_uq')).toBe(false);
    expect(
      isUniqueViolation(Object.assign(driverError(), { code: '23503' }), 'events_slug_uq'),
    ).toBe(false);
    expect(isUniqueViolation(new Error('plain'), 'events_slug_uq')).toBe(false);
    expect(isUniqueViolation(undefined, 'events_slug_uq')).toBe(false);
    expect(isUniqueViolation('23505', 'events_slug_uq')).toBe(false);
  });
});
