// Shapes of the public, credential-less endpoints: `GET /public/events/:slug/catalog`
// (`docs/contracts/public-event-catalog.md`) and `POST /public/events/:slug/registrations`
// (`docs/contracts/public-registration.md`), and the Checkout Pro start
// `POST /public/events/:slug/registrations/:registrationId/checkout` (#177), and the payment status
// the return page polls, `GET .../registrations/:registrationId/payment-status`
// (`docs/contracts/public-payment-status.md`, #178).
export const publicPassClasses = ['full', 'general', 'add_on'] as const;
export const publicSalesClosedReasons = ['disabled', 'not_yet_open', 'ended'] as const;
export const paymentStatusValues = [
  'confirming',
  'confirmed',
  'pending',
  'rejected',
  'unavailable',
] as const;
export const registrationRuleCodes = [
  'pass_type_unavailable',
  'general_with_full',
  'required_pass_missing',
  'selection_unavailable',
] as const;

export type PublicPassClass = (typeof publicPassClasses)[number];
export type PublicSalesClosedReason = (typeof publicSalesClosedReasons)[number];
export type RegistrationRuleCode = (typeof registrationRuleCodes)[number];
export type PaymentStatusValue = (typeof paymentStatusValues)[number];

export type PublicActivity = {
  id: string;
  name: string;
  kind: string;
  startsAt: string;
  endsAt: string;
};

export type PublicPass = {
  id: string;
  name: string;
  passClass: PublicPassClass;
  priceCents: number;
  requiresPassClass: PublicPassClass | null;
  selectableActivities: PublicActivity[];
  includedActivities: PublicActivity[];
};

// Dates are ISO 8601 instants in UTC, or null; `timeZone` is the IANA zone to show them in.
export type PublicEventSummary = {
  slug: string;
  name: string;
  timeZone: string;
  startsAt: string | null;
  endsAt: string | null;
};

export type PublicSales = {
  opensAt: string | null;
  closesAt: string | null;
} & ({ state: 'open'; reason: null } | { state: 'closed'; reason: PublicSalesClosedReason });

// Passes are listed only while sales are open; a closed catalog has `passes: []`.
export type PublicCatalog = {
  event: PublicEventSummary;
  sales: PublicSales;
  passes: PublicPass[];
};

// Optional buyer fields are omitted when blank. `phone` carries its country prefix.
export type RegistrationBuyer = {
  firstName: string;
  firstLastName: string;
  secondLastName?: string;
  stageName?: string;
  email: string;
  phone: string;
  city?: string;
  instagram?: string;
  level?: string;
  birthDate?: string;
};

export type RegistrationRequest = {
  buyer: RegistrationBuyer;
  passes: { passTypeId: string; selectedActivityIds?: string[] }[];
};

export type RegistrationPass = {
  passTypeId: string;
  name: string;
  passClass: PublicPassClass;
  priceCents: number;
  selectedActivityIds: string[];
};

export type Registration = {
  registrationId: string;
  status: 'pending_payment';
  passes: RegistrationPass[];
  totalCents: number;
};

// Mercado Pago's hosted checkout page for one pending registration.
export type Checkout = { checkoutUrl: string };

// What the return page may show about a registration's payment (D1): a first name and a masked
// email only. `folio` is set only when `status` is `confirmed`.
export type PaymentStatusPass = { name: string; competitions: string[] };

export type PaymentStatus = {
  status: PaymentStatusValue;
  firstName: string;
  maskedEmail: string | null;
  folio: string | null;
  passes: PaymentStatusPass[];
  totalCents: number;
};

// Why a public request failed. `fieldErrors` maps a field path (`buyer.email`,
// `passes[0].passTypeId`) to the backend code (`required`, `invalid`, `too_long`, ...).
export type PublicEventFailure =
  | { kind: 'not-found' }
  | { kind: 'sales-closed'; reason: PublicSalesClosedReason }
  | { kind: 'invalid'; fieldErrors: Record<string, string> }
  | { kind: 'rule'; code: RegistrationRuleCode }
  | { kind: 'unavailable' }
  | { kind: 'not-payable' }
  | { kind: 'provider-unavailable' }
  | { kind: 'rate-limited' }
  | { kind: 'error' };
