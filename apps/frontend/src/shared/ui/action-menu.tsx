import type { ReactNode } from 'react';
import { Button, Menu, MenuItem, MenuTrigger, Popover, Separator } from 'react-aria-components';

export type ActionMenuItem<K extends string> = {
  id: K;
  label: string;
  icon?: ReactNode;
  // Destructive items use the danger color and sit after a separator.
  danger?: boolean;
};

type ActionMenuProps<K extends string> = {
  // Names the person or thing the actions apply to, e.g. "Acciones para Ana Torres".
  label: string;
  items: ActionMenuItem<K>[];
  onAction: (id: K) => void;
};

const itemClass =
  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm font-semibold outline-none data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focus-visible:outline-focus';

// The "Acciones" button of a row: a menu with arrow-key navigation, Escape to close and focus
// back on the button (react-aria). Safe actions come first, then destructive ones.
export function ActionMenu<K extends string>({ label, items, onAction }: ActionMenuProps<K>) {
  const safe = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);
  const renderItem = (item: ActionMenuItem<K>) => (
    <MenuItem
      key={item.id}
      id={item.id}
      textValue={item.label}
      className={`${itemClass} ${
        item.danger
          ? 'text-danger-fg data-focused:bg-danger data-hovered:bg-danger'
          : 'text-fg data-focused:bg-row data-hovered:bg-row'
      }`}
    >
      {item.icon && (
        <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
          {item.icon}
        </span>
      )}
      {item.label}
    </MenuItem>
  );

  return (
    <MenuTrigger>
      <Button
        aria-label={label}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-input-line bg-surface pr-2.5 pl-3.5 text-sm font-semibold text-fg outline-none hover:bg-row data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-pressed:bg-row"
      >
        Acciones
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </Button>
      <Popover
        placement="bottom end"
        offset={4}
        className="max-w-[calc(100vw-2rem)] min-w-58 rounded-lg border border-line bg-surface p-1 shadow-lg"
      >
        <Menu
          aria-label={label}
          className="flex flex-col gap-0.5 outline-none"
          onAction={(key) => onAction(key as K)}
        >
          {safe.map(renderItem)}
          {safe.length > 0 && danger.length > 0 && (
            <Separator className="my-1 h-px border-0 bg-line" />
          )}
          {danger.map(renderItem)}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
