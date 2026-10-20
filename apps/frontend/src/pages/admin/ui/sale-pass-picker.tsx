import {
  addRegistrationPass,
  adminRegistrationFailure,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn, type CatalogPassType } from '@/entities/event-catalog';
import { buttonClass, ConfirmDialog, Notice } from '@/shared/ui';
import { useId, useState } from 'react';
import { passClassLabels, styles } from './catalog-copy';
import {
  addPassConfirmation,
  addPassFailure,
  salePassOptions,
  type SalePassOption,
} from './sale-pass-model';

type SalePassPickerProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  // Null when the event's pass types could not be read.
  passTypes: CatalogPassType[] | null;
  onAdded: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

type Outcome =
  { kind: 'added'; name: string } | { kind: 'failed'; message: string; reload: boolean };

// Adds passes to a pending registration (#105). Passes the backend would reject show why instead
// of an action, and every add is confirmed first.
export function SalePassPicker({
  eventId,
  entitlements,
  passTypes,
  onAdded,
  onReload,
}: SalePassPickerProps) {
  const titleId = useId();
  // `selected` outlives `open` so the dialog keeps its copy while it closes.
  const [selected, setSelected] = useState<SalePassOption | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const registrationId = entitlements.registration.id;

  const choose = (option: SalePassOption) => {
    setSelected(option);
    setOpen(true);
  };

  const confirm = () => {
    if (!selected || pending) return;
    setPending(true);
    setOutcome(null);
    addRegistrationPass(eventId, registrationId, selected.passTypeId)
      .then((updated) => {
        onAdded(updated);
        setOutcome({ kind: 'added', name: selected.name });
      })
      .catch((error: unknown) => {
        setOutcome({ kind: 'failed', ...addPassFailure(adminRegistrationFailure(error)) });
      })
      .finally(() => {
        setPending(false);
        setOpen(false);
      });
  };

  const reload = () => {
    setOutcome(null);
    onReload();
  };

  const options = passTypes ? salePassOptions(passTypes, entitlements.passes) : [];
  const confirmation = selected ? addPassConfirmation(selected) : { title: '', consequence: '' };

  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-3`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Agregar pase
      </h2>
      {outcome?.kind === 'added' && (
        <p
          role="status"
          className="rounded-lg border border-success-fg bg-success px-4 py-3 text-sm text-success-fg"
        >
          Se agregó «{outcome.name}».
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
      {passTypes === null ? (
        <Notice tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>No pudimos cargar los pases del evento.</p>
            <button type="button" className={buttonClass('secondary')} onClick={reload}>
              Recargar
            </button>
          </div>
        </Notice>
      ) : options.length === 0 ? (
        <p className="text-muted">Este evento no tiene pases a la venta.</p>
      ) : (
        <ul className="divide-y divide-row">
          {options.map((option) => (
            <PassOptionRow
              key={option.passTypeId}
              option={option}
              disabled={pending}
              onChoose={choose}
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && !pending) setOpen(false);
        }}
        title={confirmation.title}
        consequence={confirmation.consequence}
        confirmLabel="Agregar pase"
        pendingLabel="Agregando…"
        onConfirm={confirm}
        isPending={pending}
      />
    </section>
  );
}

type PassOptionRowProps = {
  option: SalePassOption;
  disabled: boolean;
  onChoose: (option: SalePassOption) => void;
};

function PassOptionRow({ option, disabled, onChoose }: PassOptionRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
      <span className="min-w-0">
        <span className="block font-semibold break-words text-heading">{option.name}</span>
        <span className="block text-sm text-muted">
          {passClassLabels[option.passClass]} ·{' '}
          <span className="font-mono">{formatMxn(option.priceCents)}</span>
        </span>
      </span>
      {option.reason ? (
        <span className="text-sm text-muted sm:max-w-64 sm:text-right">{option.reason}</span>
      ) : (
        <button
          type="button"
          className={buttonClass('secondary')}
          disabled={disabled}
          onClick={() => onChoose(option)}
          aria-label={`Agregar ${option.name}`}
        >
          Agregar
        </button>
      )}
    </li>
  );
}
