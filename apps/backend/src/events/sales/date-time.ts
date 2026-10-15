// ISO 8601 date-time with an explicit offset, so a value never depends on the server time zone.
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Parse an ISO 8601 date-time that carries an explicit offset (`Z` or `±hh:mm`). Returns `null`
 * for any other shape and for impossible calendar values such as `2026-02-31` or `24:00`, which
 * `new Date` would silently roll over into the next month or day.
 */
export function parseOffsetDateTime(value: string): Date | null {
  const match = DATE_TIME.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map((part) => Number(part ?? 0));
  const millis = Number((match[7] ?? '0').padEnd(3, '0').slice(0, 3));
  const [sign, offsetHours, offsetMinutes] = [
    match[8],
    Number(match[9] ?? 0),
    Number(match[10] ?? 0),
  ];
  if (offsetHours > 23 || offsetMinutes > 59) return null;

  // Build the wall-clock time as if it were UTC, then check that no field rolled over.
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(hour, minute, second, millis);
  const fields = [
    wall.getUTCFullYear(),
    wall.getUTCMonth() + 1,
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
  ];
  if (fields.some((field, index) => field !== [year, month, day, hour, minute, second][index]))
    return null;

  const offset = (sign === '-' ? -1 : 1) * (offsetHours * 60 + offsetMinutes) * 60_000;
  return new Date(wall.getTime() - offset);
}
