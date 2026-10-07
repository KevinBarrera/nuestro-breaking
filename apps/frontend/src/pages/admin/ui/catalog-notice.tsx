import type { CatalogFailure } from '@/entities/event-catalog';
import { failureMessages, styles } from './catalog-copy';

export type Notice =
  { kind: 'success'; text: string } | { kind: 'failure'; failure: CatalogFailure };

type CatalogNoticeProps = { notice: Notice | null; onReload: () => void };

// Success is only reported after the backend confirmed the write; failures show safe copy.
export function CatalogNotice({ notice, onReload }: CatalogNoticeProps) {
  if (!notice) return null;
  if (notice.kind === 'success')
    return (
      <p
        role="status"
        className="rounded-lg border border-success-fg bg-success px-4 py-3 text-sm text-success-fg"
      >
        {notice.text}
      </p>
    );
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
    >
      <p>{failureMessages[notice.failure]}</p>
      {(notice.failure === 'conflict' || notice.failure === 'not-found') && (
        <button type="button" className={styles.secondary} onClick={onReload}>
          Recargar
        </button>
      )}
    </div>
  );
}

type RefreshFailureProps = { failure: CatalogFailure | null; onRetry: () => void };

// Non-blocking: the write already succeeded, only the refreshed list could not be read.
export function CatalogRefreshFailure({ failure, onRetry }: RefreshFailureProps) {
  if (!failure) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-fg bg-warning px-4 py-3 text-sm text-warning-fg"
    >
      <p>
        {failure === 'denied'
          ? failureMessages.denied
          : 'No se pudo recargar la lista; puede no mostrar los últimos cambios.'}
      </p>
      <button type="button" className={styles.secondary} onClick={onRetry}>
        Recargar
      </button>
    </div>
  );
}

type LoadFailureProps = { failure: CatalogFailure };

export function CatalogLoadFailure({ failure }: LoadFailureProps) {
  return (
    <p role="alert" className="rounded-lg border border-danger-fg bg-danger p-4 text-danger-fg">
      {failure === 'denied'
        ? failureMessages.denied
        : 'No se pudo cargar el catálogo del evento. Comprueba el enlace o inténtalo más tarde.'}
    </p>
  );
}
