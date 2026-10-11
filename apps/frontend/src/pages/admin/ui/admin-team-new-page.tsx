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
  serverFieldErrors,
  teamFailureMessage,
  validateInvite,
  type InviteDraft,
  type InviteErrors,
} from './team-form-model';
import { InvitationCreated } from './invitation-created';
import { useTeamEvents } from './use-team-events';

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
  const [sending, setSending] = useState(false);
  const [issued, setIssued] = useState<{ name: string; link: IssuedLink } | null>(null);
  const { events, retry } = useTeamEvents(allowed && !issued);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const found = validateInvite(draft);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      event.currentTarget
        .querySelector<HTMLElement>(first === 'access' ? 'fieldset input' : `[name="${first}"]`)
        ?.focus();
      return;
    }
    pending.current = true;
    setSending(true);
    try {
      const name = draft.displayName.trim();
      const link = await inviteMember({
        displayName: name,
        email: draft.email.trim(),
        access: accessInput(draft.access),
      });
      setIssued({ name, link });
    } catch (error) {
      const reason = teamFailure(error);
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
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <Breadcrumbs
          items={[{ label: 'Equipo', to: routes.adminTeam }, { label: 'Agregar administrador' }]}
        />
        {issued ? (
          <InvitationCreated
            title="Invitación creada"
            name={issued.name}
            link={issued.link}
            onDone={() => void navigate(routes.adminTeam)}
          />
        ) : (
          <>
            <header className="space-y-1">
              <h1 className="text-3xl font-extrabold tracking-tight text-heading">
                Agregar administrador
              </h1>
              <p className="max-w-2xl text-muted">
                La persona recibirá un enlace para crear su propia contraseña. Nadie más la conoce.
              </p>
            </header>
            {!allowed ? (
              <TeamDenied />
            ) : (
              <form
                aria-label="Agregar administrador"
                noValidate
                onSubmit={(event) => void submit(event)}
                className={`${styles.card} space-y-6 sm:p-8`}
              >
                {failure && <Notice tone="danger">{failure}</Notice>}
                <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
                  <section aria-labelledby="team-new-person" className="space-y-5">
                    <h2 id="team-new-person" className="text-lg font-extrabold text-heading">
                      Datos de la persona
                    </h2>
                    <TextField
                      label="Nombre"
                      name="displayName"
                      autoComplete="off"
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
                      hint="Con este correo iniciará sesión."
                      value={draft.email}
                      error={errors.email}
                      disabled={sending}
                      onChange={(event) => setDraft({ ...draft, email: event.currentTarget.value })}
                    />
                    <p className="rounded-xl bg-surface-inner p-4 text-sm text-fg">
                      Al crear la invitación verás un enlace de activación. Envíalo por un medio
                      privado; vence en 72 horas y sirve una sola vez.
                    </p>
                  </section>
                  <AccessFieldset
                    value={draft.access}
                    onChange={(access) => setDraft({ ...draft, access })}
                    events={events}
                    onRetryEvents={retry}
                    error={errors.access}
                    disabled={sending}
                  />
                </div>
                <div className="flex flex-col-reverse gap-3 border-t border-row pt-5 sm:flex-row sm:justify-end">
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
