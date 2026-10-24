import { buttonClass, FieldError, Modal, type ChangeRow } from '@/shared/ui';
import { useId, type ReactNode } from 'react';
import { reasonMaxLength } from './sale-complimentary-model';

type CorrectionDialogProps = {
  // The correction's title and lead text on its first step.
  title: string;
  description: string;
  // The first step's form, whose `id` is `formId`; "Revisar cambios" submits it.
  formId: string;
  children: ReactNode;
  // Second step: the "Antes / Después" rows and the reason the form sent.
  reviewing: boolean;
  rows: ChangeRow[];
  reason: string;
  // Extra lines under the reason on the second step, such as a failure or a note.
  reviewNote?: ReactNode;
  confirmLabel: string;
  pending: boolean;
  // A failure that needs a reload: confirming again could repeat a write that landed.
  locked?: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

const svg = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

// A registration correction (#345) in two steps: "Paso 1 de 2 · Cambios" holds the form and the
// reason, "Paso 2 de 2 · Revisión" restates what changes before the write. Esc and the footer
// buttons are disabled while it saves.
export function CorrectionDialog({
  title,
  description,
  formId,
  children,
  reviewing,
  rows,
  reason,
  reviewNote,
  confirmLabel,
  pending,
  locked = false,
  onBack,
  onConfirm,
  onClose,
}: CorrectionDialogProps) {
  const dot = (on: boolean) => `h-1 w-6 rounded-full ${on ? 'bg-heading' : 'bg-line'}`;
  return (
    <Modal
      isOpen
      onOpenChange={(isOpen) => !isOpen && !pending && onClose()}
      isKeyboardDismissDisabled={pending}
      layout="sectioned"
      size="xl"
      title={reviewing ? 'Revisa los cambios' : title}
      description={
        reviewing
          ? 'Confirma antes de guardar. Se registran en el historial con este motivo.'
          : description
      }
      leading={
        <p className="mb-1 flex items-center gap-2 text-xs leading-4 font-semibold text-muted">
          <span aria-hidden="true" className={dot(true)} />
          <span aria-hidden="true" className={dot(reviewing)} />
          {reviewing ? 'Paso 2 de 2 · Revisión' : 'Paso 1 de 2 · Cambios'}
        </p>
      }
      actions={
        reviewing ? (
          <>
            <button
              type="button"
              className={buttonClass(
                'secondary',
                'inline-flex items-center justify-center gap-1.5',
              )}
              disabled={pending}
              onClick={onBack}
            >
              <svg {...svg} width="16" height="16">
                <path d="M12 5l-5 5 5 5" />
              </svg>
              Volver a editar
            </button>
            <button
              type="button"
              className={buttonClass('primary')}
              disabled={pending || locked}
              onClick={onConfirm}
            >
              {pending ? 'Guardando…' : confirmLabel}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={buttonClass('secondary')} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              form={formId}
              className={buttonClass('primary', 'inline-flex items-center justify-center gap-1.5')}
            >
              Revisar cambios
              <svg {...svg} width="16" height="16">
                <path d="M8 5l5 5-5 5" />
              </svg>
            </button>
          </>
        )
      }
    >
      {reviewing ? (
        <div className="space-y-4 pb-1">
          <div
            role="table"
            aria-label="Cambios"
            className="overflow-hidden rounded-lg border border-line"
          >
            <div
              role="row"
              className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-line bg-surface-inner px-4 py-2.5 text-xs leading-4 font-semibold text-muted"
            >
              <span role="columnheader">Dato</span>
              <span role="columnheader">Antes</span>
              <span role="columnheader">Después</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.key}
                role="row"
                className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-line px-4 py-3 text-sm not-[:nth-child(2)]:border-t"
              >
                <span role="rowheader" className="font-semibold text-heading">
                  {row.label}
                </span>
                <span role="cell" className="text-muted line-through">
                  {row.before}
                </span>
                <span role="cell" className="font-semibold text-heading">
                  {row.after}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-surface-inner px-4 py-3">
            <span className="text-xs leading-4 font-semibold text-muted">Motivo</span>
            <span className="text-sm text-fg">{reason.trim()}</span>
          </div>
          {reviewNote}
        </div>
      ) : (
        <div className="pb-1">{children}</div>
      )}
    </Modal>
  );
}

type ReasonFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  id?: string;
};

// "Motivo" of a correction: required, up to the backend's 500 characters, counted under it.
export function ReasonField({ value, onChange, placeholder, error, id }: ReasonFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <div>
      <label htmlFor={inputId} className="text-sm font-semibold text-heading">
        Motivo
      </label>
      <textarea
        id={inputId}
        rows={2}
        maxLength={reasonMaxLength}
        required
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hintId}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={`mt-1.5 block min-h-20 w-full rounded-lg border bg-input px-3 py-2.5 text-base text-fg placeholder:text-muted focus:outline-2 focus:outline-offset-2 focus:outline-focus ${error ? 'border-danger-fg' : 'border-input-line'}`}
      />
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {value.trim().length} de {reasonMaxLength} caracteres
        </p>
      )}
    </div>
  );
}

// A failed correction that needs a reload: the screen is stale or the write may have landed.
export function ReloadAlert({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
    >
      <p>{message}</p>
      <button type="button" className={buttonClass('secondary')} onClick={onReload}>
        Recargar
      </button>
    </div>
  );
}
