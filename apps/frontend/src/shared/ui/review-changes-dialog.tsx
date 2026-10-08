import { Button } from 'react-aria-components';
import { buttonClass } from './button-styles';
import { Modal } from './modal';
import type { ChangeRow } from './review-changes-model';

type ReviewChangesDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Only the changed fields, as returned by `changedRows`.
  rows: ChangeRow[];
  onConfirm: () => void;
  // Saving is in flight: both buttons and Esc are disabled until it settles.
  isPending?: boolean;
};

// Controlled dialog that lists each edited field as "before → after" before saving.
// "Volver a editar" closes it so the person returns to the form with their edits intact.
export function ReviewChangesDialog({
  isOpen,
  onOpenChange,
  rows,
  onConfirm,
  isPending = false,
}: ReviewChangesDialogProps) {
  return (
    <Modal
      title="Revisar cambios"
      description="Confirma los cambios antes de guardarlos."
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isKeyboardDismissDisabled={isPending}
      actions={(close) => (
        <>
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={close}>
            Volver a editar
          </Button>
          <Button className={buttonClass('primary')} isDisabled={isPending} onPress={onConfirm}>
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      )}
    >
      <dl className="divide-y divide-line rounded-lg border border-line">
        {rows.map((row) => (
          <div key={row.key} className="px-3 py-2">
            <dt className="text-sm font-semibold text-fg">{row.label}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-muted line-through">{row.before}</span>
              <span aria-hidden="true" className="text-muted">
                →
              </span>
              <span className="sr-only">cambia a</span>
              <span className="font-semibold text-fg">{row.after}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
