import { inviteMember, teamFailure, type IssuedLink } from '@/entities/admin-team';
import { useSessionStore } from '@/entities/session';
import { routes } from '@/shared/config';
import { Breadcrumbs, Notice, TextField } from '@/shared/ui';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { TeamDenied } from './admin-team-page';
import { styles } from './catalog-copy';
import { AccessFieldset } from './team-access-fieldset';
import {
  accessInput,
  inviteMayExist,
  inviteMayExistMessage,
  serverFieldErrors,
  teamFailureMessage,
  validateInvite,
  type AccessDraft,
  type InviteDraft,
  type InviteErrors,
} from './team-form-model';
import { InvitationCreated, type LinkRecipient } from './invitation-created';
import { useTeamEvents, type TeamEventsState } from './use-team-events';

// What the person can operate, by name, for the link screen.
function accessText(access: AccessDraft, events: TeamEventsState): string {
  if (access.scope === 'global') return 'Todos los eventos';
  const names = events.status === 'ready' ? events.events : [];
  return names
    .filter((event) => access.eventIds.includes(event.id))
    .map((event) => event.name)
    .join(', ');
}

const emptyDraft: InviteDraft = {
  displayName: '',
  email: '',
  access: { scope: 'events', eventIds: [] },
};

// Agregar administrador (#214): name, email and access; on success the one-time link.
export function AdminTeamNewPage() {
  const allowed = useSessionStore((state) => state.session.user?.globalAdmin === true);
  const navigate = useNavigate();
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState<InviteErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [mayExist, setMayExist] = useState(false);
  const [sending, setSending] = useState(false);
  const [issued, setIssued] = useState<{ recipient: LinkRecipient; link: IssuedLink } | null>(null);
  const { events, retry } = useTeamEvents(allowed && !issued);
  const pending = useRef(false);
  // The email of an invite whose answer was lost: a retry with it may get `email_in_use`
  // because that first invite did go through.
  const unknownEmail = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const found = validateInvite(draft);
    setErrors(found);
    setFailure(null);
    setMayExist(false);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      event.currentTarget
        .querySelector<HTMLElement>(first === 'access' ? 'fieldset input' : `[name="${first}"]`)
        ?.focus();
      return;
    }
    pending.current = true;
    setSending(true);
    const name = draft.displayName.trim();
    const email = draft.email.trim();
    try {
      const link = await inviteMember({
        displayName: name,
        email,
        access: accessInput(draft.access),
      });
      setIssued({ recipient: { name, email, access: accessText(draft.access, events) }, link });
    } catch (error) {
      const reason = teamFailure(error);
      const sameEmail = unknownEmail.current === email.toLowerCase();
      if (reason.kind === 'unknown') unknownEmail.current = email.toLowerCase();
      if (inviteMayExist(reason, sameEmail)) {
        setMayExist(true);
        return;
      }
      if (reason.kind === 'invalid') setErrors(serverFieldErrors(reason.fieldErrors));
      else if (reason.kind === 'rule' && reason.code === 'email_in_use')
        setErrors({ email: teamFailureMessage(reason) });
      setFailure(teamFailureMessage(reason));
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:pt-8 lg:pb-16">
      <div className="mx-auto max-w-[760px] space-y-6">
        <Breadcrumbs
          variant="link"
          items={[
            { label: 'Equipo', to: routes.adminTeam },
            { label: issued ? 'Enlace de activación' : 'Agregar administrador' },
          ]}
        />
        {issued ? (
          <InvitationCreated
            title="Invitación creada"
            recipient={issued.recipient}
            link={issued.link}
            onDone={() => void navigate(routes.adminTeam)}
          />
        ) : (
          <>
            <header className="space-y-1.5">
              <h1 className="text-3xl font-extrabold tracking-tight text-heading">
                Agregar administrador
              </h1>
              <p className="text-muted">
                La persona recibirá un enlace para crear su propia contraseña. Nadie más la conoce.
              </p>
            </header>
            {!allowed ? (
              <TeamDenied />
            ) : (
              <form
                aria-label="Agregar administrador"
                autoComplete="off"
                noValidate
                onSubmit={(event) => void submit(event)}
                className="rounded-xl border border-line bg-surface"
              >
                {(failure || mayExist) && (
                  <div className="space-y-3 px-5 pt-6 sm:px-7">
                    {failure && <Notice tone="danger">{failure}</Notice>}
                    {mayExist && (
                      <Notice tone="danger">
                        {inviteMayExistMessage}{' '}
                        <Link
                          to={routes.adminTeam}
                          className="inline-flex min-h-11 items-center font-bold underline"
                        >
                          Ir a Equipo
                        </Link>
                      </Notice>
                    )}
                  </div>
                )}
                <section aria-labelledby="team-new-person" className="space-y-6 px-5 py-6 sm:p-7">
                  <h2 id="team-new-person" className="text-lg font-bold text-heading">
                    Datos de la persona
                  </h2>
                  <TextField
                    label="Nombre"
                    name="displayName"
                    autoComplete="off"
                    placeholder="Ej. Ana Torres"
                    hint="Así aparece en Equipo y en el historial."
                    hintPlacement="below"
                    value={draft.displayName}
                    error={errors.displayName}
                    disabled={sending}
                    onChange={(event) =>
                      setDraft({ ...draft, displayName: event.currentTarget.value })
                    }
                  />
                  <TextField
                    label="Correo"
                    name="email"
                    type="email"
                    autoComplete="off"
                    placeholder="nombre@correo.com"
                    hint="Con este correo iniciará sesión."
                    hintPlacement="below"
                    value={draft.email}
                    error={errors.email}
                    disabled={sending}
                    onChange={(event) => setDraft({ ...draft, email: event.currentTarget.value })}
                  />
                </section>
                <div className="border-t border-line px-5 py-6 sm:p-7">
                  <AccessFieldset
                    variant="form"
                    value={draft.access}
                    onChange={(access) => setDraft({ ...draft, access })}
                    events={events}
                    onRetryEvents={retry}
                    error={errors.access}
                    disabled={sending}
                  />
                </div>
                <p className="mx-5 flex items-start gap-2.5 text-sm sm:mx-7">
                  <svg
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    className="mt-px shrink-0"
                  >
                    <circle cx="10" cy="10" r="7.5" />
                    <path d="M10 9v4.5M10 6.5v.01" />
                  </svg>
                  <span>
                    Al crear la invitación verás un enlace de activación para enviárselo por un
                    medio privado. Vence en 72 horas y sirve una sola vez.
                  </span>
                </p>
                <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                  <Link
                    to={routes.adminTeam}
                    className={`${styles.secondary} inline-flex items-center justify-center`}
                  >
                    Cancelar
                  </Link>
                  <button type="submit" disabled={sending} className={styles.primary}>
                    {sending ? 'Creando invitación…' : 'Crear invitación'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
