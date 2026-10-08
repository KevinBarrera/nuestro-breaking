import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from './confirm-dialog';

type UnsavedChangesGuardProps = {
  // There are edits that leaving would lose. Pass false while a save is in flight, so the
  // navigation that follows a successful save (e.g. create → detail) is never blocked.
  when: boolean;
};

// Warns before leaving a screen with unsaved edits. In-app navigation (links, breadcrumbs,
// the side navigation, back/forward) is held by the data router's `useBlocker` and confirmed
// in a dialog; a reload or tab close gets the browser's own prompt through `beforeunload`.
export function UnsavedChangesGuard({ when }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [when]);

  // The edits were saved or discarded while the dialog was open: let the navigation go on.
  useEffect(() => {
    if (blocker.state === 'blocked' && !when) blocker.proceed();
  }, [blocker, when]);

  return (
    <ConfirmDialog
      isOpen={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title="¿Salir sin guardar?"
      consequence="Tienes cambios sin guardar en esta pantalla; si sales ahora, se perderán."
      confirmLabel="Salir sin guardar"
      cancelLabel="Seguir editando"
      tone="destructive"
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed();
      }}
    />
  );
}
