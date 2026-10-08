// One editable field as it was loaded and as the form holds it now. `format` turns a value
// into what the person reads; it is method syntax so typed formatters stay assignable.
export type ChangeField<T = unknown> = {
  key: string;
  label: string;
  before: T;
  after: T;
  format?(value: T): string;
};

export type ChangeRow = { key: string; label: string; before: string; after: string };

const emptyValue = '—';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return emptyValue;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(display).join(', ') : emptyValue;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
  // Plain objects compare structurally through their JSON form.
  return JSON.stringify(value) ?? emptyValue;
}

// Values are compared as displayed (never trimmed), so a price typed as "150.00" and
// stored as 15000 cents is not a change when both format the same.
export function changedRows(fields: ChangeField[]): ChangeRow[] {
  return fields.flatMap((field) => {
    const show = (value: unknown) => (field.format ? field.format(value) : display(value));
    const before = show(field.before);
    const after = show(field.after);
    return before === after ? [] : [{ key: field.key, label: field.label, before, after }];
  });
}

export const hasChanges = (fields: ChangeField[]) => changedRows(fields).length > 0;
