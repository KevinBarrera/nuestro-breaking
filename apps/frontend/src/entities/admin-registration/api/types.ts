// Admin registration operation API shapes (#102, #103, #124, #125); see
// docs/contracts/admin-registration-operations.md and docs/contracts/event-catalog.md.

export const registrationStatuses = ['pending_payment', 'confirmed', 'voided'] as const;
export type RegistrationStatus = (typeof registrationStatuses)[number];

// `online` is a public checkout, which expires on its own; `in_person` an admin registration.
export const registrationChannels = ['in_person', 'online'] as const;
export type RegistrationChannel = (typeof registrationChannels)[number];

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
  // The held passes, archived pass types included, sorted by name (#344).
  passes: { name: string; passClass: HeldPassClass }[];
  activities: { id: string; name: string; kind: string; checkedInAt: string | null }[];
};

// Registrations matching `q` per status, ignoring the status filter; `total` counts both (#344).
export type RegistrationStatusCounts = Record<RegistrationStatus | 'all', number>;

export type RegistrationSearchPage = {
  total: number;
  counts: RegistrationStatusCounts;
  limit: number;
  offset: number;
  results: RegistrationSearchResult[];
};

// `q` matches name, email, AKA, folio or cash receipt number; 2 to 200 characters once trimmed.
// Without `q` (or a blank one) the whole roster is listed; `status` narrows it (#344).
// The backend pages 20 at a time by default (at most 50).
export type RegistrationSearchQuery = {
  q?: string;
  status?: RegistrationStatus;
  limit?: number;
  offset?: number;
};

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
// `folio` is null until confirmation. Only an in-person pending registration can be voided (#104).
// The name parts prefill the participant correction (#104); a legacy participant has them as null.
// `cash` is the current cash payment (#104), null when the registration was not confirmed in cash.
// It carries no contact data.
export type RegistrationSummary = {
  id: string;
  status: RegistrationStatus;
  folio: string | null;
  channel: RegistrationChannel;
  cash: CashPayment | null;
  participant: {
    fullName: string;
    firstName: string | null;
    firstLastName: string | null;
    secondLastName: string | null;
    stageName: string | null;
  };
};

export type RegistrationEntitlements = {
  registration: RegistrationSummary;
  passes: HeldPass[];
  accessibleActivityIds: string[];
};

// The current amount and paper receipt number of a cash confirmation, as corrected (#104). The
// receipt is null on a confirmation recorded before receipts were required (#125).
export type CashPayment = { amountCents: number; receipt: string | null };

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

// Confirms a $0 registration without payment (#263). `reason` is the required evidence: 1 to
// 500 characters once trimmed.
export type ComplimentaryConfirmationInput = { reason: string };

// The same answer as a cash confirmation.
export type ComplimentaryConfirmation = CashConfirmation;

// The participant correction (#104). All four name parts are always sent, because an omitted or
// blank optional part clears the stored one. `reason` goes to the audit: 1 to 500 characters once
// trimmed.
export type ParticipantCorrectionInput = {
  firstName: string;
  firstLastName: string;
  secondLastName: string;
  stageName: string;
  reason: string;
};

// The discipline swap (#104): the registration's only full pass moves to `toPassTypeId`, another
// active full pass of the event with the same current price, with that pass's selectable
// `activityIds`. `reason` goes to the audit: 1 to 500 characters once trimmed.
export type DisciplineSwapInput = {
  toPassTypeId: string;
  activityIds: string[];
  reason: string;
};

// The cash correction (#104): the amount and receipt replace the current ones (the receipt cannot be
// cleared), after the administrator checked the original paper receipt (`receiptChecked`, which the
// backend requires to be true). `reason` goes to the audit: 1 to 500 characters once trimmed.
export type CashCorrectionInput = {
  amountCents: number;
  receipt: string;
  reason: string;
  receiptChecked: boolean;
};

// Stable codes for the 400 and 409 rule answers of these writes. `receipt_taken`, `no_passes`,
// `not_zero_total`, `pass_required_by_add_on`, `online_registration_void_locked`,
// `correction_no_changes`, `cash_correction_not_cash` and the `discipline_swap_*` codes are backend
// `code`s; the rest are read
// from the backend message.
export const adminRegistrationRuleCodes = [
  'receipt_taken',
  'no_passes',
  'not_zero_total',
  'registration_not_pending',
  'registration_voided',
  'pass_type_archived',
  'pass_already_held',
  'full_includes_general',
  'add_on_requires_full',
  'add_on_requires_general',
  'invalid_activity_selection',
  'online_registration_pass_locked',
  'pass_required_by_add_on',
  'online_registration_void_locked',
  'correction_no_changes',
  'cash_correction_not_cash',
  'discipline_swap_single_full_pass_required',
  'discipline_swap_checked_in',
  'discipline_swap_invalid_target',
  'discipline_swap_price_mismatch',
] as const;
export type AdminRegistrationRuleCode = (typeof adminRegistrationRuleCodes)[number];

// `unauthorized` is a 401 (no session, a judge or an admin of another event, including the
// CSRF prefetch); `forbidden` a 403 (origin or CSRF check). `invalid` carries the 400
// `fieldErrors` codes (never the values). `possible_duplicates` is the 409 that asks to confirm
// its `matches` before the registration is made. `cross_event` is the 409 of a participant
// correction whose person has registrations in `otherEventCount` other events, to be confirmed
// before it is saved (#104). `not_found` is an unknown registration, pass
// type or held pass. `unknown` means the request was sent but its answer was lost or
// unreadable, so a write may have been applied; `error` covers everything else.
export type AdminRegistrationFailure =
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'invalid'; fieldErrors: Record<string, string> }
  | { kind: 'rule'; code: AdminRegistrationRuleCode }
  | { kind: 'possible_duplicates'; matches: PossibleDuplicate[] }
  | { kind: 'cross_event'; otherEventCount: number }
  | { kind: 'not_found' }
  | { kind: 'unknown' }
  | { kind: 'error' };
