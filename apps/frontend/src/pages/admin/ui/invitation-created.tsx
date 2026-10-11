import type { IssuedLink } from '@/entities/admin-team';
import { useEffect, useId, useRef, useState } from 'react';
import { styles } from './catalog-copy';

type InvitationCreatedProps = {
  title: string;
  name: string;
  link: IssuedLink;
  // "Volver a Equipo": forgets the link, which is never shown again.
  onDone: () => void;
};

type CopyState = 'idle' | 'copied' | 'failed';

// The one-time activation link (#214 D1): shown only here, kept only in this screen's state
// (never in the URL, history or storage), with a copy button and the warnings.
export function InvitationCreated({ title, name, link, onDone }: InvitationCreatedProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [copy, setCopy] = useState<CopyState>('idle');

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
      className={`${styles.card} mx-auto max-w-2xl space-y-5 p-6 sm:p-10`}
    >
      <h2
        id={`${inputId}-title`}
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-extrabold text-heading outline-none"
      >
        {title}
      </h2>
      <p>
        Envía este enlace a <strong className="break-words">{name}</strong> por un medio privado,
        como un mensaje directo. Con él creará su contraseña y quedará lista para entrar.
      </p>
      <div>
        <label htmlFor={inputId} className={styles.label}>
          Enlace de activación
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            ref={input}
            readOnly
            value={link.activationUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-input-line bg-input px-3 font-mono text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          <button type="button" className={styles.primary} onClick={() => void copyLink()}>
            Copiar enlace
          </button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm font-medium">
          {copy === 'copied' && 'Enlace copiado.'}
          {copy === 'failed' && 'No se pudo copiar. El enlace quedó seleccionado: cópialo a mano.'}
        </p>
      </div>
      <ul className="list-disc space-y-2 rounded-xl bg-warning py-4 pr-5 pl-9 text-sm text-warning-fg">
        <li>
          <strong>Se muestra una sola vez.</strong> Si se pierde, genera uno nuevo desde Equipo.
        </li>
        <li>Vence en 72 horas y sirve una sola vez.</li>
        <li>Quien tenga el enlace puede activar la cuenta: no lo publiques en grupos.</li>
      </ul>
      <div className="flex justify-end">
        <button type="button" className={styles.secondary} onClick={onDone}>
          Volver a Equipo
        </button>
      </div>
    </section>
  );
}
