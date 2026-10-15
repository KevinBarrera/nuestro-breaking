import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';

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
  passes: HeldPass[];
  accessibleActivityIds: string[];
};
