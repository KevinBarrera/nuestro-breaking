import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { FieldError } from './field-error';

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  // The label can hold links, such as "Leí y acepto el Reglamento oficial".
  label: ReactNode;
  description?: ReactNode;
  error?: string | null;
};

// A native checkbox inside its label, so the whole row is a 44px target (links in the label
// still follow, without toggling). The description and error are linked
// with `aria-describedby`, and an error sets `aria-invalid`.
export function CheckboxField({
  label,
  description,
  error,
  id,
  className = '',
  ...inputProps
}: CheckboxFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
        <input
          {...inputProps}
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="mt-0.5 size-5 shrink-0 accent-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
        />
        <span className="min-w-0 text-sm text-fg">{label}</span>
      </label>
      {description ? (
        <p id={descriptionId} className="pl-8 text-sm text-muted">
          {description}
        </p>
      ) : null}
      {error ? (
        <div className="pl-8">
          <FieldError id={errorId}>{error}</FieldError>
        </div>
      ) : null}
    </div>
  );
}
