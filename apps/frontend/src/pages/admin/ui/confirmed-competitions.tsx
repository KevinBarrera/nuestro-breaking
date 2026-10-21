import type { HeldPass, RegistrationEntitlements } from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import { buttonClass } from '@/shared/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmedCompetitionsEditor } from './confirmed-competitions-editor';
import { editableCompetitionPass } from './confirmed-competitions-model';

type ConfirmedCompetitionsProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  // Null when the event's pass types or activities could not be read.
  passTypes: CatalogPassType[] | null;
  activities: CatalogActivity[] | null;
  onSaved: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
  // Renders the held passes, placing each pass's "Editar competencias" action or its editor.
  children: (editAction: (pass: HeldPass) => ReactNode) => ReactNode;
};

// Competition changes on a confirmed registration (#170): each held pass with competitions to
// choose offers "Editar competencias", which opens its editor in place. One pass is edited at a
// time, and closing the editor returns focus to its action.
export function ConfirmedCompetitions({
  eventId,
  entitlements,
  passTypes,
  activities,
  onSaved,
  onReload,
  children,
}: ConfirmedCompetitionsProps) {
  const [editing, setEditing] = useState<string | null>(null);
  // The pass whose editor just closed, so its action takes the focus back.
  const [closed, setClosed] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const close = (pass: HeldPass) => {
    setEditing(null);
    setClosed(pass.registrationPassId);
  };

  return (
    <>
      {savedName && (
        <p
          role="status"
          className="rounded-lg border border-success-fg bg-success px-4 py-3 text-sm text-success-fg"
        >
          Se cambiaron las competencias de «{savedName}».
        </p>
      )}
      {children((pass) => {
        const editable = editableCompetitionPass(pass, passTypes, activities);
        if (!editable) return null;
        if (editing === pass.registrationPassId)
          return (
            <ConfirmedCompetitionsEditor
              eventId={eventId}
              registrationId={entitlements.registration.id}
              pass={editable}
              onSaved={(updated) => {
                onSaved(updated);
                setSavedName(pass.name);
                close(pass);
              }}
              onCancel={() => close(pass)}
              onReload={onReload}
            />
          );
        return (
          <EditAction
            pass={pass}
            focus={closed === pass.registrationPassId}
            disabled={editing !== null}
            onEdit={() => {
              setSavedName(null);
              setClosed(null);
              setEditing(pass.registrationPassId);
            }}
          />
        );
      })}
    </>
  );
}

type EditActionProps = {
  pass: HeldPass;
  focus: boolean;
  disabled: boolean;
  onEdit: () => void;
};

function EditAction({ pass, focus, disabled, onEdit }: EditActionProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <div className="flex basis-full justify-end">
      <button
        ref={ref}
        type="button"
        className={buttonClass('secondary')}
        disabled={disabled}
        aria-label={`Editar competencias de «${pass.name}»`}
        onClick={onEdit}
      >
        Editar competencias
      </button>
    </div>
  );
}
