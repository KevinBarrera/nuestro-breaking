import {
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  type Key,
} from 'react-aria-components';

export type SelectOption = { id: string; label: string; isDisabled?: boolean };

// `field` sits in forms, `header` in the dark admin topbar, `chip` in dense table cells.
export type SelectVariant = 'field' | 'header' | 'chip';

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
  placeholder?: string;
  variant?: SelectVariant;
  className?: string;
  // Extra trigger classes, e.g. the tone of a chip.
  triggerClassName?: string;
};

const roots: Record<SelectVariant, string> = {
  field: 'block text-sm font-semibold text-fg',
  header: 'flex min-w-0 items-center gap-2 text-sm text-header-muted',
  chip: 'inline-block',
};

const focusRing = 'outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2';

// The chip variant is only disabled while its table saves, hence the wait cursor.
const triggers: Record<SelectVariant, string> = {
  field: `mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-input-line bg-input py-2 pr-3 pl-3 text-left text-base text-fg data-focus-visible:border-focus ${focusRing} data-focus-visible:outline-focus data-disabled:cursor-not-allowed data-disabled:opacity-60`,
  header: `flex min-h-11 max-w-[60vw] min-w-0 items-center gap-2 rounded-md border border-header-line bg-header-control pr-3 pl-3 font-semibold text-header-fg ${focusRing} data-focus-visible:outline-header-fg data-disabled:cursor-not-allowed data-disabled:opacity-60`,
  chip: `inline-flex min-h-11 items-center gap-2 rounded-full border pr-3 pl-3 text-xs font-semibold ${focusRing} data-focus-visible:outline-focus data-disabled:cursor-wait data-disabled:opacity-60`,
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

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3.5 8.5 3 3 6-7" />
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
  placeholder = 'Selecciona una opción',
  variant = 'field',
  className = '',
  triggerClassName = '',
}: SelectProps) {
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
      placeholder={placeholder}
      className={`${roots[variant]} ${className}`}
    >
      <Label className={hideLabel ? 'sr-only' : undefined}>{label}</Label>
      <Button className={`${triggers[variant]} ${triggerClassName}`}>
        {/* Text only: the option's check-mark layout must not leak into the trigger. */}
        <SelectValue className="min-w-0 flex-1 truncate text-left data-placeholder:text-muted">
          {({ isPlaceholder, selectedText }) => (isPlaceholder ? placeholder : selectedText)}
        </SelectValue>
        <ChevronIcon />
      </Button>
      <Popover
        offset={4}
        className="max-h-80 max-w-[calc(100vw-2rem)] min-w-(--trigger-width) overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
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
