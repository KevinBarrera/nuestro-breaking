import type { CatalogPassType, PassTypeActivity } from '@/entities/event-catalog';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { accessLabels, styles } from './catalog-copy';
import {
  accessList,
  droppedLinks,
  groupCounts,
  groupSummary,
  markAllSelectable,
  savedChoices,
  type AccessChoice,
  type AccessChoices,
  type AccessGroup,
} from './pass-access-model';

const accessOptions: { id: AccessChoice; label: string }[] = [
  { id: 'none', label: 'Sin acceso' },
  { id: 'selectable', label: accessLabels.selectable },
  { id: 'included', label: accessLabels.included },
];

type HeadingLevel = 2 | 3;

type AccessSectionProps = {
  level: HeadingLevel;
  intro: string;
  className?: string;
  children: ReactNode;
};

// The "Acceso a actividades" region: heading, what the list below edits, and the list.
export function AccessSection({ level, intro, className = '', children }: AccessSectionProps) {
  const titleId = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={titleId} className={`min-w-0 space-y-4 ${className}`}>
      <div className="space-y-1">
        <Heading id={titleId} className="text-lg font-bold text-heading">
          Acceso a actividades
        </Heading>
        <p className="text-sm text-muted">{intro}</p>
      </div>
      {children}
    </section>
  );
}

type AccessControlProps = {
  activityName: string;
  choice: AccessChoice;
  busy: boolean;
  onChange: (choice: AccessChoice) => void;
};

// Sin acceso / Elegible / Incluida as one radio group named after the activity, so arrow
// keys move between the three options and each segment is a 44px target.
function AccessControl({ activityName, choice, busy, onChange }: AccessControlProps) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={`Acceso a ${activityName}`}
      className={`${styles.segments} w-full sm:w-auto sm:min-w-80 sm:shrink-0`}
    >
      {accessOptions.map((option) => (
        <label key={option.id} className={styles.segment}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={choice === option.id}
            disabled={busy}
            onChange={() => onChange(option.id)}
            className={styles.segmentInput}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

type AccessListProps = {
  groups: AccessGroup[];
  choices: AccessChoices;
  // The level of the section heading; each kind gets the next one.
  level: HeadingLevel;
  busy: boolean;
  // Receives the whole next set of choices: one row changed, or a kind marked eligible.
  onChange: (choices: AccessChoices) => void;
};

// One row per active activity, grouped by kind, each with its access for the open pass. Each
// kind shows its counts and can mark all of its activities as eligible at once.
export function AccessList({ groups, choices, level, busy, onChange }: AccessListProps) {
  const id = useId();
  const Heading = level === 2 ? 'h3' : 'h4';
  if (groups.length === 0)
    return <p className="text-muted">No hay actividades activas en este evento.</p>;
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const headingId = `${id}-${group.kind}`;
        return (
          <div key={group.kind} role="group" aria-labelledby={headingId} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <div className="min-w-0">
                <Heading
                  id={headingId}
                  className="text-xs font-bold tracking-[0.06em] text-muted uppercase"
                >
                  {group.label}
                </Heading>
                <p className="text-sm text-muted">{groupSummary(groupCounts(group, choices))}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                aria-describedby={headingId}
                onClick={() => onChange(markAllSelectable(group, choices))}
                className="min-h-11 rounded-lg px-2 text-sm font-semibold text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50"
              >
                Marcar todas como elegibles
              </button>
            </div>
            <ul aria-labelledby={headingId} className="divide-y divide-row">
              {group.activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="min-w-0 font-semibold break-words">{activity.name}</span>
                  <AccessControl
                    activityName={activity.name}
                    choice={choices[activity.id] ?? 'none'}
                    busy={busy}
                    onChange={(choice) => onChange({ ...choices, [activity.id]: choice })}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

type PassAccessEditorProps = {
  groups: AccessGroup[];
  // The parent remounts the editor (via `key`) when the pass, its version or a conflict
  // reload should discard local edits.
  passType: CatalogPassType;
  busy: boolean;
  conflict: boolean;
  // A save that changes something hands over the whole desired list; the screen reviews it.
  onSave: (activities: PassTypeActivity[]) => void;
  onReload: () => void;
  // Reports whether the choices differ from the pass's saved access.
  onDirtyChange?: (dirty: boolean) => void;
};

// The open pass's access on its own screen. A save sends the whole desired list; links to
// archived activities cannot be resent (the backend only accepts active activities), so a
// save drops them and the editor warns about it first.
export function PassAccessEditor({
  groups,
  passType,
  busy,
  conflict,
  onSave,
  onReload,
  onDirtyChange,
}: PassAccessEditorProps) {
  const saved = savedChoices(passType.activities);
  const [choices, setChoices] = useState<AccessChoices>(saved);
  const [error, setError] = useState<string | null>(null);
  const changed = groups.some((group) =>
    group.activities.some(
      (activity) => (choices[activity.id] ?? 'none') !== (saved[activity.id] ?? 'none'),
    ),
  );
  const dropped = droppedLinks(passType.activities, groups);

  useEffect(() => {
    onDirtyChange?.(changed);
    return () => onDirtyChange?.(false);
  }, [changed, onDirtyChange]);

  // "Guardar acceso" stays enabled and explains itself, like the pass form's save.
  function save() {
    if (busy) return;
    if (!changed) {
      setError('No hay cambios para guardar.');
      return;
    }
    setError(null);
    onSave(accessList(groups, choices));
  }

  return (
    <AccessSection
      level={2}
      intro={`Qué actividades da ${passType.name}. Elegible: la persona la escoge; Incluida: viene con el pase.`}
      className="rounded-xl border border-line bg-surface p-5"
    >
      {conflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
        >
          <p>
            Otra persona cambió este pase mientras editabas su acceso. Recarga para ver la versión
            actual; tus cambios sin guardar se descartarán.
          </p>
          <button type="button" className={styles.secondary} onClick={onReload}>
            Recargar
          </button>
        </div>
      )}
      <AccessList
        groups={groups}
        choices={choices}
        level={2}
        busy={busy}
        onChange={(next) => {
          setError(null);
          setChoices(next);
        }}
      />
      {dropped > 0 && (
        <p className="text-sm text-warning-fg">
          {dropped === 1
            ? 'Este pase tiene 1 actividad archivada vinculada; se quitará al guardar el acceso, porque solo se pueden asignar actividades activas.'
            : `Este pase tiene ${dropped} actividades archivadas vinculadas; se quitarán al guardar el acceso, porque solo se pueden asignar actividades activas.`}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
      {groups.length > 0 && (
        <button type="button" disabled={busy} onClick={save} className={styles.primary}>
          {busy ? 'Guardando…' : 'Guardar acceso'}
        </button>
      )}
    </AccessSection>
  );
}
