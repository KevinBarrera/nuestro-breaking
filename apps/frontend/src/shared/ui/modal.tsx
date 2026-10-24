import { useId, type ReactNode } from 'react';
import { Button, Dialog, Heading, Modal as AriaModal, ModalOverlay } from 'react-aria-components';

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
  // `sectioned`: wider padding and the actions in a footer under a divider. `card`: like
  // `sectioned`, with the body between dividers too, for records opened from a list.
  layout?: 'default' | 'sectioned' | 'card';
  // `lg` widens the dialog for forms with option cards, `xl` for records.
  size?: 'md' | 'lg' | 'xl';
  // Shown before the title: beside it in a card (an avatar), above it otherwise (a step label).
  leading?: ReactNode;
  // Adds an icon button that closes the dialog, named by this label.
  closeLabel?: string;
};

const widths = { md: 'max-w-lg', lg: 'max-w-[560px]', xl: 'max-w-[600px]' };

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
  leading,
  closeLabel,
}: ModalProps) {
  const descriptionId = useId();
  const card = layout === 'card';
  const sectioned = layout === 'sectioned' || card;
  const padX = sectioned ? 'px-6' : 'px-5';

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      // A record opens near the top, so its height can change without the dialog jumping.
      className={`fixed inset-0 z-50 flex justify-center bg-header/70 p-4 ${card ? 'items-center sm:items-start sm:pt-24' : 'items-center'}`}
    >
      <AriaModal
        className={`flex max-h-[calc(100dvh-2rem)] ${card ? 'sm:max-h-[calc(100dvh-7rem)]' : ''} w-full ${size === 'md' && sectioned ? 'max-w-[520px]' : widths[size]} min-w-0 flex-col rounded-xl border border-line bg-surface text-fg shadow-lg`}
      >
        <Dialog
          role={role}
          className="flex min-h-0 flex-1 flex-col outline-none"
          aria-describedby={description ? descriptionId : undefined}
        >
          {({ close }) => (
            <>
              <div
                className={
                  card
                    ? 'flex items-start gap-3.5 border-b border-line pt-5 pr-4 pb-4 pl-6'
                    : `flex items-start gap-3 ${padX} ${sectioned ? 'pt-6' : 'pt-5'} ${closeLabel ? 'pr-4' : ''}`
                }
              >
                {/* Beside the title in a card (an avatar); above it otherwise (a step label). */}
                {card && leading}
                <div className="min-w-0 flex-1">
                  {!card && leading}
                  <Heading
                    slot="title"
                    className={
                      card
                        ? 'text-xl leading-7 font-extrabold text-heading'
                        : `text-lg font-bold text-heading ${closeLabel ? 'pt-2' : ''}`
                    }
                  >
                    {title}
                  </Heading>
                  {description && (
                    <div
                      id={descriptionId}
                      className={`text-sm ${sectioned ? 'mt-1 text-muted' : 'mt-2 text-fg'}`}
                    >
                      {description}
                    </div>
                  )}
                </div>
                {closeLabel && (
                  <Button
                    aria-label={closeLabel}
                    onPress={close}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-heading outline-none hover:bg-row data-focus-visible:outline-2 data-focus-visible:outline-focus"
                  >
                    <svg
                      aria-hidden="true"
                      width="18"
                      height="18"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    >
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </Button>
                )}
              </div>
              {children && (
                <div
                  className={`${card ? 'py-5' : sectioned ? 'mt-4' : 'mt-3'} min-h-0 flex-1 overflow-y-auto ${padX} break-words`}
                >
                  {children}
                </div>
              )}
              {actions && (
                <div
                  className={`flex flex-col-reverse sm:flex-row sm:justify-end ${sectioned ? `${card ? '' : 'mt-6'} gap-3 border-t border-line px-6 py-4 sm:items-center` : 'gap-2 px-5 pt-4 pb-5'}`}
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
