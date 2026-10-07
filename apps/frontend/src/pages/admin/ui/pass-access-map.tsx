import type {
  ActivityAccess,
  CatalogActivity,
  CatalogPassType,
  PassTypeActivity,
} from '@/entities/event-catalog';
import { Select } from '@/shared/ui';
import { useId, useState } from 'react';
import { accessLabels, activityKindLabel, styles } from './catalog-copy';

type Choice = ActivityAccess | 'none';

type PassAccessMapProps = {
  passTypes: CatalogPassType[];
  activities: CatalogActivity[];
  // Only the selected pass's column is editable; the parent remounts this map (via `key`)
  // when the selection, its version or a conflict reload should discard local edits.
  selected: CatalogPassType | undefined;
  busy: boolean;
  conflict: boolean;
  onSave: (activities: PassTypeActivity[]) => void;
  onReload: () => void;
};

const chip = 'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold';
const chipTone: Record<Choice, string> = {
  selectable: 'border-eligible-line bg-eligible text-eligible-fg',
  included: 'border-included bg-included text-included-fg',
  none: 'border-input-line bg-input text-fg',
};

const accessOptions = [
  { id: 'none', label: 'Sin acceso' },
  { id: 'selectable', label: accessLabels.selectable },
  { id: 'included', label: accessLabels.included },
];

const rowLabel = (activity: CatalogActivity) =>
  `${activityKindLabel(activity.kind)} · ${activity.name}`;

function AccessChip({ access }: { access: ActivityAccess | undefined }) {
  if (!access)
    return (
      <span className="px-3 text-muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sin acceso</span>
      </span>
    );
  return <span className={`${chip} ${chipTone[access]}`}>{accessLabels[access]}</span>;
}

// Activities × active passes. The backend only accepts active activities of the event, so
// rows are active activities and a save sends the whole desired list for the selected pass;
// links to archived activities cannot be resent and are therefore dropped by that save.
export function PassAccessMap({
  passTypes,
  activities,
  selected,
  busy,
  conflict,
  onSave,
  onReload,
}: PassAccessMapProps) {
  const titleId = useId();
  const [draft, setDraft] = useState<Record<string, Choice>>({});
  const passes = passTypes.filter((passType) => passType.status === 'active');
  const rows = activities
    .filter((activity) => activity.status === 'active')
    .sort(
      (left, right) =>
        activityKindLabel(left.kind).localeCompare(activityKindLabel(right.kind), 'es') ||
        left.name.localeCompare(right.name, 'es'),
    );
  const rowIds = new Set(rows.map((activity) => activity.id));
  const saved = new Map(selected?.activities.map((link) => [link.activityId, link.access]));
  const choiceOf = (activityId: string): Choice =>
    draft[activityId] ?? saved.get(activityId) ?? 'none';
  const changed = rows.some((row) => choiceOf(row.id) !== (saved.get(row.id) ?? 'none'));
  const dropped = selected?.activities.filter((link) => !rowIds.has(link.activityId)).length ?? 0;

  function save() {
    if (busy || !changed) return;
    onSave(
      rows.flatMap((row) => {
        const access = choiceOf(row.id);
        return access === 'none' ? [] : [{ activityId: row.id, access }];
      }),
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 space-y-4 rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-bold text-heading">
          Mapa de acceso
        </h2>
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
      <p className="text-sm text-muted">
        {selected
          ? `Editando la columna de ${selected.name}.`
          : 'Selecciona un pase para editar su columna.'}
      </p>
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
      {rows.length === 0 || passes.length === 0 ? (
        <p className="text-muted">
          {rows.length === 0
            ? 'No hay actividades activas en este evento.'
            : 'Aún no hay pases activos.'}
        </p>
      ) : (
        <div data-testid="access-map-scroll" className="relative overflow-x-auto">
          <table aria-labelledby={titleId} className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="px-3 py-2.5 font-bold tracking-[0.06em] uppercase">
                  Actividad
                </th>
                {passes.map((passType) => (
                  <th
                    key={passType.id}
                    scope="col"
                    className={`px-3 py-2.5 font-bold ${
                      passType.id === selected?.id ? 'bg-chip text-heading' : ''
                    }`}
                  >
                    {passType.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((activity) => (
                <tr key={activity.id} className="border-b border-row last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    {rowLabel(activity)}
                  </th>
                  {passes.map((passType) =>
                    passType.id === selected?.id ? (
                      <td key={passType.id} className="bg-chip px-3 py-1">
                        <Select
                          label={`${passType.name} · ${activity.name}`}
                          hideLabel
                          variant="chip"
                          triggerClassName={chipTone[choiceOf(activity.id)]}
                          options={accessOptions}
                          selectedKey={choiceOf(activity.id)}
                          isDisabled={busy}
                          onSelectionChange={(key) =>
                            setDraft((current) => ({ ...current, [activity.id]: key as Choice }))
                          }
                        />
                      </td>
                    ) : (
                      <td key={passType.id} className="px-3 py-2">
                        <AccessChip
                          access={
                            passType.activities.find((link) => link.activityId === activity.id)
                              ?.access
                          }
                        />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && dropped > 0 && (
        <p className="text-sm text-warning-fg">
          {dropped === 1
            ? 'Este pase tiene 1 actividad archivada vinculada; se quitará al guardar el acceso, porque solo se pueden asignar actividades activas.'
            : `Este pase tiene ${dropped} actividades archivadas vinculadas; se quitarán al guardar el acceso, porque solo se pueden asignar actividades activas.`}
        </p>
      )}
      {selected && rows.length > 0 && (
        <button type="button" disabled={busy || !changed} onClick={save} className={styles.primary}>
          {busy ? 'Guardando…' : 'Guardar acceso'}
        </button>
      )}
    </section>
  );
}
