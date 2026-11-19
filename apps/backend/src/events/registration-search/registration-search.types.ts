import type { ActivityKind } from '@/events/activity-admin/activity-kind';
import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import type { RegistrationStatus } from '@/events/registration-entitlements/registration-entitlements.types';

const REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  'pending_payment',
  'confirmed',
  'voided',
];

export const isRegistrationStatus = (value: unknown): value is RegistrationStatus =>
  REGISTRATION_STATUSES.includes(value as RegistrationStatus);

// `q` null lists the whole roster; `status` null keeps every status (#344).
export type RegistrationSearchFilter = { q: string | null; status: RegistrationStatus | null };

// `generalEntryOnly` is true when every held pass is general entry (at least one held): those
// registrations get the standalone event check-in. `activities` are the check-in eligible kinds
// (`workshop`, `competition`) the held passes give access to, sorted by id, each with its
// activity check-in time or null (#126). `passes` are the held passes, archived pass types
// included, sorted by name (#344).
export type RegistrationSearchResult = {
  participant: { id: string; fullName: string; email: string | null; stageName: string | null };
  registration: {
    id: string;
    eventId: string;
    folio: string | null;
    status: string;
    checkedInAt: string | null;
    generalEntryOnly: boolean;
  };
  passes: { name: string; passClass: PassClass }[];
  activities: { id: string; name: string; kind: ActivityKind; checkedInAt: string | null }[];
};

// `counts` are the registrations matching `q` per status, ignoring the status filter, so a
// filtered list still shows every status's number; `total` counts both filters (#344).
export type RegistrationStatusCounts = Record<RegistrationStatus | 'all', number>;

export type RegistrationSearchPage = {
  total: number;
  counts: RegistrationStatusCounts;
  limit: number;
  offset: number;
  results: RegistrationSearchResult[];
};
