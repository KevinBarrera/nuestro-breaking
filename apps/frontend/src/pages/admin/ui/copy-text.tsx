import type { CopyState } from './use-copy-text';

// The button reads "Copiada" after a copy; this live region says it, or explains a failure.
export function CopyStatus({ state }: { state: CopyState }) {
  return (
    <p role="status" className={state === 'failed' ? 'text-sm text-danger-fg' : 'sr-only'}>
      {state === 'copied' && 'Dirección copiada.'}
      {state === 'failed' && 'No se pudo copiar. Selecciona la dirección y cópiala a mano.'}
    </p>
  );
}

export const CopyIcon = () => (
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
    className="shrink-0"
  >
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
  </svg>
);
