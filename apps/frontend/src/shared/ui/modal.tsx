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
  // `sectioned`: wider padding and the actions in a footer under a divider.
  layout?: 'default' | 'sectioned';
  // `lg` widens the dialog for forms with option cards.
  size?: 'md' | 'lg';
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
  layout = 'default',
  size = 'md',
}: ModalProps) {
  const descriptionId = useId();
  const sectioned = layout === 'sectioned';
  const padX = sectioned ? 'px-6' : 'px-5';

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      className="fixed inset-0 z-50 flex items-center justify-center bg-header/70 p-4"
    >
      <AriaModal
        className={`flex max-h-[calc(100dvh-2rem)] w-full ${size === 'lg' ? 'max-w-[560px]' : sectioned ? 'max-w-[520px]' : 'max-w-lg'} min-w-0 flex-col rounded-xl border border-line bg-surface text-fg shadow-lg`}
      >
        <Dialog
          role={role}
          className="flex min-h-0 flex-1 flex-col outline-none"
          aria-describedby={description ? descriptionId : undefined}
        >
          {({ close }) => (
            <>
              <div className={`${padX} ${sectioned ? 'pt-6' : 'pt-5'}`}>
                <Heading slot="title" className="text-lg font-bold text-heading">
                  {title}
                </Heading>
                {description && (
                  <p
                    id={descriptionId}
                    className={`text-sm ${sectioned ? 'mt-1 text-muted' : 'mt-2 text-fg'}`}
                  >
                    {description}
                  </p>
                )}
              </div>
              {children && (
                <div
                  className={`${sectioned ? 'mt-4' : 'mt-3'} min-h-0 flex-1 overflow-y-auto ${padX} break-words`}
                >
                  {children}
                </div>
              )}
              {actions && (
                <div
                  className={`flex flex-col-reverse sm:flex-row sm:justify-end ${sectioned ? 'mt-6 gap-3 border-t border-line px-6 py-4 sm:items-center' : 'gap-2 px-5 pt-4 pb-5'}`}
                >
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
