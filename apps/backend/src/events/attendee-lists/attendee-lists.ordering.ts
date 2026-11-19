import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import type { AttendeeListPassType } from './attendee-lists.types';

const PASS_CLASS_RANK: Record<PassClass, number> = { full: 0, general: 1, add_on: 2 };
const names = new Intl.Collator('es', { sensitivity: 'base' });

// Distinct held pass types ordered full → general → add-on, then name, then id.
export function orderPassTypes(held: readonly AttendeeListPassType[]): AttendeeListPassType[] {
  const distinct = new Map(held.map((passType) => [passType.id, passType]));
  return [...distinct.values()].sort(
    (left, right) =>
      PASS_CLASS_RANK[left.passClass] - PASS_CLASS_RANK[right.passClass] ||
      names.compare(left.name, right.name) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
}
