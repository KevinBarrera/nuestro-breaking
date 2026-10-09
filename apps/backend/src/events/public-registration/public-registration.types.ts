import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';

/** Stable field error codes; the purchase screens (#176) map them to Spanish messages. */
export type FieldErrorCode =
  'required' | 'invalid' | 'too_long' | 'too_many' | 'duplicate' | 'in_future' | 'unknown_field';

/** Normalized buyer: email lowercased, phone trimmed as entered, Instagram without `@`. */
export type PublicRegistrationBuyer = {
  firstName: string;
  firstLastName: string;
  secondLastName: string | null;
  stageName: string | null;
  email: string;
  phone: string;
  city: string | null;
  instagram: string | null;
  level: string | null;
  birthDate: string | null;
};

export type RequestedPass = { passTypeId: string; selectedActivityIds: string[] };

export type PublicRegistrationRequest = {
  buyer: PublicRegistrationBuyer;
  passes: RequestedPass[];
};

/** Stable codes of catalog and duplicate rule violations (409). */
export type PublicRegistrationRuleCode =
  | 'pass_type_unavailable'
  | 'general_with_full'
  | 'required_pass_missing'
  | 'selection_unavailable'
  | 'registration_unavailable';

export type PublicRegistrationPass = {
  passTypeId: string;
  name: string;
  passClass: PassClass;
  priceCents: number;
  selectedActivityIds: string[];
};

export type PublicRegistrationResult = {
  registrationId: string;
  status: 'pending_payment';
  passes: PublicRegistrationPass[];
  totalCents: number;
};
