import {
  activateAccount,
  activationFailure,
  checkActivation,
  type ActivationDetails,
} from '@/entities/session';
import { routes } from '@/shared/config';
import { formatLinkExpiry } from '@/shared/lib';
import { Notice, TextField } from '@/shared/ui';
import { continueButtonClass, PublicFrame } from '@/widgets/public-layout';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  invalidLinkMessage,
  maybeActiveMessage,
  passwordChecklist,
  readActivationToken,
  validateActivation,
  weakPasswordMessage,
  type ActivationErrors,
} from './activation-model';

const checkFailedMessage =
  'No pudimos comprobar tu enlace. Usa «Reintentar». Si recargaste o cerraste esta página, vuelve a abrir el enlace original.';
const activateFailedMessage =
  'No pudimos activar tu cuenta. Inténtalo de nuevo. Si recargas o cierras esta página, vuelve a abrir el enlace original.';

type CheckState =
  | { status: 'checking' }
  | { status: 'invalid' }
  | { status: 'failed' }
  | { status: 'maybe-active' }
  | { status: 'ready'; details: ActivationDetails };

const mainClass = 'mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-7';

// Activa tu cuenta (#214, phone-first). The one-time token sits in the URL fragment, which
// browsers never send (D7). It is read once, then removed from the address bar, so it does
// not stay in the history or get copied along with the address. The token then lives only in
// memory: "Reintentar" reuses it, but a reload loses it, so failures say to reopen the link.
export function AccountActivationPage() {
  const [token] = useState(() => readActivationToken(window.location.hash));
  const [state, setState] = useState<CheckState>(() =>
    token ? { status: 'checking' } : { status: 'invalid' },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    checkActivation(token, controller.signal)
      .then((details) => {
        if (!controller.signal.aborted) setState({ status: 'ready', details });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: activationFailure(error).kind === 'invalid-link' ? 'invalid' : 'failed',
        });
      });
    return () => controller.abort();
  }, [token, attempt]);

  return (
    <PublicFrame>
      <main className={mainClass}>
        {state.status === 'checking' && <p role="status">Comprobando tu enlace…</p>}
        {state.status === 'invalid' && <InvalidLink />}
        {state.status === 'failed' && (
          <>
            <h1 className="text-2xl font-extrabold text-heading">Activa tu cuenta</h1>
            <Notice tone="danger">{checkFailedMessage}</Notice>
            <button
              type="button"
              className={continueButtonClass}
              onClick={() => {
                setState({ status: 'checking' });
                setAttempt((value) => value + 1);
              }}
            >
              Reintentar
            </button>
          </>
        )}
        {state.status === 'ready' && token && (
          <ActivationForm
            token={token}
            details={state.details}
            onInvalid={() => setState({ status: 'invalid' })}
            onMaybeActive={() => setState({ status: 'maybe-active' })}
          />
        )}
        {state.status === 'maybe-active' && <MaybeActive />}
      </main>
    </PublicFrame>
  );
}

function InvalidLink() {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-heading">Enlace no válido</h1>
      <Notice tone="danger">{invalidLinkMessage}</Notice>
    </>
  );
}

// A lost answer after the account was activated makes the retry find a used link.
function MaybeActive() {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-heading">Activa tu cuenta</h1>
      <Notice tone="info">{maybeActiveMessage}</Notice>
      <Link to={routes.admin} replace className={`${continueButtonClass} w-full`}>
        Ir a iniciar sesión
      </Link>
    </>
  );
}

type ActivationFormProps = {
  token: string;
  details: ActivationDetails;
  onInvalid: () => void;
  onMaybeActive: () => void;
};

function ActivationForm({ token, details, onInvalid, onMaybeActive }: ActivationFormProps) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<ActivationErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const pending = useRef(false);
  // Set when an attempt failed without a clear answer: it may have activated the account.
  const outcomeUnknown = useRef(false);
  const passwordId = useId();
  const confirmationId = useId();
  const rulesId = useId();
  const checklist = passwordChecklist(password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const found = validateActivation(password, confirmation);
    setErrors(found);
    setFailure(null);
    if (found.password || found.confirmation) {
      document.getElementById(found.password ? passwordId : confirmationId)?.focus();
      return;
    }
    pending.current = true;
    setSending(true);
    try {
      await activateAccount(token, password);
      void navigate(routes.admin, {
        replace: true,
        state: { activatedEmail: details.email },
      });
    } catch (error) {
      const reason = activationFailure(error);
      if (reason.kind === 'invalid-link') {
        if (outcomeUnknown.current) onMaybeActive();
        else onInvalid();
      } else if (reason.kind === 'weak-password') {
        setErrors({ password: weakPasswordMessage(reason.failedRules) });
        document.getElementById(passwordId)?.focus();
      } else {
        outcomeUnknown.current = true;
        setFailure(activateFailedMessage);
      }
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  return (
    <>
      <header className="space-y-2">
        <h1 className="text-2xl font-extrabold text-heading">Activa tu cuenta</h1>
        <p className="text-muted">
          Hola, <span className="break-words text-fg">{details.displayName}</span>. Crea tu
          contraseña para entrar al panel de administración.
        </p>
      </header>
      <form
        aria-label="Activa tu cuenta"
        noValidate
        onSubmit={(event) => void submit(event)}
        className="space-y-4 rounded-2xl border border-line bg-surface p-5"
      >
        <div>
          <p className="text-sm text-muted">Correo para iniciar sesión</p>
          <p className="font-bold break-words">{details.email}</p>
        </div>
        {/* Lets password managers save the new password with the right account. */}
        <input type="hidden" name="username" autoComplete="username" value={details.email} />
        <TextField
          id={passwordId}
          label="Crea tu contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          disabled={sending}
          aria-describedby={rulesId}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
        <ul id={rulesId} aria-label="Reglas de la contraseña" className="space-y-2 text-sm">
          {checklist.map((item) => (
            <li
              key={item.rule}
              className={`flex items-center gap-2 ${item.met ? 'text-success-fg' : 'text-muted'}`}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {item.met ? <path d="M5 12l5 5L20 7" /> : <path d="M6 6l12 12M18 6L6 18" />}
              </svg>
              <span>
                <span className="sr-only">{item.met ? 'Cumple: ' : 'Falta: '}</span>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
        <TextField
          id={confirmationId}
          label="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          error={errors.confirmation}
          disabled={sending}
          onChange={(event) => setConfirmation(event.currentTarget.value)}
        />
        {failure && <Notice tone="danger">{failure}</Notice>}
        <button type="submit" disabled={sending} className={`${continueButtonClass} w-full`}>
          {sending ? 'Activando…' : 'Activar cuenta'}
        </button>
      </form>
      <p className="text-sm text-muted">
        Este enlace vence el {formatLinkExpiry(details.expiresAt)}. Si ya venció, pide uno nuevo a
        quien te invitó.
      </p>
    </>
  );
}
