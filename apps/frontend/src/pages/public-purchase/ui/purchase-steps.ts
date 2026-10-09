import type { PublicPass } from '@/entities/public-event';
import { competitionsStepApplies, type PurchaseSelection } from '@/features/public-purchase';
import { routes } from '@/shared/config';
import { generatePath } from 'react-router';

// The purchase flow: the event home, then four numbered steps, each its own URL (D2).
export type PurchaseStep = 'home' | 'passes' | 'competitions' | 'buyer' | 'review';
export type NumberedStep = Exclude<PurchaseStep, 'home'>;

const stepRoutes: Record<PurchaseStep, string> = {
  home: routes.publicEvent,
  passes: routes.publicPasses,
  competitions: routes.publicCompetitions,
  buyer: routes.publicBuyer,
  review: routes.publicReview,
};

const numberedSteps: NumberedStep[] = ['passes', 'competitions', 'buyer', 'review'];

export const purchaseStepCount = numberedSteps.length;

export const stepPath = (slug: string, step: PurchaseStep) =>
  generatePath(stepRoutes[step], { slug });

export const stepNumber = (step: NumberedStep) => numberedSteps.indexOf(step) + 1;

// D6: competitions are skipped when no chosen pass offers any to pick.
export function stepAfterPasses(passes: PublicPass[], selection: PurchaseSelection): NumberedStep {
  return competitionsStepApplies(passes, selection) ? 'competitions' : 'buyer';
}

// Where the back link of a step goes, skipping competitions when they do not apply.
export function stepBefore(
  step: NumberedStep,
  passes: PublicPass[],
  selection: PurchaseSelection,
): PurchaseStep {
  if (step === 'passes') return 'home';
  if (step === 'competitions') return 'passes';
  if (step === 'buyer')
    return stepAfterPasses(passes, selection) === 'competitions' ? 'competitions' : 'passes';
  return 'buyer';
}

// Where a step sends the buyer instead of rendering (a bookmark, a reload, an emptied draft):
// every step after pases needs a chosen pass, and competitions redirect to datos when they do
// not apply (D6). Null when the step can show.
export function stepRedirect(
  step: NumberedStep,
  passes: PublicPass[],
  selection: PurchaseSelection,
): NumberedStep | null {
  if (step === 'passes') return null;
  if (selection.passTypeIds.length === 0) return 'passes';
  if (step === 'competitions' && !competitionsStepApplies(passes, selection)) return 'buyer';
  return null;
}
