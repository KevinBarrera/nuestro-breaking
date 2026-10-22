export const HISTORY_FILTERS = ['all', 'corrections'] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

export type HistoryCursor = { createdAt: string; id: string };

export type HistoryQuery = { limit: number; cursor: HistoryCursor | null; filter: HistoryFilter };

type CashValues = { amountCents: number | null; receipt: string | null };

// A whitelisted projection per operation type (#104): names resolved within the event, amounts and
// receipts, changed field names. Never the stored states, the payment reference or personal data.
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
  | { kind: 'cash_correction'; previous: CashValues; current: CashValues }
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

export type HistoryItem = {
  id: string;
  occurredAt: string;
  operationType: string;
  // `name` is the administrator's display name, null when empty and for public or system facts.
  actor: { kind: 'admin' | 'public' | 'system'; name: string | null };
  registration: { id: string; folio: string | null; participantName: string };
  reason: string | null;
  details: HistoryDetails;
};

export type HistoryPage = { items: HistoryItem[]; nextCursor: string | null };
