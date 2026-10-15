// Shown wherever the buyer sees prices (home and the desktop summary).
export function SecurePaymentNote({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-start gap-2.5 text-sm leading-relaxed text-muted ${className}`}>
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px shrink-0 text-heading"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span>Pagas de forma segura en Mercado Pago. Precios en pesos mexicanos.</span>
    </p>
  );
}
