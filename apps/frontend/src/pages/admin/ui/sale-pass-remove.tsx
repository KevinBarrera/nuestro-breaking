import {
  adminRegistrationFailure,
  removeRegistrationPass,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import type { CatalogPassType } from '@/entities/event-catalog';
import { buttonClass, ConfirmDialog } from '@/shared/ui';
import { useId, useRef, useState, type ReactNode } from 'react';
import {
  removalBlockers,
  removalBlockersHint,
  removePassConfirmation,
  removePassFailure,
} from './sale-pass-removal-model';

type SalePassRemovalProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  // Null when the event's pass types could not be read.
  passTypes: CatalogPassType[] | null;
  onRemoved: (entitlements: RegistrationEntitlements, removed: HeldPass) => void;
  onReload: () => void;
  // Renders the held passes, placing each pass's "Quitar" action.
  children: (removeAction: (pass: HeldPass) => ReactNode) => ReactNode;
};

type Outcome =
  { kind: 'removed'; name: string } | { kind: 'failed'; message: string; reload: boolean };

// Removes a held pass from a pending in-person registration (#282), after a confirmation. A pass
// that a held add-on still requires shows why instead of an available action.
export function SalePassRemoval({
  eventId,
  entitlements,
  passTypes,
  onRemoved,
  onReload,
  children,
}: SalePassRemovalProps) {
  // `selected` outlives `open` so the dialog keeps its copy while it closes.
  const [selected, setSelected] = useState<HeldPass | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second DELETE from a fast double click.
  const sending = useRef(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const registrationId = entitlements.registration.id;

  const choose = (pass: HeldPass) => {
    setSelected(pass);
    setOpen(true);
  };

  const confirm = () => {
    if (!selected || sending.current) return;
    sending.current = true;
    setPending(true);
    setOutcome(null);
    removeRegistrationPass(eventId, registrationId, selected.registrationPassId)
      .then((updated) => {
        onRemoved(updated, selected);
        setOutcome({ kind: 'removed', name: selected.name });
      })
      .catch((error: unknown) => {
        setOutcome({ kind: 'failed', ...removePassFailure(adminRegistrationFailure(error)) });
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
        setOpen(false);
      });
  };

  const reload = () => {
    setOutcome(null);
    onReload();
  };

  const confirmation = selected ? removePassConfirmation(selected) : { title: '', consequence: '' };

  return (
    <>
      {outcome?.kind === 'removed' && (
        <p
          role="status"
          className="rounded-lg border border-success-fg bg-success px-4 py-3 text-sm text-success-fg"
        >
          Se quitó «{outcome.name}».
        </p>
      )}
      {outcome?.kind === 'failed' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
        >
          <p>{outcome.message}</p>
          {outcome.reload && (
            <button type="button" className={buttonClass('secondary')} onClick={reload}>
              Recargar
            </button>
          )}
        </div>
      )}
      {children((pass) => (
        <RemovePassAction
          pass={pass}
          hint={removalBlockersHint(removalBlockers(entitlements.passes, pass, passTypes))}
          disabled={pending}
          onChoose={choose}
        />
      ))}
      <ConfirmDialog
        isOpen={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && !pending) setOpen(false);
        }}
        title={confirmation.title}
        consequence={confirmation.consequence}
        confirmLabel="Quitar pase"
        pendingLabel="Quitando…"
        tone="destructive"
        onConfirm={confirm}
        isPending={pending}
      />
    </>
  );
}

type RemovePassActionProps = {
  pass: HeldPass;
  // Why the backend would reject the removal, or null when it can go ahead.
  hint: string | null;
  disabled: boolean;
  onChoose: (pass: HeldPass) => void;
};

function RemovePassAction({ pass, hint, disabled, onChoose }: RemovePassActionProps) {
  const hintId = useId();
  return (
    <div className="flex basis-full flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {hint && (
        <p id={hintId} className="text-sm text-muted sm:max-w-80 sm:text-right">
          {hint}
        </p>
      )}
      <button
        type="button"
        className={buttonClass('secondary')}
        disabled={disabled || hint !== null}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => onChoose(pass)}
        aria-label={`Quitar «${pass.name}»`}
      >
        Quitar
      </button>
    </div>
  );
}
