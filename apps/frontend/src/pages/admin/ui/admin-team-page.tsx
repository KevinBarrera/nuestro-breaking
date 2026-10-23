import {
  cancelInvitation,
  changeMemberAccess,
  deactivateMember,
  reactivateMember,
  regenerateInvitation,
  teamFailure,
  type IssuedLink,
  type TeamMember,
} from '@/entities/admin-team';
import { useSessionStore } from '@/entities/session';
import { routes } from '@/shared/config';
import { ConfirmDialog, Notice } from '@/shared/ui';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { styles } from './catalog-copy';
import { InvitationCreated } from './invitation-created';
import { teamDenied } from './team-copy';
import { ChangeAccessDialog, DeactivateDialog } from './team-dialogs';
import { accessInput, teamFailureMessage, type AccessDraft } from './team-form-model';
import { type MemberAction } from './team-model';
import { TeamList } from './team-list';
import { useTeamEvents } from './use-team-events';
import { useTeamLoad } from './use-team-load';

export function TeamDenied() {
  return (
    <p role="alert" className="rounded-lg border border-warning-fg bg-warning p-4 text-warning-fg">
      {teamDenied}
    </p>
  );
}

type OpenAction = { action: MemberAction; member: TeamMember };
type Issued = { name: string; link: IssuedLink };

// Equipo (#214): the admin team, for global admins only. Others (direct URL) see the same
// "Sin acceso" pattern as the event list; the backend refuses their team requests anyway.
export function AdminTeamPage() {
  const user = useSessionStore((state) => state.session.user);
  const allowed = user?.globalAdmin === true;
  const { state, reload } = useTeamLoad(allowed);
  const [open, setOpen] = useState<OpenAction | null>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const { events, retry } = useTeamEvents(allowed && open?.action === 'change-access');
  const heading = useRef<HTMLHeadingElement>(null);
  const sending = useRef(false);
  const [focusRequest, setFocusRequest] = useState(0);

  // After an action the row's button may be gone, so the heading takes focus and the notice
  // under it is announced. It waits a frame, after the dialog's own focus restore.
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);
  const focusHeading = () => setFocusRequest((value) => value + 1);

  function start(action: MemberAction, member: TeamMember) {
    setDialogError(null);
    setOpen({ action, member });
  }

  function close() {
    if (!sending.current) setOpen(null);
  }

  // Runs one action. Form dialogs (deactivate, access) keep failures inside the dialog; the
  // confirmations close and show the failure on the page. Success focuses the heading, under
  // which the notice is announced, since the button that opened the dialog may be gone.
  async function run(task: () => Promise<string | Issued>, keepOpenOnError: boolean) {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setDialogError(null);
    try {
      const result = await task();
      setOpen(null);
      if (typeof result === 'string') {
        setNotice({ tone: 'info', text: result });
        focusHeading();
      } else {
        setNotice(null);
        setIssued(result);
      }
      reload();
    } catch (error) {
      const message = teamFailureMessage(teamFailure(error));
      if (keepOpenOnError) setDialogError(message);
      else {
        setOpen(null);
        setNotice({ tone: 'danger', text: message });
        focusHeading();
      }
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  const member = open?.member;
  const name = member?.displayName ?? '';

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="mx-auto max-w-[1080px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight text-heading outline-none"
            >
              Equipo
            </h1>
            <p className="max-w-2xl text-muted">
              Personas que pueden entrar al panel y qué eventos operan.
            </p>
          </div>
          {allowed && !issued && (
            <Link
              to={routes.adminTeamNew}
              className={`${styles.primary} inline-flex items-center gap-2`}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M10 4v12M4 10h12" />
              </svg>
              Agregar administrador
            </Link>
          )}
        </header>
        {notice && !issued && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {!allowed ? (
          <TeamDenied />
        ) : issued ? (
          <InvitationCreated
            title="Nuevo enlace creado"
            name={issued.name}
            link={issued.link}
            onDone={() => {
              setIssued(null);
              focusHeading();
            }}
          />
        ) : state.status === 'loading' ? (
          <p role="status">Cargando equipo…</p>
        ) : state.status === 'failed' ? (
          state.failure.kind === 'denied' ? (
            <TeamDenied />
          ) : (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger p-4 text-danger-fg"
            >
              <p>No se pudo cargar el equipo. Inténtalo de nuevo.</p>
              <button type="button" className={styles.secondary} onClick={reload}>
                Reintentar
              </button>
            </div>
          )
        ) : (
          <TeamList members={state.members} user={user} onAction={start} />
        )}
        {!issued && (
          <p className="flex max-w-[760px] items-start gap-2.5 text-sm text-muted">
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
              Solo quien tiene acceso a todos los eventos ve esta sección. Nadie puede desactivarse
              a sí mismo, y siempre queda al menos una persona activa con acceso a todos los
              eventos.
            </span>
          </p>
        )}
      </div>

      {member && open.action === 'regenerate' && (
        <ConfirmDialog
          isOpen
          onOpenChange={(isOpen) => !isOpen && close()}
          title={`¿Generar un nuevo enlace para ${name}?`}
          consequence={
            member.status === 'active'
              ? 'El enlace anterior, si había uno, deja de funcionar. Su contraseña actual sigue sirviendo hasta que use el nuevo enlace.'
              : 'El enlace anterior, si había uno, deja de funcionar.'
          }
          confirmLabel="Generar enlace"
          pendingLabel="Generando…"
          isPending={pending}
          onConfirm={() =>
            void run(async () => ({ name, link: await regenerateInvitation(member.id) }), false)
          }
        />
      )}
      {member && open.action === 'cancel-invitation' && (
        <ConfirmDialog
          isOpen
          onOpenChange={(isOpen) => !isOpen && close()}
          tone="destructive"
          title={`¿Cancelar la invitación de ${name}?`}
          consequence="El enlace deja de funcionar. Puedes generar uno nuevo cuando quieras."
          confirmLabel="Cancelar invitación"
          cancelLabel="Volver"
          pendingLabel="Cancelando…"
          isPending={pending}
          onConfirm={() =>
            void run(async () => {
              await cancelInvitation(member.id);
              return `Se canceló la invitación de ${name}.`;
            }, false)
          }
        />
      )}
      {member && open.action === 'reactivate' && (
        <ConfirmDialog
          isOpen
          onOpenChange={(isOpen) => !isOpen && close()}
          title={`¿Reactivar a ${name}?`}
          consequence="Recupera el mismo acceso que tenía. Si nunca activó su cuenta, necesitará un enlace nuevo."
          confirmLabel="Reactivar"
          pendingLabel="Reactivando…"
          isPending={pending}
          onConfirm={() =>
            void run(async () => {
              const status = await reactivateMember(member.id);
              if (status === 'pending')
                return `${name} está activo otra vez. Genera un enlace nuevo para que active su cuenta.`;
              if (status === 'no_access')
                return `${name} está activo otra vez, pero sin acceso. Usa «Cambiar acceso» para darle eventos.`;
              return `${name} está activo otra vez.`;
            }, false)
          }
        />
      )}
      {member && open.action === 'deactivate' && (
        <DeactivateDialog
          member={member}
          isPending={pending}
          error={dialogError}
          onClose={close}
          onConfirm={(reason) =>
            void run(async () => {
              await deactivateMember(member.id, reason);
              return `Se desactivó el acceso de ${name}.`;
            }, true)
          }
        />
      )}
      {member && open.action === 'change-access' && (
        <ChangeAccessDialog
          member={member}
          events={events}
          onRetryEvents={retry}
          isPending={pending}
          error={dialogError}
          onClose={close}
          onConfirm={(access: AccessDraft) =>
            void run(async () => {
              const changed = await changeMemberAccess(member.id, accessInput(access));
              return changed
                ? `Se cambió el acceso de ${name}.`
                : `El acceso de ${name} ya era ese; no hubo cambios.`;
            }, true)
          }
        />
      )}
    </main>
  );
}
