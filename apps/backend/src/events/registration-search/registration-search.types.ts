import type { ActivityKind } from '@/events/activity-admin/activity-kind';

// `generalEntryOnly` is true when every held pass is general entry (at least one held): those
// registrations get the standalone event check-in. `activities` are the check-in eligible kinds
// (`workshop`, `competition`) the held passes give access to, sorted by id, each with its
// activity check-in time or null (#126).
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
  activities: { id: string; name: string; kind: ActivityKind; checkedInAt: string | null }[];
};

export type RegistrationSearchPage = {
  total: number;
  limit: number;
  offset: number;
  results: RegistrationSearchResult[];
};
