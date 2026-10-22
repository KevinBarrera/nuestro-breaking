import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';

export type RegistrationStatus = 'pending_payment' | 'confirmed' | 'voided';

// Who holds the registration and its lifecycle state, so the admin sale screen survives a reload
// (#105). `folio` is null until confirmation. `channel` is `online` for a public checkout, which
// has an expiry, and `in_person` for an admin registration (#104). The name parts prefill the
// participant correction (#104); legacy rows may hold them as null. Deliberately no contact data.
export type RegistrationChannel = 'in_person' | 'online';

export type RegistrationSummary = {
  id: string;
  status: RegistrationStatus;
  folio: string | null;
  channel: RegistrationChannel;
  participant: {
    fullName: string;
    firstName: string | null;
    firstLastName: string | null;
    secondLastName: string | null;
    stageName: string | null;
  };
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

// A participant name correction (#104): the normalized name parts and AKA that replace the stored
// ones, null to clear an optional part. `confirmCrossEvent` acknowledges other events of the person.
export type ParticipantCorrection = {
  firstName: string;
  firstLastName: string;
  secondLastName: string | null;
  stageName: string | null;
  confirmCrossEvent: boolean;
};

// A discipline swap (#104): the full pass type that replaces the held one and its competitions,
// lowercased and unique.
export type DisciplineSwap = {
  toPassTypeId: string;
  activityIds: string[];
};
