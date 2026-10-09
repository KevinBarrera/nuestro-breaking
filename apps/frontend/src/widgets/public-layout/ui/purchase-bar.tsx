import { formatMxn } from '@/entities/event-catalog';
import { useId } from 'react';
import { continueButtonClass, passCountLabel } from './purchase-styles';

type PurchaseBarProps = {
  passCount: number;
  totalCents: number;
  // Shown under the bar and linked to the button while it is disabled.
  blockedHint?: string | null;
  onContinue: () => void;
  className?: string;
};

// Sticky bottom bar of the purchase steps: how many passes, the total and "Continuar".
export function PurchaseBar({
  passCount,
  totalCents,
  blockedHint,
  onContinue,
  className = '',
}: PurchaseBarProps) {
  const hintId = useId();
  return (
    <section
      aria-label="Resumen de tu compra"
      className={`sticky bottom-0 border-t border-line bg-surface px-5 pt-3.5 pb-5 shadow-[0_-6px_20px_rgb(0_0_0/0.08)] ${className}`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm text-muted">{passCountLabel(passCount)}</span>
          <strong className="font-mono text-[22px] font-medium text-heading">
            {formatMxn(totalCents)}
          </strong>
        </div>
        <button
          type="button"
          disabled={!!blockedHint}
          aria-describedby={blockedHint ? hintId : undefined}
          onClick={onContinue}
          className={continueButtonClass}
        >
          Continuar
        </button>
      </div>
      {blockedHint ? (
        <p id={hintId} className="mx-auto mt-2 w-full max-w-6xl text-sm text-muted">
          {blockedHint}
        </p>
      ) : null}
    </section>
  );
}
