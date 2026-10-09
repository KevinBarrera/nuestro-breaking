import { PublicFrame, StepProgress } from '@/widgets/public-layout';
import { Navigate } from 'react-router';
import { usePurchase } from './purchase-context';
import {
  purchaseStepCount,
  stepBefore,
  stepNumber,
  stepPath,
  stepRedirect,
} from './purchase-steps';

// Step 4 (Revisa y paga) has its route, header and progress; its screen comes in T4 of #176.
export function PurchaseStepPage({ step }: { step: 'review' }) {
  const { slug, catalog, selection } = usePurchase();
  const redirect = stepRedirect(step, catalog.passes, selection);
  if (redirect) return <Navigate replace to={stepPath(slug, redirect)} />;
  return (
    <PublicFrame backTo={stepPath(slug, stepBefore(step, catalog.passes, selection))}>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-5">
        <StepProgress step={stepNumber(step)} total={purchaseStepCount} />
        <h1 className="text-[26px] leading-tight font-extrabold text-heading">Revisa y paga</h1>
        <p className="text-muted">Muy pronto podrás completar este paso aquí.</p>
      </main>
    </PublicFrame>
  );
}
