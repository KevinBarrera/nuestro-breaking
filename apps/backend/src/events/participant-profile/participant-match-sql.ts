import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// SQL twin of `phoneMatchKey` for stored phones, which are kept as entered.
export function phoneMatchKeySql(column: AnyPgColumn | SQL): SQL {
  const digits = sql`regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g')`;
  return sql`(CASE
    WHEN ${digits} ~ '^521[0-9]{10}$' THEN substr(${digits}, 4)
    WHEN ${digits} ~ '^52[0-9]{10}$' THEN substr(${digits}, 3)
    ELSE ${digits} END)`;
}
