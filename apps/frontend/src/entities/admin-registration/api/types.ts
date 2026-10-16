// Admin registration operation API shapes (#102, #103, #124, #125); see
// docs/contracts/admin-registration-operations.md and docs/contracts/event-catalog.md.

export const registrationStatuses = ['pending_payment', 'confirmed', 'voided'] as const;
export type RegistrationStatus = (typeof registrationStatuses)[number];

export const heldPassClasses = ['full', 'general', 'add_on'] as const;
export type HeldPassClass = (typeof heldPassClasses)[number];

// One row of `GET /admin/events/:eventId/participants`. Dates are ISO in UTC, or null.
export type RegistrationSearchResult = {
  participant: { id: string; fullName: string; email: string | null; stageName: string | null };
  registration: {
    id: string;
    eventId: string;
    folio: string | null;
    status: RegistrationStatus;
    checkedInAt: string | null;
  };
  activities: { id: string; name: string; kind: string; checkedInAt: string | null }[];
};

export type RegistrationSearchPage = {
  total: number;
  limit: number;
  offset: number;
  results: RegistrationSearchResult[];
};

// `q` matches name, email, AKA, folio or cash receipt number; 2 to 200 characters once trimmed.
// The backend pages 20 at a time by default (at most 50).
export type RegistrationSearchQuery = { q: string; limit?: number; offset?: number };

// The #58 participant fields of a manual registration. Optional text may be omitted or null.
// Activity ids are never sent: activities come from the passes added afterwards.
export type ManualRegistrationInput = {
  firstName: string;
  firstLastName: string;
  email: string;
  phone: string;
  secondLastName?: string | null;
  stageName?: string | null;
  city?: string | null;
  instagram?: string | null;
  level?: string | null;
  birthDate?: string | null;
};

export type ManualRegistration = {
  registrationId: string;
  participantId: string;
  eventId: string;
  status: 'pending_payment';
  auditId: string;
};

// A same-event registration that may belong to the person being registered; contact data
// comes masked, and is null when the participant has none.
export type PossibleDuplicate = {
  registrationId: string;
  fullName: string;
  stageName: string | null;
  folio: string | null;
  status: Exclude<RegistrationStatus, 'voided'>;
  maskedEmail: string | null;
  maskedPhone: string | null;
};

// A pass a registration holds; `priceCents` is the price paid when it was added.
export type HeldPass = {
  registrationPassId: string;
  passTypeId: string;
  name: string;
  passClass: HeldPassClass;
  priceCents: number;
  selections: string[];
};

// Who holds the registration and its state, so the sale screen works after a reload (#105).
// `folio` is null until confirmation. It carries no contact data.
export type RegistrationSummary = {
  id: string;
  status: RegistrationStatus;
  folio: string | null;
  participant: { fullName: string; stageName: string | null };
};

export type RegistrationEntitlements = {
  registration: RegistrationSummary;
  passes: HeldPass[];
  accessibleActivityIds: string[];
};

// `amountCents` is sent as `amount`. `receipt` is the paper receipt number: 1 to 50
// characters once trimmed, unique within the event.
export type CashPaymentInput = {
  amountCents: number;
  receipt: string;
  reference?: string | null;
  note?: string | null;
};

export type CashConfirmation = {
  registrationId: string;
  eventId: string;
  status: 'confirmed';
  folio: string;
  auditId: string;
};

// Stable codes for the 400 and 409 rule answers of these writes. Only `receipt_taken` is a
// backend `code`; the rest are read from the backend message.
export const adminRegistrationRuleCodes = [
  'receipt_taken',
  'registration_not_pending',
  'registration_voided',
  'pass_type_archived',
  'pass_already_held',
  'full_includes_general',
  'add_on_requires_full',
  'add_on_requires_general',
  'invalid_activity_selection',
] as const;
export type AdminRegistrationRuleCode = (typeof adminRegistrationRuleCodes)[number];

// `unauthorized` is a 401 (no session, a judge or an admin of another event, including the
// CSRF prefetch); `forbidden` a 403 (origin or CSRF check). `invalid` carries the 400
// `fieldErrors` codes (never the values). `possible_duplicates` is the 409 that asks to confirm
// its `matches` before the registration is made. `not_found` is an unknown registration, pass
// type or held pass. `unknown` means the request was sent but its answer was lost or
// unreadable, so a write may have been applied; `error` covers everything else.
export type AdminRegistrationFailure =
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'invalid'; fieldErrors: Record<string, string> }
  | { kind: 'rule'; code: AdminRegistrationRuleCode }
  | { kind: 'possible_duplicates'; matches: PossibleDuplicate[] }
  | { kind: 'not_found' }
  | { kind: 'unknown' }
  | { kind: 'error' };
