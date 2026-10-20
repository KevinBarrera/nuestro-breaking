import {
  adminRegistrationFailure,
  setPassSelections,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import { buttonClass, CheckboxField, Notice } from '@/shared/ui';
import { useId, useState } from 'react';
import { styles } from './catalog-copy';
import {
  competitionDraft,
  competitionsPayload,
  effectiveDraft,
  saleCompetitionPasses,
  saveCompetitionsFailure,
  toggleCompetition,
  type CompetitionDrafts,
  type SaleCompetitionPass,
} from './sale-competitions-model';

type SaleCompetitionsProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  // Null when the event's pass types or activities could not be read.
  passTypes: CatalogPassType[] | null;
  activities: CatalogActivity[] | null;
  drafts: CompetitionDrafts;
  onDraftChange: (pass: SaleCompetitionPass, next: readonly string[] | null) => void;
  onSaved: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

// Competitions of each held pass while the registration is pending (#105). The page keeps
// each pass's draft so a refresh of the entitlements, such as adding a pass, keeps the unsaved
// checks (#277); saving replaces the pass's whole list, and selections can change again later,
// so no confirmation is asked.
export function SaleCompetitions({
  eventId,
  entitlements,
  passTypes,
  activities,
  drafts,
  onDraftChange,
  onSaved,
  onReload,
}: SaleCompetitionsProps) {
  const titleId = useId();
  const unreadable = passTypes === null || activities === null;
  const passes = unreadable
    ? []
    : saleCompetitionPasses(entitlements.passes, passTypes, activities);
  if (!unreadable && passes.length === 0) return null;
  if (unreadable && entitlements.passes.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-3`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Competencias
      </h2>
      {unreadable ? (
        <Notice tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>No pudimos cargar las competencias del evento.</p>
            <button type="button" className={buttonClass('secondary')} onClick={onReload}>
              Recargar
            </button>
          </div>
        </Notice>
      ) : (
        <div className="divide-y divide-row">
          {passes.map((pass) => (
            <PassCompetitions
              key={pass.registrationPassId}
              eventId={eventId}
              registrationId={entitlements.registration.id}
              pass={pass}
              draft={effectiveDraft(drafts, pass)}
              onDraftChange={(next) => onDraftChange(pass, next)}
              onSaved={onSaved}
              onReload={onReload}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type PassCompetitionsProps = {
  eventId: string;
  registrationId: string;
  pass: SaleCompetitionPass;
  draft: readonly string[];
  onDraftChange: (next: readonly string[] | null) => void;
  onSaved: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

type Outcome = { kind: 'saved' } | { kind: 'failed'; message: string; reload: boolean };

function PassCompetitions({
  eventId,
  registrationId,
  pass,
  draft,
  onDraftChange,
  onSaved,
  onReload,
}: PassCompetitionsProps) {
  const hintId = useId();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const { blocked, canSave } = competitionDraft(pass, draft);

  const save = () => {
    if (!canSave || pending) return;
    setPending(true);
    setOutcome(null);
    setPassSelections(
      eventId,
      registrationId,
      pass.registrationPassId,
      competitionsPayload(pass, draft),
    )
      .then((updated) => {
        onDraftChange(null);
        onSaved(updated);
        setOutcome({ kind: 'saved' });
      })
      .catch((error: unknown) => {
        setOutcome({
          kind: 'failed',
          ...saveCompetitionsFailure(adminRegistrationFailure(error)),
        });
      })
      .finally(() => setPending(false));
  };

  const reload = () => {
    setOutcome(null);
    onReload();
  };

  return (
    <fieldset className="space-y-2 py-3 first:pt-0 last:pb-0">
      <legend className="font-semibold break-words text-heading">{pass.name}</legend>
      <div>
        {pass.choices.map((choice) => (
          <CheckboxField
            key={choice.activityId}
            label={choice.name}
            description={choice.available ? undefined : 'Ya no está disponible para este pase.'}
            checked={draft.includes(choice.activityId)}
            disabled={pending || (!choice.available && !draft.includes(choice.activityId))}
            onChange={() => onDraftChange(toggleCompetition(draft, choice.activityId))}
          />
        ))}
      </div>
      {blocked && (
        <p id={hintId} className="text-sm text-muted">
          {blocked}
        </p>
      )}
      {outcome?.kind === 'saved' && (
        <p
          role="status"
          className="rounded-lg border border-success-fg bg-success px-4 py-3 text-sm text-success-fg"
        >
          Se guardaron las competencias de «{pass.name}».
        </p>
      )}
      {outcome?.kind === 'failed' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
        >
          <p>{outcome.message}</p>
          {outcome.reload && (
            <button type="button" className={buttonClass('secondary')} onClick={reload}>
              Recargar
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className={buttonClass('primary')}
        disabled={!canSave || pending}
        aria-describedby={blocked ? hintId : undefined}
        onClick={save}
      >
        {pending ? 'Guardando…' : 'Guardar competencias'}
      </button>
    </fieldset>
  );
}
