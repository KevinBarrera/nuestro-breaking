import { Button } from 'react-aria-components';
import { buttonClass } from './button-styles';
import { Modal } from './modal';

type ConfirmDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  // What happens if the person confirms, e.g. "La actividad dejará de aparecer…".
  consequence: string;
  confirmLabel: string;
  cancelLabel?: string;
  // Shown on the confirm button while `isPending`, e.g. "Archivando…".
  pendingLabel?: string;
  onConfirm: () => void;
  tone?: 'default' | 'destructive';
  // The action is in flight: both buttons and Esc are disabled until it settles.
  isPending?: boolean;
};

// Controlled alert dialog that asks before an action with consequences.
// The caller closes it (onOpenChange(false)) once the action succeeds.
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  cancelLabel = 'Cancelar',
  pendingLabel,
  onConfirm,
  tone = 'default',
  isPending = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      role="alertdialog"
      title={title}
      description={consequence}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isKeyboardDismissDisabled={isPending}
      actions={(close) => (
        <>
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={close}>
            {cancelLabel}
          </Button>
          <Button
            className={buttonClass(tone === 'destructive' ? 'destructive' : 'primary')}
            isDisabled={isPending}
            onPress={onConfirm}
          >
            {isPending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </>
      )}
    />
  );
}
