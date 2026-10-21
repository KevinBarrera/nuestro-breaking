import { type Ref, useId } from 'react';
import { styles } from './catalog-copy';

type ActivityWindowFieldProps = {
  label: string;
  value: string;
  // Picker limits on the event's clock; absent for an unbounded event.
  min?: string;
  max?: string;
  // The message of this field's wrong date, shown under it and linked as its description.
  error: string | undefined;
  // The event-dates hint, linked as a description too when the field has no error of its own.
  hintId?: string;
  inputRef: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
};

// A required `datetime-local` field of the activity form. A wrong date sets `aria-invalid`, the
// danger border and its own message.
export function ActivityWindowField({
  label,
  value,
  min,
  max,
  error,
  hintId,
  inputRef,
  onChange,
}: ActivityWindowFieldProps) {
  const errorId = useId();
  const describedBy = [error ? errorId : null, hintId].filter(Boolean).join(' ');
  return (
    <div>
      <label className={styles.label}>
        {label}
        <input
          ref={inputRef}
          className={`${error ? styles.fieldInvalid : styles.field} font-mono`}
          type="datetime-local"
          value={value}
          min={min}
          max={max}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {error && (
        <p id={errorId} className="mt-1 text-sm font-medium text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
