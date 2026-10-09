import type { ReactNode } from 'react';

type FieldErrorProps = { id?: string; children: ReactNode };

// Inline error text under a field. Link it to the control with `aria-describedby`.
export function FieldError({ id, children }: FieldErrorProps) {
  return (
    <p id={id} className="mt-1 text-sm font-medium text-danger-fg">
      {children}
    </p>
  );
}

type NoticeProps = { tone?: 'danger' | 'info'; title?: string; children: ReactNode };

const noticeTones = {
  danger: 'border-danger-fg bg-danger text-danger-fg',
  info: 'border-line bg-surface text-fg',
};

// A block message for a whole form or screen, such as a server error. Danger notices are
// announced as alerts.
export function Notice({ tone = 'info', title, children }: NoticeProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${noticeTones[tone]}`}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}
