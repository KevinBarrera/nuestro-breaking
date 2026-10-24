import { buttonClass, Modal } from '@/shared/ui';
import { Link } from 'react-router';
import { escalationMessage, formatCheckInTime, type CheckInNotice } from './admin-check-in-model';
import { initials, type RosterCheck, type RosterPerson } from './check-in-roster-model';
import { StatusPill } from './team-list';

const svg = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const check = (size: number) => (
  <svg {...svg} width={size} height={size} strokeWidth="2.25">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);

const noticeStyles: Record<CheckInNotice['kind'], string> = {
  success: 'border-success-fg bg-success text-success-fg',
  already: 'border-warning-fg bg-warning text-warning-fg',
  escalate: 'border-warning-fg bg-warning text-warning-fg',
  error: 'border-danger-fg bg-danger text-danger-fg',
};

type CheckInDialogProps = {
  person: RosterPerson;
  paymentsReviewHref: string;
  busy: boolean;
  notice: CheckInNotice | null;
  onAdmit: (check: RosterCheck) => void;
  onClose: () => void;
  onNext: () => void;
};

export function CheckInDialog({
  person,
  paymentsReviewHref,
  busy,
  notice,
  onAdmit,
  onClose,
  onNext,
}: CheckInDialogProps) {
  const { checks, confirmed } = person;
  const done = checks.filter((entry) => entry.checkedInAt).length;
  const single = confirmed && checks.length === 1;
  const finished = !confirmed || done === checks.length;
  const admitLabel = busy ? 'Registrando…' : 'Registrar entrada';

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      isKeyboardDismissDisabled={busy}
      layout="card"
      size="xl"
      title={person.fullName}
      closeLabel="Cerrar"
      leading={
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-nav-active text-base font-bold text-nav-active-fg"
        >
          {initials(person.fullName)}
        </span>
      }
      description={
        <>
          <span>{person.stageName ?? 'Sin alias'}</span>
          <span> · </span>
          <span className="font-mono text-fg">{person.folio ?? 'Sin folio'}</span>
          <span className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone={confirmed ? 'success' : 'warning'}>
              {confirmed ? 'Inscripción confirmada' : 'Pago por revisar'}
            </StatusPill>
            <StatusPill tone="neutral">{person.pass}</StatusPill>
          </span>
        </>
      }
      actions={
        <>
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Cerrar
          </button>
          {finished && (
            <button
              type="button"
              className={buttonClass('primary', 'flex items-center justify-center gap-2')}
              onClick={onNext}
            >
              <svg {...svg} width="16" height="16" strokeWidth="1.75">
                <circle cx="9" cy="9" r="5.5" />
                <path d="M13 13l4 4" />
              </svg>
              Buscar a otra persona
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!confirmed && (
          <div
            role="note"
            className="flex gap-3 rounded-lg border border-warning-fg bg-warning p-4 text-sm text-warning-fg"
          >
            <svg {...svg} width="20" height="20" strokeWidth="1.75" className="shrink-0">
              <path d="M10 3l7.5 13h-15z" />
              <path d="M10 8.5v3.5M10 14.5v.01" />
            </svg>
            <div className="flex flex-col gap-1">
              <strong>No registres su entrada todavía</strong>
              <span>
                Su pago está por revisar, así que la inscripción no está confirmada. Pide a quien
                revisa pagos que lo apruebe y vuelve a buscarla.
              </span>
              <Link
                to={paymentsReviewHref}
                className="font-semibold underline underline-offset-3 focus-visible:outline-2 focus-visible:outline-focus"
              >
                Ir a Pagos por revisar
              </Link>
            </div>
          </div>
        )}

        {confirmed && !checks.length && (
          <p className="rounded-lg border border-warning-fg bg-warning p-4 text-sm font-semibold text-warning-fg">
            {escalationMessage}
          </p>
        )}

        {single && (
          <>
            <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface-inner p-5">
              <span className="text-sm font-semibold text-muted">{checks[0].name}</span>
              {checks[0].checkedInAt ? (
                <>
                  <span className="flex items-center gap-2.5 text-xl font-extrabold text-success-fg">
                    <span
                      aria-hidden="true"
                      className="flex size-8 items-center justify-center rounded-full border border-success-fg bg-success"
                    >
                      {check(18)}
                    </span>
                    Entró a las {formatCheckInTime(checks[0].checkedInAt)}
                  </span>
                  <span className="text-sm text-muted">
                    Ya está adentro. No vuelvas a registrar su entrada.
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xl font-extrabold text-heading">Aún no entra</span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={
                      checks[0].activityId
                        ? `Registrar entrada a ${checks[0].name}`
                        : 'Registrar entrada al evento'
                    }
                    onClick={() => onAdmit(checks[0])}
                    className={buttonClass(
                      'primary',
                      'flex min-h-13 w-full items-center justify-center gap-2 text-base font-bold',
                    )}
                  >
                    {check(18)}
                    {admitLabel}
                  </button>
                </>
              )}
            </div>
            {person.generalEntryOnly && (
              <p className="text-sm text-muted">
                Su pase es de entrada general: solo se registra la entrada al evento.
              </p>
            )}
          </>
        )}

        {confirmed && checks.length > 1 && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-bold text-heading">Actividades de sus pases</h3>
              <span className="text-sm text-muted">
                {done} de {checks.length} registradas
              </span>
            </div>
            <p className="text-sm text-muted">
              Su pase no incluye entrada general. Registra cada actividad cuando llegue a ella.
            </p>
            <ul className="overflow-hidden rounded-xl border border-line">
              {checks.map((entry) => (
                <li
                  key={entry.activityId ?? 'event'}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-line px-4 py-3 not-first:border-t ${entry.checkedInAt ? 'bg-surface-inner' : 'bg-surface'}`}
                >
                  <span className="flex min-w-0 flex-[1_1_180px] flex-col gap-0.5">
                    <span className="text-[15px] leading-[22px] font-bold text-heading">
                      {entry.name}
                    </span>
                    {entry.checkedInAt ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-success-fg">
                        {check(16)}
                        Entró a las {formatCheckInTime(entry.checkedInAt)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted">Por entrar</span>
                    )}
                  </span>
                  {!entry.checkedInAt && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Registrar entrada a ${entry.name}`}
                      onClick={() => onAdmit(entry)}
                      className={buttonClass('primary')}
                    >
                      {admitLabel}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {notice && (
          <p
            role={notice.kind === 'success' || notice.kind === 'already' ? 'status' : 'alert'}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold ${noticeStyles[notice.kind]}`}
          >
            {notice.kind === 'success' && check(16)}
            {notice.text}
          </p>
        )}
      </div>
    </Modal>
  );
}
