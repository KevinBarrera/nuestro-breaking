import type { PossibleDuplicate } from '@/entities/admin-registration';
import { buttonClass, Modal } from '@/shared/ui';
import { duplicateMatchRows, type DuplicateMatchRow } from './registration-model';

type RegistrationDuplicatesDialogProps = {
  matches: PossibleDuplicate[] | null;
  pending: boolean;
  // Registers a new participant anyway, confirming every match shown.
  onConfirm: () => void;
  // Goes on with a pending registration instead of creating another one.
  onContinue: (match: DuplicateMatchRow) => void;
  onCancel: () => void;
};

// Possible duplicates (#125): the backend found registrations of this event with the same email
// or phone. Every match is shown with its masked contact data before anything is confirmed.
export function RegistrationDuplicatesDialog({
  matches,
  pending,
  onConfirm,
  onContinue,
  onCancel,
}: RegistrationDuplicatesDialogProps) {
  const rows = matches ? duplicateMatchRows(matches) : [];
  return (
    <Modal
      isOpen={matches !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
      role="alertdialog"
      isKeyboardDismissDisabled={pending}
      title="¿Es la misma persona?"
      description={
        rows.length === 1
          ? 'Ya hay una inscripción en este evento con el mismo correo o teléfono.'
          : `Ya hay ${rows.length} inscripciones en este evento con el mismo correo o teléfono.`
      }
      actions={
        <>
          <button
            type="button"
            className={buttonClass('secondary')}
            disabled={pending}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Registrando…' : 'Es otra persona, registrar'}
          </button>
        </>
      }
    >
      <ul aria-label="Inscripciones parecidas" className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.registrationId}
            className="space-y-2 rounded-lg border border-line bg-surface-inner p-4"
          >
            <p className="font-bold text-heading">
              {row.fullName}
              {row.stageName && <span className="font-normal text-muted"> · {row.stageName}</span>}
            </p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Folio</dt>
              <dd className="font-mono">{row.folio}</dd>
              <dt className="text-muted">Estado</dt>
              <dd>{row.status}</dd>
              <dt className="text-muted">Correo</dt>
              <dd className="break-all">{row.email}</dd>
              <dt className="text-muted">Teléfono</dt>
              <dd className="font-mono">{row.phone}</dd>
            </dl>
            {row.canContinue && (
              <button
                type="button"
                className={buttonClass('secondary', 'w-full sm:w-auto')}
                disabled={pending}
                onClick={() => onContinue(row)}
                aria-label={`Continuar con esta inscripción: ${row.fullName}`}
              >
                Continuar con esta inscripción
              </button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
