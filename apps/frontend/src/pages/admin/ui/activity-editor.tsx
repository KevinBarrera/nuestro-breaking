import {
  activityWindowErrors,
  isActivityKind,
  windowErrorMessages,
  type ActivityInput,
  type ActivityWindowProblem,
  type CatalogActivity,
  type CatalogVenue,
  type EventWindow,
  type WindowField,
  type WindowFieldErrors,
} from '@/entities/event-catalog';
import { buttonClass, Modal } from '@/shared/ui';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { activityChangeRows } from './activity-changes';
import { ActivityForm } from './activity-form';
import {
  activityDraft,
  checkTimes,
  draftWindow,
  editSummary,
  endDayOf,
  eventDayOptions,
  overlapNames,
  reviewWarning,
  type ActivityDraft,
} from './activity-form-model';
import { ArrowIcon, WarningIcon } from './activity-icons';

type ActivityEditorProps = {
  // The activity being edited; absent when creating one.
  activity?: CatalogActivity;
  // Every activity of the event, for the overlap warning.
  activities: CatalogActivity[];
  venues: CatalogVenue[];
  timeZone: string;
  // The event's dates; "Día" offers each of them. Null: the form asks for a date.
  eventWindow: EventWindow | null;
  // Inscritos and the passes that include the activity, when known (edit summary and warning).
  enrolled: number | undefined;
  passes: string[] | null;
  // A server answer that named the failing fields; a new object marks them again.
  windowProblem: ActivityWindowProblem | null;
  // The failure of the last save, shown at the top of either step.
  notice: ReactNode;
  busy: boolean;
  onClose: () => void;
  onSave: (input: ActivityInput) => void;
};

// "Nueva actividad" saves straight from the form with "Crear actividad". "Editar actividad"
// goes through "Revisa los cambios", step 2 of the same dialog: "Volver a editar" returns to the
// form with the values kept, since the draft lives here.
export function ActivityEditor({
  activity,
  activities,
  venues,
  timeZone,
  eventWindow,
  enrolled,
  passes,
  windowProblem,
  notice,
  busy,
  onClose,
  onSave,
}: ActivityEditorProps) {
  const formId = useId();
  const days = eventDayOptions(eventWindow, timeZone);
  const [initial] = useState(() =>
    activityDraft(activity, timeZone, days[0]?.key ?? '', venues[0]?.id ?? ''),
  );
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [tried, setTried] = useState(false);
  const [windowErrors, setWindowErrors] = useState<WindowFieldErrors>({});
  const [seenProblem, setSeenProblem] = useState(windowProblem);
  const [focusRequest, setFocusRequest] = useState<{ field: WindowField } | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const isEdit = activity !== undefined;
  const title = isEdit ? 'Editar actividad' : 'Nueva actividad';

  // The server's field errors replace whatever the form showed, back on the form, during render
  // so the marks and the new limits appear together.
  if (windowProblem !== seenProblem) {
    setSeenProblem(windowProblem);
    if (windowProblem) {
      setStep('form');
      markWindow(windowProblem.fieldErrors);
    }
  }

  // The first wrong time takes the focus once the form is shown.
  useEffect(() => {
    if (!focusRequest) return;
    const input = focusRequest.field === 'startsAt' ? startRef : endRef;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  function markWindow(errors: WindowFieldErrors) {
    setWindowErrors(errors);
    const first = errors.startsAt ? 'startsAt' : errors.endsAt ? 'endsAt' : null;
    if (first) setFocusRequest({ field: first });
  }

  function change(patch: Partial<ActivityDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setWindowErrors({});
  }

  const times = checkTimes(draft, timeZone);
  const input = toInput(draft);
  const rows = activity && input ? activityChangeRows(activity, input, venues, timeZone) : [];
  const unchanged = isEdit && input !== null && rows.length === 0;

  // The values the API takes. A time left as loaded keeps the stored instant (with any seconds)
  // instead of the minute the field shows.
  function toInput(values: ActivityDraft): ActivityInput | null {
    const window = draftWindow(values, timeZone);
    const kind = values.kind;
    if (!window || !values.name.trim() || !isActivityKind(kind)) return null;
    if (!venues.some((venue) => venue.id === values.venueId)) return null;
    const sameStart = values.day === initial.day && values.start === initial.start;
    const sameEnd = endDayOf(values) === endDayOf(initial) && values.end === initial.end;
    return {
      name: values.name.trim(),
      kind,
      venueId: values.venueId,
      startsAt: activity && sameStart ? activity.startsAt : window.startsAt,
      endsAt: activity && sameEnd ? activity.endsAt : window.endsAt,
    };
  }

  function submit() {
    if (busy) return;
    setTried(true);
    if (!input) {
      if (times.kind !== 'ok') setFocusRequest({ field: draft.start ? 'endsAt' : 'startsAt' });
      return;
    }
    const errors = activityWindowErrors(input, eventWindow);
    if (errors.startsAt || errors.endsAt) return markWindow(errors);
    if (!isEdit) return onSave(input);
    if (rows.length > 0) setStep('review');
  }

  const close = () => !busy && onClose();

  if (step === 'review' && activity && input) {
    const warning = reviewWarning(enrolled, rows);
    return (
      <Modal
        isOpen
        onOpenChange={(open) => !open && close()}
        isKeyboardDismissDisabled={busy}
        layout="sectioned"
        size="lg"
        title="Revisa los cambios"
        leading={
          <p className="mb-1 text-[13px] leading-[18px] font-semibold text-muted">
            Editar actividad · paso 2 de 2
          </p>
        }
        actions={
          <>
            <button
              type="button"
              className={buttonClass('secondary')}
              disabled={busy}
              onClick={() => setStep('form')}
            >
              Volver a editar
            </button>
            <button
              type="button"
              className={buttonClass('primary')}
              disabled={busy}
              onClick={() => onSave(input)}
            >
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </>
        }
      >
        <div className="space-y-4 pb-1">
          {notice}
          <dl className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-3.5 py-3 text-sm"
              >
                <dt className="text-muted">{row.label}</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted line-through">
                    <span className="sr-only">Antes: </span>
                    {row.before}
                  </span>
                  <ArrowIcon />
                  <span className="font-bold text-heading">
                    <span className="sr-only">Después: </span>
                    {row.after}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          {warning && (
            <p className="flex items-start gap-2.5 rounded-lg border border-warning-fg bg-warning px-3.5 py-3 text-sm text-warning-fg">
              <span className="mt-px shrink-0">
                <WarningIcon size={18} />
              </span>
              {warning}
            </p>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && close()}
      isKeyboardDismissDisabled={busy}
      layout="sectioned"
      size="lg"
      title={title}
      closeLabel="Cerrar"
      actions={
        <>
          {unchanged && (
            <p className="order-last text-sm text-muted sm:order-none sm:mr-auto">
              Sin cambios todavía.
            </p>
          )}
          <button
            type="button"
            className={buttonClass('secondary')}
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={busy || unchanged || venues.length === 0}
            className={buttonClass('primary', 'disabled:cursor-not-allowed')}
          >
            {busy ? 'Guardando…' : isEdit ? 'Revisar cambios' : 'Crear actividad'}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        {notice}
        <ActivityForm
          id={formId}
          title={title}
          draft={draft}
          onChange={change}
          days={days}
          venues={venues}
          tried={tried}
          times={times}
          windowMessages={windowErrorMessages(windowErrors)}
          overlap={overlapNames(draft, activity?.id, activities, timeZone)}
          summary={isEdit ? editSummary(enrolled, passes) : ''}
          startRef={startRef}
          endRef={endRef}
          onSubmit={submit}
        />
      </div>
    </Modal>
  );
}
