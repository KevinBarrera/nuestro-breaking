import type { IssuedLink } from '@/entities/admin-team';
import { formatLinkExpiry } from '@/shared/lib';
import { useEffect, useId, useRef, useState } from 'react';
import { styles } from './catalog-copy';
import { memberInitials } from './team-model';

export type LinkRecipient = { name: string; email: string; access: string };

type InvitationCreatedProps = {
  title: string;
  recipient: LinkRecipient;
  link: IssuedLink;
  // "Volver a Equipo": forgets the link, which is never shown again.
  onDone: () => void;
};

type CopyState = 'idle' | 'copied' | 'failed';

const checkIcon = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);

const copyIcon = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
  </svg>
);

// The one-time activation link (#214 D1): shown only here, kept only in this screen's state
// (never in the URL, history or storage), with who it is for, a copy button and the warnings.
// Once copied, "Volver a Equipo" becomes the main action.
export function InvitationCreated({ title, recipient, link, onDone }: InvitationCreatedProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [copy, setCopy] = useState<CopyState>('idle');
  const copied = copy === 'copied';

  useEffect(() => heading.current?.focus(), []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.activationUrl);
      setCopy('copied');
    } catch {
      setCopy('failed');
      input.current?.select();
    }
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="rounded-xl border border-line bg-surface"
    >
      <div className="flex flex-col gap-5 px-5 pt-6 sm:px-7 sm:pt-7">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-success-fg bg-success text-success-fg"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4.5 10.5l3.5 3.5 7.5-8" />
            </svg>
          </span>
          <div className="min-w-0 space-y-1.5">
            <h1
              id={`${inputId}-title`}
              ref={heading}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight text-heading outline-none"
            >
              {title}
            </h1>
            <p>
              Envía este enlace a <strong className="break-words">{recipient.name}</strong> por un
              medio privado, como un mensaje directo. Con él creará su contraseña y podrá entrar al
              panel.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line bg-surface-inner px-4 py-3 text-sm">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip text-[13px] font-bold text-heading"
          >
            {memberInitials(recipient.name)}
          </span>
          <span className="flex min-w-0 flex-[1_1_200px] flex-col">
            <span className="font-bold break-words text-heading">{recipient.name}</span>
            <span className="break-words text-muted">{recipient.email}</span>
          </span>
          <span className="flex min-w-0 flex-[1_1_200px] flex-col">
            <span className="text-xs leading-4 font-semibold text-muted">Acceso</span>
            <span className="break-words text-fg">{recipient.access}</span>
          </span>
        </div>

        <div>
          <label htmlFor={inputId} className="text-sm font-semibold text-heading">
            Enlace de activación
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              id={inputId}
              ref={input}
              readOnly
              value={link.activationUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-11 min-w-0 flex-[1_1_320px] rounded-lg border border-input-line bg-surface-inner px-3 font-mono text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <button
              type="button"
              className={`${copied ? styles.secondary : styles.primary} inline-flex items-center gap-2`}
              onClick={() => void copyLink()}
            >
              {copied ? checkIcon : copyIcon}
              {copied ? 'Copiado' : 'Copiar enlace'}
            </button>
          </div>
          <p role="status" className="mt-1.5 min-h-5 text-sm font-semibold text-success-fg">
            {copied && 'Enlace copiado. Pégalo en un mensaje privado.'}
            {copy === 'failed' && (
              <span className="text-danger-fg">
                No se pudo copiar. El enlace quedó seleccionado: cópialo a mano.
              </span>
            )}
          </p>
        </div>

        <div
          role="note"
          className="flex gap-3 rounded-lg border border-warning-fg bg-warning px-5 py-4 text-sm text-warning-fg"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-px shrink-0"
          >
            <path d="M10 3l7.5 13h-15z" />
            <path d="M10 8.5v3.5M10 14.5v.01" />
          </svg>
          <div className="space-y-1.5">
            <strong className="block">Se muestra una sola vez</strong>
            <ul className="list-disc space-y-1 pl-[18px]">
              <li>Si se pierde, genera uno nuevo desde Equipo.</li>
              <li>Vence el {formatLinkExpiry(link.expiresAt)} y sirve una sola vez.</li>
              <li>Quien tenga el enlace puede activar la cuenta: no lo publiques en grupos.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4 sm:px-7">
        {!copied && (
          <span className="flex-[1_1_220px] text-sm text-muted">
            Copia el enlace antes de salir: no se vuelve a mostrar.
          </span>
        )}
        <button
          type="button"
          className={copied ? styles.primary : styles.secondary}
          onClick={onDone}
        >
          Volver a Equipo
        </button>
      </div>
    </section>
  );
}
