import { useEffect, useId, useRef } from 'react';
import { styles } from './catalog-copy';

// A `datetime-local` field with a "Quitar" button that empties it, for optional dates entered on
// the event's clock (the sales window, a pass's online close). An error focuses the field.
export type DateFieldProps = {
  label: string;
  clearLabel: string;
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
};

export function DateField({ label, clearLabel, value, error, disabled, onChange }: DateFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) input.current?.focus();
  }, [error]);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className="flex flex-wrap items-start gap-x-2">
        <input
          ref={input}
          id={id}
          className={`${styles.field} min-w-0 flex-1 basis-52 font-mono`}
          type="datetime-local"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={`${styles.secondary} mt-1 shrink-0`}
          aria-label={clearLabel}
          disabled={disabled || value === ''}
          onClick={() => onChange('')}
        >
          Quitar
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
