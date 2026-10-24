import { formatMxn } from '@/entities/event-catalog';
import { Breadcrumbs, buttonClass } from '@/shared/ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { stepperSteps, type StepperStep } from './new-registration-model';

// The shared frame of Nueva inscripción (#346): the participant step on its own route and the
// pass, cash and confirmed steps on the registration's sale route look like one screen.

// A decorative 20×20 stroke icon of the stepper screens.
export function StepperIcon({
  size,
  strokeWidth,
  className,
  children,
}: {
  size: number;
  strokeWidth: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

// One step's card section, with the 28px padding of the artboard on wider screens.
export const stepSection = 'flex flex-col gap-5 p-5 sm:p-7';
export const stepHeading = 'text-lg font-bold text-heading focus:outline-none';
export const stepLead = 'text-sm text-muted';

type StepperFrameProps = {
  listsPath: string;
  // The step indicator is hidden once the registration is confirmed (step 4).
  step: 1 | 2 | 3 | 4;
  children: ReactNode;
};

export function StepperFrame({ listsPath, step, children }: StepperFrameProps) {
  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="@container mx-auto flex max-w-[800px] flex-col gap-6">
        <Breadcrumbs
          items={[{ label: 'Inscripciones', to: listsPath }, { label: 'Nueva inscripción' }]}
        />
        <header className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Nueva inscripción</h1>
          <p className="text-muted">
            Inscripción en mesa con pago en efectivo. Toma unos 2 minutos.
          </p>
        </header>
        {step < 4 && <StepIndicator steps={stepperSteps(step as 1 | 2 | 3)} />}
        {children}
      </div>
    </main>
  );
}

const stateText: Record<StepperStep['state'], string> = {
  done: 'completado',
  current: 'paso actual',
  pending: 'pendiente',
};

const dotClass: Record<StepperStep['state'], string> = {
  done: 'border-success-fg bg-success text-success-fg',
  current: 'border-chip-selected bg-chip-selected text-chip-selected-fg',
  pending: 'border-input-line bg-surface text-muted',
};

// "Participante", "Pases", "Cobro": done steps get a check, the current one `aria-current`. On
// narrow screens the labels stay for screen readers only.
function StepIndicator({ steps }: { steps: StepperStep[] }) {
  return (
    <ol aria-label="Pasos" className="flex items-center gap-2">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <span
            aria-hidden="true"
            className={`flex size-8 flex-none items-center justify-center rounded-full border text-sm font-bold ${dotClass[step.state]}`}
          >
            {step.state === 'done' ? (
              <StepperIcon size={16} strokeWidth={2.25}>
                <path d="M4.5 10.5l3.5 3.5 7.5-8" />
              </StepperIcon>
            ) : (
              index + 1
            )}
          </span>
          <span
            className={`text-sm whitespace-nowrap @max-[640px]:sr-only ${step.state === 'current' ? 'font-bold text-heading' : 'font-semibold text-muted'}`}
          >
            {step.label}
          </span>
          <span className="sr-only">, {stateText[step.state]}</span>
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`h-0.5 min-w-4 flex-1 rounded-sm ${step.state === 'done' ? 'bg-success-fg' : 'bg-line'}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

const footerSecondary = buttonClass('secondary', 'inline-flex items-center gap-1.5');

type StepperFooterProps = {
  // Step 1 leaves for the list; the others go one step back.
  back: { kind: 'cancel'; to: string } | { kind: 'back'; onBack: () => void; disabled?: boolean };
  // The running total from the pass step on; null hides it.
  totalCents: number | null;
  next: { label: string; pendingLabel: string; pending: boolean; disabled?: boolean };
};

// The sticky footer of steps 1 to 3. The next action submits the step's form.
export function StepperFooter({ back, totalCents, next }: StepperFooterProps) {
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-line bg-surface px-5 py-4 sm:px-7">
      {back.kind === 'cancel' ? (
        <Link to={back.to} className={footerSecondary}>
          Cancelar
        </Link>
      ) : (
        <button
          type="button"
          className={footerSecondary}
          disabled={back.disabled}
          onClick={back.onBack}
        >
          <StepperIcon size={16} strokeWidth={1.75}>
            <path d="M12 5l-5 5 5 5" />
          </StepperIcon>
          Atrás
        </button>
      )}
      <span className="flex flex-[1_1_120px] items-baseline justify-end gap-2 text-sm text-muted">
        {totalCents !== null && (
          <>
            <span>Total</span>
            <span className="font-mono text-lg font-medium text-heading">
              {formatMxn(totalCents)}
            </span>
          </>
        )}
      </span>
      <button
        type="submit"
        disabled={next.pending || next.disabled}
        className={buttonClass(
          'primary',
          'inline-flex min-h-12 items-center justify-center gap-2 px-5 text-[15px] font-bold max-sm:basis-full',
        )}
      >
        {next.pending ? next.pendingLabel : next.label}
      </button>
    </div>
  );
}

// A write failure inside a step, with "Recargar" when only a fresh read can tell what happened.
export function StepFailure({
  message,
  onReload,
}: {
  message: string;
  onReload: (() => void) | null;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
    >
      <p>{message}</p>
      {onReload && (
        <button type="button" className={buttonClass('secondary')} onClick={onReload}>
          Recargar
        </button>
      )}
    </div>
  );
}
