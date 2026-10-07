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
        className="rounded-lg border border-emerald-700 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-100"
      >
        {notice.text}
      </p>
    );
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-700 bg-rose-950/40 px-4 py-3 text-sm text-rose-100"
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

type LoadFailureProps = { failure: CatalogFailure };

export function CatalogLoadFailure({ failure }: LoadFailureProps) {
  return (
    <p role="alert" className="rounded-lg border border-rose-700 bg-rose-950/40 p-4 text-rose-100">
      {failure === 'denied'
        ? failureMessages.denied
        : 'No se pudo cargar el catálogo del evento. Comprueba el enlace o inténtalo más tarde.'}
    </p>
  );
}
