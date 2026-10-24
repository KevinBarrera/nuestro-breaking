import {
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  type Key,
} from 'react-aria-components';
import { CheckIcon } from './check-icon';

export type SelectOption = { id: string; label: string; isDisabled?: boolean };

// `field` sits in forms, `header` in the dark admin topbar, `nav` in the admin side navigation,
// `chip` in dense list rows, `filter` in list toolbars with the label inside the button.
export type SelectVariant = 'field' | 'header' | 'nav' | 'chip' | 'filter';

type SelectProps = {
  label: string;
  // Keeps the label for assistive technology only, for controls labelled by their context.
  hideLabel?: boolean;
  options: SelectOption[];
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  // Mirrors the value into React Aria's hidden native select so FormData can read it.
  name?: string;
  isDisabled?: boolean;
  // Blocks form submission while nothing is selected and then shows `requiredMessage`.
  isRequired?: boolean;
  requiredMessage?: string;
  // A message from the form's own check: marks the select invalid and links the message as
  // its description.
  errorMessage?: string | null;
  placeholder?: string;
  variant?: SelectVariant;
  className?: string;
  // Extra trigger classes, e.g. the tone of a chip.
  triggerClassName?: string;
  // Shorter text for the button than the selected option's label.
  selectedLabel?: string;
};

const roots: Record<SelectVariant, string> = {
  field: 'group block text-sm font-semibold text-fg',
  header: 'flex min-w-0 items-center gap-2 text-sm text-header-muted',
  nav: 'block min-w-0',
  chip: 'inline-block',
  filter: 'inline-block',
};

const focusRing = 'outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2';

// The chip variant is only disabled while its list saves, hence the wait cursor.
const triggers: Record<SelectVariant, string> = {
  field: `mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-input-line group-data-invalid:border-danger-fg bg-input py-2 pr-3 pl-3 text-left text-base text-fg data-focus-visible:border-focus ${focusRing} data-focus-visible:outline-focus data-disabled:cursor-not-allowed data-disabled:opacity-60`,
  header: `flex min-h-11 max-w-[60vw] min-w-0 items-center gap-2 rounded-md border border-header-line bg-header-control pr-3 pl-3 font-semibold text-header-fg ${focusRing} data-focus-visible:outline-header-fg data-disabled:cursor-not-allowed data-disabled:opacity-60`,
  nav: `flex min-h-12 w-full items-center gap-2.5 rounded-lg border border-input-line bg-input px-3 py-2 text-left text-sm font-semibold text-fg ${focusRing} data-focus-visible:outline-focus`,
  chip: `inline-flex min-h-11 items-center gap-2 rounded-full border pr-3 pl-3 text-xs font-semibold ${focusRing} data-focus-visible:outline-focus data-disabled:cursor-wait data-disabled:opacity-60`,
  filter: `inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-input-line bg-surface pr-3 pl-3.5 text-sm text-fg hover:bg-row ${focusRing} data-focus-visible:outline-focus`,
};

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

// Accessible, themed replacement for the native <select>: a button that opens a listbox
// with React Aria keyboard support (Enter/Space/arrows to open, arrows and typeahead to move).
export function Select({
  label,
  hideLabel = false,
  options,
  selectedKey,
  onSelectionChange,
  name,
  isDisabled,
  isRequired,
  requiredMessage = 'Selecciona una opción.',
  errorMessage,
  placeholder = 'Selecciona una opción',
  variant = 'field',
  className = '',
  triggerClassName = '',
  selectedLabel,
}: SelectProps) {
  const filter = variant === 'filter';
  function change(key: Key | null) {
    // Like a native select, re-choosing the current option is not a change.
    if (key === null || String(key) === selectedKey) return;
    onSelectionChange(String(key));
  }

  return (
    <AriaSelect
      value={selectedKey || null}
      onChange={change}
      name={name}
      isDisabled={isDisabled}
      isRequired={isRequired}
      isInvalid={errorMessage ? true : undefined}
      placeholder={placeholder}
      className={`${roots[variant]} ${className}`}
    >
      <Label className={hideLabel || filter ? 'sr-only' : undefined}>{label}</Label>
      <Button className={`${triggers[variant]} ${triggerClassName}`}>
        {filter && (
          <span aria-hidden="true" className="shrink-0 text-muted">
            {label}:
          </span>
        )}
        {/* Text only: the option's check-mark layout must not leak into the trigger. */}
        <SelectValue
          className={`min-w-0 flex-1 text-left data-placeholder:text-muted ${variant === 'nav' ? 'leading-5' : 'truncate'} ${filter ? 'font-semibold' : ''}`}
        >
          {({ isPlaceholder, selectedText }) =>
            isPlaceholder ? placeholder : (selectedLabel ?? selectedText)
          }
        </SelectValue>
        <ChevronIcon />
      </Button>
      {/* Native validation: the browser's own message would not be in Spanish. */}
      <FieldError className="mt-1 block text-sm font-normal text-danger-fg">
        {errorMessage || requiredMessage}
      </FieldError>
      <Popover
        offset={4}
        // The side navigation keeps its list as wide as the trigger; long names wrap.
        className={`max-h-80 max-w-[calc(100vw-2rem)] ${variant === 'nav' ? 'w-(--trigger-width)' : 'min-w-(--trigger-width)'} overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg`}
      >
        <ListBox className="outline-none">
          {options.map((option) => (
            <ListBoxItem
              key={option.id}
              id={option.id}
              textValue={option.label}
              isDisabled={option.isDisabled}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md py-2 pr-3 pl-2 text-sm text-fg outline-none data-disabled:cursor-not-allowed data-disabled:text-muted data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focus-visible:outline-focus data-focused:bg-row data-hovered:bg-row data-selected:font-semibold"
            >
              {({ isSelected }) => (
                <>
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {isSelected && <CheckIcon />}
                  </span>
                  <span className="min-w-0 flex-1">{option.label}</span>
                </>
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
