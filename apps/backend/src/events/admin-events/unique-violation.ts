/**
 * Whether `error` is PostgreSQL's unique violation (`23505`) on `constraint`. Drizzle wraps driver
 * errors, so the PostgreSQL error may sit on the error itself or on any `cause` below it.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; current && typeof current === 'object';) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint_name === constraint) return true;
    current = candidate.cause;
  }
  return false;
}
