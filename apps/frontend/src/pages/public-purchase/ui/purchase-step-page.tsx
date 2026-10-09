import { PublicFrame, StepProgress } from '@/widgets/public-layout';
import { usePurchase } from './purchase-context';
import {
  purchaseStepCount,
  stepBefore,
  stepNumber,
  stepPath,
  type NumberedStep,
} from './purchase-steps';

const titles: Record<Exclude<NumberedStep, 'passes'>, string> = {
  competitions: 'Elige tus competencias',
  buyer: 'Tus datos',
  review: 'Revisa y paga',
};

// Steps 2–4 have their routes, header and progress; their screens come in later tasks of #176.
export function PurchaseStepPage({ step }: { step: Exclude<NumberedStep, 'passes'> }) {
  const { slug, catalog, selection } = usePurchase();
  return (
    <PublicFrame backTo={stepPath(slug, stepBefore(step, catalog.passes, selection))}>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-5">
        <StepProgress step={stepNumber(step)} total={purchaseStepCount} />
        <h1 className="text-[26px] leading-tight font-extrabold text-heading">{titles[step]}</h1>
        <p className="text-muted">Muy pronto podrás completar este paso aquí.</p>
      </main>
    </PublicFrame>
  );
}
