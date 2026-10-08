import type { CatalogPassType, PassTypeActivity } from '@/entities/event-catalog';
import { Select } from '@/shared/ui';
import { type ReactNode, useId, useState } from 'react';
import { accessLabels, styles } from './catalog-copy';
import {
  accessList,
  droppedLinks,
  savedChoices,
  type AccessChoice,
  type AccessChoices,
  type AccessGroup,
} from './pass-access-model';

const chip = 'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold';
const chipTone: Record<AccessChoice, string> = {
  selectable: 'border-eligible-line bg-eligible text-eligible-fg',
  included: 'border-included bg-included text-included-fg',
  none: 'border-input-line bg-input text-fg',
};

const accessOptions = [
  { id: 'none', label: 'Sin acceso' },
  { id: 'selectable', label: accessLabels.selectable },
  { id: 'included', label: accessLabels.included },
];

type HeadingLevel = 2 | 3;

type AccessSectionProps = {
  // 2 on the pass screen; 3 inside the "Nuevo pase" form, under its own heading.
  level: HeadingLevel;
  intro: string;
  className?: string;
  children: ReactNode;
};

// The "Acceso a actividades" region: heading, legend and what the list below edits.
export function AccessSection({ level, intro, className = '', children }: AccessSectionProps) {
  const titleId = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={titleId} className={`min-w-0 space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading id={titleId} className="text-lg font-bold text-heading">
          Acceso a actividades
        </Heading>
        <ul aria-label="Leyenda" className="flex flex-wrap gap-3 text-sm text-muted">
          <li className="flex items-center gap-2">
            <span className={`${chip} ${chipTone.selectable}`}>Elegible</span>{' '}
            <span>(la persona escoge)</span>
          </li>
          <li className="flex items-center gap-2">
            <span className={`${chip} ${chipTone.included}`}>Incluida</span>
          </li>
        </ul>
      </div>
      <p className="text-sm text-muted">{intro}</p>
      {children}
    </section>
  );
}

type AccessListProps = {
  groups: AccessGroup[];
  choices: AccessChoices;
  // The level of the section heading; each kind gets the next one.
  level: HeadingLevel;
  busy: boolean;
  onChange: (activityId: string, choice: AccessChoice) => void;
};

// One row per active activity, grouped by kind, each with its access for the open pass.
export function AccessList({ groups, choices, level, busy, onChange }: AccessListProps) {
  const id = useId();
  const Heading = level === 2 ? 'h3' : 'h4';
  if (groups.length === 0)
    return <p className="text-muted">No hay actividades activas en este evento.</p>;
  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const headingId = `${id}-${group.kind}`;
        return (
          <div key={group.kind} className="space-y-1">
            <Heading
              id={headingId}
              className="text-xs font-bold tracking-[0.06em] text-muted uppercase"
            >
              {group.label}
            </Heading>
            <ul aria-labelledby={headingId} className="divide-y divide-row">
              {group.activities.map((activity) => {
                const choice = choices[activity.id] ?? 'none';
                return (
                  <li key={activity.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 font-semibold break-words">{activity.name}</span>
                    <Select
                      label={`Acceso a ${activity.name}`}
                      hideLabel
                      variant="chip"
                      className="shrink-0"
                      triggerClassName={chipTone[choice]}
                      options={accessOptions}
                      selectedKey={choice}
                      isDisabled={busy}
                      onSelectionChange={(key) => onChange(activity.id, key as AccessChoice)}
                    />
                  </li>
                );
              })}
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
  onSave: (activities: PassTypeActivity[]) => void;
  onReload: () => void;
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
}: PassAccessEditorProps) {
  const saved = savedChoices(passType.activities);
  const [choices, setChoices] = useState<AccessChoices>(saved);
  const changed = groups.some((group) =>
    group.activities.some(
      (activity) => (choices[activity.id] ?? 'none') !== (saved[activity.id] ?? 'none'),
    ),
  );
  const dropped = droppedLinks(passType.activities, groups);

  function save() {
    if (busy || !changed) return;
    onSave(accessList(groups, choices));
  }

  return (
    <AccessSection
      level={2}
      intro={`Qué actividades da ${passType.name}.`}
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
        onChange={(activityId, choice) =>
          setChoices((current) => ({ ...current, [activityId]: choice }))
        }
      />
      {dropped > 0 && (
        <p className="text-sm text-warning-fg">
          {dropped === 1
            ? 'Este pase tiene 1 actividad archivada vinculada; se quitará al guardar el acceso, porque solo se pueden asignar actividades activas.'
            : `Este pase tiene ${dropped} actividades archivadas vinculadas; se quitarán al guardar el acceso, porque solo se pueden asignar actividades activas.`}
        </p>
      )}
      {groups.length > 0 && (
        <button type="button" disabled={busy || !changed} onClick={save} className={styles.primary}>
          {busy ? 'Guardando…' : 'Guardar acceso'}
        </button>
      )}
    </AccessSection>
  );
}
