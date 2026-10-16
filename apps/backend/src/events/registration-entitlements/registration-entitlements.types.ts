import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';

export type RegistrationStatus = 'pending_payment' | 'confirmed' | 'voided';

// Who holds the registration and its lifecycle state, so the admin sale screen survives a reload
// (#105). `folio` is null until confirmation. Deliberately no contact data.
export type RegistrationSummary = {
  id: string;
  status: RegistrationStatus;
  folio: string | null;
  participant: { fullName: string; stageName: string | null };
};

// A purchased pass on a registration; `priceCents` is the price snapshot paid at assignment.
export type HeldPass = {
  registrationPassId: string;
  passTypeId: string;
  name: string;
  passClass: PassClass;
  priceCents: number;
  selections: string[];
};

// Admin read model. `accessibleActivityIds` is sorted and derived only from entitlement data.
export type RegistrationEntitlements = {
  registration: RegistrationSummary;
  passes: HeldPass[];
  accessibleActivityIds: string[];
};
