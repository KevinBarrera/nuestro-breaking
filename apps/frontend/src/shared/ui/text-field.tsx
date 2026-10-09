import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { FieldError } from './field-error';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
  label: string;
  hint?: ReactNode;
  // Shows "(opcional)" after the label.
  optional?: boolean;
  error?: string | null;
  // A fixed, non-editable prefix shown inside the field, such as `+52`.
  prefix?: string;
};

const frame =
  'mt-1 flex min-h-11 w-full items-stretch overflow-hidden rounded-lg border bg-input text-base text-fg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus';

// A labelled text input. The hint, prefix and error are linked with `aria-describedby`, and an
// error sets `aria-invalid`. Other input props (type, autoComplete, inputMode, ...) pass through.
export function TextField({
  label,
  hint,
  optional = false,
  error,
  prefix,
  id,
  className = '',
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const prefixId = `${inputId}-prefix`;
  const errorId = `${inputId}-error`;
  const describedBy = [prefix ? prefixId : null, hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-sm font-semibold text-fg">
        {label}
        {optional ? <span className="font-normal text-muted"> (opcional)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div className={`${frame} ${error ? 'border-danger-fg' : 'border-input-line'}`}>
        {prefix ? (
          <span
            id={prefixId}
            className="flex items-center border-r border-input-line bg-surface px-3 font-mono text-muted"
          >
            {prefix}
          </span>
        ) : null}
        <input
          {...inputProps}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-fg outline-none placeholder:text-muted disabled:opacity-60"
        />
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
