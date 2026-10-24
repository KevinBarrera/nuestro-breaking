import type { CatalogActivity } from '@/entities/event-catalog';
import { Modal, buttonClass } from '@/shared/ui';
import { Button } from 'react-aria-components';
import { PlusIcon, WarningIcon } from './activity-icons';
import { styles } from './catalog-copy';

type SuccessNoticeProps = {
  text: string;
  busy: boolean;
  // Present after an archive or a restore: runs the opposite action.
  onUndo?: () => void;
  onClose: () => void;
};

// The confirmed write, above the agenda, with "Deshacer" when the change is cheap to revert.
export function ActivitySuccessNotice({ text, busy, onUndo, onClose }: SuccessNoticeProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-success-fg bg-success py-2 pr-2 pl-4 text-sm text-success-fg"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="M4.5 10.5l3.5 3.5 7.5-8" />
      </svg>
      <p className="min-w-[200px] flex-1 font-semibold">{text}</p>
      {onUndo && (
        <button
          type="button"
          disabled={busy}
          onClick={onUndo}
          className="min-h-11 rounded-lg px-3 font-bold underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50"
        >
          Deshacer
        </button>
      )}
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={onClose}
        className="flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        >
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}

type ArchiveDialogProps = {
  activity: CatalogActivity;
  // Inscritos with access; undefined when not known.
  enrolled: number | undefined;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const enrolledWarning = (count: number) =>
  `${count === 1 ? '1 persona ya está inscrita' : `${count} personas ya están inscritas`}. Conservan su inscripción; avísales si la actividad ya no se hará.`;

// Archiving is reversible, so the confirm button is the primary one, not a destructive one.
export function ActivityArchiveDialog({
  activity,
  enrolled,
  busy,
  onCancel,
  onConfirm,
}: ArchiveDialogProps) {
  return (
    <Modal
      role="alertdialog"
      layout="sectioned"
      title={`¿Archivar ${activity.name}?`}
      description="Deja de aparecer en la venta y en los pases nuevos. Puedes restaurarla cuando quieras desde Archivadas."
      isOpen
      onOpenChange={(open) => !open && !busy && onCancel()}
      isKeyboardDismissDisabled={busy}
      actions={
        <>
          <Button className={buttonClass('secondary')} isDisabled={busy} onPress={onCancel}>
            Cancelar
          </Button>
          <Button className={buttonClass('primary')} isDisabled={busy} onPress={onConfirm}>
            {busy ? 'Archivando…' : 'Archivar'}
          </Button>
        </>
      }
    >
      {enrolled ? (
        <p className="flex items-start gap-2.5 rounded-lg border border-warning-fg bg-warning px-3.5 py-3 text-sm text-warning-fg">
          <span className="mt-px shrink-0">
            <WarningIcon size={18} />
          </span>
          {enrolledWarning(enrolled)}
        </p>
      ) : null}
    </Modal>
  );
}

const kindCards = [
  { label: 'Competencia', hint: 'Batallas: 1v1, 2v2, 3v3, cypher.' },
  { label: 'Taller', hint: 'Clases o workshops.' },
  { label: 'Social', hint: 'Fiestas, cyphers abiertos y convivencias.' },
];

// The event has no activities at all: no tabs or filters, just the way to start.
export function ActivitiesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <section
      aria-labelledby="activities-empty"
      className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-surface-inner text-heading"
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4.5" width="14" height="13" rx="2" />
          <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
        </svg>
      </span>
      <h2 id="activities-empty" className="mt-1 text-xl font-bold text-heading">
        Aún no hay actividades
      </h2>
      <p className="max-w-[480px] text-[15px] leading-[22px] text-muted">
        Empieza por la agenda: agrega las competencias, talleres y sociales del evento. Después arma
        los pases con ellas.
      </p>
      <button type="button" className={`${styles.primaryLarge} mt-2`} onClick={onCreate}>
        <PlusIcon />
        Agregar la primera actividad
      </button>
      <ul
        aria-label="Tipos de actividad"
        className="mt-6 flex w-full max-w-[600px] flex-wrap gap-3"
      >
        {kindCards.map((card) => (
          <li
            key={card.label}
            className="flex flex-[1_1_150px] flex-col gap-0.5 rounded-lg border border-line p-3.5 text-left"
          >
            <span className="text-sm font-bold text-heading">{card.label}</span>
            <span className="text-[13px] leading-[18px] text-muted">{card.hint}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type AgendaEmptyProps = { title: string; text: string; onCreate?: () => void };

// A tab or a search with nothing to show.
export function AgendaEmpty({ title, text, onCreate }: AgendaEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <p className="font-bold text-heading">{title}</p>
      <p className="max-w-[440px] text-sm text-muted">{text}</p>
      {onCreate && (
        <button type="button" className={`${styles.secondary} mt-2`} onClick={onCreate}>
          Nueva actividad
        </button>
      )}
    </div>
  );
}
