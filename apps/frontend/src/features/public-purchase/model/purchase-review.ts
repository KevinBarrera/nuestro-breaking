import type { PublicEventFailure, PublicPass } from '@/entities/public-event';
import { buyerFieldLabels, buyerFields, displayPhone, type BuyerForm } from './buyer-form';
import { normalizeSelection, type PurchaseSelection } from './purchase-selection';
import { failureMessage, serverErrors } from './registration-request';

// One row of the "Tus pases" card: a chosen pass with the competitions it covers (picked ones
// plus the ones it includes) and its catalog price.
export type ReviewLine = {
  passId: string;
  name: string;
  competitions: string[];
  priceCents: number;
};

export function reviewLines(passes: PublicPass[], selection: PurchaseSelection): ReviewLine[] {
  const normalized = normalizeSelection(passes, selection);
  return passes
    .filter((pass) => normalized.passTypeIds.includes(pass.id))
    .map((pass) => {
      const picked = normalized.selectedActivityIds[pass.id] ?? [];
      return {
        passId: pass.id,
        name: pass.name,
        competitions: [
          ...pass.selectableActivities.filter((activity) => picked.includes(activity.id)),
          ...pass.includedActivities,
        ].map((activity) => activity.name),
        priceCents: pass.priceCents,
      };
    });
}

// The "Tus datos" card: full name, AKA (null when blank), email and phone with +52.
export function reviewBuyer(buyer: BuyerForm) {
  const stageName = buyer.stageName.trim();
  return {
    name: [buyer.firstName, buyer.firstLastName, buyer.secondLastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' '),
    stageName: stageName || null,
    email: buyer.email.trim(),
    phone: displayPhone(buyer.phone),
  };
}

// The screen that fixes a failed payment attempt, if any. Without one, the buyer retries.
export type PayFix = 'home' | 'passes' | 'competitions' | 'buyer';
export type PayFailure = { message: string; details: string[]; fix: PayFix | null };

/** What the review screen shows when creating the registration fails. The draft is kept. */
export function payFailure(failure: PublicEventFailure): PayFailure {
  const only = (message: string, fix: PayFix | null = null): PayFailure => ({
    message,
    details: [],
    fix,
  });
  switch (failure.kind) {
    case 'invalid': {
      const errors = serverErrors(failure.fieldErrors);
      const details = buyerFields
        .filter((field) => errors.buyer[field])
        .map((field) => `${buyerFieldLabels[field]}: ${errors.buyer[field]}`);
      if (details.length > 0) return { message: 'Revisa estos datos:', details, fix: 'buyer' };
      if (errors.passes) return only(errors.passes, 'passes');
      return only(errors.other ?? failureMessage(failure), 'buyer');
    }
    case 'rule':
      return only(
        failureMessage(failure),
        failure.code === 'selection_unavailable' ? 'competitions' : 'passes',
      );
    case 'sales-closed':
    case 'not-found':
      return only(failureMessage(failure), 'home');
    case 'rate-limited':
      return only('Demasiados intentos, espera un momento e intenta de nuevo.');
    case 'unavailable':
    case 'not-payable':
    case 'provider-unavailable':
    case 'error':
      return only(failureMessage(failure));
  }
}
