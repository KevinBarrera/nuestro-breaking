import type { ReactNode } from 'react';
import { Link } from 'react-router';

type StepBarProps = {
  // Address of the outlined "Atrás" link.
  backTo: string;
  // The primary action, usually a button with `continueButtonClass`; it fills the remaining width.
  children: ReactNode;
};

// Sticky bottom bar of the steps after pases: "Atrás" and the step's primary action.
export function StepBar({ backTo, children }: StepBarProps) {
  return (
    <div className="sticky bottom-0 border-t border-line bg-surface px-5 pt-3.5 pb-5 shadow-[0_-6px_20px_rgb(0_0_0/0.08)]">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
        <Link
          to={backTo}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border-[1.5px] border-heading px-5 text-base font-bold text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Atrás
        </Link>
        <div className="flex min-w-0 flex-1 *:flex-1">{children}</div>
      </div>
    </div>
  );
}
