// The redacted registration history of an event (#104): its audit facts, newest first, with a
// whitelisted projection per operation type. See `GET /admin/events/:eventId/registration-history`.
export const historyFilters = ['all', 'corrections', 'on_site', 'complimentary'] as const;
export const historyActorKinds = ['admin', 'public', 'system'] as const;

export type HistoryFilter = (typeof historyFilters)[number];
export type HistoryActorKind = (typeof historyActorKinds)[number];

export type HistoryCashValues = { amountCents: number | null; receipt: string | null };

// Unknown or future operation types read as `other`, so the screen never breaks on them.
export type HistoryDetails =
  | { kind: 'manual_registration' }
  | { kind: 'online_registration' }
  | { kind: 'complimentary_confirmation' }
  | { kind: 'pass_assignment'; passTypeName: string | null }
  | { kind: 'pass_removal'; passTypeName: string | null }
  | {
      kind: 'pass_selection_change';
      passTypeName: string | null;
      fromActivityNames: string[];
      toActivityNames: string[];
    }
  | { kind: 'cash_confirmation'; amountCents: number | null; receipt: string | null }
  | { kind: 'cash_correction'; previous: HistoryCashValues; current: HistoryCashValues }
  | { kind: 'payment_approval'; amountCents: number | null; lateApproval: boolean }
  | {
      kind: 'registration_void' | 'registration_expiry';
      fromStatus: string | null;
      toStatus: string | null;
    }
  | { kind: 'registration_correction'; changedFields: string[] }
  | {
      kind: 'registration_discipline_swap';
      fromPassTypeName: string | null;
      toPassTypeName: string | null;
      fromActivityNames: string[];
      toActivityNames: string[];
    }
  | { kind: 'other' };

export type HistoryActor = { kind: HistoryActorKind; name: string | null };

export type HistoryItem = {
  id: string;
  occurredAt: string;
  operationType: string;
  actor: HistoryActor;
  registration: { id: string; folio: string | null; participantName: string };
  reason: string | null;
  details: HistoryDetails;
};

// Operations per filter for the search, whatever filter is selected (#356). `on_site` counts
// on-site registrations, one per grouped entry.
export type HistoryCounts = Record<HistoryFilter, number>;

export type HistoryPage = {
  items: HistoryItem[];
  nextCursor: string | null;
  counts: HistoryCounts;
};

// `q` is the trimmed search (2 to 200 characters), left out to list everything.
export type HistoryQuery = { filter: HistoryFilter; cursor?: string; q?: string };

export type RegistrationHistoryFailure = 'denied' | 'not-found' | 'error';
