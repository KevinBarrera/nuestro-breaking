import {
  choicesStepCopy,
  competitionGroups,
  competitionsChoiceKind,
  toggleActivity,
  type CompetitionChoice,
  type CompetitionGroup,
} from '@/features/public-purchase';
import { CheckIcon } from '@/shared/ui';
import { continueButtonClass, PublicFrame, StepBar, StepProgress } from '@/widgets/public-layout';
import { useId } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { usePurchase } from './purchase-context';
import { purchaseStepCount, stepNumber, stepPath, stepRedirect } from './purchase-steps';

const toggleTone = (selected: boolean) =>
  selected
    ? 'border-chip-selected bg-chip-selected text-chip-selected-fg'
    : 'border-input-line bg-surface text-heading hover:bg-row';

// Screen 3, optional, named by what the chosen passes offer (#411): "Elige tus categorías" for
// competitions, "Elige tus talleres" for workshops, "Elige tus actividades" for a mix. One group of
// toggle buttons per chosen pass, split by kind when it mixes kinds, and the activities a pass
// includes marked "Incluida".
export function PublicCompetitionsPage() {
  const { slug, catalog, selection, setSelection } = usePurchase();
  const navigate = useNavigate();
  const redirect = stepRedirect('competitions', catalog.passes, selection);
  if (redirect) return <Navigate replace to={stepPath(slug, redirect)} />;

  const toggle = (passId: string, activityId: string) =>
    setSelection(toggleActivity(catalog.passes, selection, passId, activityId));
  const copy = choicesStepCopy(competitionsChoiceKind(catalog.passes, selection));

  return (
    <PublicFrame backTo={stepPath(slug, 'passes')}>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-5">
        <StepProgress step={stepNumber('competitions')} total={purchaseStepCount} />
        <h1 className="text-[26px] leading-tight font-extrabold text-heading">{copy.title}</h1>
        <p className="text-muted">{copy.intro}</p>
        <div className="flex flex-col gap-6 pt-1">
          {competitionGroups(catalog.passes, selection).map((group) =>
            group.selectable.length > 0 ? (
              <fieldset key={group.pass.id} className="flex flex-col gap-3">
                <legend className="mb-3 text-lg font-extrabold text-heading">
                  {group.pass.name}
                </legend>
                {group.sections.map((section) =>
                  section.label ? (
                    <KindSection
                      key={section.label}
                      label={section.label}
                      choices={section.items}
                      onToggle={(activityId) => toggle(group.pass.id, activityId)}
                    />
                  ) : (
                    <ChoiceToggles
                      key="all"
                      choices={section.items}
                      onToggle={(activityId) => toggle(group.pass.id, activityId)}
                    />
                  ),
                )}
                <IncludedList group={group} />
              </fieldset>
            ) : (
              <IncludedCard key={group.pass.id} group={group} />
            ),
          )}
        </div>
      </main>
      <StepBar backTo={stepPath(slug, 'passes')}>
        <button
          type="button"
          onClick={() => void navigate(stepPath(slug, 'buyer'))}
          className={continueButtonClass}
        >
          Continuar
        </button>
      </StepBar>
    </PublicFrame>
  );
}

type ChoiceTogglesProps = {
  choices: CompetitionChoice[];
  onToggle: (activityId: string) => void;
};

function ChoiceToggles({ choices, onToggle }: ChoiceTogglesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map(({ activity, selected }) => (
        <button
          key={activity.id}
          type="button"
          aria-pressed={selected}
          onClick={() => onToggle(activity.id)}
          className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${toggleTone(selected)}`}
        >
          {selected ? <CheckIcon /> : null}
          {activity.name}
        </button>
      ))}
    </div>
  );
}

// The choices of one kind inside a pass that mixes kinds, such as "Talleres" (#411).
function KindSection({ label, ...toggles }: ChoiceTogglesProps & { label: string }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <h3 id={labelId} className="text-sm font-semibold text-muted">
        {label}
      </h3>
      <ChoiceToggles {...toggles} />
    </div>
  );
}

const includedBadge = (
  <span className="shrink-0 rounded-full border border-eligible-line bg-eligible px-2.5 py-1 text-[13px] font-semibold text-eligible-fg">
    Incluida
  </span>
);

function IncludedList({ group }: { group: CompetitionGroup }) {
  if (group.included.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {group.included.map((activity) => (
        <li key={activity.id} className="flex items-center justify-between gap-3">
          <span>{activity.name}</span>
          {includedBadge}
        </li>
      ))}
    </ul>
  );
}

// A pass that only includes competitions (such as Open Styles): nothing to pick, just shown.
function IncludedCard({ group }: { group: CompetitionGroup }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3.5"
    >
      <strong id={titleId} className="text-base text-heading">
        {group.pass.name}
      </strong>
      <IncludedList group={group} />
    </section>
  );
}
