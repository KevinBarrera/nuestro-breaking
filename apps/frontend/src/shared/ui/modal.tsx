import { useId, type ReactNode } from 'react';
import { Dialog, Heading, Modal as AriaModal, ModalOverlay } from 'react-aria-components';

type ModalProps = {
  // Required: it is the dialog's accessible name.
  title: string;
  // Optional lead text under the title, linked as the dialog's description.
  description?: ReactNode;
  children?: ReactNode;
  // Footer buttons. The render form receives `close` for DialogTrigger usage.
  actions?: ReactNode | ((close: () => void) => ReactNode);
  // Controlled usage; omit both inside a DialogTrigger.
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  // `alertdialog` for confirmations that interrupt the person.
  role?: 'dialog' | 'alertdialog';
  // Clicking the backdrop closes it. Off by default so a stray tap never drops edits.
  isDismissable?: boolean;
  // Blocks Esc, e.g. while a save is in flight.
  isKeyboardDismissDisabled?: boolean;
};

// Themed modal dialog on React Aria: focus is trapped inside, Esc closes it and focus
// returns to the element that opened it. It fits a 375px screen, and a tall body scrolls
// while the title and actions stay visible.
export function Modal({
  title,
  description,
  children,
  actions,
  isOpen,
  onOpenChange,
  role = 'dialog',
  isDismissable = false,
  isKeyboardDismissDisabled = false,
}: ModalProps) {
  const descriptionId = useId();

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      className="fixed inset-0 z-50 flex items-center justify-center bg-header/70 p-4"
    >
      <AriaModal className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg min-w-0 flex-col rounded-xl border border-line bg-surface text-fg shadow-lg">
        <Dialog
          role={role}
          className="flex min-h-0 flex-1 flex-col outline-none"
          aria-describedby={description ? descriptionId : undefined}
        >
          {({ close }) => (
            <>
              <div className="px-5 pt-5">
                <Heading slot="title" className="text-lg font-bold text-heading">
                  {title}
                </Heading>
                {description && (
                  <p id={descriptionId} className="mt-2 text-sm text-fg">
                    {description}
                  </p>
                )}
              </div>
              {children && (
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 break-words">
                  {children}
                </div>
              )}
              {actions && (
                <div className="flex flex-col-reverse gap-2 px-5 pt-4 pb-5 sm:flex-row sm:justify-end">
                  {typeof actions === 'function' ? actions(close) : actions}
                </div>
              )}
            </>
          )}
        </Dialog>
      </AriaModal>
    </ModalOverlay>
  );
}
